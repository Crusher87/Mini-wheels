import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_UPRIGHT_MAXIMUM_ANGULAR_SPEED,
  AUTOMATIC_UPRIGHT_MAXIMUM_SPEED,
  shouldAccumulateAutomaticUprightRecovery,
} from "../../src/gameplay/vehicle/VehicleEntity";

describe("automatic upright recovery qualification", () => {
  it("accepts only a settled, nearly upside-down car", () => {
    expect(
      shouldAccumulateAutomaticUprightRecovery({
        rotation: { x: 1, y: 0, z: 0, w: 0 },
        linearSpeed: 0.01,
        angularSpeed: 0.02,
      }),
    ).toBe(true);
    expect(
      shouldAccumulateAutomaticUprightRecovery({
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        linearSpeed: 0,
        angularSpeed: 0,
      }),
    ).toBe(false);
  });

  it("does not intervene during motion or a large collision", () => {
    const upsideDown = { x: 1, y: 0, z: 0, w: 0 };
    expect(
      shouldAccumulateAutomaticUprightRecovery({
        rotation: upsideDown,
        linearSpeed: AUTOMATIC_UPRIGHT_MAXIMUM_SPEED,
        angularSpeed: 0,
      }),
    ).toBe(false);
    expect(
      shouldAccumulateAutomaticUprightRecovery({
        rotation: upsideDown,
        linearSpeed: 0,
        angularSpeed: AUTOMATIC_UPRIGHT_MAXIMUM_ANGULAR_SPEED,
      }),
    ).toBe(false);
  });
});
