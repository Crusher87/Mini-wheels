export const MAP_SCHEMA_VERSION = 1 as const;

export const ENVIRONMENT_MUSIC_ASSET_IDS = Object.freeze([
  "music.arcade",
  "music.cruise",
  "music.starlight",
] as const);
export type EnvironmentMusicAssetId = (typeof ENVIRONMENT_MUSIC_ASSET_IDS)[number];

export const MAP_TYPES = [
  "free-roam",
  "circuit",
  "point-to-point",
  "time-trial",
  "multi-route",
] as const;

export type MapType = (typeof MAP_TYPES)[number];
export type Vector3Tuple = readonly [number, number, number];
export type QuaternionTuple = readonly [number, number, number, number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface MapTransform {
  readonly position: Vector3Tuple;
  readonly rotation: QuaternionTuple;
  readonly scale: Vector3Tuple;
}

export interface MapEntity {
  readonly id: string;
  readonly assetId: string;
  readonly transform: MapTransform;
  readonly groupId: string | null;
  readonly properties: Readonly<Record<string, JsonValue>>;
}

export interface TrackNode {
  readonly id: string;
  readonly position: Vector3Tuple;
  readonly tangentIn: Vector3Tuple;
  readonly tangentOut: Vector3Tuple;
  readonly width: number;
  readonly bankRadians: number;
}

export interface TrackWallRange {
  readonly id: string;
  readonly side: "left" | "right";
  readonly startDistance: number;
  readonly endDistance: number;
  readonly height: number;
  readonly thickness: number;
  readonly styleId: string;
}

export const TRACK_SURFACES = [
  "normal",
  "slippery",
  "sticky",
  "bouncy",
  "slow",
  "boost",
  "hazard",
] as const;

export type TrackSurface = (typeof TRACK_SURFACES)[number];

export const TRACK_SURFACE_STRENGTH_MINIMUM = 0.25;
export const TRACK_SURFACE_STRENGTH_MAXIMUM = 2;
export const TRACK_SURFACE_COOLDOWN_MINIMUM_SECONDS = 0.1;
export const TRACK_SURFACE_COOLDOWN_MAXIMUM_SECONDS = 5;

export function defaultTrackSurfaceCooldownSeconds(surface: TrackSurface): number {
  switch (surface) {
    case "bouncy":
      return 0.65;
    case "boost":
      return 0.35;
    case "hazard":
      return 0.9;
    default:
      return 0.35;
  }
}

export interface TrackRoadRange {
  readonly id: string;
  readonly startDistance: number;
  readonly endDistance: number;
  readonly width: number;
  readonly bankRadians: number;
  readonly surface: TrackSurface;
  readonly materialId: string;
  /** Optional so road ranges saved before adjustable surface effects remain compatible. */
  readonly surfaceStrength?: number;
  readonly surfaceCooldownSeconds?: number;
}

export interface TrackDefinition {
  readonly id: string;
  readonly closed: boolean;
  readonly surface: TrackSurface;
  readonly materialId: string;
  readonly nodes: readonly TrackNode[];
  readonly walls: readonly TrackWallRange[];
  /** Optional so schema-v1 maps saved before range styling remain source compatible. */
  readonly roadRanges?: readonly TrackRoadRange[];
}

export interface CheckpointGroupDefinition {
  readonly id: string;
  readonly checkpointEntityIds: readonly string[];
  readonly required: boolean;
}

export interface RouteEdgeDefinition {
  readonly id: string;
  readonly fromGroupId: string;
  readonly toGroupId: string;
  readonly shortcut: boolean;
}

export interface RaceDefinition {
  readonly mode: MapType;
  readonly activeStartGridId: string | null;
  readonly lapCount: number;
  readonly checkpointGroups: readonly CheckpointGroupDefinition[];
  readonly routeEdges: readonly RouteEdgeDefinition[];
  readonly finishEntityIds: readonly string[];
  readonly finishRule: "any" | "required-group";
  readonly recovery: {
    readonly delaySeconds: number;
    readonly penaltySeconds: number;
  };
}

export const INTERACTION_EVENTS = [
  "pressed",
  "released",
  "entered",
  "exited",
  "elapsed",
  "crossed",
  "race-started",
  "race-finished",
  "activated",
  "deactivated",
] as const;

export const INTERACTION_ACTIONS = [
  "open",
  "close",
  "toggle",
  "start",
  "stop",
  "reverse",
  "reset",
  "enable",
  "disable",
  "pulse",
  "play",
  "show",
  "hide",
  "increment",
] as const;

export const INTERACTION_CONDITIONS = [
  "lap-1-or-later",
  "lap-2-or-later",
  "lap-3-or-later",
  "race-running",
] as const;

export type InteractionEvent = (typeof INTERACTION_EVENTS)[number];
export type InteractionAction = (typeof INTERACTION_ACTIONS)[number];
export type InteractionCondition = (typeof INTERACTION_CONDITIONS)[number];

export interface InteractionDefinition {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly event: InteractionEvent;
  readonly condition: InteractionCondition | null;
  readonly targetEntityId: string;
  readonly action: InteractionAction;
}

export interface MapDocument {
  readonly header: {
    readonly schemaVersion: typeof MAP_SCHEMA_VERSION;
    readonly documentId: string;
    readonly title: string;
    readonly description: string;
    readonly mapType: MapType;
    readonly sourceTemplateId: string | null;
  };
  readonly metadata: {
    readonly tags: readonly string[];
  };
  readonly environment: {
    readonly groundMode: "ground" | "void";
    readonly skyPreset: "day" | "sunset" | "night" | "custom";
    readonly backgroundColor: string;
    readonly keyLight: {
      readonly direction: Vector3Tuple;
      readonly intensity: number;
      readonly color: string;
    };
    readonly ambientLight: {
      readonly intensity: number;
      readonly color: string;
    };
    readonly gravity: Vector3Tuple;
    readonly fog: {
      readonly enabled: boolean;
      readonly color: string;
      readonly near: number;
      readonly far: number;
    };
    readonly musicAssetId: EnvironmentMusicAssetId | null;
    readonly musicVolume: number;
    readonly outOfBoundsHeight: number;
  };
  readonly entities: readonly MapEntity[];
  readonly tracks: readonly TrackDefinition[];
  readonly race: RaceDefinition;
  readonly interactions: readonly InteractionDefinition[];
  readonly editorHints: {
    readonly thumbnailCamera: {
      readonly position: Vector3Tuple;
      readonly target: Vector3Tuple;
    } | null;
  };
}

export interface MapIdFactory {
  (): string;
}

const IDENTITY_ROTATION: QuaternionTuple = Object.freeze([0, 0, 0, 1]);
const IDENTITY_SCALE: Vector3Tuple = Object.freeze([1, 1, 1]);

export function createMapId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function createStarterMapDocument(
  title = "My First Playground",
  createId: MapIdFactory = createMapId,
): MapDocument {
  const floorId = createId();
  const startGridId = createId();
  return Object.freeze({
    header: Object.freeze({
      schemaVersion: MAP_SCHEMA_VERSION,
      documentId: createId(),
      title,
      description: "A new Mini Wheels playground.",
      mapType: "free-roam",
      sourceTemplateId: "builtin.starter-playground",
    }),
    metadata: Object.freeze({
      tags: Object.freeze(["playground"]),
    }),
    environment: Object.freeze({
      groundMode: "ground",
      skyPreset: "day",
      backgroundColor: "#a5b3c4",
      keyLight: Object.freeze({
        direction: Object.freeze([-26, 42, 18] satisfies Vector3Tuple),
        intensity: 2.1,
        color: "#fff9ea",
      }),
      ambientLight: Object.freeze({
        intensity: 1.35,
        color: "#8398a8",
      }),
      gravity: Object.freeze([0, -9.81, 0] satisfies Vector3Tuple),
      fog: Object.freeze({
        enabled: false,
        color: "#a5b3c4",
        near: 30,
        far: 180,
      }),
      musicAssetId: null,
      musicVolume: 0.7,
      outOfBoundsHeight: -20,
    }),
    entities: Object.freeze([
      Object.freeze({
        id: floorId,
        assetId: "floor.rectangle",
        transform: Object.freeze({
          position: Object.freeze([0, -0.25, 0] satisfies Vector3Tuple),
          rotation: IDENTITY_ROTATION,
          scale: IDENTITY_SCALE,
        }),
        groupId: null,
        properties: Object.freeze({
          width: 40,
          depth: 40,
          height: 0.5,
          color: "#dfe8ee",
          surface: "normal",
        }),
      }),
      Object.freeze({
        id: startGridId,
        assetId: "race.start-grid",
        transform: Object.freeze({
          position: Object.freeze([0, 0.5, 0] satisfies Vector3Tuple),
          rotation: IDENTITY_ROTATION,
          scale: IDENTITY_SCALE,
        }),
        groupId: null,
        properties: Object.freeze({
          capacity: 10,
          columns: 2,
          spacing: 2.5,
        }),
      }),
    ]),
    tracks: Object.freeze([]),
    race: Object.freeze({
      mode: "free-roam",
      activeStartGridId: startGridId,
      lapCount: 1,
      checkpointGroups: Object.freeze([]),
      routeEdges: Object.freeze([]),
      finishEntityIds: Object.freeze([]),
      finishRule: "any",
      recovery: Object.freeze({
        delaySeconds: 0.75,
        penaltySeconds: 0,
      }),
    }),
    interactions: Object.freeze([]),
    editorHints: Object.freeze({
      thumbnailCamera: null,
    }),
  });
}

export function withMapTitle(document: MapDocument, title: string): MapDocument {
  return Object.freeze({
    ...document,
    header: Object.freeze({
      ...document.header,
      title,
    }),
  });
}

export function duplicateMapDocument(
  document: MapDocument,
  title: string,
  createId: MapIdFactory = createMapId,
): MapDocument {
  return Object.freeze({
    ...document,
    header: Object.freeze({
      ...document.header,
      documentId: createId(),
      title,
      sourceTemplateId: document.header.documentId,
    }),
  });
}
