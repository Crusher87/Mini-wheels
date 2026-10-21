import { describe, expect, it } from "vitest";
import { migrateSettingsDocument } from "../../src/persistence/migrations";
import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  createDefaultSettings,
} from "../../src/persistence/schema";
import {
  LEGACY_SETTINGS_STORAGE_KEY,
  PREVIOUS_SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SettingsService,
} from "../../src/persistence/SettingsService";

function createMemoryStorage(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: Array<{ key: string; value: string }> = [];
  return {
    values,
    writes,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
        writes.push({ key, value });
      },
    },
  };
}

describe("SettingsService", () => {
  it("falls back per field without discarding valid persisted fields", () => {
    const settings = SettingsService.validate({
      ...DEFAULT_SETTINGS,
      playerCount: 1.5,
      renderScale: 0.75,
      aaQuality: "unknown",
      ambientOcclusion: false,
      fullscreenPreference: "yes",
      uiScale: 1.25,
      markerSize: "huge",
      analogDeadZone: -0.1,
      analogSensitivity: 1.5,
      masterVolume: Number.NaN,
      effectsVolume: 0.35,
      musicVolume: 2,
      cameraSmoothing: "slow",
      particleDensity: "off",
      highContrastInteractables: true,
      automaticUprightRecovery: "sometimes",
    });

    expect(settings).toMatchObject({
      playerCount: DEFAULT_SETTINGS.playerCount,
      renderScale: 0.75,
      aaQuality: DEFAULT_SETTINGS.aaQuality,
      ambientOcclusion: false,
      fullscreenPreference: DEFAULT_SETTINGS.fullscreenPreference,
      uiScale: 1.25,
      markerSize: DEFAULT_SETTINGS.markerSize,
      analogDeadZone: DEFAULT_SETTINGS.analogDeadZone,
      analogSensitivity: 1.5,
      masterVolume: DEFAULT_SETTINGS.masterVolume,
      effectsVolume: 0.35,
      musicVolume: DEFAULT_SETTINGS.musicVolume,
      cameraSmoothing: DEFAULT_SETTINGS.cameraSmoothing,
      particleDensity: "off",
      highContrastInteractables: true,
      automaticUprightRecovery: DEFAULT_SETTINGS.automaticUprightRecovery,
    });
  });

  it("self-heals invalid fields in a current stored document", () => {
    const memory = createMemoryStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({
        ...DEFAULT_SETTINGS,
        renderScale: 0.75,
        aaQuality: "invalid",
        unknownField: true,
      }),
    });

    const settings = new SettingsService(memory.storage, {
      prefersReducedMotion: false,
    }).load();

    expect(settings.renderScale).toBe(0.75);
    expect(settings.aaQuality).toBe(DEFAULT_SETTINGS.aaQuality);
    expect(settings).not.toHaveProperty("unknownField");
    expect(memory.writes).toHaveLength(1);
    expect(JSON.parse(memory.values.get(SETTINGS_STORAGE_KEY) ?? "null")).toEqual(settings);
  });

  it("round-trips every v4 graphics, audio, accessibility, and control option", () => {
    const memory = createMemoryStorage();
    const service = new SettingsService(memory.storage, { prefersReducedMotion: false });
    service.load();

    const updated = service.update({
      playerCount: 10,
      renderScale: 1.25,
      aaQuality: "high",
      ambientOcclusion: false,
      vignette: false,
      shadowQuality: "high",
      fullscreenPreference: true,
      uiScale: 1.5,
      markerSize: "large",
      analogDeadZone: 0.25,
      analogSensitivity: 1.75,
      masterVolume: 0.7,
      effectsVolume: 0.6,
      musicVolume: 0.4,
      reducedMotion: true,
      cameraSmoothing: "instant",
      particleDensity: "off",
      highContrastInteractables: true,
      automaticUprightRecovery: true,
    });

    const reloaded = new SettingsService(memory.storage, {
      prefersReducedMotion: false,
    }).load();
    expect(reloaded).toEqual(updated);
    expect(reloaded.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(memory.writes.at(-1)?.key).toBe(SETTINGS_STORAGE_KEY);
  });

  it("migrates the existing v1 storage key and persists a v4 document", () => {
    const memory = createMemoryStorage({
      [LEGACY_SETTINGS_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        playerCount: 4,
        renderScale: 0.5,
        aaQuality: "fxaa",
        ambientOcclusion: false,
        vignette: true,
        shadowQuality: "low",
        analogDeadZone: 0.2,
        masterVolume: 0.3,
        reducedMotion: true,
      }),
    });

    const settings = new SettingsService(memory.storage, {
      prefersReducedMotion: false,
    }).load();

    expect(settings).toMatchObject({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      playerCount: 4,
      renderScale: 0.5,
      aaQuality: "fxaa",
      ambientOcclusion: false,
      vignette: true,
      shadowQuality: "low",
      analogDeadZone: 0.2,
      masterVolume: 0.3,
      effectsVolume: 1,
      musicVolume: 1,
      cameraSmoothing: "reduced",
      particleDensity: "reduced",
    });
    expect(memory.writes).toHaveLength(1);
    expect(memory.writes[0]?.key).toBe(SETTINGS_STORAGE_KEY);
    expect(JSON.parse(memory.values.get(SETTINGS_STORAGE_KEY) ?? "null")).toEqual(settings);
  });

  it("migrates the previous product key and repairs exact reversed-default workarounds", () => {
    const memory = createMemoryStorage({
      [PREVIOUS_SETTINGS_STORAGE_KEY]: JSON.stringify({
        ...DEFAULT_SETTINGS,
        schemaVersion: 2,
        playerCount: 2,
        playerInputs: DEFAULT_SETTINGS.playerInputs.map((input, index) =>
          index === 0
            ? {
                ...input,
                keyboard: {
                  up: "ArrowDown",
                  down: "ArrowUp",
                  left: "ArrowRight",
                  right: "ArrowLeft",
                },
              }
            : input,
        ),
      }),
    });

    const settings = new SettingsService(memory.storage, {
      prefersReducedMotion: false,
    }).load();

    expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(settings.playerInputs[0]?.keyboard).toEqual({
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      brake: "ShiftRight",
    });
    expect(memory.writes).toHaveLength(1);
    expect(memory.writes[0]?.key).toBe(SETTINGS_STORAGE_KEY);
  });

  it("migrates unversioned documents accepted by the original service", () => {
    const settings = SettingsService.validate({
      playerCount: 3,
      renderScale: 0.75,
      reducedMotion: false,
    });

    expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(settings.playerCount).toBe(3);
    expect(settings.renderScale).toBe(0.75);
    expect(settings.cameraSmoothing).toBe("default");
    expect(settings.particleDensity).toBe("full");
  });

  it("adds the default brake binding when migrating a v3 document", () => {
    const settings = SettingsService.validate({
      ...DEFAULT_SETTINGS,
      schemaVersion: 3,
      playerInputs: DEFAULT_SETTINGS.playerInputs.map((input) => {
        const { brake: _brake, ...keyboard } = input.keyboard;
        void _brake;
        return { ...input, keyboard };
      }),
    });

    expect(settings.schemaVersion).toBe(4);
    expect(settings.playerInputs[0]?.keyboard.brake).toBe("ShiftLeft");
    expect(settings.playerInputs[1]?.keyboard.brake).toBe("ShiftRight");
  });

  it("salvages recognized fields from a future schema version", () => {
    const futureDocument = JSON.stringify({
      schemaVersion: 99,
      playerCount: 6,
      renderScale: 0.75,
      uiScale: 1.2,
      unknownFutureField: "preserved in storage",
    });
    const memory = createMemoryStorage({
      [SETTINGS_STORAGE_KEY]: futureDocument,
    });
    const settings = new SettingsService(memory.storage, {
      prefersReducedMotion: false,
    }).load();

    expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(settings.playerCount).toBe(6);
    expect(settings.renderScale).toBe(0.75);
    expect(settings.uiScale).toBe(1.2);
    expect(settings).not.toHaveProperty("unknownFutureField");
    expect(memory.values.get(SETTINGS_STORAGE_KEY)).toBe(futureDocument);
    expect(memory.writes).toHaveLength(0);
  });

  it("uses motion-safe first-run and reset defaults when the OS preference is active", () => {
    const expected = createDefaultSettings({ prefersReducedMotion: true });
    const memory = createMemoryStorage();
    const service = new SettingsService(memory.storage, { prefersReducedMotion: true });

    expect(service.load()).toEqual(expected);
    service.update({
      vignette: true,
      particleDensity: "full",
      cameraSmoothing: "default",
      reducedMotion: false,
    });
    expect(service.resetToDefaults()).toEqual(expected);
    expect(JSON.parse(memory.values.get(SETTINGS_STORAGE_KEY) ?? "null")).toEqual(expected);
  });

  it("survives unavailable storage while retaining sanitized in-memory updates", () => {
    const service = new SettingsService(
      {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
      { prefersReducedMotion: false },
    );

    expect(service.load()).toEqual(DEFAULT_SETTINGS);
    expect(() => service.update({ playerCount: 4, effectsVolume: 0.25 })).not.toThrow();
    expect(service.current.playerCount).toBe(4);
    expect(service.current.effectsVolume).toBe(0.25);
  });

  it.each(["{broken", "null", "[]", '"text"'])(
    "falls back cleanly for a corrupt document: %s",
    (serialized) => {
      const memory = createMemoryStorage({
        [SETTINGS_STORAGE_KEY]: serialized,
      });
      const service = new SettingsService(memory.storage, {
        prefersReducedMotion: false,
      });

      expect(service.load()).toEqual(DEFAULT_SETTINGS);
      expect(memory.writes).toHaveLength(0);
    },
  );

  it("sanitizes persisted key codes, mapping hints, and controller calibration", () => {
    const settings = SettingsService.validate({
      ...DEFAULT_SETTINGS,
      playerInputs: [
        {
          ...DEFAULT_SETTINGS.playerInputs[0],
          keyboard: {
            up: "",
            down: "KeyS",
            left: "<script>",
            right: "KeyD",
          },
          controllerIdHint: "Pad",
          controllerMappingHint: "vendor-magic",
          controllerCalibration: {
            horizontalAxis: 0,
            verticalAxis: 0,
            horizontalSign: 1,
            verticalSign: -1,
          },
          gamepadIndex: 7,
        },
      ],
    });

    expect(settings.playerInputs[0]?.keyboard).toEqual({
      up: "KeyW",
      down: "KeyS",
      left: "KeyA",
      right: "KeyD",
      brake: "ShiftLeft",
    });
    expect(settings.playerInputs[0]?.controllerIdHint).toBe("Pad");
    expect(settings.playerInputs[0]?.controllerMappingHint).toBeNull();
    expect(settings.playerInputs[0]?.controllerCalibration).toBeNull();
    expect(settings.playerInputs[0]).not.toHaveProperty("gamepadIndex");
    expect(JSON.stringify(settings)).not.toContain("gamepadIndex");
  });
});

describe("settings migrations", () => {
  it("is deterministic and never mutates its v1 input", () => {
    const source = Object.freeze({
      schemaVersion: 1,
      playerCount: 2,
      reducedMotion: true,
    });

    const first = migrateSettingsDocument(source);
    const second = migrateSettingsDocument(source);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      sourceVersion: 1,
      migrated: true,
    });
    expect(first.document).toMatchObject({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      playerCount: 2,
      cameraSmoothing: "reduced",
      particleDensity: "reduced",
    });
    expect(source.schemaVersion).toBe(1);
  });

  it("does not report a current document as migrated", () => {
    const result = migrateSettingsDocument({ ...DEFAULT_SETTINGS });

    expect(result.sourceVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(result.migrated).toBe(false);
    expect(result.document).toEqual(DEFAULT_SETTINGS);
    expect(result.document).not.toBe(DEFAULT_SETTINGS);
  });
});
