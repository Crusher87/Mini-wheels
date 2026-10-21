import type { RigidBody, RigidBodyHandle } from "@dimforge/rapier3d";
import type { AuthoredSurfaceContact } from "../gameplay/vehicle/SurfaceContactSystem";
import type { InteractionAction } from "../maps/MapDocument";
import type { SandboxArenaDebugSnapshot } from "./SandboxArena";

export interface AuthoredRecoveryTarget {
  readonly volumeEntityId: string;
  readonly poseEntityId: string;
  readonly delaySeconds: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
}

export interface AuthoredRaceTrigger {
  readonly kind: "checkpoint" | "finish";
  readonly entityId: string;
  readonly forward: { readonly x: number; readonly y: number; readonly z: number };
  readonly recoveryPosition: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null;
  readonly recoveryRotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  } | null;
}

export interface WallInwardNormal {
  readonly x: number;
  readonly z: number;
}

export interface WorldArena {
  readonly cubeBodies: readonly RigidBody[];
  readonly ballBodies: readonly RigidBody[];
  beginFixedStep(): void;
  finishFixedStep(deltaSeconds?: number): readonly RigidBodyHandle[];
  /** Authored maps only: switches a point light or color strip from a WHEN → DO link. */
  applyDecorationAction?(entityId: string, action: InteractionAction): boolean;
  /** Authored maps only: whether a decoration is switched on and visible, or null if unknown. */
  decorationLit?(entityId: string): boolean | null;
  render(alpha: number): void;
  synchronizeAfterExternalTeleport(bodyHandle: RigidBodyHandle): boolean;
  isWallCollider(colliderHandle: number): boolean;
  wallInwardNormal(colliderHandle: number, x: number, z: number): WallInwardNormal | null;
  surfaceForCollider(colliderHandle: number): AuthoredSurfaceContact | null;
  recoveryForCollider(colliderHandle: number): AuthoredRecoveryTarget | null;
  raceTriggerForCollider(colliderHandle: number): AuthoredRaceTrigger | null;
  debugSnapshot(): SandboxArenaDebugSnapshot;
  dispose(): void;
}
