import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { VEHICLE_SOURCE_REFERENCE } from "../../config/source-reference";
import type { VehiclePhysicsAdapter } from "../../physics/VehiclePhysicsAdapter";

interface WheelVisual {
  readonly steer: Group;
  readonly spin: Group;
}

export class VehicleView {
  public readonly root = new Group();
  private readonly geometries: Array<BoxGeometry | CylinderGeometry> = [];
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly wheels: WheelVisual[] = [];

  public constructor(color: number) {
    this.root.name = "vehicle-view";

    const bodyGeometry = new BoxGeometry(1, 1, 1);
    const bodyMaterial = new MeshStandardMaterial({
      color,
      roughness: 0.82,
      metalness: 0,
    });
    this.geometries.push(bodyGeometry);
    this.materials.push(bodyMaterial);

    this.addBodyPart(bodyGeometry, bodyMaterial, [0.5, 0.19, 1], [0, 0.083, 0]);
    this.addBodyPart(bodyGeometry, bodyMaterial, [0.5, 0.19, 0.44], [0, 0.229, -0.138]);
    this.addBodyPart(bodyGeometry, bodyMaterial, [0.2468, 0.19, 0.6993], [0, 0.009, 0]);

    const wheelGeometry = new CylinderGeometry(
      VEHICLE_SOURCE_REFERENCE.wheel.radius,
      VEHICLE_SOURCE_REFERENCE.wheel.radius,
      0.1,
      10,
    );
    const wheelMaterial = new MeshStandardMaterial({
      color,
      roughness: 0.92,
      metalness: 0,
    });
    this.geometries.push(wheelGeometry);
    this.materials.push(wheelMaterial);

    for (const center of VEHICLE_SOURCE_REFERENCE.wheel.centers) {
      const steer = new Group();
      const spin = new Group();
      const wheel = new Mesh(wheelGeometry, wheelMaterial);
      steer.position.set(
        center.x,
        center.y - VEHICLE_SOURCE_REFERENCE.wheel.suspensionDistance / 2,
        center.z,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      spin.add(wheel);
      steer.add(spin);
      this.root.add(steer);
      this.wheels.push({ steer, spin });
    }
  }

  public renderWheels(physics: VehiclePhysicsAdapter, alpha: number): void {
    for (let index = 0; index < this.wheels.length; index += 1) {
      const wheel = this.wheels[index];
      if (wheel === undefined) {
        continue;
      }
      const pose = physics.getWheelPose(index, alpha);
      wheel.steer.position.set(pose.x, pose.y, pose.z);
      wheel.steer.rotation.y = pose.steering;
      wheel.spin.rotation.x = pose.rotation;
    }
  }

  public dispose(): void {
    this.root.removeFromParent();
    this.root.clear();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
  }

  private addBodyPart(
    geometry: BoxGeometry,
    material: MeshStandardMaterial,
    scale: readonly [number, number, number],
    position: readonly [number, number, number],
  ): void {
    const mesh = new Mesh(geometry, material);
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }
}
