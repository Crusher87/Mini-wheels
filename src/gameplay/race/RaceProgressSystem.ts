import type { RaceDefinition } from "../../maps/MapDocument";

export type RaceCrossingOutcome =
  | "ignored"
  | "wrong-direction"
  | "out-of-route"
  | "checkpoint-advanced"
  | "lap-complete"
  | "finished";

export type RacePhase = "free-roam" | "countdown" | "racing" | "results";

export const RACE_COUNTDOWN_SECONDS = 3;

export interface PlayerRaceProgressSnapshot {
  readonly playerIndex: number;
  readonly lap: number;
  readonly lapCount: number;
  readonly completedGroupIds: readonly string[];
  readonly availableGroupIds: readonly string[];
  readonly requiredGroupCount: number;
  readonly finished: boolean;
  readonly finishPlace: number | null;
  readonly elapsedSeconds: number;
  readonly wrongDirectionCount: number;
  readonly invalidRouteCount: number;
  readonly lastOutcome: RaceCrossingOutcome;
}

export interface RaceProgressSnapshot {
  readonly mode: RaceDefinition["mode"];
  readonly scored: boolean;
  readonly phase: RacePhase;
  readonly countdownRemainingSeconds: number;
  readonly finishCount: number;
  readonly players: readonly PlayerRaceProgressSnapshot[];
}

interface MutablePlayerRaceProgress {
  lap: number;
  readonly completedGroupIds: Set<string>;
  readonly availableGroupIds: Set<string>;
  finished: boolean;
  finishPlace: number | null;
  elapsedSeconds: number;
  wrongDirectionCount: number;
  invalidRouteCount: number;
  lastOutcome: RaceCrossingOutcome;
}

export class RaceProgressSystem {
  private readonly groupIdByCheckpointEntityId = new Map<string, string>();
  private readonly outgoingGroupIds = new Map<string, readonly string[]>();
  private readonly initialGroupIds: readonly string[];
  private readonly requiredGroupIds: ReadonlySet<string>;
  private readonly finishEntityIds: ReadonlySet<string>;
  private readonly players: MutablePlayerRaceProgress[];
  private finishCount = 0;
  private phase: RacePhase;
  private countdownRemainingSeconds: number;

  public constructor(
    private readonly race: RaceDefinition,
    playerCount: number,
  ) {
    const incomingCounts = new Map(race.checkpointGroups.map((group) => [group.id, 0]));
    for (const group of race.checkpointGroups) {
      for (const checkpointEntityId of group.checkpointEntityIds) {
        this.groupIdByCheckpointEntityId.set(checkpointEntityId, group.id);
      }
      this.outgoingGroupIds.set(
        group.id,
        Object.freeze(
          race.routeEdges
            .filter((edge) => edge.fromGroupId === group.id)
            .map((edge) => edge.toGroupId),
        ),
      );
    }
    for (const edge of race.routeEdges) {
      incomingCounts.set(edge.toGroupId, (incomingCounts.get(edge.toGroupId) ?? 0) + 1);
    }
    this.initialGroupIds = Object.freeze(
      race.checkpointGroups
        .filter((group) => (incomingCounts.get(group.id) ?? 0) === 0)
        .map((group) => group.id),
    );
    this.requiredGroupIds = new Set(
      race.checkpointGroups.filter((group) => group.required).map((group) => group.id),
    );
    this.finishEntityIds = new Set(race.finishEntityIds);
    this.players = Array.from({ length: playerCount }, () => this.createPlayerProgress());
    this.phase = race.mode === "free-roam" ? "free-roam" : "countdown";
    this.countdownRemainingSeconds = race.mode === "free-roam" ? 0 : RACE_COUNTDOWN_SECONDS;
  }

  public fixedStep(deltaSeconds: number): void {
    if (this.phase === "countdown") {
      this.countdownRemainingSeconds = Math.max(0, this.countdownRemainingSeconds - deltaSeconds);
      if (this.countdownRemainingSeconds <= 1e-9) {
        this.phase = "racing";
      }
      return;
    }
    if (this.phase !== "racing") {
      return;
    }
    for (const player of this.players) {
      if (!player.finished) {
        player.elapsedSeconds += deltaSeconds;
      }
    }
  }

  public applyRecoveryPenalty(playerIndex: number, penaltySeconds: number): void {
    const player = this.players[playerIndex];
    if (
      player === undefined ||
      player.finished ||
      this.phase !== "racing" ||
      !Number.isFinite(penaltySeconds) ||
      penaltySeconds <= 0
    ) {
      return;
    }
    player.elapsedSeconds += penaltySeconds;
  }

  public crossCheckpoint(
    playerIndex: number,
    checkpointEntityId: string,
    forward: boolean,
  ): RaceCrossingOutcome {
    const player = this.players[playerIndex];
    const groupId = this.groupIdByCheckpointEntityId.get(checkpointEntityId);
    if (player === undefined || groupId === undefined || this.phase !== "racing") {
      return "ignored";
    }
    if (!forward) {
      player.wrongDirectionCount += 1;
      return this.recordOutcome(player, "wrong-direction");
    }
    if (player.completedGroupIds.has(groupId)) {
      return this.recordOutcome(player, "ignored");
    }
    if (!player.availableGroupIds.has(groupId)) {
      player.invalidRouteCount += 1;
      return this.recordOutcome(player, "out-of-route");
    }
    player.completedGroupIds.add(groupId);
    player.availableGroupIds.delete(groupId);
    for (const nextGroupId of this.outgoingGroupIds.get(groupId) ?? []) {
      if (!player.completedGroupIds.has(nextGroupId)) {
        player.availableGroupIds.add(nextGroupId);
      }
    }
    return this.recordOutcome(player, "checkpoint-advanced");
  }

  public crossFinish(
    playerIndex: number,
    finishEntityId: string,
    forward: boolean,
  ): RaceCrossingOutcome {
    const player = this.players[playerIndex];
    if (
      player === undefined ||
      player.finished ||
      this.phase !== "racing" ||
      !this.finishEntityIds.has(finishEntityId)
    ) {
      return "ignored";
    }
    if (!forward) {
      player.wrongDirectionCount += 1;
      return this.recordOutcome(player, "wrong-direction");
    }
    if (
      this.race.finishRule === "required-group" &&
      ![...this.requiredGroupIds].every((groupId) => player.completedGroupIds.has(groupId))
    ) {
      player.invalidRouteCount += 1;
      return this.recordOutcome(player, "out-of-route");
    }
    if (this.race.mode === "circuit" && player.lap < this.race.lapCount) {
      player.lap += 1;
      this.resetLapProgress(player);
      return this.recordOutcome(player, "lap-complete");
    }
    player.finished = true;
    this.finishCount += 1;
    player.finishPlace = this.finishCount;
    if (this.finishCount === this.players.length) {
      this.phase = "results";
    }
    return this.recordOutcome(player, "finished");
  }

  public reset(): void {
    this.finishCount = 0;
    this.phase = this.race.mode === "free-roam" ? "free-roam" : "countdown";
    this.countdownRemainingSeconds = this.race.mode === "free-roam" ? 0 : RACE_COUNTDOWN_SECONDS;
    for (let index = 0; index < this.players.length; index += 1) {
      this.players[index] = this.createPlayerProgress();
    }
  }

  public snapshot(): RaceProgressSnapshot {
    return Object.freeze({
      mode: this.race.mode,
      scored: this.race.mode !== "free-roam",
      phase: this.phase,
      countdownRemainingSeconds: this.countdownRemainingSeconds,
      finishCount: this.finishCount,
      players: Object.freeze(
        this.players.map((player, playerIndex) =>
          Object.freeze({
            playerIndex,
            lap: player.lap,
            lapCount: this.race.lapCount,
            completedGroupIds: Object.freeze([...player.completedGroupIds]),
            availableGroupIds: Object.freeze([...player.availableGroupIds]),
            requiredGroupCount: this.requiredGroupIds.size,
            finished: player.finished,
            finishPlace: player.finishPlace,
            elapsedSeconds: player.elapsedSeconds,
            wrongDirectionCount: player.wrongDirectionCount,
            invalidRouteCount: player.invalidRouteCount,
            lastOutcome: player.lastOutcome,
          }),
        ),
      ),
    });
  }

  private createPlayerProgress(): MutablePlayerRaceProgress {
    return {
      lap: 1,
      completedGroupIds: new Set(),
      availableGroupIds: new Set(this.initialGroupIds),
      finished: false,
      finishPlace: null,
      elapsedSeconds: 0,
      wrongDirectionCount: 0,
      invalidRouteCount: 0,
      lastOutcome: "ignored",
    };
  }

  private resetLapProgress(player: MutablePlayerRaceProgress): void {
    player.completedGroupIds.clear();
    player.availableGroupIds.clear();
    for (const groupId of this.initialGroupIds) {
      player.availableGroupIds.add(groupId);
    }
  }

  private recordOutcome(
    player: MutablePlayerRaceProgress,
    outcome: RaceCrossingOutcome,
  ): RaceCrossingOutcome {
    player.lastOutcome = outcome;
    return outcome;
  }
}
