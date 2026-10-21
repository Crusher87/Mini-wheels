import {
  AmbientLight,
  BoxGeometry,
  BoxHelper,
  BufferGeometry,
  Color,
  Curve,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  type OrthographicCamera,
  Plane,
  PointLight,
  Quaternion,
  Raycaster,
  type Scene,
  Spherical,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import {
  freeformFloorPlacement,
  simplifyTrackStroke,
  trackLength,
  type EditorAssetId,
  type PlacementOptions,
  type TrackPlacementOptions,
  type TrackWallBrushAction,
  type TrackWallBrushSide,
} from "./EditorSession";
import type {
  MapDocument,
  MapEntity,
  TrackDefinition,
  TrackRoadRange,
  Vector3Tuple,
} from "../maps/MapDocument";
import { createTrackPatternTexture, trackMaterialAppearance } from "../tracks/TrackAppearance";
import { placeKeyLight } from "../world/environment/EnvironmentSession";
import {
  WEDGE_INDICES,
  editorAssetDimensions,
  editorAssetEntityDimensions,
  editorAssetManifest,
  freeformFloorOutline,
  freeformPlatformPrism,
  regularPolygonPrism,
  roundedPlatformPrism,
  trackCornerPrism,
  tunnelComponentLayout,
  wedgeVertices,
} from "./EditorAssetCatalog";

const WORLD_UP = new Vector3(0, 1, 0);

function trackNodeKey(trackId: string, nodeId: string): string {
  return `${trackId}:${nodeId}`;
}

function trackTangentKey(trackId: string, nodeId: string, side: "in" | "out"): string {
  return `${trackId}:${nodeId}:${side}`;
}

function trackEndpointKey(trackId: string, side: "start" | "end"): string {
  return `${trackId}:${side}`;
}

export type EditorPickTarget =
  | Readonly<{ kind: "entity"; id: string }>
  | Readonly<{ kind: "track"; id: string }>
  | Readonly<{ kind: "track-node"; trackId: string; nodeId: string }>
  | Readonly<{
      kind: "track-endpoint";
      trackId: string;
      nodeId: string;
      side: "start" | "end";
    }>
  | Readonly<{
      kind: "track-tangent";
      trackId: string;
      nodeId: string;
      side: "in" | "out";
    }>;

interface TrackCrossSection {
  readonly center: Vector3;
  readonly tangent: Vector3;
  readonly lateral: Vector3;
  readonly left: Vector3;
  readonly right: Vector3;
  readonly distance: number;
  readonly materialId: string;
}

export interface EditorTrackDistanceHit {
  readonly trackId: string;
  readonly distance: number;
}

export interface RaisedBankedEdges {
  readonly center: Vector3;
  readonly left: Vector3;
  readonly right: Vector3;
}

export interface EditorCameraSnapshot {
  readonly target: Vector3Tuple;
  readonly radius: number;
  readonly phi: number;
  readonly theta: number;
  readonly zoom: number;
  readonly topDown: boolean;
}

export interface EditorPreviewRebuildSnapshot {
  readonly rebuiltEntities: number;
  readonly reusedEntities: number;
  readonly rebuiltTrackChunks: number;
  readonly reusedTrackChunks: number;
  readonly rebuiltWallGroups: number;
  readonly reusedWallGroups: number;
}

const EMPTY_REBUILD_SNAPSHOT: EditorPreviewRebuildSnapshot = Object.freeze({
  rebuiltEntities: 0,
  reusedEntities: 0,
  rebuiltTrackChunks: 0,
  reusedTrackChunks: 0,
  rebuiltWallGroups: 0,
  reusedWallGroups: 0,
});

/**
 * Keeps the lower edge at the authored centerline elevation. Banking therefore
 * only adds height instead of burying half of a road beneath its support floor.
 */
export function raisedBankedEdges(
  baseCenter: Vector3,
  bankedLateral: Vector3,
  width: number,
): RaisedBankedEdges {
  const halfWidth = bankedLateral.clone().multiplyScalar(width / 2);
  const center = baseCenter.clone().addScaledVector(WORLD_UP, Math.abs(halfWidth.y));
  return Object.freeze({
    center,
    left: center.clone().sub(halfWidth),
    right: center.clone().add(halfWidth),
  });
}

export class EditorPreviewSession {
  private readonly root = new Group();
  private readonly entityObjects = new Map<string, Object3D>();
  private readonly trackObjects = new Map<string, Object3D>();
  private readonly trackEndpointHandles = new Map<string, Object3D>();
  private readonly trackNodeHandles = new Map<string, Object3D>();
  private readonly trackTangentHandles = new Map<string, Object3D>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly buildPlane = new Plane(WORLD_UP, 0);
  private readonly cameraTarget = new Vector3();
  private readonly cameraSpherical = new Spherical();
  private selectedEntityIds: readonly string[] = Object.freeze([]);
  private readonly selectionHelpers: BoxHelper[] = [];
  private transformGizmo: Group | undefined;
  private transformMode: "move" | "rotate" | "scale" = "move";
  private placementGhost: Object3D | undefined;
  private placementGhostAsset: string | undefined;
  private trackGhost: Object3D | undefined;
  private trackRangePreview: Group | undefined;
  private routeLinkGroup: Group | undefined;
  private selectedTrackId: string | null = null;
  private selectedTrackNodeId: string | null = null;
  private trackSelectionGroup: Group | undefined;
  private hoverHelper: BoxHelper | undefined;
  private hoveredTargetKey: string | null = null;
  private previousDocument: MapDocument | undefined;
  private latestRebuildSnapshot = EMPTY_REBUILD_SNAPSHOT;
  private topDown = false;
  private disposed = false;
  private readonly previousBackground: Scene["background"];
  private readonly previousFog: Scene["fog"];

  public constructor(
    private readonly scene: Scene,
    private readonly camera: OrthographicCamera,
    document: MapDocument,
  ) {
    this.previousBackground = this.scene.background;
    this.previousFog = this.scene.fog;
    this.root.name = "editor-preview-session";
    this.scene.add(this.root);
    this.configureCamera();
    this.rebuild(document);
  }

  public rebuild(document: MapDocument): void {
    if (this.disposed) {
      return;
    }
    const previousSelection = this.selectedEntityIds;
    const previousTrackSelection = this.selectedTrackId;
    const previousTrackNodeSelection = this.selectedTrackNodeId;
    this.disposeSelectionHelper();
    this.disposeTrackSelection();
    this.disposeHoverHelper();
    this.scene.background = new Color(document.environment.backgroundColor);
    this.scene.fog = document.environment.fog.enabled
      ? new Fog(
          document.environment.fog.color,
          document.environment.fog.near,
          document.environment.fog.far,
        )
      : null;
    this.ensureSceneInfrastructure();
    const ambient = this.root.getObjectByName("editor-ambient-light");
    if (ambient instanceof AmbientLight) {
      ambient.color.set(document.environment.ambientLight.color);
      ambient.intensity = document.environment.ambientLight.intensity;
    }
    const sun = this.root.getObjectByName("editor-key-light");
    if (sun instanceof DirectionalLight) {
      sun.color.set(document.environment.keyLight.color);
      sun.intensity = document.environment.keyLight.intensity;
      placeKeyLight(sun, document.environment.keyLight.direction);
    }
    const previousEntities = new Map(
      this.previousDocument?.entities.map((entity) => [entity.id, entity]) ?? [],
    );
    const previousTracks = new Map(
      this.previousDocument?.tracks.map((track) => [track.id, track]) ?? [],
    );
    const nextEntityIds = new Set(document.entities.map((entity) => entity.id));
    const nextTrackIds = new Set(document.tracks.map((track) => track.id));
    let rebuiltEntities = 0;
    let reusedEntities = 0;
    let rebuiltTrackChunks = 0;
    let reusedTrackChunks = 0;
    let rebuiltWallGroups = 0;
    let reusedWallGroups = 0;

    for (const [entityId, object] of this.entityObjects) {
      if (!nextEntityIds.has(entityId)) {
        disposeObjectTree(object);
        object.removeFromParent();
        this.entityObjects.delete(entityId);
      }
    }
    for (const entity of document.entities) {
      const current = this.entityObjects.get(entity.id);
      if (current !== undefined && previousEntities.get(entity.id) === entity) {
        reusedEntities += 1;
        continue;
      }
      if (current !== undefined) {
        disposeObjectTree(current);
        current.removeFromParent();
      }
      const object = this.createEntityObject(entity);
      this.entityObjects.set(entity.id, object);
      this.root.add(object);
      rebuiltEntities += 1;
    }

    for (const [trackId, object] of this.trackObjects) {
      if (!nextTrackIds.has(trackId)) {
        disposeObjectTree(object);
        object.removeFromParent();
        this.trackObjects.delete(trackId);
      }
    }
    for (const track of document.tracks) {
      const current = this.trackObjects.get(track.id);
      const previousTrack = previousTracks.get(track.id);
      if (current === undefined || previousTrack === undefined) {
        const object = createTrackObject(track, false);
        object.userData["trackId"] = track.id;
        this.trackObjects.set(track.id, object);
        this.root.add(object);
        rebuiltTrackChunks += countTrackRoadChunks(object);
        rebuiltWallGroups += track.walls.length > 0 ? 1 : 0;
        continue;
      }
      if (previousTrack === track) {
        reusedTrackChunks += countTrackRoadChunks(current);
        reusedWallGroups += track.walls.length > 0 ? 1 : 0;
        continue;
      }
      const result = updateTrackObject(current, track);
      rebuiltTrackChunks += result.rebuiltTrackChunks;
      reusedTrackChunks += result.reusedTrackChunks;
      rebuiltWallGroups += result.rebuiltWallGroups;
      reusedWallGroups += result.reusedWallGroups;
    }
    this.rebuildEndpointHandles(document);
    this.rebuildRouteLinks(document);
    this.previousDocument = document;
    this.latestRebuildSnapshot = Object.freeze({
      rebuiltEntities,
      reusedEntities,
      rebuiltTrackChunks,
      reusedTrackChunks,
      rebuiltWallGroups,
      reusedWallGroups,
    });
    this.setSelectedEntities(previousSelection);
    this.setSelectedTrack(previousTrackSelection, document, previousTrackNodeSelection);
  }

  public rebuildSnapshot(): EditorPreviewRebuildSnapshot {
    return this.latestRebuildSnapshot;
  }

  private rebuildRouteLinks(document: MapDocument): void {
    if (this.routeLinkGroup !== undefined) {
      disposeObjectTree(this.routeLinkGroup);
      this.routeLinkGroup.removeFromParent();
    }
    const group = new Group();
    group.name = "editor-race-route-links";
    const entities = new Map(document.entities.map((entity) => [entity.id, entity]));
    const centers = new Map<string, Vector3>();
    for (const checkpointGroup of document.race.checkpointGroups) {
      const checkpoints = checkpointGroup.checkpointEntityIds
        .map((id) => entities.get(id))
        .filter((entity): entity is MapEntity => entity?.assetId === "race.checkpoint");
      if (checkpoints.length === 0) {
        continue;
      }
      const center = checkpoints.reduce(
        (sum, checkpoint) => sum.add(new Vector3(...checkpoint.transform.position)),
        new Vector3(),
      );
      center.multiplyScalar(1 / checkpoints.length).addScaledVector(WORLD_UP, 0.45);
      centers.set(checkpointGroup.id, center);
    }
    for (const edge of document.race.routeEdges) {
      const from = centers.get(edge.fromGroupId);
      const to = centers.get(edge.toGroupId);
      if (from === undefined || to === undefined) {
        continue;
      }
      const geometry = new BufferGeometry().setFromPoints([from, to]);
      const material = new LineBasicMaterial({
        color: edge.shortcut ? 0xbd67ff : 0x31d867,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const line = new Line(geometry, material);
      line.name = edge.shortcut ? "editor-shortcut-link" : "editor-route-link";
      line.renderOrder = 18;
      group.add(line);
    }
    for (const recoveryVolume of document.entities.filter(
      (entity) => entity.assetId === "race.recovery-volume",
    )) {
      const safePoseEntityId = recoveryVolume.properties["safePoseEntityId"];
      const safePose =
        typeof safePoseEntityId === "string" ? entities.get(safePoseEntityId) : undefined;
      if (safePose?.assetId !== "race.recovery-pose") {
        continue;
      }
      const from = new Vector3(...recoveryVolume.transform.position).addScaledVector(
        WORLD_UP,
        0.45,
      );
      const to = new Vector3(...safePose.transform.position).addScaledVector(WORLD_UP, 0.45);
      const geometry = new BufferGeometry().setFromPoints([from, to]);
      const material = new LineBasicMaterial({
        color: 0x4ee38a,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const line = new Line(geometry, material);
      line.name = "editor-recovery-link";
      line.renderOrder = 18;
      group.add(line);
    }
    const linkedPortals = new Set<string>();
    for (const portal of document.entities.filter((entity) => entity.assetId === "travel.portal")) {
      const peerId = portal.properties["peerPortalEntityId"];
      const peer = typeof peerId === "string" ? entities.get(peerId) : undefined;
      if (
        peer?.assetId !== "travel.portal" ||
        peer.properties["peerPortalEntityId"] !== portal.id
      ) {
        continue;
      }
      const pairKey = [portal.id, peer.id].sort().join(":");
      if (linkedPortals.has(pairKey)) {
        continue;
      }
      linkedPortals.add(pairKey);
      const from = new Vector3(...portal.transform.position);
      const to = new Vector3(...peer.transform.position);
      const material = new LineBasicMaterial({
        color: 0x6196ff,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      });
      const line = new Line(new BufferGeometry().setFromPoints([from, to]), material);
      line.name = "editor-portal-link";
      line.renderOrder = 18;
      group.add(line);
    }
    for (const interaction of document.interactions) {
      const source = entities.get(interaction.sourceEntityId);
      const target = entities.get(interaction.targetEntityId);
      if (source === undefined || target === undefined) {
        continue;
      }
      const from = new Vector3(...source.transform.position).addScaledVector(WORLD_UP, 0.35);
      const to = new Vector3(...target.transform.position).addScaledVector(WORLD_UP, 0.35);
      const material = new LineBasicMaterial({
        color: 0xffb347,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      });
      const line = new Line(new BufferGeometry().setFromPoints([from, to]), material);
      line.name = "editor-interaction-link";
      line.renderOrder = 18;
      group.add(line);
    }
    for (const platform of document.entities.filter(
      (entity) => entity.assetId === "motion.moving-platform" || entity.assetId === "motion.door",
    )) {
      const from = new Vector3(...platform.transform.position);
      const offset = new Vector3(
        readNumber(platform.properties["offsetX"], 0),
        readNumber(platform.properties["offsetY"], 5),
        readNumber(platform.properties["offsetZ"], 0),
      ).applyQuaternion(new Quaternion(...platform.transform.rotation));
      const to = from.clone().add(offset);
      const material = new LineBasicMaterial({
        color: 0x54d6a0,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      });
      const line = new Line(new BufferGeometry().setFromPoints([from, to]), material);
      line.name = "editor-moving-platform-path";
      line.renderOrder = 18;
      group.add(line);
      const endpoint = new Mesh(
        new SphereGeometry(0.22, 16, 10),
        new MeshBasicMaterial({ color: 0x54d6a0, depthTest: false }),
      );
      endpoint.name = "editor-moving-platform-endpoint";
      endpoint.position.copy(to);
      endpoint.renderOrder = 19;
      group.add(endpoint);
    }
    this.routeLinkGroup = group;
    this.root.add(group);
  }

  public setSelectedEntity(entityId: string | null): void {
    this.setSelectedEntities(entityId === null ? [] : [entityId]);
  }

  public setSelectedEntities(entityIds: readonly string[]): void {
    this.disposeSelectionHelper();
    this.selectedEntityIds = Object.freeze(
      entityIds.filter((entityId) => this.entityObjects.has(entityId)),
    );
    for (const entityId of this.selectedEntityIds) {
      const object = this.entityObjects.get(entityId);
      if (object === undefined) {
        continue;
      }
      const helper = new BoxHelper(object, 0x00e7ff);
      helper.name = "editor-selection-helper";
      helper.renderOrder = 20;
      this.selectionHelpers.push(helper);
      this.root.add(helper);
    }
    this.createTransformGizmo();
  }

  public setTransformMode(mode: "move" | "rotate" | "scale"): void {
    this.transformMode = mode;
    this.disposeTransformGizmo();
    this.createTransformGizmo();
  }

  public entitiesInScreenRectangle(
    left: number,
    top: number,
    right: number,
    bottom: number,
    viewport: DOMRectReadOnly,
  ): readonly string[] {
    const ids: string[] = [];
    const worldPosition = new Vector3();
    for (const [entityId, object] of this.entityObjects) {
      object.getWorldPosition(worldPosition);
      worldPosition.project(this.camera);
      const x = viewport.left + ((worldPosition.x + 1) / 2) * viewport.width;
      const y = viewport.top + ((1 - worldPosition.y) / 2) * viewport.height;
      if (x >= left && x <= right && y >= top && y <= bottom) {
        ids.push(entityId);
      }
    }
    return Object.freeze(ids);
  }

  public pickEntity(clientX: number, clientY: number, viewport: DOMRectReadOnly): string | null {
    this.setPointer(clientX, clientY, viewport);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects([...this.entityObjects.values()], true);
    for (const intersection of intersections) {
      let current: Object3D | null = intersection.object;
      while (current !== null && current !== this.root) {
        const entityId = (current.userData as Record<string, unknown>)["entityId"];
        if (typeof entityId === "string") {
          return entityId;
        }
        current = current.parent;
      }
    }
    return null;
  }

  public pickTrack(clientX: number, clientY: number, viewport: DOMRectReadOnly): string | null {
    this.setPointer(clientX, clientY, viewport);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects([...this.trackObjects.values()], true);
    for (const intersection of intersections) {
      let current: Object3D | null = intersection.object;
      while (current !== null && current !== this.root) {
        const trackId = (current.userData as Record<string, unknown>)["trackId"];
        if (typeof trackId === "string") {
          return trackId;
        }
        current = current.parent;
      }
    }
    return null;
  }

  public pickTrackDistance(
    clientX: number,
    clientY: number,
    viewport: DOMRectReadOnly,
    trackId: string,
  ): EditorTrackDistanceHit | null {
    const object = this.trackObjects.get(trackId);
    if (object === undefined) {
      return null;
    }
    this.setPointer(clientX, clientY, viewport);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersection = this.raycaster.intersectObject(object, true)[0];
    const sections = object.userData["trackSections"] as readonly TrackCrossSection[] | undefined;
    const authoredLength: unknown = object.userData["authoredTrackLength"];
    if (
      intersection === undefined ||
      sections === undefined ||
      sections.length < 2 ||
      typeof authoredLength !== "number"
    ) {
      return null;
    }
    const renderedLength = Math.max(0.1, sections.at(-1)?.distance ?? authoredLength);
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    let renderedDistance = 0;
    for (let index = 1; index < sections.length; index += 1) {
      const first = sections[index - 1];
      const second = sections[index];
      if (first === undefined || second === undefined) {
        continue;
      }
      const segment = second.center.clone().sub(first.center);
      const lengthSquared = segment.lengthSq();
      const alpha =
        lengthSquared < 1e-8
          ? 0
          : clamp(intersection.point.clone().sub(first.center).dot(segment) / lengthSquared, 0, 1);
      const closest = first.center.clone().addScaledVector(segment, alpha);
      const distanceSquared = closest.distanceToSquared(intersection.point);
      if (distanceSquared < closestDistanceSquared) {
        closestDistanceSquared = distanceSquared;
        renderedDistance = first.distance + (second.distance - first.distance) * alpha;
      }
    }
    return Object.freeze({
      trackId,
      distance: clamp((renderedDistance / renderedLength) * authoredLength, 0, authoredLength),
    });
  }

  public pickTarget(
    clientX: number,
    clientY: number,
    viewport: DOMRectReadOnly,
  ): EditorPickTarget | null {
    this.setPointer(clientX, clientY, viewport);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const endpointIntersection = this.raycaster.intersectObjects(
      [...this.trackEndpointHandles.values()],
      false,
    )[0];
    if (endpointIntersection !== undefined) {
      const userData = endpointIntersection.object.userData as Record<string, unknown>;
      const trackId = userData["trackId"];
      const nodeId = userData["trackNodeId"];
      const side = userData["trackEndpointSide"];
      if (
        typeof trackId === "string" &&
        typeof nodeId === "string" &&
        (side === "start" || side === "end")
      ) {
        return Object.freeze({ kind: "track-endpoint", trackId, nodeId, side });
      }
    }
    const tangentIntersection = this.raycaster.intersectObjects(
      [...this.trackTangentHandles.values()],
      false,
    )[0];
    if (tangentIntersection !== undefined) {
      const userData = tangentIntersection.object.userData as Record<string, unknown>;
      const trackId = userData["trackId"];
      const nodeId = userData["trackNodeId"];
      const side = userData["trackTangentSide"];
      if (
        typeof trackId === "string" &&
        typeof nodeId === "string" &&
        (side === "in" || side === "out")
      ) {
        return Object.freeze({ kind: "track-tangent", trackId, nodeId, side });
      }
    }
    const nodeIntersection = this.raycaster.intersectObjects(
      [...this.trackNodeHandles.values()],
      false,
    )[0];
    if (nodeIntersection !== undefined) {
      const userData = nodeIntersection.object.userData as Record<string, unknown>;
      const trackId = userData["trackId"];
      const nodeId = userData["trackNodeId"];
      if (typeof trackId === "string" && typeof nodeId === "string") {
        return Object.freeze({ kind: "track-node", trackId, nodeId });
      }
    }
    const intersections = this.raycaster.intersectObjects(
      [...this.entityObjects.values(), ...this.trackObjects.values()],
      true,
    );
    for (const intersection of intersections) {
      let current: Object3D | null = intersection.object;
      while (current !== null && current !== this.root) {
        const userData = current.userData as Record<string, unknown>;
        const entityId = userData["entityId"];
        if (typeof entityId === "string") {
          return Object.freeze({ kind: "entity", id: entityId });
        }
        const trackId = userData["trackId"];
        if (typeof trackId === "string") {
          return Object.freeze({ kind: "track", id: trackId });
        }
        current = current.parent;
      }
    }
    return null;
  }

  public setHoveredTarget(target: EditorPickTarget | null): void {
    const targetKey =
      target === null
        ? null
        : target.kind === "track-node" ||
            target.kind === "track-tangent" ||
            target.kind === "track-endpoint"
          ? `${target.kind}:${target.trackId}:${target.nodeId}${
              target.kind === "track-tangent" ? `:${target.side}` : ""
            }`
          : `${target.kind}:${target.id}`;
    if (targetKey === this.hoveredTargetKey) {
      return;
    }
    this.disposeHoverHelper();
    this.hoveredTargetKey = targetKey;
    if (target === null) {
      return;
    }
    const object =
      target.kind === "entity"
        ? this.entityObjects.get(target.id)
        : target.kind === "track"
          ? this.trackObjects.get(target.id)
          : target.kind === "track-endpoint"
            ? this.trackEndpointHandles.get(trackEndpointKey(target.trackId, target.side))
            : target.kind === "track-node"
              ? this.trackNodeHandles.get(trackNodeKey(target.trackId, target.nodeId))
              : this.trackTangentHandles.get(
                  trackTangentKey(target.trackId, target.nodeId, target.side),
                );
    if (object === undefined) {
      this.hoveredTargetKey = null;
      return;
    }
    const helper = new BoxHelper(object, 0xffc52f);
    helper.name = "editor-hover-helper";
    helper.renderOrder = 30;
    helper.material.depthTest = false;
    this.hoverHelper = helper;
    this.root.add(helper);
  }

  public setSelectedTrack(
    trackId: string | null,
    document: MapDocument,
    nodeId: string | null = null,
  ): void {
    this.disposeTrackSelection();
    this.selectedTrackId = trackId;
    this.selectedTrackNodeId = nodeId;
    if (trackId === null) {
      return;
    }
    const track = document.tracks.find((candidate) => candidate.id === trackId);
    const object = this.trackObjects.get(trackId);
    if (track === undefined || object === undefined) {
      this.selectedTrackId = null;
      this.selectedTrackNodeId = null;
      return;
    }
    const selection = new Group();
    selection.name = "editor-track-selection";
    selection.add(new BoxHelper(object, 0x00e7ff));
    for (const node of track.nodes) {
      const selected = node.id === nodeId;
      const handle = new Mesh(
        new BoxGeometry(selected ? 1.05 : 0.9, selected ? 1.05 : 0.9, selected ? 1.05 : 0.9),
        new MeshStandardMaterial({
          color: selected ? 0x35f06d : 0xff9f2f,
          emissive: selected ? 0x063d15 : 0x3d1800,
          depthTest: false,
        }),
      );
      handle.name = `editor-track-node:${node.id}`;
      handle.position.fromArray(node.position);
      handle.renderOrder = 25;
      handle.userData["trackId"] = track.id;
      handle.userData["trackNodeId"] = node.id;
      this.trackNodeHandles.set(trackNodeKey(track.id, node.id), handle);
      selection.add(handle);
      if (selected) {
        const nodePosition = new Vector3().fromArray(node.position);
        for (const side of ["in", "out"] as const) {
          const tangent = new Vector3().fromArray(side === "in" ? node.tangentIn : node.tangentOut);
          const tangentPosition = nodePosition.clone().add(tangent);
          const color = side === "in" ? 0x9b6cff : 0x00d5e7;
          const line = new Line(
            new BufferGeometry().setFromPoints([nodePosition, tangentPosition]),
            new LineBasicMaterial({ color, depthTest: false }),
          );
          line.name = `editor-track-tangent-line:${node.id}:${side}`;
          line.renderOrder = 24;
          const tangentHandle = new Mesh(
            new BoxGeometry(0.75, 0.75, 0.75),
            new MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 0.22,
              depthTest: false,
            }),
          );
          tangentHandle.name = `editor-track-tangent:${node.id}:${side}`;
          tangentHandle.position.copy(tangentPosition);
          tangentHandle.renderOrder = 26;
          tangentHandle.userData["trackId"] = track.id;
          tangentHandle.userData["trackNodeId"] = node.id;
          tangentHandle.userData["trackTangentSide"] = side;
          this.trackTangentHandles.set(trackTangentKey(track.id, node.id, side), tangentHandle);
          selection.add(line, tangentHandle);
        }
      }
    }
    this.trackSelectionGroup = selection;
    this.root.add(selection);
    // Make freshly-created handles pickable immediately, even before the next
    // render frame updates their world matrices.
    selection.updateMatrixWorld(true);
  }

  public setSelectedTrackNode(trackId: string, nodeId: string | null, document: MapDocument): void {
    this.setSelectedTrack(trackId, document, nodeId);
  }

  public showTrackGhost(points: readonly Vector3Tuple[], options: TrackPlacementOptions): void {
    this.hideTrackGhost();
    if (points.length < 2) {
      return;
    }
    this.trackGhost = createTrackObject(previewTrack(points, options), true);
    this.root.add(this.trackGhost);
  }

  public hideTrackGhost(): void {
    if (this.trackGhost !== undefined) {
      disposeObjectTree(this.trackGhost);
      this.trackGhost.removeFromParent();
      this.trackGhost = undefined;
    }
  }

  public showTrackRangePreview(
    track: TrackDefinition,
    startDistance: number,
    endDistance: number,
    side: TrackWallBrushSide,
    action: TrackWallBrushAction | "select",
  ): void {
    this.hideTrackRangePreview();
    const curve = new AuthoredTrackCurve(track);
    const sections = sampleTrackCrossSections(
      track,
      curve,
      Math.min(512, Math.max(24, track.nodes.length * 16)),
    );
    const authoredLength = Math.max(0.1, trackLength(track));
    const renderedLength = Math.max(0.1, sections.at(-1)?.distance ?? authoredLength);
    const start =
      (clamp(Math.min(startDistance, endDistance), 0, authoredLength) / authoredLength) *
      renderedLength;
    const end =
      (clamp(Math.max(startDistance, endDistance), 0, authoredLength) / authoredLength) *
      renderedLength;
    const selected = sections.filter(
      (section) => section.distance >= start - 0.01 && section.distance <= end + 0.01,
    );
    const nearestStart = nearestTrackSection(sections, start);
    const nearestEnd = nearestTrackSection(sections, end);
    if (nearestStart === undefined || nearestEnd === undefined) {
      return;
    }
    const rangeSections = [nearestStart, ...selected, nearestEnd].filter(
      (section, index, values) => index === 0 || section !== values[index - 1],
    );
    const lateralScale = side === "left" ? -0.48 : side === "right" ? 0.48 : 0;
    const points = rangeSections.map((section) =>
      section.center
        .clone()
        .addScaledVector(section.lateral, section.left.distanceTo(section.right) * lateralScale)
        .addScaledVector(WORLD_UP, 0.55),
    );
    if (points.length < 2) {
      points.push(points[0]?.clone().addScaledVector(WORLD_UP, 0.01) ?? new Vector3());
    }
    const color = action === "select" ? 0xffc52f : action === "paint" ? 0x35f06d : 0xff4a55;
    const group = new Group();
    group.name = "editor-track-range-preview";
    const line = new Line(
      new BufferGeometry().setFromPoints(points),
      new LineBasicMaterial({ color, depthTest: false }),
    );
    line.renderOrder = 40;
    group.add(line);
    for (const point of [points[0], points.at(-1)]) {
      if (point === undefined) {
        continue;
      }
      const handle = new Mesh(
        new BoxGeometry(0.8, 0.8, 0.8),
        new MeshBasicMaterial({ color, depthTest: false }),
      );
      handle.position.copy(point);
      handle.rotation.y = Math.PI / 4;
      handle.renderOrder = 41;
      group.add(handle);
    }
    this.trackRangePreview = group;
    this.root.add(group);
  }

  public hideTrackRangePreview(): void {
    if (this.trackRangePreview === undefined) {
      return;
    }
    disposeObjectTree(this.trackRangePreview);
    this.trackRangePreview.removeFromParent();
    this.trackRangePreview = undefined;
  }

  public pointOnBuildPlane(
    clientX: number,
    clientY: number,
    viewport: DOMRectReadOnly,
  ): Vector3Tuple | null {
    this.setPointer(clientX, clientY, viewport);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = this.raycaster.ray.intersectPlane(this.buildPlane, new Vector3());
    return point === null ? null : [point.x, point.y, point.z];
  }

  public pointOnBuildSurface(
    clientX: number,
    clientY: number,
    viewport: DOMRectReadOnly,
  ): Vector3Tuple | null {
    this.setPointer(clientX, clientY, viewport);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(
      [...this.entityObjects.values(), ...this.trackObjects.values()],
      true,
    );
    for (const intersection of intersections) {
      if (intersection.face == null) {
        continue;
      }
      const normal = intersection.face.normal
        .clone()
        .transformDirection(intersection.object.matrixWorld);
      if (normal.y >= 0.45) {
        return [intersection.point.x, intersection.point.y, intersection.point.z];
      }
    }
    return null;
  }

  public showPlacementGhost(
    assetId: EditorAssetId,
    position: Vector3Tuple,
    options: PlacementOptions,
  ): void {
    if (this.placementGhostAsset !== assetId) {
      this.hidePlacementGhost();
      this.placementGhost = this.createGhost(assetId);
      this.placementGhostAsset = assetId;
      this.root.add(this.placementGhost);
    }
    const ghost = this.placementGhost;
    if (ghost === undefined) {
      return;
    }
    const manifest = editorAssetManifest(assetId);
    const dimensions = editorAssetDimensions(
      assetId,
      options.primarySize,
      options.secondarySize ?? manifest?.defaultSecondarySize ?? options.primarySize,
    );
    const y = dimensions.groundOffset + options.elevation;
    ghost.position.set(position[0], y, position[2]);
    ghost.rotation.set(0, options.yawRadians, 0);
    if (assetId === "race.start-grid") {
      const scale = Math.max(0.5, options.primarySize) / 2.5;
      ghost.scale.set(scale, 1, scale);
    } else {
      ghost.scale.set(dimensions.width, dimensions.height, dimensions.depth);
    }
  }

  public showPrefabGhost(
    prefabId: string,
    entities: readonly MapEntity[],
    position: Vector3Tuple,
    yawRadians = 0,
  ): void {
    const key = `prefab:${prefabId}`;
    if (this.placementGhostAsset !== key) {
      this.hidePlacementGhost();
      const group = new Group();
      group.name = key;
      for (const entity of entities) {
        const object = this.createEntityObject(entity);
        object.traverse((child) => {
          if (child instanceof PointLight) {
            child.visible = false;
          }
          if (child instanceof Mesh) {
            const materials: Material[] = Array.isArray(child.material)
              ? (child.material as Material[])
              : [child.material as Material];
            for (const material of materials) {
              material.transparent = true;
              material.opacity = Math.min(material.opacity, 0.5);
              material.depthWrite = false;
            }
          }
        });
        group.add(object);
      }
      this.placementGhost = group;
      this.placementGhostAsset = key;
      this.root.add(group);
    }
    this.placementGhost?.position.fromArray(position);
    this.placementGhost?.rotation.set(0, yawRadians, 0);
    this.placementGhost?.scale.set(1, 1, 1);
  }

  public showFreeformFloorGhost(points: readonly Vector3Tuple[], elevation: number): void {
    this.hidePlacementGhost();
    const placement = freeformFloorPlacement(points);
    if (placement === null) {
      const geometry = new BufferGeometry();
      const vertices = points.flatMap((point) => [point[0], elevation + 0.08, point[2]]);
      if (points.length > 2) {
        const first = points[0]!;
        vertices.push(first[0], elevation + 0.08, first[2]);
      }
      geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
      this.placementGhost = new Line(
        geometry,
        new LineBasicMaterial({ color: points.length > 2 ? 0xff5b63 : 0x00a6b8 }),
      );
    } else {
      const prism = freeformPlatformPrism(placement.outline, 0.16);
      this.placementGhost = new Mesh(
        geometryFromArrays(prism.vertices, Array.from(prism.indices)),
        new MeshStandardMaterial({
          color: 0x00a6b8,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      this.placementGhost.position.set(
        placement.position[0],
        elevation - 0.08,
        placement.position[2],
      );
    }
    this.placementGhostAsset = "floor.freeform";
    this.root.add(this.placementGhost);
  }

  public hidePlacementGhost(): void {
    if (this.placementGhost !== undefined) {
      disposeObjectTree(this.placementGhost);
      this.placementGhost.removeFromParent();
    }
    this.placementGhost = undefined;
    this.placementGhostAsset = undefined;
  }

  public orbit(deltaX: number, deltaY: number): void {
    if (this.topDown) {
      this.topDown = false;
      this.camera.up.copy(WORLD_UP);
    }
    this.cameraSpherical.theta -= deltaX * 0.006;
    this.cameraSpherical.phi = clamp(this.cameraSpherical.phi - deltaY * 0.006, 0.18, 1.45);
    this.applyOrbitCamera();
  }

  public pan(deltaX: number, deltaY: number): void {
    const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();
    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const speed = 0.065 / Math.max(this.camera.zoom, 0.1);
    this.cameraTarget.addScaledVector(right, -deltaX * speed);
    this.cameraTarget.addScaledVector(forward, deltaY * speed);
    if (this.topDown) {
      this.applyTopDownCamera();
    } else {
      this.applyOrbitCamera();
    }
  }

  public zoom(deltaY: number): number {
    return this.setZoom(this.camera.zoom * Math.exp(-deltaY * 0.0012));
  }

  public setZoom(zoom: number): number {
    this.camera.zoom = clamp(zoom, 0.15, 3.5);
    this.camera.updateProjectionMatrix();
    return this.camera.zoom;
  }

  public get zoomLevel(): number {
    return this.camera.zoom;
  }

  public captureCamera(): EditorCameraSnapshot {
    return Object.freeze({
      target: Object.freeze(this.cameraTarget.toArray()),
      radius: this.cameraSpherical.radius,
      phi: this.cameraSpherical.phi,
      theta: this.cameraSpherical.theta,
      zoom: this.camera.zoom,
      topDown: this.topDown,
    });
  }

  public restoreCamera(snapshot: EditorCameraSnapshot): void {
    this.cameraTarget.fromArray(snapshot.target);
    this.cameraSpherical.set(snapshot.radius, snapshot.phi, snapshot.theta);
    this.topDown = snapshot.topDown;
    this.setZoom(snapshot.zoom);
    if (this.topDown) {
      this.applyTopDownCamera();
    } else {
      this.camera.up.copy(WORLD_UP);
      this.applyOrbitCamera();
    }
  }

  public toggleTopDown(): boolean {
    this.topDown = !this.topDown;
    if (this.topDown) {
      this.applyTopDownCamera();
    } else {
      this.camera.up.copy(WORLD_UP);
      this.applyOrbitCamera();
    }
    return this.topDown;
  }

  public frameSelected(): boolean {
    const selected = this.selectedEntityIds
      .map((entityId) => this.entityObjects.get(entityId))
      .filter((object): object is Object3D => object !== undefined);
    if (selected.length === 0) {
      return false;
    }
    this.cameraTarget.set(0, 0, 0);
    const position = new Vector3();
    for (const object of selected) {
      object.getWorldPosition(position);
      this.cameraTarget.add(position);
    }
    this.cameraTarget.multiplyScalar(1 / selected.length);
    this.camera.zoom = selected.length === 1 ? 1.7 : 1.25;
    this.camera.updateProjectionMatrix();
    if (this.topDown) {
      this.applyTopDownCamera();
    } else {
      this.applyOrbitCamera();
    }
    return true;
  }

  public frameTrack(document: MapDocument, trackId: string): boolean {
    const track = document.tracks.find((candidate) => candidate.id === trackId);
    if (track === undefined || track.nodes.length === 0) {
      return false;
    }
    this.cameraTarget.set(0, 0, 0);
    for (const node of track.nodes) {
      this.cameraTarget.add(new Vector3().fromArray(node.position));
    }
    this.cameraTarget.multiplyScalar(1 / track.nodes.length);
    this.camera.zoom = 1.25;
    this.camera.updateProjectionMatrix();
    if (this.topDown) {
      this.applyTopDownCamera();
    } else {
      this.applyOrbitCamera();
    }
    return true;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.clearRoot();
    this.root.removeFromParent();
    this.scene.background = this.previousBackground;
    this.scene.fog = this.previousFog;
  }

  private ensureSceneInfrastructure(): void {
    if (this.root.getObjectByName("editor-ambient-light") === undefined) {
      const ambient = new AmbientLight(0xffffff, 1.8);
      ambient.name = "editor-ambient-light";
      this.root.add(ambient);
    }
    if (this.root.getObjectByName("editor-key-light") === undefined) {
      const sun = new DirectionalLight(0xffffff, 2.5);
      sun.name = "editor-key-light";
      sun.position.set(20, 35, 16);
      this.root.add(sun);
    }
    if (this.root.getObjectByName("editor-build-grid") === undefined) {
      const grid = new GridHelper(80, 40, 0x007989, 0x73869a);
      grid.name = "editor-build-grid";
      grid.position.y = 0.01;
      const gridMaterials = (
        Array.isArray(grid.material) ? grid.material : [grid.material]
      ) as Material[];
      for (const material of gridMaterials) {
        material.transparent = true;
        material.opacity = 0.48;
      }
      this.root.add(grid);
    }
  }

  private rebuildEndpointHandles(document: MapDocument): void {
    for (const handle of this.trackEndpointHandles.values()) {
      disposeObjectTree(handle);
      handle.removeFromParent();
    }
    this.trackEndpointHandles.clear();
    for (const track of document.tracks) {
      if (track.closed) {
        continue;
      }
      for (const side of ["start", "end"] as const) {
        const node = side === "start" ? track.nodes[0] : track.nodes.at(-1);
        if (node === undefined) {
          continue;
        }
        const handle = new Mesh(
          new BoxGeometry(1.15, 1.15, 1.15),
          new MeshStandardMaterial({
            color: side === "start" ? 0xffc52f : 0x35f06d,
            emissive: side === "start" ? 0x5a3100 : 0x07531d,
            emissiveIntensity: 0.65,
            depthTest: false,
          }),
        );
        handle.name = `editor-track-endpoint:${track.id}:${side}`;
        handle.position.fromArray(node.position);
        // Split/open-loop ends can occupy the same authored position. Stack
        // their start/end pins slightly so both remain visible and clickable.
        handle.position.y += side === "start" ? 0.55 : 0.9;
        handle.rotation.y = Math.PI / 4;
        handle.renderOrder = 28;
        handle.userData["trackId"] = track.id;
        handle.userData["trackNodeId"] = node.id;
        handle.userData["trackEndpointSide"] = side;
        this.trackEndpointHandles.set(trackEndpointKey(track.id, side), handle);
        this.root.add(handle);
      }
    }
  }

  private configureCamera(): void {
    this.cameraTarget.set(0, 0, 0);
    this.camera.position.set(34, 32, 34);
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(this.cameraTarget);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.cameraSpherical.setFromVector3(this.camera.position.clone().sub(this.cameraTarget));
    this.camera.updateMatrixWorld(true);
  }

  private applyOrbitCamera(): void {
    const offset = new Vector3().setFromSpherical(this.cameraSpherical);
    this.camera.position.copy(this.cameraTarget).add(offset);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld(true);
  }

  private applyTopDownCamera(): void {
    this.camera.up.set(0, 0, -1);
    this.camera.position
      .copy(this.cameraTarget)
      .add(new Vector3(0, this.cameraSpherical.radius, 0));
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld(true);
  }

  private setPointer(clientX: number, clientY: number, viewport: DOMRectReadOnly): void {
    this.pointer.set(
      ((clientX - viewport.left) / Math.max(1, viewport.width)) * 2 - 1,
      -((clientY - viewport.top) / Math.max(1, viewport.height)) * 2 + 1,
    );
  }

  private createEntityObject(entity: MapEntity): Object3D {
    const manifest = editorAssetManifest(entity.assetId);
    const object =
      manifest?.renderKind === "start-grid"
        ? this.createStartMarker(entity)
        : manifest?.renderKind === "tunnel"
          ? this.createTunnelObject(entity)
          : manifest?.renderKind === "booster-pad"
            ? this.createBoosterPadObject(entity)
            : manifest?.renderKind === "surface-pad"
              ? this.createSurfacePadObject(entity)
              : manifest?.renderKind === "direction-arrow" || manifest?.renderKind === "arrow-sign"
                ? this.createGuidanceObject(entity)
                : manifest?.renderKind === "point-light" || manifest?.renderKind === "color-strip"
                  ? this.createDecorationObject(entity)
                  : manifest?.renderKind === "portal"
                    ? this.createPortalObject(entity)
                    : manifest?.renderKind === "race-marker"
                      ? this.createRaceMarkerObject(entity)
                      : this.createConstructionObject(entity);
    object.userData["entityId"] = entity.id;
    return object;
  }

  private createConstructionObject(entity: MapEntity): Mesh {
    const manifest = editorAssetManifest(entity.assetId);
    const dimensions = editorAssetEntityDimensions(entity) ?? {
      width: 1,
      height: 1,
      depth: 1,
      groundOffset: 0.5,
    };
    const color = readString(entity.properties["color"], "#dfe8ee");
    const prism =
      manifest?.renderKind === "rounded-prism"
        ? roundedPlatformPrism(
            dimensions.width,
            dimensions.height,
            dimensions.depth,
            readNumber(entity.properties["cornerRadius"], 1.5),
          )
        : manifest?.renderKind === "polygon-prism"
          ? regularPolygonPrism(
              dimensions.width,
              dimensions.height,
              dimensions.depth,
              readNumber(entity.properties["sides"], 6),
            )
          : manifest?.renderKind === "freeform-prism"
            ? freeformPlatformPrism(freeformFloorOutline(entity), dimensions.height)
            : manifest?.renderKind === "quarter-turn-prism"
              ? trackCornerPrism(
                  readNumber(entity.properties["radius"], 8),
                  readNumber(entity.properties["width"], 5),
                  dimensions.height,
                )
              : null;
    const geometry =
      manifest?.renderKind === "sphere"
        ? new SphereGeometry(dimensions.width / 2, 28, 18)
        : manifest?.renderKind === "column" || manifest?.renderKind === "disc"
          ? new CylinderGeometry(
              dimensions.width / 2,
              dimensions.width / 2,
              dimensions.height,
              manifest.renderKind === "disc" ? 40 : 24,
            )
          : manifest?.renderKind === "wedge"
            ? geometryFromArrays(
                wedgeVertices(dimensions.width, dimensions.height, dimensions.depth),
                WEDGE_INDICES,
              )
            : prism !== null
              ? geometryFromArrays(prism.vertices, Array.from(prism.indices))
              : new BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color,
        side: DoubleSide,
        emissive: entity.assetId === "floor.void-base" ? color : 0x000000,
        emissiveIntensity: entity.assetId === "floor.void-base" ? 0.12 : 0,
      }),
    );
    mesh.name = `editor-entity:${entity.id}`;
    applyEntityTransform(mesh, entity);
    mesh.receiveShadow = true;
    return mesh;
  }

  private createTunnelObject(entity: MapEntity): Group {
    const group = new Group();
    group.name = `editor-entity:${entity.id}`;
    const color = readString(entity.properties["color"], "#526d82");
    const layout = tunnelComponentLayout(
      readNumber(entity.properties["length"], 12),
      readNumber(entity.properties["clearWidth"], 6),
      readNumber(entity.properties["clearHeight"], 4.5),
      readNumber(entity.properties["wallThickness"], 0.45),
      readNumber(entity.properties["roofThickness"], 0.45),
    );
    for (const component of layout) {
      const mesh = new Mesh(
        new BoxGeometry(...component.size),
        new MeshStandardMaterial({ color, side: DoubleSide }),
      );
      mesh.name = `editor-tunnel:${component.kind}`;
      mesh.position.fromArray(component.position);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    applyEntityTransform(group, entity);
    return group;
  }

  private createStartMarker(entity: MapEntity): Group {
    const marker = new Group();
    marker.name = `editor-entity:${entity.id}`;
    applyEntityTransform(marker, entity);

    const spacing = readNumber(entity.properties["spacing"], 2.5);
    const pad = new Mesh(
      new BoxGeometry(spacing * 2.2, 0.12, spacing * 1.6),
      new MeshStandardMaterial({ color: 0x30d75b, emissive: 0x0b3d19 }),
    );
    pad.position.y = 0.08;
    marker.add(pad);

    const heading = new Mesh(
      new BoxGeometry(0.4, 0.18, spacing * 1.1),
      new MeshStandardMaterial({ color: 0x152638 }),
    );
    heading.position.set(0, 0.2, spacing * 0.6);
    marker.add(heading);
    return marker;
  }

  private createBoosterPadObject(entity: MapEntity): Group {
    const group = new Group();
    group.name = `editor-entity:${entity.id}`;
    const dimensions = editorAssetEntityDimensions(entity) ?? {
      width: 2.5,
      height: 0.16,
      depth: 3,
      groundOffset: 0.08,
    };
    const color = readString(
      entity.properties["color"],
      entity.assetId === "travel.launch-pad" ? "#ff9f2f" : "#ff4d59",
    );
    const base = new Mesh(
      new BoxGeometry(dimensions.width, dimensions.height, dimensions.depth),
      new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18 }),
    );
    base.receiveShadow = true;
    group.add(base);
    this.addBoosterArrow(group, dimensions.width, dimensions.height, dimensions.depth, 0xffffff);
    applyEntityTransform(group, entity);
    return group;
  }

  private createPortalObject(entity: MapEntity): Group {
    const dimensions = editorAssetEntityDimensions(entity) ?? {
      width: 3,
      height: 4,
      depth: 0.35,
      groundOffset: 2,
    };
    const color = readString(entity.properties["color"], "#337dff");
    const group = this.createPortalFrame(
      dimensions.width,
      dimensions.height,
      dimensions.depth,
      color,
      0.24,
    );
    group.name = `editor-entity:${entity.id}`;
    applyEntityTransform(group, entity);
    return group;
  }

  private createSurfacePadObject(entity: MapEntity): Group {
    const dimensions = editorAssetEntityDimensions(entity) ?? {
      width: 3,
      height: 0.16,
      depth: 3,
      groundOffset: 0.08,
    };
    const kind =
      entity.assetId === "travel.slow-zone"
        ? "slow"
        : entity.assetId === "interaction.button"
          ? "button"
          : entity.assetId === "interaction.pressure-plate"
            ? "plate"
            : "bounce";
    const color = readString(
      entity.properties["color"],
      kind === "slow" ? "#2b91a8" : kind === "button" ? "#ef4f5a" : "#a96cff",
    );
    const group = this.createSurfacePadFrame(
      dimensions.width,
      dimensions.height,
      dimensions.depth,
      color,
      kind,
      false,
    );
    group.name = `editor-entity:${entity.id}`;
    applyEntityTransform(group, entity);
    return group;
  }

  private createGuidanceObject(entity: MapEntity): Group {
    const dimensions = editorAssetEntityDimensions(entity) ?? {
      width: 3,
      height: 0.06,
      depth: 4,
      groundOffset: 0.03,
    };
    const color = readString(entity.properties["color"], "#f7e44d");
    const glow = readNumber(entity.properties["glow"], 0.5);
    const group =
      entity.assetId === "decoration.arrow-sign"
        ? this.createArrowSignFrame(
            dimensions.width,
            readNumber(entity.properties["boardHeight"], 2),
            dimensions.depth,
            readNumber(entity.properties["postHeight"], 2.5),
            color,
            glow,
            false,
          )
        : this.createDirectionArrowFrame(
            dimensions.width,
            dimensions.height,
            dimensions.depth,
            color,
            glow,
            false,
          );
    group.name = `editor-entity:${entity.id}`;
    applyEntityTransform(group, entity);
    return group;
  }

  private createDecorationObject(entity: MapEntity): Group {
    const dimensions = editorAssetEntityDimensions(entity) ?? {
      width: 1,
      height: 1,
      depth: 1,
      groundOffset: 0.5,
    };
    const color = readString(entity.properties["color"], "#35d5df");
    const enabled = entity.properties["enabled"] !== false;
    const group =
      entity.assetId === "decoration.point-light"
        ? this.createPointLightFrame(
            dimensions.height,
            dimensions.width,
            color,
            readNumber(entity.properties["intensity"], 4),
            readNumber(entity.properties["range"], 14),
            enabled,
            false,
          )
        : this.createColorStripFrame(
            dimensions.width,
            dimensions.height,
            dimensions.depth,
            color,
            readNumber(entity.properties["glow"], 0.8),
            enabled,
            false,
          );
    group.name = `editor-entity:${entity.id}`;
    applyEntityTransform(group, entity);
    return group;
  }

  private createPointLightFrame(
    height: number,
    bulbSize: number,
    color: string | number,
    intensity: number,
    range: number,
    enabled: boolean,
    transparent: boolean,
  ): Group {
    const group = new Group();
    const bulbCenterY = height / 2 - bulbSize / 2;
    const postHeight = Math.max(0.2, height - bulbSize * 0.75);
    const post = new Mesh(
      new CylinderGeometry(bulbSize * 0.16, bulbSize * 0.22, postHeight, 12),
      new MeshStandardMaterial({
        color: 0x52677b,
        transparent,
        opacity: transparent ? 0.5 : 1,
      }),
    );
    post.position.y = -height / 2 + postHeight / 2;
    group.add(post);
    const bulb = new Mesh(
      new SphereGeometry(bulbSize / 2, 20, 14),
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: enabled ? Math.min(2, 0.35 + intensity * 0.15) : 0,
        transparent,
        opacity: transparent ? 0.55 : 1,
      }),
    );
    bulb.position.y = bulbCenterY;
    group.add(bulb);
    if (enabled && !transparent) {
      const light = new PointLight(color, intensity, range, 2);
      light.position.y = bulbCenterY;
      group.add(light);
    }
    return group;
  }

  private createColorStripFrame(
    length: number,
    height: number,
    width: number,
    color: string | number,
    glow: number,
    enabled: boolean,
    transparent: boolean,
  ): Group {
    const group = new Group();
    group.add(
      new Mesh(
        new BoxGeometry(length, height, width),
        new MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: enabled ? glow : 0,
          transparent,
          opacity: transparent ? 0.5 : enabled ? 1 : 0.45,
          depthWrite: !transparent,
        }),
      ),
    );
    return group;
  }

  private createDirectionArrowFrame(
    width: number,
    height: number,
    depth: number,
    color: string | number,
    glow: number,
    transparent: boolean,
  ): Group {
    const group = new Group();
    const material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: glow,
      transparent,
      opacity: transparent ? 0.55 : 1,
      depthWrite: !transparent,
    });
    const stem = new Mesh(new BoxGeometry(width * 0.3, height, depth * 0.62), material);
    stem.position.z = -depth * 0.12;
    group.add(stem);
    for (const side of [-1, 1]) {
      const head = new Mesh(new BoxGeometry(width * 0.28, height, depth * 0.45), material.clone());
      head.position.set(side * width * 0.2, 0, depth * 0.27);
      head.rotation.y = side * -0.62;
      group.add(head);
    }
    return group;
  }

  private createArrowSignFrame(
    width: number,
    boardHeight: number,
    thickness: number,
    postHeight: number,
    color: string | number,
    glow: number,
    transparent: boolean,
  ): Group {
    const group = new Group();
    const totalHeight = boardHeight + postHeight;
    const boardCenterY = -totalHeight / 2 + postHeight + boardHeight / 2;
    const postCenterY = -totalHeight / 2 + postHeight / 2;
    const material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: glow,
      transparent,
      opacity: transparent ? 0.55 : 1,
      depthWrite: !transparent,
    });
    const board = new Mesh(new BoxGeometry(width, boardHeight, thickness), material);
    board.position.y = boardCenterY;
    group.add(board);
    const post = new Mesh(
      new BoxGeometry(Math.max(0.12, width * 0.1), postHeight, Math.max(0.12, thickness * 0.7)),
      new MeshStandardMaterial({ color: 0x52677b, transparent, opacity: transparent ? 0.55 : 1 }),
    );
    post.position.y = postCenterY;
    group.add(post);
    const arrow = this.createDirectionArrowFrame(
      width * 0.68,
      Math.max(0.04, thickness * 0.15),
      boardHeight * 0.65,
      0xffffff,
      0.35,
      transparent,
    );
    arrow.position.set(0, boardCenterY, thickness / 2 + 0.015);
    arrow.rotation.x = Math.PI / 2;
    group.add(arrow);
    return group;
  }

  private createSurfacePadFrame(
    width: number,
    height: number,
    depth: number,
    color: string | number,
    kind: "bounce" | "slow" | "button" | "plate",
    transparent: boolean,
  ): Group {
    const group = new Group();
    const base = new Mesh(
      new BoxGeometry(width, height, depth),
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.2,
        transparent,
        opacity: transparent ? 0.48 : 1,
        depthWrite: !transparent,
      }),
    );
    base.receiveShadow = true;
    group.add(base);
    const symbolMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.25,
      transparent,
      opacity: transparent ? 0.7 : 1,
      depthWrite: !transparent,
    });
    const symbolHeight = Math.max(0.04, height * 0.25);
    if (kind === "bounce") {
      for (const rotation of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        const bar = new Mesh(
          new BoxGeometry(width * 0.14, symbolHeight, depth * 0.62),
          symbolMaterial.clone(),
        );
        bar.position.y = height / 2 + symbolHeight / 2 + 0.01;
        bar.rotation.y = rotation;
        group.add(bar);
      }
    } else if (kind === "slow") {
      for (const offset of [-0.24, 0, 0.24]) {
        const bar = new Mesh(
          new BoxGeometry(width * 0.72, symbolHeight, depth * 0.09),
          symbolMaterial.clone(),
        );
        bar.position.set(0, height / 2 + symbolHeight / 2 + 0.01, offset * depth);
        bar.rotation.y = offset === 0 ? 0.12 : -0.12;
        group.add(bar);
      }
    } else {
      const marker = new Mesh(
        kind === "button"
          ? new CylinderGeometry(width * 0.3, width * 0.3, symbolHeight, 24)
          : new BoxGeometry(width * 0.68, symbolHeight, depth * 0.68),
        symbolMaterial,
      );
      marker.position.y = height / 2 + symbolHeight / 2 + 0.01;
      group.add(marker);
    }
    return group;
  }

  private createPortalFrame(
    width: number,
    height: number,
    depth: number,
    color: string | number,
    opacity: number,
  ): Group {
    const group = new Group();
    const surface = new Mesh(
      new BoxGeometry(width, height, depth),
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    group.add(surface);
    const frameMaterial = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
    });
    const frameSize = Math.max(0.12, Math.min(width, height) * 0.1);
    for (const side of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(frameSize, height, depth * 1.5), frameMaterial.clone());
      post.position.x = side * (width / 2 - frameSize / 2);
      group.add(post);
    }
    for (const side of [-1, 1]) {
      const rail = new Mesh(new BoxGeometry(width, frameSize, depth * 1.5), frameMaterial.clone());
      rail.position.y = side * (height / 2 - frameSize / 2);
      group.add(rail);
    }
    const direction = new Mesh(
      new BoxGeometry(Math.max(0.16, width * 0.12), 0.08, Math.max(0.8, width * 0.5)),
      frameMaterial.clone(),
    );
    direction.position.set(0, -height / 2 + 0.08, depth / 2 + width * 0.25);
    group.add(direction);
    return group;
  }

  private addBoosterArrow(
    group: Group,
    width: number,
    height: number,
    depth: number,
    color: number,
  ): void {
    const material = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
    const arrowHeight = Math.max(0.04, height * 0.24);
    const stem = new Mesh(new BoxGeometry(width * 0.18, arrowHeight, depth * 0.52), material);
    stem.position.set(0, height / 2 + arrowHeight / 2 + 0.01, -depth * 0.08);
    group.add(stem);
    for (const side of [-1, 1]) {
      const head = new Mesh(
        new BoxGeometry(width * 0.18, arrowHeight, depth * 0.42),
        material.clone(),
      );
      head.position.set(side * width * 0.13, stem.position.y, depth * 0.24);
      head.rotation.y = side * -0.62;
      group.add(head);
    }
  }

  private createRaceMarkerObject(entity: MapEntity): Group {
    const marker = new Group();
    marker.name = `editor-entity:${entity.id}`;
    const dimensions = editorAssetEntityDimensions(entity) ?? {
      width: 2,
      height: 2,
      depth: 2,
      groundOffset: 1,
    };
    const color = readString(entity.properties["color"], "#34d9e5");
    if (entity.assetId === "race.player-spawn" || entity.assetId === "race.recovery-pose") {
      const pad = new Mesh(
        new CylinderGeometry(dimensions.width / 2, dimensions.width / 2, 0.12, 24),
        new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 }),
      );
      marker.add(pad);
      const heading = new Mesh(
        new BoxGeometry(dimensions.width * 0.18, 0.16, dimensions.depth * 0.65),
        new MeshStandardMaterial({ color: 0x152638 }),
      );
      heading.position.z = dimensions.depth * 0.35;
      heading.position.y = 0.12;
      marker.add(heading);
    } else {
      const volume = new Mesh(
        new BoxGeometry(dimensions.width, dimensions.height, dimensions.depth),
        new MeshStandardMaterial({
          color,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      marker.add(volume);
      if (entity.assetId === "race.checkpoint" || entity.assetId === "race.finish-gate") {
        const frameMaterial = new MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.18,
        });
        const postWidth = Math.min(0.35, dimensions.width * 0.08);
        const topHeight = Math.min(0.35, dimensions.height * 0.12);
        for (const side of [-1, 1]) {
          const post = new Mesh(
            new BoxGeometry(postWidth, dimensions.height, Math.max(0.2, dimensions.depth * 0.25)),
            frameMaterial.clone(),
          );
          post.position.x = side * (dimensions.width / 2 - postWidth / 2);
          marker.add(post);
        }
        const top = new Mesh(
          new BoxGeometry(dimensions.width, topHeight, Math.max(0.2, dimensions.depth * 0.25)),
          frameMaterial,
        );
        top.position.y = dimensions.height / 2 - topHeight / 2;
        marker.add(top);
      }
    }
    applyEntityTransform(marker, entity);
    return marker;
  }

  private createGhost(assetId: EditorAssetId): Object3D {
    const manifest = editorAssetManifest(assetId);
    if (manifest?.renderKind === "tunnel") {
      const ghost = new Group();
      for (const component of tunnelComponentLayout(1, 0.82, 0.85, 0.09, 0.15)) {
        const mesh = new Mesh(
          new BoxGeometry(...component.size),
          new MeshStandardMaterial({
            color: 0x00a6b8,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            side: DoubleSide,
          }),
        );
        mesh.position.fromArray(component.position);
        ghost.add(mesh);
      }
      return ghost;
    }
    if (manifest?.renderKind === "booster-pad") {
      const ghost = new Group();
      const material = new MeshStandardMaterial({
        color: 0x00a6b8,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      });
      ghost.add(new Mesh(new BoxGeometry(1, 1, 1), material));
      this.addBoosterArrow(ghost, 1, 1, 1, 0xffffff);
      return ghost;
    }
    if (manifest?.renderKind === "surface-pad") {
      return this.createSurfacePadFrame(
        1,
        1,
        1,
        0x00a6b8,
        assetId === "travel.slow-zone"
          ? "slow"
          : assetId === "interaction.button"
            ? "button"
            : assetId === "interaction.pressure-plate"
              ? "plate"
              : "bounce",
        true,
      );
    }
    if (manifest?.renderKind === "direction-arrow") {
      return this.createDirectionArrowFrame(1, 1, 1, 0x00a6b8, 0.45, true);
    }
    if (manifest?.renderKind === "arrow-sign") {
      return this.createArrowSignFrame(1, 0.45, 1, 0.55, 0x00a6b8, 0.35, true);
    }
    if (manifest?.renderKind === "point-light") {
      return this.createPointLightFrame(1, 0.35, 0x00a6b8, 0, 2, false, true);
    }
    if (manifest?.renderKind === "color-strip") {
      return this.createColorStripFrame(1, 0.1, 0.25, 0x00a6b8, 0.4, true, true);
    }
    if (manifest?.renderKind === "portal") {
      return this.createPortalFrame(1, 1, 1, 0x00a6b8, 0.38);
    }
    if (manifest?.renderKind !== "start-grid") {
      const prism =
        manifest?.renderKind === "rounded-prism"
          ? roundedPlatformPrism(1, 1, 1, 0.2)
          : manifest?.renderKind === "polygon-prism"
            ? regularPolygonPrism(1, 1, 1, 6)
            : manifest?.renderKind === "freeform-prism"
              ? freeformPlatformPrism(
                  [
                    [-0.5, -0.3],
                    [0, -0.5],
                    [0.5, -0.25],
                    [0.4, 0.45],
                    [-0.15, 0.5],
                    [-0.5, 0.2],
                  ],
                  1,
                )
              : manifest?.renderKind === "quarter-turn-prism"
                ? trackCornerPrism(0.75, 0.5, 1)
                : null;
      const geometry =
        manifest?.renderKind === "sphere"
          ? new SphereGeometry(0.5, 24, 16)
          : manifest?.renderKind === "column" || manifest?.renderKind === "disc"
            ? new CylinderGeometry(0.5, 0.5, 1, manifest.renderKind === "disc" ? 40 : 20)
            : manifest?.renderKind === "wedge"
              ? geometryFromArrays(wedgeVertices(1, 1, 1), WEDGE_INDICES)
              : prism !== null
                ? geometryFromArrays(prism.vertices, Array.from(prism.indices))
                : new BoxGeometry(1, 1, 1);
      return new Mesh(
        geometry,
        new MeshStandardMaterial({
          color: 0x00a6b8,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
    }
    const ghost = new Group();
    const material = new MeshStandardMaterial({
      color: 0x30d75b,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    ghost.add(new Mesh(new BoxGeometry(5.5, 0.12, 4), material));
    const heading = new Mesh(new BoxGeometry(0.4, 0.18, 2.8), material.clone());
    heading.position.set(0, 0.2, 1.5);
    ghost.add(heading);
    return ghost;
  }

  private clearRoot(): void {
    this.disposeSelectionHelper();
    this.disposeTrackSelection();
    this.disposeHoverHelper();
    this.placementGhost = undefined;
    this.placementGhostAsset = undefined;
    this.trackGhost = undefined;
    this.trackRangePreview = undefined;
    this.previousDocument = undefined;
    this.latestRebuildSnapshot = EMPTY_REBUILD_SNAPSHOT;
    this.entityObjects.clear();
    this.trackObjects.clear();
    this.trackEndpointHandles.clear();
    for (const child of [...this.root.children]) {
      disposeObjectTree(child);
      child.removeFromParent();
    }
  }

  private disposeSelectionHelper(): void {
    this.disposeTransformGizmo();
    for (const helper of this.selectionHelpers) {
      helper.geometry.dispose();
      helper.material.dispose();
      helper.removeFromParent();
    }
    this.selectionHelpers.length = 0;
  }

  private disposeTrackSelection(): void {
    this.trackNodeHandles.clear();
    this.trackTangentHandles.clear();
    if (this.trackSelectionGroup === undefined) {
      return;
    }
    disposeObjectTree(this.trackSelectionGroup);
    this.trackSelectionGroup.removeFromParent();
    this.trackSelectionGroup = undefined;
  }

  private disposeHoverHelper(): void {
    if (this.hoverHelper !== undefined) {
      this.hoverHelper.geometry.dispose();
      this.hoverHelper.material.dispose();
      this.hoverHelper.removeFromParent();
      this.hoverHelper = undefined;
    }
    this.hoveredTargetKey = null;
  }

  private createTransformGizmo(): void {
    if (this.selectedEntityIds.length === 0) {
      return;
    }
    const gizmo = new Group();
    gizmo.name = `editor-${this.transformMode}-gizmo`;
    const center = new Vector3();
    const position = new Vector3();
    let count = 0;
    for (const entityId of this.selectedEntityIds) {
      const object = this.entityObjects.get(entityId);
      if (object !== undefined) {
        object.getWorldPosition(position);
        center.add(position);
        count += 1;
      }
    }
    if (count === 0) {
      return;
    }
    gizmo.position.copy(center.multiplyScalar(1 / count));
    gizmo.position.y += 0.8;
    if (this.transformMode === "rotate") {
      const material = new MeshStandardMaterial({ color: 0xff9f2f, emissive: 0x4a2100 });
      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const marker = new Mesh(new BoxGeometry(0.22, 0.12, 0.55), material.clone());
        marker.position.set(Math.cos(angle) * 2, 0, Math.sin(angle) * 2);
        marker.rotation.y = -angle;
        gizmo.add(marker);
      }
    } else {
      const length = this.transformMode === "scale" ? 1.55 : 2.2;
      const thickness = this.transformMode === "scale" ? 0.22 : 0.12;
      const xAxis = new Mesh(
        new BoxGeometry(length, thickness, thickness),
        new MeshStandardMaterial({ color: 0xff4b55, emissive: 0x3b080b }),
      );
      xAxis.position.x = length / 2;
      const yAxis = new Mesh(
        new BoxGeometry(thickness, length, thickness),
        new MeshStandardMaterial({ color: 0x30d75b, emissive: 0x073a16 }),
      );
      yAxis.position.y = length / 2;
      const zAxis = new Mesh(
        new BoxGeometry(thickness, thickness, length),
        new MeshStandardMaterial({ color: 0x348cff, emissive: 0x071d3d }),
      );
      zAxis.position.z = length / 2;
      gizmo.add(xAxis, yAxis, zAxis);
    }
    this.transformGizmo = gizmo;
    this.root.add(gizmo);
  }

  private disposeTransformGizmo(): void {
    if (this.transformGizmo === undefined) {
      return;
    }
    disposeObjectTree(this.transformGizmo);
    this.transformGizmo.removeFromParent();
    this.transformGizmo = undefined;
  }
}

function previewTrack(
  points: readonly Vector3Tuple[],
  options: TrackPlacementOptions,
): TrackDefinition {
  const simplified = simplifyTrackStroke(points, clamp(options.width * 0.12, 0.5, 1.5));
  const shouldClose =
    simplified.length >= 4 &&
    vectorDistance(simplified[0]!, simplified.at(-1)!) <= Math.max(2, options.width * 1.25);
  const previewPoints = shouldClose ? simplified.slice(0, -1) : simplified;
  return {
    id: "preview-track",
    closed: shouldClose,
    surface: "normal",
    materialId: "track.asphalt",
    nodes: previewPoints.map((point, index) => {
      const previous = shouldClose
        ? (previewPoints[(index - 1 + previewPoints.length) % previewPoints.length] ?? point)
        : (previewPoints[Math.max(0, index - 1)] ?? point);
      const next = shouldClose
        ? (previewPoints[(index + 1) % previewPoints.length] ?? point)
        : (previewPoints[Math.min(previewPoints.length - 1, index + 1)] ?? point);
      const tangent: Vector3Tuple = [
        (next[0] - previous[0]) / 3,
        (next[1] - previous[1]) / 3,
        (next[2] - previous[2]) / 3,
      ];
      return {
        id: `preview-node-${String(index)}`,
        position: [point[0], point[1] + options.elevation, point[2]],
        tangentIn: [-tangent[0], -tangent[1], -tangent[2]],
        tangentOut: tangent,
        width: options.width,
        bankRadians: options.bankRadians,
      };
    }),
    walls: [],
  };
}

export class AuthoredTrackCurve extends Curve<Vector3> {
  public constructor(private readonly track: TrackDefinition) {
    super();
  }

  public override getPoint(t: number, optionalTarget = new Vector3()): Vector3 {
    const nodes = this.track.nodes;
    const segmentCount = this.track.closed ? nodes.length : nodes.length - 1;
    if (nodes.length === 0 || segmentCount <= 0) {
      return optionalTarget.set(0, 0, 0);
    }
    const scaled = clamp(t, 0, 1) * segmentCount;
    const segmentIndex = Math.min(segmentCount - 1, Math.floor(scaled));
    const localT = Math.min(1, scaled - segmentIndex);
    const first = nodes[segmentIndex]!;
    const second = nodes[(segmentIndex + 1) % nodes.length]!;
    const start = new Vector3().fromArray(first.position);
    const end = new Vector3().fromArray(second.position);
    const fallback = end
      .clone()
      .sub(start)
      .multiplyScalar(1 / 3);
    const outgoing = new Vector3().fromArray(first.tangentOut);
    const incoming = new Vector3().fromArray(second.tangentIn);
    const firstControl = start.clone().add(outgoing.lengthSq() < 1e-8 ? fallback : outgoing);
    const secondControl = end
      .clone()
      .add(incoming.lengthSq() < 1e-8 ? fallback.clone().negate() : incoming);
    // Keep vertical Bezier handles inside a conservative envelope. Unbounded
    // Y tangents can fold a road back through itself and make stacked tracks
    // appear to swap height. Small authored humps remain possible, while
    // ordinary ramps stay monotonic between their endpoint heights.
    const horizontalSpan = Math.hypot(end.x - start.x, end.z - start.z);
    const heightSpan = Math.abs(end.y - start.y);
    const safeOvershoot = Math.min(horizontalSpan * 0.35, Math.max(0.75, heightSpan * 0.25));
    const minimumControlHeight = Math.min(start.y, end.y) - safeOvershoot;
    const maximumControlHeight = Math.max(start.y, end.y) + safeOvershoot;
    firstControl.y = clamp(firstControl.y, minimumControlHeight, maximumControlHeight);
    secondControl.y = clamp(secondControl.y, minimumControlHeight, maximumControlHeight);
    const inverseT = 1 - localT;
    return optionalTarget
      .copy(start)
      .multiplyScalar(inverseT * inverseT * inverseT)
      .addScaledVector(firstControl, 3 * inverseT * inverseT * localT)
      .addScaledVector(secondControl, 3 * inverseT * localT * localT)
      .addScaledVector(end, localT * localT * localT);
  }
}

function createTrackObject(track: TrackDefinition, ghost: boolean): Group {
  const root = new Group();
  root.name = `${ghost ? "editor-track-ghost" : "editor-track"}:${track.id}`;
  const renderTrack = track;
  const curve = new AuthoredTrackCurve(renderTrack);
  const divisions = Math.min(512, Math.max(24, renderTrack.nodes.length * 16));
  const sections = sampleTrackCrossSections(renderTrack, curve, divisions);
  root.userData["trackSections"] = sections;
  root.userData["authoredTrackLength"] = Math.max(0.1, trackLength(renderTrack));
  addTrackRoadChunks(root, track, sections, ghost);

  if (!ghost && track.walls.length > 0) {
    root.add(createTrackWallGroup(track, sections));
  }
  return root;
}

const PREVIEW_ROAD_CHUNK_SEGMENTS = 16;

interface TrackObjectUpdateResult {
  readonly rebuiltTrackChunks: number;
  readonly reusedTrackChunks: number;
  readonly rebuiltWallGroups: number;
  readonly reusedWallGroups: number;
}

function addTrackRoadChunks(
  root: Group,
  track: TrackDefinition,
  sections: readonly TrackCrossSection[],
  ghost: boolean,
): void {
  const segmentCount = Math.max(0, sections.length - 1);
  for (let start = 0, chunkIndex = 0; start < segmentCount; chunkIndex += 1) {
    const end = Math.min(segmentCount, start + PREVIEW_ROAD_CHUNK_SEGMENTS);
    root.add(createTrackRoadChunk(track, sections, start, end, chunkIndex, ghost));
    start = end;
  }
}

function createTrackRoadChunk(
  track: TrackDefinition,
  sections: readonly TrackCrossSection[],
  segmentStart: number,
  segmentEnd: number,
  chunkIndex: number,
  ghost: boolean,
): Group {
  const root = new Group();
  root.name = `editor-track-road-chunk:${String(chunkIndex)}`;
  root.userData["trackRoadChunkIndex"] = chunkIndex;
  root.userData["trackRoadChunkSignature"] = trackRoadChunkSignature(
    sections,
    segmentStart,
    segmentEnd,
  );
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const roadGroups: Array<{ start: number; count: number; materialId: string }> = [];
  const roadThickness = ghost ? 0.12 : 0.22;
  const included = sections.slice(segmentStart, segmentEnd + 1);
  for (const section of included) {
    const bottomLeft = section.left.clone().addScaledVector(WORLD_UP, -roadThickness);
    const bottomRight = section.right.clone().addScaledVector(WORLD_UP, -roadThickness);
    positions.push(
      ...section.left.toArray(),
      ...section.right.toArray(),
      ...bottomLeft.toArray(),
      ...bottomRight.toArray(),
    );
    const longitudinal = section.distance / 4;
    uvs.push(0, longitudinal, 1, longitudinal, 0, longitudinal, 1, longitudinal);
  }
  for (let localIndex = 0; localIndex < included.length - 1; localIndex += 1) {
    const base = localIndex * 4;
    const next = base + 4;
    const groupStart = indices.length;
    // Top, bottom, and both edges form one continuous solid road ribbon.
    indices.push(
      base,
      next,
      base + 1,
      base + 1,
      next,
      next + 1,
      base + 2,
      base + 3,
      next + 2,
      base + 3,
      next + 3,
      next + 2,
      base,
      base + 2,
      next,
      base + 2,
      next + 2,
      next,
      base + 1,
      next + 1,
      base + 3,
      base + 3,
      next + 1,
      next + 3,
    );
    roadGroups.push({
      start: groupStart,
      count: indices.length - groupStart,
      materialId: included[localIndex]?.materialId ?? track.materialId,
    });
  }
  if (!track.closed && included.length > 1) {
    if (segmentStart === 0) {
      const groupStart = indices.length;
      indices.push(0, 1, 2, 1, 3, 2);
      roadGroups.push({
        start: groupStart,
        count: indices.length - groupStart,
        materialId: included[0]?.materialId ?? track.materialId,
      });
    }
    if (segmentEnd === sections.length - 1) {
      const end = (included.length - 1) * 4;
      const groupStart = indices.length;
      indices.push(end, end + 2, end + 1, end + 1, end + 2, end + 3);
      roadGroups.push({
        start: groupStart,
        count: indices.length - groupStart,
        materialId: included.at(-1)?.materialId ?? track.materialId,
      });
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const materialIds = [...new Set(roadGroups.map((group) => group.materialId))];
  const materialIndex = new Map(materialIds.map((materialId, index) => [materialId, index]));
  for (const group of roadGroups) {
    geometry.addGroup(group.start, group.count, materialIndex.get(group.materialId) ?? 0);
  }
  geometry.computeVertexNormals();
  if (!ghost) {
    // Each bounded chunk writes the same shared seam vertices to depth before
    // the visible pass, so replacing one chunk cannot expose a crack.
    const depthRoad = new Mesh(
      geometry,
      new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: true,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 2,
      }),
    );
    depthRoad.name = "editor-track-depth";
    depthRoad.renderOrder = 1;
    root.add(depthRoad);
  }
  const roadMaterials = ghost
    ? [trackRoadMaterial("track.preview", true)]
    : materialIds.map((materialId) => trackRoadMaterial(materialId, false));
  const road = new Mesh(geometry, roadMaterials);
  road.name = "editor-track-road";
  road.renderOrder = ghost ? 3 : 2;
  road.receiveShadow = false;
  root.add(road);
  return root;
}

function updateTrackObject(root: Object3D, track: TrackDefinition): TrackObjectUpdateResult {
  const curve = new AuthoredTrackCurve(track);
  const divisions = Math.min(512, Math.max(24, track.nodes.length * 16));
  const sections = sampleTrackCrossSections(track, curve, divisions);
  const existingChunks = new Map<number, Object3D>();
  for (const child of root.children) {
    const index: unknown = (child.userData as Record<string, unknown>)["trackRoadChunkIndex"];
    if (typeof index === "number") {
      existingChunks.set(index, child);
    }
  }
  let rebuiltTrackChunks = 0;
  let reusedTrackChunks = 0;
  const segmentCount = Math.max(0, sections.length - 1);
  let expectedChunkCount = 0;
  for (let start = 0, chunkIndex = 0; start < segmentCount; chunkIndex += 1) {
    const end = Math.min(segmentCount, start + PREVIEW_ROAD_CHUNK_SEGMENTS);
    const signature = trackRoadChunkSignature(sections, start, end);
    const current = existingChunks.get(chunkIndex);
    if (current?.userData["trackRoadChunkSignature"] === signature) {
      reusedTrackChunks += 1;
    } else {
      const replacement = createTrackRoadChunk(track, sections, start, end, chunkIndex, false);
      root.add(replacement);
      if (current !== undefined) {
        disposeObjectTree(current);
        current.removeFromParent();
      }
      rebuiltTrackChunks += 1;
    }
    existingChunks.delete(chunkIndex);
    expectedChunkCount = chunkIndex + 1;
    start = end;
  }
  for (const obsolete of existingChunks.values()) {
    disposeObjectTree(obsolete);
    obsolete.removeFromParent();
  }

  const currentWalls = root.getObjectByName("editor-track-walls");
  const nextWallSignature = trackWallGroupSignature(track, sections);
  let rebuiltWallGroups = 0;
  let reusedWallGroups = 0;
  if (track.walls.length === 0) {
    if (currentWalls !== undefined) {
      disposeObjectTree(currentWalls);
      currentWalls.removeFromParent();
      rebuiltWallGroups = 1;
    }
  } else if (currentWalls?.userData["trackWallGroupSignature"] === nextWallSignature) {
    reusedWallGroups = 1;
  } else {
    const replacement = createTrackWallGroup(track, sections);
    root.add(replacement);
    if (currentWalls !== undefined) {
      disposeObjectTree(currentWalls);
      currentWalls.removeFromParent();
    }
    rebuiltWallGroups = 1;
  }
  root.userData["trackSections"] = sections;
  root.userData["authoredTrackLength"] = Math.max(0.1, trackLength(track));
  root.userData["trackChunkCount"] = expectedChunkCount;
  return Object.freeze({
    rebuiltTrackChunks,
    reusedTrackChunks,
    rebuiltWallGroups,
    reusedWallGroups,
  });
}

function createTrackWallGroup(
  track: TrackDefinition,
  sections: readonly TrackCrossSection[],
): Group {
  const root = new Group();
  root.name = "editor-track-walls";
  root.userData["trackWallGroupSignature"] = trackWallGroupSignature(track, sections);
  const authoredLength = Math.max(0.1, trackLength(track));
  const renderedLength = sections.at(-1)?.distance ?? authoredLength;
  const distanceScale = renderedLength / authoredLength;
  for (const wall of track.walls) {
    const startsAtTrackStart = wall.startDistance <= 0.25;
    const endsAtTrackEnd = wall.endDistance >= authoredLength - 0.5;
    const closesWallLoop = track.closed && startsAtTrackStart && endsAtTrackEnd;
    const wallMesh = createWallRibbon(
      sections,
      wall.side,
      closesWallLoop || startsAtTrackStart ? 0 : wall.startDistance * distanceScale,
      closesWallLoop || endsAtTrackEnd ? renderedLength : wall.endDistance * distanceScale,
      wall.height,
      wall.thickness,
      wall.styleId,
      closesWallLoop,
    );
    if (wallMesh !== null) {
      root.add(wallMesh);
    }
    if (closesWallLoop) {
      const seam = createWallSeam(sections, wall.side, wall.height, wall.thickness, wall.styleId);
      if (seam !== null) {
        root.add(seam);
      }
    }
  }
  return root;
}

function countTrackRoadChunks(root: Object3D): number {
  return root.children.filter((child) => typeof child.userData["trackRoadChunkIndex"] === "number")
    .length;
}

function trackRoadChunkSignature(
  sections: readonly TrackCrossSection[],
  segmentStart: number,
  segmentEnd: number,
): string {
  return sections
    .slice(segmentStart, segmentEnd + 1)
    .map((section) =>
      [...section.left.toArray(), ...section.right.toArray(), section.distance, section.materialId]
        .map((value) => (typeof value === "number" ? value.toFixed(4) : value))
        .join(","),
    )
    .join(";");
}

function trackWallGroupSignature(
  track: TrackDefinition,
  sections: readonly TrackCrossSection[],
): string {
  const geometry = sections
    .map((section) =>
      [...section.left.toArray(), ...section.right.toArray(), section.distance]
        .map((value) => value.toFixed(4))
        .join(","),
    )
    .join(";");
  return `${JSON.stringify(track.walls)}|${track.closed ? "closed" : "open"}|${geometry}`;
}

function nearestTrackSection(
  sections: readonly TrackCrossSection[],
  distance: number,
): TrackCrossSection | undefined {
  let nearest: TrackCrossSection | undefined;
  let nearestDelta = Number.POSITIVE_INFINITY;
  for (const section of sections) {
    const delta = Math.abs(section.distance - distance);
    if (delta < nearestDelta) {
      nearest = section;
      nearestDelta = delta;
    }
  }
  return nearest;
}

function distanceSquared(left: Vector3Tuple, right: Vector3Tuple): number {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  const z = left[2] - right[2];
  return x * x + y * y + z * z;
}

function vectorDistance(left: Vector3Tuple, right: Vector3Tuple): number {
  return Math.sqrt(distanceSquared(left, right));
}

function sampleTrackCrossSections(
  track: TrackDefinition,
  curve: Curve<Vector3>,
  divisions: number,
): readonly TrackCrossSection[] {
  const sections: TrackCrossSection[] = [];
  const lengths = curve.getLengths(divisions);
  const renderedLength = Math.max(0.1, lengths.at(-1) ?? trackLength(track));
  const authoredLength = Math.max(0.1, trackLength(track));
  const rotation = new Quaternion();
  for (let index = 0; index <= divisions; index += 1) {
    const t = index / divisions;
    const baseCenter = curve.getPoint(t).addScaledVector(WORLD_UP, 0.14);
    const tangent = curve.getTangent(t).normalize();
    const nodePosition = t * (track.closed ? track.nodes.length : track.nodes.length - 1);
    const rawFirstIndex = Math.floor(nodePosition);
    const firstIndex = track.closed
      ? rawFirstIndex % track.nodes.length
      : Math.min(track.nodes.length - 1, rawFirstIndex);
    const secondIndex = track.closed
      ? (firstIndex + 1) % track.nodes.length
      : Math.min(track.nodes.length - 1, firstIndex + 1);
    const firstNode = track.nodes[firstIndex] ?? track.nodes[0];
    const secondNode = track.nodes[secondIndex] ?? firstNode;
    if (firstNode === undefined || secondNode === undefined) {
      continue;
    }
    const alpha = nodePosition - Math.floor(nodePosition);
    const baseWidth = firstNode.width + (secondNode.width - firstNode.width) * alpha;
    const baseBank =
      firstNode.bankRadians + (secondNode.bankRadians - firstNode.bankRadians) * alpha;
    const renderedDistance = lengths[index] ?? 0;
    const authoredDistance = (renderedDistance / renderedLength) * authoredLength;
    const roadRange = (track.roadRanges ?? []).find(
      (range) => range.startDistance <= authoredDistance && range.endDistance >= authoredDistance,
    );
    const influence = roadRangeInfluence(roadRange, authoredDistance);
    const width =
      roadRange === undefined ? baseWidth : baseWidth + (roadRange.width - baseWidth) * influence;
    const bank =
      roadRange === undefined
        ? baseBank
        : baseBank + (roadRange.bankRadians - baseBank) * influence;
    const lateral = new Vector3().crossVectors(WORLD_UP, tangent);
    if (lateral.lengthSq() < 1e-6) {
      lateral.set(1, 0, 0);
    } else {
      lateral.normalize();
    }
    rotation.setFromAxisAngle(tangent, bank);
    lateral.applyQuaternion(rotation).normalize();
    const edges = raisedBankedEdges(baseCenter, lateral, width);
    sections.push(
      Object.freeze({
        center: edges.center,
        tangent,
        lateral,
        left: edges.left,
        right: edges.right,
        distance: renderedDistance,
        materialId: roadRange?.materialId ?? track.materialId,
      }),
    );
  }
  if (track.closed && sections.length > 3) {
    const first = sections[0];
    const next = sections[1];
    const previous = sections.at(-2);
    const duplicate = sections.at(-1);
    if (
      first !== undefined &&
      next !== undefined &&
      previous !== undefined &&
      duplicate !== undefined
    ) {
      const seamTangent = next.center.clone().sub(previous.center).normalize();
      const seamLateral = new Vector3().crossVectors(WORLD_UP, seamTangent);
      if (seamLateral.lengthSq() < 1e-6) {
        seamLateral.set(1, 0, 0);
      } else {
        seamLateral.normalize();
      }
      const seamBank = track.nodes[0]?.bankRadians ?? 0;
      rotation.setFromAxisAngle(seamTangent, seamBank);
      seamLateral.applyQuaternion(rotation).normalize();
      const halfWidth = first.left.distanceTo(first.right) / 2;
      const seamBaseCenter = curve.getPoint(0).addScaledVector(WORLD_UP, 0.14);
      const seamEdges = raisedBankedEdges(seamBaseCenter, seamLateral, halfWidth * 2);
      const seamSection = (distance: number): TrackCrossSection => {
        return Object.freeze({
          center: seamEdges.center.clone(),
          tangent: seamTangent.clone(),
          lateral: seamLateral.clone(),
          left: seamEdges.left.clone(),
          right: seamEdges.right.clone(),
          distance,
          materialId: first.materialId,
        });
      };
      sections[0] = seamSection(0);
      sections[sections.length - 1] = seamSection(duplicate.distance);
    }
  }
  return Object.freeze(sections);
}

function roadRangeInfluence(range: TrackRoadRange | undefined, distance: number): number {
  if (range === undefined) {
    return 0;
  }
  const rangeLength = range.endDistance - range.startDistance;
  const easingDistance = Math.min(2, Math.max(0.25, rangeLength / 3));
  const intoRange = clamp((distance - range.startDistance) / easingDistance, 0, 1);
  const outOfRange = clamp((range.endDistance - distance) / easingDistance, 0, 1);
  const edge = Math.min(intoRange, outOfRange);
  return edge * edge * (3 - 2 * edge);
}

function createWallRibbon(
  sections: readonly TrackCrossSection[],
  side: "left" | "right",
  startDistance: number,
  endDistance: number,
  height: number,
  thickness: number,
  styleId: string,
  closed: boolean,
): Mesh | null {
  let included = sections.filter(
    (section) => section.distance >= startDistance && section.distance <= endDistance,
  );
  // Closed Catmull-Rom sampling always includes t=0 and t=1. Their centers
  // coincide, but independently estimated tangents can point differently at
  // a hand-drawn join. Drop the duplicate unconditionally and wrap the final
  // real cross-section back to the first one.
  if (closed && included.length > 2) {
    included = included.slice(0, -1);
  }
  if (included.length < 2) {
    return null;
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const wallEdges = safeWallEdges(included, side, closed);
  const wallVisible = visibleWallEdges(included, wallEdges, side, closed);
  for (const [index, section] of included.entries()) {
    const innerBottom = wallEdges[index]!.clone();
    const outwardSign = side === "left" ? -1 : 1;
    const outward = section.lateral.clone().setY(0);
    if (outward.lengthSq() < 1e-6) {
      outward.set(1, 0, 0);
    } else {
      outward.normalize();
    }
    const outerBottom = innerBottom
      .clone()
      .addScaledVector(outward, outwardSign * Math.max(0.04, thickness));
    const innerTop = innerBottom.clone().addScaledVector(WORLD_UP, height);
    const outerTop = outerBottom.clone().addScaledVector(WORLD_UP, height);
    positions.push(
      innerBottom.x,
      innerBottom.y,
      innerBottom.z,
      innerTop.x,
      innerTop.y,
      innerTop.z,
      outerBottom.x,
      outerBottom.y,
      outerBottom.z,
      outerTop.x,
      outerTop.y,
      outerTop.z,
    );
  }
  const segmentCount = closed ? included.length : included.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const base = index * 4;
    const nextIndex = (index + 1) % included.length;
    const next = nextIndex * 4;
    // An overlapping road strip acts like a junction: do not leave a wall
    // buried across the driveable surface.
    if (wallVisible[index] !== true || wallVisible[nextIndex] !== true) {
      continue;
    }
    indices.push(
      base,
      next,
      base + 1,
      base + 1,
      next,
      next + 1,
      base + 2,
      base + 3,
      next + 2,
      base + 3,
      next + 3,
      next + 2,
      base + 1,
      next + 1,
      base + 3,
      base + 3,
      next + 1,
      next + 3,
      base,
      base + 2,
      next,
      base + 2,
      next + 2,
      next,
    );
  }
  if (!closed) {
    const end = (included.length - 1) * 4;
    if (wallVisible[0] === true) {
      indices.push(0, 1, 2, 1, 3, 2);
    }
    if (wallVisible.at(-1) === true) {
      indices.push(end, end + 2, end + 1, end + 1, end + 2, end + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, trackWallMaterial(styleId));
  mesh.name = `editor-track-wall-${side}`;
  return mesh;
}

/**
 * An inside offset becomes a loop when its requested distance is greater than
 * the bend radius. Keep the wall on the same side of the centerline while
 * reducing only that unsafe local offset; broad corners remain untouched.
 */
function safeWallEdges(
  sections: readonly TrackCrossSection[],
  side: "left" | "right",
  closed: boolean,
): readonly Vector3[] {
  const offsets = sections.map((section, index) => safeWallOffset(sections, index, side, closed));
  // A strict radius clamp can otherwise start and stop within one sample.
  // Spread the reduction into a short taper, never pushing an unsafe sample
  // outward again.
  for (let pass = 0; pass < 6; pass += 1) {
    const previousOffsets = [...offsets];
    for (let index = 0; index < offsets.length; index += 1) {
      if (!closed && (index === 0 || index === offsets.length - 1)) {
        continue;
      }
      const previous = previousOffsets[(index - 1 + offsets.length) % offsets.length];
      const current = previousOffsets[index];
      const next = previousOffsets[(index + 1) % offsets.length];
      if (previous !== undefined && current !== undefined && next !== undefined) {
        offsets[index] = Math.min(offsets[index]!, (previous + current * 2 + next) / 4);
      }
    }
  }
  const sign = side === "left" ? -1 : 1;
  return sections.map((section, index) =>
    section.center.clone().addScaledVector(section.lateral, sign * offsets[index]!),
  );
}

function safeWallOffset(
  sections: readonly TrackCrossSection[],
  index: number,
  side: "left" | "right",
  closed: boolean,
): number {
  const current = sections[index]!;
  const requestedOffset = current.left.distanceTo(current.right) / 2;
  if ((!closed && (index === 0 || index === sections.length - 1)) || sections.length < 3) {
    return requestedOffset;
  }

  const previous = sections[(index - 1 + sections.length) % sections.length];
  const next = sections[(index + 1) % sections.length];
  if (previous === undefined || next === undefined) {
    return requestedOffset;
  }
  const incoming = current.center.clone().sub(previous.center);
  const outgoing = next.center.clone().sub(current.center);
  const incomingLength = incoming.length();
  const outgoingLength = outgoing.length();
  if (incomingLength < 1e-4 || outgoingLength < 1e-4) {
    return requestedOffset;
  }
  incoming.divideScalar(incomingLength);
  outgoing.divideScalar(outgoingLength);
  const bendAngle = Math.acos(Math.max(-1, Math.min(1, incoming.dot(outgoing))));
  if (bendAngle < 1e-3) {
    return requestedOffset;
  }

  const turn = incoming.z * outgoing.x - incoming.x * outgoing.z;
  const innerSide = turn > 0 ? "right" : "left";
  if (side !== innerSide) {
    return requestedOffset;
  }
  const bendRadius = ((incomingLength + outgoingLength) * 0.5) / bendAngle;
  return Math.min(requestedOffset, Math.max(0.08, bendRadius * 0.72));
}

function visibleWallEdges(
  sections: readonly TrackCrossSection[],
  edges: readonly Vector3[],
  side: "left" | "right",
  closed: boolean,
): readonly boolean[] {
  if (sections.length < 4) {
    return sections.map(() => true);
  }
  const finalDistance = sections.at(-1)?.distance ?? 0;
  const sampleStep = Math.max(0.1, finalDistance / Math.max(1, sections.length - 1));
  const totalDistance = finalDistance + (closed ? sampleStep : 0);
  let visible = sections.map((section, index) => {
    const edge = edges[index];
    if (edge === undefined) {
      return false;
    }
    const ownWidth = section.left.distanceTo(section.right);
    if (safeWallOffset(sections, index, side, closed) < ownWidth * 0.27) {
      return false;
    }
    return !sections.some((other, otherIndex) => {
      if (otherIndex === index) {
        return false;
      }
      const directDistance = Math.abs(other.distance - section.distance);
      const routeDistance = closed
        ? Math.min(directDistance, Math.max(0, totalDistance - directDistance))
        : directDistance;
      const otherWidth = other.left.distanceTo(other.right);
      // Nearby samples belong to the same bend and must not hide one another.
      if (routeDistance < Math.max(ownWidth, otherWidth) * 1.35) {
        return false;
      }
      if (Math.abs(edge.y - other.center.y) > Math.max(0.8, otherWidth * 0.15)) {
        return false;
      }
      const x = edge.x - other.center.x;
      const z = edge.z - other.center.z;
      const coveredRadius = otherWidth * 0.46;
      return x * x + z * z < coveredRadius * coveredRadius;
    });
  });

  // Give the automatic opening a small amount of breathing room and discard
  // single-sample wall shards at the edge of an overlap.
  for (let pass = 0; pass < 3; pass += 1) {
    const previous = [...visible];
    visible = visible.map((value, index) => {
      if (!value) {
        return false;
      }
      const before = previous[(index - 1 + previous.length) % previous.length];
      const after = previous[(index + 1) % previous.length];
      if (!closed && (index === 0 || index === previous.length - 1)) {
        return value;
      }
      return before === true && after === true;
    });
  }
  const firstHidden = visible.findIndex((value) => !value);
  if (firstHidden >= 0) {
    const traversalStart = closed ? (firstHidden + 1) % visible.length : 0;
    let run: number[] = [];
    for (let step = 0; step <= visible.length; step += 1) {
      const index = (traversalStart + step) % visible.length;
      if (step < visible.length && visible[index] === true) {
        run.push(index);
        continue;
      }
      if (run.length > 0 && run.length < 8) {
        for (const runIndex of run) {
          visible[runIndex] = false;
        }
      }
      run = [];
    }
  }
  return visible;
}

function createWallSeam(
  sections: readonly TrackCrossSection[],
  side: "left" | "right",
  height: number,
  thickness: number,
  styleId: string,
): Mesh | null {
  const first = sections[0];
  const last = sections.at(-2);
  if (first === undefined || last === undefined) {
    return null;
  }
  const uniqueSections = sections.slice(0, -1);
  const safeEdges = safeWallEdges(uniqueSections, side, true);
  const visibleEdges = visibleWallEdges(uniqueSections, safeEdges, side, true);
  if (visibleEdges[0] !== true || visibleEdges.at(-1) !== true) {
    return null;
  }
  const start = safeEdges[0]?.clone();
  const end = safeEdges.at(-1)?.clone();
  if (start === undefined || end === undefined) {
    return null;
  }
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 1e-4) {
    return null;
  }
  direction.normalize();
  const overlap = Math.max(0.18, thickness);
  start.addScaledVector(direction, -overlap);
  end.addScaledVector(direction, overlap);
  const lateral = first.lateral.clone().add(last.lateral).setY(0);
  if (lateral.lengthSq() < 1e-6) {
    lateral.copy(first.lateral).setY(0);
  }
  lateral.normalize().multiplyScalar((side === "left" ? -1 : 1) * Math.max(0.04, thickness));
  const startOuter = start.clone().add(lateral);
  const endOuter = end.clone().add(lateral);
  const startTop = start.clone().addScaledVector(WORLD_UP, height);
  const endTop = end.clone().addScaledVector(WORLD_UP, height);
  const startOuterTop = startOuter.clone().addScaledVector(WORLD_UP, height);
  const endOuterTop = endOuter.clone().addScaledVector(WORLD_UP, height);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        ...start.toArray(),
        ...startTop.toArray(),
        ...startOuter.toArray(),
        ...startOuterTop.toArray(),
        ...end.toArray(),
        ...endTop.toArray(),
        ...endOuter.toArray(),
        ...endOuterTop.toArray(),
      ],
      3,
    ),
  );
  geometry.setIndex([0, 4, 1, 1, 4, 5, 2, 3, 6, 3, 7, 6, 1, 5, 3, 3, 5, 7, 0, 2, 4, 2, 6, 4]);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, trackWallMaterial(styleId));
  mesh.name = `editor-track-wall-${side}-seam`;
  return mesh;
}

function trackWallMaterial(styleId: string): MeshStandardMaterial {
  switch (styleId) {
    case "wall.sunset":
      return new MeshStandardMaterial({
        color: 0xff7a3d,
        emissive: 0x4c1300,
        emissiveIntensity: 0.45,
        side: DoubleSide,
      });
    case "wall.neon":
      return new MeshStandardMaterial({
        color: 0x55ff75,
        emissive: 0x0c6a1e,
        emissiveIntensity: 0.75,
        side: DoubleSide,
      });
    case "wall.guardrail":
      return new MeshStandardMaterial({
        color: 0xdce6ed,
        emissive: 0x101820,
        metalness: 0.7,
        roughness: 0.3,
        side: DoubleSide,
      });
    case "wall.safety-cyan":
      return new MeshStandardMaterial({
        color: 0x20d9ed,
        emissive: 0x07515a,
        emissiveIntensity: 0.55,
        side: DoubleSide,
      });
    default:
      return new MeshStandardMaterial({
        color: 0x5ae7f3,
        emissive: 0x06343b,
        side: DoubleSide,
      });
  }
}

function trackRoadMaterial(materialId: string, ghost: boolean): MeshBasicMaterial {
  if (ghost) {
    return new MeshBasicMaterial({
      color: 0x00d5e7,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      side: DoubleSide,
    });
  }
  const appearance = trackMaterialAppearance(materialId);
  return new MeshBasicMaterial({
    color: appearance.color,
    map: createTrackPatternTexture(materialId),
    transparent: appearance.transparent,
    opacity: appearance.opacity,
    // A wide ribbon can overlap itself in a tight kid-drawn bend. Keeping the
    // road out of the depth buffer prevents coplanar fan artifacts.
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function geometryFromArrays(vertices: Float32Array, indices: readonly number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex([...indices]);
  geometry.computeVertexNormals();
  return geometry;
}

function applyEntityTransform(object: Object3D, entity: MapEntity): void {
  object.position.fromArray(entity.transform.position);
  object.quaternion.fromArray(entity.transform.rotation);
  object.scale.fromArray(entity.transform.scale);
}

function disposeObjectTree(root: Object3D): void {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof MeshBasicMaterial || material instanceof MeshStandardMaterial) {
          material.map?.dispose();
        }
        material.dispose();
      }
    } else if (object instanceof Line) {
      const line = object as Line<BufferGeometry, Material | Material[]>;
      line.geometry.dispose();
      const materials = Array.isArray(line.material) ? line.material : [line.material];
      for (const material of materials) {
        material.dispose();
      }
    } else if (object instanceof GridHelper) {
      object.geometry.dispose();
      const materials = (
        Array.isArray(object.material) ? object.material : [object.material]
      ) as Material[];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
