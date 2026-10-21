import type { Page } from "@playwright/test";

export async function waitForPlaying(page: Page, playerCount?: number): Promise<void> {
  await page.waitForFunction((expectedPlayerCount) => {
    const api = window.__MINI_WHEELS_TEST__;
    const snapshot = api?.snapshot();
    return (
      api?.appSnapshot().state === "playing" &&
      snapshot !== null &&
      snapshot !== undefined &&
      (expectedPlayerCount === null || snapshot.vehicles.length === expectedPlayerCount)
    );
  }, playerCount ?? null);
}
