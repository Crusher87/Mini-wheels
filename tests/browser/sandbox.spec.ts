import { expect, test, type Page } from "@playwright/test";
import { waitForPlaying } from "./helpers/game-state";

async function startSandbox(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);
}

test("MAP-001/002/004/005/006: the authored arena and movers build with exact counts", async ({
  page,
}) => {
  await startSandbox(page);
  const snapshot = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());

  expect(snapshot?.rigidBodyCount).toBe(110);
  expect(snapshot?.arena).toMatchObject({
    dynamicBodyCount: 99,
    cubeCount: 96,
    ballCount: 3,
    staticBodyCount: 6,
  });
  expect(snapshot?.arena.cubes[0]?.authoredPosition).toEqual({
    x: 7.81,
    y: 0.5,
    z: -34.83,
  });
  expect(snapshot?.arena.cubes[95]?.authoredPosition).toEqual({
    x: 12.81,
    y: 3.5,
    z: -31.83,
  });
  expect(snapshot?.arena.balls.map(({ authoredPosition }) => authoredPosition)).toEqual([
    { x: 29.6, y: 0.5, z: 5 },
    { x: -9.6, y: 0.5, z: 31.6 },
    { x: -27.5, y: 0.5, z: -1.1 },
  ]);
  expect(snapshot?.movers.rotatingBars).toHaveLength(2);
  expect(snapshot?.movers.movingPlatforms).toHaveLength(2);
  expect(snapshot?.movers.barSpeedProfile).toBe("legacy");
});

test("MAP-007: a stationary car rides both position-based platforms", async ({ page }) => {
  await startSandbox(page);
  const before = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  const lift = before?.movers.movingPlatforms.find(({ id }) => id === "vertical-lift");
  expect(lift).toBeDefined();

  await page.evaluate(
    ({ x, y, z }) =>
      window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
        position: { x, y: y + 0.65, z },
      }),
    lift?.position ?? { x: -32, y: -0.05, z: -28 },
  );
  await page.waitForTimeout(1_200);
  const after = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  const movedLift = after?.movers.movingPlatforms.find(({ id }) => id === "vertical-lift");

  expect((movedLift?.position.y ?? 0) - (lift?.position.y ?? 0)).toBeGreaterThan(0.8);
  expect(after?.vehicle.y).toBeGreaterThan((lift?.position.y ?? 0) + 0.8);
  expect(Math.abs((after?.vehicle.x ?? 0) - (lift?.position.x ?? 0))).toBeLessThan(0.75);
  expect(Math.abs((after?.vehicle.z ?? 0) - (lift?.position.z ?? 0))).toBeLessThan(0.75);

  const shuttle = after?.movers.movingPlatforms.find(({ id }) => id === "horizontal-shuttle");
  expect(shuttle).toBeDefined();
  await page.evaluate(
    ({ x, y, z }) =>
      window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
        position: { x, y: y + 0.65, z },
      }),
    shuttle?.position ?? { x: -28, y: 7.9, z: -32 },
  );
  await page.waitForTimeout(1_200);
  const afterShuttle = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  const movedShuttle = afterShuttle?.movers.movingPlatforms.find(
    ({ id }) => id === "horizontal-shuttle",
  );
  expect((movedShuttle?.position.x ?? 0) - (shuttle?.position.x ?? 0)).toBeGreaterThan(0.8);
  expect(afterShuttle?.vehicle.x).toBeGreaterThan((shuttle?.position.x ?? 0) + 0.6);
  expect(Math.abs((afterShuttle?.vehicle.z ?? 0) - (shuttle?.position.z ?? 0))).toBeLessThan(0.75);
});

test("MAP-008: a legacy-speed rotating bar transfers momentum to a stationary car", async ({
  page,
}) => {
  await startSandbox(page);
  await page.evaluate(() =>
    window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
      position: { x: -27, y: 0.7, z: 10 },
    }),
  );

  const collisionHandle = await page.waitForFunction(
    () => {
      const vehicle = window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle;
      return vehicle !== undefined && vehicle.speed > 1 ? vehicle : false;
    },
    undefined,
    { timeout: 3_000 },
  );
  const collision = await collisionHandle.jsonValue();
  if (collision === false) {
    throw new Error("Rotating-bar collision telemetry was not captured.");
  }
  expect(collision.speed).toBeGreaterThan(1);
});
