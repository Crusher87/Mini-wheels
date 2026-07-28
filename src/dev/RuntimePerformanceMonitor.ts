export interface TimingDistributionSnapshot {
  readonly sampleCount: number;
  readonly averageMilliseconds: number;
  readonly p50Milliseconds: number;
  readonly p95Milliseconds: number;
  readonly p99Milliseconds: number;
  readonly maximumMilliseconds: number;
}

export interface RuntimePerformanceSnapshot {
  readonly frames: TimingDistributionSnapshot;
  readonly physicsSteps: TimingDistributionSnapshot;
  readonly averageFramesPerSecond: number;
  readonly p95FramePacingFramesPerSecond: number;
  readonly overloadCount: number;
  readonly discardedSimulationSeconds: number;
  readonly physicsSubstepCount: number;
}

/**
 * Allocation-free timing collection for the hot loop. Snapshot sorting happens
 * only when development telemetry or a test explicitly requests it.
 */
export class RuntimePerformanceMonitor {
  private readonly frameMilliseconds: Float64Array;
  private readonly physicsMilliseconds: Float64Array;
  private frameCursor = 0;
  private frameCount = 0;
  private physicsCursor = 0;
  private physicsCount = 0;
  private overloadCount = 0;
  private discardedSimulationSeconds = 0;
  private physicsSubstepCount = 0;

  public constructor(public readonly capacity = 7_200) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("Performance-monitor capacity must be a positive integer.");
    }
    this.frameMilliseconds = new Float64Array(capacity);
    this.physicsMilliseconds = new Float64Array(capacity);
  }

  public recordFrame(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    this.frameMilliseconds[this.frameCursor] = deltaSeconds * 1_000;
    this.frameCursor = (this.frameCursor + 1) % this.capacity;
    this.frameCount = Math.min(this.capacity, this.frameCount + 1);
  }

  public recordPhysicsStep(durationMilliseconds: number): void {
    if (!Number.isFinite(durationMilliseconds) || durationMilliseconds < 0) {
      return;
    }
    this.physicsMilliseconds[this.physicsCursor] = durationMilliseconds;
    this.physicsCursor = (this.physicsCursor + 1) % this.capacity;
    this.physicsCount = Math.min(this.capacity, this.physicsCount + 1);
    this.physicsSubstepCount += 1;
  }

  public recordOverload(discardedSeconds: number): void {
    this.overloadCount += 1;
    if (Number.isFinite(discardedSeconds) && discardedSeconds > 0) {
      this.discardedSimulationSeconds += discardedSeconds;
    }
  }

  public reset(): void {
    this.frameCursor = 0;
    this.frameCount = 0;
    this.physicsCursor = 0;
    this.physicsCount = 0;
    this.overloadCount = 0;
    this.discardedSimulationSeconds = 0;
    this.physicsSubstepCount = 0;
  }

  public snapshot(): RuntimePerformanceSnapshot {
    const frames = distribution(this.frameMilliseconds, this.frameCount);
    const physicsSteps = distribution(this.physicsMilliseconds, this.physicsCount);
    return {
      frames,
      physicsSteps,
      averageFramesPerSecond:
        frames.averageMilliseconds > 0 ? 1_000 / frames.averageMilliseconds : 0,
      p95FramePacingFramesPerSecond:
        frames.p95Milliseconds > 0 ? 1_000 / frames.p95Milliseconds : 0,
      overloadCount: this.overloadCount,
      discardedSimulationSeconds: this.discardedSimulationSeconds,
      physicsSubstepCount: this.physicsSubstepCount,
    };
  }
}

function distribution(values: Float64Array, count: number): TimingDistributionSnapshot {
  if (count <= 0) {
    return {
      sampleCount: 0,
      averageMilliseconds: 0,
      p50Milliseconds: 0,
      p95Milliseconds: 0,
      p99Milliseconds: 0,
      maximumMilliseconds: 0,
    };
  }
  const sorted = Array.from(values.subarray(0, count)).sort((left, right) => left - right);
  let total = 0;
  for (const value of sorted) {
    total += value;
  }
  return {
    sampleCount: count,
    averageMilliseconds: total / count,
    p50Milliseconds: percentile(sorted, 0.5),
    p95Milliseconds: percentile(sorted, 0.95),
    p99Milliseconds: percentile(sorted, 0.99),
    maximumMilliseconds: sorted[count - 1] ?? 0,
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}
