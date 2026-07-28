import { describe, expect, it } from "vitest";
import {
  VehicleCalibrationRecorder,
  calibrationInputAt,
} from "../../src/dev/VehicleCalibrationHarness";
import type { VehicleTelemetry } from "../../src/gameplay/vehicle/VehicleEntity";

const TELEMETRY: VehicleTelemetry = {
  playerIndex: 0,
  playerNumber: 1,
  color: "#FF0000",
  x: 1,
  y: 2,
  z: 3,
  linearVelocity: { x: 0, y: 0, z: 4 },
  angularVelocity: { x: 0, y: 1, z: 0 },
  speed: 4,
  forwardSpeed: 3.5,
  wheelOmega: 12,
  engineForce: 2000,
  steering: 0,
  hardBraking: false,
  recoveryCount: 0,
  automaticUprightRecoveryCount: 0,
  speedImmediatelyAfterRecovery: 0,
  passengerSurfaceCorrectionCount: 0,
  lastPassengerSurfaceVelocity: { x: 0, z: 0 },
};

describe("VehicleCalibrationHarness", () => {
  it("provides fixed scripted input phases", () => {
    expect(calibrationInputAt("coast", 2.99).vertical).toBe(1);
    expect(calibrationInputAt("coast", 3).vertical).toBe(0);
    expect(calibrationInputAt("hard-brake", 3).vertical).toBe(-1);
    expect(calibrationInputAt("slalom", 0).horizontal).toBe(-1);
    expect(calibrationInputAt("slalom", 0.75).horizontal).toBe(1);
  });

  it("exports stable JSON and CSV measurement fields", () => {
    const recorder = new VehicleCalibrationRecorder("straight-acceleration");
    recorder.record(0, TELEMETRY);
    recorder.record(0.02, { ...TELEMETRY, z: 3.2 });
    const report = recorder.report("2026-07-27T00:00:00.000Z");

    expect(report.fixedDeltaSeconds).toBe(0.02);
    expect(report.samples[1]?.distanceFromStart).toBeCloseTo(0.2);
    expect(recorder.toCsv()).toContain("timeSeconds,distanceFromStart");
    expect(recorder.toCsv().split("\n")).toHaveLength(3);
  });
});
