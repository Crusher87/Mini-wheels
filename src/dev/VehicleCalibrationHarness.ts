import type { LogicalAxes } from "../input/InputHub";
import type { VehicleTelemetry } from "../gameplay/vehicle/VehicleEntity";

export const CALIBRATION_SCRIPT_NAMES = [
  "straight-acceleration",
  "coast",
  "hard-brake",
  "full-steering-left",
  "full-steering-right",
  "slalom",
] as const;

export type CalibrationScriptName = (typeof CALIBRATION_SCRIPT_NAMES)[number];

export interface CalibrationSample extends VehicleTelemetry {
  readonly timeSeconds: number;
  readonly distanceFromStart: number;
}

export interface CalibrationReport {
  readonly schemaVersion: 1;
  readonly script: CalibrationScriptName;
  readonly fixedDeltaSeconds: 0.02;
  readonly generatedAt: string;
  readonly dependencies: {
    readonly three: string;
    readonly rapier: string;
  };
  readonly samples: readonly CalibrationSample[];
}

const ZERO_INPUT: LogicalAxes = Object.freeze({ horizontal: 0, vertical: 0 });

export function calibrationInputAt(
  script: CalibrationScriptName,
  timeSeconds: number,
): LogicalAxes {
  switch (script) {
    case "straight-acceleration":
      return timeSeconds < 5 ? { horizontal: 0, vertical: 1 } : ZERO_INPUT;
    case "coast":
      return timeSeconds < 3 ? { horizontal: 0, vertical: 1 } : ZERO_INPUT;
    case "hard-brake":
      return timeSeconds < 3 ? { horizontal: 0, vertical: 1 } : { horizontal: 0, vertical: -1 };
    case "full-steering-left":
      return { horizontal: -1, vertical: 1 };
    case "full-steering-right":
      return { horizontal: 1, vertical: 1 };
    case "slalom": {
      const horizontal = Math.floor(timeSeconds / 0.75) % 2 === 0 ? -1 : 1;
      return { horizontal, vertical: 1 };
    }
  }
}

export class VehicleCalibrationRecorder {
  private readonly samples: CalibrationSample[] = [];
  private start: { x: number; y: number; z: number } | undefined;

  public constructor(private readonly script: CalibrationScriptName) {}

  public record(timeSeconds: number, telemetry: VehicleTelemetry): void {
    this.start ??= { x: telemetry.x, y: telemetry.y, z: telemetry.z };
    const dx = telemetry.x - this.start.x;
    const dy = telemetry.y - this.start.y;
    const dz = telemetry.z - this.start.z;
    this.samples.push({
      timeSeconds,
      distanceFromStart: Math.hypot(dx, dy, dz),
      ...telemetry,
    });
  }

  public report(generatedAt = new Date().toISOString()): CalibrationReport {
    return {
      schemaVersion: 1,
      script: this.script,
      fixedDeltaSeconds: 0.02,
      generatedAt,
      dependencies: {
        three: "0.185.1",
        rapier: "0.19.3",
      },
      samples: this.samples,
    };
  }

  public toCsv(): string {
    const columns = [
      "timeSeconds",
      "distanceFromStart",
      "x",
      "y",
      "z",
      "speed",
      "forwardSpeed",
      "wheelOmega",
      "engineForce",
      "steering",
      "hardBraking",
    ] as const satisfies readonly (keyof CalibrationSample)[];
    const lines = [columns.join(",")];
    for (const sample of this.samples) {
      lines.push(columns.map((column) => String(sample[column])).join(","));
    }
    return lines.join("\n");
  }
}
