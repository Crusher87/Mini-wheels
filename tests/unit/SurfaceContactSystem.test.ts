import { describe, expect, it } from "vitest";
import {
  SurfaceContactSystem,
  AUTHORED_SURFACE_PRESETS,
  type AuthoredSurfaceContact,
} from "../../src/gameplay/vehicle/SurfaceContactSystem";
import { defaultTrackSurfaceCooldownSeconds, type TrackSurface } from "../../src/maps/MapDocument";

function contact(
  surface: TrackSurface,
  strength = 1,
  cooldownSeconds = defaultTrackSurfaceCooldownSeconds(surface),
): AuthoredSurfaceContact {
  return { surface, strength, cooldownSeconds };
}

describe("SurfaceContactSystem", () => {
  it("blends slippery and sticky grip using equal supporting-wheel weights", () => {
    const system = new SurfaceContactSystem();
    const frame = system.step(
      [contact("slippery"), contact("slippery"), contact("sticky"), contact("normal")],
      0.02,
    );

    expect(frame.supportingWheelCount).toBe(4);
    expect(frame.frictionSlipMultiplier).toBeCloseTo((0.35 + 0.35 + 1.3 + 1) / 4);
    expect(frame.sideGripMultiplier).toBeCloseTo((0.3 + 0.3 + 1.4 + 1) / 4);
    expect(frame.dominantSurface).toBe("slippery");
  });

  it("uses a stable priority when mixed contacts have equal counts", () => {
    const system = new SurfaceContactSystem();

    expect(
      system.step([contact("normal"), contact("slow"), contact("boost"), contact("hazard")], 0.02)
        .dominantSurface,
    ).toBe("hazard");
    expect(
      system.step([contact("slippery"), contact("sticky"), null, null], 0.02).dominantSurface,
    ).toBe("sticky");
  });

  it("scales continuous slow strength by the supporting contact fraction", () => {
    const system = new SurfaceContactSystem();
    const frame = system.step([contact("slow"), contact("slow"), contact("normal"), null], 0.02);

    expect(frame.supportingWheelCount).toBe(3);
    expect(frame.slowStrength).toBeCloseTo(2 / 3);
  });

  it("edge-triggers impulse surfaces once and respects cooldowns", () => {
    const system = new SurfaceContactSystem();

    const surfaces = [
      contact("boost"),
      contact("bouncy"),
      contact("hazard"),
      contact("normal"),
    ] as const;
    const entered = system.step(surfaces, 0.02);
    expect(entered.triggerBoost).toBe(true);
    expect(entered.triggerBounce).toBe(true);
    expect(entered.triggerHazard).toBe(true);

    const held = system.step(surfaces, 1);
    expect(held.triggerBoost).toBe(false);
    expect(held.triggerBounce).toBe(false);
    expect(held.triggerHazard).toBe(false);

    system.step([null, null, null, null], 0.02);
    const reentered = system.step(surfaces, 0.02);
    expect(reentered.triggerBoost).toBe(true);
    expect(reentered.triggerBounce).toBe(true);
    expect(reentered.triggerHazard).toBe(true);
  });

  it("reset clears contact edges, cooldowns, and temporary grip", () => {
    const system = new SurfaceContactSystem();
    system.step(
      [contact("boost"), contact("slippery"), contact("slippery"), contact("slow")],
      0.02,
    );
    system.reset();

    const clear = system.step([null, null, null, null], 0.02);
    expect(clear).toMatchObject({
      dominantSurface: null,
      supportingWheelCount: 0,
      frictionSlipMultiplier: 1,
      sideGripMultiplier: 1,
      slowStrength: 0,
      triggerBoost: false,
      boostStrength: 0,
      triggerBounce: false,
      bounceStrength: 0,
      triggerHazard: false,
      hazardStrength: 0,
    });

    const enteredAgain = system.step([contact("boost"), null, null, null], 0.02);
    expect(enteredAgain.triggerBoost).toBe(true);
    expect(AUTHORED_SURFACE_PRESETS.boost.cooldownSeconds).toBeGreaterThan(0);
  });

  it("scales strengths and resolves one-shot seams with strongest/longest profiles", () => {
    const system = new SurfaceContactSystem();
    const frame = system.step(
      [
        contact("slippery", 0.5),
        contact("sticky", 2),
        contact("boost", 0.5, 0.2),
        contact("boost", 1.75, 1.2),
      ],
      0.02,
    );

    expect(frame.frictionSlipMultiplier).toBeCloseTo((0.675 + 1.6 + 1 + 1) / 4);
    expect(frame.sideGripMultiplier).toBeCloseTo((0.65 + 1.8 + 1 + 1) / 4);
    expect(frame.triggerBoost).toBe(true);
    expect(frame.boostStrength).toBe(1.75);

    system.step([null, null, null, null], 0.5);
    expect(system.step([contact("boost", 2, 0.1), null, null, null], 0.02).triggerBoost).toBe(
      false,
    );
    system.step([null, null, null, null], 0.7);
    expect(system.step([contact("boost", 2, 0.1), null, null, null], 0.02).triggerBoost).toBe(true);
  });
});
