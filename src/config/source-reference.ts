/**
 * CONFIRMED values extracted from the Alpha and preserved without Rapier tuning.
 * Runtime mappings live in vehicle-runtime.ts so engine-specific calibration never
 * overwrites the evidence record.
 */
export const VEHICLE_SOURCE_REFERENCE = Object.freeze({
  body: Object.freeze({
    mass: 1500,
    linearDrag: 0,
    angularDrag: 0.05,
    gravity: true,
    interpolation: true,
    collisionDetection: "continuousDynamic",
    centerOfMassOffset: Object.freeze({ x: 0, y: -0.125, z: 0.1 }),
  }),
  drive: Object.freeze({
    drivenAxle: "front",
    steeringAxle: "front",
    maxMotorTorquePerWheel: 400,
    opposingTorqueMultiplier: 10,
    maxSteeringAngleDegrees: 35,
    artificialTopSpeed: null,
  }),
  wheel: Object.freeze({
    centers: Object.freeze([
      Object.freeze({ x: -0.3, y: 0, z: 0.5 }),
      Object.freeze({ x: 0.3, y: 0, z: 0.5 }),
      Object.freeze({ x: -0.3, y: 0, z: -0.5 }),
      Object.freeze({ x: 0.3, y: 0, z: -0.5 }),
    ] as const),
    mass: 50,
    radius: 0.2,
    suspensionDistance: 0.3,
    dampingRate: 0.25,
    forceApplicationPointDistance: 0.3,
    spring: Object.freeze({
      strength: 35_000,
      damper: 1_500,
      targetPosition: 0.5,
    }),
    forwardFriction: Object.freeze({
      extremumSlip: 0.4,
      extremumValue: 1,
      asymptoteSlip: 0.6,
      asymptoteValue: 0.5,
      stiffness: 1,
    }),
    sidewaysFriction: Object.freeze({
      extremumSlip: 0.2,
      extremumValue: 1,
      asymptoteSlip: 0.5,
      asymptoteValue: 0.75,
      stiffness: 1.8,
    }),
  }),
});

export type VehicleSourceReference = typeof VEHICLE_SOURCE_REFERENCE;
