/**
 * CONFIRMED Alpha player palette, in stable zero-based player-index order.
 *
 * Hex strings are kept as the source representation so color conversion remains
 * the responsibility of the renderer rather than silently changing these values.
 */
export const PLAYER_COLORS = Object.freeze([
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
] as const);

export type PlayerColor = (typeof PLAYER_COLORS)[number];
