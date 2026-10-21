import type { JsonValue, MapEntity } from "../maps/MapDocument";

export const EDITOR_ASSET_IDS = Object.freeze([
  "floor.rectangle",
  "floor.circle",
  "floor.rounded",
  "floor.polygon",
  "floor.freeform",
  "floor.void-base",
  "shape.block",
  "shape.column",
  "physics.ball",
  "physics.cube",
  "physics.domino",
  "motion.moving-platform",
  "motion.rotating-bar",
  "motion.door",
  "interaction.button",
  "interaction.pressure-plate",
  "interaction.trigger-zone",
  "interaction.timer",
  "interaction.counter",
  "travel.boost-pad",
  "travel.launch-pad",
  "travel.bounce-pad",
  "travel.slow-zone",
  "travel.direction-arrow",
  "travel.portal",
  "decoration.arrow-sign",
  "decoration.point-light",
  "decoration.color-strip",
  "decoration.sculpture",
  "decoration.effect-emitter",
  "track.modular-straight",
  "track.modular-corner",
  "track.bridge",
  "track.guard-rail",
  "track.overpass-support",
  "track.tunnel",
  "track.barrier",
  "track.ramp",
  "track.jump",
  "race.start-grid",
  "race.player-spawn",
  "race.checkpoint",
  "race.finish-gate",
  "race.recovery-volume",
  "race.shortcut-marker",
  "race.recovery-pose",
  "race.out-of-bounds-volume",
] as const);

export type EditorAssetId = (typeof EDITOR_ASSET_IDS)[number];
export type EditorAssetCategory =
  "floors" | "track" | "race" | "physics" | "travel" | "interaction" | "decoration";
export type EditorAssetRenderKind =
  | "box"
  | "column"
  | "sphere"
  | "booster-pad"
  | "surface-pad"
  | "direction-arrow"
  | "arrow-sign"
  | "point-light"
  | "color-strip"
  | "portal"
  | "disc"
  | "rounded-prism"
  | "polygon-prism"
  | "freeform-prism"
  | "quarter-turn-prism"
  | "tunnel"
  | "wedge"
  | "race-marker"
  | "start-grid";

export interface EditorAssetManifest {
  readonly id: EditorAssetId;
  readonly name: string;
  readonly category: EditorAssetCategory;
  readonly searchTerms: readonly string[];
  readonly icon: string;
  readonly placementHint: string;
  readonly historyLabel: string;
  readonly sizeLabel: string;
  readonly renderKind: EditorAssetRenderKind;
  readonly defaultPrimarySize: number;
  readonly defaultSecondarySize: number;
  readonly minimumPrimarySize: number;
  readonly maximumPrimarySize: number;
  readonly physicsClass: "static" | "sensor" | "dynamic" | "kinematic";
  readonly colliderKind:
    | "cuboid"
    | "sphere"
    | "cylinder"
    | "convex-hull"
    | "trimesh"
    | "compound"
    | "sensor-cuboid"
    | "none";
  readonly linkEvents: readonly string[];
  readonly linkActions: readonly string[];
  readonly resetBehavior: string;
  readonly cost: "tiny" | "low" | "medium";
}

export interface EditorAssetDimensions {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly groundOffset: number;
}

export interface PrismMeshData {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

export interface TunnelComponentLayout {
  readonly kind: "left-wall" | "right-wall" | "roof";
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
}

export type FloorOutlinePoint = readonly [number, number];

export const DEFAULT_FREEFORM_FLOOR_OUTLINE: readonly FloorOutlinePoint[] = Object.freeze([
  Object.freeze([-4, -2] as const),
  Object.freeze([0, -3] as const),
  Object.freeze([4, -1.5] as const),
  Object.freeze([3, 2.5] as const),
  Object.freeze([-1, 3] as const),
  Object.freeze([-4, 1] as const),
]);

export const WEDGE_INDICES = Object.freeze([
  0, 1, 2, 1, 3, 2, 0, 4, 1, 1, 4, 5, 2, 3, 4, 3, 5, 4, 0, 2, 4, 1, 5, 3,
] as const);

const MANIFESTS: readonly EditorAssetManifest[] = Object.freeze([
  manifest({
    id: "floor.rectangle",
    name: "Floor",
    category: "floors",
    searchTerms: ["floor", "platform", "ground", "rectangle"],
    icon: "▰",
    placementHint: "CLICK OR DRAG",
    historyLabel: "Place floor",
    sizeLabel: "SCALE · KEEPS SHAPE",
    renderKind: "box",
    defaultPrimarySize: 6,
    defaultSecondarySize: 6,
    minimumPrimarySize: 1,
    maximumPrimarySize: 100,
    physicsClass: "static",
    colliderKind: "cuboid",
    cost: "low",
  }),
  manifest({
    id: "floor.circle",
    name: "Circle Floor",
    category: "floors",
    searchTerms: ["circle", "round", "disc", "floor", "platform"],
    icon: "●",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place circle floor",
    sizeLabel: "CIRCLE DIAMETER",
    renderKind: "disc",
    defaultPrimarySize: 8,
    defaultSecondarySize: 8,
    minimumPrimarySize: 1,
    maximumPrimarySize: 100,
    physicsClass: "static",
    colliderKind: "cylinder",
    cost: "low",
  }),
  manifest({
    id: "floor.rounded",
    name: "Round Floor",
    category: "floors",
    searchTerms: ["rounded", "soft", "platform", "floor", "rectangle"],
    icon: "▰",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place rounded platform",
    sizeLabel: "ROUNDED WIDTH",
    renderKind: "rounded-prism",
    defaultPrimarySize: 8,
    defaultSecondarySize: 6,
    minimumPrimarySize: 2,
    maximumPrimarySize: 100,
    physicsClass: "static",
    colliderKind: "convex-hull",
    cost: "low",
  }),
  manifest({
    id: "floor.polygon",
    name: "Shape Floor",
    category: "floors",
    searchTerms: ["polygon", "hexagon", "regular", "platform", "floor"],
    icon: "⬡",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place polygon platform",
    sizeLabel: "POLYGON DIAMETER",
    renderKind: "polygon-prism",
    defaultPrimarySize: 8,
    defaultSecondarySize: 8,
    minimumPrimarySize: 2,
    maximumPrimarySize: 100,
    physicsClass: "static",
    colliderKind: "convex-hull",
    cost: "low",
  }),
  manifest({
    id: "floor.freeform",
    name: "Draw Floor",
    category: "floors",
    searchTerms: ["freeform", "custom", "draw", "outline", "floor", "platform"],
    icon: "~",
    placementHint: "PRESS + DRAW",
    historyLabel: "Draw freeform floor",
    sizeLabel: "OUTLINE SCALE",
    renderKind: "freeform-prism",
    defaultPrimarySize: 8,
    defaultSecondarySize: 6,
    minimumPrimarySize: 2,
    maximumPrimarySize: 100,
    physicsClass: "static",
    colliderKind: "trimesh",
    cost: "medium",
  }),
  manifest({
    id: "floor.void-base",
    name: "Sky Island",
    category: "floors",
    searchTerms: ["void", "base", "island", "foundation", "floor", "platform"],
    icon: "◇",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place void base",
    sizeLabel: "BASE WIDTH",
    renderKind: "box",
    defaultPrimarySize: 16,
    defaultSecondarySize: 16,
    minimumPrimarySize: 2,
    maximumPrimarySize: 200,
    physicsClass: "static",
    colliderKind: "cuboid",
    cost: "low",
  }),
  manifest({
    id: "shape.block",
    name: "Block",
    category: "floors",
    searchTerms: ["block", "box", "cube", "platform", "building"],
    icon: "■",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place block",
    sizeLabel: "BLOCK SIZE",
    renderKind: "box",
    defaultPrimarySize: 4,
    defaultSecondarySize: 4,
    minimumPrimarySize: 1,
    maximumPrimarySize: 40,
    physicsClass: "static",
    colliderKind: "cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "shape.column",
    name: "Tower",
    category: "floors",
    searchTerms: ["column", "pillar", "cylinder", "support", "tower"],
    icon: "●",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place column",
    sizeLabel: "COLUMN WIDTH",
    renderKind: "column",
    defaultPrimarySize: 3,
    defaultSecondarySize: 3,
    minimumPrimarySize: 1,
    maximumPrimarySize: 24,
    physicsClass: "static",
    colliderKind: "cylinder",
    cost: "low",
  }),
  manifest({
    id: "physics.ball",
    name: "Ball",
    category: "physics",
    searchTerms: ["physics", "ball", "sphere", "rolling", "dynamic", "toy"],
    icon: "●",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place physics ball",
    sizeLabel: "BALL DIAMETER",
    renderKind: "sphere",
    defaultPrimarySize: 2,
    defaultSecondarySize: 2,
    minimumPrimarySize: 0.5,
    maximumPrimarySize: 10,
    physicsClass: "dynamic",
    colliderKind: "sphere",
    cost: "low",
  }),
  manifest({
    id: "physics.cube",
    name: "Box",
    category: "physics",
    searchTerms: ["physics", "cube", "box", "push", "dynamic", "toy"],
    icon: "◆",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place physics cube",
    sizeLabel: "CUBE SIZE",
    renderKind: "box",
    defaultPrimarySize: 2,
    defaultSecondarySize: 2,
    minimumPrimarySize: 0.5,
    maximumPrimarySize: 10,
    physicsClass: "dynamic",
    colliderKind: "cuboid",
    cost: "low",
  }),
  manifest({
    id: "physics.domino",
    name: "Domino",
    category: "physics",
    searchTerms: ["physics", "domino", "obstacle", "knock", "dynamic", "toy"],
    icon: "▮",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place physics domino",
    sizeLabel: "DOMINO HEIGHT",
    renderKind: "box",
    defaultPrimarySize: 4,
    defaultSecondarySize: 2,
    minimumPrimarySize: 1,
    maximumPrimarySize: 12,
    physicsClass: "dynamic",
    colliderKind: "cuboid",
    cost: "low",
  }),
  manifest({
    id: "motion.moving-platform",
    name: "Lift",
    category: "physics",
    searchTerms: ["moving", "platform", "lift", "elevator", "shuttle", "motion"],
    icon: "↕",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place moving platform",
    sizeLabel: "PLATFORM WIDTH",
    renderKind: "box",
    defaultPrimarySize: 4,
    defaultSecondarySize: 4,
    minimumPrimarySize: 1,
    maximumPrimarySize: 20,
    physicsClass: "kinematic",
    colliderKind: "cuboid",
    linkActions: ["start", "stop", "reverse", "enable", "disable", "reset"],
    cost: "low",
  }),
  manifest({
    id: "motion.rotating-bar",
    name: "Spinner",
    category: "physics",
    searchTerms: ["rotating", "bar", "spinner", "sweeper", "obstacle", "motion"],
    icon: "↻",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place rotating bar",
    sizeLabel: "BAR LENGTH",
    renderKind: "box",
    defaultPrimarySize: 8,
    defaultSecondarySize: 0.8,
    minimumPrimarySize: 2,
    maximumPrimarySize: 30,
    physicsClass: "kinematic",
    colliderKind: "cuboid",
    linkActions: ["start", "stop", "reverse", "enable", "disable", "reset"],
    cost: "low",
  }),
  manifest({
    id: "motion.door",
    name: "Door",
    category: "physics",
    searchTerms: ["door", "gate", "moving", "lift", "interaction", "motion"],
    icon: "▥",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place moving door",
    sizeLabel: "DOOR HEIGHT",
    renderKind: "box",
    defaultPrimarySize: 4,
    defaultSecondarySize: 5,
    minimumPrimarySize: 1,
    maximumPrimarySize: 16,
    physicsClass: "kinematic",
    colliderKind: "cuboid",
    linkActions: ["open", "close", "toggle", "enable", "disable", "reset"],
    cost: "low",
  }),
  manifest({
    id: "interaction.button",
    name: "Button",
    category: "interaction",
    searchTerms: ["button", "press", "switch", "trigger", "interaction"],
    icon: "●",
    placementHint: "LINK TO A TARGET",
    historyLabel: "Place button",
    sizeLabel: "BUTTON WIDTH",
    renderKind: "surface-pad",
    defaultPrimarySize: 2,
    defaultSecondarySize: 2,
    minimumPrimarySize: 0.75,
    maximumPrimarySize: 8,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    linkEvents: ["pressed", "released", "activated"],
    linkActions: ["enable", "disable", "reset"],
    cost: "tiny",
  }),
  manifest({
    id: "interaction.pressure-plate",
    name: "Step Pad",
    category: "interaction",
    searchTerms: ["pressure", "plate", "occupied", "released", "interaction"],
    icon: "▰",
    placementHint: "LINK TO A TARGET",
    historyLabel: "Place pressure plate",
    sizeLabel: "PLATE WIDTH",
    renderKind: "surface-pad",
    defaultPrimarySize: 3,
    defaultSecondarySize: 3,
    minimumPrimarySize: 1,
    maximumPrimarySize: 12,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    linkEvents: ["pressed", "released", "entered", "exited"],
    linkActions: ["enable", "disable", "reset"],
    cost: "tiny",
  }),
  manifest({
    id: "interaction.trigger-zone",
    name: "Magic Zone",
    category: "interaction",
    searchTerms: ["trigger", "zone", "volume", "entered", "exited", "interaction"],
    icon: "□",
    placementHint: "LINK TO A TARGET",
    historyLabel: "Place trigger zone",
    sizeLabel: "ZONE WIDTH",
    renderKind: "race-marker",
    defaultPrimarySize: 5,
    defaultSecondarySize: 5,
    minimumPrimarySize: 1,
    maximumPrimarySize: 30,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    linkEvents: ["entered", "exited", "activated"],
    linkActions: ["enable", "disable", "reset"],
    cost: "tiny",
  }),
  manifest({
    id: "interaction.timer",
    name: "Timer",
    category: "interaction",
    searchTerms: ["timer", "delay", "elapsed", "repeat", "logic", "interaction"],
    icon: "◷",
    placementHint: "LINK TO A TARGET",
    historyLabel: "Place timer",
    sizeLabel: "TIMER MARKER SIZE",
    renderKind: "race-marker",
    defaultPrimarySize: 2,
    defaultSecondarySize: 2,
    minimumPrimarySize: 0.75,
    maximumPrimarySize: 6,
    physicsClass: "sensor",
    colliderKind: "none",
    linkEvents: ["elapsed", "activated"],
    linkActions: ["start", "stop", "reset", "enable", "disable"],
    cost: "tiny",
  }),
  manifest({
    id: "interaction.counter",
    name: "Counter",
    category: "interaction",
    searchTerms: ["counter", "count", "threshold", "reached", "logic", "interaction"],
    icon: "#",
    placementHint: "LINK TO A TARGET",
    historyLabel: "Place counter",
    sizeLabel: "COUNTER MARKER SIZE",
    renderKind: "race-marker",
    defaultPrimarySize: 2,
    defaultSecondarySize: 2,
    minimumPrimarySize: 0.75,
    maximumPrimarySize: 6,
    physicsClass: "sensor",
    colliderKind: "none",
    linkEvents: ["activated"],
    linkActions: ["increment", "reset", "enable", "disable"],
    cost: "tiny",
  }),
  manifest({
    id: "travel.boost-pad",
    name: "Boost Pad",
    category: "travel",
    searchTerms: ["boost", "speed", "pad", "arrow", "fast", "travel"],
    icon: "➜",
    placementHint: "DRIVE OVER",
    historyLabel: "Place boost pad",
    sizeLabel: "PAD WIDTH",
    renderKind: "booster-pad",
    defaultPrimarySize: 2.5,
    defaultSecondarySize: 3,
    minimumPrimarySize: 1,
    maximumPrimarySize: 12,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    linkEvents: ["activated"],
    linkActions: ["enable", "disable", "pulse", "reset"],
    cost: "low",
  }),
  manifest({
    id: "travel.launch-pad",
    name: "Launch Pad",
    category: "travel",
    searchTerms: ["launch", "jump", "boost", "pad", "air", "travel"],
    icon: "↗",
    placementHint: "DRIVE OVER",
    historyLabel: "Place launch pad",
    sizeLabel: "PAD WIDTH",
    renderKind: "booster-pad",
    defaultPrimarySize: 3,
    defaultSecondarySize: 3.5,
    minimumPrimarySize: 1,
    maximumPrimarySize: 12,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    linkEvents: ["activated"],
    linkActions: ["enable", "disable", "pulse", "reset"],
    cost: "low",
  }),
  manifest({
    id: "travel.bounce-pad",
    name: "Bounce Pad",
    category: "travel",
    searchTerms: ["bounce", "spring", "jump", "pad", "up", "travel"],
    icon: "↟",
    placementHint: "BOUNCE UP",
    historyLabel: "Place bounce pad",
    sizeLabel: "PAD WIDTH",
    renderKind: "surface-pad",
    defaultPrimarySize: 3,
    defaultSecondarySize: 3,
    minimumPrimarySize: 1,
    maximumPrimarySize: 12,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    linkEvents: ["activated"],
    linkActions: ["enable", "disable", "pulse", "reset"],
    cost: "low",
  }),
  manifest({
    id: "travel.slow-zone",
    name: "Slow Zone",
    category: "travel",
    searchTerms: ["slow", "mud", "zone", "speed", "trap", "travel"],
    icon: "≋",
    placementHint: "SLOWS ON ENTRY",
    historyLabel: "Place slow zone",
    sizeLabel: "ZONE WIDTH",
    renderKind: "surface-pad",
    defaultPrimarySize: 4,
    defaultSecondarySize: 5,
    minimumPrimarySize: 1,
    maximumPrimarySize: 20,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    linkEvents: ["activated"],
    linkActions: ["enable", "disable", "pulse", "reset"],
    cost: "low",
  }),
  manifest({
    id: "travel.direction-arrow",
    name: "Floor Arrow",
    category: "travel",
    searchTerms: ["direction", "arrow", "guide", "turn", "route", "travel"],
    icon: "➜",
    placementHint: "TURN TO POINT",
    historyLabel: "Place direction arrow",
    sizeLabel: "ARROW WIDTH",
    renderKind: "direction-arrow",
    defaultPrimarySize: 2.5,
    defaultSecondarySize: 4,
    minimumPrimarySize: 0.75,
    maximumPrimarySize: 12,
    physicsClass: "static",
    colliderKind: "none",
    cost: "tiny",
  }),
  manifest({
    id: "travel.portal",
    name: "Portal",
    category: "travel",
    searchTerms: ["portal", "teleport", "pair", "door", "warp", "travel"],
    icon: "◉",
    placementHint: "PLACE TWO + LINK",
    historyLabel: "Place portal",
    sizeLabel: "PORTAL WIDTH",
    renderKind: "portal",
    defaultPrimarySize: 3,
    defaultSecondarySize: 4,
    minimumPrimarySize: 1.5,
    maximumPrimarySize: 12,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    linkEvents: ["activated"],
    linkActions: ["enable", "disable", "toggle", "reset"],
    cost: "low",
  }),
  manifest({
    id: "decoration.arrow-sign",
    name: "Sign",
    category: "decoration",
    searchTerms: ["sign", "arrow", "direction", "decoration", "guide", "road"],
    icon: "➟",
    placementHint: "TURN TO POINT",
    historyLabel: "Place arrow sign",
    sizeLabel: "SIGN WIDTH",
    renderKind: "arrow-sign",
    defaultPrimarySize: 3,
    defaultSecondarySize: 2,
    minimumPrimarySize: 1,
    maximumPrimarySize: 12,
    physicsClass: "static",
    colliderKind: "compound",
    cost: "tiny",
  }),
  manifest({
    id: "decoration.point-light",
    name: "Lamp",
    category: "decoration",
    searchTerms: ["light", "lamp", "glow", "color", "decoration", "night"],
    icon: "✦",
    placementHint: "LIGHT AN AREA",
    historyLabel: "Place point light",
    sizeLabel: "LIGHT HEIGHT",
    renderKind: "point-light",
    defaultPrimarySize: 3,
    defaultSecondarySize: 0.6,
    minimumPrimarySize: 1,
    maximumPrimarySize: 12,
    physicsClass: "static",
    colliderKind: "none",
    linkEvents: ["activated", "deactivated"],
    linkActions: ["enable", "disable", "pulse", "show", "hide", "reset"],
    cost: "medium",
  }),
  manifest({
    id: "decoration.color-strip",
    name: "Glow Strip",
    category: "decoration",
    searchTerms: ["color", "strip", "glow", "neon", "line", "decoration"],
    icon: "▬",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place color strip",
    sizeLabel: "STRIP LENGTH",
    renderKind: "color-strip",
    defaultPrimarySize: 8,
    defaultSecondarySize: 0.5,
    minimumPrimarySize: 1,
    maximumPrimarySize: 40,
    physicsClass: "static",
    colliderKind: "none",
    linkEvents: ["activated", "deactivated"],
    linkActions: ["enable", "disable", "pulse", "show", "hide", "reset"],
    cost: "tiny",
  }),
  manifest({
    id: "decoration.sculpture",
    name: "Statue",
    category: "decoration",
    searchTerms: ["sculpture", "statue", "prop", "themed", "decoration", "toy"],
    icon: "◆",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place toy sculpture",
    sizeLabel: "SCULPTURE WIDTH",
    renderKind: "polygon-prism",
    defaultPrimarySize: 3,
    defaultSecondarySize: 5,
    minimumPrimarySize: 0.75,
    maximumPrimarySize: 20,
    physicsClass: "static",
    colliderKind: "convex-hull",
    cost: "low",
  }),
  manifest({
    id: "decoration.effect-emitter",
    name: "Confetti",
    category: "decoration",
    searchTerms: ["effect", "particles", "spark", "confetti", "emitter", "decoration"],
    icon: "✦",
    placementHint: "LINK OR START ON",
    historyLabel: "Place effect emitter",
    sizeLabel: "EFFECT AREA",
    renderKind: "race-marker",
    defaultPrimarySize: 3,
    defaultSecondarySize: 3,
    minimumPrimarySize: 1,
    maximumPrimarySize: 16,
    physicsClass: "sensor",
    colliderKind: "none",
    linkEvents: ["activated", "deactivated"],
    linkActions: ["play", "stop", "pulse", "enable", "disable", "reset"],
    cost: "low",
  }),
  manifest({
    id: "track.modular-straight",
    name: "Straight Road",
    category: "track",
    searchTerms: ["road", "track", "straight", "modular", "deck", "section"],
    icon: "═",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place road straight",
    sizeLabel: "STRAIGHT LENGTH",
    renderKind: "box",
    defaultPrimarySize: 8,
    defaultSecondarySize: 5,
    minimumPrimarySize: 2,
    maximumPrimarySize: 40,
    physicsClass: "static",
    colliderKind: "cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "track.modular-corner",
    name: "Curved Road",
    category: "track",
    searchTerms: ["road", "track", "corner", "turn", "curve", "modular"],
    icon: "⌝",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place road corner",
    sizeLabel: "TURN RADIUS",
    renderKind: "quarter-turn-prism",
    defaultPrimarySize: 8,
    defaultSecondarySize: 5,
    minimumPrimarySize: 3,
    maximumPrimarySize: 50,
    physicsClass: "static",
    colliderKind: "trimesh",
    cost: "low",
  }),
  manifest({
    id: "track.bridge",
    name: "Bridge",
    category: "track",
    searchTerms: ["bridge", "deck", "road", "track", "elevated", "overpass"],
    icon: "▰",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place bridge deck",
    sizeLabel: "BRIDGE LENGTH",
    renderKind: "box",
    defaultPrimarySize: 12,
    defaultSecondarySize: 5,
    minimumPrimarySize: 4,
    maximumPrimarySize: 60,
    physicsClass: "static",
    colliderKind: "cuboid",
    cost: "low",
  }),
  manifest({
    id: "track.guard-rail",
    name: "Rail",
    category: "track",
    searchTerms: ["guard", "rail", "barrier", "boundary", "road", "track"],
    icon: "━",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place guard rail",
    sizeLabel: "RAIL LENGTH",
    renderKind: "box",
    defaultPrimarySize: 8,
    defaultSecondarySize: 0.22,
    minimumPrimarySize: 1,
    maximumPrimarySize: 50,
    physicsClass: "static",
    colliderKind: "cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "track.overpass-support",
    name: "Pillar",
    category: "track",
    searchTerms: ["overpass", "support", "bridge", "pillar", "pier", "structure"],
    icon: "Π",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place overpass support",
    sizeLabel: "SUPPORT HEIGHT",
    renderKind: "box",
    defaultPrimarySize: 6,
    defaultSecondarySize: 3,
    minimumPrimarySize: 2,
    maximumPrimarySize: 30,
    physicsClass: "static",
    colliderKind: "cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "track.tunnel",
    name: "Tunnel",
    category: "track",
    searchTerms: ["tunnel", "drive", "through", "roof", "covered", "track"],
    icon: "∩",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place tunnel",
    sizeLabel: "TUNNEL LENGTH",
    renderKind: "tunnel",
    defaultPrimarySize: 12,
    defaultSecondarySize: 6,
    minimumPrimarySize: 4,
    maximumPrimarySize: 60,
    physicsClass: "static",
    colliderKind: "compound",
    cost: "medium",
  }),
  manifest({
    id: "track.barrier",
    name: "Wall",
    category: "track",
    searchTerms: ["barrier", "wall", "rail", "boundary", "fence"],
    icon: "▬",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place barrier",
    sizeLabel: "BARRIER LENGTH",
    renderKind: "box",
    defaultPrimarySize: 6,
    defaultSecondarySize: 0.45,
    minimumPrimarySize: 1,
    maximumPrimarySize: 40,
    physicsClass: "static",
    colliderKind: "cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "track.ramp",
    name: "Ramp",
    category: "track",
    searchTerms: ["ramp", "slope", "bridge", "climb", "hill"],
    icon: "◢",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place ramp",
    sizeLabel: "RAMP LENGTH",
    renderKind: "wedge",
    defaultPrimarySize: 8,
    defaultSecondarySize: 5,
    minimumPrimarySize: 3,
    maximumPrimarySize: 30,
    physicsClass: "static",
    colliderKind: "convex-hull",
    cost: "low",
  }),
  manifest({
    id: "track.jump",
    name: "Jump",
    category: "track",
    searchTerms: ["jump", "launch", "takeoff", "ramp", "air"],
    icon: "↗",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place jump",
    sizeLabel: "JUMP LENGTH",
    renderKind: "wedge",
    defaultPrimarySize: 5,
    defaultSecondarySize: 5,
    minimumPrimarySize: 2,
    maximumPrimarySize: 16,
    physicsClass: "static",
    colliderKind: "convex-hull",
    cost: "low",
  }),
  manifest({
    id: "race.start-grid",
    name: "Start Line",
    category: "race",
    searchTerms: ["start", "grid", "spawn", "players", "race"],
    icon: "⌁",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place start grid",
    sizeLabel: "GRID SPACING",
    renderKind: "start-grid",
    defaultPrimarySize: 2.5,
    defaultSecondarySize: 2.5,
    minimumPrimarySize: 0.5,
    maximumPrimarySize: 20,
    physicsClass: "sensor",
    colliderKind: "none",
    cost: "tiny",
  }),
  manifest({
    id: "race.player-spawn",
    name: "Start Spot",
    category: "race",
    searchTerms: ["player", "spawn", "start", "slot", "grid", "race"],
    icon: "▲",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place player spawn",
    sizeLabel: "SPAWN MARKER SIZE",
    renderKind: "race-marker",
    defaultPrimarySize: 2,
    defaultSecondarySize: 2,
    minimumPrimarySize: 0.75,
    maximumPrimarySize: 6,
    physicsClass: "sensor",
    colliderKind: "none",
    cost: "tiny",
  }),
  manifest({
    id: "race.checkpoint",
    name: "Checkpoint",
    category: "race",
    searchTerms: ["checkpoint", "gate", "order", "lap", "route", "race"],
    icon: "◇",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place checkpoint",
    sizeLabel: "CHECKPOINT WIDTH",
    renderKind: "race-marker",
    defaultPrimarySize: 7,
    defaultSecondarySize: 4,
    minimumPrimarySize: 3,
    maximumPrimarySize: 30,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "race.finish-gate",
    name: "Finish",
    category: "race",
    searchTerms: ["finish", "gate", "goal", "race", "lap", "end"],
    icon: "⚑",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place finish gate",
    sizeLabel: "FINISH WIDTH",
    renderKind: "race-marker",
    defaultPrimarySize: 7,
    defaultSecondarySize: 4,
    minimumPrimarySize: 3,
    maximumPrimarySize: 30,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "race.recovery-volume",
    name: "Respawn Zone",
    category: "race",
    searchTerms: ["recovery", "reset", "rescue", "volume", "safe", "race"],
    icon: "↻",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place recovery volume",
    sizeLabel: "RECOVERY WIDTH",
    renderKind: "race-marker",
    defaultPrimarySize: 8,
    defaultSecondarySize: 8,
    minimumPrimarySize: 2,
    maximumPrimarySize: 50,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "race.shortcut-marker",
    name: "Shortcut",
    category: "race",
    searchTerms: ["shortcut", "alternate", "branch", "secret", "route", "race"],
    icon: "S",
    placementHint: "DRIVE THROUGH",
    historyLabel: "Place shortcut marker",
    sizeLabel: "SHORTCUT WIDTH",
    renderKind: "race-marker",
    defaultPrimarySize: 5,
    defaultSecondarySize: 3,
    minimumPrimarySize: 2,
    maximumPrimarySize: 30,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    cost: "tiny",
  }),
  manifest({
    id: "race.recovery-pose",
    name: "Respawn Spot",
    category: "race",
    searchTerms: ["safe", "recovery", "pose", "respawn", "reset", "heading", "race"],
    icon: "R",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place safe recovery pose",
    sizeLabel: "RECOVERY MARKER SIZE",
    renderKind: "race-marker",
    defaultPrimarySize: 2,
    defaultSecondarySize: 2,
    minimumPrimarySize: 0.75,
    maximumPrimarySize: 6,
    physicsClass: "sensor",
    colliderKind: "none",
    cost: "tiny",
  }),
  manifest({
    id: "race.out-of-bounds-volume",
    name: "Fall Zone",
    category: "race",
    searchTerms: ["out", "bounds", "fall", "reset", "volume", "race"],
    icon: "!",
    placementHint: "CLICK TO PLACE",
    historyLabel: "Place out-of-bounds volume",
    sizeLabel: "VOLUME WIDTH",
    renderKind: "race-marker",
    defaultPrimarySize: 12,
    defaultSecondarySize: 12,
    minimumPrimarySize: 2,
    maximumPrimarySize: 100,
    physicsClass: "sensor",
    colliderKind: "sensor-cuboid",
    cost: "tiny",
  }),
]);

const MANIFEST_BY_ID = new Map(MANIFESTS.map((entry) => [entry.id, entry]));

export function editorAssetCatalog(): readonly EditorAssetManifest[] {
  return MANIFESTS;
}

export function editorAssetManifest(assetId: string): EditorAssetManifest | null {
  return MANIFEST_BY_ID.get(assetId as EditorAssetId) ?? null;
}

export function isEditorAssetId(assetId: string): assetId is EditorAssetId {
  return MANIFEST_BY_ID.has(assetId as EditorAssetId);
}

export function editorAssetDimensions(
  assetId: EditorAssetId,
  primarySize: number,
  secondarySize: number,
): EditorAssetDimensions {
  switch (assetId) {
    case "floor.rectangle":
      return dimensions(primarySize, 0.5, secondarySize, -0.25);
    case "floor.circle":
    case "floor.polygon":
      return dimensions(primarySize, 0.5, primarySize, -0.25);
    case "floor.freeform":
      return dimensions(primarySize, 0.5, secondarySize, -0.25);
    case "floor.void-base":
      return dimensions(primarySize, 1, secondarySize, -0.5);
    case "floor.rounded":
      return dimensions(primarySize, 0.5, secondarySize, -0.25);
    case "shape.block":
      return dimensions(primarySize, primarySize, secondarySize, primarySize / 2);
    case "shape.column":
      return dimensions(primarySize, primarySize * 2, primarySize, primarySize);
    case "physics.ball":
    case "physics.cube":
      return dimensions(primarySize, primarySize, primarySize, primarySize / 2);
    case "physics.domino":
      return dimensions(
        secondarySize,
        primarySize,
        Math.max(0.35, secondarySize * 0.4),
        primarySize / 2,
      );
    case "motion.moving-platform":
      return dimensions(primarySize, 0.3, secondarySize, 0.15);
    case "motion.rotating-bar":
      return dimensions(primarySize, 0.6, secondarySize, 0.3);
    case "motion.door":
      return dimensions(secondarySize, primarySize, 0.5, primarySize / 2);
    case "interaction.button":
      return dimensions(primarySize, 0.3, secondarySize, 0.15);
    case "interaction.pressure-plate":
      return dimensions(primarySize, 0.14, secondarySize, 0.07);
    case "interaction.trigger-zone":
      return dimensions(primarySize, 3, secondarySize, 1.5);
    case "interaction.timer":
    case "interaction.counter":
      return dimensions(primarySize, primarySize, primarySize, primarySize / 2);
    case "travel.boost-pad":
    case "travel.launch-pad":
    case "travel.bounce-pad":
    case "travel.slow-zone":
      return dimensions(primarySize, 0.16, secondarySize, 0.08);
    case "travel.direction-arrow":
      return dimensions(primarySize, 0.06, secondarySize, 0.03);
    case "travel.portal":
      return dimensions(primarySize, secondarySize, 0.35, secondarySize / 2);
    case "decoration.arrow-sign": {
      const postHeight = 2.5;
      return dimensions(
        primarySize,
        postHeight + secondarySize,
        0.25,
        (postHeight + secondarySize) / 2,
      );
    }
    case "decoration.point-light":
      return dimensions(secondarySize, primarySize, secondarySize, primarySize / 2);
    case "decoration.color-strip":
      return dimensions(primarySize, 0.08, secondarySize, 0.04);
    case "decoration.sculpture":
      return dimensions(primarySize, secondarySize, primarySize, secondarySize / 2);
    case "decoration.effect-emitter":
      return dimensions(primarySize, primarySize, primarySize, primarySize / 2);
    case "track.modular-straight":
      return dimensions(secondarySize, 0.35, primarySize, -0.175);
    case "track.modular-corner": {
      const width = Math.min(secondarySize, primarySize * 1.8);
      const outerRadius = primarySize + width / 2;
      return dimensions(outerRadius, 0.35, outerRadius, -0.175);
    }
    case "track.bridge":
      return dimensions(secondarySize, 0.6, primarySize, -0.3);
    case "track.guard-rail":
      return dimensions(primarySize, 1, 0.22, 0.5);
    case "track.overpass-support":
      return dimensions(secondarySize, primarySize, secondarySize * 0.5, primarySize / 2);
    case "track.tunnel": {
      const wallThickness = 0.45;
      const roofThickness = 0.45;
      const clearHeight = 4.5;
      const totalHeight = clearHeight + roofThickness;
      return dimensions(
        secondarySize + wallThickness * 2,
        totalHeight,
        primarySize,
        totalHeight / 2,
      );
    }
    case "track.barrier":
      return dimensions(primarySize, 1.2, 0.45, 0.6);
    case "track.ramp": {
      const height = Math.max(1.5, primarySize * 0.4);
      return dimensions(secondarySize, height, primarySize, height / 2);
    }
    case "track.jump": {
      const height = Math.max(1.5, primarySize * 0.5);
      return dimensions(secondarySize, height, primarySize, height / 2);
    }
    case "race.start-grid":
      return dimensions(primarySize * 2.2, 0.12, primarySize * 1.6, 0.5);
    case "race.player-spawn":
    case "race.recovery-pose":
      return dimensions(primarySize, 0.12, primarySize, 0.06);
    case "race.checkpoint":
    case "race.finish-gate":
    case "race.shortcut-marker":
      return dimensions(primarySize, secondarySize, 1, secondarySize / 2);
    case "race.recovery-volume":
      return dimensions(primarySize, 3, secondarySize, 1.5);
    case "race.out-of-bounds-volume":
      return dimensions(primarySize, 4, secondarySize, 2);
  }
}

export function wedgeVertices(width: number, height: number, depth: number): Float32Array {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  return new Float32Array([
    -halfWidth,
    -halfHeight,
    -halfDepth,
    halfWidth,
    -halfHeight,
    -halfDepth,
    -halfWidth,
    -halfHeight,
    halfDepth,
    halfWidth,
    -halfHeight,
    halfDepth,
    -halfWidth,
    halfHeight,
    halfDepth,
    halfWidth,
    halfHeight,
    halfDepth,
  ]);
}

export function regularPolygonPrism(
  width: number,
  height: number,
  depth: number,
  sides: number,
): PrismMeshData {
  const count = Math.min(12, Math.max(3, Math.round(sides)));
  const outline: [number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    outline.push([Math.cos(angle) * width * 0.5, Math.sin(angle) * depth * 0.5]);
  }
  return extrudedPrism(outline, height);
}

export function roundedPlatformPrism(
  width: number,
  height: number,
  depth: number,
  requestedRadius: number,
): PrismMeshData {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const radius = Math.min(Math.max(0.1, requestedRadius), halfWidth, halfDepth);
  const outline: [number, number][] = [];
  const cornerSegments = 5;
  const corners = [
    [halfWidth - radius, -halfDepth + radius, -Math.PI / 2],
    [halfWidth - radius, halfDepth - radius, 0],
    [-halfWidth + radius, halfDepth - radius, Math.PI / 2],
    [-halfWidth + radius, -halfDepth + radius, Math.PI],
  ] as const;
  for (const [centerX, centerZ, startAngle] of corners) {
    for (let segment = 0; segment <= cornerSegments; segment += 1) {
      const angle = startAngle + (segment / cornerSegments) * (Math.PI / 2);
      outline.push([centerX + Math.cos(angle) * radius, centerZ + Math.sin(angle) * radius]);
    }
  }
  return extrudedPrism(outline, height);
}

export function trackCornerPrism(
  radius: number,
  width: number,
  height: number,
  segments = 12,
): PrismMeshData {
  const safeRadius = Math.max(0.5, radius);
  const safeWidth = Math.min(Math.max(0.25, width), safeRadius * 1.8);
  const outerRadius = safeRadius + safeWidth / 2;
  const innerRadius = safeRadius - safeWidth / 2;
  const count = Math.min(15, Math.max(3, Math.round(segments)));
  const outline: FloorOutlinePoint[] = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = (index / count) * (Math.PI / 2);
    outline.push([
      Math.cos(angle) * outerRadius - outerRadius / 2,
      Math.sin(angle) * outerRadius - outerRadius / 2,
    ]);
  }
  for (let index = count; index >= 0; index -= 1) {
    const angle = (index / count) * (Math.PI / 2);
    outline.push([
      Math.cos(angle) * innerRadius - outerRadius / 2,
      Math.sin(angle) * innerRadius - outerRadius / 2,
    ]);
  }
  return freeformPlatformPrism(outline, height);
}

export function tunnelComponentLayout(
  length: number,
  clearWidth: number,
  clearHeight: number,
  wallThickness: number,
  roofThickness: number,
): readonly TunnelComponentLayout[] {
  const safeLength = Math.max(0.5, length);
  const safeClearWidth = Math.max(0.5, clearWidth);
  const safeClearHeight = Math.max(0.5, clearHeight);
  const safeWallThickness = Math.max(0.1, wallThickness);
  const safeRoofThickness = Math.max(0.1, roofThickness);
  const totalHeight = safeClearHeight + safeRoofThickness;
  const wallY = safeClearHeight / 2 - totalHeight / 2;
  const roofY = safeClearHeight + safeRoofThickness / 2 - totalHeight / 2;
  const wallX = safeClearWidth / 2 + safeWallThickness / 2;
  return Object.freeze([
    Object.freeze({
      kind: "left-wall" as const,
      size: Object.freeze([safeWallThickness, safeClearHeight, safeLength] as const),
      position: Object.freeze([-wallX, wallY, 0] as const),
    }),
    Object.freeze({
      kind: "right-wall" as const,
      size: Object.freeze([safeWallThickness, safeClearHeight, safeLength] as const),
      position: Object.freeze([wallX, wallY, 0] as const),
    }),
    Object.freeze({
      kind: "roof" as const,
      size: Object.freeze([
        safeClearWidth + safeWallThickness * 2,
        safeRoofThickness,
        safeLength,
      ] as const),
      position: Object.freeze([0, roofY, 0] as const),
    }),
  ]);
}

export function freeformPlatformPrism(
  requestedOutline: readonly FloorOutlinePoint[],
  height: number,
): PrismMeshData {
  const outline = normalizedSimpleFloorOutline(requestedOutline);
  if (outline === null) {
    throw new Error("Freeform floor outline must be a simple, non-crossing polygon.");
  }
  const halfHeight = height / 2;
  const vertices: number[] = [];
  for (const [x, z] of outline) {
    vertices.push(x, -halfHeight, z, x, halfHeight, z);
  }
  const indices: number[] = [];
  for (const [first, second, third] of triangulateSimpleOutline(outline)) {
    indices.push(first * 2, second * 2, third * 2);
    indices.push(third * 2 + 1, second * 2 + 1, first * 2 + 1);
  }
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    const bottom = index * 2;
    const top = bottom + 1;
    const nextBottom = next * 2;
    const nextTop = nextBottom + 1;
    indices.push(bottom, top, nextBottom, top, nextTop, nextBottom);
  }
  return Object.freeze({
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  });
}

export function normalizedSimpleFloorOutline(
  requestedOutline: readonly FloorOutlinePoint[],
): readonly FloorOutlinePoint[] | null {
  if (requestedOutline.length < 3 || requestedOutline.length > 32) {
    return null;
  }
  let outline = requestedOutline.map(([x, z]) => [x, z] as FloorOutlinePoint);
  if (outline.some(([x, z]) => !Number.isFinite(x) || !Number.isFinite(z))) {
    return null;
  }
  if (
    outline.some(([x, z], index) => {
      const [nextX, nextZ] = outline[(index + 1) % outline.length]!;
      return Math.hypot(nextX - x, nextZ - z) < 0.05;
    })
  ) {
    return null;
  }
  let removedCollinearPoint = true;
  while (removedCollinearPoint && outline.length > 3) {
    const filtered = outline.filter((point, index) => {
      const previous = outline[(index - 1 + outline.length) % outline.length]!;
      const next = outline[(index + 1) % outline.length]!;
      return (
        Math.abs(
          (point[0] - previous[0]) * (next[1] - point[1]) -
            (point[1] - previous[1]) * (next[0] - point[0]),
        ) > 1e-8
      );
    });
    removedCollinearPoint = filtered.length !== outline.length;
    outline = filtered;
  }
  if (outline.length < 3) {
    return null;
  }
  for (let first = 0; first < outline.length; first += 1) {
    const firstNext = (first + 1) % outline.length;
    for (let second = first + 1; second < outline.length; second += 1) {
      const secondNext = (second + 1) % outline.length;
      if (first === second || firstNext === second || secondNext === first) {
        continue;
      }
      if (
        segmentsIntersect(
          outline[first]!,
          outline[firstNext]!,
          outline[second]!,
          outline[secondNext]!,
        )
      ) {
        return null;
      }
    }
  }
  const area = signedOutlineArea(outline);
  if (Math.abs(area) < 0.5) {
    return null;
  }
  const bounds = outlineBounds(outline);
  if (bounds.width > 100 || bounds.depth > 100) {
    return null;
  }
  const normalized = area > 0 ? outline : [...outline].reverse();
  return Object.freeze(normalized.map((point) => Object.freeze(point)));
}

export function freeformFloorOutline(entity: MapEntity): readonly FloorOutlinePoint[] {
  const value = entity.properties["outline"];
  if (!Array.isArray(value)) {
    return DEFAULT_FREEFORM_FLOOR_OUTLINE;
  }
  const outline: FloorOutlinePoint[] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) {
      return DEFAULT_FREEFORM_FLOOR_OUTLINE;
    }
    const x: unknown = point[0];
    const z: unknown = point[1];
    if (typeof x !== "number" || typeof z !== "number") {
      return DEFAULT_FREEFORM_FLOOR_OUTLINE;
    }
    outline.push([x, z]);
  }
  return normalizedSimpleFloorOutline(outline) ?? DEFAULT_FREEFORM_FLOOR_OUTLINE;
}

export function createEditorAssetProperties(
  assetId: EditorAssetId,
  primarySize: number,
  secondarySize: number,
): Readonly<Record<string, JsonValue>> {
  const size = editorAssetDimensions(assetId, primarySize, secondarySize);
  switch (assetId) {
    case "floor.rectangle":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        color: "#dfe8ee",
        surface: "normal",
      });
    case "floor.circle":
      return properties({
        radius: size.width / 2,
        height: size.height,
        color: "#d8ebef",
        surface: "normal",
      });
    case "floor.rounded":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        cornerRadius: Math.min(1.5, size.width / 4, size.depth / 4),
        color: "#d8ebef",
        surface: "normal",
      });
    case "floor.polygon":
      return properties({
        radius: size.width / 2,
        height: size.height,
        sides: 6,
        color: "#d8ebef",
        surface: "normal",
      });
    case "floor.freeform":
      return properties({
        outline: DEFAULT_FREEFORM_FLOOR_OUTLINE,
        height: size.height,
        color: "#cfe9ec",
        surface: "normal",
      });
    case "floor.void-base":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        color: "#294762",
        surface: "normal",
      });
    case "shape.block":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        color: "#72859a",
        surface: "normal",
      });
    case "shape.column":
      return properties({
        radius: size.width / 2,
        height: size.height,
        color: "#8193a5",
        surface: "normal",
      });
    case "physics.ball":
      return properties({
        diameter: size.width,
        mass: 2,
        friction: 0.7,
        restitution: 0.65,
        color: "#ff9f2f",
      });
    case "physics.cube":
      return properties({
        size: size.width,
        mass: 3,
        friction: 0.85,
        restitution: 0.2,
        color: "#a96cff",
      });
    case "physics.domino":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        mass: 4,
        friction: 0.8,
        restitution: 0.1,
        color: "#f7e44d",
      });
    case "motion.moving-platform":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        offsetX: 0,
        offsetY: 5,
        offsetZ: 0,
        speed: 1.5,
        dwellSeconds: 1,
        color: "#54d6a0",
      });
    case "motion.rotating-bar":
      return properties({
        length: size.width,
        thickness: size.depth,
        height: size.height,
        degreesPerSecond: 90,
        color: "#ff6b62",
      });
    case "motion.door":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        offsetX: 0,
        offsetY: size.height + 0.4,
        offsetZ: 0,
        speed: 2,
        dwellSeconds: 2,
        color: "#35d5df",
      });
    case "interaction.button":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        cooldownSeconds: 0.25,
        enabled: true,
        color: "#ef4f5a",
      });
    case "interaction.pressure-plate":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        cooldownSeconds: 0.1,
        enabled: true,
        color: "#ffd166",
      });
    case "interaction.trigger-zone":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        cooldownSeconds: 0.1,
        enabled: true,
        color: "#4ee38a",
      });
    case "interaction.timer":
      return properties({
        markerSize: size.width,
        durationSeconds: 3,
        repeat: false,
        startsOn: true,
        enabled: true,
        color: "#54b7ff",
      });
    case "interaction.counter":
      return properties({
        markerSize: size.width,
        threshold: 3,
        enabled: true,
        color: "#bd67ff",
      });
    case "travel.boost-pad":
    case "travel.launch-pad":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        boostSpeed: assetId === "travel.launch-pad" ? 8 : 6,
        liftSpeed: assetId === "travel.launch-pad" ? 7 : 0,
        cooldownSeconds: 0.35,
        color: assetId === "travel.launch-pad" ? "#ff9f2f" : "#ef4f5a",
      });
    case "travel.bounce-pad":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        bounceSpeed: 9,
        cooldownSeconds: 0.5,
        color: "#a96cff",
      });
    case "travel.slow-zone":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        speedMultiplier: 0.4,
        cooldownSeconds: 0.25,
        color: "#2b91a8",
      });
    case "travel.direction-arrow":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        glow: 0.5,
        color: "#f7e44d",
      });
    case "travel.portal":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        peerPortalEntityId: null,
        color: "#337dff",
      });
    case "decoration.arrow-sign":
      return properties({
        width: size.width,
        boardHeight: secondarySize,
        thickness: size.depth,
        postHeight: 2.5,
        solid: false,
        glow: 0.2,
        color: "#35d5df",
      });
    case "decoration.point-light":
      return properties({
        height: size.height,
        bulbSize: size.width,
        intensity: 4,
        range: 14,
        enabled: true,
        color: "#ffd166",
      });
    case "decoration.color-strip":
      return properties({
        length: size.width,
        width: size.depth,
        height: size.height,
        glow: 0.8,
        enabled: true,
        color: "#35d5df",
      });
    case "decoration.sculpture":
      return properties({
        radius: size.width / 2,
        height: size.height,
        sides: 5,
        color: "#ff7fb3",
        surface: "normal",
      });
    case "decoration.effect-emitter":
      return properties({
        markerSize: size.width,
        preset: "sparks",
        burstCount: 12,
        startsOn: false,
        enabled: true,
        color: "#ff9f2f",
      });
    case "track.modular-straight":
      return properties({
        length: size.depth,
        width: size.width,
        height: size.height,
        color: "#344b61",
        surface: "normal",
      });
    case "track.modular-corner":
      return properties({
        radius: primarySize,
        width: Math.min(secondarySize, primarySize * 1.8),
        height: size.height,
        color: "#344b61",
        surface: "normal",
      });
    case "track.bridge":
      return properties({
        length: size.depth,
        width: size.width,
        height: size.height,
        color: "#506a80",
        surface: "normal",
      });
    case "track.guard-rail":
      return properties({
        length: size.width,
        thickness: size.depth,
        height: size.height,
        color: "#35d5df",
        surface: "normal",
      });
    case "track.overpass-support":
      return properties({
        width: size.width,
        depth: size.depth,
        height: size.height,
        color: "#71859a",
        surface: "normal",
      });
    case "track.tunnel":
      return properties({
        length: size.depth,
        clearWidth: secondarySize,
        clearHeight: 4.5,
        wallThickness: 0.45,
        roofThickness: 0.45,
        color: "#526d82",
        surface: "normal",
      });
    case "track.barrier":
      return properties({
        length: size.width,
        thickness: size.depth,
        height: size.height,
        color: "#28cddd",
        surface: "normal",
      });
    case "track.ramp":
    case "track.jump":
      return properties({
        length: size.depth,
        width: size.width,
        height: size.height,
        color: assetId === "track.jump" ? "#ff9f2f" : "#657a8f",
        surface: "normal",
      });
    case "race.start-grid":
      return properties({ capacity: 10, columns: 2, spacing: primarySize });
    case "race.player-spawn":
      return properties({ slot: 1, markerSize: primarySize, color: "#31d867" });
    case "race.recovery-pose":
      return properties({ markerSize: primarySize, color: "#4ee38a" });
    case "race.checkpoint":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        order: 1,
        color: "#34d9e5",
      });
    case "race.finish-gate":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        rule: "any",
        color: "#ff9f2f",
      });
    case "race.shortcut-marker":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        color: "#bd67ff",
      });
    case "race.recovery-volume":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        delaySeconds: 0.75,
        safePoseEntityId: null,
        color: "#4ee38a",
      });
    case "race.out-of-bounds-volume":
      return properties({
        width: size.width,
        height: size.height,
        depth: size.depth,
        color: "#ff5b63",
      });
  }
}

export function editorAssetEntityDimensions(entity: MapEntity): EditorAssetDimensions | null {
  switch (entity.assetId) {
    case "floor.rectangle": {
      const height = numberProperty(entity, "height", 0.5);
      return dimensions(
        numberProperty(entity, "width", 6),
        height,
        numberProperty(entity, "depth", 6),
        -height / 2,
      );
    }
    case "floor.circle":
    case "floor.polygon": {
      const radius = numberProperty(entity, "radius", 4);
      const height = numberProperty(entity, "height", 0.5);
      return dimensions(radius * 2, height, radius * 2, -height / 2);
    }
    case "floor.rounded": {
      const height = numberProperty(entity, "height", 0.5);
      return dimensions(
        numberProperty(entity, "width", 8),
        height,
        numberProperty(entity, "depth", 6),
        -height / 2,
      );
    }
    case "floor.freeform": {
      const outline = freeformFloorOutline(entity);
      const bounds = outlineBounds(outline);
      const height = numberProperty(entity, "height", 0.5);
      return dimensions(bounds.width, height, bounds.depth, -height / 2);
    }
    case "floor.void-base": {
      const height = numberProperty(entity, "height", 1);
      return dimensions(
        numberProperty(entity, "width", 16),
        height,
        numberProperty(entity, "depth", 16),
        -height / 2,
      );
    }
    case "shape.block": {
      const height = numberProperty(entity, "height", 4);
      return dimensions(
        numberProperty(entity, "width", 4),
        height,
        numberProperty(entity, "depth", 4),
        height / 2,
      );
    }
    case "shape.column": {
      const radius = numberProperty(entity, "radius", 1.5);
      const height = numberProperty(entity, "height", 6);
      return dimensions(radius * 2, height, radius * 2, height / 2);
    }
    case "physics.ball": {
      const diameter = numberProperty(entity, "diameter", 2);
      return dimensions(diameter, diameter, diameter, diameter / 2);
    }
    case "physics.cube": {
      const size = numberProperty(entity, "size", 2);
      return dimensions(size, size, size, size / 2);
    }
    case "physics.domino": {
      const height = numberProperty(entity, "height", 4);
      return dimensions(
        numberProperty(entity, "width", 2),
        height,
        numberProperty(entity, "depth", 0.8),
        height / 2,
      );
    }
    case "motion.moving-platform": {
      const height = numberProperty(entity, "height", 0.3);
      return dimensions(
        numberProperty(entity, "width", 4),
        height,
        numberProperty(entity, "depth", 4),
        height / 2,
      );
    }
    case "motion.rotating-bar": {
      const height = numberProperty(entity, "height", 0.6);
      return dimensions(
        numberProperty(entity, "length", 8),
        height,
        numberProperty(entity, "thickness", 0.8),
        height / 2,
      );
    }
    case "motion.door": {
      const height = numberProperty(entity, "height", 4);
      return dimensions(
        numberProperty(entity, "width", 5),
        height,
        numberProperty(entity, "depth", 0.5),
        height / 2,
      );
    }
    case "interaction.button":
    case "interaction.pressure-plate": {
      const button = entity.assetId === "interaction.button";
      const height = numberProperty(entity, "height", button ? 0.3 : 0.14);
      return dimensions(
        numberProperty(entity, "width", button ? 2 : 3),
        height,
        numberProperty(entity, "depth", button ? 2 : 3),
        height / 2,
      );
    }
    case "interaction.trigger-zone": {
      const height = numberProperty(entity, "height", 3);
      return dimensions(
        numberProperty(entity, "width", 5),
        height,
        numberProperty(entity, "depth", 5),
        height / 2,
      );
    }
    case "interaction.timer":
    case "interaction.counter":
    case "decoration.effect-emitter": {
      const markerSize = numberProperty(
        entity,
        "markerSize",
        entity.assetId === "decoration.effect-emitter" ? 3 : 2,
      );
      return dimensions(markerSize, markerSize, markerSize, markerSize / 2);
    }
    case "travel.boost-pad":
    case "travel.launch-pad": {
      const height = numberProperty(entity, "height", 0.16);
      return dimensions(
        numberProperty(entity, "width", entity.assetId === "travel.launch-pad" ? 3 : 2.5),
        height,
        numberProperty(entity, "depth", entity.assetId === "travel.launch-pad" ? 3.5 : 3),
        height / 2,
      );
    }
    case "travel.bounce-pad":
    case "travel.slow-zone": {
      const height = numberProperty(entity, "height", 0.16);
      const slow = entity.assetId === "travel.slow-zone";
      return dimensions(
        numberProperty(entity, "width", slow ? 4 : 3),
        height,
        numberProperty(entity, "depth", slow ? 5 : 3),
        height / 2,
      );
    }
    case "travel.direction-arrow": {
      const height = numberProperty(entity, "height", 0.06);
      return dimensions(
        numberProperty(entity, "width", 2.5),
        height,
        numberProperty(entity, "depth", 4),
        height / 2,
      );
    }
    case "travel.portal": {
      const height = numberProperty(entity, "height", 4);
      return dimensions(
        numberProperty(entity, "width", 3),
        height,
        numberProperty(entity, "depth", 0.35),
        height / 2,
      );
    }
    case "decoration.arrow-sign": {
      const boardHeight = numberProperty(entity, "boardHeight", 2);
      const postHeight = numberProperty(entity, "postHeight", 2.5);
      return dimensions(
        numberProperty(entity, "width", 3),
        boardHeight + postHeight,
        numberProperty(entity, "thickness", 0.25),
        (boardHeight + postHeight) / 2,
      );
    }
    case "decoration.point-light": {
      const height = numberProperty(entity, "height", 3);
      const bulbSize = numberProperty(entity, "bulbSize", 0.6);
      return dimensions(bulbSize, height, bulbSize, height / 2);
    }
    case "decoration.color-strip": {
      const height = numberProperty(entity, "height", 0.08);
      return dimensions(
        numberProperty(entity, "length", 8),
        height,
        numberProperty(entity, "width", 0.5),
        height / 2,
      );
    }
    case "decoration.sculpture": {
      const radius = numberProperty(entity, "radius", 1.5);
      const height = numberProperty(entity, "height", 5);
      return dimensions(radius * 2, height, radius * 2, height / 2);
    }
    case "track.modular-straight": {
      const height = numberProperty(entity, "height", 0.35);
      return dimensions(
        numberProperty(entity, "width", 5),
        height,
        numberProperty(entity, "length", 8),
        -height / 2,
      );
    }
    case "track.modular-corner": {
      const radius = numberProperty(entity, "radius", 8);
      const width = numberProperty(entity, "width", 5);
      const height = numberProperty(entity, "height", 0.35);
      const outerRadius = radius + width / 2;
      return dimensions(outerRadius, height, outerRadius, -height / 2);
    }
    case "track.bridge": {
      const height = numberProperty(entity, "height", 0.6);
      return dimensions(
        numberProperty(entity, "width", 5),
        height,
        numberProperty(entity, "length", 12),
        -height / 2,
      );
    }
    case "track.guard-rail": {
      const height = numberProperty(entity, "height", 1);
      return dimensions(
        numberProperty(entity, "length", 8),
        height,
        numberProperty(entity, "thickness", 0.22),
        height / 2,
      );
    }
    case "track.overpass-support": {
      const height = numberProperty(entity, "height", 6);
      return dimensions(
        numberProperty(entity, "width", 3),
        height,
        numberProperty(entity, "depth", 1.5),
        height / 2,
      );
    }
    case "track.tunnel": {
      const clearWidth = numberProperty(entity, "clearWidth", 6);
      const clearHeight = numberProperty(entity, "clearHeight", 4.5);
      const wallThickness = numberProperty(entity, "wallThickness", 0.45);
      const roofThickness = numberProperty(entity, "roofThickness", 0.45);
      const totalHeight = clearHeight + roofThickness;
      return dimensions(
        clearWidth + wallThickness * 2,
        totalHeight,
        numberProperty(entity, "length", 12),
        totalHeight / 2,
      );
    }
    case "track.barrier": {
      const height = numberProperty(entity, "height", 1.2);
      return dimensions(
        numberProperty(entity, "length", 6),
        height,
        numberProperty(entity, "thickness", 0.45),
        height / 2,
      );
    }
    case "track.ramp":
    case "track.jump": {
      const height = numberProperty(entity, "height", entity.assetId === "track.jump" ? 2.5 : 3.2);
      return dimensions(
        numberProperty(entity, "width", 5),
        height,
        numberProperty(entity, "length", entity.assetId === "track.jump" ? 5 : 8),
        height / 2,
      );
    }
    case "race.start-grid": {
      const spacing = numberProperty(entity, "spacing", 2.5);
      return dimensions(spacing * 2.2, 0.12, spacing * 1.6, 0.5);
    }
    case "race.player-spawn":
    case "race.recovery-pose": {
      const markerSize = numberProperty(entity, "markerSize", 2);
      return dimensions(markerSize, 0.12, markerSize, 0.06);
    }
    case "race.checkpoint":
    case "race.finish-gate":
    case "race.shortcut-marker": {
      const height = numberProperty(entity, "height", 4);
      return dimensions(
        numberProperty(entity, "width", 7),
        height,
        numberProperty(entity, "depth", 1),
        height / 2,
      );
    }
    case "race.recovery-volume":
    case "race.out-of-bounds-volume": {
      const recovery = entity.assetId === "race.recovery-volume";
      const height = numberProperty(entity, "height", recovery ? 3 : 4);
      return dimensions(
        numberProperty(entity, "width", recovery ? 8 : 12),
        height,
        numberProperty(entity, "depth", recovery ? 8 : 12),
        height / 2,
      );
    }
    default:
      return null;
  }
}

export function editorAssetPrimarySize(entity: MapEntity): number {
  switch (entity.assetId) {
    case "floor.rectangle":
    case "floor.rounded":
    case "shape.block":
      return numberProperty(entity, "width", 1);
    case "floor.circle":
    case "floor.polygon":
      return numberProperty(entity, "radius", 0.5) * 2;
    case "floor.freeform":
      return outlineBounds(freeformFloorOutline(entity)).width;
    case "floor.void-base":
      return numberProperty(entity, "width", 2);
    case "shape.column":
      return numberProperty(entity, "radius", 0.5) * 2;
    case "physics.ball":
      return numberProperty(entity, "diameter", 0.5);
    case "physics.cube":
      return numberProperty(entity, "size", 0.5);
    case "physics.domino":
      return numberProperty(entity, "height", 1);
    case "motion.moving-platform":
      return numberProperty(entity, "width", 1);
    case "motion.rotating-bar":
      return numberProperty(entity, "length", 2);
    case "motion.door":
      return numberProperty(entity, "height", 1);
    case "interaction.button":
    case "interaction.pressure-plate":
    case "interaction.trigger-zone":
      return numberProperty(entity, "width", 1);
    case "interaction.timer":
    case "interaction.counter":
    case "decoration.effect-emitter":
      return numberProperty(entity, "markerSize", 1);
    case "travel.boost-pad":
    case "travel.launch-pad":
    case "travel.bounce-pad":
    case "travel.slow-zone":
    case "travel.direction-arrow":
    case "travel.portal":
    case "decoration.arrow-sign":
      return numberProperty(entity, "width", 1);
    case "decoration.point-light":
      return numberProperty(entity, "height", 1);
    case "decoration.color-strip":
      return numberProperty(entity, "length", 1);
    case "decoration.sculpture":
      return numberProperty(entity, "radius", 0.5) * 2;
    case "track.modular-straight":
    case "track.bridge":
    case "track.guard-rail":
      return numberProperty(entity, "length", 1);
    case "track.modular-corner":
      return numberProperty(entity, "radius", 3);
    case "track.overpass-support":
      return numberProperty(entity, "height", 2);
    case "track.tunnel":
      return numberProperty(entity, "length", 4);
    case "track.barrier":
    case "track.ramp":
    case "track.jump":
      return numberProperty(entity, "length", 1);
    case "race.start-grid":
      return numberProperty(entity, "spacing", 2.5);
    case "race.player-spawn":
    case "race.recovery-pose":
      return numberProperty(entity, "markerSize", 0.75);
    case "race.checkpoint":
    case "race.finish-gate":
    case "race.shortcut-marker":
    case "race.recovery-volume":
    case "race.out-of-bounds-volume":
      return numberProperty(entity, "width", 2);
    default:
      return 1;
  }
}

export function resizedEditorAssetProperties(
  entity: MapEntity,
  requestedPrimarySize: number,
): Readonly<Record<string, JsonValue>> {
  const manifest = editorAssetManifest(entity.assetId);
  if (manifest === null) {
    return entity.properties;
  }
  const size = clamp(
    requestedPrimarySize,
    manifest.minimumPrimarySize,
    manifest.maximumPrimarySize,
  );
  const previous = Math.max(0.001, editorAssetPrimarySize(entity));
  const scale = size / previous;
  switch (manifest.id) {
    case "floor.rectangle":
      return properties({
        ...entity.properties,
        width: size,
        depth: clamp(numberProperty(entity, "depth", previous) * scale, 1, 100),
      });
    case "floor.circle":
    case "floor.polygon":
      return properties({ ...entity.properties, radius: size / 2 });
    case "floor.rounded": {
      const depth = clamp(numberProperty(entity, "depth", previous) * scale, 1, 100);
      return properties({
        ...entity.properties,
        width: size,
        depth,
        cornerRadius: clamp(
          numberProperty(entity, "cornerRadius", 1.5) * scale,
          0.1,
          Math.min(size, depth) / 2,
        ),
      });
    }
    case "floor.freeform":
      return properties({
        ...entity.properties,
        outline: freeformFloorOutline(entity).map(([x, z]) =>
          Object.freeze([x * scale, z * scale]),
        ),
      });
    case "floor.void-base":
      return properties({
        ...entity.properties,
        width: size,
        depth: clamp(numberProperty(entity, "depth", previous) * scale, 2, 200),
      });
    case "shape.block":
      return properties({
        ...entity.properties,
        width: size,
        depth: clamp(numberProperty(entity, "depth", previous) * scale, 1, 40),
        height: clamp(numberProperty(entity, "height", previous) * scale, 1, 40),
      });
    case "shape.column":
      return properties({
        ...entity.properties,
        radius: size / 2,
        height: clamp(numberProperty(entity, "height", previous * 2) * scale, 1, 60),
      });
    case "physics.ball":
      return properties({ ...entity.properties, diameter: size });
    case "physics.cube":
      return properties({ ...entity.properties, size });
    case "physics.domino":
      return properties({
        ...entity.properties,
        height: size,
        width: clamp(numberProperty(entity, "width", 2) * scale, 0.5, 12),
        depth: clamp(numberProperty(entity, "depth", 0.8) * scale, 0.2, 5),
      });
    case "motion.moving-platform":
      return properties({
        ...entity.properties,
        width: size,
        depth: clamp(numberProperty(entity, "depth", previous) * scale, 1, 20),
      });
    case "motion.rotating-bar":
      return properties({ ...entity.properties, length: size });
    case "motion.door":
      return properties({
        ...entity.properties,
        height: size,
        width: clamp(numberProperty(entity, "width", 5) * scale, 1, 24),
        offsetY: clamp(numberProperty(entity, "offsetY", previous + 0.4) * scale, 0, 40),
      });
    case "interaction.button":
    case "interaction.pressure-plate":
    case "interaction.trigger-zone":
      return properties({
        ...entity.properties,
        width: size,
        depth: clamp(numberProperty(entity, "depth", previous) * scale, 1, 30),
      });
    case "interaction.timer":
    case "interaction.counter":
    case "decoration.effect-emitter":
      return properties({ ...entity.properties, markerSize: size });
    case "travel.boost-pad":
    case "travel.launch-pad":
    case "travel.bounce-pad":
    case "travel.slow-zone":
    case "travel.direction-arrow":
      return properties({
        ...entity.properties,
        width: size,
        depth: clamp(numberProperty(entity, "depth", previous) * scale, 1, 16),
      });
    case "decoration.arrow-sign":
      return properties({
        ...entity.properties,
        width: size,
        boardHeight: clamp(numberProperty(entity, "boardHeight", 2) * scale, 0.75, 8),
      });
    case "decoration.point-light":
      return properties({ ...entity.properties, height: size });
    case "decoration.color-strip":
      return properties({ ...entity.properties, length: size });
    case "decoration.sculpture":
      return properties({
        ...entity.properties,
        radius: size / 2,
        height: clamp(numberProperty(entity, "height", 5) * scale, 0.75, 30),
      });
    case "travel.portal":
      return properties({
        ...entity.properties,
        width: size,
        height: clamp(numberProperty(entity, "height", 4) * scale, 2, 16),
      });
    case "track.modular-straight":
    case "track.bridge":
    case "track.guard-rail":
      return properties({ ...entity.properties, length: size });
    case "track.modular-corner":
      return properties({
        ...entity.properties,
        radius: size,
        width: clamp(numberProperty(entity, "width", 5) * scale, 1, size * 1.8),
      });
    case "track.overpass-support":
      return properties({ ...entity.properties, height: size });
    case "track.tunnel":
      return properties({ ...entity.properties, length: size });
    case "track.barrier":
    case "track.ramp":
    case "track.jump":
      return properties({ ...entity.properties, length: size });
    case "race.start-grid":
      return properties({ ...entity.properties, spacing: size });
    case "race.player-spawn":
    case "race.recovery-pose":
      return properties({ ...entity.properties, markerSize: size });
    case "race.checkpoint":
    case "race.finish-gate":
    case "race.shortcut-marker":
      return properties({ ...entity.properties, width: size });
    case "race.recovery-volume":
    case "race.out-of-bounds-volume":
      return properties({
        ...entity.properties,
        width: size,
        depth: clamp(numberProperty(entity, "depth", previous) * scale, 2, 100),
      });
  }
}

function manifest(
  entry: Omit<EditorAssetManifest, "linkEvents" | "linkActions" | "resetBehavior"> &
    Partial<Pick<EditorAssetManifest, "linkEvents" | "linkActions" | "resetBehavior">>,
): EditorAssetManifest {
  return Object.freeze({
    ...entry,
    searchTerms: Object.freeze([...entry.searchTerms]),
    linkEvents: Object.freeze([...(entry.linkEvents ?? [])]),
    linkActions: Object.freeze([
      ...(entry.linkActions ?? ["show", "hide", "enable", "disable", "reset"]),
    ]),
    resetBehavior:
      entry.resetBehavior ?? "Restore authored transform, visibility, and enabled state.",
  });
}

function dimensions(
  width: number,
  height: number,
  depth: number,
  groundOffset: number,
): EditorAssetDimensions {
  return Object.freeze({ width, height, depth, groundOffset });
}

function properties(
  value: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  return Object.freeze(value);
}

function numberProperty(entity: MapEntity, key: string, fallback: number): number {
  const value = entity.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function extrudedPrism(outline: readonly [number, number][], height: number): PrismMeshData {
  const halfHeight = height / 2;
  const vertices: number[] = [];
  for (const [x, z] of outline) {
    vertices.push(x, -halfHeight, z, x, halfHeight, z);
  }
  const bottomCenter = outline.length * 2;
  const topCenter = bottomCenter + 1;
  vertices.push(0, -halfHeight, 0, 0, halfHeight, 0);
  const indices: number[] = [];
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    const bottom = index * 2;
    const top = bottom + 1;
    const nextBottom = next * 2;
    const nextTop = nextBottom + 1;
    indices.push(
      bottomCenter,
      bottom,
      nextBottom,
      topCenter,
      nextTop,
      top,
      bottom,
      top,
      nextBottom,
      top,
      nextTop,
      nextBottom,
    );
  }
  return Object.freeze({
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  });
}

function outlineBounds(outline: readonly FloorOutlinePoint[]): { width: number; depth: number } {
  const xs = outline.map((point) => point[0]);
  const zs = outline.map((point) => point[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  };
}

function signedOutlineArea(outline: readonly FloorOutlinePoint[]): number {
  let area = 0;
  for (let index = 0; index < outline.length; index += 1) {
    const [x, z] = outline[index]!;
    const [nextX, nextZ] = outline[(index + 1) % outline.length]!;
    area += x * nextZ - nextX * z;
  }
  return area / 2;
}

function segmentsIntersect(
  firstStart: FloorOutlinePoint,
  firstEnd: FloorOutlinePoint,
  secondStart: FloorOutlinePoint,
  secondEnd: FloorOutlinePoint,
): boolean {
  const orientation = (a: FloorOutlinePoint, b: FloorOutlinePoint, c: FloorOutlinePoint) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const a = orientation(firstStart, firstEnd, secondStart);
  const b = orientation(firstStart, firstEnd, secondEnd);
  const c = orientation(secondStart, secondEnd, firstStart);
  const d = orientation(secondStart, secondEnd, firstEnd);
  const epsilon = 1e-8;
  if (
    ((a > epsilon && b < -epsilon) || (a < -epsilon && b > epsilon)) &&
    ((c > epsilon && d < -epsilon) || (c < -epsilon && d > epsilon))
  ) {
    return true;
  }
  const liesOnSegment = (
    point: FloorOutlinePoint,
    start: FloorOutlinePoint,
    end: FloorOutlinePoint,
  ) =>
    point[0] >= Math.min(start[0], end[0]) - epsilon &&
    point[0] <= Math.max(start[0], end[0]) + epsilon &&
    point[1] >= Math.min(start[1], end[1]) - epsilon &&
    point[1] <= Math.max(start[1], end[1]) + epsilon;
  return (
    (Math.abs(a) <= epsilon && liesOnSegment(secondStart, firstStart, firstEnd)) ||
    (Math.abs(b) <= epsilon && liesOnSegment(secondEnd, firstStart, firstEnd)) ||
    (Math.abs(c) <= epsilon && liesOnSegment(firstStart, secondStart, secondEnd)) ||
    (Math.abs(d) <= epsilon && liesOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function triangulateSimpleOutline(
  outline: readonly FloorOutlinePoint[],
): readonly (readonly [number, number, number])[] {
  const remaining = outline.map((_, index) => index);
  const triangles: Array<readonly [number, number, number]> = [];
  const cross = (a: FloorOutlinePoint, b: FloorOutlinePoint, c: FloorOutlinePoint) =>
    (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  const inside = (
    point: FloorOutlinePoint,
    a: FloorOutlinePoint,
    b: FloorOutlinePoint,
    c: FloorOutlinePoint,
  ) => {
    const ab = cross(a, b, point);
    const bc = cross(b, c, point);
    const ca = cross(c, a, point);
    return ab >= -1e-8 && bc >= -1e-8 && ca >= -1e-8;
  };
  let guard = outline.length * outline.length;
  while (remaining.length > 3 && guard > 0) {
    guard -= 1;
    let clipped = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const previous = remaining[(index - 1 + remaining.length) % remaining.length]!;
      const current = remaining[index]!;
      const next = remaining[(index + 1) % remaining.length]!;
      if (cross(outline[previous]!, outline[current]!, outline[next]!) <= 1e-8) {
        continue;
      }
      if (
        remaining.some(
          (candidate) =>
            candidate !== previous &&
            candidate !== current &&
            candidate !== next &&
            inside(outline[candidate]!, outline[previous]!, outline[current]!, outline[next]!),
        )
      ) {
        continue;
      }
      triangles.push([previous, current, next]);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      throw new Error("Freeform floor outline could not be triangulated.");
    }
  }
  if (remaining.length === 3) {
    triangles.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  }
  return triangles;
}
