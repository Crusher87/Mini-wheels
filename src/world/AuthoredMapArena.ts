import type { RigidBody, RigidBodyHandle, World } from "@dimforge/rapier3d";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import type { Material, Object3D } from "three";
import {
  WEDGE_INDICES,
  editorAssetEntityDimensions,
  editorAssetManifest,
  freeformFloorOutline,
  freeformPlatformPrism,
  regularPolygonPrism,
  roundedPlatformPrism,
  trackCornerPrism,
  tunnelComponentLayout,
  wedgeVertices,
} from "../editor/EditorAssetCatalog";
import type { AuthoredSurfaceContact } from "../gameplay/vehicle/SurfaceContactSystem";
import type { RuntimeMapBlueprint } from "../maps/MapCompiler";
import type { InteractionAction, MapEntity, TrackSurface } from "../maps/MapDocument";
import { COLLISION_GROUPS } from "../physics/CollisionGroups";
import type { RapierModule } from "../physics/rapier-init";
import { buildRuntimeTrack } from "../tracks/TrackRuntimeBuilder";
import { createTrackPatternTexture, trackMaterialAppearance } from "../tracks/TrackAppearance";
import { PhysicsRenderBinding } from "./PhysicsRenderBinding";
import type { SandboxArenaDebugSnapshot, SandboxPropDebugTransform } from "./SandboxArena";
import type { WorldArena } from "./WorldArena";
import type { AuthoredRaceTrigger, AuthoredRecoveryTarget } from "./WorldArena";
import type { WallInwardNormal } from "./WorldArena";

interface WallGuideSample {
  readonly x: number;
  readonly z: number;
  readonly inwardX: number;
  readonly inwardZ: number;
}

const DECORATION_PULSE_SECONDS = 0.45;
/** Rows of a start grid sit this many slot-spacings apart, leaving room for car length. */
const START_GRID_ROW_SPACING_FACTOR = 1.6;

/** Switchable state for a point light or color strip driven by WHEN → DO links. */
interface DecorationRuntime {
  readonly group: Group;
  readonly glowMaterials: readonly {
    readonly material: MeshStandardMaterial;
    readonly onIntensity: number;
  }[];
  light: PointLight | null;
  lightIntensity: number;
  readonly initiallyEnabled: boolean;
  enabled: boolean;
  pulseRemainingSeconds: number;
}

function applyDecorationLighting(decoration: DecorationRuntime): void {
  const pulsing = decoration.pulseRemainingSeconds > 0;
  const lit = decoration.enabled || pulsing;
  const boost = pulsing ? 1.8 : 1;
  for (const { material, onIntensity } of decoration.glowMaterials) {
    material.emissiveIntensity = lit ? onIntensity * boost : 0;
    material.opacity = lit ? 1 : 0.45;
  }
  if (decoration.light !== null) {
    decoration.light.intensity = lit ? decoration.lightIntensity * boost : 0;
  }
}

interface AuthoredDynamicRuntime {
  readonly body: RigidBody;
  readonly binding: PhysicsRenderBinding;
  readonly initialPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly initialRotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
}

export class AuthoredMapArena implements WorldArena {
  public readonly root = new Group();

  private readonly fixedBody: RigidBody;
  private readonly authoredCubeBodies: RigidBody[] = [];
  private readonly authoredBallBodies: RigidBody[] = [];
  private readonly dynamicRuntimes: AuthoredDynamicRuntime[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly wallColliderHandles = new Set<number>();
  private readonly wallGuides = new Map<number, readonly WallGuideSample[]>();
  private readonly surfaceByColliderHandle = new Map<number, AuthoredSurfaceContact>();
  private readonly recoveryByColliderHandle = new Map<number, AuthoredRecoveryTarget>();
  private readonly raceTriggerByColliderHandle = new Map<number, AuthoredRaceTrigger>();
  private readonly decorations = new Map<string, DecorationRuntime>();
  private colliderCount = 0;
  private guidanceVisualCount = 0;
  private guidanceColliderCount = 0;
  private decorationVisualCount = 0;
  private pointLightCount = 0;
  private disposed = false;

  public constructor(
    private readonly rapier: RapierModule,
    private readonly world: World,
    private readonly parent: Object3D,
    private readonly blueprint: RuntimeMapBlueprint,
  ) {
    this.root.name = "authored-map-arena";
    this.parent.add(this.root);
    this.fixedBody = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed());
    for (const entity of blueprint.entities) {
      const manifest = editorAssetManifest(entity.assetId);
      if (manifest?.renderKind === "start-grid") {
        this.createStartGrid(entity);
      } else if (manifest?.renderKind === "race-marker") {
        this.createRaceMarker(entity);
      } else if (
        manifest?.renderKind === "surface-pad" &&
        entity.assetId.startsWith("interaction.")
      ) {
        this.createRaceMarker(entity);
      } else if (
        manifest?.renderKind === "direction-arrow" ||
        manifest?.renderKind === "arrow-sign"
      ) {
        this.createGuidanceObject(entity);
      } else if (manifest?.renderKind === "point-light" || manifest?.renderKind === "color-strip") {
        this.createDecorationObject(entity);
      } else if (manifest?.physicsClass === "dynamic") {
        this.createDynamicConstruction(entity);
      } else if (manifest?.physicsClass === "static") {
        this.createStaticConstruction(entity);
      }
    }
    const preliminaryBuilds = blueprint.tracks.map((track) => buildRuntimeTrack(track));
    for (const [trackIndex, track] of blueprint.tracks.entries()) {
      const externalRoadSections = preliminaryBuilds.flatMap((build, buildIndex) =>
        buildIndex === trackIndex ? [] : build.sections,
      );
      const build = buildRuntimeTrack(track, 16, externalRoadSections);
      for (const chunk of build.roadChunks) {
        const geometry = geometryFrom(
          chunk.vertices,
          chunk.indices,
          roadUvs(chunk.vertices, chunk.startDistance, chunk.endDistance),
        );
        const material = roadMaterial(chunk.materialId);
        this.geometries.push(geometry);
        this.materials.push(material);
        const mesh = new Mesh(geometry, material);
        mesh.name = `runtime-track:${track.id}`;
        mesh.receiveShadow = true;
        this.root.add(mesh);
        const collider = this.rapier.ColliderDesc.trimesh(
          chunk.vertices,
          chunk.indices,
          this.rapier.TriMeshFlags.FIX_INTERNAL_EDGES,
        )
          .setFriction(surfaceFriction(chunk.surface))
          .setRestitution(surfaceRestitution(chunk.surface))
          .setCollisionGroups(COLLISION_GROUPS.ground);
        const roadCollider = this.world.createCollider(collider, this.fixedBody);
        this.surfaceByColliderHandle.set(
          roadCollider.handle,
          Object.freeze({
            surface: chunk.surface,
            strength: chunk.surfaceStrength,
            cooldownSeconds: chunk.surfaceCooldownSeconds,
          }),
        );
        this.colliderCount += 1;
      }
      for (const wall of build.wallChunks) {
        const geometry = geometryFrom(wall.vertices, wall.indices);
        const material = wallMaterial(wall.styleId);
        this.geometries.push(geometry);
        this.materials.push(material);
        const mesh = new Mesh(geometry, material);
        mesh.name = `runtime-wall:${track.id}:${wall.side}`;
        this.root.add(mesh);
        const collider = this.rapier.ColliderDesc.trimesh(
          wall.vertices,
          wall.collisionIndices,
          this.rapier.TriMeshFlags.FIX_INTERNAL_EDGES,
        )
          .setFriction(0.04)
          .setFrictionCombineRule(this.rapier.CoefficientCombineRule.Min)
          .setRestitution(0)
          .setRestitutionCombineRule(this.rapier.CoefficientCombineRule.Min)
          .setContactSkin(0.015)
          .setCollisionGroups(COLLISION_GROUPS.staticObstacle);
        const wallCollider = this.world.createCollider(collider, this.fixedBody);
        this.wallColliderHandles.add(wallCollider.handle);
        this.wallGuides.set(wallCollider.handle, wallGuideSamples(wall.vertices));
        this.colliderCount += 1;
      }
    }
  }

  public get cubeBodies(): readonly RigidBody[] {
    return this.authoredCubeBodies;
  }

  public get ballBodies(): readonly RigidBody[] {
    return this.authoredBallBodies;
  }

  public beginFixedStep(): void {
    for (const runtime of this.dynamicRuntimes) {
      runtime.binding.beginFixedStep();
    }
  }

  public finishFixedStep(deltaSeconds = 0): readonly RigidBodyHandle[] {
    for (const decoration of this.decorations.values()) {
      if (decoration.pulseRemainingSeconds > 0) {
        decoration.pulseRemainingSeconds = Math.max(
          0,
          decoration.pulseRemainingSeconds - deltaSeconds,
        );
        if (decoration.pulseRemainingSeconds === 0) {
          applyDecorationLighting(decoration);
        }
      }
    }
    const recoveredHandles: number[] = [];
    for (const runtime of this.dynamicRuntimes) {
      runtime.binding.captureAfterFixedStep();
      const position = runtime.body.translation();
      if (
        position.y < this.blueprint.environment.outOfBoundsHeight ||
        !Number.isFinite(position.x + position.y + position.z)
      ) {
        runtime.body.setTranslation(runtime.initialPosition, false);
        runtime.body.setRotation(runtime.initialRotation, false);
        runtime.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        runtime.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        runtime.binding.teleportToBody();
        recoveredHandles.push(runtime.body.handle);
      }
    }
    return recoveredHandles;
  }

  public render(alpha: number): void {
    for (const runtime of this.dynamicRuntimes) {
      runtime.binding.apply(alpha);
    }
  }

  public synchronizeAfterExternalTeleport(bodyHandle: RigidBodyHandle): boolean {
    const runtime = this.dynamicRuntimes.find((candidate) => candidate.body.handle === bodyHandle);
    if (runtime === undefined) {
      return false;
    }
    runtime.binding.teleportToBody();
    return true;
  }

  public isWallCollider(colliderHandle: number): boolean {
    return this.wallColliderHandles.has(colliderHandle);
  }

  public wallInwardNormal(colliderHandle: number, x: number, z: number): WallInwardNormal | null {
    const samples = this.wallGuides.get(colliderHandle);
    if (samples === undefined || samples.length === 0) {
      return null;
    }
    let nearest = samples[0]!;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const sample of samples) {
      const distance = (sample.x - x) ** 2 + (sample.z - z) ** 2;
      if (distance < nearestDistance) {
        nearest = sample;
        nearestDistance = distance;
      }
    }
    return { x: nearest.inwardX, z: nearest.inwardZ };
  }

  public surfaceForCollider(colliderHandle: number): AuthoredSurfaceContact | null {
    return this.surfaceByColliderHandle.get(colliderHandle) ?? null;
  }

  public recoveryForCollider(colliderHandle: number): AuthoredRecoveryTarget | null {
    return this.recoveryByColliderHandle.get(colliderHandle) ?? null;
  }

  public raceTriggerForCollider(colliderHandle: number): AuthoredRaceTrigger | null {
    return this.raceTriggerByColliderHandle.get(colliderHandle) ?? null;
  }

  public debugSnapshot(): SandboxArenaDebugSnapshot {
    return {
      dynamicBodyCount: this.dynamicRuntimes.length,
      cubeCount: this.authoredCubeBodies.length,
      ballCount: this.authoredBallBodies.length,
      staticBodyCount: 1,
      cubeVisualBatchCount: 0,
      cubes: this.dynamicDebugSnapshots(this.authoredCubeBodies),
      balls: this.dynamicDebugSnapshots(this.authoredBallBodies),
      guidanceVisualCount: this.guidanceVisualCount,
      guidanceColliderCount: this.guidanceColliderCount,
      decorationVisualCount: this.decorationVisualCount,
      pointLightCount: this.pointLightCount,
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      if (material instanceof MeshStandardMaterial) {
        material.map?.dispose();
      }
      material.dispose();
    }
    this.parent.remove(this.root);
    this.root.clear();
    for (const runtime of this.dynamicRuntimes) {
      this.world.removeRigidBody(runtime.body);
    }
    this.dynamicRuntimes.length = 0;
    this.authoredCubeBodies.length = 0;
    this.authoredBallBodies.length = 0;
    this.wallGuides.clear();
    this.world.removeRigidBody(this.fixedBody);
  }

  private createDynamicConstruction(entity: MapEntity): void {
    const dimensions = editorAssetEntityDimensions(entity);
    if (dimensions === null) {
      return;
    }
    const width = dimensions.width * Math.abs(entity.transform.scale[0]);
    const height = dimensions.height * Math.abs(entity.transform.scale[1]);
    const depth = dimensions.depth * Math.abs(entity.transform.scale[2]);
    const sphere = entity.assetId === "physics.ball";
    const geometry = sphere
      ? new SphereGeometry(width / 2, 28, 18)
      : new BoxGeometry(width, height, depth);
    const color = colorProperty(entity, "color", sphere ? "#ff9f2f" : "#a96cff");
    const material = new MeshStandardMaterial({
      color,
      roughness: 0.68,
      metalness: 0.06,
    });
    this.geometries.push(geometry);
    this.materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.name = `runtime-dynamic:${entity.id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    const [positionX, positionY, positionZ] = entity.transform.position;
    const [rotationX, rotationY, rotationZ, rotationW] = entity.transform.rotation;
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(positionX, positionY, positionZ)
        .setRotation({ x: rotationX, y: rotationY, z: rotationZ, w: rotationW })
        .setLinearDamping(0.08)
        .setAngularDamping(0.12)
        .setCcdEnabled(true),
    );
    const collider = sphere
      ? this.rapier.ColliderDesc.ball(width / 2)
      : this.rapier.ColliderDesc.cuboid(width / 2, height / 2, depth / 2);
    collider
      .setMass(numberProperty(entity, "mass", sphere ? 2 : 3))
      .setFriction(numberProperty(entity, "friction", sphere ? 0.7 : 0.85))
      .setRestitution(numberProperty(entity, "restitution", sphere ? 0.65 : 0.2))
      .setCollisionGroups(COLLISION_GROUPS.dynamicToy);
    this.world.createCollider(collider, body);
    this.colliderCount += 1;

    const runtime: AuthoredDynamicRuntime = {
      body,
      binding: new PhysicsRenderBinding(body, mesh),
      initialPosition: Object.freeze({ x: positionX, y: positionY, z: positionZ }),
      initialRotation: Object.freeze({
        x: rotationX,
        y: rotationY,
        z: rotationZ,
        w: rotationW,
      }),
    };
    this.dynamicRuntimes.push(runtime);
    if (sphere) {
      this.authoredBallBodies.push(body);
    } else {
      this.authoredCubeBodies.push(body);
    }
  }

  private dynamicDebugSnapshots(bodies: readonly RigidBody[]): SandboxPropDebugTransform[] {
    return bodies.map((body, index) => {
      const runtime = this.dynamicRuntimes.find((candidate) => candidate.body === body)!;
      const position = body.translation();
      const rotation = body.rotation();
      const linearVelocity = body.linvel();
      const angularVelocity = body.angvel();
      return {
        index,
        bodyHandle: body.handle,
        authoredPosition: runtime.initialPosition,
        currentPosition: { x: position.x, y: position.y, z: position.z },
        currentRotation: {
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w,
        },
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
      };
    });
  }

  private createStaticConstruction(entity: MapEntity): void {
    const manifest = editorAssetManifest(entity.assetId);
    const dimensions = editorAssetEntityDimensions(entity);
    if (manifest === null || dimensions === null) {
      return;
    }
    if (manifest.renderKind === "tunnel") {
      this.createStaticTunnel(entity);
      return;
    }
    const width = dimensions.width * entity.transform.scale[0];
    const height = dimensions.height * entity.transform.scale[1];
    const depth = dimensions.depth * entity.transform.scale[2];
    const color = colorProperty(entity, "color", "#dfe8ee");
    const wedgePositions =
      manifest.renderKind === "wedge" ? wedgeVertices(width, height, depth) : null;
    const prism =
      manifest.renderKind === "rounded-prism"
        ? roundedPlatformPrism(
            width,
            height,
            depth,
            numberProperty(entity, "cornerRadius", 1.5) *
              Math.min(entity.transform.scale[0], entity.transform.scale[2]),
          )
        : manifest.renderKind === "polygon-prism"
          ? regularPolygonPrism(width, height, depth, numberProperty(entity, "sides", 6))
          : manifest.renderKind === "freeform-prism"
            ? freeformPlatformPrism(
                freeformFloorOutline(entity).map(
                  ([x, z]) =>
                    [x * entity.transform.scale[0], z * entity.transform.scale[2]] as const,
                ),
                height,
              )
            : manifest.renderKind === "quarter-turn-prism"
              ? scaledPrism(
                  trackCornerPrism(
                    numberProperty(entity, "radius", 8),
                    numberProperty(entity, "width", 5),
                    dimensions.height,
                  ),
                  entity.transform.scale[0],
                  entity.transform.scale[1],
                  entity.transform.scale[2],
                )
              : null;
    const convexPositions = wedgePositions ?? prism?.vertices ?? null;
    const geometry =
      manifest.renderKind === "column" || manifest.renderKind === "disc"
        ? new CylinderGeometry(
            width / 2,
            width / 2,
            height,
            manifest.renderKind === "disc" ? 40 : 24,
          )
        : wedgePositions !== null
          ? geometryFrom(wedgePositions, new Uint32Array(WEDGE_INDICES))
          : prism !== null
            ? geometryFrom(prism.vertices, prism.indices)
            : new BoxGeometry(width, height, depth);
    const material = new MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness:
        entity.assetId === "track.barrier" || entity.assetId === "track.guard-rail" ? 0.25 : 0,
      emissive: entity.assetId === "floor.void-base" ? color : 0x000000,
      emissiveIntensity: entity.assetId === "floor.void-base" ? 0.12 : 0,
      side: DoubleSide,
    });
    this.geometries.push(geometry);
    this.materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.position.fromArray(entity.transform.position);
    mesh.quaternion.fromArray(entity.transform.rotation);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    const [x, y, z, w] = entity.transform.rotation;
    let collider;
    if (manifest.colliderKind === "trimesh" && prism !== null) {
      collider = this.rapier.ColliderDesc.trimesh(
        prism.vertices,
        prism.indices,
        this.rapier.TriMeshFlags.FIX_INTERNAL_EDGES,
      );
    } else if (manifest.colliderKind === "cylinder") {
      collider = this.rapier.ColliderDesc.cylinder(height / 2, width / 2);
    } else if (manifest.colliderKind === "convex-hull" && convexPositions !== null) {
      collider = this.rapier.ColliderDesc.convexHull(convexPositions);
      if (collider === null) {
        throw new Error(`The ${manifest.id} points did not form a convex hull.`);
      }
    } else {
      collider = this.rapier.ColliderDesc.cuboid(width / 2, height / 2, depth / 2);
    }
    const isWallLike = entity.assetId === "track.barrier" || entity.assetId === "track.guard-rail";
    collider
      .setTranslation(...entity.transform.position)
      .setRotation({ x, y, z, w })
      .setFriction(1)
      .setRestitution(0.02)
      .setCollisionGroups(isWallLike ? COLLISION_GROUPS.staticObstacle : COLLISION_GROUPS.ground);
    const floorCollider = this.world.createCollider(collider, this.fixedBody);
    this.surfaceByColliderHandle.set(
      floorCollider.handle,
      Object.freeze({ surface: "normal", strength: 1, cooldownSeconds: 0.35 }),
    );
    if (isWallLike) {
      this.wallColliderHandles.add(floorCollider.handle);
    }
    this.colliderCount += 1;
  }

  private createGuidanceObject(entity: MapEntity): void {
    const dimensions = editorAssetEntityDimensions(entity);
    if (dimensions === null) {
      return;
    }
    const group = new Group();
    group.name = `runtime-guidance:${entity.id}`;
    group.position.fromArray(entity.transform.position);
    group.quaternion.fromArray(entity.transform.rotation);
    group.scale.fromArray(entity.transform.scale);
    this.root.add(group);
    this.guidanceVisualCount += 1;
    const color = colorProperty(entity, "color", "#f7e44d");
    const glow = numberProperty(entity, "glow", 0.5);
    const addMesh = (
      geometry: BufferGeometry,
      material: MeshStandardMaterial,
      position: readonly [number, number, number],
    ): Mesh => {
      this.geometries.push(geometry);
      this.materials.push(material);
      const mesh = new Mesh(geometry, material);
      mesh.position.fromArray(position);
      group.add(mesh);
      return mesh;
    };
    const arrowMaterial = () =>
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: glow,
        roughness: 0.65,
      });
    if (entity.assetId === "travel.direction-arrow") {
      addMesh(
        new BoxGeometry(dimensions.width * 0.3, dimensions.height, dimensions.depth * 0.62),
        arrowMaterial(),
        [0, 0, -dimensions.depth * 0.12],
      );
      for (const side of [-1, 1]) {
        const head = addMesh(
          new BoxGeometry(dimensions.width * 0.28, dimensions.height, dimensions.depth * 0.45),
          arrowMaterial(),
          [side * dimensions.width * 0.2, 0, dimensions.depth * 0.27],
        );
        head.rotation.y = side * -0.62;
      }
      return;
    }

    const boardHeight = numberProperty(entity, "boardHeight", 2);
    const postHeight = numberProperty(entity, "postHeight", 2.5);
    const thickness = numberProperty(entity, "thickness", 0.25);
    const totalHeight = boardHeight + postHeight;
    const boardCenterY = -totalHeight / 2 + postHeight + boardHeight / 2;
    const postCenterY = -totalHeight / 2 + postHeight / 2;
    addMesh(new BoxGeometry(dimensions.width, boardHeight, thickness), arrowMaterial(), [
      0,
      boardCenterY,
      0,
    ]);
    const postWidth = Math.max(0.12, dimensions.width * 0.1);
    addMesh(
      new BoxGeometry(postWidth, postHeight, Math.max(0.12, thickness * 0.7)),
      new MeshStandardMaterial({ color: 0x52677b, roughness: 0.82 }),
      [0, postCenterY, 0],
    );
    const white = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.25,
    });
    const arrowY = boardCenterY;
    const arrowZ = thickness / 2 + 0.02;
    addMesh(new BoxGeometry(dimensions.width * 0.42, boardHeight * 0.22, 0.05), white, [
      0,
      arrowY,
      arrowZ,
    ]);
    for (const side of [-1, 1]) {
      const head = addMesh(
        new BoxGeometry(dimensions.width * 0.28, boardHeight * 0.18, 0.05),
        white.clone(),
        [dimensions.width * 0.22, arrowY + side * boardHeight * 0.13, arrowZ],
      );
      head.rotation.z = side * 0.65;
    }
    if (entity.properties["solid"] !== true) {
      return;
    }
    const rotation = new Quaternion().fromArray(entity.transform.rotation);
    const addCollider = (
      size: readonly [number, number, number],
      localPosition: readonly [number, number, number],
    ) => {
      const worldOffset = new Vector3(
        localPosition[0] * entity.transform.scale[0],
        localPosition[1] * entity.transform.scale[1],
        localPosition[2] * entity.transform.scale[2],
      ).applyQuaternion(rotation);
      const [rotationX, rotationY, rotationZ, rotationW] = entity.transform.rotation;
      const collider = this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(
          (size[0] * Math.abs(entity.transform.scale[0])) / 2,
          (size[1] * Math.abs(entity.transform.scale[1])) / 2,
          (size[2] * Math.abs(entity.transform.scale[2])) / 2,
        )
          .setTranslation(
            entity.transform.position[0] + worldOffset.x,
            entity.transform.position[1] + worldOffset.y,
            entity.transform.position[2] + worldOffset.z,
          )
          .setRotation({ x: rotationX, y: rotationY, z: rotationZ, w: rotationW })
          .setFriction(0.2)
          .setRestitution(0.02)
          .setCollisionGroups(COLLISION_GROUPS.staticObstacle),
        this.fixedBody,
      );
      this.wallColliderHandles.add(collider.handle);
      this.colliderCount += 1;
      this.guidanceColliderCount += 1;
    };
    addCollider([dimensions.width, boardHeight, thickness], [0, boardCenterY, 0]);
    addCollider([postWidth, postHeight, Math.max(0.12, thickness * 0.7)], [0, postCenterY, 0]);
  }

  private createDecorationObject(entity: MapEntity): void {
    const dimensions = editorAssetEntityDimensions(entity);
    if (dimensions === null) {
      return;
    }
    const group = new Group();
    group.name = `runtime-decoration:${entity.id}`;
    group.position.fromArray(entity.transform.position);
    group.quaternion.fromArray(entity.transform.rotation);
    group.scale.fromArray(entity.transform.scale);
    this.root.add(group);
    this.decorationVisualCount += 1;
    const color = colorProperty(entity, "color", "#35d5df");
    const enabled = entity.properties["enabled"] !== false;
    const glowMaterials: { material: MeshStandardMaterial; onIntensity: number }[] = [];
    const runtime: DecorationRuntime = {
      group,
      glowMaterials,
      light: null,
      lightIntensity: 0,
      initiallyEnabled: enabled,
      enabled,
      pulseRemainingSeconds: 0,
    };
    this.decorations.set(entity.id, runtime);
    const addMesh = (
      geometry: BufferGeometry,
      material: MeshStandardMaterial,
      position: readonly [number, number, number],
    ) => {
      this.geometries.push(geometry);
      this.materials.push(material);
      const mesh = new Mesh(geometry, material);
      mesh.position.fromArray(position);
      group.add(mesh);
      return mesh;
    };
    if (entity.assetId === "decoration.color-strip") {
      const glow = numberProperty(entity, "glow", 0.8);
      const stripMaterial = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: enabled ? glow : 0,
        opacity: enabled ? 1 : 0.45,
        transparent: true,
      });
      glowMaterials.push({ material: stripMaterial, onIntensity: glow });
      addMesh(
        new BoxGeometry(dimensions.width, dimensions.height, dimensions.depth),
        stripMaterial,
        [0, 0, 0],
      );
      return;
    }
    const bulbSize = numberProperty(entity, "bulbSize", 0.6);
    const bulbCenterY = dimensions.height / 2 - bulbSize / 2;
    const postHeight = Math.max(0.2, dimensions.height - bulbSize * 0.75);
    addMesh(
      new CylinderGeometry(bulbSize * 0.16, bulbSize * 0.22, postHeight, 12),
      new MeshStandardMaterial({ color: 0x52677b, roughness: 0.82 }),
      [0, -dimensions.height / 2 + postHeight / 2, 0],
    );
    const intensity = numberProperty(entity, "intensity", 4);
    const bulbGlow = Math.min(2, 0.35 + intensity * 0.15);
    const bulbMaterial = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: enabled ? bulbGlow : 0,
    });
    glowMaterials.push({ material: bulbMaterial, onIntensity: bulbGlow });
    addMesh(new SphereGeometry(bulbSize / 2, 20, 14), bulbMaterial, [0, bulbCenterY, 0]);
    // A light that a WHEN → DO link can switch on needs its PointLight from the start,
    // because adding lights mid-session forces every shader to recompile.
    const switchable = this.blueprint.interactions.some(
      (interaction) => interaction.targetEntityId === entity.id,
    );
    if (enabled || switchable) {
      const light = new PointLight(
        color,
        enabled ? intensity : 0,
        numberProperty(entity, "range", 14),
        2,
      );
      light.position.y = bulbCenterY;
      group.add(light);
      runtime.light = light;
      runtime.lightIntensity = intensity;
      if (enabled) {
        this.pointLightCount += 1;
      }
    }
  }

  /**
   * Applies a WHEN → DO action to a point light or color strip. Returns false
   * when the entity is not a runtime decoration.
   */
  public applyDecorationAction(entityId: string, action: InteractionAction): boolean {
    const decoration = this.decorations.get(entityId);
    if (decoration === undefined) {
      return false;
    }
    if (action === "enable") {
      decoration.enabled = true;
    } else if (action === "disable") {
      decoration.enabled = false;
    } else if (action === "show") {
      decoration.group.visible = true;
    } else if (action === "hide") {
      decoration.group.visible = false;
    } else if (action === "pulse") {
      decoration.pulseRemainingSeconds = DECORATION_PULSE_SECONDS;
    } else if (action === "reset") {
      decoration.enabled = decoration.initiallyEnabled;
      decoration.group.visible = true;
      decoration.pulseRemainingSeconds = 0;
    } else {
      return false;
    }
    applyDecorationLighting(decoration);
    return true;
  }

  /** Whether a decoration is currently switched on and visible. */
  public decorationLit(entityId: string): boolean | null {
    const decoration = this.decorations.get(entityId);
    return decoration === undefined ? null : decoration.enabled && decoration.group.visible;
  }

  private createStaticTunnel(entity: MapEntity): void {
    const color = colorProperty(entity, "color", "#526d82");
    const layout = tunnelComponentLayout(
      numberProperty(entity, "length", 12),
      numberProperty(entity, "clearWidth", 6),
      numberProperty(entity, "clearHeight", 4.5),
      numberProperty(entity, "wallThickness", 0.45),
      numberProperty(entity, "roofThickness", 0.45),
    );
    const group = new Group();
    group.position.fromArray(entity.transform.position);
    group.quaternion.fromArray(entity.transform.rotation);
    group.scale.fromArray(entity.transform.scale);
    this.root.add(group);
    const rotation = new Quaternion().fromArray(entity.transform.rotation);
    const [rotationX, rotationY, rotationZ, rotationW] = entity.transform.rotation;
    for (const component of layout) {
      const geometry = new BoxGeometry(...component.size);
      const material = new MeshStandardMaterial({
        color,
        roughness: 0.75,
        metalness: component.kind === "roof" ? 0.08 : 0.16,
      });
      this.geometries.push(geometry);
      this.materials.push(material);
      const mesh = new Mesh(geometry, material);
      mesh.position.fromArray(component.position);
      mesh.receiveShadow = true;
      group.add(mesh);

      const scaledSize = component.size.map(
        (value, index) => value * Math.abs(entity.transform.scale[index] ?? 1),
      ) as [number, number, number];
      const localPosition = new Vector3(
        component.position[0] * entity.transform.scale[0],
        component.position[1] * entity.transform.scale[1],
        component.position[2] * entity.transform.scale[2],
      ).applyQuaternion(rotation);
      const collider = this.rapier.ColliderDesc.cuboid(
        scaledSize[0] / 2,
        scaledSize[1] / 2,
        scaledSize[2] / 2,
      )
        .setTranslation(
          entity.transform.position[0] + localPosition.x,
          entity.transform.position[1] + localPosition.y,
          entity.transform.position[2] + localPosition.z,
        )
        .setRotation({ x: rotationX, y: rotationY, z: rotationZ, w: rotationW })
        .setFriction(1)
        .setRestitution(0.02)
        .setCollisionGroups(
          component.kind === "roof" ? COLLISION_GROUPS.ground : COLLISION_GROUPS.staticObstacle,
        );
      const runtimeCollider = this.world.createCollider(collider, this.fixedBody);
      this.surfaceByColliderHandle.set(
        runtimeCollider.handle,
        Object.freeze({ surface: "normal", strength: 1, cooldownSeconds: 0.35 }),
      );
      if (component.kind !== "roof") {
        this.wallColliderHandles.add(runtimeCollider.handle);
      }
      this.colliderCount += 1;
    }
  }

  private createStartGrid(entity: MapEntity): void {
    const dimensions = editorAssetEntityDimensions(entity);
    const geometry = new BoxGeometry(dimensions?.width ?? 5, 0.08, dimensions?.depth ?? 3);
    const material = new MeshStandardMaterial({
      color: 0x31d867,
      emissive: 0x0b5527,
      emissiveIntensity: 0.7,
    });
    this.geometries.push(geometry);
    this.materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.position.fromArray(entity.transform.position);
    mesh.quaternion.fromArray(entity.transform.rotation);
    this.root.add(mesh);
  }

  private createRaceMarker(entity: MapEntity): void {
    const dimensions = editorAssetEntityDimensions(entity);
    if (dimensions === null) {
      return;
    }
    const color = colorProperty(entity, "color", "#34d9e5");
    const group = new Group();
    group.position.fromArray(entity.transform.position);
    group.quaternion.fromArray(entity.transform.rotation);
    group.scale.fromArray(entity.transform.scale);
    this.root.add(group);
    const addMesh = (geometry: BufferGeometry, material: MeshStandardMaterial): Mesh => {
      this.geometries.push(geometry);
      this.materials.push(material);
      const mesh = new Mesh(geometry, material);
      group.add(mesh);
      return mesh;
    };
    if (entity.assetId === "race.player-spawn" || entity.assetId === "race.recovery-pose") {
      addMesh(
        new CylinderGeometry(dimensions.width / 2, dimensions.width / 2, 0.12, 24),
        new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 }),
      );
      const heading = addMesh(
        new BoxGeometry(dimensions.width * 0.18, 0.16, dimensions.depth * 0.65),
        new MeshStandardMaterial({ color: 0x152638 }),
      );
      heading.position.set(0, 0.12, dimensions.depth * 0.35);
      return;
    }

    addMesh(
      new BoxGeometry(dimensions.width, dimensions.height, dimensions.depth),
      new MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    if (editorAssetManifest(entity.assetId)?.colliderKind === "none") {
      return;
    }
    if (entity.assetId === "race.checkpoint" || entity.assetId === "race.finish-gate") {
      const postWidth = Math.min(0.35, dimensions.width * 0.08);
      const topHeight = Math.min(0.35, dimensions.height * 0.12);
      for (const side of [-1, 1]) {
        const post = addMesh(
          new BoxGeometry(postWidth, dimensions.height, Math.max(0.2, dimensions.depth * 0.25)),
          new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 }),
        );
        post.position.x = side * (dimensions.width / 2 - postWidth / 2);
      }
      const top = addMesh(
        new BoxGeometry(dimensions.width, topHeight, Math.max(0.2, dimensions.depth * 0.25)),
        new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 }),
      );
      top.position.y = dimensions.height / 2 - topHeight / 2;
    }

    const [x, y, z, w] = entity.transform.rotation;
    const collider = this.rapier.ColliderDesc.cuboid(
      (dimensions.width * Math.abs(entity.transform.scale[0])) / 2,
      (dimensions.height * Math.abs(entity.transform.scale[1])) / 2,
      (dimensions.depth * Math.abs(entity.transform.scale[2])) / 2,
    )
      .setTranslation(...entity.transform.position)
      .setRotation({ x, y, z, w })
      .setSensor(true)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(COLLISION_GROUPS.raceSensor);
    const runtimeCollider = this.world.createCollider(collider, this.fixedBody);
    if (entity.assetId === "race.checkpoint" || entity.assetId === "race.finish-gate") {
      const forward = new Vector3(0, 0, 1).applyQuaternion(
        new Quaternion().fromArray(entity.transform.rotation),
      );
      this.raceTriggerByColliderHandle.set(
        runtimeCollider.handle,
        Object.freeze({
          kind: entity.assetId === "race.checkpoint" ? "checkpoint" : "finish",
          entityId: entity.id,
          forward: Object.freeze({ x: forward.x, y: forward.y, z: forward.z }),
          recoveryPosition:
            entity.assetId === "race.checkpoint"
              ? Object.freeze({
                  x: entity.transform.position[0],
                  y:
                    entity.transform.position[1] -
                    (dimensions.height * Math.abs(entity.transform.scale[1])) / 2 +
                    1,
                  z: entity.transform.position[2],
                })
              : null,
          recoveryRotation:
            entity.assetId === "race.checkpoint" ? Object.freeze({ x, y, z, w }) : null,
        }),
      );
    }
    if (entity.assetId === "race.recovery-volume") {
      const poseEntityId = entity.properties["safePoseEntityId"];
      const pose =
        typeof poseEntityId === "string"
          ? this.blueprint.entities.find(
              (candidate) =>
                candidate.id === poseEntityId && candidate.assetId === "race.recovery-pose",
            )
          : undefined;
      if (pose !== undefined) {
        this.recoveryByColliderHandle.set(
          runtimeCollider.handle,
          Object.freeze({
            volumeEntityId: entity.id,
            poseEntityId: pose.id,
            delaySeconds: numberProperty(entity, "delaySeconds", 0.75),
            position: Object.freeze({
              x: pose.transform.position[0],
              y: pose.transform.position[1] + 1,
              z: pose.transform.position[2],
            }),
            rotation: Object.freeze({
              x: pose.transform.rotation[0],
              y: pose.transform.rotation[1],
              z: pose.transform.rotation[2],
              w: pose.transform.rotation[3],
            }),
          }),
        );
      }
    }
    this.colliderCount += 1;
  }
}

function scaledPrism(
  prism: Readonly<{ vertices: Float32Array; indices: Uint32Array }>,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): Readonly<{ vertices: Float32Array; indices: Uint32Array }> {
  const vertices = Float32Array.from(prism.vertices, (value, index) => {
    switch (index % 3) {
      case 0:
        return value * scaleX;
      case 1:
        return value * scaleY;
      default:
        return value * scaleZ;
    }
  });
  return Object.freeze({ vertices, indices: prism.indices });
}

function geometryFrom(
  vertices: Float32Array,
  indices: Uint32Array,
  uvs?: Float32Array,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  if (uvs !== undefined) {
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  }
  geometry.setIndex([...indices]);
  geometry.computeVertexNormals();
  return geometry;
}

function roadMaterial(materialId: string): MeshStandardMaterial {
  const appearance = trackMaterialAppearance(materialId);
  return new MeshStandardMaterial({
    color: appearance.color,
    map: createTrackPatternTexture(materialId),
    roughness: appearance.roughness,
    metalness: appearance.metalness,
    emissive: new Color(appearance.emissive),
    emissiveIntensity: appearance.emissiveIntensity,
    transparent: appearance.transparent,
    opacity: appearance.opacity,
  });
}

function roadUvs(vertices: Float32Array, startDistance: number, endDistance: number): Float32Array {
  const sectionCount = Math.max(1, Math.trunc(vertices.length / 12));
  const uvs = new Float32Array(sectionCount * 8);
  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const progress = sectionCount <= 1 ? 0 : sectionIndex / (sectionCount - 1);
    const longitudinal = (startDistance + (endDistance - startDistance) * progress) / 4;
    uvs.set([0, longitudinal, 1, longitudinal, 0, longitudinal, 1, longitudinal], sectionIndex * 8);
  }
  return uvs;
}

function wallGuideSamples(vertices: Float32Array): readonly WallGuideSample[] {
  const samples: WallGuideSample[] = [];
  for (let offset = 0; offset + 8 < vertices.length; offset += 12) {
    const edgeX = vertices[offset] ?? 0;
    const edgeZ = vertices[offset + 2] ?? 0;
    const outwardX = (vertices[offset + 6] ?? edgeX) - edgeX;
    const outwardZ = (vertices[offset + 8] ?? edgeZ) - edgeZ;
    const length = Math.hypot(outwardX, outwardZ);
    if (length > 0.0001) {
      samples.push({
        x: edgeX,
        z: edgeZ,
        inwardX: -outwardX / length,
        inwardZ: -outwardZ / length,
      });
    }
  }
  return Object.freeze(samples);
}

function wallMaterial(styleId: string): MeshStandardMaterial {
  const color =
    styleId === "wall.sunset"
      ? 0xff7b32
      : styleId === "wall.neon"
        ? 0x7cff4a
        : styleId === "wall.guardrail"
          ? 0xa6b0bb
          : 0x48e6f2;
  return new MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.12,
    side: DoubleSide,
  });
}

function surfaceFriction(surface: TrackSurface): number {
  switch (surface) {
    case "slippery":
      return 0.08;
    case "sticky":
      return 2;
    case "slow":
      return 1.8;
    default:
      return 0.9;
  }
}

function surfaceRestitution(surface: TrackSurface): number {
  // Bouncy roads use the fixed-step, edge-triggered surface impulse. Keeping
  // collider restitution low avoids a second solver-dependent bounce.
  return surface === "bouncy" ? 0.05 : 0.02;
}

function numberProperty(entity: MapEntity, key: string, fallback: number): number {
  const value = entity.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function colorProperty(entity: MapEntity, key: string, fallback: string): Color {
  const value = entity.properties[key];
  return new Color(typeof value === "string" ? value : fallback);
}

export function authoredSpawnTransform(
  blueprint: RuntimeMapBlueprint,
  playerCount: number,
  playerIndex: number,
): {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly quaternion: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
} {
  const start = blueprint.entities.find((entity) => entity.id === blueprint.race.activeStartGridId);
  if (start === undefined) {
    throw new Error("Test Mode requires an authored start grid.");
  }
  const spacing = numberProperty(start, "spacing", 2.5);
  // P1 takes the first slot of the front row; later rows line up behind it
  // (cars face local +Z), so ten cars stay a compact, fair grid.
  const columns = Math.min(
    Math.max(1, Math.trunc(numberProperty(start, "columns", 2))),
    Math.max(1, playerCount),
  );
  const row = Math.floor(playerIndex / columns);
  const column = playerIndex % columns;
  const carsInRow = Math.min(columns, playerCount - row * columns);
  const quaternion = new Quaternion().fromArray(start.transform.rotation);
  const offset = new Vector3(
    (column - (carsInRow - 1) / 2) * spacing,
    0,
    -row * spacing * START_GRID_ROW_SPACING_FACTOR,
  ).applyQuaternion(quaternion);
  return Object.freeze({
    position: Object.freeze({
      x: start.transform.position[0] + offset.x,
      y: start.transform.position[1] + 1,
      z: start.transform.position[2] + offset.z,
    }),
    quaternion: Object.freeze({
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w,
    }),
  });
}
