import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBOARD_BINDINGS, findKeyboardConflicts } from "../../src/input/bindings";

describe("default keyboard bindings", () => {
  it("provides ten drive-and-brake profiles without silent overlap", () => {
    expect(DEFAULT_KEYBOARD_BINDINGS).toHaveLength(10);
    expect(DEFAULT_KEYBOARD_BINDINGS[0]).toEqual({
      up: "KeyW",
      down: "KeyS",
      left: "KeyA",
      right: "KeyD",
      brake: "ShiftLeft",
    });
    expect(findKeyboardConflicts(DEFAULT_KEYBOARD_BINDINGS).size).toBe(0);
  });

  it("reports duplicate ownership by physical code", () => {
    const first = DEFAULT_KEYBOARD_BINDINGS[0];
    expect(first).toBeDefined();
    const conflicts = findKeyboardConflicts([
      first!,
      { up: "KeyW", down: "KeyX", left: "KeyY", right: "KeyZ", brake: "KeyQ" },
    ]);
    expect(conflicts.get("KeyW")).toEqual([0, 1]);
  });
});
