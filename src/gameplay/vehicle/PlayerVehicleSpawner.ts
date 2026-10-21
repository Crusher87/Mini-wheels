import { assertValidPlayerCount, type PlayerIndex } from "../player/PlayerRoster";

const DEGREES_TO_RADIANS = Math.PI / 180;

export interface SpawnOrigin {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SpawnPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SpawnQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface PlayerSpawnTransform {
  readonly position: SpawnPosition;
  readonly quaternion: SpawnQuaternion;
}

export const DEFAULT_PLAYER_SPAWN_ORIGIN: SpawnOrigin = Object.freeze({
  x: 0,
  y: 1,
  z: 0,
});

function assertFiniteOrigin(origin: SpawnOrigin): void {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) {
    throw new RangeError("Spawn-origin coordinates must all be finite.");
  }
}

/**
 * Calculates the exact Alpha ring transform for one zero-based player index.
 *
 * Vehicle geometry uses local +Z as forward. Adding a half-turn to the radial
 * spawn angle turns each visible nose toward the ring center.
 */
export function calculatePlayerSpawnTransform(
  playerCount: number,
  playerIndex: PlayerIndex,
  origin: SpawnOrigin = DEFAULT_PLAYER_SPAWN_ORIGIN,
): PlayerSpawnTransform {
  assertValidPlayerCount(playerCount);
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= playerCount) {
    throw new RangeError(
      `Player index must be active in the ${String(playerCount)}-player roster; received ${String(playerIndex)}.`,
    );
  }
  assertFiniteOrigin(origin);

  const radius = playerCount / 2;
  const angleStepDegrees = Math.floor(360 / playerCount);
  const angleRadians = (angleStepDegrees * playerIndex + 1) * DEGREES_TO_RADIANS;
  const inwardYawRadians = angleRadians + Math.PI;
  const halfAngle = inwardYawRadians / 2;

  return Object.freeze({
    position: Object.freeze({
      x: origin.x + Math.sin(angleRadians) * radius,
      y: origin.y,
      z: origin.z + Math.cos(angleRadians) * radius,
    }),
    quaternion: Object.freeze({
      x: 0,
      y: Math.sin(halfAngle),
      z: 0,
      w: Math.cos(halfAngle),
    }),
  });
}

/**
 * Stateless service facade used by world composition. The delegated function is
 * exported separately to keep spawn math directly unit-testable.
 */
export class PlayerVehicleSpawner {
  public calculateTransform(
    playerCount: number,
    playerIndex: PlayerIndex,
    origin: SpawnOrigin = DEFAULT_PLAYER_SPAWN_ORIGIN,
  ): PlayerSpawnTransform {
    return calculatePlayerSpawnTransform(playerCount, playerIndex, origin);
  }
}
