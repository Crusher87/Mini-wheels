import type {
  Collider,
  DynamicRayCastVehicleController,
  RigidBody,
  World,
} from "@dimforge/rapier3d";
import type { LogicalAxes } from "../input/InputHub";
import { VEHICLE_SOURCE_REFERENCE } from "../config/source-reference";
import { VEHICLE_RUNTIME } from "../config/vehicle-runtime";
import {
  AUTHORED_SURFACE_PRESETS,
  type SurfaceContactFrame,
} from "../gameplay/vehicle/SurfaceContactSystem";
import type { TrackSurface } from "../maps/MapDocument";
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

export interface WheelContactPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AuthoredWallContact {
  readonly awayNormalX: number;
  readonly awayNormalZ: number;
  readonly penetrationDepth: number;
}

export interface AuthoredWallResponse {
  readonly separationX: number;
  readonly separationZ: number;
  readonly velocityX: number;
  readonly velocityZ: number;
}

export interface JumpLandingState {
  readonly airborneSeconds: number;
  readonly groundDistance: number | null;
  readonly verticalVelocity: number;
}

export const JUMP_LANDING_MINIMUM_AIRBORNE_SECONDS = 0.18;
export const JUMP_LANDING_MAXIMUM_GROUND_DISTANCE = 1.4;
const AUTHORED_WALL_CLEARANCE = 0.025;
const AUTHORED_WALL_MAXIMUM_SEPARATION = 0.2;
const AUTHORED_WALL_EXIT_SPEED = 0.35;

interface MutableWheelState {
  suspensionLength: number;
  steering: number;
  rotation: number;
  inContact: boolean;
}

function clampAxis(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, -1), 1) : 0;
}

function clampRange(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function authoredWallResponse(
  contact: AuthoredWallContact,
  velocityX: number,
  velocityZ: number,
): AuthoredWallResponse | null {
  const normalLength = Math.hypot(contact.awayNormalX, contact.awayNormalZ);
  if (
    !Number.isFinite(normalLength + contact.penetrationDepth + velocityX + velocityZ) ||
    normalLength < 0.001
  ) {
    return null;
  }
  const normalX = contact.awayNormalX / normalLength;
  const normalZ = contact.awayNormalZ / normalLength;
  const separation = clampRange(
    Math.max(0, contact.penetrationDepth) + AUTHORED_WALL_CLEARANCE,
    AUTHORED_WALL_CLEARANCE,
    AUTHORED_WALL_MAXIMUM_SEPARATION,
  );
  const outwardSpeed = velocityX * normalX + velocityZ * normalZ;
  const exitSpeed =
    outwardSpeed < AUTHORED_WALL_EXIT_SPEED ? AUTHORED_WALL_EXIT_SPEED : outwardSpeed;
  const speedCorrection = exitSpeed - outwardSpeed;
  return {
    separationX: normalX * separation,
    separationZ: normalZ * separation,
    velocityX: velocityX + normalX * speedCorrection,
    velocityZ: velocityZ + normalZ * speedCorrection,
  };
}

export function shouldAssistJumpLanding(state: JumpLandingState): boolean {
  return (
    Number.isFinite(state.airborneSeconds + state.verticalVelocity) &&
    state.airborneSeconds >= JUMP_LANDING_MINIMUM_AIRBORNE_SECONDS &&
    state.groundDistance !== null &&
    Number.isFinite(state.groundDistance) &&
    state.groundDistance <= JUMP_LANDING_MAXIMUM_GROUND_DISTANCE &&
    state.verticalVelocity <= 0.5
  );
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
  horizontalInput = 0,
): DriveMapping {
  const input = clampAxis(verticalInput);
  const steering = Math.abs(clampAxis(horizontalInput));
  const motionSignal =
    Math.abs(normalizedWheelOmega) > DIRECTION_EPSILON ? normalizedWheelOmega : localForwardSpeed;
  const opposing =
    Math.abs(input) > DIRECTION_EPSILON &&
    Math.abs(motionSignal) > DIRECTION_EPSILON &&
    Math.sign(input) !== Math.sign(motionSignal);
  const magnitude = opposing
    ? VEHICLE_RUNTIME.drive.frontOpposingForce
    : VEHICLE_RUNTIME.drive.frontEngineForce *
      (1 + steering * VEHICLE_RUNTIME.drive.corneringForceBoost);
  return { engineForce: input * magnitude, opposing };
}

export function mapSteeringRadians(horizontalInput: number, localForwardSpeed: number): number {
  const speed = Number.isFinite(localForwardSpeed) ? Math.abs(localForwardSpeed) : 0;
  const steeringRange =
    VEHICLE_RUNTIME.drive.minimumSteeringAtSpeed - VEHICLE_RUNTIME.drive.fullSteeringUntilSpeed;
  const highSpeedProgress =
    steeringRange > 0
      ? Math.min(
          1,
          Math.max(0, (speed - VEHICLE_RUNTIME.drive.fullSteeringUntilSpeed) / steeringRange),
        )
      : 1;
  const speedScale = 1 - highSpeedProgress * (1 - VEHICLE_RUNTIME.drive.highSpeedSteeringScale);
  return clampAxis(horizontalInput) * VEHICLE_RUNTIME.drive.maxSteeringRadians * speedScale;
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
  private readonly chassisColliders: Collider[] = [];
  private readonly controller: DynamicRayCastVehicleController;
  private readonly previousWheels = createWheelStates();
  private readonly currentWheels = createWheelStates();
  private normalizedWheelOmega = 0;
  private localForwardSpeed = 0;
  private appliedEngineForce = 0;
  private appliedSteering = 0;
  private brakePressed = false;
  private drifting = false;
  private rearDriftGripApplied = false;
  private driftEntryHorizontalSpeed = 0;
  private opposing = false;
  private recoveryEvents = 0;
  private lastRecoverySpeed = 0;
  private readonly passengerSupportSamples: KinematicSupportVelocitySample[] = [];
  private passengerSurfaceCorrectionEvents = 0;
  private lastPassengerSurfaceVelocityX = 0;
  private lastPassengerSurfaceVelocityZ = 0;
  private authoredWallStabilizationEvents = 0;
  private authoredWallSeparationEvents = 0;
  private jumpLandingAssistEvents = 0;
  private airborneSeconds = 0;
  private authoredSurface: TrackSurface | null = null;
  private authoredSurfaceFrictionSlipMultiplier = 1;
  private authoredSurfaceSideGripMultiplier = 1;
  private authoredBoostEvents = 0;
  private authoredBounceEvents = 0;
  private authoredHazardEvents = 0;
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
      this.chassisColliders.push(world.createCollider(collider, this.body));
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
      input.horizontal,
    );
    this.appliedEngineForce = mapping.engineForce;
    this.opposing = mapping.opposing;
    this.appliedSteering = mapSteeringRadians(input.horizontal, this.localForwardSpeed);
    this.brakePressed = input.brake;
    const wantsDrift =
      input.brake &&
      Math.abs(input.horizontal) >= VEHICLE_RUNTIME.drift.minimumSteeringInput &&
      REAR_WHEELS.some((index) => this.currentWheels[index].inContact);
    const driftSpeedThreshold = this.drifting
      ? VEHICLE_RUNTIME.drift.minimumExitSpeed
      : VEHICLE_RUNTIME.drift.minimumSpeed;
    const wasDrifting = this.drifting;
    this.drifting = wantsDrift && Math.abs(this.localForwardSpeed) >= driftSpeedThreshold;
    if (this.drifting && !wasDrifting) {
      const velocity = this.body.linvel();
      this.driftEntryHorizontalSpeed = Math.hypot(velocity.x, velocity.z);
    } else if (!this.drifting) {
      this.driftEntryHorizontalSpeed = 0;
    }
    this.setRearDriftGrip(this.drifting);
    if (this.drifting) {
      if (!this.opposing) {
        this.appliedEngineForce *= VEHICLE_RUNTIME.drift.driveForceMultiplier;
      }
      this.appliedSteering = Math.min(
        VEHICLE_RUNTIME.drive.maxSteeringRadians,
        Math.max(
          -VEHICLE_RUNTIME.drive.maxSteeringRadians,
          this.appliedSteering * VEHICLE_RUNTIME.drift.steeringMultiplier,
        ),
      );
    }
    const serviceBrake =
      this.brakePressed &&
      !this.drifting &&
      Math.abs(input.horizontal) < VEHICLE_RUNTIME.drift.minimumSteeringInput;

    for (const index of FRONT_WHEELS) {
      // The authored car's nose and front axle are local +Z. Rapier's +X axle
      // convention requires negative physical force/steering for semantic
      // forward/right input, so translate signs only at this boundary.
      this.controller.setWheelEngineForce(index, -this.appliedEngineForce);
      this.controller.setWheelSteering(index, -this.appliedSteering);
      this.controller.setWheelBrake(
        index,
        serviceBrake ? VEHICLE_RUNTIME.drift.serviceBrakeForce : 0,
      );
    }
    for (const index of REAR_WHEELS) {
      this.controller.setWheelEngineForce(index, 0);
      this.controller.setWheelSteering(index, 0);
      this.controller.setWheelBrake(
        index,
        this.drifting
          ? VEHICLE_RUNTIME.drift.rearBrakeForce
          : serviceBrake
            ? VEHICLE_RUNTIME.drift.serviceBrakeForce
            : 0,
      );
    }
    this.controller.updateVehicle(fixedDeltaSeconds, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    this.applyProfileBPassengerSurfaceCorrection(input.vertical);
  }

  public applyAuthoredSurfaceContact(frame: SurfaceContactFrame, fixedDeltaSeconds: number): void {
    this.authoredSurface = frame.dominantSurface;
    this.setAuthoredSurfaceGrip(frame.frictionSlipMultiplier, frame.sideGripMultiplier);

    if (frame.slowStrength > 0) {
      const velocity = this.body.linvel();
      const damping = Math.exp(
        -AUTHORED_SURFACE_PRESETS.slow.dampingPerSecond * frame.slowStrength * fixedDeltaSeconds,
      );
      this.body.setLinvel(
        { x: velocity.x * damping, y: velocity.y, z: velocity.z * damping },
        true,
      );
    }
    if (frame.triggerBoost) {
      this.applyAuthoredBoost(frame.boostStrength);
      this.authoredBoostEvents += 1;
    }
    if (frame.triggerBounce) {
      const velocity = this.body.linvel();
      this.body.setLinvel(
        {
          x: velocity.x,
          y: Math.max(
            velocity.y,
            AUTHORED_SURFACE_PRESETS.bouncy.minimumVerticalSpeed * frame.bounceStrength,
          ),
          z: velocity.z,
        },
        true,
      );
      this.authoredBounceEvents += 1;
    }
    if (frame.triggerHazard) {
      const velocity = this.body.linvel();
      const angularVelocity = this.body.angvel();
      const speedMultiplier = clampRange(
        1 - (1 - AUTHORED_SURFACE_PRESETS.hazard.speedMultiplier) * frame.hazardStrength,
        0.1,
        1,
      );
      this.body.setLinvel(
        {
          x: velocity.x * speedMultiplier,
          y: Math.min(velocity.y, 0.5),
          z: velocity.z * speedMultiplier,
        },
        true,
      );
      this.body.setAngvel(
        {
          x: angularVelocity.x * 0.25,
          y: clampRange(
            angularVelocity.y + AUTHORED_SURFACE_PRESETS.hazard.yawImpulse * frame.hazardStrength,
            -6,
            6,
          ),
          z: angularVelocity.z * 0.25,
        },
        true,
      );
      this.authoredHazardEvents += 1;
    }
  }

  public clearAuthoredSurfaceEffects(): void {
    this.authoredSurface = null;
    this.setAuthoredSurfaceGrip(1, 1);
  }

  public setRecoveryCollisionProtection(enabled: boolean): void {
    const collisionGroups = enabled ? COLLISION_GROUPS.protectedCar : COLLISION_GROUPS.car;
    for (const collider of this.chassisColliders) {
      collider.setCollisionGroups(collisionGroups);
    }
  }

  public getWheelGroundColliderHandles(): readonly (number | null)[] {
    return ALL_WHEELS.map((index) => {
      if (!this.controller.wheelIsInContact(index)) {
        return null;
      }
      return this.controller.wheelGroundObject(index)?.handle ?? null;
    });
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
        // Axle +X produces positive physical spin for logical local +Z travel.
        // Preserve the semantic convention that positive omega means forward.
        omegaSum +=
          shortestAngleDelta(this.previousWheels[index].rotation, rotation) / fixedDeltaSeconds;
      }
    }
    this.normalizedWheelOmega = omegaSum / FRONT_WHEELS.length;
    this.airborneSeconds =
      this.supportingWheelCount === 0 ? this.airborneSeconds + fixedDeltaSeconds : 0;
    this.preserveDriftMomentum();
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

  public recoverTo(
    position: { readonly x: number; readonly y: number; readonly z: number },
    rotation: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly w: number;
    },
  ): void {
    this.teleport(position, rotation, false);
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

  public resolveAuthoredWallContact(contact: AuthoredWallContact): boolean {
    const position = this.body.translation();
    const velocity = this.body.linvel();
    const response = authoredWallResponse(contact, velocity.x, velocity.z);
    if (response === null) {
      return false;
    }
    this.body.setTranslation(
      {
        x: position.x + response.separationX,
        y: position.y,
        z: position.z + response.separationZ,
      },
      true,
    );
    this.body.setLinvel(
      { x: response.velocityX, y: Math.min(velocity.y, 1), z: response.velocityZ },
      true,
    );
    this.authoredWallSeparationEvents += 1;

    // Suppress rail-created lift and violent roll, but preserve the current
    // orientation. In particular, a wall touch never snaps an airborne car
    // upright.
    const angularVelocity = this.body.angvel();
    this.body.setAngvel(
      {
        x: clampRange(angularVelocity.x, -4, 4),
        y: clampRange(angularVelocity.y, -4, 4),
        z: clampRange(angularVelocity.z, -4, 4),
      },
      true,
    );
    if (this.supportingWheelCount > 0) {
      this.authoredWallStabilizationEvents += 1;
    }
    return true;
  }

  public assistJumpLanding(groundDistance: number | null): boolean {
    const rotation = this.body.rotation();
    const upX = 2 * (rotation.x * rotation.y - rotation.z * rotation.w);
    const upZ = 2 * (rotation.y * rotation.z + rotation.x * rotation.w);
    const velocity = this.body.linvel();
    if (
      !shouldAssistJumpLanding({
        airborneSeconds: this.airborneSeconds,
        groundDistance,
        verticalVelocity: velocity.y,
      })
    ) {
      return false;
    }
    const yaw = Math.atan2(
      2 * (rotation.w * rotation.y + rotation.x * rotation.z),
      1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
    );
    const halfYaw = yaw / 2;
    const target = { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) };
    const targetScale =
      rotation.x * target.x +
        rotation.y * target.y +
        rotation.z * target.z +
        rotation.w * target.w <
      0
        ? -1
        : 1;
    const blend = 0.12;
    const next = {
      x: rotation.x * (1 - blend) + target.x * targetScale * blend,
      y: rotation.y * (1 - blend) + target.y * targetScale * blend,
      z: rotation.z * (1 - blend) + target.z * targetScale * blend,
      w: rotation.w * (1 - blend) + target.w * targetScale * blend,
    };
    const inverseLength = 1 / Math.hypot(next.x, next.y, next.z, next.w);
    this.body.setRotation(
      {
        x: next.x * inverseLength,
        y: next.y * inverseLength,
        z: next.z * inverseLength,
        w: next.w * inverseLength,
      },
      true,
    );
    const angularVelocity = this.body.angvel();
    this.body.setAngvel(
      {
        x: clampRange(angularVelocity.x * 0.5 - upZ * 3.5, -3.5, 3.5),
        y: clampRange(angularVelocity.y, -4, 4),
        z: clampRange(angularVelocity.z * 0.5 + upX * 3.5, -3.5, 3.5),
      },
      true,
    );
    this.jumpLandingAssistEvents += 1;
    return true;
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
    this.brakePressed = false;
    this.drifting = false;
    this.driftEntryHorizontalSpeed = 0;
    this.airborneSeconds = 0;
    this.setRearDriftGrip(false);
    this.clearAuthoredSurfaceEffects();
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

  public getRearWheelContactPoints(): readonly WheelContactPoint[] {
    const points: WheelContactPoint[] = [];
    for (const index of REAR_WHEELS) {
      if (!this.currentWheels[index].inContact) {
        continue;
      }
      const point = this.controller.wheelContactPoint(index);
      if (point !== null) {
        points.push({ x: point.x, y: point.y, z: point.z });
      }
    }
    return points;
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

  public get isBraking(): boolean {
    return this.brakePressed;
  }

  public get isDrifting(): boolean {
    return this.drifting;
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

  public get authoredWallStabilizationCount(): number {
    return this.authoredWallStabilizationEvents;
  }

  public get authoredWallSeparationCount(): number {
    return this.authoredWallSeparationEvents;
  }

  public get jumpLandingAssistCount(): number {
    return this.jumpLandingAssistEvents;
  }

  public get currentAirborneSeconds(): number {
    return this.airborneSeconds;
  }

  public get currentAuthoredSurface(): TrackSurface | null {
    return this.authoredSurface;
  }

  public get authoredBoostCount(): number {
    return this.authoredBoostEvents;
  }

  public get authoredBounceCount(): number {
    return this.authoredBounceEvents;
  }

  public get authoredHazardCount(): number {
    return this.authoredHazardEvents;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
  }

  private get supportingWheelCount(): number {
    return ALL_WHEELS.reduce<number>(
      (count, index) => count + (this.controller.wheelIsInContact(index) ? 1 : 0),
      0,
    );
  }

  private computeLocalForwardSpeed(): number {
    const rotation = this.body.rotation();
    const velocity = this.body.linvel();
    const forwardX = 2 * (rotation.x * rotation.z + rotation.w * rotation.y);
    const forwardY = 2 * (rotation.y * rotation.z - rotation.w * rotation.x);
    const forwardZ = 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y);
    // The visual nose, front axle and spawn-facing convention all use local
    // +Z, so positive telemetry consistently means visible forward travel.
    return velocity.x * forwardX + velocity.y * forwardY + velocity.z * forwardZ;
  }

  private preserveDriftMomentum(): void {
    if (!this.drifting || this.driftEntryHorizontalSpeed <= 0) {
      return;
    }
    const velocity = this.body.linvel();
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const minimumSpeed =
      this.driftEntryHorizontalSpeed * VEHICLE_RUNTIME.drift.minimumMomentumRetention;
    if (horizontalSpeed >= minimumSpeed || horizontalSpeed <= 0.001) {
      return;
    }
    const scale = minimumSpeed / horizontalSpeed;
    this.body.setLinvel(
      {
        x: velocity.x * scale,
        y: velocity.y,
        z: velocity.z * scale,
      },
      true,
    );
  }

  private setRearDriftGrip(enabled: boolean): void {
    if (enabled === this.rearDriftGripApplied) {
      return;
    }
    this.rearDriftGripApplied = enabled;
    this.applyWheelGrip();
  }

  private setAuthoredSurfaceGrip(frictionSlipMultiplier: number, sideGripMultiplier: number): void {
    if (
      Math.abs(this.authoredSurfaceFrictionSlipMultiplier - frictionSlipMultiplier) < 0.0001 &&
      Math.abs(this.authoredSurfaceSideGripMultiplier - sideGripMultiplier) < 0.0001
    ) {
      return;
    }
    this.authoredSurfaceFrictionSlipMultiplier = frictionSlipMultiplier;
    this.authoredSurfaceSideGripMultiplier = sideGripMultiplier;
    this.applyWheelGrip();
  }

  private applyWheelGrip(): void {
    for (const index of ALL_WHEELS) {
      this.controller.setWheelFrictionSlip(
        index,
        VEHICLE_RUNTIME.wheel.frictionSlipInitial * this.authoredSurfaceFrictionSlipMultiplier,
      );
      const baseSideGrip =
        this.rearDriftGripApplied && REAR_WHEELS.includes(index as 2 | 3)
          ? VEHICLE_RUNTIME.drift.rearSideFrictionStiffness
          : VEHICLE_RUNTIME.wheel.sideFrictionStiffnessInitial;
      this.controller.setWheelSideFrictionStiffness(
        index,
        baseSideGrip * this.authoredSurfaceSideGripMultiplier,
      );
    }
  }

  private applyAuthoredBoost(strength: number): void {
    const rotation = this.body.rotation();
    let forwardX = 2 * (rotation.x * rotation.z + rotation.w * rotation.y);
    let forwardZ = 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y);
    const horizontalLength = Math.hypot(forwardX, forwardZ);
    if (horizontalLength <= 0.001) {
      forwardX = 0;
      forwardZ = 1;
    } else {
      forwardX /= horizontalLength;
      forwardZ /= horizontalLength;
    }
    const velocity = this.body.linvel();
    this.body.setLinvel(
      {
        x: velocity.x + forwardX * AUTHORED_SURFACE_PRESETS.boost.deltaSpeed * strength,
        y: velocity.y,
        z: velocity.z + forwardZ * AUTHORED_SURFACE_PRESETS.boost.deltaSpeed * strength,
      },
      true,
    );
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
