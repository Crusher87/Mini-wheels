import { DirectionalLight, Group, HemisphereLight } from "three";
import type { OrthographicCamera, Scene } from "three";
import type { RapierModule } from "../physics/rapier-init";
import { SIMULATION_CONFIG } from "../config/runtime-defaults";
import type { LogicalAxes } from "../input/InputHub";
import type { CameraSmoothing, MarkerSize, ParticleDensity } from "../persistence/schema";
import { VehicleEntity, type VehicleTelemetry } from "../gameplay/vehicle/VehicleEntity";
import { PlayerRoster } from "../gameplay/player/PlayerRoster";
import { PlayerVehicleSpawner } from "../gameplay/vehicle/PlayerVehicleSpawner";
import {
  BoosterPadSystem,
  type BoosterPadDebugSnapshot,
} from "../gameplay/interactables/BoosterPadSystem";
import {
  PortalSystem,
  type PortalSystemDebugSnapshot,
} from "../gameplay/interactables/PortalSystem";
import { GroupCameraController } from "../render/GroupCameraController";
import { DomMarkerSystem } from "../render/DomMarkerSystem";
import { ParticlePool, type ParticlePoolDebugSnapshot } from "../render/ParticlePool";
import {
  KinematicMoverSystem,
  type KinematicMoverDebugSnapshot,
} from "./movers/KinematicMoverSystem";
import { SandboxArena, type SandboxArenaDebugSnapshot } from "./SandboxArena";

export interface CameraDebugSnapshot {
  readonly halfHeight: number;
  readonly targetCount: number;
  readonly center: { readonly x: number; readonly y: number; readonly z: number };
}

export interface WorldDebugSnapshot {
  readonly rigidBodyCount: number;
  readonly colliderCount: number;
  readonly awakeRigidBodyCount: number;
  readonly sessionRootChildCount: number;
  readonly markerCount: number;
  readonly vehicle: VehicleTelemetry;
  readonly vehicles: readonly VehicleTelemetry[];
  readonly camera: CameraDebugSnapshot;
  readonly arena: SandboxArenaDebugSnapshot;
  readonly movers: KinematicMoverDebugSnapshot;
  readonly interactions: {
    readonly boosters: BoosterPadDebugSnapshot;
    readonly portals: PortalSystemDebugSnapshot;
  };
  readonly particles: ParticlePoolDebugSnapshot;
}

export interface DebugBodyState {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation?: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly linearVelocity?: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly angularVelocity?: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

export interface WorldSessionPresentationSettings {
  readonly particleDensity?: ParticleDensity;
  readonly cameraSmoothing?: CameraSmoothing;
  readonly markerSize?: MarkerSize;
  readonly automaticUprightRecovery?: boolean;
  readonly highContrastInteractables?: boolean;
  readonly onBoosterActivation?: () => void;
  readonly onPortalTeleport?: () => void;
  readonly onVehicleRecovery?: (playerIndex: number) => void;
}

export class WorldSession {
  public readonly root = new Group();
  private readonly world: InstanceType<RapierModule["World"]>;
  private readonly eventQueue: InstanceType<RapierModule["EventQueue"]>;
  private readonly arena: SandboxArena;
  private readonly movers: KinematicMoverSystem;
  private readonly particles: ParticlePool;
  private readonly boosters: BoosterPadSystem;
  private readonly portals: PortalSystem;
  private readonly vehicles: VehicleEntity[] = [];
  private readonly roster: PlayerRoster;
  private readonly cameraController: GroupCameraController;
  private readonly markerSystem: DomMarkerSystem;
  private readonly exhaustEmissionAccumulator = new Float32Array(10);
  private readonly latestThrottle = new Float32Array(10);
  private readonly onVehicleRecovery: ((playerIndex: number) => void) | undefined;
  private particleDensityMultiplier = 1;
  private automaticUprightRecovery = false;
  private simulationTimeSeconds = 0;
  private disposed = false;

  public constructor(
    private readonly rapier: RapierModule,
    private readonly sceneRoot: Group | Scene,
    playerCount = 1,
    camera: OrthographicCamera,
    markerOverlay: HTMLElement,
    presentationSettings: WorldSessionPresentationSettings = {},
  ) {
    this.root.name = "world-session";
    sceneRoot.add(this.root);

    this.world = new rapier.World(SIMULATION_CONFIG.gravity);
    this.world.timestep = SIMULATION_CONFIG.fixedTimestepSeconds;
    this.eventQueue = new rapier.EventQueue(true);
    this.arena = new SandboxArena(rapier, this.world, this.root);
    this.movers = new KinematicMoverSystem(rapier, this.world, this.root);
    this.particles = new ParticlePool(this.root);
    this.setParticleDensity(presentationSettings.particleDensity ?? "full");
    this.onVehicleRecovery = presentationSettings.onVehicleRecovery;
    this.boosters = new BoosterPadSystem(rapier, this.world, this.root, undefined, {
      onActivation: (request) => {
        this.particles.emitBoosterBurst(request.position, request.particleCount);
        presentationSettings.onBoosterActivation?.();
      },
    });
    this.portals = new PortalSystem(rapier, this.world, this.root, undefined, {
      onBodyTeleported: (bodyHandle) => {
        const vehicle = this.vehicles.find((candidate) => candidate.rigidBodyHandle === bodyHandle);
        if (vehicle !== undefined) {
          vehicle.synchronizeAfterExternalTeleport();
        } else {
          this.arena.synchronizeAfterExternalTeleport(bodyHandle);
        }
      },
      onTeleport: (event) => {
        this.particles.emitPortalBurst(event.sourcePosition);
        this.particles.emitPortalBurst(event.destinationPosition);
        presentationSettings.onPortalTeleport?.();
      },
    });
    this.roster = new PlayerRoster(playerCount);
    this.cameraController = new GroupCameraController(camera);
    this.markerSystem = new DomMarkerSystem(camera, markerOverlay);
    this.cameraController.setSmoothing(presentationSettings.cameraSmoothing ?? "default");
    this.markerSystem.setMarkerSize(presentationSettings.markerSize ?? "medium");
    this.automaticUprightRecovery = presentationSettings.automaticUprightRecovery ?? false;
    this.setHighContrastInteractables(presentationSettings.highContrastInteractables ?? false);
    const spawner = new PlayerVehicleSpawner();
    for (const player of this.roster.players) {
      const spawn = spawner.calculateTransform(this.roster.count, player.index);
      const vehicle = new VehicleEntity(rapier, this.world, this.root, player, spawn);
      this.vehicles.push(vehicle);
      this.cameraController.registerTarget(vehicle.view.root);
      this.markerSystem.register(player.number, vehicle.view.root);
    }

    const sun = new DirectionalLight(0xfff9ea, 2.1);
    sun.position.set(-26, 42, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    this.root.add(sun);

    const ambient = new HemisphereLight(0x8398a8, 0x68737d, 1.35);
    this.root.add(ambient);
  }

  public step(inputs: readonly LogicalAxes[]): void {
    if (!this.disposed) {
      const nextSimulationTimeSeconds =
        this.simulationTimeSeconds + SIMULATION_CONFIG.fixedTimestepSeconds;
      this.portals.fixedStep(SIMULATION_CONFIG.fixedTimestepSeconds);
      this.particles.fixedStep(SIMULATION_CONFIG.fixedTimestepSeconds);
      this.arena.beginFixedStep();
      this.movers.beforePhysicsStep(nextSimulationTimeSeconds);
      for (let index = 0; index < this.vehicles.length; index += 1) {
        const vehicle = this.vehicles[index];
        const input = inputs[index];
        if (vehicle !== undefined && input !== undefined) {
          this.latestThrottle[index] = input.vertical;
          vehicle.prepareFixedStep(input, SIMULATION_CONFIG.fixedTimestepSeconds);
        }
      }
      this.world.step(this.eventQueue);
      this.eventQueue.drainCollisionEvents((colliderA, colliderB, started) => {
        this.portals.handleCollisionEvent(colliderA, colliderB, started);
        this.boosters.handleCollisionEvent(colliderA, colliderB, started);
      });
      this.boosters.fixedStep(SIMULATION_CONFIG.fixedTimestepSeconds);
      this.movers.afterPhysicsStep();
      const recoveredArenaBodies = this.arena.finishFixedStep();
      for (const bodyHandle of recoveredArenaBodies) {
        this.forgetInteractionBody(bodyHandle);
      }
      for (let index = 0; index < this.vehicles.length; index += 1) {
        const vehicle = this.vehicles[index];
        if (vehicle === undefined) {
          continue;
        }
        const recovered = vehicle.finishFixedStep(
          SIMULATION_CONFIG.fixedTimestepSeconds,
          this.automaticUprightRecovery,
        );
        if (recovered) {
          this.forgetInteractionBody(vehicle.rigidBodyHandle);
          this.exhaustEmissionAccumulator[index] = 0;
          this.onVehicleRecovery?.(index);
        } else {
          this.emitVehicleExhaust(vehicle, index);
        }
      }
      this.simulationTimeSeconds = nextSimulationTimeSeconds;
    }
  }

  public render(alpha: number, renderDeltaSeconds: number, aspectRatio: number): void {
    this.arena.render(alpha);
    this.movers.render(alpha);
    this.particles.render(alpha);
    for (const vehicle of this.vehicles) {
      vehicle.render(alpha);
    }
    if (Math.abs(this.cameraController.aspectRatio - aspectRatio) > 0.0001) {
      this.cameraController.resize(aspectRatio);
    }
    this.cameraController.update(renderDeltaSeconds);
    this.markerSystem.update();
  }

  public get rigidBodyCount(): number {
    return this.world.bodies.len();
  }

  public get playerCount(): number {
    return this.roster.count;
  }

  public setParticleDensity(particleDensity: ParticleDensity): void {
    this.particleDensityMultiplier =
      particleDensity === "off" ? 0 : particleDensity === "reduced" ? 0.45 : 1;
    if (particleDensity === "off" && this.particles !== undefined) {
      this.particles.clear();
      this.exhaustEmissionAccumulator.fill(0);
    }
  }

  public setCameraSmoothing(cameraSmoothing: CameraSmoothing): void {
    this.cameraController.setSmoothing(cameraSmoothing);
  }

  public setMarkerSize(markerSize: MarkerSize): void {
    this.markerSystem.setMarkerSize(markerSize);
  }

  public setAutomaticUprightRecovery(enabled: boolean): void {
    this.automaticUprightRecovery = enabled;
  }

  public setHighContrastInteractables(enabled: boolean): void {
    this.boosters.setHighContrast(enabled);
    this.portals.setHighContrast(enabled);
  }

  public writeVehicleAudioTelemetry(
    normalizedSpeeds: Float32Array,
    throttles: Float32Array,
  ): number {
    const count = Math.min(this.vehicles.length, normalizedSpeeds.length, throttles.length);
    for (let index = 0; index < count; index += 1) {
      const vehicle = this.vehicles[index];
      normalizedSpeeds[index] =
        vehicle === undefined ? 0 : Math.min(1, Math.max(0, vehicle.physics.speed / 20));
      throttles[index] = this.latestThrottle[index] ?? 0;
    }
    return count;
  }

  public debugSnapshot(): WorldDebugSnapshot {
    const vehicles = this.vehicles.map((vehicle) => vehicle.telemetry());
    let awakeRigidBodyCount = 0;
    this.world.forEachRigidBody((body) => {
      if (!body.isSleeping()) {
        awakeRigidBodyCount += 1;
      }
    });
    const firstVehicle = vehicles[0];
    if (firstVehicle === undefined) {
      throw new Error("An active world session must contain at least one vehicle.");
    }
    return {
      rigidBodyCount: this.rigidBodyCount,
      colliderCount: this.world.colliders.len(),
      awakeRigidBodyCount,
      sessionRootChildCount: this.root.children.length,
      markerCount: this.markerSystem.markerCount,
      vehicle: firstVehicle,
      vehicles,
      arena: this.arena.debugSnapshot(),
      movers: this.movers.debugSnapshot(),
      interactions: {
        boosters: this.boosters.debugSnapshot(),
        portals: this.portals.debugSnapshot(),
      },
      particles: this.particles.debugSnapshot(),
      camera: {
        halfHeight: this.cameraController.currentHalfHeight,
        targetCount: this.cameraController.targetCount,
        center: this.cameraController.getCurrentCenter(),
      },
    };
  }

  public debugDropVehicle(): void {
    const vehicle = this.vehicles[0];
    if (vehicle === undefined) {
      return;
    }
    vehicle.physics.teleport({ x: 5, y: -4, z: 5 }, { x: 0, y: 0, z: 0, w: 1 }, false);
  }

  public debugMoveVehicle(
    playerIndex: number,
    position: { readonly x: number; readonly y: number; readonly z: number },
  ): void {
    const vehicle = this.vehicles[playerIndex];
    if (vehicle === undefined) {
      throw new RangeError(`No active vehicle exists at index ${String(playerIndex)}.`);
    }
    vehicle.physics.teleport(position, { x: 0, y: 0, z: 0, w: 1 }, false);
  }

  public debugSetVehicleState(playerIndex: number, state: DebugBodyState): void {
    const vehicle = this.vehicles[playerIndex];
    if (vehicle === undefined) {
      throw new RangeError(`No active vehicle exists at index ${String(playerIndex)}.`);
    }
    vehicle.physics.teleport(state.position, state.rotation ?? { x: 0, y: 0, z: 0, w: 1 }, false);
    vehicle.physics.body.setLinvel(state.linearVelocity ?? { x: 0, y: 0, z: 0 }, true);
    vehicle.physics.body.setAngvel(state.angularVelocity ?? { x: 0, y: 0, z: 0 }, true);
    vehicle.synchronizeAfterExternalTeleport();
  }

  public debugSetBallState(ballIndex: number, state: DebugBodyState): void {
    const body = this.arena.ballBodies[ballIndex];
    if (body === undefined) {
      throw new RangeError(`No Sandbox ball exists at index ${String(ballIndex)}.`);
    }
    body.setTranslation(state.position, true);
    body.setRotation(state.rotation ?? { x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel(state.linearVelocity ?? { x: 0, y: 0, z: 0 }, true);
    body.setAngvel(state.angularVelocity ?? { x: 0, y: 0, z: 0 }, true);
    this.arena.synchronizeAfterExternalTeleport(body.handle);
  }

  public debugSetCubeState(cubeIndex: number, state: DebugBodyState): void {
    const body = this.arena.cubeBodies[cubeIndex];
    if (body === undefined) {
      throw new RangeError(`No Sandbox cube exists at index ${String(cubeIndex)}.`);
    }
    body.setTranslation(state.position, true);
    body.setRotation(state.rotation ?? { x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel(state.linearVelocity ?? { x: 0, y: 0, z: 0 }, true);
    body.setAngvel(state.angularVelocity ?? { x: 0, y: 0, z: 0 }, true);
    this.arena.synchronizeAfterExternalTeleport(body.handle);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.portals.dispose();
    this.boosters.dispose();
    this.particles.dispose();
    for (const vehicle of this.vehicles) {
      vehicle.dispose();
    }
    this.vehicles.length = 0;
    this.movers.dispose();
    this.arena.dispose();
    this.cameraController.reset();
    this.markerSystem.dispose();
    this.root.traverse((object) => {
      if (object instanceof DirectionalLight) {
        object.shadow.dispose();
      }
    });
    this.sceneRoot.remove(this.root);
    this.root.clear();
    this.eventQueue.free();
    this.world.free();
  }

  private forgetInteractionBody(bodyHandle: number): void {
    this.portals.forgetBody(bodyHandle);
    this.boosters.forgetBody(bodyHandle);
  }

  private emitVehicleExhaust(vehicle: VehicleEntity, vehicleIndex: number): void {
    if (this.particleDensityMultiplier <= 0) {
      return;
    }
    const speed = vehicle.physics.speed;
    const ratePerSecond =
      60 * Math.min(1, Math.max(0, speed / 50)) * this.particleDensityMultiplier;
    const nextAccumulator =
      (this.exhaustEmissionAccumulator[vehicleIndex] ?? 0) +
      ratePerSecond * SIMULATION_CONFIG.fixedTimestepSeconds;
    const emitCount = Math.floor(nextAccumulator);
    this.exhaustEmissionAccumulator[vehicleIndex] = nextAccumulator - emitCount;
    if (emitCount <= 0) {
      return;
    }

    const body = vehicle.physics.body;
    const center = body.translation();
    const rotation = body.rotation();
    const linearVelocity = body.linvel();
    const rearOffsetX = -1.3 * (rotation.w * rotation.y + rotation.z * rotation.x);
    const rearOffsetY = 1.3 * (rotation.w * rotation.x - rotation.z * rotation.y);
    const rearOffsetZ = -0.65 + 1.3 * (rotation.x * rotation.x + rotation.y * rotation.y);
    const inverseRearLength = 1 / 0.65;
    const color = Number.parseInt(vehicle.player.color.slice(1), 16);

    for (let index = 0; index < emitCount; index += 1) {
      this.particles.emitExhaust(
        {
          x: center.x + rearOffsetX,
          y: center.y + rearOffsetY + 0.12,
          z: center.z + rearOffsetZ,
        },
        {
          x: linearVelocity.x * 0.12 + rearOffsetX * inverseRearLength * 0.8,
          y: linearVelocity.y * 0.12 + 0.25,
          z: linearVelocity.z * 0.12 + rearOffsetZ * inverseRearLength * 0.8,
        },
        color,
      );
    }
  }
}
