import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PLAYER_COLORS } from "../../src/config/player-colors";
import { createPlayerIndex, PlayerRoster } from "../../src/gameplay/player/PlayerRoster";
import { calculatePlayerSpawnTransform } from "../../src/gameplay/vehicle/PlayerVehicleSpawner";

const PLAYER_COUNTS = [1, 4, 7, 10] as const;

describe("player roster", () => {
  it("preserves the ten confirmed colors in stable player-index order", () => {
    expect(PLAYER_COLORS).toEqual([
      "#FF0000",
      "#FF7B00",
      "#FFFF00",
      "#7C00FF",
      "#00FF00",
      "#00FFFF",
      "#0000FF",
      "#FF00FF",
      "#E1E1E1",
      "#000000",
    ]);

    const roster = new PlayerRoster(10);
    expect(roster.players.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(roster.players.map(({ marker }) => marker)).toEqual([
      "P1",
      "P2",
      "P3",
      "P4",
      "P5",
      "P6",
      "P7",
      "P8",
      "P9",
      "P10",
    ]);
    expect(Object.isFrozen(roster.players)).toBe(true);
    expect(Object.isFrozen(roster.get(createPlayerIndex(0)))).toBe(true);
  });

  it("rejects player counts and indices outside the documented limits", () => {
    expect(() => new PlayerRoster(0)).toThrow(RangeError);
    expect(() => new PlayerRoster(11)).toThrow(RangeError);
    expect(() => new PlayerRoster(1.5)).toThrow(RangeError);
    expect(() => createPlayerIndex(-1)).toThrow(RangeError);
    expect(() => createPlayerIndex(10)).toThrow(RangeError);
  });
});

describe("player ring spawn", () => {
  it.each(PLAYER_COUNTS)(
    "uses the exact radius, floored step, one-degree offset, and root height for N=%i",
    (playerCount) => {
      const radius = playerCount / 2;
      const angleStepDegrees = Math.floor(360 / playerCount);

      for (let index = 0; index < playerCount; index += 1) {
        const transform = calculatePlayerSpawnTransform(playerCount, createPlayerIndex(index));
        const angleRadians = (angleStepDegrees * index + 1) * (Math.PI / 180);

        expect(transform.position.x).toBeCloseTo(Math.sin(angleRadians) * radius, 12);
        expect(transform.position.y).toBe(1);
        expect(transform.position.z).toBeCloseTo(Math.cos(angleRadians) * radius, 12);
        expect(Math.hypot(transform.position.x, transform.position.z)).toBeCloseTo(radius, 12);
      }
    },
  );

  it("uses a 51-degree step for seven players", () => {
    const playerSeven = calculatePlayerSpawnTransform(7, createPlayerIndex(6));
    const expectedAngle = (51 * 6 + 1) * (Math.PI / 180);

    expect(playerSeven.position.x).toBeCloseTo(Math.sin(expectedAngle) * 3.5, 12);
    expect(playerSeven.position.z).toBeCloseTo(Math.cos(expectedAngle) * 3.5, 12);
  });

  it.each(PLAYER_COUNTS)(
    "orients every local -Z vehicle forward axis toward center for N=%i",
    (playerCount) => {
      for (let index = 0; index < playerCount; index += 1) {
        const { position, quaternion } = calculatePlayerSpawnTransform(
          playerCount,
          createPlayerIndex(index),
        );
        const forward = new Vector3(0, 0, -1).applyQuaternion(
          new Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w),
        );
        const toCenter = new Vector3(-position.x, 0, -position.z).normalize();

        expect(forward.angleTo(toCenter)).toBeCloseTo(0, 12);
      }
    },
  );
});
