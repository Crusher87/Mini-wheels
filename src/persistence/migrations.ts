import { SETTINGS_SCHEMA_VERSION } from "./schema";

export interface SettingsMigrationResult {
  readonly document: Readonly<Record<string, unknown>>;
  readonly sourceVersion: number | null;
  readonly migrated: boolean;
}

function serializedVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
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
  if (sourceVersion <= 1) {
    const reducedMotion = source["reducedMotion"] === true;
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
        ...source,
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
      ...source,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
    }),
    sourceVersion,
    migrated: true,
  };
}
