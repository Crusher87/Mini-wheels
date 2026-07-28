import { expect, test, type Page } from "@playwright/test";
import { waitForPlaying } from "./helpers/game-state";

async function startSandbox(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);
}

test("FLOW-007/WEB-003: hidden-page return stays paused without a catch-up burst", async ({
  page,
}) => {
  await startSandbox(page);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyW");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.evaluate(() => window.__TINY_TRACTION_TEST__?.resetPerformance());
  const paused = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle);
  await page.waitForTimeout(500);
  const stillPaused = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle);
  expect(stillPaused?.x).toBeCloseTo(paused?.x ?? 0, 6);
  expect(stillPaused?.y).toBeCloseTo(paused?.y ?? 0, 6);
  expect(stillPaused?.z).toBeCloseTo(paused?.z ?? 0, 6);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: "Resume" }).click();
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => window.__TINY_TRACTION_TEST__?.performanceSnapshot().overloadCount),
  ).toBe(0);
});

test("UI-004/WEB-004: fullscreen denial is recoverable and fullscreen exit pauses", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  const fullscreenSupported = await page.evaluate(() => {
    const root = document.getElementById("game-root");
    const supported =
      root !== null &&
      typeof root.requestFullscreen === "function" &&
      "fullscreenElement" in document;
    if (root !== null) {
      Object.defineProperty(root, "requestFullscreen", {
        configurable: true,
        value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
      });
    }
    return supported;
  });
  await page.getByRole("button", { name: /enter fullscreen/i }).click();
  await expect(page.locator("#toast")).toContainText(/denied.*available/i);
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();

  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);
  if (!fullscreenSupported) {
    expect(await page.evaluate(() => window.__TINY_TRACTION_TEST__?.appSnapshot().state)).toBe(
      "playing",
    );
    return;
  }
  await page.evaluate(() => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
});

test("WEB-006: a WebGL context-loss event stops simulation and offers recovery", async ({
  page,
}) => {
  await startSandbox(page);
  const prevented = await page.evaluate(() => {
    const canvas = document.getElementById("game-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return false;
    }
    const event = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.getByRole("heading", { name: /lab stopped/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /reload/i })).toBeVisible();
  expect(await page.evaluate(() => window.__TINY_TRACTION_TEST__?.appSnapshot().state)).toBe(
    "error",
  );
});

test("WEB-007/008: missing gamepads and failing storage do not block keyboard play", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: undefined,
    });
    const fail = (): never => {
      throw new DOMException("Storage denied", "SecurityError");
    };
    Storage.prototype.getItem = fail;
    Storage.prototype.setItem = fail;
  });
  await startSandbox(page);
  await page.keyboard.down("KeyW");
  const drivenForce = await page.waitForFunction(() => {
    const force = window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle.engineForce ?? 0;
    return Math.abs(force) >= 1_999 ? force : false;
  });
  await page.keyboard.up("KeyW");
  expect(Math.abs(Number(await drivenForce.jsonValue()))).toBeGreaterThanOrEqual(1_999);
});
