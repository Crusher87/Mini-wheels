import { PLAYER_COLORS, type PlayerColor } from "../../config/player-colors";

export const MIN_PLAYER_COUNT = 1;
export const MAX_PLAYER_COUNT = PLAYER_COLORS.length;

declare const PLAYER_INDEX_BRAND: unique symbol;

/**
 * A zero-based index into the stable session roster.
 *
 * Construct indices with `createPlayerIndex` so ordinary numbers cannot be
 * accidentally substituted at typed call sites.
 */
export type PlayerIndex = number & {
  readonly [PLAYER_INDEX_BRAND]: "PlayerIndex";
};

export interface PlayerRecord {
  readonly index: PlayerIndex;
  readonly number: number;
  readonly color: PlayerColor;
  readonly marker: string;
}

export function assertValidPlayerCount(playerCount: number): void {
  if (
    !Number.isInteger(playerCount) ||
    playerCount < MIN_PLAYER_COUNT ||
    playerCount > MAX_PLAYER_COUNT
  ) {
    throw new RangeError(
      `Player count must be an integer from ${MIN_PLAYER_COUNT} to ${MAX_PLAYER_COUNT}; received ${String(playerCount)}.`,
    );
  }
}

export function createPlayerIndex(zeroBasedIndex: number): PlayerIndex {
  if (
    !Number.isInteger(zeroBasedIndex) ||
    zeroBasedIndex < 0 ||
    zeroBasedIndex >= MAX_PLAYER_COUNT
  ) {
    throw new RangeError(
      `Player index must be an integer from 0 to ${MAX_PLAYER_COUNT - 1}; received ${String(zeroBasedIndex)}.`,
    );
  }

  return zeroBasedIndex as PlayerIndex;
}

function createPlayerRecord(zeroBasedIndex: number): PlayerRecord {
  const index = createPlayerIndex(zeroBasedIndex);
  const color = PLAYER_COLORS[index];

  // createPlayerIndex constrains this lookup, while this guard keeps the
  // invariant explicit under noUncheckedIndexedAccess.
  if (color === undefined) {
    throw new RangeError(`No player color exists for index ${String(index)}.`);
  }

  const number = zeroBasedIndex + 1;
  return Object.freeze({
    index,
    number,
    color,
    marker: `P${String(number)}`,
  });
}

export class PlayerRoster {
  public readonly players: readonly PlayerRecord[];

  public constructor(playerCount: number) {
    assertValidPlayerCount(playerCount);
    this.players = Object.freeze(
      Array.from({ length: playerCount }, (_, index) => createPlayerRecord(index)),
    );
  }

  public get count(): number {
    return this.players.length;
  }

  public get(index: PlayerIndex): PlayerRecord {
    const player = this.players[index];
    if (player === undefined) {
      throw new RangeError(
        `Player index ${String(index)} is not active in this ${String(this.count)}-player roster.`,
      );
    }
    return player;
  }
}
