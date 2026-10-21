import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import type { ColorRepresentation, Material, Object3D } from "three";
import type { RigidBody, World } from "@dimforge/rapier3d";
import {
  SANDBOX_MOVER_SOURCE_REFERENCE,
  type MovingPlatformId,
  type MovingPlatformSource,
  type RotatingBarId,
  type RotatingBarSource,
  type RotatingBarSpeedProfile,
} from "../../config/sandbox-movers";
import type { RapierModule } from "../../physics/rapier-init";
import { COLLISION_GROUPS } from "../../physics/CollisionGroups";
import { PhysicsRenderBinding } from "../PhysicsRenderBinding";
import {
  TAU,
  degreesToRadians,
  platformProgressAtTime,
  positiveModulo,
  rotatingBarDegreesPerSecond,
  rotatingBarYawAtTime,
  writePlatformPositionAtTime,
  type MutableVector3,
  type PlatformMotionPhase,
} from "./moverMath";

export interface KinematicMoverSystemOptions {
  readonly enabled?: boolean;
  readonly rotatingBars?: readonly RotatingBarSource[];
  readonly movingPlatforms?: readonly MovingPlatformSource[];
  readonly barSpeedProfile?: RotatingBarSpeedProfile;
  readonly barColor?: ColorRepresentation;
  readonly platformColor?: ColorRepresentation;
  readonly colliderFriction?: number;
}

export interface MoverTransformDebugSnapshot {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly rotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
}

export interface RotatingBarDebugSnapshot extends MoverTransformDebugSnapshot {
  readonly id: RotatingBarId;
  readonly yawRadians: number;
  readonly degreesPerSecond: number;
}

export interface MovingPlatformDebugSnapshot extends MoverTransformDebugSnapshot {
  readonly id: MovingPlatformId;
  readonly phase: PlatformMotionPhase;
}

export interface KinematicMoverDebugSnapshot {
  readonly simulationTimeSeconds: number;
  readonly barSpeedProfile: RotatingBarSpeedProfile;
  readonly rotatingBars: readonly RotatingBarDebugSnapshot[];
  readonly movingPlatforms: readonly MovingPlatformDebugSnapshot[];
}

interface MutableRotation {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface RotatingBarRuntime {
  readonly source: RotatingBarSource;
  readonly body: RigidBody;
  readonly mesh: Mesh;
  readonly binding: PhysicsRenderBinding;
  readonly nextRotation: MutableRotation;
  /** False until a WHEN → DO link first commands this bar; until then it follows absolute time. */
  controlled: boolean;
  running: boolean;
  direction: 1 | -1;
  controlYawRadians: number;
}

type PlatformControlMode = "automatic" | "opening" | "closing" | "stopped";

interface MovingPlatformRuntime {
  readonly source: MovingPlatformSource;
  readonly body: RigidBody;
  readonly mesh: Mesh;
  readonly binding: PhysicsRenderBinding;
  readonly nextPosition: MutableVector3;
  phase: PlatformMotionPhase;
  controlTimeSeconds: number;
  controlMode: PlatformControlMode;
  /** Automatic cycle time is simulation time minus this, so a resumed cycle continues in place. */
  automaticOffsetSeconds: number;
  /** Mode to restore when a disabled mover is enabled again. */
  pausedMode: PlatformControlMode | null;
}

/**
 * Owns the two authored rotating bars and two authored moving platforms.
 *
 * Call `beforePhysicsStep()` with the absolute time at the end of the upcoming
 * fixed step, step Rapier once, then call `afterPhysicsStep()`. Render
 * interpolation is independent and never advances mover phase.
 */
export class KinematicMoverSystem {
  public readonly root = new Group();

  private readonly rotatingBars: RotatingBarRuntime[] = [];
  private readonly movingPlatforms: MovingPlatformRuntime[] = [];
  private readonly geometries: BoxGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly barSpeedProfile: RotatingBarSpeedProfile;
  private readonly colliderFriction: number;
  private preparedSimulationTimeSeconds = 0;
  private currentSimulationTimeSeconds = 0;
  private stepPrepared = false;
  private disposed = false;

  public constructor(
    private readonly rapier: RapierModule,
    private readonly world: World,
    private readonly sceneRoot: Object3D,
    options: KinematicMoverSystemOptions = {},
  ) {
    this.barSpeedProfile = options.barSpeedProfile ?? "legacy";
    this.colliderFriction = options.colliderFriction ?? 1;
    if (!Number.isFinite(this.colliderFriction) || this.colliderFriction < 0) {
      throw new RangeError("Mover collider friction must be finite and non-negative.");
    }

    this.root.name = "kinematic-movers";
    this.sceneRoot.add(this.root);
    const rotatingBarSources =
      options.rotatingBars ??
      (options.enabled === false ? [] : SANDBOX_MOVER_SOURCE_REFERENCE.rotatingBars);
    const movingPlatformSources =
      options.movingPlatforms ??
      (options.enabled === false ? [] : SANDBOX_MOVER_SOURCE_REFERENCE.movingPlatforms);
    if (rotatingBarSources.length === 0 && movingPlatformSources.length === 0) {
      return;
    }

    const unitGeometry = new BoxGeometry(1, 1, 1);
    const barMaterial = new MeshStandardMaterial({
      color: options.barColor ?? 0x4d9b62,
      metalness: 0,
      roughness: 0.8,
    });
    const platformMaterial = new MeshStandardMaterial({
      color: options.platformColor ?? 0x71aa73,
      metalness: 0,
      roughness: 0.82,
    });
    this.geometries.push(unitGeometry);
    this.materials.push(barMaterial, platformMaterial);

    for (const source of rotatingBarSources) {
      this.rotatingBars.push(this.createRotatingBar(source, unitGeometry, barMaterial));
    }
    for (const source of movingPlatformSources) {
      this.movingPlatforms.push(this.createMovingPlatform(source, unitGeometry, platformMaterial));
    }
  }

  public get rigidBodyCount(): number {
    return this.rotatingBars.length + this.movingPlatforms.length;
  }

  public beforePhysicsStep(nextSimulationTimeSeconds: number): void {
    this.assertUsable();
    if (!Number.isFinite(nextSimulationTimeSeconds) || nextSimulationTimeSeconds < 0) {
      throw new RangeError("Simulation time must be finite and non-negative.");
    }
    if (this.stepPrepared) {
      throw new Error("afterPhysicsStep() must follow each beforePhysicsStep() call.");
    }

    const deltaSeconds = Math.max(0, nextSimulationTimeSeconds - this.currentSimulationTimeSeconds);
    for (const bar of this.rotatingBars) {
      bar.binding.beginFixedStep();
      let yaw: number;
      if (!bar.controlled) {
        yaw = rotatingBarYawAtTime(bar.source, nextSimulationTimeSeconds, this.barSpeedProfile);
      } else {
        if (bar.running) {
          bar.controlYawRadians = positiveModulo(
            bar.controlYawRadians +
              bar.direction *
                degreesToRadians(rotatingBarDegreesPerSecond(bar.source, this.barSpeedProfile)) *
                deltaSeconds,
            TAU,
          );
        }
        yaw = bar.controlYawRadians;
      }
      writeYawQuaternion(yaw, bar.nextRotation);
      bar.body.setNextKinematicRotation(bar.nextRotation);
    }

    for (const platform of this.movingPlatforms) {
      platform.binding.beginFixedStep();
      let motionTimeSeconds = Math.max(
        0,
        nextSimulationTimeSeconds - platform.automaticOffsetSeconds,
      );
      if (platform.controlMode !== "automatic") {
        if (platform.controlMode === "opening") {
          platform.controlTimeSeconds = Math.min(
            platform.source.authoredOneWayTravelSeconds,
            platform.controlTimeSeconds + deltaSeconds,
          );
          if (platform.controlTimeSeconds >= platform.source.authoredOneWayTravelSeconds - 1e-9) {
            platform.controlMode = "stopped";
          }
        } else if (platform.controlMode === "closing") {
          platform.controlTimeSeconds = Math.max(0, platform.controlTimeSeconds - deltaSeconds);
          if (platform.controlTimeSeconds <= 1e-9) {
            platform.controlMode = "stopped";
          }
        }
        motionTimeSeconds = platform.controlTimeSeconds;
      }
      platform.phase = writePlatformPositionAtTime(
        platform.source,
        motionTimeSeconds,
        platform.nextPosition,
      );
      platform.body.setNextKinematicTranslation(platform.nextPosition);
    }

    this.preparedSimulationTimeSeconds = nextSimulationTimeSeconds;
    this.stepPrepared = true;
  }

  public afterPhysicsStep(): void {
    this.assertUsable();
    if (!this.stepPrepared) {
      throw new Error("beforePhysicsStep() must be called before afterPhysicsStep().");
    }
    for (const bar of this.rotatingBars) {
      bar.binding.captureAfterFixedStep();
    }
    for (const platform of this.movingPlatforms) {
      platform.binding.captureAfterFixedStep();
    }
    this.currentSimulationTimeSeconds = this.preparedSimulationTimeSeconds;
    this.stepPrepared = false;
  }

  public render(alpha: number): void {
    if (this.disposed) {
      return;
    }
    for (const bar of this.rotatingBars) {
      bar.binding.apply(alpha);
    }
    for (const platform of this.movingPlatforms) {
      platform.binding.apply(alpha);
    }
  }

  /**
   * Teleports every mover to the exact phase represented by the supplied
   * absolute time. Sandbox Reset should call this with zero.
   */
  public reset(simulationTimeSeconds = 0): void {
    this.assertUsable();
    if (!Number.isFinite(simulationTimeSeconds) || simulationTimeSeconds < 0) {
      throw new RangeError("Simulation time must be finite and non-negative.");
    }

    for (const bar of this.rotatingBars) {
      const yaw = rotatingBarYawAtTime(bar.source, simulationTimeSeconds, this.barSpeedProfile);
      bar.controlled = false;
      bar.running = true;
      bar.direction = 1;
      bar.controlYawRadians = yaw;
      writeYawQuaternion(yaw, bar.nextRotation);
      bar.body.setRotation(bar.nextRotation, false);
      bar.body.setNextKinematicRotation(bar.nextRotation);
      bar.body.setLinvel(ZERO_VECTOR, false);
      bar.body.setAngvel(ZERO_VECTOR, false);
      bar.binding.teleportToBody();
    }

    for (const platform of this.movingPlatforms) {
      platform.controlTimeSeconds = 0;
      platform.automaticOffsetSeconds = 0;
      platform.pausedMode = null;
      platform.controlMode = platform.source.initiallyStopped === true ? "stopped" : "automatic";
      platform.phase = writePlatformPositionAtTime(
        platform.source,
        platform.controlMode === "automatic" ? simulationTimeSeconds : 0,
        platform.nextPosition,
      );
      platform.body.setTranslation(platform.nextPosition, false);
      platform.body.setNextKinematicTranslation(platform.nextPosition);
      platform.body.setLinvel(ZERO_VECTOR, false);
      platform.body.setAngvel(ZERO_VECTOR, false);
      platform.binding.teleportToBody();
    }

    this.preparedSimulationTimeSeconds = simulationTimeSeconds;
    this.currentSimulationTimeSeconds = simulationTimeSeconds;
    this.stepPrepared = false;
  }

  public commandMovingPlatform(
    id: string,
    action:
      "open" | "close" | "toggle" | "start" | "stop" | "reverse" | "reset" | "enable" | "disable",
  ): boolean {
    this.assertUsable();
    const platform = this.movingPlatforms.find((candidate) => candidate.source.id === id);
    if (platform === undefined) {
      return false;
    }
    if (action === "enable") {
      // Re-enabling resumes whatever the mover was doing when it was disabled.
      const resumeMode = platform.pausedMode;
      platform.pausedMode = null;
      if (resumeMode !== null && platform.controlMode === "stopped") {
        this.setPlatformMode(platform, resumeMode);
      }
      return true;
    }
    if (action === "disable") {
      if (platform.pausedMode === null) {
        platform.pausedMode = platform.controlMode;
      }
      this.setPlatformMode(platform, "stopped");
      return true;
    }
    platform.pausedMode = null;
    if (action === "reset") {
      platform.controlTimeSeconds = 0;
      platform.automaticOffsetSeconds = 0;
      platform.controlMode = platform.source.initiallyStopped === true ? "stopped" : "automatic";
    } else if (action === "stop") {
      this.setPlatformMode(platform, "stopped");
    } else if (action === "open" || action === "start") {
      this.setPlatformMode(
        platform,
        platform.source.initiallyStopped === true ? "opening" : "automatic",
      );
    } else if (action === "close") {
      this.setPlatformMode(platform, "closing");
    } else if (action === "toggle") {
      this.setPlatformMode(
        platform,
        this.platformProgress(platform) >= platform.source.authoredOneWayTravelSeconds / 2
          ? "closing"
          : "opening",
      );
    } else {
      const heading =
        platform.controlMode === "automatic"
          ? platform.phase === "travel-a-to-b" || platform.phase === "hold-at-b"
            ? "opening"
            : "closing"
          : platform.controlMode;
      this.setPlatformMode(platform, heading === "opening" ? "closing" : "opening");
    }
    return true;
  }

  /**
   * Starts, stops or reverses a rotating bar from a WHEN → DO link. Commanded
   * bars continue from their current angle instead of snapping.
   */
  public commandRotatingBar(
    id: string,
    action: "start" | "stop" | "reverse" | "reset" | "enable" | "disable",
  ): boolean {
    this.assertUsable();
    const bar = this.rotatingBars.find((candidate) => candidate.source.id === id);
    if (bar === undefined) {
      return false;
    }
    if (!bar.controlled) {
      bar.controlled = true;
      bar.running = true;
      bar.direction = 1;
      bar.controlYawRadians = rotatingBarYawAtTime(
        bar.source,
        this.currentSimulationTimeSeconds,
        this.barSpeedProfile,
      );
    }
    if (action === "start" || action === "enable") {
      bar.running = true;
    } else if (action === "stop" || action === "disable") {
      bar.running = false;
    } else if (action === "reverse") {
      bar.direction = bar.direction === 1 ? -1 : 1;
    } else {
      bar.running = true;
      bar.direction = 1;
    }
    return true;
  }

  /** Current one-way progress from A toward B, in seconds of travel. */
  private platformProgress(platform: MovingPlatformRuntime): number {
    return platform.controlMode === "automatic"
      ? platformProgressAtTime(
          platform.source,
          Math.max(0, this.currentSimulationTimeSeconds - platform.automaticOffsetSeconds),
        )
      : platform.controlTimeSeconds;
  }

  /** Changes mode while keeping the platform exactly where it is. */
  private setPlatformMode(platform: MovingPlatformRuntime, mode: PlatformControlMode): void {
    if (platform.controlMode === mode) {
      return;
    }
    const progress = this.platformProgress(platform);
    if (mode === "automatic") {
      // On the A→B leg, cycle time equals progress, so resume the cycle from here.
      platform.automaticOffsetSeconds = this.currentSimulationTimeSeconds - progress;
    } else {
      platform.controlTimeSeconds = progress;
    }
    platform.controlMode = mode;
  }

  public debugSnapshot(): KinematicMoverDebugSnapshot {
    this.assertUsable();
    return {
      simulationTimeSeconds: this.currentSimulationTimeSeconds,
      barSpeedProfile: this.barSpeedProfile,
      rotatingBars: this.rotatingBars.map((bar) => {
        const transform = readBodyTransform(bar.body);
        return {
          id: bar.source.id,
          yawRadians: rotatingBarYawAtTime(
            bar.source,
            this.currentSimulationTimeSeconds,
            this.barSpeedProfile,
          ),
          degreesPerSecond:
            this.barSpeedProfile === "legacy"
              ? bar.source.legacyDegreesPerSecond
              : bar.source.recommendedDegreesPerSecond,
          ...transform,
        };
      }),
      movingPlatforms: this.movingPlatforms.map((platform) => ({
        id: platform.source.id,
        phase: platform.phase,
        ...readBodyTransform(platform.body),
      })),
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stepPrepared = false;

    for (const bar of this.rotatingBars) {
      this.world.removeRigidBody(bar.body);
    }
    for (const platform of this.movingPlatforms) {
      this.world.removeRigidBody(platform.body);
    }
    this.rotatingBars.length = 0;
    this.movingPlatforms.length = 0;

    this.sceneRoot.remove(this.root);
    this.root.clear();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    this.geometries.length = 0;
    this.materials.length = 0;
  }

  private createRotatingBar(
    source: RotatingBarSource,
    geometry: BoxGeometry,
    material: Material,
  ): RotatingBarRuntime {
    const yaw = rotatingBarYawAtTime(source, 0, this.barSpeedProfile);
    const nextRotation: MutableRotation = { x: 0, y: 0, z: 0, w: 1 };
    writeYawQuaternion(yaw, nextRotation);
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(source.position.x, source.position.y, source.position.z)
        .setRotation(nextRotation),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(source.scale.x / 2, source.scale.y / 2, source.scale.z / 2)
        .setFriction(this.colliderFriction)
        .setCollisionGroups(COLLISION_GROUPS.movingObstacle),
      body,
    );

    const appliedMaterial = this.sourceMaterial(source.color, material, 0.8);
    const mesh = new Mesh(geometry, appliedMaterial);
    mesh.name = source.id;
    mesh.scale.set(source.scale.x, source.scale.y, source.scale.z);
    configureShadowMesh(mesh);
    this.root.add(mesh);
    return {
      source,
      body,
      mesh,
      binding: new PhysicsRenderBinding(body, mesh),
      nextRotation,
      controlled: false,
      running: true,
      direction: 1,
      controlYawRadians: yaw,
    };
  }

  private createMovingPlatform(
    source: MovingPlatformSource,
    geometry: BoxGeometry,
    material: Material,
  ): MovingPlatformRuntime {
    const nextPosition: MutableVector3 = { x: 0, y: 0, z: 0 };
    const phase = writePlatformPositionAtTime(source, 0, nextPosition);
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(nextPosition.x, nextPosition.y, nextPosition.z)
        .setRotation(source.rotation ?? { x: 0, y: 0, z: 0, w: 1 }),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(source.size.x / 2, source.size.y / 2, source.size.z / 2)
        .setFriction(this.colliderFriction)
        .setCollisionGroups(COLLISION_GROUPS.movingObstacle),
      body,
    );

    const appliedMaterial = this.sourceMaterial(source.color, material, 0.82);
    const mesh = new Mesh(geometry, appliedMaterial);
    mesh.name = source.id;
    mesh.scale.set(source.size.x, source.size.y, source.size.z);
    configureShadowMesh(mesh);
    this.root.add(mesh);
    return {
      source,
      body,
      mesh,
      binding: new PhysicsRenderBinding(body, mesh),
      nextPosition,
      phase,
      controlTimeSeconds: 0,
      controlMode: source.initiallyStopped === true ? "stopped" : "automatic",
      automaticOffsetSeconds: 0,
      pausedMode: null,
    };
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("KinematicMoverSystem has been disposed.");
    }
  }

  private sourceMaterial(
    color: string | number | undefined,
    fallback: Material,
    roughness: number,
  ): Material {
    if (color === undefined) {
      return fallback;
    }
    const material = new MeshStandardMaterial({ color, metalness: 0, roughness });
    this.materials.push(material);
    return material;
  }
}

const ZERO_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });

function writeYawQuaternion(yawRadians: number, output: MutableRotation): void {
  const halfYaw = yawRadians / 2;
  output.x = 0;
  output.y = Math.sin(halfYaw);
  output.z = 0;
  output.w = Math.cos(halfYaw);
}

function configureShadowMesh(mesh: Mesh): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function readBodyTransform(body: RigidBody): MoverTransformDebugSnapshot {
  const position = body.translation();
  const rotation = body.rotation();
  return {
    position: { x: position.x, y: position.y, z: position.z },
    rotation: {
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    },
  };
}
