import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import type {
  Collider,
  ColliderHandle,
  RigidBody,
  RigidBodyHandle,
  World,
} from "@dimforge/rapier3d";
import type { Material, Object3D } from "three";
import type { RapierModule } from "../../physics/rapier-init";
import { COLLISION_GROUPS } from "../../physics/CollisionGroups";
import {
  BOOSTER_CONFIG,
  DEFAULT_BOOSTER_PADS,
  type BoosterPadDefinition,
  type BoosterPadId,
} from "./interactable-config";
import { addDeltaVelocity, normalizeQuaternion, type Vector3Like } from "./trigger-math";

const COOLDOWN_EPSILON = 1e-9;

export interface BoosterContactDebugSnapshot {
  readonly insideBodyCount: number;
  readonly pendingBodyCount: number;
  readonly cooldownRemainingSeconds: number;
  readonly disposed: boolean;
}

/**
 * Pure fixed-step contact state for one pad. A compound rigid body activates
 * once per complete enter/exit cycle even when several of its colliders overlap.
 */
export class BoosterContactState {
  private readonly contactsByBody = new Map<RigidBodyHandle, Set<ColliderHandle>>();
  private readonly pendingBodies = new Set<RigidBodyHandle>();
  private cooldownRemainingSeconds = 0;
  private disposed = false;

  public constructor(private readonly cooldownSeconds = 0.15) {
    if (!Number.isFinite(cooldownSeconds) || cooldownSeconds < 0) {
      throw new RangeError("Booster cooldown must be a finite non-negative number.");
    }
  }

  public enter(bodyHandle: RigidBodyHandle, colliderHandle: ColliderHandle): void {
    if (this.disposed) {
      return;
    }
    let colliders = this.contactsByBody.get(bodyHandle);
    if (colliders === undefined) {
      colliders = new Set();
      this.contactsByBody.set(bodyHandle, colliders);
      this.pendingBodies.add(bodyHandle);
    }
    colliders.add(colliderHandle);
  }

  public leave(bodyHandle: RigidBodyHandle, colliderHandle: ColliderHandle): void {
    if (this.disposed) {
      return;
    }
    const colliders = this.contactsByBody.get(bodyHandle);
    if (colliders === undefined) {
      return;
    }
    colliders.delete(colliderHandle);
    if (colliders.size === 0) {
      this.contactsByBody.delete(bodyHandle);
      this.pendingBodies.delete(bodyHandle);
    }
  }

  /**
   * Advances only by a caller-supplied fixed delta and returns the bodies that
   * should receive one additive velocity change during this step.
   */
  public fixedStep(deltaSeconds: number): readonly RigidBodyHandle[] {
    if (this.disposed) {
      return [];
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("Booster fixed-step delta must be a finite non-negative number.");
    }

    this.cooldownRemainingSeconds = Math.max(0, this.cooldownRemainingSeconds - deltaSeconds);
    if (this.cooldownRemainingSeconds > COOLDOWN_EPSILON) {
      return [];
    }

    const readyBodies = [...this.pendingBodies].filter((bodyHandle) =>
      this.contactsByBody.has(bodyHandle),
    );
    this.pendingBodies.clear();
    if (readyBodies.length > 0) {
      this.cooldownRemainingSeconds = this.cooldownSeconds;
    }
    return readyBodies;
  }

  public forgetBody(bodyHandle: RigidBodyHandle): void {
    this.contactsByBody.delete(bodyHandle);
    this.pendingBodies.delete(bodyHandle);
  }

  public clear(): void {
    this.contactsByBody.clear();
    this.pendingBodies.clear();
    this.cooldownRemainingSeconds = 0;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.clear();
    this.disposed = true;
  }

  public debugSnapshot(): BoosterContactDebugSnapshot {
    return {
      insideBodyCount: this.contactsByBody.size,
      pendingBodyCount: this.pendingBodies.size,
      cooldownRemainingSeconds: this.cooldownRemainingSeconds,
      disposed: this.disposed,
    };
  }
}

export interface BoosterActivationRequest {
  readonly padId: BoosterPadId;
  readonly position: Vector3Like;
  readonly bodyHandles: readonly RigidBodyHandle[];
  readonly particleCount: number;
  readonly effect: NonNullable<BoosterPadDefinition["effect"]>;
}

export interface BoosterBodyActivationDebugSnapshot {
  readonly bodyHandle: RigidBodyHandle;
  readonly entryLinearVelocity: Vector3Like;
  readonly exitLinearVelocity: Vector3Like;
}

export interface BoosterActivationDebugSnapshot {
  readonly padId: BoosterPadId;
  readonly bodies: readonly BoosterBodyActivationDebugSnapshot[];
  readonly particleCount: number;
  readonly effect: NonNullable<BoosterPadDefinition["effect"]>;
}

export interface BoosterPadSystemOptions {
  readonly cooldownSeconds?: number;
  readonly activationParticleCount?: number;
  readonly onActivation?: (request: BoosterActivationRequest) => void;
}

interface BoosterPadRuntime {
  readonly definition: BoosterPadDefinition;
  readonly collider: Collider;
  readonly contactState: BoosterContactState;
}

export interface BoosterPadDebugSnapshot {
  readonly padCount: number;
  readonly sensorColliderCount: number;
  readonly activationCount: number;
  readonly pendingParticleRequestCount: number;
  readonly lastActivation: BoosterActivationDebugSnapshot | null;
  readonly highContrast: boolean;
  readonly pads: Readonly<
    Record<
      BoosterPadId,
      BoosterContactDebugSnapshot & {
        readonly deltaVelocity: Vector3Like;
        readonly effect: NonNullable<BoosterPadDefinition["effect"]>;
        readonly velocityMultiplier: number;
      }
    >
  >;
  readonly disposed: boolean;
}

export class BoosterPadSystem {
  public readonly root = new Group();
  private readonly padBySensorCollider = new Map<ColliderHandle, BoosterPadRuntime>();
  private readonly pads: BoosterPadRuntime[] = [];
  private readonly bodyByHandle = new Map<RigidBodyHandle, RigidBody>();
  private readonly geometries: (BoxGeometry | ShapeGeometry)[] = [];
  private readonly materials: Material[] = [];
  private readonly onActivation: ((request: BoosterActivationRequest) => void) | undefined;
  private readonly activationParticleCount: number;
  private activationCount = 0;
  private pendingParticleRequestCount = 0;
  private lastActivation: BoosterActivationDebugSnapshot | null = null;
  private readonly padMaterialStates: {
    readonly base: MeshStandardMaterial;
    readonly arrow: MeshStandardMaterial;
    readonly baseColor: number;
    readonly baseEmissive: number;
    readonly arrowColor: number;
    readonly arrowEmissive: number;
  }[] = [];
  private highContrast = false;
  private disposed = false;

  public constructor(
    private readonly rapier: RapierModule,
    private readonly world: World,
    private readonly sceneRoot: Object3D,
    definitions: readonly BoosterPadDefinition[] = DEFAULT_BOOSTER_PADS,
    options: BoosterPadSystemOptions = {},
  ) {
    const cooldownSeconds = options.cooldownSeconds ?? BOOSTER_CONFIG.cooldownSeconds;
    this.activationParticleCount =
      options.activationParticleCount ?? BOOSTER_CONFIG.activationParticleCount;
    if (!Number.isInteger(this.activationParticleCount) || this.activationParticleCount < 0) {
      throw new RangeError("Booster activation particle count must be a non-negative integer.");
    }
    this.onActivation = options.onActivation;
    this.root.name = "booster-pad-system";
    sceneRoot.add(this.root);
    this.createPads(definitions, cooldownSeconds);
  }

  /**
   * Feed this from the single EventQueue drain owned by the world. Returns true
   * when either collider belongs to a booster sensor.
   */
  public handleCollisionEvent(
    colliderHandleA: ColliderHandle,
    colliderHandleB: ColliderHandle,
    started: boolean,
  ): boolean {
    if (this.disposed) {
      return false;
    }
    const pad =
      this.padBySensorCollider.get(colliderHandleA) ??
      this.padBySensorCollider.get(colliderHandleB);
    if (pad === undefined) {
      return false;
    }

    const otherColliderHandle =
      pad.collider.handle === colliderHandleA ? colliderHandleB : colliderHandleA;
    const otherCollider = this.getValidCollider(otherColliderHandle);
    const body = otherCollider?.parent();
    if (body === null || body === undefined || !body.isValid() || !body.isDynamic()) {
      return true;
    }

    this.bodyByHandle.set(body.handle, body);
    if (started) {
      pad.contactState.enter(body.handle, otherColliderHandle);
    } else {
      pad.contactState.leave(body.handle, otherColliderHandle);
    }
    return true;
  }

  /**
   * Call after draining sensor events for one fixed physics step.
   */
  public fixedStep(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }
    for (const pad of this.pads) {
      const readyBodyHandles = pad.contactState.fixedStep(deltaSeconds);
      const activatedBodies: RigidBodyHandle[] = [];
      const activationSnapshots: BoosterBodyActivationDebugSnapshot[] = [];
      for (const bodyHandle of readyBodyHandles) {
        const body = this.bodyByHandle.get(bodyHandle);
        if (body === undefined || !body.isValid()) {
          this.forgetBody(bodyHandle);
          continue;
        }
        const entryLinearVelocity = body.linvel();
        const nextVelocity = applyBoosterPadVelocity(entryLinearVelocity, pad.definition);
        body.setLinvel(nextVelocity, true);
        activatedBodies.push(bodyHandle);
        activationSnapshots.push({
          bodyHandle,
          entryLinearVelocity: { ...entryLinearVelocity },
          exitLinearVelocity: { ...nextVelocity },
        });
      }

      if (activatedBodies.length > 0) {
        this.activationCount += 1;
        const effect = pad.definition.effect ?? "boost";
        const particleCount = effect === "slow" ? 0 : this.activationParticleCount;
        this.pendingParticleRequestCount += particleCount;
        this.lastActivation = {
          padId: pad.definition.id,
          bodies: activationSnapshots,
          particleCount,
          effect,
        };
        this.onActivation?.({
          padId: pad.definition.id,
          position: { ...pad.definition.position },
          bodyHandles: activatedBodies,
          particleCount,
          effect,
        });
      }
    }
  }

  /**
   * Clear all transient state for a recovered or destroyed car/prop.
   */
  public forgetBody(bodyHandle: RigidBodyHandle): void {
    this.bodyByHandle.delete(bodyHandle);
    for (const pad of this.pads) {
      pad.contactState.forgetBody(bodyHandle);
    }
  }

  public clearTransientState(): void {
    this.bodyByHandle.clear();
    for (const pad of this.pads) {
      pad.contactState.clear();
    }
    this.pendingParticleRequestCount = 0;
  }

  public consumeParticleRequestCount(): number {
    const result = this.pendingParticleRequestCount;
    this.pendingParticleRequestCount = 0;
    return result;
  }

  public setHighContrast(enabled: boolean): void {
    this.highContrast = enabled;
    for (const state of this.padMaterialStates) {
      state.base.color.setHex(enabled ? 0xff2020 : state.baseColor);
      state.base.emissive.setHex(enabled ? 0x8f0000 : state.baseEmissive);
      state.base.emissiveIntensity = enabled ? 0.9 : 0.35;
      state.arrow.color.setHex(enabled ? 0xffffff : state.arrowColor);
      state.arrow.emissive.setHex(enabled ? 0xffffff : state.arrowEmissive);
      state.arrow.emissiveIntensity = enabled ? 0.75 : 0.5;
    }
  }

  public debugSnapshot(): BoosterPadDebugSnapshot {
    const padSnapshots = {} as Record<
      BoosterPadId,
      BoosterContactDebugSnapshot & {
        readonly deltaVelocity: Vector3Like;
        readonly effect: NonNullable<BoosterPadDefinition["effect"]>;
        readonly velocityMultiplier: number;
      }
    >;
    for (const pad of this.pads) {
      padSnapshots[pad.definition.id] = {
        ...pad.contactState.debugSnapshot(),
        deltaVelocity: { ...pad.definition.deltaVelocity },
        effect: pad.definition.effect ?? "boost",
        velocityMultiplier: pad.definition.velocityMultiplier ?? 1,
      };
    }
    return {
      padCount: this.pads.length,
      sensorColliderCount: this.padBySensorCollider.size,
      activationCount: this.activationCount,
      pendingParticleRequestCount: this.pendingParticleRequestCount,
      highContrast: this.highContrast,
      lastActivation:
        this.lastActivation === null
          ? null
          : {
              padId: this.lastActivation.padId,
              bodies: this.lastActivation.bodies.map((body) => ({
                bodyHandle: body.bodyHandle,
                entryLinearVelocity: { ...body.entryLinearVelocity },
                exitLinearVelocity: { ...body.exitLinearVelocity },
              })),
              particleCount: this.lastActivation.particleCount,
              effect: this.lastActivation.effect,
            },
      pads: padSnapshots,
      disposed: this.disposed,
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const pad of this.pads) {
      pad.contactState.dispose();
      if (pad.collider.isValid()) {
        this.world.removeCollider(pad.collider, false);
      }
    }
    this.padBySensorCollider.clear();
    this.pads.length = 0;
    this.bodyByHandle.clear();
    this.pendingParticleRequestCount = 0;
    this.lastActivation = null;
    this.sceneRoot.remove(this.root);
    this.root.clear();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
  }

  private createPads(definitions: readonly BoosterPadDefinition[], cooldownSeconds: number): void {
    const ids = new Set<BoosterPadId>();
    const arrowGeometry = createArrowGeometry();
    this.geometries.push(arrowGeometry);

    for (const definition of definitions) {
      if (ids.has(definition.id)) {
        throw new Error(`Duplicate booster pad ID: ${definition.id}`);
      }
      ids.add(definition.id);
      assertPositiveHalfExtents(definition.halfExtents, "booster");
      assertPadEffectDefinition(definition);
      const colors = effectColors(definition.effect ?? "boost");
      const baseMaterial = new MeshStandardMaterial({
        color: colors.base,
        emissive: colors.baseEmissive,
        emissiveIntensity: 0.35,
        metalness: 0,
        roughness: 0.72,
      });
      const arrowMaterial = new MeshStandardMaterial({
        color: colors.arrow,
        emissive: colors.arrowEmissive,
        emissiveIntensity: 0.5,
        metalness: 0,
        roughness: 0.55,
      });
      this.materials.push(baseMaterial, arrowMaterial);
      this.padMaterialStates.push({
        base: baseMaterial,
        arrow: arrowMaterial,
        baseColor: colors.base,
        baseEmissive: colors.baseEmissive,
        arrowColor: colors.arrow,
        arrowEmissive: colors.arrowEmissive,
      });
      const rotation = normalizeQuaternion(definition.rotation);
      const collider = this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(
          definition.halfExtents.x,
          definition.halfExtents.y,
          definition.halfExtents.z,
        )
          .setTranslation(definition.position.x, definition.position.y, definition.position.z)
          .setRotation(rotation)
          .setSensor(true)
          .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS)
          .setCollisionGroups(COLLISION_GROUPS.boosterSensor),
      );

      const padRoot = new Group();
      padRoot.name = `booster-pad-${definition.id}`;
      padRoot.position.set(definition.position.x, definition.position.y, definition.position.z);
      padRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

      const baseGeometry = new BoxGeometry(
        definition.halfExtents.x * 2,
        definition.halfExtents.y * 2,
        definition.halfExtents.z * 2,
      );
      this.geometries.push(baseGeometry);
      const base = new Mesh(baseGeometry, baseMaterial);
      base.receiveShadow = true;
      padRoot.add(base);

      const arrow = new Mesh(arrowGeometry, arrowMaterial);
      arrow.position.y = definition.halfExtents.y + 0.006;
      arrow.scale.setScalar(Math.min(definition.halfExtents.x, definition.halfExtents.z) * 1.1);
      const localDelta = new Vector3(
        definition.deltaVelocity.x,
        definition.deltaVelocity.y,
        definition.deltaVelocity.z,
      ).applyQuaternion(padRoot.quaternion.clone().invert());
      if (Math.hypot(localDelta.x, localDelta.z) > Number.EPSILON) {
        arrow.rotation.y = Math.atan2(-localDelta.x, -localDelta.z);
      }
      padRoot.add(arrow);
      this.root.add(padRoot);

      const runtime: BoosterPadRuntime = {
        definition,
        collider,
        contactState: new BoosterContactState(definition.cooldownSeconds ?? cooldownSeconds),
      };
      this.pads.push(runtime);
      this.padBySensorCollider.set(collider.handle, runtime);
    }
  }

  private getValidCollider(handle: ColliderHandle): Collider | undefined {
    const collider = this.world.getCollider(handle) as Collider | undefined;
    return collider?.isValid() === true ? collider : undefined;
  }
}

export function applyBoosterPadVelocity(
  entryVelocity: Vector3Like,
  definition: Pick<
    BoosterPadDefinition,
    "deltaVelocity" | "velocityMultiplier" | "minimumVerticalSpeed"
  >,
): Vector3Like {
  const multiplier = definition.velocityMultiplier ?? 1;
  const withMultiplier = {
    x: entryVelocity.x * multiplier,
    y: entryVelocity.y,
    z: entryVelocity.z * multiplier,
  };
  const next = addDeltaVelocity(withMultiplier, definition.deltaVelocity);
  return {
    x: next.x,
    y: Math.max(next.y, definition.minimumVerticalSpeed ?? Number.NEGATIVE_INFINITY),
    z: next.z,
  };
}

function assertPadEffectDefinition(definition: BoosterPadDefinition): void {
  if (
    definition.velocityMultiplier !== undefined &&
    (!Number.isFinite(definition.velocityMultiplier) ||
      definition.velocityMultiplier <= 0 ||
      definition.velocityMultiplier > 1)
  ) {
    throw new RangeError("Pad velocity multiplier must be within (0, 1].");
  }
  if (
    definition.minimumVerticalSpeed !== undefined &&
    (!Number.isFinite(definition.minimumVerticalSpeed) || definition.minimumVerticalSpeed < 0)
  ) {
    throw new RangeError("Pad minimum vertical speed must be finite and non-negative.");
  }
}

function effectColors(effect: NonNullable<BoosterPadDefinition["effect"]>): {
  readonly base: number;
  readonly baseEmissive: number;
  readonly arrow: number;
  readonly arrowEmissive: number;
} {
  switch (effect) {
    case "launch":
      return { base: 0xd9741f, baseEmissive: 0x4d2100, arrow: 0xffe1a3, arrowEmissive: 0x855000 };
    case "bounce":
      return { base: 0x8b4bd1, baseEmissive: 0x35115f, arrow: 0xf1d8ff, arrowEmissive: 0x704099 };
    case "slow":
      return { base: 0x237f92, baseEmissive: 0x0a3540, arrow: 0xc6f5ff, arrowEmissive: 0x276879 };
    case "boost":
      return {
        base: BOOSTER_CONFIG.color,
        baseEmissive: 0x351010,
        arrow: 0xffb5ae,
        arrowEmissive: 0x6b1515,
      };
  }
}

function createArrowGeometry(): ShapeGeometry {
  const arrow = new Shape();
  arrow.moveTo(0, 0.72);
  arrow.lineTo(0.58, 0.08);
  arrow.lineTo(0.22, 0.08);
  arrow.lineTo(0.22, -0.62);
  arrow.lineTo(-0.22, -0.62);
  arrow.lineTo(-0.22, 0.08);
  arrow.lineTo(-0.58, 0.08);
  arrow.closePath();
  const geometry = new ShapeGeometry(arrow);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function assertPositiveHalfExtents(halfExtents: Vector3Like, label: string): void {
  if (
    !Number.isFinite(halfExtents.x) ||
    !Number.isFinite(halfExtents.y) ||
    !Number.isFinite(halfExtents.z) ||
    halfExtents.x <= 0 ||
    halfExtents.y <= 0 ||
    halfExtents.z <= 0
  ) {
    throw new RangeError(`${label} sensor half-extents must be finite and positive.`);
  }
}
