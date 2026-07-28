import type * as RapierTypes from "@dimforge/rapier3d";

export type RapierModule = typeof RapierTypes;

let initialization: Promise<RapierModule> | undefined;

export function initializeRapier(): Promise<RapierModule> {
  initialization ??= import("@dimforge/rapier3d");
  return initialization;
}
