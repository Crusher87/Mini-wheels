import { describe, expect, it } from "vitest";
import { EditorSession } from "../../src/editor/EditorSession";
import { compileMapDocument } from "../../src/maps/MapCompiler";
import { createStarterMapDocument } from "../../src/maps/MapDocument";
import { authoredBoosterDefinitions } from "../../src/world/WorldSession";

describe("authoredBoosterDefinitions", () => {
  it("compiles pad direction, power, lift, size, and cooldown for Test Mode", () => {
    let nextId = 0;
    const createId = () => `travel-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Travel", createId), createId);
    const boost = session.placeEntity("travel.boost-pad", [10, 0, 20], {
      elevation: 0,
      primarySize: 4,
      secondarySize: 6,
      yawRadians: Math.PI / 2,
    });
    session.select(boost.id);
    expect(
      session.editSelectedBoostPad({ boostSpeed: 12, liftSpeed: 1.5, cooldownSeconds: 0.6 }),
    ).toBe(true);
    const launch = session.placeEntity("travel.launch-pad", [-4, 0, 2], {
      elevation: 2,
      primarySize: 3,
      secondarySize: 5,
      yawRadians: 0,
    });
    session.select(launch.id);
    expect(
      session.editSelectedBoostPad({ boostSpeed: 9, liftSpeed: 8, cooldownSeconds: 0.2 }),
    ).toBe(true);
    const bounce = session.placeEntity("travel.bounce-pad", [4, 0, 6], {
      elevation: 0,
      primarySize: 3,
      secondarySize: 3,
      yawRadians: 0,
    });
    session.select(bounce.id);
    expect(session.editSelectedSurfacePad({ strength: 11, cooldownSeconds: 0.7 })).toBe(true);
    const slow = session.placeEntity("travel.slow-zone", [8, 0, 6], {
      elevation: 0,
      primarySize: 4,
      secondarySize: 5,
      yawRadians: 0,
    });
    session.select(slow.id);
    expect(session.editSelectedSurfacePad({ strength: 0.3, cooldownSeconds: 0.4 })).toBe(true);

    const definitions = authoredBoosterDefinitions(compileMapDocument(session.document));
    expect(definitions).toHaveLength(4);
    expect(definitions[0]).toMatchObject({
      id: boost.id,
      position: { x: 10, y: 0.08, z: 20 },
      halfExtents: { x: 2, y: 0.08, z: 3 },
      cooldownSeconds: 0.6,
    });
    expect(definitions[0]?.deltaVelocity.x).toBeCloseTo(12, 10);
    expect(definitions[0]?.deltaVelocity.y).toBe(1.5);
    expect(definitions[0]?.deltaVelocity.z).toBeCloseTo(0, 10);
    expect(definitions[1]).toMatchObject({
      id: launch.id,
      position: { x: -4, y: 2.08, z: 2 },
      halfExtents: { x: 1.5, y: 0.08, z: 2.5 },
      deltaVelocity: { x: 0, y: 8, z: 9 },
      cooldownSeconds: 0.2,
    });
    expect(definitions[2]).toMatchObject({
      id: bounce.id,
      effect: "bounce",
      minimumVerticalSpeed: 11,
      cooldownSeconds: 0.7,
      deltaVelocity: { x: 0, y: 0, z: 0 },
    });
    expect(definitions[3]).toMatchObject({
      id: slow.id,
      effect: "slow",
      velocityMultiplier: 0.3,
      cooldownSeconds: 0.4,
      deltaVelocity: { x: 0, y: 0, z: 0 },
    });
  });
});
