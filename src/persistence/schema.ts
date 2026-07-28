import { DEFAULT_KEYBOARD_BINDINGS, type KeyboardBinding } from "../input/bindings";

export const SETTINGS_SCHEMA_VERSION = 2 as const;

export type AaQuality = "off" | "fxaa" | "smaa" | "high";
export type ShadowQuality = "low" | "medium" | "high";
export type PlayerInputType = "keyboard" | "controller";
export type MarkerSize = "small" | "medium" | "large";
export type CameraSmoothing = "default" | "reduced" | "instant";
export type ParticleDensity = "full" | "reduced" | "off";

export const UI_SCALE_MINIMUM = 0.8;
export const UI_SCALE_MAXIMUM = 1.5;
export const ANALOG_DEAD_ZONE_MINIMUM = 0;
export const ANALOG_DEAD_ZONE_MAXIMUM = 0.5;
export const ANALOG_SENSITIVITY_MINIMUM = 0.5;
export const ANALOG_SENSITIVITY_MAXIMUM = 2;

export interface ControllerCalibration {
  readonly horizontalAxis: number;
  readonly verticalAxis: number;
  readonly horizontalSign: -1 | 1;
  readonly verticalSign: -1 | 1;
}

export interface PlayerInputSettings {
  readonly inputType: PlayerInputType;
  readonly keyboard: KeyboardBinding;
  readonly controllerIdHint: string | null;
  readonly controllerMappingHint: GamepadMappingType | null;
  readonly controllerCalibration: ControllerCalibration | null;
}

export const DEFAULT_PLAYER_INPUTS: readonly PlayerInputSettings[] = Object.freeze(
  DEFAULT_KEYBOARD_BINDINGS.map((keyboard) =>
    Object.freeze({
      inputType: "keyboard" as const,
      keyboard,
      controllerIdHint: null,
      controllerMappingHint: null,
      controllerCalibration: null,
    }),
  ),
);

export interface GameSettings {
  readonly schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  readonly playerCount: number;
  readonly playerInputs: readonly PlayerInputSettings[];
  readonly renderScale: 0.5 | 0.75 | 1 | 1.25;
  readonly aaQuality: AaQuality;
  readonly ambientOcclusion: boolean;
  readonly vignette: boolean;
  readonly shadowQuality: ShadowQuality;
  readonly fullscreenPreference: boolean;
  readonly uiScale: number;
  readonly markerSize: MarkerSize;
  readonly analogDeadZone: number;
  readonly analogSensitivity: number;
  readonly masterVolume: number;
  readonly effectsVolume: number;
  readonly musicVolume: number;
  readonly reducedMotion: boolean;
  readonly cameraSmoothing: CameraSmoothing;
  readonly particleDensity: ParticleDensity;
  readonly highContrastInteractables: boolean;
  readonly automaticUprightRecovery: boolean;
}

export interface DefaultSettingsPreferences {
  readonly prefersReducedMotion?: boolean;
}

/**
 * Creates the first-run/reset defaults. The OS motion preference only changes
 * optional presentation effects; vehicle physics and input remain untouched.
 */
export function createDefaultSettings(preferences: DefaultSettingsPreferences = {}): GameSettings {
  const prefersReducedMotion = preferences.prefersReducedMotion === true;
  return Object.freeze({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    playerCount: 1,
    playerInputs: DEFAULT_PLAYER_INPUTS,
    renderScale: 1,
    aaQuality: "smaa",
    ambientOcclusion: true,
    vignette: !prefersReducedMotion,
    shadowQuality: "medium",
    fullscreenPreference: false,
    uiScale: 1,
    markerSize: "medium",
    analogDeadZone: 0.15,
    analogSensitivity: 1,
    masterVolume: 0.8,
    effectsVolume: 1,
    musicVolume: 1,
    reducedMotion: prefersReducedMotion,
    cameraSmoothing: prefersReducedMotion ? "reduced" : "default",
    particleDensity: prefersReducedMotion ? "reduced" : "full",
    highContrastInteractables: false,
    automaticUprightRecovery: false,
  });
}

export const DEFAULT_SETTINGS: GameSettings = createDefaultSettings();
