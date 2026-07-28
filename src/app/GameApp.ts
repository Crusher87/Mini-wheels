import { AudioService } from "../audio/AudioService";
import { SIMULATION_CONFIG } from "../config/runtime-defaults";
import { RuntimePerformanceMonitor } from "../dev/RuntimePerformanceMonitor";
import { InputHub, type MutableLogicalAxes } from "../input/InputHub";
import { initializeRapier, type RapierModule } from "../physics/rapier-init";
import { RenderSystem } from "../render/RenderSystem";
import { SettingsService } from "../persistence/SettingsService";
import type { GameSettings } from "../persistence/schema";
import { UiController } from "../ui/UiController";
import { WorldSession } from "../world/WorldSession";
import { AppState, type AppState as AppStateValue } from "./AppState";
import { FixedStepLoop } from "./FixedStepLoop";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface GameAppDebugSnapshot {
  readonly state: AppStateValue;
  readonly sessionGeneration: number;
  readonly activeWorldSessionRootCount: number;
  readonly markerElementCount: number;
}

export class GameApp {
  private state: AppStateValue = AppState.Boot;
  private readonly settingsService = new SettingsService(GameApp.safeStorage());
  private readonly ui = new UiController();
  private readonly audio = new AudioService();
  private readonly input = new InputHub();
  private readonly playerAxes: MutableLogicalAxes[] = Array.from({ length: 10 }, () => ({
    horizontal: 0,
    vertical: 0,
  }));
  private readonly engineSpeeds = new Float32Array(10);
  private readonly engineThrottles = new Float32Array(10);
  private readonly engineAudioStates = Array.from({ length: 10 }, () => ({
    active: false,
    speedNormalized: 0,
    throttle: 0,
    pan: 0,
  }));
  private readonly fixedStep = new FixedStepLoop({
    fixedDeltaSeconds: SIMULATION_CONFIG.fixedTimestepSeconds,
    maxFrameDeltaSeconds: SIMULATION_CONFIG.maxFrameDeltaSeconds,
    maxStepsPerFrame: SIMULATION_CONFIG.maxPhysicsStepsPerRender,
  });
  private readonly performanceMonitor = new RuntimePerformanceMonitor();

  private renderSystem: RenderSystem | undefined;
  private rapier: RapierModule | undefined;
  private worldSession: WorldSession | undefined;
  private animationFrame: number | undefined;
  private uninstallTestApi: (() => void) | undefined;
  private previousNow = performance.now();
  private sessionGeneration = 0;
  private disposed = false;

  private readonly runFixedStep = (): void => {
    const session = this.worldSession;
    if (session === undefined) {
      return;
    }
    for (let index = 0; index < session.playerCount; index += 1) {
      const axes = this.playerAxes[index];
      if (axes !== undefined) {
        this.input.writePlayerAxes(index, axes);
      }
    }
    const startedAt = performance.now();
    session.step(this.playerAxes);
    const audioVehicleCount = session.writeVehicleAudioTelemetry(
      this.engineSpeeds,
      this.engineThrottles,
    );
    for (let index = 0; index < this.engineAudioStates.length; index += 1) {
      const audioState = this.engineAudioStates[index];
      if (audioState === undefined) {
        continue;
      }
      audioState.active = index < audioVehicleCount;
      audioState.speedNormalized = this.engineSpeeds[index] ?? 0;
      audioState.throttle = this.engineThrottles[index] ?? 0;
      this.audio.updateEngineVoice(index, audioState);
    }
    this.performanceMonitor.recordPhysicsStep(performance.now() - startedAt);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (
      (event.code === "Escape" || event.code === "KeyP") &&
      (this.state === AppState.Playing || this.state === AppState.Paused)
    ) {
      event.preventDefault();
      this.togglePause();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden && this.state === AppState.Playing) {
      this.pause("Paused because the tab was hidden.");
    }
    void this.audio.setPageHidden(document.hidden);
    this.fixedStep.reset();
    this.previousNow = performance.now();
  };

  private readonly onBlur = (): void => {
    this.input.clear();
    if (this.state === AppState.Playing) {
      this.pause("Paused because the window lost focus.");
    }
  };

  private readonly onFullscreenChange = (): void => {
    const active = document.fullscreenElement != null;
    this.ui.updateFullscreen(active);
    if (!active && this.state === AppState.Playing) {
      this.pause("Paused after leaving fullscreen.");
    }
  };

  private readonly onUiFocusIn = (event: FocusEvent): void => {
    if (
      this.audio.isUnlocked &&
      event.target instanceof HTMLElement &&
      event.target.matches("button, input, select")
    ) {
      this.audio.playUiFocus();
    }
  };

  private readonly onUiClick = (event: MouseEvent): void => {
    if (!this.audio.isUnlocked || !(event.target instanceof Element)) {
      return;
    }
    const button = event.target.closest("button");
    if (button === null) {
      return;
    }
    if (button.getAttribute("aria-label") === "Back" || button.id === "return-menu-button") {
      this.audio.playUiBack();
    } else {
      this.audio.playUiConfirm();
    }
  };

  public async initialize(): Promise<void> {
    try {
      this.ui.connect({
        activate: async () => this.activate(),
        playSandbox: async () => this.startSandbox(),
        pauseToggle: () => this.togglePause(),
        resetSandbox: async () => this.resetSandbox(),
        returnToMenu: () => this.returnToMenu(),
        fullscreenToggle: async () => this.toggleFullscreen(),
        settingsChanged: (patch) => this.updateSettings(patch),
        resetSettings: () => this.resetSettings(),
        controllerAssigned: (playerIndex, gamepadIndex) =>
          this.assignController(playerIndex, gamepadIndex),
      });
      this.input.setHandlers({
        onPauseRequested: () => this.togglePause(),
        onDevicesChanged: () => this.refreshDeviceUi(),
        onAssignedControllerDisconnected: (playerIndices) => {
          if (this.state === AppState.Playing) {
            this.pause();
          }
          this.refreshDeviceUi();
          this.ui.toast(
            `${playerIndices
              .map((index) => `P${String(index + 1)}`)
              .join(", ")} controller disconnected. Reconnect or reassign before resuming.`,
          );
        },
      });

      let settings = this.settingsService.load();
      if (import.meta.env.DEV && import.meta.env["VITE_E2E_LOW_QUALITY"] === "1") {
        settings = this.settingsService.update({
          renderScale: 0.5,
          aaQuality: "off",
          ambientOcclusion: false,
          vignette: false,
          shadowQuality: "low",
        });
      }
      this.input.configurePlayerSources(
        settings.playerInputs,
        settings.playerCount,
        settings.analogDeadZone,
        settings.analogSensitivity,
      );
      this.ui.applySettings(settings);
      this.audio.setVolumes(settings);
      this.refreshDeviceUi();
      this.ui.setLoadingStatus("Checking WebGL 2…");

      const canvas = document.getElementById("game-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("The game canvas is missing.");
      }
      this.renderSystem = new RenderSystem(canvas, settings, {
        onContextLost: () => this.handleContextLost(),
        onContextRestored: () => this.handleContextRestored(),
      });

      this.ui.setLoadingStatus("Loading Rapier physics…");
      this.rapier = await initializeRapier();

      this.installLifecycleListeners();
      if (import.meta.env.DEV) {
        const { installTestApi } = await import("../dev/install-test-api");
        this.uninstallTestApi = installTestApi({
          state: () => this.state,
          snapshot: () => this.worldSession?.debugSnapshot() ?? null,
          renderSnapshot: () => this.renderSystem?.debugSnapshot() ?? null,
          appSnapshot: () => this.debugSnapshot(),
          performanceSnapshot: () => this.performanceMonitor.snapshot(),
          audioSnapshot: () => this.audio.debugSnapshot(),
          resetPerformance: () => this.performanceMonitor.reset(),
          resetSandbox: async () => this.debugResetSandbox(),
          dropVehicle: () => this.worldSession?.debugDropVehicle(),
          moveVehicle: (playerIndex, position) =>
            this.worldSession?.debugMoveVehicle(playerIndex, position),
          setVehicleState: (playerIndex, state) =>
            this.worldSession?.debugSetVehicleState(playerIndex, state),
          setBallState: (ballIndex, state) =>
            this.worldSession?.debugSetBallState(ballIndex, state),
          setCubeState: (cubeIndex, state) =>
            this.worldSession?.debugSetCubeState(cubeIndex, state),
        });
      }
      this.state = AppState.AwaitingActivation;
      this.ui.show("activation");
      this.previousNow = performance.now();
      this.animationFrame = requestAnimationFrame((now) => this.frame(now));
    } catch (error) {
      this.fail(error);
    }
  }

  private async activate(): Promise<void> {
    if (this.state !== AppState.AwaitingActivation) {
      return;
    }
    const root = document.getElementById("game-root");
    const fullscreenRequest =
      this.settingsService.current.fullscreenPreference &&
      document.fullscreenElement == null &&
      root !== null &&
      typeof root.requestFullscreen === "function"
        ? root.requestFullscreen().catch(() => {
            this.ui.toast("Fullscreen was denied by the browser. Windowed play remains available.");
          })
        : undefined;
    const audioReady = await this.audio.unlock();
    await fullscreenRequest;
    this.input.activate();
    this.refreshDeviceUi();
    root?.focus();
    this.state = AppState.FrontEnd;
    this.ui.show("main");
    if (!audioReady) {
      this.ui.toast("Audio is unavailable; gameplay remains fully usable.");
    }
  }

  private async startSandbox(): Promise<void> {
    if (this.rapier === undefined || this.renderSystem === undefined) {
      return;
    }
    this.state = AppState.Loading;
    this.ui.show("loading");
    this.ui.setLoadingStatus("Constructing sandbox…");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.worldSession?.dispose();
    this.worldSession = new WorldSession(
      this.rapier,
      this.renderSystem.scene,
      this.settingsService.current.playerCount,
      this.renderSystem.camera,
      GameApp.markerOverlay(),
      {
        particleDensity: this.settingsService.current.particleDensity,
        cameraSmoothing: this.settingsService.current.cameraSmoothing,
        markerSize: this.settingsService.current.markerSize,
        automaticUprightRecovery: this.settingsService.current.automaticUprightRecovery,
        highContrastInteractables: this.settingsService.current.highContrastInteractables,
        onBoosterActivation: () => this.audio.playBooster(),
        onPortalTeleport: () => {
          this.audio.playPortal({ portalPhase: "entry" });
          this.audio.playPortal({ portalPhase: "exit" });
        },
        onVehicleRecovery: () => this.audio.playRespawn(),
      },
    );
    await this.renderSystem.precompile();
    this.sessionGeneration += 1;
    this.input.setGameplayEnabled(true);
    this.fixedStep.reset();
    this.previousNow = performance.now();
    this.state = AppState.Playing;
    this.audio.setGameplayPaused(false);
    for (const screen of document.querySelectorAll<HTMLElement>(".screen")) {
      screen.hidden = true;
    }
    document.getElementById("game-root")?.focus();
  }

  private pause(reason?: string): void {
    if (this.state !== AppState.Playing) {
      return;
    }
    this.state = AppState.Paused;
    this.input.setGameplayEnabled(false);
    this.fixedStep.reset();
    this.audio.playPause();
    this.audio.setGameplayPaused(true);
    this.ui.show("pause");
    if (reason !== undefined) {
      this.ui.toast(reason);
    }
  }

  private resume(): void {
    if (this.state !== AppState.Paused) {
      return;
    }
    this.input.clear();
    this.input.setGameplayEnabled(true);
    this.fixedStep.reset();
    this.previousNow = performance.now();
    this.state = AppState.Playing;
    this.audio.setGameplayPaused(false);
    const pause = document.getElementById("screen-pause");
    if (pause !== null) {
      pause.hidden = true;
    }
    document.getElementById("game-root")?.focus();
    void this.audio.resume();
  }

  private togglePause(): void {
    if (this.state === AppState.Playing) {
      this.pause();
    } else if (this.state === AppState.Paused) {
      this.resume();
    }
  }

  private async resetSandbox(): Promise<void> {
    if (
      this.rapier === undefined ||
      this.renderSystem === undefined ||
      this.state !== AppState.Paused
    ) {
      return;
    }
    this.state = AppState.Resetting;
    this.input.setGameplayEnabled(false);
    this.audio.playReset();
    this.audio.stopAllEngineVoices();
    this.worldSession?.dispose();
    this.worldSession = undefined;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.worldSession = new WorldSession(
      this.rapier,
      this.renderSystem.scene,
      this.settingsService.current.playerCount,
      this.renderSystem.camera,
      GameApp.markerOverlay(),
      {
        particleDensity: this.settingsService.current.particleDensity,
        cameraSmoothing: this.settingsService.current.cameraSmoothing,
        markerSize: this.settingsService.current.markerSize,
        automaticUprightRecovery: this.settingsService.current.automaticUprightRecovery,
        highContrastInteractables: this.settingsService.current.highContrastInteractables,
        onBoosterActivation: () => this.audio.playBooster(),
        onPortalTeleport: () => {
          this.audio.playPortal({ portalPhase: "entry" });
          this.audio.playPortal({ portalPhase: "exit" });
        },
        onVehicleRecovery: () => this.audio.playRespawn(),
      },
    );
    await this.renderSystem.precompile();
    this.sessionGeneration += 1;
    this.fixedStep.reset();
    this.previousNow = performance.now();
    this.state = AppState.Playing;
    this.audio.setGameplayPaused(false);
    this.input.setGameplayEnabled(true);
    const pause = document.getElementById("screen-pause");
    if (pause !== null) {
      pause.hidden = true;
    }
    document.getElementById("game-root")?.focus();
    void this.audio.resume();
  }

  private returnToMenu(): void {
    this.input.setGameplayEnabled(false);
    this.audio.stopAllEngineVoices();
    this.worldSession?.dispose();
    this.worldSession = undefined;
    this.fixedStep.reset();
    this.state = AppState.FrontEnd;
    this.ui.show("main");
    void this.audio.resume();
  }

  private updateSettings(patch: Partial<Omit<GameSettings, "schemaVersion">>): void {
    const settings = this.settingsService.update(patch);
    this.applyRuntimeSettings(settings);
  }

  private resetSettings(): void {
    const settings = this.settingsService.resetToDefaults();
    this.applyRuntimeSettings(settings);
    this.ui.toast("Settings restored to defaults.");
  }

  private applyRuntimeSettings(settings: GameSettings): void {
    this.input.configurePlayerSources(
      settings.playerInputs,
      settings.playerCount,
      settings.analogDeadZone,
      settings.analogSensitivity,
    );
    this.renderSystem?.applySettings(settings);
    this.audio.setVolumes(settings);
    this.worldSession?.setParticleDensity(settings.particleDensity);
    this.worldSession?.setCameraSmoothing(settings.cameraSmoothing);
    this.worldSession?.setMarkerSize(settings.markerSize);
    this.worldSession?.setAutomaticUprightRecovery(settings.automaticUprightRecovery);
    this.worldSession?.setHighContrastInteractables(settings.highContrastInteractables);
    this.ui.applySettings(settings);
    this.refreshDeviceUi();
  }

  private assignController(playerIndex: number, gamepadIndex: number | null): void {
    try {
      const current = this.settingsService.current;
      const gamepad =
        gamepadIndex === null
          ? undefined
          : this.input.connectedGamepads.find((candidate) => candidate.index === gamepadIndex);
      if (gamepadIndex !== null && gamepad === undefined) {
        throw new Error(`Gamepad ${String(gamepadIndex + 1)} is no longer connected.`);
      }
      const playerInputs = current.playerInputs.map((input, index) =>
        index === playerIndex
          ? {
              ...input,
              inputType: "controller" as const,
              controllerIdHint: gamepad?.id ?? null,
              controllerMappingHint: gamepad?.mapping ?? null,
              controllerCalibration:
                gamepad !== undefined &&
                gamepad.mapping !== "standard" &&
                input.controllerIdHint === gamepad.id &&
                input.controllerMappingHint === gamepad.mapping
                  ? input.controllerCalibration
                  : null,
            }
          : input,
      );
      this.updateSettings({ playerInputs });
      this.input.assignController(playerIndex, gamepadIndex);
      this.refreshDeviceUi();
    } catch (error) {
      this.refreshDeviceUi();
      this.ui.toast(errorMessage(error));
    }
  }

  private refreshDeviceUi(): void {
    this.ui.updateControllers(this.input.connectedGamepads, this.input.getControllerAssignments());
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement == null) {
        const root = document.getElementById("game-root");
        if (root === null || typeof root.requestFullscreen !== "function") {
          throw new Error("Fullscreen is unavailable.");
        }
        await root.requestFullscreen();
      } else {
        if (typeof document.exitFullscreen !== "function") {
          throw new Error("Fullscreen exit is unavailable.");
        }
        await document.exitFullscreen();
      }
    } catch {
      this.ui.toast("Fullscreen was denied by the browser. Windowed play remains available.");
    }
  }

  private frame(now: number): void {
    if (this.disposed) {
      return;
    }
    const frameDeltaSeconds = (now - this.previousNow) / 1000;
    this.previousNow = now;
    this.performanceMonitor.recordFrame(frameDeltaSeconds);
    this.input.pollGamepads();
    this.ui.updateControllerNavigation(this.input.connectedGamepads, now);

    let alpha = 0;
    if (this.state === AppState.Playing && this.worldSession !== undefined) {
      const result = this.fixedStep.advance(frameDeltaSeconds, this.runFixedStep);
      alpha = result.alpha;
      if (result.overloaded) {
        this.performanceMonitor.recordOverload(result.discardedSeconds);
        if (import.meta.env.DEV) {
          console.warn(`Physics overload: discarded ${result.discardedSeconds.toFixed(3)} s.`);
        }
      }
    }
    this.worldSession?.render(
      alpha,
      Math.min(Math.max(frameDeltaSeconds, 0), SIMULATION_CONFIG.maxFrameDeltaSeconds),
      this.renderSystem?.aspectRatio ?? 1,
    );
    this.renderSystem?.render();
    this.animationFrame = requestAnimationFrame((time) => this.frame(time));
  }

  private handleContextLost(): void {
    this.input.setGameplayEnabled(false);
    this.fixedStep.reset();
    this.state = AppState.Error;
    this.ui.showError("The WebGL context was lost. Reload to rebuild the renderer safely.");
  }

  private debugSnapshot(): GameAppDebugSnapshot {
    return {
      state: this.state,
      sessionGeneration: this.sessionGeneration,
      activeWorldSessionRootCount:
        this.renderSystem?.scene.children.filter((child) => child.name === "world-session")
          .length ?? 0,
      markerElementCount: document.querySelectorAll(".player-marker").length,
    };
  }

  private async debugResetSandbox(): Promise<void> {
    if (this.state === AppState.Playing) {
      this.pause();
    }
    if (this.state === AppState.Paused) {
      await this.resetSandbox();
    }
  }

  private handleContextRestored(): void {
    this.ui.toast("Graphics context restored. Reloading is recommended.");
  }

  private installLifecycleListeners(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    document.addEventListener("focusin", this.onUiFocusIn);
    document.addEventListener("click", this.onUiClick);
  }

  private removeLifecycleListeners(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    document.removeEventListener("focusin", this.onUiFocusIn);
    document.removeEventListener("click", this.onUiClick);
  }

  private fail(error: unknown): void {
    console.error(error);
    this.state = AppState.Error;
    this.ui.showError(errorMessage(error));
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.removeLifecycleListeners();
    this.worldSession?.dispose();
    this.renderSystem?.dispose();
    this.input.dispose();
    this.uninstallTestApi?.();
    this.uninstallTestApi = undefined;
    await this.audio.dispose();
  }

  private static safeStorage(): Storage | undefined {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  }

  private static markerOverlay(): HTMLElement {
    const overlay = document.getElementById("player-markers");
    if (!(overlay instanceof HTMLElement)) {
      throw new Error("The player marker overlay is missing.");
    }
    return overlay;
  }
}
