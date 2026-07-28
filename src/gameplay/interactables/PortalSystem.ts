import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
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
  DEFAULT_PORTAL_ENDPOINTS,
  PORTAL_CONFIG,
  type PortalEndpointDefinition,
  type PortalEndpointId,
  type PortalPairId,
} from "./interactable-config";
import {
  calculatePortalExitMotion,
  normalizeQuaternion,
  portalForwardFromRotation,
  type QuaternionLike,
  type Vector3Like,
} from "./trigger-math";

const LOCK_EPSILON = 1e-9;

export interface PortalLockDebugSnapshot {
  readonly lockedBodyCount: number;
  readonly locks: readonly {
    readonly bodyHandle: RigidBodyHandle;
    readonly destinationEndpointId: PortalEndpointId;
    readonly remainingSeconds: number;
  }[];
  readonly disposed: boolean;
}

interface PortalBodyLock {
  readonly destinationEndpointId: PortalEndpointId;
  remainingSeconds: number;
}

/**
 * Pure per-body lock state. A body may re-enter when it completely leaves the
 * destination sensor or when the deterministic 0.20-second fallback expires.
 */
export class PortalReentryGate {
  private readonly lockByBody = new Map<RigidBodyHandle, PortalBodyLock>();
  private disposed = false;

  public constructor(private readonly lockSeconds = 0.2) {
    if (!Number.isFinite(lockSeconds) || lockSeconds < 0) {
      throw new RangeError("Portal re-entry lock must be a finite non-negative number.");
    }
  }

  public canEnter(bodyHandle: RigidBodyHandle): boolean {
    return !this.disposed && !this.lockByBody.has(bodyHandle);
  }

  public lockAfterTeleport(
    bodyHandle: RigidBodyHandle,
    destinationEndpointId: PortalEndpointId,
  ): void {
    if (this.disposed) {
      return;
    }
    this.lockByBody.set(bodyHandle, {
      destinationEndpointId,
      remainingSeconds: this.lockSeconds,
    });
  }

  public destinationExited(bodyHandle: RigidBodyHandle, endpointId: PortalEndpointId): void {
    const lock = this.lockByBody.get(bodyHandle);
    if (lock?.destinationEndpointId === endpointId) {
      this.lockByBody.delete(bodyHandle);
    }
  }

  public fixedStep(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("Portal fixed-step delta must be a finite non-negative number.");
    }
    for (const [bodyHandle, lock] of this.lockByBody) {
      lock.remainingSeconds = Math.max(0, lock.remainingSeconds - deltaSeconds);
      if (lock.remainingSeconds <= LOCK_EPSILON) {
        this.lockByBody.delete(bodyHandle);
      }
    }
  }

  public forgetBody(bodyHandle: RigidBodyHandle): void {
    this.lockByBody.delete(bodyHandle);
  }

  public clear(): void {
    this.lockByBody.clear();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.clear();
    this.disposed = true;
  }

  public debugSnapshot(): PortalLockDebugSnapshot {
    return {
      lockedBodyCount: this.lockByBody.size,
      locks: [...this.lockByBody].map(([bodyHandle, lock]) => ({
        bodyHandle,
        destinationEndpointId: lock.destinationEndpointId,
        remainingSeconds: lock.remainingSeconds,
      })),
      disposed: this.disposed,
    };
  }
}

export interface PortalTeleportEvent {
  readonly bodyHandle: RigidBodyHandle;
  readonly sourceEndpointId: PortalEndpointId;
  readonly destinationEndpointId: PortalEndpointId;
  readonly sourcePosition: Vector3Like;
  readonly destinationPosition: Vector3Like;
  readonly entryLinearVelocity: Vector3Like;
  readonly exitLinearVelocity: Vector3Like;
  readonly preservedAngularVelocity: Vector3Like;
}

export interface PortalSystemOptions {
  readonly retainedSpeedFraction?: number;
  readonly reentryLockSeconds?: number;
  /**
   * Called synchronously after the Rapier teleport so an interpolation binding
   * can set previous/current snapshots to the same destination transform.
   */
  readonly onBodyTeleported?: (bodyHandle: RigidBodyHandle) => void;
  readonly onTeleport?: (event: PortalTeleportEvent) => void;
}

interface PortalEndpointRuntime {
  readonly definition: PortalEndpointDefinition;
  readonly normalizedRotation: QuaternionLike;
  readonly forward: Vector3Like;
  readonly collider: Collider;
  readonly contactsByBody: Map<RigidBodyHandle, Set<ColliderHandle>>;
}

export interface PortalEndpointDebugSnapshot {
  readonly id: PortalEndpointId;
  readonly pairId: PortalPairId;
  readonly pairedEndpointId: PortalEndpointId;
  readonly forward: Vector3Like;
  readonly contactingBodyCount: number;
}

export interface PortalSystemDebugSnapshot {
  readonly endpointCount: number;
  readonly pairCount: number;
  readonly sensorColliderCount: number;
  readonly contactingBodyCount: number;
  readonly teleportCount: number;
  readonly lastTeleport: PortalTeleportEvent | null;
  readonly highContrast: boolean;
  readonly lockedBodyCount: number;
  readonly endpoints: readonly PortalEndpointDebugSnapshot[];
  readonly disposed: boolean;
}

export class PortalSystem {
  public readonly root = new Group();
  private readonly endpointBySensorCollider = new Map<ColliderHandle, PortalEndpointRuntime>();
  private readonly endpointById = new Map<PortalEndpointId, PortalEndpointRuntime>();
  private readonly partnerIdByEndpointId: ReadonlyMap<PortalEndpointId, PortalEndpointId>;
  private readonly bodyByHandle = new Map<RigidBodyHandle, RigidBody>();
  private readonly bodyHandleByCollider = new Map<ColliderHandle, RigidBodyHandle>();
  private readonly geometries: BoxGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly gate: PortalReentryGate;
  private readonly retainedSpeedFraction: number;
  private readonly onBodyTeleported: ((bodyHandle: RigidBodyHandle) => void) | undefined;
  private readonly onTeleport: ((event: PortalTeleportEvent) => void) | undefined;
  private teleportCount = 0;
  private lastTeleport: PortalTeleportEvent | null = null;
  private portalMaterial: MeshStandardMaterial | undefined;
  private glowMaterial: MeshBasicMaterial | undefined;
  private highContrast = false;
  private disposed = false;

  public constructor(
    private readonly rapier: RapierModule,
    private readonly world: World,
    private readonly sceneRoot: Object3D,
    definitions: readonly PortalEndpointDefinition[] = DEFAULT_PORTAL_ENDPOINTS,
    options: PortalSystemOptions = {},
  ) {
    this.partnerIdByEndpointId = pairPortalEndpointIds(definitions);
    this.retainedSpeedFraction =
      options.retainedSpeedFraction ?? PORTAL_CONFIG.retainedSpeedFraction;
    if (!Number.isFinite(this.retainedSpeedFraction) || this.retainedSpeedFraction < 0) {
      throw new RangeError("Portal retained speed fraction must be finite and non-negative.");
    }
    this.gate = new PortalReentryGate(
      options.reentryLockSeconds ?? PORTAL_CONFIG.reentryLockSeconds,
    );
    this.onBodyTeleported = options.onBodyTeleported;
    this.onTeleport = options.onTeleport;
    this.root.name = "portal-system";
    sceneRoot.add(this.root);
    this.createEndpoints(definitions);
  }

  /**
   * Advance this at the start of each fixed physics step. Events drained after
   * that world step receive the complete configured lock duration.
   */
  public fixedStep(deltaSeconds: number): void {
    this.gate.fixedStep(deltaSeconds);
  }

  /**
   * Feed this from the world's one shared EventQueue drain. Returns true when
   * either collider belongs to a portal sensor.
   */
  public handleCollisionEvent(
    colliderHandleA: ColliderHandle,
    colliderHandleB: ColliderHandle,
    started: boolean,
  ): boolean {
    if (this.disposed) {
      return false;
    }
    const endpoint =
      this.endpointBySensorCollider.get(colliderHandleA) ??
      this.endpointBySensorCollider.get(colliderHandleB);
    if (endpoint === undefined) {
      return false;
    }

    const otherColliderHandle =
      endpoint.collider.handle === colliderHandleA ? colliderHandleB : colliderHandleA;
    const collider = this.getValidCollider(otherColliderHandle);
    const resolvedBody = collider?.parent();
    const body =
      resolvedBody !== null &&
      resolvedBody !== undefined &&
      resolvedBody.isValid() &&
      resolvedBody.isDynamic()
        ? resolvedBody
        : undefined;
    const bodyHandle = body?.handle ?? this.bodyHandleByCollider.get(otherColliderHandle);
    if (bodyHandle === undefined) {
      return true;
    }

    if (body !== undefined) {
      this.bodyByHandle.set(bodyHandle, body);
      this.bodyHandleByCollider.set(otherColliderHandle, bodyHandle);
    }

    if (started) {
      const firstContact = this.addEndpointContact(endpoint, bodyHandle, otherColliderHandle);
      if (firstContact && body !== undefined && this.gate.canEnter(bodyHandle)) {
        this.teleport(body, endpoint);
      }
    } else {
      const completelyExited = this.removeEndpointContact(
        endpoint,
        bodyHandle,
        otherColliderHandle,
      );
      if (completelyExited) {
        this.gate.destinationExited(bodyHandle, endpoint.definition.id);
      }
    }
    return true;
  }

  /**
   * Clear every lock/contact for a recovered or destroyed car/prop.
   */
  public forgetBody(bodyHandle: RigidBodyHandle): void {
    this.bodyByHandle.delete(bodyHandle);
    this.gate.forgetBody(bodyHandle);
    for (const endpoint of this.endpointById.values()) {
      endpoint.contactsByBody.delete(bodyHandle);
    }
    for (const [colliderHandle, mappedBodyHandle] of this.bodyHandleByCollider) {
      if (mappedBodyHandle === bodyHandle) {
        this.bodyHandleByCollider.delete(colliderHandle);
      }
    }
  }

  public clearTransientState(): void {
    this.bodyByHandle.clear();
    this.bodyHandleByCollider.clear();
    this.gate.clear();
    for (const endpoint of this.endpointById.values()) {
      endpoint.contactsByBody.clear();
    }
  }

  public setHighContrast(enabled: boolean): void {
    this.highContrast = enabled;
    if (this.portalMaterial !== undefined) {
      this.portalMaterial.color.setHex(enabled ? 0x005dff : PORTAL_CONFIG.baseColor);
      this.portalMaterial.emissive.setHex(enabled ? 0x8ee9ff : PORTAL_CONFIG.emissiveColor);
      this.portalMaterial.emissiveIntensity = enabled ? 1.35 : 0.75;
      this.portalMaterial.opacity = enabled ? 1 : PORTAL_CONFIG.opacity;
    }
    if (this.glowMaterial !== undefined) {
      this.glowMaterial.color.setHex(enabled ? 0xffffff : PORTAL_CONFIG.emissiveColor);
      this.glowMaterial.opacity = enabled ? 0.38 : 0.16;
    }
  }

  public debugSnapshot(): PortalSystemDebugSnapshot {
    const endpoints = [...this.endpointById.values()].map((endpoint) => ({
      id: endpoint.definition.id,
      pairId: endpoint.definition.pairId,
      pairedEndpointId: this.getPartnerId(endpoint.definition.id),
      forward: { ...endpoint.forward },
      contactingBodyCount: endpoint.contactsByBody.size,
    }));
    const contactingBodies = new Set<RigidBodyHandle>();
    for (const endpoint of this.endpointById.values()) {
      for (const bodyHandle of endpoint.contactsByBody.keys()) {
        contactingBodies.add(bodyHandle);
      }
    }
    return {
      endpointCount: endpoints.length,
      pairCount: endpoints.length / 2,
      sensorColliderCount: this.endpointBySensorCollider.size,
      contactingBodyCount: contactingBodies.size,
      teleportCount: this.teleportCount,
      highContrast: this.highContrast,
      lastTeleport:
        this.lastTeleport === null
          ? null
          : {
              bodyHandle: this.lastTeleport.bodyHandle,
              sourceEndpointId: this.lastTeleport.sourceEndpointId,
              destinationEndpointId: this.lastTeleport.destinationEndpointId,
              sourcePosition: { ...this.lastTeleport.sourcePosition },
              destinationPosition: { ...this.lastTeleport.destinationPosition },
              entryLinearVelocity: { ...this.lastTeleport.entryLinearVelocity },
              exitLinearVelocity: { ...this.lastTeleport.exitLinearVelocity },
              preservedAngularVelocity: { ...this.lastTeleport.preservedAngularVelocity },
            },
      lockedBodyCount: this.gate.debugSnapshot().lockedBodyCount,
      endpoints,
      disposed: this.disposed,
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.gate.dispose();
    for (const endpoint of this.endpointById.values()) {
      endpoint.contactsByBody.clear();
      if (endpoint.collider.isValid()) {
        this.world.removeCollider(endpoint.collider, false);
      }
    }
    this.endpointById.clear();
    this.endpointBySensorCollider.clear();
    this.bodyByHandle.clear();
    this.bodyHandleByCollider.clear();
    this.lastTeleport = null;
    this.sceneRoot.remove(this.root);
    this.root.clear();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
  }

  private createEndpoints(definitions: readonly PortalEndpointDefinition[]): void {
    const portalMaterial = new MeshStandardMaterial({
      color: PORTAL_CONFIG.baseColor,
      emissive: PORTAL_CONFIG.emissiveColor,
      emissiveIntensity: 0.75,
      transparent: true,
      opacity: PORTAL_CONFIG.opacity,
      depthWrite: false,
      metalness: 0.05,
      roughness: 0.25,
    });
    const glowMaterial = new MeshBasicMaterial({
      color: PORTAL_CONFIG.emissiveColor,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.portalMaterial = portalMaterial;
    this.glowMaterial = glowMaterial;
    this.materials.push(portalMaterial, glowMaterial);

    for (const definition of definitions) {
      assertPositiveHalfExtents(definition.halfExtents);
      const normalizedRotation = normalizeQuaternion(definition.rotation);
      const collider = this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(
          definition.halfExtents.x,
          definition.halfExtents.y,
          definition.halfExtents.z,
        )
          .setTranslation(definition.position.x, definition.position.y, definition.position.z)
          .setRotation(normalizedRotation)
          .setSensor(true)
          .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS)
          .setCollisionGroups(COLLISION_GROUPS.portalSensor),
      );

      const endpointRoot = new Group();
      endpointRoot.name = `portal-${definition.id}`;
      endpointRoot.position.set(
        definition.position.x,
        definition.position.y,
        definition.position.z,
      );
      endpointRoot.quaternion.set(
        normalizedRotation.x,
        normalizedRotation.y,
        normalizedRotation.z,
        normalizedRotation.w,
      );

      const geometry = new BoxGeometry(
        definition.halfExtents.x * 2,
        definition.halfExtents.y * 2,
        definition.halfExtents.z * 2,
      );
      this.geometries.push(geometry);
      const surface = new Mesh(geometry, portalMaterial);
      surface.renderOrder = 20;
      endpointRoot.add(surface);
      const glow = new Mesh(geometry, glowMaterial);
      glow.scale.set(1.055, 1.055, 1.2);
      glow.renderOrder = 19;
      endpointRoot.add(glow);
      this.root.add(endpointRoot);

      const runtime: PortalEndpointRuntime = {
        definition,
        normalizedRotation,
        forward: portalForwardFromRotation(normalizedRotation),
        collider,
        contactsByBody: new Map(),
      };
      this.endpointById.set(definition.id, runtime);
      this.endpointBySensorCollider.set(collider.handle, runtime);
    }
  }

  private teleport(body: RigidBody, source: PortalEndpointRuntime): void {
    const destinationId = this.getPartnerId(source.definition.id);
    const destination = this.endpointById.get(destinationId);
    if (destination === undefined) {
      throw new Error(`Missing portal endpoint runtime: ${destinationId}`);
    }
    const entryLinearVelocity = body.linvel();
    const entryAngularVelocity = body.angvel();
    const motion = calculatePortalExitMotion(
      entryLinearVelocity,
      entryAngularVelocity,
      destination.forward,
      this.retainedSpeedFraction,
    );

    // Lock before changing the transform so a destination overlap cannot
    // recursively accept the same body during this fixed-step event drain.
    this.gate.lockAfterTeleport(body.handle, destinationId);
    body.setTranslation(destination.definition.position, true);
    body.setRotation(destination.normalizedRotation, true);
    body.setLinvel(motion.linearVelocity, true);
    body.setAngvel(motion.angularVelocity, true);
    this.teleportCount += 1;
    this.onBodyTeleported?.(body.handle);
    const event: PortalTeleportEvent = {
      bodyHandle: body.handle,
      sourceEndpointId: source.definition.id,
      destinationEndpointId: destinationId,
      sourcePosition: { ...source.definition.position },
      destinationPosition: { ...destination.definition.position },
      entryLinearVelocity: { ...entryLinearVelocity },
      exitLinearVelocity: { ...motion.linearVelocity },
      preservedAngularVelocity: { ...motion.angularVelocity },
    };
    this.lastTeleport = event;
    this.onTeleport?.(event);
  }

  private addEndpointContact(
    endpoint: PortalEndpointRuntime,
    bodyHandle: RigidBodyHandle,
    colliderHandle: ColliderHandle,
  ): boolean {
    let colliders = endpoint.contactsByBody.get(bodyHandle);
    const firstContact = colliders === undefined;
    if (colliders === undefined) {
      colliders = new Set();
      endpoint.contactsByBody.set(bodyHandle, colliders);
    }
    colliders.add(colliderHandle);
    return firstContact;
  }

  private removeEndpointContact(
    endpoint: PortalEndpointRuntime,
    bodyHandle: RigidBodyHandle,
    colliderHandle: ColliderHandle,
  ): boolean {
    const colliders = endpoint.contactsByBody.get(bodyHandle);
    if (colliders === undefined) {
      return false;
    }
    colliders.delete(colliderHandle);
    if (colliders.size > 0) {
      return false;
    }
    endpoint.contactsByBody.delete(bodyHandle);
    return true;
  }

  private getPartnerId(endpointId: PortalEndpointId): PortalEndpointId {
    const partnerId = this.partnerIdByEndpointId.get(endpointId);
    if (partnerId === undefined) {
      throw new Error(`Portal endpoint is not paired: ${endpointId}`);
    }
    return partnerId;
  }

  private getValidCollider(handle: ColliderHandle): Collider | undefined {
    const collider = this.world.getCollider(handle) as Collider | undefined;
    return collider?.isValid() === true ? collider : undefined;
  }
}

export function pairPortalEndpointIds(
  definitions: readonly PortalEndpointDefinition[],
): ReadonlyMap<PortalEndpointId, PortalEndpointId> {
  const definitionById = new Map<PortalEndpointId, PortalEndpointDefinition>();
  const endpointsByPair = new Map<PortalPairId, PortalEndpointDefinition[]>();

  for (const definition of definitions) {
    if (definitionById.has(definition.id)) {
      throw new Error(`Duplicate portal endpoint ID: ${definition.id}`);
    }
    definitionById.set(definition.id, definition);
    const pair = endpointsByPair.get(definition.pairId) ?? [];
    pair.push(definition);
    endpointsByPair.set(definition.pairId, pair);
  }

  const partnerById = new Map<PortalEndpointId, PortalEndpointId>();
  for (const [pairId, pair] of endpointsByPair) {
    const endpointA = pair[0];
    const endpointB = pair[1];
    if (pair.length !== 2 || endpointA === undefined || endpointB === undefined) {
      throw new Error(
        `Portal pair ${pairId} must contain exactly two endpoints; received ${String(pair.length)}.`,
      );
    }
    partnerById.set(endpointA.id, endpointB.id);
    partnerById.set(endpointB.id, endpointA.id);
  }
  return partnerById;
}

function assertPositiveHalfExtents(halfExtents: Vector3Like): void {
  if (
    !Number.isFinite(halfExtents.x) ||
    !Number.isFinite(halfExtents.y) ||
    !Number.isFinite(halfExtents.z) ||
    halfExtents.x <= 0 ||
    halfExtents.y <= 0 ||
    halfExtents.z <= 0
  ) {
    throw new RangeError("Portal sensor half-extents must be finite and positive.");
  }
}
