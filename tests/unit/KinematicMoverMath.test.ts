import { describe, expect, it } from "vitest";
import { FixedStepLoop } from "../../src/app/FixedStepLoop";
import { SANDBOX_MOVER_SOURCE_REFERENCE } from "../../src/config/sandbox-movers";
import {
  platformCycleSeconds,
  platformTravelSeconds,
  rotatingBarYawAtTime,
  writePlatformPositionAtTime,
} from "../../src/world/movers/moverMath";

const [BAR_1, BAR_2] = SANDBOX_MOVER_SOURCE_REFERENCE.rotatingBars;
const [VERTICAL_LIFT, HORIZONTAL_SHUTTLE] = SANDBOX_MOVER_SOURCE_REFERENCE.movingPlatforms;

if (
  BAR_1 === undefined ||
  BAR_2 === undefined ||
  VERTICAL_LIFT === undefined ||
  HORIZONTAL_SHUTTLE === undefined
) {
  throw new Error("Authored mover fixtures are incomplete.");
}

describe("rotating mover math", () => {
  it("converts the strict legacy rates from the documented 60 Hz reference", () => {
    expect(BAR_1.sourceDegreesPerRenderedIteration * 60).toBe(BAR_1.legacyDegreesPerSecond);
    expect(BAR_2.sourceDegreesPerRenderedIteration * 60).toBe(BAR_2.legacyDegreesPerSecond);
    expect(BAR_1.legacyDegreesPerSecond).toBe(300);
    expect(BAR_2.legacyDegreesPerSecond).toBe(-480);
  });

  it("samples authored initial yaw and absolute-time yaw", () => {
    expect(toDegrees(rotatingBarYawAtTime(BAR_1, 0))).toBeCloseTo(0, 10);
    expect(toDegrees(rotatingBarYawAtTime(BAR_2, 0))).toBeCloseTo(90, 10);
    expect(toDegrees(rotatingBarYawAtTime(BAR_1, 1))).toBeCloseTo(300, 10);
    expect(toDegrees(rotatingBarYawAtTime(BAR_2, 1))).toBeCloseTo(330, 10);
  });

  it("keeps the recommended safety profile separate from legacy behavior", () => {
    expect(toDegrees(rotatingBarYawAtTime(BAR_1, 1, "recommended"))).toBeCloseTo(120, 10);
    expect(toDegrees(rotatingBarYawAtTime(BAR_2, 1, "recommended"))).toBeCloseTo(270, 10);
  });
});

describe("moving platform trajectories", () => {
  it("derives the documented one-way durations from distance and 1 unit/s", () => {
    expect(
      platformTravelSeconds(
        VERTICAL_LIFT.endpointA,
        VERTICAL_LIFT.endpointB,
        VERTICAL_LIFT.speedUnitsPerSecond,
      ),
    ).toBeCloseTo(VERTICAL_LIFT.authoredOneWayTravelSeconds, 10);
    expect(
      platformTravelSeconds(
        HORIZONTAL_SHUTTLE.endpointA,
        HORIZONTAL_SHUTTLE.endpointB,
        HORIZONTAL_SHUTTLE.speedUnitsPerSecond,
      ),
    ).toBeCloseTo(HORIZONTAL_SHUTTLE.authoredOneWayTravelSeconds, 10);
  });

  it("travels, holds two seconds, returns, and holds before repeating", () => {
    const output = { x: 0, y: 0, z: 0 };

    expect(writePlatformPositionAtTime(VERTICAL_LIFT, 0, output)).toBe("travel-a-to-b");
    expect(output).toEqual(VERTICAL_LIFT.endpointA);

    expect(writePlatformPositionAtTime(VERTICAL_LIFT, 3.975, output)).toBe("travel-a-to-b");
    expect(output.x).toBe(-32);
    expect(output.y).toBeCloseTo(3.925, 10);
    expect(output.z).toBe(-28);

    expect(writePlatformPositionAtTime(VERTICAL_LIFT, 7.95, output)).toBe("hold-at-b");
    expect(output).toEqual(VERTICAL_LIFT.endpointB);
    expect(writePlatformPositionAtTime(VERTICAL_LIFT, 9.949, output)).toBe("hold-at-b");

    expect(writePlatformPositionAtTime(VERTICAL_LIFT, 9.95, output)).toBe("travel-b-to-a");
    expect(output).toEqual(VERTICAL_LIFT.endpointB);
    expect(writePlatformPositionAtTime(VERTICAL_LIFT, 13.925, output)).toBe("travel-b-to-a");
    expect(output.y).toBeCloseTo(3.925, 10);

    expect(writePlatformPositionAtTime(VERTICAL_LIFT, 17.9, output)).toBe("hold-at-a");
    expect(output).toEqual(VERTICAL_LIFT.endpointA);
    expect(
      writePlatformPositionAtTime(VERTICAL_LIFT, platformCycleSeconds(VERTICAL_LIFT), output),
    ).toBe("travel-a-to-b");
    expect(output).toEqual(VERTICAL_LIFT.endpointA);
  });

  it("matches the horizontal shuttle's six-second authored route", () => {
    const output = { x: 0, y: 0, z: 0 };
    expect(writePlatformPositionAtTime(HORIZONTAL_SHUTTLE, 3, output)).toBe("travel-a-to-b");
    expect(output).toEqual({ x: -25, y: 7.9, z: -32 });
    expect(writePlatformPositionAtTime(HORIZONTAL_SHUTTLE, 6, output)).toBe("hold-at-b");
    expect(output).toEqual(HORIZONTAL_SHUTTLE.endpointB);
    expect(writePlatformPositionAtTime(HORIZONTAL_SHUTTLE, 11, output)).toBe("travel-b-to-a");
    expect(output).toEqual({ x: -25, y: 7.9, z: -32 });
    expect(writePlatformPositionAtTime(HORIZONTAL_SHUTTLE, 14, output)).toBe("hold-at-a");
    expect(output).toEqual(HORIZONTAL_SHUTTLE.endpointA);
  });
});

describe.each([60, 120, 144])("%i Hz render cadence", (renderRate) => {
  it("reaches identical fixed-time mover transforms", () => {
    const loop = new FixedStepLoop();
    const output = { x: 0, y: 0, z: 0 };
    let simulationTimeSeconds = 0;
    let bar1Yaw = 0;
    let bar2Yaw = 0;
    let platformPhase = writePlatformPositionAtTime(VERTICAL_LIFT, simulationTimeSeconds, output);

    const durationSeconds = 8;
    const frameCount = durationSeconds * renderRate;
    for (let frame = 0; frame < frameCount; frame += 1) {
      loop.advance(1 / renderRate, (fixedDeltaSeconds) => {
        simulationTimeSeconds += fixedDeltaSeconds;
        bar1Yaw = rotatingBarYawAtTime(BAR_1, simulationTimeSeconds);
        bar2Yaw = rotatingBarYawAtTime(BAR_2, simulationTimeSeconds);
        platformPhase = writePlatformPositionAtTime(VERTICAL_LIFT, simulationTimeSeconds, output);
      });
    }

    expect(simulationTimeSeconds).toBeCloseTo(durationSeconds, 10);
    expect(toDegrees(bar1Yaw)).toBeCloseTo(240, 8);
    expect(toDegrees(bar2Yaw)).toBeCloseTo(210, 8);
    expect(platformPhase).toBe("hold-at-b");
    expect(output).toEqual(VERTICAL_LIFT.endpointB);
  });
});

function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}
