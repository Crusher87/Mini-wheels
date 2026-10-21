import type { QuaternionLike, Vector3Like } from "./trigger-math";

declare const boosterPadIdBrand: unique symbol;
declare const portalEndpointIdBrand: unique symbol;
declare const portalPairIdBrand: unique symbol;

export type BoosterPadId = string & {
  readonly [boosterPadIdBrand]: true;
};
export type PortalEndpointId = string & {
  readonly [portalEndpointIdBrand]: true;
};
export type PortalPairId = string & {
  readonly [portalPairIdBrand]: true;
};

export function boosterPadId(value: string): BoosterPadId {
  if (value.length === 0) {
    throw new RangeError("Booster pad IDs cannot be empty.");
  }
  return value as BoosterPadId;
}

export function portalEndpointId(value: string): PortalEndpointId {
  if (value.length === 0) {
    throw new RangeError("Portal endpoint IDs cannot be empty.");
  }
  return value as PortalEndpointId;
}

export function portalPairId(value: string): PortalPairId {
  if (value.length === 0) {
    throw new RangeError("Portal pair IDs cannot be empty.");
  }
  return value as PortalPairId;
}

export interface BoosterPadDefinition {
  readonly id: BoosterPadId;
  readonly position: Vector3Like;
  readonly rotation: QuaternionLike;
  readonly halfExtents: Vector3Like;
  readonly deltaVelocity: Vector3Like;
  readonly effect?: "boost" | "launch" | "bounce" | "slow";
  readonly velocityMultiplier?: number;
  readonly minimumVerticalSpeed?: number;
  readonly cooldownSeconds?: number;
  /** Starts switched off when false; WHEN → DO links can switch it on. */
  readonly enabled?: boolean;
}

export interface PortalEndpointDefinition {
  readonly id: PortalEndpointId;
  readonly pairId: PortalPairId;
  readonly position: Vector3Like;
  readonly rotation: QuaternionLike;
  /**
   * Half-extents before rotation. Local +Z is the outward portal normal.
   */
  readonly halfExtents: Vector3Like;
  /** Starts switched off when false; WHEN → DO links can switch it on. */
  readonly enabled?: boolean;
}

export const BOOSTER_CONFIG = Object.freeze({
  floorDeltaVelocity: Object.freeze({ x: 0, y: 0, z: -5 }),
  rampDeltaVelocity: Object.freeze({ x: -1, y: 1, z: 5 }),
  cooldownSeconds: 0.15,
  activationParticleCount: 5,
  color: 0xbf4444,
});

export const PORTAL_CONFIG = Object.freeze({
  retainedSpeedFraction: 0.8,
  reentryLockSeconds: 0.2,
  baseColor: 0x0c589c,
  emissiveColor: 0x308ccc,
  opacity: 0.9,
});

const IDENTITY_ROTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const FLOOR_PAD_HALF_EXTENTS = Object.freeze({ x: 0.8, y: 0.1, z: 0.8 });
const RAMP_YAW_RADIANS = (67.6 * Math.PI) / 180;
// Matches the isolated 10 × 4.2 ramp reconstruction in sandbox-layout.
const RAMP_SLOPE_RADIANS = Math.atan2(4.2, 10);
const RAMP_YAW_SINE = Math.sin(RAMP_YAW_RADIANS / 2);
const RAMP_YAW_COSINE = Math.cos(RAMP_YAW_RADIANS / 2);
const RAMP_ROLL_SINE = Math.sin(-RAMP_SLOPE_RADIANS / 2);
const RAMP_ROLL_COSINE = Math.cos(-RAMP_SLOPE_RADIANS / 2);
const APPROXIMATE_RAMP_SURFACE_ROTATION = Object.freeze({
  x: RAMP_YAW_SINE * RAMP_ROLL_SINE,
  y: RAMP_YAW_SINE * RAMP_ROLL_COSINE,
  z: RAMP_YAW_COSINE * RAMP_ROLL_SINE,
  w: RAMP_YAW_COSINE * RAMP_ROLL_COSINE,
});

export const DEFAULT_BOOSTER_PADS: readonly BoosterPadDefinition[] = Object.freeze([
  {
    id: boosterPadId("floor-1"),
    position: Object.freeze({ x: 32.97, y: 0.1, z: -29.68 }),
    rotation: IDENTITY_ROTATION,
    halfExtents: FLOOR_PAD_HALF_EXTENTS,
    deltaVelocity: BOOSTER_CONFIG.floorDeltaVelocity,
  },
  {
    id: boosterPadId("floor-2"),
    position: Object.freeze({ x: 32.97, y: 0.1, z: -27.68 }),
    rotation: IDENTITY_ROTATION,
    halfExtents: FLOOR_PAD_HALF_EXTENTS,
    deltaVelocity: BOOSTER_CONFIG.floorDeltaVelocity,
  },
  {
    id: boosterPadId("floor-3"),
    position: Object.freeze({ x: 32.97, y: 0.1, z: -25.68 }),
    rotation: IDENTITY_ROTATION,
    halfExtents: FLOOR_PAD_HALF_EXTENTS,
    deltaVelocity: BOOSTER_CONFIG.floorDeltaVelocity,
  },
  {
    id: boosterPadId("ramp"),
    position: Object.freeze({ x: -12.49, y: 4.19, z: -8.83 }),
    // The source does not expose an exact pad quaternion. This aligns the
    // pad to the documented 67.6-degree ramp yaw and the slope implied by
    // the ramp-center-to-pad rise/run; final visual calibration may tune it.
    rotation: APPROXIMATE_RAMP_SURFACE_ROTATION,
    halfExtents: Object.freeze({ x: 0.9, y: 0.1, z: 1.2 }),
    deltaVelocity: BOOSTER_CONFIG.rampDeltaVelocity,
  },
]);

const UPRIGHT_HALF_EXTENTS = Object.freeze({ x: 1.5, y: 2, z: 0.12 });
const UPRIGHT_POSITIVE_Z = IDENTITY_ROTATION;
const UPRIGHT_NEGATIVE_Z = Object.freeze({ x: 0, y: 1, z: 0, w: 0 });
const HORIZONTAL_POSITIVE_Y = Object.freeze({
  x: -Math.SQRT1_2,
  y: 0,
  z: 0,
  w: Math.SQRT1_2,
});

/**
 * Authored positions are exact GDD targets. The public references do not
 * expose every endpoint quaternion, so these defaults deliberately face exits
 * into open space and keep local +Z as the outward direction.
 */
export const DEFAULT_PORTAL_ENDPOINTS: readonly PortalEndpointDefinition[] = Object.freeze([
  {
    id: portalEndpointId("pair-1-a"),
    pairId: portalPairId("pair-1"),
    position: Object.freeze({ x: 32.8, y: 2, z: -33.6 }),
    rotation: UPRIGHT_POSITIVE_Z,
    halfExtents: UPRIGHT_HALF_EXTENTS,
  },
  {
    id: portalEndpointId("pair-1-b"),
    pairId: portalPairId("pair-1"),
    position: Object.freeze({ x: 22.8, y: 5, z: -33.6 }),
    rotation: HORIZONTAL_POSITIVE_Y,
    halfExtents: UPRIGHT_HALF_EXTENTS,
  },
  {
    id: portalEndpointId("pair-2-a"),
    pairId: portalPairId("pair-2"),
    position: Object.freeze({ x: 19.4, y: 2, z: 31.1 }),
    rotation: UPRIGHT_NEGATIVE_Z,
    halfExtents: UPRIGHT_HALF_EXTENTS,
  },
  {
    id: portalEndpointId("pair-2-b"),
    pairId: portalPairId("pair-2"),
    position: Object.freeze({ x: 24.4, y: 5, z: 21.1 }),
    rotation: UPRIGHT_POSITIVE_Z,
    halfExtents: UPRIGHT_HALF_EXTENTS,
  },
]);
