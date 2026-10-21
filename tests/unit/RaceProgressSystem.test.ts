import { describe, expect, it } from "vitest";
import { RaceProgressSystem } from "../../src/gameplay/race/RaceProgressSystem";
import type { RaceDefinition } from "../../src/maps/MapDocument";

function raceDefinition(overrides: Partial<RaceDefinition> = {}): RaceDefinition {
  return {
    mode: "point-to-point",
    activeStartGridId: "start",
    lapCount: 1,
    checkpointGroups: [
      { id: "g1", checkpointEntityIds: ["cp1", "cp1-alt"], required: true },
      { id: "g2", checkpointEntityIds: ["cp2"], required: false },
      { id: "g3", checkpointEntityIds: ["cp3"], required: true },
    ],
    routeEdges: [
      { id: "e1", fromGroupId: "g1", toGroupId: "g2", shortcut: false },
      { id: "e2", fromGroupId: "g2", toGroupId: "g3", shortcut: false },
      { id: "e3", fromGroupId: "g1", toGroupId: "g3", shortcut: true },
    ],
    finishEntityIds: ["finish"],
    finishRule: "required-group",
    recovery: { delaySeconds: 0.75, penaltySeconds: 0 },
    ...overrides,
  };
}

function startRace(progress: RaceProgressSystem): void {
  progress.fixedStep(3);
  expect(progress.snapshot().phase).toBe("racing");
}

describe("RaceProgressSystem", () => {
  it("advances only legal forward groups and permits authored optional shortcuts", () => {
    const progress = new RaceProgressSystem(raceDefinition(), 1);
    startRace(progress);

    expect(progress.crossCheckpoint(0, "cp3", true)).toBe("out-of-route");
    expect(progress.crossCheckpoint(0, "cp1", false)).toBe("wrong-direction");
    expect(progress.crossCheckpoint(0, "cp1-alt", true)).toBe("checkpoint-advanced");
    expect(progress.crossCheckpoint(0, "cp3", true)).toBe("checkpoint-advanced");
    expect(progress.crossFinish(0, "finish", true)).toBe("finished");

    expect(progress.snapshot().players[0]).toMatchObject({
      completedGroupIds: ["g1", "g3"],
      requiredGroupCount: 2,
      finished: true,
      finishPlace: 1,
      wrongDirectionCount: 1,
      invalidRouteCount: 1,
    });
  });

  it("resets checkpoint progress at a circuit lap boundary", () => {
    const progress = new RaceProgressSystem(
      raceDefinition({
        mode: "circuit",
        lapCount: 2,
        checkpointGroups: [{ id: "g1", checkpointEntityIds: ["cp1"], required: true }],
        routeEdges: [],
      }),
      1,
    );
    startRace(progress);

    expect(progress.crossCheckpoint(0, "cp1", true)).toBe("checkpoint-advanced");
    expect(progress.crossFinish(0, "finish", true)).toBe("lap-complete");
    expect(progress.snapshot().players[0]).toMatchObject({
      lap: 2,
      completedGroupIds: [],
      availableGroupIds: ["g1"],
      finished: false,
    });
    expect(progress.crossFinish(0, "finish", true)).toBe("out-of-route");
    expect(progress.crossCheckpoint(0, "cp1", true)).toBe("checkpoint-advanced");
    expect(progress.crossFinish(0, "finish", true)).toBe("finished");
  });

  it("tracks elapsed time and finish order independently per player", () => {
    const progress = new RaceProgressSystem(
      raceDefinition({ checkpointGroups: [], routeEdges: [] }),
      2,
    );
    startRace(progress);
    progress.fixedStep(1.25);
    progress.applyRecoveryPenalty(0, 3);
    expect(progress.crossFinish(1, "finish", true)).toBe("finished");
    progress.fixedStep(0.75);
    expect(progress.crossFinish(0, "finish", true)).toBe("finished");

    expect(progress.snapshot().players).toMatchObject([
      { finishPlace: 2, elapsedSeconds: 5 },
      { finishPlace: 1, elapsedSeconds: 1.25 },
    ]);
  });

  it("gates progression during the countdown and enters results after every player finishes", () => {
    const progress = new RaceProgressSystem(
      raceDefinition({ checkpointGroups: [], routeEdges: [] }),
      2,
    );

    expect(progress.snapshot()).toMatchObject({
      phase: "countdown",
      countdownRemainingSeconds: 3,
    });
    expect(progress.crossFinish(0, "finish", true)).toBe("ignored");
    progress.fixedStep(2);
    expect(progress.snapshot()).toMatchObject({
      phase: "countdown",
      countdownRemainingSeconds: 1,
    });
    progress.fixedStep(1);
    expect(progress.snapshot().phase).toBe("racing");
    expect(progress.crossFinish(0, "finish", true)).toBe("finished");
    expect(progress.snapshot().phase).toBe("racing");
    expect(progress.crossFinish(1, "finish", true)).toBe("finished");
    expect(progress.snapshot().phase).toBe("results");
  });
});
