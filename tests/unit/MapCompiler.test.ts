import { describe, expect, it } from "vitest";
import { compileMapDocument } from "../../src/maps/MapCompiler";
import { createStarterMapDocument } from "../../src/maps/MapDocument";
import { EditorSession } from "../../src/editor/EditorSession";

describe("MapCompiler", () => {
  it("creates an immutable free-drive blueprint with stable entity indexes", () => {
    let index = 0;
    const document = createStarterMapDocument("Compiler Track", () => `compile-${String(++index)}`);
    const blueprint = compileMapDocument(document);

    expect(blueprint.title).toBe("Compiler Track");
    expect(blueprint.freeDriveReady).toBe(true);
    expect(blueprint.scoredRaceReady).toBe(true);
    expect(blueprint.diagnostics).toEqual([]);
    expect(Object.keys(blueprint.entityIndexById)).toHaveLength(2);
    expect(Object.isFrozen(blueprint)).toBe(true);
  });

  it("warns, without blocking, when a map has very many physics toys", () => {
    let index = 0;
    const createId = () => `heavy-${String(++index)}`;
    const session = new EditorSession(createStarterMapDocument("Heavy", createId), createId);
    for (let count = 0; count < 121; count += 1) {
      session.placeEntity("physics.ball", [count % 20, 0, Math.floor(count / 20)], {
        elevation: 0,
        primarySize: 0.5,
        yawRadians: 0,
      });
    }
    const blueprint = compileMapDocument(session.document);

    expect(blueprint.freeDriveReady).toBe(true);
    expect(blueprint.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "performance.many-physics-toys",
    );
  });

  it("keeps authored spline source data in the immutable runtime blueprint", () => {
    let index = 0;
    const createId = () => `track-compile-${String(++index)}`;
    const session = new EditorSession(createStarterMapDocument("Road", createId), createId);
    const track = session.createTrack(
      [
        [0, 0, 0],
        [10, 0, 5],
      ],
      { width: 7, elevation: 2, bankRadians: 0 },
    );
    const blueprint = compileMapDocument(session.document);
    expect(blueprint.tracks).toHaveLength(1);
    expect(blueprint.tracks[0]?.id).toBe(track?.id);
    expect(Object.isFrozen(blueprint.tracks)).toBe(true);
  });

  it("warns about recovery volumes that do not have a safe pose", () => {
    let index = 0;
    const createId = () => `recovery-compile-${String(++index)}`;
    const session = new EditorSession(createStarterMapDocument("Recovery", createId), createId);
    const volume = session.placeEntity("race.recovery-volume", [0, 0, 0], {
      elevation: 0,
      primarySize: 8,
      secondarySize: 8,
      yawRadians: 0,
    });
    expect(compileMapDocument(session.document).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "race.recovery-missing-pose",
        entityId: volume.id,
      }),
    );
  });

  it("permits light-heavy maps while warning about performance", () => {
    let index = 0;
    const createId = () => `light-compile-${String(++index)}`;
    const session = new EditorSession(createStarterMapDocument("Lights", createId), createId);
    for (let lightIndex = 0; lightIndex < 13; lightIndex += 1) {
      session.placeEntity("decoration.point-light", [lightIndex * 2, 0, 0], {
        elevation: 0,
        primarySize: 3,
        yawRadians: 0,
      });
    }

    const blueprint = compileMapDocument(session.document);
    expect(blueprint.freeDriveReady).toBe(true);
    expect(blueprint.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "decoration.many-point-lights",
        level: "warning",
      }),
    );
  });

  it("blocks a scored checkpoint graph with no route start", () => {
    let index = 0;
    const createId = () => `route-compile-${String(++index)}`;
    const session = new EditorSession(createStarterMapDocument("Broken Race", createId), createId);
    const first = session.placeEntity("race.checkpoint", [-4, 0, 0], {
      elevation: 0,
      primarySize: 7,
      secondarySize: 4,
      yawRadians: 0,
    });
    const second = session.placeEntity("race.checkpoint", [4, 0, 0], {
      elevation: 0,
      primarySize: 7,
      secondarySize: 4,
      yawRadians: 0,
    });
    session.select(first.id);
    session.groupSelectedCheckpoints();
    session.select(second.id);
    session.groupSelectedCheckpoints();
    session.editRaceSetup({ mode: "circuit", lapCount: 2, finishRule: "required-group" });
    const groups = session.document.race.checkpointGroups;
    const cyclic = {
      ...session.document,
      race: {
        ...session.document.race,
        routeEdges: [
          { id: "edge-a", fromGroupId: groups[0]!.id, toGroupId: groups[1]!.id, shortcut: false },
          { id: "edge-b", fromGroupId: groups[1]!.id, toGroupId: groups[0]!.id, shortcut: false },
        ],
      },
    };
    expect(compileMapDocument(cyclic).diagnostics).toContainEqual(
      expect.objectContaining({ code: "race.route-no-start", level: "blocking" }),
    );
  });
});
