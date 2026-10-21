import type {
  TrackDefinition,
  TrackRoadRange,
  TrackSurface,
  TrackWallRange,
  Vector3Tuple,
} from "../maps/MapDocument";
import { defaultTrackSurfaceCooldownSeconds } from "../maps/MapDocument";

export interface RuntimeTrackSection {
  readonly center: Vector3Tuple;
  readonly left: Vector3Tuple;
  readonly right: Vector3Tuple;
  readonly distance: number;
  readonly materialId: string;
  readonly surface: TrackSurface;
  readonly surfaceStrength: number;
  readonly surfaceCooldownSeconds: number;
}

export interface RuntimeTrackChunk {
  readonly startDistance: number;
  readonly endDistance: number;
  readonly materialId: string;
  readonly surface: TrackSurface;
  readonly surfaceStrength: number;
  readonly surfaceCooldownSeconds: number;
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

export interface RuntimeWallChunk {
  readonly side: "left" | "right";
  readonly styleId: string;
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly collisionIndices: Uint32Array;
}

export interface RuntimeTrackBuild {
  readonly sections: readonly RuntimeTrackSection[];
  readonly roadChunks: readonly RuntimeTrackChunk[];
  readonly wallChunks: readonly RuntimeWallChunk[];
  readonly length: number;
}

const ROAD_THICKNESS = 0.22;
const WALL_BASE_OVERLAP = 0.1;

export function buildRuntimeTrack(
  track: TrackDefinition,
  maximumChunkSegments = 16,
  externalRoadSections: readonly RuntimeTrackSection[] = [],
): RuntimeTrackBuild {
  const segmentCount = track.closed ? track.nodes.length : track.nodes.length - 1;
  if (segmentCount <= 0) {
    return Object.freeze({ sections: [], roadChunks: [], wallChunks: [], length: 0 });
  }
  const divisionsPerSegment = 12;
  const sampled: Array<{
    point: Vector3Tuple;
    segmentIndex: number;
    localT: number;
  }> = [];
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    for (let step = 0; step < divisionsPerSegment; step += 1) {
      sampled.push({
        point: sampleTrackSegment(track, segmentIndex, step / divisionsPerSegment),
        segmentIndex,
        localT: step / divisionsPerSegment,
      });
    }
  }
  sampled.push({
    point: sampleTrackSegment(track, segmentCount - 1, 1),
    segmentIndex: segmentCount - 1,
    localT: 1,
  });

  const renderedDistances = [0];
  for (let index = 1; index < sampled.length; index += 1) {
    renderedDistances.push(
      (renderedDistances[index - 1] ?? 0) +
        distance(sampled[index - 1]!.point, sampled[index]!.point),
    );
  }
  const renderedLength = Math.max(0.001, renderedDistances.at(-1) ?? 0);
  const authoredLength = Math.max(0.001, authoredTrackLength(track));
  const sections = sampled.map<RuntimeTrackSection>((sample, index) => {
    const first = track.nodes[sample.segmentIndex]!;
    const second = track.nodes[(sample.segmentIndex + 1) % track.nodes.length]!;
    const baseWidth = lerp(first.width, second.width, sample.localT);
    const baseBank = lerp(first.bankRadians, second.bankRadians, sample.localT);
    const renderedDistance = renderedDistances[index] ?? 0;
    const authoredDistance = (renderedDistance / renderedLength) * authoredLength;
    const range = roadRangeAt(track.roadRanges ?? [], authoredDistance);
    const influence = roadRangeInfluence(range, authoredDistance);
    const width = range === undefined ? baseWidth : lerp(baseWidth, range.width, influence);
    const bank = range === undefined ? baseBank : lerp(baseBank, range.bankRadians, influence);
    const previous = sampled[Math.max(0, index - 1)]?.point ?? sample.point;
    const next = sampled[Math.min(sampled.length - 1, index + 1)]?.point ?? sample.point;
    const tangent = normalize(subtract(next, previous), [0, 0, 1]);
    const flatLateral = normalize(cross([0, 1, 0], tangent), [1, 0, 0]);
    const lateral = rotateAroundAxis(flatLateral, tangent, bank);
    const half = scale(lateral, width / 2);
    const raisedCenter = add(sample.point, [0, Math.abs(half[1]) + 0.14, 0]);
    return Object.freeze({
      center: raisedCenter,
      left: subtract(raisedCenter, half),
      right: add(raisedCenter, half),
      distance: renderedDistance,
      materialId: range?.materialId ?? track.materialId,
      surface: range?.surface ?? track.surface,
      surfaceStrength: range?.surfaceStrength ?? 1,
      surfaceCooldownSeconds:
        range?.surfaceCooldownSeconds ??
        defaultTrackSurfaceCooldownSeconds(range?.surface ?? track.surface),
    });
  });

  const roadChunks: RuntimeTrackChunk[] = [];
  let chunkStart = 0;
  while (chunkStart < sections.length - 1) {
    const first = sections[chunkStart]!;
    let chunkEnd = chunkStart + 1;
    while (
      chunkEnd < sections.length - 1 &&
      chunkEnd - chunkStart < Math.max(1, maximumChunkSegments) &&
      sections[chunkEnd]!.materialId === first.materialId &&
      sections[chunkEnd]!.surface === first.surface &&
      sections[chunkEnd]!.surfaceStrength === first.surfaceStrength &&
      sections[chunkEnd]!.surfaceCooldownSeconds === first.surfaceCooldownSeconds
    ) {
      chunkEnd += 1;
    }
    roadChunks.push(buildRoadChunk(sections.slice(chunkStart, chunkEnd + 1), first));
    chunkStart = chunkEnd;
  }

  const distanceScale = renderedLength / authoredLength;
  const wallChunks = track.walls.flatMap((wall) =>
    buildWallChunks(sections, wall, distanceScale, track.closed, externalRoadSections),
  );
  return Object.freeze({
    sections: Object.freeze(sections),
    roadChunks: Object.freeze(roadChunks),
    wallChunks: Object.freeze(wallChunks),
    length: renderedLength,
  });
}

export function authoredTrackLength(track: TrackDefinition): number {
  let total = 0;
  const segmentCount = track.closed ? track.nodes.length : track.nodes.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const first = track.nodes[index];
    const second = track.nodes[(index + 1) % track.nodes.length];
    if (first !== undefined && second !== undefined) {
      total += distance(first.position, second.position);
    }
  }
  return total;
}

function buildRoadChunk(
  sections: readonly RuntimeTrackSection[],
  style: RuntimeTrackSection,
): RuntimeTrackChunk {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const section of sections) {
    vertices.push(
      ...section.left,
      ...section.right,
      section.left[0],
      section.left[1] - ROAD_THICKNESS,
      section.left[2],
      section.right[0],
      section.right[1] - ROAD_THICKNESS,
      section.right[2],
    );
  }
  for (let index = 0; index < sections.length - 1; index += 1) {
    const base = index * 4;
    const next = base + 4;
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
  }
  return Object.freeze({
    startDistance: sections[0]?.distance ?? 0,
    endDistance: sections.at(-1)?.distance ?? 0,
    materialId: style.materialId,
    surface: style.surface,
    surfaceStrength: style.surfaceStrength,
    surfaceCooldownSeconds: style.surfaceCooldownSeconds,
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  });
}

function buildWallChunks(
  sections: readonly RuntimeTrackSection[],
  wall: TrackWallRange,
  distanceScale: number,
  closed: boolean,
  externalRoadSections: readonly RuntimeTrackSection[],
): readonly RuntimeWallChunk[] {
  const start = wall.startDistance * distanceScale;
  const end = wall.endDistance * distanceScale;
  const closesLoop = closed && start <= 0.25 && end >= (sections.at(-1)?.distance ?? 0) - 0.5;
  let included = sections.filter(
    (section) => section.distance >= start - 0.25 && section.distance <= end + 0.25,
  );
  if (closesLoop) {
    included = [...sections];
    const first = included[0];
    const last = included.at(-1);
    if (first !== undefined && last !== undefined && distance(first.center, last.center) < 0.01) {
      included.pop();
    }
  }
  if (included.length < 2) {
    return [];
  }
  const vertices: number[] = [];
  const indices: number[] = [];
  const collisionIndices: number[] = [];
  const wallEdges = safeRuntimeWallEdges(included, wall.side, closesLoop);
  const wallVisible = visibleRuntimeWallEdges(
    included,
    wallEdges,
    wall.side,
    closesLoop,
    externalRoadSections,
  );
  for (const [index, section] of included.entries()) {
    const edge = wallEdges[index]!;
    const outward = normalizeHorizontal(subtract(edge, section.center), [1, 0, 0]);
    const outer = add(edge, scale(outward, wall.thickness));
    vertices.push(
      edge[0],
      edge[1] - WALL_BASE_OVERLAP,
      edge[2],
      edge[0],
      edge[1] + wall.height,
      edge[2],
      outer[0],
      outer[1] - WALL_BASE_OVERLAP,
      outer[2],
      outer[0],
      outer[1] + wall.height,
      outer[2],
    );
  }
  const segmentCount = closesLoop ? included.length : included.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const base = index * 4;
    const nextIndex = (index + 1) % included.length;
    const next = nextIndex * 4;
    if (wallVisible[index] !== true || wallVisible[nextIndex] !== true) {
      continue;
    }
    collisionIndices.push(
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
    indices.push(
      // Continuous road-facing wall.
      base,
      next,
      base + 1,
      base + 1,
      next,
      next + 1,
      // Outside wall.
      base + 2,
      base + 3,
      next + 2,
      base + 3,
      next + 3,
      next + 2,
      // Top and buried bottom close the prism.
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
  if (!closesLoop) {
    const last = (included.length - 1) * 4;
    if (wallVisible[0] === true) {
      indices.push(0, 1, 2, 1, 3, 2);
    }
    if (wallVisible.at(-1) === true) {
      indices.push(last, last + 2, last + 1, last + 1, last + 2, last + 3);
    }
  }
  if (collisionIndices.length === 0) {
    return [];
  }
  return [
    Object.freeze({
      side: wall.side,
      styleId: wall.styleId,
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices),
      collisionIndices: new Uint32Array(collisionIndices),
    }),
  ];
}

function safeRuntimeWallEdges(
  sections: readonly RuntimeTrackSection[],
  side: "left" | "right",
  closed: boolean,
): readonly Vector3Tuple[] {
  const offsets = sections.map((_, index) => safeRuntimeWallOffset(sections, index, side, closed));
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
  return sections.map((section, index) => {
    const authoredEdge = side === "left" ? section.left : section.right;
    const direction = normalize(subtract(authoredEdge, section.center), [1, 0, 0]);
    return add(section.center, scale(direction, offsets[index]!));
  });
}

function safeRuntimeWallOffset(
  sections: readonly RuntimeTrackSection[],
  index: number,
  side: "left" | "right",
  closed: boolean,
): number {
  const current = sections[index]!;
  const requestedOffset = distance(current.left, current.right) / 2;
  if ((!closed && (index === 0 || index === sections.length - 1)) || sections.length < 3) {
    return requestedOffset;
  }
  const previous = sections[(index - 1 + sections.length) % sections.length];
  const next = sections[(index + 1) % sections.length];
  if (previous === undefined || next === undefined) {
    return requestedOffset;
  }
  const incomingVector = subtract(current.center, previous.center);
  const outgoingVector = subtract(next.center, current.center);
  const incomingLength = Math.hypot(...incomingVector);
  const outgoingLength = Math.hypot(...outgoingVector);
  if (incomingLength < 1e-4 || outgoingLength < 1e-4) {
    return requestedOffset;
  }
  const incoming = scale(incomingVector, 1 / incomingLength);
  const outgoing = scale(outgoingVector, 1 / outgoingLength);
  const bendAngle = Math.acos(clamp(dot(incoming, outgoing), -1, 1));
  if (bendAngle < 1e-3) {
    return requestedOffset;
  }
  const turn = incoming[2] * outgoing[0] - incoming[0] * outgoing[2];
  const innerSide = turn > 0 ? "right" : "left";
  if (side !== innerSide) {
    return requestedOffset;
  }
  const bendRadius = ((incomingLength + outgoingLength) * 0.5) / bendAngle;
  return Math.min(requestedOffset, Math.max(0.08, bendRadius * 0.72));
}

function visibleRuntimeWallEdges(
  sections: readonly RuntimeTrackSection[],
  edges: readonly Vector3Tuple[],
  side: "left" | "right",
  closed: boolean,
  externalRoadSections: readonly RuntimeTrackSection[],
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
    const ownWidth = distance(section.left, section.right);
    if (safeRuntimeWallOffset(sections, index, side, closed) < ownWidth * 0.27) {
      return false;
    }
    const coveredByOwnTrack = sections.some((other, otherIndex) => {
      if (otherIndex === index) {
        return false;
      }
      const directDistance = Math.abs(other.distance - section.distance);
      const routeDistance = closed
        ? Math.min(directDistance, Math.max(0, totalDistance - directDistance))
        : directDistance;
      const otherWidth = distance(other.left, other.right);
      if (routeDistance < Math.max(ownWidth, otherWidth) * 1.35) {
        return false;
      }
      if (Math.abs(edge[1] - other.center[1]) > Math.max(0.8, otherWidth * 0.15)) {
        return false;
      }
      const x = edge[0] - other.center[0];
      const z = edge[2] - other.center[2];
      const coveredRadius = otherWidth * 0.46;
      return x * x + z * z < coveredRadius * coveredRadius;
    });
    if (coveredByOwnTrack) {
      return false;
    }
    return !externalRoadSections.some((other) => {
      const otherWidth = distance(other.left, other.right);
      if (Math.abs(edge[1] - other.center[1]) > Math.max(0.8, otherWidth * 0.15)) {
        return false;
      }
      const x = edge[0] - other.center[0];
      const z = edge[2] - other.center[2];
      const coveredRadius = otherWidth * 0.46;
      return x * x + z * z < coveredRadius * coveredRadius;
    });
  });
  for (let pass = 0; pass < 3; pass += 1) {
    const previous = [...visible];
    visible = visible.map((value, index) => {
      if (!value) {
        return false;
      }
      if (!closed && (index === 0 || index === previous.length - 1)) {
        return value;
      }
      const before = previous[(index - 1 + previous.length) % previous.length];
      const after = previous[(index + 1) % previous.length];
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

function sampleTrackSegment(
  track: TrackDefinition,
  segmentIndex: number,
  localT: number,
): Vector3Tuple {
  const first = track.nodes[segmentIndex]!;
  const second = track.nodes[(segmentIndex + 1) % track.nodes.length]!;
  const start = first.position;
  const end = second.position;
  const fallback = scale(subtract(end, start), 1 / 3);
  const outgoing = magnitudeSquared(first.tangentOut) < 1e-8 ? fallback : first.tangentOut;
  const incoming =
    magnitudeSquared(second.tangentIn) < 1e-8 ? scale(fallback, -1) : second.tangentIn;
  const controlA = add(start, outgoing);
  const controlB = add(end, incoming);
  const horizontalSpan = Math.hypot(end[0] - start[0], end[2] - start[2]);
  const heightSpan = Math.abs(end[1] - start[1]);
  const safeOvershoot = Math.min(horizontalSpan * 0.35, Math.max(0.75, heightSpan * 0.25));
  controlA[1] = clamp(
    controlA[1],
    Math.min(start[1], end[1]) - safeOvershoot,
    Math.max(start[1], end[1]) + safeOvershoot,
  );
  controlB[1] = clamp(
    controlB[1],
    Math.min(start[1], end[1]) - safeOvershoot,
    Math.max(start[1], end[1]) + safeOvershoot,
  );
  const inverse = 1 - localT;
  return [
    start[0] * inverse ** 3 +
      3 * controlA[0] * inverse ** 2 * localT +
      3 * controlB[0] * inverse * localT ** 2 +
      end[0] * localT ** 3,
    start[1] * inverse ** 3 +
      3 * controlA[1] * inverse ** 2 * localT +
      3 * controlB[1] * inverse * localT ** 2 +
      end[1] * localT ** 3,
    start[2] * inverse ** 3 +
      3 * controlA[2] * inverse ** 2 * localT +
      3 * controlB[2] * inverse * localT ** 2 +
      end[2] * localT ** 3,
  ];
}

function roadRangeAt(
  ranges: readonly TrackRoadRange[],
  distanceAlongTrack: number,
): TrackRoadRange | undefined {
  return ranges.find(
    (range) => range.startDistance <= distanceAlongTrack && range.endDistance >= distanceAlongTrack,
  );
}

function roadRangeInfluence(range: TrackRoadRange | undefined, value: number): number {
  if (range === undefined) {
    return 0;
  }
  const rangeLength = range.endDistance - range.startDistance;
  const easing = Math.min(2, Math.max(0.25, rangeLength / 3));
  const edge = Math.min(
    clamp((value - range.startDistance) / easing, 0, 1),
    clamp((range.endDistance - value) / easing, 0, 1),
  );
  return edge * edge * (3 - 2 * edge);
}

function rotateAroundAxis(vector: Vector3Tuple, axis: Vector3Tuple, angle: number): Vector3Tuple {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    add(scale(vector, cosine), scale(cross(axis, vector), sine)),
    scale(axis, dot(axis, vector) * (1 - cosine)),
  );
}

function add(left: Vector3Tuple, right: Vector3Tuple): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vector3Tuple, right: Vector3Tuple): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector: Vector3Tuple, scalar: number): [number, number, number] {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function cross(left: Vector3Tuple, right: Vector3Tuple): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot(left: Vector3Tuple, right: Vector3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalize(vector: Vector3Tuple, fallback: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...vector);
  return length < 1e-8 ? fallback : [vector[0] / length, vector[1] / length, vector[2] / length];
}

function normalizeHorizontal(vector: Vector3Tuple, fallback: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(vector[0], vector[2]);
  return length < 1e-8 ? fallback : [vector[0] / length, 0, vector[2] / length];
}

function magnitudeSquared(vector: Vector3Tuple): number {
  return dot(vector, vector);
}

function distance(left: Vector3Tuple, right: Vector3Tuple): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
