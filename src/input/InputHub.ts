import type { PlayerInputSettings } from "../persistence/schema";
import { DEFAULT_KEYBOARD_BINDINGS, type KeyboardBinding } from "./bindings";

export interface LogicalAxes {
  readonly horizontal: number;
  readonly vertical: number;
  readonly brake: boolean;
}

export interface MutableLogicalAxes {
  horizontal: number;
  vertical: number;
  brake: boolean;
}

export interface InputHubHandlers {
  readonly onPauseRequested: () => void;
  readonly onDevicesChanged: () => void;
  readonly onAssignedControllerDisconnected: (zeroBasedPlayerIndices: readonly number[]) => void;
}

export interface ControllerAssignmentResult {
  readonly playerIndex: number;
  readonly gamepadIndex: number | null;
}

const EMPTY_AXES: LogicalAxes = Object.freeze({ horizontal: 0, vertical: 0, brake: false });
const EMPTY_PLAYER_SETTINGS: readonly PlayerInputSettings[] = Object.freeze(
  DEFAULT_KEYBOARD_BINDINGS.map((keyboard) =>
    Object.freeze({
      inputType: "keyboard" as const,
      keyboard,
      controllerIdHint: null,
      controllerMappingHint: null,
      controllerCalibration: null,
    }),
  ),
);

export function applyAnalogDeadZone(value: number, deadZone: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const safeDeadZone = Math.min(Math.max(deadZone, 0), 0.95);
  const magnitude = Math.abs(Math.min(Math.max(value, -1), 1));
  if (magnitude <= safeDeadZone) {
    return 0;
  }
  return Math.sign(value) * ((magnitude - safeDeadZone) / (1 - safeDeadZone));
}

export function applyAnalogSensitivity(value: number, sensitivity: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const safeSensitivity = Number.isFinite(sensitivity)
    ? Math.min(Math.max(sensitivity, 0.5), 2)
    : 1;
  return Math.min(1, Math.max(-1, value * safeSensitivity));
}

export class InputHub {
  private readonly heldCodes = new Set<string>();
  private readonly assignedCodes = new Set<string>();
  private readonly controllerAssignments: Array<number | null> = Array.from(
    { length: 10 },
    () => null,
  );
  private readonly previousMenuButton = new Map<number, boolean>();
  private playerSettings: readonly PlayerInputSettings[] = EMPTY_PLAYER_SETTINGS;
  private activePlayerCount = 1;
  private analogDeadZone = 0.15;
  private analogSensitivity = 1;
  private gameplayEnabled = false;
  private activated = false;
  private gamepads: readonly (Gamepad | null)[] = [];
  private deviceSignature = "";
  private handlers: InputHubHandlers | undefined;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.gameplayEnabled) {
      return;
    }
    if (this.assignedCodes.has(event.code)) {
      event.preventDefault();
      this.heldCodes.add(event.code);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.heldCodes.delete(event.code);
  };

  private readonly onGamepadConnected = (): void => {
    this.pollGamepads();
  };

  private readonly onGamepadDisconnected = (event: GamepadEvent): void => {
    const affected: number[] = [];
    for (let index = 0; index < this.activePlayerCount; index += 1) {
      if (this.controllerAssignments[index] === event.gamepad.index) {
        this.controllerAssignments[index] = null;
        affected.push(index);
      }
    }
    this.previousMenuButton.delete(event.gamepad.index);
    this.pollGamepads();
    if (affected.length > 0) {
      this.handlers?.onAssignedControllerDisconnected(affected);
    }
  };

  public constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("gamepadconnected", this.onGamepadConnected);
    window.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    this.rebuildAssignedCodes();
  }

  public setHandlers(handlers: InputHubHandlers): void {
    this.handlers = handlers;
  }

  public activate(): void {
    this.activated = true;
    this.pollGamepads();
  }

  public setGameplayEnabled(enabled: boolean): void {
    this.gameplayEnabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  public configurePlayerSources(
    playerSettings: readonly PlayerInputSettings[],
    activePlayerCount: number,
    analogDeadZone: number,
    analogSensitivity = 1,
  ): void {
    this.playerSettings = playerSettings;
    this.analogDeadZone = Math.min(Math.max(analogDeadZone, 0), 0.5);
    this.analogSensitivity = Math.min(Math.max(analogSensitivity, 0.5), 2);
    this.setActivePlayerCount(activePlayerCount);
    for (let index = 0; index < this.activePlayerCount; index += 1) {
      if (this.playerSettings[index]?.inputType !== "controller") {
        this.controllerAssignments[index] = null;
      }
    }
    this.restoreControllerHints();
  }

  public configureKeyboardBindings(
    bindings: readonly KeyboardBinding[],
    activePlayerCount: number,
  ): void {
    this.playerSettings = bindings.map((keyboard) => ({
      inputType: "keyboard",
      keyboard,
      controllerIdHint: null,
      controllerMappingHint: null,
      controllerCalibration: null,
    }));
    this.setActivePlayerCount(activePlayerCount);
  }

  public setActivePlayerCount(activePlayerCount: number): void {
    this.activePlayerCount = Math.min(
      Math.max(Math.trunc(activePlayerCount), 1),
      Math.min(10, this.playerSettings.length),
    );
    for (let index = this.activePlayerCount; index < 10; index += 1) {
      this.controllerAssignments[index] = null;
    }
    this.clear();
    this.rebuildAssignedCodes();
  }

  public pollGamepads(): void {
    if (!this.activated || !("getGamepads" in navigator)) {
      return;
    }
    try {
      this.gamepads = navigator.getGamepads();
    } catch {
      this.gamepads = [];
    }
    this.clearMissingAssignments();
    this.restoreControllerHints();
    this.pollMenuButtons();

    const signature = this.connectedGamepads
      .map((gamepad) => `${String(gamepad.index)}:${gamepad.id}:${gamepad.mapping}`)
      .join("|");
    if (signature !== this.deviceSignature) {
      this.deviceSignature = signature;
      this.handlers?.onDevicesChanged();
    }
  }

  public assignController(
    playerIndex: number,
    gamepadIndex: number | null,
  ): ControllerAssignmentResult {
    if (
      !Number.isInteger(playerIndex) ||
      playerIndex < 0 ||
      playerIndex >= this.activePlayerCount
    ) {
      throw new RangeError(`Player ${String(playerIndex + 1)} is not active.`);
    }
    if (gamepadIndex === null) {
      this.controllerAssignments[playerIndex] = null;
      return { playerIndex, gamepadIndex: null };
    }
    const gamepad = this.gamepads[gamepadIndex];
    if (gamepad === null || gamepad === undefined || !gamepad.connected) {
      throw new RangeError(`Gamepad ${String(gamepadIndex)} is not connected.`);
    }
    const owner = this.controllerAssignments.findIndex(
      (assigned, index) => assigned === gamepadIndex && index !== playerIndex,
    );
    if (owner >= 0) {
      throw new Error(
        `Gamepad ${String(gamepadIndex + 1)} is already assigned to P${String(owner + 1)}.`,
      );
    }
    this.controllerAssignments[playerIndex] = gamepadIndex;
    return { playerIndex, gamepadIndex };
  }

  public getControllerAssignment(playerIndex: number): number | null {
    return this.controllerAssignments[playerIndex] ?? null;
  }

  public getControllerAssignments(): readonly (number | null)[] {
    return this.controllerAssignments.slice(0, this.activePlayerCount);
  }

  public getKeyboardAxes(): LogicalAxes {
    return this.getPlayerAxes(0);
  }

  public getPlayerAxes(playerIndex: number): LogicalAxes {
    const axes: MutableLogicalAxes = { horizontal: 0, vertical: 0, brake: false };
    this.writePlayerAxes(playerIndex, axes);
    return axes;
  }

  public writePlayerAxes(playerIndex: number, output: MutableLogicalAxes): void {
    const settings = this.playerSettings[playerIndex];
    if (
      !this.gameplayEnabled ||
      playerIndex < 0 ||
      playerIndex >= this.activePlayerCount ||
      settings === undefined
    ) {
      this.clearAxes(output);
      return;
    }

    if (settings.inputType === "controller") {
      const assignment = this.controllerAssignments[playerIndex];
      const gamepad =
        assignment === null || assignment === undefined ? undefined : this.gamepads[assignment];
      if (gamepad === null || gamepad === undefined || !gamepad.connected) {
        this.clearAxes(output);
        return;
      }
      const calibration =
        gamepad.mapping === "standard"
          ? {
              horizontalAxis: 0,
              verticalAxis: 1,
              horizontalSign: 1,
              verticalSign: -1,
            }
          : settings.controllerCalibration;
      if (calibration === null) {
        this.clearAxes(output);
        return;
      }
      output.horizontal = applyAnalogSensitivity(
        applyAnalogDeadZone(
          (gamepad.axes[calibration.horizontalAxis] ?? 0) * calibration.horizontalSign,
          this.analogDeadZone,
        ),
        this.analogSensitivity,
      );
      output.vertical = applyAnalogSensitivity(
        applyAnalogDeadZone(
          (gamepad.axes[calibration.verticalAxis] ?? 0) * calibration.verticalSign,
          this.analogDeadZone,
        ),
        this.analogSensitivity,
      );
      output.brake =
        gamepad.mapping === "standard" &&
        (gamepad.buttons[4]?.pressed === true ||
          gamepad.buttons[5]?.pressed === true ||
          (gamepad.buttons[4]?.value ?? 0) > 0.5 ||
          (gamepad.buttons[5]?.value ?? 0) > 0.5);
      return;
    }

    const binding = settings.keyboard;
    output.horizontal =
      Number(this.heldCodes.has(binding.right)) - Number(this.heldCodes.has(binding.left));
    output.vertical =
      Number(this.heldCodes.has(binding.up)) - Number(this.heldCodes.has(binding.down));
    output.brake = this.heldCodes.has(binding.brake);
  }

  public get connectedGamepads(): readonly Gamepad[] {
    return this.gamepads.filter(
      (gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected,
    );
  }

  public clear(): void {
    this.heldCodes.clear();
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("gamepadconnected", this.onGamepadConnected);
    window.removeEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    this.clear();
    this.handlers = undefined;
  }

  private clearAxes(output: MutableLogicalAxes): void {
    output.horizontal = EMPTY_AXES.horizontal;
    output.vertical = EMPTY_AXES.vertical;
    output.brake = EMPTY_AXES.brake;
  }

  private rebuildAssignedCodes(): void {
    this.assignedCodes.clear();
    for (let index = 0; index < this.activePlayerCount; index += 1) {
      const settings = this.playerSettings[index];
      if (settings === undefined || settings.inputType !== "keyboard") {
        continue;
      }
      this.assignedCodes.add(settings.keyboard.up);
      this.assignedCodes.add(settings.keyboard.down);
      this.assignedCodes.add(settings.keyboard.left);
      this.assignedCodes.add(settings.keyboard.right);
      this.assignedCodes.add(settings.keyboard.brake);
    }
  }

  private clearMissingAssignments(): void {
    const affected: number[] = [];
    for (let index = 0; index < this.activePlayerCount; index += 1) {
      const assigned = this.controllerAssignments[index];
      if (assigned === null || assigned === undefined) {
        continue;
      }
      const gamepad = this.gamepads[assigned];
      if (gamepad === null || gamepad === undefined || !gamepad.connected) {
        this.controllerAssignments[index] = null;
        affected.push(index);
      }
    }
    if (affected.length > 0) {
      this.handlers?.onAssignedControllerDisconnected(affected);
    }
  }

  private restoreControllerHints(): void {
    const claimed = new Set(
      this.controllerAssignments.filter((index): index is number => index !== null),
    );
    const connected = this.connectedGamepads;
    for (let playerIndex = 0; playerIndex < this.activePlayerCount; playerIndex += 1) {
      const settings = this.playerSettings[playerIndex];
      if (
        settings?.inputType !== "controller" ||
        this.controllerAssignments[playerIndex] !== null ||
        settings.controllerIdHint === null
      ) {
        continue;
      }
      const matches = connected.filter(
        (gamepad) =>
          gamepad.id === settings.controllerIdHint &&
          (settings.controllerMappingHint === null ||
            gamepad.mapping === settings.controllerMappingHint) &&
          !claimed.has(gamepad.index),
      );
      if (matches.length === 1) {
        const match = matches[0];
        if (match !== undefined) {
          this.controllerAssignments[playerIndex] = match.index;
          claimed.add(match.index);
        }
      }
    }
  }

  private pollMenuButtons(): void {
    let requested = false;
    for (const gamepad of this.connectedGamepads) {
      if (gamepad.mapping !== "standard") {
        continue;
      }
      const pressed = gamepad.buttons[9]?.pressed === true;
      const previous = this.previousMenuButton.get(gamepad.index) ?? false;
      if (pressed && !previous) {
        requested = true;
      }
      this.previousMenuButton.set(gamepad.index, pressed);
    }
    if (requested) {
      this.handlers?.onPauseRequested();
    }
  }
}
