import type {
  MovingPlatformSource,
  RotatingBarSource,
  RotatingBarSpeedProfile,
} from "../../config/sandbox-movers";

export interface ReadonlyVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MutableVector3 {
  x: number;
  y: number;
  z: number;
}

export type PlatformMotionPhase = "travel-a-to-b" | "hold-at-b" | "travel-b-to-a" | "hold-at-a";

export const TAU = Math.PI * 2;

export function positiveModulo(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) {
    throw new RangeError("Modulo arguments must be finite and modulus must be positive.");
  }
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function rotatingBarDegreesPerSecond(
  source: RotatingBarSource,
  profile: RotatingBarSpeedProfile,
): number {
  return profile === "legacy" ? source.legacyDegreesPerSecond : source.recommendedDegreesPerSecond;
}

/**
 * Returns the orientation-equivalent Y angle in [0, 2π) for an absolute
 * simulation timestamp. No render cadence or accumulated render delta enters
 * this calculation.
 */
export function rotatingBarYawAtTime(
  source: RotatingBarSource,
  simulationTimeSeconds: number,
  profile: RotatingBarSpeedProfile = "legacy",
): number {
  assertSimulationTime(simulationTimeSeconds);
  const degrees =
    source.initialYawDegrees + rotatingBarDegreesPerSecond(source, profile) * simulationTimeSeconds;
  return positiveModulo(degreesToRadians(degrees), TAU);
}

export function platformTravelSeconds(
  endpointA: ReadonlyVector3,
  endpointB: ReadonlyVector3,
  speedUnitsPerSecond: number,
): number {
  if (!Number.isFinite(speedUnitsPerSecond) || speedUnitsPerSecond <= 0) {
    throw new RangeError("Platform speed must be finite and positive.");
  }
  const deltaX = endpointB.x - endpointA.x;
  const deltaY = endpointB.y - endpointA.y;
  const deltaZ = endpointB.z - endpointA.z;
  return Math.hypot(deltaX, deltaY, deltaZ) / speedUnitsPerSecond;
}

export function platformCycleSeconds(source: MovingPlatformSource): number {
  return 2 * (authoredTravelSeconds(source) + source.endpointHoldSeconds);
}

/**
 * Writes a deterministic platform position for an absolute simulation
 * timestamp into caller-owned storage and returns its current phase.
 */
export function writePlatformPositionAtTime(
  source: MovingPlatformSource,
  simulationTimeSeconds: number,
  output: MutableVector3,
): PlatformMotionPhase {
  assertSimulationTime(simulationTimeSeconds);
  if (!Number.isFinite(source.endpointHoldSeconds) || source.endpointHoldSeconds < 0) {
    throw new RangeError("Platform endpoint hold must be finite and non-negative.");
  }

  const travelSeconds = authoredTravelSeconds(source);
  const cycleSeconds = 2 * (travelSeconds + source.endpointHoldSeconds);
  const cycleTime = positiveModulo(simulationTimeSeconds, cycleSeconds);

  if (cycleTime < travelSeconds) {
    writeLerp(source.endpointA, source.endpointB, cycleTime / travelSeconds, output);
    return "travel-a-to-b";
  }

  const returnStart = travelSeconds + source.endpointHoldSeconds;
  if (cycleTime < returnStart) {
    writeVector(source.endpointB, output);
    return "hold-at-b";
  }

  const returnEnd = returnStart + travelSeconds;
  if (cycleTime < returnEnd) {
    writeLerp(
      source.endpointB,
      source.endpointA,
      (cycleTime - returnStart) / travelSeconds,
      output,
    );
    return "travel-b-to-a";
  }

  writeVector(source.endpointA, output);
  return "hold-at-a";
}

/**
 * Converts an automatic-cycle timestamp into one-way progress from A toward B,
 * in [0, travel seconds], so manual open/close/stop can continue from the same spot.
 */
export function platformProgressAtTime(
  source: MovingPlatformSource,
  simulationTimeSeconds: number,
): number {
  assertSimulationTime(simulationTimeSeconds);
  const travelSeconds = authoredTravelSeconds(source);
  const cycleTime = positiveModulo(simulationTimeSeconds, platformCycleSeconds(source));
  const returnStart = travelSeconds + source.endpointHoldSeconds;
  if (cycleTime < travelSeconds) {
    return cycleTime;
  }
  if (cycleTime < returnStart) {
    return travelSeconds;
  }
  if (cycleTime < returnStart + travelSeconds) {
    return travelSeconds - (cycleTime - returnStart);
  }
  return 0;
}

function assertSimulationTime(simulationTimeSeconds: number): void {
  if (!Number.isFinite(simulationTimeSeconds) || simulationTimeSeconds < 0) {
    throw new RangeError("Simulation time must be finite and non-negative.");
  }
}

function authoredTravelSeconds(source: MovingPlatformSource): number {
  if (
    !Number.isFinite(source.authoredOneWayTravelSeconds) ||
    source.authoredOneWayTravelSeconds <= 0
  ) {
    throw new RangeError("Authored platform travel time must be finite and positive.");
  }
  return source.authoredOneWayTravelSeconds;
}

function writeLerp(
  start: ReadonlyVector3,
  end: ReadonlyVector3,
  alpha: number,
  output: MutableVector3,
): void {
  output.x = start.x + (end.x - start.x) * alpha;
  output.y = start.y + (end.y - start.y) * alpha;
  output.z = start.z + (end.z - start.z) * alpha;
}

function writeVector(source: ReadonlyVector3, output: MutableVector3): void {
  output.x = source.x;
  output.y = source.y;
  output.z = source.z;
}
