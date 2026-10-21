import { PLAYER_COLORS } from "../config/player-colors";
import { editorAssetManifest, isEditorAssetId } from "../editor/EditorAssetCatalog";
import type {
  EditorAssetId,
  EntityTransformEdit,
  TrackMaterialId,
  TrackRoadPropertiesEdit,
  TrackWallBrushAction,
  TrackWallBrushSide,
  TrackWallPropertiesEdit,
  TrackWallStyleId,
} from "../editor/EditorSession";
import type { KeyboardBinding } from "../input/bindings";
import { defaultTrackSurfaceCooldownSeconds } from "../maps/MapDocument";
import type {
  InteractionAction,
  InteractionCondition,
  InteractionEvent,
  EnvironmentMusicAssetId,
  MapType,
  TrackSurface,
  Vector3Tuple,
} from "../maps/MapDocument";
import {
  createDefaultSettings,
  type GameSettings,
  type PlayerInputSettings,
  type PlayerInputType,
} from "../persistence/schema";
import {
  ControllerNavigationTracker,
  type ControllerNavigationIntent,
} from "./controller-navigation";

export type ScreenName =
  | "loading"
  | "activation"
  | "main"
  | "modes"
  | "players"
  | "options"
  | "map-library"
  | "editor"
  | "pause"
  | "error";

export interface MapLibraryItemView {
  readonly localMapId: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly objectCount: number;
  readonly createdAt: string;
  readonly favorite: boolean;
  readonly trashedAt: string | null;
  readonly tags: readonly string[];
  readonly thumbnailDataUrl: string;
}

export interface EditorPrefabView {
  readonly localPrefabId: string;
  readonly title: string;
  readonly objectCount: number;
}

export interface MapRestorePointView {
  readonly localMapId: string;
  readonly localRestorePointId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly revision: number;
  readonly objectCount: number;
}

export interface EditorMapView {
  readonly title: string;
  readonly tags: readonly string[];
  readonly revision: number;
  readonly objectCount: number;
  readonly schemaVersion: number;
  readonly storageLabel: string;
  readonly diagnostics: readonly string[];
  readonly healthy: boolean;
}

export interface EditorSelectionView {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly yawDegrees: number;
  readonly primarySize: number;
  readonly primarySizeLabel: string;
}

export interface EditorPhysicsView {
  readonly mass: number;
  readonly friction: number;
  readonly restitution: number;
}

export interface EditorMotionView {
  readonly kind: "platform" | "rotating-bar";
  readonly speed: number;
  readonly dwellSeconds: number;
  readonly offset: Vector3Tuple;
}

export interface EditorBoostPadView {
  readonly kind: "boost" | "launch";
  readonly boostSpeed: number;
  readonly liftSpeed: number;
  readonly cooldownSeconds: number;
}

export interface EditorSurfacePadView {
  readonly kind: "bounce" | "slow";
  readonly strength: number;
  readonly cooldownSeconds: number;
}

export interface EditorGuidanceView {
  readonly kind: "marker" | "sign";
  readonly color: string;
  readonly glow: number;
  readonly solid: boolean;
}

export interface EditorDecorationView {
  readonly kind: "light" | "strip";
  readonly color: string;
  readonly glow: number;
  readonly intensity: number;
  readonly range: number;
  readonly enabled: boolean;
}

export interface EditorRouteActionView {
  readonly checkpointCount: number;
  readonly canGroup: boolean;
  readonly canLink: boolean;
  readonly groupRequired: boolean | null;
}

export interface EditorRecoveryLinkView {
  readonly canAssign: boolean;
  readonly canClear: boolean;
  readonly linkedPoseName: string | null;
}

export interface EditorPortalLinkView {
  readonly selectedPortalCount: number;
  readonly canLink: boolean;
  readonly canClear: boolean;
  readonly linkedPortalName: string | null;
}

export interface EditorInteractionLinkView {
  readonly sourceName: string;
  readonly targetName: string;
  readonly events: readonly InteractionEvent[];
  readonly actions: readonly InteractionAction[];
  readonly links: readonly {
    readonly id: string;
    readonly summary: string;
  }[];
}

export interface EditorRaceSetupView {
  readonly mode: MapType;
  readonly lapCount: number;
  readonly finishRule: "any" | "required-group";
  readonly recoveryDelaySeconds: number;
  readonly recoveryPenaltySeconds: number;
}

export interface EditorEnvironmentView {
  readonly groundMode: "ground" | "void";
  readonly skyPreset: "day" | "sunset" | "night" | "custom";
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
  readonly musicAssetId: EnvironmentMusicAssetId | null;
  readonly musicVolume: number;
  readonly outOfBoundsHeight: number;
}

export type EditorTransformMode = "move" | "rotate" | "scale";

export interface EditorSnapSettings {
  readonly gridEnabled: boolean;
  readonly gridSize: number;
  readonly angleEnabled: boolean;
  readonly surfaceEnabled: boolean;
}

export interface EditorTutorialView {
  readonly step: number;
  readonly totalSteps: number;
  readonly instruction: string;
  readonly detail: string;
}

export interface EditorTrackView {
  readonly closed: boolean;
  readonly width: number;
  readonly elevation: number;
  readonly bankDegrees: number;
  readonly leftWall: boolean;
  readonly rightWall: boolean;
}

export interface EditorTrackNodeView {
  readonly index: number;
  readonly total: number;
  readonly position: Vector3Tuple;
  readonly width: number;
  readonly bankDegrees: number;
  readonly canDelete: boolean;
  readonly canSplit: boolean;
  readonly endpoint: "start" | "end" | null;
}

export interface EditorTrackRangeView {
  readonly selectionKey: string;
  readonly length: number;
  readonly side: TrackWallBrushSide;
  readonly height: number;
  readonly thickness: number;
  readonly styleId: TrackWallStyleId;
  readonly roadWidth: number;
  readonly roadBankDegrees: number;
  readonly roadSurface: TrackSurface;
  readonly roadMaterialId: TrackMaterialId;
  readonly roadSurfaceStrength: number;
  readonly roadSurfaceCooldownSeconds: number;
}

export interface UiHandlers {
  readonly activate: () => void | Promise<void>;
  readonly playSandbox: () => void | Promise<void>;
  readonly openMapLibrary: () => void | Promise<void>;
  readonly leaveMapLibrary: () => void;
  readonly createEditorMap: () => void | Promise<void>;
  readonly openEditorMap: (localMapId: string) => void | Promise<void>;
  readonly playEditorMap: (localMapId: string) => void | Promise<void>;
  readonly duplicateEditorMap: (localMapId: string) => void | Promise<void>;
  readonly favoriteEditorMap: (localMapId: string, favorite: boolean) => void | Promise<void>;
  readonly trashEditorMap: (localMapId: string) => void | Promise<void>;
  readonly restoreEditorMap: (localMapId: string) => void | Promise<void>;
  readonly deleteEditorMap: (localMapId: string) => void | Promise<void>;
  readonly exportEditorMap: (localMapId: string) => void | Promise<void>;
  readonly importEditorMap: (file: File) => void | Promise<void>;
  readonly openEditorRestorePoints: (localMapId: string) => void | Promise<void>;
  readonly restoreEditorPoint: (
    localMapId: string,
    localRestorePointId: string,
  ) => void | Promise<void>;
  readonly saveEditorMap: (title: string) => void | Promise<void>;
  readonly editorTagsChanged: (tags: readonly string[]) => void;
  readonly leaveEditor: () => void | Promise<void>;
  readonly selectEditorAsset: (assetId: EditorAssetId) => void;
  readonly cancelEditorAction: () => boolean;
  readonly editorUndo: () => void;
  readonly editorRedo: () => void;
  readonly editorDuplicate: () => void;
  readonly editorDelete: () => void;
  readonly editorGroup: () => void;
  readonly editorUngroup: () => void;
  readonly editorSavePrefab: (title: string) => void | Promise<void>;
  readonly editorSelectPrefab: (localPrefabId: string) => void | Promise<void>;
  readonly editorDeletePrefab: (localPrefabId: string) => void | Promise<void>;
  readonly editorGroupCheckpoints: () => void;
  readonly editorLinkRoute: (shortcut: boolean) => void;
  readonly editorToggleCheckpointRequired: () => void;
  readonly editorAssignRecoveryPose: () => void;
  readonly editorClearRecoveryPose: () => void;
  readonly editorLinkPortals: () => void;
  readonly editorClearPortalLink: () => void;
  readonly editorAddInteractionLink: (
    event: InteractionEvent,
    condition: InteractionCondition | null,
    action: InteractionAction,
  ) => void;
  readonly editorRemoveInteractionLink: (interactionId: string) => void;
  readonly editorRaceSetupChanged: (view: EditorRaceSetupView) => void;
  readonly editorEnvironmentChanged: (view: EditorEnvironmentView) => void;
  readonly editorTransformChanged: (edit: EntityTransformEdit) => void;
  readonly editorPhysicsChanged: (view: EditorPhysicsView) => void;
  readonly editorMotionChanged: (view: Omit<EditorMotionView, "kind">) => void;
  readonly editorBoostPadChanged: (view: Omit<EditorBoostPadView, "kind">) => void;
  readonly editorSurfacePadChanged: (view: Omit<EditorSurfacePadView, "kind">) => void;
  readonly editorGuidanceChanged: (view: Omit<EditorGuidanceView, "kind">) => void;
  readonly editorDecorationChanged: (view: Omit<EditorDecorationView, "kind">) => void;
  readonly editorToggleTopDown: () => void;
  readonly editorZoomChanged: (zoom: number) => void;
  readonly editorFrameSelection: () => void;
  readonly selectEditorTransform: (mode: EditorTransformMode) => void;
  readonly editorSnapChanged: (settings: EditorSnapSettings) => void;
  readonly editorTutorialNext: () => void;
  readonly editorTutorialSkip: () => void;
  readonly editorTutorialShowMe: () => void;
  readonly editorTutorialReplay: () => void;
  readonly selectEditorTrackTool: () => void;
  readonly editorTrackChanged: (width: number, elevation: number, bankDegrees: number) => void;
  readonly editorTrackNodeChanged: (
    position: Vector3Tuple,
    width: number,
    bankDegrees: number,
  ) => void;
  readonly editorInsertTrackNode: () => void;
  readonly editorDeleteTrackNode: () => void;
  readonly editorSplitTrack: () => void;
  readonly editorResetTrackTangent: () => void;
  readonly editorTrackWallsChanged: (left: boolean, right: boolean) => void;
  readonly editorWallBrushChanged: (action: TrackWallBrushAction, side: TrackWallBrushSide) => void;
  readonly editorSelectTrackRange: () => void;
  readonly editorApplyTrackRange: (side: TrackWallBrushSide, edit: TrackWallPropertiesEdit) => void;
  readonly editorApplyTrackRoadRange: (edit: TrackRoadPropertiesEdit) => void;
  readonly editorClearTrackRange: () => void;
  readonly editorSmoothTrack: () => void;
  readonly editorDeleteTrack: () => void;
  readonly editorFrameTrack: () => void;
  readonly editorTestNow: () => void | Promise<void>;
  readonly pauseToggle: () => void;
  readonly resetSandbox: () => void | Promise<void>;
  readonly returnToMenu: () => void;
  readonly fullscreenToggle: () => void | Promise<void>;
  readonly settingsChanged: (patch: Partial<Omit<GameSettings, "schemaVersion">>) => void;
  readonly controllerAssigned: (zeroBasedPlayerIndex: number, gamepadIndex: number | null) => void;
  /**
   * Optional integration point for SettingsService.resetToDefaults(). When it
   * is absent, UiController emits a complete default settings patch instead.
   */
  readonly resetSettings?: () => void | Promise<void>;
}

type BindingDirection = keyof KeyboardBinding;
type NavigationDirection = Extract<ControllerNavigationIntent, "up" | "down" | "left" | "right">;
type OptionsSettingsPatch = Pick<
  Omit<GameSettings, "schemaVersion">,
  | "renderScale"
  | "aaQuality"
  | "ambientOcclusion"
  | "vignette"
  | "shadowQuality"
  | "fullscreenPreference"
  | "uiScale"
  | "markerSize"
  | "analogDeadZone"
  | "analogSensitivity"
  | "masterVolume"
  | "effectsVolume"
  | "musicVolume"
  | "reducedMotion"
  | "cameraSmoothing"
  | "particleDensity"
  | "highContrastInteractables"
  | "automaticUprightRecovery"
>;

const BINDING_DIRECTIONS: readonly BindingDirection[] = ["up", "down", "left", "right", "brake"];
const BINDING_ACTION_LABELS: Readonly<Record<BindingDirection, string>> = Object.freeze({
  up: "forward",
  down: "reverse",
  left: "steer left",
  right: "steer right",
  brake: "brake and drift",
});
const RESERVED_BINDINGS = new Set(["Escape", "KeyP"]);
const NAVIGATION_DIRECTIONS = new Map<string, NavigationDirection>([
  ["ArrowUp", "up"],
  ["ArrowDown", "down"],
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
]);
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Required UI element #${id} is missing.`);
  }
  return element as T;
}

function percentage(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

function conciseNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function formatLocalTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "recently"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export class UiController {
  private readonly screens = new Map<ScreenName, HTMLElement>();
  private readonly controllerNavigation = new ControllerNavigationTracker();
  private handlers: UiHandlers | undefined;
  private settings: GameSettings | undefined;
  private currentScreen: ScreenName = "loading";
  private selectedPlayerIndex = 0;
  private gamepads: readonly Gamepad[] = [];
  private controllerAssignments: readonly (number | null)[] = [];
  private captureDirection: BindingDirection | undefined;
  private toastTimeout: number | undefined;
  private editorWheelTimeout: number | undefined;
  private editorTutorialDemoTimeout: number | undefined;
  private mapLibraryItems: readonly MapLibraryItemView[] = Object.freeze([]);
  private mapLibraryTrashVisible = false;
  private editorTrayCategory = "all";
  private pauseLabelsBeforeResults: { readonly heading: string; readonly reset: string } | null =
    null;

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (this.captureDirection !== undefined) {
      this.captureBinding(event);
      return;
    }

    if (this.isVisible("activation") && this.isActivationKey(event)) {
      const activationButton = requireElement<HTMLButtonElement>("activate-button");
      const nativeButtonActivation =
        event.target === activationButton && (event.code === "Enter" || event.code === "Space");
      if (!nativeButtonActivation) {
        event.preventDefault();
        event.stopPropagation();
        activationButton.click();
      }
      return;
    }

    if (
      event.code === "Escape" ||
      (event.code === "Backspace" && !this.isEditableTarget(event.target))
    ) {
      if (this.handleCancel()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      this.isDirectionalControlTarget(event.target)
    ) {
      return;
    }

    const direction = NAVIGATION_DIRECTIONS.get(event.code);
    if (direction !== undefined && this.isCurrentScreenVisible()) {
      event.preventDefault();
      this.moveFocus(direction);
      return;
    }

    if (event.code === "Home" && this.isCurrentScreenVisible()) {
      event.preventDefault();
      this.focusBoundary("first");
    } else if (event.code === "End" && this.isCurrentScreenVisible()) {
      event.preventDefault();
      this.focusBoundary("last");
    }
  };

  public constructor() {
    const names: readonly ScreenName[] = [
      "loading",
      "activation",
      "main",
      "modes",
      "players",
      "options",
      "map-library",
      "editor",
      "pause",
      "error",
    ];
    for (const name of names) {
      const screen = requireElement(`screen-${name}`);
      this.screens.set(name, screen);
      screen.setAttribute("aria-hidden", String(screen.hidden));
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-screen-target]")) {
      button.addEventListener("click", () => {
        const target = button.dataset["screenTarget"];
        if (target !== undefined && this.isScreenName(target)) {
          this.show(target);
        }
      });
    }

    requireElement<HTMLButtonElement>("activate-button").addEventListener("click", () => {
      void this.handlers?.activate();
    });
    requireElement<HTMLButtonElement>("play-sandbox-button").addEventListener("click", () => {
      void this.handlers?.playSandbox();
    });
    requireElement<HTMLButtonElement>("editor-button").addEventListener("click", () => {
      void this.handlers?.openMapLibrary();
    });
    requireElement<HTMLButtonElement>("play-my-maps-button").addEventListener("click", () => {
      void this.handlers?.openMapLibrary();
    });
    requireElement<HTMLButtonElement>("map-library-back-button").addEventListener("click", () => {
      this.handlers?.leaveMapLibrary();
    });
    for (const buttonId of ["create-map-button", "create-from-starter-button"]) {
      requireElement<HTMLButtonElement>(buttonId).addEventListener("click", () => {
        void this.handlers?.createEditorMap();
      });
    }
    for (const inputId of ["map-library-search", "map-library-sort", "map-library-favorites"]) {
      requireElement<HTMLInputElement | HTMLSelectElement>(inputId).addEventListener(
        "input",
        () => {
          this.renderMapLibraryCards();
        },
      );
    }
    requireElement<HTMLButtonElement>("map-library-trash-toggle").addEventListener("click", () => {
      this.mapLibraryTrashVisible = !this.mapLibraryTrashVisible;
      this.renderMapLibraryCards();
    });
    requireElement<HTMLButtonElement>("map-restore-close").addEventListener("click", () => {
      this.hideMapRestorePoints();
    });
    requireElement("map-restore-list").addEventListener("click", (event) => {
      const target = event.target;
      const button = target instanceof Element ? target.closest<HTMLButtonElement>("button") : null;
      const localMapId = button?.dataset["mapId"];
      const localRestorePointId = button?.dataset["restoreId"];
      if (localMapId !== undefined && localRestorePointId !== undefined) {
        void this.handlers?.restoreEditorPoint(localMapId, localRestorePointId);
      }
    });
    requireElement<HTMLInputElement>("map-import-input").addEventListener("change", (event) => {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const file = input.files?.[0];
      if (file !== undefined) {
        void this.handlers?.importEditorMap(file);
      }
      input.value = "";
    });
    requireElement<HTMLButtonElement>("editor-back-button").addEventListener("click", () => {
      void this.handlers?.leaveEditor();
    });
    requireElement<HTMLButtonElement>("editor-save-button").addEventListener("click", () => {
      void this.handlers?.saveEditorMap(requireElement<HTMLInputElement>("editor-map-name").value);
    });
    requireElement<HTMLButtonElement>("editor-test-button").addEventListener("click", () => {
      void this.handlers?.editorTestNow();
    });
    requireElement<HTMLInputElement>("editor-map-name").addEventListener("input", () => {
      this.setEditorSaveStatus("NAME CHANGE NOT SAVED", "pending");
    });
    requireElement<HTMLInputElement>("editor-map-tags").addEventListener("change", (event) => {
      const input = event.currentTarget;
      if (input instanceof HTMLInputElement) {
        this.handlers?.editorTagsChanged(input.value.split(","));
      }
    });
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-editor-asset]")) {
      button.addEventListener("click", () => {
        const assetId = button.dataset["editorAsset"];
        if (typeof assetId === "string" && isEditorAssetId(assetId)) {
          this.handlers?.selectEditorAsset(assetId);
        }
      });
    }
    const editorObjectSearch = requireElement<HTMLInputElement>("editor-object-search");
    editorObjectSearch.addEventListener("input", () => {
      this.applyEditorTrayFilter(editorObjectSearch.value.trim().toLocaleLowerCase());
    });
    this.applyEditorTrayFilter("");
    requireElement<HTMLButtonElement>("editor-track-tool-button").addEventListener("click", () =>
      this.handlers?.selectEditorTrackTool(),
    );
    requireElement<HTMLButtonElement>("editor-draw-road-button").addEventListener("click", () =>
      this.handlers?.selectEditorTrackTool(),
    );
    for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-editor-category]")) {
      tab.addEventListener("click", () => {
        this.editorTrayCategory = tab.dataset["editorCategory"] ?? "all";
        editorObjectSearch.value = "";
        this.applyEditorTrayFilter("");
      });
    }
    for (const inputId of ["editor-track-width", "editor-track-elevation", "editor-track-bank"]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () =>
        this.emitEditorTrack(),
      );
    }
    for (const inputId of [
      "editor-track-node-x",
      "editor-track-node-y",
      "editor-track-node-z",
      "editor-track-node-width",
      "editor-track-node-bank",
    ]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () =>
        this.emitEditorTrackNode(),
      );
    }
    requireElement<HTMLButtonElement>("editor-insert-track-node-button").addEventListener(
      "click",
      () => this.handlers?.editorInsertTrackNode(),
    );
    requireElement<HTMLButtonElement>("editor-delete-track-node-button").addEventListener(
      "click",
      () => this.handlers?.editorDeleteTrackNode(),
    );
    requireElement<HTMLButtonElement>("editor-split-track-button").addEventListener("click", () =>
      this.handlers?.editorSplitTrack(),
    );
    requireElement<HTMLButtonElement>("editor-reset-track-tangent-button").addEventListener(
      "click",
      () => this.handlers?.editorResetTrackTangent(),
    );
    for (const inputId of ["editor-track-wall-left", "editor-track-wall-right"]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () =>
        this.emitEditorTrackWalls(),
      );
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-editor-wall-brush]")) {
      button.addEventListener("click", () => {
        const [action, side] = button.dataset["editorWallBrush"]?.split("-") ?? [];
        if (
          (action === "paint" || action === "erase") &&
          (side === "left" || side === "right" || side === "both")
        ) {
          this.handlers?.editorWallBrushChanged(action, side);
        }
      });
    }
    for (const inputId of ["editor-boost-speed", "editor-boost-lift", "editor-boost-cooldown"]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () => {
        this.emitEditorBoostPad();
      });
    }
    for (const inputId of ["editor-surface-pad-strength", "editor-surface-pad-cooldown"]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () => {
        this.emitEditorSurfacePad();
      });
    }
    for (const inputId of [
      "editor-guidance-color",
      "editor-guidance-glow",
      "editor-guidance-solid",
    ]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () => {
        this.emitEditorGuidance();
      });
    }
    for (const inputId of [
      "editor-decoration-color",
      "editor-decoration-glow",
      "editor-decoration-intensity",
      "editor-decoration-range",
      "editor-decoration-enabled",
    ]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () => {
        this.emitEditorDecoration();
      });
    }
    for (const inputId of [
      "editor-motion-speed",
      "editor-motion-dwell",
      "editor-motion-offset-x",
      "editor-motion-offset-y",
      "editor-motion-offset-z",
    ]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () => {
        this.emitEditorMotion();
      });
    }
    for (const inputId of [
      "editor-physics-mass",
      "editor-physics-friction",
      "editor-physics-restitution",
    ]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () => {
        this.emitEditorPhysics();
      });
    }
    requireElement<HTMLButtonElement>("editor-select-track-range-button").addEventListener(
      "click",
      () => this.handlers?.editorSelectTrackRange(),
    );
    requireElement<HTMLButtonElement>("editor-apply-track-range-button").addEventListener(
      "click",
      () => this.emitEditorTrackRange(),
    );
    requireElement<HTMLButtonElement>("editor-apply-track-road-range-button").addEventListener(
      "click",
      () => this.emitEditorTrackRoadRange(),
    );
    requireElement<HTMLSelectElement>("editor-track-range-road-surface").addEventListener(
      "change",
      (event) => {
        const surface = trackSurfaceId((event.currentTarget as HTMLSelectElement).value);
        if (surface !== null) {
          requireElement<HTMLInputElement>("editor-track-range-road-cooldown").value =
            conciseNumber(defaultTrackSurfaceCooldownSeconds(surface));
          this.updateEditorSurfaceFields(surface);
        }
      },
    );
    requireElement<HTMLButtonElement>("editor-clear-track-range-button").addEventListener(
      "click",
      () => this.handlers?.editorClearTrackRange(),
    );
    requireElement<HTMLButtonElement>("editor-smooth-track-button").addEventListener("click", () =>
      this.handlers?.editorSmoothTrack(),
    );
    requireElement<HTMLButtonElement>("editor-delete-track-button").addEventListener("click", () =>
      this.handlers?.editorDeleteTrack(),
    );
    requireElement<HTMLButtonElement>("editor-frame-track-button").addEventListener("click", () =>
      this.handlers?.editorFrameTrack(),
    );
    requireElement<HTMLButtonElement>("editor-undo-button").addEventListener("click", () => {
      this.handlers?.editorUndo();
    });
    requireElement<HTMLButtonElement>("editor-redo-button").addEventListener("click", () => {
      this.handlers?.editorRedo();
    });
    requireElement<HTMLButtonElement>("editor-duplicate-button").addEventListener("click", () => {
      this.handlers?.editorDuplicate();
    });
    requireElement<HTMLButtonElement>("editor-delete-button").addEventListener("click", () => {
      this.handlers?.editorDelete();
    });
    requireElement<HTMLButtonElement>("editor-top-down-button").addEventListener("click", () => {
      this.handlers?.editorToggleTopDown();
    });
    requireElement<HTMLInputElement>("editor-zoom-slider").addEventListener("input", (event) => {
      const input = event.currentTarget;
      if (input instanceof HTMLInputElement) {
        const zoom = Number(input.value);
        this.setEditorZoom(zoom);
        this.handlers?.editorZoomChanged(zoom);
      }
    });
    requireElement<HTMLButtonElement>("editor-frame-selection-button").addEventListener(
      "click",
      () => {
        this.handlers?.editorFrameSelection();
      },
    );
    requireElement<HTMLButtonElement>("editor-frame-multi-button").addEventListener("click", () =>
      this.handlers?.editorFrameSelection(),
    );
    requireElement<HTMLButtonElement>("editor-duplicate-multi-button").addEventListener(
      "click",
      () => this.handlers?.editorDuplicate(),
    );
    requireElement<HTMLButtonElement>("editor-delete-multi-button").addEventListener("click", () =>
      this.handlers?.editorDelete(),
    );
    requireElement<HTMLButtonElement>("editor-group-button").addEventListener("click", () =>
      this.handlers?.editorGroup(),
    );
    requireElement<HTMLButtonElement>("editor-ungroup-button").addEventListener("click", () =>
      this.handlers?.editorUngroup(),
    );
    requireElement<HTMLButtonElement>("editor-save-prefab-button").addEventListener("click", () =>
      this.handlers?.editorSavePrefab(requireElement<HTMLInputElement>("editor-prefab-name").value),
    );
    requireElement<HTMLButtonElement>("editor-group-checkpoints-button").addEventListener(
      "click",
      () => this.handlers?.editorGroupCheckpoints(),
    );
    requireElement<HTMLButtonElement>("editor-link-route-button").addEventListener("click", () =>
      this.handlers?.editorLinkRoute(false),
    );
    requireElement<HTMLButtonElement>("editor-link-shortcut-button").addEventListener("click", () =>
      this.handlers?.editorLinkRoute(true),
    );
    requireElement<HTMLButtonElement>("editor-toggle-checkpoint-required-button").addEventListener(
      "click",
      () => this.handlers?.editorToggleCheckpointRequired(),
    );
    requireElement<HTMLButtonElement>("editor-assign-recovery-pose-button").addEventListener(
      "click",
      () => this.handlers?.editorAssignRecoveryPose(),
    );
    requireElement<HTMLButtonElement>("editor-clear-recovery-pose-button").addEventListener(
      "click",
      () => this.handlers?.editorClearRecoveryPose(),
    );
    requireElement<HTMLButtonElement>("editor-link-portals-button").addEventListener("click", () =>
      this.handlers?.editorLinkPortals(),
    );
    requireElement<HTMLButtonElement>("editor-clear-portal-link-button").addEventListener(
      "click",
      () => this.handlers?.editorClearPortalLink(),
    );
    requireElement<HTMLButtonElement>("editor-add-interaction-link-button").addEventListener(
      "click",
      () => {
        const event = requireElement<HTMLSelectElement>("editor-interaction-event")
          .value as InteractionEvent;
        const action = requireElement<HTMLSelectElement>("editor-interaction-action")
          .value as InteractionAction;
        const conditionValue = requireElement<HTMLSelectElement>(
          "editor-interaction-condition",
        ).value;
        if (event.length > 0 && action.length > 0) {
          this.handlers?.editorAddInteractionLink(
            event,
            conditionValue.length === 0 ? null : (conditionValue as InteractionCondition),
            action,
          );
        }
      },
    );
    for (const inputId of [
      "editor-environment-ground",
      "editor-environment-background",
      "editor-environment-gravity",
      "editor-environment-music",
      "editor-environment-music-volume",
      "editor-environment-key-color",
      "editor-environment-key-intensity",
      "editor-environment-key-x",
      "editor-environment-key-y",
      "editor-environment-key-z",
      "editor-environment-ambient-color",
      "editor-environment-ambient-intensity",
      "editor-environment-fog",
      "editor-environment-fog-color",
      "editor-environment-fog-near",
      "editor-environment-fog-far",
      "editor-environment-oob",
    ]) {
      requireElement(inputId).addEventListener("change", () => this.emitEditorEnvironment());
    }
    requireElement<HTMLSelectElement>("editor-environment-sky").addEventListener("change", () => {
      this.applyEditorSkyPreset();
      this.emitEditorEnvironment();
    });
    requireElement<HTMLSelectElement>("editor-environment-gravity-preset").addEventListener(
      "change",
      () => {
        const values: Readonly<Record<string, number>> = {
          earth: 9.81,
          moon: 1.62,
          floaty: 4,
          strong: 18,
          zero: 0,
        };
        const preset = requireElement<HTMLSelectElement>("editor-environment-gravity-preset").value;
        const value = values[preset];
        if (value !== undefined) {
          requireElement<HTMLInputElement>("editor-environment-gravity").value = String(value);
        }
        this.emitEditorEnvironment();
      },
    );
    for (const inputId of [
      "editor-race-mode",
      "editor-race-laps",
      "editor-finish-rule",
      "editor-race-recovery-delay",
      "editor-race-recovery-penalty",
    ]) {
      requireElement(inputId).addEventListener("change", () => this.emitEditorRaceSetup());
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-editor-transform]")) {
      button.addEventListener("click", () => {
        const mode = button.dataset["editorTransform"];
        if (mode === "move" || mode === "rotate" || mode === "scale") {
          this.handlers?.selectEditorTransform(mode);
        }
      });
    }
    for (const inputId of [
      "editor-grid-snap",
      "editor-grid-size",
      "editor-angle-snap",
      "editor-surface-snap",
    ]) {
      requireElement(inputId).addEventListener("change", () => this.emitEditorSnapSettings());
    }
    requireElement<HTMLButtonElement>("editor-tutorial-next-button").addEventListener("click", () =>
      this.handlers?.editorTutorialNext(),
    );
    requireElement<HTMLButtonElement>("editor-tutorial-skip-button").addEventListener("click", () =>
      this.handlers?.editorTutorialSkip(),
    );
    requireElement<HTMLButtonElement>("editor-tutorial-show-button").addEventListener(
      "click",
      () => {
        this.demonstrateEditorTutorial();
        this.handlers?.editorTutorialShowMe();
      },
    );
    requireElement<HTMLButtonElement>("editor-help-button").addEventListener("click", () =>
      this.handlers?.editorTutorialReplay(),
    );
    for (const inputId of [
      "editor-position-x",
      "editor-position-y",
      "editor-position-z",
      "editor-yaw",
      "editor-primary-size",
    ]) {
      requireElement<HTMLInputElement>(inputId).addEventListener("change", () => {
        this.emitEditorTransform();
      });
    }
    requireElement("user-map-list").addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest<HTMLButtonElement>("button[data-map-action]");
      const localMapId = button?.dataset["mapId"];
      if (button === null || button === undefined || localMapId === undefined) {
        return;
      }
      if (button.dataset["mapAction"] === "edit") {
        void this.handlers?.openEditorMap(localMapId);
      } else if (button.dataset["mapAction"] === "play") {
        void this.handlers?.playEditorMap(localMapId);
      } else if (button.dataset["mapAction"] === "duplicate") {
        void this.handlers?.duplicateEditorMap(localMapId);
      } else if (button.dataset["mapAction"] === "favorite") {
        void this.handlers?.favoriteEditorMap(localMapId, button.dataset["favorite"] !== "true");
      } else if (button.dataset["mapAction"] === "trash") {
        void this.handlers?.trashEditorMap(localMapId);
      } else if (button.dataset["mapAction"] === "restore") {
        void this.handlers?.restoreEditorMap(localMapId);
      } else if (button.dataset["mapAction"] === "delete") {
        void this.handlers?.deleteEditorMap(localMapId);
      } else if (button.dataset["mapAction"] === "export") {
        void this.handlers?.exportEditorMap(localMapId);
      } else if (button.dataset["mapAction"] === "restore-points") {
        void this.handlers?.openEditorRestorePoints(localMapId);
      }
    });
    requireElement<HTMLButtonElement>("resume-button").addEventListener("click", () => {
      this.handlers?.pauseToggle();
    });
    requireElement<HTMLButtonElement>("reset-button").addEventListener("click", () => {
      void this.handlers?.resetSandbox();
    });
    requireElement<HTMLButtonElement>("return-menu-button").addEventListener("click", () => {
      this.handlers?.returnToMenu();
    });
    for (const buttonId of ["fullscreen-button", "options-fullscreen-button"]) {
      requireElement<HTMLButtonElement>(buttonId).addEventListener("click", () => {
        void this.handlers?.fullscreenToggle();
      });
    }
    requireElement<HTMLButtonElement>("reload-button").addEventListener("click", () => {
      window.location.reload();
    });
    requireElement<HTMLButtonElement>("reset-defaults-button").addEventListener("click", () => {
      this.resetSettingsToDefaults();
    });

    const playerCount = requireElement<HTMLInputElement>("player-count");
    playerCount.addEventListener("input", () => {
      const value = Number(playerCount.value);
      requireElement<HTMLOutputElement>("player-count-output").value = String(value);
      requireElement("menu-player-count").textContent = String(value).padStart(2, "0");
      this.handlers?.settingsChanged({ playerCount: value });
    });

    requireElement<HTMLSelectElement>("controls-player").addEventListener("change", (event) => {
      const select = event.currentTarget;
      if (select instanceof HTMLSelectElement) {
        this.selectedPlayerIndex = Number(select.value);
        this.cancelBindingCapture();
        this.renderPlayerEditor();
      }
    });

    requireElement<HTMLSelectElement>("input-type").addEventListener("change", (event) => {
      const select = event.currentTarget;
      if (!(select instanceof HTMLSelectElement) || !this.isPlayerInputType(select.value)) {
        return;
      }
      this.updateSelectedPlayerInput((current) => ({
        ...current,
        inputType: select.value as PlayerInputType,
      }));
    });

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-binding-direction]")) {
      button.addEventListener("click", () => {
        const direction = button.dataset["bindingDirection"];
        if (direction !== undefined && this.isBindingDirection(direction)) {
          this.beginBindingCapture(direction);
        }
      });
    }

    requireElement<HTMLSelectElement>("controller-select").addEventListener("change", (event) => {
      const select = event.currentTarget;
      if (!(select instanceof HTMLSelectElement)) {
        return;
      }
      const gamepadIndex = select.value === "" ? null : Number(select.value);
      this.handlers?.controllerAssigned(this.selectedPlayerIndex, gamepadIndex);
    });
    requireElement<HTMLButtonElement>("save-calibration-button").addEventListener("click", () => {
      const horizontalAxis = Number(requireElement<HTMLSelectElement>("horizontal-axis").value);
      const verticalAxis = Number(requireElement<HTMLSelectElement>("vertical-axis").value);
      if (horizontalAxis === verticalAxis) {
        this.showBindingWarning("Steering and drive must use two different controller axes.");
        return;
      }
      this.updateSelectedPlayerInput((current) => ({
        ...current,
        controllerCalibration: Object.freeze({
          horizontalAxis,
          verticalAxis,
          horizontalSign: requireElement<HTMLInputElement>("invert-horizontal").checked ? -1 : 1,
          verticalSign: requireElement<HTMLInputElement>("invert-vertical").checked ? -1 : 1,
        }),
      }));
      this.toast("Controller axis calibration saved.");
    });

    const optionsForm = requireElement<HTMLFormElement>("options-form");
    optionsForm.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "range") {
        this.emitOptionsSettings();
      }
    });
    optionsForm.addEventListener("input", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "range") {
        this.emitOptionsSettings();
      }
    });

    const gameRoot = requireElement("game-root");
    gameRoot.addEventListener(
      "pointermove",
      () => {
        gameRoot.classList.remove("is-controller-navigation");
      },
      { passive: true },
    );
    document.addEventListener("keydown", this.onDocumentKeyDown);
  }

  public connect(handlers: UiHandlers): void {
    this.handlers = handlers;
  }

  public show(name: ScreenName): void {
    this.currentScreen = name;
    requireElement("game-root").dataset["uiScreen"] = name;
    for (const [screenName, element] of this.screens) {
      const hidden = screenName !== name;
      element.hidden = hidden;
      element.setAttribute("aria-hidden", String(hidden));
    }

    this.getFocusableElements()[0]?.focus({ preventScroll: true });
  }

  public setPlaytestPauseMode(active: boolean): void {
    requireElement("reset-button").textContent = active ? "RESET TEST" : "RESET SANDBOX";
    requireElement("return-menu-button").textContent = active
      ? "RETURN TO EDIT"
      : "RETURN TO TITLE";
    requireElement("pause-heading").textContent = active ? "TEST PAUSED" : "PAUSED";
  }

  public setMapPlayPauseMode(): void {
    requireElement("reset-button").textContent = "RESET RACE";
    requireElement("return-menu-button").textContent = "RETURN TO MAPS";
    requireElement("pause-heading").textContent = "RACE PAUSED";
  }

  /**
   * Turns the pause card into the end-of-race results card: finish order and
   * times, with Play Again and the usual way back.
   */
  public showRaceResults(
    rows: readonly { readonly place: string; readonly detail: string }[],
  ): void {
    const list = requireElement("race-results");
    list.replaceChildren(
      ...rows.map((row) => {
        const item = document.createElement("li");
        const place = document.createElement("strong");
        place.textContent = row.place;
        const detail = document.createElement("span");
        detail.textContent = row.detail;
        item.append(place, detail);
        return item;
      }),
    );
    list.hidden = false;
    const heading = requireElement("pause-heading");
    const reset = requireElement("reset-button");
    this.pauseLabelsBeforeResults ??= {
      heading: heading.textContent ?? "",
      reset: reset.textContent ?? "",
    };
    heading.textContent = "RACE COMPLETE";
    reset.textContent = "PLAY AGAIN";
    requireElement("resume-button").hidden = true;
    this.show("pause");
    reset.focus();
  }

  /** Restores the ordinary pause card after a results card. */
  public clearRaceResults(): void {
    const labels = this.pauseLabelsBeforeResults;
    this.pauseLabelsBeforeResults = null;
    requireElement("race-results").hidden = true;
    requireElement("resume-button").hidden = false;
    if (labels !== null) {
      requireElement("pause-heading").textContent = labels.heading;
      requireElement("reset-button").textContent = labels.reset;
    }
  }

  /**
   * Poll this once per rendered frame after gamepad discovery. Standard D-pad
   * buttons/left-stick axes move focus; A confirms and B cancels.
   */
  public updateControllerNavigation(
    gamepads: readonly Gamepad[] = this.gamepads,
    nowMilliseconds: number = performance.now(),
  ): void {
    const navigationGamepads =
      gamepads.length > 0 ? gamepads : this.readBrowserGamepadsForActivation();
    const intents = this.controllerNavigation.update(navigationGamepads, nowMilliseconds);
    if (!this.isCurrentScreenVisible() || intents.length === 0) {
      return;
    }

    requireElement("game-root").classList.add("is-controller-navigation");

    if (intents.includes("cancel")) {
      this.handleCancel();
      return;
    }
    if (intents.includes("confirm")) {
      this.activateFocusedControl();
      return;
    }

    const direction = intents.find(
      (intent): intent is NavigationDirection =>
        intent === "up" || intent === "down" || intent === "left" || intent === "right",
    );
    if (direction !== undefined) {
      this.moveFocus(direction);
    }
  }

  public setLoadingStatus(message: string): void {
    requireElement("loading-status").textContent = message;
  }

  public renderMapLibrary(items: readonly MapLibraryItemView[], storageLabel: string): void {
    requireElement("map-storage-status").textContent = storageLabel;
    this.mapLibraryItems = items;
    this.renderMapLibraryCards();
  }

  public setMapStorageStatus(label: string): void {
    requireElement("map-storage-status").textContent = label;
  }

  private renderMapLibraryCards(): void {
    const query = requireElement<HTMLInputElement>("map-library-search")
      .value.trim()
      .toLocaleLowerCase();
    const sort = requireElement<HTMLSelectElement>("map-library-sort").value;
    const favoritesOnly = requireElement<HTMLInputElement>("map-library-favorites").checked;
    const items = this.mapLibraryItems
      .filter((item) => (item.trashedAt !== null) === this.mapLibraryTrashVisible)
      .filter((item) => !favoritesOnly || item.favorite)
      .filter(
        (item) =>
          query.length === 0 ||
          item.title.toLocaleLowerCase().includes(query) ||
          item.tags.some((tag) => tag.toLocaleLowerCase().includes(query)),
      )
      .slice()
      .sort((left, right) => {
        if (sort === "name") {
          return left.title.localeCompare(right.title);
        }
        if (sort === "created") {
          return right.createdAt.localeCompare(left.createdAt);
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });
    const trashToggle = requireElement<HTMLButtonElement>("map-library-trash-toggle");
    trashToggle.textContent = this.mapLibraryTrashVisible ? "BACK TO MAPS" : "VIEW TRASH";
    trashToggle.classList.toggle("is-active", this.mapLibraryTrashVisible);
    requireElement("map-library-count").textContent =
      `${String(items.length)} ${items.length === 1 ? "MAP" : "MAPS"}`;
    requireElement("map-library-empty").hidden = items.length > 0;
    requireElement("map-library-empty").textContent = this.mapLibraryTrashVisible
      ? "Trash is empty. Removed maps stay recoverable here until you delete them forever."
      : "No maps match these filters. Clear the search or make a new playground.";

    const list = requireElement("user-map-list");
    const cards = items.map((item) => {
      const card = document.createElement("article");
      card.className = "map-card map-card--user";

      const preview = document.createElement("div");
      preview.className = "map-card__preview map-card__preview--user";
      preview.setAttribute("aria-hidden", "true");
      preview.style.backgroundImage = `url("${item.thumbnailDataUrl}")`;

      const body = document.createElement("div");
      body.className = "map-card__body";
      const revision = document.createElement("span");
      revision.className = "status-chip";
      revision.textContent = `REV ${String(item.revision)} · ${String(item.objectCount)} OBJECTS`;
      const heading = document.createElement("h3");
      heading.textContent = item.title;
      const timestamp = document.createElement("p");
      timestamp.textContent = `${item.tags.length > 0 ? `${item.tags.map((tag) => `#${tag}`).join(" ")} · ` : ""}${item.trashedAt === null ? "Edited" : "Removed"} ${formatLocalTimestamp(item.trashedAt ?? item.updatedAt)}`;

      const actions = document.createElement("div");
      actions.className = "map-card__actions";
      const addAction = (action: string, label: string, primary = false): HTMLButtonElement => {
        const button = document.createElement("button");
        button.className = `button ${primary ? "button--primary" : "button--quiet"}`;
        button.type = "button";
        button.dataset["mapAction"] = action;
        button.dataset["mapId"] = item.localMapId;
        button.textContent = label;
        actions.append(button);
        return button;
      };
      if (item.trashedAt === null) {
        addAction("play", "PLAY MAP", true);
        addAction("edit", "EDIT MAP");
        const favorite = addAction("favorite", item.favorite ? "★ FAVORITE" : "☆ FAVORITE");
        favorite.dataset["favorite"] = String(item.favorite);
        favorite.setAttribute("aria-pressed", String(item.favorite));
        addAction("duplicate", "DUPLICATE");
        addAction("restore-points", "RESTORE POINTS");
        addAction("export", "EXPORT JSON");
        addAction("trash", "MOVE TO TRASH");
      } else {
        addAction("restore", "RESTORE MAP", true);
        addAction("delete", "DELETE FOREVER");
      }

      body.append(revision, heading, timestamp, actions);
      card.append(preview, body);
      return card;
    });
    list.replaceChildren(...cards);
  }

  public renderMapRestorePoints(points: readonly MapRestorePointView[]): void {
    const panel = requireElement("map-restore-panel");
    panel.hidden = false;
    const list = requireElement("map-restore-list");
    if (points.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No older saved revisions yet. Keep building and autosave will add them.";
      list.replaceChildren(empty);
      return;
    }
    const rows = points.map((point) => {
      const row = document.createElement("div");
      row.className = "map-restore-row";
      const description = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = `REV ${String(point.revision)} · ${point.title}`;
      const small = document.createElement("small");
      small.textContent = `${String(point.objectCount)} objects · ${formatLocalTimestamp(point.createdAt)}`;
      description.append(strong, small);
      const restore = document.createElement("button");
      restore.className = "button button--quiet";
      restore.type = "button";
      restore.dataset["mapId"] = point.localMapId;
      restore.dataset["restoreId"] = point.localRestorePointId;
      restore.textContent = "RECOVER AS COPY";
      row.append(description, restore);
      return row;
    });
    list.replaceChildren(...rows);
  }

  public hideMapRestorePoints(): void {
    requireElement("map-restore-panel").hidden = true;
  }

  public renderEditorMap(view: EditorMapView): void {
    requireElement<HTMLInputElement>("editor-map-name").value = view.title;
    requireElement<HTMLInputElement>("editor-map-tags").value = view.tags.join(", ");
    this.updateEditorDocument(view);
    requireElement("editor-storage-mode").textContent = view.storageLabel;
    this.setEditorSaveStatus("SAVED LOCALLY", "saved");
  }

  public updateEditorDocument(
    view: Pick<
      EditorMapView,
      "objectCount" | "revision" | "schemaVersion" | "diagnostics" | "healthy"
    >,
  ): void {
    requireElement("editor-format-version").textContent = `V${String(view.schemaVersion)}`;
    requireElement("editor-object-count").textContent = String(view.objectCount);
    requireElement("editor-map-revision").textContent = String(view.revision);
    requireElement("editor-map-health").textContent = view.healthy ? "GREEN" : "CHECK";
    requireElement("editor-map-health").classList.toggle("is-warning", !view.healthy);
    requireElement("editor-diagnostics").textContent =
      view.diagnostics.length === 0
        ? "Ready for free-drive compilation."
        : view.diagnostics.join(" ");
  }

  public setEditorActiveTool(assetId: EditorAssetId | null): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-editor-asset]")) {
      const active = button.dataset["editorAsset"] === assetId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    if (assetId !== null) {
      this.setEditorTrackTool(false);
    }
  }

  /**
   * Shows the object tiles for the chosen category tab. A search looks across
   * every category so typing always finds the object.
   */
  private applyEditorTrayFilter(query: string): void {
    const category = query.length > 0 ? "all" : this.editorTrayCategory;
    for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-editor-category]")) {
      const active = tab.dataset["editorCategory"] === category;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-editor-asset]")) {
      const assetId = button.dataset["editorAsset"] ?? "";
      const manifest = editorAssetManifest(assetId);
      const searchable =
        manifest === null
          ? assetId
          : `${manifest.name} ${manifest.category} ${manifest.searchTerms.join(" ")}`;
      button.hidden =
        (query.length > 0 && !searchable.toLocaleLowerCase().includes(query)) ||
        (category !== "all" && manifest?.category !== category);
    }
    const trackButton = requireElement<HTMLButtonElement>("editor-track-tool-button");
    trackButton.hidden =
      (query.length > 0 && !"track road spline draw".includes(query)) ||
      (category !== "all" && category !== "track");
  }

  public setEditorTrackTool(active: boolean): void {
    const road = requireElement<HTMLButtonElement>("editor-draw-road-button");
    road.classList.toggle("is-active", active);
    road.setAttribute("aria-pressed", String(active));
    const button = requireElement<HTMLButtonElement>("editor-track-tool-button");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (active) {
      for (const assetButton of document.querySelectorAll<HTMLButtonElement>(
        "[data-editor-asset]",
      )) {
        assetButton.classList.remove("is-active");
        assetButton.setAttribute("aria-pressed", "false");
      }
    }
  }

  public renderEditorSelection(
    view: EditorSelectionView | null,
    selectedCount = view === null ? 0 : 1,
  ): void {
    const panel = requireElement("editor-selection-panel");
    const multiPanel = requireElement("editor-multi-selection-panel");
    panel.hidden = view === null || selectedCount !== 1;
    multiPanel.hidden = selectedCount < 2;
    requireElement("editor-selected-count").textContent = String(selectedCount);
    if (view === null) {
      return;
    }
    requireElement("editor-selected-name").textContent = view.name;
    requireElement("editor-primary-size-label").textContent = view.primarySizeLabel;
    const [x, y, z] = view.position;
    requireElement<HTMLInputElement>("editor-position-x").value = conciseNumber(x);
    requireElement<HTMLInputElement>("editor-position-y").value = conciseNumber(y);
    requireElement<HTMLInputElement>("editor-position-z").value = conciseNumber(z);
    requireElement<HTMLInputElement>("editor-yaw").value = conciseNumber(view.yawDegrees);
    requireElement<HTMLInputElement>("editor-primary-size").value = conciseNumber(view.primarySize);
  }

  public renderEditorGrouping(canGroup: boolean, canUngroup: boolean): void {
    requireElement<HTMLButtonElement>("editor-group-button").disabled = !canGroup;
    requireElement<HTMLButtonElement>("editor-ungroup-button").disabled = !canUngroup;
  }

  public renderEditorPrefabSave(canSave: boolean): void {
    requireElement("editor-prefab-save-panel").hidden = !canSave;
  }

  public renderEditorPrefabs(
    items: readonly EditorPrefabView[],
    activePrefabId: string | null,
  ): void {
    requireElement("editor-prefab-empty").hidden = items.length > 0;
    const rows = items.map((item) => {
      const row = document.createElement("div");
      row.className = "editor-prefab-row";
      const place = document.createElement("button");
      place.type = "button";
      place.className = "editor-asset-card editor-prefab-card";
      place.classList.toggle("is-active", item.localPrefabId === activePrefabId);
      place.setAttribute("aria-pressed", String(item.localPrefabId === activePrefabId));
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "◆";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const count = document.createElement("small");
      count.textContent = `${String(item.objectCount)} OBJECT${item.objectCount === 1 ? "" : "S"}`;
      place.append(icon, title, count);
      place.addEventListener("click", () => this.handlers?.editorSelectPrefab(item.localPrefabId));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "editor-prefab-delete";
      remove.textContent = "REMOVE";
      remove.setAttribute("aria-label", `Remove prefab ${item.title}`);
      remove.addEventListener("click", () => this.handlers?.editorDeletePrefab(item.localPrefabId));
      row.append(place, remove);
      return row;
    });
    requireElement("editor-prefab-list").replaceChildren(...rows);
  }

  public renderEditorPhysics(view: EditorPhysicsView | null): void {
    requireElement("editor-physics-panel").hidden = view === null;
    if (view === null) {
      return;
    }
    requireElement<HTMLInputElement>("editor-physics-mass").value = conciseNumber(view.mass);
    requireElement<HTMLInputElement>("editor-physics-friction").value = conciseNumber(
      view.friction,
    );
    requireElement<HTMLInputElement>("editor-physics-restitution").value = conciseNumber(
      view.restitution,
    );
  }

  public renderEditorMotion(view: EditorMotionView | null): void {
    requireElement("editor-motion-panel").hidden = view === null;
    if (view === null) {
      return;
    }
    const platform = view.kind === "platform";
    requireElement("editor-motion-heading").textContent = platform
      ? "MOVING PLATFORM"
      : "ROTATING BAR";
    requireElement("editor-motion-speed-label").textContent = platform
      ? "SPEED (M/S)"
      : "SPIN (DEG/S)";
    for (const id of [
      "editor-motion-dwell-field",
      "editor-motion-offset-x-field",
      "editor-motion-offset-y-field",
      "editor-motion-offset-z-field",
    ]) {
      requireElement(id).hidden = !platform;
    }
    requireElement("editor-motion-help").textContent = platform
      ? "Travel values set the other end. The platform moves there and back smoothly."
      : "Use a positive or negative spin speed to choose its direction.";
    requireElement<HTMLInputElement>("editor-motion-speed").value = conciseNumber(view.speed);
    requireElement<HTMLInputElement>("editor-motion-dwell").value = conciseNumber(
      view.dwellSeconds,
    );
    requireElement<HTMLInputElement>("editor-motion-offset-x").value = conciseNumber(
      view.offset[0],
    );
    requireElement<HTMLInputElement>("editor-motion-offset-y").value = conciseNumber(
      view.offset[1],
    );
    requireElement<HTMLInputElement>("editor-motion-offset-z").value = conciseNumber(
      view.offset[2],
    );
  }

  public renderEditorBoostPad(view: EditorBoostPadView | null): void {
    requireElement("editor-boost-panel").hidden = view === null;
    if (view === null) {
      return;
    }
    const launch = view.kind === "launch";
    requireElement("editor-boost-heading").textContent = launch ? "LAUNCH PAD" : "BOOST PAD";
    requireElement("editor-boost-help").textContent = launch
      ? "The arrow shows forward. Power pushes the car ahead; lift sends it upward."
      : "The arrow shows forward. Turn the pad to choose where the speed goes.";
    requireElement<HTMLInputElement>("editor-boost-speed").value = conciseNumber(view.boostSpeed);
    requireElement<HTMLInputElement>("editor-boost-lift").value = conciseNumber(view.liftSpeed);
    requireElement<HTMLInputElement>("editor-boost-cooldown").value = conciseNumber(
      view.cooldownSeconds,
    );
  }

  public renderEditorSurfacePad(view: EditorSurfacePadView | null): void {
    requireElement("editor-surface-pad-panel").hidden = view === null;
    if (view === null) {
      return;
    }
    const slow = view.kind === "slow";
    requireElement("editor-surface-pad-heading").textContent = slow ? "SLOW ZONE" : "BOUNCE PAD";
    requireElement("editor-surface-pad-strength-label").textContent = slow
      ? "SPEED KEPT (0–1)"
      : "BOUNCE POWER";
    requireElement("editor-surface-pad-help").textContent = slow
      ? "A value of 0.4 leaves cars with 40% of their sideways speed when they enter."
      : "Cars and physics toys leave upward at least this fast.";
    const strength = requireElement<HTMLInputElement>("editor-surface-pad-strength");
    strength.min = slow ? "0.05" : "1";
    strength.max = slow ? "1" : "30";
    strength.step = slow ? "0.05" : "0.5";
    strength.value = conciseNumber(view.strength);
    requireElement<HTMLInputElement>("editor-surface-pad-cooldown").value = conciseNumber(
      view.cooldownSeconds,
    );
  }

  public renderEditorGuidance(view: EditorGuidanceView | null): void {
    requireElement("editor-guidance-panel").hidden = view === null;
    if (view === null) {
      return;
    }
    const sign = view.kind === "sign";
    requireElement("editor-guidance-heading").textContent = sign ? "ARROW SIGN" : "DIRECTION ARROW";
    requireElement("editor-guidance-solid-field").hidden = !sign;
    requireElement("editor-guidance-help").textContent = sign
      ? "Turn the sign to point racers onward. Solid signs can block cars; decorative signs do not."
      : "Turn this bright floor arrow to guide racers without changing the driving surface.";
    requireElement<HTMLInputElement>("editor-guidance-color").value = view.color;
    requireElement<HTMLInputElement>("editor-guidance-glow").value = conciseNumber(view.glow);
    requireElement<HTMLInputElement>("editor-guidance-solid").checked = view.solid;
  }

  public renderEditorDecoration(view: EditorDecorationView | null): void {
    requireElement("editor-decoration-panel").hidden = view === null;
    if (view === null) {
      return;
    }
    const light = view.kind === "light";
    requireElement("editor-decoration-heading").textContent = light ? "POINT LIGHT" : "COLOR STRIP";
    requireElement("editor-decoration-glow-field").hidden = light;
    requireElement("editor-decoration-intensity-field").hidden = !light;
    requireElement("editor-decoration-range-field").hidden = !light;
    requireElement("editor-decoration-help").textContent = light
      ? "Color an area without changing car physics. Range controls how far the light reaches."
      : "Add a bright non-blocking color line to roads, walls, or scenery.";
    requireElement<HTMLInputElement>("editor-decoration-color").value = view.color;
    requireElement<HTMLInputElement>("editor-decoration-glow").value = conciseNumber(view.glow);
    requireElement<HTMLInputElement>("editor-decoration-intensity").value = conciseNumber(
      view.intensity,
    );
    requireElement<HTMLInputElement>("editor-decoration-range").value = conciseNumber(view.range);
    requireElement<HTMLInputElement>("editor-decoration-enabled").checked = view.enabled;
  }

  public renderEditorRouteActions(view: EditorRouteActionView | null): void {
    const panel = requireElement("editor-route-panel");
    panel.hidden = view === null;
    if (view === null) {
      return;
    }
    requireElement("editor-route-heading").textContent =
      view.checkpointCount === 1 ? "1 CHECKPOINT" : `${String(view.checkpointCount)} CHECKPOINTS`;
    requireElement("editor-route-help").textContent = view.canLink
      ? "Selection order sets direction: first checkpoint to second checkpoint."
      : "Select checkpoints, then group alternatives or select exactly two to draw a route link.";
    requireElement<HTMLButtonElement>("editor-group-checkpoints-button").disabled = !view.canGroup;
    requireElement<HTMLButtonElement>("editor-link-route-button").disabled = !view.canLink;
    requireElement<HTMLButtonElement>("editor-link-shortcut-button").disabled = !view.canLink;
    const requiredButton = requireElement<HTMLButtonElement>(
      "editor-toggle-checkpoint-required-button",
    );
    requiredButton.disabled = view.groupRequired === null;
    requiredButton.textContent = view.groupRequired === false ? "MAKE REQUIRED" : "MAKE OPTIONAL";
  }

  public renderEditorRecoveryLink(view: EditorRecoveryLinkView | null): void {
    const panel = requireElement("editor-recovery-link-panel");
    panel.hidden = view === null;
    if (view === null) {
      return;
    }
    requireElement("editor-recovery-link-help").textContent =
      view.linkedPoseName === null
        ? "Select one Recovery Volume and one Safe Recovery Pose, then assign them."
        : `Linked to ${view.linkedPoseName}. Cars entering this volume recover there.`;
    requireElement<HTMLButtonElement>("editor-assign-recovery-pose-button").disabled =
      !view.canAssign;
    requireElement<HTMLButtonElement>("editor-clear-recovery-pose-button").disabled =
      !view.canClear;
  }

  public renderEditorPortalLink(view: EditorPortalLinkView | null): void {
    const panel = requireElement("editor-portal-link-panel");
    panel.hidden = view === null;
    if (view === null) {
      return;
    }
    requireElement("editor-portal-link-help").textContent =
      view.linkedPortalName !== null
        ? `Linked to ${view.linkedPortalName}. Enter either portal to exit the other.`
        : view.selectedPortalCount === 2
          ? "Two portals selected. Link them to make a two-way doorway."
          : "Select this Portal, then Shift-click one more Portal.";
    requireElement<HTMLButtonElement>("editor-link-portals-button").disabled = !view.canLink;
    requireElement<HTMLButtonElement>("editor-clear-portal-link-button").disabled = !view.canClear;
  }

  public renderEditorInteractionLink(view: EditorInteractionLinkView | null): void {
    const panel = requireElement("editor-interaction-link-panel");
    panel.hidden = view === null;
    if (view === null) {
      return;
    }
    requireElement("editor-interaction-link-help").textContent =
      `${view.sourceName} → ${view.targetName}. Choose one simple WHEN and DO preset.`;
    const eventSelect = requireElement<HTMLSelectElement>("editor-interaction-event");
    const previousEvent = eventSelect.value;
    eventSelect.replaceChildren(
      ...view.events.map((event) => new Option(interactionLabel(event), event)),
    );
    if (view.events.includes(previousEvent as InteractionEvent)) {
      eventSelect.value = previousEvent;
    }
    const actionSelect = requireElement<HTMLSelectElement>("editor-interaction-action");
    const previousAction = actionSelect.value;
    actionSelect.replaceChildren(
      ...view.actions.map((action) => new Option(interactionLabel(action), action)),
    );
    if (view.actions.includes(previousAction as InteractionAction)) {
      actionSelect.value = previousAction;
    }
    requireElement<HTMLButtonElement>("editor-add-interaction-link-button").disabled =
      view.events.length === 0 || view.actions.length === 0;
    requireElement("editor-interaction-link-list").replaceChildren(
      ...view.links.map((link) => {
        const row = document.createElement("div");
        row.className = "editor-interaction-link-row";
        const summary = document.createElement("span");
        summary.textContent = link.summary;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button button--danger";
        remove.textContent = "REMOVE";
        remove.addEventListener("click", () => this.handlers?.editorRemoveInteractionLink(link.id));
        row.append(summary, remove);
        return row;
      }),
    );
  }

  public renderEditorRaceSetup(view: EditorRaceSetupView): void {
    requireElement<HTMLSelectElement>("editor-race-mode").value = view.mode;
    requireElement<HTMLInputElement>("editor-race-laps").value = String(view.lapCount);
    requireElement<HTMLSelectElement>("editor-finish-rule").value = view.finishRule;
    requireElement<HTMLInputElement>("editor-race-recovery-delay").value = conciseNumber(
      view.recoveryDelaySeconds,
    );
    requireElement<HTMLInputElement>("editor-race-recovery-penalty").value = conciseNumber(
      view.recoveryPenaltySeconds,
    );
    requireElement<HTMLInputElement>("editor-race-laps").disabled = view.mode !== "circuit";
    requireElement("editor-race-setup-help").textContent =
      view.mode === "free-roam"
        ? "Free roam ignores race progress. Choose a scored mode to test checkpoints and laps."
        : view.mode === "circuit"
          ? "Finish after every required checkpoint group. Each valid finish starts the next lap."
          : "Finish after every required checkpoint group has been crossed in a valid route.";
  }

  public renderEditorEnvironment(view: EditorEnvironmentView): void {
    requireElement<HTMLSelectElement>("editor-environment-ground").value = view.groundMode;
    requireElement<HTMLSelectElement>("editor-environment-sky").value = view.skyPreset;
    requireElement<HTMLInputElement>("editor-environment-background").value = view.backgroundColor;
    requireElement<HTMLInputElement>("editor-environment-key-color").value = view.keyLightColor;
    requireElement<HTMLInputElement>("editor-environment-key-intensity").value = conciseNumber(
      view.keyLightIntensity,
    );
    requireElement<HTMLInputElement>("editor-environment-key-x").value = conciseNumber(
      view.keyLightDirection[0],
    );
    requireElement<HTMLInputElement>("editor-environment-key-y").value = conciseNumber(
      view.keyLightDirection[1],
    );
    requireElement<HTMLInputElement>("editor-environment-key-z").value = conciseNumber(
      view.keyLightDirection[2],
    );
    requireElement<HTMLInputElement>("editor-environment-ambient-color").value =
      view.ambientLightColor;
    requireElement<HTMLInputElement>("editor-environment-ambient-intensity").value = conciseNumber(
      view.ambientLightIntensity,
    );
    const gravity = requireElement<HTMLInputElement>("editor-environment-gravity");
    gravity.value = conciseNumber(view.gravityStrength);
    requireElement<HTMLSelectElement>("editor-environment-gravity-preset").value = gravityPreset(
      view.gravityStrength,
    );
    requireElement<HTMLInputElement>("editor-environment-fog").checked = view.fogEnabled;
    requireElement<HTMLInputElement>("editor-environment-fog-color").value = view.fogColor;
    requireElement<HTMLInputElement>("editor-environment-fog-near").value = conciseNumber(
      view.fogNear,
    );
    requireElement<HTMLInputElement>("editor-environment-fog-far").value = conciseNumber(
      view.fogFar,
    );
    requireElement<HTMLSelectElement>("editor-environment-music").value = view.musicAssetId ?? "";
    requireElement<HTMLInputElement>("editor-environment-music-volume").value = String(
      view.musicVolume,
    );
    requireElement<HTMLInputElement>("editor-environment-oob").value = conciseNumber(
      view.outOfBoundsHeight,
    );
  }

  public renderEditorTrack(view: EditorTrackView | null): void {
    const panel = requireElement("editor-track-panel");
    panel.hidden = view === null;
    panel.dataset["trackClosed"] = String(view?.closed ?? false);
    if (view === null) {
      return;
    }
    requireElement<HTMLInputElement>("editor-track-width").value = conciseNumber(view.width);
    requireElement<HTMLInputElement>("editor-track-elevation").value = conciseNumber(
      view.elevation,
    );
    requireElement<HTMLInputElement>("editor-track-bank").value = conciseNumber(view.bankDegrees);
    requireElement<HTMLInputElement>("editor-track-wall-left").checked = view.leftWall;
    requireElement<HTMLInputElement>("editor-track-wall-right").checked = view.rightWall;
  }

  public setEditorWallBrush(
    action: TrackWallBrushAction | null,
    side: TrackWallBrushSide | null,
  ): void {
    const activeValue = action === null || side === null ? null : `${action}-${side}`;
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-editor-wall-brush]")) {
      const active = button.dataset["editorWallBrush"] === activeValue;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  public setEditorTrackRangeSelectActive(active: boolean): void {
    const button = requireElement<HTMLButtonElement>("editor-select-track-range-button");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  public renderEditorTrackRange(view: EditorTrackRangeView | null): void {
    const panel = requireElement("editor-track-range-panel");
    panel.hidden = view === null;
    if (view === null) {
      delete panel.dataset["selectionKey"];
      return;
    }
    requireElement("editor-track-range-length").textContent = `${conciseNumber(view.length)} M`;
    if (panel.dataset["selectionKey"] === view.selectionKey) {
      return;
    }
    panel.dataset["selectionKey"] = view.selectionKey;
    requireElement<HTMLSelectElement>("editor-track-range-side").value = view.side;
    requireElement<HTMLSelectElement>("editor-track-range-style").value = view.styleId;
    requireElement<HTMLInputElement>("editor-track-range-wall-height").value = conciseNumber(
      view.height,
    );
    requireElement<HTMLInputElement>("editor-track-range-wall-thickness").value = conciseNumber(
      view.thickness,
    );
    requireElement<HTMLInputElement>("editor-track-range-road-width").value = conciseNumber(
      view.roadWidth,
    );
    requireElement<HTMLInputElement>("editor-track-range-road-bank").value = conciseNumber(
      view.roadBankDegrees,
    );
    requireElement<HTMLSelectElement>("editor-track-range-road-surface").value = view.roadSurface;
    requireElement<HTMLSelectElement>("editor-track-range-road-material").value =
      view.roadMaterialId;
    requireElement<HTMLInputElement>("editor-track-range-road-strength").value = conciseNumber(
      view.roadSurfaceStrength,
    );
    requireElement<HTMLInputElement>("editor-track-range-road-cooldown").value = conciseNumber(
      view.roadSurfaceCooldownSeconds,
    );
    this.updateEditorSurfaceFields(view.roadSurface);
  }

  public renderEditorTrackNode(view: EditorTrackNodeView | null): void {
    const panel = requireElement("editor-track-node-panel");
    panel.hidden = view === null;
    if (view === null) {
      return;
    }
    requireElement("editor-track-node-index").textContent =
      `${String(view.index)} OF ${String(view.total)}`;
    requireElement("editor-track-node-kind").textContent =
      view.endpoint === null ? "CONTROL POINT" : `OPEN ${view.endpoint.toUpperCase()}`;
    const [x, y, z] = view.position;
    requireElement<HTMLInputElement>("editor-track-node-x").value = conciseNumber(x);
    requireElement<HTMLInputElement>("editor-track-node-y").value = conciseNumber(y);
    requireElement<HTMLInputElement>("editor-track-node-z").value = conciseNumber(z);
    requireElement<HTMLInputElement>("editor-track-node-width").value = conciseNumber(view.width);
    requireElement<HTMLInputElement>("editor-track-node-bank").value = conciseNumber(
      view.bankDegrees,
    );
    const deleteButton = requireElement<HTMLButtonElement>("editor-delete-track-node-button");
    deleteButton.disabled = !view.canDelete;
    deleteButton.title = view.canDelete
      ? "Remove this point and repair the curve"
      : "This track needs its remaining points";
    const splitButton = requireElement<HTMLButtonElement>("editor-split-track-button");
    splitButton.hidden = !view.canSplit;
    splitButton.disabled = !view.canSplit;
    requireElement("editor-track-node-help").textContent =
      view.endpoint === null
        ? "Drag the green point to reshape. Use the colored handles for smoother turns or Split Track Here to make two reconnectable ends."
        : `This open ${view.endpoint} is ready to connect at ${conciseNumber(view.position[1])} M high. Choose TRACK, then press and drag this bright endpoint toward another open end.`;
  }

  public updateEditorHistory(
    canUndo: boolean,
    canRedo: boolean,
    undoLabel: string | null,
    redoLabel: string | null,
  ): void {
    const undo = requireElement<HTMLButtonElement>("editor-undo-button");
    const redo = requireElement<HTMLButtonElement>("editor-redo-button");
    undo.disabled = !canUndo;
    redo.disabled = !canRedo;
    undo.title = undoLabel === null ? "Nothing to undo" : `Undo ${undoLabel}`;
    redo.title = redoLabel === null ? "Nothing to redo" : `Redo ${redoLabel}`;
    undo.setAttribute("aria-label", undo.title);
    redo.setAttribute("aria-label", redo.title);
  }

  public setEditorTopDown(active: boolean): void {
    const button = requireElement<HTMLButtonElement>("editor-top-down-button");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  public setEditorZoom(zoom: number): void {
    const normalized = clamp(zoom, 0.15, 3.5);
    requireElement<HTMLInputElement>("editor-zoom-slider").value = String(normalized);
    requireElement<HTMLOutputElement>("editor-zoom-output").value = percentage(normalized);
  }

  public setEditorHoverLabel(label: string | null): void {
    const output = requireElement<HTMLOutputElement>("editor-hover-label");
    output.hidden = label === null;
    output.value = label === null ? "" : `HOVER · ${label}`;
  }

  public setEditorTransformMode(mode: EditorTransformMode): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-editor-transform]")) {
      const active = button.dataset["editorTransform"] === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  public showEditorSelectionMarquee(
    left: number,
    top: number,
    width: number,
    height: number,
  ): void {
    const marquee = requireElement("editor-selection-marquee");
    marquee.hidden = false;
    marquee.style.left = `${String(left)}px`;
    marquee.style.top = `${String(top)}px`;
    marquee.style.width = `${String(width)}px`;
    marquee.style.height = `${String(height)}px`;
  }

  public hideEditorSelectionMarquee(): void {
    requireElement("editor-selection-marquee").hidden = true;
  }

  public renderEditorTutorial(view: EditorTutorialView | null): void {
    const tutorial = requireElement("editor-tutorial");
    tutorial.hidden = view === null;
    tutorial.classList.remove("is-demonstrating");
    if (view === null) {
      return;
    }
    requireElement("editor-tutorial-step").textContent =
      `${String(view.step)} OF ${String(view.totalSteps)}`;
    requireElement("editor-tutorial-instruction").textContent = view.instruction;
    requireElement("editor-tutorial-detail").textContent = view.detail;
    requireElement("editor-tutorial-next-button").textContent =
      view.step === view.totalSteps ? "FINISH" : "NEXT";
  }

  public demonstrateEditorTutorial(): void {
    const tutorial = requireElement("editor-tutorial");
    tutorial.classList.remove("is-demonstrating");
    void tutorial.offsetWidth;
    tutorial.classList.add("is-demonstrating");
    for (const element of document.querySelectorAll(".is-tutorial-highlight")) {
      element.classList.remove("is-tutorial-highlight");
    }
    const step = requireElement("editor-tutorial-step").textContent;
    const target =
      step.startsWith("2") || step.startsWith("3")
        ? requireElement("editor-track-tool-button")
        : step.startsWith("4")
          ? document.querySelector('[data-editor-asset="track.ramp"]')
          : step.startsWith("5")
            ? document.querySelector('[data-editor-wall-brush="paint-both"]')
            : step.startsWith("6")
              ? document.querySelector('[data-editor-asset="race.start-grid"]')
              : step.startsWith("7")
                ? requireElement("editor-test-button")
                : requireElement("editor-viewport-chrome");
    target?.classList.add("is-tutorial-highlight");
    window.clearTimeout(this.editorTutorialDemoTimeout);
    this.editorTutorialDemoTimeout = window.setTimeout(() => {
      target?.classList.remove("is-tutorial-highlight");
    }, 1_600);
  }

  public showEditorWheelValue(message: string): void {
    const output = requireElement<HTMLOutputElement>("editor-wheel-hud");
    output.hidden = false;
    output.value = message;
    window.clearTimeout(this.editorWheelTimeout);
    this.editorWheelTimeout = window.setTimeout(() => {
      output.hidden = true;
    }, 850);
  }

  public setEditorSaveStatus(message: string, state: "saved" | "pending" | "failed"): void {
    const status = requireElement("editor-save-status");
    status.textContent = message;
    status.dataset["saveState"] = state;
  }

  public applySettings(settings: GameSettings): void {
    this.settings = settings;
    this.selectedPlayerIndex = Math.min(this.selectedPlayerIndex, settings.playerCount - 1);
    const playerCount = requireElement<HTMLInputElement>("player-count");
    playerCount.value = String(settings.playerCount);
    requireElement<HTMLOutputElement>("player-count-output").value = String(settings.playerCount);
    requireElement("menu-player-count").textContent = String(settings.playerCount).padStart(2, "0");

    requireElement<HTMLSelectElement>("render-scale").value = String(settings.renderScale);
    requireElement<HTMLSelectElement>("aa-quality").value = settings.aaQuality;
    requireElement<HTMLSelectElement>("shadow-quality").value = settings.shadowQuality;
    requireElement<HTMLInputElement>("ambient-occlusion").checked = settings.ambientOcclusion;
    requireElement<HTMLInputElement>("vignette").checked = settings.vignette;
    requireElement<HTMLInputElement>("fullscreen-preference").checked =
      settings.fullscreenPreference;
    requireElement<HTMLInputElement>("ui-scale").value = String(settings.uiScale);
    requireElement<HTMLSelectElement>("marker-size").value = settings.markerSize;
    requireElement<HTMLInputElement>("analog-dead-zone").value = String(settings.analogDeadZone);
    requireElement<HTMLInputElement>("analog-sensitivity").value = String(
      settings.analogSensitivity,
    );
    requireElement<HTMLInputElement>("master-volume").value = String(settings.masterVolume);
    requireElement<HTMLInputElement>("effects-volume").value = String(settings.effectsVolume);
    requireElement<HTMLInputElement>("music-volume").value = String(settings.musicVolume);
    requireElement<HTMLInputElement>("reduced-motion").checked = settings.reducedMotion;
    requireElement<HTMLSelectElement>("camera-smoothing").value = settings.cameraSmoothing;
    requireElement<HTMLSelectElement>("particle-density").value = settings.particleDensity;
    requireElement<HTMLInputElement>("high-contrast-interactables").checked =
      settings.highContrastInteractables;
    requireElement<HTMLInputElement>("automatic-upright-recovery").checked =
      settings.automaticUprightRecovery;

    this.renderOptionOutputs(settings);
    this.applyPresentationHooks(settings);
    this.renderPlayerEditor();
  }

  public updateControllers(
    gamepads: readonly Gamepad[],
    assignments: readonly (number | null)[],
  ): void {
    this.gamepads = gamepads;
    this.controllerAssignments = assignments;
    this.renderPlayerEditor();
  }

  public updateFullscreen(active: boolean): void {
    const label = active ? "EXIT FULLSCREEN" : "ENTER FULLSCREEN";
    for (const buttonId of ["fullscreen-button", "options-fullscreen-button"]) {
      const button = requireElement<HTMLButtonElement>(buttonId);
      button.querySelector("span")?.replaceChildren(label);
      button.setAttribute("aria-pressed", String(active));
    }
    requireElement<HTMLOutputElement>("fullscreen-state").value = active
      ? "FULLSCREEN ACTIVE"
      : "WINDOWED";
    requireElement("game-root").dataset["fullscreenActive"] = String(active);
  }

  public toast(message: string): void {
    const toast = requireElement("toast");
    toast.textContent = message;
    toast.hidden = false;
    if (this.toastTimeout !== undefined) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      toast.hidden = true;
    }, 4_000);
  }

  public showError(message: string): void {
    requireElement("error-message").textContent = message;
    this.show("error");
  }

  private captureBinding(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      this.cancelBindingCapture();
      this.toast("Binding capture canceled.");
      return;
    }
    if (RESERVED_BINDINGS.has(event.code)) {
      this.showBindingWarning(
        `${this.formatCode(event.code)} is reserved for pause and cannot drive a car.`,
      );
      return;
    }
    const direction = this.captureDirection;
    if (direction === undefined) {
      return;
    }
    const current = this.settings?.playerInputs[this.selectedPlayerIndex];
    const duplicateDirection = BINDING_DIRECTIONS.find(
      (candidate) => candidate !== direction && current?.keyboard[candidate] === event.code,
    );
    if (duplicateDirection !== undefined) {
      this.showBindingWarning(
        `${this.formatCode(event.code)} already controls ${BINDING_ACTION_LABELS[duplicateDirection]} for this player.`,
      );
      return;
    }
    this.cancelBindingCapture();
    this.updateSelectedPlayerInput((input) => ({
      ...input,
      keyboard: Object.freeze({ ...input.keyboard, [direction]: event.code }),
    }));
  }

  private isScreenName(value: string): value is ScreenName {
    return this.screens.has(value as ScreenName);
  }

  private readBrowserGamepadsForActivation(): readonly Gamepad[] {
    if (!("getGamepads" in navigator)) {
      return [];
    }
    try {
      return [...navigator.getGamepads()].filter(
        (gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected,
      );
    } catch {
      return [];
    }
  }

  private isPlayerInputType(value: string): value is PlayerInputType {
    return value === "keyboard" || value === "controller";
  }

  private isBindingDirection(value: string): value is BindingDirection {
    return BINDING_DIRECTIONS.includes(value as BindingDirection);
  }

  private isVisible(name: ScreenName): boolean {
    return this.screens.get(name)?.hidden === false;
  }

  private isCurrentScreenVisible(): boolean {
    return this.isVisible(this.currentScreen);
  }

  private isActivationKey(event: KeyboardEvent): boolean {
    return (
      !event.repeat &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.code !== "Tab" &&
      event.key !== "Shift"
    );
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        !["button", "checkbox", "radio", "range", "reset", "submit"].includes(target.type))
    );
  }

  private isDirectionalControlTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        ["range", "number", "text", "search", "url", "email", "password"].includes(target.type))
    );
  }

  private handleCancel(): boolean {
    if (!this.isCurrentScreenVisible()) {
      return false;
    }
    if (
      this.currentScreen === "modes" ||
      this.currentScreen === "players" ||
      this.currentScreen === "options"
    ) {
      this.cancelBindingCapture();
      this.show("main");
      return true;
    }
    if (this.currentScreen === "map-library") {
      this.handlers?.leaveMapLibrary();
      return true;
    }
    if (this.currentScreen === "editor") {
      if (this.handlers?.cancelEditorAction() === true) {
        return true;
      }
      void this.handlers?.leaveEditor();
      return true;
    }
    if (this.currentScreen === "pause") {
      this.handlers?.pauseToggle();
      return true;
    }
    return false;
  }

  private emitEditorTransform(): void {
    const x = Number(requireElement<HTMLInputElement>("editor-position-x").value);
    const y = Number(requireElement<HTMLInputElement>("editor-position-y").value);
    const z = Number(requireElement<HTMLInputElement>("editor-position-z").value);
    const yawDegrees = Number(requireElement<HTMLInputElement>("editor-yaw").value);
    const primarySize = Number(requireElement<HTMLInputElement>("editor-primary-size").value);
    if (![x, y, z, yawDegrees, primarySize].every(Number.isFinite)) {
      this.toast("Use numbers for object position, angle, and size.");
      return;
    }
    this.handlers?.editorTransformChanged({
      position: [x, y, z],
      yawRadians: (yawDegrees * Math.PI) / 180,
      primarySize,
    });
  }

  private emitEditorPhysics(): void {
    const view = {
      mass: Number(requireElement<HTMLInputElement>("editor-physics-mass").value),
      friction: Number(requireElement<HTMLInputElement>("editor-physics-friction").value),
      restitution: Number(requireElement<HTMLInputElement>("editor-physics-restitution").value),
    };
    if (!Object.values(view).every(Number.isFinite)) {
      this.toast("Use numbers for weight, grip, and bounce.");
      return;
    }
    this.handlers?.editorPhysicsChanged(view);
  }

  private emitEditorMotion(): void {
    const view = {
      speed: Number(requireElement<HTMLInputElement>("editor-motion-speed").value),
      dwellSeconds: Number(requireElement<HTMLInputElement>("editor-motion-dwell").value),
      offset: [
        Number(requireElement<HTMLInputElement>("editor-motion-offset-x").value),
        Number(requireElement<HTMLInputElement>("editor-motion-offset-y").value),
        Number(requireElement<HTMLInputElement>("editor-motion-offset-z").value),
      ] as Vector3Tuple,
    };
    if (![view.speed, view.dwellSeconds, ...view.offset].every(Number.isFinite)) {
      this.toast("Use numbers for motion speed, pause, and travel.");
      return;
    }
    this.handlers?.editorMotionChanged(view);
  }

  private emitEditorBoostPad(): void {
    const view = {
      boostSpeed: Number(requireElement<HTMLInputElement>("editor-boost-speed").value),
      liftSpeed: Number(requireElement<HTMLInputElement>("editor-boost-lift").value),
      cooldownSeconds: Number(requireElement<HTMLInputElement>("editor-boost-cooldown").value),
    };
    if (!Object.values(view).every(Number.isFinite)) {
      this.toast("Use numbers for pad power, lift, and cooldown.");
      return;
    }
    this.handlers?.editorBoostPadChanged(view);
  }

  private emitEditorSurfacePad(): void {
    const view = {
      strength: Number(requireElement<HTMLInputElement>("editor-surface-pad-strength").value),
      cooldownSeconds: Number(
        requireElement<HTMLInputElement>("editor-surface-pad-cooldown").value,
      ),
    };
    if (!Object.values(view).every(Number.isFinite)) {
      this.toast("Use numbers for pad strength and reuse delay.");
      return;
    }
    this.handlers?.editorSurfacePadChanged(view);
  }

  private emitEditorGuidance(): void {
    const glow = Number(requireElement<HTMLInputElement>("editor-guidance-glow").value);
    if (!Number.isFinite(glow)) {
      this.toast("Use a number for glow.");
      return;
    }
    this.handlers?.editorGuidanceChanged({
      color: requireElement<HTMLInputElement>("editor-guidance-color").value,
      glow,
      solid: requireElement<HTMLInputElement>("editor-guidance-solid").checked,
    });
  }

  private emitEditorDecoration(): void {
    const glow = Number(requireElement<HTMLInputElement>("editor-decoration-glow").value);
    const intensity = Number(requireElement<HTMLInputElement>("editor-decoration-intensity").value);
    const range = Number(requireElement<HTMLInputElement>("editor-decoration-range").value);
    if (![glow, intensity, range].every(Number.isFinite)) {
      this.toast("Use numbers for glow, brightness, and range.");
      return;
    }
    this.handlers?.editorDecorationChanged({
      color: requireElement<HTMLInputElement>("editor-decoration-color").value,
      glow,
      intensity,
      range,
      enabled: requireElement<HTMLInputElement>("editor-decoration-enabled").checked,
    });
  }

  private emitEditorSnapSettings(): void {
    this.handlers?.editorSnapChanged({
      gridEnabled: requireElement<HTMLInputElement>("editor-grid-snap").checked,
      gridSize: Number(requireElement<HTMLSelectElement>("editor-grid-size").value),
      angleEnabled: requireElement<HTMLInputElement>("editor-angle-snap").checked,
      surfaceEnabled: requireElement<HTMLInputElement>("editor-surface-snap").checked,
    });
  }

  private emitEditorRaceSetup(): void {
    const mode = requireElement<HTMLSelectElement>("editor-race-mode").value;
    const lapCount = Number(requireElement<HTMLInputElement>("editor-race-laps").value);
    const finishRule = requireElement<HTMLSelectElement>("editor-finish-rule").value;
    const recoveryDelaySeconds = Number(
      requireElement<HTMLInputElement>("editor-race-recovery-delay").value,
    );
    const recoveryPenaltySeconds = Number(
      requireElement<HTMLInputElement>("editor-race-recovery-penalty").value,
    );
    if (
      !isMapType(mode) ||
      !Number.isFinite(lapCount) ||
      !Number.isFinite(recoveryDelaySeconds) ||
      !Number.isFinite(recoveryPenaltySeconds) ||
      (finishRule !== "any" && finishRule !== "required-group")
    ) {
      this.toast("Choose a race mode, finish rule, and 1–99 laps.");
      return;
    }
    this.handlers?.editorRaceSetupChanged({
      mode,
      lapCount,
      finishRule,
      recoveryDelaySeconds,
      recoveryPenaltySeconds,
    });
  }

  private emitEditorEnvironment(): void {
    const numericIds = [
      "editor-environment-key-intensity",
      "editor-environment-key-x",
      "editor-environment-key-y",
      "editor-environment-key-z",
      "editor-environment-ambient-intensity",
      "editor-environment-gravity",
      "editor-environment-fog-near",
      "editor-environment-fog-far",
      "editor-environment-music-volume",
      "editor-environment-oob",
    ] as const;
    const values = numericIds.map((id) => Number(requireElement<HTMLInputElement>(id).value));
    if (!values.every(Number.isFinite)) {
      this.toast("Use numbers for the advanced world controls.");
      return;
    }
    const [
      keyLightIntensity,
      keyX,
      keyY,
      keyZ,
      ambientLightIntensity,
      gravityStrength,
      fogNear,
      fogFar,
      musicVolume,
      outOfBoundsHeight,
    ] = values as [number, number, number, number, number, number, number, number, number, number];
    const skyPreset = requireElement<HTMLSelectElement>("editor-environment-sky").value;
    const groundMode = requireElement<HTMLSelectElement>("editor-environment-ground").value;
    if (
      (groundMode !== "ground" && groundMode !== "void") ||
      (skyPreset !== "day" &&
        skyPreset !== "sunset" &&
        skyPreset !== "night" &&
        skyPreset !== "custom")
    ) {
      return;
    }
    const musicValue = requireElement<HTMLSelectElement>("editor-environment-music").value;
    this.handlers?.editorEnvironmentChanged({
      groundMode,
      skyPreset,
      backgroundColor: requireElement<HTMLInputElement>("editor-environment-background").value,
      keyLightDirection: [keyX, keyY, keyZ],
      keyLightIntensity,
      keyLightColor: requireElement<HTMLInputElement>("editor-environment-key-color").value,
      ambientLightIntensity,
      ambientLightColor: requireElement<HTMLInputElement>("editor-environment-ambient-color").value,
      gravityStrength,
      fogEnabled: requireElement<HTMLInputElement>("editor-environment-fog").checked,
      fogColor: requireElement<HTMLInputElement>("editor-environment-fog-color").value,
      fogNear,
      fogFar,
      musicAssetId:
        musicValue === "music.arcade" ||
        musicValue === "music.cruise" ||
        musicValue === "music.starlight"
          ? musicValue
          : null,
      musicVolume,
      outOfBoundsHeight,
    });
  }

  private applyEditorSkyPreset(): void {
    const preset = requireElement<HTMLSelectElement>("editor-environment-sky").value;
    const settings =
      preset === "day"
        ? ["#a5b3c4", "#fff9ea", "#8398a8", "2.1", "1.35"]
        : preset === "sunset"
          ? ["#c87973", "#ffb36b", "#705e82", "2.4", "1.1"]
          : preset === "night"
            ? ["#18243d", "#94b7ff", "#35466a", "1.15", "0.75"]
            : null;
    if (settings === null) {
      return;
    }
    requireElement<HTMLInputElement>("editor-environment-background").value = settings[0]!;
    requireElement<HTMLInputElement>("editor-environment-key-color").value = settings[1]!;
    requireElement<HTMLInputElement>("editor-environment-ambient-color").value = settings[2]!;
    requireElement<HTMLInputElement>("editor-environment-key-intensity").value = settings[3]!;
    requireElement<HTMLInputElement>("editor-environment-ambient-intensity").value = settings[4]!;
  }

  private emitEditorTrack(): void {
    const width = Number(requireElement<HTMLInputElement>("editor-track-width").value);
    const elevation = Number(requireElement<HTMLInputElement>("editor-track-elevation").value);
    const bankDegrees = Number(requireElement<HTMLInputElement>("editor-track-bank").value);
    if (![width, elevation, bankDegrees].every(Number.isFinite)) {
      this.toast("Use numbers for track width, elevation, and banking.");
      return;
    }
    this.handlers?.editorTrackChanged(width, elevation, bankDegrees);
  }

  private emitEditorTrackNode(): void {
    const x = Number(requireElement<HTMLInputElement>("editor-track-node-x").value);
    const y = Number(requireElement<HTMLInputElement>("editor-track-node-y").value);
    const z = Number(requireElement<HTMLInputElement>("editor-track-node-z").value);
    const width = Number(requireElement<HTMLInputElement>("editor-track-node-width").value);
    const bankDegrees = Number(requireElement<HTMLInputElement>("editor-track-node-bank").value);
    if (![x, y, z, width, bankDegrees].every(Number.isFinite)) {
      this.toast("Use numbers for point position, width, and banking.");
      return;
    }
    this.handlers?.editorTrackNodeChanged([x, y, z], width, bankDegrees);
  }

  private emitEditorTrackWalls(): void {
    this.handlers?.editorTrackWallsChanged(
      requireElement<HTMLInputElement>("editor-track-wall-left").checked,
      requireElement<HTMLInputElement>("editor-track-wall-right").checked,
    );
  }

  private emitEditorTrackRange(): void {
    const side = requireElement<HTMLSelectElement>("editor-track-range-side").value;
    const styleId = wallStyleId(
      requireElement<HTMLSelectElement>("editor-track-range-style").value,
    );
    const height = Number(requireElement<HTMLInputElement>("editor-track-range-wall-height").value);
    const thickness = Number(
      requireElement<HTMLInputElement>("editor-track-range-wall-thickness").value,
    );
    if (
      (side !== "left" && side !== "right" && side !== "both") ||
      styleId === null ||
      !Number.isFinite(height) ||
      !Number.isFinite(thickness)
    ) {
      this.toast("Choose a wall side and use numbers for height and thickness.");
      return;
    }
    this.handlers?.editorApplyTrackRange(side, { height, thickness, styleId });
  }

  private emitEditorTrackRoadRange(): void {
    const width = Number(requireElement<HTMLInputElement>("editor-track-range-road-width").value);
    const bankDegrees = Number(
      requireElement<HTMLInputElement>("editor-track-range-road-bank").value,
    );
    const surface = trackSurfaceId(
      requireElement<HTMLSelectElement>("editor-track-range-road-surface").value,
    );
    const materialId = trackMaterialId(
      requireElement<HTMLSelectElement>("editor-track-range-road-material").value,
    );
    const surfaceStrength = Number(
      requireElement<HTMLInputElement>("editor-track-range-road-strength").value,
    );
    const surfaceCooldownSeconds = Number(
      requireElement<HTMLInputElement>("editor-track-range-road-cooldown").value,
    );
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(bankDegrees) ||
      !Number.isFinite(surfaceStrength) ||
      !Number.isFinite(surfaceCooldownSeconds) ||
      surface === null ||
      materialId === null
    ) {
      this.toast("Choose a road material and surface, then use numbers for width and banking.");
      return;
    }
    this.handlers?.editorApplyTrackRoadRange({
      width,
      bankRadians: (bankDegrees * Math.PI) / 180,
      surface,
      materialId,
      surfaceStrength,
      surfaceCooldownSeconds,
    });
  }

  private updateEditorSurfaceFields(surface: TrackSurface): void {
    requireElement("editor-track-range-road-strength-field").hidden = surface === "normal";
    requireElement("editor-track-range-road-cooldown-field").hidden =
      surface !== "boost" && surface !== "bouncy" && surface !== "hazard";
  }

  private getFocusableElements(): HTMLElement[] {
    const screen = this.screens.get(this.currentScreen);
    if (screen === undefined || screen.hidden) {
      return [];
    }
    return [...screen.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => {
      if (element.closest("[hidden]") !== null || element.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  private focusBoundary(boundary: "first" | "last"): void {
    const elements = this.getFocusableElements();
    const target = boundary === "first" ? elements[0] : elements.at(-1);
    target?.focus({ preventScroll: true });
  }

  private moveFocus(direction: NavigationDirection): void {
    const active = document.activeElement;
    if (
      (direction === "left" || direction === "right") &&
      active instanceof HTMLElement &&
      this.adjustFocusedControl(active, direction)
    ) {
      return;
    }

    const elements = this.getFocusableElements();
    if (elements.length === 0) {
      return;
    }
    const current = active instanceof HTMLElement ? active : undefined;
    const currentIndex = current === undefined ? -1 : elements.indexOf(current);
    if (currentIndex < 0 || current === undefined) {
      const target = direction === "up" || direction === "left" ? elements.at(-1) : elements[0];
      target?.focus({ preventScroll: true });
      return;
    }

    const spatialTarget = this.findSpatialTarget(current, elements, direction);
    if (spatialTarget !== undefined) {
      spatialTarget.focus({ preventScroll: true });
      return;
    }

    const increment = direction === "up" || direction === "left" ? -1 : 1;
    const wrappedIndex = (currentIndex + increment + elements.length) % elements.length;
    elements[wrappedIndex]?.focus({ preventScroll: true });
  }

  private findSpatialTarget(
    current: HTMLElement,
    elements: readonly HTMLElement[],
    direction: NavigationDirection,
  ): HTMLElement | undefined {
    const source = current.getBoundingClientRect();
    if (source.width === 0 && source.height === 0) {
      return undefined;
    }
    const sourceX = source.left + source.width / 2;
    const sourceY = source.top + source.height / 2;
    let best: { readonly element: HTMLElement; readonly score: number } | undefined;

    for (const candidate of elements) {
      if (candidate === current) {
        continue;
      }
      const rect = candidate.getBoundingClientRect();
      const deltaX = rect.left + rect.width / 2 - sourceX;
      const deltaY = rect.top + rect.height / 2 - sourceY;
      const primary =
        direction === "up"
          ? -deltaY
          : direction === "down"
            ? deltaY
            : direction === "left"
              ? -deltaX
              : deltaX;
      if (primary <= 1) {
        continue;
      }
      const secondary =
        direction === "up" || direction === "down" ? Math.abs(deltaX) : Math.abs(deltaY);
      const offAxisPenalty = secondary > primary * 1.8 ? 10_000 : 0;
      const score = primary * 4 + secondary + offAxisPenalty;
      if (best === undefined || score < best.score) {
        best = { element: candidate, score };
      }
    }
    return best?.element;
  }

  private adjustFocusedControl(element: HTMLElement, direction: "left" | "right"): boolean {
    const increment = direction === "left" ? -1 : 1;
    if (element instanceof HTMLSelectElement) {
      const options = [...element.options];
      let nextIndex = element.selectedIndex;
      do {
        nextIndex += increment;
      } while (
        nextIndex >= 0 &&
        nextIndex < options.length &&
        (options[nextIndex]?.disabled === true || options[nextIndex]?.hidden === true)
      );
      if (nextIndex < 0 || nextIndex >= options.length) {
        return true;
      }
      element.selectedIndex = nextIndex;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (element instanceof HTMLInputElement && element.type === "range") {
      const minimum = Number(element.min);
      const maximum = Number(element.max);
      const step = Number(element.step || 1);
      const nextValue = clamp(Number(element.value) + step * increment, minimum, maximum);
      element.value = String(nextValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  private activateFocusedControl(): void {
    const elements = this.getFocusableElements();
    const active = document.activeElement;
    const target =
      active instanceof HTMLElement && elements.includes(active) ? active : elements[0];
    if (target === undefined) {
      return;
    }
    if (target instanceof HTMLSelectElement) {
      this.adjustFocusedControl(target, "right");
      return;
    }
    target.focus({ preventScroll: true });
    target.click();
  }

  private beginBindingCapture(direction: BindingDirection): void {
    this.captureDirection = direction;
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-binding-direction]")) {
      const active = button.dataset["bindingDirection"] === direction;
      button.classList.toggle("is-capturing", active);
      button.setAttribute("aria-pressed", String(active));
      if (active) {
        button.querySelector("strong")?.replaceChildren("PRESS A KEY…");
      }
    }
    this.showBindingWarning("Press a key, or Escape to cancel.");
  }

  private cancelBindingCapture(): void {
    this.captureDirection = undefined;
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-binding-direction]")) {
      button.classList.remove("is-capturing");
      button.setAttribute("aria-pressed", "false");
    }
    this.renderPlayerEditor();
  }

  private updateSelectedPlayerInput(
    update: (current: PlayerInputSettings) => PlayerInputSettings,
  ): void {
    const settings = this.settings;
    const current = settings?.playerInputs[this.selectedPlayerIndex];
    if (settings === undefined || current === undefined) {
      return;
    }
    const playerInputs = settings.playerInputs.map((input, index) =>
      index === this.selectedPlayerIndex ? update(input) : input,
    );
    this.handlers?.settingsChanged({ playerInputs });
  }

  private emitOptionsSettings(): void {
    const patch = this.readOptionsSettings();
    const current = this.settings;
    if (current !== undefined) {
      const nextSettings: GameSettings = Object.freeze({ ...current, ...patch });
      this.renderOptionOutputs(nextSettings);
      this.applyPresentationHooks(nextSettings);
    }
    requireElement("options-status").textContent = "Changes applied and saved.";
    this.handlers?.settingsChanged(patch);
  }

  private readOptionsSettings(): OptionsSettingsPatch {
    return {
      renderScale: Number(
        requireElement<HTMLSelectElement>("render-scale").value,
      ) as GameSettings["renderScale"],
      aaQuality: requireElement<HTMLSelectElement>("aa-quality").value as GameSettings["aaQuality"],
      ambientOcclusion: requireElement<HTMLInputElement>("ambient-occlusion").checked,
      vignette: requireElement<HTMLInputElement>("vignette").checked,
      shadowQuality: requireElement<HTMLSelectElement>("shadow-quality")
        .value as GameSettings["shadowQuality"],
      fullscreenPreference: requireElement<HTMLInputElement>("fullscreen-preference").checked,
      uiScale: Number(requireElement<HTMLInputElement>("ui-scale").value),
      markerSize: requireElement<HTMLSelectElement>("marker-size")
        .value as GameSettings["markerSize"],
      analogDeadZone: Number(requireElement<HTMLInputElement>("analog-dead-zone").value),
      analogSensitivity: Number(requireElement<HTMLInputElement>("analog-sensitivity").value),
      masterVolume: Number(requireElement<HTMLInputElement>("master-volume").value),
      effectsVolume: Number(requireElement<HTMLInputElement>("effects-volume").value),
      musicVolume: Number(requireElement<HTMLInputElement>("music-volume").value),
      reducedMotion: requireElement<HTMLInputElement>("reduced-motion").checked,
      cameraSmoothing: requireElement<HTMLSelectElement>("camera-smoothing")
        .value as GameSettings["cameraSmoothing"],
      particleDensity: requireElement<HTMLSelectElement>("particle-density")
        .value as GameSettings["particleDensity"],
      highContrastInteractables: requireElement<HTMLInputElement>("high-contrast-interactables")
        .checked,
      automaticUprightRecovery: requireElement<HTMLInputElement>("automatic-upright-recovery")
        .checked,
    };
  }

  private renderOptionOutputs(settings: GameSettings): void {
    requireElement<HTMLOutputElement>("ui-scale-output").value = percentage(settings.uiScale);
    requireElement<HTMLOutputElement>("analog-dead-zone-output").value = percentage(
      settings.analogDeadZone,
    );
    requireElement<HTMLOutputElement>("analog-sensitivity-output").value =
      `${settings.analogSensitivity.toFixed(2)}×`;
    requireElement<HTMLOutputElement>("master-volume-output").value = percentage(
      settings.masterVolume,
    );
    requireElement<HTMLOutputElement>("effects-volume-output").value = percentage(
      settings.effectsVolume,
    );
    requireElement<HTMLOutputElement>("music-volume-output").value = percentage(
      settings.musicVolume,
    );
    requireElement("fullscreen-preference-summary").textContent = settings.fullscreenPreference
      ? "Saved preference: remind me to enter fullscreen"
      : "Saved preference: windowed play";
  }

  private applyPresentationHooks(settings: GameSettings): void {
    document.documentElement.style.setProperty("--ui-scale", settings.uiScale.toFixed(2));
    const root = requireElement("game-root");
    root.dataset["markerSize"] = settings.markerSize;
    root.dataset["reducedMotion"] = String(settings.reducedMotion);
    root.dataset["cameraSmoothing"] = settings.cameraSmoothing;
    root.dataset["particleDensity"] = settings.particleDensity;
    root.dataset["highContrastInteractables"] = String(settings.highContrastInteractables);
    root.dataset["automaticUprightRecovery"] = String(settings.automaticUprightRecovery);
    root.dataset["fullscreenPreference"] = String(settings.fullscreenPreference);
  }

  private resetSettingsToDefaults(): void {
    const defaults = createDefaultSettings({
      prefersReducedMotion:
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    this.applySettings(defaults);
    if (this.handlers?.resetSettings !== undefined) {
      void this.handlers.resetSettings();
    } else {
      const { schemaVersion: _schemaVersion, ...patch } = defaults;
      void _schemaVersion;
      this.handlers?.settingsChanged(patch);
    }
    requireElement("options-status").textContent = "All settings and controls reset to defaults.";
    this.toast("Default settings restored.");
  }

  private renderPlayerEditor(): void {
    const settings = this.settings;
    if (settings === undefined) {
      return;
    }

    const playerSelect = requireElement<HTMLSelectElement>("controls-player");
    for (const option of playerSelect.options) {
      option.disabled = Number(option.value) >= settings.playerCount;
    }
    playerSelect.value = String(this.selectedPlayerIndex);

    const input = settings.playerInputs[this.selectedPlayerIndex];
    if (input === undefined) {
      return;
    }

    requireElement("player-color-chip").style.backgroundColor =
      PLAYER_COLORS[this.selectedPlayerIndex] ?? "#FFFFFF";
    requireElement<HTMLSelectElement>("input-type").value = input.inputType;
    requireElement("keyboard-settings").hidden = input.inputType !== "keyboard";
    requireElement("controller-settings").hidden = input.inputType !== "controller";

    for (const direction of BINDING_DIRECTIONS) {
      const button = document.querySelector<HTMLButtonElement>(
        `[data-binding-direction="${direction}"]`,
      );
      const label = requireElement(`binding-${direction}`);
      label.textContent = this.formatCode(input.keyboard[direction]);
      button?.setAttribute(
        "aria-label",
        `Player ${String(this.selectedPlayerIndex + 1)} ${BINDING_ACTION_LABELS[direction]}: ${this.formatCode(input.keyboard[direction])}. Activate to rebind.`,
      );
    }

    this.renderControllerSelector(input);
    this.renderConflictWarning();
  }

  private renderControllerSelector(input: PlayerInputSettings): void {
    const select = requireElement<HTMLSelectElement>("controller-select");
    const assigned = this.controllerAssignments[this.selectedPlayerIndex] ?? null;
    select.replaceChildren();

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent =
      this.gamepads.length === 0 ? "No controller connected" : "Choose a controller";
    select.append(empty);

    for (const gamepad of this.gamepads) {
      const option = document.createElement("option");
      option.value = String(gamepad.index);
      option.textContent = `Gamepad ${String(gamepad.index + 1)} — ${gamepad.id}`;
      const owner = this.controllerAssignments.findIndex(
        (candidate, index) => candidate === gamepad.index && index !== this.selectedPlayerIndex,
      );
      option.disabled = owner >= 0;
      if (owner >= 0) {
        option.textContent += ` (P${String(owner + 1)})`;
      }
      select.append(option);
    }
    select.value = assigned === null ? "" : String(assigned);

    const status = requireElement("controller-status");
    const selectedGamepad = this.gamepads.find((gamepad) => gamepad.index === assigned);
    this.renderControllerCalibration(input, selectedGamepad);
    if (!("getGamepads" in navigator)) {
      status.textContent =
        "This browser does not expose the Gamepad API. Keyboard play remains available.";
    } else if (this.gamepads.length === 0) {
      status.textContent =
        input.controllerIdHint === null
          ? "Connect a controller, then press one of its buttons."
          : `Waiting to reconnect ${input.controllerIdHint}.`;
    } else if (selectedGamepad?.mapping !== "standard") {
      status.textContent =
        input.controllerCalibration === null
          ? "This controller has a non-standard mapping. Save an explicit axis calibration before driving."
          : "Non-standard mapping calibrated. Test the axes in Sandbox and adjust if needed.";
    } else if (selectedGamepad !== undefined) {
      status.textContent = `Assigned: Gamepad ${String(
        selectedGamepad.index + 1,
      )} (${selectedGamepad.mapping || "unmapped"}).`;
    } else {
      status.textContent = `${String(this.gamepads.length)} controller${
        this.gamepads.length === 1 ? "" : "s"
      } available.`;
    }
  }

  private renderControllerCalibration(
    input: PlayerInputSettings,
    gamepad: Gamepad | undefined,
  ): void {
    const fieldset = requireElement<HTMLFieldSetElement>("controller-calibration");
    const requiresCalibration = gamepad !== undefined && gamepad.mapping !== "standard";
    fieldset.hidden = !requiresCalibration;
    if (!requiresCalibration) {
      return;
    }

    const horizontalSelect = requireElement<HTMLSelectElement>("horizontal-axis");
    const verticalSelect = requireElement<HTMLSelectElement>("vertical-axis");
    horizontalSelect.replaceChildren();
    verticalSelect.replaceChildren();
    const axisCount = Math.max(gamepad.axes.length, 2);
    for (let index = 0; index < axisCount; index += 1) {
      const horizontalOption = document.createElement("option");
      horizontalOption.value = String(index);
      horizontalOption.textContent = `Axis ${String(index)} (${(gamepad.axes[index] ?? 0).toFixed(
        2,
      )})`;
      horizontalSelect.append(horizontalOption);
      verticalSelect.append(horizontalOption.cloneNode(true));
    }
    horizontalSelect.value = String(input.controllerCalibration?.horizontalAxis ?? 0);
    verticalSelect.value = String(input.controllerCalibration?.verticalAxis ?? 1);
    requireElement<HTMLInputElement>("invert-horizontal").checked =
      input.controllerCalibration?.horizontalSign === -1;
    requireElement<HTMLInputElement>("invert-vertical").checked =
      input.controllerCalibration?.verticalSign !== 1;
  }

  private renderConflictWarning(): void {
    const settings = this.settings;
    if (settings === undefined) {
      return;
    }
    const owners = new Map<string, number[]>();
    for (let index = 0; index < settings.playerCount; index += 1) {
      const input = settings.playerInputs[index];
      if (input?.inputType !== "keyboard") {
        continue;
      }
      for (const code of [
        input.keyboard.up,
        input.keyboard.down,
        input.keyboard.left,
        input.keyboard.right,
        input.keyboard.brake,
      ]) {
        const players = owners.get(code) ?? [];
        if (!players.includes(index)) {
          players.push(index);
        }
        owners.set(code, players);
      }
    }
    const conflicts = [...owners.entries()].filter(([, players]) => players.length > 1);
    if (conflicts.length === 0) {
      this.showBindingWarning();
      return;
    }
    this.showBindingWarning(
      `Binding conflict: ${conflicts
        .map(
          ([code, players]) =>
            `${this.formatCode(code)} is shared by ${players
              .map((index) => `P${String(index + 1)}`)
              .join(", ")}`,
        )
        .join("; ")}.`,
    );
  }

  private showBindingWarning(message?: string): void {
    const warning = requireElement("binding-warning");
    warning.hidden = message === undefined;
    warning.textContent = message ?? "";
  }

  private formatCode(code: string): string {
    if (code === "ShiftLeft") {
      return "Left Shift";
    }
    if (code === "ShiftRight") {
      return "Right Shift";
    }
    return code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace(/^Arrow/, "Arrow ")
      .replace(/^Numpad/, "Numpad ");
  }
}

function wallStyleId(value: string): TrackWallStyleId | null {
  switch (value) {
    case "wall.clean":
    case "wall.safety-cyan":
    case "wall.sunset":
    case "wall.neon":
    case "wall.guardrail":
      return value;
    default:
      return null;
  }
}

function trackMaterialId(value: string): TrackMaterialId | null {
  switch (value) {
    case "track.asphalt":
    case "track.concrete":
    case "track.dirt":
    case "track.ice":
    case "track.neon":
    case "track.racing-stripes":
    case "track.checker":
    case "track.arrows":
    case "track.rainbow":
    case "track.sunset":
      return value;
    default:
      return null;
  }
}

function trackSurfaceId(value: string): TrackSurface | null {
  switch (value) {
    case "normal":
    case "slippery":
    case "sticky":
    case "bouncy":
    case "slow":
    case "boost":
    case "hazard":
      return value;
    default:
      return null;
  }
}

function isMapType(value: string): value is MapType {
  return (
    value === "free-roam" ||
    value === "circuit" ||
    value === "point-to-point" ||
    value === "time-trial" ||
    value === "multi-route"
  );
}

function interactionLabel(value: string): string {
  return value.replaceAll("-", " ").toUpperCase();
}

function gravityPreset(strength: number): string {
  const presets = [
    ["earth", 9.81],
    ["moon", 1.62],
    ["floaty", 4],
    ["strong", 18],
    ["zero", 0],
  ] as const;
  return presets.find(([, value]) => Math.abs(value - strength) < 0.005)?.[0] ?? "custom";
}
