export const AppState = {
  Boot: "boot",
  AwaitingActivation: "awaiting-activation",
  FrontEnd: "front-end",
  MapLibrary: "map-library",
  Editing: "editing",
  Loading: "loading",
  Playing: "playing",
  Paused: "paused",
  Resetting: "resetting",
  Error: "error",
} as const;

export type AppState = (typeof AppState)[keyof typeof AppState];
