export interface KeyboardBinding {
  readonly up: string;
  readonly down: string;
  readonly left: string;
  readonly right: string;
}

/**
 * DECISION: Only P1's WASD default is source-confirmed. Remaining mappings are
 * distinct browser `KeyboardEvent.code` defaults chosen for a complete roster.
 * M3 exposes all four codes for rebinding and conflict validation.
 */
export const DEFAULT_KEYBOARD_BINDINGS: readonly KeyboardBinding[] = Object.freeze([
  Object.freeze({ up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" }),
  Object.freeze({
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  }),
  Object.freeze({ up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL" }),
  Object.freeze({ up: "KeyT", down: "KeyG", left: "KeyF", right: "KeyH" }),
  Object.freeze({
    up: "Numpad8",
    down: "Numpad5",
    left: "Numpad4",
    right: "Numpad6",
  }),
  Object.freeze({ up: "KeyO", down: "KeyM", left: "KeyU", right: "Period" }),
  Object.freeze({ up: "Digit8", down: "Digit5", left: "Digit4", right: "Digit6" }),
  Object.freeze({ up: "Home", down: "End", left: "Delete", right: "PageDown" }),
  Object.freeze({
    up: "BracketLeft",
    down: "Quote",
    left: "Semicolon",
    right: "BracketRight",
  }),
  Object.freeze({
    up: "Numpad9",
    down: "Numpad1",
    left: "Numpad7",
    right: "Numpad3",
  }),
]);

export function findKeyboardConflicts(
  bindings: readonly KeyboardBinding[],
): ReadonlyMap<string, readonly number[]> {
  const owners = new Map<string, number[]>();
  bindings.forEach((binding, playerIndex) => {
    for (const code of [binding.up, binding.down, binding.left, binding.right]) {
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
