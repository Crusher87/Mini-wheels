import { DirectionalLight, Group, HemisphereLight, Quaternion, Vector3 } from "three";
import type { OrthographicCamera, Scene } from "three";
import type { RapierModule } from "../physics/rapier-init";
import type { AuthoredWallContact } from "../physics/VehiclePhysicsAdapter";
import type { RuntimeMapBlueprint } from "../maps/MapCompiler";
import { SIMULATION_CONFIG } from "../config/runtime-defaults";
import { VEHICLE_RUNTIME } from "../config/vehicle-runtime";
import type { MovingPlatformSource, RotatingBarSource } from "../config/sandbox-movers";
import type { LogicalAxes } from "../input/InputHub";
import type { CameraSmoothing, MarkerSize, ParticleDensity } from "../persistence/schema";
import {
  VehicleEntity,
  type VehicleRecoveryPose,
  type VehicleTelemetry,
} from "../gameplay/vehicle/VehicleEntity";
import { SurfaceContactSystem } from "../gameplay/vehicle/SurfaceContactSystem";
import { RaceProgressSystem, type RaceProgressSnapshot } from "../gameplay/race/RaceProgressSystem";
import { PlayerRoster } from "../gameplay/player/PlayerRoster";
import { PlayerVehicleSpawner } from "../gameplay/vehicle/PlayerVehicleSpawner";
import {
  BoosterPadSystem,
  type BoosterPadDebugSnapshot,
} from "../gameplay/interactables/BoosterPadSystem";
import {
  boosterPadId,
  type BoosterPadDefinition,
  portalEndpointId,
  portalPairId,
  type PortalEndpointDefinition,
} from "../gameplay/interactables/interactable-config";
import {
  PortalSystem,
  type PortalSystemDebugSnapshot,
} from "../gameplay/interactables/PortalSystem";
import {
  AuthoredInteractionSystem,
  type AuthoredInteractionDebugSnapshot,
} from "../gameplay/interactables/AuthoredInteractionSystem";
import { GroupCameraController } from "../render/GroupCameraController";
import { DomMarkerSystem } from "../render/DomMarkerSystem";
import { ParticlePool, type ParticlePoolDebugSnapshot } from "../render/ParticlePool";
import {
  KinematicMoverSystem,
  type KinematicMoverDebugSnapshot,
} from "./movers/KinematicMoverSystem";
import { SandboxArena, type SandboxArenaDebugSnapshot } from "./SandboxArena";
import { AuthoredMapArena, authoredSpawnTransform } from "./AuthoredMapArena";
import type { WorldArena } from "./WorldArena";
import type { AuthoredRecoveryTarget } from "./WorldArena";
import {
  EnvironmentSession,
  type EnvironmentDebugSnapshot,
} from "./environment/EnvironmentSession";

interface PendingAuthoredRecovery {
  readonly target: AuthoredRecoveryTarget;
  remainingSeconds: number;
}

const LOCKED_RACE_INPUT: LogicalAxes = Object.freeze({
  horizontal: 0,
  vertical: 0,
  brake: false,
});

interface AuthoredMoverDefinitions {
  readonly rotatingBars: readonly RotatingBarSource[];
  readonly movingPlatforms: readonly MovingPlatformSource[];
}

export function authoredMoverDefinitions(blueprint: RuntimeMapBlueprint): AuthoredMoverDefinitions {
  const rotatingBars: RotatingBarSource[] = [];
  const movingPlatforms: MovingPlatformSource[] = [];
  for (const entity of blueprint.entities) {
    const [positionX, positionY, positionZ] = entity.transform.position;
    const [rotationX, rotationY, rotationZ, rotationW] = entity.transform.rotation;
    const color =
      typeof entity.properties["color"] === "string" ? entity.properties["color"] : undefined;
    if (entity.assetId === "motion.rotating-bar") {
      const yawRadians = Math.atan2(
        2 * (rotationW * rotationY + rotationX * rotationZ),
        1 - 2 * (rotationY * rotationY + rotationZ * rotationZ),
      );
      const degreesPerSecond = entityNumber(entity, "degreesPerSecond", 90);
      rotatingBars.push({
        id: entity.id,
        position: { x: positionX, y: positionY, z: positionZ },
        scale: {
          x: entityNumber(entity, "length", 8) * Math.abs(entity.transform.scale[0]),
          y: entityNumber(entity, "height", 0.6) * Math.abs(entity.transform.scale[1]),
          z: entityNumber(entity, "thickness", 0.8) * Math.abs(entity.transform.scale[2]),
        },
        initialYawDegrees: (yawRadians * 180) / Math.PI,
        sourceDegreesPerRenderedIteration: degreesPerSecond / 60,
        legacyDegreesPerSecond: degreesPerSecond,
        recommendedDegreesPerSecond: degreesPerSecond,
        ...(color === undefined ? {} : { color }),
      });
    } else if (entity.assetId === "motion.moving-platform" || entity.assetId === "motion.door") {
      const door = entity.assetId === "motion.door";
      const rotation = new Quaternion(rotationX, rotationY, rotationZ, rotationW);
      const offset = new Vector3(
        entityNumber(entity, "offsetX", 0),
        entityNumber(entity, "offsetY", door ? entityNumber(entity, "height", 4) + 0.4 : 5),
        entityNumber(entity, "offsetZ", 0),
      ).applyQuaternion(rotation);
      const endpointA = { x: positionX, y: positionY, z: positionZ };
      const endpointB = {
        x: positionX + offset.x,
        y: positionY + offset.y,
        z: positionZ + offset.z,
      };
      const speed = entityNumber(entity, "speed", 1.5);
      movingPlatforms.push({
        id: entity.id,
        size: {
          x: entityNumber(entity, "width", door ? 5 : 4) * Math.abs(entity.transform.scale[0]),
          y: entityNumber(entity, "height", door ? 4 : 0.3) * Math.abs(entity.transform.scale[1]),
          z: entityNumber(entity, "depth", door ? 0.5 : 4) * Math.abs(entity.transform.scale[2]),
        },
        endpointA,
        endpointB,
        speedUnitsPerSecond: speed,
        endpointHoldSeconds: entityNumber(entity, "dwellSeconds", door ? 2 : 1),
        authoredOneWayTravelSeconds: Math.hypot(offset.x, offset.y, offset.z) / speed,
        initiallyStopped: door,
        rotation: { x: rotationX, y: rotationY, z: rotationZ, w: rotationW },
        ...(color === undefined ? {} : { color }),
      });
    }
  }
  return Object.freeze({
    rotatingBars: Object.freeze(rotatingBars),
    movingPlatforms: Object.freeze(movingPlatforms),
  });
}

export function authoredBoosterDefinitions(
  blueprint: RuntimeMapBlueprint,
): readonly BoosterPadDefinition[] {
  const definitions: BoosterPadDefinition[] = [];
  for (const entity of blueprint.entities) {
    if (
      entity.assetId !== "travel.boost-pad" &&
      entity.assetId !== "travel.launch-pad" &&
      entity.assetId !== "travel.bounce-pad" &&
      entity.assetId !== "travel.slow-zone"
    ) {
      continue;
    }
    const [positionX, positionY, positionZ] = entity.transform.position;
    const [rotationX, rotationY, rotationZ, rotationW] = entity.transform.rotation;
    const rotation = new Quaternion(rotationX, rotationY, rotationZ, rotationW);
    const scaleX = Math.abs(entity.transform.scale[0]);
    const scaleY = Math.abs(entity.transform.scale[1]);
    const scaleZ = Math.abs(entity.transform.scale[2]);
    const boostSpeed = entityNumber(entity, "boostSpeed", 6);
    const forward = new Vector3(0, 0, 1).applyQuaternion(rotation);
    const effect =
      entity.assetId === "travel.launch-pad"
        ? "launch"
        : entity.assetId === "travel.bounce-pad"
          ? "bounce"
          : entity.assetId === "travel.slow-zone"
            ? "slow"
            : "boost";
    definitions.push(
      Object.freeze({
        id: boosterPadId(entity.id),
        position: Object.freeze({ x: positionX, y: positionY, z: positionZ }),
        rotation: Object.freeze({
          x: rotationX,
          y: rotationY,
          z: rotationZ,
          w: rotationW,
        }),
        halfExtents: Object.freeze({
          x: (entityNumber(entity, "width", 2.5) * scaleX) / 2,
          y: (entityNumber(entity, "height", 0.16) * scaleY) / 2,
          z: (entityNumber(entity, "depth", 3) * scaleZ) / 2,
        }),
        deltaVelocity: Object.freeze({
          x: effect === "boost" || effect === "launch" ? forward.x * boostSpeed : 0,
          y:
            effect === "boost" || effect === "launch"
              ? entityNumber(entity, "liftSpeed", effect === "launch" ? 7 : 0)
              : 0,
          z: effect === "boost" || effect === "launch" ? forward.z * boostSpeed : 0,
        }),
        effect,
        ...(effect === "slow"
          ? { velocityMultiplier: entityNumber(entity, "speedMultiplier", 0.4) }
          : {}),
        ...(effect === "bounce"
          ? { minimumVerticalSpeed: entityNumber(entity, "bounceSpeed", 9) }
          : {}),
        cooldownSeconds: entityNumber(entity, "cooldownSeconds", 0.35),
      }),
    );
  }
  return Object.freeze(definitions);
}

export function authoredPortalDefinitions(
  blueprint: RuntimeMapBlueprint,
): readonly PortalEndpointDefinition[] {
  const entityById = new Map(blueprint.entities.map((entity) => [entity.id, entity]));
  const definitions: PortalEndpointDefinition[] = [];
  for (const entity of blueprint.entities) {
    if (entity.assetId !== "travel.portal") {
      continue;
    }
    const peerId = entity.properties["peerPortalEntityId"];
    const peer = typeof peerId === "string" ? entityById.get(peerId) : undefined;
    if (peer?.assetId !== "travel.portal" || peer.properties["peerPortalEntityId"] !== entity.id) {
      continue;
    }
    const [positionX, positionY, positionZ] = entity.transform.position;
    const [rotationX, rotationY, rotationZ, rotationW] = entity.transform.rotation;
    definitions.push(
      Object.freeze({
        id: portalEndpointId(entity.id),
        pairId: portalPairId(`portal-pair:${[entity.id, peer.id].sort().join(":")}`),
        position: Object.freeze({ x: positionX, y: positionY, z: positionZ }),
        rotation: Object.freeze({
          x: rotationX,
          y: rotationY,
          z: rotationZ,
          w: rotationW,
        }),
        halfExtents: Object.freeze({
          x: (entityNumber(entity, "width", 3) * Math.abs(entity.transform.scale[0])) / 2,
          y: (entityNumber(entity, "height", 4) * Math.abs(entity.transform.scale[1])) / 2,
          z: (entityNumber(entity, "depth", 0.35) * Math.abs(entity.transform.scale[2])) / 2,
        }),
      }),
    );
  }
  return Object.freeze(definitions);
}

function entityNumber(
  entity: RuntimeMapBlueprint["entities"][number],
  key: string,
  fallback: number,
) {
  const value = entity.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

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
    readonly authored: AuthoredInteractionDebugSnapshot;
  };
  readonly particles: ParticlePoolDebugSnapshot;
  readonly race: RaceProgressSnapshot;
  readonly environment: EnvironmentDebugSnapshot | null;
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
  readonly mapBlueprint?: RuntimeMapBlueprint;
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
  private readonly arena: WorldArena;
  private readonly movers: KinematicMoverSystem;
  private readonly particles: ParticlePool;
  private readonly boosters: BoosterPadSystem;
  private readonly portals: PortalSystem;
  private readonly authoredInteractions: AuthoredInteractionSystem;
  private readonly raceProgress: RaceProgressSystem;
  private readonly recoveryPenaltySeconds: number;
  private readonly environmentSession: EnvironmentSession | null;
  private readonly outOfBoundsHeight: number;
  private readonly vehicles: VehicleEntity[] = [];
  private readonly vehicleSurfaceContacts: SurfaceContactSystem[] = [];
  private readonly roster: PlayerRoster;
  private readonly cameraController: GroupCameraController;
  private readonly markerSystem: DomMarkerSystem;
  private readonly exhaustEmissionAccumulator = new Float32Array(10);
  private readonly driftSparkEmissionAccumulator = new Float32Array(10);
  private readonly latestThrottle = new Float32Array(10);
  private readonly pendingAuthoredRecoveries = new Map<number, PendingAuthoredRecovery>();
  /** Vehicle colliders currently inside each race trigger, keyed by body handle and trigger. */
  private readonly raceTriggerContacts = new Map<string, Set<number>>();
  private readonly checkpointRecoveryPoses: (VehicleRecoveryPose | null)[] = [];
  private readonly initialRecoveryPoses: VehicleRecoveryPose[] = [];
  private readonly onVehicleRecovery: ((playerIndex: number) => void) | undefined;
  private readonly raceHud: HTMLElement | null;
  private raceHudSignature = "";
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
    const raceHud = markerOverlay.ownerDocument.getElementById("race-hud");
    this.raceHud = raceHud instanceof HTMLElement ? raceHud : null;

    const blueprint = presentationSettings.mapBlueprint;
    const gravity = blueprint?.environment.gravity ?? [
      SIMULATION_CONFIG.gravity.x,
      SIMULATION_CONFIG.gravity.y,
      SIMULATION_CONFIG.gravity.z,
    ];
    this.world = new rapier.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
    this.world.timestep = SIMULATION_CONFIG.fixedTimestepSeconds;
    this.eventQueue = new rapier.EventQueue(true);
    this.raceProgress = new RaceProgressSystem(
      blueprint?.race ?? {
        mode: "free-roam",
        activeStartGridId: null,
        lapCount: 1,
        checkpointGroups: [],
        routeEdges: [],
        finishEntityIds: [],
        finishRule: "any",
        recovery: { delaySeconds: 0.75, penaltySeconds: 0 },
      },
      playerCount,
    );
    this.recoveryPenaltySeconds = blueprint?.race.recovery.penaltySeconds ?? 0;
    this.outOfBoundsHeight = blueprint?.environment.outOfBoundsHeight ?? Number.NEGATIVE_INFINITY;
    this.environmentSession =
      blueprint === undefined
        ? null
        : new EnvironmentSession(rapier, this.world, sceneRoot, blueprint.environment);
    this.arena =
      blueprint === undefined
        ? new SandboxArena(rapier, this.world, this.root)
        : new AuthoredMapArena(rapier, this.world, this.root, blueprint);
    const authoredMovers = blueprint === undefined ? null : authoredMoverDefinitions(blueprint);
    this.movers = new KinematicMoverSystem(rapier, this.world, this.root, {
      enabled: blueprint === undefined,
      ...(authoredMovers === null
        ? {}
        : {
            rotatingBars: authoredMovers.rotatingBars,
            movingPlatforms: authoredMovers.movingPlatforms,
          }),
    });
    this.particles = new ParticlePool(this.root);
    this.setParticleDensity(presentationSettings.particleDensity ?? "full");
    this.onVehicleRecovery = presentationSettings.onVehicleRecovery;
    this.boosters = new BoosterPadSystem(
      rapier,
      this.world,
      this.root,
      blueprint === undefined ? undefined : authoredBoosterDefinitions(blueprint),
      {
        onActivation: (request) => {
          if (request.particleCount > 0) {
            this.particles.emitBoosterBurst(request.position, request.particleCount);
            presentationSettings.onBoosterActivation?.();
          }
        },
      },
    );
    this.portals = new PortalSystem(
      rapier,
      this.world,
      this.root,
      blueprint === undefined ? undefined : authoredPortalDefinitions(blueprint),
      {
        onBodyTeleported: (bodyHandle) => {
          const vehicleIndex = this.vehicles.findIndex(
            (candidate) => candidate.rigidBodyHandle === bodyHandle,
          );
          const vehicle = this.vehicles[vehicleIndex];
          if (vehicle !== undefined) {
            vehicle.synchronizeAfterExternalTeleport();
            this.resetVehicleSurfaceEffects(vehicleIndex);
          } else {
            this.arena.synchronizeAfterExternalTeleport(bodyHandle);
          }
        },
        onTeleport: (event) => {
          this.particles.emitPortalBurst(event.sourcePosition);
          this.particles.emitPortalBurst(event.destinationPosition);
          presentationSettings.onPortalTeleport?.();
        },
      },
    );
    this.authoredInteractions = new AuthoredInteractionSystem(
      blueprint?.entities ?? [],
      blueprint?.interactions ?? [],
      {
        conditionPasses: (condition) => {
          if (condition === null) {
            return true;
          }
          const race = this.raceProgress.snapshot();
          if (condition === "race-running") {
            return race.phase === "racing" || race.phase === "free-roam";
          }
          const minimumLap =
            condition === "lap-3-or-later" ? 3 : condition === "lap-2-or-later" ? 2 : 1;
          return race.players.some((player) => player.lap >= minimumLap);
        },
        onAction: ({ interaction, target }) => {
          if (
            (target.assetId === "motion.door" || target.assetId === "motion.moving-platform") &&
            (interaction.action === "open" ||
              interaction.action === "close" ||
              interaction.action === "toggle" ||
              interaction.action === "start" ||
              interaction.action === "stop" ||
              interaction.action === "reverse" ||
              interaction.action === "reset")
          ) {
            this.movers.commandMovingPlatform(target.id, interaction.action);
          }
          if (
            target.assetId === "decoration.effect-emitter" &&
            (interaction.action === "play" ||
              interaction.action === "pulse" ||
              interaction.action === "enable")
          ) {
            this.particles.emitBoosterBurst(
              {
                x: target.transform.position[0],
                y: target.transform.position[1],
                z: target.transform.position[2],
              },
              entityNumber(target, "burstCount", 12),
            );
          }
        },
      },
    );
    this.roster = new PlayerRoster(playerCount);
    this.cameraController = new GroupCameraController(camera);
    this.markerSystem = new DomMarkerSystem(camera, markerOverlay);
    this.cameraController.setSmoothing(presentationSettings.cameraSmoothing ?? "default");
    this.markerSystem.setMarkerSize(presentationSettings.markerSize ?? "medium");
    this.automaticUprightRecovery = presentationSettings.automaticUprightRecovery ?? false;
    this.setHighContrastInteractables(presentationSettings.highContrastInteractables ?? false);
    const spawner = new PlayerVehicleSpawner();
    for (const player of this.roster.players) {
      const spawn =
        blueprint === undefined
          ? spawner.calculateTransform(this.roster.count, player.index)
          : authoredSpawnTransform(blueprint, this.roster.count, player.index);
      const vehicle = new VehicleEntity(rapier, this.world, this.root, player, spawn);
      this.vehicles.push(vehicle);
      this.checkpointRecoveryPoses.push(null);
      this.initialRecoveryPoses.push(
        Object.freeze({
          position: Object.freeze({ ...spawn.position }),
          rotation: Object.freeze({ ...spawn.quaternion }),
        }),
      );
      this.vehicleSurfaceContacts.push(new SurfaceContactSystem());
      this.cameraController.registerTarget(vehicle.view.root);
      this.markerSystem.register(player.number, vehicle.view.root);
    }

    if (blueprint === undefined) {
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
  }

  public step(inputs: readonly LogicalAxes[]): void {
    if (!this.disposed) {
      const nextSimulationTimeSeconds =
        this.simulationTimeSeconds + SIMULATION_CONFIG.fixedTimestepSeconds;
      this.advanceAuthoredRecoveries(SIMULATION_CONFIG.fixedTimestepSeconds);
      this.raceProgress.fixedStep(SIMULATION_CONFIG.fixedTimestepSeconds);
      const racePhase = this.raceProgress.snapshot().phase;
      this.portals.fixedStep(SIMULATION_CONFIG.fixedTimestepSeconds);
      this.particles.fixedStep(SIMULATION_CONFIG.fixedTimestepSeconds);
      this.arena.beginFixedStep();
      this.movers.beforePhysicsStep(nextSimulationTimeSeconds);
      for (let index = 0; index < this.vehicles.length; index += 1) {
        const vehicle = this.vehicles[index];
        const input = inputs[index];
        if (vehicle !== undefined && input !== undefined) {
          const activeInput =
            racePhase === "free-roam" || racePhase === "racing" ? input : LOCKED_RACE_INPUT;
          this.latestThrottle[index] = activeInput.vertical;
          this.applyAuthoredSurfaceContacts(vehicle, index);
          vehicle.prepareFixedStep(activeInput, SIMULATION_CONFIG.fixedTimestepSeconds);
        }
      }
      this.world.step(this.eventQueue);
      this.authoredInteractions.fixedStep(SIMULATION_CONFIG.fixedTimestepSeconds, [
        ...this.vehicles.map((vehicle) => vehicle.physics.body),
        ...this.arena.ballBodies,
        ...this.arena.cubeBodies,
      ]);
      for (const vehicle of this.vehicles) {
        const wallContact = this.authoredWallContact(vehicle);
        if (wallContact !== null) {
          vehicle.resolveAuthoredWallContact(wallContact);
        }
        vehicle.assistJumpLanding(this.authoredGroundDistance(vehicle));
      }
      this.eventQueue.drainCollisionEvents((colliderA, colliderB, started) => {
        this.portals.handleCollisionEvent(colliderA, colliderB, started);
        this.boosters.handleCollisionEvent(colliderA, colliderB, started);
        this.handleAuthoredRecoveryCollision(colliderA, colliderB, started);
        this.handleAuthoredRaceCollision(colliderA, colliderB, started);
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
        if (vehicle.physics.body.translation().y < this.outOfBoundsHeight) {
          const pose = this.checkpointRecoveryPoses[index] ?? this.initialRecoveryPoses[index];
          if (pose !== undefined) {
            vehicle.recoverTo(pose.position, pose.rotation);
            this.pendingAuthoredRecoveries.delete(index);
            this.raceProgress.applyRecoveryPenalty(index, this.recoveryPenaltySeconds);
            this.resetVehicleSurfaceEffects(index);
            this.forgetInteractionBody(vehicle.rigidBodyHandle);
            this.exhaustEmissionAccumulator[index] = 0;
            this.driftSparkEmissionAccumulator[index] = 0;
            this.onVehicleRecovery?.(index);
            continue;
          }
        }
        const recovered = vehicle.finishFixedStep(
          SIMULATION_CONFIG.fixedTimestepSeconds,
          this.automaticUprightRecovery,
          this.checkpointRecoveryPoses[index] ?? null,
        );
        if (recovered) {
          this.pendingAuthoredRecoveries.delete(index);
          this.raceProgress.applyRecoveryPenalty(index, this.recoveryPenaltySeconds);
          this.resetVehicleSurfaceEffects(index);
          this.forgetInteractionBody(vehicle.rigidBodyHandle);
          this.exhaustEmissionAccumulator[index] = 0;
          this.driftSparkEmissionAccumulator[index] = 0;
          this.onVehicleRecovery?.(index);
        } else {
          this.emitVehicleExhaust(vehicle, index);
          this.emitVehicleDriftSparks(vehicle, index);
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
    this.renderRaceHud();
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
      this.driftSparkEmissionAccumulator.fill(0);
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
        authored: this.authoredInteractions.debugSnapshot(),
      },
      particles: this.particles.debugSnapshot(),
      race: this.raceProgress.snapshot(),
      environment: this.environmentSession?.debugSnapshot() ?? null,
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
    vehicle.synchronizeAfterExternalTeleport();
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
    vehicle.synchronizeAfterExternalTeleport();
    this.resetVehicleSurfaceEffects(playerIndex);
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
    this.resetVehicleSurfaceEffects(playerIndex);
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
    this.vehicleSurfaceContacts.length = 0;
    this.pendingAuthoredRecoveries.clear();
    this.checkpointRecoveryPoses.length = 0;
    this.initialRecoveryPoses.length = 0;
    this.movers.dispose();
    this.arena.dispose();
    this.environmentSession?.dispose();
    this.cameraController.reset();
    this.markerSystem.dispose();
    if (this.raceHud !== null) {
      this.raceHud.hidden = true;
      this.raceHud.replaceChildren();
    }
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

  private handleAuthoredRecoveryCollision(
    colliderHandleA: number,
    colliderHandleB: number,
    started: boolean,
  ): void {
    if (!started) {
      return;
    }
    const targetA = this.arena.recoveryForCollider(colliderHandleA);
    const targetB = this.arena.recoveryForCollider(colliderHandleB);
    const target = targetA ?? targetB;
    if (target === null) {
      return;
    }
    const vehicleColliderHandle = targetA === null ? colliderHandleA : colliderHandleB;
    const collider = this.world.getCollider(vehicleColliderHandle);
    const body = collider?.parent();
    if (body === null || body === undefined || !body.isValid()) {
      return;
    }
    const playerIndex = this.vehicles.findIndex(
      (vehicle) => vehicle.rigidBodyHandle === body.handle,
    );
    if (playerIndex < 0 || this.pendingAuthoredRecoveries.has(playerIndex)) {
      return;
    }
    this.pendingAuthoredRecoveries.set(playerIndex, {
      target,
      remainingSeconds: target.delaySeconds,
    });
  }

  private renderRaceHud(): void {
    if (this.raceHud === null) {
      return;
    }
    const snapshot = this.raceProgress.snapshot();
    if (!snapshot.scored) {
      this.raceHud.hidden = true;
      return;
    }
    const countdownValue = Math.ceil(snapshot.countdownRemainingSeconds);
    const signature = `${snapshot.phase}:${String(countdownValue)}|${snapshot.players
      .map((player) =>
        [
          player.lap,
          player.completedGroupIds.length,
          player.finished ? 1 : 0,
          player.finishPlace ?? 0,
          Math.floor(player.elapsedSeconds),
          player.lastOutcome,
          Math.ceil(
            (this.vehicles[player.playerIndex]?.recoveryCollisionProtectionSeconds ?? 0) * 10,
          ),
        ].join(":"),
      )
      .join("|")}`;
    if (signature === this.raceHudSignature) {
      return;
    }
    this.raceHudSignature = signature;
    const document = this.raceHud.ownerDocument;
    const children: HTMLElement[] = [];
    if (snapshot.phase === "countdown") {
      const banner = document.createElement("div");
      banner.className = "race-hud__banner is-countdown";
      banner.textContent = String(Math.max(1, countdownValue));
      children.push(banner);
    } else if (snapshot.phase === "results") {
      const banner = document.createElement("div");
      banner.className = "race-hud__banner is-results";
      banner.textContent = "RACE COMPLETE";
      children.push(banner);
    }
    children.push(
      ...snapshot.players.map((player) => {
        const row = document.createElement("div");
        row.className = "race-hud__player";
        const time = `${Math.floor(player.elapsedSeconds / 60)
          .toString()
          .padStart(2, "0")}:${Math.floor(player.elapsedSeconds % 60)
          .toString()
          .padStart(2, "0")}`;
        const progress = `${String(player.completedGroupIds.length)}/${String(player.requiredGroupCount)} CHECKPOINTS`;
        if (player.finished) {
          row.classList.add("is-finished");
          row.textContent = `P${String(player.playerIndex + 1)} | FINISHED #${String(player.finishPlace)} | ${time}`;
        } else {
          const lap =
            snapshot.mode === "circuit"
              ? `LAP ${String(player.lap)}/${String(player.lapCount)} | `
              : "";
          row.textContent = `P${String(player.playerIndex + 1)} | ${lap}${progress} | ${time}`;
          if (player.lastOutcome === "wrong-direction" || player.lastOutcome === "out-of-route") {
            row.classList.add("is-warning");
            row.textContent +=
              player.lastOutcome === "wrong-direction"
                ? " | WRONG WAY"
                : " | CHECKPOINT OUT OF ORDER";
          }
        }
        const protectionSeconds =
          this.vehicles[player.playerIndex]?.recoveryCollisionProtectionSeconds ?? 0;
        if (protectionSeconds > 0) {
          row.classList.add("is-protected");
          row.textContent += ` | SAFE ${protectionSeconds.toFixed(1)}S`;
        }
        return row;
      }),
    );
    this.raceHud.replaceChildren(...children);
    this.raceHud.hidden = false;
  }

  private handleAuthoredRaceCollision(
    colliderHandleA: number,
    colliderHandleB: number,
    started: boolean,
  ): void {
    const triggerA = this.arena.raceTriggerForCollider(colliderHandleA);
    const triggerB = this.arena.raceTriggerForCollider(colliderHandleB);
    const trigger = triggerA ?? triggerB;
    if (trigger === null) {
      return;
    }
    const vehicleColliderHandle = triggerA === null ? colliderHandleA : colliderHandleB;
    const collider = this.world.getCollider(vehicleColliderHandle);
    const body = collider?.parent();
    if (body === null || body === undefined || !body.isValid()) {
      return;
    }
    const playerIndex = this.vehicles.findIndex(
      (vehicle) => vehicle.rigidBodyHandle === body.handle,
    );
    if (playerIndex < 0) {
      return;
    }
    // A car has several chassis colliders; only its first one entering a trigger counts.
    const contactKey = `${body.handle}:${trigger.entityId}`;
    let contacts = this.raceTriggerContacts.get(contactKey);
    if (!started) {
      contacts?.delete(vehicleColliderHandle);
      if (contacts?.size === 0) {
        this.raceTriggerContacts.delete(contactKey);
      }
      return;
    }
    if (contacts === undefined) {
      contacts = new Set();
      this.raceTriggerContacts.set(contactKey, contacts);
    }
    const firstContact = contacts.size === 0;
    contacts.add(vehicleColliderHandle);
    if (!firstContact) {
      return;
    }
    const velocity = body.linvel();
    const alongGate =
      velocity.x * trigger.forward.x +
      velocity.y * trigger.forward.y +
      velocity.z * trigger.forward.z;
    // Nearly stationary contacts (such as a recovery placed inside a gate) are not crossings.
    if (Math.abs(alongGate) <= 0.2) {
      return;
    }
    const forward = alongGate > 0;
    if (trigger.kind === "checkpoint") {
      const outcome = this.raceProgress.crossCheckpoint(playerIndex, trigger.entityId, forward);
      if (
        outcome === "checkpoint-advanced" &&
        trigger.recoveryPosition !== null &&
        trigger.recoveryRotation !== null
      ) {
        this.checkpointRecoveryPoses[playerIndex] = Object.freeze({
          position: trigger.recoveryPosition,
          rotation: trigger.recoveryRotation,
        });
      }
    } else {
      this.raceProgress.crossFinish(playerIndex, trigger.entityId, forward);
    }
  }

  private advanceAuthoredRecoveries(deltaSeconds: number): void {
    for (const [playerIndex, pending] of this.pendingAuthoredRecoveries) {
      pending.remainingSeconds = Math.max(0, pending.remainingSeconds - deltaSeconds);
      if (pending.remainingSeconds > 1e-9) {
        continue;
      }
      this.pendingAuthoredRecoveries.delete(playerIndex);
      const vehicle = this.vehicles[playerIndex];
      if (vehicle === undefined) {
        continue;
      }
      vehicle.recoverTo(pending.target.position, pending.target.rotation);
      this.raceProgress.applyRecoveryPenalty(playerIndex, this.recoveryPenaltySeconds);
      this.resetVehicleSurfaceEffects(playerIndex);
      this.forgetInteractionBody(vehicle.rigidBodyHandle);
      this.exhaustEmissionAccumulator[playerIndex] = 0;
      this.driftSparkEmissionAccumulator[playerIndex] = 0;
      this.onVehicleRecovery?.(playerIndex);
    }
  }

  private applyAuthoredSurfaceContacts(vehicle: VehicleEntity, vehicleIndex: number): void {
    const surfaceContacts = this.vehicleSurfaceContacts[vehicleIndex];
    if (surfaceContacts === undefined) {
      return;
    }
    const wheelSurfaces = vehicle.physics
      .getWheelGroundColliderHandles()
      .map((handle) => (handle === null ? null : this.arena.surfaceForCollider(handle)));
    const frame = surfaceContacts.step(wheelSurfaces, SIMULATION_CONFIG.fixedTimestepSeconds);
    vehicle.applyAuthoredSurfaceContact(frame, SIMULATION_CONFIG.fixedTimestepSeconds);
  }

  private resetVehicleSurfaceEffects(vehicleIndex: number): void {
    this.vehicleSurfaceContacts[vehicleIndex]?.reset();
    this.vehicles[vehicleIndex]?.clearAuthoredSurfaceEffects();
  }

  private authoredWallContact(vehicle: VehicleEntity): AuthoredWallContact | null {
    const body = vehicle.physics.body;
    let awayNormalX = 0;
    let awayNormalZ = 0;
    let normalCount = 0;
    let penetrationDepth = 0;
    for (let index = 0; index < body.numColliders(); index += 1) {
      const vehicleCollider = body.collider(index);
      this.world.contactPairsWith(vehicleCollider, (otherCollider) => {
        if (!this.arena.isWallCollider(otherCollider.handle)) {
          return;
        }
        const inward = this.arena.wallInwardNormal(
          otherCollider.handle,
          body.translation().x,
          body.translation().z,
        );
        this.world.contactPair(vehicleCollider, otherCollider, (manifold, flipped) => {
          const normal = manifold.normal();
          const awayScale = flipped ? 1 : -1;
          const horizontalLength = Math.hypot(normal.x, normal.z);
          if (inward === null && horizontalLength < 0.1) {
            return;
          }
          awayNormalX += inward?.x ?? (normal.x / horizontalLength) * awayScale;
          awayNormalZ += inward?.z ?? (normal.z / horizontalLength) * awayScale;
          normalCount += 1;
          for (let contactIndex = 0; contactIndex < manifold.numContacts(); contactIndex += 1) {
            penetrationDepth = Math.max(
              penetrationDepth,
              Math.max(0, -manifold.contactDist(contactIndex)),
            );
          }
        });
      });
    }
    if (normalCount === 0 || Math.hypot(awayNormalX, awayNormalZ) < 0.1) {
      return null;
    }
    return { awayNormalX, awayNormalZ, penetrationDepth };
  }

  private authoredGroundDistance(vehicle: VehicleEntity): number | null {
    if (vehicle.physics.currentAirborneSeconds < 0.18) {
      return null;
    }
    const hit = this.world.castRay(
      new this.rapier.Ray(vehicle.physics.body.translation(), { x: 0, y: -1, z: 0 }),
      1.4,
      true,
      this.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      vehicle.physics.body,
      (collider) => this.arena.surfaceForCollider(collider.handle) !== null,
    );
    return hit?.timeOfImpact ?? null;
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

  private emitVehicleDriftSparks(vehicle: VehicleEntity, vehicleIndex: number): void {
    if (!vehicle.physics.isDrifting || this.particleDensityMultiplier <= 0) {
      this.driftSparkEmissionAccumulator[vehicleIndex] = 0;
      return;
    }
    const contactPoints = vehicle.physics.getRearWheelContactPoints();
    if (contactPoints.length === 0) {
      this.driftSparkEmissionAccumulator[vehicleIndex] = 0;
      return;
    }

    const nextAccumulator =
      (this.driftSparkEmissionAccumulator[vehicleIndex] ?? 0) +
      VEHICLE_RUNTIME.drift.sparkRatePerSecond *
        this.particleDensityMultiplier *
        SIMULATION_CONFIG.fixedTimestepSeconds;
    const emitCount = Math.floor(nextAccumulator);
    this.driftSparkEmissionAccumulator[vehicleIndex] = nextAccumulator - emitCount;
    const velocity = vehicle.physics.body.linvel();
    for (let index = 0; index < emitCount; index += 1) {
      const contact = contactPoints[index % contactPoints.length];
      if (contact === undefined) {
        continue;
      }
      const side = index % 2 === 0 ? -1 : 1;
      this.particles.emitDriftSpark(
        { x: contact.x, y: contact.y + 0.04, z: contact.z },
        {
          x: velocity.x * 0.12 + side * 0.9,
          y: 0.7 + (index % 3) * 0.25,
          z: velocity.z * 0.12 - side * 0.55,
        },
        index % 3 === 0,
      );
    }
  }
}
