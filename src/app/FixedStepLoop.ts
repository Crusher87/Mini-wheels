export interface FixedStepConfig {
  readonly fixedDeltaSeconds: number;
  readonly maxFrameDeltaSeconds: number;
  readonly maxStepsPerFrame: number;
}

export interface FixedStepResult {
  readonly steps: number;
  readonly alpha: number;
  readonly overloaded: boolean;
  readonly discardedSeconds: number;
}

export const DEFAULT_FIXED_STEP_CONFIG: FixedStepConfig = Object.freeze({
  fixedDeltaSeconds: 0.02,
  maxFrameDeltaSeconds: 0.25,
  maxStepsPerFrame: 5,
});

export class FixedStepLoop {
  private accumulatorSeconds = 0;

  public constructor(private readonly config: FixedStepConfig = DEFAULT_FIXED_STEP_CONFIG) {
    if (
      config.fixedDeltaSeconds <= 0 ||
      config.maxFrameDeltaSeconds <= 0 ||
      config.maxStepsPerFrame < 1
    ) {
      throw new RangeError("Fixed-step configuration values must be positive.");
    }
  }

  public advance(
    frameDeltaSeconds: number,
    step: (fixedDeltaSeconds: number) => void,
  ): FixedStepResult {
    const safeDelta = Number.isFinite(frameDeltaSeconds)
      ? Math.min(Math.max(frameDeltaSeconds, 0), this.config.maxFrameDeltaSeconds)
      : 0;
    this.accumulatorSeconds += safeDelta;

    let steps = 0;
    const comparisonEpsilon = this.config.fixedDeltaSeconds * 1e-9;
    while (
      this.accumulatorSeconds + comparisonEpsilon >= this.config.fixedDeltaSeconds &&
      steps < this.config.maxStepsPerFrame
    ) {
      step(this.config.fixedDeltaSeconds);
      this.accumulatorSeconds = Math.max(
        0,
        this.accumulatorSeconds - this.config.fixedDeltaSeconds,
      );
      steps += 1;
    }

    let overloaded = false;
    let discardedSeconds = 0;
    if (
      steps === this.config.maxStepsPerFrame &&
      this.accumulatorSeconds >= this.config.fixedDeltaSeconds
    ) {
      overloaded = true;
      discardedSeconds =
        this.accumulatorSeconds - (this.accumulatorSeconds % this.config.fixedDeltaSeconds);
      this.accumulatorSeconds %= this.config.fixedDeltaSeconds;
    }

    return {
      steps,
      alpha: this.accumulatorSeconds / this.config.fixedDeltaSeconds,
      overloaded,
      discardedSeconds,
    };
  }

  public reset(): void {
    this.accumulatorSeconds = 0;
  }

  public get accumulator(): number {
    return this.accumulatorSeconds;
  }
}
