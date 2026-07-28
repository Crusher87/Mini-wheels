import { expect, test, type Page } from "@playwright/test";
import { waitForPlaying } from "./helpers/game-state";

async function startSandbox(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);
}

test("INT-001/002/003/004/009: floor and ramp boosters add velocity to cars and balls", async ({
  page,
}) => {
  await startSandbox(page);
  await page.evaluate(() =>
    window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
      position: { x: 32.97, y: 0.22, z: -29.68 },
      linearVelocity: { x: 1, y: 0, z: 2 },
    }),
  );
  const carBoostHandle = await page.waitForFunction(() => {
    const snapshot = window.__TINY_TRACTION_TEST__?.snapshot();
    return snapshot?.interactions.boosters.activationCount === 1 ? snapshot : false;
  });
  const carBoost = await carBoostHandle.jsonValue();
  if (carBoost === false) {
    throw new Error("Car booster activation was not captured.");
  }
  expect(carBoost.interactions.boosters.pendingParticleRequestCount).toBe(5);
  expect(carBoost.particles.emittedCount).toBeGreaterThanOrEqual(5);
  expect(carBoost.particles.liveCount).toBeGreaterThanOrEqual(5);
  const carActivation = carBoost.interactions.boosters.lastActivation;
  expect(carActivation?.padId).toBe("floor-1");
  expect(carActivation?.particleCount).toBe(5);
  const carEntryVelocity = carActivation?.bodies[0]?.entryLinearVelocity;
  const carExitVelocity = carActivation?.bodies[0]?.exitLinearVelocity;
  expect((carExitVelocity?.x ?? 0) - (carEntryVelocity?.x ?? 0)).toBeCloseTo(0, 5);
  expect((carExitVelocity?.y ?? 0) - (carEntryVelocity?.y ?? 0)).toBeCloseTo(0, 5);
  expect((carExitVelocity?.z ?? 0) - (carEntryVelocity?.z ?? 0)).toBeCloseTo(-5, 5);
  expect(carBoost.vehicle.linearVelocity.z).toBeLessThan(-2.5);

  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () => window.__TINY_TRACTION_TEST__?.snapshot()?.interactions.boosters.activationCount,
    ),
  ).toBe(1);

  await page.evaluate(() =>
    window.__TINY_TRACTION_TEST__?.setBallState(0, {
      position: { x: -12.49, y: 4.19, z: -8.83 },
      linearVelocity: { x: 2, y: 0, z: 0 },
    }),
  );
  const ballBoostHandle = await page.waitForFunction(() => {
    const snapshot = window.__TINY_TRACTION_TEST__?.snapshot();
    return snapshot?.interactions.boosters.activationCount === 2 ? snapshot : false;
  });
  const ballBoost = await ballBoostHandle.jsonValue();
  if (ballBoost === false) {
    throw new Error("Ball booster activation was not captured.");
  }
  const ballActivation = ballBoost.interactions.boosters.lastActivation;
  expect(ballActivation?.padId).toBe("ramp");
  expect(ballActivation?.particleCount).toBe(5);
  const ballEntryVelocity = ballActivation?.bodies[0]?.entryLinearVelocity;
  const ballExitVelocity = ballActivation?.bodies[0]?.exitLinearVelocity;
  expect((ballExitVelocity?.x ?? 0) - (ballEntryVelocity?.x ?? 0)).toBeCloseTo(-1, 5);
  expect((ballExitVelocity?.y ?? 0) - (ballEntryVelocity?.y ?? 0)).toBeCloseTo(1, 5);
  expect((ballExitVelocity?.z ?? 0) - (ballEntryVelocity?.z ?? 0)).toBeCloseTo(5, 5);
  const ball = ballBoost.arena.balls[0];
  expect(ball).toBeDefined();
  expect(ball?.linearVelocity.x).toBeGreaterThan(0.75);
  expect(ball?.linearVelocity.y).toBeGreaterThan(0.5);
  expect(ball?.linearVelocity.z).toBeGreaterThan(2);
  expect(ballBoost.interactions.boosters.pendingParticleRequestCount).toBe(10);
  expect(ballBoost.particles.emittedCount).toBeGreaterThanOrEqual(
    carBoost.particles.emittedCount + 5,
  );
  expect(ballBoost.particles.liveCount).toBeGreaterThanOrEqual(5);
});

test("INT-005/006/007/008/009: paired portals redirect cars and balls without loops", async ({
  page,
}) => {
  await startSandbox(page);
  await page.evaluate(() =>
    window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
      position: { x: 32.8, y: 2, z: -33.6 },
      linearVelocity: { x: 5, y: 0, z: 0 },
      angularVelocity: { x: 1, y: 2, z: 3 },
    }),
  );
  const carPortalHandle = await page.waitForFunction(() => {
    const snapshot = window.__TINY_TRACTION_TEST__?.snapshot();
    return snapshot?.interactions.portals.teleportCount === 1 ? snapshot : false;
  });
  const carPortal = await carPortalHandle.jsonValue();
  if (carPortal === false) {
    throw new Error("Car portal transfer was not captured.");
  }
  const carTeleport = carPortal.interactions.portals.lastTeleport;
  expect(carTeleport).toMatchObject({
    sourceEndpointId: "pair-1-a",
    destinationEndpointId: "pair-1-b",
  });
  expectVectorClose(carTeleport?.preservedAngularVelocity, { x: 1, y: 2, z: 3 }, 1);
  expect(carTeleport?.exitLinearVelocity.x).toBeCloseTo(0, 5);
  expect(carTeleport?.exitLinearVelocity.z).toBeCloseTo(0, 5);
  expect(carTeleport?.exitLinearVelocity.y).toBeGreaterThan(0);
  expect(vectorLength(carTeleport?.exitLinearVelocity)).toBeCloseTo(
    vectorLength(carTeleport?.entryLinearVelocity) * 0.8,
    5,
  );
  expect(carPortal.vehicle.x).toBeCloseTo(22.8, 1);
  expect(carPortal.vehicle.y).toBeGreaterThanOrEqual(5);
  expect(carPortal.vehicle.y).toBeLessThan(6.2);
  expect(carPortal.vehicle.z).toBeCloseTo(-33.6, 1);
  expect(carPortal.vehicle.speed).toBeGreaterThan(2);
  expect(carPortal.vehicle.linearVelocity.y).toBeGreaterThan(2);
  expectVectorClose(carPortal.vehicle.angularVelocity, { x: 1, y: 2, z: 3 }, 1);
  expect(carPortal.particles.emittedCount).toBeGreaterThanOrEqual(8);
  expect(carPortal.particles.liveCount).toBeGreaterThan(0);

  await page.evaluate(() =>
    window.__TINY_TRACTION_TEST__?.setBallState(1, {
      position: { x: 19.4, y: 2, z: 31.1 },
      linearVelocity: { x: 0, y: 0, z: 5 },
      angularVelocity: { x: -1, y: 0.5, z: 2 },
    }),
  );
  const ballPortalHandle = await page.waitForFunction(() => {
    const snapshot = window.__TINY_TRACTION_TEST__?.snapshot();
    return snapshot?.interactions.portals.teleportCount === 2 ? snapshot : false;
  });
  const ballPortal = await ballPortalHandle.jsonValue();
  if (ballPortal === false) {
    throw new Error("Ball portal transfer was not captured.");
  }
  const ballTeleport = ballPortal.interactions.portals.lastTeleport;
  expect(ballTeleport).toMatchObject({
    sourceEndpointId: "pair-2-a",
    destinationEndpointId: "pair-2-b",
  });
  expectVectorClose(ballTeleport?.preservedAngularVelocity, { x: -1, y: 0.5, z: 2 }, 1);
  expect(ballTeleport?.exitLinearVelocity.x).toBeCloseTo(0, 5);
  expect(ballTeleport?.exitLinearVelocity.y).toBeCloseTo(0, 5);
  expect(ballTeleport?.exitLinearVelocity.z).toBeGreaterThan(0);
  expect(vectorLength(ballTeleport?.exitLinearVelocity)).toBeCloseTo(
    vectorLength(ballTeleport?.entryLinearVelocity) * 0.8,
    5,
  );
  const ball = ballPortal.arena.balls[1];
  expect(ball?.currentPosition.x).toBeCloseTo(24.4, 1);
  expect(ball?.currentPosition.y).toBeGreaterThan(4.7);
  expect(ball?.currentPosition.y).toBeLessThan(5.1);
  expect(ball?.currentPosition.z).toBeGreaterThan(21.1);
  expect(ball?.currentPosition.z).toBeLessThan(21.9);
  expect(vectorLength(ball?.linearVelocity)).toBeGreaterThan(2);
  expect(ball?.linearVelocity.z).toBeGreaterThan(2);
  expectVectorClose(ball?.angularVelocity, { x: -1, y: 0.5, z: 2 }, 1);
  expect(ballPortal.particles.emittedCount).toBeGreaterThanOrEqual(
    carPortal.particles.emittedCount + 8,
  );

  // Both bodies remain guarded throughout the configured 0.20-second
  // immediate re-entry window; a later intentional fall back through a portal
  // is valid gameplay and is not an infinite-loop condition.
  await page.waitForTimeout(120);
  const settledTeleportCount = await page.evaluate(
    () => window.__TINY_TRACTION_TEST__?.snapshot()?.interactions.portals.teleportCount,
  );
  expect(settledTeleportCount).toBeGreaterThanOrEqual(2);
  expect(settledTeleportCount).toBeLessThanOrEqual(3);
});

function vectorLength(
  vector:
    | {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      }
    | null
    | undefined,
): number {
  return Math.hypot(vector?.x ?? 0, vector?.y ?? 0, vector?.z ?? 0);
}

function expectVectorClose(
  received:
    | {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      }
    | null
    | undefined,
  expected: { readonly x: number; readonly y: number; readonly z: number },
  precision: number,
): void {
  expect(received?.x).toBeCloseTo(expected.x, precision);
  expect(received?.y).toBeCloseTo(expected.y, precision);
  expect(received?.z).toBeCloseTo(expected.z, precision);
}
