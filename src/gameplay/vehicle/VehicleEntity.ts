import type { Group } from "three";
import type { World } from "@dimforge/rapier3d";
import type { LogicalAxes } from "../../input/InputHub";
import type { RapierModule } from "../../physics/rapier-init";
import {
  VehiclePhysicsAdapter,
  type AuthoredWallContact,
} from "../../physics/VehiclePhysicsAdapter";
import { PhysicsRenderBinding } from "../../world/PhysicsRenderBinding";
import { VehicleView } from "./VehicleView";
import type { PlayerRecord } from "../player/PlayerRoster";
import type { PlayerSpawnTransform } from "./PlayerVehicleSpawner";
import type { SurfaceContactFrame } from "./SurfaceContactSystem";
import type { TrackSurface } from "../../maps/MapDocument";

export interface VehicleTelemetry {
  readonly playerIndex: number;
  readonly playerNumber: number;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly linearVelocity: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly angularVelocity: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly upAxisY: number;
  readonly speed: number;
  readonly forwardSpeed: number;
  readonly wheelOmega: number;
  readonly engineForce: number;
  readonly steering: number;
  readonly hardBraking: boolean;
  readonly braking: boolean;
  readonly drifting: boolean;
  readonly recoveryCount: number;
  readonly automaticUprightRecoveryCount: number;
  readonly speedImmediatelyAfterRecovery: number;
  readonly recoveryProtectionSeconds: number;
  readonly passengerSurfaceCorrectionCount: number;
  readonly authoredWallStabilizationCount: number;
  readonly authoredWallSeparationCount: number;
  readonly jumpLandingAssistCount: number;
  readonly airborneSeconds: number;
  readonly authoredSurface: TrackSurface | null;
  readonly authoredBoostCount: number;
  readonly authoredBounceCount: number;
  readonly authoredHazardCount: number;
  readonly lastPassengerSurfaceVelocity: {
    readonly x: number;
    readonly z: number;
  };
}

export const AUTOMATIC_UPRIGHT_MINIMUM_SECONDS = 2;
export const AUTOMATIC_UPRIGHT_MAXIMUM_SPEED = 0.15;
export const AUTOMATIC_UPRIGHT_MAXIMUM_ANGULAR_SPEED = 0.5;
export const AUTOMATIC_UPRIGHT_MAXIMUM_UP_AXIS_Y = -0.25;
export const RECOVERY_COLLISION_PROTECTION_SECONDS = 1.25;

export interface VehicleRecoveryPose {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
}

export interface UprightRecoveryState {
  readonly rotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly linearSpeed: number;
  readonly angularSpeed: number;
}

export function shouldAccumulateAutomaticUprightRecovery(state: UprightRecoveryState): boolean {
  const upAxisY = 1 - 2 * (state.rotation.x ** 2 + state.rotation.z ** 2);
  return (
    Number.isFinite(upAxisY) &&
    upAxisY < AUTOMATIC_UPRIGHT_MAXIMUM_UP_AXIS_Y &&
    state.linearSpeed < AUTOMATIC_UPRIGHT_MAXIMUM_SPEED &&
    state.angularSpeed < AUTOMATIC_UPRIGHT_MAXIMUM_ANGULAR_SPEED
  );
}

export class VehicleEntity {
  public readonly player: PlayerRecord;
  public readonly physics: VehiclePhysicsAdapter;
  public readonly view: VehicleView;
  private readonly renderBinding: PhysicsRenderBinding;
  private automaticUprightTimerSeconds = 0;
  private automaticUprightRecoveryCount = 0;
  private recoveryProtectionSeconds = 0;

  public constructor(
    rapier: RapierModule,
    world: World,
    sceneRoot: Group,
    player: PlayerRecord,
    spawn: PlayerSpawnTransform,
  ) {
    this.player = player;
    this.physics = new VehiclePhysicsAdapter(rapier, world, spawn.position, spawn.quaternion);
    this.view = new VehicleView(Number.parseInt(player.color.slice(1), 16));
    sceneRoot.add(this.view.root);
    this.renderBinding = new PhysicsRenderBinding(this.physics.body, this.view.root);
  }

  public prepareFixedStep(input: LogicalAxes, fixedDeltaSeconds: number): void {
    this.advanceRecoveryProtection(fixedDeltaSeconds);
    this.renderBinding.beginFixedStep();
    this.physics.prepareFixedStep(input, fixedDeltaSeconds);
  }

  public applyAuthoredSurfaceContact(frame: SurfaceContactFrame, fixedDeltaSeconds: number): void {
    this.physics.applyAuthoredSurfaceContact(frame, fixedDeltaSeconds);
  }

  public clearAuthoredSurfaceEffects(): void {
    this.physics.clearAuthoredSurfaceEffects();
  }

  public finishFixedStep(
    fixedDeltaSeconds: number,
    automaticUprightRecovery = false,
    recoveryPose: VehicleRecoveryPose | null = null,
  ): boolean {
    this.physics.finishFixedStep(fixedDeltaSeconds);
    if (this.physics.needsRecovery()) {
      if (recoveryPose === null) {
        this.physics.recover();
      } else {
        this.physics.recoverTo(recoveryPose.position, recoveryPose.rotation);
      }
      this.renderBinding.teleportToBody();
      this.automaticUprightTimerSeconds = 0;
      this.beginRecoveryProtection();
      return true;
    }
    if (automaticUprightRecovery && this.updateAutomaticUprightTimer(fixedDeltaSeconds)) {
      this.physics.recoverUpright();
      this.renderBinding.teleportToBody();
      this.automaticUprightTimerSeconds = 0;
      this.automaticUprightRecoveryCount += 1;
      this.beginRecoveryProtection();
      return true;
    }
    if (!automaticUprightRecovery) {
      this.automaticUprightTimerSeconds = 0;
    }
    this.renderBinding.captureAfterFixedStep();
    return false;
  }

  public synchronizeAfterExternalTeleport(): void {
    this.physics.synchronizeAfterExternalTeleport();
    this.renderBinding.teleportToBody();
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
    this.physics.recoverTo(position, rotation);
    this.renderBinding.teleportToBody();
    this.automaticUprightTimerSeconds = 0;
    this.beginRecoveryProtection();
  }

  public get rigidBodyHandle(): number {
    return this.physics.body.handle;
  }

  public get recoveryCollisionProtectionSeconds(): number {
    return this.recoveryProtectionSeconds;
  }

  public render(alpha: number): void {
    this.renderBinding.apply(alpha);
    this.view.renderWheels(this.physics, alpha);
  }

  public resolveAuthoredWallContact(contact: AuthoredWallContact): void {
    if (this.physics.resolveAuthoredWallContact(contact)) {
      this.renderBinding.teleportToBody();
    }
  }

  public assistJumpLanding(groundDistance: number | null): void {
    this.physics.assistJumpLanding(groundDistance);
  }

  public telemetry(): VehicleTelemetry {
    const position = this.physics.body.translation();
    const linearVelocity = this.physics.body.linvel();
    const angularVelocity = this.physics.body.angvel();
    const rotation = this.physics.body.rotation();
    return {
      playerIndex: this.player.index,
      playerNumber: this.player.number,
      color: this.player.color,
      x: position.x,
      y: position.y,
      z: position.z,
      linearVelocity: {
        x: linearVelocity.x,
        y: linearVelocity.y,
        z: linearVelocity.z,
      },
      angularVelocity: {
        x: angularVelocity.x,
        y: angularVelocity.y,
        z: angularVelocity.z,
      },
      upAxisY: 1 - 2 * (rotation.x ** 2 + rotation.z ** 2),
      speed: this.physics.speed,
      forwardSpeed: this.physics.forwardSpeed,
      wheelOmega: this.physics.wheelOmega,
      engineForce: this.physics.engineForce,
      steering: this.physics.steering,
      hardBraking: this.physics.isHardBraking,
      braking: this.physics.isBraking,
      drifting: this.physics.isDrifting,
      recoveryCount: this.physics.recoveryCount,
      automaticUprightRecoveryCount: this.automaticUprightRecoveryCount,
      speedImmediatelyAfterRecovery: this.physics.speedImmediatelyAfterRecovery,
      recoveryProtectionSeconds: this.recoveryProtectionSeconds,
      passengerSurfaceCorrectionCount: this.physics.passengerSurfaceCorrectionCount,
      authoredWallStabilizationCount: this.physics.authoredWallStabilizationCount,
      authoredWallSeparationCount: this.physics.authoredWallSeparationCount,
      jumpLandingAssistCount: this.physics.jumpLandingAssistCount,
      airborneSeconds: this.physics.currentAirborneSeconds,
      authoredSurface: this.physics.currentAuthoredSurface,
      authoredBoostCount: this.physics.authoredBoostCount,
      authoredBounceCount: this.physics.authoredBounceCount,
      authoredHazardCount: this.physics.authoredHazardCount,
      lastPassengerSurfaceVelocity: this.physics.lastPassengerSurfaceVelocity,
    };
  }

  public dispose(): void {
    this.physics.dispose();
    this.view.dispose();
  }

  private updateAutomaticUprightTimer(fixedDeltaSeconds: number): boolean {
    const rotation = this.physics.body.rotation();
    const angularVelocity = this.physics.body.angvel();
    const qualifying = shouldAccumulateAutomaticUprightRecovery({
      rotation,
      linearSpeed: this.physics.speed,
      angularSpeed: Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z),
    });
    this.automaticUprightTimerSeconds = qualifying
      ? this.automaticUprightTimerSeconds + fixedDeltaSeconds
      : 0;
    return this.automaticUprightTimerSeconds >= AUTOMATIC_UPRIGHT_MINIMUM_SECONDS;
  }

  private beginRecoveryProtection(): void {
    this.recoveryProtectionSeconds = RECOVERY_COLLISION_PROTECTION_SECONDS;
    this.physics.setRecoveryCollisionProtection(true);
  }

  private advanceRecoveryProtection(fixedDeltaSeconds: number): void {
    if (this.recoveryProtectionSeconds <= 0) {
      return;
    }
    this.recoveryProtectionSeconds = Math.max(
      0,
      this.recoveryProtectionSeconds - fixedDeltaSeconds,
    );
    if (this.recoveryProtectionSeconds <= 1e-9) {
      this.physics.setRecoveryCollisionProtection(false);
    }
  }
}
