import { Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import type { RigidBody } from "@dimforge/rapier3d";

export interface TransformSnapshot {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

export class PhysicsRenderBinding {
  private readonly previousPosition = new Vector3();
  private readonly currentPosition = new Vector3();
  private readonly previousRotation = new Quaternion();
  private readonly currentRotation = new Quaternion();

  public constructor(
    private readonly body: RigidBody,
    private readonly object: Object3D,
  ) {
    this.teleportToBody();
  }

  public beginFixedStep(): void {
    this.previousPosition.copy(this.currentPosition);
    this.previousRotation.copy(this.currentRotation);
  }

  public captureAfterFixedStep(): void {
    const position = this.body.translation();
    const rotation = this.body.rotation();
    this.currentPosition.set(position.x, position.y, position.z);
    this.currentRotation.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  }

  public teleportToBody(): void {
    this.captureAfterFixedStep();
    this.previousPosition.copy(this.currentPosition);
    this.previousRotation.copy(this.currentRotation);
    this.apply(1);
  }

  public apply(alpha: number): void {
    const safeAlpha = Math.min(Math.max(alpha, 0), 1);
    this.object.position.lerpVectors(this.previousPosition, this.currentPosition, safeAlpha);
    this.object.quaternion.slerpQuaternions(this.previousRotation, this.currentRotation, safeAlpha);
  }

  public snapshot(): TransformSnapshot {
    return {
      position: this.currentPosition.clone(),
      rotation: this.currentRotation.clone(),
    };
  }
}
