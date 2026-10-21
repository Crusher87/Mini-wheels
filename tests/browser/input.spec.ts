import { expect, test, type Page } from "@playwright/test";
import { waitForPlaying } from "./helpers/game-state";

interface SyntheticControllerApi {
  disconnect(index: number): void;
  setAxes(index: number, horizontal: number, vertical: number): void;
  setButton(index: number, button: number, pressed: boolean): void;
}

async function installSyntheticControllers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const makeGamepad = (index: number, id: string): Gamepad => {
      const buttons = Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      }));
      return {
        axes: [0, -1, 0, 0],
        buttons,
        connected: true,
        id,
        index,
        mapping: "standard",
        timestamp: 0,
        vibrationActuator: null,
      } as unknown as Gamepad;
    };

    const pads: Array<Gamepad | null> = [
      makeGamepad(0, "Synthetic Controller A"),
      makeGamepad(1, "Synthetic Controller B"),
    ];
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => pads,
    });

    const api: SyntheticControllerApi = {
      disconnect(index) {
        const gamepad = pads[index];
        if (gamepad === null || gamepad === undefined) {
          return;
        }
        pads[index] = null;
        const event = new Event("gamepaddisconnected");
        Object.defineProperty(event, "gamepad", { value: gamepad });
        window.dispatchEvent(event);
      },
      setAxes(index, horizontal, vertical) {
        const axes = pads[index]?.axes as number[] | undefined;
        if (axes !== undefined) {
          axes[0] = horizontal;
          axes[1] = vertical;
        }
      },
      setButton(index, buttonIndex, pressed) {
        const gamepad = pads[index];
        const button = gamepad?.buttons[buttonIndex];
        if (button !== undefined) {
          Object.assign(button, {
            pressed,
            touched: pressed,
            value: pressed ? 1 : 0,
          });
        }
      },
    };
    Object.defineProperty(window, "__SYNTHETIC_CONTROLLERS__", {
      configurable: true,
      value: api,
    });
  });
}

test("A11Y-001/MP-006: rebinding warns on overlap, reserves pause, and persists", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /players/i }).click();
  await page.getByLabel("ACTIVE PLAYERS").fill("2");

  const downBinding = page.locator('[data-binding-direction="down"]');
  await downBinding.click();
  await page.keyboard.press("KeyW");
  await expect(page.locator("#binding-warning")).toContainText(
    "already controls forward for this player",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#binding-down")).toHaveText("S");

  await page.locator("#controls-player").selectOption("1");

  const upBinding = page.locator('[data-binding-direction="up"]');
  await upBinding.click();
  await page.keyboard.press("KeyW");
  await expect(page.locator("#binding-warning")).toContainText("W is shared by P1, P2");

  await upBinding.click();
  await page.keyboard.press("KeyP");
  await expect(page.locator("#binding-warning")).toContainText("reserved for pause");

  await page.keyboard.press("KeyR");
  await expect(page.locator("#binding-up")).toHaveText("R");
  await expect(page.locator("#binding-warning")).toBeHidden();

  const brakeBinding = page.locator('[data-binding-direction="brake"]');
  await brakeBinding.click();
  await page.keyboard.press("KeyB");
  await expect(page.locator("#binding-brake")).toHaveText("B");

  await page.reload();
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /players/i }).click();
  await page.locator("#controls-player").selectOption("1");
  await expect(page.locator("#binding-up")).toHaveText("R");
  await expect(page.locator("#binding-brake")).toHaveText("B");
});

test("MP-005/006/008 and FLOW-004: two keyboards plus two exclusive controllers drive independently", async ({
  page,
}) => {
  await installSyntheticControllers(page);
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /players/i }).click();
  await page.getByLabel("ACTIVE PLAYERS").fill("4");

  await page.locator("#controls-player").selectOption("2");
  await page.locator("#input-type").selectOption("controller");
  await page.locator("#controller-select").selectOption("0");

  await page.locator("#controls-player").selectOption("3");
  await page.locator("#input-type").selectOption("controller");
  const claimedOption = page.locator('#controller-select option[value="0"]');
  await expect(claimedOption).toHaveAttribute("disabled", "");
  await expect(claimedOption).toContainText("(P3)");
  await page.locator("#controller-select").selectOption("1");

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page, 4);

  await page.keyboard.down("w");
  await page.keyboard.down("ArrowUp");
  const drivenHandle = await page.waitForFunction(() => {
    const vehicles = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicles;
    return vehicles?.length === 4 && vehicles.every((vehicle) => vehicle.engineForce >= 1_999)
      ? vehicles
      : false;
  });
  const driven = await drivenHandle.jsonValue();
  await page.keyboard.up("w");
  await page.keyboard.up("ArrowUp");

  if (driven === false) {
    throw new Error("The four-player driven snapshot was not captured.");
  }
  const forces = driven.map((vehicle) => vehicle.engineForce);
  expect(forces).toHaveLength(4);
  expect(forces.every((force) => force >= 1_999)).toBe(true);

  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __SYNTHETIC_CONTROLLERS__: SyntheticControllerApi;
      }
    ).__SYNTHETIC_CONTROLLERS__.disconnect(0);
  });
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await expect(page.locator("#toast")).toContainText("P3 controller disconnected");
});

test("VEH-002/003/VEH-013 and MP-005: standard gamepad drives, steers, and shoulder-drifts", async ({
  page,
}) => {
  await installSyntheticControllers(page);
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /players/i }).click();
  await page.locator("#input-type").selectOption("controller");
  await page.locator("#controller-select").selectOption("0");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 0, y: 1, z: 0 },
    });
  });
  await page.waitForTimeout(900);
  const forward = await page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle);
  expect(forward?.z, JSON.stringify(forward)).toBeGreaterThan(0.25);
  expect(forward?.forwardSpeed, JSON.stringify(forward)).toBeGreaterThan(0);

  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __SYNTHETIC_CONTROLLERS__: SyntheticControllerApi;
      }
    ).__SYNTHETIC_CONTROLLERS__.setAxes(0, 0, 0);
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 0, y: 1, z: 0 },
    });
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __SYNTHETIC_CONTROLLERS__: SyntheticControllerApi;
      }
    ).__SYNTHETIC_CONTROLLERS__.setAxes(0, 1, -1);
  });
  await page.waitForTimeout(1_200);
  const forwardRight = await page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle);
  expect(forwardRight?.z, JSON.stringify(forwardRight)).toBeGreaterThan(0.2);
  // In the right-handed world basis, a car facing visible local +Z has its
  // driver-right direction along local/world -X.
  expect(forwardRight?.x, JSON.stringify(forwardRight)).toBeLessThan(-0.05);

  const particlesBefore = await page.evaluate(
    () => window.__MINI_WHEELS_TEST__?.snapshot()?.particles.emittedCount ?? 0,
  );
  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __SYNTHETIC_CONTROLLERS__: SyntheticControllerApi;
      }
    ).__SYNTHETIC_CONTROLLERS__.setButton(0, 5, true);
  });
  await page.waitForFunction(
    () => window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle.drifting === true,
    undefined,
    { timeout: 2_000 },
  );
  await page.waitForTimeout(400);
  const gamepadDrift = await page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot());
  expect(gamepadDrift?.vehicle.braking).toBe(true);
  expect(gamepadDrift?.vehicle.drifting).toBe(true);
  expect((gamepadDrift?.particles.emittedCount ?? 0) - particlesBefore).toBeGreaterThan(10);
});

test("FLOW-004: standard controller Menu pauses on its rising edge", async ({ page }) => {
  await installSyntheticControllers(page);
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);

  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __SYNTHETIC_CONTROLLERS__: SyntheticControllerApi;
      }
    ).__SYNTHETIC_CONTROLLERS__.setButton(0, 9, true);
  });
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
});

test("MP-009/WEB-003: losing focus clears held drive input before resume", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);

  await page.keyboard.down("w");
  await page.waitForFunction(
    () => Math.abs(window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle.engineForce ?? 0) >= 1_999,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.waitForFunction(
    () => (window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle.engineForce ?? 1) === 0,
  );
  await page.keyboard.up("w");
});
