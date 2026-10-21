import { expect, test, type Page } from "@playwright/test";
import { waitForPlaying } from "./helpers/game-state";

async function startSandbox(page: Page, playerCount = 1): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  if (playerCount !== 1) {
    await page.getByRole("button", { name: /players/i }).click();
    await page.getByLabel("ACTIVE PLAYERS").fill(String(playerCount));
    await page.getByRole("button", { name: "Back" }).click();
  }
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page, playerCount);
}

test("FLOW-006/008 and PERF-004: repeated full rebuilds retain one clean bounded session", async ({
  browserName,
  page,
}) => {
  const resetCount = browserName === "chromium" ? 25 : 3;
  test.setTimeout(browserName === "chromium" ? 120_000 : 90_000);
  await startSandbox(page);

  const initial = await page.evaluate(() => ({
    app: window.__MINI_WHEELS_TEST__?.appSnapshot(),
    world: window.__MINI_WHEELS_TEST__?.snapshot(),
    audio: window.__MINI_WHEELS_TEST__?.audioSnapshot(),
  }));
  const audioAvailable = initial.audio?.availability === "available";
  const initialGeneration = initial.app?.sessionGeneration ?? 0;
  const expectedBodies = initial.world?.rigidBodyCount;
  const expectedColliders = initial.world?.colliderCount;
  const expectedRootChildren = initial.world?.sessionRootChildCount;
  let firstResetResources:
    | {
        geometries: number;
        textures: number;
        programs: number;
      }
    | undefined;

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setCubeState(0, {
      position: { x: 20, y: 6, z: 10 },
      linearVelocity: { x: 4, y: 3, z: 2 },
      angularVelocity: { x: 1, y: 2, z: 3 },
    });
    window.__MINI_WHEELS_TEST__?.setBallState(0, {
      position: { x: -20, y: 8, z: 12 },
      linearVelocity: { x: -2, y: 1, z: 5 },
    });
  });

  for (let resetIndex = 1; resetIndex <= resetCount; resetIndex += 1) {
    await page.evaluate(() => window.__MINI_WHEELS_TEST__?.resetSandbox());
    await page.waitForFunction(
      (generation) =>
        window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing" &&
        window.__MINI_WHEELS_TEST__?.appSnapshot().sessionGeneration === generation,
      initialGeneration + resetIndex,
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    if (audioAvailable) {
      await page.waitForFunction(
        () => (window.__MINI_WHEELS_TEST__?.audioSnapshot().activeEngineVoiceCount ?? 0) === 1,
      );
    }
    const state = await page.evaluate(() => ({
      app: window.__MINI_WHEELS_TEST__?.appSnapshot(),
      world: window.__MINI_WHEELS_TEST__?.snapshot(),
      render: window.__MINI_WHEELS_TEST__?.renderSnapshot(),
      audio: window.__MINI_WHEELS_TEST__?.audioSnapshot(),
    }));

    expect(state.app).toMatchObject({
      state: "playing",
      activeWorldSessionRootCount: 1,
      markerElementCount: 1,
    });
    expect(state.world).toMatchObject({
      rigidBodyCount: expectedBodies,
      colliderCount: expectedColliders,
      sessionRootChildCount: expectedRootChildren,
      markerCount: 1,
      particles: {
        capacity: 512,
        overwrittenCount: 0,
        drawBatchCount: 1,
      },
      camera: { targetCount: 1 },
      interactions: {
        boosters: { activationCount: 0, pendingParticleRequestCount: 0 },
        portals: { teleportCount: 0, lockedBodyCount: 0 },
      },
    });
    expect(state.world?.particles.liveCount).toBeLessThanOrEqual(2);
    expect(state.world?.particles.emittedCount).toBeLessThanOrEqual(2);
    expect(state.world?.arena.cubes[0]).toMatchObject({
      authoredPosition: { x: 7.81, y: 0.5, z: -34.83 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
    expect(state.world?.arena.cubes[0]?.currentPosition.x).toBeCloseTo(7.81, 5);
    expect(state.world?.arena.cubes[0]?.currentPosition.y).toBeCloseTo(0.5, 5);
    expect(state.world?.arena.cubes[0]?.currentPosition.z).toBeCloseTo(-34.83, 5);
    expect(state.world?.arena.balls[0]).toMatchObject({
      authoredPosition: { x: 29.6, y: 0.5, z: 5 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
    expect(state.world?.arena.balls[0]?.currentPosition.x).toBeCloseTo(29.6, 5);
    expect(state.world?.arena.balls[0]?.currentPosition.y).toBeCloseTo(0.5, 5);
    expect(state.world?.arena.balls[0]?.currentPosition.z).toBeCloseTo(5, 5);
    expect(state.audio?.activeEngineVoiceCount).toBe(audioAvailable ? 1 : 0);
    expect(state.audio?.liveOscillatorNodeCount).toBeLessThanOrEqual(17);
    expect(state.audio?.liveManagedNodeCount).toBeLessThanOrEqual(17);

    const resources = state.render?.resources;
    if (resources !== undefined) {
      firstResetResources ??= {
        geometries: resources.geometries,
        textures: resources.textures,
        programs: resources.programs,
      };
      expect(resources.geometries).toBeLessThanOrEqual(firstResetResources.geometries + 1);
      expect(resources.textures).toBeLessThanOrEqual(firstResetResources.textures + 1);
      expect(resources.programs).toBeLessThanOrEqual(firstResetResources.programs + 1);
    }
  }
});

test("PERF-001/003/007: ten cars wake the instanced cube wall without invalid physics", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await startSandbox(page, 10);
  await page.evaluate(() => window.__MINI_WHEELS_TEST__?.resetPerformance());

  await page.evaluate(() => {
    for (let index = 0; index < 10; index += 1) {
      window.__MINI_WHEELS_TEST__?.setVehicleState(index, {
        position: {
          x: -2 - index * 0.42,
          y: 0.65,
          z: -35.15 + (index % 5) * 0.9,
        },
        linearVelocity: { x: 18, y: 0, z: 0 },
      });
    }
  });
  await page.waitForTimeout(2_500);

  const result = await page.evaluate(() => ({
    world: window.__MINI_WHEELS_TEST__?.snapshot(),
    performance: window.__MINI_WHEELS_TEST__?.performanceSnapshot(),
    render: window.__MINI_WHEELS_TEST__?.renderSnapshot(),
  }));
  expect(result.world?.arena.cubeVisualBatchCount).toBe(1);
  expect(
    result.world?.arena.cubes.some(({ authoredPosition, currentPosition }) => {
      return (
        Math.hypot(
          currentPosition.x - authoredPosition.x,
          currentPosition.y - authoredPosition.y,
          currentPosition.z - authoredPosition.z,
        ) > 0.2
      );
    }),
  ).toBe(true);
  expect(result.performance?.frames.sampleCount).toBeGreaterThan(10);
  expect(result.performance?.physicsSubstepCount).toBeGreaterThan(0);
  expect(result.performance?.frames.p95Milliseconds).toBeGreaterThan(0);
  expect(result.render?.resources.drawCalls).toBeGreaterThan(0);

  const finiteValues = [
    ...(result.world?.vehicles.flatMap((vehicle) => [
      vehicle.x,
      vehicle.y,
      vehicle.z,
      vehicle.linearVelocity.x,
      vehicle.linearVelocity.y,
      vehicle.linearVelocity.z,
      vehicle.angularVelocity.x,
      vehicle.angularVelocity.y,
      vehicle.angularVelocity.z,
    ]) ?? []),
    ...(result.world?.arena.cubes.flatMap((cube) => [
      cube.currentPosition.x,
      cube.currentPosition.y,
      cube.currentPosition.z,
      cube.linearVelocity.x,
      cube.linearVelocity.y,
      cube.linearVelocity.z,
      cube.angularVelocity.x,
      cube.angularVelocity.y,
      cube.angularVelocity.z,
    ]) ?? []),
  ];
  expect(finiteValues.every(Number.isFinite)).toBe(true);
});
