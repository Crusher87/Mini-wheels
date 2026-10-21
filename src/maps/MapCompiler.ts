import { canonicalMapDocument } from "./MapCodec";
import type { MapDocument, MapEntity, MapType } from "./MapDocument";

export interface MapDiagnostic {
  readonly level: "warning" | "blocking";
  readonly code: string;
  readonly message: string;
  readonly entityId: string | null;
}

export interface RuntimeMapBlueprint {
  readonly schemaVersion: 1;
  readonly documentId: string;
  readonly title: string;
  readonly mapType: MapType;
  readonly environment: MapDocument["environment"];
  readonly entities: readonly MapEntity[];
  readonly tracks: MapDocument["tracks"];
  readonly race: MapDocument["race"];
  readonly interactions: MapDocument["interactions"];
  readonly entityIndexById: Readonly<Record<string, number>>;
  readonly diagnostics: readonly MapDiagnostic[];
  readonly freeDriveReady: boolean;
  readonly scoredRaceReady: boolean;
}

export function compileMapDocument(document: MapDocument): RuntimeMapBlueprint {
  const canonical = canonicalMapDocument(document);
  const diagnostics: MapDiagnostic[] = [];
  const entityIndexById: Record<string, number> = {};
  canonical.entities.forEach((entity, index) => {
    entityIndexById[entity.id] = index;
  });

  const startGrid =
    canonical.race.activeStartGridId === null
      ? undefined
      : canonical.entities[entityIndexById[canonical.race.activeStartGridId] ?? -1];
  if (startGrid?.assetId !== "race.start-grid") {
    diagnostics.push(
      Object.freeze({
        level: "blocking",
        code: "race.missing-start-grid",
        message: "Place or select a usable start grid before driving this map.",
        entityId: canonical.race.activeStartGridId,
      }),
    );
  }

  const isScoredMode = canonical.race.mode !== "free-roam";
  if (isScoredMode && canonical.race.finishEntityIds.length === 0) {
    diagnostics.push(
      Object.freeze({
        level: "warning",
        code: "race.missing-finish",
        message: "Add a finish before starting a scored race. Free drive is still available.",
        entityId: null,
      }),
    );
  }

  if (isScoredMode && canonical.race.checkpointGroups.length > 0) {
    const incoming = new Map(canonical.race.checkpointGroups.map((group) => [group.id, 0]));
    const outgoing = new Map<string, string[]>();
    for (const edge of canonical.race.routeEdges) {
      incoming.set(edge.toGroupId, (incoming.get(edge.toGroupId) ?? 0) + 1);
      const targets = outgoing.get(edge.fromGroupId) ?? [];
      targets.push(edge.toGroupId);
      outgoing.set(edge.fromGroupId, targets);
    }
    const roots = canonical.race.checkpointGroups
      .filter((group) => (incoming.get(group.id) ?? 0) === 0)
      .map((group) => group.id);
    if (roots.length === 0) {
      diagnostics.push(
        Object.freeze({
          level: "blocking",
          code: "race.route-no-start",
          message: "The checkpoint route needs a first group before it can be raced.",
          entityId: null,
        }),
      );
    } else {
      const reachable = new Set(roots);
      const queue = [...roots];
      while (queue.length > 0) {
        for (const target of outgoing.get(queue.shift()!) ?? []) {
          if (!reachable.has(target)) {
            reachable.add(target);
            queue.push(target);
          }
        }
      }
      for (const group of canonical.race.checkpointGroups) {
        if (group.required && !reachable.has(group.id)) {
          diagnostics.push(
            Object.freeze({
              level: "blocking",
              code: "race.required-group-unreachable",
              message: "A required checkpoint group cannot be reached from the route start.",
              entityId: group.checkpointEntityIds[0] ?? null,
            }),
          );
        }
      }
    }
  }

  for (const recoveryVolume of canonical.entities.filter(
    (entity) => entity.assetId === "race.recovery-volume",
  )) {
    if (typeof recoveryVolume.properties["safePoseEntityId"] !== "string") {
      diagnostics.push(
        Object.freeze({
          level: "warning",
          code: "race.recovery-missing-pose",
          message: "Select this Recovery Volume with a Safe Recovery Pose, then assign the link.",
          entityId: recoveryVolume.id,
        }),
      );
    }
  }

  for (const portal of canonical.entities.filter((entity) => entity.assetId === "travel.portal")) {
    if (typeof portal.properties["peerPortalEntityId"] !== "string") {
      diagnostics.push(
        Object.freeze({
          level: "warning",
          code: "travel.portal-unlinked",
          message: "Select this Portal with one more Portal, then link the pair.",
          entityId: portal.id,
        }),
      );
    }
  }

  const enabledPointLightCount = canonical.entities.filter(
    (entity) =>
      entity.assetId === "decoration.point-light" && entity.properties["enabled"] !== false,
  ).length;
  if (enabledPointLightCount > 12) {
    diagnostics.push(
      Object.freeze({
        level: "warning",
        code: "decoration.many-point-lights",
        message: `${String(enabledPointLightCount)} lights are on. The map is allowed, but some computers may run more slowly.`,
        entityId: null,
      }),
    );
  }

  const freeDriveReady = startGrid?.assetId === "race.start-grid";
  const scoredRaceReady =
    freeDriveReady &&
    (!isScoredMode || canonical.race.finishEntityIds.length > 0) &&
    diagnostics.every((diagnostic) => diagnostic.level !== "blocking");

  return Object.freeze({
    schemaVersion: 1,
    documentId: canonical.header.documentId,
    title: canonical.header.title,
    mapType: canonical.header.mapType,
    environment: canonical.environment,
    entities: canonical.entities,
    tracks: canonical.tracks,
    race: canonical.race,
    interactions: canonical.interactions,
    entityIndexById: Object.freeze(entityIndexById),
    diagnostics: Object.freeze(diagnostics),
    freeDriveReady,
    scoredRaceReady,
  });
}
