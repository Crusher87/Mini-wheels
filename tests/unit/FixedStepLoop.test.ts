import { describe, expect, it, vi } from "vitest";
import { FixedStepLoop } from "../../src/app/FixedStepLoop";

describe("FixedStepLoop", () => {
  it("runs 50 Hz steps independently of render cadence", () => {
    const loop = new FixedStepLoop();
    const step = vi.fn();

    for (let index = 0; index < 60; index += 1) {
      loop.advance(1 / 60, step);
    }

    expect(step).toHaveBeenCalledTimes(50);
    expect(loop.accumulator).toBeCloseTo(0, 8);
  });

  it("caps catch-up work and discards whole overloaded steps", () => {
    const loop = new FixedStepLoop();
    const step = vi.fn();
    const result = loop.advance(0.25, step);

    expect(step).toHaveBeenCalledTimes(5);
    expect(result.overloaded).toBe(true);
    expect(result.alpha).toBeLessThan(1);
    expect(result.discardedSeconds).toBeGreaterThan(0);
  });

  it("resets the accumulator across lifecycle boundaries", () => {
    const loop = new FixedStepLoop();
    loop.advance(0.015, () => undefined);
    loop.reset();
    expect(loop.accumulator).toBe(0);
  });
});
