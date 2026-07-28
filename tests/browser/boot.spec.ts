import { expect, test } from "@playwright/test";
import { waitForPlaying } from "./helpers/game-state";

test("FLOW-001/002: boots, activates, and reaches the main menu", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /start engine/i })).toBeVisible();
  await page.getByRole("button", { name: /start engine/i }).click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("FLOW-003/004/005: creates a live sandbox and pauses without replacing it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();

  await expect(page.locator("#screen-loading")).toBeHidden();
  await page.keyboard.press("p");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator("#screen-pause")).toBeHidden();
});

test("VEH-002/003/004: one car accelerates, steers, and applies hard braking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);

  const initial = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  expect(initial).not.toBeNull();

  await page.keyboard.down("w");
  await page.waitForTimeout(1_000);
  const accelerated = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  expect(accelerated?.vehicle.speed, JSON.stringify(accelerated)).toBeGreaterThan(1);

  await page.keyboard.down("d");
  await page.waitForTimeout(100);
  const steering = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  expect(steering?.vehicle.steering).toBeCloseTo(0.610865238, 5);
  await page.keyboard.up("d");
  await page.keyboard.up("w");

  await page.keyboard.down("s");
  const brakingHandle = await page.waitForFunction(
    () => {
      const snapshot = window.__TINY_TRACTION_TEST__?.snapshot();
      return snapshot?.vehicle.hardBraking === true ? snapshot : false;
    },
    undefined,
    { polling: 10, timeout: 1_000 },
  );
  const braking = await brakingHandle.jsonValue();
  if (braking === false) {
    throw new Error("Hard-braking snapshot was not captured.");
  }
  expect(braking?.vehicle.hardBraking).toBe(true);
  expect(Math.abs(braking?.vehicle.engineForce ?? 0)).toBe(20_000);
  await page.keyboard.up("s");
});

test("VEH-008: falling below the arena recovers at spawn with cleared motion", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);

  await page.evaluate(() => window.__TINY_TRACTION_TEST__?.dropVehicle());
  await page.waitForFunction(() => {
    const vehicle = window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle;
    return vehicle !== undefined && vehicle.recoveryCount > 0;
  });

  const recovered = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  const onePlayerSpawnAngle = Math.PI / 180;
  expect(recovered?.vehicle.x).toBeCloseTo(Math.sin(onePlayerSpawnAngle) * 0.5, 5);
  expect(recovered?.vehicle.z).toBeCloseTo(Math.cos(onePlayerSpawnAngle) * 0.5, 5);
  expect(recovered?.vehicle.speedImmediatelyAfterRecovery).toBe(0);
});

test("VEH-006: an authored ramp launches the car with momentum", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);
  const approachYaw = (157.6 * Math.PI) / 180;
  await page.evaluate(
    ({ halfYaw }) =>
      window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
        position: { x: -9.33, y: 0.9, z: -16.95 },
        rotation: {
          x: 0,
          y: Math.sin(halfYaw),
          z: 0,
          w: Math.cos(halfYaw),
        },
        linearVelocity: { x: -3.05, y: 0, z: 7.39 },
      }),
    { halfYaw: approachYaw / 2 },
  );

  await page.keyboard.down("KeyW");
  const airborneHandle = await page.waitForFunction(
    () => {
      const snapshot = window.__TINY_TRACTION_TEST__?.snapshot();
      return snapshot !== null && snapshot !== undefined && snapshot.vehicle.y > 2
        ? snapshot
        : false;
    },
    undefined,
    { timeout: 4_000 },
  );
  const airborne = await airborneHandle.jsonValue();
  await page.keyboard.up("KeyW");
  if (airborne === false) {
    throw new Error("Airborne vehicle snapshot was not captured.");
  }
  expect(airborne.vehicle.speed).toBeGreaterThan(1);
});

test("MP-001/002/003/004 and CAM-001/002/003: ten stable cars spawn inward and share one camera", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /players/i }).click();
  await page.getByLabel("ACTIVE PLAYERS").fill("10");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page, 10);

  const snapshot = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  expect(snapshot?.vehicles).toHaveLength(10);
  expect(snapshot?.camera.targetCount).toBe(10);
  expect(snapshot?.camera.halfHeight).toBeCloseTo(13, 1);
  expect(snapshot?.vehicles.map((vehicle) => vehicle.playerNumber)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(snapshot?.vehicles.map((vehicle) => vehicle.color)).toEqual([
    "#FF0000",
    "#FF7B00",
    "#FFFF00",
    "#7C00FF",
    "#00FF00",
    "#00FFFF",
    "#0000FF",
    "#FF00FF",
    "#E1E1E1",
    "#000000",
  ]);
  await expect(page.locator(".player-marker")).toHaveCount(10);

  await page.evaluate(() => window.__TINY_TRACTION_TEST__?.moveVehicle(0, { x: 30, y: 1, z: 30 }));
  await page.waitForFunction(() => {
    const camera = window.__TINY_TRACTION_TEST__?.snapshot()?.camera;
    return (
      (camera?.halfHeight ?? 0) > 15 && (camera?.center.x ?? 0) > 1 && (camera?.center.z ?? 0) > 1
    );
  });
  const spread = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
  expect(spread?.camera.center.x).toBeGreaterThan(1);
  expect(spread?.camera.center.z).toBeGreaterThan(1);
});

test("MP-004: distinct keyboard profiles move only their assigned cars", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /players/i }).click();
  await page.getByLabel("ACTIVE PLAYERS").fill("4");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page, 4);
  await page.waitForTimeout(700);

  const before = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot()?.vehicles);
  await page.keyboard.down("w");
  await page.waitForTimeout(600);
  await page.keyboard.up("w");
  const after = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot()?.vehicles);

  expect(before).toBeDefined();
  expect(after).toBeDefined();
  const displacements = after?.map((vehicle, index) => {
    const start = before?.[index];
    return start === undefined ? 0 : Math.hypot(vehicle.x - start.x, vehicle.z - start.z);
  });
  expect(displacements?.[0]).toBeGreaterThan(0.2);
  expect(displacements?.slice(1).every((distance) => distance < 0.08)).toBe(true);
});
