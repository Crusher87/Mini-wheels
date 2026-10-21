import {
  ENVIRONMENT_MUSIC_ASSET_IDS,
  INTERACTION_ACTIONS,
  INTERACTION_CONDITIONS,
  INTERACTION_EVENTS,
  MAP_SCHEMA_VERSION,
  MAP_TYPES,
  TRACK_SURFACES,
  TRACK_SURFACE_COOLDOWN_MAXIMUM_SECONDS,
  TRACK_SURFACE_COOLDOWN_MINIMUM_SECONDS,
  TRACK_SURFACE_STRENGTH_MAXIMUM,
  TRACK_SURFACE_STRENGTH_MINIMUM,
  defaultTrackSurfaceCooldownSeconds,
  type JsonValue,
  type InteractionAction,
  type InteractionCondition,
  type InteractionDefinition,
  type InteractionEvent,
  type MapDocument,
  type MapEntity,
  type MapTransform,
  type MapType,
  type QuaternionTuple,
  type TrackDefinition,
  type TrackRoadRange,
  type TrackWallRange,
  type Vector3Tuple,
} from "./MapDocument";
import {
  EDITOR_ASSET_IDS,
  editorAssetManifest,
  normalizedSimpleFloorOutline,
  type FloorOutlinePoint,
} from "../editor/EditorAssetCatalog";

const DOCUMENT_KEYS = Object.freeze([
  "header",
  "metadata",
  "environment",
  "entities",
  "tracks",
  "race",
  "interactions",
  "editorHints",
]);
const SUPPORTED_ASSET_IDS = new Set<string>(EDITOR_ASSET_IDS);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_WORLD_EXTENT = 100_000;
const SAFE_COLLECTION_LENGTH = 25_000;
const SAFE_STRING_LENGTH = 4_096;

export class MapFormatError extends Error {
  public constructor(
    message: string,
    public readonly path = "$",
  ) {
    super(`${path}: ${message}`);
    this.name = "MapFormatError";
  }
}

export function decodeMapDocument(input: unknown): MapDocument {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new MapFormatError(
        `Invalid JSON (${error instanceof Error ? error.message : "parse failed"})`,
      );
    }
  }

  const root = requireRecord(value, "$");
  requireOnlyKeys(root, DOCUMENT_KEYS, "$");
  const header = requireRecord(root["header"], "$.header");
  const schemaVersion = requireInteger(header["schemaVersion"], "$.header.schemaVersion", 1, 1);
  if (schemaVersion !== MAP_SCHEMA_VERSION) {
    throw new MapFormatError(
      `Unsupported schema version ${String(schemaVersion)}; expected ${String(MAP_SCHEMA_VERSION)}`,
      "$.header.schemaVersion",
    );
  }

  const document = {
    header: parseHeader(header),
    metadata: parseMetadata(root["metadata"]),
    environment: parseEnvironment(root["environment"]),
    entities: parseEntities(root["entities"]),
    tracks: parseTracks(root["tracks"]),
    race: parseRace(root["race"]),
    interactions: parseInteractions(root["interactions"]),
    editorHints: parseEditorHints(root["editorHints"]),
  } satisfies MapDocument;

  validateReferences(document);
  return deepFreeze(document);
}

function parseTracks(value: unknown): readonly TrackDefinition[] {
  const tracks = requireArray(value, "$.tracks");
  const trackIds = new Set<string>();
  return tracks.map((candidate, trackIndex) => {
    const path = `$.tracks[${String(trackIndex)}]`;
    const record = requireRecord(candidate, path);
    const trackKeys = ["id", "closed", "surface", "materialId", "nodes", "walls"];
    requireOnlyKeys(
      record,
      record["roadRanges"] === undefined ? trackKeys : [...trackKeys, "roadRanges"],
      path,
    );
    const id = requireIdentifier(record["id"], `${path}.id`);
    if (trackIds.has(id)) {
      throw new MapFormatError(`Duplicate track ID "${id}"`, `${path}.id`);
    }
    trackIds.add(id);
    const surface = requireString(record["surface"], `${path}.surface`, 20);
    if (!TRACK_SURFACES.includes(surface as TrackDefinition["surface"])) {
      throw new MapFormatError(`Unknown track surface "${surface}"`, `${path}.surface`);
    }
    const nodes = requireArray(record["nodes"], `${path}.nodes`);
    if (nodes.length < 2 || nodes.length > 2_000) {
      throw new MapFormatError("Tracks require 2–2000 nodes", `${path}.nodes`);
    }
    const nodeIds = new Set<string>();
    const parsedNodes = nodes.map((nodeCandidate, nodeIndex) => {
      const nodePath = `${path}.nodes[${String(nodeIndex)}]`;
      const node = requireRecord(nodeCandidate, nodePath);
      requireOnlyKeys(
        node,
        ["id", "position", "tangentIn", "tangentOut", "width", "bankRadians"],
        nodePath,
      );
      const nodeId = requireIdentifier(node["id"], `${nodePath}.id`);
      if (nodeIds.has(nodeId)) {
        throw new MapFormatError(`Duplicate track node ID "${nodeId}"`, `${nodePath}.id`);
      }
      nodeIds.add(nodeId);
      return {
        id: nodeId,
        position: requireVector3(node["position"], `${nodePath}.position`, SAFE_WORLD_EXTENT),
        tangentIn: requireVector3(node["tangentIn"], `${nodePath}.tangentIn`, SAFE_WORLD_EXTENT),
        tangentOut: requireVector3(node["tangentOut"], `${nodePath}.tangentOut`, SAFE_WORLD_EXTENT),
        width: requireFinite(node["width"], `${nodePath}.width`, 1, 100),
        bankRadians: requireFinite(
          node["bankRadians"],
          `${nodePath}.bankRadians`,
          -Math.PI / 3,
          Math.PI / 3,
        ),
      };
    });
    const wallIds = new Set<string>();
    const walls = requireArray(record["walls"], `${path}.walls`).map((wallCandidate, wallIndex) => {
      const wallPath = `${path}.walls[${String(wallIndex)}]`;
      const wall = requireRecord(wallCandidate, wallPath);
      requireOnlyKeys(
        wall,
        ["id", "side", "startDistance", "endDistance", "height", "thickness", "styleId"],
        wallPath,
      );
      const wallId = requireIdentifier(wall["id"], `${wallPath}.id`);
      if (wallIds.has(wallId)) {
        throw new MapFormatError(`Duplicate wall ID "${wallId}"`, `${wallPath}.id`);
      }
      wallIds.add(wallId);
      const side = requireString(wall["side"], `${wallPath}.side`, 10);
      if (side !== "left" && side !== "right") {
        throw new MapFormatError("Wall side must be left or right", `${wallPath}.side`);
      }
      const startDistance = requireFinite(
        wall["startDistance"],
        `${wallPath}.startDistance`,
        0,
        SAFE_WORLD_EXTENT,
      );
      const endDistance = requireFinite(
        wall["endDistance"],
        `${wallPath}.endDistance`,
        0,
        SAFE_WORLD_EXTENT,
      );
      if (endDistance <= startDistance) {
        throw new MapFormatError("Wall end must be after its start", `${wallPath}.endDistance`);
      }
      return {
        id: wallId,
        side,
        startDistance,
        endDistance,
        height: requireFinite(wall["height"], `${wallPath}.height`, 0.1, 20),
        thickness: requireFinite(wall["thickness"], `${wallPath}.thickness`, 0.05, 5),
        styleId: requireIdentifier(wall["styleId"], `${wallPath}.styleId`),
      } satisfies TrackWallRange;
    });
    const roadRangeIds = new Set<string>();
    const roadRanges = (
      record["roadRanges"] === undefined
        ? []
        : requireArray(record["roadRanges"], `${path}.roadRanges`)
    )
      .map((rangeCandidate, rangeIndex) => {
        const rangePath = `${path}.roadRanges[${String(rangeIndex)}]`;
        const range = requireRecord(rangeCandidate, rangePath);
        const rangeKeys = [
          "id",
          "startDistance",
          "endDistance",
          "width",
          "bankRadians",
          "surface",
          "materialId",
        ];
        requireOnlyKeys(
          range,
          [
            ...rangeKeys,
            ...(range["surfaceStrength"] === undefined ? [] : ["surfaceStrength"]),
            ...(range["surfaceCooldownSeconds"] === undefined ? [] : ["surfaceCooldownSeconds"]),
          ],
          rangePath,
        );
        const rangeId = requireIdentifier(range["id"], `${rangePath}.id`);
        if (roadRangeIds.has(rangeId)) {
          throw new MapFormatError(`Duplicate road-range ID "${rangeId}"`, `${rangePath}.id`);
        }
        roadRangeIds.add(rangeId);
        const startDistance = requireFinite(
          range["startDistance"],
          `${rangePath}.startDistance`,
          0,
          SAFE_WORLD_EXTENT,
        );
        const endDistance = requireFinite(
          range["endDistance"],
          `${rangePath}.endDistance`,
          0,
          SAFE_WORLD_EXTENT,
        );
        if (endDistance <= startDistance) {
          throw new MapFormatError(
            "Road-range end must be after its start",
            `${rangePath}.endDistance`,
          );
        }
        const rangeSurface = requireString(range["surface"], `${rangePath}.surface`, 20);
        if (!TRACK_SURFACES.includes(rangeSurface as TrackDefinition["surface"])) {
          throw new MapFormatError(
            `Unknown track surface "${rangeSurface}"`,
            `${rangePath}.surface`,
          );
        }
        return {
          id: rangeId,
          startDistance,
          endDistance,
          width: requireFinite(range["width"], `${rangePath}.width`, 1, 100),
          bankRadians: requireFinite(
            range["bankRadians"],
            `${rangePath}.bankRadians`,
            -Math.PI / 3,
            Math.PI / 3,
          ),
          surface: rangeSurface as TrackDefinition["surface"],
          materialId: requireIdentifier(range["materialId"], `${rangePath}.materialId`),
          surfaceStrength:
            range["surfaceStrength"] === undefined
              ? 1
              : requireFinite(
                  range["surfaceStrength"],
                  `${rangePath}.surfaceStrength`,
                  TRACK_SURFACE_STRENGTH_MINIMUM,
                  TRACK_SURFACE_STRENGTH_MAXIMUM,
                ),
          surfaceCooldownSeconds:
            range["surfaceCooldownSeconds"] === undefined
              ? defaultTrackSurfaceCooldownSeconds(rangeSurface as TrackDefinition["surface"])
              : requireFinite(
                  range["surfaceCooldownSeconds"],
                  `${rangePath}.surfaceCooldownSeconds`,
                  TRACK_SURFACE_COOLDOWN_MINIMUM_SECONDS,
                  TRACK_SURFACE_COOLDOWN_MAXIMUM_SECONDS,
                ),
        } satisfies TrackRoadRange;
      })
      .sort((left, right) => left.startDistance - right.startDistance);
    for (let rangeIndex = 1; rangeIndex < roadRanges.length; rangeIndex += 1) {
      const previous = roadRanges[rangeIndex - 1];
      const current = roadRanges[rangeIndex];
      if (
        previous !== undefined &&
        current !== undefined &&
        current.startDistance < previous.endDistance - 0.01
      ) {
        throw new MapFormatError(
          "Road ranges may touch but cannot overlap",
          `${path}.roadRanges[${String(rangeIndex)}].startDistance`,
        );
      }
    }
    return {
      id,
      closed: requireBoolean(record["closed"], `${path}.closed`),
      surface: surface as TrackDefinition["surface"],
      materialId: requireIdentifier(record["materialId"], `${path}.materialId`),
      nodes: parsedNodes,
      walls,
      roadRanges,
    };
  });
}

export function encodeMapDocument(document: MapDocument): string {
  const normalized = decodeMapDocument(document);
  return `${JSON.stringify(sortJsonValue(normalized as unknown as JsonValue), null, 2)}\n`;
}

export function canonicalMapDocument(document: MapDocument): MapDocument {
  return decodeMapDocument(encodeMapDocument(document));
}

function parseHeader(value: Readonly<Record<string, unknown>>): MapDocument["header"] {
  requireOnlyKeys(
    value,
    ["schemaVersion", "documentId", "title", "description", "mapType", "sourceTemplateId"],
    "$.header",
  );
  const mapType = requireString(value["mapType"], "$.header.mapType", 40);
  if (!MAP_TYPES.includes(mapType as MapType)) {
    throw new MapFormatError(`Unknown map type "${mapType}"`, "$.header.mapType");
  }
  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    documentId: requireIdentifier(value["documentId"], "$.header.documentId"),
    title: requireString(value["title"], "$.header.title", 80),
    description: requireString(value["description"], "$.header.description", 400),
    mapType: mapType as MapType,
    sourceTemplateId: requireNullableIdentifier(
      value["sourceTemplateId"],
      "$.header.sourceTemplateId",
    ),
  };
}

function parseMetadata(value: unknown): MapDocument["metadata"] {
  const record = requireRecord(value, "$.metadata");
  requireOnlyKeys(record, ["tags"], "$.metadata");
  const tags = requireArray(record["tags"], "$.metadata.tags").map((tag, index) =>
    requireString(tag, `$.metadata.tags[${String(index)}]`, 32),
  );
  if (tags.length > 20) {
    throw new MapFormatError("At most 20 tags are supported", "$.metadata.tags");
  }
  return { tags };
}

function parseEnvironment(value: unknown): MapDocument["environment"] {
  const record = requireRecord(value, "$.environment");
  const optionalKeys = [
    "skyPreset",
    "keyLight",
    "ambientLight",
    "musicVolume",
    "outOfBoundsHeight",
  ].filter((key) => record[key] !== undefined);
  requireOnlyKeys(
    record,
    ["groundMode", "backgroundColor", "gravity", "fog", "musicAssetId", ...optionalKeys],
    "$.environment",
  );
  const groundMode = requireString(record["groundMode"], "$.environment.groundMode", 20);
  if (groundMode !== "ground" && groundMode !== "void") {
    throw new MapFormatError("Expected ground or void", "$.environment.groundMode");
  }
  const fog = requireRecord(record["fog"], "$.environment.fog");
  requireOnlyKeys(fog, ["enabled", "color", "near", "far"], "$.environment.fog");
  const fogNear = requireFinite(fog["near"], "$.environment.fog.near", 0, SAFE_WORLD_EXTENT);
  const fogFar = requireFinite(fog["far"], "$.environment.fog.far", 0, SAFE_WORLD_EXTENT);
  if (fogFar <= fogNear) {
    throw new MapFormatError("Fog far must be greater than fog near", "$.environment.fog.far");
  }
  const skyPresetValue = record["skyPreset"] ?? "custom";
  const skyPreset = requireString(skyPresetValue, "$.environment.skyPreset", 20);
  if (
    skyPreset !== "day" &&
    skyPreset !== "sunset" &&
    skyPreset !== "night" &&
    skyPreset !== "custom"
  ) {
    throw new MapFormatError("Expected day, sunset, night, or custom", "$.environment.skyPreset");
  }
  const keyLight =
    record["keyLight"] === undefined
      ? { direction: [-26, 42, 18], intensity: 2.1, color: "#fff9ea" }
      : requireRecord(record["keyLight"], "$.environment.keyLight");
  requireOnlyKeys(keyLight, ["direction", "intensity", "color"], "$.environment.keyLight");
  const ambientLight =
    record["ambientLight"] === undefined
      ? { intensity: 1.35, color: "#8398a8" }
      : requireRecord(record["ambientLight"], "$.environment.ambientLight");
  requireOnlyKeys(ambientLight, ["intensity", "color"], "$.environment.ambientLight");
  const musicAssetId = requireNullableIdentifier(
    record["musicAssetId"],
    "$.environment.musicAssetId",
  );
  if (
    musicAssetId !== null &&
    !ENVIRONMENT_MUSIC_ASSET_IDS.includes(
      musicAssetId as (typeof ENVIRONMENT_MUSIC_ASSET_IDS)[number],
    )
  ) {
    throw new MapFormatError("Unknown built-in music selection", "$.environment.musicAssetId");
  }
  return {
    groundMode,
    skyPreset,
    backgroundColor: requireColor(record["backgroundColor"], "$.environment.backgroundColor"),
    keyLight: {
      direction: requireVector3(
        keyLight["direction"],
        "$.environment.keyLight.direction",
        SAFE_WORLD_EXTENT,
      ),
      intensity: requireFinite(keyLight["intensity"], "$.environment.keyLight.intensity", 0, 8),
      color: requireColor(keyLight["color"], "$.environment.keyLight.color"),
    },
    ambientLight: {
      intensity: requireFinite(
        ambientLight["intensity"],
        "$.environment.ambientLight.intensity",
        0,
        5,
      ),
      color: requireColor(ambientLight["color"], "$.environment.ambientLight.color"),
    },
    gravity: requireVector3(record["gravity"], "$.environment.gravity", SAFE_WORLD_EXTENT),
    fog: {
      enabled: requireBoolean(fog["enabled"], "$.environment.fog.enabled"),
      color: requireColor(fog["color"], "$.environment.fog.color"),
      near: fogNear,
      far: fogFar,
    },
    musicAssetId: musicAssetId as MapDocument["environment"]["musicAssetId"],
    musicVolume:
      record["musicVolume"] === undefined
        ? 0.7
        : requireFinite(record["musicVolume"], "$.environment.musicVolume", 0, 1),
    outOfBoundsHeight:
      record["outOfBoundsHeight"] === undefined
        ? -20
        : requireFinite(
            record["outOfBoundsHeight"],
            "$.environment.outOfBoundsHeight",
            -10_000,
            1_000,
          ),
  };
}

function parseInteractions(value: unknown): readonly InteractionDefinition[] {
  const candidates = requireArray(value, "$.interactions");
  if (candidates.length > 1_000) {
    throw new MapFormatError("At most 1000 interaction links are supported", "$.interactions");
  }
  const ids = new Set<string>();
  return candidates.map((candidate, index) => {
    const path = `$.interactions[${String(index)}]`;
    const record = requireRecord(candidate, path);
    requireOnlyKeys(
      record,
      ["id", "sourceEntityId", "event", "condition", "targetEntityId", "action"],
      path,
    );
    const id = requireIdentifier(record["id"], `${path}.id`);
    if (ids.has(id)) {
      throw new MapFormatError(`Duplicate interaction ID "${id}"`, `${path}.id`);
    }
    ids.add(id);
    const event = requireString(record["event"], `${path}.event`, 40);
    if (!INTERACTION_EVENTS.includes(event as InteractionEvent)) {
      throw new MapFormatError(`Unknown interaction event "${event}"`, `${path}.event`);
    }
    const action = requireString(record["action"], `${path}.action`, 40);
    if (!INTERACTION_ACTIONS.includes(action as InteractionAction)) {
      throw new MapFormatError(`Unknown interaction action "${action}"`, `${path}.action`);
    }
    const rawCondition = record["condition"];
    let condition: InteractionCondition | null = null;
    if (rawCondition !== null) {
      const parsed = requireString(rawCondition, `${path}.condition`, 40);
      if (!INTERACTION_CONDITIONS.includes(parsed as InteractionCondition)) {
        throw new MapFormatError(`Unknown interaction condition "${parsed}"`, `${path}.condition`);
      }
      condition = parsed as InteractionCondition;
    }
    return {
      id,
      sourceEntityId: requireIdentifier(record["sourceEntityId"], `${path}.sourceEntityId`),
      event: event as InteractionEvent,
      condition,
      targetEntityId: requireIdentifier(record["targetEntityId"], `${path}.targetEntityId`),
      action: action as InteractionAction,
    };
  });
}

function parseEntities(value: unknown): readonly MapEntity[] {
  const entities = requireArray(value, "$.entities");
  if (entities.length > SAFE_COLLECTION_LENGTH) {
    throw new MapFormatError("Too many entities", "$.entities");
  }
  const ids = new Set<string>();
  return entities.map((candidate, index) => {
    const path = `$.entities[${String(index)}]`;
    const record = requireRecord(candidate, path);
    requireOnlyKeys(record, ["id", "assetId", "transform", "groupId", "properties"], path);
    const id = requireIdentifier(record["id"], `${path}.id`);
    if (ids.has(id)) {
      throw new MapFormatError(`Duplicate entity ID "${id}"`, `${path}.id`);
    }
    ids.add(id);
    const assetId = requireIdentifier(record["assetId"], `${path}.assetId`);
    if (!SUPPORTED_ASSET_IDS.has(assetId)) {
      throw new MapFormatError(`Unsupported asset "${assetId}"`, `${path}.assetId`);
    }
    const properties = parseEntityProperties(assetId, record["properties"], `${path}.properties`);
    return {
      id,
      assetId,
      transform: parseTransform(record["transform"], `${path}.transform`),
      groupId: requireNullableIdentifier(record["groupId"], `${path}.groupId`),
      properties,
    };
  });
}

function parseEntityProperties(
  assetId: string,
  value: unknown,
  path: string,
): Readonly<Record<string, JsonValue>> {
  const record = requireRecord(value, path);
  if (assetId === "floor.rectangle") {
    requireOnlyKeys(record, ["width", "depth", "height", "color", "surface"], path);
    const surface = requireString(record["surface"], `${path}.surface`, 20);
    if (surface !== "normal") {
      throw new MapFormatError("The foundation slice currently supports normal floors", path);
    }
    return {
      width: requireFinite(record["width"], `${path}.width`, 0.25, 1_000),
      depth: requireFinite(record["depth"], `${path}.depth`, 0.25, 1_000),
      height: requireFinite(record["height"], `${path}.height`, 0.05, 100),
      color: requireColor(record["color"], `${path}.color`),
      surface,
    };
  }

  if (assetId === "floor.circle") {
    requireOnlyKeys(record, ["radius", "height", "color", "surface"], path);
    return {
      radius: requireFinite(record["radius"], `${path}.radius`, 0.5, 50),
      height: requireFinite(record["height"], `${path}.height`, 0.05, 100),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "floor.rounded") {
    requireOnlyKeys(record, ["width", "depth", "height", "cornerRadius", "color", "surface"], path);
    const width = requireFinite(record["width"], `${path}.width`, 2, 100);
    const depth = requireFinite(record["depth"], `${path}.depth`, 1, 100);
    const cornerRadius = requireFinite(record["cornerRadius"], `${path}.cornerRadius`, 0.1, 50);
    if (cornerRadius > Math.min(width, depth) / 2) {
      throw new MapFormatError("Corner radius must fit inside the rounded platform", path);
    }
    return {
      width,
      depth,
      height: requireFinite(record["height"], `${path}.height`, 0.05, 100),
      cornerRadius,
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "floor.polygon") {
    requireOnlyKeys(record, ["radius", "height", "sides", "color", "surface"], path);
    return {
      radius: requireFinite(record["radius"], `${path}.radius`, 1, 50),
      height: requireFinite(record["height"], `${path}.height`, 0.05, 100),
      sides: requireInteger(record["sides"], `${path}.sides`, 3, 12),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "floor.freeform") {
    requireOnlyKeys(record, ["outline", "height", "color", "surface"], path);
    const encodedOutline = requireArray(record["outline"], `${path}.outline`);
    if (encodedOutline.length < 3 || encodedOutline.length > 32) {
      throw new MapFormatError("Freeform floors require 3–32 outline points", `${path}.outline`);
    }
    const outline: FloorOutlinePoint[] = encodedOutline.map((candidate, index) => {
      const pointPath = `${path}.outline[${String(index)}]`;
      const point = requireArray(candidate, pointPath);
      if (point.length !== 2) {
        throw new MapFormatError("Outline points require two components", pointPath);
      }
      return [
        requireFinite(point[0], `${pointPath}[0]`, -500, 500),
        requireFinite(point[1], `${pointPath}[1]`, -500, 500),
      ];
    });
    const normalized = normalizedSimpleFloorOutline(outline);
    if (normalized === null) {
      throw new MapFormatError(
        "Freeform floor outline must be large enough and cannot cross itself",
        `${path}.outline`,
      );
    }
    return {
      outline: normalized,
      height: requireFinite(record["height"], `${path}.height`, 0.05, 100),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "floor.void-base") {
    requireOnlyKeys(record, ["width", "depth", "height", "color", "surface"], path);
    return {
      width: requireFinite(record["width"], `${path}.width`, 2, 200),
      depth: requireFinite(record["depth"], `${path}.depth`, 2, 200),
      height: requireFinite(record["height"], `${path}.height`, 0.1, 20),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "race.player-spawn") {
    requireOnlyKeys(record, ["slot", "markerSize", "color"], path);
    return {
      slot: requireInteger(record["slot"], `${path}.slot`, 1, 10),
      markerSize: requireFinite(record["markerSize"], `${path}.markerSize`, 0.75, 6),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "race.recovery-pose") {
    requireOnlyKeys(record, ["markerSize", "color"], path);
    return {
      markerSize: requireFinite(record["markerSize"], `${path}.markerSize`, 0.75, 6),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "race.checkpoint") {
    requireOnlyKeys(record, ["width", "height", "depth", "order", "color"], path);
    return {
      width: requireFinite(record["width"], `${path}.width`, 3, 30),
      height: requireFinite(record["height"], `${path}.height`, 2, 12),
      depth: requireFinite(record["depth"], `${path}.depth`, 0.25, 6),
      order: requireInteger(record["order"], `${path}.order`, 1, 999),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "race.finish-gate") {
    requireOnlyKeys(record, ["width", "height", "depth", "rule", "color"], path);
    const rule = requireString(record["rule"], `${path}.rule`, 30);
    if (rule !== "any" && rule !== "required-group") {
      throw new MapFormatError("Unknown finish gate rule", `${path}.rule`);
    }
    return {
      width: requireFinite(record["width"], `${path}.width`, 3, 30),
      height: requireFinite(record["height"], `${path}.height`, 2, 12),
      depth: requireFinite(record["depth"], `${path}.depth`, 0.25, 6),
      rule,
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "race.shortcut-marker") {
    requireOnlyKeys(record, ["width", "height", "depth", "color"], path);
    return {
      width: requireFinite(record["width"], `${path}.width`, 2, 30),
      height: requireFinite(record["height"], `${path}.height`, 2, 12),
      depth: requireFinite(record["depth"], `${path}.depth`, 0.25, 6),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "race.recovery-volume") {
    const supportsSafePose = "safePoseEntityId" in record;
    requireOnlyKeys(
      record,
      supportsSafePose
        ? ["width", "height", "depth", "delaySeconds", "safePoseEntityId", "color"]
        : ["width", "height", "depth", "delaySeconds", "color"],
      path,
    );
    return {
      width: requireFinite(record["width"], `${path}.width`, 2, 50),
      height: requireFinite(record["height"], `${path}.height`, 1, 20),
      depth: requireFinite(record["depth"], `${path}.depth`, 2, 50),
      delaySeconds: requireFinite(record["delaySeconds"], `${path}.delaySeconds`, 0, 30),
      safePoseEntityId: supportsSafePose
        ? requireNullableIdentifier(record["safePoseEntityId"], `${path}.safePoseEntityId`)
        : null,
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "race.out-of-bounds-volume") {
    requireOnlyKeys(record, ["width", "height", "depth", "color"], path);
    return {
      width: requireFinite(record["width"], `${path}.width`, 2, 100),
      height: requireFinite(record["height"], `${path}.height`, 1, 50),
      depth: requireFinite(record["depth"], `${path}.depth`, 2, 100),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "physics.ball" || assetId === "physics.cube") {
    const sizeKey = assetId === "physics.ball" ? "diameter" : "size";
    requireOnlyKeys(record, [sizeKey, "mass", "friction", "restitution", "color"], path);
    return {
      [sizeKey]: requireFinite(record[sizeKey], `${path}.${sizeKey}`, 0.5, 10),
      mass: requireFinite(record["mass"], `${path}.mass`, 0.1, 100),
      friction: requireFinite(record["friction"], `${path}.friction`, 0, 2),
      restitution: requireFinite(record["restitution"], `${path}.restitution`, 0, 1),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "physics.domino") {
    requireOnlyKeys(
      record,
      ["width", "height", "depth", "mass", "friction", "restitution", "color"],
      path,
    );
    return {
      width: requireFinite(record["width"], `${path}.width`, 0.5, 12),
      height: requireFinite(record["height"], `${path}.height`, 1, 12),
      depth: requireFinite(record["depth"], `${path}.depth`, 0.2, 5),
      mass: requireFinite(record["mass"], `${path}.mass`, 0.1, 100),
      friction: requireFinite(record["friction"], `${path}.friction`, 0, 2),
      restitution: requireFinite(record["restitution"], `${path}.restitution`, 0, 1),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "motion.moving-platform") {
    requireOnlyKeys(
      record,
      [
        "width",
        "depth",
        "height",
        "offsetX",
        "offsetY",
        "offsetZ",
        "speed",
        "dwellSeconds",
        "color",
      ],
      path,
    );
    const offsetX = requireFinite(record["offsetX"], `${path}.offsetX`, -100, 100);
    const offsetY = requireFinite(record["offsetY"], `${path}.offsetY`, -100, 100);
    const offsetZ = requireFinite(record["offsetZ"], `${path}.offsetZ`, -100, 100);
    if (Math.hypot(offsetX, offsetY, offsetZ) < 0.5) {
      throw new MapFormatError("Moving platform endpoints must be at least 0.5 m apart", path);
    }
    return {
      width: requireFinite(record["width"], `${path}.width`, 1, 20),
      depth: requireFinite(record["depth"], `${path}.depth`, 1, 20),
      height: requireFinite(record["height"], `${path}.height`, 0.1, 2),
      offsetX,
      offsetY,
      offsetZ,
      speed: requireFinite(record["speed"], `${path}.speed`, 0.1, 20),
      dwellSeconds: requireFinite(record["dwellSeconds"], `${path}.dwellSeconds`, 0, 30),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "motion.door") {
    requireOnlyKeys(
      record,
      [
        "width",
        "depth",
        "height",
        "offsetX",
        "offsetY",
        "offsetZ",
        "speed",
        "dwellSeconds",
        "color",
      ],
      path,
    );
    const offsetX = requireFinite(record["offsetX"], `${path}.offsetX`, -100, 100);
    const offsetY = requireFinite(record["offsetY"], `${path}.offsetY`, -100, 100);
    const offsetZ = requireFinite(record["offsetZ"], `${path}.offsetZ`, -100, 100);
    if (Math.hypot(offsetX, offsetY, offsetZ) < 0.5) {
      throw new MapFormatError("Moving door endpoints must be at least 0.5 m apart", path);
    }
    return {
      width: requireFinite(record["width"], `${path}.width`, 1, 24),
      depth: requireFinite(record["depth"], `${path}.depth`, 0.1, 4),
      height: requireFinite(record["height"], `${path}.height`, 1, 16),
      offsetX,
      offsetY,
      offsetZ,
      speed: requireFinite(record["speed"], `${path}.speed`, 0.1, 20),
      dwellSeconds: requireFinite(record["dwellSeconds"], `${path}.dwellSeconds`, 0, 30),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "motion.rotating-bar") {
    requireOnlyKeys(record, ["length", "thickness", "height", "degreesPerSecond", "color"], path);
    return {
      length: requireFinite(record["length"], `${path}.length`, 2, 30),
      thickness: requireFinite(record["thickness"], `${path}.thickness`, 0.2, 4),
      height: requireFinite(record["height"], `${path}.height`, 0.2, 4),
      degreesPerSecond: requireFinite(
        record["degreesPerSecond"],
        `${path}.degreesPerSecond`,
        -720,
        720,
      ),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (
    assetId === "interaction.button" ||
    assetId === "interaction.pressure-plate" ||
    assetId === "interaction.trigger-zone"
  ) {
    requireOnlyKeys(
      record,
      ["width", "height", "depth", "cooldownSeconds", "enabled", "color"],
      path,
    );
    const trigger = assetId === "interaction.trigger-zone";
    return {
      width: requireFinite(record["width"], `${path}.width`, trigger ? 1 : 0.75, trigger ? 30 : 12),
      height: requireFinite(record["height"], `${path}.height`, 0.05, trigger ? 20 : 1),
      depth: requireFinite(record["depth"], `${path}.depth`, trigger ? 1 : 0.75, trigger ? 30 : 12),
      cooldownSeconds: requireFinite(record["cooldownSeconds"], `${path}.cooldownSeconds`, 0, 10),
      enabled: requireBoolean(record["enabled"], `${path}.enabled`),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "interaction.timer") {
    requireOnlyKeys(
      record,
      ["markerSize", "durationSeconds", "repeat", "startsOn", "enabled", "color"],
      path,
    );
    return {
      markerSize: requireFinite(record["markerSize"], `${path}.markerSize`, 0.75, 6),
      durationSeconds: requireFinite(
        record["durationSeconds"],
        `${path}.durationSeconds`,
        0.1,
        600,
      ),
      repeat: requireBoolean(record["repeat"], `${path}.repeat`),
      startsOn: requireBoolean(record["startsOn"], `${path}.startsOn`),
      enabled: requireBoolean(record["enabled"], `${path}.enabled`),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "interaction.counter") {
    requireOnlyKeys(record, ["markerSize", "threshold", "enabled", "color"], path);
    return {
      markerSize: requireFinite(record["markerSize"], `${path}.markerSize`, 0.75, 6),
      threshold: requireInteger(record["threshold"], `${path}.threshold`, 1, 999),
      enabled: requireBoolean(record["enabled"], `${path}.enabled`),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "travel.boost-pad" || assetId === "travel.launch-pad") {
    requireOnlyKeys(
      record,
      ["width", "depth", "height", "boostSpeed", "liftSpeed", "cooldownSeconds", "color"],
      path,
    );
    return {
      width: requireFinite(record["width"], `${path}.width`, 1, 12),
      depth: requireFinite(record["depth"], `${path}.depth`, 1, 16),
      height: requireFinite(record["height"], `${path}.height`, 0.05, 1),
      boostSpeed: requireFinite(record["boostSpeed"], `${path}.boostSpeed`, 0, 40),
      liftSpeed: requireFinite(record["liftSpeed"], `${path}.liftSpeed`, 0, 30),
      cooldownSeconds: requireFinite(record["cooldownSeconds"], `${path}.cooldownSeconds`, 0, 10),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "travel.bounce-pad") {
    requireOnlyKeys(
      record,
      ["width", "depth", "height", "bounceSpeed", "cooldownSeconds", "color"],
      path,
    );
    return {
      width: requireFinite(record["width"], `${path}.width`, 1, 12),
      depth: requireFinite(record["depth"], `${path}.depth`, 1, 16),
      height: requireFinite(record["height"], `${path}.height`, 0.05, 1),
      bounceSpeed: requireFinite(record["bounceSpeed"], `${path}.bounceSpeed`, 1, 30),
      cooldownSeconds: requireFinite(record["cooldownSeconds"], `${path}.cooldownSeconds`, 0, 10),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "travel.slow-zone") {
    requireOnlyKeys(
      record,
      ["width", "depth", "height", "speedMultiplier", "cooldownSeconds", "color"],
      path,
    );
    return {
      width: requireFinite(record["width"], `${path}.width`, 1, 20),
      depth: requireFinite(record["depth"], `${path}.depth`, 1, 24),
      height: requireFinite(record["height"], `${path}.height`, 0.05, 1),
      speedMultiplier: requireFinite(record["speedMultiplier"], `${path}.speedMultiplier`, 0.05, 1),
      cooldownSeconds: requireFinite(record["cooldownSeconds"], `${path}.cooldownSeconds`, 0, 10),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "travel.direction-arrow") {
    requireOnlyKeys(record, ["width", "depth", "height", "glow", "color"], path);
    return {
      width: requireFinite(record["width"], `${path}.width`, 0.75, 12),
      depth: requireFinite(record["depth"], `${path}.depth`, 1, 20),
      height: requireFinite(record["height"], `${path}.height`, 0.02, 0.5),
      glow: requireFinite(record["glow"], `${path}.glow`, 0, 2),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "travel.portal") {
    requireOnlyKeys(record, ["width", "height", "depth", "peerPortalEntityId", "color"], path);
    return {
      width: requireFinite(record["width"], `${path}.width`, 1.5, 12),
      height: requireFinite(record["height"], `${path}.height`, 2, 16),
      depth: requireFinite(record["depth"], `${path}.depth`, 0.1, 2),
      peerPortalEntityId: requireNullableIdentifier(
        record["peerPortalEntityId"],
        `${path}.peerPortalEntityId`,
      ),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "decoration.arrow-sign") {
    requireOnlyKeys(
      record,
      ["width", "boardHeight", "thickness", "postHeight", "solid", "glow", "color"],
      path,
    );
    return {
      width: requireFinite(record["width"], `${path}.width`, 1, 12),
      boardHeight: requireFinite(record["boardHeight"], `${path}.boardHeight`, 0.75, 8),
      thickness: requireFinite(record["thickness"], `${path}.thickness`, 0.08, 1),
      postHeight: requireFinite(record["postHeight"], `${path}.postHeight`, 0.5, 8),
      solid: requireBoolean(record["solid"], `${path}.solid`),
      glow: requireFinite(record["glow"], `${path}.glow`, 0, 2),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "decoration.point-light") {
    requireOnlyKeys(record, ["height", "bulbSize", "intensity", "range", "enabled", "color"], path);
    return {
      height: requireFinite(record["height"], `${path}.height`, 1, 12),
      bulbSize: requireFinite(record["bulbSize"], `${path}.bulbSize`, 0.2, 2),
      intensity: requireFinite(record["intensity"], `${path}.intensity`, 0, 10),
      range: requireFinite(record["range"], `${path}.range`, 2, 40),
      enabled: requireBoolean(record["enabled"], `${path}.enabled`),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "decoration.color-strip") {
    requireOnlyKeys(record, ["length", "width", "height", "glow", "enabled", "color"], path);
    return {
      length: requireFinite(record["length"], `${path}.length`, 1, 40),
      width: requireFinite(record["width"], `${path}.width`, 0.1, 4),
      height: requireFinite(record["height"], `${path}.height`, 0.02, 0.5),
      glow: requireFinite(record["glow"], `${path}.glow`, 0, 2),
      enabled: requireBoolean(record["enabled"], `${path}.enabled`),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "decoration.sculpture") {
    requireOnlyKeys(record, ["radius", "height", "sides", "color", "surface"], path);
    return {
      radius: requireFinite(record["radius"], `${path}.radius`, 0.375, 10),
      height: requireFinite(record["height"], `${path}.height`, 0.75, 30),
      sides: requireInteger(record["sides"], `${path}.sides`, 3, 12),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "decoration.effect-emitter") {
    requireOnlyKeys(
      record,
      ["markerSize", "preset", "burstCount", "startsOn", "enabled", "color"],
      path,
    );
    const preset = requireString(record["preset"], `${path}.preset`, 30);
    if (preset !== "sparks" && preset !== "confetti" && preset !== "smoke") {
      throw new MapFormatError("Unknown built-in effect preset", `${path}.preset`);
    }
    return {
      markerSize: requireFinite(record["markerSize"], `${path}.markerSize`, 1, 16),
      preset,
      burstCount: requireInteger(record["burstCount"], `${path}.burstCount`, 1, 64),
      startsOn: requireBoolean(record["startsOn"], `${path}.startsOn`),
      enabled: requireBoolean(record["enabled"], `${path}.enabled`),
      color: requireColor(record["color"], `${path}.color`),
    };
  }

  if (assetId === "shape.block") {
    requireOnlyKeys(record, ["width", "depth", "height", "color", "surface"], path);
    return {
      width: requireFinite(record["width"], `${path}.width`, 1, 40),
      depth: requireFinite(record["depth"], `${path}.depth`, 1, 40),
      height: requireFinite(record["height"], `${path}.height`, 1, 40),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "shape.column") {
    requireOnlyKeys(record, ["radius", "height", "color", "surface"], path);
    return {
      radius: requireFinite(record["radius"], `${path}.radius`, 0.5, 12),
      height: requireFinite(record["height"], `${path}.height`, 1, 60),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "track.modular-straight") {
    requireOnlyKeys(record, ["length", "width", "height", "color", "surface"], path);
    return {
      length: requireFinite(record["length"], `${path}.length`, 2, 40),
      width: requireFinite(record["width"], `${path}.width`, 1, 20),
      height: requireFinite(record["height"], `${path}.height`, 0.1, 2),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "track.modular-corner") {
    requireOnlyKeys(record, ["radius", "width", "height", "color", "surface"], path);
    const radius = requireFinite(record["radius"], `${path}.radius`, 3, 50);
    const width = requireFinite(record["width"], `${path}.width`, 1, 20);
    if (width > radius * 1.8) {
      throw new MapFormatError("Road corner width must fit inside its turn radius", path);
    }
    return {
      radius,
      width,
      height: requireFinite(record["height"], `${path}.height`, 0.1, 2),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "track.bridge") {
    requireOnlyKeys(record, ["length", "width", "height", "color", "surface"], path);
    return {
      length: requireFinite(record["length"], `${path}.length`, 4, 60),
      width: requireFinite(record["width"], `${path}.width`, 1, 20),
      height: requireFinite(record["height"], `${path}.height`, 0.2, 4),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "track.guard-rail") {
    requireOnlyKeys(record, ["length", "thickness", "height", "color", "surface"], path);
    return {
      length: requireFinite(record["length"], `${path}.length`, 1, 50),
      thickness: requireFinite(record["thickness"], `${path}.thickness`, 0.1, 1),
      height: requireFinite(record["height"], `${path}.height`, 0.25, 3),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "track.overpass-support") {
    requireOnlyKeys(record, ["width", "depth", "height", "color", "surface"], path);
    return {
      width: requireFinite(record["width"], `${path}.width`, 1, 12),
      depth: requireFinite(record["depth"], `${path}.depth`, 0.5, 8),
      height: requireFinite(record["height"], `${path}.height`, 2, 30),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "track.tunnel") {
    requireOnlyKeys(
      record,
      ["length", "clearWidth", "clearHeight", "wallThickness", "roofThickness", "color", "surface"],
      path,
    );
    return {
      length: requireFinite(record["length"], `${path}.length`, 4, 60),
      clearWidth: requireFinite(record["clearWidth"], `${path}.clearWidth`, 3, 20),
      clearHeight: requireFinite(record["clearHeight"], `${path}.clearHeight`, 2.5, 12),
      wallThickness: requireFinite(record["wallThickness"], `${path}.wallThickness`, 0.15, 2),
      roofThickness: requireFinite(record["roofThickness"], `${path}.roofThickness`, 0.15, 2),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "track.barrier") {
    requireOnlyKeys(record, ["length", "thickness", "height", "color", "surface"], path);
    return {
      length: requireFinite(record["length"], `${path}.length`, 1, 40),
      thickness: requireFinite(record["thickness"], `${path}.thickness`, 0.1, 4),
      height: requireFinite(record["height"], `${path}.height`, 0.25, 8),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  if (assetId === "track.ramp" || assetId === "track.jump") {
    requireOnlyKeys(record, ["length", "width", "height", "color", "surface"], path);
    return {
      length: requireFinite(record["length"], `${path}.length`, 2, 30),
      width: requireFinite(record["width"], `${path}.width`, 1, 30),
      height: requireFinite(record["height"], `${path}.height`, 0.5, 20),
      color: requireColor(record["color"], `${path}.color`),
      surface: requireNormalSurface(record["surface"], path),
    };
  }

  requireOnlyKeys(record, ["capacity", "columns", "spacing"], path);
  return {
    capacity: requireInteger(record["capacity"], `${path}.capacity`, 1, 10),
    columns: requireInteger(record["columns"], `${path}.columns`, 1, 10),
    spacing: requireFinite(record["spacing"], `${path}.spacing`, 0.5, 20),
  };
}

function requireNormalSurface(value: unknown, path: string): "normal" {
  const surface = requireString(value, `${path}.surface`, 20);
  if (surface !== "normal") {
    throw new MapFormatError("This catalog slice currently supports normal object surfaces", path);
  }
  return surface;
}

function parseTransform(value: unknown, path: string): MapTransform {
  const record = requireRecord(value, path);
  requireOnlyKeys(record, ["position", "rotation", "scale"], path);
  return {
    position: requireVector3(record["position"], `${path}.position`, SAFE_WORLD_EXTENT),
    rotation: requireQuaternion(record["rotation"], `${path}.rotation`),
    scale: requirePositiveVector3(record["scale"], `${path}.scale`, 1_000),
  };
}

function parseRace(value: unknown): MapDocument["race"] {
  const record = requireRecord(value, "$.race");
  requireOnlyKeys(
    record,
    [
      "mode",
      "activeStartGridId",
      "lapCount",
      "checkpointGroups",
      "routeEdges",
      "finishEntityIds",
      "finishRule",
      "recovery",
    ],
    "$.race",
  );
  const mode = requireString(record["mode"], "$.race.mode", 40);
  if (!MAP_TYPES.includes(mode as MapType)) {
    throw new MapFormatError(`Unknown race mode "${mode}"`, "$.race.mode");
  }
  const finishRule = requireString(record["finishRule"], "$.race.finishRule", 30);
  if (finishRule !== "any" && finishRule !== "required-group") {
    throw new MapFormatError("Unknown finish rule", "$.race.finishRule");
  }
  const recovery = requireRecord(record["recovery"], "$.race.recovery");
  requireOnlyKeys(recovery, ["delaySeconds", "penaltySeconds"], "$.race.recovery");

  return {
    mode: mode as MapType,
    activeStartGridId: requireNullableIdentifier(
      record["activeStartGridId"],
      "$.race.activeStartGridId",
    ),
    lapCount: requireInteger(record["lapCount"], "$.race.lapCount", 1, 99),
    checkpointGroups: parseCheckpointGroups(record["checkpointGroups"]),
    routeEdges: parseRouteEdges(record["routeEdges"]),
    finishEntityIds: requireArray(record["finishEntityIds"], "$.race.finishEntityIds").map(
      (entry, index) => requireIdentifier(entry, `$.race.finishEntityIds[${String(index)}]`),
    ),
    finishRule,
    recovery: {
      delaySeconds: requireFinite(recovery["delaySeconds"], "$.race.recovery.delaySeconds", 0, 30),
      penaltySeconds: requireFinite(
        recovery["penaltySeconds"],
        "$.race.recovery.penaltySeconds",
        0,
        300,
      ),
    },
  };
}

function parseCheckpointGroups(value: unknown): MapDocument["race"]["checkpointGroups"] {
  return requireArray(value, "$.race.checkpointGroups").map((candidate, index) => {
    const path = `$.race.checkpointGroups[${String(index)}]`;
    const record = requireRecord(candidate, path);
    requireOnlyKeys(record, ["id", "checkpointEntityIds", "required"], path);
    return {
      id: requireIdentifier(record["id"], `${path}.id`),
      checkpointEntityIds: requireArray(
        record["checkpointEntityIds"],
        `${path}.checkpointEntityIds`,
      ).map((entry, checkpointIndex) =>
        requireIdentifier(entry, `${path}.checkpointEntityIds[${String(checkpointIndex)}]`),
      ),
      required: requireBoolean(record["required"], `${path}.required`),
    };
  });
}

function parseRouteEdges(value: unknown): MapDocument["race"]["routeEdges"] {
  return requireArray(value, "$.race.routeEdges").map((candidate, index) => {
    const path = `$.race.routeEdges[${String(index)}]`;
    const record = requireRecord(candidate, path);
    requireOnlyKeys(record, ["id", "fromGroupId", "toGroupId", "shortcut"], path);
    return {
      id: requireIdentifier(record["id"], `${path}.id`),
      fromGroupId: requireIdentifier(record["fromGroupId"], `${path}.fromGroupId`),
      toGroupId: requireIdentifier(record["toGroupId"], `${path}.toGroupId`),
      shortcut: requireBoolean(record["shortcut"], `${path}.shortcut`),
    };
  });
}

function parseEditorHints(value: unknown): MapDocument["editorHints"] {
  const record = requireRecord(value, "$.editorHints");
  requireOnlyKeys(record, ["thumbnailCamera"], "$.editorHints");
  if (record["thumbnailCamera"] === null) {
    return { thumbnailCamera: null };
  }
  const camera = requireRecord(record["thumbnailCamera"], "$.editorHints.thumbnailCamera");
  requireOnlyKeys(camera, ["position", "target"], "$.editorHints.thumbnailCamera");
  return {
    thumbnailCamera: {
      position: requireVector3(
        camera["position"],
        "$.editorHints.thumbnailCamera.position",
        SAFE_WORLD_EXTENT,
      ),
      target: requireVector3(
        camera["target"],
        "$.editorHints.thumbnailCamera.target",
        SAFE_WORLD_EXTENT,
      ),
    },
  };
}

function validateReferences(document: MapDocument): void {
  const entities = new Map(document.entities.map((entity) => [entity.id, entity]));
  if (document.header.mapType !== document.race.mode) {
    throw new MapFormatError("Header map type must match the race mode", "$.race.mode");
  }
  if (document.race.activeStartGridId !== null) {
    const start = entities.get(document.race.activeStartGridId);
    if (start?.assetId !== "race.start-grid") {
      throw new MapFormatError(
        "Active start grid must reference a race.start-grid entity",
        "$.race.activeStartGridId",
      );
    }
  }
  for (const [index, finishId] of document.race.finishEntityIds.entries()) {
    const finish = entities.get(finishId);
    if (finish?.assetId !== "race.finish-gate") {
      throw new MapFormatError(
        `Finish reference "${finishId}" must target a race.finish-gate entity`,
        `$.race.finishEntityIds[${String(index)}]`,
      );
    }
  }
  for (const [index, recoveryVolume] of document.entities
    .filter((entity) => entity.assetId === "race.recovery-volume")
    .entries()) {
    const safePoseEntityId = recoveryVolume.properties["safePoseEntityId"];
    if (safePoseEntityId === null || safePoseEntityId === undefined) {
      continue;
    }
    if (
      typeof safePoseEntityId !== "string" ||
      entities.get(safePoseEntityId)?.assetId !== "race.recovery-pose"
    ) {
      throw new MapFormatError(
        typeof safePoseEntityId === "string"
          ? `Recovery safe-pose reference "${safePoseEntityId}" must target a race.recovery-pose entity`
          : "Recovery safe-pose reference must target a race.recovery-pose entity",
        `$.entities[recovery-volume:${String(index)}].properties.safePoseEntityId`,
      );
    }
  }
  for (const [index, portal] of document.entities
    .filter((entity) => entity.assetId === "travel.portal")
    .entries()) {
    const peerId = portal.properties["peerPortalEntityId"];
    if (peerId === null || peerId === undefined) {
      continue;
    }
    const peer = typeof peerId === "string" ? entities.get(peerId) : undefined;
    if (peer?.assetId !== "travel.portal" || peer.id === portal.id) {
      throw new MapFormatError(
        typeof peerId === "string"
          ? `Portal peer reference "${peerId}" must target another travel.portal entity`
          : "Portal peer reference must target another travel.portal entity",
        `$.entities[portal:${String(index)}].properties.peerPortalEntityId`,
      );
    }
    if (peer.properties["peerPortalEntityId"] !== portal.id) {
      throw new MapFormatError(
        `Portal pair "${portal.id}" and "${peer.id}" must link to each other`,
        `$.entities[portal:${String(index)}].properties.peerPortalEntityId`,
      );
    }
  }
  const interactionTargets = new Map<string, string[]>();
  for (const [index, interaction] of document.interactions.entries()) {
    const path = `$.interactions[${String(index)}]`;
    if (!entities.has(interaction.sourceEntityId)) {
      throw new MapFormatError(
        `Interaction source "${interaction.sourceEntityId}" does not exist`,
        `${path}.sourceEntityId`,
      );
    }
    if (!entities.has(interaction.targetEntityId)) {
      throw new MapFormatError(
        `Interaction target "${interaction.targetEntityId}" does not exist`,
        `${path}.targetEntityId`,
      );
    }
    if (interaction.sourceEntityId === interaction.targetEntityId) {
      throw new MapFormatError("An interaction cannot target its own source", path);
    }
    const sourceManifest = editorAssetManifest(entities.get(interaction.sourceEntityId)!.assetId);
    const targetManifest = editorAssetManifest(entities.get(interaction.targetEntityId)!.assetId);
    if (!sourceManifest?.linkEvents.includes(interaction.event)) {
      throw new MapFormatError(
        `The source does not support the "${interaction.event}" event`,
        `${path}.event`,
      );
    }
    if (!targetManifest?.linkActions.includes(interaction.action)) {
      throw new MapFormatError(
        `The target does not support the "${interaction.action}" action`,
        `${path}.action`,
      );
    }
    const targets = interactionTargets.get(interaction.sourceEntityId) ?? [];
    targets.push(interaction.targetEntityId);
    interactionTargets.set(interaction.sourceEntityId, targets);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitInteractionNode = (entityId: string): boolean => {
    if (visiting.has(entityId)) {
      return true;
    }
    if (visited.has(entityId)) {
      return false;
    }
    visiting.add(entityId);
    for (const targetId of interactionTargets.get(entityId) ?? []) {
      if (visitInteractionNode(targetId)) {
        return true;
      }
    }
    visiting.delete(entityId);
    visited.add(entityId);
    return false;
  };
  for (const sourceId of interactionTargets.keys()) {
    if (visitInteractionNode(sourceId)) {
      throw new MapFormatError(
        "Instant interaction cycles are not supported; remove one link in the loop",
        "$.interactions",
      );
    }
  }
  const objectGroupCounts = new Map<string, number>();
  for (const entity of document.entities) {
    if (entity.groupId !== null) {
      objectGroupCounts.set(entity.groupId, (objectGroupCounts.get(entity.groupId) ?? 0) + 1);
    }
  }
  for (const [groupId, count] of objectGroupCounts) {
    if (count < 2) {
      throw new MapFormatError(
        `Object group "${groupId}" must contain at least two entities`,
        "$.entities",
      );
    }
  }
  const groupIds = new Set<string>();
  const assignedCheckpointIds = new Set<string>();
  for (const [groupIndex, group] of document.race.checkpointGroups.entries()) {
    const groupPath = `$.race.checkpointGroups[${String(groupIndex)}]`;
    if (groupIds.has(group.id)) {
      throw new MapFormatError(`Duplicate checkpoint group id "${group.id}"`, `${groupPath}.id`);
    }
    groupIds.add(group.id);
    if (group.checkpointEntityIds.length === 0) {
      throw new MapFormatError(
        "Checkpoint groups cannot be empty",
        `${groupPath}.checkpointEntityIds`,
      );
    }
    const groupCheckpointIds = new Set<string>();
    for (const [checkpointIndex, checkpointId] of group.checkpointEntityIds.entries()) {
      const checkpointPath = `${groupPath}.checkpointEntityIds[${String(checkpointIndex)}]`;
      if (groupCheckpointIds.has(checkpointId) || assignedCheckpointIds.has(checkpointId)) {
        throw new MapFormatError(
          `Checkpoint "${checkpointId}" is assigned more than once`,
          checkpointPath,
        );
      }
      if (entities.get(checkpointId)?.assetId !== "race.checkpoint") {
        throw new MapFormatError(
          `Checkpoint reference "${checkpointId}" must target a race.checkpoint entity`,
          checkpointPath,
        );
      }
      groupCheckpointIds.add(checkpointId);
      assignedCheckpointIds.add(checkpointId);
    }
  }
  const routeIds = new Set<string>();
  const routePairs = new Set<string>();
  for (const [edgeIndex, edge] of document.race.routeEdges.entries()) {
    const edgePath = `$.race.routeEdges[${String(edgeIndex)}]`;
    if (routeIds.has(edge.id)) {
      throw new MapFormatError(`Duplicate route edge id "${edge.id}"`, `${edgePath}.id`);
    }
    routeIds.add(edge.id);
    if (!groupIds.has(edge.fromGroupId) || !groupIds.has(edge.toGroupId)) {
      throw new MapFormatError("Route edges must reference existing checkpoint groups", edgePath);
    }
    if (edge.fromGroupId === edge.toGroupId) {
      throw new MapFormatError("Route edges cannot link a group to itself", edgePath);
    }
    const pair = `${edge.fromGroupId}->${edge.toGroupId}`;
    if (routePairs.has(pair)) {
      throw new MapFormatError("Duplicate route edge", edgePath);
    }
    routePairs.add(pair);
  }
}

function requireRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MapFormatError("Expected an object", path);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new MapFormatError("Expected an array", path);
  }
  if (value.length > SAFE_COLLECTION_LENGTH) {
    throw new MapFormatError("Array is too large", path);
  }
  return value;
}

function requireOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new MapFormatError(`Unknown field "${key}"`, `${path}.${key}`);
    }
  }
  for (const key of allowed) {
    if (!(key in value)) {
      throw new MapFormatError(`Missing field "${key}"`, path);
    }
  }
}

function requireString(value: unknown, path: string, maxLength = SAFE_STRING_LENGTH): string {
  if (typeof value !== "string") {
    throw new MapFormatError("Expected a string", path);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new MapFormatError(`Expected 1–${String(maxLength)} characters`, path);
  }
  return normalized;
}

function requireIdentifier(value: unknown, path: string): string {
  const identifier = requireString(value, path, 160);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(identifier)) {
    throw new MapFormatError("Identifier contains unsupported characters", path);
  }
  return identifier;
}

function requireNullableIdentifier(value: unknown, path: string): string | null {
  return value === null ? null : requireIdentifier(value, path);
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new MapFormatError("Expected a boolean", path);
  }
  return value;
}

function requireFinite(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MapFormatError("Expected a finite number", path);
  }
  const normalized = Object.is(value, -0) ? 0 : value;
  if (normalized < minimum || normalized > maximum) {
    throw new MapFormatError(`Expected ${String(minimum)}–${String(maximum)}`, path);
  }
  return normalized;
}

function requireInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  const finite = requireFinite(value, path, minimum, maximum);
  if (!Number.isInteger(finite)) {
    throw new MapFormatError("Expected an integer", path);
  }
  return finite;
}

function requireColor(value: unknown, path: string): string {
  const color = requireString(value, path, 7);
  if (!HEX_COLOR.test(color)) {
    throw new MapFormatError("Expected a six-digit #rrggbb color", path);
  }
  return color.toLowerCase();
}

function requireVector3(value: unknown, path: string, extent: number): Vector3Tuple {
  const array = requireArray(value, path);
  if (array.length !== 3) {
    throw new MapFormatError("Expected three components", path);
  }
  return [
    requireFinite(array[0], `${path}[0]`, -extent, extent),
    requireFinite(array[1], `${path}[1]`, -extent, extent),
    requireFinite(array[2], `${path}[2]`, -extent, extent),
  ];
}

function requirePositiveVector3(value: unknown, path: string, maximum: number): Vector3Tuple {
  const array = requireArray(value, path);
  if (array.length !== 3) {
    throw new MapFormatError("Expected three components", path);
  }
  return [
    requireFinite(array[0], `${path}[0]`, Number.EPSILON, maximum),
    requireFinite(array[1], `${path}[1]`, Number.EPSILON, maximum),
    requireFinite(array[2], `${path}[2]`, Number.EPSILON, maximum),
  ];
}

function requireQuaternion(value: unknown, path: string): QuaternionTuple {
  const array = requireArray(value, path);
  if (array.length !== 4) {
    throw new MapFormatError("Expected four components", path);
  }
  const values = array.map((entry, index) =>
    requireFinite(entry, `${path}[${String(index)}]`, -1, 1),
  );
  const length = Math.hypot(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0);
  if (length < 1e-8 || Math.abs(length - 1) > 1e-5) {
    throw new MapFormatError("Quaternion must be normalized", path);
  }
  const divisor = Math.abs(length - 1) > 1e-12 ? length : 1;
  let result = values.map((entry) => (Object.is(entry, -0) ? 0 : entry / divisor));
  const signPivot = [...result].reverse().find((entry) => Math.abs(entry) > 1e-12) ?? 1;
  if (signPivot < 0) {
    result = result.map((entry) => (entry === 0 ? 0 : -entry));
  }
  return [result[0] ?? 0, result[1] ?? 0, result[2] ?? 0, result[3] ?? 1];
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (typeof value === "number") {
    return Object.is(value, -0) ? 0 : value;
  }
  if (isJsonArray(value)) {
    return value.map((entry) => sortJsonValue(entry));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, sortJsonValue(value[key] as JsonValue)]),
    );
  }
  return value;
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}
