import {
  BoxGeometry,
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import type { Material, Object3D } from "three";
import type { RigidBody, RigidBodyHandle, World } from "@dimforge/rapier3d";
import { SANDBOX_LAYOUT, type SandboxVector3 } from "../config/sandbox-layout";
import type { RapierModule } from "../physics/rapier-init";
import { COLLISION_GROUPS } from "../physics/CollisionGroups";

interface DynamicArenaBody {
  readonly body: RigidBody;
  readonly initialPosition: SandboxVector3;
  readonly previousPosition: Vector3;
  readonly currentPosition: Vector3;
  readonly previousRotation: Quaternion;
  readonly currentRotation: Quaternion;
}

export interface SandboxArenaDebugSnapshot {
  readonly dynamicBodyCount: number;
  readonly cubeCount: number;
  readonly ballCount: number;
  readonly staticBodyCount: number;
  readonly cubeVisualBatchCount: number;
  readonly cubes: readonly SandboxPropDebugTransform[];
  readonly balls: readonly SandboxPropDebugTransform[];
  readonly guidanceVisualCount?: number;
  readonly guidanceColliderCount?: number;
  readonly decorationVisualCount?: number;
  readonly pointLightCount?: number;
}

export interface SandboxPropDebugTransform {
  readonly index: number;
  readonly bodyHandle: number;
  readonly authoredPosition: SandboxVector3;
  readonly currentPosition: SandboxVector3;
  readonly currentRotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly linearVelocity: SandboxVector3;
  readonly angularVelocity: SandboxVector3;
}

const IDENTITY_ROTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const ZERO_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });

function yawQuaternion(yawDegrees: number): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
} {
  const halfAngle = (yawDegrees * Math.PI) / 360;
  return {
    x: 0,
    y: Math.sin(halfAngle),
    z: 0,
    w: Math.cos(halfAngle),
  };
}

function createRampGeometry(dimensions: SandboxVector3): BufferGeometry {
  const halfLength = dimensions.x / 2;
  const halfWidth = dimensions.z / 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -halfLength,
        0,
        -halfWidth,
        -halfLength,
        0,
        halfWidth,
        halfLength,
        0,
        -halfWidth,
        halfLength,
        0,
        halfWidth,
        halfLength,
        dimensions.y,
        -halfWidth,
        halfLength,
        dimensions.y,
        halfWidth,
      ],
      3,
    ),
  );
  geometry.setIndex([0, 2, 3, 0, 3, 1, 0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5]);
  geometry.rotateY(Math.PI);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRampColliderPoints(dimensions: SandboxVector3): Float32Array {
  const halfLength = dimensions.x / 2;
  const halfWidth = dimensions.z / 2;
  const points = new Float32Array([
    -halfLength,
    0,
    -halfWidth,
    -halfLength,
    0,
    halfWidth,
    halfLength,
    0,
    -halfWidth,
    halfLength,
    0,
    halfWidth,
    halfLength,
    dimensions.y,
    -halfWidth,
    halfLength,
    dimensions.y,
    halfWidth,
  ]);
  for (let index = 0; index < points.length; index += 3) {
    const x = points[index];
    const z = points[index + 2];
    if (x !== undefined && z !== undefined) {
      points[index] = -x;
      points[index + 2] = -z;
    }
  }
  return points;
}

function createDynamicRecord(body: RigidBody, initialPosition: SandboxVector3): DynamicArenaBody {
  const position = new Vector3(initialPosition.x, initialPosition.y, initialPosition.z);
  return {
    body,
    initialPosition,
    previousPosition: position.clone(),
    currentPosition: position.clone(),
    previousRotation: new Quaternion(),
    currentRotation: new Quaternion(),
  };
}

/**
 * Owns the documented static architecture and dynamic props for one Sandbox.
 *
 * Call `beginFixedStep()` immediately before `world.step()`,
 * `finishFixedStep()` immediately afterward, and `render(alpha)` once per
 * rendered frame. Call `dispose()` before freeing the parent Rapier world.
 */
export class SandboxArena {
  public readonly root = new Group();
  public readonly cubeBodies: readonly RigidBody[];
  public readonly ballBodies: readonly RigidBody[];
  public readonly dynamicBodies: readonly RigidBody[];

  private readonly ownedBodies: RigidBody[] = [];
  private readonly cubeRecords: DynamicArenaBody[] = [];
  private readonly ballRecords: DynamicArenaBody[] = [];
  private readonly allDynamicRecords: DynamicArenaBody[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly ballLights: PointLight[] = [];
  private readonly cubeMesh: InstancedMesh;
  private readonly ballMesh: InstancedMesh;
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchPosition = new Vector3();
  private readonly scratchRotation = new Quaternion();
  private readonly unitScale = new Vector3(1, 1, 1);
  private disposed = false;

  public constructor(
    private readonly rapier: RapierModule,
    private readonly world: World,
    private readonly parent: Object3D,
  ) {
    this.root.name = "sandbox-arena";
    parent.add(this.root);

    const architectureMaterial = new MeshStandardMaterial({
      color: SANDBOX_LAYOUT.colors.architecture,
      metalness: 0,
      roughness: 0.95,
    });
    const greenMaterial = new MeshStandardMaterial({
      color: SANDBOX_LAYOUT.colors.green,
      emissive: SANDBOX_LAYOUT.colors.greenEmissive,
      emissiveIntensity: 0.8,
      metalness: 0,
      roughness: 0.72,
    });
    this.materials.push(architectureMaterial, greenMaterial);

    this.createFloor(architectureMaterial);
    this.createRamps(architectureMaterial);
    this.createFeatureWall(architectureMaterial);
    this.createElevatedColumns(architectureMaterial);

    const cubeGeometry = new BoxGeometry(
      SANDBOX_LAYOUT.cubeStack.dimensions.x,
      SANDBOX_LAYOUT.cubeStack.dimensions.y,
      SANDBOX_LAYOUT.cubeStack.dimensions.z,
    );
    this.geometries.push(cubeGeometry);
    this.cubeMesh = new InstancedMesh(cubeGeometry, greenMaterial, SANDBOX_LAYOUT.cubeStack.count);
    this.cubeMesh.name = "breakable-cube-stack";
    this.cubeMesh.castShadow = true;
    this.cubeMesh.receiveShadow = true;
    this.cubeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.root.add(this.cubeMesh);
    this.createCubeBodies();

    const ballGeometry = new SphereGeometry(SANDBOX_LAYOUT.balls.radius, 12, 8);
    this.geometries.push(ballGeometry);
    this.ballMesh = new InstancedMesh(
      ballGeometry,
      greenMaterial,
      SANDBOX_LAYOUT.balls.positions.length,
    );
    this.ballMesh.name = "heavy-balls";
    this.ballMesh.castShadow = true;
    this.ballMesh.receiveShadow = true;
    this.ballMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.root.add(this.ballMesh);
    this.createBallBodies();

    this.cubeBodies = Object.freeze(this.cubeRecords.map(({ body }) => body));
    this.ballBodies = Object.freeze(this.ballRecords.map(({ body }) => body));
    this.dynamicBodies = Object.freeze([...this.cubeBodies, ...this.ballBodies]);
    this.allDynamicRecords.push(...this.cubeRecords, ...this.ballRecords);

    this.render(1);
    this.cubeMesh.computeBoundingSphere();
    this.ballMesh.computeBoundingSphere();
  }

  public beginFixedStep(): void {
    if (this.disposed) {
      return;
    }
    for (const record of this.allDynamicRecords) {
      record.previousPosition.copy(record.currentPosition);
      record.previousRotation.copy(record.currentRotation);
    }
  }

  public finishFixedStep(): readonly RigidBodyHandle[] {
    if (this.disposed) {
      return [];
    }
    for (const record of this.allDynamicRecords) {
      const position = record.body.translation();
      const rotation = record.body.rotation();
      record.currentPosition.set(position.x, position.y, position.z);
      record.currentRotation.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
    }
    return this.recoverFallenDynamicBodyHandles();
  }

  public render(alpha: number): void {
    if (this.disposed) {
      return;
    }
    const safeAlpha = Math.min(Math.max(alpha, 0), 1);
    this.renderInstances(this.cubeRecords, this.cubeMesh, safeAlpha);
    this.renderInstances(this.ballRecords, this.ballMesh, safeAlpha);

    for (let index = 0; index < this.ballRecords.length; index += 1) {
      const record = this.ballRecords[index];
      const light = this.ballLights[index];
      if (record !== undefined && light !== undefined) {
        light.position.lerpVectors(record.previousPosition, record.currentPosition, safeAlpha);
      }
    }
  }

  public resetDynamicBodies(): void {
    if (this.disposed) {
      return;
    }
    for (const record of this.allDynamicRecords) {
      this.placeDynamicBody(record, record.initialPosition, true);
    }
    this.render(1);
  }

  /**
   * Applies the documented non-car reset rule and returns the number recovered.
   * This is called by `finishFixedStep()` and is public for deterministic
   * tooling that moves bodies without stepping the world.
   */
  public recoverFallenDynamics(): number {
    if (this.disposed) {
      return 0;
    }
    return this.recoverFallenDynamicBodyHandles().length;
  }

  public synchronizeAfterExternalTeleport(bodyHandle: RigidBodyHandle): boolean {
    const record = this.allDynamicRecords.find(({ body }) => body.handle === bodyHandle);
    if (record === undefined || !record.body.isValid()) {
      return false;
    }
    const position = record.body.translation();
    const rotation = record.body.rotation();
    record.previousPosition.set(position.x, position.y, position.z);
    record.currentPosition.copy(record.previousPosition);
    record.previousRotation.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
    record.currentRotation.copy(record.previousRotation);
    return true;
  }

  public isWallCollider(): boolean {
    return false;
  }

  public wallInwardNormal(): null {
    return null;
  }

  public surfaceForCollider(): null {
    return null;
  }

  public recoveryForCollider(): null {
    return null;
  }

  public raceTriggerForCollider(): null {
    return null;
  }

  private recoverFallenDynamicBodyHandles(): readonly RigidBodyHandle[] {
    const recoveredHandles: RigidBodyHandle[] = [];
    for (const record of this.allDynamicRecords) {
      if (record.currentPosition.y <= SANDBOX_LAYOUT.resetVolume.upperBoundaryY) {
        this.placeDynamicBody(record, SANDBOX_LAYOUT.resetVolume.dynamicPropDestination, false);
        recoveredHandles.push(record.body.handle);
      }
    }
    return recoveredHandles;
  }

  public debugSnapshot(): SandboxArenaDebugSnapshot {
    return {
      dynamicBodyCount: this.dynamicBodies.length,
      cubeCount: this.cubeBodies.length,
      ballCount: this.ballBodies.length,
      staticBodyCount: this.ownedBodies.length - this.dynamicBodies.length,
      cubeVisualBatchCount: 1,
      cubes: this.createDebugTransforms(this.cubeRecords),
      balls: this.createDebugTransforms(this.ballRecords),
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.parent.remove(this.root);
    this.root.clear();
    for (let index = this.ownedBodies.length - 1; index >= 0; index -= 1) {
      const body = this.ownedBodies[index];
      if (body !== undefined) {
        this.world.removeRigidBody(body);
      }
    }
    this.ownedBodies.length = 0;
    this.cubeMesh.dispose();
    this.ballMesh.dispose();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
  }

  private createFloor(material: Material): void {
    const { center, dimensions, friction } = SANDBOX_LAYOUT.floor;
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(dimensions.x / 2, dimensions.y / 2, dimensions.z / 2)
        .setFriction(friction)
        .setCollisionGroups(COLLISION_GROUPS.ground),
      body,
    );
    this.ownedBodies.push(body);

    const geometry = new BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    const mesh = new Mesh(geometry, material);
    mesh.name = "open-edge-floor";
    mesh.position.set(center.x, center.y, center.z);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.geometries.push(geometry);
  }

  private createRamps(material: Material): void {
    const dimensions = SANDBOX_LAYOUT.ramps.wedgeDimensions;
    const geometry = createRampGeometry(dimensions);
    const colliderPoints = createRampColliderPoints(dimensions);
    this.geometries.push(geometry);

    for (const [index, transform] of SANDBOX_LAYOUT.ramps.transforms.entries()) {
      const rotation = yawQuaternion(transform.yawDegrees);
      const body = this.world.createRigidBody(
        this.rapier.RigidBodyDesc.fixed()
          .setTranslation(transform.position.x, transform.position.y, transform.position.z)
          .setRotation(rotation),
      );
      const collider = this.rapier.ColliderDesc.convexHull(colliderPoints);
      if (collider === null) {
        throw new Error("The authored ramp points did not form a convex hull.");
      }
      this.world.createCollider(
        collider.setFriction(1).setCollisionGroups(COLLISION_GROUPS.staticObstacle),
        body,
      );
      this.ownedBodies.push(body);

      const mesh = new Mesh(geometry, material);
      mesh.name = `launch-ramp-${String(index + 1)}`;
      mesh.position.set(transform.position.x, transform.position.y, transform.position.z);
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
  }

  private createFeatureWall(material: Material): void {
    const { transform, dimensions } = SANDBOX_LAYOUT.featureWall;
    const rotation = yawQuaternion(transform.yawDegrees);
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed()
        .setTranslation(transform.position.x, transform.position.y, transform.position.z)
        .setRotation(rotation),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(dimensions.x / 2, dimensions.y / 2, dimensions.z / 2)
        .setFriction(1)
        .setCollisionGroups(COLLISION_GROUPS.staticObstacle),
      body,
    );
    this.ownedBodies.push(body);

    const geometry = new BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    const mesh = new Mesh(geometry, material);
    mesh.name = "feature-wall";
    mesh.position.set(transform.position.x, transform.position.y, transform.position.z);
    mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.geometries.push(geometry);
  }

  private createElevatedColumns(material: Material): void {
    const { dimensions, positions } = SANDBOX_LAYOUT.elevatedColumns;
    const geometry = new BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    this.geometries.push(geometry);

    for (const [index, position] of positions.entries()) {
      const body = this.world.createRigidBody(
        this.rapier.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
      );
      this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(dimensions.x / 2, dimensions.y / 2, dimensions.z / 2)
          .setFriction(1)
          .setCollisionGroups(COLLISION_GROUPS.staticObstacle),
        body,
      );
      this.ownedBodies.push(body);

      const mesh = new Mesh(geometry, material);
      mesh.name = `elevated-column-${String(index + 1)}`;
      mesh.position.set(position.x, position.y, position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
  }

  private createCubeBodies(): void {
    const cube = SANDBOX_LAYOUT.cubeStack;
    for (const position of cube.positions) {
      const body = this.world.createRigidBody(
        this.rapier.RigidBodyDesc.dynamic()
          .setTranslation(position.x, position.y, position.z)
          .setLinearDamping(cube.linearDamping)
          .setAngularDamping(cube.angularDamping)
          .setCanSleep(true)
          .setSleeping(true)
          .setCcdEnabled(cube.runtimeContinuousCollisionDetection),
      );
      this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(
          cube.dimensions.x / 2,
          cube.dimensions.y / 2,
          cube.dimensions.z / 2,
        )
          .setMass(cube.mass)
          .setCollisionGroups(COLLISION_GROUPS.dynamicToy),
        body,
      );
      body.sleep();
      this.ownedBodies.push(body);
      this.cubeRecords.push(createDynamicRecord(body, position));
    }
  }

  private createBallBodies(): void {
    const balls = SANDBOX_LAYOUT.balls;
    for (const position of balls.positions) {
      const body = this.world.createRigidBody(
        this.rapier.RigidBodyDesc.dynamic()
          .setTranslation(position.x, position.y, position.z)
          .setLinearDamping(balls.linearDamping)
          .setAngularDamping(balls.angularDamping)
          .setCanSleep(true)
          .setSleeping(true)
          .setCcdEnabled(balls.continuousCollisionDetection),
      );
      this.world.createCollider(
        this.rapier.ColliderDesc.ball(balls.radius)
          .setMass(balls.mass)
          .setCollisionGroups(COLLISION_GROUPS.dynamicToy),
        body,
      );
      this.ownedBodies.push(body);
      this.ballRecords.push(createDynamicRecord(body, position));

      const light = new PointLight(balls.light.color, balls.light.intensity, balls.light.range);
      light.castShadow = false;
      light.position.set(position.x, position.y, position.z);
      this.root.add(light);
      this.ballLights.push(light);
    }
  }

  private renderInstances(
    records: readonly DynamicArenaBody[],
    mesh: InstancedMesh,
    alpha: number,
  ): void {
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record === undefined) {
        continue;
      }
      this.scratchPosition.lerpVectors(record.previousPosition, record.currentPosition, alpha);
      this.scratchRotation.slerpQuaternions(record.previousRotation, record.currentRotation, alpha);
      this.scratchMatrix.compose(this.scratchPosition, this.scratchRotation, this.unitScale);
      mesh.setMatrixAt(index, this.scratchMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private placeDynamicBody(
    record: DynamicArenaBody,
    position: SandboxVector3,
    sleep: boolean,
  ): void {
    record.body.setTranslation(position, true);
    record.body.setRotation(IDENTITY_ROTATION, true);
    record.body.setLinvel(ZERO_VECTOR, true);
    record.body.setAngvel(ZERO_VECTOR, true);
    record.body.resetForces(false);
    record.body.resetTorques(false);
    if (sleep) {
      record.body.sleep();
    } else {
      record.body.wakeUp();
    }
    record.previousPosition.set(position.x, position.y, position.z);
    record.currentPosition.copy(record.previousPosition);
    record.previousRotation.identity();
    record.currentRotation.identity();
  }

  private createDebugTransforms(
    records: readonly DynamicArenaBody[],
  ): readonly SandboxPropDebugTransform[] {
    return records.map((record, index) => {
      const position = record.body.translation();
      const rotation = record.body.rotation();
      const linearVelocity = record.body.linvel();
      const angularVelocity = record.body.angvel();
      return {
        index,
        bodyHandle: record.body.handle,
        authoredPosition: record.initialPosition,
        currentPosition: {
          x: position.x,
          y: position.y,
          z: position.z,
        },
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
}
