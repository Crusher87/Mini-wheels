/**
 * CONFIRMED Sandbox mover values from GDD sections 9.4 and 9.5.
 *
 * The legacy bar rates are the source's per-rendered-iteration values converted
 * at the 60 Hz reference cadence. The recommended rates remain available as a
 * separately named safety profile; the faithful profile defaults to `legacy`.
 */
export const SANDBOX_MOVER_SOURCE_REFERENCE = Object.freeze({
  rotatingBars: Object.freeze([
    Object.freeze({
      id: "rotating-bar-1",
      position: Object.freeze({ x: -27, y: 0.5, z: 6 }),
      scale: Object.freeze({ x: 10, y: 1, z: 1 }),
      initialYawDegrees: 0,
      sourceDegreesPerRenderedIteration: 5,
      legacyDegreesPerSecond: 300,
      recommendedDegreesPerSecond: 120,
    }),
    Object.freeze({
      id: "rotating-bar-2",
      position: Object.freeze({ x: 27, y: 0.5, z: -3 }),
      scale: Object.freeze({ x: 10, y: 1, z: 1 }),
      initialYawDegrees: 90,
      sourceDegreesPerRenderedIteration: -8,
      legacyDegreesPerSecond: -480,
      recommendedDegreesPerSecond: -180,
    }),
  ]),
  movingPlatforms: Object.freeze([
    Object.freeze({
      id: "vertical-lift",
      size: Object.freeze({ x: 4, y: 0.2, z: 4 }),
      endpointA: Object.freeze({ x: -32, y: -0.05, z: -28 }),
      endpointB: Object.freeze({ x: -32, y: 7.9, z: -28 }),
      speedUnitsPerSecond: 1,
      endpointHoldSeconds: 2,
      authoredOneWayTravelSeconds: 7.95,
    }),
    Object.freeze({
      id: "horizontal-shuttle",
      size: Object.freeze({ x: 4, y: 0.2, z: 4 }),
      endpointA: Object.freeze({ x: -28, y: 7.9, z: -32 }),
      endpointB: Object.freeze({ x: -22, y: 7.9, z: -32 }),
      speedUnitsPerSecond: 1,
      endpointHoldSeconds: 2,
      authoredOneWayTravelSeconds: 6,
    }),
  ]),
});

export interface RotatingBarSource {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly scale: { readonly x: number; readonly y: number; readonly z: number };
  readonly initialYawDegrees: number;
  readonly sourceDegreesPerRenderedIteration: number;
  readonly legacyDegreesPerSecond: number;
  readonly recommendedDegreesPerSecond: number;
  readonly color?: string | number;
}

export interface MovingPlatformSource {
  readonly id: string;
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  readonly endpointA: { readonly x: number; readonly y: number; readonly z: number };
  readonly endpointB: { readonly x: number; readonly y: number; readonly z: number };
  readonly speedUnitsPerSecond: number;
  readonly endpointHoldSeconds: number;
  readonly authoredOneWayTravelSeconds: number;
  readonly initiallyStopped?: boolean;
  readonly rotation?: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly color?: string | number;
}

export type SandboxMoverSourceReference = typeof SANDBOX_MOVER_SOURCE_REFERENCE;
export type RotatingBarId = string;
export type MovingPlatformId = string;
export type RotatingBarSpeedProfile = "legacy" | "recommended";
