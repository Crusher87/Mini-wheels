import { describe, expect, it } from "vitest";
import {
  ControllerNavigationTracker,
  type GamepadNavigationSource,
} from "../../src/ui/controller-navigation";

interface MutablePad {
  readonly source: GamepadNavigationSource;
  readonly axes: number[];
  readonly buttons: Array<{ pressed: boolean; value: number }>;
}

function createPad(mapping: GamepadMappingType = "standard"): MutablePad {
  const axes = [0, 0];
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  return {
    axes,
    buttons,
    source: {
      index: 0,
      connected: true,
      mapping,
      axes,
      buttons,
    },
  };
}

function setButton(pad: MutablePad, index: number, isPressed: boolean): void {
  const button = pad.buttons[index];
  if (button !== undefined) {
    button.pressed = isPressed;
    button.value = Number(isPressed);
  }
}

describe("ControllerNavigationTracker", () => {
  it("edge-detects standard D-pad, confirm, and cancel buttons", () => {
    const tracker = new ControllerNavigationTracker();
    const pad = createPad();
    setButton(pad, 12, true);
    setButton(pad, 0, true);

    expect(tracker.update([pad.source], 0)).toEqual(["up", "confirm"]);
    expect(tracker.update([pad.source], 16)).toEqual([]);

    setButton(pad, 12, false);
    setButton(pad, 0, false);
    setButton(pad, 1, true);
    expect(tracker.update([pad.source], 32)).toEqual(["cancel"]);
  });

  it("uses hysteresis and deliberate repeat timing for analog navigation", () => {
    const tracker = new ControllerNavigationTracker({
      initialRepeatDelayMs: 300,
      repeatIntervalMs: 100,
    });
    const pad = createPad();
    pad.axes[0] = 0.7;

    expect(tracker.update([pad.source], 0)).toEqual(["right"]);
    expect(tracker.update([pad.source], 299)).toEqual([]);
    expect(tracker.update([pad.source], 300)).toEqual(["right"]);
    expect(tracker.update([pad.source], 399)).toEqual([]);
    expect(tracker.update([pad.source], 400)).toEqual(["right"]);

    pad.axes[0] = 0.45;
    expect(tracker.update([pad.source], 450)).toEqual([]);
    pad.axes[0] = 0.2;
    expect(tracker.update([pad.source], 500)).toEqual([]);
    pad.axes[0] = 0.7;
    expect(tracker.update([pad.source], 516)).toEqual(["right"]);
  });

  it("ignores uncalibrated non-standard pads and forgets disconnected state", () => {
    const tracker = new ControllerNavigationTracker();
    const nonStandard = createPad("");
    setButton(nonStandard, 0, true);
    expect(tracker.update([nonStandard.source], 0)).toEqual([]);

    const standard = createPad();
    setButton(standard, 0, true);
    expect(tracker.update([standard.source], 16)).toEqual(["confirm"]);
    expect(tracker.update([], 32)).toEqual([]);
    expect(tracker.update([standard.source], 48)).toEqual(["confirm"]);
  });
});
