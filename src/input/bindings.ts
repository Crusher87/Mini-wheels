export interface KeyboardBinding {
  readonly up: string;
  readonly down: string;
  readonly left: string;
  readonly right: string;
  readonly brake: string;
}

/**
 * DECISION: Only P1's WASD default is source-confirmed. Remaining mappings are
 * distinct browser `KeyboardEvent.code` defaults chosen for a complete roster.
 * The browser build exposes all drive/action codes for rebinding and conflict
 * validation.
 */
export const DEFAULT_KEYBOARD_BINDINGS: readonly KeyboardBinding[] = Object.freeze([
  Object.freeze({
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    brake: "ShiftLeft",
  }),
  Object.freeze({
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    brake: "ShiftRight",
  }),
  Object.freeze({ up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL", brake: "Slash" }),
  Object.freeze({ up: "KeyT", down: "KeyG", left: "KeyF", right: "KeyH", brake: "KeyY" }),
  Object.freeze({
    up: "Numpad8",
    down: "Numpad5",
    left: "Numpad4",
    right: "Numpad6",
    brake: "Numpad0",
  }),
  Object.freeze({ up: "KeyO", down: "KeyM", left: "KeyU", right: "Period", brake: "Comma" }),
  Object.freeze({
    up: "Digit8",
    down: "Digit5",
    left: "Digit4",
    right: "Digit6",
    brake: "Digit0",
  }),
  Object.freeze({
    up: "Home",
    down: "End",
    left: "Delete",
    right: "PageDown",
    brake: "Insert",
  }),
  Object.freeze({
    up: "BracketLeft",
    down: "Quote",
    left: "Semicolon",
    right: "BracketRight",
    brake: "Backslash",
  }),
  Object.freeze({
    up: "Numpad9",
    down: "Numpad1",
    left: "Numpad7",
    right: "Numpad3",
    brake: "NumpadAdd",
  }),
]);

export function findKeyboardConflicts(
  bindings: readonly KeyboardBinding[],
): ReadonlyMap<string, readonly number[]> {
  const owners = new Map<string, number[]>();
  bindings.forEach((binding, playerIndex) => {
    for (const code of [binding.up, binding.down, binding.left, binding.right, binding.brake]) {
      const players = owners.get(code) ?? [];
      if (!players.includes(playerIndex)) {
        players.push(playerIndex);
      }
      owners.set(code, players);
    }
  });

  const conflicts = new Map<string, readonly number[]>();
  for (const [code, players] of owners) {
    if (players.length > 1) {
      conflicts.set(code, players);
    }
  }
  return conflicts;
}
