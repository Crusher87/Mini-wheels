import { describe, expect, it } from "vitest";
import {
  AudioService,
  MAX_ENGINE_VOICES,
  type AudioContextPort,
  type AudioNodePort,
  type AudioParamPort,
  type GainNodePort,
  type OscillatorNodePort,
  type StereoPannerNodePort,
} from "../../src/audio/AudioService";

class FakeAudioParam implements AudioParamPort {
  public value = 0;

  public cancelScheduledValues(): void {
    // The fake applies automation immediately so assertions see its target.
  }

  public setValueAtTime(value: number): void {
    this.value = value;
  }

  public linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
}

class FakeAudioNode implements AudioNodePort {
  public readonly connections: AudioNodePort[] = [];
  public disconnected = false;

  public connect(destination: AudioNodePort): AudioNodePort {
    this.connections.push(destination);
    return destination;
  }

  public disconnect(): void {
    this.disconnected = true;
    this.connections.length = 0;
  }
}

class FakeGainNode extends FakeAudioNode implements GainNodePort {
  public readonly gain = new FakeAudioParam();
}

class FakePannerNode extends FakeAudioNode implements StereoPannerNodePort {
  public readonly pan = new FakeAudioParam();
}

class FakeOscillatorNode extends FakeAudioNode implements OscillatorNodePort {
  public type: OscillatorType = "sine";
  public readonly frequency = new FakeAudioParam();
  public readonly detune = new FakeAudioParam();
  public onended: ((event?: unknown) => void) | null = null;
  public started = false;
  public stopped = false;
  public stopTime: number | undefined;

  public start(): void {
    this.started = true;
  }

  public stop(when = 0): void {
    this.stopped = true;
    this.stopTime = when;
  }

  public finish(): void {
    const onended = this.onended;
    this.onended = null;
    onended?.();
  }
}

class FakeAudioContext implements AudioContextPort {
  public currentTime = 0;
  public readonly destination = new FakeAudioNode();
  public state: AudioContextState = "suspended";
  public readonly gains: FakeGainNode[] = [];
  public readonly oscillators: FakeOscillatorNode[] = [];
  public readonly panners: FakePannerNode[] = [];
  public resumeCount = 0;
  public suspendCount = 0;
  public closeCount = 0;
  public rejectResume = false;
  public rejectClose = false;

  public createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  public createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  public createStereoPanner(): FakePannerNode {
    const node = new FakePannerNode();
    this.panners.push(node);
    return node;
  }

  public resume(): Promise<void> {
    this.resumeCount += 1;
    if (this.rejectResume) {
      return Promise.reject(new Error("resume rejected"));
    }
    this.state = "running";
    return Promise.resolve();
  }

  public suspend(): Promise<void> {
    this.suspendCount += 1;
    this.state = "suspended";
    return Promise.resolve();
  }

  public close(): Promise<void> {
    this.closeCount += 1;
    if (this.rejectClose) {
      return Promise.reject(new Error("close rejected"));
    }
    this.state = "closed";
    return Promise.resolve();
  }

  public advance(seconds: number): void {
    this.currentTime += seconds;
    for (const oscillator of this.oscillators) {
      if (
        oscillator.stopTime !== undefined &&
        oscillator.stopTime <= this.currentTime &&
        oscillator.onended !== null
      ) {
        oscillator.finish();
      }
    }
  }
}

function serviceWithContext(context: FakeAudioContext, trustedActivation = true): AudioService {
  return new AudioService({
    contextFactory: () => context,
    trustedActivation: () => trustedActivation,
  });
}

describe("AudioService activation and buses", () => {
  it("stores volumes but creates no context or sound before trusted activation", async () => {
    const context = new FakeAudioContext();
    let factoryCalls = 0;
    let trusted = false;
    const service = new AudioService({
      contextFactory: () => {
        factoryCalls += 1;
        return context;
      },
      trustedActivation: () => trusted,
    });

    expect(
      service.setVolumes({
        masterVolume: 0.35,
        effectsVolume: 0.6,
        musicVolume: 0.2,
      }),
    ).toEqual({
      masterVolume: 0.35,
      effectsVolume: 0.6,
      musicVolume: 0.2,
    });
    expect(service.playUiConfirm()).toBe(false);
    expect(await service.resume()).toBe(false);
    expect(await service.unlock()).toBe(false);
    expect(factoryCalls).toBe(0);
    expect(service.debugSnapshot()).toMatchObject({
      contextState: "not-created",
      availability: "unknown",
      unlocked: false,
      busNodeCount: 0,
    });

    trusted = true;
    expect(await service.unlock()).toBe(true);
    expect(factoryCalls).toBe(1);
    expect(context.resumeCount).toBe(1);
    expect(context.gains).toHaveLength(4);

    const [master, effects, music, gameplay] = context.gains;
    expect(master?.connections).toEqual([context.destination]);
    expect(effects?.connections).toEqual([master]);
    expect(music?.connections).toEqual([master]);
    expect(gameplay?.connections).toEqual([effects]);
    expect(master?.gain.value).toBe(0.35);
    expect(effects?.gain.value).toBe(0.6);
    expect(music?.gain.value).toBe(0.2);
    expect(gameplay?.gain.value).toBe(1);
  });

  it("requires a trusted event when one is supplied", async () => {
    const context = new FakeAudioContext();
    const service = serviceWithContext(context);

    expect(await service.unlock({ isTrusted: false })).toBe(false);
    expect(context.gains).toHaveLength(0);
    expect(await service.unlock({ isTrusted: true })).toBe(true);
    expect(context.gains).toHaveLength(4);
  });

  it("clamps corrupt volume values and applies changes after unlock", async () => {
    const context = new FakeAudioContext();
    const service = serviceWithContext(context);
    await service.unlock();

    expect(
      service.setVolumes({
        masterVolume: 4,
        effectsVolume: -2,
        musicVolume: Number.NaN,
      }),
    ).toEqual({
      masterVolume: 1,
      effectsVolume: 0,
      musicVolume: 1,
    });
    expect(context.gains[0]?.gain.value).toBe(1);
    expect(context.gains[1]?.gain.value).toBe(0);
    expect(context.gains[2]?.gain.value).toBe(1);
  });

  it("fails softly when AudioContext is missing, construction fails, or resume is blocked", async () => {
    const missing = new AudioService({
      contextFactory: () => undefined,
      trustedActivation: () => true,
    });
    expect(await missing.unlock()).toBe(false);
    expect(missing.debugSnapshot().availability).toBe("unavailable");
    expect(missing.playBooster()).toBe(false);

    const failedConstruction = new AudioService({
      contextFactory: () => {
        throw new Error("not supported");
      },
      trustedActivation: () => true,
    });
    expect(await failedConstruction.unlock()).toBe(false);
    expect(failedConstruction.debugSnapshot().availability).toBe("unavailable");

    const blockedContext = new FakeAudioContext();
    blockedContext.rejectResume = true;
    const blocked = serviceWithContext(blockedContext);
    expect(await blocked.unlock()).toBe(false);
    expect(blocked.debugSnapshot()).toMatchObject({
      availability: "available",
      contextState: "suspended",
      unlocked: false,
      busNodeCount: 4,
    });
  });
});

describe("AudioService procedural voices", () => {
  it("synthesizes capped cues, pans them, and releases every short-lived node", async () => {
    const context = new FakeAudioContext();
    const service = serviceWithContext(context);
    await service.unlock();

    for (let index = 0; index < 7; index += 1) {
      service.playBooster({ intensity: 0.8, pan: -0.5 });
    }
    expect(service.debugSnapshot()).toMatchObject({
      activeCueVoiceCount: 4,
      cueStartedCount: 4,
      cueDroppedCount: 3,
      liveOscillatorNodeCount: 4,
    });
    expect(context.oscillators.every((node) => node.type === "sawtooth")).toBe(true);
    expect(context.panners.every((node) => node.pan.value === -0.5)).toBe(true);

    context.advance(1);
    expect(service.debugSnapshot()).toMatchObject({
      activeCueVoiceCount: 0,
      liveOscillatorNodeCount: 0,
      liveManagedNodeCount: 4,
    });
    expect(context.oscillators.every((node) => node.disconnected)).toBe(true);
    expect(context.panners.every((node) => node.disconnected)).toBe(true);
    expect(service.playPortal({ portalPhase: "exit" })).toBe(true);
  });

  it("keeps UI and reset cues outside the ducked gameplay bus", async () => {
    const context = new FakeAudioContext();
    const service = serviceWithContext(context);
    await service.unlock();

    service.playUiFocus();
    service.playReset();
    service.playRespawn();

    const effectsBus = context.gains[1];
    const gameplayBus = context.gains[3];
    const cueGains = context.gains.slice(4);
    expect(cueGains[0]?.connections).toEqual([effectsBus]);
    expect(cueGains[1]?.connections).toEqual([effectsBus]);
    expect(cueGains[2]?.connections).toEqual([gameplayBus]);
  });

  it("caps engine loops at ten and scales each voice down as the mix fills", async () => {
    const context = new FakeAudioContext();
    const service = serviceWithContext(context);
    await service.unlock();

    for (let playerIndex = 0; playerIndex < MAX_ENGINE_VOICES; playerIndex += 1) {
      expect(
        service.updateEngineVoice(playerIndex, {
          active: true,
          speedNormalized: playerIndex / 10,
          throttle: 1,
          pan: playerIndex / 5 - 1,
        }),
      ).toBe(true);
    }
    expect(
      service.updateEngineVoice("overflow", {
        active: true,
        speedNormalized: 1,
        throttle: 1,
      }),
    ).toBe(false);
    expect(service.debugSnapshot()).toMatchObject({
      activeEngineVoiceCount: 10,
      engineStartedCount: 10,
      engineDroppedCount: 1,
      maxEngineVoices: 10,
    });
    expect(service.debugSnapshot().engineVoiceScale).toBeCloseTo(1 / Math.sqrt(10), 8);

    const oscillatorCount = context.oscillators.length;
    expect(
      service.updateEngineVoice(0, {
        active: true,
        speedNormalized: 1,
        throttle: 0.5,
        pan: 0.25,
      }),
    ).toBe(true);
    expect(context.oscillators).toHaveLength(oscillatorCount);
    expect(context.oscillators[0]?.frequency.value).toBe(267);

    service.stopEngineVoice(0);
    expect(service.debugSnapshot().activeEngineVoiceCount).toBe(9);
    expect(
      service.updateEngineVoice("replacement", {
        active: true,
        speedNormalized: 0,
        throttle: 0,
      }),
    ).toBe(false);
    context.advance(1);
    expect(
      service.updateEngineVoice("replacement", {
        active: true,
        speedNormalized: 0,
        throttle: 0,
      }),
    ).toBe(true);
    expect(service.debugSnapshot().activeEngineVoiceCount).toBe(10);
  });
});

describe("AudioService lifecycle and resources", () => {
  it("distinguishes gameplay ducking from hidden-tab suspension and explicit resume", async () => {
    const context = new FakeAudioContext();
    const service = serviceWithContext(context);
    service.setGameplayPaused(true);
    await service.unlock();
    expect(context.gains[3]?.gain.value).toBe(0.12);

    service.setGameplayPaused(false);
    expect(context.gains[3]?.gain.value).toBe(1);
    service.setGameplayPaused(true);
    expect(context.gains[3]?.gain.value).toBe(0.12);
    expect(context.state).toBe("running");
    expect(context.suspendCount).toBe(0);

    await service.setPageHidden(true);
    expect(context.state).toBe("suspended");
    expect(context.suspendCount).toBe(1);
    expect(await service.resume()).toBe(false);
    expect(context.resumeCount).toBe(1);

    await service.setPageHidden(false);
    expect(context.state).toBe("suspended");
    expect(context.resumeCount).toBe(1);
    expect(await service.resume()).toBe(true);
    expect(context.state).toBe("running");
    expect(context.resumeCount).toBe(2);
  });

  it("does not create a context if activation somehow arrives while hidden", async () => {
    const context = new FakeAudioContext();
    let factoryCalls = 0;
    const service = new AudioService({
      contextFactory: () => {
        factoryCalls += 1;
        return context;
      },
      trustedActivation: () => true,
    });

    await service.setPageHidden(true);
    expect(await service.unlock()).toBe(false);
    expect(factoryCalls).toBe(0);
    expect(service.debugSnapshot().contextState).toBe("not-created");
  });

  it("stops all voices, disconnects all managed nodes, and tolerates close failure", async () => {
    const context = new FakeAudioContext();
    context.rejectClose = true;
    const service = serviceWithContext(context);
    await service.unlock();
    service.playPortal({ pan: 0.5 });
    service.updateEngineVoice("p1", {
      active: true,
      speedNormalized: 0.5,
      throttle: 1,
      pan: -0.4,
    });
    expect(service.debugSnapshot().liveManagedNodeCount).toBeGreaterThan(4);

    await expect(service.dispose()).resolves.toBeUndefined();
    await expect(service.dispose()).resolves.toBeUndefined();
    expect(context.closeCount).toBe(1);
    expect(context.oscillators.every((node) => node.stopped && node.disconnected)).toBe(true);
    expect(context.gains.every((node) => node.disconnected)).toBe(true);
    expect(context.panners.every((node) => node.disconnected)).toBe(true);
    expect(service.debugSnapshot()).toMatchObject({
      contextState: "not-created",
      unlocked: false,
      busNodeCount: 0,
      activeCueVoiceCount: 0,
      activeEngineVoiceCount: 0,
      liveOscillatorNodeCount: 0,
      liveManagedNodeCount: 0,
      disposed: true,
    });
    expect(service.playUiConfirm()).toBe(false);
    expect(await service.unlock({ isTrusted: true })).toBe(false);
  });
});
