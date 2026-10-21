import {
  TRACK_SURFACE_COOLDOWN_MAXIMUM_SECONDS,
  TRACK_SURFACE_COOLDOWN_MINIMUM_SECONDS,
  TRACK_SURFACE_STRENGTH_MAXIMUM,
  TRACK_SURFACE_STRENGTH_MINIMUM,
  createMapId,
  defaultTrackSurfaceCooldownSeconds,
  type MapDocument,
  type MapEntity,
  type MapType,
  type JsonValue,
  type InteractionAction,
  type InteractionCondition,
  type InteractionEvent,
  type QuaternionTuple,
  type TrackDefinition,
  type TrackNode,
  type TrackRoadRange,
  type TrackSurface,
  type TrackWallRange,
  type Vector3Tuple,
  withMapTitle,
} from "../maps/MapDocument";
import type { TrackMaterialId } from "../tracks/TrackAppearance";
import {
  createEditorAssetProperties,
  editorAssetDimensions,
  editorAssetEntityDimensions,
  editorAssetManifest,
  editorAssetPrimarySize,
  normalizedSimpleFloorOutline,
  resizedEditorAssetProperties,
  type EditorAssetId,
  type FloorOutlinePoint,
} from "./EditorAssetCatalog";
export type { TrackMaterialId } from "../tracks/TrackAppearance";
export type { EditorAssetId } from "./EditorAssetCatalog";
export type TrackWallBrushSide = "left" | "right" | "both";
export type TrackWallBrushAction = "paint" | "erase";
export type TrackWallStyleId =
  "wall.clean" | "wall.safety-cyan" | "wall.sunset" | "wall.neon" | "wall.guardrail";

export interface TrackWallPropertiesEdit {
  readonly height: number;
  readonly thickness: number;
  readonly styleId: TrackWallStyleId;
}

export interface TrackRoadPropertiesEdit {
  readonly width: number;
  readonly bankRadians: number;
  readonly surface: TrackSurface;
  readonly materialId: TrackMaterialId;
  readonly surfaceStrength?: number;
  readonly surfaceCooldownSeconds?: number;
}

export interface PlacementOptions {
  readonly elevation: number;
  readonly primarySize: number;
  readonly secondarySize?: number;
  readonly yawRadians: number;
}

export interface FloorDragPlacement {
  readonly position: Vector3Tuple;
  readonly width: number;
  readonly depth: number;
}

export interface FreeformFloorPlacement {
  readonly position: Vector3Tuple;
  readonly outline: readonly FloorOutlinePoint[];
}

export interface EntityTransformEdit {
  readonly position?: Vector3Tuple;
  readonly yawRadians?: number;
  readonly primarySize?: number;
}

export interface DynamicPhysicsEdit {
  readonly mass: number;
  readonly friction: number;
  readonly restitution: number;
}

export interface MotionPropertiesEdit {
  readonly speed: number;
  readonly dwellSeconds: number;
  readonly offset: Vector3Tuple;
}

export interface BoostPadPropertiesEdit {
  readonly boostSpeed: number;
  readonly liftSpeed: number;
  readonly cooldownSeconds: number;
}

export interface SurfacePadPropertiesEdit {
  readonly strength: number;
  readonly cooldownSeconds: number;
}

export interface GuidancePropertiesEdit {
  readonly color: string;
  readonly glow: number;
  readonly solid: boolean;
}

export interface DecorationPropertiesEdit {
  readonly color: string;
  readonly glow: number;
  readonly intensity: number;
  readonly range: number;
  readonly enabled: boolean;
}

export interface RaceSetupEdit {
  readonly mode: MapType;
  readonly lapCount: number;
  readonly finishRule: "any" | "required-group";
  readonly recoveryDelaySeconds?: number;
  readonly recoveryPenaltySeconds?: number;
}

export interface EnvironmentEdit {
  readonly groundMode: "ground" | "void";
  readonly skyPreset: MapDocument["environment"]["skyPreset"];
  readonly backgroundColor: string;
  readonly keyLightDirection: Vector3Tuple;
  readonly keyLightIntensity: number;
  readonly keyLightColor: string;
  readonly ambientLightIntensity: number;
  readonly ambientLightColor: string;
  readonly gravityStrength: number;
  readonly fogEnabled: boolean;
  readonly fogColor: string;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly musicAssetId: MapDocument["environment"]["musicAssetId"];
  readonly musicVolume: number;
  readonly outOfBoundsHeight: number;
}

export interface InteractionLinkEdit {
  readonly sourceEntityId: string;
  readonly event: InteractionEvent;
  readonly condition: InteractionCondition | null;
  readonly targetEntityId: string;
  readonly action: InteractionAction;
}

export interface TrackPlacementOptions {
  readonly width: number;
  readonly elevation: number;
  readonly bankRadians: number;
}

export interface TrackNodeEdit {
  readonly position: Vector3Tuple;
  readonly width: number;
  readonly bankRadians: number;
}

export type TrackEndpointSide = "start" | "end";
export type TrackTangentSide = "in" | "out";

export interface TrackSplitResult {
  readonly primaryTrackId: string;
  readonly secondaryTrackId: string | null;
  readonly selectedNodeId: string;
  readonly openedLoop: boolean;
}

export function floorDragPlacement(
  start: Vector3Tuple,
  end: Vector3Tuple,
  yawRadians: number,
  gridSize = 0,
): FloorDragPlacement {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  const deltaX = end[0] - start[0];
  const deltaZ = end[2] - start[2];
  let localX = deltaX * cosine - deltaZ * sine;
  let localZ = deltaX * sine + deltaZ * cosine;
  if (gridSize > 0) {
    localX = Math.round(localX / gridSize) * gridSize;
    localZ = Math.round(localZ / gridSize) * gridSize;
  }
  const centerLocalX = localX / 2;
  const centerLocalZ = localZ / 2;
  return Object.freeze({
    position: Object.freeze([
      start[0] + centerLocalX * cosine + centerLocalZ * sine,
      start[1],
      start[2] - centerLocalX * sine + centerLocalZ * cosine,
    ] satisfies Vector3Tuple),
    width: clamp(Math.abs(localX), 1, 100),
    depth: clamp(Math.abs(localZ), 1, 100),
  });
}

export function freeformFloorPlacement(
  worldPoints: readonly Vector3Tuple[],
): FreeformFloorPlacement | null {
  if (worldPoints.length < 3) {
    return null;
  }
  let simplified = simplifyTrackStroke(worldPoints, 0.3);
  if (simplified.length > 3 && distanceBetweenPoints(simplified[0]!, simplified.at(-1)!) < 0.4) {
    simplified = simplified.slice(0, -1);
  }
  if (simplified.length > 32) {
    const stride = Math.ceil(simplified.length / 32);
    simplified = simplified.filter((_, index) => index % stride === 0);
  }
  if (simplified.length < 3) {
    return null;
  }
  const minimumX = Math.min(...simplified.map((point) => point[0]));
  const maximumX = Math.max(...simplified.map((point) => point[0]));
  const minimumZ = Math.min(...simplified.map((point) => point[2]));
  const maximumZ = Math.max(...simplified.map((point) => point[2]));
  const centerX = (minimumX + maximumX) / 2;
  const centerZ = (minimumZ + maximumZ) / 2;
  const outline = normalizedSimpleFloorOutline(
    simplified.map((point) => [point[0] - centerX, point[2] - centerZ] as const),
  );
  if (outline === null) {
    return null;
  }
  return Object.freeze({
    position: Object.freeze([centerX, worldPoints[0]![1], centerZ] satisfies Vector3Tuple),
    outline,
  });
}

interface HistoryEntry {
  readonly label: string;
  readonly before: MapDocument;
  readonly after: MapDocument;
  readonly selectionBefore: readonly string[];
  readonly selectionAfter: readonly string[];
}

interface OpenTransaction {
  readonly label: string;
  readonly before: MapDocument;
  readonly selectionBefore: readonly string[];
}

export interface EditorSessionSnapshot {
  readonly document: MapDocument;
  readonly selectedEntityId: string | null;
  readonly selectedEntityIds: readonly string[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

export class EditorSession {
  private documentValue: MapDocument;
  private selectedIdsValue: readonly string[] = Object.freeze([]);
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private openTransaction: OpenTransaction | undefined;

  public constructor(
    document: MapDocument,
    private readonly createId: () => string = createMapId,
  ) {
    this.documentValue = document;
  }

  public get document(): MapDocument {
    return this.documentValue;
  }

  public get selectedEntityId(): string | null {
    return this.selectedIdsValue.at(-1) ?? null;
  }

  public get selectedEntityIds(): readonly string[] {
    return this.selectedIdsValue;
  }

  public get selectedEntity(): MapEntity | null {
    const selectedId = this.selectedEntityId;
    if (selectedId === null) {
      return null;
    }
    return this.documentValue.entities.find((entity) => entity.id === selectedId) ?? null;
  }

  public get selectedEntities(): readonly MapEntity[] {
    const selected = new Set(this.selectedIdsValue);
    return this.documentValue.entities.filter((entity) => selected.has(entity.id));
  }

  public snapshot(): EditorSessionSnapshot {
    return Object.freeze({
      document: this.documentValue,
      selectedEntityId: this.selectedEntityId,
      selectedEntityIds: this.selectedIdsValue,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.at(-1)?.label ?? null,
      redoLabel: this.redoStack.at(-1)?.label ?? null,
    });
  }

  public select(entityId: string | null, additive = false): boolean {
    if (
      entityId !== null &&
      !this.documentValue.entities.some((entity) => entity.id === entityId)
    ) {
      return false;
    }
    if (entityId === null) {
      this.selectedIdsValue = Object.freeze([]);
    } else {
      const unitIds = this.selectionUnitIds(entityId);
      if (additive) {
        const selected = new Set(this.selectedIdsValue);
        const remove = unitIds.every((id) => selected.has(id));
        for (const id of unitIds) {
          if (remove) {
            selected.delete(id);
          } else {
            selected.add(id);
          }
        }
        this.selectedIdsValue = Object.freeze(
          this.documentValue.entities
            .filter((entity) => selected.has(entity.id))
            .map((entity) => entity.id),
        );
      } else {
        this.selectedIdsValue = Object.freeze(unitIds);
      }
    }
    return true;
  }

  public selectMany(entityIds: readonly string[], additive = false): boolean {
    const validIds = entityIds
      .filter((id) => this.documentValue.entities.some((entity) => entity.id === id))
      .flatMap((id) => this.selectionUnitIds(id));
    const next = additive
      ? [...new Set([...this.selectedIdsValue, ...validIds])]
      : [...new Set(validIds)];
    this.selectedIdsValue = Object.freeze(next);
    return next.length > 0;
  }

  public groupSelected(): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntities;
    if (selected.length < 2) {
      return false;
    }
    const existingGroupId = selected[0]?.groupId ?? null;
    if (
      existingGroupId !== null &&
      selected.every((entity) => entity.groupId === existingGroupId)
    ) {
      return false;
    }
    const groupId = this.createId();
    const selectedIds = new Set(selected.map((entity) => entity.id));
    this.execute(
      "Group objects",
      (document) =>
        updateEntities(document, selectedIds, (entity) => Object.freeze({ ...entity, groupId })),
      selected.map((entity) => entity.id),
    );
    return true;
  }

  public ungroupSelected(): boolean {
    this.commitContinuousEdit();
    const groupIds = new Set(
      this.selectedEntities
        .map((entity) => entity.groupId)
        .filter((groupId): groupId is string => groupId !== null),
    );
    if (groupIds.size === 0) {
      return false;
    }
    const affectedIds = this.documentValue.entities
      .filter((entity) => entity.groupId !== null && groupIds.has(entity.groupId))
      .map((entity) => entity.id);
    const affectedIdSet = new Set(affectedIds);
    this.execute(
      groupIds.size === 1 ? "Ungroup objects" : "Ungroup object groups",
      (document) =>
        updateEntities(document, affectedIdSet, (entity) =>
          Object.freeze({ ...entity, groupId: null }),
        ),
      affectedIds,
    );
    return true;
  }

  public createSelectedPrefabDocument(title: string): MapDocument | null {
    this.commitContinuousEdit();
    const selected = this.selectedEntities;
    if (selected.length === 0) {
      return null;
    }
    const selectedIdMap = new Map(selected.map((entity) => [entity.id, entity.id]));
    const centerX =
      selected.reduce((sum, entity) => sum + entity.transform.position[0], 0) / selected.length;
    const centerZ =
      selected.reduce((sum, entity) => sum + entity.transform.position[2], 0) / selected.length;
    const baseY = Math.min(
      ...selected.map((entity) => {
        const dimensions = editorAssetEntityDimensions(entity);
        return entity.transform.position[1] - (dimensions?.groundOffset ?? 0);
      }),
    );
    const prefabGroupId = this.createId();
    const entities = Object.freeze(
      selected.map((entity) =>
        Object.freeze({
          ...entity,
          transform: Object.freeze({
            ...entity.transform,
            position: Object.freeze([
              entity.transform.position[0] - centerX,
              entity.transform.position[1] - baseY,
              entity.transform.position[2] - centerZ,
            ] satisfies Vector3Tuple),
          }),
          groupId: prefabGroupId,
          properties: copiedEntityProperties(entity, selectedIdMap),
        }),
      ),
    );
    const activeStartGridId =
      entities.find((entity) => entity.assetId === "race.start-grid")?.id ?? null;
    return Object.freeze({
      header: Object.freeze({
        schemaVersion: 1,
        documentId: this.createId(),
        title: title.trim().slice(0, 80) || "My Prefab",
        description: "A reusable local Mini Wheels prefab.",
        mapType: "free-roam",
        sourceTemplateId: "local.prefab",
      }),
      metadata: Object.freeze({ tags: Object.freeze(["prefab"]) }),
      environment: this.documentValue.environment,
      entities,
      tracks: Object.freeze([]),
      race: Object.freeze({
        mode: "free-roam",
        activeStartGridId,
        lapCount: 1,
        checkpointGroups: Object.freeze([]),
        routeEdges: Object.freeze([]),
        finishEntityIds: Object.freeze(
          entities
            .filter((entity) => entity.assetId === "race.finish-gate")
            .map((entity) => entity.id),
        ),
        finishRule: "any",
        recovery: Object.freeze({ delaySeconds: 0.75, penaltySeconds: 0 }),
      }),
      interactions: Object.freeze([]),
      editorHints: Object.freeze({ thumbnailCamera: null }),
    });
  }

  public placePrefab(prefab: MapDocument, worldPosition: Vector3Tuple, yawRadians = 0): boolean {
    this.commitContinuousEdit();
    if (prefab.entities.length === 0 || prefab.tracks.length > 0) {
      return false;
    }
    const copiedIdBySourceId = new Map(
      prefab.entities.map((entity) => [entity.id, this.createId()]),
    );
    const copiedGroupIdBySourceId = copiedGroupIds(prefab.entities, this.createId);
    const cosine = Math.cos(yawRadians);
    const sine = Math.sin(yawRadians);
    const copies = prefab.entities.map<MapEntity>((entity) => {
      const [offsetX, offsetY, offsetZ] = entity.transform.position;
      return Object.freeze({
        ...entity,
        id: copiedIdBySourceId.get(entity.id)!,
        groupId:
          entity.groupId === null ? null : (copiedGroupIdBySourceId.get(entity.groupId) ?? null),
        transform: Object.freeze({
          ...entity.transform,
          position: Object.freeze([
            worldPosition[0] + offsetX * cosine + offsetZ * sine,
            worldPosition[1] + offsetY,
            worldPosition[2] - offsetX * sine + offsetZ * cosine,
          ] satisfies Vector3Tuple),
          rotation: quaternionFromYaw(readYaw(entity.transform.rotation) + yawRadians),
        }),
        properties: copiedEntityProperties(entity, copiedIdBySourceId),
      });
    });
    this.execute(
      `Place ${prefab.header.title}`,
      (document) => copies.reduce(addEntity, document),
      copies.map((entity) => entity.id),
    );
    return true;
  }

  public setTitle(title: string): void {
    this.documentValue = withMapTitle(this.documentValue, title);
  }

  public setTags(tags: readonly string[]): void {
    const normalized = [
      ...new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean)),
    ]
      .slice(0, 20)
      .map((tag) => tag.slice(0, 32));
    this.documentValue = Object.freeze({
      ...this.documentValue,
      metadata: Object.freeze({ tags: Object.freeze(normalized) }),
    });
  }

  public editRaceSetup(edit: RaceSetupEdit): boolean {
    this.commitContinuousEdit();
    const lapCount = Math.min(99, Math.max(1, Math.trunc(edit.lapCount)));
    const recoveryDelaySeconds = clamp(
      edit.recoveryDelaySeconds ?? this.documentValue.race.recovery.delaySeconds,
      0,
      30,
    );
    const recoveryPenaltySeconds = clamp(
      edit.recoveryPenaltySeconds ?? this.documentValue.race.recovery.penaltySeconds,
      0,
      300,
    );
    if (
      this.documentValue.race.mode === edit.mode &&
      this.documentValue.race.lapCount === lapCount &&
      this.documentValue.race.finishRule === edit.finishRule &&
      this.documentValue.race.recovery.delaySeconds === recoveryDelaySeconds &&
      this.documentValue.race.recovery.penaltySeconds === recoveryPenaltySeconds
    ) {
      return false;
    }
    this.execute(
      "Edit race setup",
      (document) =>
        Object.freeze({
          ...document,
          header: Object.freeze({ ...document.header, mapType: edit.mode }),
          race: Object.freeze({
            ...document.race,
            mode: edit.mode,
            lapCount,
            finishRule: edit.finishRule,
            recovery: Object.freeze({
              delaySeconds: recoveryDelaySeconds,
              penaltySeconds: recoveryPenaltySeconds,
            }),
          }),
        }),
      this.selectedIdsValue,
    );
    return true;
  }

  public editEnvironment(edit: EnvironmentEdit): boolean {
    this.commitContinuousEdit();
    const fogNear = clamp(edit.fogNear, 0, 100_000);
    const fogFar = clamp(edit.fogFar, fogNear + 1, 100_000);
    const directionLength = Math.hypot(...edit.keyLightDirection);
    const direction = Object.freeze(
      directionLength < 0.001
        ? ([-26, 42, 18] satisfies Vector3Tuple)
        : ([...edit.keyLightDirection] satisfies Vector3Tuple),
    );
    const environment = Object.freeze({
      groundMode: edit.groundMode,
      skyPreset: edit.skyPreset,
      backgroundColor: edit.backgroundColor,
      keyLight: Object.freeze({
        direction,
        intensity: clamp(edit.keyLightIntensity, 0, 8),
        color: edit.keyLightColor,
      }),
      ambientLight: Object.freeze({
        intensity: clamp(edit.ambientLightIntensity, 0, 5),
        color: edit.ambientLightColor,
      }),
      gravity: Object.freeze([0, -clamp(edit.gravityStrength, 0, 40), 0] satisfies Vector3Tuple),
      fog: Object.freeze({
        enabled: edit.fogEnabled,
        color: edit.fogColor,
        near: fogNear,
        far: fogFar,
      }),
      musicAssetId: edit.musicAssetId,
      musicVolume: clamp(edit.musicVolume, 0, 1),
      outOfBoundsHeight: clamp(edit.outOfBoundsHeight, -10_000, 1_000),
    });
    if (JSON.stringify(environment) === JSON.stringify(this.documentValue.environment)) {
      return false;
    }
    this.execute(
      "Edit world settings",
      (document) => Object.freeze({ ...document, environment }),
      this.selectedIdsValue,
    );
    return true;
  }

  public placeEntity(
    assetId: EditorAssetId,
    worldPosition: Vector3Tuple,
    options: PlacementOptions,
  ): MapEntity {
    this.commitContinuousEdit();
    const entity = createEntity(assetId, worldPosition, options, this.createId);
    this.execute(
      editorAssetManifest(assetId)?.historyLabel ?? "Place object",
      (document) => addEntity(document, entity),
      [entity.id],
    );
    return entity;
  }

  public placeFreeformFloor(
    worldPoints: readonly Vector3Tuple[],
    elevation: number,
  ): MapEntity | null {
    const placement = freeformFloorPlacement(worldPoints);
    if (placement === null) {
      return null;
    }
    this.commitContinuousEdit();
    const entity = createEntity(
      "floor.freeform",
      placement.position,
      { elevation, primarySize: 8, secondarySize: 6, yawRadians: 0 },
      this.createId,
    );
    const freeform = Object.freeze({
      ...entity,
      properties: Object.freeze({
        ...entity.properties,
        outline: placement.outline,
      }),
    });
    this.execute("Draw freeform floor", (document) => addEntity(document, freeform), [freeform.id]);
    return freeform;
  }

  public createTrack(
    points: readonly Vector3Tuple[],
    options: TrackPlacementOptions,
  ): TrackDefinition | null {
    this.commitContinuousEdit();
    const simplified = simplifyTrackStroke(points, clamp(options.width * 0.12, 0.5, 1.5));
    if (simplified.length < 2) {
      return null;
    }
    const shouldClose =
      simplified.length >= 4 &&
      distanceBetweenPoints(simplified[0]!, simplified.at(-1)!) <=
        Math.max(2, options.width * 1.25);
    const trackPoints = shouldClose ? simplified.slice(0, -1) : simplified;
    const track = createTrackDefinition(trackPoints, options, this.createId, shouldClose);
    this.execute(
      "Draw track",
      (document) =>
        Object.freeze({ ...document, tracks: Object.freeze([...document.tracks, track]) }),
      [],
    );
    return track;
  }

  public adjustTrackWithWheel(
    trackId: string,
    steps: number,
    mode: "width" | "elevation" | "bank",
  ): boolean {
    if (steps === 0 || !this.documentValue.tracks.some((track) => track.id === trackId)) {
      return false;
    }
    this.openTransaction ??= {
      label: "Adjust track",
      before: this.documentValue,
      selectionBefore: this.selectedIdsValue,
    };
    this.documentValue = updateTrack(this.documentValue, trackId, (track) => ({
      ...track,
      nodes: track.nodes.map((node) => ({
        ...node,
        position:
          mode === "elevation"
            ? ([
                node.position[0],
                clamp(node.position[1] + steps * 0.25, -500, 500),
                node.position[2],
              ] satisfies Vector3Tuple)
            : node.position,
        width: mode === "width" ? clamp(node.width + steps * 0.5, 1, 100) : node.width,
        bankRadians:
          mode === "bank"
            ? clamp(node.bankRadians + steps * (Math.PI / 72), -Math.PI / 3, Math.PI / 3)
            : node.bankRadians,
      })),
    }));
    return true;
  }

  public editTrack(
    trackId: string,
    edit: { readonly width: number; readonly elevation: number; readonly bankRadians: number },
  ): boolean {
    this.commitContinuousEdit();
    const current = this.documentValue.tracks.find((track) => track.id === trackId);
    if (current === undefined) {
      return false;
    }
    const currentElevation =
      current.nodes.reduce((sum, node) => sum + node.position[1], 0) /
      Math.max(1, current.nodes.length);
    const elevationDelta = clamp(edit.elevation, -500, 500) - currentElevation;
    this.execute(
      "Edit track",
      (document) =>
        updateTrack(document, trackId, (track) => ({
          ...track,
          nodes: track.nodes.map((node) => ({
            ...node,
            // The inspector displays average elevation. Move the complete
            // profile by its delta so ramps and stacked layers stay intact.
            position: [
              node.position[0],
              clamp(node.position[1] + elevationDelta, -500, 500),
              node.position[2],
            ],
            width: clamp(edit.width, 1, 100),
            bankRadians: clamp(edit.bankRadians, -Math.PI / 3, Math.PI / 3),
          })),
        })),
      [],
    );
    return true;
  }

  public extendTrack(
    trackId: string,
    points: readonly Vector3Tuple[],
    side: TrackEndpointSide = "end",
    targetElevation?: number,
  ): boolean {
    this.commitContinuousEdit();
    const current = this.documentValue.tracks.find((track) => track.id === trackId);
    if (current === undefined || current.closed) {
      return false;
    }
    const firstNode = current.nodes[0];
    const lastNode = current.nodes.at(-1);
    if (firstNode === undefined || lastNode === undefined) {
      return false;
    }
    const anchorNode = side === "start" ? firstNode : lastNode;
    const oppositeNode = side === "start" ? lastNode : firstNode;
    const simplified = simplifyTrackStroke(points, clamp(anchorNode.width * 0.12, 0.5, 1.5));
    if (simplified.length < 2) {
      return false;
    }
    const shouldClose =
      simplified.length >= 3 &&
      distanceBetweenPoints(simplified.at(-1)!, oppositeNode.position) <=
        Math.max(2, anchorNode.width * 1.25);
    const elevated = shapeTrackElevationTransition(
      simplified,
      anchorNode.position[1],
      shouldClose
        ? oppositeNode.position[1]
        : clamp(targetElevation ?? anchorNode.position[1], -500, 500),
      anchorNode.width,
    );
    const currentLength = Math.max(0.1, trackLength(current));
    let nextNodes: readonly TrackNode[];
    if (shouldClose) {
      const connection =
        side === "end"
          ? [lastNode.position, ...elevated.slice(1, -1), firstNode.position]
          : [lastNode.position, ...elevated.slice(1, -1).reverse(), firstNode.position];
      const smoothed = smoothTrackClosure(current, connection);
      const appended = smoothed
        .slice(1, -1)
        .map((position) => createTrackNode(position, anchorNode, this.createId));
      nextNodes = rebuildTrackTangents([...current.nodes, ...appended]);
    } else if (side === "end") {
      const extension = smoothTrackExtension(current, elevated);
      const appended = extension
        .slice(1)
        .map((position) => createTrackNode(position, anchorNode, this.createId));
      nextNodes = rebuildTrackTangents([...current.nodes, ...appended]);
    } else {
      const reversedTrack = { ...current, nodes: [...current.nodes].reverse() };
      const extension = smoothTrackExtension(reversedTrack, elevated);
      const prepended = extension
        .slice(1)
        .reverse()
        .map((position) => createTrackNode(position, anchorNode, this.createId));
      nextNodes = rebuildTrackTangents([...prepended, ...current.nodes]);
    }
    if (nextNodes.length === current.nodes.length) {
      return false;
    }
    const nextTrack = {
      ...current,
      closed: shouldClose,
      nodes: rebuildTrackTangentsPreservingManual(current, nextNodes, shouldClose),
    };
    const nextLength = Math.max(0.1, trackLength(nextTrack));
    const addedLength = Math.max(0, nextLength - currentLength);
    const walls = current.walls.map((wall) => {
      const coversWholeTrack =
        wall.startDistance <= 0.25 && wall.endDistance >= currentLength - 0.5;
      if (coversWholeTrack) {
        return { ...wall, startDistance: 0, endDistance: nextLength };
      }
      return side === "start" && !shouldClose
        ? {
            ...wall,
            startDistance: wall.startDistance + addedLength,
            endDistance: wall.endDistance + addedLength,
          }
        : wall;
    });
    const roadRanges = (current.roadRanges ?? []).map((range) =>
      side === "start" && !shouldClose
        ? {
            ...range,
            startDistance: range.startDistance + addedLength,
            endDistance: range.endDistance + addedLength,
          }
        : range,
    );
    this.execute(
      shouldClose ? "Close track" : "Extend track",
      (document) =>
        updateTrack(document, trackId, (track) => ({
          ...track,
          closed: shouldClose,
          nodes: nextNodes,
          walls,
          roadRanges,
        })),
      [],
    );
    return true;
  }

  public joinTrackEndpoints(
    sourceTrackId: string,
    sourceSide: TrackEndpointSide,
    targetTrackId: string,
    targetSide: TrackEndpointSide,
    points: readonly Vector3Tuple[],
  ): boolean {
    this.commitContinuousEdit();
    if (sourceTrackId === targetTrackId) {
      return this.extendTrack(sourceTrackId, points, sourceSide);
    }
    const source = this.documentValue.tracks.find((track) => track.id === sourceTrackId);
    const target = this.documentValue.tracks.find((track) => track.id === targetTrackId);
    if (source === undefined || target === undefined || source.closed || target.closed) {
      return false;
    }
    const sourceNodes = orientTrackNodes(source.nodes, sourceSide === "start");
    const targetNodes = orientTrackNodes(target.nodes, targetSide === "end");
    const sourceAnchor = sourceNodes.at(-1);
    const targetAnchor = targetNodes[0];
    if (sourceAnchor === undefined || targetAnchor === undefined) {
      return false;
    }
    const route = [sourceAnchor.position, ...points.slice(1, -1), targetAnchor.position];
    const simplified = simplifyTrackStroke(
      route,
      clamp(Math.min(sourceAnchor.width, targetAnchor.width) * 0.12, 0.5, 1.5),
    );
    if (simplified.length < 2) {
      return false;
    }
    const elevated = shapeTrackElevationTransition(
      simplified,
      sourceAnchor.position[1],
      targetAnchor.position[1],
      (sourceAnchor.width + targetAnchor.width) / 2,
    );
    const sourceOriented = { ...source, nodes: sourceNodes };
    const targetOriented = { ...target, nodes: targetNodes };
    const departureSmoothed = smoothTrackExtension(sourceOriented, elevated);
    const bridge = smoothTrackApproach(targetOriented, departureSmoothed);
    const bridgeNodes = bridge
      .slice(1, -1)
      .map((position, index) =>
        createTrackNode(
          position,
          index < bridge.length / 2 ? sourceAnchor : targetAnchor,
          this.createId,
        ),
      );
    let nodes = rebuildTrackTangents([...sourceNodes, ...bridgeNodes, ...targetNodes]);
    nodes = rebuildTrackTangentsPreservingManual(sourceOriented, nodes, false);
    nodes = rebuildTrackTangentsPreservingManual(targetOriented, nodes, false);
    const joinedWithoutWalls: TrackDefinition = {
      ...source,
      closed: false,
      nodes,
      walls: Object.freeze([]),
      roadRanges: Object.freeze([]),
    };
    const joinedLength = trackLength(joinedWithoutWalls);
    const targetStartDistance = trackDistanceToNode(
      joinedWithoutWalls,
      sourceNodes.length + bridgeNodes.length,
    );
    const sourceRoadRanges = orientTrackRoadRanges(
      source.roadRanges ?? [],
      trackLength(source),
      sourceSide === "start",
    );
    const targetRoadRanges = orientTrackRoadRanges(
      target.roadRanges ?? [],
      trackLength(target),
      targetSide === "end",
    ).map((range) => ({
      ...range,
      id: this.createId(),
      startDistance: range.startDistance + targetStartDistance,
      endDistance: range.endDistance + targetStartDistance,
    }));
    const wallSides = new Set([
      ...source.walls.map((wall) => wall.side),
      ...target.walls.map((wall) => wall.side),
    ]);
    const walls: TrackWallRange[] = [...wallSides].map((side) => ({
      id: this.createId(),
      side,
      startDistance: 0,
      endDistance: joinedLength,
      height: 1.2,
      thickness: 0.22,
      styleId: "wall.safety-cyan",
    }));
    const joined = Object.freeze({
      ...joinedWithoutWalls,
      walls: Object.freeze(walls),
      roadRanges: Object.freeze([...sourceRoadRanges, ...targetRoadRanges]),
    });
    this.execute(
      "Join tracks",
      (document) =>
        Object.freeze({
          ...document,
          tracks: Object.freeze(
            document.tracks
              .filter((track) => track.id !== targetTrackId)
              .map((track) => (track.id === sourceTrackId ? joined : track)),
          ),
        }),
      [],
    );
    return true;
  }

  public smoothTrack(trackId: string): boolean {
    this.commitContinuousEdit();
    const current = this.documentValue.tracks.find((track) => track.id === trackId);
    if (current === undefined || current.nodes.length < 3) {
      return false;
    }

    const currentLength = Math.max(0.1, trackLength(current));
    let nodes = current.nodes;
    for (let pass = 0; pass < 2; pass += 1) {
      nodes = nodes.map((node, index) => {
        if (!current.closed && (index === 0 || index === nodes.length - 1)) {
          return node;
        }
        const previous = nodes[(index - 1 + nodes.length) % nodes.length] ?? node;
        const next = nodes[(index + 1) % nodes.length] ?? node;
        return {
          ...node,
          // Smooth the route in plan view without flattening authored jumps.
          position: [
            node.position[0] * 0.5 + (previous.position[0] + next.position[0]) * 0.25,
            node.position[1],
            node.position[2] * 0.5 + (previous.position[2] + next.position[2]) * 0.25,
          ] as Vector3Tuple,
        };
      });
    }
    const rebuiltNodes = rebuildTrackTangents(nodes, current.closed);
    const smoothedTrack = { ...current, nodes: rebuiltNodes };
    const nextLength = Math.max(0.1, trackLength(smoothedTrack));
    const distanceScale = nextLength / currentLength;
    const walls = current.walls.map((wall) => {
      const coversWholeTrack =
        wall.startDistance <= 0.25 && wall.endDistance >= currentLength - 0.5;
      return coversWholeTrack
        ? { ...wall, startDistance: 0, endDistance: nextLength }
        : {
            ...wall,
            startDistance: wall.startDistance * distanceScale,
            endDistance: wall.endDistance * distanceScale,
          };
    });
    const roadRanges = scaleTrackRoadRanges(current.roadRanges ?? [], nextLength / currentLength);

    this.execute(
      "Smooth track",
      (document) =>
        updateTrack(document, trackId, (track) => ({
          ...track,
          nodes: rebuiltNodes,
          roadRanges,
          walls,
        })),
      [],
    );
    return true;
  }

  public moveTrackNode(trackId: string, nodeId: string, position: Vector3Tuple): boolean {
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    if (track === undefined || !track.nodes.some((node) => node.id === nodeId)) {
      return false;
    }
    this.openTransaction ??= {
      label: "Move track point",
      before: this.documentValue,
      selectionBefore: this.selectedIdsValue,
    };
    this.documentValue = updateTrack(this.documentValue, trackId, (candidate) =>
      replaceTrackNodes(
        candidate,
        candidate.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                position: [
                  clamp(position[0], -500, 500),
                  clamp(position[1], -500, 500),
                  clamp(position[2], -500, 500),
                ],
              }
            : node,
        ),
      ),
    );
    return true;
  }

  public moveTrackTangent(
    trackId: string,
    nodeId: string,
    side: TrackTangentSide,
    tangent: Vector3Tuple,
  ): boolean {
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    if (track === undefined || !track.nodes.some((node) => node.id === nodeId)) {
      return false;
    }
    this.openTransaction ??= {
      label: "Shape track curve",
      before: this.documentValue,
      selectionBefore: this.selectedIdsValue,
    };
    const shaped: Vector3Tuple = [
      clamp(tangent[0], -500, 500),
      clamp(tangent[1], -500, 500),
      clamp(tangent[2], -500, 500),
    ];
    this.documentValue = updateTrack(this.documentValue, trackId, (candidate) => ({
      ...candidate,
      nodes: Object.freeze(
        candidate.nodes.map((node) =>
          node.id === nodeId
            ? Object.freeze({
                ...node,
                tangentIn: Object.freeze(side === "in" ? shaped : node.tangentIn),
                tangentOut: Object.freeze(side === "out" ? shaped : node.tangentOut),
              })
            : node,
        ),
      ),
    }));
    return true;
  }

  public resetTrackTangent(trackId: string, nodeId: string): boolean {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    const automatic =
      track === undefined ? undefined : rebuildTrackTangents(track.nodes, track.closed);
    const automaticNode = automatic?.find((node) => node.id === nodeId);
    if (track === undefined || automaticNode === undefined) {
      return false;
    }
    this.execute(
      "Reset track curve",
      (document) =>
        updateTrack(document, trackId, (candidate) => ({
          ...candidate,
          nodes: Object.freeze(
            candidate.nodes.map((node) =>
              node.id === nodeId
                ? Object.freeze({
                    ...node,
                    tangentIn: automaticNode.tangentIn,
                    tangentOut: automaticNode.tangentOut,
                  })
                : node,
            ),
          ),
        })),
      [],
    );
    return true;
  }

  public adjustTrackNodeWithWheel(
    trackId: string,
    nodeId: string,
    steps: number,
    mode: "width" | "elevation" | "bank",
  ): boolean {
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    if (steps === 0 || track === undefined || !track.nodes.some((node) => node.id === nodeId)) {
      return false;
    }
    this.openTransaction ??= {
      label: "Adjust track point",
      before: this.documentValue,
      selectionBefore: this.selectedIdsValue,
    };
    this.documentValue = updateTrack(this.documentValue, trackId, (candidate) =>
      replaceTrackNodes(
        candidate,
        candidate.nodes.map((node) =>
          node.id !== nodeId
            ? node
            : {
                ...node,
                position:
                  mode === "elevation"
                    ? ([
                        node.position[0],
                        clamp(node.position[1] + steps * 0.25, -500, 500),
                        node.position[2],
                      ] satisfies Vector3Tuple)
                    : node.position,
                width: mode === "width" ? clamp(node.width + steps * 0.5, 1, 100) : node.width,
                bankRadians:
                  mode === "bank"
                    ? clamp(node.bankRadians + steps * (Math.PI / 72), -Math.PI / 3, Math.PI / 3)
                    : node.bankRadians,
              },
        ),
      ),
    );
    return true;
  }

  public editTrackNode(trackId: string, nodeId: string, edit: TrackNodeEdit): boolean {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    if (track === undefined || !track.nodes.some((node) => node.id === nodeId)) {
      return false;
    }
    this.execute(
      "Edit track point",
      (document) =>
        updateTrack(document, trackId, (candidate) =>
          replaceTrackNodes(
            candidate,
            candidate.nodes.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    position: [
                      clamp(edit.position[0], -500, 500),
                      clamp(edit.position[1], -500, 500),
                      clamp(edit.position[2], -500, 500),
                    ],
                    width: clamp(edit.width, 1, 100),
                    bankRadians: clamp(edit.bankRadians, -Math.PI / 3, Math.PI / 3),
                  }
                : node,
            ),
          ),
        ),
      [],
    );
    return true;
  }

  public insertTrackNode(trackId: string, nodeId: string): TrackNode | null {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    const index = track?.nodes.findIndex((node) => node.id === nodeId) ?? -1;
    if (track === undefined || index < 0 || track.nodes.length < 2) {
      return null;
    }
    const insertAfter = track.closed || index < track.nodes.length - 1;
    const otherIndex = insertAfter ? (index + 1) % track.nodes.length : index - 1;
    const other = track.nodes[otherIndex];
    const selected = track.nodes[index];
    if (other === undefined || selected === undefined) {
      return null;
    }
    const inserted: TrackNode = Object.freeze({
      id: this.createId(),
      position: Object.freeze([
        (selected.position[0] + other.position[0]) / 2,
        (selected.position[1] + other.position[1]) / 2,
        (selected.position[2] + other.position[2]) / 2,
      ] satisfies Vector3Tuple),
      tangentIn: Object.freeze([0, 0, 0] satisfies Vector3Tuple),
      tangentOut: Object.freeze([0, 0, 0] satisfies Vector3Tuple),
      width: (selected.width + other.width) / 2,
      bankRadians: (selected.bankRadians + other.bankRadians) / 2,
    });
    const insertionIndex = insertAfter ? index + 1 : index;
    this.execute(
      "Insert track point",
      (document) =>
        updateTrack(document, trackId, (candidate) => {
          const nodes = [...candidate.nodes];
          nodes.splice(insertionIndex, 0, inserted);
          return replaceTrackNodes(candidate, nodes);
        }),
      [],
    );
    return inserted;
  }

  public deleteTrackNode(trackId: string, nodeId: string): boolean {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    const minimumNodes = track?.closed === true ? 3 : 2;
    if (
      track === undefined ||
      track.nodes.length <= minimumNodes ||
      !track.nodes.some((node) => node.id === nodeId)
    ) {
      return false;
    }
    this.execute(
      "Delete track point",
      (document) =>
        updateTrack(document, trackId, (candidate) =>
          replaceTrackNodes(
            candidate,
            candidate.nodes.filter((node) => node.id !== nodeId),
          ),
        ),
      [],
    );
    return true;
  }

  public splitTrack(trackId: string, nodeId: string): TrackSplitResult | null {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    const index = track?.nodes.findIndex((node) => node.id === nodeId) ?? -1;
    if (track === undefined || index < 0) {
      return null;
    }
    const selected = track.nodes[index];
    if (selected === undefined) {
      return null;
    }

    if (track.closed) {
      if (track.nodes.length < 3) {
        return null;
      }
      const totalLength = Math.max(0.1, trackLength(track));
      const cutDistance = trackDistanceToNode(track, index);
      const duplicatedEnd = Object.freeze({ ...selected, id: this.createId() });
      const nodes = Object.freeze([
        ...track.nodes.slice(index),
        ...track.nodes.slice(0, index),
        duplicatedEnd,
      ]);
      const opened: TrackDefinition = Object.freeze({
        ...track,
        closed: false,
        nodes,
        walls: rotateTrackWallsAtCut(track.walls, cutDistance, totalLength, this.createId),
        roadRanges: rotateTrackRoadRangesAtCut(
          track.roadRanges ?? [],
          cutDistance,
          totalLength,
          this.createId,
        ),
      });
      this.execute(
        "Open track loop",
        (document) => updateTrack(document, trackId, () => opened),
        [],
      );
      return Object.freeze({
        primaryTrackId: trackId,
        secondaryTrackId: null,
        selectedNodeId: selected.id,
        openedLoop: true,
      });
    }

    if (index === 0 || index === track.nodes.length - 1) {
      return null;
    }
    const duplicatedStart = Object.freeze({ ...selected, id: this.createId() });
    const primaryNodes = Object.freeze(track.nodes.slice(0, index + 1));
    const secondaryNodes = Object.freeze([duplicatedStart, ...track.nodes.slice(index + 1)]);
    if (primaryNodes.length < 2 || secondaryNodes.length < 2) {
      return null;
    }
    const primaryWithoutWalls: TrackDefinition = Object.freeze({
      ...track,
      closed: false,
      nodes: primaryNodes,
      walls: Object.freeze([]),
    });
    const secondaryTrackId = this.createId();
    const secondaryWithoutWalls: TrackDefinition = Object.freeze({
      ...track,
      id: secondaryTrackId,
      closed: false,
      nodes: secondaryNodes,
      walls: Object.freeze([]),
    });
    const primaryLength = trackLength(primaryWithoutWalls);
    const secondaryLength = trackLength(secondaryWithoutWalls);
    const primary = Object.freeze({
      ...primaryWithoutWalls,
      walls: clipTrackWalls(track.walls, 0, primaryLength, 0, true, this.createId),
      roadRanges: clipTrackRoadRanges(
        track.roadRanges ?? [],
        0,
        primaryLength,
        0,
        true,
        this.createId,
      ),
    });
    const secondary = Object.freeze({
      ...secondaryWithoutWalls,
      walls: clipTrackWalls(
        track.walls,
        primaryLength,
        primaryLength + secondaryLength,
        primaryLength,
        false,
        this.createId,
      ),
      roadRanges: clipTrackRoadRanges(
        track.roadRanges ?? [],
        primaryLength,
        primaryLength + secondaryLength,
        primaryLength,
        false,
        this.createId,
      ),
    });
    this.execute(
      "Split track",
      (document) =>
        Object.freeze({
          ...document,
          tracks: Object.freeze(
            document.tracks.flatMap((candidate) =>
              candidate.id === trackId ? [primary, secondary] : [candidate],
            ),
          ),
        }),
      [],
    );
    return Object.freeze({
      primaryTrackId: trackId,
      secondaryTrackId,
      selectedNodeId: selected.id,
      openedLoop: false,
    });
  }

  public setTrackWalls(trackId: string, left: boolean, right: boolean): boolean {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    if (track === undefined) {
      return false;
    }
    const length = Math.max(0.1, trackLength(track));
    const existing = new Map<"left" | "right", TrackWallRange[]>();
    for (const wall of track.walls) {
      const ranges = existing.get(wall.side) ?? [];
      ranges.push(wall);
      existing.set(wall.side, ranges);
    }
    const walls: TrackWallRange[] = [];
    for (const side of ["left", "right"] as const) {
      if ((side === "left" && left) || (side === "right" && right)) {
        const ranges = existing.get(side);
        walls.push(
          ...(ranges ?? [
            {
              id: this.createId(),
              side,
              startDistance: 0,
              endDistance: length,
              height: 1.2,
              thickness: 0.2,
              styleId: "wall.clean",
            },
          ]),
        );
      }
    }
    this.execute(
      "Change track walls",
      (document) => updateTrack(document, trackId, (candidate) => ({ ...candidate, walls })),
      [],
    );
    return true;
  }

  public editTrackWallRange(
    trackId: string,
    side: TrackWallBrushSide,
    startDistance: number,
    endDistance: number,
    action: TrackWallBrushAction,
  ): boolean {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    if (track === undefined) {
      return false;
    }
    const length = Math.max(0.1, trackLength(track));
    let start = clamp(Math.min(startDistance, endDistance), 0, length);
    let end = clamp(Math.max(startDistance, endDistance), 0, length);
    // A click without a drag still paints a small, visible patch instead of
    // appearing to do nothing. Dragging remains the primary interaction.
    if (end - start < 0.25) {
      const center = (start + end) / 2;
      start = clamp(center - 0.5, 0, length);
      end = clamp(center + 0.5, 0, length);
    }
    if (end - start < 0.01) {
      return false;
    }
    const sides = side === "both" ? (["left", "right"] as const) : ([side] as const);
    const walls =
      action === "paint"
        ? paintTrackWallInterval(track.walls, sides, start, end, this.createId)
        : eraseTrackWallInterval(track.walls, sides, start, end, this.createId);
    if (sameTrackWalls(track.walls, walls)) {
      return false;
    }
    this.execute(
      action === "paint" ? "Paint track walls" : "Erase track walls",
      (document) => updateTrack(document, trackId, (candidate) => ({ ...candidate, walls })),
      [],
    );
    return true;
  }

  public editTrackWallProperties(
    trackId: string,
    side: TrackWallBrushSide,
    startDistance: number,
    endDistance: number,
    edit: TrackWallPropertiesEdit,
  ): boolean {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    if (track === undefined) {
      return false;
    }
    const length = Math.max(0.1, trackLength(track));
    const start = clamp(Math.min(startDistance, endDistance), 0, length);
    const end = clamp(Math.max(startDistance, endDistance), 0, length);
    if (end - start < 0.01) {
      return false;
    }
    const sides = side === "both" ? (["left", "right"] as const) : ([side] as const);
    const selectedSides = new Set(sides);
    const height = clamp(edit.height, 0.1, 20);
    const thickness = clamp(edit.thickness, 0.05, 5);
    const touched = track.walls.some(
      (wall) =>
        selectedSides.has(wall.side) &&
        wall.endDistance > start &&
        wall.startDistance < end &&
        (wall.height !== height || wall.thickness !== thickness || wall.styleId !== edit.styleId),
    );
    if (!touched) {
      return false;
    }
    const walls = editTrackWallIntervalProperties(
      track.walls,
      sides,
      start,
      end,
      { height, thickness, styleId: edit.styleId },
      this.createId,
    );
    this.execute(
      "Style track wall range",
      (document) => updateTrack(document, trackId, (candidate) => ({ ...candidate, walls })),
      [],
    );
    return true;
  }

  public editTrackRoadProperties(
    trackId: string,
    startDistance: number,
    endDistance: number,
    edit: TrackRoadPropertiesEdit,
  ): boolean {
    this.commitContinuousEdit();
    const track = this.documentValue.tracks.find((candidate) => candidate.id === trackId);
    if (track === undefined) {
      return false;
    }
    const length = Math.max(0.1, trackLength(track));
    const start = clamp(Math.min(startDistance, endDistance), 0, length);
    const end = clamp(Math.max(startDistance, endDistance), 0, length);
    if (end - start < 0.01) {
      return false;
    }
    const nextEdit = Object.freeze({
      width: clamp(edit.width, 1, 100),
      bankRadians: clamp(edit.bankRadians, -Math.PI / 3, Math.PI / 3),
      surface: edit.surface,
      materialId: edit.materialId,
      surfaceStrength: clamp(
        edit.surfaceStrength ?? 1,
        TRACK_SURFACE_STRENGTH_MINIMUM,
        TRACK_SURFACE_STRENGTH_MAXIMUM,
      ),
      surfaceCooldownSeconds: clamp(
        edit.surfaceCooldownSeconds ?? defaultTrackSurfaceCooldownSeconds(edit.surface),
        TRACK_SURFACE_COOLDOWN_MINIMUM_SECONDS,
        TRACK_SURFACE_COOLDOWN_MAXIMUM_SECONDS,
      ),
    });
    const roadRanges = editTrackRoadInterval(
      track.roadRanges ?? [],
      start,
      end,
      nextEdit,
      this.createId,
    );
    if (sameTrackRoadRanges(track.roadRanges ?? [], roadRanges)) {
      return false;
    }
    this.execute(
      "Style road range",
      (document) => updateTrack(document, trackId, (candidate) => ({ ...candidate, roadRanges })),
      [],
    );
    return true;
  }

  public deleteTrack(trackId: string): boolean {
    this.commitContinuousEdit();
    if (!this.documentValue.tracks.some((track) => track.id === trackId)) {
      return false;
    }
    this.execute(
      "Delete track",
      (document) =>
        Object.freeze({
          ...document,
          tracks: Object.freeze(document.tracks.filter((track) => track.id !== trackId)),
        }),
      [],
    );
    return true;
  }

  public duplicateSelected(): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntities;
    if (selected.length === 0) {
      return false;
    }
    const copiedIdBySourceId = new Map(selected.map((entity) => [entity.id, this.createId()]));
    const copiedGroupIdBySourceId = copiedGroupIds(selected, this.createId);
    const duplicates = selected.map<MapEntity>((entity) =>
      Object.freeze({
        ...entity,
        id: copiedIdBySourceId.get(entity.id)!,
        groupId:
          entity.groupId === null ? null : (copiedGroupIdBySourceId.get(entity.groupId) ?? null),
        transform: Object.freeze({
          ...entity.transform,
          position: Object.freeze([
            entity.transform.position[0] + 1.5,
            entity.transform.position[1],
            entity.transform.position[2] + 1.5,
          ] satisfies Vector3Tuple),
        }),
        properties: copiedEntityProperties(entity, copiedIdBySourceId),
      }),
    );
    this.execute(
      duplicates.length === 1 ? "Duplicate object" : "Duplicate objects",
      (document) => duplicates.reduce(addEntity, document),
      duplicates.map((entity) => entity.id),
    );
    return true;
  }

  public pasteEntities(entities: readonly MapEntity[]): boolean {
    this.commitContinuousEdit();
    if (entities.length === 0) {
      return false;
    }
    const copiedIdBySourceId = new Map(entities.map((entity) => [entity.id, this.createId()]));
    const copiedGroupIdBySourceId = copiedGroupIds(entities, this.createId);
    const copies = entities.map<MapEntity>((entity) =>
      Object.freeze({
        ...entity,
        id: copiedIdBySourceId.get(entity.id)!,
        groupId:
          entity.groupId === null ? null : (copiedGroupIdBySourceId.get(entity.groupId) ?? null),
        transform: Object.freeze({
          ...entity.transform,
          position: Object.freeze([
            entity.transform.position[0] + 1.5,
            entity.transform.position[1],
            entity.transform.position[2] + 1.5,
          ] satisfies Vector3Tuple),
        }),
        properties: copiedEntityProperties(entity, copiedIdBySourceId),
      }),
    );
    this.execute(
      copies.length === 1 ? "Paste object" : "Paste objects",
      (document) => copies.reduce(addEntity, document),
      copies.map((entity) => entity.id),
    );
    return true;
  }

  public deleteSelected(): boolean {
    this.commitContinuousEdit();
    const selectedIds = this.selectedIdsValue;
    if (selectedIds.length === 0) {
      return false;
    }
    this.execute(
      selectedIds.length === 1 ? "Delete object" : "Delete objects",
      (document) => selectedIds.reduce(removeEntity, document),
      [],
    );
    return true;
  }

  public addInteractionLink(edit: InteractionLinkEdit): string | null {
    this.commitContinuousEdit();
    if (
      edit.sourceEntityId === edit.targetEntityId ||
      !this.documentValue.entities.some((entity) => entity.id === edit.sourceEntityId) ||
      !this.documentValue.entities.some((entity) => entity.id === edit.targetEntityId) ||
      this.documentValue.interactions.some(
        (interaction) =>
          interaction.sourceEntityId === edit.sourceEntityId &&
          interaction.event === edit.event &&
          interaction.condition === edit.condition &&
          interaction.targetEntityId === edit.targetEntityId &&
          interaction.action === edit.action,
      )
    ) {
      return null;
    }
    const interaction = Object.freeze({ id: this.createId(), ...edit });
    this.execute(
      "Add interaction link",
      (document) =>
        Object.freeze({
          ...document,
          interactions: Object.freeze([...document.interactions, interaction]),
        }),
      this.selectedIdsValue,
    );
    return interaction.id;
  }

  public removeInteractionLink(interactionId: string): boolean {
    this.commitContinuousEdit();
    if (!this.documentValue.interactions.some((interaction) => interaction.id === interactionId)) {
      return false;
    }
    this.execute(
      "Remove interaction link",
      (document) =>
        Object.freeze({
          ...document,
          interactions: Object.freeze(
            document.interactions.filter((interaction) => interaction.id !== interactionId),
          ),
        }),
      this.selectedIdsValue,
    );
    return true;
  }

  public groupSelectedCheckpoints(required = true): boolean {
    this.commitContinuousEdit();
    const checkpoints = this.selectedEntities;
    if (
      checkpoints.length === 0 ||
      checkpoints.some((entity) => entity.assetId !== "race.checkpoint")
    ) {
      return false;
    }
    const alreadyAssigned = new Set(
      this.documentValue.race.checkpointGroups.flatMap((group) => group.checkpointEntityIds),
    );
    if (checkpoints.some((checkpoint) => alreadyAssigned.has(checkpoint.id))) {
      return false;
    }
    const group = Object.freeze({
      id: this.createId(),
      checkpointEntityIds: Object.freeze(checkpoints.map((checkpoint) => checkpoint.id)),
      required,
    });
    this.execute(
      checkpoints.length === 1 ? "Make checkpoint group" : "Group checkpoints",
      (document) =>
        Object.freeze({
          ...document,
          race: Object.freeze({
            ...document.race,
            checkpointGroups: Object.freeze([...document.race.checkpointGroups, group]),
          }),
        }),
      this.selectedIdsValue,
    );
    return true;
  }

  public toggleSelectedCheckpointGroupRequired(): boolean {
    this.commitContinuousEdit();
    const checkpointIds = new Set(
      this.selectedEntities
        .filter((entity) => entity.assetId === "race.checkpoint")
        .map((entity) => entity.id),
    );
    if (checkpointIds.size === 0 || checkpointIds.size !== this.selectedIdsValue.length) {
      return false;
    }
    const groups = this.documentValue.race.checkpointGroups.filter((group) =>
      group.checkpointEntityIds.some((checkpointId) => checkpointIds.has(checkpointId)),
    );
    if (groups.length !== 1) {
      return false;
    }
    const target = groups[0]!;
    this.execute(
      target.required ? "Make checkpoint group optional" : "Make checkpoint group required",
      (document) =>
        Object.freeze({
          ...document,
          race: Object.freeze({
            ...document.race,
            checkpointGroups: Object.freeze(
              document.race.checkpointGroups.map((group) =>
                group.id === target.id
                  ? Object.freeze({ ...group, required: !group.required })
                  : group,
              ),
            ),
          }),
        }),
      this.selectedIdsValue,
    );
    return true;
  }

  public linkSelectedCheckpoints(shortcut = false): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedIdsValue.map((id) =>
      this.documentValue.entities.find((entity) => entity.id === id),
    );
    if (selected.length !== 2 || selected.some((entity) => entity?.assetId !== "race.checkpoint")) {
      return false;
    }
    const fromCheckpoint = selected[0]!;
    const toCheckpoint = selected[1]!;
    const currentGroups = this.documentValue.race.checkpointGroups;
    const fromExisting = currentGroups.find((group) =>
      group.checkpointEntityIds.includes(fromCheckpoint.id),
    );
    const toExisting = currentGroups.find((group) =>
      group.checkpointEntityIds.includes(toCheckpoint.id),
    );
    if (fromExisting !== undefined && fromExisting.id === toExisting?.id) {
      return false;
    }
    const fromGroup =
      fromExisting ??
      Object.freeze({
        id: this.createId(),
        checkpointEntityIds: Object.freeze([fromCheckpoint.id]),
        required: true,
      });
    const toGroup =
      toExisting ??
      Object.freeze({
        id: this.createId(),
        checkpointEntityIds: Object.freeze([toCheckpoint.id]),
        required: true,
      });
    if (
      this.documentValue.race.routeEdges.some(
        (edge) => edge.fromGroupId === fromGroup.id && edge.toGroupId === toGroup.id,
      )
    ) {
      return false;
    }
    const edge = Object.freeze({
      id: this.createId(),
      fromGroupId: fromGroup.id,
      toGroupId: toGroup.id,
      shortcut,
    });
    this.execute(
      shortcut ? "Link shortcut route" : "Link race route",
      (document) =>
        Object.freeze({
          ...document,
          race: Object.freeze({
            ...document.race,
            checkpointGroups: Object.freeze([
              ...document.race.checkpointGroups,
              ...(fromExisting === undefined ? [fromGroup] : []),
              ...(toExisting === undefined ? [toGroup] : []),
            ]),
            routeEdges: Object.freeze([...document.race.routeEdges, edge]),
          }),
        }),
      this.selectedIdsValue,
    );
    return true;
  }

  public assignSelectedRecoveryPose(): boolean {
    this.commitContinuousEdit();
    const recoveryVolume = this.selectedEntities.find(
      (entity) => entity.assetId === "race.recovery-volume",
    );
    const safePose = this.selectedEntities.find(
      (entity) => entity.assetId === "race.recovery-pose",
    );
    if (
      this.selectedIdsValue.length !== 2 ||
      recoveryVolume === undefined ||
      safePose === undefined
    ) {
      return false;
    }
    if (recoveryVolume.properties["safePoseEntityId"] === safePose.id) {
      return false;
    }
    this.execute(
      "Assign safe recovery pose",
      (document) =>
        updateEntity(document, recoveryVolume.id, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              safePoseEntityId: safePose.id,
            }),
          }),
        ),
      this.selectedIdsValue,
    );
    return true;
  }

  public clearSelectedRecoveryPose(): boolean {
    this.commitContinuousEdit();
    const recoveryVolume = this.selectedEntities.find(
      (entity) => entity.assetId === "race.recovery-volume",
    );
    if (
      recoveryVolume === undefined ||
      typeof recoveryVolume.properties["safePoseEntityId"] !== "string"
    ) {
      return false;
    }
    this.execute(
      "Clear safe recovery pose",
      (document) =>
        updateEntity(document, recoveryVolume.id, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              safePoseEntityId: null,
            }),
          }),
        ),
      this.selectedIdsValue,
    );
    return true;
  }

  public linkSelectedPortals(): boolean {
    this.commitContinuousEdit();
    const portals = this.selectedEntities;
    if (portals.length !== 2 || portals.some((entity) => entity.assetId !== "travel.portal")) {
      return false;
    }
    const [first, second] = portals as [MapEntity, MapEntity];
    if (
      first.properties["peerPortalEntityId"] === second.id &&
      second.properties["peerPortalEntityId"] === first.id
    ) {
      return false;
    }
    const portalIds = new Set([first.id, second.id]);
    this.execute(
      "Link portal pair",
      (document) =>
        Object.freeze({
          ...document,
          entities: Object.freeze(
            document.entities.map((entity) => {
              if (portalIds.has(entity.id)) {
                return Object.freeze({
                  ...entity,
                  properties: Object.freeze({
                    ...entity.properties,
                    peerPortalEntityId: entity.id === first.id ? second.id : first.id,
                  }),
                });
              }
              return entity.assetId === "travel.portal" &&
                typeof entity.properties["peerPortalEntityId"] === "string" &&
                portalIds.has(entity.properties["peerPortalEntityId"])
                ? Object.freeze({
                    ...entity,
                    properties: Object.freeze({
                      ...entity.properties,
                      peerPortalEntityId: null,
                    }),
                  })
                : entity;
            }),
          ),
        }),
      this.selectedIdsValue,
    );
    return true;
  }

  public clearSelectedPortalLink(): boolean {
    this.commitContinuousEdit();
    const portal = this.selectedEntities.find((entity) => entity.assetId === "travel.portal");
    const peerId = portal?.properties["peerPortalEntityId"];
    if (portal === undefined || typeof peerId !== "string") {
      return false;
    }
    const portalIds = new Set([portal.id, peerId]);
    this.execute(
      "Unlink portal pair",
      (document) =>
        updateEntities(document, portalIds, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({ ...entity.properties, peerPortalEntityId: null }),
          }),
        ),
      this.selectedIdsValue,
    );
    return true;
  }

  public editSelected(edit: EntityTransformEdit, label = "Edit object"): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntity;
    if (selected === null) {
      return false;
    }
    this.execute(
      label,
      (document) =>
        updateEntity(document, selected.id, (entity) => applyEntityTransformEdit(entity, edit)),
      [selected.id],
    );
    return true;
  }

  public editSelectedDynamicPhysics(edit: DynamicPhysicsEdit): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntity;
    if (
      selected === null ||
      (selected.assetId !== "physics.ball" && selected.assetId !== "physics.cube")
    ) {
      return false;
    }
    this.execute(
      "Edit physics object",
      (document) =>
        updateEntity(document, selected.id, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              mass: clamp(edit.mass, 0.1, 100),
              friction: clamp(edit.friction, 0, 2),
              restitution: clamp(edit.restitution, 0, 1),
            }),
          }),
        ),
      [selected.id],
    );
    return true;
  }

  public editSelectedMotion(edit: MotionPropertiesEdit): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntity;
    if (selected?.assetId === "motion.rotating-bar") {
      this.execute(
        "Edit rotating bar",
        (document) =>
          updateEntity(document, selected.id, (entity) =>
            Object.freeze({
              ...entity,
              properties: Object.freeze({
                ...entity.properties,
                degreesPerSecond: clamp(edit.speed, -720, 720),
              }),
            }),
          ),
        [selected.id],
      );
      return true;
    }
    if (selected?.assetId !== "motion.moving-platform" && selected?.assetId !== "motion.door") {
      return false;
    }
    const offset = Object.freeze([
      clamp(edit.offset[0], -100, 100),
      clamp(edit.offset[1], -100, 100),
      clamp(edit.offset[2], -100, 100),
    ] satisfies Vector3Tuple);
    if (Math.hypot(...offset) < 0.5) {
      return false;
    }
    this.execute(
      selected.assetId === "motion.door" ? "Edit moving door" : "Edit moving platform",
      (document) =>
        updateEntity(document, selected.id, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              offsetX: offset[0],
              offsetY: offset[1],
              offsetZ: offset[2],
              speed: clamp(edit.speed, 0.1, 20),
              dwellSeconds: clamp(edit.dwellSeconds, 0, 30),
            }),
          }),
        ),
      [selected.id],
    );
    return true;
  }

  public editSelectedBoostPad(edit: BoostPadPropertiesEdit): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntity;
    if (selected?.assetId !== "travel.boost-pad" && selected?.assetId !== "travel.launch-pad") {
      return false;
    }
    this.execute(
      selected.assetId === "travel.launch-pad" ? "Edit launch pad" : "Edit boost pad",
      (document) =>
        updateEntity(document, selected.id, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              boostSpeed: clamp(edit.boostSpeed, 0, 40),
              liftSpeed: clamp(edit.liftSpeed, 0, 30),
              cooldownSeconds: clamp(edit.cooldownSeconds, 0, 10),
            }),
          }),
        ),
      [selected.id],
    );
    return true;
  }

  public editSelectedSurfacePad(edit: SurfacePadPropertiesEdit): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntity;
    if (selected?.assetId !== "travel.bounce-pad" && selected?.assetId !== "travel.slow-zone") {
      return false;
    }
    const slow = selected.assetId === "travel.slow-zone";
    this.execute(
      slow ? "Edit slow zone" : "Edit bounce pad",
      (document) =>
        updateEntity(document, selected.id, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              ...(slow
                ? { speedMultiplier: clamp(edit.strength, 0.05, 1) }
                : { bounceSpeed: clamp(edit.strength, 1, 30) }),
              cooldownSeconds: clamp(edit.cooldownSeconds, 0, 10),
            }),
          }),
        ),
      [selected.id],
    );
    return true;
  }

  public editSelectedGuidance(edit: GuidancePropertiesEdit): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntity;
    if (
      selected?.assetId !== "travel.direction-arrow" &&
      selected?.assetId !== "decoration.arrow-sign"
    ) {
      return false;
    }
    const sign = selected.assetId === "decoration.arrow-sign";
    const previousColor = selected.properties["color"];
    const color = /^#[0-9a-f]{6}$/i.test(edit.color)
      ? edit.color.toLowerCase()
      : typeof previousColor === "string"
        ? previousColor
        : sign
          ? "#28d7e5"
          : "#f7e44d";
    this.execute(
      sign ? "Edit arrow sign" : "Edit direction arrow",
      (document) =>
        updateEntity(document, selected.id, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              color,
              glow: clamp(edit.glow, 0, 2),
              ...(sign ? { solid: edit.solid } : {}),
            }),
          }),
        ),
      [selected.id],
    );
    return true;
  }

  public editSelectedDecoration(edit: DecorationPropertiesEdit): boolean {
    this.commitContinuousEdit();
    const selected = this.selectedEntity;
    if (
      selected?.assetId !== "decoration.point-light" &&
      selected?.assetId !== "decoration.color-strip"
    ) {
      return false;
    }
    const light = selected.assetId === "decoration.point-light";
    const previousColor = selected.properties["color"];
    const color = /^#[0-9a-f]{6}$/i.test(edit.color)
      ? edit.color.toLowerCase()
      : typeof previousColor === "string"
        ? previousColor
        : light
          ? "#ffd166"
          : "#35d5df";
    this.execute(
      light ? "Edit point light" : "Edit color strip",
      (document) =>
        updateEntity(document, selected.id, (entity) =>
          Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              color,
              enabled: edit.enabled,
              ...(light
                ? {
                    intensity: clamp(edit.intensity, 0, 10),
                    range: clamp(edit.range, 2, 40),
                  }
                : { glow: clamp(edit.glow, 0, 2) }),
            }),
          }),
        ),
      [selected.id],
    );
    return true;
  }

  public beginContinuousEdit(label: string): boolean {
    if (this.selectedEntity === null) {
      return false;
    }
    this.openTransaction ??= {
      label,
      before: this.documentValue,
      selectionBefore: this.selectedIdsValue,
    };
    return true;
  }

  public adjustSelectedWithWheel(
    steps: number,
    mode: "primary" | "elevation" | "rotation",
  ): boolean {
    const selected = this.selectedEntities;
    if (selected.length === 0 || steps === 0) {
      return false;
    }
    if (!this.beginContinuousEdit("Adjust object")) {
      return false;
    }
    const selectedIds = new Set(this.selectedIdsValue);
    this.documentValue = updateEntities(this.documentValue, selectedIds, (entity) => {
      if (mode === "elevation") {
        return applyEntityTransformEdit(entity, {
          position: Object.freeze([
            entity.transform.position[0],
            clamp(entity.transform.position[1] + steps * 0.25, -500, 500),
            entity.transform.position[2],
          ]),
        });
      }
      if (mode === "rotation") {
        return applyEntityTransformEdit(entity, {
          yawRadians: normalizeRadians(readYaw(entity.transform.rotation) + steps * (Math.PI / 36)),
        });
      }
      return applyEntityTransformEdit(entity, {
        primarySize: primarySize(entity) + steps * 0.5,
      });
    });
    return true;
  }

  public translateSelected(delta: Vector3Tuple, gridSize = 0): boolean {
    if (!this.beginContinuousEdit("Move objects")) {
      return false;
    }
    const selectedIds = new Set(this.selectedIdsValue);
    this.documentValue = updateEntities(this.documentValue, selectedIds, (entity) => {
      const position = entity.transform.position;
      return applyEntityTransformEdit(entity, {
        position: [
          snap(position[0] + delta[0], gridSize),
          snap(position[1] + delta[1], gridSize),
          snap(position[2] + delta[2], gridSize),
        ],
      });
    });
    return true;
  }

  public rotateSelected(deltaRadians: number, angleSnapRadians = 0): boolean {
    if (!this.beginContinuousEdit("Rotate objects")) {
      return false;
    }
    const selectedIds = new Set(this.selectedIdsValue);
    const center = entitySelectionCenter(this.selectedEntities);
    const rotationDelta = snap(deltaRadians, angleSnapRadians);
    const cosine = Math.cos(rotationDelta);
    const sine = Math.sin(rotationDelta);
    this.documentValue = updateEntities(this.documentValue, selectedIds, (entity) => {
      const offsetX = entity.transform.position[0] - center[0];
      const offsetZ = entity.transform.position[2] - center[2];
      return applyEntityTransformEdit(entity, {
        position: [
          center[0] + offsetX * cosine + offsetZ * sine,
          entity.transform.position[1],
          center[2] - offsetX * sine + offsetZ * cosine,
        ],
        yawRadians: normalizeRadians(readYaw(entity.transform.rotation) + rotationDelta),
      });
    });
    return true;
  }

  public scaleSelected(delta: number): boolean {
    if (!this.beginContinuousEdit("Resize objects")) {
      return false;
    }
    const selectedIds = new Set(this.selectedIdsValue);
    const selected = this.selectedEntities;
    if (selected.length === 1) {
      this.documentValue = updateEntities(this.documentValue, selectedIds, (entity) =>
        applyEntityTransformEdit(entity, { primarySize: primarySize(entity) + delta }),
      );
      return true;
    }
    const center = entitySelectionCenter(selected);
    const averageSize =
      selected.reduce((sum, entity) => sum + primarySize(entity), 0) / selected.length;
    const factor = clamp((averageSize + delta) / Math.max(0.01, averageSize), 0.1, 10);
    this.documentValue = updateEntities(this.documentValue, selectedIds, (entity) => {
      const position = entity.transform.position;
      return applyEntityTransformEdit(entity, {
        position: [
          center[0] + (position[0] - center[0]) * factor,
          center[1] + (position[1] - center[1]) * factor,
          center[2] + (position[2] - center[2]) * factor,
        ],
        primarySize: primarySize(entity) * factor,
      });
    });
    return true;
  }

  private selectionUnitIds(entityId: string): readonly string[] {
    const entity = this.documentValue.entities.find((candidate) => candidate.id === entityId);
    if (entity?.groupId === null || entity === undefined) {
      return [entityId];
    }
    return this.documentValue.entities
      .filter((candidate) => candidate.groupId === entity.groupId)
      .map((candidate) => candidate.id);
  }

  public commitContinuousEdit(): boolean {
    const transaction = this.openTransaction;
    this.openTransaction = undefined;
    if (transaction === undefined || transaction.before === this.documentValue) {
      return false;
    }
    this.undoStack.push(
      Object.freeze({
        label: transaction.label,
        before: transaction.before,
        after: this.documentValue,
        selectionBefore: transaction.selectionBefore,
        selectionAfter: this.selectedIdsValue,
      }),
    );
    this.redoStack.length = 0;
    return true;
  }

  public undo(): boolean {
    this.commitContinuousEdit();
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return false;
    }
    this.documentValue = entry.before;
    this.selectedIdsValue = entry.selectionBefore;
    this.redoStack.push(entry);
    return true;
  }

  public redo(): boolean {
    this.commitContinuousEdit();
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return false;
    }
    this.documentValue = entry.after;
    this.selectedIdsValue = entry.selectionAfter;
    this.undoStack.push(entry);
    return true;
  }

  private execute(
    label: string,
    update: (document: MapDocument) => MapDocument,
    selectionAfter: readonly string[],
  ): void {
    const before = this.documentValue;
    const selectionBefore = this.selectedIdsValue;
    const after = update(before);
    this.documentValue = after;
    this.selectedIdsValue = Object.freeze([...selectionAfter]);
    this.undoStack.push(
      Object.freeze({
        label,
        before,
        after,
        selectionBefore,
        selectionAfter,
      }),
    );
    this.redoStack.length = 0;
  }
}

function createTrackNode(
  position: Vector3Tuple,
  template: TrackNode,
  createId: () => string,
): TrackNode {
  return {
    id: createId(),
    position,
    tangentIn: [0, 0, 0],
    tangentOut: [0, 0, 0],
    width: template.width,
    bankRadians: template.bankRadians,
  };
}

export function primarySize(entity: MapEntity): number {
  return editorAssetPrimarySize(entity);
}

export function readYaw(rotation: QuaternionTuple): number {
  const [x, y, z, w] = rotation;
  const siny = 2 * (w * y + z * x);
  const cosy = 1 - 2 * (y * y + x * x);
  return Math.atan2(siny, cosy);
}

function createEntity(
  assetId: EditorAssetId,
  worldPosition: Vector3Tuple,
  options: PlacementOptions,
  createId: () => string,
): MapEntity {
  const manifest = editorAssetManifest(assetId);
  if (manifest === null) {
    throw new Error(`Unknown editor asset: ${assetId}`);
  }
  const primary = clamp(
    options.primarySize,
    manifest.minimumPrimarySize,
    manifest.maximumPrimarySize,
  );
  const secondary = clamp(options.secondarySize ?? manifest.defaultSecondarySize, 0.25, 100);
  const size = editorAssetDimensions(assetId, primary, secondary);
  return Object.freeze({
    id: createId(),
    assetId,
    transform: Object.freeze({
      position: Object.freeze([
        worldPosition[0],
        size.groundOffset + options.elevation,
        worldPosition[2],
      ] satisfies Vector3Tuple),
      rotation: quaternionFromYaw(options.yawRadians),
      scale: Object.freeze([1, 1, 1] satisfies Vector3Tuple),
    }),
    groupId: null,
    properties: createEditorAssetProperties(assetId, primary, secondary),
  });
}

function addEntity(document: MapDocument, entity: MapEntity): MapDocument {
  const activeStartGridId =
    document.race.activeStartGridId ?? (entity.assetId === "race.start-grid" ? entity.id : null);
  const finishEntityIds =
    entity.assetId === "race.finish-gate" && !document.race.finishEntityIds.includes(entity.id)
      ? Object.freeze([...document.race.finishEntityIds, entity.id])
      : document.race.finishEntityIds;
  return Object.freeze({
    ...document,
    entities: Object.freeze([...document.entities, entity]),
    race:
      activeStartGridId === document.race.activeStartGridId &&
      finishEntityIds === document.race.finishEntityIds
        ? document.race
        : Object.freeze({ ...document.race, activeStartGridId, finishEntityIds }),
  });
}

function removeEntity(document: MapDocument, entityId: string): MapDocument {
  const retainedEntities = document.entities
    .filter((entity) => entity.id !== entityId)
    .map((entity) =>
      (entity.assetId === "race.recovery-volume" &&
        entity.properties["safePoseEntityId"] === entityId) ||
      (entity.assetId === "travel.portal" && entity.properties["peerPortalEntityId"] === entityId)
        ? Object.freeze({
            ...entity,
            properties: Object.freeze({
              ...entity.properties,
              ...(entity.assetId === "travel.portal"
                ? { peerPortalEntityId: null }
                : { safePoseEntityId: null }),
            }),
          })
        : entity,
    );
  const groupCounts = new Map<string, number>();
  for (const entity of retainedEntities) {
    if (entity.groupId !== null) {
      groupCounts.set(entity.groupId, (groupCounts.get(entity.groupId) ?? 0) + 1);
    }
  }
  const entities = retainedEntities.map((entity) =>
    entity.groupId !== null && (groupCounts.get(entity.groupId) ?? 0) < 2
      ? Object.freeze({ ...entity, groupId: null })
      : entity,
  );
  let activeStartGridId = document.race.activeStartGridId;
  if (activeStartGridId === entityId) {
    activeStartGridId = entities.find((entity) => entity.assetId === "race.start-grid")?.id ?? null;
  }
  const checkpointGroups = document.race.checkpointGroups
    .map((group) =>
      Object.freeze({
        ...group,
        checkpointEntityIds: Object.freeze(
          group.checkpointEntityIds.filter((checkpointId) => checkpointId !== entityId),
        ),
      }),
    )
    .filter((group) => group.checkpointEntityIds.length > 0);
  const checkpointGroupIds = new Set(checkpointGroups.map((group) => group.id));
  return Object.freeze({
    ...document,
    entities: Object.freeze(entities),
    race: Object.freeze({
      ...document.race,
      activeStartGridId,
      finishEntityIds: Object.freeze(
        document.race.finishEntityIds.filter((finishId) => finishId !== entityId),
      ),
      checkpointGroups: Object.freeze(checkpointGroups),
      routeEdges: Object.freeze(
        document.race.routeEdges.filter(
          (edge) =>
            checkpointGroupIds.has(edge.fromGroupId) && checkpointGroupIds.has(edge.toGroupId),
        ),
      ),
    }),
    interactions: Object.freeze(
      document.interactions.filter(
        (interaction) =>
          interaction.sourceEntityId !== entityId && interaction.targetEntityId !== entityId,
      ),
    ),
  });
}

function copiedEntityProperties(
  entity: MapEntity,
  copiedIdBySourceId: ReadonlyMap<string, string>,
): Readonly<Record<string, JsonValue>> {
  if (entity.assetId === "race.recovery-volume") {
    const safePoseId = entity.properties["safePoseEntityId"];
    return Object.freeze({
      ...entity.properties,
      safePoseEntityId:
        typeof safePoseId === "string" ? (copiedIdBySourceId.get(safePoseId) ?? null) : null,
    });
  }
  if (entity.assetId !== "travel.portal") {
    return Object.freeze({ ...entity.properties });
  }
  const peerId = entity.properties["peerPortalEntityId"];
  return Object.freeze({
    ...entity.properties,
    peerPortalEntityId:
      typeof peerId === "string" ? (copiedIdBySourceId.get(peerId) ?? null) : null,
  });
}

function copiedGroupIds(
  entities: readonly MapEntity[],
  createId: () => string,
): ReadonlyMap<string, string> {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    if (entity.groupId !== null) {
      counts.set(entity.groupId, (counts.get(entity.groupId) ?? 0) + 1);
    }
  }
  return new Map(
    [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([sourceGroupId]) => [sourceGroupId, createId()]),
  );
}

function entitySelectionCenter(entities: readonly MapEntity[]): Vector3Tuple {
  if (entities.length === 0) {
    return Object.freeze([0, 0, 0]);
  }
  const total = entities.reduce<[number, number, number]>(
    (sum, entity) => [
      sum[0] + entity.transform.position[0],
      sum[1] + entity.transform.position[1],
      sum[2] + entity.transform.position[2],
    ],
    [0, 0, 0],
  );
  return Object.freeze([
    total[0] / entities.length,
    total[1] / entities.length,
    total[2] / entities.length,
  ]);
}

function updateEntity(
  document: MapDocument,
  entityId: string,
  update: (entity: MapEntity) => MapEntity,
): MapDocument {
  return Object.freeze({
    ...document,
    entities: Object.freeze(
      document.entities.map((entity) => (entity.id === entityId ? update(entity) : entity)),
    ),
  });
}

function updateEntities(
  document: MapDocument,
  entityIds: ReadonlySet<string>,
  update: (entity: MapEntity) => MapEntity,
): MapDocument {
  return Object.freeze({
    ...document,
    entities: Object.freeze(
      document.entities.map((entity) => (entityIds.has(entity.id) ? update(entity) : entity)),
    ),
  });
}

function updateTrack(
  document: MapDocument,
  trackId: string,
  update: (track: TrackDefinition) => TrackDefinition,
): MapDocument {
  return Object.freeze({
    ...document,
    tracks: Object.freeze(
      document.tracks.map((track) => (track.id === trackId ? update(track) : track)),
    ),
  });
}

function replaceTrackNodes(track: TrackDefinition, nodes: readonly TrackNode[]): TrackDefinition {
  const currentLength = Math.max(0.1, trackLength(track));
  const rebuiltNodes = rebuildTrackTangentsPreservingManual(track, nodes, track.closed);
  const nextWithoutWalls = { ...track, nodes: rebuiltNodes };
  const nextLength = Math.max(0.1, trackLength(nextWithoutWalls));
  const remapDistance = trackDistanceMapper(track, nextWithoutWalls);
  return {
    ...nextWithoutWalls,
    walls: track.walls.map((wall) => {
      const coversWholeTrack =
        wall.startDistance <= 0.25 && wall.endDistance >= currentLength - 0.5;
      return coversWholeTrack
        ? { ...wall, startDistance: 0, endDistance: nextLength }
        : {
            ...wall,
            startDistance: remapDistance(wall.startDistance),
            endDistance: remapDistance(wall.endDistance),
          };
    }),
    roadRanges: (track.roadRanges ?? []).map((range) => ({
      ...range,
      startDistance: remapDistance(range.startDistance),
      endDistance: remapDistance(range.endDistance),
    })),
  };
}

function rebuildTrackTangentsPreservingManual(
  track: TrackDefinition,
  nodes: readonly TrackNode[],
  closed: boolean,
): readonly TrackNode[] {
  const automaticCurrent = rebuildTrackTangents(track.nodes, track.closed);
  const automaticById = new Map(automaticCurrent.map((node) => [node.id, node]));
  const currentById = new Map(track.nodes.map((node) => [node.id, node]));
  const authoredById = new Map(nodes.map((node) => [node.id, node]));
  const manualIds = new Set(
    track.nodes
      .filter((node) => {
        const automatic = automaticById.get(node.id);
        return (
          automatic !== undefined &&
          (!sameVector(node.tangentIn, automatic.tangentIn) ||
            !sameVector(node.tangentOut, automatic.tangentOut))
        );
      })
      .map((node) => node.id),
  );
  return Object.freeze(
    rebuildTrackTangents(nodes, closed).map((node, index) => {
      const authored = authoredById.get(node.id);
      const current = currentById.get(node.id);
      if (authored === undefined || current === undefined) {
        return node;
      }
      if (manualIds.has(node.id)) {
        return Object.freeze({
          ...node,
          tangentIn: authored.tangentIn,
          tangentOut: authored.tangentOut,
        });
      }
      const currentIndex = track.nodes.findIndex((candidate) => candidate.id === node.id);
      const currentMoved = !sameVector(current.position, authored.position);
      const previousChanged =
        currentMoved ||
        neighborChanged(track.nodes, nodes, currentIndex, index, -1, track.closed, closed);
      const nextChanged =
        currentMoved ||
        neighborChanged(track.nodes, nodes, currentIndex, index, 1, track.closed, closed);
      return Object.freeze({
        ...node,
        tangentIn: previousChanged ? node.tangentIn : current.tangentIn,
        tangentOut: nextChanged ? node.tangentOut : current.tangentOut,
      });
    }),
  );
}

function neighborChanged(
  currentNodes: readonly TrackNode[],
  nextNodes: readonly TrackNode[],
  currentIndex: number,
  nextIndex: number,
  offset: -1 | 1,
  currentClosed: boolean,
  nextClosed: boolean,
): boolean {
  const currentNeighbor = neighborNode(currentNodes, currentIndex, offset, currentClosed);
  const nextNeighbor = neighborNode(nextNodes, nextIndex, offset, nextClosed);
  return (
    currentNeighbor?.id !== nextNeighbor?.id ||
    (currentNeighbor !== undefined &&
      nextNeighbor !== undefined &&
      !sameVector(currentNeighbor.position, nextNeighbor.position))
  );
}

function neighborNode(
  nodes: readonly TrackNode[],
  index: number,
  offset: -1 | 1,
  closed: boolean,
): TrackNode | undefined {
  if (index < 0 || nodes.length === 0) {
    return undefined;
  }
  const neighborIndex = index + offset;
  if (!closed && (neighborIndex < 0 || neighborIndex >= nodes.length)) {
    return undefined;
  }
  return nodes[(neighborIndex + nodes.length) % nodes.length];
}

function trackDistanceMapper(
  current: TrackDefinition,
  next: TrackDefinition,
): (distance: number) => number {
  const currentLength = Math.max(0.1, trackLength(current));
  const nextLength = Math.max(0.1, trackLength(next));
  const nextIndexById = new Map(next.nodes.map((node, index) => [node.id, index]));
  const anchors = current.nodes
    .map((node, index) => {
      const nextIndex = nextIndexById.get(node.id);
      return nextIndex === undefined
        ? null
        : {
            current: trackDistanceToNode(current, index),
            next: trackDistanceToNode(next, nextIndex),
          };
    })
    .filter((anchor): anchor is { current: number; next: number } => anchor !== null);
  anchors.push({ current: currentLength, next: nextLength });
  anchors.sort((left, right) => left.current - right.current);
  return (distance: number): number => {
    const clamped = clamp(distance, 0, currentLength);
    for (let index = 1; index < anchors.length; index += 1) {
      const before = anchors[index - 1];
      const after = anchors[index];
      if (before === undefined || after === undefined || clamped > after.current) {
        continue;
      }
      const alpha =
        (clamped - before.current) / Math.max(0.000_001, after.current - before.current);
      return before.next + (after.next - before.next) * clamp(alpha, 0, 1);
    }
    return nextLength;
  };
}

function sameVector(left: Vector3Tuple, right: Vector3Tuple): boolean {
  return (
    Math.abs(left[0] - right[0]) < 1e-5 &&
    Math.abs(left[1] - right[1]) < 1e-5 &&
    Math.abs(left[2] - right[2]) < 1e-5
  );
}

function createTrackDefinition(
  points: readonly Vector3Tuple[],
  options: TrackPlacementOptions,
  createId: () => string,
  closed: boolean,
): TrackDefinition {
  const width = clamp(options.width, 1, 100);
  const bankRadians = clamp(options.bankRadians, -Math.PI / 3, Math.PI / 3);
  const nodes = rebuildTrackTangents(
    points.map<TrackNode>((point) => ({
      id: createId(),
      position: [point[0], point[1] + options.elevation, point[2]],
      tangentIn: [0, 0, 0],
      tangentOut: [0, 0, 0],
      width,
      bankRadians,
    })),
  );
  return Object.freeze({
    id: createId(),
    closed,
    surface: "normal",
    materialId: "track.asphalt",
    nodes,
    walls: Object.freeze([]),
    roadRanges: Object.freeze([]),
  });
}

function rebuildTrackTangents(nodes: readonly TrackNode[], closed = false): readonly TrackNode[] {
  return Object.freeze(
    nodes.map((node, index) => {
      const previous = closed
        ? (nodes[(index - 1 + nodes.length) % nodes.length] ?? node)
        : (nodes[Math.max(0, index - 1)] ?? node);
      const next = closed
        ? (nodes[(index + 1) % nodes.length] ?? node)
        : (nodes[Math.min(nodes.length - 1, index + 1)] ?? node);
      const tangent: Vector3Tuple = [
        (next.position[0] - previous.position[0]) / 3,
        (next.position[1] - previous.position[1]) / 3,
        (next.position[2] - previous.position[2]) / 3,
      ];
      return Object.freeze({
        ...node,
        tangentIn: Object.freeze([-tangent[0], -tangent[1], -tangent[2]] as Vector3Tuple),
        tangentOut: Object.freeze(tangent),
      });
    }),
  );
}

export function simplifyTrackStroke(
  points: readonly Vector3Tuple[],
  tolerance = 0.65,
): readonly Vector3Tuple[] {
  const spaced: Vector3Tuple[] = [];
  for (const point of points) {
    const previous = spaced.at(-1);
    if (previous === undefined || distanceBetweenPoints(point, previous) >= 0.35) {
      spaced.push(Object.freeze([...point] as Vector3Tuple));
    }
  }
  const finalPoint = points.at(-1);
  const spacedFinal = spaced.at(-1);
  if (
    finalPoint !== undefined &&
    spacedFinal !== undefined &&
    distanceBetweenPoints(finalPoint, spacedFinal) > 1e-6
  ) {
    spaced.push(Object.freeze([...finalPoint] as Vector3Tuple));
  }
  if (spaced.length <= 2) {
    return Object.freeze(spaced);
  }

  const keep = new Set<number>([0, spaced.length - 1]);
  const ranges: Array<readonly [number, number]> = [[0, spaced.length - 1]];
  const toleranceSquared = Math.max(0.05, tolerance) ** 2;
  while (ranges.length > 0) {
    const range = ranges.pop();
    if (range === undefined) {
      continue;
    }
    const [startIndex, endIndex] = range;
    const start = spaced[startIndex];
    const end = spaced[endIndex];
    if (start === undefined || end === undefined || endIndex - startIndex < 2) {
      continue;
    }
    let furthestIndex = -1;
    let furthestDistanceSquared = 0;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const point = spaced[index];
      if (point === undefined) {
        continue;
      }
      const distanceSquared = pointToSegmentDistanceSquared(point, start, end);
      if (distanceSquared > furthestDistanceSquared) {
        furthestDistanceSquared = distanceSquared;
        furthestIndex = index;
      }
    }
    if (furthestIndex >= 0 && furthestDistanceSquared > toleranceSquared) {
      keep.add(furthestIndex);
      ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }
  return Object.freeze(spaced.filter((_, index) => keep.has(index)));
}

export function shapeTrackElevationTransition(
  points: readonly Vector3Tuple[],
  startElevation: number,
  targetElevation: number,
  trackWidth: number,
): readonly Vector3Tuple[] {
  if (points.length === 0) {
    return Object.freeze([]);
  }
  const cumulative = horizontalPolylineDistances(points);
  const totalLength = cumulative.at(-1) ?? 0;
  const elevationDelta = targetElevation - startElevation;
  if (points.length < 2 || totalLength < 1e-4 || Math.abs(elevationDelta) < 1e-4) {
    return Object.freeze(
      points.map((point) =>
        Object.freeze([point[0], startElevation, point[2]] satisfies Vector3Tuple),
      ),
    );
  }

  // Aim for a gentle grade, but always reach the requested layer by the end
  // of a short stroke. Extra samples make a straight ramp ease in and out too.
  const rampLength = Math.min(
    totalLength,
    Math.max(Math.max(1, trackWidth) * 2.5, Math.abs(elevationDelta) * 5),
  );
  const sampleDistances = [...cumulative];
  for (const progress of [0.2, 0.4, 0.6, 0.8, 1]) {
    sampleDistances.push(rampLength * progress);
  }
  sampleDistances.sort((left, right) => left - right);
  const uniqueDistances = sampleDistances.filter(
    (distance, index) => index === 0 || distance - sampleDistances[index - 1]! > 0.05,
  );
  return Object.freeze(
    uniqueDistances.map((distance) => {
      const point = pointAtHorizontalDistance(points, cumulative, distance);
      const progress = clamp(distance / rampLength, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      return Object.freeze([
        point[0],
        startElevation + elevationDelta * eased,
        point[2],
      ] satisfies Vector3Tuple);
    }),
  );
}

function horizontalPolylineDistances(points: readonly Vector3Tuple[]): readonly number[] {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    distances.push(
      distances[index - 1]! + Math.hypot(current[0] - previous[0], current[2] - previous[2]),
    );
  }
  return distances;
}

function pointAtHorizontalDistance(
  points: readonly Vector3Tuple[],
  cumulative: readonly number[],
  distance: number,
): Vector3Tuple {
  const clampedDistance = clamp(distance, 0, cumulative.at(-1) ?? 0);
  for (let index = 1; index < points.length; index += 1) {
    const segmentEnd = cumulative[index] ?? 0;
    if (clampedDistance > segmentEnd && index < points.length - 1) {
      continue;
    }
    const segmentStart = cumulative[index - 1] ?? 0;
    const start = points[index - 1]!;
    const end = points[index]!;
    const alpha = clamp(
      (clampedDistance - segmentStart) / Math.max(1e-6, segmentEnd - segmentStart),
      0,
      1,
    );
    return [
      start[0] + (end[0] - start[0]) * alpha,
      start[1] + (end[1] - start[1]) * alpha,
      start[2] + (end[2] - start[2]) * alpha,
    ];
  }
  return points.at(-1) ?? [0, 0, 0];
}

function smoothTrackExtension(
  track: TrackDefinition,
  extension: readonly Vector3Tuple[],
): readonly Vector3Tuple[] {
  const previousNode = track.nodes.at(-2);
  const lastNode = track.nodes.at(-1);
  const firstTarget = extension[1];
  if (previousNode === undefined || lastNode === undefined || firstTarget === undefined) {
    return extension;
  }
  const exitX = lastNode.position[0] - previousNode.position[0];
  const exitZ = lastNode.position[2] - previousNode.position[2];
  const targetX = firstTarget[0] - lastNode.position[0];
  const targetZ = firstTarget[2] - lastNode.position[2];
  const exitLength = Math.hypot(exitX, exitZ);
  const targetLength = Math.hypot(targetX, targetZ);
  if (exitLength < 1e-4 || targetLength < 1.25) {
    return extension;
  }
  const alignment = (exitX * targetX + exitZ * targetZ) / (exitLength * targetLength);
  if (alignment >= 0.96) {
    return extension;
  }
  const strokeLength = polylineLength(extension);
  const transitionLength = Math.min(
    Math.max(1.5, lastNode.width * 1.1),
    Math.max(targetLength * 0.65, strokeLength * 0.22),
  );
  const transition: Vector3Tuple = Object.freeze([
    lastNode.position[0] + (exitX / exitLength) * transitionLength,
    pointAtHorizontalDistance(
      extension,
      horizontalPolylineDistances(extension),
      transitionLength,
    )[1],
    lastNode.position[2] + (exitZ / exitLength) * transitionLength,
  ]);
  const remaining = extension
    .slice(1)
    .filter((point) => distanceBetweenPoints(point, lastNode.position) >= transitionLength * 0.8);
  return Object.freeze([extension[0] ?? lastNode.position, transition, ...remaining]);
}

function orientTrackNodes(nodes: readonly TrackNode[], reverse: boolean): readonly TrackNode[] {
  if (!reverse) {
    return nodes;
  }
  return Object.freeze(
    [...nodes].reverse().map((node) =>
      Object.freeze({
        ...node,
        tangentIn: Object.freeze([
          -node.tangentOut[0],
          -node.tangentOut[1],
          -node.tangentOut[2],
        ] satisfies Vector3Tuple),
        tangentOut: Object.freeze([
          -node.tangentIn[0],
          -node.tangentIn[1],
          -node.tangentIn[2],
        ] satisfies Vector3Tuple),
      }),
    ),
  );
}

function orientTrackRoadRanges(
  ranges: readonly TrackRoadRange[],
  totalLength: number,
  reverse: boolean,
): readonly TrackRoadRange[] {
  if (!reverse) {
    return ranges;
  }
  return Object.freeze(
    [...ranges].reverse().map((range) =>
      Object.freeze({
        ...range,
        startDistance: totalLength - range.endDistance,
        endDistance: totalLength - range.startDistance,
      }),
    ),
  );
}

function smoothTrackApproach(
  target: TrackDefinition,
  connection: readonly Vector3Tuple[],
): readonly Vector3Tuple[] {
  const firstNode = target.nodes[0];
  const secondNode = target.nodes[1];
  const beforeEnd = connection.at(-2);
  if (firstNode === undefined || secondNode === undefined || beforeEnd === undefined) {
    return connection;
  }
  const forwardX = secondNode.position[0] - firstNode.position[0];
  const forwardZ = secondNode.position[2] - firstNode.position[2];
  const incomingX = firstNode.position[0] - beforeEnd[0];
  const incomingZ = firstNode.position[2] - beforeEnd[2];
  const forwardLength = Math.hypot(forwardX, forwardZ);
  const incomingLength = Math.hypot(incomingX, incomingZ);
  if (forwardLength < 1e-4 || incomingLength < 1e-4) {
    return connection;
  }
  const alignment =
    (forwardX * incomingX + forwardZ * incomingZ) / (forwardLength * incomingLength);
  if (alignment >= 0.96) {
    return connection;
  }
  const approachLength = Math.min(
    Math.max(1.5, firstNode.width * 1.1),
    Math.max(incomingLength * 0.65, polylineLength(connection) * 0.22),
  );
  const cumulative = horizontalPolylineDistances(connection);
  const approach: Vector3Tuple = Object.freeze([
    firstNode.position[0] - (forwardX / forwardLength) * approachLength,
    pointAtHorizontalDistance(
      connection,
      cumulative,
      Math.max(0, (cumulative.at(-1) ?? 0) - approachLength),
    )[1],
    firstNode.position[2] - (forwardZ / forwardLength) * approachLength,
  ]);
  const withoutEnd = [...connection.slice(0, -1)];
  while (
    withoutEnd.length > 1 &&
    distanceBetweenPoints(withoutEnd.at(-1)!, firstNode.position) < approachLength * 0.8
  ) {
    withoutEnd.pop();
  }
  withoutEnd.push(approach);
  return Object.freeze([...withoutEnd, firstNode.position]);
}

function smoothTrackClosure(
  track: TrackDefinition,
  connection: readonly Vector3Tuple[],
): readonly Vector3Tuple[] {
  const smoothed = smoothTrackExtension(track, connection);
  return smoothTrackApproach(track, smoothed);
}

function polylineLength(points: readonly Vector3Tuple[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous !== undefined && current !== undefined) {
      length += distanceBetweenPoints(previous, current);
    }
  }
  return length;
}

function pointToSegmentDistanceSquared(
  point: Vector3Tuple,
  start: Vector3Tuple,
  end: Vector3Tuple,
): number {
  const segmentX = end[0] - start[0];
  const segmentY = end[1] - start[1];
  const segmentZ = end[2] - start[2];
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;
  if (segmentLengthSquared < 1e-8) {
    return distanceBetweenPoints(point, start) ** 2;
  }
  const projection = clamp(
    ((point[0] - start[0]) * segmentX +
      (point[1] - start[1]) * segmentY +
      (point[2] - start[2]) * segmentZ) /
      segmentLengthSquared,
    0,
    1,
  );
  const deltaX = point[0] - (start[0] + segmentX * projection);
  const deltaY = point[1] - (start[1] + segmentY * projection);
  const deltaZ = point[2] - (start[2] + segmentZ * projection);
  return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
}

function distanceBetweenPoints(left: Vector3Tuple, right: Vector3Tuple): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function trackDistanceToNode(track: TrackDefinition, nodeIndex: number): number {
  let distance = 0;
  for (let index = 1; index <= nodeIndex; index += 1) {
    const previous = track.nodes[index - 1];
    const current = track.nodes[index];
    if (previous !== undefined && current !== undefined) {
      distance += distanceBetweenPoints(previous.position, current.position);
    }
  }
  return distance;
}

function clipTrackWalls(
  walls: readonly TrackWallRange[],
  sourceStart: number,
  sourceEnd: number,
  targetOffset: number,
  preserveIds: boolean,
  createId: () => string,
): readonly TrackWallRange[] {
  return Object.freeze(
    walls.flatMap((wall) => {
      const start = Math.max(sourceStart, wall.startDistance);
      const end = Math.min(sourceEnd, wall.endDistance);
      if (end - start < 0.01) {
        return [];
      }
      return [
        Object.freeze({
          ...wall,
          id: preserveIds ? wall.id : createId(),
          startDistance: start - targetOffset,
          endDistance: end - targetOffset,
        }),
      ];
    }),
  );
}

function clipTrackRoadRanges(
  ranges: readonly TrackRoadRange[],
  sourceStart: number,
  sourceEnd: number,
  targetOffset: number,
  preserveIds: boolean,
  createId: () => string,
): readonly TrackRoadRange[] {
  return Object.freeze(
    ranges.flatMap((range) => {
      const start = Math.max(sourceStart, range.startDistance);
      const end = Math.min(sourceEnd, range.endDistance);
      if (end - start < 0.01) {
        return [];
      }
      return [
        Object.freeze({
          ...range,
          id: preserveIds ? range.id : createId(),
          startDistance: start - targetOffset,
          endDistance: end - targetOffset,
        }),
      ];
    }),
  );
}

function scaleTrackRoadRanges(
  ranges: readonly TrackRoadRange[],
  scale: number,
): readonly TrackRoadRange[] {
  return Object.freeze(
    ranges.map((range) =>
      Object.freeze({
        ...range,
        startDistance: range.startDistance * scale,
        endDistance: range.endDistance * scale,
      }),
    ),
  );
}

function editTrackRoadInterval(
  ranges: readonly TrackRoadRange[],
  startDistance: number,
  endDistance: number,
  edit: TrackRoadPropertiesEdit,
  createId: () => string,
): readonly TrackRoadRange[] {
  const next: TrackRoadRange[] = [];
  let reusableId: string | null = null;
  for (const range of ranges) {
    const intersectionStart = Math.max(range.startDistance, startDistance);
    const intersectionEnd = Math.min(range.endDistance, endDistance);
    if (intersectionEnd - intersectionStart < 0.01) {
      next.push(range);
      continue;
    }
    reusableId ??= range.id;
    if (intersectionStart - range.startDistance >= 0.01) {
      next.push(Object.freeze({ ...range, endDistance: intersectionStart }));
    }
    if (range.endDistance - intersectionEnd >= 0.01) {
      next.push(
        Object.freeze({
          ...range,
          id: createId(),
          startDistance: intersectionEnd,
        }),
      );
    }
  }
  next.push(
    Object.freeze({
      id: reusableId ?? createId(),
      startDistance,
      endDistance,
      ...edit,
    }),
  );
  return mergeCompatibleTrackRoadRanges(next);
}

function mergeCompatibleTrackRoadRanges(
  ranges: readonly TrackRoadRange[],
): readonly TrackRoadRange[] {
  const sorted = [...ranges].sort((left, right) => left.startDistance - right.startDistance);
  const merged: TrackRoadRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous.width === range.width &&
      previous.bankRadians === range.bankRadians &&
      previous.surface === range.surface &&
      previous.materialId === range.materialId &&
      (previous.surfaceStrength ?? 1) === (range.surfaceStrength ?? 1) &&
      (previous.surfaceCooldownSeconds ?? defaultTrackSurfaceCooldownSeconds(previous.surface)) ===
        (range.surfaceCooldownSeconds ?? defaultTrackSurfaceCooldownSeconds(range.surface)) &&
      range.startDistance <= previous.endDistance + 0.01
    ) {
      merged[merged.length - 1] = Object.freeze({
        ...previous,
        endDistance: Math.max(previous.endDistance, range.endDistance),
      });
    } else {
      merged.push(Object.freeze(range));
    }
  }
  return Object.freeze(merged);
}

function sameTrackRoadRanges(
  left: readonly TrackRoadRange[],
  right: readonly TrackRoadRange[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((range, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      range.id === candidate.id &&
      range.startDistance === candidate.startDistance &&
      range.endDistance === candidate.endDistance &&
      range.width === candidate.width &&
      range.bankRadians === candidate.bankRadians &&
      range.surface === candidate.surface &&
      range.materialId === candidate.materialId &&
      (range.surfaceStrength ?? 1) === (candidate.surfaceStrength ?? 1) &&
      (range.surfaceCooldownSeconds ?? defaultTrackSurfaceCooldownSeconds(range.surface)) ===
        (candidate.surfaceCooldownSeconds ?? defaultTrackSurfaceCooldownSeconds(candidate.surface))
    );
  });
}

function paintTrackWallInterval(
  walls: readonly TrackWallRange[],
  sides: readonly ("left" | "right")[],
  startDistance: number,
  endDistance: number,
  createId: () => string,
): readonly TrackWallRange[] {
  const selectedSides = new Set(sides);
  const next = walls.filter((wall) => !selectedSides.has(wall.side));
  for (const side of sides) {
    const candidates = [
      ...walls.filter((wall) => wall.side === side),
      {
        id: createId(),
        side,
        startDistance,
        endDistance,
        height: 1.2,
        thickness: 0.2,
        styleId: "wall.clean",
      } satisfies TrackWallRange,
    ].sort((left, right) => left.startDistance - right.startDistance);
    const merged: TrackWallRange[] = [];
    for (const candidate of candidates) {
      const previous = merged.at(-1);
      const compatible =
        previous !== undefined &&
        previous.styleId === candidate.styleId &&
        previous.height === candidate.height &&
        previous.thickness === candidate.thickness;
      if (compatible && candidate.startDistance <= previous.endDistance + 0.05) {
        merged[merged.length - 1] = Object.freeze({
          ...previous,
          endDistance: Math.max(previous.endDistance, candidate.endDistance),
        });
      } else {
        merged.push(Object.freeze(candidate));
      }
    }
    next.push(...merged);
  }
  return freezeSortedTrackWalls(next);
}

function eraseTrackWallInterval(
  walls: readonly TrackWallRange[],
  sides: readonly ("left" | "right")[],
  startDistance: number,
  endDistance: number,
  createId: () => string,
): readonly TrackWallRange[] {
  const selectedSides = new Set(sides);
  const next: TrackWallRange[] = [];
  for (const wall of walls) {
    if (
      !selectedSides.has(wall.side) ||
      endDistance <= wall.startDistance ||
      startDistance >= wall.endDistance
    ) {
      next.push(wall);
      continue;
    }
    const keepsLeft = startDistance - wall.startDistance >= 0.01;
    const keepsRight = wall.endDistance - endDistance >= 0.01;
    if (keepsLeft) {
      next.push(
        Object.freeze({
          ...wall,
          endDistance: Math.min(startDistance, wall.endDistance),
        }),
      );
    }
    if (keepsRight) {
      next.push(
        Object.freeze({
          ...wall,
          id: keepsLeft ? createId() : wall.id,
          startDistance: Math.max(endDistance, wall.startDistance),
        }),
      );
    }
  }
  return freezeSortedTrackWalls(next);
}

function editTrackWallIntervalProperties(
  walls: readonly TrackWallRange[],
  sides: readonly ("left" | "right")[],
  startDistance: number,
  endDistance: number,
  edit: TrackWallPropertiesEdit,
  createId: () => string,
): readonly TrackWallRange[] {
  const selectedSides = new Set(sides);
  const next: TrackWallRange[] = [];
  for (const wall of walls) {
    const intersectionStart = Math.max(wall.startDistance, startDistance);
    const intersectionEnd = Math.min(wall.endDistance, endDistance);
    if (!selectedSides.has(wall.side) || intersectionEnd - intersectionStart < 0.01) {
      next.push(wall);
      continue;
    }
    const keepsBefore = intersectionStart - wall.startDistance >= 0.01;
    const keepsAfter = wall.endDistance - intersectionEnd >= 0.01;
    if (keepsBefore) {
      next.push(Object.freeze({ ...wall, endDistance: intersectionStart }));
    }
    next.push(
      Object.freeze({
        ...wall,
        id: keepsBefore ? createId() : wall.id,
        startDistance: intersectionStart,
        endDistance: intersectionEnd,
        ...edit,
      }),
    );
    if (keepsAfter) {
      next.push(
        Object.freeze({
          ...wall,
          id: createId(),
          startDistance: intersectionEnd,
        }),
      );
    }
  }
  return mergeCompatibleTrackWalls(next);
}

function mergeCompatibleTrackWalls(walls: readonly TrackWallRange[]): readonly TrackWallRange[] {
  const sorted = [...walls].sort(
    (left, right) =>
      left.side.localeCompare(right.side) || left.startDistance - right.startDistance,
  );
  const merged: TrackWallRange[] = [];
  for (const wall of sorted) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous.side === wall.side &&
      previous.styleId === wall.styleId &&
      previous.height === wall.height &&
      previous.thickness === wall.thickness &&
      wall.startDistance <= previous.endDistance + 0.01
    ) {
      merged[merged.length - 1] = Object.freeze({
        ...previous,
        endDistance: Math.max(previous.endDistance, wall.endDistance),
      });
    } else {
      merged.push(Object.freeze(wall));
    }
  }
  return freezeSortedTrackWalls(merged);
}

function freezeSortedTrackWalls(walls: readonly TrackWallRange[]): readonly TrackWallRange[] {
  return Object.freeze(
    [...walls]
      .sort(
        (left, right) =>
          left.startDistance - right.startDistance || left.side.localeCompare(right.side),
      )
      .map((wall) => Object.freeze(wall)),
  );
}

function sameTrackWalls(
  left: readonly TrackWallRange[],
  right: readonly TrackWallRange[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((wall, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      wall.id === candidate.id &&
      wall.side === candidate.side &&
      wall.startDistance === candidate.startDistance &&
      wall.endDistance === candidate.endDistance &&
      wall.height === candidate.height &&
      wall.thickness === candidate.thickness &&
      wall.styleId === candidate.styleId
    );
  });
}

function rotateTrackWallsAtCut(
  walls: readonly TrackWallRange[],
  cutDistance: number,
  totalLength: number,
  createId: () => string,
): readonly TrackWallRange[] {
  const rotated: TrackWallRange[] = [];
  for (const wall of walls) {
    const start = clamp(wall.startDistance, 0, totalLength);
    const end = clamp(wall.endDistance, start, totalLength);
    if (start <= 0.01 && end >= totalLength - 0.01) {
      rotated.push({ ...wall, startDistance: 0, endDistance: totalLength });
      continue;
    }
    const afterCutStart = Math.max(start, cutDistance);
    const afterCutEnd = Math.min(end, totalLength);
    if (afterCutEnd - afterCutStart >= 0.01) {
      rotated.push({
        ...wall,
        startDistance: afterCutStart - cutDistance,
        endDistance: afterCutEnd - cutDistance,
      });
    }
    const beforeCutStart = Math.max(0, start);
    const beforeCutEnd = Math.min(end, cutDistance);
    if (beforeCutEnd - beforeCutStart >= 0.01) {
      rotated.push({
        ...wall,
        id: rotated.some((candidate) => candidate.id === wall.id) ? createId() : wall.id,
        startDistance: totalLength - cutDistance + beforeCutStart,
        endDistance: totalLength - cutDistance + beforeCutEnd,
      });
    }
  }
  return Object.freeze(rotated.map((wall) => Object.freeze(wall)));
}

function rotateTrackRoadRangesAtCut(
  ranges: readonly TrackRoadRange[],
  cutDistance: number,
  totalLength: number,
  createId: () => string,
): readonly TrackRoadRange[] {
  const rotated: TrackRoadRange[] = [];
  for (const range of ranges) {
    const start = clamp(range.startDistance, 0, totalLength);
    const end = clamp(range.endDistance, start, totalLength);
    const afterStart = Math.max(start, cutDistance);
    const afterEnd = Math.min(end, totalLength);
    if (afterEnd - afterStart >= 0.01) {
      rotated.push({
        ...range,
        startDistance: afterStart - cutDistance,
        endDistance: afterEnd - cutDistance,
      });
    }
    const beforeStart = Math.max(0, start);
    const beforeEnd = Math.min(end, cutDistance);
    if (beforeEnd - beforeStart >= 0.01) {
      rotated.push({
        ...range,
        id: rotated.some((candidate) => candidate.id === range.id) ? createId() : range.id,
        startDistance: totalLength - cutDistance + beforeStart,
        endDistance: totalLength - cutDistance + beforeEnd,
      });
    }
  }
  return mergeCompatibleTrackRoadRanges(rotated);
}

export function trackLength(track: TrackDefinition): number {
  let length = 0;
  for (let index = 1; index < track.nodes.length; index += 1) {
    const previous = track.nodes[index - 1];
    const current = track.nodes[index];
    if (previous !== undefined && current !== undefined) {
      length += Math.hypot(
        current.position[0] - previous.position[0],
        current.position[1] - previous.position[1],
        current.position[2] - previous.position[2],
      );
    }
  }
  if (track.closed) {
    const first = track.nodes[0];
    const last = track.nodes.at(-1);
    if (first !== undefined && last !== undefined) {
      length += distanceBetweenPoints(first.position, last.position);
    }
  }
  return length;
}

function applyEntityTransformEdit(entity: MapEntity, edit: EntityTransformEdit): MapEntity {
  let nextPosition = edit.position ?? entity.transform.position;
  const nextRotation =
    edit.yawRadians === undefined
      ? entity.transform.rotation
      : quaternionFromYaw(normalizeRadians(edit.yawRadians));
  let properties = entity.properties;
  if (edit.primarySize !== undefined) {
    properties = resizedEditorAssetProperties(entity, edit.primarySize);
    if (edit.position === undefined) {
      const previousDimensions = editorAssetEntityDimensions(entity);
      const nextDimensions = editorAssetEntityDimensions({ ...entity, properties });
      if (previousDimensions !== null && nextDimensions !== null) {
        nextPosition = Object.freeze([
          nextPosition[0],
          nextPosition[1] + nextDimensions.groundOffset - previousDimensions.groundOffset,
          nextPosition[2],
        ] satisfies Vector3Tuple);
      }
    }
  }
  return Object.freeze({
    ...entity,
    transform: Object.freeze({
      ...entity.transform,
      position: Object.freeze([...nextPosition] as Vector3Tuple),
      rotation: nextRotation,
    }),
    properties,
  });
}

function quaternionFromYaw(yawRadians: number): QuaternionTuple {
  const half = yawRadians / 2;
  return Object.freeze([0, Math.sin(half), 0, Math.cos(half)]);
}

function normalizeRadians(value: number): number {
  const turn = Math.PI * 2;
  return ((((value + Math.PI) % turn) + turn) % turn) - Math.PI;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function snap(value: number, increment: number): number {
  return increment > 0 ? Math.round(value / increment) * increment : value;
}
