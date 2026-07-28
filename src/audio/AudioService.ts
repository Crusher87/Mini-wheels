export const MAX_ENGINE_VOICES = 10;
export const MAX_PROCEDURAL_CUE_VOICES = 16;

const GAMEPLAY_PAUSED_GAIN = 0.12;
const PARAMETER_RAMP_SECONDS = 0.025;
const SILENT_GAIN = 0.0001;

export type AudioServiceAvailability = "unknown" | "available" | "unavailable";
export type ProceduralAudioCue =
  "ui-focus" | "ui-confirm" | "ui-back" | "pause" | "booster" | "portal" | "reset" | "respawn";
export type PortalCuePhase = "entry" | "exit";
export type EngineVoiceId = number | string;

/**
 * The service uses this deliberately small project-owned Web Audio boundary so
 * lifecycle and voice-management behavior can be tested without a browser.
 */
export interface AudioParamPort {
  value: number;
  cancelScheduledValues(cancelTime: number): void;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
}

export interface AudioNodePort {
  connect(destination: AudioNodePort): unknown;
  disconnect(): void;
}

export interface GainNodePort extends AudioNodePort {
  readonly gain: AudioParamPort;
}

export interface StereoPannerNodePort extends AudioNodePort {
  readonly pan: AudioParamPort;
}

export interface OscillatorNodePort extends AudioNodePort {
  type: OscillatorType;
  readonly frequency: AudioParamPort;
  readonly detune: AudioParamPort;
  onended: ((event?: unknown) => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextPort {
  readonly currentTime: number;
  readonly destination: AudioNodePort;
  readonly state: AudioContextState;
  createGain(): GainNodePort;
  createOscillator(): OscillatorNodePort;
  createStereoPanner?(): StereoPannerNodePort;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export type AudioContextFactory = () => AudioContextPort | undefined;

export interface AudioServiceOptions {
  readonly contextFactory?: AudioContextFactory;
  readonly trustedActivation?: () => boolean;
}

export interface AudioVolumeSettings {
  readonly masterVolume: number;
  readonly effectsVolume: number;
  readonly musicVolume: number;
}

export interface AudioCueOptions {
  readonly intensity?: number;
  readonly pan?: number;
  readonly portalPhase?: PortalCuePhase;
}

export interface EngineVoiceState {
  readonly active: boolean;
  readonly speedNormalized: number;
  readonly throttle: number;
  readonly pan?: number;
}

export interface AudioServiceDebugSnapshot {
  readonly availability: AudioServiceAvailability;
  readonly contextState: AudioContextState | "not-created";
  readonly unlocked: boolean;
  readonly gameplayPaused: boolean;
  readonly pageHidden: boolean;
  readonly volumes: AudioVolumeSettings;
  readonly busNodeCount: number;
  readonly activeCueVoiceCount: number;
  readonly activeEngineVoiceCount: number;
  readonly liveOscillatorNodeCount: number;
  readonly liveManagedNodeCount: number;
  readonly cueStartedCount: number;
  readonly cueDroppedCount: number;
  readonly engineStartedCount: number;
  readonly engineDroppedCount: number;
  readonly engineVoiceScale: number;
  readonly maxCueVoices: number;
  readonly maxEngineVoices: number;
  readonly disposed: boolean;
}

interface AudioBuses {
  readonly master: GainNodePort;
  readonly effects: GainNodePort;
  readonly music: GainNodePort;
  readonly gameplay: GainNodePort;
}

interface CueDefinition {
  readonly startFrequency: number;
  readonly endFrequency: number;
  readonly durationSeconds: number;
  readonly attackSeconds: number;
  readonly gain: number;
  readonly type: OscillatorType;
  readonly maxVoices: number;
  readonly destination: "effects" | "gameplay";
}

interface ManagedCueVoice {
  readonly cue: ProceduralAudioCue;
  readonly oscillator: OscillatorNodePort;
  readonly gain: GainNodePort;
  readonly panner: StereoPannerNodePort | undefined;
  readonly endsAt: number;
  cleaned: boolean;
}

interface ManagedEngineVoice {
  readonly id: EngineVoiceId;
  readonly oscillator: OscillatorNodePort;
  readonly gain: GainNodePort;
  readonly panner: StereoPannerNodePort | undefined;
  throttle: number;
  cleaned: boolean;
}

const DEFAULT_VOLUMES: AudioVolumeSettings = Object.freeze({
  masterVolume: 0.8,
  effectsVolume: 1,
  musicVolume: 1,
});

const CUE_DEFINITIONS = Object.freeze({
  "ui-focus": {
    startFrequency: 430,
    endFrequency: 385,
    durationSeconds: 0.045,
    attackSeconds: 0.006,
    gain: 0.035,
    type: "sine",
    maxVoices: 2,
    destination: "effects",
  },
  "ui-confirm": {
    startFrequency: 330,
    endFrequency: 525,
    durationSeconds: 0.09,
    attackSeconds: 0.008,
    gain: 0.07,
    type: "sine",
    maxVoices: 3,
    destination: "effects",
  },
  "ui-back": {
    startFrequency: 320,
    endFrequency: 210,
    durationSeconds: 0.08,
    attackSeconds: 0.006,
    gain: 0.055,
    type: "triangle",
    maxVoices: 3,
    destination: "effects",
  },
  pause: {
    startFrequency: 260,
    endFrequency: 175,
    durationSeconds: 0.12,
    attackSeconds: 0.01,
    gain: 0.06,
    type: "triangle",
    maxVoices: 2,
    destination: "effects",
  },
  booster: {
    startFrequency: 245,
    endFrequency: 920,
    durationSeconds: 0.18,
    attackSeconds: 0.012,
    gain: 0.095,
    type: "sawtooth",
    maxVoices: 4,
    destination: "gameplay",
  },
  portal: {
    startFrequency: 190,
    endFrequency: 670,
    durationSeconds: 0.24,
    attackSeconds: 0.012,
    gain: 0.085,
    type: "triangle",
    maxVoices: 6,
    destination: "gameplay",
  },
  reset: {
    startFrequency: 510,
    endFrequency: 145,
    durationSeconds: 0.3,
    attackSeconds: 0.015,
    gain: 0.075,
    type: "sine",
    maxVoices: 1,
    destination: "effects",
  },
  respawn: {
    startFrequency: 180,
    endFrequency: 460,
    durationSeconds: 0.13,
    attackSeconds: 0.008,
    gain: 0.075,
    type: "square",
    maxVoices: 4,
    destination: "gameplay",
  },
} as const satisfies Readonly<Record<ProceduralAudioCue, CueDefinition>>);

function clampUnit(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function defaultTrustedActivation(): boolean {
  return typeof navigator !== "undefined" && navigator.userActivation?.isActive === true;
}

function defaultContextFactory(): AudioContextPort | undefined {
  const contextScope = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const ContextConstructor = globalThis.AudioContext ?? contextScope.webkitAudioContext;
  if (ContextConstructor === undefined) {
    return undefined;
  }
  return new ContextConstructor() as unknown as AudioContextPort;
}

/**
 * Application-lifetime procedural audio with bounded short cues and engine
 * loops. It intentionally creates no AudioContext until a trusted activation.
 */
export class AudioService {
  private readonly contextFactory: AudioContextFactory;
  private readonly trustedActivation: () => boolean;
  private context: AudioContextPort | undefined;
  private buses: AudioBuses | undefined;
  private volumes: AudioVolumeSettings = DEFAULT_VOLUMES;
  private readonly cueVoices = new Set<ManagedCueVoice>();
  private readonly engineVoices = new Map<EngineVoiceId, ManagedEngineVoice>();
  private readonly liveEngineNodes = new Set<ManagedEngineVoice>();
  private availability: AudioServiceAvailability = "unknown";
  private unlocked = false;
  private gameplayPaused = false;
  private pageHidden = false;
  private cueStartedCount = 0;
  private cueDroppedCount = 0;
  private engineStartedCount = 0;
  private engineDroppedCount = 0;
  private disposed = false;

  public constructor(options: AudioServiceOptions = {}) {
    this.contextFactory = options.contextFactory ?? defaultContextFactory;
    this.trustedActivation = options.trustedActivation ?? defaultTrustedActivation;
  }

  /**
   * Call synchronously from a click/key/button handler. Settings and cue calls
   * made before this point never create an AudioContext.
   */
  public async unlock(event?: Pick<Event, "isTrusted">): Promise<boolean> {
    if (this.disposed || this.pageHidden) {
      return false;
    }
    if (this.unlocked && this.context?.state === "running") {
      return true;
    }
    const trusted = event === undefined ? this.trustedActivation() : event.isTrusted;
    if (!trusted) {
      return false;
    }

    if (this.context === undefined) {
      try {
        const context = this.contextFactory();
        if (context === undefined) {
          this.availability = "unavailable";
          return false;
        }
        this.context = context;
        this.buses = this.createBuses(context);
        this.availability = "available";
      } catch {
        const failedContext = this.context;
        this.context = undefined;
        this.buses = undefined;
        this.availability = "unavailable";
        if (failedContext !== undefined && failedContext.state !== "closed") {
          try {
            await failedContext.close();
          } catch {
            // Construction failure already made audio unavailable.
          }
        }
        return false;
      }
    }

    try {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      this.unlocked = this.context.state === "running";
      return this.unlocked;
    } catch {
      this.unlocked = false;
      return false;
    }
  }

  /**
   * Stores mix settings even before unlock. Values outside [0, 1] are clamped
   * so corrupt persistence never reaches Web Audio parameters.
   */
  public setVolumes(settings: Partial<AudioVolumeSettings>): AudioVolumeSettings {
    this.volumes = Object.freeze({
      masterVolume:
        settings.masterVolume === undefined
          ? this.volumes.masterVolume
          : clampUnit(settings.masterVolume, this.volumes.masterVolume),
      effectsVolume:
        settings.effectsVolume === undefined
          ? this.volumes.effectsVolume
          : clampUnit(settings.effectsVolume, this.volumes.effectsVolume),
      musicVolume:
        settings.musicVolume === undefined
          ? this.volumes.musicVolume
          : clampUnit(settings.musicVolume, this.volumes.musicVolume),
    });
    this.applyBusGains();
    return this.volumes;
  }

  /**
   * Ducks gameplay loops and world cues without suspending the context. UI and
   * reset cues remain audible through the effects bus.
   */
  public setGameplayPaused(paused: boolean): void {
    if (this.disposed || this.gameplayPaused === paused) {
      return;
    }
    this.gameplayPaused = paused;
    const gameplayBus = this.buses?.gameplay;
    if (gameplayBus !== undefined) {
      this.rampParameter(
        gameplayBus.gain,
        paused ? GAMEPLAY_PAUSED_GAIN : 1,
        PARAMETER_RAMP_SECONDS,
      );
    }
  }

  /**
   * Hidden tabs suspend the whole context. Becoming visible only clears the
   * guard; the application must explicitly resume when gameplay resumes.
   */
  public async setPageHidden(hidden: boolean): Promise<void> {
    this.pageHidden = hidden;
    if (hidden) {
      await this.suspend();
    }
  }

  /**
   * Explicit low-level context suspension, retained for lifecycle callers.
   * Gameplay pause should use setGameplayPaused() instead.
   */
  public async suspend(): Promise<void> {
    if (this.context?.state !== "running") {
      return;
    }
    try {
      await this.context.suspend();
    } catch {
      // Audio failure must never block input, pause, or navigation.
    }
  }

  /**
   * Resumes an already-unlocked context. It never creates a context and refuses
   * to resume while the page is still hidden.
   */
  public async resume(): Promise<boolean> {
    if (!this.unlocked || this.pageHidden || this.disposed || this.context === undefined) {
      return false;
    }
    try {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  public playUiFocus(options?: AudioCueOptions): boolean {
    return this.playCue("ui-focus", options);
  }

  public playUiConfirm(options?: AudioCueOptions): boolean {
    return this.playCue("ui-confirm", options);
  }

  public playUiBack(options?: AudioCueOptions): boolean {
    return this.playCue("ui-back", options);
  }

  public playPause(options?: AudioCueOptions): boolean {
    return this.playCue("pause", options);
  }

  public playBooster(options?: AudioCueOptions): boolean {
    return this.playCue("booster", options);
  }

  public playPortal(options?: AudioCueOptions): boolean {
    return this.playCue("portal", options);
  }

  public playReset(options?: AudioCueOptions): boolean {
    return this.playCue("reset", options);
  }

  public playRespawn(options?: AudioCueOptions): boolean {
    return this.playCue("respawn", options);
  }

  public playCue(cue: ProceduralAudioCue, options: AudioCueOptions = {}): boolean {
    const context = this.context;
    const buses = this.buses;
    if (
      !this.unlocked ||
      this.disposed ||
      this.pageHidden ||
      context?.state !== "running" ||
      buses === undefined
    ) {
      this.cueDroppedCount += 1;
      return false;
    }

    this.pruneExpiredCueVoices();
    const definition = CUE_DEFINITIONS[cue];
    if (
      this.cueVoices.size >= MAX_PROCEDURAL_CUE_VOICES ||
      this.countCueVoices(cue) >= definition.maxVoices
    ) {
      this.cueDroppedCount += 1;
      return false;
    }

    const intensity = clampUnit(options.intensity ?? 1, 1);
    if (intensity <= 0) {
      return false;
    }

    let oscillator: OscillatorNodePort | undefined;
    let gain: GainNodePort | undefined;
    let panner: StereoPannerNodePort | undefined;
    let voice: ManagedCueVoice | undefined;
    try {
      const now = context.currentTime;
      const phaseScale = cue === "portal" && options.portalPhase === "exit" ? 1.16 : 1;
      oscillator = context.createOscillator();
      gain = context.createGain();
      panner = this.createPanner(options.pan);
      const destination = definition.destination === "gameplay" ? buses.gameplay : buses.effects;

      oscillator.type = definition.type;
      oscillator.frequency.cancelScheduledValues(now);
      oscillator.frequency.setValueAtTime(definition.startFrequency * phaseScale, now);
      oscillator.frequency.linearRampToValueAtTime(
        definition.endFrequency * phaseScale,
        now + definition.durationSeconds,
      );
      oscillator.detune.setValueAtTime((this.cueStartedCount % 5) * 7 - 14, now);

      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(SILENT_GAIN, now);
      gain.gain.linearRampToValueAtTime(
        Math.max(SILENT_GAIN, definition.gain * intensity),
        now + definition.attackSeconds,
      );
      gain.gain.linearRampToValueAtTime(SILENT_GAIN, now + definition.durationSeconds);

      oscillator.connect(gain);
      if (panner === undefined) {
        gain.connect(destination);
      } else {
        gain.connect(panner);
        panner.connect(destination);
      }

      const managedVoice: ManagedCueVoice = {
        cue,
        oscillator,
        gain,
        panner,
        endsAt: now + definition.durationSeconds,
        cleaned: false,
      };
      voice = managedVoice;
      this.cueVoices.add(managedVoice);
      oscillator.onended = () => this.cleanupCueVoice(managedVoice);
      oscillator.start(now);
      oscillator.stop(managedVoice.endsAt + 0.005);
      this.cueStartedCount += 1;
      return true;
    } catch {
      if (voice !== undefined) {
        this.safeStop(voice.oscillator);
        this.cleanupCueVoice(voice);
      } else {
        if (oscillator !== undefined) {
          this.safeStop(oscillator);
          this.safeDisconnect(oscillator);
        }
        if (gain !== undefined) {
          this.safeDisconnect(gain);
        }
        if (panner !== undefined) {
          this.safeDisconnect(panner);
        }
      }
      this.cueDroppedCount += 1;
      return false;
    }
  }

  /**
   * Creates or updates one compact toy-motor loop. Call with active=false when
   * a car is inactive; session teardown should call stopAllEngineVoices().
   */
  public updateEngineVoice(id: EngineVoiceId, state: EngineVoiceState): boolean {
    const existing = this.engineVoices.get(id);
    if (!state.active) {
      if (existing !== undefined) {
        this.stopEngineVoice(id);
      }
      return true;
    }

    if (existing !== undefined) {
      this.applyEngineState(existing, state);
      return true;
    }

    const context = this.context;
    const buses = this.buses;
    if (
      !this.unlocked ||
      this.disposed ||
      this.pageHidden ||
      context?.state !== "running" ||
      buses === undefined ||
      this.liveEngineNodes.size >= MAX_ENGINE_VOICES
    ) {
      this.engineDroppedCount += 1;
      return false;
    }

    let oscillator: OscillatorNodePort | undefined;
    let gain: GainNodePort | undefined;
    let panner: StereoPannerNodePort | undefined;
    let voice: ManagedEngineVoice | undefined;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      panner = this.createPanner(state.pan);
      oscillator.type = "triangle";
      oscillator.connect(gain);
      if (panner === undefined) {
        gain.connect(buses.gameplay);
      } else {
        gain.connect(panner);
        panner.connect(buses.gameplay);
      }
      const managedVoice: ManagedEngineVoice = {
        id,
        oscillator,
        gain,
        panner,
        throttle: 0,
        cleaned: false,
      };
      voice = managedVoice;
      this.engineVoices.set(id, managedVoice);
      this.liveEngineNodes.add(managedVoice);
      oscillator.onended = () => this.cleanupEngineVoice(managedVoice);
      oscillator.start(context.currentTime);
      this.engineStartedCount += 1;
      this.applyEngineState(managedVoice, state);
      this.applyEngineVoiceScaling();
      return true;
    } catch {
      if (voice !== undefined) {
        this.safeStop(voice.oscillator);
        this.cleanupEngineVoice(voice);
      } else {
        if (oscillator !== undefined) {
          this.safeStop(oscillator);
          this.safeDisconnect(oscillator);
        }
        if (gain !== undefined) {
          this.safeDisconnect(gain);
        }
        if (panner !== undefined) {
          this.safeDisconnect(panner);
        }
      }
      this.engineDroppedCount += 1;
      return false;
    }
  }

  public stopEngineVoice(id: EngineVoiceId): void {
    const voice = this.engineVoices.get(id);
    if (voice === undefined) {
      return;
    }
    this.engineVoices.delete(id);
    const now = this.context?.currentTime ?? 0;
    this.rampParameter(voice.gain.gain, SILENT_GAIN, PARAMETER_RAMP_SECONDS);
    try {
      voice.oscillator.stop(now + PARAMETER_RAMP_SECONDS + 0.005);
    } catch {
      this.cleanupEngineVoice(voice);
    }
    this.applyEngineVoiceScaling();
  }

  public stopAllEngineVoices(): void {
    for (const id of this.engineVoices.keys()) {
      this.stopEngineVoice(id);
    }
  }

  public get isUnlocked(): boolean {
    return this.unlocked;
  }

  public debugSnapshot(): AudioServiceDebugSnapshot {
    this.pruneExpiredCueVoices();
    const voiceNodeCount = (this.cueVoices.size + this.liveEngineNodes.size) * 2;
    let pannerNodeCount = 0;
    for (const voice of this.cueVoices) {
      if (voice.panner !== undefined) {
        pannerNodeCount += 1;
      }
    }
    for (const voice of this.liveEngineNodes) {
      if (voice.panner !== undefined) {
        pannerNodeCount += 1;
      }
    }
    const busNodeCount = this.buses === undefined ? 0 : 4;
    return {
      availability: this.availability,
      contextState: this.context?.state ?? "not-created",
      unlocked: this.unlocked,
      gameplayPaused: this.gameplayPaused,
      pageHidden: this.pageHidden,
      volumes: this.volumes,
      busNodeCount,
      activeCueVoiceCount: this.cueVoices.size,
      activeEngineVoiceCount: this.engineVoices.size,
      liveOscillatorNodeCount: this.cueVoices.size + this.liveEngineNodes.size,
      liveManagedNodeCount: busNodeCount + voiceNodeCount + pannerNodeCount,
      cueStartedCount: this.cueStartedCount,
      cueDroppedCount: this.cueDroppedCount,
      engineStartedCount: this.engineStartedCount,
      engineDroppedCount: this.engineDroppedCount,
      engineVoiceScale: this.engineVoiceScale,
      maxCueVoices: MAX_PROCEDURAL_CUE_VOICES,
      maxEngineVoices: MAX_ENGINE_VOICES,
      disposed: this.disposed,
    };
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const voice of this.cueVoices) {
      voice.oscillator.onended = null;
      this.safeStop(voice.oscillator);
      this.cleanupCueVoice(voice);
    }
    for (const voice of this.liveEngineNodes) {
      voice.oscillator.onended = null;
      this.safeStop(voice.oscillator);
      this.cleanupEngineVoice(voice);
    }
    this.engineVoices.clear();

    if (this.buses !== undefined) {
      this.safeDisconnect(this.buses.gameplay);
      this.safeDisconnect(this.buses.music);
      this.safeDisconnect(this.buses.effects);
      this.safeDisconnect(this.buses.master);
      this.buses = undefined;
    }

    const context = this.context;
    this.context = undefined;
    this.unlocked = false;
    if (context !== undefined && context.state !== "closed") {
      try {
        await context.close();
      } catch {
        // The app is already torn down; a browser close failure is non-fatal.
      }
    }
  }

  private createBuses(context: AudioContextPort): AudioBuses {
    const createdNodes: GainNodePort[] = [];
    try {
      const master = context.createGain();
      createdNodes.push(master);
      const effects = context.createGain();
      createdNodes.push(effects);
      const music = context.createGain();
      createdNodes.push(music);
      const gameplay = context.createGain();
      createdNodes.push(gameplay);

      master.connect(context.destination);
      effects.connect(master);
      music.connect(master);
      gameplay.connect(effects);

      const buses = { master, effects, music, gameplay };
      master.gain.value = this.volumes.masterVolume;
      effects.gain.value = this.volumes.effectsVolume;
      music.gain.value = this.volumes.musicVolume;
      gameplay.gain.value = this.gameplayPaused ? GAMEPLAY_PAUSED_GAIN : 1;
      return buses;
    } catch (error) {
      for (const node of createdNodes) {
        this.safeDisconnect(node);
      }
      throw error;
    }
  }

  private applyBusGains(): void {
    const buses = this.buses;
    if (buses === undefined) {
      return;
    }
    this.rampParameter(buses.master.gain, this.volumes.masterVolume, PARAMETER_RAMP_SECONDS);
    this.rampParameter(buses.effects.gain, this.volumes.effectsVolume, PARAMETER_RAMP_SECONDS);
    this.rampParameter(buses.music.gain, this.volumes.musicVolume, PARAMETER_RAMP_SECONDS);
  }

  private createPanner(pan: number | undefined): StereoPannerNodePort | undefined {
    if (pan === undefined || this.context?.createStereoPanner === undefined) {
      return undefined;
    }
    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.min(1, Math.max(-1, Number.isFinite(pan) ? pan : 0));
    return panner;
  }

  private applyEngineState(voice: ManagedEngineVoice, state: EngineVoiceState): void {
    const context = this.context;
    if (context === undefined) {
      return;
    }
    const speed = clampUnit(state.speedNormalized);
    voice.throttle = clampUnit(Math.abs(state.throttle));
    const frequency = 78 + speed * 172 + voice.throttle * 34;
    this.rampParameter(voice.oscillator.frequency, frequency, PARAMETER_RAMP_SECONDS);
    if (voice.panner !== undefined && state.pan !== undefined) {
      this.rampParameter(
        voice.panner.pan,
        Math.min(1, Math.max(-1, Number.isFinite(state.pan) ? state.pan : 0)),
        PARAMETER_RAMP_SECONDS,
      );
    }
    this.applyEngineVoiceGain(voice);
  }

  private applyEngineVoiceScaling(): void {
    for (const voice of this.engineVoices.values()) {
      this.applyEngineVoiceGain(voice);
    }
  }

  private applyEngineVoiceGain(voice: ManagedEngineVoice): void {
    const gain = 0.055 * (0.3 + voice.throttle * 0.7) * this.engineVoiceScale;
    this.rampParameter(voice.gain.gain, gain, PARAMETER_RAMP_SECONDS);
  }

  private get engineVoiceScale(): number {
    const voiceCount = this.engineVoices.size;
    return voiceCount === 0 ? 0 : 1 / Math.sqrt(voiceCount);
  }

  private rampParameter(parameter: AudioParamPort, target: number, durationSeconds: number): void {
    const now = this.context?.currentTime ?? 0;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    if (durationSeconds <= 0) {
      parameter.setValueAtTime(target, now);
    } else {
      parameter.linearRampToValueAtTime(target, now + durationSeconds);
    }
  }

  private countCueVoices(cue: ProceduralAudioCue): number {
    let count = 0;
    for (const voice of this.cueVoices) {
      if (voice.cue === cue) {
        count += 1;
      }
    }
    return count;
  }

  private pruneExpiredCueVoices(): void {
    const now = this.context?.currentTime;
    if (now === undefined) {
      return;
    }
    for (const voice of this.cueVoices) {
      if (now >= voice.endsAt + 0.02) {
        this.safeStop(voice.oscillator);
        this.cleanupCueVoice(voice);
      }
    }
  }

  private cleanupCueVoice(voice: ManagedCueVoice): void {
    if (voice.cleaned) {
      return;
    }
    voice.cleaned = true;
    this.cueVoices.delete(voice);
    voice.oscillator.onended = null;
    this.safeDisconnect(voice.oscillator);
    this.safeDisconnect(voice.gain);
    if (voice.panner !== undefined) {
      this.safeDisconnect(voice.panner);
    }
  }

  private cleanupEngineVoice(voice: ManagedEngineVoice): void {
    if (voice.cleaned) {
      return;
    }
    voice.cleaned = true;
    if (this.engineVoices.get(voice.id) === voice) {
      this.engineVoices.delete(voice.id);
    }
    this.liveEngineNodes.delete(voice);
    voice.oscillator.onended = null;
    this.safeDisconnect(voice.oscillator);
    this.safeDisconnect(voice.gain);
    if (voice.panner !== undefined) {
      this.safeDisconnect(voice.panner);
    }
  }

  private safeStop(oscillator: OscillatorNodePort): void {
    try {
      oscillator.stop();
    } catch {
      // Already-stopped oscillators are expected during event/disposal races.
    }
  }

  private safeDisconnect(node: AudioNodePort): void {
    try {
      node.disconnect();
    } catch {
      // Some browsers throw if a node was already disconnected.
    }
  }
}
