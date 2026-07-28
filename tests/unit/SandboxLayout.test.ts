import { describe, expect, it } from "vitest";
import { SANDBOX_LAYOUT } from "../../src/config/sandbox-layout";

describe("Sandbox authored layout", () => {
  it("keeps an open 80 by 80 floor centered at the origin", () => {
    expect(SANDBOX_LAYOUT.floor.center).toEqual({ x: 0, y: -0.1, z: 0 });
    expect(SANDBOX_LAYOUT.floor.dimensions).toEqual({ x: 80, y: 0.2, z: 80 });
    expect(SANDBOX_LAYOUT.resetVolume).toEqual({
      center: { x: 0, y: -5, z: 0 },
      dimensions: { x: 200, y: 4, z: 200 },
      upperBoundaryY: -3,
      dynamicPropDestination: { x: 0, y: 2, z: 0 },
    });
  });

  it("generates exactly 96 unique cube centers in the documented 6 by 4 by 4 formation", () => {
    const { cubeStack } = SANDBOX_LAYOUT;
    expect(cubeStack.count).toBe(96);
    expect(cubeStack.formation).toEqual({ x: 6, y: 4, z: 4 });
    expect(cubeStack.positions).toHaveLength(
      cubeStack.formation.x * cubeStack.formation.y * cubeStack.formation.z,
    );

    const xCenters = new Set<number>();
    const yCenters = new Set<number>();
    const zCenters = new Set<number>();
    const uniqueCenters = new Set<string>();
    for (const position of cubeStack.positions) {
      xCenters.add(position.x);
      yCenters.add(position.y);
      zCenters.add(position.z);
      uniqueCenters.add(`${String(position.x)},${String(position.y)},${String(position.z)}`);
    }

    expect([...xCenters]).toEqual([7.81, 8.81, 9.81, 10.81, 11.81, 12.81]);
    expect([...yCenters]).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect([...zCenters]).toEqual([-34.83, -33.83, -32.83, -31.83]);
    expect(uniqueCenters.size).toBe(96);
    expect(cubeStack.dimensions).toEqual({ x: 1, y: 1, z: 1 });
    expect(cubeStack.mass).toBe(10);
    expect(cubeStack.sourceContinuousCollisionDetection).toBe(true);
    expect(cubeStack.runtimeContinuousCollisionDetection).toBe(false);
  });

  it("preserves all three documented heavy-ball configurations", () => {
    expect(SANDBOX_LAYOUT.balls.positions).toEqual([
      { x: 29.6, y: 0.5, z: 5 },
      { x: -9.6, y: 0.5, z: 31.6 },
      { x: -27.5, y: 0.5, z: -1.1 },
    ]);
    expect(SANDBOX_LAYOUT.balls.radius).toBe(0.5);
    expect(SANDBOX_LAYOUT.balls.mass).toBe(50);
    expect(SANDBOX_LAYOUT.balls.light.color).toBe(0x98ff50);
  });

  it("keeps the documented neutral and green palette distinct from the ball light", () => {
    expect(SANDBOX_LAYOUT.colors).toEqual({
      architecture: 0xb2b2b2,
      green: 0x1ed936,
      greenEmissive: 0x4bb800,
    });
    expect(SANDBOX_LAYOUT.colors.green).not.toBe(SANDBOX_LAYOUT.balls.light.color);
  });

  it("preserves both ramps, the feature wall, and elevated platform columns", () => {
    expect(SANDBOX_LAYOUT.ramps.sourceXScaleMultiplier).toBe(3);
    expect(SANDBOX_LAYOUT.ramps.wedgeDimensions).toEqual({
      x: 10,
      y: 4.2,
      z: 4,
    });
    expect(SANDBOX_LAYOUT.ramps.transforms).toEqual([
      {
        position: { x: -10.85, y: 0, z: -13.25 },
        yawDegrees: 67.6,
      },
      {
        position: { x: -24.1, y: 0, z: 26.8 },
        yawDegrees: 30,
      },
    ]);
    expect(SANDBOX_LAYOUT.featureWall).toEqual({
      transform: {
        position: { x: 14.91, y: 2, z: -20.53 },
        yawDegrees: -30,
      },
      dimensions: { x: 10, y: 4, z: 1 },
    });
    expect(SANDBOX_LAYOUT.elevatedColumns).toEqual({
      dimensions: { x: 4, y: 8, z: 4 },
      positions: [
        { x: -32, y: 4, z: -32 },
        { x: -18, y: 4, z: -32 },
      ],
    });
  });

  it("deep-freezes authored collections and vectors", () => {
    expect(Object.isFrozen(SANDBOX_LAYOUT)).toBe(true);
    expect(Object.isFrozen(SANDBOX_LAYOUT.cubeStack)).toBe(true);
    expect(Object.isFrozen(SANDBOX_LAYOUT.cubeStack.positions)).toBe(true);
    expect(Object.isFrozen(SANDBOX_LAYOUT.cubeStack.positions[0])).toBe(true);
    expect(Object.isFrozen(SANDBOX_LAYOUT.balls.positions)).toBe(true);
    expect(Object.isFrozen(SANDBOX_LAYOUT.ramps.transforms)).toBe(true);
    expect(Object.isFrozen(SANDBOX_LAYOUT.ramps.transforms[0])).toBe(true);
    expect(Object.isFrozen(SANDBOX_LAYOUT.elevatedColumns.positions)).toBe(true);
  });
});
