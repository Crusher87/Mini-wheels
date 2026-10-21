import { expect, test } from "@playwright/test";

// A first-time visitor has no stored choice, so the creator opens in Easy mode.
test.use({ storageState: { cookies: [], origins: [] } });

test("EASY-001: the creator opens simple, with picture choices and a PRO switch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const editor = page.locator("#screen-editor");
  await expect(editor).toHaveAttribute("data-editor-level", "easy");
  await expect(page.locator(".editor-environment-panel")).toBeHidden();
  await expect(page.locator("#editor-easy-world")).toBeVisible();

  await page.locator("#editor-draw-road-button").click();
  await expect(page.locator("#editor-draw-road-button")).toHaveAttribute("aria-pressed", "true");

  await page.locator('[data-editor-category="race"]').click();
  await expect(page.locator('[data-editor-asset="race.finish-gate"]')).toBeVisible();
  await expect(page.locator('[data-editor-asset="physics.ball"]')).toBeHidden();

  await page.locator('[data-easy-set="editor-environment-sky=night"]').click();
  await expect(page.locator("#editor-environment-sky")).toHaveValue("night");
  await expect(page.locator('[data-easy-set="editor-environment-sky=night"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.locator('[data-easy-set="editor-race-mode=circuit"]').click();
  await expect(page.locator("#editor-easy-laps")).toBeVisible();
  await page.locator('[data-easy-step="editor-race-laps=1"]').click();
  await expect(page.locator("#editor-easy-laps-value")).toHaveText("2");
  await expect(page.locator("#editor-race-laps")).toHaveValue("2");

  await page.locator("#editor-level-button").click();
  await expect(editor).toHaveAttribute("data-editor-level", "pro");
  await expect(page.locator(".editor-environment-panel")).toBeVisible();
  await expect(page.locator("#editor-easy-world")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("mini-wheels.editor-level"))).toBe("pro");
});
