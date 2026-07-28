export type ControllerNavigationIntent = "up" | "down" | "left" | "right" | "confirm" | "cancel";

export interface GamepadNavigationSource {
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: GamepadMappingType;
  readonly axes: readonly number[];
  readonly buttons: readonly Pick<GamepadButton, "pressed" | "value">[];
}

export interface ControllerNavigationTiming {
  readonly initialRepeatDelayMs: number;
  readonly repeatIntervalMs: number;
}

interface DirectionState {
  held: boolean;
  nextRepeatAt: number;
}

interface PadState {
  readonly directions: Record<"up" | "down" | "left" | "right", DirectionState>;
  confirmHeld: boolean;
  cancelHeld: boolean;
}

const AXIS_PRESS_THRESHOLD = 0.62;
const AXIS_RELEASE_THRESHOLD = 0.38;

export const DEFAULT_CONTROLLER_NAVIGATION_TIMING: ControllerNavigationTiming = Object.freeze({
  initialRepeatDelayMs: 340,
  repeatIntervalMs: 110,
});

function createPadState(): PadState {
  return {
    directions: {
      up: { held: false, nextRepeatAt: 0 },
      down: { held: false, nextRepeatAt: 0 },
      left: { held: false, nextRepeatAt: 0 },
      right: { held: false, nextRepeatAt: 0 },
    },
    confirmHeld: false,
    cancelHeld: false,
  };
}

function pressed(button: Pick<GamepadButton, "pressed" | "value"> | undefined): boolean {
  return button?.pressed === true || (button?.value ?? 0) >= 0.5;
}

function axisDirectionPressed(value: number, sign: -1 | 1, held: boolean): boolean {
  const signedValue = value * sign;
  return signedValue >= (held ? AXIS_RELEASE_THRESHOLD : AXIS_PRESS_THRESHOLD);
}

/**
 * Converts standard-mapped gamepad state into edge-detected menu intentions.
 * Directional inputs repeat after a deliberate delay; confirm and cancel do not.
 *
 * Non-standard pads are ignored because their button numbers are not portable.
 * They remain usable for driving after explicit calibration.
 */
export class ControllerNavigationTracker {
  private readonly padStates = new Map<number, PadState>();

  public constructor(
    private readonly timing: ControllerNavigationTiming = DEFAULT_CONTROLLER_NAVIGATION_TIMING,
  ) {}

  public update(
    gamepads: readonly GamepadNavigationSource[],
    nowMilliseconds: number,
  ): readonly ControllerNavigationIntent[] {
    const intents: ControllerNavigationIntent[] = [];
    const liveIndices = new Set<number>();

    for (const gamepad of gamepads) {
      if (!gamepad.connected || gamepad.mapping !== "standard") {
        continue;
      }

      liveIndices.add(gamepad.index);
      const state = this.padStates.get(gamepad.index) ?? createPadState();
      this.padStates.set(gamepad.index, state);
      const horizontal = gamepad.axes[0] ?? 0;
      const vertical = gamepad.axes[1] ?? 0;
      const directionPressed = {
        up:
          pressed(gamepad.buttons[12]) ||
          axisDirectionPressed(vertical, -1, state.directions.up.held),
        down:
          pressed(gamepad.buttons[13]) ||
          axisDirectionPressed(vertical, 1, state.directions.down.held),
        left:
          pressed(gamepad.buttons[14]) ||
          axisDirectionPressed(horizontal, -1, state.directions.left.held),
        right:
          pressed(gamepad.buttons[15]) ||
          axisDirectionPressed(horizontal, 1, state.directions.right.held),
      } as const;

      for (const direction of ["up", "down", "left", "right"] as const) {
        this.updateDirection(
          direction,
          directionPressed[direction],
          state.directions[direction],
          nowMilliseconds,
          intents,
        );
      }

      const confirmPressed = pressed(gamepad.buttons[0]);
      if (confirmPressed && !state.confirmHeld) {
        intents.push("confirm");
      }
      state.confirmHeld = confirmPressed;

      const cancelPressed = pressed(gamepad.buttons[1]);
      if (cancelPressed && !state.cancelHeld) {
        intents.push("cancel");
      }
      state.cancelHeld = cancelPressed;
    }

    for (const index of this.padStates.keys()) {
      if (!liveIndices.has(index)) {
        this.padStates.delete(index);
      }
    }

    return intents;
  }

  public reset(): void {
    this.padStates.clear();
  }

  private updateDirection(
    direction: "up" | "down" | "left" | "right",
    isPressed: boolean,
    state: DirectionState,
    nowMilliseconds: number,
    intents: ControllerNavigationIntent[],
  ): void {
    if (!isPressed) {
      state.held = false;
      state.nextRepeatAt = 0;
      return;
    }

    if (!state.held) {
      state.held = true;
      state.nextRepeatAt = nowMilliseconds + this.timing.initialRepeatDelayMs;
      intents.push(direction);
      return;
    }

    if (nowMilliseconds >= state.nextRepeatAt) {
      state.nextRepeatAt = nowMilliseconds + this.timing.repeatIntervalMs;
      intents.push(direction);
    }
  }
}
