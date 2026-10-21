import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InputHub,
  applyAnalogDeadZone,
  applyAnalogSensitivity,
  type InputHubHandlers,
} from "../../src/input/InputHub";
import { DEFAULT_PLAYER_INPUTS, type PlayerInputSettings } from "../../src/persistence/schema";

interface GamepadFixture {
  readonly gamepad: Gamepad;
  readonly setMenuPressed: (pressed: boolean) => void;
  readonly setBrakePressed: (pressed: boolean) => void;
}

function createGamepad(
  index: number,
  id: string,
  axes: readonly number[] = [0, 0],
  mapping: GamepadMappingType = "standard",
): GamepadFixture {
  const buttons: GamepadButton[] = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));
  const gamepad = {
    axes: [...axes],
    buttons,
    connected: true,
    id,
    index,
    mapping,
    timestamp: 0,
  } as unknown as Gamepad;

  return {
    gamepad,
    setMenuPressed: (pressed) => {
      buttons[9] = {
        pressed,
        touched: pressed,
        value: pressed ? 1 : 0,
      };
    },
    setBrakePressed: (pressed) => {
      buttons[5] = {
        pressed,
        touched: pressed,
        value: pressed ? 1 : 0,
      };
    },
  };
}

function withControllerPlayers(hints: readonly (string | null)[]): readonly PlayerInputSettings[] {
  return DEFAULT_PLAYER_INPUTS.map((settings, index) => {
    const hint = hints[index];
    return hint === undefined
      ? settings
      : {
          ...settings,
          inputType: "controller",
          controllerIdHint: hint,
        };
  });
}

describe("applyAnalogDeadZone", () => {
  it("removes the center zone and rescales the remaining signed range", () => {
    expect(applyAnalogDeadZone(0.15, 0.15)).toBe(0);
    expect(applyAnalogDeadZone(-0.1, 0.15)).toBe(0);
    expect(applyAnalogDeadZone(0.575, 0.15)).toBeCloseTo(0.5);
    expect(applyAnalogDeadZone(-0.575, 0.15)).toBeCloseTo(-0.5);
    expect(applyAnalogDeadZone(1, 0.15)).toBe(1);
  });

  it("contains malformed and out-of-range values", () => {
    expect(applyAnalogDeadZone(Number.NaN, 0.15)).toBe(0);
    expect(applyAnalogDeadZone(Number.POSITIVE_INFINITY, 0.15)).toBe(0);
    expect(applyAnalogDeadZone(4, 0.15)).toBe(1);
    expect(applyAnalogDeadZone(0.5, -1)).toBe(0.5);
  });
});

describe("applyAnalogSensitivity", () => {
  it("scales signed analog output and clamps it to the logical axis range", () => {
    expect(applyAnalogSensitivity(0.4, 0.5)).toBeCloseTo(0.2);
    expect(applyAnalogSensitivity(-0.4, 1.5)).toBeCloseTo(-0.6);
    expect(applyAnalogSensitivity(0.8, 2)).toBe(1);
    expect(applyAnalogSensitivity(Number.NaN, 1)).toBe(0);
  });
});

describe("InputHub", () => {
  let browserWindow: EventTarget;
  let gamepads: Array<Gamepad | null>;
  let hubs: InputHub[];

  beforeEach(() => {
    browserWindow = new EventTarget();
    gamepads = [];
    hubs = [];
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("navigator", {
      getGamepads: () => gamepads,
    });
  });

  afterEach(() => {
    for (const hub of hubs) {
      hub.dispose();
    }
    vi.unstubAllGlobals();
  });

  function createHub(): InputHub {
    const hub = new InputHub();
    hubs.push(hub);
    return hub;
  }

  function dispatchKey(type: "keydown" | "keyup", code: string): Event {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "code", { value: code });
    browserWindow.dispatchEvent(event);
    return event;
  }

  function createHandlers(): {
    readonly handlers: InputHubHandlers;
    readonly pause: ReturnType<typeof vi.fn>;
    readonly devices: ReturnType<typeof vi.fn>;
    readonly disconnected: ReturnType<typeof vi.fn>;
  } {
    const pause = vi.fn();
    const devices = vi.fn();
    const disconnected = vi.fn();
    return {
      handlers: {
        onPauseRequested: pause,
        onDevicesChanged: devices,
        onAssignedControllerDisconnected: disconnected,
      },
      pause,
      devices,
      disconnected,
    };
  }

  it("routes distinct physical keyboard codes to their configured players", () => {
    const hub = createHub();
    hub.configurePlayerSources(DEFAULT_PLAYER_INPUTS, 2, 0.15);
    hub.setGameplayEnabled(true);

    const p1Up = dispatchKey("keydown", "KeyW");
    const p2Right = dispatchKey("keydown", "ArrowRight");
    expect(p1Up.defaultPrevented).toBe(true);
    expect(p2Right.defaultPrevented).toBe(true);
    expect(hub.getPlayerAxes(0)).toEqual({ horizontal: 0, vertical: 1, brake: false });
    expect(hub.getPlayerAxes(1)).toEqual({ horizontal: 1, vertical: 0, brake: false });

    dispatchKey("keyup", "KeyW");
    dispatchKey("keydown", "ShiftLeft");
    expect(hub.getPlayerAxes(0)).toEqual({ horizontal: 0, vertical: 0, brake: true });

    hub.setGameplayEnabled(false);
    expect(hub.getPlayerAxes(1)).toEqual({ horizontal: 0, vertical: 0, brake: false });
  });

  it("enumerates, exclusively assigns, and reads standard controllers", () => {
    const first = createGamepad(0, "First pad", [0.575, -1]);
    const second = createGamepad(1, "Second pad", [-0.575, 1]);
    gamepads = [first.gamepad, second.gamepad];
    const hub = createHub();
    hub.configurePlayerSources(withControllerPlayers([null, null]), 2, 0.15);
    hub.activate();

    expect(hub.connectedGamepads.map(({ id }) => id)).toEqual(["First pad", "Second pad"]);
    expect(hub.assignController(0, 0)).toEqual({
      playerIndex: 0,
      gamepadIndex: 0,
    });
    expect(() => hub.assignController(1, 0)).toThrow(/already assigned to P1/);
    hub.assignController(1, 1);
    hub.setGameplayEnabled(true);

    expect(hub.getPlayerAxes(0).horizontal).toBeCloseTo(0.5);
    expect(hub.getPlayerAxes(0).vertical).toBe(1);
    expect(hub.getPlayerAxes(1).horizontal).toBeCloseTo(-0.5);
    expect(hub.getPlayerAxes(1).vertical).toBe(-1);
    expect(hub.getPlayerAxes(0).brake).toBe(false);
    first.setBrakePressed(true);
    expect(hub.getPlayerAxes(0).brake).toBe(true);
  });

  it("requires and applies explicit axis calibration for a non-standard controller", () => {
    const fixture = createGamepad(0, "Unmapped pad", [0.575, -0.575], "");
    gamepads = [fixture.gamepad];
    const hub = createHub();
    const uncalibrated = DEFAULT_PLAYER_INPUTS.map((settings, index) =>
      index === 0
        ? {
            ...settings,
            inputType: "controller" as const,
            controllerIdHint: "Unmapped pad",
            controllerMappingHint: "" as const,
          }
        : settings,
    );
    hub.configurePlayerSources(uncalibrated, 1, 0.15);
    hub.activate();
    hub.setGameplayEnabled(true);
    expect(hub.getPlayerAxes(0)).toEqual({ horizontal: 0, vertical: 0, brake: false });

    const calibrated = uncalibrated.map((settings, index) =>
      index === 0
        ? {
            ...settings,
            controllerCalibration: {
              horizontalAxis: 0,
              verticalAxis: 1,
              horizontalSign: 1 as const,
              verticalSign: -1 as const,
            },
          }
        : settings,
    );
    hub.configurePlayerSources(calibrated, 1, 0.15);
    expect(hub.getPlayerAxes(0).horizontal).toBeCloseTo(0.5);
    expect(hub.getPlayerAxes(0).vertical).toBeCloseTo(0.5);
  });

  it("restores only an unambiguous controller id hint", () => {
    const unique = createGamepad(0, "Unique pad");
    gamepads = [unique.gamepad];
    const hub = createHub();
    hub.configurePlayerSources(withControllerPlayers(["Unique pad"]), 1, 0.15);
    hub.activate();
    expect(hub.getControllerAssignment(0)).toBe(0);

    hub.dispose();
    hubs = hubs.filter((candidate) => candidate !== hub);

    const duplicateA = createGamepad(0, "Identical pad");
    const duplicateB = createGamepad(1, "Identical pad");
    gamepads = [duplicateA.gamepad, duplicateB.gamepad];
    const ambiguousHub = createHub();
    ambiguousHub.configurePlayerSources(withControllerPlayers(["Identical pad"]), 1, 0.15);
    ambiguousHub.activate();
    expect(ambiguousHub.getControllerAssignment(0)).toBeNull();
  });

  it("edge-detects the standard Menu button", () => {
    const fixture = createGamepad(0, "Menu pad");
    gamepads = [fixture.gamepad];
    const hub = createHub();
    const callbacks = createHandlers();
    hub.setHandlers(callbacks.handlers);
    hub.activate();
    callbacks.pause.mockClear();

    fixture.setMenuPressed(true);
    hub.pollGamepads();
    hub.pollGamepads();
    expect(callbacks.pause).toHaveBeenCalledTimes(1);

    fixture.setMenuPressed(false);
    hub.pollGamepads();
    fixture.setMenuPressed(true);
    hub.pollGamepads();
    expect(callbacks.pause).toHaveBeenCalledTimes(2);
  });

  it("does not guess a Menu button index for non-standard controllers", () => {
    const fixture = createGamepad(0, "Unmapped menu pad", [0, 0], "");
    gamepads = [fixture.gamepad];
    const hub = createHub();
    const callbacks = createHandlers();
    hub.setHandlers(callbacks.handlers);
    hub.activate();

    fixture.setMenuPressed(true);
    hub.pollGamepads();
    expect(callbacks.pause).not.toHaveBeenCalled();
  });

  it("clears a missing assignment and reports the affected player once", () => {
    const fixture = createGamepad(0, "Disconnecting pad");
    gamepads = [fixture.gamepad];
    const hub = createHub();
    const callbacks = createHandlers();
    hub.setHandlers(callbacks.handlers);
    hub.configurePlayerSources(withControllerPlayers([null]), 1, 0.15);
    hub.activate();
    hub.assignController(0, 0);
    callbacks.disconnected.mockClear();

    gamepads = [null];
    hub.pollGamepads();
    hub.pollGamepads();
    expect(hub.getControllerAssignment(0)).toBeNull();
    expect(callbacks.disconnected).toHaveBeenCalledOnce();
    expect(callbacks.disconnected).toHaveBeenCalledWith([0]);
  });

  it("releases an exclusive controller when its player switches to keyboard", () => {
    const fixture = createGamepad(0, "Reusable pad");
    gamepads = [fixture.gamepad];
    const hub = createHub();
    hub.configurePlayerSources(withControllerPlayers([null, null]), 2, 0.15);
    hub.activate();
    hub.assignController(0, 0);

    const keyboardThenController = DEFAULT_PLAYER_INPUTS.map(
      (settings, index): PlayerInputSettings =>
        index === 1
          ? {
              ...settings,
              inputType: "controller",
              controllerIdHint: null,
            }
          : settings,
    );
    hub.configurePlayerSources(keyboardThenController, 2, 0.15);

    expect(hub.getControllerAssignment(0)).toBeNull();
    expect(() => hub.assignController(1, 0)).not.toThrow();
  });
});
