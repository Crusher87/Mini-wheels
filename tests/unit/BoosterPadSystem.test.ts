import type { ColliderHandle, RigidBodyHandle } from "@dimforge/rapier3d";
import { describe, expect, it } from "vitest";
import {
  BoosterContactState,
  applyBoosterPadVelocity,
} from "../../src/gameplay/interactables/BoosterPadSystem";
import { addDeltaVelocity } from "../../src/gameplay/interactables/trigger-math";

const BODY_A = 1 as RigidBodyHandle;
const BODY_B = 2 as RigidBodyHandle;
const COLLIDER_A = 11 as ColliderHandle;
const COLLIDER_B = 12 as ColliderHandle;
const COLLIDER_C = 21 as ColliderHandle;

describe("booster velocity math", () => {
  it("adds the authored delta without replacing or normalizing velocity", () => {
    expect(addDeltaVelocity({ x: 4, y: -2, z: 9 }, { x: 0, y: 0, z: -5 })).toEqual({
      x: 4,
      y: -2,
      z: 4,
    });
    expect(addDeltaVelocity({ x: 12, y: 3, z: -8 }, { x: -1, y: 1, z: 5 })).toEqual({
      x: 11,
      y: 4,
      z: -3,
    });
  });

  it("supports bounded slow-entry and minimum upward bounce effects", () => {
    expect(
      applyBoosterPadVelocity(
        { x: 10, y: -4, z: -5 },
        { deltaVelocity: { x: 0, y: 0, z: 0 }, velocityMultiplier: 0.4 },
      ),
    ).toEqual({ x: 4, y: -4, z: -2 });
    expect(
      applyBoosterPadVelocity(
        { x: 3, y: -12, z: 4 },
        { deltaVelocity: { x: 0, y: 0, z: 0 }, minimumVerticalSpeed: 9 },
      ),
    ).toEqual({ x: 3, y: 9, z: 4 });
  });
});

describe("BoosterContactState", () => {
  it("activates once per complete compound-body enter/exit cycle", () => {
    const state = new BoosterContactState(0.15);
    state.enter(BODY_A, COLLIDER_A);
    state.enter(BODY_A, COLLIDER_B);

    expect(state.fixedStep(0.02)).toEqual([BODY_A]);
    expect(state.fixedStep(0.15)).toEqual([]);
    state.leave(BODY_A, COLLIDER_A);
    state.enter(BODY_A, COLLIDER_A);
    expect(state.fixedStep(0)).toEqual([]);

    state.leave(BODY_A, COLLIDER_A);
    state.leave(BODY_A, COLLIDER_B);
    state.enter(BODY_A, COLLIDER_A);
    expect(state.fixedStep(0)).toEqual([BODY_A]);
  });

  it("queues a new entrant during the pad-wide cooldown until it is ready", () => {
    const state = new BoosterContactState(0.15);
    state.enter(BODY_A, COLLIDER_A);
    expect(state.fixedStep(0)).toEqual([BODY_A]);

    state.enter(BODY_B, COLLIDER_C);
    expect(state.fixedStep(0.14)).toEqual([]);
    expect(state.fixedStep(0.01)).toEqual([BODY_B]);
  });

  it("forgets recovered bodies and remains safely empty after disposal", () => {
    const state = new BoosterContactState();
    state.enter(BODY_A, COLLIDER_A);
    state.forgetBody(BODY_A);
    expect(state.debugSnapshot()).toMatchObject({
      insideBodyCount: 0,
      pendingBodyCount: 0,
      cooldownRemainingSeconds: 0,
      disposed: false,
    });

    state.enter(BODY_B, COLLIDER_C);
    state.dispose();
    state.dispose();
    state.enter(BODY_A, COLLIDER_A);
    expect(state.fixedStep(1)).toEqual([]);
    expect(state.debugSnapshot()).toMatchObject({
      insideBodyCount: 0,
      pendingBodyCount: 0,
      disposed: true,
    });
  });
});
