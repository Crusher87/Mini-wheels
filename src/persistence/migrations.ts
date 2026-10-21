import { DEFAULT_KEYBOARD_BINDINGS } from "../input/bindings";
import { SETTINGS_SCHEMA_VERSION } from "./schema";

export interface SettingsMigrationResult {
  readonly document: Readonly<Record<string, unknown>>;
  readonly sourceVersion: number | null;
  readonly migrated: boolean;
}

function serializedVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Schema v2 shipped with both Rapier drive axes reversed. Repair only the
 * exact per-player inverse of a known default: this catches saved workarounds
 * such as Up=ArrowDown without disturbing ordinary custom layouts.
 */
function repairInvertedDefaultBindings(
  source: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const playerInputs = source["playerInputs"];
  if (!Array.isArray(playerInputs)) {
    return source;
  }

  let repaired = false;
  const sourcePlayerInputs = playerInputs as readonly unknown[];
  const nextPlayerInputs = sourcePlayerInputs.map((candidate: unknown) => {
    if (!isRecord(candidate)) {
      return candidate;
    }
    const keyboard = candidate["keyboard"];
    if (!isRecord(keyboard)) {
      return candidate;
    }
    const matchingDefault = DEFAULT_KEYBOARD_BINDINGS.find(
      (fallback) =>
        keyboard["up"] === fallback.down &&
        keyboard["down"] === fallback.up &&
        keyboard["left"] === fallback.right &&
        keyboard["right"] === fallback.left,
    );
    if (matchingDefault === undefined) {
      return candidate;
    }

    repaired = true;
    return {
      ...candidate,
      keyboard: { ...matchingDefault },
    };
  });

  return repaired ? { ...source, playerInputs: nextPlayerInputs } : source;
}

/**
 * Migrates the settings document without mutating the parsed input. Documents
 * written before schemaVersion was introduced are treated as v1 because the
 * original SettingsService accepted that shape.
 */
export function migrateSettingsDocument(
  source: Readonly<Record<string, unknown>>,
): SettingsMigrationResult {
  const declaredVersion = serializedVersion(source["schemaVersion"]);
  if (declaredVersion === SETTINGS_SCHEMA_VERSION) {
    return {
      document: Object.freeze({ ...source }),
      sourceVersion: declaredVersion,
      migrated: false,
    };
  }

  const sourceVersion = declaredVersion ?? 1;
  const compatibleSource = sourceVersion <= 2 ? repairInvertedDefaultBindings(source) : source;
  if (sourceVersion <= 1) {
    const reducedMotion = compatibleSource["reducedMotion"] === true;
    return {
      document: Object.freeze({
        fullscreenPreference: false,
        uiScale: 1,
        markerSize: "medium",
        analogSensitivity: 1,
        effectsVolume: 1,
        musicVolume: 1,
        cameraSmoothing: reducedMotion ? "reduced" : "default",
        particleDensity: reducedMotion ? "reduced" : "full",
        highContrastInteractables: false,
        automaticUprightRecovery: false,
        ...compatibleSource,
        schemaVersion: SETTINGS_SCHEMA_VERSION,
      }),
      sourceVersion,
      migrated: true,
    };
  }

  // Preserve recognized fields from a future document rather than discarding
  // the whole object during a downgrade. Validation strips unknown fields.
  return {
    document: Object.freeze({
      ...compatibleSource,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
    }),
    sourceVersion,
    migrated: true,
  };
}
