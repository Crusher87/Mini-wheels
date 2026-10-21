import { describe, expect, it } from "vitest";
import type { TrackDefinition } from "../../src/maps/MapDocument";
import { buildRuntimeTrack } from "../../src/tracks/TrackRuntimeBuilder";

const track: TrackDefinition = {
  id: "runtime-track",
  closed: false,
  surface: "normal",
  materialId: "track.asphalt",
  nodes: [
    {
      id: "start",
      position: [0, 0, 0],
      tangentIn: [-2, 0, 0],
      tangentOut: [4, 0, 0],
      width: 5,
      bankRadians: 0,
    },
    {
      id: "crest",
      position: [10, 3, 4],
      tangentIn: [-4, -1, -2],
      tangentOut: [4, 1, 2],
      width: 7,
      bankRadians: Math.PI / 8,
    },
    {
      id: "finish",
      position: [22, 5, 0],
      tangentIn: [-4, 0, 2],
      tangentOut: [2, 0, -1],
      width: 6,
      bankRadians: 0,
    },
  ],
  walls: [
    {
      id: "left-wall",
      side: "left",
      startDistance: 0,
      endDistance: 25,
      height: 1.4,
      thickness: 0.2,
      styleId: "wall.neon",
    },
  ],
  roadRanges: [
    {
      id: "ice-range",
      startDistance: 7,
      endDistance: 17,
      width: 8,
      bankRadians: Math.PI / 6,
      surface: "slippery",
      materialId: "track.ice",
      surfaceStrength: 1.5,
      surfaceCooldownSeconds: 0.8,
    },
  ],
};

describe("TrackRuntimeBuilder", () => {
  it("builds finite, bounded, deterministic road and wall collision chunks", () => {
    const first = buildRuntimeTrack(track, 4);
    const second = buildRuntimeTrack(track, 4);

    expect(first.length).toBeGreaterThan(22);
    expect(first.roadChunks.length).toBeGreaterThan(4);
    expect(first.wallChunks).toHaveLength(1);
    expect(first.roadChunks.some((chunk) => chunk.materialId === "track.ice")).toBe(true);
    expect(first.roadChunks.some((chunk) => chunk.surface === "slippery")).toBe(true);
    expect(
      first.roadChunks.some(
        (chunk) => chunk.surfaceStrength === 1.5 && chunk.surfaceCooldownSeconds === 0.8,
      ),
    ).toBe(true);
    expect(first).toEqual(second);

    for (const chunk of [...first.roadChunks, ...first.wallChunks]) {
      expect([...chunk.vertices].every(Number.isFinite)).toBe(true);
      expect([...chunk.indices].every((index) => index < chunk.vertices.length / 3)).toBe(true);
      if ("collisionIndices" in chunk) {
        expect(
          [...chunk.collisionIndices].every((index) => index < chunk.vertices.length / 3),
        ).toBe(true);
      }
    }

    const wall = first.wallChunks[0]!;
    expect(wall.vertices.length % 12).toBe(0);
    for (let offset = 0; offset < wall.vertices.length; offset += 12) {
      const thickness = Math.hypot(
        wall.vertices[offset + 6]! - wall.vertices[offset]!,
        wall.vertices[offset + 8]! - wall.vertices[offset + 2]!,
      );
      expect(thickness).toBeCloseTo(0.2, 4);
      expect(wall.vertices[offset + 1]).toBeCloseTo(wall.vertices[offset + 7]!, 5);
    }
  });

  it("raises a banked road instead of pushing either edge below its authored height", () => {
    const build = buildRuntimeTrack(track);
    const bankedSections = build.sections.filter(
      (section) => section.distance > build.length * 0.35 && section.distance < build.length * 0.65,
    );

    expect(bankedSections.length).toBeGreaterThan(0);
    for (const section of bankedSections) {
      expect(Math.min(section.left[1], section.right[1])).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it("opens wall collision wherever a distant road section crosses the wall", () => {
    const points: readonly (readonly [number, number])[] = [
      [-10, -8],
      [10, 8],
      [-10, 8],
      [10, -8],
    ];
    const crossingTrack: TrackDefinition = {
      id: "crossing-track",
      closed: true,
      surface: "normal",
      materialId: "track.asphalt",
      nodes: points.map(([x, z], index) => ({
        id: `crossing-${String(index)}`,
        position: [x, 0, z],
        tangentIn: [0, 0, 0],
        tangentOut: [0, 0, 0],
        width: 6,
        bankRadians: 0,
      })),
      walls: [
        {
          id: "crossing-left-wall",
          side: "left",
          startDistance: 0,
          endDistance: 100,
          height: 1.5,
          thickness: 0.2,
          styleId: "wall.safety-cyan",
        },
      ],
      roadRanges: [],
    };
    const build = buildRuntimeTrack(crossingTrack);
    const wall = build.wallChunks[0];

    expect(wall).toBeDefined();
    const completeLoopIndexCount = (wall!.vertices.length / 12) * 24;
    expect(wall!.collisionIndices.length).toBeLessThan(completeLoopIndexCount);
    expect(wall!.collisionIndices.length).toBeGreaterThan(0);
  });

  it("opens one track's walls where another same-height road crosses", () => {
    const node = (id: string, x: number, z: number) => ({
      id,
      position: [x, 0, z] as const,
      tangentIn: [0, 0, 0] as const,
      tangentOut: [0, 0, 0] as const,
      width: 6,
      bankRadians: 0,
    });
    const primary: TrackDefinition = {
      id: "primary-road",
      closed: false,
      surface: "normal",
      materialId: "track.asphalt",
      nodes: [node("p0", 0, -30), node("p1", 0, -10), node("p2", 0, 10), node("p3", 0, 30)],
      walls: [
        {
          id: "primary-left-wall",
          side: "left",
          startDistance: 0,
          endDistance: 60,
          height: 1.5,
          thickness: 0.2,
          styleId: "wall.safety-cyan",
        },
      ],
      roadRanges: [],
    };
    const crossing: TrackDefinition = {
      ...primary,
      id: "cross-road",
      nodes: [node("c0", -15, 0), node("c1", 15, 0)],
      walls: [],
    };
    const externalSections = buildRuntimeTrack(crossing).sections;
    const unobstructed = buildRuntimeTrack(primary).wallChunks[0]!;
    const opened = buildRuntimeTrack(primary, 16, externalSections).wallChunks[0]!;

    expect(opened.collisionIndices.length).toBeGreaterThan(0);
    expect(opened.collisionIndices.length).toBeLessThan(unobstructed.collisionIndices.length);
  });

  it("shares exact render and collision vertices across every road chunk seam", () => {
    const build = buildRuntimeTrack(track, 3);

    expect(build.roadChunks.length).toBeGreaterThan(4);
    for (let index = 1; index < build.roadChunks.length; index += 1) {
      const previous = build.roadChunks[index - 1]!;
      const current = build.roadChunks[index]!;
      expect(previous.endDistance).toBe(current.startDistance);
      expect([...previous.vertices.slice(-12)]).toEqual([...current.vertices.slice(0, 12)]);
    }
  });

  it("keeps a long banked and elevated collision track within deterministic chunk budgets", () => {
    const maximumChunkSegments = 8;
    const stressTrack: TrackDefinition = {
      id: "chunk-stress",
      closed: false,
      surface: "normal",
      materialId: "track.checker",
      nodes: Array.from({ length: 100 }, (_, index) => ({
        id: `stress-${String(index)}`,
        position: [
          index * 4,
          Math.max(0, Math.sin(index * 0.22) * 4 + 4),
          Math.sin(index * 0.16) * 18,
        ] as const,
        tangentIn: [-1.3, 0, -0.8] as const,
        tangentOut: [1.3, 0, 0.8] as const,
        width: 5 + (index % 4) * 0.4,
        bankRadians: Math.sin(index * 0.3) * 0.35,
      })),
      walls: [],
      roadRanges: [],
    };
    const startedAt = performance.now();
    const first = buildRuntimeTrack(stressTrack, maximumChunkSegments);
    const elapsedMilliseconds = performance.now() - startedAt;
    const second = buildRuntimeTrack(stressTrack, maximumChunkSegments);

    expect(elapsedMilliseconds).toBeLessThan(1_500);
    expect(first).toEqual(second);
    expect(first.roadChunks.length).toBeGreaterThan(100);
    for (const chunk of first.roadChunks) {
      expect(chunk.vertices.length).toBeLessThanOrEqual((maximumChunkSegments + 1) * 12);
      expect(chunk.indices.length).toBeLessThanOrEqual(maximumChunkSegments * 24);
      expect([...chunk.vertices].every(Number.isFinite)).toBe(true);
    }
    for (let index = 1; index < first.roadChunks.length; index += 1) {
      expect([...first.roadChunks[index - 1]!.vertices.slice(-12)]).toEqual([
        ...first.roadChunks[index]!.vertices.slice(0, 12),
      ]);
    }
  });
});
