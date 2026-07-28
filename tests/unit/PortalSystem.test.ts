import type { RigidBodyHandle } from "@dimforge/rapier3d";
import { describe, expect, it } from "vitest";
import {
  PortalReentryGate,
  pairPortalEndpointIds,
} from "../../src/gameplay/interactables/PortalSystem";
import {
  portalEndpointId,
  portalPairId,
  type PortalEndpointDefinition,
} from "../../src/gameplay/interactables/interactable-config";
import {
  calculatePortalExitMotion,
  portalForwardFromRotation,
} from "../../src/gameplay/interactables/trigger-math";

const BODY_A = 1 as RigidBodyHandle;
const SOURCE_ID = portalEndpointId("source");
const DESTINATION_ID = portalEndpointId("destination");
const PAIR_ID = portalPairId("test-pair");

const PORTALS: readonly PortalEndpointDefinition[] = [
  {
    id: SOURCE_ID,
    pairId: PAIR_ID,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    halfExtents: { x: 1, y: 1, z: 0.1 },
  },
  {
    id: DESTINATION_ID,
    pairId: PAIR_ID,
    position: { x: 10, y: 5, z: -2 },
    rotation: {
      x: -Math.SQRT1_2,
      y: 0,
      z: 0,
      w: Math.SQRT1_2,
    },
    halfExtents: { x: 1, y: 1, z: 0.1 },
  },
];

describe("portal transform math", () => {
  it("retains 80% of speed, redirects to exit-forward, and preserves angular velocity", () => {
    const motion = calculatePortalExitMotion(
      { x: 3, y: 4, z: 0 },
      { x: 2, y: -3, z: 7 },
      { x: 0, y: 0, z: -2 },
      0.8,
    );

    expect(motion.linearVelocity).toEqual({ x: 0, y: 0, z: -4 });
    expect(motion.angularVelocity).toEqual({ x: 2, y: -3, z: 7 });
  });

  it("derives outward +Z normals for upright and horizontal endpoint rotations", () => {
    expect(portalForwardFromRotation({ x: 0, y: 0, z: 0, w: 1 })).toEqual({ x: 0, y: 0, z: 1 });
    const upward = portalForwardFromRotation({
      x: -Math.SQRT1_2,
      y: 0,
      z: 0,
      w: Math.SQRT1_2,
    });
    expect(upward.x).toBeCloseTo(0, 12);
    expect(upward.y).toBeCloseTo(1, 12);
    expect(upward.z).toBeCloseTo(0, 12);
  });
});

describe("PortalReentryGate", () => {
  it("blocks both endpoints until the destination is left or 0.20 seconds elapse", () => {
    const gate = new PortalReentryGate(0.2);
    gate.lockAfterTeleport(BODY_A, DESTINATION_ID);
    expect(gate.canEnter(BODY_A)).toBe(false);

    gate.destinationExited(BODY_A, SOURCE_ID);
    expect(gate.canEnter(BODY_A)).toBe(false);
    gate.fixedStep(0.19);
    expect(gate.canEnter(BODY_A)).toBe(false);
    gate.fixedStep(0.01);
    expect(gate.canEnter(BODY_A)).toBe(true);

    gate.lockAfterTeleport(BODY_A, DESTINATION_ID);
    gate.destinationExited(BODY_A, DESTINATION_ID);
    expect(gate.canEnter(BODY_A)).toBe(true);
  });

  it("cleans recovered bodies and stays inert after idempotent disposal", () => {
    const gate = new PortalReentryGate();
    gate.lockAfterTeleport(BODY_A, DESTINATION_ID);
    gate.forgetBody(BODY_A);
    expect(gate.debugSnapshot().lockedBodyCount).toBe(0);

    gate.lockAfterTeleport(BODY_A, DESTINATION_ID);
    gate.dispose();
    gate.dispose();
    gate.lockAfterTeleport(BODY_A, DESTINATION_ID);
    gate.fixedStep(1);
    expect(gate.debugSnapshot()).toMatchObject({
      lockedBodyCount: 0,
      disposed: true,
    });
    expect(gate.canEnter(BODY_A)).toBe(false);
  });
});

describe("portal pair validation", () => {
  it("builds a symmetric pair registry and rejects incomplete pairs", () => {
    const pairs = pairPortalEndpointIds(PORTALS);
    expect(pairs.get(SOURCE_ID)).toBe(DESTINATION_ID);
    expect(pairs.get(DESTINATION_ID)).toBe(SOURCE_ID);

    expect(() => pairPortalEndpointIds(PORTALS.slice(0, 1))).toThrow(/exactly two endpoints/);
    expect(() => pairPortalEndpointIds([PORTALS[0]!, PORTALS[0]!])).toThrow(
      /Duplicate portal endpoint ID/,
    );
  });
});
