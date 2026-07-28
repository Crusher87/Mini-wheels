export interface SandboxVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SandboxTransform {
  readonly position: SandboxVector3;
  readonly yawDegrees: number;
}

function freezeVector(x: number, y: number, z: number): SandboxVector3 {
  return Object.freeze({ x, y, z });
}

function roundedHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

const cubePositions: SandboxVector3[] = [];
for (let xIndex = 0; xIndex < 6; xIndex += 1) {
  for (let yIndex = 0; yIndex < 4; yIndex += 1) {
    for (let zIndex = 0; zIndex < 4; zIndex += 1) {
      cubePositions.push(
        freezeVector(
          roundedHundredths(7.81 + xIndex),
          0.5 + yIndex,
          roundedHundredths(-34.83 + zIndex),
        ),
      );
    }
  }
}

/**
 * Immutable authored data for the Alpha 0.0.6 Sandbox subset.
 *
 * Ramp transforms and the source X-scale multiplier are documented. The
 * underlying source wedge dimensions are not, so `wedgeDimensions` is a
 * deliberately isolated reconstruction value.
 */
export const SANDBOX_LAYOUT = Object.freeze({
  floor: Object.freeze({
    center: freezeVector(0, -0.1, 0),
    dimensions: freezeVector(80, 0.2, 80),
    friction: 1,
  }),
  resetVolume: Object.freeze({
    center: freezeVector(0, -5, 0),
    dimensions: freezeVector(200, 4, 200),
    upperBoundaryY: -3,
    dynamicPropDestination: freezeVector(0, 2, 0),
  }),
  cubeStack: Object.freeze({
    count: 96,
    formation: freezeVector(6, 4, 4),
    dimensions: freezeVector(1, 1, 1),
    positions: Object.freeze(cubePositions),
    mass: 10,
    linearDamping: 0,
    angularDamping: 0.05,
    sourceContinuousCollisionDetection: true,
    // Profile B browser runtime: 96 CCD bodies caused sustained fixed-step
    // overruns in Chromium. Cars and balls retain CCD; cube tunneling is
    // covered by the worst-collision acceptance run.
    runtimeContinuousCollisionDetection: false,
  }),
  balls: Object.freeze({
    radius: 0.5,
    mass: 50,
    linearDamping: 0,
    angularDamping: 0.05,
    continuousCollisionDetection: true,
    positions: Object.freeze([
      freezeVector(29.6, 0.5, 5),
      freezeVector(-9.6, 0.5, 31.6),
      freezeVector(-27.5, 0.5, -1.1),
    ]),
    light: Object.freeze({
      color: 0x98ff50,
      intensity: 1,
      range: 1.5,
    }),
  }),
  ramps: Object.freeze({
    sourceXScaleMultiplier: 3,
    // DECISION: the source base mesh is unavailable. A 10 × 4.2 run/rise
    // places the documented ramp booster bottom at y≈4.09 at its recovered
    // X/Z location; the wedge rises toward local -X.
    wedgeDimensions: freezeVector(10, 4.2, 4),
    transforms: Object.freeze([
      Object.freeze({
        position: freezeVector(-10.85, 0, -13.25),
        yawDegrees: 67.6,
      }),
      Object.freeze({
        position: freezeVector(-24.1, 0, 26.8),
        yawDegrees: 30,
      }),
    ] satisfies readonly SandboxTransform[]),
  }),
  featureWall: Object.freeze({
    transform: Object.freeze({
      position: freezeVector(14.91, 2, -20.53),
      yawDegrees: -30,
    }) satisfies SandboxTransform,
    dimensions: freezeVector(10, 4, 1),
  }),
  elevatedColumns: Object.freeze({
    dimensions: freezeVector(4, 8, 4),
    positions: Object.freeze([freezeVector(-32, 4, -32), freezeVector(-18, 4, -32)]),
  }),
  colors: Object.freeze({
    architecture: 0xb2b2b2,
    green: 0x1ed936,
    greenEmissive: 0x4bb800,
  }),
});

export type SandboxLayout = typeof SANDBOX_LAYOUT;
