import { describe, expect, it } from "vitest";
import {
  EditorSession,
  floorDragPlacement,
  freeformFloorPlacement,
  primarySize,
  readYaw,
  shapeTrackElevationTransition,
  simplifyTrackStroke,
  trackLength,
} from "../../src/editor/EditorSession";
import { decodeMapDocument, encodeMapDocument } from "../../src/maps/MapCodec";
import { createStarterMapDocument } from "../../src/maps/MapDocument";

function deterministicIds(): () => string {
  let next = 0;
  return () => `editor-test-${String(++next)}`;
}

describe("EditorSession", () => {
  it("edits portable world settings as one undoable transaction", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("World Lab", createId), createId);

    expect(
      session.editEnvironment({
        groundMode: "void",
        skyPreset: "night",
        backgroundColor: "#18243d",
        keyLightDirection: [-12, 30, 8],
        keyLightIntensity: 1.15,
        keyLightColor: "#94b7ff",
        ambientLightIntensity: 0.75,
        ambientLightColor: "#35466a",
        gravityStrength: 1.62,
        fogEnabled: true,
        fogColor: "#24314d",
        fogNear: 18,
        fogFar: 95,
        musicAssetId: "music.starlight",
        musicVolume: 0.55,
        outOfBoundsHeight: -35,
      }),
    ).toBe(true);
    expect(session.document.environment).toMatchObject({
      groundMode: "void",
      skyPreset: "night",
      gravity: [0, -1.62, 0],
      musicAssetId: "music.starlight",
      outOfBoundsHeight: -35,
    });
    expect(decodeMapDocument(encodeMapDocument(session.document))).toEqual(session.document);
    expect(session.snapshot().undoLabel).toBe("Edit world settings");
    expect(session.undo()).toBe(true);
    expect(session.document.environment.skyPreset).toBe("day");
  });
  it("places objects and groups repeated wheel changes into one semantic undo step", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Wheel Lab", createId), createId);

    const placed = session.placeEntity("floor.rectangle", [8, 0, -4], {
      elevation: 1,
      primarySize: 6,
      yawRadians: 0,
    });
    expect(session.document.entities).toHaveLength(3);
    expect(session.selectedEntityId).toBe(placed.id);

    expect(session.adjustSelectedWithWheel(1, "primary")).toBe(true);
    expect(session.adjustSelectedWithWheel(1, "primary")).toBe(true);
    expect(session.adjustSelectedWithWheel(1, "elevation")).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    expect(primarySize(session.selectedEntity!)).toBe(7);
    expect(session.selectedEntity?.transform.position[1]).toBe(1);

    expect(session.undo()).toBe(true);
    expect(primarySize(session.selectedEntity!)).toBe(6);
    expect(session.selectedEntity?.transform.position[1]).toBe(0.75);
    expect(session.snapshot().undoLabel).toBe("Place floor");

    expect(session.redo()).toBe(true);
    expect(primarySize(session.selectedEntity!)).toBe(7);
    expect(session.selectedEntity?.transform.position[1]).toBe(1);
  });

  it("places click-drag floors as rectangles and preserves their aspect ratio while resizing", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Floor Lab", createId), createId);
    const rectangle = floorDragPlacement([2, 0, 3], [14, 0, 10], 0, 1);

    expect(rectangle).toEqual({ position: [8, 0, 6.5], width: 12, depth: 7 });
    const floor = session.placeEntity("floor.rectangle", rectangle.position, {
      elevation: 2,
      primarySize: rectangle.width,
      secondarySize: rectangle.depth,
      yawRadians: 0,
    });
    expect(floor.properties["width"]).toBe(12);
    expect(floor.properties["depth"]).toBe(7);

    expect(session.adjustSelectedWithWheel(2, "primary")).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    expect(session.selectedEntity?.properties["width"]).toBe(13);
    expect(session.selectedEntity?.properties["depth"]).toBeCloseTo(7.5833, 3);

    const rotated = floorDragPlacement([0, 0, 0], [0, 0, -8], Math.PI / 2, 1);
    expect(rotated.width).toBe(8);
    expect(rotated.depth).toBe(1);
    expect(rotated.position[0]).toBeCloseTo(0);
    expect(rotated.position[2]).toBeCloseTo(-4);
  });

  it("draws a concave freeform floor as one undoable object", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Freeform Lab", createId), createId);
    const stroke = [
      [0, 0, 0],
      [8, 0, 0],
      [8, 0, 6],
      [4, 0, 3],
      [0, 0, 6],
    ] as const;
    const placement = freeformFloorPlacement(stroke);

    expect(placement?.position).toEqual([4, 0, 3]);
    const floor = session.placeFreeformFloor(stroke, 2);
    expect(floor?.assetId).toBe("floor.freeform");
    expect(floor?.transform.position).toEqual([4, 1.75, 3]);
    expect(floor?.properties["outline"]).toHaveLength(5);
    expect(session.snapshot().undoLabel).toBe("Draw freeform floor");
    expect(session.undo()).toBe(true);
    expect(session.document.entities.some((entity) => entity.assetId === "floor.freeform")).toBe(
      false,
    );
  });

  it("edits numeric transforms, duplicates selection, and restores changes through history", () => {
    const createId = deterministicIds();
    const session = new EditorSession(
      createStarterMapDocument("Transform Lab", createId),
      createId,
    );
    const floor = session.document.entities.find((entity) => entity.assetId === "floor.rectangle");
    expect(floor).toBeDefined();
    session.select(floor!.id);

    expect(
      session.editSelected({
        position: [2, 3, 4],
        yawRadians: Math.PI / 2,
        primarySize: 12,
      }),
    ).toBe(true);
    expect(session.selectedEntity?.transform.position).toEqual([2, 3, 4]);
    expect(readYaw(session.selectedEntity!.transform.rotation)).toBeCloseTo(Math.PI / 2);
    expect(primarySize(session.selectedEntity!)).toBe(12);

    expect(session.duplicateSelected()).toBe(true);
    const duplicateId = session.selectedEntityId;
    expect(session.document.entities).toHaveLength(3);
    expect(session.deleteSelected()).toBe(true);
    expect(session.document.entities).toHaveLength(2);
    expect(session.selectedEntityId).toBeNull();

    expect(session.undo()).toBe(true);
    expect(session.selectedEntityId).toBe(duplicateId);
    expect(session.document.entities).toHaveLength(3);
  });

  it("keeps race references valid when the active start grid is removed", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Grid Lab", createId), createId);
    const originalGridId = session.document.race.activeStartGridId;
    const replacement = session.placeEntity("race.start-grid", [10, 0, 10], {
      elevation: 0,
      primarySize: 3,
      yawRadians: 0,
    });

    session.select(originalGridId);
    expect(session.deleteSelected()).toBe(true);
    expect(session.document.race.activeStartGridId).toBe(replacement.id);
    expect(session.document.entities.some((entity) => entity.id === originalGridId)).toBe(false);

    expect(session.undo()).toBe(true);
    expect(session.document.race.activeStartGridId).toBe(originalGridId);
  });

  it("registers placed finish gates and removes their race reference on delete", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Finish Lab", createId), createId);
    const finish = session.placeEntity("race.finish-gate", [0, 0, 8], {
      elevation: 0,
      primarySize: 7,
      secondarySize: 4,
      yawRadians: 0,
    });

    expect(session.document.race.finishEntityIds).toEqual([finish.id]);
    expect(session.deleteSelected()).toBe(true);
    expect(session.document.race.finishEntityIds).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(session.document.race.finishEntityIds).toEqual([finish.id]);
  });

  it("groups checkpoints, links directed routes and shortcuts, and repairs deleted references", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Route Lab", createId), createId);
    const placeCheckpoint = (x: number) =>
      session.placeEntity("race.checkpoint", [x, 0, 0], {
        elevation: 0,
        primarySize: 7,
        secondarySize: 4,
        yawRadians: 0,
      });
    const first = placeCheckpoint(0);
    const alternative = placeCheckpoint(5);
    const next = placeCheckpoint(10);

    session.selectMany([first.id, alternative.id]);
    expect(session.groupSelectedCheckpoints()).toBe(true);
    expect(session.document.race.checkpointGroups[0]?.checkpointEntityIds).toEqual([
      first.id,
      alternative.id,
    ]);
    session.selectMany([first.id, next.id]);
    expect(session.linkSelectedCheckpoints(true)).toBe(true);
    expect(session.document.race.checkpointGroups).toHaveLength(2);
    expect(session.document.race.routeEdges).toEqual([
      expect.objectContaining({
        fromGroupId: session.document.race.checkpointGroups[0]!.id,
        toGroupId: session.document.race.checkpointGroups[1]!.id,
        shortcut: true,
      }),
    ]);
    expect(session.linkSelectedCheckpoints()).toBe(false);

    session.select(next.id);
    expect(session.deleteSelected()).toBe(true);
    expect(session.document.race.checkpointGroups).toHaveLength(1);
    expect(session.document.race.routeEdges).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(session.document.race.routeEdges).toHaveLength(1);
  });

  it("assigns a safe recovery pose and clears the link when that pose is deleted", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Recovery Lab", createId), createId);
    const volume = session.placeEntity("race.recovery-volume", [0, 0, 0], {
      elevation: 0,
      primarySize: 8,
      secondarySize: 8,
      yawRadians: 0,
    });
    const pose = session.placeEntity("race.recovery-pose", [12, 0, 0], {
      elevation: 0,
      primarySize: 2,
      yawRadians: Math.PI / 2,
    });

    session.selectMany([volume.id, pose.id]);
    expect(session.assignSelectedRecoveryPose()).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === volume.id)?.properties[
        "safePoseEntityId"
      ],
    ).toBe(pose.id);
    expect(session.assignSelectedRecoveryPose()).toBe(false);
    expect(session.clearSelectedRecoveryPose()).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === volume.id)?.properties[
        "safePoseEntityId"
      ],
    ).toBeNull();
    expect(session.undo()).toBe(true);

    session.select(pose.id);
    expect(session.deleteSelected()).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === volume.id)?.properties[
        "safePoseEntityId"
      ],
    ).toBeNull();
    expect(session.undo()).toBe(true);
    expect(
      session.document.entities.find((entity) => entity.id === volume.id)?.properties[
        "safePoseEntityId"
      ],
    ).toBe(pose.id);
  });

  it("edits scored race setup and marks checkpoint groups optional with undo", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Race Setup", createId), createId);
    expect(
      session.editRaceSetup({ mode: "circuit", lapCount: 3, finishRule: "required-group" }),
    ).toBe(true);
    expect(session.document.header.mapType).toBe("circuit");
    expect(session.document.race).toMatchObject({
      mode: "circuit",
      lapCount: 3,
      finishRule: "required-group",
    });
    const checkpoint = session.placeEntity("race.checkpoint", [0, 0, 0], {
      elevation: 0,
      primarySize: 7,
      secondarySize: 4,
      yawRadians: 0,
    });
    session.select(checkpoint.id);
    expect(session.groupSelectedCheckpoints()).toBe(true);
    expect(session.toggleSelectedCheckpointGroupRequired()).toBe(true);
    expect(session.document.race.checkpointGroups[0]?.required).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.document.race.checkpointGroups[0]?.required).toBe(true);
  });

  it("multi-selects, snaps direct transforms, and pastes one undoable copy set", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Group Lab", createId), createId);
    const ids = session.document.entities.map((entity) => entity.id);
    session.selectMany(ids);

    expect(session.selectedEntityIds).toEqual(ids);
    expect(session.translateSelected([0.6, 0, 1.4], 1)).toBe(true);
    expect(session.rotateSelected((13 * Math.PI) / 180, Math.PI / 12)).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    expect(session.selectedEntities.map((entity) => entity.transform.position[0])).toEqual([1, 1]);
    expect(session.selectedEntities.map((entity) => entity.transform.position[2])).toEqual([1, 1]);
    expect(readYaw(session.selectedEntities[0]!.transform.rotation)).toBeCloseTo(Math.PI / 12);

    const clipboard = session.selectedEntities;
    expect(session.pasteEntities(clipboard)).toBe(true);
    expect(session.document.entities).toHaveLength(4);
    expect(session.selectedEntityIds).toHaveLength(2);
    expect(session.snapshot().undoLabel).toBe("Paste objects");

    expect(session.undo()).toBe(true);
    expect(session.document.entities).toHaveLength(2);
    expect(session.selectedEntityIds).toEqual(ids);
  });

  it("groups objects as one transformable unit and duplicates independent groups", () => {
    const createId = deterministicIds();
    const session = new EditorSession(
      createStarterMapDocument("Object Groups", createId),
      createId,
    );
    const first = session.placeEntity("shape.block", [0, 0, 0], {
      elevation: 0,
      primarySize: 4,
      yawRadians: 0,
    });
    const second = session.placeEntity("shape.block", [10, 0, 0], {
      elevation: 0,
      primarySize: 4,
      yawRadians: 0,
    });
    session.selectMany([first.id, second.id]);
    expect(session.groupSelected()).toBe(true);
    const sourceGroupId = session.selectedEntities[0]?.groupId;
    expect(sourceGroupId).toBeTruthy();
    expect(session.selectedEntities.every((entity) => entity.groupId === sourceGroupId)).toBe(true);

    session.select(null);
    expect(session.select(first.id)).toBe(true);
    expect(session.selectedEntityIds).toEqual([first.id, second.id]);
    expect(session.rotateSelected(Math.PI / 2)).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    expect(session.selectedEntities.map((entity) => entity.transform.position[0])).toEqual([5, 5]);
    expect(session.selectedEntities[0]?.transform.position[2]).toBeCloseTo(5);
    expect(session.selectedEntities[1]?.transform.position[2]).toBeCloseTo(-5);

    expect(session.duplicateSelected()).toBe(true);
    const duplicateGroupIds = new Set(session.selectedEntities.map((entity) => entity.groupId));
    expect(duplicateGroupIds.size).toBe(1);
    expect([...duplicateGroupIds][0]).not.toBe(sourceGroupId);
    expect(decodeMapDocument(encodeMapDocument(session.document)).entities).toHaveLength(6);

    expect(session.ungroupSelected()).toBe(true);
    expect(session.selectedEntities.every((entity) => entity.groupId === null)).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.selectedEntities.every((entity) => entity.groupId !== null)).toBe(true);
  });

  it("draws, adjusts, walls, extends, deletes, and restores spline tracks", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Track Lab", createId), createId);
    const track = session.createTrack(
      [
        [-10, 0, -5],
        [-2, 0, 2],
        [8, 0, 6],
      ],
      { width: 6, elevation: 1, bankRadians: 0 },
    );
    expect(track).not.toBeNull();
    expect(session.document.tracks).toHaveLength(1);
    expect(track!.nodes).toHaveLength(3);
    expect(track!.nodes[1]?.tangentOut).not.toEqual([0, 0, 0]);

    expect(session.adjustTrackWithWheel(track!.id, 2, "width")).toBe(true);
    expect(session.adjustTrackWithWheel(track!.id, 1, "bank")).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    expect(session.document.tracks[0]?.nodes[0]?.width).toBe(7);

    expect(session.setTrackWalls(track!.id, true, true)).toBe(true);
    expect(session.document.tracks[0]?.walls.map((wall) => wall.side)).toEqual(["left", "right"]);
    expect(
      session.extendTrack(track!.id, [
        [8, 1, 6],
        [15, 1, 12],
      ]),
    ).toBe(true);
    expect(session.document.tracks[0]?.nodes).toHaveLength(5);
    expect(session.document.tracks[0]?.nodes[3]?.position).not.toEqual([15, 1, 12]);
    const extendedTrack = session.document.tracks[0]!;
    expect(
      extendedTrack.walls.every((wall) => wall.endDistance === trackLength(extendedTrack)),
    ).toBe(true);

    expect(session.deleteTrack(track!.id)).toBe(true);
    expect(session.document.tracks).toHaveLength(0);
    expect(session.undo()).toBe(true);
    expect(session.document.tracks).toHaveLength(1);
  });

  it("paints, merges, erases, and restores independent wall ranges", () => {
    const createId = deterministicIds();
    const session = new EditorSession(
      createStarterMapDocument("Wall Brush Lab", createId),
      createId,
    );
    const track = session.createTrack(
      [
        [0, 0, 0],
        [10, 0, 0],
        [20, 0, 0],
        [30, 0, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;

    expect(session.editTrackWallRange(track.id, "left", 3, 12, "paint")).toBe(true);
    expect(session.editTrackWallRange(track.id, "left", 8, 18, "paint")).toBe(true);
    expect(session.editTrackWallRange(track.id, "right", 5, 15, "paint")).toBe(true);
    expect(
      session.document.tracks[0]?.walls
        .filter((wall) => wall.side === "left")
        .map((wall) => [wall.startDistance, wall.endDistance]),
    ).toEqual([[3, 18]]);
    expect(
      session.document.tracks[0]?.walls
        .filter((wall) => wall.side === "right")
        .map((wall) => [wall.startDistance, wall.endDistance]),
    ).toEqual([[5, 15]]);

    expect(session.editTrackWallRange(track.id, "both", 7, 10, "erase")).toBe(true);
    expect(session.snapshot().undoLabel).toBe("Erase track walls");
    expect(
      session.document.tracks[0]?.walls
        .filter((wall) => wall.side === "left")
        .map((wall) => [wall.startDistance, wall.endDistance]),
    ).toEqual([
      [3, 7],
      [10, 18],
    ]);
    expect(
      session.document.tracks[0]?.walls
        .filter((wall) => wall.side === "right")
        .map((wall) => [wall.startDistance, wall.endDistance]),
    ).toEqual([
      [5, 7],
      [10, 15],
    ]);

    expect(session.undo()).toBe(true);
    expect(session.document.tracks[0]?.walls).toHaveLength(2);
    expect(session.redo()).toBe(true);
    expect(session.document.tracks[0]?.walls).toHaveLength(4);
  });

  it("styles only the selected wall interval and restores it in one undo", () => {
    const createId = deterministicIds();
    const session = new EditorSession(
      createStarterMapDocument("Wall Style Lab", createId),
      createId,
    );
    const track = session.createTrack(
      [
        [0, 0, 0],
        [10, 0, 0],
        [20, 0, 0],
        [30, 0, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;
    expect(session.setTrackWalls(track.id, true, true)).toBe(true);

    expect(
      session.editTrackWallProperties(track.id, "both", 10, 20, {
        height: 2.5,
        thickness: 0.4,
        styleId: "wall.sunset",
      }),
    ).toBe(true);
    const styled = session.document.tracks[0]!.walls.filter(
      (wall) => wall.startDistance === 10 && wall.endDistance === 20,
    );
    expect(styled).toHaveLength(2);
    expect(styled.map((wall) => wall.side).sort()).toEqual(["left", "right"]);
    expect(styled.every((wall) => wall.height === 2.5)).toBe(true);
    expect(styled.every((wall) => wall.thickness === 0.4)).toBe(true);
    expect(styled.every((wall) => wall.styleId === "wall.sunset")).toBe(true);
    expect(session.document.tracks[0]?.walls).toHaveLength(6);
    expect(session.snapshot().undoLabel).toBe("Style track wall range");

    expect(session.undo()).toBe(true);
    expect(session.document.tracks[0]?.walls).toHaveLength(2);
    expect(session.redo()).toBe(true);
    expect(session.document.tracks[0]?.walls).toHaveLength(6);
  });

  it("styles a selected road interval and splits later overlaps in one undo", () => {
    const createId = deterministicIds();
    const session = new EditorSession(
      createStarterMapDocument("Road Range Lab", createId),
      createId,
    );
    const track = session.createTrack(
      [
        [0, 0, 0],
        [10, 0, 0],
        [20, 0, 0],
        [30, 0, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;

    expect(
      session.editTrackRoadProperties(track.id, 5, 25, {
        width: 9,
        bankRadians: Math.PI / 8,
        surface: "boost",
        materialId: "track.neon",
        surfaceStrength: 1.75,
        surfaceCooldownSeconds: 1.2,
      }),
    ).toBe(true);
    expect(
      session.editTrackRoadProperties(track.id, 10, 20, {
        width: 4,
        bankRadians: -Math.PI / 12,
        surface: "slippery",
        materialId: "track.ice",
        surfaceStrength: 0.5,
        surfaceCooldownSeconds: 0.4,
      }),
    ).toBe(true);

    const ranges = session.document.tracks[0]?.roadRanges ?? [];
    expect(ranges.map((range) => [range.startDistance, range.endDistance])).toEqual([
      [5, 10],
      [10, 20],
      [20, 25],
    ]);
    expect(ranges[1]).toMatchObject({
      width: 4,
      bankRadians: -Math.PI / 12,
      surface: "slippery",
      materialId: "track.ice",
      surfaceStrength: 0.5,
      surfaceCooldownSeconds: 0.4,
    });
    expect(session.snapshot().undoLabel).toBe("Style road range");
    expect(session.undo()).toBe(true);
    expect(session.document.tracks[0]?.roadRanges).toHaveLength(1);
    expect(session.redo()).toBe(true);
    expect(session.document.tracks[0]?.roadRanges).toHaveLength(3);
  });

  it("keeps earlier geometry and ranges anchored when a later point moves", () => {
    const createId = deterministicIds();
    const session = new EditorSession(
      createStarterMapDocument("Local Track Edits", createId),
      createId,
    );
    const track = session.createTrack(
      [
        [0, 0, 0],
        [10, 0, 2],
        [20, 0, -2],
        [30, 0, 2],
        [40, 0, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;
    expect(session.editTrackWallRange(track.id, "left", 2, 8, "paint")).toBe(true);
    expect(
      session.editTrackRoadProperties(track.id, 2, 8, {
        width: 8,
        bankRadians: 0.2,
        surface: "normal",
        materialId: "track.concrete",
      }),
    ).toBe(true);
    expect(
      session.editTrackRoadProperties(track.id, 32, 38, {
        width: 5,
        bankRadians: 0,
        surface: "normal",
        materialId: "track.dirt",
      }),
    ).toBe(true);
    const before = session.document.tracks[0]!;
    const firstOutgoing = before.nodes[0]!.tangentOut;
    const secondIncoming = before.nodes[1]!.tangentIn;

    const movedNode = before.nodes.find((node) => node.position[0] === 20)!;
    expect(session.moveTrackNode(track.id, movedNode.id, [20, 0, 10])).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    const after = session.document.tracks[0]!;

    expect(after.nodes[0]!.tangentOut).toEqual(firstOutgoing);
    expect(after.nodes[1]!.tangentIn).toEqual(secondIncoming);
    expect(after.walls[0]).toMatchObject({ startDistance: 2, endDistance: 8 });
    const roadRanges = after.roadRanges ?? [];
    expect(roadRanges[0]).toMatchObject({ startDistance: 2, endDistance: 8 });
    expect(roadRanges[1]!.startDistance).toBeGreaterThan(32);
    expect(roadRanges[1]!.endDistance - roadRanges[1]!.startDistance).toBeCloseTo(6, 3);
  });

  it("removes grid-step mouse jitter while preserving a broad freehand curve", () => {
    const noisyArc = Array.from({ length: 64 }, (_, index) => {
      const angle = (index / 63) * Math.PI * 1.85;
      return [Math.round(Math.cos(angle) * 14), 0, Math.round(Math.sin(angle) * 10)] as const;
    });
    const simplified = simplifyTrackStroke(noisyArc, 0.65);

    expect(simplified.length).toBeGreaterThan(8);
    expect(simplified.length).toBeLessThan(noisyArc.length / 2);
    expect(simplified[0]).toEqual(noisyArc[0]);
    expect(simplified.at(-1)).toEqual(noisyArc.at(-1));
  });

  it("smooths sharp track bends without flattening jumps and keeps walls aligned", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Smooth Lab", createId), createId);
    const track = session.createTrack(
      [
        [-8, 0, 0],
        [-4, 2, 6],
        [0, 4, -2],
        [4, 6, 6],
        [8, 8, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;
    expect(session.setTrackWalls(track.id, true, true)).toBe(true);
    const before = session.document.tracks[0]!;
    const beforeNodes = before.nodes.map((node) => node.position);

    expect(session.smoothTrack(track.id)).toBe(true);
    const smoothed = session.document.tracks[0]!;
    expect(smoothed.nodes[2]?.position[2]).toBeGreaterThan(before.nodes[2]!.position[2]);
    expect(smoothed.nodes.map((node) => node.position[1])).toEqual(
      before.nodes.map((node) => node.position[1]),
    );
    expect(smoothed.walls.every((wall) => wall.endDistance === trackLength(smoothed))).toBe(true);
    expect(session.snapshot().undoLabel).toBe("Smooth track");

    expect(session.undo()).toBe(true);
    expect(session.document.tracks[0]?.nodes.map((node) => node.position)).toEqual(beforeNodes);
  });

  it("eases an endpoint extension onto a different track layer", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Layer Lab", createId), createId);
    const track = session.createTrack(
      [
        [-20, 0, 0],
        [0, 0, 0],
      ],
      { width: 6, elevation: 2, bankRadians: 0 },
    )!;
    const originalNodeCount = track.nodes.length;

    expect(
      session.extendTrack(
        track.id,
        [
          [0, 2, 0],
          [20, 0, 0],
        ],
        "end",
        10,
      ),
    ).toBe(true);

    const extended = session.document.tracks[0]!;
    const ramp = extended.nodes.slice(originalNodeCount);
    expect(ramp.length).toBeGreaterThanOrEqual(5);
    expect(extended.nodes[originalNodeCount - 1]?.position[1]).toBe(2);
    expect(ramp.at(-1)?.position[1]).toBe(10);
    expect(
      ramp.every((node, index) => index === 0 || node.position[1] >= ramp[index - 1]!.position[1]),
    ).toBe(true);
    expect(ramp[0]?.position[1]).toBeGreaterThan(2);
    expect(ramp[0]?.position[1]).toBeLessThan(10);

    const heightRangeBefore =
      Math.max(...extended.nodes.map((node) => node.position[1])) -
      Math.min(...extended.nodes.map((node) => node.position[1]));
    expect(
      session.editTrack(track.id, { width: 7, elevation: 20, bankRadians: Math.PI / 12 }),
    ).toBe(true);
    const shifted = session.document.tracks[0]!;
    const heightRangeAfter =
      Math.max(...shifted.nodes.map((node) => node.position[1])) -
      Math.min(...shifted.nodes.map((node) => node.position[1]));
    expect(heightRangeAfter).toBeCloseTo(heightRangeBefore);
    expect(
      shifted.nodes.reduce((sum, node) => sum + node.position[1], 0) / shifted.nodes.length,
    ).toBeCloseTo(20);
  });

  it("adds eased height samples to a straight stroke", () => {
    const shaped = shapeTrackElevationTransition(
      [
        [0, 0, 0],
        [30, 0, 0],
      ],
      0,
      6,
      6,
    );

    expect(shaped).toHaveLength(6);
    expect(shaped[0]?.[1]).toBe(0);
    expect(shaped.at(-1)?.[1]).toBe(6);
    expect(shaped[1]?.[1]).toBeLessThan(6 * 0.2);
    expect(shaped.at(-2)?.[1]).toBeGreaterThan(6 * 0.8);
  });

  it("joins two open tracks across different layers into one editable ramp", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Join Lab", createId), createId);
    const ground = session.createTrack(
      [
        [-20, 0, 0],
        [-10, 0, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;
    const upper = session.createTrack(
      [
        [10, 0, 0],
        [20, 0, 0],
      ],
      { width: 6, elevation: 8, bankRadians: 0 },
    )!;
    expect(session.setTrackWalls(ground.id, true, false)).toBe(true);
    expect(session.setTrackWalls(upper.id, false, true)).toBe(true);

    expect(
      session.joinTrackEndpoints(ground.id, "end", upper.id, "start", [
        [-10, 0, 0],
        [0, 0, 0],
        [10, 8, 0],
      ]),
    ).toBe(true);

    expect(session.document.tracks).toHaveLength(1);
    const joined = session.document.tracks[0]!;
    expect(joined.id).toBe(ground.id);
    expect(joined.nodes[0]?.position).toEqual([-20, 0, 0]);
    expect(joined.nodes.at(-1)?.position).toEqual([20, 8, 0]);
    expect(Math.min(...joined.nodes.map((node) => node.position[1]))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...joined.nodes.map((node) => node.position[1]))).toBeLessThanOrEqual(8);
    expect(joined.walls.map((wall) => wall.side).sort()).toEqual(["left", "right"]);
    expect(joined.walls.every((wall) => wall.endDistance === trackLength(joined))).toBe(true);
    expect(session.snapshot().undoLabel).toBe("Join tracks");

    expect(session.undo()).toBe(true);
    expect(session.document.tracks).toHaveLength(2);
  });

  it("splits an open track at a middle point and preserves both wall sides", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Split Lab", createId), createId);
    const track = session.createTrack(
      [
        [-20, 0, 0],
        [-10, 1, 4],
        [0, 3, 0],
        [10, 2, -4],
        [20, 0, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;
    expect(session.setTrackWalls(track.id, true, true)).toBe(true);
    const before = session.document.tracks[0]!;
    const splitNode = before.nodes[2]!;
    const originalLength = trackLength(before);

    const result = session.splitTrack(track.id, splitNode.id);

    expect(result?.secondaryTrackId).not.toBeNull();
    expect(session.document.tracks).toHaveLength(2);
    const [primary, secondary] = session.document.tracks;
    expect(primary?.nodes).toHaveLength(3);
    expect(secondary?.nodes).toHaveLength(3);
    expect(primary?.nodes.at(-1)?.position).toEqual(splitNode.position);
    expect(secondary?.nodes[0]?.position).toEqual(splitNode.position);
    expect(primary?.nodes.at(-1)?.id).not.toBe(secondary?.nodes[0]?.id);
    expect(trackLength(primary!) + trackLength(secondary!)).toBeCloseTo(originalLength);
    expect(
      [primary!, secondary!].every(
        (piece) =>
          piece.walls.length === 2 &&
          piece.walls.every(
            (wall) => wall.startDistance === 0 && wall.endDistance === trackLength(piece),
          ),
      ),
    ).toBe(true);
    expect(session.snapshot().undoLabel).toBe("Split track");

    expect(session.undo()).toBe(true);
    expect(session.document.tracks).toHaveLength(1);
    expect(session.document.tracks[0]?.nodes.map((node) => node.id)).toEqual(
      before.nodes.map((node) => node.id),
    );
  });

  it("opens a closed loop at the chosen point without losing its final segment", () => {
    const createId = deterministicIds();
    const session = new EditorSession(
      createStarterMapDocument("Open Loop Lab", createId),
      createId,
    );
    const track = session.createTrack(
      [
        [-12, 0, -8],
        [12, 0, -8],
        [12, 2, 8],
        [-12, 1, 8],
        [-11.5, 0, -8],
      ],
      { width: 5, elevation: 0, bankRadians: 0 },
    )!;
    expect(track.closed).toBe(true);
    expect(session.setTrackWalls(track.id, true, false)).toBe(true);
    const before = session.document.tracks[0]!;
    const cutNode = before.nodes[2]!;
    const beforeLength = trackLength(before);

    const result = session.splitTrack(track.id, cutNode.id);

    expect(result?.openedLoop).toBe(true);
    expect(result?.secondaryTrackId).toBeNull();
    expect(session.document.tracks).toHaveLength(1);
    const opened = session.document.tracks[0]!;
    expect(opened.closed).toBe(false);
    expect(opened.nodes).toHaveLength(before.nodes.length + 1);
    expect(opened.nodes[0]?.position).toEqual(cutNode.position);
    expect(opened.nodes.at(-1)?.position).toEqual(cutNode.position);
    expect(opened.nodes[0]?.id).not.toBe(opened.nodes.at(-1)?.id);
    expect(trackLength(opened)).toBeCloseTo(beforeLength);
    expect(opened.walls[0]?.startDistance).toBe(0);
    expect(opened.walls[0]?.endDistance).toBeCloseTo(beforeLength);
    expect(session.snapshot().undoLabel).toBe("Open track loop");
  });

  it("reshapes, inserts, and safely removes track control points with stable wall ranges", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Point Lab", createId), createId);
    const track = session.createTrack(
      [
        [-12, 0, 0],
        [-4, 0, 5],
        [4, 0, -3],
        [12, 0, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;
    expect(session.setTrackWalls(track.id, true, true)).toBe(true);
    const pointId = session.document.tracks[0]!.nodes[1]!.id;
    const originalPosition = session.document.tracks[0]!.nodes[1]!.position;

    expect(session.moveTrackNode(track.id, pointId, [-5, 1, 8])).toBe(true);
    expect(session.moveTrackNode(track.id, pointId, [-6, 2, 9])).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    expect(session.snapshot().undoLabel).toBe("Move track point");
    expect(session.document.tracks[0]!.nodes[1]!.position).toEqual([-6, 2, 9]);
    expect(session.undo()).toBe(true);
    expect(session.document.tracks[0]!.nodes[1]!.position).toEqual(originalPosition);
    expect(session.redo()).toBe(true);

    const inserted = session.insertTrackNode(track.id, pointId);
    expect(inserted).not.toBeNull();
    expect(session.document.tracks[0]!.nodes).toHaveLength(5);
    expect(
      session.document.tracks[0]!.walls.every(
        (wall) => wall.endDistance === trackLength(session.document.tracks[0]!),
      ),
    ).toBe(true);
    expect(
      session.editTrackNode(track.id, inserted!.id, {
        position: [0, 4, 1],
        width: 8,
        bankRadians: Math.PI / 8,
      }),
    ).toBe(true);
    expect(
      session.document.tracks[0]!.nodes.find((node) => node.id === inserted!.id),
    ).toMatchObject({
      position: [0, 4, 1],
      width: 8,
      bankRadians: Math.PI / 8,
    });

    expect(session.deleteTrackNode(track.id, inserted!.id)).toBe(true);
    expect(session.document.tracks[0]!.nodes).toHaveLength(4);
    expect(
      session.document.tracks[0]!.walls.every(
        (wall) => wall.endDistance === trackLength(session.document.tracks[0]!),
      ),
    ).toBe(true);
  });

  it("shapes one side of a curve without changing the previous side", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Tangent Lab", createId), createId);
    const track = session.createTrack(
      [
        [-10, 0, 0],
        [0, 0, 0],
        [10, 0, 0],
      ],
      { width: 6, elevation: 0, bankRadians: 0 },
    )!;
    const nodeId = track.nodes[1]!.id;
    const originalIncoming = track.nodes[1]!.tangentIn;

    expect(session.moveTrackTangent(track.id, nodeId, "out", [3, 2, 7])).toBe(true);
    expect(session.moveTrackTangent(track.id, nodeId, "out", [4, 2, 8])).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    expect(session.snapshot().undoLabel).toBe("Shape track curve");
    let shapedNode = session.document.tracks[0]!.nodes[1]!;
    expect(shapedNode.tangentOut).toEqual([4, 2, 8]);
    expect(shapedNode.tangentIn).toEqual(originalIncoming);

    expect(session.moveTrackNode(track.id, nodeId, [0, 3, 1])).toBe(true);
    expect(session.commitContinuousEdit()).toBe(true);
    shapedNode = session.document.tracks[0]!.nodes[1]!;
    expect(shapedNode.tangentOut).toEqual([4, 2, 8]);
    expect(shapedNode.tangentIn).toEqual(originalIncoming);

    expect(session.insertTrackNode(track.id, nodeId)).not.toBeNull();
    shapedNode = session.document.tracks[0]!.nodes.find((node) => node.id === nodeId)!;
    expect(shapedNode.tangentOut).toEqual([4, 2, 8]);

    expect(session.resetTrackTangent(track.id, nodeId)).toBe(true);
    shapedNode = session.document.tracks[0]!.nodes.find((node) => node.id === nodeId)!;
    expect(shapedNode.tangentOut).not.toEqual([4, 2, 8]);
    expect(shapedNode.tangentIn).toEqual(shapedNode.tangentOut.map((value) => -value));
    expect(session.snapshot().undoLabel).toBe("Reset track curve");
  });

  it("magnetically closes a loop drawn back near its starting point", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Loop Lab", createId), createId);
    const loop = Array.from({ length: 41 }, (_, index) => {
      const angle = (index / 42) * Math.PI * 2;
      return [Math.cos(angle) * 12, 0, Math.sin(angle) * 9] as const;
    });
    const track = session.createTrack(loop, { width: 6, elevation: 0, bankRadians: 0 });

    expect(track?.closed).toBe(true);
    expect(track?.nodes.length).toBeLessThan(loop.length / 2);
    expect(trackLength(track!)).toBeGreaterThan(50);
  });

  it("extends from either endpoint and carries whole-track walls through a joined loop", () => {
    const createId = deterministicIds();
    const session = new EditorSession(createStarterMapDocument("Endpoint Lab", createId), createId);
    const track = session.createTrack(
      [
        [-10, 0, 0],
        [-10, 0, 10],
        [10, 0, 10],
        [10, 0, 0],
      ],
      { width: 5, elevation: 0, bankRadians: 0 },
    )!;
    expect(session.setTrackWalls(track.id, true, true)).toBe(true);
    expect(
      session.extendTrack(
        track.id,
        [
          [-10, 0, 0],
          [-14, 0, -4],
          [-16, 0, 0],
        ],
        "start",
      ),
    ).toBe(true);
    const prepended = session.document.tracks[0]!;
    expect(prepended.nodes[0]?.position[0]).toBe(-16);
    expect(prepended.walls.every((wall) => wall.endDistance === trackLength(prepended))).toBe(true);

    expect(
      session.extendTrack(
        track.id,
        [
          [10, 0, 0],
          [4, 0, -8],
          [-8, 0, -7],
          [-16, 0, 0],
        ],
        "end",
      ),
    ).toBe(true);
    const closed = session.document.tracks[0]!;
    expect(closed.closed).toBe(true);
    expect(closed.walls.every((wall) => wall.endDistance === trackLength(closed))).toBe(true);
  });
});
