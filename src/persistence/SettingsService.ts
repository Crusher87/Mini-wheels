import {
  ANALOG_DEAD_ZONE_MAXIMUM,
  ANALOG_DEAD_ZONE_MINIMUM,
  ANALOG_SENSITIVITY_MAXIMUM,
  ANALOG_SENSITIVITY_MINIMUM,
  DEFAULT_PLAYER_INPUTS,
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  UI_SCALE_MAXIMUM,
  UI_SCALE_MINIMUM,
  createDefaultSettings,
  type AaQuality,
  type CameraSmoothing,
  type ControllerCalibration,
  type DefaultSettingsPreferences,
  type GameSettings,
  type MarkerSize,
  type ParticleDensity,
  type PlayerInputSettings,
  type PlayerInputType,
  type ShadowQuality,
} from "./schema";
import { migrateSettingsDocument } from "./migrations";

export const SETTINGS_STORAGE_KEY = "tiny-traction.settings";
export const LEGACY_SETTINGS_STORAGE_KEY = "tiny-traction.settings.v1";
const RENDER_SCALES = new Set([0.5, 0.75, 1, 1.25]);
const AA_QUALITIES = new Set<AaQuality>(["off", "fxaa", "smaa", "high"]);
const SHADOW_QUALITIES = new Set<ShadowQuality>(["low", "medium", "high"]);
const INPUT_TYPES = new Set<PlayerInputType>(["keyboard", "controller"]);
const MARKER_SIZES = new Set<MarkerSize>(["small", "medium", "large"]);
const CAMERA_SMOOTHING_OPTIONS = new Set<CameraSmoothing>(["default", "reduced", "instant"]);
const PARTICLE_DENSITIES = new Set<ParticleDensity>(["full", "reduced", "off"]);

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type SettingsServiceOptions = DefaultSettingsPreferences;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteInRange(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function integerInRange(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function setMemberOrDefault<T>(value: unknown, allowedValues: ReadonlySet<T>, fallback: T): T {
  return allowedValues.has(value as T) ? (value as T) : fallback;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 256) : null;
}

function keyboardCode(value: unknown, fallback: string): string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z][A-Za-z0-9]*$/.test(value)
    ? value
    : fallback;
}

function gamepadMapping(value: unknown): GamepadMappingType | null {
  return value === "" || value === "standard" ? value : null;
}

function controllerCalibration(value: unknown): ControllerCalibration | null {
  if (!isRecord(value)) {
    return null;
  }
  const horizontalAxis = value["horizontalAxis"];
  const verticalAxis = value["verticalAxis"];
  const horizontalSign = value["horizontalSign"];
  const verticalSign = value["verticalSign"];
  if (
    typeof horizontalAxis !== "number" ||
    !Number.isInteger(horizontalAxis) ||
    horizontalAxis < 0 ||
    horizontalAxis > 31 ||
    typeof verticalAxis !== "number" ||
    !Number.isInteger(verticalAxis) ||
    verticalAxis < 0 ||
    verticalAxis > 31 ||
    horizontalAxis === verticalAxis ||
    (horizontalSign !== -1 && horizontalSign !== 1) ||
    (verticalSign !== -1 && verticalSign !== 1)
  ) {
    return null;
  }
  return Object.freeze({
    horizontalAxis,
    verticalAxis,
    horizontalSign,
    verticalSign,
  });
}

function validatePlayerInputs(value: unknown): readonly PlayerInputSettings[] {
  const source: readonly unknown[] = Array.isArray(value) ? (value as readonly unknown[]) : [];
  return Object.freeze(
    DEFAULT_PLAYER_INPUTS.map((fallback, index) => {
      const candidate = source[index];
      if (!isRecord(candidate)) {
        return fallback;
      }
      const keyboardCandidate = candidate["keyboard"];
      const keyboard = isRecord(keyboardCandidate)
        ? Object.freeze({
            up: keyboardCode(keyboardCandidate["up"], fallback.keyboard.up),
            down: keyboardCode(keyboardCandidate["down"], fallback.keyboard.down),
            left: keyboardCode(keyboardCandidate["left"], fallback.keyboard.left),
            right: keyboardCode(keyboardCandidate["right"], fallback.keyboard.right),
          })
        : fallback.keyboard;
      const inputType = INPUT_TYPES.has(candidate["inputType"] as PlayerInputType)
        ? (candidate["inputType"] as PlayerInputType)
        : fallback.inputType;
      return Object.freeze({
        inputType,
        keyboard,
        controllerIdHint: optionalString(candidate["controllerIdHint"]),
        controllerMappingHint: gamepadMapping(candidate["controllerMappingHint"]),
        controllerCalibration: controllerCalibration(candidate["controllerCalibration"]),
      });
    }),
  );
}

function systemPrefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

function validateSettings(
  parsed: Readonly<Record<string, unknown>>,
  defaults: GameSettings,
): GameSettings {
  const playerCount = integerInRange(parsed["playerCount"], 1, 10);
  const analogDeadZone = finiteInRange(
    parsed["analogDeadZone"],
    ANALOG_DEAD_ZONE_MINIMUM,
    ANALOG_DEAD_ZONE_MAXIMUM,
  );
  const analogSensitivity = finiteInRange(
    parsed["analogSensitivity"],
    ANALOG_SENSITIVITY_MINIMUM,
    ANALOG_SENSITIVITY_MAXIMUM,
  );
  const uiScale = finiteInRange(parsed["uiScale"], UI_SCALE_MINIMUM, UI_SCALE_MAXIMUM);
  const masterVolume = finiteInRange(parsed["masterVolume"], 0, 1);
  const effectsVolume = finiteInRange(parsed["effectsVolume"], 0, 1);
  const musicVolume = finiteInRange(parsed["musicVolume"], 0, 1);

  return Object.freeze({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    playerCount: playerCount ?? defaults.playerCount,
    playerInputs: validatePlayerInputs(parsed["playerInputs"]),
    renderScale: setMemberOrDefault(
      parsed["renderScale"],
      RENDER_SCALES,
      defaults.renderScale,
    ) as GameSettings["renderScale"],
    aaQuality: setMemberOrDefault(parsed["aaQuality"], AA_QUALITIES, defaults.aaQuality),
    ambientOcclusion: booleanOrDefault(parsed["ambientOcclusion"], defaults.ambientOcclusion),
    vignette: booleanOrDefault(parsed["vignette"], defaults.vignette),
    shadowQuality: setMemberOrDefault(
      parsed["shadowQuality"],
      SHADOW_QUALITIES,
      defaults.shadowQuality,
    ),
    fullscreenPreference: booleanOrDefault(
      parsed["fullscreenPreference"],
      defaults.fullscreenPreference,
    ),
    uiScale: uiScale ?? defaults.uiScale,
    markerSize: setMemberOrDefault(parsed["markerSize"], MARKER_SIZES, defaults.markerSize),
    analogDeadZone: analogDeadZone ?? defaults.analogDeadZone,
    analogSensitivity: analogSensitivity ?? defaults.analogSensitivity,
    masterVolume: masterVolume ?? defaults.masterVolume,
    effectsVolume: effectsVolume ?? defaults.effectsVolume,
    musicVolume: musicVolume ?? defaults.musicVolume,
    reducedMotion: booleanOrDefault(parsed["reducedMotion"], defaults.reducedMotion),
    cameraSmoothing: setMemberOrDefault(
      parsed["cameraSmoothing"],
      CAMERA_SMOOTHING_OPTIONS,
      defaults.cameraSmoothing,
    ),
    particleDensity: setMemberOrDefault(
      parsed["particleDensity"],
      PARTICLE_DENSITIES,
      defaults.particleDensity,
    ),
    highContrastInteractables: booleanOrDefault(
      parsed["highContrastInteractables"],
      defaults.highContrastInteractables,
    ),
    automaticUprightRecovery: booleanOrDefault(
      parsed["automaticUprightRecovery"],
      defaults.automaticUprightRecovery,
    ),
  });
}

export class SettingsService {
  private readonly defaults: GameSettings;
  private settings: GameSettings;

  public constructor(
    private readonly storage?: StorageLike,
    options: SettingsServiceOptions = {},
  ) {
    this.defaults = createDefaultSettings({
      prefersReducedMotion: options.prefersReducedMotion ?? systemPrefersReducedMotion(),
    });
    this.settings = this.defaults;
  }

  public load(): GameSettings {
    let parsed: unknown;
    let loadedLegacyKey = false;
    try {
      let raw = this.storage?.getItem(SETTINGS_STORAGE_KEY);
      if (raw === null || raw === undefined) {
        raw = this.storage?.getItem(LEGACY_SETTINGS_STORAGE_KEY);
        loadedLegacyKey = raw !== null && raw !== undefined;
      }
      if (raw === null || raw === undefined) {
        this.settings = this.defaults;
        return this.settings;
      }
      parsed = JSON.parse(raw) as unknown;
    } catch {
      this.settings = this.defaults;
      return this.settings;
    }

    if (!isRecord(parsed)) {
      this.settings = this.defaults;
      return this.settings;
    }

    const migration = migrateSettingsDocument(parsed);
    this.settings = validateSettings(migration.document, this.defaults);
    const normalizedDocumentChanged =
      JSON.stringify(migration.document) !== JSON.stringify(this.settings);
    const isFutureDocument =
      migration.sourceVersion !== null && migration.sourceVersion > SETTINGS_SCHEMA_VERSION;
    if (!isFutureDocument && (loadedLegacyKey || migration.migrated || normalizedDocumentChanged)) {
      this.persist();
    }
    return this.settings;
  }

  public get current(): GameSettings {
    return this.settings;
  }

  public update(patch: Partial<Omit<GameSettings, "schemaVersion">>): GameSettings {
    const candidate = { ...this.settings, ...patch, schemaVersion: SETTINGS_SCHEMA_VERSION };
    this.settings = validateSettings(candidate, this.defaults);
    this.persist();
    return this.settings;
  }

  public resetToDefaults(): GameSettings {
    this.settings = this.defaults;
    this.persist();
    return this.settings;
  }

  private persist(): void {
    try {
      this.storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage can be unavailable in private/embedded contexts. In-memory settings remain valid.
    }
  }

  public static validate(value: unknown): GameSettings {
    if (!isRecord(value)) {
      return DEFAULT_SETTINGS;
    }
    return validateSettings(migrateSettingsDocument(value).document, DEFAULT_SETTINGS);
  }
}
