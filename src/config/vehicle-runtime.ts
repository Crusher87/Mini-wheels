import { VEHICLE_SOURCE_REFERENCE } from "./source-reference";

const torqueToForce = (torque: number, radius: number): number => torque / radius;

export const VEHICLE_RUNTIME = Object.freeze({
  chassis: Object.freeze({
    mass: VEHICLE_SOURCE_REFERENCE.body.mass,
    linearDamping: VEHICLE_SOURCE_REFERENCE.body.linearDrag,
    angularDamping: VEHICLE_SOURCE_REFERENCE.body.angularDrag,
    gravityScale: 1,
    ccd: true,
    centerOfMass: VEHICLE_SOURCE_REFERENCE.body.centerOfMassOffset,
    principalAngularInertiaInitial: Object.freeze({
      x: 231.25,
      y: 272.5,
      z: 81.25,
    }),
  }),
  axes: Object.freeze({
    upIndex: 1,
    forwardIndex: 2,
    suspensionDirection: Object.freeze({ x: 0, y: -1, z: 0 }),
    wheelAxle: Object.freeze({ x: 1, y: 0, z: 0 }),
  }),
  wheel: Object.freeze({
    radius: VEHICLE_SOURCE_REFERENCE.wheel.radius,
    suspensionRestLength:
      VEHICLE_SOURCE_REFERENCE.wheel.suspensionDistance *
      VEHICLE_SOURCE_REFERENCE.wheel.spring.targetPosition,
    maxSuspensionTravel: VEHICLE_SOURCE_REFERENCE.wheel.suspensionDistance / 2,
    suspensionStiffnessInitial: VEHICLE_SOURCE_REFERENCE.wheel.spring.strength,
    suspensionCompressionInitial: VEHICLE_SOURCE_REFERENCE.wheel.spring.damper,
    suspensionRelaxationInitial: VEHICLE_SOURCE_REFERENCE.wheel.spring.damper,
    /**
     * DECISION / measured Rapier mapping:
     * Rapier multiplies these controller coefficients by chassis mass internally.
     * Dividing by 1500 preserves the source 35,000 spring and 1,500 damper forces.
     */
    suspensionStiffnessCalibrated:
      VEHICLE_SOURCE_REFERENCE.wheel.spring.strength / VEHICLE_SOURCE_REFERENCE.body.mass,
    suspensionCompressionCalibrated:
      VEHICLE_SOURCE_REFERENCE.wheel.spring.damper / VEHICLE_SOURCE_REFERENCE.body.mass,
    suspensionRelaxationCalibrated:
      VEHICLE_SOURCE_REFERENCE.wheel.spring.damper / VEHICLE_SOURCE_REFERENCE.body.mass,
    maxSuspensionForceInitial: 100_000,
    frictionSlipInitial: 1,
    sideFrictionStiffnessInitial: VEHICLE_SOURCE_REFERENCE.wheel.sidewaysFriction.stiffness,
  }),
  drive: Object.freeze({
    frontEngineForce: torqueToForce(
      VEHICLE_SOURCE_REFERENCE.drive.maxMotorTorquePerWheel,
      VEHICLE_SOURCE_REFERENCE.wheel.radius,
    ),
    frontOpposingForce: torqueToForce(
      VEHICLE_SOURCE_REFERENCE.drive.maxMotorTorquePerWheel *
        VEHICLE_SOURCE_REFERENCE.drive.opposingTorqueMultiplier,
      VEHICLE_SOURCE_REFERENCE.wheel.radius,
    ),
    maxSteeringRadians: (VEHICLE_SOURCE_REFERENCE.drive.maxSteeringAngleDegrees * Math.PI) / 180,
  }),
  /**
   * Named Profile B compatibility correction for Rapier's ray-cast tires.
   *
   * Position-based kinematic bodies expose their fictitious contact-surface
   * velocity, but Rapier 0.19.3 does not transfer enough of that lateral
   * velocity to an idle ray-cast chassis. The adapter applies this correction
   * only when at least two wheels agree on one kinematic support and no
   * meaningful drive/reverse input is active.
   */
  profileBPassengerSurfaceCorrection: Object.freeze({
    minimumSupportingWheels: 2,
    throttleInputDeadzone: 0.05,
    velocityDifferenceEpsilon: 0.001,
  }),
  recovery: Object.freeze({
    minimumY: -3,
    spawnPosition: Object.freeze({ x: 0, y: 1, z: 0 }),
    spawnRotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  }),
});

export type VehicleRuntimeConfig = typeof VEHICLE_RUNTIME;
