import { Quaternion, Vector3 } from "three";
import type { RigidBody } from "@dimforge/rapier3d";
import { editorAssetEntityDimensions } from "../../editor/EditorAssetCatalog";
import type {
  InteractionAction,
  InteractionCondition,
  InteractionDefinition,
  InteractionEvent,
  MapEntity,
} from "../../maps/MapDocument";

const MAXIMUM_ACTIONS_PER_STEP = 64;

interface PendingEvent {
  readonly sourceEntityId: string;
  readonly event: InteractionEvent;
}

interface ZoneRuntime {
  readonly entity: MapEntity;
  readonly inverseRotation: Quaternion;
  occupied: boolean;
}

interface TimerRuntime {
  readonly entity: MapEntity;
  elapsedSeconds: number;
  running: boolean;
}

export interface AuthoredInteractionActionEvent {
  readonly interaction: InteractionDefinition;
  readonly target: MapEntity;
}

export interface AuthoredInteractionSystemOptions {
  readonly conditionPasses?: (condition: InteractionCondition | null) => boolean;
  readonly onAction?: (event: AuthoredInteractionActionEvent) => void;
}

export interface AuthoredInteractionDebugSnapshot {
  readonly linkCount: number;
  readonly zoneCount: number;
  readonly timerCount: number;
  readonly activationCount: number;
  readonly boundedActionCount: number;
  readonly counters: Readonly<Record<string, number>>;
  readonly lastAction: {
    readonly sourceEntityId: string;
    readonly targetEntityId: string;
    readonly action: InteractionAction;
  } | null;
}

export class AuthoredInteractionSystem {
  private readonly entityById: ReadonlyMap<string, MapEntity>;
  private readonly linksBySource = new Map<string, readonly InteractionDefinition[]>();
  private readonly zones: ZoneRuntime[] = [];
  private readonly timers: TimerRuntime[] = [];
  private readonly counters = new Map<string, number>();
  private activationCount = 0;
  private boundedActionCount = 0;
  private lastAction: AuthoredInteractionDebugSnapshot["lastAction"] = null;

  public constructor(
    entities: readonly MapEntity[],
    interactions: readonly InteractionDefinition[],
    private readonly options: AuthoredInteractionSystemOptions = {},
  ) {
    this.entityById = new Map(entities.map((entity) => [entity.id, entity]));
    for (const interaction of interactions) {
      const links = this.linksBySource.get(interaction.sourceEntityId) ?? [];
      this.linksBySource.set(interaction.sourceEntityId, Object.freeze([...links, interaction]));
    }
    for (const entity of entities) {
      if (
        entity.assetId === "interaction.button" ||
        entity.assetId === "interaction.pressure-plate" ||
        entity.assetId === "interaction.trigger-zone"
      ) {
        this.zones.push({
          entity,
          inverseRotation: new Quaternion().fromArray(entity.transform.rotation).invert(),
          occupied: false,
        });
      } else if (entity.assetId === "interaction.timer") {
        this.timers.push({
          entity,
          elapsedSeconds: 0,
          running: entity.properties["enabled"] !== false && entity.properties["startsOn"] === true,
        });
      } else if (entity.assetId === "interaction.counter") {
        this.counters.set(entity.id, 0);
      }
    }
  }

  public fixedStep(deltaSeconds: number, bodies: readonly RigidBody[]): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new RangeError("Interaction delta must be finite and positive.");
    }
    const pending: PendingEvent[] = [];
    for (const zone of this.zones) {
      if (zone.entity.properties["enabled"] === false) {
        continue;
      }
      const occupied = bodies.some((body) => this.contains(zone, body.translation()));
      if (occupied === zone.occupied) {
        continue;
      }
      zone.occupied = occupied;
      if (occupied) {
        if (zone.entity.assetId !== "interaction.trigger-zone") {
          pending.push({ sourceEntityId: zone.entity.id, event: "pressed" });
        }
        pending.push({ sourceEntityId: zone.entity.id, event: "entered" });
        pending.push({ sourceEntityId: zone.entity.id, event: "activated" });
      } else {
        if (zone.entity.assetId !== "interaction.trigger-zone") {
          pending.push({ sourceEntityId: zone.entity.id, event: "released" });
        }
        pending.push({ sourceEntityId: zone.entity.id, event: "exited" });
      }
    }
    for (const timer of this.timers) {
      if (!timer.running || timer.entity.properties["enabled"] === false) {
        continue;
      }
      timer.elapsedSeconds += deltaSeconds;
      const duration = numberProperty(timer.entity, "durationSeconds", 3);
      if (timer.elapsedSeconds + 1e-9 < duration) {
        continue;
      }
      pending.push({ sourceEntityId: timer.entity.id, event: "elapsed" });
      pending.push({ sourceEntityId: timer.entity.id, event: "activated" });
      if (timer.entity.properties["repeat"] === true) {
        timer.elapsedSeconds %= duration;
      } else {
        timer.elapsedSeconds = duration;
        timer.running = false;
      }
    }
    this.dispatch(pending);
  }

  public reset(): void {
    for (const zone of this.zones) {
      zone.occupied = false;
    }
    for (const timer of this.timers) {
      timer.elapsedSeconds = 0;
      timer.running =
        timer.entity.properties["enabled"] !== false &&
        timer.entity.properties["startsOn"] === true;
    }
    for (const counterId of this.counters.keys()) {
      this.counters.set(counterId, 0);
    }
    this.activationCount = 0;
    this.boundedActionCount = 0;
    this.lastAction = null;
  }

  public debugSnapshot(): AuthoredInteractionDebugSnapshot {
    return {
      linkCount: [...this.linksBySource.values()].reduce((total, links) => total + links.length, 0),
      zoneCount: this.zones.length,
      timerCount: this.timers.length,
      activationCount: this.activationCount,
      boundedActionCount: this.boundedActionCount,
      counters: Object.freeze(Object.fromEntries(this.counters)),
      lastAction: this.lastAction,
    };
  }

  private contains(zone: ZoneRuntime, position: { x: number; y: number; z: number }): boolean {
    const dimensions = editorAssetEntityDimensions(zone.entity);
    if (dimensions === null) {
      return false;
    }
    const local = new Vector3(
      position.x - zone.entity.transform.position[0],
      position.y - zone.entity.transform.position[1],
      position.z - zone.entity.transform.position[2],
    ).applyQuaternion(zone.inverseRotation);
    return (
      Math.abs(local.x) <=
        (dimensions.width * Math.abs(zone.entity.transform.scale[0])) / 2 + 0.45 &&
      Math.abs(local.y) <=
        (dimensions.height * Math.abs(zone.entity.transform.scale[1])) / 2 + 0.8 &&
      Math.abs(local.z) <= (dimensions.depth * Math.abs(zone.entity.transform.scale[2])) / 2 + 0.45
    );
  }

  private dispatch(initialEvents: readonly PendingEvent[]): void {
    const queue = [...initialEvents];
    let actionCount = 0;
    while (queue.length > 0 && actionCount < MAXIMUM_ACTIONS_PER_STEP) {
      const event = queue.shift()!;
      for (const interaction of this.linksBySource.get(event.sourceEntityId) ?? []) {
        if (
          interaction.event !== event.event ||
          this.options.conditionPasses?.(interaction.condition) === false
        ) {
          continue;
        }
        const target = this.entityById.get(interaction.targetEntityId);
        if (target === undefined) {
          continue;
        }
        actionCount += 1;
        this.activationCount += 1;
        this.lastAction = Object.freeze({
          sourceEntityId: interaction.sourceEntityId,
          targetEntityId: interaction.targetEntityId,
          action: interaction.action,
        });
        if (target.assetId === "interaction.counter") {
          if (interaction.action === "increment") {
            const next = (this.counters.get(target.id) ?? 0) + 1;
            this.counters.set(target.id, next);
            if (next === numberProperty(target, "threshold", 3)) {
              queue.push({ sourceEntityId: target.id, event: "activated" });
            }
          } else if (interaction.action === "reset") {
            this.counters.set(target.id, 0);
          }
        }
        const targetTimer = this.timers.find((timer) => timer.entity.id === target.id);
        if (targetTimer !== undefined) {
          if (interaction.action === "start") {
            const duration = numberProperty(targetTimer.entity, "durationSeconds", 3);
            if (!targetTimer.running && targetTimer.elapsedSeconds + 1e-9 >= duration) {
              targetTimer.elapsedSeconds = 0;
            }
            targetTimer.running = true;
          } else if (interaction.action === "stop") {
            targetTimer.running = false;
          } else if (interaction.action === "reset") {
            targetTimer.elapsedSeconds = 0;
            targetTimer.running = targetTimer.entity.properties["startsOn"] === true;
          }
        }
        this.options.onAction?.({ interaction, target });
        if (actionCount >= MAXIMUM_ACTIONS_PER_STEP) {
          break;
        }
      }
    }
    if (queue.length > 0) {
      this.boundedActionCount += queue.length;
    }
  }
}

function numberProperty(entity: MapEntity, key: string, fallback: number): number {
  const value = entity.properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
