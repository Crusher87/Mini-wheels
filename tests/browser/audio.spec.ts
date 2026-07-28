import { expect, test } from "@playwright/test";
import { waitForPlaying } from "./helpers/game-state";

test("WEB-002: audio stays uncreated before activation and uses bounded voices afterward", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__TINY_TRACTION_TEST__?.audioSnapshot() !== undefined);

  expect(await page.evaluate(() => window.__TINY_TRACTION_TEST__?.audioSnapshot())).toMatchObject({
    contextState: "not-created",
    unlocked: false,
    busNodeCount: 0,
    activeCueVoiceCount: 0,
    activeEngineVoiceCount: 0,
  });

  await page.getByRole("button", { name: /start engine/i }).click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  const activated = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.audioSnapshot());
  const audioAvailable = activated?.availability === "available";
  if (audioAvailable) {
    expect(activated).toMatchObject({
      unlocked: true,
      contextState: "running",
      busNodeCount: 4,
    });
  } else {
    // Headless engines without an audio output device must fail softly.
    expect(activated).toMatchObject({
      availability: "unavailable",
      unlocked: false,
      contextState: "not-created",
      busNodeCount: 0,
    });
  }

  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page);
  await page.keyboard.down("w");
  const drivenForce = await page.waitForFunction(() => {
    const force = window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle.engineForce ?? 0;
    return Math.abs(force) >= 1_999 ? force : false;
  });
  if (audioAvailable) {
    await page.waitForFunction(
      () => (window.__TINY_TRACTION_TEST__?.audioSnapshot().activeEngineVoiceCount ?? 0) > 0,
    );
  }
  await page.keyboard.up("w");
  expect(Math.abs(Number(await drivenForce.jsonValue()))).toBeGreaterThanOrEqual(1_999);

  await page.keyboard.press("p");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  const paused = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.audioSnapshot());
  expect(paused).toMatchObject({
    contextState: audioAvailable ? "running" : "not-created",
    gameplayPaused: true,
    maxEngineVoices: 10,
    maxCueVoices: 16,
  });

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator("#screen-pause")).toBeHidden();
  expect(await page.evaluate(() => window.__TINY_TRACTION_TEST__?.audioSnapshot())).toMatchObject({
    contextState: audioAvailable ? "running" : "not-created",
    gameplayPaused: false,
  });
});
