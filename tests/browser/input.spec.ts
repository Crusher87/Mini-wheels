import { expect, test, type Page } from "@playwright/test";
import { waitForPlaying } from "./helpers/game-state";

interface SyntheticControllerApi {
  disconnect(index: number): void;
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
    "already controls up for this player",
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

  await page.reload();
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /players/i }).click();
  await page.locator("#controls-player").selectOption("1");
  await expect(page.locator("#binding-up")).toHaveText("R");
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
    const vehicles = window.__TINY_TRACTION_TEST__?.snapshot()?.vehicles;
    return vehicles?.length === 4 &&
      vehicles.every((vehicle) => Math.abs(vehicle.engineForce) >= 1_999)
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
  expect(forces.every((force) => Math.abs(force) >= 1_999)).toBe(true);

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
    () => Math.abs(window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle.engineForce ?? 0) >= 1_999,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.waitForFunction(
    () => (window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle.engineForce ?? 1) === 0,
  );
  await page.keyboard.up("w");
});
