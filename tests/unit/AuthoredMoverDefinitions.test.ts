import { describe, expect, it } from "vitest";
import { EditorSession } from "../../src/editor/EditorSession";
import { compileMapDocument } from "../../src/maps/MapCompiler";
import { createStarterMapDocument } from "../../src/maps/MapDocument";
import { authoredMoverDefinitions } from "../../src/world/WorldSession";

describe("authoredMoverDefinitions", () => {
  it("compiles local platform travel and rotating-bar speed into deterministic mover sources", () => {
    let nextId = 0;
    const createId = () => `mover-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Movers", createId), createId);
    const platform = session.placeEntity("motion.moving-platform", [10, 0, 20], {
      elevation: 0,
      primarySize: 4,
      secondarySize: 5,
      yawRadians: Math.PI / 2,
    });
    session.select(platform.id);
    expect(session.editSelectedMotion({ speed: 2, dwellSeconds: 1.5, offset: [0, 0, 6] })).toBe(
      true,
    );
    const bar = session.placeEntity("motion.rotating-bar", [-5, 0, 3], {
      elevation: 0,
      primarySize: 10,
      secondarySize: 1,
      yawRadians: Math.PI / 2,
    });
    session.select(bar.id);
    expect(session.editSelectedMotion({ speed: -120, dwellSeconds: 0, offset: [0, 0, 0] })).toBe(
      true,
    );
    const door = session.placeEntity("motion.door", [2, 0, -4], {
      elevation: 0,
      primarySize: 4,
      secondarySize: 5,
      yawRadians: 0,
    });
    session.select(door.id);
    expect(session.editSelectedMotion({ speed: 3, dwellSeconds: 2, offset: [0, 5, 0] })).toBe(true);

    const definitions = authoredMoverDefinitions(compileMapDocument(session.document));
    expect(definitions.movingPlatforms).toHaveLength(2);
    expect(definitions.movingPlatforms[0]).toMatchObject({
      id: platform.id,
      size: { x: 4, y: 0.3, z: 5 },
      endpointA: { x: 10, y: 0.15, z: 20 },
      endpointB: { x: 16, y: 0.15, z: 20 },
      speedUnitsPerSecond: 2,
      endpointHoldSeconds: 1.5,
      authoredOneWayTravelSeconds: 3,
    });
    expect(definitions.movingPlatforms[1]).toMatchObject({
      id: door.id,
      size: { x: 5, y: 4, z: 0.5 },
      endpointA: { x: 2, y: 2, z: -4 },
      endpointB: { x: 2, y: 7, z: -4 },
      speedUnitsPerSecond: 3,
      endpointHoldSeconds: 2,
      authoredOneWayTravelSeconds: 5 / 3,
    });
    expect(definitions.rotatingBars[0]).toMatchObject({
      id: bar.id,
      scale: { x: 10, y: 0.6, z: 1 },
      legacyDegreesPerSecond: -120,
      recommendedDegreesPerSecond: -120,
    });
    expect(definitions.rotatingBars[0]?.initialYawDegrees).toBeCloseTo(90, 10);
  });
});
