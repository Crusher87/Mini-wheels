import { describe, expect, it } from "vitest";
import { VEHICLE_SOURCE_REFERENCE } from "../../src/config/source-reference";
import { VEHICLE_RUNTIME } from "../../src/config/vehicle-runtime";
import {
  mapDriveForce,
  selectPassengerSurfaceCorrection,
  shortestAngleDelta,
} from "../../src/physics/VehiclePhysicsAdapter";

describe("vehicle source and runtime mapping", () => {
  it("preserves protected source values", () => {
    expect(VEHICLE_SOURCE_REFERENCE.body.mass).toBe(1500);
    expect(VEHICLE_SOURCE_REFERENCE.body.centerOfMassOffset).toEqual({
      x: 0,
      y: -0.125,
      z: 0.1,
    });
    expect(VEHICLE_SOURCE_REFERENCE.drive.maxMotorTorquePerWheel).toBe(400);
    expect(VEHICLE_SOURCE_REFERENCE.drive.opposingTorqueMultiplier).toBe(10);
    expect(VEHICLE_SOURCE_REFERENCE.drive.maxSteeringAngleDegrees).toBe(35);
    expect(VEHICLE_SOURCE_REFERENCE.wheel.radius).toBe(0.2);
  });

  it("maps source torque to ordinary and opposing Rapier forces", () => {
    expect(VEHICLE_RUNTIME.drive.frontEngineForce).toBe(2000);
    expect(VEHICLE_RUNTIME.drive.frontOpposingForce).toBe(20_000);
    expect(VEHICLE_RUNTIME.drive.maxSteeringRadians).toBeCloseTo(0.610865238, 8);
  });

  it("preserves direct suspension values beside mass-normalized Rapier calibration", () => {
    expect(VEHICLE_RUNTIME.wheel.suspensionStiffnessInitial).toBe(35_000);
    expect(VEHICLE_RUNTIME.wheel.suspensionCompressionInitial).toBe(1_500);
    expect(VEHICLE_RUNTIME.wheel.suspensionStiffnessCalibrated).toBeCloseTo(35_000 / 1_500);
    expect(VEHICLE_RUNTIME.wheel.suspensionCompressionCalibrated).toBe(1);
  });

  it("uses opposing force only while input and motion disagree", () => {
    expect(mapDriveForce(1, 4, 2)).toEqual({
      engineForce: 2000,
      opposing: false,
    });
    expect(mapDriveForce(-1, 4, 2)).toEqual({
      engineForce: -20_000,
      opposing: true,
    });
    expect(mapDriveForce(-1, -0.2, -0.1)).toEqual({
      engineForce: -2000,
      opposing: false,
    });
  });

  it("interpolates wheel rotation across the wrap boundary", () => {
    expect(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });

  it("selects only a shared kinematic support for the Profile B passenger correction", () => {
    expect(
      selectPassengerSurfaceCorrection(
        [
          { supportHandle: 11, velocityX: 1, velocityZ: 0 },
          { supportHandle: 11, velocityX: 1.2, velocityZ: 0.2 },
          { supportHandle: 22, velocityX: -4, velocityZ: 2 },
        ],
        0,
      ),
    ).toEqual({
      supportHandle: 11,
      supportingWheelCount: 2,
      velocityX: 1.1,
      velocityZ: 0.1,
    });
    expect(
      selectPassengerSurfaceCorrection(
        [
          { supportHandle: 11, velocityX: 1, velocityZ: 0 },
          { supportHandle: 22, velocityX: 1, velocityZ: 0 },
        ],
        0,
      ),
    ).toBeNull();
  });

  it("leaves driven passengers to the ray-cast vehicle solver", () => {
    const sharedSupport = [
      { supportHandle: 11, velocityX: 1, velocityZ: 0 },
      { supportHandle: 11, velocityX: 1, velocityZ: 0 },
    ];
    expect(selectPassengerSurfaceCorrection(sharedSupport, 0.05)).not.toBeNull();
    expect(selectPassengerSurfaceCorrection(sharedSupport, 0.051)).toBeNull();
  });
});
