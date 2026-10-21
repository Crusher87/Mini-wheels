import { AudioService } from "../audio/AudioService";
import { SIMULATION_CONFIG } from "../config/runtime-defaults";
import { RuntimePerformanceMonitor } from "../dev/RuntimePerformanceMonitor";
import { editorAssetManifest } from "../editor/EditorAssetCatalog";
import {
  EditorPreviewSession,
  type EditorCameraSnapshot,
  type EditorPickTarget,
} from "../editor/EditorPreviewSession";
import {
  EditorSession,
  floorDragPlacement,
  primarySize,
  readYaw,
  shapeTrackElevationTransition,
  trackLength,
  type EditorAssetId,
  type EntityTransformEdit,
  type PlacementOptions,
  type TrackEndpointSide,
  type TrackMaterialId,
  type TrackPlacementOptions,
  type TrackRoadPropertiesEdit,
  type TrackTangentSide,
  type TrackWallBrushAction,
  type TrackWallBrushSide,
  type TrackWallPropertiesEdit,
  type TrackWallStyleId,
} from "../editor/EditorSession";
import { InputHub, type MutableLogicalAxes } from "../input/InputHub";
import { compileMapDocument, type RuntimeMapBlueprint } from "../maps/MapCompiler";
import { encodeMapDocument } from "../maps/MapCodec";
import {
  createStarterMapDocument,
  defaultTrackSurfaceCooldownSeconds,
  type InteractionAction,
  type InteractionCondition,
  type InteractionEvent,
  type MapDocument,
  type MapEntity,
  type TrackDefinition,
  type Vector3Tuple,
} from "../maps/MapDocument";
import { MapRepository, type MapRecord, type PrefabRecord } from "../maps/MapRepository";
import { initializeRapier, type RapierModule } from "../physics/rapier-init";
import { RenderSystem } from "../render/RenderSystem";
import { SettingsService } from "../persistence/SettingsService";
import type { GameSettings } from "../persistence/schema";
import {
  UiController,
  type EditorEnvironmentView,
  type EditorSnapSettings,
  type EditorTransformMode,
} from "../ui/UiController";
import { WorldSession } from "../world/WorldSession";
import { AppState, type AppState as AppStateValue } from "./AppState";
import { FixedStepLoop } from "./FixedStepLoop";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function horizontalDistanceBetween(left: Vector3Tuple, right: Vector3Tuple): number {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function entityNumberProperty(entity: MapEntity, key: string, fallback: number): number {
  const value = entity.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function selectedTrackRange(
  track: TrackDefinition,
  firstDistance: number,
  secondDistance: number,
  side: TrackWallBrushSide,
): EditorSelectedTrackRange {
  const length = Math.max(0.1, trackLength(track));
  let startDistance = Math.min(Math.max(Math.min(firstDistance, secondDistance), 0), length);
  let endDistance = Math.min(Math.max(Math.max(firstDistance, secondDistance), 0), length);
  if (endDistance - startDistance < 0.25) {
    const center = (startDistance + endDistance) / 2;
    startDistance = Math.max(0, center - 0.5);
    endDistance = Math.min(length, center + 0.5);
  }
  return Object.freeze({ trackId: track.id, startDistance, endDistance, side });
}

function wallStyleForInspector(styleId: string): TrackWallStyleId {
  switch (styleId) {
    case "wall.safety-cyan":
    case "wall.sunset":
    case "wall.neon":
    case "wall.guardrail":
      return styleId;
    default:
      return "wall.clean";
  }
}

function trackMaterialForInspector(materialId: string): TrackMaterialId {
  switch (materialId) {
    case "track.concrete":
    case "track.dirt":
    case "track.ice":
    case "track.neon":
    case "track.racing-stripes":
    case "track.checker":
    case "track.arrows":
    case "track.rainbow":
    case "track.sunset":
      return materialId;
    default:
      return "track.asphalt";
  }
}

function baseTrackShapeAtDistance(
  track: TrackDefinition,
  distance: number,
): { readonly width: number; readonly bankRadians: number } {
  let travelled = 0;
  const segmentCount = track.closed ? track.nodes.length : track.nodes.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const first = track.nodes[index];
    const second = track.nodes[(index + 1) % track.nodes.length];
    if (first === undefined || second === undefined) {
      continue;
    }
    const segmentLength = Math.hypot(
      second.position[0] - first.position[0],
      second.position[1] - first.position[1],
      second.position[2] - first.position[2],
    );
    if (distance <= travelled + segmentLength || index === segmentCount - 1) {
      const alpha = Math.min(
        1,
        Math.max(0, (distance - travelled) / Math.max(0.001, segmentLength)),
      );
      return {
        width: first.width + (second.width - first.width) * alpha,
        bankRadians: first.bankRadians + (second.bankRadians - first.bankRadians) * alpha,
      };
    }
    travelled += segmentLength;
  }
  const fallback = track.nodes[0];
  return { width: fallback?.width ?? 6, bankRadians: fallback?.bankRadians ?? 0 };
}

interface EditorCameraGesture {
  readonly pointerId: number;
  readonly mode: "orbit" | "pan";
  x: number;
  y: number;
}

interface EditorObjectGesture {
  readonly pointerId: number;
  mode: "pending" | "box" | "transform";
  readonly hitEntityId: string | null;
  readonly additive: boolean;
  readonly startX: number;
  readonly startY: number;
  x: number;
  y: number;
  lastWorldPoint: Vector3Tuple | null;
  accumulated: number;
  applied: number;
  accumulatedX: number;
  accumulatedZ: number;
  appliedX: number;
  appliedZ: number;
}

interface EditorTrackGesture {
  readonly pointerId: number;
  readonly mode: "track";
  readonly points: Vector3Tuple[];
  readonly extendingTrackId: string | null;
  readonly extendingSide: TrackEndpointSide | null;
  targetElevation: number;
  connectingEndpoint: EditorTrackEndpoint | null;
}

interface EditorTrackEndpoint {
  readonly track: TrackDefinition;
  readonly position: Vector3Tuple;
  readonly side: TrackEndpointSide;
}

interface EditorTrackNodeGesture {
  readonly pointerId: number;
  readonly mode: "track-node";
  readonly trackId: string;
  readonly nodeId: string;
  readonly startPosition: Vector3Tuple;
  lastWorldPoint: Vector3Tuple | null;
  accumulatedX: number;
  accumulatedZ: number;
}

interface EditorTrackTangentGesture {
  readonly pointerId: number;
  readonly mode: "track-tangent";
  readonly trackId: string;
  readonly nodeId: string;
  readonly side: TrackTangentSide;
  readonly startTangent: Vector3Tuple;
  readonly startClientY: number;
  lastWorldPoint: Vector3Tuple | null;
  accumulatedX: number;
  accumulatedZ: number;
}

interface EditorFloorGesture {
  readonly pointerId: number;
  readonly mode: "floor";
  readonly startX: number;
  readonly startY: number;
  readonly startPoint: Vector3Tuple;
  placementPoint: Vector3Tuple;
  options: PlacementOptions;
  dragged: boolean;
}

interface EditorFreeformFloorGesture {
  readonly pointerId: number;
  readonly mode: "freeform-floor";
  readonly points: Vector3Tuple[];
  readonly elevation: number;
}

interface EditorWallRangeGesture {
  readonly pointerId: number;
  readonly mode: "wall-range";
  readonly trackId: string;
  readonly action: TrackWallBrushAction | "select";
  readonly side: TrackWallBrushSide;
  readonly startDistance: number;
  endDistance: number;
}

interface EditorSelectedTrackRange {
  readonly trackId: string;
  readonly startDistance: number;
  readonly endDistance: number;
  readonly side: TrackWallBrushSide;
}

export interface GameAppDebugSnapshot {
  readonly state: AppStateValue;
  readonly sessionGeneration: number;
  readonly activeWorldSessionRootCount: number;
  readonly markerElementCount: number;
}

export class GameApp {
  private state: AppStateValue = AppState.Boot;
  private readonly settingsService = new SettingsService(GameApp.safeStorage());
  private readonly ui = new UiController();
  private readonly audio = new AudioService();
  private readonly input = new InputHub();
  private readonly playerAxes: MutableLogicalAxes[] = Array.from({ length: 10 }, () => ({
    horizontal: 0,
    vertical: 0,
    brake: false,
  }));
  private readonly engineSpeeds = new Float32Array(10);
  private readonly engineThrottles = new Float32Array(10);
  private readonly engineAudioStates = Array.from({ length: 10 }, () => ({
    active: false,
    speedNormalized: 0,
    throttle: 0,
    pan: 0,
  }));
  private readonly fixedStep = new FixedStepLoop({
    fixedDeltaSeconds: SIMULATION_CONFIG.fixedTimestepSeconds,
    maxFrameDeltaSeconds: SIMULATION_CONFIG.maxFrameDeltaSeconds,
    maxStepsPerFrame: SIMULATION_CONFIG.maxPhysicsStepsPerRender,
  });
  private readonly performanceMonitor = new RuntimePerformanceMonitor();
  private readonly mapRepository = new MapRepository();

  private renderSystem: RenderSystem | undefined;
  private rapier: RapierModule | undefined;
  private worldSession: WorldSession | undefined;
  private editorPreview: EditorPreviewSession | undefined;
  private editorSession: EditorSession | undefined;
  private editorMap: MapRecord | undefined;
  private editorTool: EditorAssetId | null = null;
  private editorTrackToolActive = false;
  private editorTrackElevationExplicit = false;
  private editorSelectedTrackId: string | null = null;
  private editorSelectedTrackNodeId: string | null = null;
  private editorWallBrush: Readonly<{
    action: TrackWallBrushAction;
    side: TrackWallBrushSide;
  }> | null = null;
  private editorTrackRangeSelectActive = false;
  private editorSelectedTrackRange: EditorSelectedTrackRange | null = null;
  private editorTrackOptions: TrackPlacementOptions = {
    width: 6,
    elevation: 0,
    bankRadians: 0,
  };
  private editorPlacementOptions: PlacementOptions = {
    elevation: 0,
    primarySize: 6,
    yawRadians: 0,
  };
  private editorTransformMode: EditorTransformMode = "move";
  private editorSnapSettings: EditorSnapSettings = {
    gridEnabled: false,
    gridSize: 1,
    angleEnabled: false,
    surfaceEnabled: true,
  };
  private editorClipboard: readonly MapEntity[] = Object.freeze([]);
  private editorPrefabs: readonly PrefabRecord[] = Object.freeze([]);
  private editorPrefabTool: PrefabRecord | undefined;
  private editorPrefabYaw = 0;
  private editorPlacementSurfaceElevation = 0;
  private editorTutorialStep = 0;
  private editorPointerGesture:
    | EditorCameraGesture
    | EditorObjectGesture
    | EditorTrackGesture
    | EditorTrackNodeGesture
    | EditorTrackTangentGesture
    | EditorFloorGesture
    | EditorFreeformFloorGesture
    | EditorWallRangeGesture
    | undefined;
  private editorLastWorldPoint: Vector3Tuple | null = null;
  private editorAutosaveTimeout: number | undefined;
  private editorRecoveryGeneration = 0;
  private editorRecoveryWrite: Promise<void> = Promise.resolve();
  private editorWheelCommitTimeout: number | undefined;
  private playtestBlueprint: RuntimeMapBlueprint | undefined;
  private normalMapPlay = false;
  private editorPlaytestAutosavePending = false;
  private editorCameraSnapshot: EditorCameraSnapshot | undefined;
  private animationFrame: number | undefined;
  private uninstallTestApi: (() => void) | undefined;
  private previousNow = performance.now();
  private sessionGeneration = 0;
  /** Session generation whose race results have already been shown. */
  private raceResultsGeneration = -1;
  private disposed = false;
  private memoryStorageWarningShown = false;
  private storagePersistenceChecked = false;
  private storageQuotaWarningShown = false;

  private readonly runFixedStep = (): void => {
    const session = this.worldSession;
    if (session === undefined) {
      return;
    }
    for (let index = 0; index < session.playerCount; index += 1) {
      const axes = this.playerAxes[index];
      if (axes !== undefined) {
        this.input.writePlayerAxes(index, axes);
      }
    }
    const startedAt = performance.now();
    session.step(this.playerAxes);
    const audioVehicleCount = session.writeVehicleAudioTelemetry(
      this.engineSpeeds,
      this.engineThrottles,
    );
    for (let index = 0; index < this.engineAudioStates.length; index += 1) {
      const audioState = this.engineAudioStates[index];
      if (audioState === undefined) {
        continue;
      }
      audioState.active = index < audioVehicleCount;
      audioState.speedNormalized = this.engineSpeeds[index] ?? 0;
      audioState.throttle = this.engineThrottles[index] ?? 0;
      this.audio.updateEngineVoice(index, audioState);
    }
    this.performanceMonitor.recordPhysicsStep(performance.now() - startedAt);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (
      this.state === AppState.Editing &&
      !GameApp.isEditableTarget(event.target) &&
      this.handleEditorKeyboardShortcut(event)
    ) {
      return;
    }
    if (
      (event.code === "Escape" || event.code === "KeyP") &&
      (this.state === AppState.Playing || this.state === AppState.Paused)
    ) {
      event.preventDefault();
      this.togglePause();
    }
  };

  private readonly onEditorPointerDown = (event: PointerEvent): void => {
    if (
      this.state !== AppState.Editing ||
      this.editorPreview === undefined ||
      this.editorSession === undefined
    ) {
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("button, input, select, textarea, a, .editor-zoom-control") !== null
    ) {
      return;
    }
    const canvasRect = GameApp.canvas().getBoundingClientRect();
    const pressedTarget =
      event.button === 0
        ? this.editorPreview.pickTarget(event.clientX, event.clientY, canvasRect)
        : null;
    this.editorPreview.setHoveredTarget(null);
    this.ui.setEditorHoverLabel(null);
    const viewport = GameApp.editorViewport();
    if (event.button === 2 || event.button === 1) {
      event.preventDefault();
      this.editorPointerGesture = {
        pointerId: event.pointerId,
        mode: event.button === 2 ? "orbit" : "pan",
        x: event.clientX,
        y: event.clientY,
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (
      (this.editorWallBrush !== null || this.editorTrackRangeSelectActive) &&
      this.editorSelectedTrackId !== null
    ) {
      const hit = this.editorPreview.pickTrackDistance(
        event.clientX,
        event.clientY,
        canvasRect,
        this.editorSelectedTrackId,
      );
      const track = this.selectedTrack();
      if (hit === null || track === undefined) {
        this.ui.toast("Press and drag directly over the selected road.");
        return;
      }
      this.editorPointerGesture = {
        pointerId: event.pointerId,
        mode: "wall-range",
        trackId: hit.trackId,
        action: this.editorTrackRangeSelectActive ? "select" : this.editorWallBrush!.action,
        side: this.editorTrackRangeSelectActive ? "both" : this.editorWallBrush!.side,
        startDistance: hit.distance,
        endDistance: hit.distance,
      };
      this.editorPreview.showTrackRangePreview(
        track,
        hit.distance,
        hit.distance,
        this.editorTrackRangeSelectActive ? "both" : this.editorWallBrush!.side,
        this.editorTrackRangeSelectActive ? "select" : this.editorWallBrush!.action,
      );
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    if (this.editorTrackToolActive) {
      const point = this.editorPreview.pointOnBuildPlane(event.clientX, event.clientY, canvasRect);
      if (point === null) {
        return;
      }
      const endpoint =
        this.trackEndpointFromPick(pressedTarget) ??
        this.trackEndpointAtScreen(event.clientX, event.clientY, canvasRect, point);
      if (endpoint !== null && !this.editorTrackElevationExplicit) {
        this.editorTrackOptions = {
          ...this.editorTrackOptions,
          elevation: endpoint.position[1],
        };
      }
      const snappedPoint = endpoint?.position ?? this.snapPlacementPoint(point);
      const extendingTrackId = endpoint?.track.id ?? null;
      this.editorPointerGesture = {
        pointerId: event.pointerId,
        mode: "track",
        points: [endpoint?.position ?? snappedPoint],
        extendingTrackId,
        extendingSide: endpoint?.side ?? null,
        targetElevation: this.editorTrackOptions.elevation,
        connectingEndpoint: null,
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    if (this.editorPrefabTool !== undefined) {
      const placement = this.editorBuildPlacement(event.clientX, event.clientY, canvasRect);
      if (placement === null) {
        return;
      }
      this.editorPlacementSurfaceElevation = placement.surfaceElevation;
      const placementPoint = this.snapPlacementPoint(placement.point);
      if (
        this.editorSession.placePrefab(
          this.editorPrefabTool.document,
          placementPoint,
          this.editorPrefabYaw,
        )
      ) {
        this.editorLastWorldPoint = placementPoint;
        this.refreshEditorDocument(true);
        this.editorPreview.showPrefabGhost(
          this.editorPrefabTool.localPrefabId,
          this.editorPrefabTool.document.entities,
          placementPoint,
          this.editorPrefabYaw,
        );
        this.ui.toast(`${this.editorPrefabTool.title} placed as an editable group.`);
      }
      return;
    }
    if (this.editorTool !== null) {
      const placement = this.editorBuildPlacement(event.clientX, event.clientY, canvasRect);
      if (placement === null) {
        return;
      }
      this.editorPlacementSurfaceElevation = placement.surfaceElevation;
      const placementPoint = this.snapPlacementPoint(placement.point);
      const placementOptions = this.currentPlacementOptions();
      this.editorLastWorldPoint = placementPoint;
      if (this.editorTool === "floor.freeform") {
        this.editorPointerGesture = {
          pointerId: event.pointerId,
          mode: "freeform-floor",
          points: [placementPoint],
          elevation: placementOptions.elevation,
        };
        this.editorPreview.showFreeformFloorGhost([placementPoint], placementOptions.elevation);
        viewport.setPointerCapture(event.pointerId);
        return;
      }
      if (this.editorTool === "floor.rectangle") {
        this.editorPointerGesture = {
          pointerId: event.pointerId,
          mode: "floor",
          startX: event.clientX,
          startY: event.clientY,
          startPoint: placementPoint,
          placementPoint,
          options: placementOptions,
          dragged: false,
        };
        this.editorPreview.showPlacementGhost("floor.rectangle", placementPoint, placementOptions);
        viewport.setPointerCapture(event.pointerId);
        return;
      }
      const entity = this.editorSession.placeEntity(
        this.editorTool,
        placementPoint,
        placementOptions,
      );
      this.refreshEditorDocument(true);
      this.editorPreview.showPlacementGhost(this.editorTool, placementPoint, placementOptions);
      this.ui.toast(`${this.editorEntityName(entity)} placed. Click again to keep building.`);
      if (entity.assetId === "track.ramp") {
        this.advanceEditorTutorial(4);
      }
      if (
        this.editorSession.document.entities.some(
          (candidate) => candidate.assetId === "race.start-grid",
        ) &&
        this.editorSession.document.entities.some(
          (candidate) => candidate.assetId === "race.finish-gate",
        )
      ) {
        this.advanceEditorTutorial(6);
      }
      return;
    }
    const target = pressedTarget;
    if (target?.kind === "track-endpoint") {
      const track = this.editorSession.document.tracks.find(
        (candidate) => candidate.id === target.trackId,
      );
      const node = track?.nodes.find((candidate) => candidate.id === target.nodeId);
      if (node === undefined) {
        return;
      }
      this.selectEditorTrackNode(target.trackId, target.nodeId);
      this.editorPointerGesture = {
        pointerId: event.pointerId,
        mode: "track-node",
        trackId: target.trackId,
        nodeId: target.nodeId,
        startPosition: node.position,
        lastWorldPoint: this.editorPreview.pointOnBuildPlane(
          event.clientX,
          event.clientY,
          canvasRect,
        ),
        accumulatedX: 0,
        accumulatedZ: 0,
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    if (target?.kind === "track-tangent") {
      const track = this.editorSession.document.tracks.find(
        (candidate) => candidate.id === target.trackId,
      );
      const node = track?.nodes.find((candidate) => candidate.id === target.nodeId);
      if (node === undefined) {
        return;
      }
      this.selectEditorTrackNode(target.trackId, target.nodeId);
      this.editorPointerGesture = {
        pointerId: event.pointerId,
        mode: "track-tangent",
        trackId: target.trackId,
        nodeId: target.nodeId,
        side: target.side,
        startTangent: target.side === "in" ? node.tangentIn : node.tangentOut,
        startClientY: event.clientY,
        lastWorldPoint: this.editorPreview.pointOnBuildPlane(
          event.clientX,
          event.clientY,
          canvasRect,
        ),
        accumulatedX: 0,
        accumulatedZ: 0,
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    if (target?.kind === "track-node") {
      const track = this.editorSession.document.tracks.find(
        (candidate) => candidate.id === target.trackId,
      );
      const node = track?.nodes.find((candidate) => candidate.id === target.nodeId);
      if (node === undefined) {
        return;
      }
      this.selectEditorTrackNode(target.trackId, target.nodeId);
      this.editorPointerGesture = {
        pointerId: event.pointerId,
        mode: "track-node",
        trackId: target.trackId,
        nodeId: target.nodeId,
        startPosition: node.position,
        lastWorldPoint: this.editorPreview.pointOnBuildPlane(
          event.clientX,
          event.clientY,
          canvasRect,
        ),
        accumulatedX: 0,
        accumulatedZ: 0,
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    const trackId = target?.kind === "track" ? target.id : null;
    if (trackId !== null) {
      this.selectEditorTrack(trackId);
    }
    const entityId = target?.kind === "entity" ? target.id : null;
    if (entityId !== null) {
      this.clearEditorTrackSelection();
    }
    if (
      !event.shiftKey &&
      entityId !== null &&
      !this.editorSession.selectedEntityIds.includes(entityId)
    ) {
      this.editorSession.select(entityId);
    }
    this.editorPointerGesture = {
      pointerId: event.pointerId,
      mode: "pending",
      hitEntityId: entityId,
      additive: event.shiftKey,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      lastWorldPoint: this.editorPreview.pointOnBuildPlane(
        event.clientX,
        event.clientY,
        canvasRect,
      ),
      accumulated: 0,
      applied: 0,
      accumulatedX: 0,
      accumulatedZ: 0,
      appliedX: 0,
      appliedZ: 0,
    };
    viewport.setPointerCapture(event.pointerId);
    this.editorPreview.setSelectedEntities(this.editorSession.selectedEntityIds);
    this.renderEditorSelectionAndHistory();
  };

  private readonly onEditorPointerMove = (event: PointerEvent): void => {
    if (this.state !== AppState.Editing || this.editorPreview === undefined) {
      return;
    }
    const gesture = this.editorPointerGesture;
    if (gesture !== undefined && gesture.pointerId === event.pointerId) {
      if (gesture.mode === "wall-range") {
        const hit = this.editorPreview.pickTrackDistance(
          event.clientX,
          event.clientY,
          GameApp.canvas().getBoundingClientRect(),
          gesture.trackId,
        );
        const track = this.editorSession?.document.tracks.find(
          (candidate) => candidate.id === gesture.trackId,
        );
        if (hit !== null && track !== undefined) {
          gesture.endDistance = hit.distance;
          this.editorPreview.showTrackRangePreview(
            track,
            gesture.startDistance,
            gesture.endDistance,
            gesture.side,
            gesture.action,
          );
          this.ui.showEditorWheelValue(
            gesture.action === "select"
              ? `SELECT RANGE · ${Math.abs(gesture.endDistance - gesture.startDistance).toFixed(1)} M`
              : `${gesture.action === "paint" ? "PAINT" : "ERASE"} ${gesture.side.toUpperCase()} WALLS · ${Math.abs(
                  gesture.endDistance - gesture.startDistance,
                ).toFixed(1)} M`,
          );
        }
        return;
      }
      if (gesture.mode === "floor") {
        const point = this.editorPreview.pointOnBuildPlane(
          event.clientX,
          event.clientY,
          GameApp.canvas().getBoundingClientRect(),
        );
        if (point !== null) {
          const travel = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
          gesture.dragged = gesture.dragged || travel >= 5;
          if (gesture.dragged) {
            const baseOptions = {
              ...this.snapPlacementOptions(this.editorPlacementOptions),
              elevation: gesture.options.elevation,
            };
            const rectangle = floorDragPlacement(
              gesture.startPoint,
              point,
              baseOptions.yawRadians,
              this.editorSnapSettings.gridEnabled ? this.editorSnapSettings.gridSize : 0,
            );
            gesture.placementPoint = rectangle.position;
            gesture.options = {
              ...baseOptions,
              primarySize: rectangle.width,
              secondarySize: rectangle.depth,
            };
            this.ui.showEditorWheelValue(
              `FLOOR ${rectangle.width.toFixed(1)} × ${rectangle.depth.toFixed(1)} M`,
            );
          } else {
            gesture.placementPoint = gesture.startPoint;
            gesture.options = {
              ...this.snapPlacementOptions(this.editorPlacementOptions),
              elevation: gesture.options.elevation,
            };
          }
          this.editorLastWorldPoint = gesture.placementPoint;
          this.editorPreview.showPlacementGhost(
            "floor.rectangle",
            gesture.placementPoint,
            gesture.options,
          );
        }
        return;
      }
      if (gesture.mode === "freeform-floor") {
        const point = this.editorPreview.pointOnBuildPlane(
          event.clientX,
          event.clientY,
          GameApp.canvas().getBoundingClientRect(),
        );
        if (point !== null) {
          const snappedPoint = this.snapPlacementPoint(point);
          const previous = gesture.points.at(-1)!;
          if (Math.hypot(snappedPoint[0] - previous[0], snappedPoint[2] - previous[2]) >= 0.2) {
            gesture.points.push(snappedPoint);
          }
          this.editorLastWorldPoint = snappedPoint;
          this.editorPreview.showFreeformFloorGhost(gesture.points, gesture.elevation);
          this.ui.showEditorWheelValue(`DRAW OUTLINE · ${String(gesture.points.length)} POINTS`);
        }
        return;
      }
      if (gesture.mode === "track") {
        const point = this.editorPreview.pointOnBuildPlane(
          event.clientX,
          event.clientY,
          GameApp.canvas().getBoundingClientRect(),
        );
        if (point !== null) {
          const previous = gesture.points.at(-1);
          const exclude =
            gesture.extendingTrackId === null || gesture.extendingSide === null
              ? undefined
              : {
                  trackId: gesture.extendingTrackId,
                  side: gesture.extendingSide,
                };
          const endpoint =
            gesture.points.length >= 2
              ? this.trackEndpointAtScreen(
                  event.clientX,
                  event.clientY,
                  GameApp.canvas().getBoundingClientRect(),
                  point,
                  exclude,
                )
              : null;
          gesture.connectingEndpoint = endpoint;
          const snappedPoint = this.snapTrackStrokePoint(point, previous);
          const minimumSpacing = this.editorSnapSettings.gridEnabled
            ? Math.max(0.75, this.editorSnapSettings.gridSize * 0.75)
            : 0.75;
          if (
            previous === undefined ||
            horizontalDistanceBetween(previous, snappedPoint) >= minimumSpacing
          ) {
            gesture.points.push(snappedPoint);
          }
          this.showTrackGestureGhost(gesture);
        }
        return;
      }
      if (gesture.mode === "track-tangent") {
        const point = this.editorPreview.pointOnBuildPlane(
          event.clientX,
          event.clientY,
          GameApp.canvas().getBoundingClientRect(),
        );
        if (!event.shiftKey && point !== null && gesture.lastWorldPoint !== null) {
          gesture.accumulatedX += point[0] - gesture.lastWorldPoint[0];
          gesture.accumulatedZ += point[2] - gesture.lastWorldPoint[2];
        }
        const tangent: Vector3Tuple = [
          gesture.startTangent[0] + gesture.accumulatedX,
          event.shiftKey
            ? gesture.startTangent[1] +
              ((gesture.startClientY - event.clientY) * 0.06) /
                Math.max(0.15, this.editorPreview.zoomLevel)
            : gesture.startTangent[1],
          gesture.startTangent[2] + gesture.accumulatedZ,
        ];
        if (
          this.editorSession?.moveTrackTangent(
            gesture.trackId,
            gesture.nodeId,
            gesture.side,
            tangent,
          ) === true
        ) {
          this.refreshEditorDocument(false);
          this.ui.showEditorWheelValue(
            event.shiftKey
              ? `CURVE HEIGHT ${tangent[1].toFixed(1)} M`
              : `CURVE HANDLE ${Math.hypot(tangent[0], tangent[2]).toFixed(1)} M`,
          );
        }
        gesture.lastWorldPoint = point;
        return;
      }
      if (gesture.mode === "track-node") {
        const point = this.editorPreview.pointOnBuildPlane(
          event.clientX,
          event.clientY,
          GameApp.canvas().getBoundingClientRect(),
        );
        if (point !== null && gesture.lastWorldPoint !== null) {
          gesture.accumulatedX += point[0] - gesture.lastWorldPoint[0];
          gesture.accumulatedZ += point[2] - gesture.lastWorldPoint[2];
          const rawX = gesture.startPosition[0] + gesture.accumulatedX;
          const rawZ = gesture.startPosition[2] + gesture.accumulatedZ;
          const x = this.editorSnapSettings.gridEnabled
            ? GameApp.snap(rawX, this.editorSnapSettings.gridSize)
            : rawX;
          const z = this.editorSnapSettings.gridEnabled
            ? GameApp.snap(rawZ, this.editorSnapSettings.gridSize)
            : rawZ;
          if (
            this.editorSession?.moveTrackNode(gesture.trackId, gesture.nodeId, [
              x,
              gesture.startPosition[1],
              z,
            ]) === true
          ) {
            this.refreshEditorDocument(false);
            this.ui.showEditorWheelValue(
              `POINT X ${x.toFixed(1)} · Z ${z.toFixed(1)}${
                this.editorSnapSettings.gridEnabled ? " · SNAPPED" : ""
              }`,
            );
          }
        }
        gesture.lastWorldPoint = point;
        return;
      }
      const deltaX = event.clientX - gesture.x;
      const deltaY = event.clientY - gesture.y;
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      if (gesture.mode === "orbit") {
        this.editorPreview.orbit(deltaX, deltaY);
        this.ui.setEditorTopDown(false);
        this.advanceEditorTutorial(1);
      } else if (gesture.mode === "pan") {
        this.editorPreview.pan(deltaX, deltaY);
        this.advanceEditorTutorial(1);
      } else if ("startX" in gesture) {
        const travel = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
        if (gesture.mode === "pending" && travel >= 5) {
          gesture.mode = gesture.additive || gesture.hitEntityId === null ? "box" : "transform";
        }
        if (gesture.mode === "box") {
          this.ui.showEditorSelectionMarquee(
            Math.min(gesture.startX, event.clientX),
            Math.min(gesture.startY, event.clientY),
            Math.abs(event.clientX - gesture.startX),
            Math.abs(event.clientY - gesture.startY),
          );
        } else if (gesture.mode === "transform") {
          this.updateEditorPointerTransform(gesture, deltaX, deltaY, event);
        }
      }
      return;
    }
    if (
      (this.editorWallBrush !== null || this.editorTrackRangeSelectActive) &&
      this.editorSelectedTrackId !== null
    ) {
      const hit = this.editorPreview.pickTrackDistance(
        event.clientX,
        event.clientY,
        GameApp.canvas().getBoundingClientRect(),
        this.editorSelectedTrackId,
      );
      this.editorPreview.setHoveredTarget(null);
      this.ui.setEditorHoverLabel(
        hit === null
          ? "RANGE TOOL · MOVE OVER SELECTED ROAD"
          : this.editorTrackRangeSelectActive
            ? "SELECT TRACK RANGE · DRAG"
            : `${this.editorWallBrush!.action === "paint" ? "PAINT" : "ERASE"} ${this.editorWallBrush!.side.toUpperCase()} WALLS · DRAG`,
      );
      return;
    }
    if (
      this.editorTool === null &&
      this.editorPrefabTool === undefined &&
      !this.editorTrackToolActive
    ) {
      const target = this.editorPreview.pickTarget(
        event.clientX,
        event.clientY,
        GameApp.canvas().getBoundingClientRect(),
      );
      this.editorPreview.setHoveredTarget(target);
      if (target?.kind === "track-tangent") {
        this.ui.setEditorHoverLabel("CURVE HANDLE · DRAG TO SHAPE");
      } else if (target?.kind === "track-endpoint") {
        this.ui.setEditorHoverLabel("OPEN TRACK END - CLICK FOR HEIGHT + CONNECTION");
      } else if (target?.kind === "track-node") {
        this.ui.setEditorHoverLabel("TRACK POINT · DRAG TO SHAPE");
      } else if (target?.kind === "track") {
        this.ui.setEditorHoverLabel("SMOOTH TRACK");
      } else if (target?.kind === "entity") {
        const entity = this.editorSession?.document.entities.find(
          (candidate) => candidate.id === target.id,
        );
        this.ui.setEditorHoverLabel(entity === undefined ? null : this.editorEntityName(entity));
      } else {
        this.ui.setEditorHoverLabel(null);
      }
      return;
    }
    this.editorPreview.setHoveredTarget(null);
    this.ui.setEditorHoverLabel(null);
    if (this.editorPrefabTool !== undefined) {
      const placement = this.editorBuildPlacement(
        event.clientX,
        event.clientY,
        GameApp.canvas().getBoundingClientRect(),
      );
      if (placement !== null) {
        this.editorPlacementSurfaceElevation = placement.surfaceElevation;
        const placementPoint = this.snapPlacementPoint(placement.point);
        this.editorLastWorldPoint = placementPoint;
        this.editorPreview.showPrefabGhost(
          this.editorPrefabTool.localPrefabId,
          this.editorPrefabTool.document.entities,
          placementPoint,
          this.editorPrefabYaw,
        );
      }
      return;
    }
    if (this.editorTool === null) {
      return;
    }
    const placement = this.editorBuildPlacement(
      event.clientX,
      event.clientY,
      GameApp.canvas().getBoundingClientRect(),
    );
    if (placement !== null) {
      this.editorPlacementSurfaceElevation = placement.surfaceElevation;
      const placementPoint = this.snapPlacementPoint(placement.point);
      this.editorLastWorldPoint = placementPoint;
      this.editorPreview.showPlacementGhost(
        this.editorTool,
        placementPoint,
        this.currentPlacementOptions(),
      );
    }
  };

  private readonly onEditorPointerUp = (event: PointerEvent): void => {
    const gesture = this.editorPointerGesture;
    if (gesture?.pointerId !== event.pointerId) {
      return;
    }
    this.editorPointerGesture = undefined;
    if (
      event.type === "pointercancel" &&
      (gesture.mode === "floor" ||
        gesture.mode === "freeform-floor" ||
        gesture.mode === "wall-range")
    ) {
      this.editorPreview?.hidePlacementGhost();
      this.editorPreview?.hideTrackRangePreview();
      const viewport = GameApp.editorViewport();
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (gesture.mode === "wall-range") {
      this.editorPreview?.hideTrackRangePreview();
      const track = this.editorSession?.document.tracks.find(
        (candidate) => candidate.id === gesture.trackId,
      );
      if (track !== undefined) {
        this.editorSelectedTrackRange = selectedTrackRange(
          track,
          gesture.startDistance,
          gesture.endDistance,
          gesture.side,
        );
      }
      if (gesture.action === "select") {
        this.renderEditorSelectionAndHistory();
        this.ui.toast("Track range selected. Its wall controls are now open.");
      } else {
        const changed = this.editorSession?.editTrackWallRange(
          gesture.trackId,
          gesture.side,
          gesture.startDistance,
          gesture.endDistance,
          gesture.action,
        );
        if (changed === true) {
          this.refreshEditorDocument(true);
          this.advanceEditorTutorial(5);
          this.ui.toast(
            gesture.action === "paint"
              ? `${gesture.side === "both" ? "Both" : gesture.side === "left" ? "Left" : "Right"} wall range painted. Drag again to keep painting.`
              : "Wall range erased. Undo restores the whole stroke.",
          );
        } else {
          this.renderEditorSelectionAndHistory();
          this.ui.toast(
            gesture.action === "paint"
              ? "That wall range is already painted."
              : "No wall was inside that range.",
          );
        }
      }
    } else if (gesture.mode === "floor") {
      const session = this.editorSession;
      if (session !== undefined) {
        session.placeEntity("floor.rectangle", gesture.placementPoint, gesture.options);
        this.refreshEditorDocument(true);
        this.editorPreview?.showPlacementGhost(
          "floor.rectangle",
          gesture.placementPoint,
          gesture.options,
        );
        this.ui.toast(
          gesture.dragged
            ? `Floor ${gesture.options.primarySize.toFixed(1)} × ${(
                gesture.options.secondarySize ?? gesture.options.primarySize
              ).toFixed(1)} M placed. Drag again to keep building.`
            : "Floor placed. Click or drag again to keep building.",
        );
      }
    } else if (gesture.mode === "freeform-floor") {
      this.editorPreview?.hidePlacementGhost();
      const entity = this.editorSession?.placeFreeformFloor(gesture.points, gesture.elevation);
      if (entity === null || entity === undefined) {
        this.ui.toast("Draw a larger outline without crossing over itself, then release.");
      } else {
        this.refreshEditorDocument(true);
        this.ui.toast("Freeform floor placed. Draw another outline to keep building.");
      }
    } else if (gesture.mode === "track") {
      this.editorPreview?.hideTrackGhost();
      const session = this.editorSession;
      if (session !== undefined) {
        const connection = gesture.connectingEndpoint;
        const gesturePoints = this.trackGesturePoints(gesture);
        if (gesture.extendingTrackId !== null) {
          const changed =
            connection !== null && connection.track.id !== gesture.extendingTrackId
              ? session.joinTrackEndpoints(
                  gesture.extendingTrackId,
                  gesture.extendingSide ?? "end",
                  connection.track.id,
                  connection.side,
                  gesturePoints,
                )
              : session.extendTrack(
                  gesture.extendingTrackId,
                  gesturePoints,
                  gesture.extendingSide ?? "end",
                  connection?.position[1] ?? gesture.targetElevation,
                );
          if (changed) {
            this.editorSelectedTrackId = gesture.extendingTrackId;
            this.editorSelectedTrackNodeId = null;
            const closed = session.document.tracks.find(
              (track) => track.id === gesture.extendingTrackId,
            )?.closed;
            this.refreshEditorDocument(true);
            this.ui.toast(
              closed === true
                ? "Track loop connected smoothly."
                : connection !== null
                  ? "Track ends joined with a smooth height transition."
                  : "Track extended smoothly.",
            );
            this.advanceEditorTutorial(2);
          }
        } else if (connection !== null) {
          const reversed = [...gesturePoints].reverse();
          if (
            session.extendTrack(
              connection.track.id,
              reversed,
              connection.side,
              gesture.targetElevation,
            )
          ) {
            this.editorSelectedTrackId = connection.track.id;
            this.editorSelectedTrackNodeId = null;
            this.refreshEditorDocument(true);
            this.ui.toast("New road connected with a smooth height transition.");
            this.advanceEditorTutorial(2);
          }
        } else {
          const track = session.createTrack(gesturePoints, this.editorTrackOptions);
          if (track !== null) {
            this.editorSelectedTrackId = track.id;
            this.editorSelectedTrackNodeId = null;
            this.refreshEditorDocument(true);
            this.ui.toast("Smooth track created. Drag from its end to continue.");
            this.advanceEditorTutorial(2);
          } else {
            this.ui.toast("Drag a little farther to make a track.");
          }
        }
      }
    } else if (gesture.mode === "track-node" || gesture.mode === "track-tangent") {
      if (this.editorSession?.commitContinuousEdit() === true) {
        this.renderEditorSelectionAndHistory();
        this.persistEditorRecoveryEntry(this.editorSession.document);
      }
    } else if (gesture.mode === "pending") {
      if (gesture.additive && gesture.hitEntityId !== null) {
        this.editorSession?.select(gesture.hitEntityId, true);
      } else if (gesture.hitEntityId === null) {
        this.editorSession?.select(null);
      }
      this.editorPreview?.setSelectedEntities(this.editorSession?.selectedEntityIds ?? []);
      this.renderEditorSelectionAndHistory();
    } else if (gesture.mode === "box") {
      const ids = this.editorPreview?.entitiesInScreenRectangle(
        Math.min(gesture.startX, event.clientX),
        Math.min(gesture.startY, event.clientY),
        Math.max(gesture.startX, event.clientX),
        Math.max(gesture.startY, event.clientY),
        GameApp.canvas().getBoundingClientRect(),
      );
      this.editorSession?.selectMany(ids ?? [], gesture.additive);
      this.editorPreview?.setSelectedEntities(this.editorSession?.selectedEntityIds ?? []);
      this.ui.hideEditorSelectionMarquee();
      this.renderEditorSelectionAndHistory();
    } else if (gesture.mode === "transform") {
      if (this.editorSession?.commitContinuousEdit() === true) {
        this.renderEditorSelectionAndHistory();
        this.persistEditorRecoveryEntry(this.editorSession.document);
      }
    }
    const viewport = GameApp.editorViewport();
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onEditorWheel = (event: WheelEvent): void => {
    if (
      this.state !== AppState.Editing ||
      this.editorPreview === undefined ||
      this.editorSession === undefined
    ) {
      return;
    }
    if (event.target instanceof Element && event.target.closest(".editor-zoom-control") !== null) {
      return;
    }
    event.preventDefault();
    if (event.altKey) {
      const zoom = this.editorPreview.zoom(event.deltaY);
      this.ui.setEditorZoom(zoom);
      this.ui.showEditorWheelValue(`VIEW ZOOM ${String(Math.round(zoom * 100))}%`);
      return;
    }
    const steps = event.deltaY < 0 ? 1 : -1;
    const mode = event.shiftKey ? "elevation" : event.ctrlKey ? "rotation" : "primary";
    if (this.editorTrackToolActive) {
      this.adjustTrackPlacementOptions(steps, mode);
      const trackGesture =
        this.editorPointerGesture?.mode === "track" ? this.editorPointerGesture : undefined;
      if (trackGesture !== undefined) {
        if (mode === "elevation") {
          trackGesture.targetElevation = this.editorTrackOptions.elevation;
        }
        this.showTrackGestureGhost(trackGesture);
      }
      if (mode === "elevation") {
        this.editorTrackElevationExplicit = true;
      }
      this.showTrackWheelValue(mode, this.editorTrackOptions);
      if (mode === "primary") {
        this.advanceEditorTutorial(3);
      }
      return;
    }
    if (this.editorPrefabTool !== undefined) {
      this.editorPrefabYaw = GameApp.snap(
        this.editorPrefabYaw + steps * (Math.PI / 12),
        Math.PI / 12,
      );
      if (this.editorLastWorldPoint !== null) {
        this.editorPreview.showPrefabGhost(
          this.editorPrefabTool.localPrefabId,
          this.editorPrefabTool.document.entities,
          this.editorLastWorldPoint,
          this.editorPrefabYaw,
        );
      }
      this.ui.showEditorWheelValue(
        `PREFAB TURN ${Math.round((this.editorPrefabYaw * 180) / Math.PI).toString()}°`,
      );
      return;
    }
    if (this.editorTool !== null) {
      this.adjustPlacementOptions(steps, mode);
      if (this.editorLastWorldPoint !== null) {
        this.editorPreview.showPlacementGhost(
          this.editorTool,
          this.editorLastWorldPoint,
          this.currentPlacementOptions(),
        );
      }
      this.showPlacementWheelValue(mode);
      return;
    }
    if (this.editorSelectedTrackId !== null && this.editorSelectedTrackNodeId !== null) {
      const trackMode = mode === "primary" ? "width" : mode === "elevation" ? "elevation" : "bank";
      if (
        this.editorSession.adjustTrackNodeWithWheel(
          this.editorSelectedTrackId,
          this.editorSelectedTrackNodeId,
          steps,
          trackMode,
        )
      ) {
        this.refreshEditorDocument(false);
        if (trackMode === "width") {
          this.advanceEditorTutorial(3);
        }
        const node = this.selectedTrackNode();
        if (node !== undefined) {
          const value =
            trackMode === "width"
              ? `POINT WIDTH ${node.width.toFixed(1)} M`
              : trackMode === "elevation"
                ? `POINT HEIGHT ${node.position[1].toFixed(2)} M`
                : `POINT BANK ${((node.bankRadians * 180) / Math.PI).toFixed(1)}°`;
          this.ui.showEditorWheelValue(value);
        }
        window.clearTimeout(this.editorWheelCommitTimeout);
        this.editorWheelCommitTimeout = window.setTimeout(() => {
          if (this.editorSession?.commitContinuousEdit() === true) {
            this.renderEditorSelectionAndHistory();
            this.persistEditorRecoveryEntry(this.editorSession.document);
          }
        }, 260);
      }
      return;
    }
    if (this.editorSelectedTrackId !== null) {
      const trackMode = mode === "primary" ? "width" : mode === "elevation" ? "elevation" : "bank";
      if (this.editorSession.adjustTrackWithWheel(this.editorSelectedTrackId, steps, trackMode)) {
        this.refreshEditorDocument(false);
        if (trackMode === "width") {
          this.advanceEditorTutorial(3);
        }
        const track = this.selectedTrack();
        if (track !== undefined) {
          this.showTrackWheelValue(mode, this.trackOptionsFromTrack(track));
        }
        window.clearTimeout(this.editorWheelCommitTimeout);
        this.editorWheelCommitTimeout = window.setTimeout(() => {
          if (this.editorSession?.commitContinuousEdit() === true) {
            this.renderEditorSelectionAndHistory();
            this.persistEditorRecoveryEntry(this.editorSession.document);
          }
        }, 260);
      }
      return;
    }
    if (this.editorSession.selectedEntity !== null) {
      const adjusted =
        mode === "rotation" && this.editorSnapSettings.angleEnabled
          ? this.editorSession.rotateSelected(steps * (Math.PI / 12), Math.PI / 12)
          : this.editorSession.adjustSelectedWithWheel(steps, mode);
      if (adjusted) {
        this.refreshEditorDocument(false);
        this.showSelectedWheelValue(mode);
        window.clearTimeout(this.editorWheelCommitTimeout);
        this.editorWheelCommitTimeout = window.setTimeout(() => {
          if (this.editorSession?.commitContinuousEdit() === true) {
            this.renderEditorSelectionAndHistory();
            this.persistEditorRecoveryEntry(this.editorSession.document);
          }
        }, 260);
      }
      return;
    }
    const zoom = this.editorPreview.zoom(event.deltaY);
    this.ui.setEditorZoom(zoom);
    this.ui.showEditorWheelValue(`VIEW ZOOM ${String(Math.round(zoom * 100))}%`);
  };

  private readonly onEditorPointerLeave = (): void => {
    if (this.editorPointerGesture === undefined) {
      this.editorPreview?.setHoveredTarget(null);
      this.ui.setEditorHoverLabel(null);
    }
  };

  private readonly onEditorContextMenu = (event: MouseEvent): void => {
    if (this.state === AppState.Editing) {
      event.preventDefault();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.state === AppState.Playing) {
      this.pause("Paused because the tab was hidden.");
    }
    if (document.hidden) {
      this.flushEditorAutosave();
    }
    void this.audio.setPageHidden(document.hidden);
    if (!document.hidden && this.state !== AppState.Paused) {
      void this.audio.resume();
    }
    this.fixedStep.reset();
    this.previousNow = performance.now();
  };

  private readonly onBlur = (): void => {
    this.input.clear();
    if (this.state === AppState.Playing) {
      this.pause("Paused because the window lost focus.");
    }
  };

  private readonly onFullscreenChange = (): void => {
    const active = document.fullscreenElement != null;
    this.ui.updateFullscreen(active);
    if (!active && this.state === AppState.Playing) {
      this.pause("Paused after leaving fullscreen.");
    }
  };

  private readonly onUiFocusIn = (event: FocusEvent): void => {
    if (
      this.audio.isUnlocked &&
      event.target instanceof HTMLElement &&
      event.target.matches("button, input, select")
    ) {
      this.audio.playUiFocus();
    }
  };

  private readonly onUiClick = (event: MouseEvent): void => {
    if (!this.audio.isUnlocked || !(event.target instanceof Element)) {
      return;
    }
    const button = event.target.closest("button");
    if (button === null) {
      return;
    }
    if (button.getAttribute("aria-label") === "Back" || button.id === "return-menu-button") {
      this.audio.playUiBack();
    } else {
      this.audio.playUiConfirm();
    }
  };

  public async initialize(): Promise<void> {
    try {
      this.ui.connect({
        activate: async () => this.activate(),
        playSandbox: async () => this.startSandbox(),
        openMapLibrary: async () => this.openMapLibrary(),
        leaveMapLibrary: () => this.leaveMapLibrary(),
        createEditorMap: async () => this.createEditorMap(),
        openEditorMap: async (localMapId) => this.openEditorMap(localMapId),
        playEditorMap: async (localMapId) => this.playEditorMap(localMapId),
        duplicateEditorMap: async (localMapId) => this.duplicateEditorMap(localMapId),
        favoriteEditorMap: async (localMapId, favorite) =>
          this.favoriteEditorMap(localMapId, favorite),
        trashEditorMap: async (localMapId) => this.trashEditorMap(localMapId),
        restoreEditorMap: async (localMapId) => this.restoreEditorMap(localMapId),
        deleteEditorMap: async (localMapId) => this.deleteEditorMap(localMapId),
        exportEditorMap: async (localMapId) => this.exportEditorMap(localMapId),
        importEditorMap: async (file) => this.importEditorMap(file),
        openEditorRestorePoints: async (localMapId) => this.openEditorRestorePoints(localMapId),
        restoreEditorPoint: async (localMapId, localRestorePointId) =>
          this.restoreEditorPoint(localMapId, localRestorePointId),
        saveEditorMap: async (title) => {
          await this.saveEditorMap(title);
        },
        editorTagsChanged: (tags) => {
          this.editorSession?.setTags(tags);
          this.refreshEditorDocument(true);
        },
        leaveEditor: async () => this.leaveEditor(),
        selectEditorAsset: (assetId) => this.selectEditorAsset(assetId),
        cancelEditorAction: () => this.cancelEditorAction(),
        editorUndo: () => this.undoEditorChange(),
        editorRedo: () => this.redoEditorChange(),
        editorDuplicate: () => this.duplicateEditorSelection(),
        editorDelete: () => this.deleteEditorSelection(),
        editorGroup: () => this.groupEditorSelection(),
        editorUngroup: () => this.ungroupEditorSelection(),
        editorSavePrefab: async (title) => this.saveEditorPrefab(title),
        editorSelectPrefab: async (localPrefabId) => this.selectEditorPrefab(localPrefabId),
        editorDeletePrefab: async (localPrefabId) => this.deleteEditorPrefab(localPrefabId),
        editorGroupCheckpoints: () => this.groupEditorCheckpoints(),
        editorLinkRoute: (shortcut) => this.linkEditorRoute(shortcut),
        editorToggleCheckpointRequired: () => this.toggleEditorCheckpointRequired(),
        editorAssignRecoveryPose: () => this.assignEditorRecoveryPose(),
        editorClearRecoveryPose: () => this.clearEditorRecoveryPose(),
        editorLinkPortals: () => this.linkEditorPortals(),
        editorClearPortalLink: () => this.clearEditorPortalLink(),
        editorAddInteractionLink: (event, condition, action) =>
          this.addEditorInteractionLink(event, condition, action),
        editorRemoveInteractionLink: (interactionId) =>
          this.removeEditorInteractionLink(interactionId),
        editorRaceSetupChanged: (view) => this.editEditorRaceSetup(view),
        editorEnvironmentChanged: (view) => this.editEditorEnvironment(view),
        editorTransformChanged: (edit) => this.editEditorSelection(edit),
        editorPhysicsChanged: (view) => {
          if (this.editorSession?.editSelectedDynamicPhysics(view) === true) {
            this.refreshEditorDocument(true);
          }
        },
        editorMotionChanged: (view) => {
          if (this.editorSession?.editSelectedMotion(view) === true) {
            this.refreshEditorDocument(true);
          } else {
            this.ui.toast("Platform travel needs to be at least 0.5 M.");
          }
        },
        editorBoostPadChanged: (view) => {
          if (this.editorSession?.editSelectedBoostPad(view) === true) {
            this.refreshEditorDocument(true);
          }
        },
        editorSurfacePadChanged: (view) => {
          if (this.editorSession?.editSelectedSurfacePad(view) === true) {
            this.refreshEditorDocument(true);
          }
        },
        editorGuidanceChanged: (view) => {
          if (this.editorSession?.editSelectedGuidance(view) === true) {
            this.refreshEditorDocument(true);
          }
        },
        editorDecorationChanged: (view) => {
          if (this.editorSession?.editSelectedDecoration(view) === true) {
            this.refreshEditorDocument(true);
          }
        },
        editorToggleTopDown: () => {
          const active = this.editorPreview?.toggleTopDown() ?? false;
          this.ui.setEditorTopDown(active);
        },
        editorZoomChanged: (zoom) => {
          const appliedZoom = this.editorPreview?.setZoom(zoom) ?? zoom;
          this.ui.setEditorZoom(appliedZoom);
        },
        editorFrameSelection: () => {
          if (this.editorPreview?.frameSelected() !== true) {
            this.ui.toast("Select an object to frame it.");
          } else {
            this.ui.setEditorZoom(this.editorPreview.zoomLevel);
          }
        },
        selectEditorTransform: (mode) => {
          this.editorTransformMode = mode;
          this.editorPreview?.setTransformMode(mode);
          this.ui.setEditorTransformMode(mode);
        },
        editorSnapChanged: (settings) => {
          this.editorSnapSettings = settings;
          this.ui.showEditorWheelValue(
            settings.gridEnabled || settings.angleEnabled || settings.surfaceEnabled
              ? "SNAPPING ON"
              : "FREE PLACEMENT",
          );
        },
        editorTutorialNext: () => this.nextEditorTutorialStep(),
        editorTutorialSkip: () => this.finishEditorTutorial(),
        editorTutorialShowMe: () => this.ui.demonstrateEditorTutorial(),
        editorTutorialReplay: () => this.startEditorTutorial(),
        selectEditorTrackTool: () => this.selectEditorTrackTool(),
        editorTrackChanged: (width, elevation, bankDegrees) =>
          this.editSelectedTrack(width, elevation, bankDegrees),
        editorTrackNodeChanged: (position, width, bankDegrees) =>
          this.editSelectedTrackNode(position, width, bankDegrees),
        editorInsertTrackNode: () => this.insertSelectedTrackNode(),
        editorDeleteTrackNode: () => this.deleteSelectedTrackNode(),
        editorSplitTrack: () => this.splitSelectedTrack(),
        editorResetTrackTangent: () => this.resetSelectedTrackTangent(),
        editorTrackWallsChanged: (left, right) => this.setSelectedTrackWalls(left, right),
        editorWallBrushChanged: (action, side) => this.setEditorWallBrush(action, side),
        editorSelectTrackRange: () => this.toggleEditorTrackRangeSelect(),
        editorApplyTrackRange: (side, edit) => this.applySelectedTrackRange(side, edit),
        editorApplyTrackRoadRange: (edit) => this.applySelectedTrackRoadRange(edit),
        editorClearTrackRange: () => this.clearSelectedTrackRange(),
        editorSmoothTrack: () => this.smoothSelectedTrack(),
        editorDeleteTrack: () => this.deleteSelectedTrack(),
        editorFrameTrack: () => {
          const session = this.editorSession;
          const trackId = this.editorSelectedTrackId;
          if (
            session === undefined ||
            trackId === null ||
            this.editorPreview?.frameTrack(session.document, trackId) !== true
          ) {
            this.ui.toast("Select a track to frame it.");
          } else if (this.editorPreview !== undefined) {
            this.ui.setEditorZoom(this.editorPreview.zoomLevel);
          }
        },
        editorTestNow: async () => this.startEditorTestMode(),
        pauseToggle: () => this.togglePause(),
        resetSandbox: async () => this.resetSandbox(),
        returnToMenu: () => this.returnToMenu(),
        fullscreenToggle: async () => this.toggleFullscreen(),
        settingsChanged: (patch) => this.updateSettings(patch),
        resetSettings: () => this.resetSettings(),
        controllerAssigned: (playerIndex, gamepadIndex) =>
          this.assignController(playerIndex, gamepadIndex),
      });
      this.input.setHandlers({
        onPauseRequested: () => this.togglePause(),
        onDevicesChanged: () => this.refreshDeviceUi(),
        onAssignedControllerDisconnected: (playerIndices) => {
          if (this.state === AppState.Playing) {
            this.pause();
          }
          this.refreshDeviceUi();
          this.ui.toast(
            `${playerIndices
              .map((index) => `P${String(index + 1)}`)
              .join(", ")} controller disconnected. Reconnect or reassign before resuming.`,
          );
        },
      });

      let settings = this.settingsService.load();
      if (import.meta.env.DEV && import.meta.env["VITE_E2E_LOW_QUALITY"] === "1") {
        settings = this.settingsService.update({
          renderScale: 0.5,
          aaQuality: "off",
          ambientOcclusion: false,
          vignette: false,
          shadowQuality: "low",
        });
      }
      this.input.configurePlayerSources(
        settings.playerInputs,
        settings.playerCount,
        settings.analogDeadZone,
        settings.analogSensitivity,
      );
      this.ui.applySettings(settings);
      this.audio.setVolumes(settings);
      this.refreshDeviceUi();
      this.ui.setLoadingStatus("Checking WebGL 2…");

      const canvas = document.getElementById("game-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("The game canvas is missing.");
      }
      this.renderSystem = new RenderSystem(canvas, settings, {
        onContextLost: () => this.handleContextLost(),
        onContextRestored: () => this.handleContextRestored(),
      });

      this.ui.setLoadingStatus("Loading Rapier physics…");
      this.rapier = await initializeRapier();

      this.installLifecycleListeners();
      if (import.meta.env.DEV) {
        const { installTestApi } = await import("../dev/install-test-api");
        this.uninstallTestApi = installTestApi({
          state: () => this.state,
          snapshot: () => this.worldSession?.debugSnapshot() ?? null,
          renderSnapshot: () => this.renderSystem?.debugSnapshot() ?? null,
          appSnapshot: () => this.debugSnapshot(),
          performanceSnapshot: () => this.performanceMonitor.snapshot(),
          audioSnapshot: () => this.audio.debugSnapshot(),
          resetPerformance: () => this.performanceMonitor.reset(),
          resetSandbox: async () => this.debugResetSandbox(),
          dropVehicle: () => this.worldSession?.debugDropVehicle(),
          moveVehicle: (playerIndex, position) =>
            this.worldSession?.debugMoveVehicle(playerIndex, position),
          setVehicleState: (playerIndex, state) =>
            this.worldSession?.debugSetVehicleState(playerIndex, state),
          setBallState: (ballIndex, state) =>
            this.worldSession?.debugSetBallState(ballIndex, state),
          setCubeState: (cubeIndex, state) =>
            this.worldSession?.debugSetCubeState(cubeIndex, state),
        });
      }
      this.state = AppState.AwaitingActivation;
      this.ui.show("activation");
      this.previousNow = performance.now();
      this.animationFrame = requestAnimationFrame((now) => this.frame(now));
    } catch (error) {
      this.fail(error);
    }
  }

  private async activate(): Promise<void> {
    if (this.state !== AppState.AwaitingActivation) {
      return;
    }
    const root = document.getElementById("game-root");
    const fullscreenRequest =
      this.settingsService.current.fullscreenPreference &&
      document.fullscreenElement == null &&
      root !== null &&
      typeof root.requestFullscreen === "function"
        ? root.requestFullscreen().catch(() => {
            this.ui.toast("Fullscreen was denied by the browser. Windowed play remains available.");
          })
        : undefined;
    const audioReady = await this.audio.unlock();
    await fullscreenRequest;
    this.input.activate();
    this.refreshDeviceUi();
    root?.focus();
    this.state = AppState.FrontEnd;
    this.ui.show("main");
    if (!audioReady) {
      this.ui.toast("Audio is unavailable; gameplay remains fully usable.");
    }
  }

  private async openMapLibrary(): Promise<void> {
    if (
      this.state !== AppState.FrontEnd &&
      this.state !== AppState.MapLibrary &&
      this.state !== AppState.Editing
    ) {
      return;
    }
    this.input.setGameplayEnabled(false);
    this.audio.setMapMusic(null);
    this.disposeEditorPreview();
    this.editorMap = undefined;
    this.state = AppState.MapLibrary;
    this.ui.show("map-library");
    try {
      const storageMode = await this.mapRepository.initialize();
      const records = await this.mapRepository.listMaps({ includeTrashed: true });
      this.ui.hideMapRestorePoints();
      this.ui.renderMapLibrary(
        records.map((record) => ({
          localMapId: record.localMapId,
          title: record.document.header.title,
          updatedAt: record.updatedAt,
          revision: record.revision,
          objectCount: record.document.entities.length + record.document.tracks.length,
          createdAt: record.createdAt,
          favorite: record.favorite,
          trashedAt: record.trashedAt,
          tags: record.document.metadata.tags,
          thumbnailDataUrl: record.thumbnailDataUrl,
        })),
        this.mapStorageLabel(),
      );
      void this.refreshMapStorageStatus();
      if (storageMode === "memory" && !this.memoryStorageWarningShown) {
        this.memoryStorageWarningShown = true;
        this.ui.toast(
          "Browser map storage is unavailable. This session works, but maps may not survive reload.",
        );
      }
    } catch (error) {
      this.ui.toast(`Map library could not load: ${errorMessage(error)}`);
    }
  }

  private leaveMapLibrary(): void {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    this.state = AppState.FrontEnd;
    this.ui.show("main");
  }

  private async refreshMapStorageStatus(): Promise<void> {
    const storage = navigator.storage;
    if (storage === undefined || typeof storage.estimate !== "function") {
      return;
    }
    try {
      const estimate = await storage.estimate();
      let persistent = typeof storage.persisted === "function" ? await storage.persisted() : false;
      if (!persistent && !this.storagePersistenceChecked && typeof storage.persist === "function") {
        this.storagePersistenceChecked = true;
        persistent = await storage.persist();
      }
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      const usedMegabytes = usage / (1024 * 1024);
      this.ui.setMapStorageStatus(
        `${this.mapStorageLabel()} · ${usedMegabytes < 0.1 ? "<0.1" : usedMegabytes.toFixed(1)} MB USED · ${persistent ? "PERSISTENT" : "BROWSER MANAGED"}`,
      );
      if (quota > 0 && usage / quota >= 0.8 && !this.storageQuotaWarningShown) {
        this.storageQuotaWarningShown = true;
        this.ui.toast("Local storage is nearly full. Export backups before adding heavy maps.");
      }
    } catch {
      // Storage estimates are optional; the repository status remains truthful without one.
    }
  }

  private async createEditorMap(): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      const record = await this.mapRepository.createMap(createStarterMapDocument());
      this.enterEditor(record);
    } catch (error) {
      this.ui.toast(`Map could not be created: ${errorMessage(error)}`);
    }
  }

  private async openEditorMap(localMapId: string): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      const record = await this.mapRepository.getMap(localMapId);
      if (record === null) {
        throw new Error("That map no longer exists.");
      }
      const recovery = await this.mapRepository.latestRecoveryEntry(localMapId);
      if (recovery !== null && recovery.baseRevision === record.revision) {
        this.enterEditor(Object.freeze({ ...record, document: recovery.document }));
        this.ui.setEditorSaveStatus("RECOVERED · AUTOSAVE PENDING", "pending");
        this.ui.toast("Recovered the latest durable edit after the last interrupted session.");
        this.scheduleEditorAutosave();
      } else {
        this.enterEditor(record);
      }
    } catch (error) {
      this.ui.toast(`Map could not be opened: ${errorMessage(error)}`);
    }
  }

  private async playEditorMap(localMapId: string): Promise<void> {
    if (
      this.state !== AppState.MapLibrary ||
      this.rapier === undefined ||
      this.renderSystem === undefined
    ) {
      return;
    }
    try {
      const record = await this.mapRepository.getMap(localMapId);
      if (record === null) {
        throw new Error("That map no longer exists.");
      }
      const compiled = compileMapDocument(record.document);
      if (!compiled.freeDriveReady) {
        this.ui.toast("Edit this map and add a Start Grid before playing it.");
        return;
      }
      const needsFreeDriveFallback = compiled.mapType !== "free-roam" && !compiled.scoredRaceReady;
      const blueprint: RuntimeMapBlueprint = needsFreeDriveFallback
        ? Object.freeze({
            ...compiled,
            mapType: "free-roam",
            race: Object.freeze({ ...compiled.race, mode: "free-roam" }),
          })
        : compiled;
      this.disposeEditorPreview();
      this.editorMap = undefined;
      this.editorSession = undefined;
      this.state = AppState.Loading;
      this.ui.show("loading");
      this.ui.setLoadingStatus(`Loading ${record.document.header.title}…`);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      this.worldSession?.dispose();
      this.audio.setMapMusic(
        record.document.environment.musicAssetId,
        record.document.environment.musicVolume,
      );
      this.worldSession = this.createWorldSession(blueprint);
      this.playtestBlueprint = blueprint;
      this.normalMapPlay = true;
      this.ui.setMapPlayPauseMode();
      await this.renderSystem.precompile();
      this.sessionGeneration += 1;
      this.input.setGameplayEnabled(true);
      this.fixedStep.reset();
      this.previousNow = performance.now();
      this.state = AppState.Playing;
      this.audio.setGameplayPaused(false);
      for (const screen of document.querySelectorAll<HTMLElement>(".screen")) {
        screen.hidden = true;
      }
      document.getElementById("game-root")?.focus();
      if (needsFreeDriveFallback) {
        this.ui.toast("Race rules are incomplete, so this launch is safe Free Drive.");
      }
    } catch (error) {
      this.worldSession?.dispose();
      this.worldSession = undefined;
      this.playtestBlueprint = undefined;
      this.normalMapPlay = false;
      this.audio.setMapMusic(null);
      this.input.setGameplayEnabled(false);
      this.state = AppState.MapLibrary;
      this.ui.show("map-library");
      this.ui.toast(`Map could not start: ${errorMessage(error)}`);
    }
  }

  private async duplicateEditorMap(localMapId: string): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      await this.mapRepository.duplicateMap(localMapId);
      await this.openMapLibrary();
      this.ui.toast("Map duplicated. The original is unchanged.");
    } catch (error) {
      this.ui.toast(`Map could not be duplicated: ${errorMessage(error)}`);
    }
  }

  private async favoriteEditorMap(localMapId: string, favorite: boolean): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      await this.mapRepository.setFavorite(localMapId, favorite);
      await this.openMapLibrary();
      this.ui.toast(favorite ? "Map added to favorites." : "Map removed from favorites.");
    } catch (error) {
      this.ui.toast(`Favorite could not be changed: ${errorMessage(error)}`);
    }
  }

  private async trashEditorMap(localMapId: string): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      await this.mapRepository.moveToTrash(localMapId);
      await this.openMapLibrary();
      this.ui.toast("Map moved to Trash. It can still be restored.");
    } catch (error) {
      this.ui.toast(`Map could not be moved to Trash: ${errorMessage(error)}`);
    }
  }

  private async restoreEditorMap(localMapId: string): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      await this.mapRepository.restoreMap(localMapId);
      await this.openMapLibrary();
      this.ui.toast("Map restored.");
    } catch (error) {
      this.ui.toast(`Map could not be restored: ${errorMessage(error)}`);
    }
  }

  private async deleteEditorMap(localMapId: string): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    const record = await this.mapRepository.getMap(localMapId);
    if (record === null) {
      this.ui.toast("That map no longer exists.");
      return;
    }
    if (
      !window.confirm(`Delete “${record.document.header.title}” forever? This cannot be undone.`)
    ) {
      return;
    }
    try {
      await this.mapRepository.deleteMapPermanently(localMapId);
      await this.openMapLibrary();
      this.ui.toast("Map permanently deleted.");
    } catch (error) {
      this.ui.toast(`Map could not be deleted: ${errorMessage(error)}`);
    }
  }

  private async exportEditorMap(localMapId: string): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      const record = await this.mapRepository.getMap(localMapId);
      if (record === null) {
        throw new Error("That map no longer exists.");
      }
      const blob = new Blob([encodeMapDocument(record.document)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = record.document.header.title
        .trim()
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      link.href = url;
      link.download = `${filename || "mini-wheels-map"}.mini-wheels.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.ui.toast("Portable map backup exported.");
    } catch (error) {
      this.ui.toast(`Map could not be exported: ${errorMessage(error)}`);
    }
  }

  private async importEditorMap(file: File): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.ui.toast("That map file is over the 5 MB import limit.");
      return;
    }
    try {
      const imported = await this.mapRepository.importMap(await file.text());
      await this.openMapLibrary();
      this.ui.toast(`Imported “${imported.document.header.title}”.`);
    } catch (error) {
      this.ui.toast(`Map import rejected safely: ${errorMessage(error)}`);
    }
  }

  private async openEditorRestorePoints(localMapId: string): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      const points = await this.mapRepository.listRestorePoints(localMapId);
      this.ui.renderMapRestorePoints(
        points.map((point) => ({
          localMapId,
          localRestorePointId: point.localRestorePointId,
          title: point.document.header.title,
          createdAt: point.createdAt,
          revision: point.revision,
          objectCount: point.document.entities.length + point.document.tracks.length,
        })),
      );
    } catch (error) {
      this.ui.toast(`Restore history could not load: ${errorMessage(error)}`);
    }
  }

  private async restoreEditorPoint(localMapId: string, localRestorePointId: string): Promise<void> {
    if (this.state !== AppState.MapLibrary) {
      return;
    }
    try {
      const copy = await this.mapRepository.restorePointAsCopy(localMapId, localRestorePointId);
      await this.openMapLibrary();
      this.ui.toast(`Recovered “${copy.document.header.title}” without changing the current map.`);
    } catch (error) {
      this.ui.toast(`Restore point could not be recovered: ${errorMessage(error)}`);
    }
  }

  private enterEditor(record: MapRecord): void {
    if (this.renderSystem === undefined) {
      return;
    }
    this.worldSession?.dispose();
    this.worldSession = undefined;
    this.disposeEditorPreview();
    const blueprint = compileMapDocument(record.document);
    this.editorMap = record;
    this.editorRecoveryGeneration = 0;
    this.editorRecoveryWrite = Promise.resolve();
    this.editorSession = new EditorSession(record.document);
    this.editorPreview = new EditorPreviewSession(
      this.renderSystem.scene,
      this.renderSystem.camera,
      record.document,
    );
    this.audio.setMapMusic(
      record.document.environment.musicAssetId,
      record.document.environment.musicVolume,
    );
    this.state = AppState.Editing;
    this.ui.renderEditorMap({
      title: record.document.header.title,
      tags: record.document.metadata.tags,
      revision: record.revision,
      objectCount: record.document.entities.length + record.document.tracks.length,
      schemaVersion: record.document.header.schemaVersion,
      storageLabel: this.mapStorageLabel(),
      diagnostics: blueprint.diagnostics.map((diagnostic) => diagnostic.message),
      healthy: blueprint.freeDriveReady,
    });
    this.ui.setEditorActiveTool(null);
    this.ui.setEditorTrackTool(false);
    this.ui.setEditorTopDown(false);
    this.ui.setEditorZoom(this.editorPreview.zoomLevel);
    this.editorTransformMode = "move";
    this.editorPreview.setTransformMode("move");
    this.ui.setEditorTransformMode("move");
    this.renderEditorSelectionAndHistory();
    void this.refreshEditorPrefabs();
    this.ui.show("editor");
    if (!this.editorTutorialComplete()) {
      this.startEditorTutorial();
    }
  }

  private async saveEditorMap(title: string): Promise<boolean> {
    const current = this.editorMap;
    const session = this.editorSession;
    if (this.state !== AppState.Editing || current === undefined || session === undefined) {
      return false;
    }
    const normalizedTitle = title.trim();
    if (normalizedTitle.length === 0) {
      this.ui.setEditorSaveStatus("ADD A MAP NAME", "failed");
      this.ui.toast("Give the map a name before saving.");
      return false;
    }
    this.ui.setEditorSaveStatus("SAVING…", "pending");
    try {
      session.commitContinuousEdit();
      session.setTitle(normalizedTitle);
      const savedDocument = session.document;
      await this.editorRecoveryWrite.catch(() => undefined);
      window.clearTimeout(this.editorAutosaveTimeout);
      this.editorAutosaveTimeout = undefined;
      const saved = await this.mapRepository.saveMap(current.localMapId, savedDocument);
      await this.mapRepository.clearRecoveryJournal(current.localMapId).catch(() => undefined);
      this.editorMap = saved;
      this.refreshEditorDocument(false);
      if (session.document === savedDocument) {
        this.ui.setEditorSaveStatus("SAVED LOCALLY", "saved");
      } else {
        this.ui.setEditorSaveStatus("CHANGES PENDING", "pending");
        this.scheduleEditorAutosave();
      }
      return true;
    } catch (error) {
      this.ui.setEditorSaveStatus("SAVE FAILED", "failed");
      this.ui.toast(`Map could not be saved: ${errorMessage(error)}`);
      return false;
    }
  }

  private async leaveEditor(): Promise<void> {
    if (this.state !== AppState.Editing) {
      return;
    }
    const title = document.getElementById("editor-map-name");
    if (title instanceof HTMLInputElement) {
      if (!(await this.saveEditorMap(title.value))) {
        return;
      }
    }
    await this.openMapLibrary();
  }

  private async startEditorTestMode(): Promise<void> {
    const session = this.editorSession;
    const preview = this.editorPreview;
    const renderSystem = this.renderSystem;
    if (
      this.state !== AppState.Editing ||
      session === undefined ||
      preview === undefined ||
      renderSystem === undefined ||
      this.rapier === undefined
    ) {
      return;
    }
    session.commitContinuousEdit();
    const title = document.getElementById("editor-map-name");
    if (title instanceof HTMLInputElement) {
      const normalizedTitle = title.value.trim();
      if (normalizedTitle.length === 0) {
        this.ui.setEditorSaveStatus("ADD A MAP NAME", "failed");
        this.ui.toast("Give the map a name before testing it.");
        return;
      }
      session.setTitle(normalizedTitle);
    }
    const blueprint = compileMapDocument(session.document);
    if (!blueprint.freeDriveReady) {
      this.ui.toast(
        blueprint.diagnostics.find((diagnostic) => diagnostic.level === "blocking")?.message ??
          "Place a start grid before testing this map.",
      );
      return;
    }
    this.advanceEditorTutorial(7);
    this.editorCameraSnapshot = preview.captureCamera();
    this.editorPlaytestAutosavePending =
      document.getElementById("editor-save-status")?.dataset["saveState"] === "pending";
    window.clearTimeout(this.editorAutosaveTimeout);
    window.clearTimeout(this.editorWheelCommitTimeout);
    this.editorAutosaveTimeout = undefined;
    this.editorWheelCommitTimeout = undefined;
    preview.dispose();
    this.editorPreview = undefined;
    this.state = AppState.Loading;
    this.ui.show("loading");
    this.ui.setLoadingStatus("Building your test track…");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      this.worldSession?.dispose();
      this.worldSession = this.createWorldSession(blueprint);
      this.playtestBlueprint = blueprint;
      this.normalMapPlay = false;
      await renderSystem.precompile();
    } catch (error) {
      // The editor document is untouched, so go back to it instead of a dead end.
      this.returnToEditor();
      this.ui.toast(`Test drive could not start: ${errorMessage(error)}`);
      return;
    }
    this.sessionGeneration += 1;
    this.input.setGameplayEnabled(true);
    this.fixedStep.reset();
    this.previousNow = performance.now();
    this.state = AppState.Playing;
    this.audio.setGameplayPaused(false);
    this.ui.setPlaytestPauseMode(true);
    for (const screen of document.querySelectorAll<HTMLElement>(".screen")) {
      screen.hidden = true;
    }
    document.getElementById("game-root")?.focus();
  }

  private returnToEditor(): void {
    const session = this.editorSession;
    const renderSystem = this.renderSystem;
    if (session === undefined || renderSystem === undefined) {
      this.playtestBlueprint = undefined;
      this.returnToMenu();
      return;
    }
    this.ui.clearRaceResults();
    this.input.setGameplayEnabled(false);
    this.audio.stopAllEngineVoices();
    this.audio.setGameplayPaused(true);
    this.worldSession?.dispose();
    this.worldSession = undefined;
    this.fixedStep.reset();
    this.editorPreview = new EditorPreviewSession(
      renderSystem.scene,
      renderSystem.camera,
      session.document,
    );
    const cameraSnapshot = this.editorCameraSnapshot;
    if (cameraSnapshot !== undefined) {
      this.editorPreview.restoreCamera(cameraSnapshot);
    }
    this.editorPreview.setTransformMode(this.editorTransformMode);
    this.playtestBlueprint = undefined;
    this.normalMapPlay = false;
    this.editorCameraSnapshot = undefined;
    this.state = AppState.Editing;
    this.ui.setPlaytestPauseMode(false);
    this.ui.show("editor");
    this.ui.setEditorTransformMode(this.editorTransformMode);
    this.ui.setEditorTopDown(cameraSnapshot?.topDown ?? false);
    this.ui.setEditorActiveTool(this.editorTool);
    this.ui.setEditorTrackTool(this.editorTrackToolActive);
    this.ui.setEditorWallBrush(
      this.editorWallBrush?.action ?? null,
      this.editorWallBrush?.side ?? null,
    );
    this.ui.setEditorTrackRangeSelectActive(this.editorTrackRangeSelectActive);
    this.ui.setEditorZoom(this.editorPreview.zoomLevel);
    this.refreshEditorDocument(false);
    if (this.editorPlaytestAutosavePending) {
      this.scheduleEditorAutosave();
    }
    this.editorPlaytestAutosavePending = false;
    this.audio.setGameplayPaused(false);
    void this.audio.resume();
  }

  private mapStorageLabel(): string {
    return this.mapRepository.storageMode === "indexed-db"
      ? "SAVED IN THIS BROWSER"
      : "SESSION MEMORY ONLY";
  }

  private disposeEditorPreview(): void {
    window.clearTimeout(this.editorAutosaveTimeout);
    window.clearTimeout(this.editorWheelCommitTimeout);
    this.editorAutosaveTimeout = undefined;
    this.editorWheelCommitTimeout = undefined;
    this.editorPointerGesture = undefined;
    this.editorLastWorldPoint = null;
    this.editorTool = null;
    this.editorPrefabTool = undefined;
    this.editorTrackToolActive = false;
    this.editorWallBrush = null;
    this.editorTrackRangeSelectActive = false;
    this.editorSelectedTrackRange = null;
    this.editorSelectedTrackId = null;
    this.editorSelectedTrackNodeId = null;
    this.editorSession = undefined;
    this.editorPreview?.dispose();
    this.editorPreview = undefined;
    this.ui.setEditorActiveTool(null);
    this.ui.setEditorTrackTool(false);
    this.ui.setEditorWallBrush(null, null);
    this.ui.setEditorTrackRangeSelectActive(false);
    this.ui.renderEditorTrackRange(null);
    this.ui.renderEditorSelection(null);
    this.ui.renderEditorPrefabSave(false);
    this.ui.renderEditorPhysics(null);
    this.ui.renderEditorMotion(null);
    this.ui.renderEditorBoostPad(null);
    this.ui.renderEditorSurfacePad(null);
    this.ui.renderEditorGuidance(null);
    this.ui.renderEditorDecoration(null);
    this.ui.renderEditorPortalLink(null);
    this.ui.renderEditorInteractionLink(null);
    this.ui.renderEditorTrack(null);
    this.ui.hideEditorSelectionMarquee();
    this.ui.renderEditorTutorial(null);
    this.ui.setEditorHoverLabel(null);
  }

  private selectEditorAsset(assetId: EditorAssetId): void {
    if (this.state !== AppState.Editing || this.editorPreview === undefined) {
      return;
    }
    this.editorTrackToolActive = false;
    this.editorPrefabTool = undefined;
    this.editorWallBrush = null;
    this.editorTrackRangeSelectActive = false;
    this.ui.setEditorTrackTool(false);
    this.ui.setEditorWallBrush(null, null);
    this.ui.setEditorTrackRangeSelectActive(false);
    this.clearEditorTrackSelection();
    if (this.editorTool === assetId) {
      this.cancelEditorAction();
      return;
    }
    this.editorTool = assetId;
    const manifest = editorAssetManifest(assetId);
    this.editorPlacementOptions = {
      elevation: 0,
      primarySize: manifest?.defaultPrimarySize ?? 2.5,
      secondarySize: manifest?.defaultSecondarySize ?? 2.5,
      yawRadians: 0,
    };
    this.editorSession?.select(null);
    this.editorPreview.setSelectedEntity(null);
    this.editorPreview.hidePlacementGhost();
    this.editorLastWorldPoint = null;
    this.ui.setEditorActiveTool(assetId);
    this.renderEditorSelectionAndHistory();
    this.ui.showEditorWheelValue(
      `${manifest?.name.toLocaleUpperCase() ?? "OBJECT"} READY — ${manifest?.placementHint ?? "CLICK TO PLACE"}`,
    );
  }

  private selectEditorTrackTool(): void {
    if (this.state !== AppState.Editing) {
      return;
    }
    if (this.editorTrackToolActive) {
      this.cancelEditorAction();
      return;
    }
    this.editorTrackToolActive = true;
    this.editorPrefabTool = undefined;
    this.editorWallBrush = null;
    this.editorTrackRangeSelectActive = false;
    this.editorSelectedTrackRange = null;
    this.ui.setEditorWallBrush(null, null);
    this.ui.setEditorTrackRangeSelectActive(false);
    this.ui.renderEditorTrackRange(null);
    const selectedTrack = this.selectedTrack();
    if (selectedTrack !== undefined) {
      this.editorTrackOptions = this.trackOptionsFromTrack(selectedTrack);
    }
    this.editorTrackElevationExplicit = false;
    this.editorTool = null;
    this.editorSession?.select(null);
    this.editorPreview?.setSelectedEntities([]);
    this.editorPreview?.hidePlacementGhost();
    this.ui.setEditorActiveTool(null);
    this.ui.setEditorTrackTool(true);
    this.renderEditorSelectionAndHistory();
    this.ui.showEditorWheelValue("TRACK READY — PRESS + DRAG");
  }

  private selectEditorTrack(trackId: string): void {
    const session = this.editorSession;
    if (session === undefined || !session.document.tracks.some((track) => track.id === trackId)) {
      return;
    }
    if (this.editorSelectedTrackRange?.trackId !== trackId) {
      this.editorSelectedTrackRange = null;
      this.ui.renderEditorTrackRange(null);
    }
    this.editorSelectedTrackId = trackId;
    this.editorSelectedTrackNodeId = null;
    session.select(null);
    this.editorPreview?.setSelectedEntities([]);
    this.editorPreview?.setSelectedTrack(trackId, session.document, null);
    this.renderEditorSelectionAndHistory();
  }

  private selectEditorTrackNode(trackId: string, nodeId: string): void {
    const session = this.editorSession;
    const track = session?.document.tracks.find((candidate) => candidate.id === trackId);
    if (session === undefined || !track?.nodes.some((node) => node.id === nodeId)) {
      return;
    }
    if (this.editorSelectedTrackRange?.trackId !== trackId) {
      this.editorSelectedTrackRange = null;
      this.ui.renderEditorTrackRange(null);
    }
    this.editorSelectedTrackId = trackId;
    this.editorSelectedTrackNodeId = nodeId;
    session.select(null);
    this.editorPreview?.setSelectedEntities([]);
    this.editorPreview?.setSelectedTrackNode(trackId, nodeId, session.document);
    this.renderEditorSelectionAndHistory();
  }

  private clearEditorTrackSelection(): void {
    this.editorWallBrush = null;
    this.editorTrackRangeSelectActive = false;
    this.editorSelectedTrackRange = null;
    this.editorPreview?.hideTrackRangePreview();
    this.ui.setEditorWallBrush(null, null);
    this.ui.setEditorTrackRangeSelectActive(false);
    this.ui.renderEditorTrackRange(null);
    this.editorSelectedTrackId = null;
    this.editorSelectedTrackNodeId = null;
    const session = this.editorSession;
    if (session !== undefined) {
      this.editorPreview?.setSelectedTrack(null, session.document);
    }
    this.ui.renderEditorTrack(null);
    this.ui.renderEditorTrackNode(null);
  }

  private selectedTrack(): TrackDefinition | undefined {
    return this.editorSession?.document.tracks.find(
      (track) => track.id === this.editorSelectedTrackId,
    );
  }

  private selectedTrackNode() {
    return this.selectedTrack()?.nodes.find((node) => node.id === this.editorSelectedTrackNodeId);
  }

  private editSelectedTrackNode(position: Vector3Tuple, width: number, bankDegrees: number): void {
    const trackId = this.editorSelectedTrackId;
    const nodeId = this.editorSelectedTrackNodeId;
    if (
      trackId !== null &&
      nodeId !== null &&
      this.editorSession?.editTrackNode(trackId, nodeId, {
        position: this.snapPlacementPoint(position),
        width,
        bankRadians: (bankDegrees * Math.PI) / 180,
      }) === true
    ) {
      this.refreshEditorDocument(true);
    }
  }

  private insertSelectedTrackNode(): void {
    const trackId = this.editorSelectedTrackId;
    const nodeId = this.editorSelectedTrackNodeId;
    if (trackId === null || nodeId === null || this.editorSession === undefined) {
      return;
    }
    const inserted = this.editorSession.insertTrackNode(trackId, nodeId);
    if (inserted !== null) {
      this.editorSelectedTrackNodeId = inserted.id;
      this.refreshEditorDocument(true);
      this.ui.toast("Track point added between the curve. Undo is available.");
    }
  }

  private deleteSelectedTrackNode(): void {
    const track = this.selectedTrack();
    const trackId = this.editorSelectedTrackId;
    const nodeId = this.editorSelectedTrackNodeId;
    if (
      track === undefined ||
      trackId === null ||
      nodeId === null ||
      this.editorSession === undefined
    ) {
      return;
    }
    const currentIndex = track.nodes.findIndex((node) => node.id === nodeId);
    if (!this.editorSession.deleteTrackNode(trackId, nodeId)) {
      this.ui.toast(
        track.closed ? "A loop needs at least three points." : "A track needs two end points.",
      );
      return;
    }
    const updatedTrack = this.editorSession.document.tracks.find(
      (candidate) => candidate.id === trackId,
    );
    this.editorSelectedTrackNodeId =
      updatedTrack?.nodes[Math.min(currentIndex, updatedTrack.nodes.length - 1)]?.id ?? null;
    this.refreshEditorDocument(true);
    this.ui.toast("Track point removed. The curve and wall ranges were repaired.");
  }

  private splitSelectedTrack(): void {
    const trackId = this.editorSelectedTrackId;
    const nodeId = this.editorSelectedTrackNodeId;
    if (trackId === null || nodeId === null || this.editorSession === undefined) {
      return;
    }
    const result = this.editorSession.splitTrack(trackId, nodeId);
    if (result === null) {
      this.ui.toast("Choose a middle point to split this track.");
      return;
    }
    this.editorSelectedTrackId = result.primaryTrackId;
    this.editorSelectedTrackNodeId = result.selectedNodeId;
    this.refreshEditorDocument(true);
    this.ui.toast(
      result.openedLoop
        ? "Track loop opened here. Both ends are ready to move or reconnect."
        : "Track split into two roads. Both new ends are ready to reconnect.",
    );
  }

  private resetSelectedTrackTangent(): void {
    const trackId = this.editorSelectedTrackId;
    const nodeId = this.editorSelectedTrackNodeId;
    if (
      trackId !== null &&
      nodeId !== null &&
      this.editorSession?.resetTrackTangent(trackId, nodeId) === true
    ) {
      this.refreshEditorDocument(true);
      this.ui.toast("Curve handles reset to a smooth automatic turn.");
    }
  }

  private editSelectedTrack(width: number, elevation: number, bankDegrees: number): void {
    const trackId = this.editorSelectedTrackId;
    if (
      trackId !== null &&
      this.editorSession?.editTrack(trackId, {
        width,
        elevation,
        bankRadians: (bankDegrees * Math.PI) / 180,
      }) === true
    ) {
      this.refreshEditorDocument(true);
    }
  }

  private setSelectedTrackWalls(left: boolean, right: boolean): void {
    const trackId = this.editorSelectedTrackId;
    if (trackId !== null && this.editorSession?.setTrackWalls(trackId, left, right) === true) {
      this.refreshEditorDocument(true);
      this.ui.toast(
        left || right ? "Track walls updated." : "Track walls removed. Undo is available.",
      );
    }
  }

  private setEditorWallBrush(action: TrackWallBrushAction, side: TrackWallBrushSide): void {
    if (this.editorSelectedTrackId === null || this.selectedTrack() === undefined) {
      this.ui.toast("Select a track before choosing the wall brush.");
      return;
    }
    const alreadyActive =
      this.editorWallBrush?.action === action && this.editorWallBrush.side === side;
    this.editorWallBrush = alreadyActive ? null : Object.freeze({ action, side });
    this.editorTrackRangeSelectActive = false;
    this.editorTool = null;
    this.editorTrackToolActive = false;
    this.editorPreview?.hidePlacementGhost();
    this.editorPreview?.hideTrackGhost();
    this.editorPreview?.hideTrackRangePreview();
    this.ui.setEditorActiveTool(null);
    this.ui.setEditorTrackTool(false);
    this.ui.setEditorTrackRangeSelectActive(false);
    this.ui.setEditorWallBrush(
      this.editorWallBrush?.action ?? null,
      this.editorWallBrush?.side ?? null,
    );
    this.ui.showEditorWheelValue(
      this.editorWallBrush === null
        ? "WALL BRUSH OFF"
        : `${action === "paint" ? "PAINT" : "ERASE"} ${side.toUpperCase()} WALLS · DRAG ON ROAD`,
    );
  }

  private toggleEditorTrackRangeSelect(): void {
    if (this.editorSelectedTrackId === null || this.selectedTrack() === undefined) {
      this.ui.toast("Select a track before selecting a range.");
      return;
    }
    this.editorTrackRangeSelectActive = !this.editorTrackRangeSelectActive;
    this.editorWallBrush = null;
    this.editorTool = null;
    this.editorTrackToolActive = false;
    this.editorPreview?.hidePlacementGhost();
    this.editorPreview?.hideTrackGhost();
    this.ui.setEditorActiveTool(null);
    this.ui.setEditorTrackTool(false);
    this.ui.setEditorWallBrush(null, null);
    this.ui.setEditorTrackRangeSelectActive(this.editorTrackRangeSelectActive);
    this.ui.showEditorWheelValue(
      this.editorTrackRangeSelectActive ? "SELECT RANGE · DRAG ALONG ROAD" : "RANGE SELECT OFF",
    );
  }

  private applySelectedTrackRange(side: TrackWallBrushSide, edit: TrackWallPropertiesEdit): void {
    const range = this.editorSelectedTrackRange;
    if (range === null || this.editorSession === undefined) {
      this.ui.toast("Select a road range first.");
      return;
    }
    if (
      this.editorSession.editTrackWallProperties(
        range.trackId,
        side,
        range.startDistance,
        range.endDistance,
        edit,
      )
    ) {
      this.editorSelectedTrackRange = Object.freeze({ ...range, side });
      this.refreshEditorDocument(true);
      this.ui.toast("Wall style applied only inside the selected range.");
    } else {
      this.ui.toast("Paint a wall in this range first, or choose different values.");
    }
  }

  private applySelectedTrackRoadRange(edit: TrackRoadPropertiesEdit): void {
    const range = this.editorSelectedTrackRange;
    if (range === null || this.editorSession === undefined) {
      this.ui.toast("Select a road range first.");
      return;
    }
    if (
      this.editorSession.editTrackRoadProperties(
        range.trackId,
        range.startDistance,
        range.endDistance,
        edit,
      )
    ) {
      this.refreshEditorDocument(true);
      this.ui.toast("Road style eased into the selected range.");
    } else {
      this.ui.toast("Choose different road values, then try again.");
    }
  }

  private clearSelectedTrackRange(): void {
    this.editorSelectedTrackRange = null;
    this.editorTrackRangeSelectActive = false;
    this.editorPreview?.hideTrackRangePreview();
    this.ui.setEditorTrackRangeSelectActive(false);
    this.ui.renderEditorTrackRange(null);
    this.ui.showEditorWheelValue("TRACK RANGE CLEARED");
  }

  private smoothSelectedTrack(): void {
    const trackId = this.editorSelectedTrackId;
    if (trackId !== null && this.editorSession?.smoothTrack(trackId) === true) {
      this.refreshEditorDocument(true);
      this.ui.toast("Track curves smoothed. Undo is available.");
    } else {
      this.ui.toast("Select a track with at least three points to smooth it.");
    }
  }

  private deleteSelectedTrack(): void {
    const trackId = this.editorSelectedTrackId;
    if (trackId !== null && this.editorSession?.deleteTrack(trackId) === true) {
      this.editorSelectedTrackId = null;
      this.editorSelectedTrackNodeId = null;
      this.refreshEditorDocument(true);
      this.ui.toast("Track deleted. Undo is available.");
    }
  }

  private cancelEditorAction(): boolean {
    if (this.state !== AppState.Editing) {
      return false;
    }
    if (this.editorTool !== null) {
      if (
        this.editorPointerGesture?.mode === "floor" ||
        this.editorPointerGesture?.mode === "freeform-floor"
      ) {
        const pointerId = this.editorPointerGesture.pointerId;
        const viewport = GameApp.editorViewport();
        if (viewport.hasPointerCapture(pointerId)) {
          viewport.releasePointerCapture(pointerId);
        }
        this.editorPointerGesture = undefined;
      }
      this.editorTool = null;
      this.editorLastWorldPoint = null;
      this.editorPreview?.hidePlacementGhost();
      this.ui.setEditorActiveTool(null);
      this.ui.showEditorWheelValue("SELECT MODE");
      return true;
    }
    if (this.editorPrefabTool !== undefined) {
      this.editorPrefabTool = undefined;
      this.editorLastWorldPoint = null;
      this.editorPreview?.hidePlacementGhost();
      this.ui.renderEditorPrefabs(
        this.editorPrefabs.map((prefab) => ({
          localPrefabId: prefab.localPrefabId,
          title: prefab.title,
          objectCount: prefab.document.entities.length,
        })),
        null,
      );
      this.ui.showEditorWheelValue("SELECT MODE");
      return true;
    }
    if (this.editorTrackToolActive) {
      this.editorTrackToolActive = false;
      this.editorPreview?.hideTrackGhost();
      this.ui.setEditorTrackTool(false);
      this.ui.showEditorWheelValue("SELECT MODE");
      return true;
    }
    if (this.editorWallBrush !== null) {
      this.editorWallBrush = null;
      this.editorPreview?.hideTrackRangePreview();
      this.ui.setEditorWallBrush(null, null);
      this.ui.showEditorWheelValue("WALL BRUSH OFF");
      return true;
    }
    if (this.editorTrackRangeSelectActive) {
      this.editorTrackRangeSelectActive = false;
      this.ui.setEditorTrackRangeSelectActive(false);
      this.ui.showEditorWheelValue("RANGE SELECT OFF");
      return true;
    }
    if (this.editorSelectedTrackRange !== null) {
      this.clearSelectedTrackRange();
      return true;
    }
    if (this.editorSelectedTrackId !== null && this.editorSelectedTrackNodeId !== null) {
      this.selectEditorTrack(this.editorSelectedTrackId);
      return true;
    }
    if (this.editorSelectedTrackId !== null) {
      this.clearEditorTrackSelection();
      return true;
    }
    if ((this.editorSession?.selectedEntityIds.length ?? 0) > 0) {
      this.editorSession?.select(null);
      this.editorPreview?.setSelectedEntities([]);
      this.renderEditorSelectionAndHistory();
      return true;
    }
    return false;
  }

  private undoEditorChange(): void {
    if (this.editorSession?.undo() === true) {
      this.refreshEditorDocument(true);
      this.ui.toast("Last edit undone.");
    }
  }

  private redoEditorChange(): void {
    if (this.editorSession?.redo() === true) {
      this.refreshEditorDocument(true);
      this.ui.toast("Edit restored.");
    }
  }

  private duplicateEditorSelection(): void {
    if (this.editorSession?.duplicateSelected() === true) {
      this.refreshEditorDocument(true);
      this.ui.toast("Object duplicated.");
    }
  }

  private deleteEditorSelection(): void {
    if (this.editorSession?.deleteSelected() === true) {
      this.refreshEditorDocument(true);
      this.ui.toast("Object deleted. Undo is available.");
    }
  }

  private groupEditorSelection(): void {
    if (this.editorSession?.groupSelected() !== true) {
      this.ui.toast("Select two or more ungrouped objects first.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Objects grouped. Move, turn, resize, or duplicate them together.");
  }

  private ungroupEditorSelection(): void {
    if (this.editorSession?.ungroupSelected() !== true) {
      this.ui.toast("Select a grouped object first.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Objects ungrouped. They can now be selected separately.");
  }

  private async saveEditorPrefab(title: string): Promise<void> {
    const session = this.editorSession;
    if (session === undefined) {
      return;
    }
    const normalizedTitle = title.trim() || "My Prefab";
    const prefabDocument = session.createSelectedPrefabDocument(normalizedTitle);
    if (prefabDocument === null) {
      this.ui.toast("Select one or more objects to save as a prefab.");
      return;
    }
    try {
      await this.mapRepository.createPrefab(normalizedTitle, prefabDocument);
      const name = document.getElementById("editor-prefab-name");
      if (name instanceof HTMLInputElement) {
        name.value = "";
      }
      await this.refreshEditorPrefabs();
      this.ui.toast(`${normalizedTitle} saved. It is ready in My Prefabs.`);
    } catch (error) {
      this.ui.toast(`Prefab could not be saved: ${errorMessage(error)}`);
    }
  }

  private async selectEditorPrefab(localPrefabId: string): Promise<void> {
    if (this.state !== AppState.Editing) {
      return;
    }
    try {
      const prefab = await this.mapRepository.getPrefab(localPrefabId);
      if (prefab === null) {
        throw new Error("That prefab no longer exists.");
      }
      this.editorPrefabTool = prefab;
      this.editorPrefabYaw = 0;
      this.editorTool = null;
      this.editorTrackToolActive = false;
      this.editorSession?.select(null);
      this.editorPreview?.setSelectedEntities([]);
      this.editorPreview?.hidePlacementGhost();
      this.ui.setEditorActiveTool(null);
      this.ui.setEditorTrackTool(false);
      this.ui.renderEditorPrefabs(
        this.editorPrefabs.map((item) => ({
          localPrefabId: item.localPrefabId,
          title: item.title,
          objectCount: item.document.entities.length,
        })),
        localPrefabId,
      );
      this.renderEditorSelectionAndHistory();
      this.ui.showEditorWheelValue(
        `${prefab.title.toUpperCase()} READY · WHEEL TURNS · CLICK PLACES`,
      );
    } catch (error) {
      this.ui.toast(`Prefab could not be opened: ${errorMessage(error)}`);
    }
  }

  private async deleteEditorPrefab(localPrefabId: string): Promise<void> {
    try {
      if (!(await this.mapRepository.deletePrefab(localPrefabId))) {
        throw new Error("That prefab no longer exists.");
      }
      if (this.editorPrefabTool?.localPrefabId === localPrefabId) {
        this.editorPrefabTool = undefined;
        this.editorPreview?.hidePlacementGhost();
      }
      await this.refreshEditorPrefabs();
      this.ui.toast("Prefab removed. Placed copies are unchanged.");
    } catch (error) {
      this.ui.toast(`Prefab could not be removed: ${errorMessage(error)}`);
    }
  }

  private async refreshEditorPrefabs(): Promise<void> {
    try {
      this.editorPrefabs = await this.mapRepository.listPrefabs();
      this.ui.renderEditorPrefabs(
        this.editorPrefabs.map((prefab) => ({
          localPrefabId: prefab.localPrefabId,
          title: prefab.title,
          objectCount: prefab.document.entities.length,
        })),
        this.editorPrefabTool?.localPrefabId ?? null,
      );
    } catch (error) {
      this.ui.toast(`Prefabs could not load: ${errorMessage(error)}`);
    }
  }

  private groupEditorCheckpoints(): void {
    if (this.editorSession?.groupSelectedCheckpoints() !== true) {
      this.ui.toast("Select ungrouped checkpoints first. Shift-click adds more.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Checkpoint group created. Alternative gates in one group count as one step.");
  }

  private linkEditorRoute(shortcut: boolean): void {
    if (this.editorSession?.linkSelectedCheckpoints(shortcut) !== true) {
      this.ui.toast("Select two checkpoints in route order. They must be in different groups.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast(shortcut ? "Shortcut link added in purple." : "Race route linked in green.");
  }

  private toggleEditorCheckpointRequired(): void {
    if (this.editorSession?.toggleSelectedCheckpointGroupRequired() !== true) {
      this.ui.toast("Select checkpoints from one existing group first.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Checkpoint requirement updated. Optional groups may be bypassed by shortcuts.");
  }

  private assignEditorRecoveryPose(): void {
    if (this.editorSession?.assignSelectedRecoveryPose() !== true) {
      this.ui.toast("Select one Recovery Volume and one Safe Recovery Pose.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Safe recovery pose assigned. Test Mode will recover cars there.");
  }

  private clearEditorRecoveryPose(): void {
    if (this.editorSession?.clearSelectedRecoveryPose() !== true) {
      this.ui.toast("Select a linked Recovery Volume first.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Recovery link cleared.");
  }

  private linkEditorPortals(): void {
    if (this.editorSession?.linkSelectedPortals() !== true) {
      this.ui.toast("Select exactly two Portal objects. Shift-click adds the second one.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Portals linked. The blue line shows the pair.");
  }

  private clearEditorPortalLink(): void {
    if (this.editorSession?.clearSelectedPortalLink() !== true) {
      this.ui.toast("Select a linked Portal first.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Portal pair unlinked.");
  }

  private addEditorInteractionLink(
    event: InteractionEvent,
    condition: InteractionCondition | null,
    action: InteractionAction,
  ): void {
    const selection = this.editorInteractionSelection();
    if (selection === null) {
      this.ui.toast("Select a source, then Shift-click a compatible target.");
      return;
    }
    const added = this.editorSession?.addInteractionLink({
      sourceEntityId: selection.source.id,
      event,
      condition,
      targetEntityId: selection.target.id,
      action,
    });
    if (added === null || added === undefined) {
      this.ui.toast("That exact link already exists or is not safe.");
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Interaction linked. Test it right away in Test Mode.");
  }

  private removeEditorInteractionLink(interactionId: string): void {
    if (this.editorSession?.removeInteractionLink(interactionId) !== true) {
      return;
    }
    this.refreshEditorDocument(true);
    this.ui.toast("Interaction link removed.");
  }

  private editorInteractionSelection(): {
    readonly source: MapEntity;
    readonly target: MapEntity;
  } | null {
    const selected = this.editorSession?.selectedEntities ?? [];
    if (selected.length !== 2) {
      return null;
    }
    const first = selected[0]!;
    const second = selected[1]!;
    const firstSource = editorAssetManifest(first.assetId)?.linkEvents.length ?? 0;
    const firstTarget = editorAssetManifest(first.assetId)?.linkActions.length ?? 0;
    const secondSource = editorAssetManifest(second.assetId)?.linkEvents.length ?? 0;
    const secondTarget = editorAssetManifest(second.assetId)?.linkActions.length ?? 0;
    if (firstSource > 0 && secondTarget > 0) {
      return { source: first, target: second };
    }
    if (secondSource > 0 && firstTarget > 0) {
      return { source: second, target: first };
    }
    return null;
  }

  private editEditorRaceSetup(view: {
    readonly mode: MapDocument["race"]["mode"];
    readonly lapCount: number;
    readonly finishRule: MapDocument["race"]["finishRule"];
    readonly recoveryDelaySeconds: number;
    readonly recoveryPenaltySeconds: number;
  }): void {
    if (this.editorSession?.editRaceSetup(view) === true) {
      this.refreshEditorDocument(true);
      this.ui.toast(view.mode === "free-roam" ? "Free-roam mode selected." : "Race setup updated.");
    }
  }

  private editEditorEnvironment(view: EditorEnvironmentView): void {
    if (this.editorSession?.editEnvironment(view) === true) {
      const environment = this.editorSession.document.environment;
      this.audio.setMapMusic(environment.musicAssetId, environment.musicVolume);
      this.refreshEditorDocument(true);
    }
  }

  private editEditorSelection(edit: EntityTransformEdit): void {
    const position = edit.position;
    const snappedEdit: EntityTransformEdit = {
      ...(edit.primarySize === undefined ? {} : { primarySize: edit.primarySize }),
      ...(position === undefined
        ? {}
        : {
            position: !this.editorSnapSettings.gridEnabled
              ? position
              : ([
                  GameApp.snap(position[0], this.editorSnapSettings.gridSize),
                  GameApp.snap(position[1], this.editorSnapSettings.gridSize),
                  GameApp.snap(position[2], this.editorSnapSettings.gridSize),
                ] satisfies Vector3Tuple),
          }),
      ...(edit.yawRadians === undefined
        ? {}
        : {
            yawRadians: !this.editorSnapSettings.angleEnabled
              ? edit.yawRadians
              : GameApp.snap(edit.yawRadians, Math.PI / 12),
          }),
    };
    if (this.editorSession?.editSelected(snappedEdit, "Transform object") === true) {
      this.refreshEditorDocument(true);
    }
  }

  private snapPlacementPoint(point: Vector3Tuple): Vector3Tuple {
    if (!this.editorSnapSettings.gridEnabled) {
      return point;
    }
    return [
      GameApp.snap(point[0], this.editorSnapSettings.gridSize),
      point[1],
      GameApp.snap(point[2], this.editorSnapSettings.gridSize),
    ];
  }

  private editorBuildPlacement(
    clientX: number,
    clientY: number,
    viewport: DOMRectReadOnly,
  ): { readonly point: Vector3Tuple; readonly surfaceElevation: number } | null {
    const preview = this.editorPreview;
    if (preview === undefined) {
      return null;
    }
    const surface = this.editorSnapSettings.surfaceEnabled
      ? preview.pointOnBuildSurface(clientX, clientY, viewport)
      : null;
    const point = surface ?? preview.pointOnBuildPlane(clientX, clientY, viewport);
    return point === null ? null : Object.freeze({ point, surfaceElevation: surface?.[1] ?? 0 });
  }

  private currentPlacementOptions(): PlacementOptions {
    const options = this.snapPlacementOptions(this.editorPlacementOptions);
    return Object.freeze({
      ...options,
      elevation: options.elevation + this.editorPlacementSurfaceElevation,
    });
  }

  private snapTrackStrokePoint(
    point: Vector3Tuple,
    previous: Vector3Tuple | undefined,
  ): Vector3Tuple {
    if (previous === undefined || !this.editorSnapSettings.angleEnabled) {
      return this.snapPlacementPoint(point);
    }
    const deltaX = point[0] - previous[0];
    const deltaZ = point[2] - previous[2];
    const rawDistance = Math.hypot(deltaX, deltaZ);
    if (rawDistance < 1e-4) {
      return previous;
    }
    const angle = GameApp.snap(Math.atan2(deltaZ, deltaX), Math.PI / 12);
    const distance = this.editorSnapSettings.gridEnabled
      ? Math.max(
          this.editorSnapSettings.gridSize,
          GameApp.snap(rawDistance, this.editorSnapSettings.gridSize),
        )
      : rawDistance;
    return [
      previous[0] + Math.cos(angle) * distance,
      point[1],
      previous[2] + Math.sin(angle) * distance,
    ];
  }

  private trackGesturePoints(gesture: EditorTrackGesture): readonly Vector3Tuple[] {
    const connectionPosition = gesture.connectingEndpoint?.position;
    if (connectionPosition === undefined) {
      return gesture.points;
    }
    const points = [...gesture.points];
    const last = points.at(-1);
    if (last !== undefined && horizontalDistanceBetween(last, connectionPosition) < 0.75) {
      points[points.length - 1] = connectionPosition;
    } else {
      points.push(connectionPosition);
    }
    return Object.freeze(points);
  }

  private showTrackGestureGhost(gesture: EditorTrackGesture): void {
    const gesturePoints = this.trackGesturePoints(gesture);
    if (gesture.extendingTrackId === null && gesture.connectingEndpoint === null) {
      this.editorPreview?.showTrackGhost(gesturePoints, this.editorTrackOptions);
      return;
    }
    const first = gesturePoints[0];
    if (first === undefined) {
      return;
    }
    const startElevation = gesture.extendingTrackId === null ? gesture.targetElevation : first[1];
    const points = shapeTrackElevationTransition(
      gesturePoints,
      startElevation,
      gesture.connectingEndpoint?.position[1] ?? gesture.targetElevation,
      this.editorTrackOptions.width,
    );
    this.editorPreview?.showTrackGhost(points, {
      ...this.editorTrackOptions,
      // Extension points already carry their absolute eased elevation.
      elevation: 0,
    });
  }

  private trackEndpointNear(
    point: Vector3Tuple,
    exclude?: Readonly<{ trackId: string; side: TrackEndpointSide }>,
  ): EditorTrackEndpoint | null {
    const tracks = this.editorSession?.document.tracks ?? [];
    let nearest: {
      track: TrackDefinition;
      position: Vector3Tuple;
      side: TrackEndpointSide;
      distance: number;
    } | null = null;
    for (const track of tracks) {
      if (track.closed) {
        continue;
      }
      for (const side of ["start", "end"] as const) {
        if (exclude?.trackId === track.id && exclude.side === side) {
          continue;
        }
        const node = side === "start" ? track.nodes[0] : track.nodes.at(-1);
        if (node === undefined) {
          continue;
        }
        // Track drawing happens on a horizontal build plane, so endpoint
        // capture must be based on plan-view distance across all layers.
        const distance = horizontalDistanceBetween(node.position, point);
        const captureDistance = Math.min(6, Math.max(3, node.width * 0.75));
        if (distance <= captureDistance && (nearest === null || distance < nearest.distance)) {
          nearest = { track, position: node.position, side, distance };
        }
      }
    }
    return nearest;
  }

  private trackEndpointAtScreen(
    clientX: number,
    clientY: number,
    viewport: DOMRectReadOnly,
    planePoint: Vector3Tuple,
    exclude?: Readonly<{ trackId: string; side: TrackEndpointSide }>,
  ): EditorTrackEndpoint | null {
    const picked = this.editorPreview?.pickTarget(clientX, clientY, viewport);
    const endpoint = this.trackEndpointFromPick(picked ?? null, exclude);
    if (endpoint !== null) {
      return endpoint;
    }
    return this.trackEndpointNear(planePoint, exclude);
  }

  private trackEndpointFromPick(
    picked: EditorPickTarget | null,
    exclude?: Readonly<{ trackId: string; side: TrackEndpointSide }>,
  ): EditorTrackEndpoint | null {
    if (
      picked?.kind !== "track-endpoint" ||
      (exclude?.trackId === picked.trackId && exclude.side === picked.side)
    ) {
      return null;
    }
    const track = this.editorSession?.document.tracks.find(
      (candidate) => candidate.id === picked.trackId,
    );
    const node = track?.nodes.find((candidate) => candidate.id === picked.nodeId);
    return track === undefined || node === undefined
      ? null
      : Object.freeze({ track, position: node.position, side: picked.side });
  }

  private snapPlacementOptions(options: PlacementOptions): PlacementOptions {
    return this.editorSnapSettings.angleEnabled
      ? {
          ...options,
          yawRadians: GameApp.snap(options.yawRadians, Math.PI / 12),
        }
      : options;
  }

  private updateEditorPointerTransform(
    gesture: EditorObjectGesture,
    deltaX: number,
    deltaY: number,
    event: PointerEvent,
  ): void {
    const session = this.editorSession;
    const preview = this.editorPreview;
    if (session === undefined || preview === undefined) {
      return;
    }
    if (this.editorTransformMode === "move") {
      const point = preview.pointOnBuildPlane(
        event.clientX,
        event.clientY,
        GameApp.canvas().getBoundingClientRect(),
      );
      const previous = gesture.lastWorldPoint;
      if (point === null || previous === null) {
        return;
      }
      gesture.lastWorldPoint = point;
      gesture.accumulatedX += point[0] - previous[0];
      gesture.accumulatedZ += point[2] - previous[2];
      const snapSize = this.editorSnapSettings.gridEnabled ? this.editorSnapSettings.gridSize : 0;
      const desiredX = GameApp.snap(gesture.accumulatedX, snapSize);
      const desiredZ = GameApp.snap(gesture.accumulatedZ, snapSize);
      const applied = session.translateSelected(
        [desiredX - gesture.appliedX, 0, desiredZ - gesture.appliedZ],
        0,
      );
      gesture.appliedX = desiredX;
      gesture.appliedZ = desiredZ;
      if (!applied) {
        return;
      }
      this.ui.showEditorWheelValue(
        `MOVE X ${desiredX.toFixed(1)} · Z ${desiredZ.toFixed(1)}${snapSize > 0 ? " · SNAP" : ""}`,
      );
    } else if (this.editorTransformMode === "rotate") {
      gesture.accumulated += deltaX * 0.012;
      const angleSnap = this.editorSnapSettings.angleEnabled ? Math.PI / 12 : 0;
      const desired = GameApp.snap(gesture.accumulated, angleSnap);
      if (!session.rotateSelected(desired - gesture.applied, 0)) {
        return;
      }
      gesture.applied = desired;
      this.ui.showEditorWheelValue(
        `TURN ${Math.round((desired * 180) / Math.PI).toString()}°${angleSnap > 0 ? " · SNAP" : ""}`,
      );
    } else {
      gesture.accumulated += (deltaX - deltaY) * 0.01;
      const desired = Math.round(gesture.accumulated * 10) / 10;
      if (!session.scaleSelected(desired - gesture.applied)) {
        return;
      }
      gesture.applied = desired;
      this.ui.showEditorWheelValue(`RESIZE ${desired >= 0 ? "+" : ""}${desired.toFixed(1)} M`);
    }
    this.refreshEditorDocument(false);
  }

  private refreshEditorDocument(markPending: boolean): void {
    const session = this.editorSession;
    if (session === undefined) {
      return;
    }
    const blueprint = compileMapDocument(session.document);
    this.editorPreview?.rebuild(session.document);
    this.editorPreview?.setSelectedEntities(session.selectedEntityIds);
    this.editorPreview?.setSelectedTrack(
      this.editorSelectedTrackId,
      session.document,
      this.editorSelectedTrackNodeId,
    );
    this.ui.updateEditorDocument({
      revision: this.editorMap?.revision ?? 1,
      objectCount: session.document.entities.length + session.document.tracks.length,
      schemaVersion: session.document.header.schemaVersion,
      diagnostics: blueprint.diagnostics.map((diagnostic) => diagnostic.message),
      healthy: blueprint.freeDriveReady,
    });
    this.renderEditorSelectionAndHistory();
    if (markPending) {
      this.persistEditorRecoveryEntry(session.document);
    }
  }

  private renderEditorSelectionAndHistory(): void {
    const session = this.editorSession;
    if (session === undefined) {
      this.ui.renderEditorSelection(null);
      this.ui.renderEditorPrefabSave(false);
      this.ui.renderEditorGrouping(false, false);
      this.ui.renderEditorPhysics(null);
      this.ui.renderEditorMotion(null);
      this.ui.renderEditorBoostPad(null);
      this.ui.renderEditorSurfacePad(null);
      this.ui.renderEditorGuidance(null);
      this.ui.renderEditorDecoration(null);
      this.ui.renderEditorPortalLink(null);
      this.ui.renderEditorInteractionLink(null);
      this.ui.renderEditorRouteActions(null);
      this.ui.renderEditorRecoveryLink(null);
      this.ui.updateEditorHistory(false, false, null, null);
      return;
    }
    const selected = session.selectedEntity;
    this.ui.renderEditorRaceSetup({
      mode: session.document.race.mode,
      lapCount: session.document.race.lapCount,
      finishRule: session.document.race.finishRule,
      recoveryDelaySeconds: session.document.race.recovery.delaySeconds,
      recoveryPenaltySeconds: session.document.race.recovery.penaltySeconds,
    });
    const environment = session.document.environment;
    this.ui.renderEditorEnvironment({
      groundMode: environment.groundMode,
      skyPreset: environment.skyPreset,
      backgroundColor: environment.backgroundColor,
      keyLightDirection: environment.keyLight.direction,
      keyLightIntensity: environment.keyLight.intensity,
      keyLightColor: environment.keyLight.color,
      ambientLightIntensity: environment.ambientLight.intensity,
      ambientLightColor: environment.ambientLight.color,
      gravityStrength: Math.abs(environment.gravity[1]),
      fogEnabled: environment.fog.enabled,
      fogColor: environment.fog.color,
      fogNear: environment.fog.near,
      fogFar: environment.fog.far,
      musicAssetId: environment.musicAssetId,
      musicVolume: environment.musicVolume,
      outOfBoundsHeight: environment.outOfBoundsHeight,
    });
    const track = this.selectedTrack();
    if (this.editorSelectedTrackId !== null && track === undefined) {
      this.editorSelectedTrackId = null;
      this.editorSelectedTrackNodeId = null;
    }
    const trackNode = this.selectedTrackNode();
    if (this.editorSelectedTrackNodeId !== null && trackNode === undefined) {
      this.editorSelectedTrackNodeId = null;
    }
    this.ui.renderEditorTrack(
      track === undefined
        ? null
        : {
            closed: track.closed,
            width: average(track.nodes.map((node) => node.width)),
            elevation: average(track.nodes.map((node) => node.position[1])),
            bankDegrees: (average(track.nodes.map((node) => node.bankRadians)) * 180) / Math.PI,
            leftWall: track.walls.some((wall) => wall.side === "left"),
            rightWall: track.walls.some((wall) => wall.side === "right"),
          },
    );
    const selectedNode = this.selectedTrackNode();
    const selectedNodeIndex =
      selectedNode === undefined || track === undefined
        ? -1
        : track.nodes.findIndex((node) => node.id === selectedNode.id);
    this.ui.renderEditorTrackNode(
      selectedNode === undefined || track === undefined
        ? null
        : {
            index: selectedNodeIndex + 1,
            total: track.nodes.length,
            position: selectedNode.position,
            width: selectedNode.width,
            bankDegrees: (selectedNode.bankRadians * 180) / Math.PI,
            canDelete: track.nodes.length > (track.closed ? 3 : 2),
            canSplit:
              track.closed || (selectedNodeIndex > 0 && selectedNodeIndex < track.nodes.length - 1),
            endpoint:
              track.closed || selectedNodeIndex < 0
                ? null
                : selectedNodeIndex === 0
                  ? "start"
                  : selectedNodeIndex === track.nodes.length - 1
                    ? "end"
                    : null,
          },
    );
    let selectedRange = this.editorSelectedTrackRange;
    if (track === undefined || selectedRange?.trackId !== track.id) {
      selectedRange = null;
      this.editorSelectedTrackRange = null;
      this.editorPreview?.hideTrackRangePreview();
    } else {
      selectedRange = selectedTrackRange(
        track,
        selectedRange.startDistance,
        selectedRange.endDistance,
        selectedRange.side,
      );
      this.editorSelectedTrackRange = selectedRange;
    }
    if (selectedRange === null || track === undefined) {
      this.ui.renderEditorTrackRange(null);
    } else {
      const midpoint = (selectedRange.startDistance + selectedRange.endDistance) / 2;
      const sampleWall = track.walls.find(
        (wall) =>
          (selectedRange.side === "both" || wall.side === selectedRange.side) &&
          wall.startDistance <= midpoint &&
          wall.endDistance >= midpoint,
      );
      const sampleRoadRange = (track.roadRanges ?? []).find(
        (range) => range.startDistance <= midpoint && range.endDistance >= midpoint,
      );
      const baseRoadShape = baseTrackShapeAtDistance(track, midpoint);
      this.ui.renderEditorTrackRange({
        selectionKey: `${track.id}:${selectedRange.startDistance.toFixed(4)}:${selectedRange.endDistance.toFixed(4)}`,
        length: selectedRange.endDistance - selectedRange.startDistance,
        side: selectedRange.side,
        height: sampleWall?.height ?? 1.2,
        thickness: sampleWall?.thickness ?? 0.2,
        styleId: wallStyleForInspector(sampleWall?.styleId ?? "wall.clean"),
        roadWidth: sampleRoadRange?.width ?? baseRoadShape.width,
        roadBankDegrees:
          ((sampleRoadRange?.bankRadians ?? baseRoadShape.bankRadians) * 180) / Math.PI,
        roadSurface: sampleRoadRange?.surface ?? track.surface,
        roadMaterialId: trackMaterialForInspector(sampleRoadRange?.materialId ?? track.materialId),
        roadSurfaceStrength: sampleRoadRange?.surfaceStrength ?? 1,
        roadSurfaceCooldownSeconds:
          sampleRoadRange?.surfaceCooldownSeconds ??
          defaultTrackSurfaceCooldownSeconds(sampleRoadRange?.surface ?? track.surface),
      });
      this.editorPreview?.showTrackRangePreview(
        track,
        selectedRange.startDistance,
        selectedRange.endDistance,
        selectedRange.side,
        "select",
      );
    }
    this.ui.renderEditorSelection(
      selected === null || track !== undefined
        ? null
        : {
            name: this.editorEntityName(selected),
            position: selected.transform.position,
            yawDegrees: (readYaw(selected.transform.rotation) * 180) / Math.PI,
            primarySize: primarySize(selected),
            primarySizeLabel:
              editorAssetManifest(selected.assetId)?.sizeLabel ?? "SCALE · KEEPS SHAPE",
          },
      track === undefined ? session.selectedEntityIds.length : 0,
    );
    const selectedObjectGroupIds = new Set(
      session.selectedEntities
        .map((entity) => entity.groupId)
        .filter((groupId): groupId is string => groupId !== null),
    );
    this.ui.renderEditorGrouping(
      track === undefined &&
        session.selectedEntityIds.length >= 2 &&
        !(
          selectedObjectGroupIds.size === 1 &&
          session.selectedEntities.every(
            (entity) => entity.groupId === [...selectedObjectGroupIds][0],
          )
        ),
      track === undefined && selectedObjectGroupIds.size > 0,
    );
    this.ui.renderEditorPrefabSave(
      track === undefined &&
        session.selectedEntityIds.length > 0 &&
        this.editorPrefabTool === undefined,
    );
    const dynamicSelected =
      selected?.assetId === "physics.ball" ||
      selected?.assetId === "physics.cube" ||
      selected?.assetId === "physics.domino"
        ? selected
        : null;
    this.ui.renderEditorPhysics(
      dynamicSelected === null || track !== undefined
        ? null
        : {
            mass: entityNumberProperty(dynamicSelected, "mass", 2),
            friction: entityNumberProperty(dynamicSelected, "friction", 0.7),
            restitution: entityNumberProperty(dynamicSelected, "restitution", 0.2),
          },
    );
    const motionSelected =
      selected?.assetId === "motion.moving-platform" ||
      selected?.assetId === "motion.rotating-bar" ||
      selected?.assetId === "motion.door"
        ? selected
        : null;
    this.ui.renderEditorMotion(
      motionSelected === null || track !== undefined
        ? null
        : motionSelected.assetId === "motion.moving-platform" ||
            motionSelected.assetId === "motion.door"
          ? {
              kind: "platform",
              speed: entityNumberProperty(
                motionSelected,
                "speed",
                motionSelected.assetId === "motion.door" ? 2 : 1.5,
              ),
              dwellSeconds: entityNumberProperty(
                motionSelected,
                "dwellSeconds",
                motionSelected.assetId === "motion.door" ? 2 : 1,
              ),
              offset: [
                entityNumberProperty(motionSelected, "offsetX", 0),
                entityNumberProperty(
                  motionSelected,
                  "offsetY",
                  motionSelected.assetId === "motion.door"
                    ? entityNumberProperty(motionSelected, "height", 4) + 0.4
                    : 5,
                ),
                entityNumberProperty(motionSelected, "offsetZ", 0),
              ],
            }
          : {
              kind: "rotating-bar",
              speed: entityNumberProperty(motionSelected, "degreesPerSecond", 90),
              dwellSeconds: 0,
              offset: [0, 0, 0],
            },
    );
    const boostSelected =
      selected?.assetId === "travel.boost-pad" || selected?.assetId === "travel.launch-pad"
        ? selected
        : null;
    this.ui.renderEditorBoostPad(
      boostSelected === null || track !== undefined
        ? null
        : {
            kind: boostSelected.assetId === "travel.launch-pad" ? "launch" : "boost",
            boostSpeed: entityNumberProperty(boostSelected, "boostSpeed", 6),
            liftSpeed: entityNumberProperty(
              boostSelected,
              "liftSpeed",
              boostSelected.assetId === "travel.launch-pad" ? 7 : 0,
            ),
            cooldownSeconds: entityNumberProperty(boostSelected, "cooldownSeconds", 0.35),
          },
    );
    const surfacePadSelected =
      selected?.assetId === "travel.bounce-pad" || selected?.assetId === "travel.slow-zone"
        ? selected
        : null;
    this.ui.renderEditorSurfacePad(
      surfacePadSelected === null || track !== undefined
        ? null
        : surfacePadSelected.assetId === "travel.slow-zone"
          ? {
              kind: "slow",
              strength: entityNumberProperty(surfacePadSelected, "speedMultiplier", 0.4),
              cooldownSeconds: entityNumberProperty(surfacePadSelected, "cooldownSeconds", 0.25),
            }
          : {
              kind: "bounce",
              strength: entityNumberProperty(surfacePadSelected, "bounceSpeed", 9),
              cooldownSeconds: entityNumberProperty(surfacePadSelected, "cooldownSeconds", 0.5),
            },
    );
    const guidanceSelected =
      selected?.assetId === "travel.direction-arrow" ||
      selected?.assetId === "decoration.arrow-sign"
        ? selected
        : null;
    const guidanceColor = guidanceSelected?.properties["color"];
    this.ui.renderEditorGuidance(
      guidanceSelected === null || track !== undefined
        ? null
        : {
            kind: guidanceSelected.assetId === "decoration.arrow-sign" ? "sign" : "marker",
            color:
              typeof guidanceColor === "string"
                ? guidanceColor
                : guidanceSelected.assetId === "decoration.arrow-sign"
                  ? "#28d7e5"
                  : "#f7e44d",
            glow: entityNumberProperty(guidanceSelected, "glow", 0.5),
            solid: guidanceSelected.properties["solid"] === true,
          },
    );
    const decorationSelected =
      selected?.assetId === "decoration.point-light" ||
      selected?.assetId === "decoration.color-strip"
        ? selected
        : null;
    const decorationColor = decorationSelected?.properties["color"];
    this.ui.renderEditorDecoration(
      decorationSelected === null || track !== undefined
        ? null
        : {
            kind: decorationSelected.assetId === "decoration.point-light" ? "light" : "strip",
            color:
              typeof decorationColor === "string"
                ? decorationColor
                : decorationSelected.assetId === "decoration.point-light"
                  ? "#ffd166"
                  : "#35d5df",
            glow: entityNumberProperty(decorationSelected, "glow", 0.8),
            intensity: entityNumberProperty(decorationSelected, "intensity", 4),
            range: entityNumberProperty(decorationSelected, "range", 14),
            enabled: decorationSelected.properties["enabled"] !== false,
          },
    );
    const routeSelection = session.selectedEntities;
    const checkpointsOnly =
      track === undefined &&
      routeSelection.length > 0 &&
      routeSelection.every((entity) => entity.assetId === "race.checkpoint");
    const assignedCheckpointIds = new Set(
      session.document.race.checkpointGroups.flatMap((group) => group.checkpointEntityIds),
    );
    const selectedCheckpointIds = new Set(routeSelection.map((entity) => entity.id));
    const selectedCheckpointGroups = session.document.race.checkpointGroups.filter((group) =>
      group.checkpointEntityIds.some((checkpointId) => selectedCheckpointIds.has(checkpointId)),
    );
    this.ui.renderEditorRouteActions(
      checkpointsOnly
        ? {
            checkpointCount: routeSelection.length,
            canGroup: routeSelection.every(
              (checkpoint) => !assignedCheckpointIds.has(checkpoint.id),
            ),
            canLink: routeSelection.length === 2,
            groupRequired:
              selectedCheckpointGroups.length === 1 ? selectedCheckpointGroups[0]!.required : null,
          }
        : null,
    );
    const recoveryVolume = routeSelection.find(
      (entity) => entity.assetId === "race.recovery-volume",
    );
    const selectedRecoveryPose = routeSelection.find(
      (entity) => entity.assetId === "race.recovery-pose",
    );
    const linkedRecoveryPoseId = recoveryVolume?.properties["safePoseEntityId"];
    const linkedRecoveryPose =
      typeof linkedRecoveryPoseId === "string"
        ? session.document.entities.find((entity) => entity.id === linkedRecoveryPoseId)
        : undefined;
    this.ui.renderEditorRecoveryLink(
      track === undefined && recoveryVolume !== undefined
        ? {
            canAssign: routeSelection.length === 2 && selectedRecoveryPose !== undefined,
            canClear: linkedRecoveryPose !== undefined,
            linkedPoseName:
              linkedRecoveryPose === undefined ? null : this.editorEntityName(linkedRecoveryPose),
          }
        : null,
    );
    const selectedPortals = routeSelection.filter((entity) => entity.assetId === "travel.portal");
    const selectedPortal = selectedPortals[0];
    const peerPortalId = selectedPortal?.properties["peerPortalEntityId"];
    const linkedPortal =
      typeof peerPortalId === "string"
        ? session.document.entities.find((entity) => entity.id === peerPortalId)
        : undefined;
    this.ui.renderEditorPortalLink(
      track === undefined && selectedPortals.length > 0
        ? {
            selectedPortalCount: selectedPortals.length,
            canLink:
              selectedPortals.length === 2 &&
              selectedPortals[0]?.properties["peerPortalEntityId"] !== selectedPortals[1]?.id,
            canClear: linkedPortal?.assetId === "travel.portal",
            linkedPortalName:
              linkedPortal?.assetId === "travel.portal"
                ? this.editorEntityName(linkedPortal)
                : null,
          }
        : null,
    );
    const interactionSelection = track === undefined ? this.editorInteractionSelection() : null;
    if (interactionSelection === null) {
      this.ui.renderEditorInteractionLink(null);
    } else {
      const sourceManifest = editorAssetManifest(interactionSelection.source.assetId)!;
      const targetManifest = editorAssetManifest(interactionSelection.target.assetId)!;
      const relevantLinks = session.document.interactions.filter(
        (interaction) =>
          interaction.sourceEntityId === interactionSelection.source.id &&
          interaction.targetEntityId === interactionSelection.target.id,
      );
      this.ui.renderEditorInteractionLink({
        sourceName: this.editorEntityName(interactionSelection.source),
        targetName: this.editorEntityName(interactionSelection.target),
        events: sourceManifest.linkEvents as readonly InteractionEvent[],
        actions: targetManifest.linkActions as readonly InteractionAction[],
        links: relevantLinks.map((interaction) => ({
          id: interaction.id,
          summary: `${interaction.event.replaceAll("-", " ")} → ${interaction.action.replaceAll("-", " ")}${interaction.condition === null ? "" : ` · ${interaction.condition.replaceAll("-", " ")}`}`,
        })),
      });
    }
    const snapshot = session.snapshot();
    this.ui.updateEditorHistory(
      snapshot.canUndo,
      snapshot.canRedo,
      snapshot.undoLabel,
      snapshot.redoLabel,
    );
  }

  private scheduleEditorAutosave(): void {
    window.clearTimeout(this.editorAutosaveTimeout);
    this.editorAutosaveTimeout = window.setTimeout(() => {
      this.editorAutosaveTimeout = undefined;
      const title = document.getElementById("editor-map-name");
      if (title instanceof HTMLInputElement) {
        void this.saveEditorMap(title.value);
      }
    }, 700);
  }

  /** Saves a pending autosave right away, for when the page is being hidden or closed. */
  private flushEditorAutosave(): void {
    if (this.editorAutosaveTimeout === undefined || this.state !== AppState.Editing) {
      return;
    }
    window.clearTimeout(this.editorAutosaveTimeout);
    this.editorAutosaveTimeout = undefined;
    const title = document.getElementById("editor-map-name");
    if (title instanceof HTMLInputElement) {
      void this.saveEditorMap(title.value);
    }
  }

  private persistEditorRecoveryEntry(document: MapDocument): void {
    const current = this.editorMap;
    if (current === undefined) {
      return;
    }
    const generation = ++this.editorRecoveryGeneration;
    this.ui.setEditorSaveStatus("SAVING RECOVERY…", "pending");
    this.editorRecoveryWrite = this.editorRecoveryWrite
      .catch(() => undefined)
      .then(async () => {
        await this.mapRepository.appendRecoveryEntry(
          current.localMapId,
          document,
          current.revision,
        );
      });
    void this.editorRecoveryWrite
      .then(() => {
        if (
          generation === this.editorRecoveryGeneration &&
          this.state === AppState.Editing &&
          this.editorMap?.localMapId === current.localMapId
        ) {
          this.ui.setEditorSaveStatus("RECOVERY SAVED · NAMED SAVE PENDING", "pending");
          this.scheduleEditorAutosave();
        }
      })
      .catch((error: unknown) => {
        if (generation === this.editorRecoveryGeneration) {
          this.ui.setEditorSaveStatus("RECOVERY SAVE FAILED", "failed");
          this.ui.toast(`Recovery save failed: ${errorMessage(error)}. Export a backup.`);
        }
      });
  }

  private adjustPlacementOptions(steps: number, mode: "primary" | "elevation" | "rotation"): void {
    const current = this.editorPlacementOptions;
    if (mode === "elevation") {
      this.editorPlacementOptions = {
        ...current,
        elevation: GameApp.clamp(current.elevation + steps * 0.25, -500, 500),
      };
    } else if (mode === "rotation") {
      this.editorPlacementOptions = {
        ...current,
        yawRadians: current.yawRadians + steps * (Math.PI / 36),
      };
    } else {
      const manifest = this.editorTool === null ? null : editorAssetManifest(this.editorTool);
      const minimum = manifest?.minimumPrimarySize ?? 1;
      const maximum = manifest?.maximumPrimarySize ?? 100;
      this.editorPlacementOptions = {
        ...current,
        primarySize: GameApp.clamp(current.primarySize + steps * 0.5, minimum, maximum),
      };
    }
  }

  private adjustTrackPlacementOptions(
    steps: number,
    mode: "primary" | "elevation" | "rotation",
  ): void {
    const current = this.editorTrackOptions;
    this.editorTrackOptions =
      mode === "elevation"
        ? {
            ...current,
            elevation: GameApp.clamp(current.elevation + steps * 0.25, -500, 500),
          }
        : mode === "rotation"
          ? {
              ...current,
              bankRadians: GameApp.clamp(
                current.bankRadians + steps * (Math.PI / 72),
                -Math.PI / 3,
                Math.PI / 3,
              ),
            }
          : {
              ...current,
              width: GameApp.clamp(current.width + steps * 0.5, 1, 100),
            };
  }

  private trackOptionsFromTrack(track: TrackDefinition): TrackPlacementOptions {
    return {
      width: average(track.nodes.map((node) => node.width)),
      elevation: average(track.nodes.map((node) => node.position[1])),
      bankRadians: average(track.nodes.map((node) => node.bankRadians)),
    };
  }

  private showTrackWheelValue(
    mode: "primary" | "elevation" | "rotation",
    options: TrackPlacementOptions,
  ): void {
    const selected = this.selectedTrack();
    const lengthLabel =
      selected === undefined ? "" : ` · ${trackLength(selected).toFixed(0)} M LONG`;
    const message =
      mode === "elevation"
        ? `TRACK HEIGHT ${options.elevation.toFixed(2)} M`
        : mode === "rotation"
          ? `TRACK BANK ${Math.round((options.bankRadians * 180) / Math.PI).toString()}°`
          : `TRACK WIDTH ${options.width.toFixed(1)} M`;
    this.ui.showEditorWheelValue(`${message}${lengthLabel}`);
  }

  private showPlacementWheelValue(mode: "primary" | "elevation" | "rotation"): void {
    const value =
      mode === "elevation"
        ? `HEIGHT ${this.editorPlacementOptions.elevation.toFixed(2)} M`
        : mode === "rotation"
          ? `ANGLE ${Math.round((this.editorPlacementOptions.yawRadians * 180) / Math.PI).toString()}°`
          : `SIZE ${this.editorPlacementOptions.primarySize.toFixed(1)} M`;
    this.ui.showEditorWheelValue(value);
  }

  private showSelectedWheelValue(mode: "primary" | "elevation" | "rotation"): void {
    const selected = this.editorSession?.selectedEntity;
    if (selected === null || selected === undefined) {
      return;
    }
    const value =
      mode === "elevation"
        ? `HEIGHT ${selected.transform.position[1].toFixed(2)} M`
        : mode === "rotation"
          ? `ANGLE ${Math.round((readYaw(selected.transform.rotation) * 180) / Math.PI).toString()}°`
          : `SIZE ${primarySize(selected).toFixed(1)} M`;
    this.ui.showEditorWheelValue(value);
  }

  private startEditorTutorial(): void {
    this.editorTutorialStep = 1;
    this.renderEditorTutorial();
  }

  private nextEditorTutorialStep(): void {
    if (this.editorTutorialStep <= 0) {
      return;
    }
    if (this.editorTutorialStep >= 7) {
      this.finishEditorTutorial();
      return;
    }
    this.editorTutorialStep += 1;
    this.renderEditorTutorial();
  }

  private advanceEditorTutorial(completedStep: number): void {
    if (this.editorTutorialStep !== completedStep) {
      return;
    }
    this.nextEditorTutorialStep();
  }

  private renderEditorTutorial(): void {
    const steps = [
      {
        instruction: "Move the camera.",
        detail: "Right-drag to orbit or middle-drag to pan.",
      },
      {
        instruction: "Draw a road.",
        detail: "Choose TRACK, then press and drag a short road.",
      },
      {
        instruction: "Scroll to make it wider.",
        detail: "Keep TRACK selected and roll the mouse wheel.",
      },
      {
        instruction: "Add a ramp.",
        detail: "Choose RAMP and click beside your road.",
      },
      {
        instruction: "Paint some walls.",
        detail: "Select the road, choose PAINT WALLS, then drag on it.",
      },
      {
        instruction: "Place a start and finish.",
        detail: "Add START GRID and FINISH GATE so racers know where to go.",
      },
      {
        instruction: "Test-drive your track!",
        detail: "Press TEST and drive. Your edit map stays safe.",
      },
    ] as const;
    const step = steps[this.editorTutorialStep - 1];
    this.ui.renderEditorTutorial(
      step === undefined
        ? null
        : {
            step: this.editorTutorialStep,
            totalSteps: steps.length,
            instruction: step.instruction,
            detail: step.detail,
          },
    );
  }

  private finishEditorTutorial(): void {
    this.editorTutorialStep = 0;
    this.ui.renderEditorTutorial(null);
    try {
      window.localStorage.setItem("mini-wheels-editor-tutorial-v2", "complete");
    } catch {
      // The tutorial remains replayable when private storage is unavailable.
    }
  }

  private editorTutorialComplete(): boolean {
    try {
      return window.localStorage.getItem("mini-wheels-editor-tutorial-v2") === "complete";
    } catch {
      return false;
    }
  }

  private handleEditorKeyboardShortcut(event: KeyboardEvent): boolean {
    const commandKey = event.ctrlKey || event.metaKey;
    if (commandKey && event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) {
        this.redoEditorChange();
      } else {
        this.undoEditorChange();
      }
      return true;
    }
    if (commandKey && event.code === "KeyY") {
      event.preventDefault();
      this.redoEditorChange();
      return true;
    }
    if (commandKey && event.code === "KeyC") {
      event.preventDefault();
      this.editorClipboard = Object.freeze([...(this.editorSession?.selectedEntities ?? [])]);
      this.ui.toast(
        this.editorClipboard.length === 0
          ? "Select an object before copying."
          : `${String(this.editorClipboard.length)} object${this.editorClipboard.length === 1 ? "" : "s"} copied.`,
      );
      return true;
    }
    if (commandKey && event.code === "KeyV") {
      event.preventDefault();
      if (this.editorSession?.pasteEntities(this.editorClipboard) === true) {
        this.refreshEditorDocument(true);
        this.ui.toast("Pasted as a new editable copy.");
      }
      return true;
    }
    if (commandKey && event.code === "KeyG") {
      event.preventDefault();
      if (event.shiftKey) {
        this.ungroupEditorSelection();
      } else {
        this.groupEditorSelection();
      }
      return true;
    }
    if (event.code === "Delete" || event.code === "Backspace") {
      event.preventDefault();
      if (this.editorSelectedTrackNodeId !== null) {
        this.deleteSelectedTrackNode();
      } else if (this.editorSelectedTrackId !== null) {
        this.deleteSelectedTrack();
      } else {
        this.deleteEditorSelection();
      }
      return true;
    }
    if (event.code === "KeyF" && !commandKey && !event.altKey) {
      event.preventDefault();
      const session = this.editorSession;
      if (this.editorSelectedTrackId !== null && session !== undefined) {
        this.editorPreview?.frameTrack(session.document, this.editorSelectedTrackId);
      } else {
        this.editorPreview?.frameSelected();
      }
      return true;
    }
    return false;
  }

  private editorEntityName(entity: MapEntity): string {
    return editorAssetManifest(entity.assetId)?.name.toLocaleUpperCase() ?? "OBJECT";
  }

  private createWorldSession(mapBlueprint?: RuntimeMapBlueprint): WorldSession {
    if (this.rapier === undefined || this.renderSystem === undefined) {
      throw new Error("Physics and rendering must be ready before creating a world session.");
    }
    return new WorldSession(
      this.rapier,
      this.renderSystem.scene,
      this.settingsService.current.playerCount,
      this.renderSystem.camera,
      GameApp.markerOverlay(),
      {
        ...(mapBlueprint === undefined ? {} : { mapBlueprint }),
        particleDensity: this.settingsService.current.particleDensity,
        cameraSmoothing: this.settingsService.current.cameraSmoothing,
        markerSize: this.settingsService.current.markerSize,
        automaticUprightRecovery: this.settingsService.current.automaticUprightRecovery,
        highContrastInteractables: this.settingsService.current.highContrastInteractables,
        onBoosterActivation: () => this.audio.playBooster(),
        onPortalTeleport: () => {
          this.audio.playPortal({ portalPhase: "entry" });
          this.audio.playPortal({ portalPhase: "exit" });
        },
        onVehicleRecovery: () => this.audio.playRespawn(),
      },
    );
  }

  private async startSandbox(): Promise<void> {
    if (this.rapier === undefined || this.renderSystem === undefined) {
      return;
    }
    this.disposeEditorPreview();
    this.audio.setMapMusic(null);
    this.editorMap = undefined;
    this.state = AppState.Loading;
    this.ui.show("loading");
    this.ui.setLoadingStatus("Constructing sandbox…");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      this.worldSession?.dispose();
      this.worldSession = this.createWorldSession();
      this.playtestBlueprint = undefined;
      this.normalMapPlay = false;
      this.ui.setPlaytestPauseMode(false);
      await this.renderSystem.precompile();
    } catch (error) {
      this.failLaunch(error);
      return;
    }
    this.sessionGeneration += 1;
    this.input.setGameplayEnabled(true);
    this.fixedStep.reset();
    this.previousNow = performance.now();
    this.state = AppState.Playing;
    this.audio.setGameplayPaused(false);
    for (const screen of document.querySelectorAll<HTMLElement>(".screen")) {
      screen.hidden = true;
    }
    document.getElementById("game-root")?.focus();
  }

  private pause(reason?: string): void {
    if (this.state !== AppState.Playing) {
      return;
    }
    this.state = AppState.Paused;
    this.input.setGameplayEnabled(false);
    this.fixedStep.reset();
    this.audio.playPause();
    this.audio.setGameplayPaused(true);
    this.ui.show("pause");
    if (reason !== undefined) {
      this.ui.toast(reason);
    }
  }

  private resume(): void {
    if (this.state !== AppState.Paused) {
      return;
    }
    this.ui.clearRaceResults();
    this.input.clear();
    this.input.setGameplayEnabled(true);
    this.fixedStep.reset();
    this.previousNow = performance.now();
    this.state = AppState.Playing;
    this.audio.setGameplayPaused(false);
    const pause = document.getElementById("screen-pause");
    if (pause !== null) {
      pause.hidden = true;
    }
    document.getElementById("game-root")?.focus();
    void this.audio.resume();
  }

  /** Pauses on the results card once every player has finished a scored race. */
  private showRaceResults(): void {
    const race = this.worldSession?.raceSnapshot();
    if (race === undefined || this.state !== AppState.Playing) {
      return;
    }
    this.raceResultsGeneration = this.sessionGeneration;
    this.state = AppState.Paused;
    this.input.setGameplayEnabled(false);
    this.fixedStep.reset();
    this.audio.setGameplayPaused(true);
    const rows = [...race.players]
      .sort((left, right) => (left.finishPlace ?? 99) - (right.finishPlace ?? 99))
      .map((player) => ({
        place: player.finishPlace === null ? "–" : `#${String(player.finishPlace)}`,
        detail: `P${String(player.playerIndex + 1)}  ${GameApp.raceTime(player.elapsedSeconds)}`,
      }));
    this.ui.showRaceResults(rows);
  }

  private static raceTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
  }

  private togglePause(): void {
    if (this.state === AppState.Playing) {
      this.pause();
    } else if (this.state === AppState.Paused) {
      this.resume();
    }
  }

  private async resetSandbox(): Promise<void> {
    if (
      this.rapier === undefined ||
      this.renderSystem === undefined ||
      this.state !== AppState.Paused
    ) {
      return;
    }
    this.state = AppState.Resetting;
    this.ui.clearRaceResults();
    this.input.setGameplayEnabled(false);
    this.audio.playReset();
    this.audio.stopAllEngineVoices();
    this.worldSession?.dispose();
    this.worldSession = undefined;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      this.worldSession = this.createWorldSession(this.playtestBlueprint);
      await this.renderSystem.precompile();
    } catch (error) {
      this.failLaunch(error);
      return;
    }
    this.sessionGeneration += 1;
    this.fixedStep.reset();
    this.previousNow = performance.now();
    this.state = AppState.Playing;
    this.audio.setGameplayPaused(false);
    this.input.setGameplayEnabled(true);
    const pause = document.getElementById("screen-pause");
    if (pause !== null) {
      pause.hidden = true;
    }
    document.getElementById("game-root")?.focus();
    void this.audio.resume();
  }

  private returnToMenu(): void {
    this.ui.clearRaceResults();
    if (this.playtestBlueprint !== undefined) {
      if (this.normalMapPlay) {
        this.input.setGameplayEnabled(false);
        this.audio.stopAllEngineVoices();
        this.audio.setMapMusic(null);
        this.worldSession?.dispose();
        this.worldSession = undefined;
        this.playtestBlueprint = undefined;
        this.normalMapPlay = false;
        this.fixedStep.reset();
        this.state = AppState.FrontEnd;
        void this.openMapLibrary();
        return;
      }
      this.returnToEditor();
      return;
    }
    this.input.setGameplayEnabled(false);
    this.audio.stopAllEngineVoices();
    this.audio.setMapMusic(null);
    this.worldSession?.dispose();
    this.worldSession = undefined;
    this.disposeEditorPreview();
    this.editorMap = undefined;
    this.fixedStep.reset();
    this.state = AppState.FrontEnd;
    this.ui.show("main");
    void this.audio.resume();
  }

  private updateSettings(patch: Partial<Omit<GameSettings, "schemaVersion">>): void {
    const settings = this.settingsService.update(patch);
    this.applyRuntimeSettings(settings);
  }

  private resetSettings(): void {
    const settings = this.settingsService.resetToDefaults();
    this.applyRuntimeSettings(settings);
    this.ui.toast("Settings restored to defaults.");
  }

  private applyRuntimeSettings(settings: GameSettings): void {
    this.input.configurePlayerSources(
      settings.playerInputs,
      settings.playerCount,
      settings.analogDeadZone,
      settings.analogSensitivity,
    );
    this.renderSystem?.applySettings(settings);
    this.audio.setVolumes(settings);
    this.worldSession?.setParticleDensity(settings.particleDensity);
    this.worldSession?.setCameraSmoothing(settings.cameraSmoothing);
    this.worldSession?.setMarkerSize(settings.markerSize);
    this.worldSession?.setAutomaticUprightRecovery(settings.automaticUprightRecovery);
    this.worldSession?.setHighContrastInteractables(settings.highContrastInteractables);
    this.ui.applySettings(settings);
    this.refreshDeviceUi();
  }

  private assignController(playerIndex: number, gamepadIndex: number | null): void {
    try {
      const current = this.settingsService.current;
      const gamepad =
        gamepadIndex === null
          ? undefined
          : this.input.connectedGamepads.find((candidate) => candidate.index === gamepadIndex);
      if (gamepadIndex !== null && gamepad === undefined) {
        throw new Error(`Gamepad ${String(gamepadIndex + 1)} is no longer connected.`);
      }
      const playerInputs = current.playerInputs.map((input, index) =>
        index === playerIndex
          ? {
              ...input,
              inputType: "controller" as const,
              controllerIdHint: gamepad?.id ?? null,
              controllerMappingHint: gamepad?.mapping ?? null,
              controllerCalibration:
                gamepad !== undefined &&
                gamepad.mapping !== "standard" &&
                input.controllerIdHint === gamepad.id &&
                input.controllerMappingHint === gamepad.mapping
                  ? input.controllerCalibration
                  : null,
            }
          : input,
      );
      this.updateSettings({ playerInputs });
      this.input.assignController(playerIndex, gamepadIndex);
      this.refreshDeviceUi();
    } catch (error) {
      this.refreshDeviceUi();
      this.ui.toast(errorMessage(error));
    }
  }

  private refreshDeviceUi(): void {
    this.ui.updateControllers(this.input.connectedGamepads, this.input.getControllerAssignments());
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement == null) {
        const root = document.getElementById("game-root");
        if (root === null || typeof root.requestFullscreen !== "function") {
          throw new Error("Fullscreen is unavailable.");
        }
        await root.requestFullscreen();
      } else {
        if (typeof document.exitFullscreen !== "function") {
          throw new Error("Fullscreen exit is unavailable.");
        }
        await document.exitFullscreen();
      }
    } catch {
      this.ui.toast("Fullscreen was denied by the browser. Windowed play remains available.");
    }
  }

  private frame(now: number): void {
    if (this.disposed) {
      return;
    }
    const frameDeltaSeconds = (now - this.previousNow) / 1000;
    this.previousNow = now;
    this.performanceMonitor.recordFrame(frameDeltaSeconds);
    this.input.pollGamepads();
    this.ui.updateControllerNavigation(this.input.connectedGamepads, now);

    let alpha = 0;
    if (this.state === AppState.Playing && this.worldSession !== undefined) {
      const result = this.fixedStep.advance(frameDeltaSeconds, this.runFixedStep);
      alpha = result.alpha;
      if (result.overloaded) {
        this.performanceMonitor.recordOverload(result.discardedSeconds);
        if (import.meta.env.DEV) {
          console.warn(`Physics overload: discarded ${result.discardedSeconds.toFixed(3)} s.`);
        }
      }
      if (
        this.raceResultsGeneration !== this.sessionGeneration &&
        this.worldSession.raceSnapshot().phase === "results"
      ) {
        this.showRaceResults();
      }
    }
    this.worldSession?.render(
      alpha,
      Math.min(Math.max(frameDeltaSeconds, 0), SIMULATION_CONFIG.maxFrameDeltaSeconds),
      this.renderSystem?.aspectRatio ?? 1,
    );
    this.renderSystem?.render();
    this.animationFrame = requestAnimationFrame((time) => this.frame(time));
  }

  private handleContextLost(): void {
    this.input.setGameplayEnabled(false);
    this.fixedStep.reset();
    this.state = AppState.Error;
    this.ui.showError("The WebGL context was lost. Reload to rebuild the renderer safely.");
  }

  private debugSnapshot(): GameAppDebugSnapshot {
    return {
      state: this.state,
      sessionGeneration: this.sessionGeneration,
      activeWorldSessionRootCount:
        this.renderSystem?.scene.children.filter((child) => child.name === "world-session")
          .length ?? 0,
      markerElementCount: document.querySelectorAll(".player-marker").length,
    };
  }

  private async debugResetSandbox(): Promise<void> {
    if (this.state === AppState.Playing) {
      this.pause();
    }
    if (this.state === AppState.Paused) {
      await this.resetSandbox();
    }
  }

  private handleContextRestored(): void {
    this.ui.toast("Graphics context restored. Reloading is recommended.");
  }

  private installLifecycleListeners(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    document.addEventListener("focusin", this.onUiFocusIn);
    document.addEventListener("click", this.onUiClick);
    const editorViewport = GameApp.editorViewport();
    editorViewport.addEventListener("pointerdown", this.onEditorPointerDown);
    editorViewport.addEventListener("pointermove", this.onEditorPointerMove);
    editorViewport.addEventListener("pointerup", this.onEditorPointerUp);
    editorViewport.addEventListener("pointercancel", this.onEditorPointerUp);
    editorViewport.addEventListener("pointerleave", this.onEditorPointerLeave);
    editorViewport.addEventListener("wheel", this.onEditorWheel, { passive: false });
    editorViewport.addEventListener("contextmenu", this.onEditorContextMenu);
  }

  private removeLifecycleListeners(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    document.removeEventListener("focusin", this.onUiFocusIn);
    document.removeEventListener("click", this.onUiClick);
    const editorViewport = GameApp.editorViewport();
    editorViewport.removeEventListener("pointerdown", this.onEditorPointerDown);
    editorViewport.removeEventListener("pointermove", this.onEditorPointerMove);
    editorViewport.removeEventListener("pointerup", this.onEditorPointerUp);
    editorViewport.removeEventListener("pointercancel", this.onEditorPointerUp);
    editorViewport.removeEventListener("pointerleave", this.onEditorPointerLeave);
    editorViewport.removeEventListener("wheel", this.onEditorWheel);
    editorViewport.removeEventListener("contextmenu", this.onEditorContextMenu);
  }

  /** Tears down a half-built world after a launch or reset throws, then shows the error screen. */
  private failLaunch(error: unknown): void {
    this.input.setGameplayEnabled(false);
    this.audio.stopAllEngineVoices();
    this.worldSession?.dispose();
    this.worldSession = undefined;
    this.fail(error);
  }

  private fail(error: unknown): void {
    console.error(error);
    this.state = AppState.Error;
    this.ui.showError(errorMessage(error));
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.removeLifecycleListeners();
    this.worldSession?.dispose();
    this.disposeEditorPreview();
    this.mapRepository.close();
    this.renderSystem?.dispose();
    this.input.dispose();
    this.uninstallTestApi?.();
    this.uninstallTestApi = undefined;
    await this.audio.dispose();
  }

  private static safeStorage(): Storage | undefined {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  }

  private static isEditableTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
  }

  private static canvas(): HTMLCanvasElement {
    const canvas = document.getElementById("game-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("The game canvas is missing.");
    }
    return canvas;
  }

  private static editorViewport(): HTMLElement {
    const viewport = document.getElementById("editor-viewport-chrome");
    if (!(viewport instanceof HTMLElement)) {
      throw new Error("The editor viewport is missing.");
    }
    return viewport;
  }

  private static clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
  }

  private static snap(value: number, increment: number): number {
    return increment > 0 ? Math.round(value / increment) * increment : value;
  }

  private static markerOverlay(): HTMLElement {
    const overlay = document.getElementById("player-markers");
    if (!(overlay instanceof HTMLElement)) {
      throw new Error("The player marker overlay is missing.");
    }
    return overlay;
  }
}
