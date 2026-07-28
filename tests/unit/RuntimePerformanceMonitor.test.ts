import { describe, expect, it } from "vitest";
import { RuntimePerformanceMonitor } from "../../src/dev/RuntimePerformanceMonitor";

describe("RuntimePerformanceMonitor", () => {
  it("reports bounded frame and fixed-step percentile telemetry", () => {
    const monitor = new RuntimePerformanceMonitor(4);
    for (const milliseconds of [10, 20, 30, 40, 50]) {
      monitor.recordFrame(milliseconds / 1_000);
      monitor.recordPhysicsStep(milliseconds / 10);
    }
    monitor.recordOverload(0.12);

    const snapshot = monitor.snapshot();
    expect(snapshot.frames).toMatchObject({
      sampleCount: 4,
      averageMilliseconds: 35,
      p50Milliseconds: 30,
      p95Milliseconds: 50,
      p99Milliseconds: 50,
      maximumMilliseconds: 50,
    });
    expect(snapshot.physicsSteps.sampleCount).toBe(4);
    expect(snapshot.physicsSubstepCount).toBe(5);
    expect(snapshot.overloadCount).toBe(1);
    expect(snapshot.discardedSimulationSeconds).toBeCloseTo(0.12);
  });

  it("ignores invalid samples and resets all counters", () => {
    const monitor = new RuntimePerformanceMonitor(2);
    monitor.recordFrame(Number.NaN);
    monitor.recordPhysicsStep(-1);
    expect(monitor.snapshot().frames.sampleCount).toBe(0);

    monitor.recordFrame(1 / 60);
    monitor.recordPhysicsStep(0.5);
    monitor.reset();
    expect(monitor.snapshot()).toMatchObject({
      averageFramesPerSecond: 0,
      overloadCount: 0,
      discardedSimulationSeconds: 0,
      physicsSubstepCount: 0,
    });
  });
});
