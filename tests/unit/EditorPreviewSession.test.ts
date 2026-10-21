import { describe, expect, it } from "vitest";
import { OrthographicCamera, Scene, Vector3 } from "three";
import {
  AuthoredTrackCurve,
  EditorPreviewSession,
  raisedBankedEdges,
} from "../../src/editor/EditorPreviewSession";
import { createStarterMapDocument, type MapDocument } from "../../src/maps/MapDocument";
import type { TrackDefinition } from "../../src/maps/MapDocument";
import { EditorSession } from "../../src/editor/EditorSession";

describe("EditorPreviewSession track geometry", () => {
  it.each([22.5, -22.5, 45, -45])(
    "anchors the lower road edge while raising a %s degree bank",
    (degrees) => {
      const radians = (degrees * Math.PI) / 180;
      const lateral = new Vector3(Math.cos(radians), Math.sin(radians), 0).normalize();
      const edges = raisedBankedEdges(new Vector3(4, 0.14, -2), lateral, 6);

      expect(Math.min(edges.left.y, edges.right.y)).toBeCloseTo(0.14);
      expect(Math.max(edges.left.y, edges.right.y)).toBeCloseTo(
        0.14 + 6 * Math.abs(Math.sin(radians)),
      );
      expect(edges.center.y).toBeGreaterThan(0.14);
    },
  );

  it("does not lift a flat road", () => {
    const edges = raisedBankedEdges(new Vector3(0, 3.14, 0), new Vector3(1, 0, 0), 8);

    expect(edges.center.y).toBeCloseTo(3.14);
    expect(edges.left.y).toBeCloseTo(3.14);
    expect(edges.right.y).toBeCloseTo(3.14);
  });

  it("uses saved tangent handles to shape the rendered road", () => {
    const track: TrackDefinition = {
      id: "curve-test",
      closed: false,
      surface: "normal",
      materialId: "track.asphalt",
      nodes: [
        {
          id: "start",
          position: [0, 0, 0],
          tangentIn: [-3, 0, -6],
          tangentOut: [3, 0, 6],
          width: 6,
          bankRadians: 0,
        },
        {
          id: "end",
          position: [10, 0, 0],
          tangentIn: [-3, 0, 6],
          tangentOut: [3, 0, -6],
          width: 6,
          bankRadians: 0,
        },
      ],
      walls: [],
    };
    const curve = new AuthoredTrackCurve(track);

    expect(curve.getPoint(0).toArray()).toEqual([0, 0, 0]);
    expect(curve.getPoint(1).toArray()).toEqual([10, 0, 0]);
    expect(curve.getPoint(0.5).z).toBeCloseTo(4.5);
  });

  it("bounds extreme vertical handles so layered roads cannot fold through themselves", () => {
    const track: TrackDefinition = {
      id: "height-safety-test",
      closed: false,
      surface: "normal",
      materialId: "track.asphalt",
      nodes: [
        {
          id: "low",
          position: [0, 0, 0],
          tangentIn: [-3, -100, 0],
          tangentOut: [3, 100, 0],
          width: 6,
          bankRadians: 0,
        },
        {
          id: "high",
          position: [10, 5, 0],
          tangentIn: [-3, -100, 0],
          tangentOut: [3, 100, 0],
          width: 6,
          bankRadians: 0,
        },
      ],
      walls: [],
    };
    const curve = new AuthoredTrackCurve(track);
    const heights = Array.from({ length: 101 }, (_, index) => curve.getPoint(index / 100).y);

    expect(Math.min(...heights)).toBeGreaterThanOrEqual(-1.25);
    expect(Math.max(...heights)).toBeLessThanOrEqual(6.25);
  });

  it("rebuilds only road chunks touched by a range edit and reuses unrelated resources", () => {
    const base = createStarterMapDocument(
      "Chunk Test",
      (() => {
        let next = 0;
        return () => `chunk-test-${String(next++)}`;
      })(),
    );
    const longTrack: TrackDefinition = {
      id: "long-track",
      closed: false,
      surface: "normal",
      materialId: "track.asphalt",
      nodes: Array.from({ length: 7 }, (_, index) => ({
        id: `node-${String(index)}`,
        position: [index * 12, 0, 0] as const,
        tangentIn: [-4, 0, 0] as const,
        tangentOut: [4, 0, 0] as const,
        width: 6,
        bankRadians: 0,
      })),
      walls: [
        {
          id: "wall",
          side: "left",
          startDistance: 0,
          endDistance: 72,
          height: 1.5,
          thickness: 0.2,
          styleId: "wall.safety-cyan",
        },
      ],
      roadRanges: [],
    };
    const document: MapDocument = { ...base, tracks: [longTrack] };
    const preview = new EditorPreviewSession(
      new Scene(),
      new OrthographicCamera(-30, 30, 20, -20, 0.1, 500),
      document,
    );
    const initial = preview.rebuildSnapshot();
    expect(initial.rebuiltTrackChunks).toBeGreaterThan(4);

    const styledTrack: TrackDefinition = {
      ...longTrack,
      roadRanges: [
        {
          id: "rainbow-range",
          startDistance: 25,
          endDistance: 34,
          width: 6,
          bankRadians: 0,
          surface: "boost",
          materialId: "track.rainbow",
          surfaceStrength: 1.4,
          surfaceCooldownSeconds: 0.5,
        },
      ],
    };
    preview.rebuild({ ...document, tracks: [styledTrack] });
    const styled = preview.rebuildSnapshot();
    expect(styled.rebuiltTrackChunks).toBeGreaterThan(0);
    expect(styled.rebuiltTrackChunks).toBeLessThan(initial.rebuiltTrackChunks);
    expect(styled.reusedTrackChunks).toBeGreaterThan(0);
    expect(styled.rebuiltEntities).toBe(0);
    expect(styled.reusedEntities).toBe(document.entities.length);
    expect(styled.rebuiltWallGroups).toBe(0);
    expect(styled.reusedWallGroups).toBe(1);

    const strongerSurface: TrackDefinition = {
      ...styledTrack,
      roadRanges: styledTrack.roadRanges!.map((range) => ({
        ...range,
        surfaceStrength: 1.8,
      })),
    };
    preview.rebuild({ ...document, tracks: [strongerSurface] });
    const surfaceOnly = preview.rebuildSnapshot();
    expect(surfaceOnly.rebuiltTrackChunks).toBe(0);
    expect(surfaceOnly.reusedTrackChunks).toBe(initial.rebuiltTrackChunks);
    expect(surfaceOnly.reusedWallGroups).toBe(1);
    preview.dispose();
  });

  it("finds upward-facing authored surfaces for automatic object stacking", () => {
    let id = 0;
    const createId = () => `surface-snap-${String(++id)}`;
    const session = new EditorSession(createStarterMapDocument("Surface Snap", createId), createId);
    const block = session.placeEntity("shape.block", [10, 0, 10], {
      elevation: 0,
      primarySize: 4,
      yawRadians: 0,
    });
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(10, 30, 10);
    camera.up.set(0, 0, -1);
    camera.lookAt(10, 0, 10);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const preview = new EditorPreviewSession(new Scene(), camera, session.document);
    preview.setSelectedEntities([block.id]);
    preview.toggleTopDown();
    preview.frameSelected();

    const point = preview.pointOnBuildSurface(50, 50, {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    } as DOMRectReadOnly);

    expect(point?.[1]).toBeCloseTo(4);
    preview.dispose();
  });
});
