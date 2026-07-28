import { PLAYER_COLORS } from "../config/player-colors";
import type { KeyboardBinding } from "../input/bindings";
import {
  createDefaultSettings,
  type GameSettings,
  type PlayerInputSettings,
  type PlayerInputType,
} from "../persistence/schema";
import {
  ControllerNavigationTracker,
  type ControllerNavigationIntent,
} from "./controller-navigation";

export type ScreenName =
  "loading" | "activation" | "main" | "modes" | "players" | "options" | "pause" | "error";

export interface UiHandlers {
  readonly activate: () => void | Promise<void>;
  readonly playSandbox: () => void | Promise<void>;
  readonly pauseToggle: () => void;
  readonly resetSandbox: () => void | Promise<void>;
  readonly returnToMenu: () => void;
  readonly fullscreenToggle: () => void | Promise<void>;
  readonly settingsChanged: (patch: Partial<Omit<GameSettings, "schemaVersion">>) => void;
  readonly controllerAssigned: (zeroBasedPlayerIndex: number, gamepadIndex: number | null) => void;
  /**
   * Optional integration point for SettingsService.resetToDefaults(). When it
   * is absent, UiController emits a complete default settings patch instead.
   */
  readonly resetSettings?: () => void | Promise<void>;
}

type BindingDirection = keyof KeyboardBinding;
type NavigationDirection = Extract<ControllerNavigationIntent, "up" | "down" | "left" | "right">;
type OptionsSettingsPatch = Pick<
  Omit<GameSettings, "schemaVersion">,
  | "renderScale"
  | "aaQuality"
  | "ambientOcclusion"
  | "vignette"
  | "shadowQuality"
  | "fullscreenPreference"
  | "uiScale"
  | "markerSize"
  | "analogDeadZone"
  | "analogSensitivity"
  | "masterVolume"
  | "effectsVolume"
  | "musicVolume"
  | "reducedMotion"
  | "cameraSmoothing"
  | "particleDensity"
  | "highContrastInteractables"
  | "automaticUprightRecovery"
>;

const BINDING_DIRECTIONS: readonly BindingDirection[] = ["up", "down", "left", "right"];
const RESERVED_BINDINGS = new Set(["Escape", "KeyP"]);
const NAVIGATION_DIRECTIONS = new Map<string, NavigationDirection>([
  ["ArrowUp", "up"],
  ["ArrowDown", "down"],
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
]);
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Required UI element #${id} is missing.`);
  }
  return element as T;
}

function percentage(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export class UiController {
  private readonly screens = new Map<ScreenName, HTMLElement>();
  private readonly controllerNavigation = new ControllerNavigationTracker();
  private handlers: UiHandlers | undefined;
  private settings: GameSettings | undefined;
  private currentScreen: ScreenName = "loading";
  private selectedPlayerIndex = 0;
  private gamepads: readonly Gamepad[] = [];
  private controllerAssignments: readonly (number | null)[] = [];
  private captureDirection: BindingDirection | undefined;
  private toastTimeout: number | undefined;

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (this.captureDirection !== undefined) {
      this.captureBinding(event);
      return;
    }

    if (this.isVisible("activation") && this.isActivationKey(event)) {
      const activationButton = requireElement<HTMLButtonElement>("activate-button");
      const nativeButtonActivation =
        event.target === activationButton && (event.code === "Enter" || event.code === "Space");
      if (!nativeButtonActivation) {
        event.preventDefault();
        event.stopPropagation();
        activationButton.click();
      }
      return;
    }

    if (
      event.code === "Escape" ||
      (event.code === "Backspace" && !this.isEditableTarget(event.target))
    ) {
      if (this.handleCancel()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      this.isDirectionalControlTarget(event.target)
    ) {
      return;
    }

    const direction = NAVIGATION_DIRECTIONS.get(event.code);
    if (direction !== undefined && this.isCurrentScreenVisible()) {
      event.preventDefault();
      this.moveFocus(direction);
      return;
    }

    if (event.code === "Home" && this.isCurrentScreenVisible()) {
      event.preventDefault();
      this.focusBoundary("first");
    } else if (event.code === "End" && this.isCurrentScreenVisible()) {
      event.preventDefault();
      this.focusBoundary("last");
    }
  };

  public constructor() {
    const names: readonly ScreenName[] = [
      "loading",
      "activation",
      "main",
      "modes",
      "players",
      "options",
      "pause",
      "error",
    ];
    for (const name of names) {
      const screen = requireElement(`screen-${name}`);
      this.screens.set(name, screen);
      screen.setAttribute("aria-hidden", String(screen.hidden));
    }

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-screen-target]")) {
      button.addEventListener("click", () => {
        const target = button.dataset["screenTarget"];
        if (target !== undefined && this.isScreenName(target)) {
          this.show(target);
        }
      });
    }

    requireElement<HTMLButtonElement>("activate-button").addEventListener("click", () => {
      void this.handlers?.activate();
    });
    requireElement<HTMLButtonElement>("play-sandbox-button").addEventListener("click", () => {
      void this.handlers?.playSandbox();
    });
    requireElement<HTMLButtonElement>("resume-button").addEventListener("click", () => {
      this.handlers?.pauseToggle();
    });
    requireElement<HTMLButtonElement>("reset-button").addEventListener("click", () => {
      void this.handlers?.resetSandbox();
    });
    requireElement<HTMLButtonElement>("return-menu-button").addEventListener("click", () => {
      this.handlers?.returnToMenu();
    });
    for (const buttonId of ["fullscreen-button", "options-fullscreen-button"]) {
      requireElement<HTMLButtonElement>(buttonId).addEventListener("click", () => {
        void this.handlers?.fullscreenToggle();
      });
    }
    requireElement<HTMLButtonElement>("reload-button").addEventListener("click", () => {
      window.location.reload();
    });
    requireElement<HTMLButtonElement>("reset-defaults-button").addEventListener("click", () => {
      this.resetSettingsToDefaults();
    });

    const playerCount = requireElement<HTMLInputElement>("player-count");
    playerCount.addEventListener("input", () => {
      const value = Number(playerCount.value);
      requireElement<HTMLOutputElement>("player-count-output").value = String(value);
      requireElement("menu-player-count").textContent = String(value).padStart(2, "0");
      this.handlers?.settingsChanged({ playerCount: value });
    });

    requireElement<HTMLSelectElement>("controls-player").addEventListener("change", (event) => {
      const select = event.currentTarget;
      if (select instanceof HTMLSelectElement) {
        this.selectedPlayerIndex = Number(select.value);
        this.cancelBindingCapture();
        this.renderPlayerEditor();
      }
    });

    requireElement<HTMLSelectElement>("input-type").addEventListener("change", (event) => {
      const select = event.currentTarget;
      if (!(select instanceof HTMLSelectElement) || !this.isPlayerInputType(select.value)) {
        return;
      }
      this.updateSelectedPlayerInput((current) => ({
        ...current,
        inputType: select.value as PlayerInputType,
      }));
    });

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-binding-direction]")) {
      button.addEventListener("click", () => {
        const direction = button.dataset["bindingDirection"];
        if (direction !== undefined && this.isBindingDirection(direction)) {
          this.beginBindingCapture(direction);
        }
      });
    }

    requireElement<HTMLSelectElement>("controller-select").addEventListener("change", (event) => {
      const select = event.currentTarget;
      if (!(select instanceof HTMLSelectElement)) {
        return;
      }
      const gamepadIndex = select.value === "" ? null : Number(select.value);
      this.handlers?.controllerAssigned(this.selectedPlayerIndex, gamepadIndex);
    });
    requireElement<HTMLButtonElement>("save-calibration-button").addEventListener("click", () => {
      const horizontalAxis = Number(requireElement<HTMLSelectElement>("horizontal-axis").value);
      const verticalAxis = Number(requireElement<HTMLSelectElement>("vertical-axis").value);
      if (horizontalAxis === verticalAxis) {
        this.showBindingWarning("Steering and drive must use two different controller axes.");
        return;
      }
      this.updateSelectedPlayerInput((current) => ({
        ...current,
        controllerCalibration: Object.freeze({
          horizontalAxis,
          verticalAxis,
          horizontalSign: requireElement<HTMLInputElement>("invert-horizontal").checked ? -1 : 1,
          verticalSign: requireElement<HTMLInputElement>("invert-vertical").checked ? -1 : 1,
        }),
      }));
      this.toast("Controller axis calibration saved.");
    });

    const optionsForm = requireElement<HTMLFormElement>("options-form");
    optionsForm.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "range") {
        this.emitOptionsSettings();
      }
    });
    optionsForm.addEventListener("input", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "range") {
        this.emitOptionsSettings();
      }
    });

    const gameRoot = requireElement("game-root");
    gameRoot.addEventListener(
      "pointermove",
      () => {
        gameRoot.classList.remove("is-controller-navigation");
      },
      { passive: true },
    );
    document.addEventListener("keydown", this.onDocumentKeyDown);
  }

  public connect(handlers: UiHandlers): void {
    this.handlers = handlers;
  }

  public show(name: ScreenName): void {
    this.currentScreen = name;
    requireElement("game-root").dataset["uiScreen"] = name;
    for (const [screenName, element] of this.screens) {
      const hidden = screenName !== name;
      element.hidden = hidden;
      element.setAttribute("aria-hidden", String(hidden));
    }

    this.getFocusableElements()[0]?.focus({ preventScroll: true });
  }

  /**
   * Poll this once per rendered frame after gamepad discovery. Standard D-pad
   * buttons/left-stick axes move focus; A confirms and B cancels.
   */
  public updateControllerNavigation(
    gamepads: readonly Gamepad[] = this.gamepads,
    nowMilliseconds: number = performance.now(),
  ): void {
    const navigationGamepads =
      gamepads.length > 0 ? gamepads : this.readBrowserGamepadsForActivation();
    const intents = this.controllerNavigation.update(navigationGamepads, nowMilliseconds);
    if (!this.isCurrentScreenVisible() || intents.length === 0) {
      return;
    }

    requireElement("game-root").classList.add("is-controller-navigation");

    if (intents.includes("cancel")) {
      this.handleCancel();
      return;
    }
    if (intents.includes("confirm")) {
      this.activateFocusedControl();
      return;
    }

    const direction = intents.find(
      (intent): intent is NavigationDirection =>
        intent === "up" || intent === "down" || intent === "left" || intent === "right",
    );
    if (direction !== undefined) {
      this.moveFocus(direction);
    }
  }

  public setLoadingStatus(message: string): void {
    requireElement("loading-status").textContent = message;
  }

  public applySettings(settings: GameSettings): void {
    this.settings = settings;
    this.selectedPlayerIndex = Math.min(this.selectedPlayerIndex, settings.playerCount - 1);
    const playerCount = requireElement<HTMLInputElement>("player-count");
    playerCount.value = String(settings.playerCount);
    requireElement<HTMLOutputElement>("player-count-output").value = String(settings.playerCount);
    requireElement("menu-player-count").textContent = String(settings.playerCount).padStart(2, "0");

    requireElement<HTMLSelectElement>("render-scale").value = String(settings.renderScale);
    requireElement<HTMLSelectElement>("aa-quality").value = settings.aaQuality;
    requireElement<HTMLSelectElement>("shadow-quality").value = settings.shadowQuality;
    requireElement<HTMLInputElement>("ambient-occlusion").checked = settings.ambientOcclusion;
    requireElement<HTMLInputElement>("vignette").checked = settings.vignette;
    requireElement<HTMLInputElement>("fullscreen-preference").checked =
      settings.fullscreenPreference;
    requireElement<HTMLInputElement>("ui-scale").value = String(settings.uiScale);
    requireElement<HTMLSelectElement>("marker-size").value = settings.markerSize;
    requireElement<HTMLInputElement>("analog-dead-zone").value = String(settings.analogDeadZone);
    requireElement<HTMLInputElement>("analog-sensitivity").value = String(
      settings.analogSensitivity,
    );
    requireElement<HTMLInputElement>("master-volume").value = String(settings.masterVolume);
    requireElement<HTMLInputElement>("effects-volume").value = String(settings.effectsVolume);
    requireElement<HTMLInputElement>("music-volume").value = String(settings.musicVolume);
    requireElement<HTMLInputElement>("reduced-motion").checked = settings.reducedMotion;
    requireElement<HTMLSelectElement>("camera-smoothing").value = settings.cameraSmoothing;
    requireElement<HTMLSelectElement>("particle-density").value = settings.particleDensity;
    requireElement<HTMLInputElement>("high-contrast-interactables").checked =
      settings.highContrastInteractables;
    requireElement<HTMLInputElement>("automatic-upright-recovery").checked =
      settings.automaticUprightRecovery;

    this.renderOptionOutputs(settings);
    this.applyPresentationHooks(settings);
    this.renderPlayerEditor();
  }

  public updateControllers(
    gamepads: readonly Gamepad[],
    assignments: readonly (number | null)[],
  ): void {
    this.gamepads = gamepads;
    this.controllerAssignments = assignments;
    this.renderPlayerEditor();
  }

  public updateFullscreen(active: boolean): void {
    const label = active ? "EXIT FULLSCREEN" : "ENTER FULLSCREEN";
    for (const buttonId of ["fullscreen-button", "options-fullscreen-button"]) {
      const button = requireElement<HTMLButtonElement>(buttonId);
      button.querySelector("span")?.replaceChildren(label);
      button.setAttribute("aria-pressed", String(active));
    }
    requireElement<HTMLOutputElement>("fullscreen-state").value = active
      ? "FULLSCREEN ACTIVE"
      : "WINDOWED";
    requireElement("game-root").dataset["fullscreenActive"] = String(active);
  }

  public toast(message: string): void {
    const toast = requireElement("toast");
    toast.textContent = message;
    toast.hidden = false;
    if (this.toastTimeout !== undefined) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      toast.hidden = true;
    }, 4_000);
  }

  public showError(message: string): void {
    requireElement("error-message").textContent = message;
    this.show("error");
  }

  private captureBinding(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      this.cancelBindingCapture();
      this.toast("Binding capture canceled.");
      return;
    }
    if (RESERVED_BINDINGS.has(event.code)) {
      this.showBindingWarning(
        `${this.formatCode(event.code)} is reserved for pause and cannot drive a car.`,
      );
      return;
    }
    const direction = this.captureDirection;
    if (direction === undefined) {
      return;
    }
    const current = this.settings?.playerInputs[this.selectedPlayerIndex];
    const duplicateDirection = BINDING_DIRECTIONS.find(
      (candidate) => candidate !== direction && current?.keyboard[candidate] === event.code,
    );
    if (duplicateDirection !== undefined) {
      this.showBindingWarning(
        `${this.formatCode(event.code)} already controls ${duplicateDirection} for this player.`,
      );
      return;
    }
    this.cancelBindingCapture();
    this.updateSelectedPlayerInput((input) => ({
      ...input,
      keyboard: Object.freeze({ ...input.keyboard, [direction]: event.code }),
    }));
  }

  private isScreenName(value: string): value is ScreenName {
    return this.screens.has(value as ScreenName);
  }

  private readBrowserGamepadsForActivation(): readonly Gamepad[] {
    if (!("getGamepads" in navigator)) {
      return [];
    }
    try {
      return [...navigator.getGamepads()].filter(
        (gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected,
      );
    } catch {
      return [];
    }
  }

  private isPlayerInputType(value: string): value is PlayerInputType {
    return value === "keyboard" || value === "controller";
  }

  private isBindingDirection(value: string): value is BindingDirection {
    return BINDING_DIRECTIONS.includes(value as BindingDirection);
  }

  private isVisible(name: ScreenName): boolean {
    return this.screens.get(name)?.hidden === false;
  }

  private isCurrentScreenVisible(): boolean {
    return this.isVisible(this.currentScreen);
  }

  private isActivationKey(event: KeyboardEvent): boolean {
    return (
      !event.repeat &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.code !== "Tab" &&
      event.key !== "Shift"
    );
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        !["button", "checkbox", "radio", "range", "reset", "submit"].includes(target.type))
    );
  }

  private isDirectionalControlTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        ["range", "number", "text", "search", "url", "email", "password"].includes(target.type))
    );
  }

  private handleCancel(): boolean {
    if (!this.isCurrentScreenVisible()) {
      return false;
    }
    if (
      this.currentScreen === "modes" ||
      this.currentScreen === "players" ||
      this.currentScreen === "options"
    ) {
      this.cancelBindingCapture();
      this.show("main");
      return true;
    }
    if (this.currentScreen === "pause") {
      this.handlers?.pauseToggle();
      return true;
    }
    return false;
  }

  private getFocusableElements(): HTMLElement[] {
    const screen = this.screens.get(this.currentScreen);
    if (screen === undefined || screen.hidden) {
      return [];
    }
    return [...screen.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => {
      if (element.closest("[hidden]") !== null || element.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  private focusBoundary(boundary: "first" | "last"): void {
    const elements = this.getFocusableElements();
    const target = boundary === "first" ? elements[0] : elements.at(-1);
    target?.focus({ preventScroll: true });
  }

  private moveFocus(direction: NavigationDirection): void {
    const active = document.activeElement;
    if (
      (direction === "left" || direction === "right") &&
      active instanceof HTMLElement &&
      this.adjustFocusedControl(active, direction)
    ) {
      return;
    }

    const elements = this.getFocusableElements();
    if (elements.length === 0) {
      return;
    }
    const current = active instanceof HTMLElement ? active : undefined;
    const currentIndex = current === undefined ? -1 : elements.indexOf(current);
    if (currentIndex < 0 || current === undefined) {
      const target = direction === "up" || direction === "left" ? elements.at(-1) : elements[0];
      target?.focus({ preventScroll: true });
      return;
    }

    const spatialTarget = this.findSpatialTarget(current, elements, direction);
    if (spatialTarget !== undefined) {
      spatialTarget.focus({ preventScroll: true });
      return;
    }

    const increment = direction === "up" || direction === "left" ? -1 : 1;
    const wrappedIndex = (currentIndex + increment + elements.length) % elements.length;
    elements[wrappedIndex]?.focus({ preventScroll: true });
  }

  private findSpatialTarget(
    current: HTMLElement,
    elements: readonly HTMLElement[],
    direction: NavigationDirection,
  ): HTMLElement | undefined {
    const source = current.getBoundingClientRect();
    if (source.width === 0 && source.height === 0) {
      return undefined;
    }
    const sourceX = source.left + source.width / 2;
    const sourceY = source.top + source.height / 2;
    let best: { readonly element: HTMLElement; readonly score: number } | undefined;

    for (const candidate of elements) {
      if (candidate === current) {
        continue;
      }
      const rect = candidate.getBoundingClientRect();
      const deltaX = rect.left + rect.width / 2 - sourceX;
      const deltaY = rect.top + rect.height / 2 - sourceY;
      const primary =
        direction === "up"
          ? -deltaY
          : direction === "down"
            ? deltaY
            : direction === "left"
              ? -deltaX
              : deltaX;
      if (primary <= 1) {
        continue;
      }
      const secondary =
        direction === "up" || direction === "down" ? Math.abs(deltaX) : Math.abs(deltaY);
      const offAxisPenalty = secondary > primary * 1.8 ? 10_000 : 0;
      const score = primary * 4 + secondary + offAxisPenalty;
      if (best === undefined || score < best.score) {
        best = { element: candidate, score };
      }
    }
    return best?.element;
  }

  private adjustFocusedControl(element: HTMLElement, direction: "left" | "right"): boolean {
    const increment = direction === "left" ? -1 : 1;
    if (element instanceof HTMLSelectElement) {
      const options = [...element.options];
      let nextIndex = element.selectedIndex;
      do {
        nextIndex += increment;
      } while (
        nextIndex >= 0 &&
        nextIndex < options.length &&
        (options[nextIndex]?.disabled === true || options[nextIndex]?.hidden === true)
      );
      if (nextIndex < 0 || nextIndex >= options.length) {
        return true;
      }
      element.selectedIndex = nextIndex;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (element instanceof HTMLInputElement && element.type === "range") {
      const minimum = Number(element.min);
      const maximum = Number(element.max);
      const step = Number(element.step || 1);
      const nextValue = clamp(Number(element.value) + step * increment, minimum, maximum);
      element.value = String(nextValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  private activateFocusedControl(): void {
    const elements = this.getFocusableElements();
    const active = document.activeElement;
    const target =
      active instanceof HTMLElement && elements.includes(active) ? active : elements[0];
    if (target === undefined) {
      return;
    }
    if (target instanceof HTMLSelectElement) {
      this.adjustFocusedControl(target, "right");
      return;
    }
    target.focus({ preventScroll: true });
    target.click();
  }

  private beginBindingCapture(direction: BindingDirection): void {
    this.captureDirection = direction;
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-binding-direction]")) {
      const active = button.dataset["bindingDirection"] === direction;
      button.classList.toggle("is-capturing", active);
      button.setAttribute("aria-pressed", String(active));
      if (active) {
        button.querySelector("strong")?.replaceChildren("PRESS A KEY…");
      }
    }
    this.showBindingWarning("Press a key, or Escape to cancel.");
  }

  private cancelBindingCapture(): void {
    this.captureDirection = undefined;
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-binding-direction]")) {
      button.classList.remove("is-capturing");
      button.setAttribute("aria-pressed", "false");
    }
    this.renderPlayerEditor();
  }

  private updateSelectedPlayerInput(
    update: (current: PlayerInputSettings) => PlayerInputSettings,
  ): void {
    const settings = this.settings;
    const current = settings?.playerInputs[this.selectedPlayerIndex];
    if (settings === undefined || current === undefined) {
      return;
    }
    const playerInputs = settings.playerInputs.map((input, index) =>
      index === this.selectedPlayerIndex ? update(input) : input,
    );
    this.handlers?.settingsChanged({ playerInputs });
  }

  private emitOptionsSettings(): void {
    const patch = this.readOptionsSettings();
    const current = this.settings;
    if (current !== undefined) {
      const nextSettings: GameSettings = Object.freeze({ ...current, ...patch });
      this.renderOptionOutputs(nextSettings);
      this.applyPresentationHooks(nextSettings);
    }
    requireElement("options-status").textContent = "Changes applied and saved.";
    this.handlers?.settingsChanged(patch);
  }

  private readOptionsSettings(): OptionsSettingsPatch {
    return {
      renderScale: Number(
        requireElement<HTMLSelectElement>("render-scale").value,
      ) as GameSettings["renderScale"],
      aaQuality: requireElement<HTMLSelectElement>("aa-quality").value as GameSettings["aaQuality"],
      ambientOcclusion: requireElement<HTMLInputElement>("ambient-occlusion").checked,
      vignette: requireElement<HTMLInputElement>("vignette").checked,
      shadowQuality: requireElement<HTMLSelectElement>("shadow-quality")
        .value as GameSettings["shadowQuality"],
      fullscreenPreference: requireElement<HTMLInputElement>("fullscreen-preference").checked,
      uiScale: Number(requireElement<HTMLInputElement>("ui-scale").value),
      markerSize: requireElement<HTMLSelectElement>("marker-size")
        .value as GameSettings["markerSize"],
      analogDeadZone: Number(requireElement<HTMLInputElement>("analog-dead-zone").value),
      analogSensitivity: Number(requireElement<HTMLInputElement>("analog-sensitivity").value),
      masterVolume: Number(requireElement<HTMLInputElement>("master-volume").value),
      effectsVolume: Number(requireElement<HTMLInputElement>("effects-volume").value),
      musicVolume: Number(requireElement<HTMLInputElement>("music-volume").value),
      reducedMotion: requireElement<HTMLInputElement>("reduced-motion").checked,
      cameraSmoothing: requireElement<HTMLSelectElement>("camera-smoothing")
        .value as GameSettings["cameraSmoothing"],
      particleDensity: requireElement<HTMLSelectElement>("particle-density")
        .value as GameSettings["particleDensity"],
      highContrastInteractables: requireElement<HTMLInputElement>("high-contrast-interactables")
        .checked,
      automaticUprightRecovery: requireElement<HTMLInputElement>("automatic-upright-recovery")
        .checked,
    };
  }

  private renderOptionOutputs(settings: GameSettings): void {
    requireElement<HTMLOutputElement>("ui-scale-output").value = percentage(settings.uiScale);
    requireElement<HTMLOutputElement>("analog-dead-zone-output").value = percentage(
      settings.analogDeadZone,
    );
    requireElement<HTMLOutputElement>("analog-sensitivity-output").value =
      `${settings.analogSensitivity.toFixed(2)}×`;
    requireElement<HTMLOutputElement>("master-volume-output").value = percentage(
      settings.masterVolume,
    );
    requireElement<HTMLOutputElement>("effects-volume-output").value = percentage(
      settings.effectsVolume,
    );
    requireElement<HTMLOutputElement>("music-volume-output").value = percentage(
      settings.musicVolume,
    );
    requireElement("fullscreen-preference-summary").textContent = settings.fullscreenPreference
      ? "Saved preference: remind me to enter fullscreen"
      : "Saved preference: windowed play";
  }

  private applyPresentationHooks(settings: GameSettings): void {
    document.documentElement.style.setProperty("--ui-scale", settings.uiScale.toFixed(2));
    const root = requireElement("game-root");
    root.dataset["markerSize"] = settings.markerSize;
    root.dataset["reducedMotion"] = String(settings.reducedMotion);
    root.dataset["cameraSmoothing"] = settings.cameraSmoothing;
    root.dataset["particleDensity"] = settings.particleDensity;
    root.dataset["highContrastInteractables"] = String(settings.highContrastInteractables);
    root.dataset["automaticUprightRecovery"] = String(settings.automaticUprightRecovery);
    root.dataset["fullscreenPreference"] = String(settings.fullscreenPreference);
  }

  private resetSettingsToDefaults(): void {
    const defaults = createDefaultSettings({
      prefersReducedMotion:
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    this.applySettings(defaults);
    if (this.handlers?.resetSettings !== undefined) {
      void this.handlers.resetSettings();
    } else {
      const { schemaVersion: _schemaVersion, ...patch } = defaults;
      void _schemaVersion;
      this.handlers?.settingsChanged(patch);
    }
    requireElement("options-status").textContent = "All settings and controls reset to defaults.";
    this.toast("Default settings restored.");
  }

  private renderPlayerEditor(): void {
    const settings = this.settings;
    if (settings === undefined) {
      return;
    }

    const playerSelect = requireElement<HTMLSelectElement>("controls-player");
    for (const option of playerSelect.options) {
      option.disabled = Number(option.value) >= settings.playerCount;
    }
    playerSelect.value = String(this.selectedPlayerIndex);

    const input = settings.playerInputs[this.selectedPlayerIndex];
    if (input === undefined) {
      return;
    }

    requireElement("player-color-chip").style.backgroundColor =
      PLAYER_COLORS[this.selectedPlayerIndex] ?? "#FFFFFF";
    requireElement<HTMLSelectElement>("input-type").value = input.inputType;
    requireElement("keyboard-settings").hidden = input.inputType !== "keyboard";
    requireElement("controller-settings").hidden = input.inputType !== "controller";

    for (const direction of BINDING_DIRECTIONS) {
      const button = document.querySelector<HTMLButtonElement>(
        `[data-binding-direction="${direction}"]`,
      );
      const label = requireElement(`binding-${direction}`);
      label.textContent = this.formatCode(input.keyboard[direction]);
      button?.setAttribute(
        "aria-label",
        `Player ${String(this.selectedPlayerIndex + 1)} ${direction}: ${this.formatCode(
          input.keyboard[direction],
        )}. Activate to rebind.`,
      );
    }

    this.renderControllerSelector(input);
    this.renderConflictWarning();
  }

  private renderControllerSelector(input: PlayerInputSettings): void {
    const select = requireElement<HTMLSelectElement>("controller-select");
    const assigned = this.controllerAssignments[this.selectedPlayerIndex] ?? null;
    select.replaceChildren();

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent =
      this.gamepads.length === 0 ? "No controller connected" : "Choose a controller";
    select.append(empty);

    for (const gamepad of this.gamepads) {
      const option = document.createElement("option");
      option.value = String(gamepad.index);
      option.textContent = `Gamepad ${String(gamepad.index + 1)} — ${gamepad.id}`;
      const owner = this.controllerAssignments.findIndex(
        (candidate, index) => candidate === gamepad.index && index !== this.selectedPlayerIndex,
      );
      option.disabled = owner >= 0;
      if (owner >= 0) {
        option.textContent += ` (P${String(owner + 1)})`;
      }
      select.append(option);
    }
    select.value = assigned === null ? "" : String(assigned);

    const status = requireElement("controller-status");
    const selectedGamepad = this.gamepads.find((gamepad) => gamepad.index === assigned);
    this.renderControllerCalibration(input, selectedGamepad);
    if (!("getGamepads" in navigator)) {
      status.textContent =
        "This browser does not expose the Gamepad API. Keyboard play remains available.";
    } else if (this.gamepads.length === 0) {
      status.textContent =
        input.controllerIdHint === null
          ? "Connect a controller, then press one of its buttons."
          : `Waiting to reconnect ${input.controllerIdHint}.`;
    } else if (selectedGamepad?.mapping !== "standard") {
      status.textContent =
        input.controllerCalibration === null
          ? "This controller has a non-standard mapping. Save an explicit axis calibration before driving."
          : "Non-standard mapping calibrated. Test the axes in Sandbox and adjust if needed.";
    } else if (selectedGamepad !== undefined) {
      status.textContent = `Assigned: Gamepad ${String(
        selectedGamepad.index + 1,
      )} (${selectedGamepad.mapping || "unmapped"}).`;
    } else {
      status.textContent = `${String(this.gamepads.length)} controller${
        this.gamepads.length === 1 ? "" : "s"
      } available.`;
    }
  }

  private renderControllerCalibration(
    input: PlayerInputSettings,
    gamepad: Gamepad | undefined,
  ): void {
    const fieldset = requireElement<HTMLFieldSetElement>("controller-calibration");
    const requiresCalibration = gamepad !== undefined && gamepad.mapping !== "standard";
    fieldset.hidden = !requiresCalibration;
    if (!requiresCalibration) {
      return;
    }

    const horizontalSelect = requireElement<HTMLSelectElement>("horizontal-axis");
    const verticalSelect = requireElement<HTMLSelectElement>("vertical-axis");
    horizontalSelect.replaceChildren();
    verticalSelect.replaceChildren();
    const axisCount = Math.max(gamepad.axes.length, 2);
    for (let index = 0; index < axisCount; index += 1) {
      const horizontalOption = document.createElement("option");
      horizontalOption.value = String(index);
      horizontalOption.textContent = `Axis ${String(index)} (${(gamepad.axes[index] ?? 0).toFixed(
        2,
      )})`;
      horizontalSelect.append(horizontalOption);
      verticalSelect.append(horizontalOption.cloneNode(true));
    }
    horizontalSelect.value = String(input.controllerCalibration?.horizontalAxis ?? 0);
    verticalSelect.value = String(input.controllerCalibration?.verticalAxis ?? 1);
    requireElement<HTMLInputElement>("invert-horizontal").checked =
      input.controllerCalibration?.horizontalSign === -1;
    requireElement<HTMLInputElement>("invert-vertical").checked =
      input.controllerCalibration?.verticalSign !== 1;
  }

  private renderConflictWarning(): void {
    const settings = this.settings;
    if (settings === undefined) {
      return;
    }
    const owners = new Map<string, number[]>();
    for (let index = 0; index < settings.playerCount; index += 1) {
      const input = settings.playerInputs[index];
      if (input?.inputType !== "keyboard") {
        continue;
      }
      for (const code of [
        input.keyboard.up,
        input.keyboard.down,
        input.keyboard.left,
        input.keyboard.right,
      ]) {
        const players = owners.get(code) ?? [];
        if (!players.includes(index)) {
          players.push(index);
        }
        owners.set(code, players);
      }
    }
    const conflicts = [...owners.entries()].filter(([, players]) => players.length > 1);
    if (conflicts.length === 0) {
      this.showBindingWarning();
      return;
    }
    this.showBindingWarning(
      `Binding conflict: ${conflicts
        .map(
          ([code, players]) =>
            `${this.formatCode(code)} is shared by ${players
              .map((index) => `P${String(index + 1)}`)
              .join(", ")}`,
        )
        .join("; ")}.`,
    );
  }

  private showBindingWarning(message?: string): void {
    const warning = requireElement("binding-warning");
    warning.hidden = message === undefined;
    warning.textContent = message ?? "";
  }

  private formatCode(code: string): string {
    return code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace(/^Arrow/, "Arrow ")
      .replace(/^Numpad/, "Numpad ");
  }
}
