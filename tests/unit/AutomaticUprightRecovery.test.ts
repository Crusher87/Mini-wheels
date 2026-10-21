import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_UPRIGHT_MAXIMUM_ANGULAR_SPEED,
  AUTOMATIC_UPRIGHT_MAXIMUM_SPEED,
  shouldAccumulateAutomaticUprightRecovery,
} from "../../src/gameplay/vehicle/VehicleEntity";
import {
  JUMP_LANDING_MINIMUM_AIRBORNE_SECONDS,
  shouldAssistJumpLanding,
} from "../../src/physics/VehiclePhysicsAdapter";

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

describe("jump landing assistance qualification", () => {
  it("waits for a descending vehicle to reach wheel-support range", () => {
    expect(
      shouldAssistJumpLanding({
        airborneSeconds: JUMP_LANDING_MINIMUM_AIRBORNE_SECONDS,
        groundDistance: 1,
        verticalVelocity: -2,
      }),
    ).toBe(true);
    expect(
      shouldAssistJumpLanding({
        airborneSeconds: JUMP_LANDING_MINIMUM_AIRBORNE_SECONDS,
        groundDistance: null,
        verticalVelocity: -2,
      }),
    ).toBe(false);
    expect(
      shouldAssistJumpLanding({
        airborneSeconds: JUMP_LANDING_MINIMUM_AIRBORNE_SECONDS,
        groundDistance: 1,
        verticalVelocity: 2,
      }),
    ).toBe(false);
  });

  it("does not intervene while the landing surface is still far away", () => {
    expect(
      shouldAssistJumpLanding({
        airborneSeconds: 1,
        groundDistance: 2,
        verticalVelocity: -2,
      }),
    ).toBe(false);
  });
});
