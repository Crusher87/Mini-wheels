import type { DynamicRayCastVehicleController, RigidBody, World } from "@dimforge/rapier3d";
import type { LogicalAxes } from "../input/InputHub";
import { VEHICLE_SOURCE_REFERENCE } from "../config/source-reference";
import { VEHICLE_RUNTIME } from "../config/vehicle-runtime";
import type { RapierModule } from "./rapier-init";
import { COLLISION_GROUPS } from "./CollisionGroups";

const FRONT_WHEELS = [0, 1] as const;
const REAR_WHEELS = [2, 3] as const;
const ALL_WHEELS = [0, 1, 2, 3] as const;
type WheelIndex = (typeof ALL_WHEELS)[number];
const DIRECTION_EPSILON = 0.05;
const TWO_PI = Math.PI * 2;

export interface KinematicSupportVelocitySample {
  readonly supportHandle: number;
  readonly velocityX: number;
  readonly velocityZ: number;
}

export interface PassengerSurfaceCorrection {
  readonly supportHandle: number;
  readonly supportingWheelCount: number;
  readonly velocityX: number;
  readonly velocityZ: number;
}

export interface DriveMapping {
  readonly engineForce: number;
  readonly opposing: boolean;
}

export interface WheelRenderPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly steering: number;
  readonly rotation: number;
  readonly inContact: boolean;
}

interface MutableWheelState {
  suspensionLength: number;
  steering: number;
  rotation: number;
  inContact: boolean;
}

function clampAxis(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, -1), 1) : 0;
}

export function shortestAngleDelta(previous: number, current: number): number {
  let delta = (current - previous) % TWO_PI;
  if (delta > Math.PI) {
    delta -= TWO_PI;
  } else if (delta < -Math.PI) {
    delta += TWO_PI;
  }
  return delta;
}

export function mapDriveForce(
  verticalInput: number,
  normalizedWheelOmega: number,
  localForwardSpeed: number,
): DriveMapping {
  const input = clampAxis(verticalInput);
  const motionSignal =
    Math.abs(normalizedWheelOmega) > DIRECTION_EPSILON ? normalizedWheelOmega : localForwardSpeed;
  const opposing =
    Math.abs(input) > DIRECTION_EPSILON &&
    Math.abs(motionSignal) > DIRECTION_EPSILON &&
    Math.sign(input) !== Math.sign(motionSignal);
  const magnitude = opposing
    ? VEHICLE_RUNTIME.drive.frontOpposingForce
    : VEHICLE_RUNTIME.drive.frontEngineForce;
  return { engineForce: input * magnitude, opposing };
}

function createWheelState(): MutableWheelState {
  return {
    suspensionLength: VEHICLE_RUNTIME.wheel.suspensionRestLength,
    steering: 0,
    rotation: 0,
    inContact: false,
  };
}

function createWheelStates(): [
  MutableWheelState,
  MutableWheelState,
  MutableWheelState,
  MutableWheelState,
] {
  return [createWheelState(), createWheelState(), createWheelState(), createWheelState()];
}

/**
 * Selects a single kinematic surface supported by multiple wheel rays.
 *
 * Requiring the same body prevents a car bridging two unrelated movers from
 * being snapped to either one. Contact-point velocities are averaged so this
 * also remains physically meaningful on a rotating kinematic surface.
 */
export function selectPassengerSurfaceCorrection(
  samples: readonly KinematicSupportVelocitySample[],
  verticalInput: number,
  minimumSupportingWheels = VEHICLE_RUNTIME.profileBPassengerSurfaceCorrection
    .minimumSupportingWheels,
  throttleInputDeadzone = VEHICLE_RUNTIME.profileBPassengerSurfaceCorrection.throttleInputDeadzone,
): PassengerSurfaceCorrection | null {
  if (
    !Number.isFinite(verticalInput) ||
    Math.abs(verticalInput) > throttleInputDeadzone ||
    minimumSupportingWheels < 1
  ) {
    return null;
  }

  let selected: PassengerSurfaceCorrection | null = null;
  for (const candidate of samples) {
    if (
      candidate.supportHandle < 0 ||
      !Number.isFinite(candidate.velocityX + candidate.velocityZ)
    ) {
      continue;
    }

    let supportingWheelCount = 0;
    let velocityX = 0;
    let velocityZ = 0;
    for (const sample of samples) {
      if (
        sample.supportHandle === candidate.supportHandle &&
        Number.isFinite(sample.velocityX + sample.velocityZ)
      ) {
        supportingWheelCount += 1;
        velocityX += sample.velocityX;
        velocityZ += sample.velocityZ;
      }
    }
    if (
      supportingWheelCount >= minimumSupportingWheels &&
      (selected === null || supportingWheelCount > selected.supportingWheelCount)
    ) {
      selected = {
        supportHandle: candidate.supportHandle,
        supportingWheelCount,
        velocityX: velocityX / supportingWheelCount,
        velocityZ: velocityZ / supportingWheelCount,
      };
    }
  }
  return selected;
}

export class VehiclePhysicsAdapter {
  public readonly body: RigidBody;
  private readonly controller: DynamicRayCastVehicleController;
  private readonly previousWheels = createWheelStates();
  private readonly currentWheels = createWheelStates();
  private normalizedWheelOmega = 0;
  private localForwardSpeed = 0;
  private appliedEngineForce = 0;
  private appliedSteering = 0;
  private opposing = false;
  private recoveryEvents = 0;
  private lastRecoverySpeed = 0;
  private readonly passengerSupportSamples: KinematicSupportVelocitySample[] = [];
  private passengerSurfaceCorrectionEvents = 0;
  private lastPassengerSurfaceVelocityX = 0;
  private lastPassengerSurfaceVelocityZ = 0;
  private disposed = false;
  private readonly spawnPosition: { readonly x: number; readonly y: number; readonly z: number };
  private readonly spawnRotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };

  public constructor(
    private readonly rapier: RapierModule,
    private readonly world: World,
    spawnPosition: { readonly x: number; readonly y: number; readonly z: number } = VEHICLE_RUNTIME
      .recovery.spawnPosition,
    spawnRotation: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly w: number;
    } = VEHICLE_RUNTIME.recovery.spawnRotation,
  ) {
    this.spawnPosition = { ...spawnPosition };
    this.spawnRotation = { ...spawnRotation };
    const desc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z)
      .setRotation(spawnRotation)
      .setLinearDamping(VEHICLE_RUNTIME.chassis.linearDamping)
      .setAngularDamping(VEHICLE_RUNTIME.chassis.angularDamping)
      .setGravityScale(VEHICLE_RUNTIME.chassis.gravityScale)
      .setCcdEnabled(VEHICLE_RUNTIME.chassis.ccd)
      .setAdditionalMassProperties(
        VEHICLE_RUNTIME.chassis.mass,
        VEHICLE_RUNTIME.chassis.centerOfMass,
        VEHICLE_RUNTIME.chassis.principalAngularInertiaInitial,
        { x: 0, y: 0, z: 0, w: 1 },
      );
    this.body = world.createRigidBody(desc);

    const colliders = [
      rapier.ColliderDesc.cuboid(0.25, 0.095, 0.5).setTranslation(0, 0.083, 0),
      rapier.ColliderDesc.cuboid(0.25, 0.095, 0.22).setTranslation(0, 0.229, -0.138),
      rapier.ColliderDesc.cuboid(0.1234, 0.095, 0.34965).setTranslation(0, 0.009, 0),
      rapier.ColliderDesc.capsule(0.1, 0.075).setTranslation(0, 0.12, -0.442),
      rapier.ColliderDesc.capsule(0.1, 0.075).setTranslation(0, 0.12, 0.445),
    ];
    for (const collider of colliders) {
      collider
        .setDensity(0)
        .setFriction(0.8)
        .setRestitution(0.05)
        .setCollisionGroups(COLLISION_GROUPS.car);
      world.createCollider(collider, this.body);
    }

    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = VEHICLE_RUNTIME.axes.upIndex;
    this.controller.setIndexForwardAxis = VEHICLE_RUNTIME.axes.forwardIndex;

    for (const center of VEHICLE_SOURCE_REFERENCE.wheel.centers) {
      this.controller.addWheel(
        center,
        VEHICLE_RUNTIME.axes.suspensionDirection,
        VEHICLE_RUNTIME.axes.wheelAxle,
        VEHICLE_RUNTIME.wheel.suspensionRestLength,
        VEHICLE_RUNTIME.wheel.radius,
      );
    }

    for (const index of ALL_WHEELS) {
      this.controller.setWheelSuspensionRestLength(
        index,
        VEHICLE_RUNTIME.wheel.suspensionRestLength,
      );
      this.controller.setWheelMaxSuspensionTravel(index, VEHICLE_RUNTIME.wheel.maxSuspensionTravel);
      this.controller.setWheelSuspensionStiffness(
        index,
        VEHICLE_RUNTIME.wheel.suspensionStiffnessCalibrated,
      );
      this.controller.setWheelSuspensionCompression(
        index,
        VEHICLE_RUNTIME.wheel.suspensionCompressionCalibrated,
      );
      this.controller.setWheelSuspensionRelaxation(
        index,
        VEHICLE_RUNTIME.wheel.suspensionRelaxationCalibrated,
      );
      this.controller.setWheelMaxSuspensionForce(
        index,
        VEHICLE_RUNTIME.wheel.maxSuspensionForceInitial,
      );
      this.controller.setWheelFrictionSlip(index, VEHICLE_RUNTIME.wheel.frictionSlipInitial);
      this.controller.setWheelSideFrictionStiffness(
        index,
        VEHICLE_RUNTIME.wheel.sideFrictionStiffnessInitial,
      );
    }
  }

  public prepareFixedStep(input: LogicalAxes, fixedDeltaSeconds: number): void {
    for (const index of ALL_WHEELS) {
      const previous = this.previousWheels[index];
      const current = this.currentWheels[index];
      previous.suspensionLength = current.suspensionLength;
      previous.steering = current.steering;
      previous.rotation = current.rotation;
      previous.inContact = current.inContact;
    }

    this.localForwardSpeed = this.computeLocalForwardSpeed();
    const mapping = mapDriveForce(
      input.vertical,
      this.normalizedWheelOmega,
      this.localForwardSpeed,
    );
    this.appliedEngineForce = mapping.engineForce;
    this.opposing = mapping.opposing;
    this.appliedSteering = clampAxis(input.horizontal) * VEHICLE_RUNTIME.drive.maxSteeringRadians;

    for (const index of FRONT_WHEELS) {
      this.controller.setWheelEngineForce(index, this.appliedEngineForce);
      this.controller.setWheelSteering(index, this.appliedSteering);
      this.controller.setWheelBrake(index, 0);
    }
    for (const index of REAR_WHEELS) {
      this.controller.setWheelEngineForce(index, 0);
      this.controller.setWheelSteering(index, 0);
      this.controller.setWheelBrake(index, 0);
    }
    this.controller.updateVehicle(fixedDeltaSeconds, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    this.applyProfileBPassengerSurfaceCorrection(input.vertical);
  }

  public finishFixedStep(fixedDeltaSeconds: number): void {
    let omegaSum = 0;
    for (const index of ALL_WHEELS) {
      const state = this.currentWheels[index];
      const rotation = this.controller.wheelRotation(index) ?? state.rotation;
      state.suspensionLength =
        this.controller.wheelSuspensionLength(index) ?? VEHICLE_RUNTIME.wheel.suspensionRestLength;
      state.steering = this.controller.wheelSteering(index) ?? 0;
      state.rotation = rotation;
      state.inContact = this.controller.wheelIsInContact(index);
      if (index < 2) {
        // Axle +X requires negative physical spin for +Z travel. Normalize it so
        // positive omega means forward, matching the source hard-brake sign rule.
        omegaSum +=
          -shortestAngleDelta(this.previousWheels[index].rotation, rotation) / fixedDeltaSeconds;
      }
    }
    this.normalizedWheelOmega = omegaSum / FRONT_WHEELS.length;
    this.localForwardSpeed = this.computeLocalForwardSpeed();
  }

  public needsRecovery(): boolean {
    const position = this.body.translation();
    const velocity = this.body.linvel();
    return (
      position.y < VEHICLE_RUNTIME.recovery.minimumY ||
      !Number.isFinite(position.x + position.y + position.z) ||
      !Number.isFinite(velocity.x + velocity.y + velocity.z)
    );
  }

  public recover(): void {
    this.teleport(this.spawnPosition, this.spawnRotation, false);
    this.recoveryEvents += 1;
    this.lastRecoverySpeed = this.speed;
  }

  public recoverUpright(): void {
    const position = this.body.translation();
    const rotation = this.body.rotation();
    const yaw = Math.atan2(
      2 * (rotation.w * rotation.y + rotation.x * rotation.z),
      1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
    );
    const halfYaw = yaw / 2;
    this.teleport(
      { x: position.x, y: position.y + 0.5, z: position.z },
      { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) },
      false,
    );
  }

  public teleport(
    position: { readonly x: number; readonly y: number; readonly z: number },
    rotation: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly w: number;
    },
    preserveVelocity: boolean,
  ): void {
    this.body.setTranslation(position, true);
    this.body.setRotation(rotation, true);
    if (!preserveVelocity) {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.synchronizeAfterExternalTeleport();
  }

  public synchronizeAfterExternalTeleport(): void {
    this.normalizedWheelOmega = 0;
    this.localForwardSpeed = this.computeLocalForwardSpeed();
    for (const index of ALL_WHEELS) {
      Object.assign(this.previousWheels[index], createWheelState());
      Object.assign(this.currentWheels[index], createWheelState());
    }
  }

  public getWheelPose(index: number, alpha: number): WheelRenderPose {
    const safeIndex = Math.min(Math.max(Math.trunc(index), 0), ALL_WHEELS.length - 1) as WheelIndex;
    const previous = this.previousWheels[safeIndex];
    const current = this.currentWheels[safeIndex];
    const center = VEHICLE_SOURCE_REFERENCE.wheel.centers[safeIndex];
    const blend = Math.min(Math.max(alpha, 0), 1);
    const suspensionLength =
      previous.suspensionLength + (current.suspensionLength - previous.suspensionLength) * blend;
    return {
      x: center.x,
      y: center.y - suspensionLength,
      z: center.z,
      steering: previous.steering + (current.steering - previous.steering) * blend,
      rotation: previous.rotation + shortestAngleDelta(previous.rotation, current.rotation) * blend,
      inContact: current.inContact,
    };
  }

  public get speed(): number {
    const velocity = this.body.linvel();
    return Math.hypot(velocity.x, velocity.y, velocity.z);
  }

  public get forwardSpeed(): number {
    return this.localForwardSpeed;
  }

  public get wheelOmega(): number {
    return this.normalizedWheelOmega;
  }

  public get engineForce(): number {
    return this.appliedEngineForce;
  }

  public get steering(): number {
    return this.appliedSteering;
  }

  public get isHardBraking(): boolean {
    return this.opposing;
  }

  public get recoveryCount(): number {
    return this.recoveryEvents;
  }

  public get speedImmediatelyAfterRecovery(): number {
    return this.lastRecoverySpeed;
  }

  public get passengerSurfaceCorrectionCount(): number {
    return this.passengerSurfaceCorrectionEvents;
  }

  public get lastPassengerSurfaceVelocity(): { readonly x: number; readonly z: number } {
    return {
      x: this.lastPassengerSurfaceVelocityX,
      z: this.lastPassengerSurfaceVelocityZ,
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
  }

  private computeLocalForwardSpeed(): number {
    const rotation = this.body.rotation();
    const velocity = this.body.linvel();
    const forwardX = 2 * (rotation.x * rotation.z + rotation.w * rotation.y);
    const forwardY = 2 * (rotation.y * rotation.z - rotation.w * rotation.x);
    const forwardZ = 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y);
    // Rapier's controller applies positive engine force toward local -Z when
    // forward-axis index 2 is selected. Treat that direction consistently as
    // logical forward throughout gameplay and spawn-facing math.
    return -(velocity.x * forwardX + velocity.y * forwardY + velocity.z * forwardZ);
  }

  private applyProfileBPassengerSurfaceCorrection(verticalInput: number): void {
    const samples = this.passengerSupportSamples;
    samples.length = 0;
    for (const index of ALL_WHEELS) {
      const groundCollider = this.controller.wheelGroundObject(index);
      const supportBody = groundCollider?.parent();
      if (supportBody === null || supportBody === undefined || !supportBody.isKinematic()) {
        continue;
      }
      const contactPoint = this.controller.wheelContactPoint(index);
      const surfaceVelocity =
        contactPoint === null ? supportBody.linvel() : supportBody.velocityAtPoint(contactPoint);
      samples.push({
        supportHandle: supportBody.handle,
        velocityX: surfaceVelocity.x,
        velocityZ: surfaceVelocity.z,
      });
    }

    const correction = selectPassengerSurfaceCorrection(samples, verticalInput);
    if (correction === null) {
      return;
    }

    const velocity = this.body.linvel();
    const difference = Math.hypot(
      correction.velocityX - velocity.x,
      correction.velocityZ - velocity.z,
    );
    if (
      difference <= VEHICLE_RUNTIME.profileBPassengerSurfaceCorrection.velocityDifferenceEpsilon
    ) {
      return;
    }

    // Preserve vertical velocity and let Rapier's suspension/contact solver
    // remain solely responsible for lift motion and grounding.
    this.body.setLinvel(
      {
        x: correction.velocityX,
        y: velocity.y,
        z: correction.velocityZ,
      },
      true,
    );
    this.passengerSurfaceCorrectionEvents += 1;
    this.lastPassengerSurfaceVelocityX = correction.velocityX;
    this.lastPassengerSurfaceVelocityZ = correction.velocityZ;
  }
}
