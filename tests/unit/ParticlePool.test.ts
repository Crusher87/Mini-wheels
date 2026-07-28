import { Group } from "three";
import { describe, expect, it } from "vitest";
import { ParticlePool } from "../../src/render/ParticlePool";

describe("ParticlePool", () => {
  it("keeps exhaust and exact booster bursts in one fixed-capacity draw batch", () => {
    const sceneRoot = new Group();
    const pool = new ParticlePool(sceneRoot, 8);

    pool.emitExhaust({ x: 0, y: 1, z: 2 }, { x: 1, y: 0, z: 0 }, 0xff0000);
    pool.emitBoosterBurst({ x: 3, y: 4, z: 5 }, 5);
    pool.emitPortalBurst({ x: 6, y: 7, z: 8 }, 2);
    pool.render(0.5);

    expect(pool.debugSnapshot()).toMatchObject({
      capacity: 8,
      liveCount: 8,
      emittedCount: 8,
      overwrittenCount: 0,
      drawBatchCount: 1,
      disposed: false,
    });

    pool.fixedStep(0.5);
    expect(pool.debugSnapshot().liveCount).toBe(1);
    pool.fixedStep(0.4);
    expect(pool.debugSnapshot().liveCount).toBe(0);

    pool.dispose();
    expect(sceneRoot.children).toHaveLength(0);
    expect(pool.debugSnapshot().disposed).toBe(true);
  });

  it("overwrites the oldest live slot instead of growing", () => {
    const sceneRoot = new Group();
    const pool = new ParticlePool(sceneRoot, 2);

    pool.emitBoosterBurst({ x: 0, y: 0, z: 0 }, 5);

    expect(pool.debugSnapshot()).toMatchObject({
      capacity: 2,
      liveCount: 2,
      emittedCount: 5,
      overwrittenCount: 3,
    });
    pool.dispose();
  });
});
