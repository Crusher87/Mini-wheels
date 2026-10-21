import type { World } from "@dimforge/rapier3d";
import {
  AmbientLight,
  type BufferGeometry,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Object3D,
  type Scene,
} from "three";
import type { MapDocument } from "../../maps/MapDocument";
import { COLLISION_GROUPS } from "../../physics/CollisionGroups";
import type { RapierModule } from "../../physics/rapier-init";

/** Distance of the default key light; keeps every authored direction inside the shadow camera. */
const KEY_LIGHT_DISTANCE = Math.hypot(-26, 42, 18);

/** Places a directional light along an authored direction at a shadow-safe distance. */
export function placeKeyLight(
  light: DirectionalLight,
  direction: readonly [number, number, number],
): void {
  light.position.fromArray(direction);
  if (light.position.lengthSq() < 1e-6) {
    light.position.set(-26, 42, 18);
  }
  light.position.setLength(KEY_LIGHT_DISTANCE);
}

export interface EnvironmentDebugSnapshot {
  readonly groundMode: "ground" | "void";
  readonly skyPreset: MapDocument["environment"]["skyPreset"];
  readonly fogEnabled: boolean;
  readonly gravity: MapDocument["environment"]["gravity"];
  readonly musicAssetId: string | null;
  readonly outOfBoundsHeight: number;
}

/** Owns every map-level visual and physical environment override. */
export class EnvironmentSession {
  public readonly root = new Group();
  private readonly previousBackground: Scene["background"] | undefined;
  private readonly previousFog: Scene["fog"] | undefined;
  private readonly groundBody: ReturnType<World["createRigidBody"]> | null;
  private readonly scene: Scene | null;
  private disposed = false;

  public constructor(
    private readonly rapier: RapierModule,
    private readonly world: World,
    parent: Object3D,
    private readonly environment: MapDocument["environment"],
  ) {
    this.scene = parent.type === "Scene" ? (parent as Scene) : null;
    this.previousBackground = this.scene?.background;
    this.previousFog = this.scene?.fog;
    this.root.name = "authored-environment-session";
    parent.add(this.root);

    if (this.scene !== null) {
      this.scene.background = new Color(environment.backgroundColor);
      this.scene.fog = environment.fog.enabled
        ? new Fog(environment.fog.color, environment.fog.near, environment.fog.far)
        : null;
    }

    const key = new DirectionalLight(environment.keyLight.color, environment.keyLight.intensity);
    key.name = "authored-key-light";
    placeKeyLight(key, environment.keyLight.direction);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -45;
    key.shadow.camera.right = 45;
    key.shadow.camera.top = 45;
    key.shadow.camera.bottom = -45;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 160;
    this.root.add(key);

    const ambient = new AmbientLight(
      environment.ambientLight.color,
      environment.ambientLight.intensity,
    );
    ambient.name = "authored-ambient-light";
    this.root.add(ambient);

    if (environment.groundMode === "ground") {
      const geometry = new BoxGeometry(400, 1, 400);
      const color = new Color(environment.backgroundColor).lerp(new Color(0xdde7ed), 0.75);
      const material = new MeshStandardMaterial({ color, roughness: 0.95 });
      const mesh = new Mesh(geometry, material);
      mesh.name = "authored-environment-ground";
      mesh.position.y = -1;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.groundBody = world.createRigidBody(
        rapier.RigidBodyDesc.fixed().setTranslation(0, -1, 0),
      );
      world.createCollider(
        rapier.ColliderDesc.cuboid(200, 0.5, 200)
          .setFriction(0.9)
          .setRestitution(0.02)
          .setCollisionGroups(COLLISION_GROUPS.ground),
        this.groundBody,
      );
    } else {
      this.groundBody = null;
    }
  }

  public debugSnapshot(): EnvironmentDebugSnapshot {
    return Object.freeze({
      groundMode: this.environment.groundMode,
      skyPreset: this.environment.skyPreset,
      fogEnabled: this.environment.fog.enabled,
      gravity: this.environment.gravity,
      musicAssetId: this.environment.musicAssetId,
      outOfBoundsHeight: this.environment.outOfBoundsHeight,
    });
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.scene !== null) {
      this.scene.background = this.previousBackground ?? null;
      this.scene.fog = this.previousFog ?? null;
    }
    this.root.traverse((object) => {
      if (object instanceof Mesh) {
        const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          material.dispose();
        }
      }
      if (object instanceof DirectionalLight) {
        object.shadow.dispose();
      }
    });
    if (this.groundBody !== null && this.groundBody.isValid()) {
      this.world.removeRigidBody(this.groundBody);
    }
    this.root.removeFromParent();
    this.root.clear();
  }
}
