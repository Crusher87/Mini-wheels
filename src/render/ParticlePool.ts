import {
  Color,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { Object3D } from "three";
import type { Vector3Like } from "../gameplay/interactables/trigger-math";

export const PARTICLE_POOL_CAPACITY = 512;

export interface ParticlePoolDebugSnapshot {
  readonly capacity: number;
  readonly liveCount: number;
  readonly emittedCount: number;
  readonly overwrittenCount: number;
  readonly drawBatchCount: number;
  readonly disposed: boolean;
}

/**
 * One fixed-capacity, single-draw-call particle pool shared by all session
 * effects. Motion advances only from the fixed simulation step, and render
 * interpolation keeps the small particles smooth on high-refresh displays.
 */
export class ParticlePool {
  public readonly root = new Group();

  private readonly geometry = new IcosahedronGeometry(1, 1);
  private readonly material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly mesh: InstancedMesh;
  private readonly active: Uint8Array;
  private readonly previousX: Float32Array;
  private readonly previousY: Float32Array;
  private readonly previousZ: Float32Array;
  private readonly currentX: Float32Array;
  private readonly currentY: Float32Array;
  private readonly currentZ: Float32Array;
  private readonly velocityX: Float32Array;
  private readonly velocityY: Float32Array;
  private readonly velocityZ: Float32Array;
  private readonly ageSeconds: Float32Array;
  private readonly lifetimeSeconds: Float32Array;
  private readonly particleSize: Float32Array;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly color = new Color();
  private cursor = 0;
  private liveCount = 0;
  private emittedCount = 0;
  private overwrittenCount = 0;
  private disposed = false;

  public constructor(
    private readonly sceneRoot: Object3D,
    public readonly capacity = PARTICLE_POOL_CAPACITY,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("Particle pool capacity must be a positive integer.");
    }

    this.active = new Uint8Array(capacity);
    this.previousX = new Float32Array(capacity);
    this.previousY = new Float32Array(capacity);
    this.previousZ = new Float32Array(capacity);
    this.currentX = new Float32Array(capacity);
    this.currentY = new Float32Array(capacity);
    this.currentZ = new Float32Array(capacity);
    this.velocityX = new Float32Array(capacity);
    this.velocityY = new Float32Array(capacity);
    this.velocityZ = new Float32Array(capacity);
    this.ageSeconds = new Float32Array(capacity);
    this.lifetimeSeconds = new Float32Array(capacity);
    this.particleSize = new Float32Array(capacity);

    this.mesh = new InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = "session-particle-pool";
    this.mesh.count = capacity;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.scale.setScalar(0);
    for (let index = 0; index < capacity; index += 1) {
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
      this.mesh.setColorAt(index, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor !== null) {
      this.mesh.instanceColor.setUsage(DynamicDrawUsage);
      this.mesh.instanceColor.needsUpdate = true;
    }

    this.root.name = "particle-pool";
    this.root.add(this.mesh);
    sceneRoot.add(this.root);
  }

  public emitExhaust(position: Vector3Like, velocity: Vector3Like, color: number): void {
    this.emit(position, velocity, color, 0.12, 0.82);
  }

  public emitBoosterBurst(position: Vector3Like, count: number): void {
    const safeCount = Math.max(0, Math.floor(count));
    for (let index = 0; index < safeCount; index += 1) {
      const angle = (index / Math.max(1, safeCount)) * Math.PI * 2;
      const radialSpeed = 1.2 + (index % 2) * 0.35;
      this.emit(
        position,
        {
          x: Math.cos(angle) * radialSpeed,
          y: 1.5 + (index % 3) * 0.25,
          z: Math.sin(angle) * radialSpeed,
        },
        0xbf4444,
        0.09,
        0.48,
      );
    }
  }

  public emitPortalBurst(position: Vector3Like, count = 4): void {
    const safeCount = Math.max(0, Math.floor(count));
    for (let index = 0; index < safeCount; index += 1) {
      const angle = (index / Math.max(1, safeCount)) * Math.PI * 2 + Math.PI / 4;
      this.emit(
        position,
        {
          x: Math.cos(angle) * 0.9,
          y: ((index % 2) * 2 - 1) * 0.7,
          z: Math.sin(angle) * 0.9,
        },
        0x308ccc,
        0.075,
        0.32,
      );
    }
  }

  public fixedStep(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("Particle delta must be finite and non-negative.");
    }

    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index] !== 1) {
        continue;
      }
      this.previousX[index] = this.currentX[index] ?? 0;
      this.previousY[index] = this.currentY[index] ?? 0;
      this.previousZ[index] = this.currentZ[index] ?? 0;
      this.ageSeconds[index] = (this.ageSeconds[index] ?? 0) + deltaSeconds;
      if ((this.ageSeconds[index] ?? 0) >= (this.lifetimeSeconds[index] ?? 0)) {
        this.active[index] = 0;
        this.liveCount -= 1;
        continue;
      }
      this.currentX[index] =
        (this.currentX[index] ?? 0) + (this.velocityX[index] ?? 0) * deltaSeconds;
      this.currentY[index] =
        (this.currentY[index] ?? 0) + (this.velocityY[index] ?? 0) * deltaSeconds;
      this.currentZ[index] =
        (this.currentZ[index] ?? 0) + (this.velocityZ[index] ?? 0) * deltaSeconds;
      this.velocityY[index] = (this.velocityY[index] ?? 0) + 0.55 * deltaSeconds;
    }
  }

  public render(alpha: number): void {
    if (this.disposed) {
      return;
    }
    const interpolationAlpha = Math.min(1, Math.max(0, alpha));
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index] !== 1) {
        this.position.set(0, -1_000, 0);
        this.scale.setScalar(0);
      } else {
        this.position.set(
          lerp(this.previousX[index] ?? 0, this.currentX[index] ?? 0, interpolationAlpha),
          lerp(this.previousY[index] ?? 0, this.currentY[index] ?? 0, interpolationAlpha),
          lerp(this.previousZ[index] ?? 0, this.currentZ[index] ?? 0, interpolationAlpha),
        );
        const lifetime = Math.max(this.lifetimeSeconds[index] ?? 1, 0.000_001);
        const lifeFraction = Math.max(0, 1 - (this.ageSeconds[index] ?? 0) / lifetime);
        const size = (this.particleSize[index] ?? 0) * (0.35 + lifeFraction * 0.65);
        this.scale.setScalar(size);
      }
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public clear(): void {
    this.active.fill(0);
    this.liveCount = 0;
    this.cursor = 0;
    this.render(1);
  }

  public debugSnapshot(): ParticlePoolDebugSnapshot {
    return {
      capacity: this.capacity,
      liveCount: this.liveCount,
      emittedCount: this.emittedCount,
      overwrittenCount: this.overwrittenCount,
      drawBatchCount: 1,
      disposed: this.disposed,
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.clear();
    this.disposed = true;
    this.sceneRoot.remove(this.root);
    this.root.clear();
    this.geometry.dispose();
    this.material.dispose();
  }

  private emit(
    position: Vector3Like,
    velocity: Vector3Like,
    color: number,
    size: number,
    lifetimeSeconds: number,
  ): void {
    if (this.disposed) {
      return;
    }
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.active[index] === 1) {
      this.overwrittenCount += 1;
    } else {
      this.liveCount += 1;
    }
    this.active[index] = 1;
    this.previousX[index] = position.x;
    this.previousY[index] = position.y;
    this.previousZ[index] = position.z;
    this.currentX[index] = position.x;
    this.currentY[index] = position.y;
    this.currentZ[index] = position.z;
    this.velocityX[index] = velocity.x;
    this.velocityY[index] = velocity.y;
    this.velocityZ[index] = velocity.z;
    this.ageSeconds[index] = 0;
    this.lifetimeSeconds[index] = lifetimeSeconds;
    this.particleSize[index] = size;
    this.color.setHex(color);
    this.mesh.setColorAt(index, this.color);
    if (this.mesh.instanceColor !== null) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.emittedCount += 1;
  }
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}
