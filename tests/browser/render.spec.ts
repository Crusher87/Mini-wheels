import { expect, test, type Page } from "@playwright/test";

async function openOptions(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /options/i }).click();
}

test("UI-003/005/006: render options reconfigure live buffers and passes", async ({ page }) => {
  await openOptions(page);
  const expectedOffRatio = await page.evaluate(() => Math.min(window.devicePixelRatio * 0.5, 2));

  await page.locator("#aa-quality").selectOption("off");
  await page.locator("#render-scale").selectOption("0.5");
  await page.locator("#ambient-occlusion").uncheck();
  await page.locator("#vignette").uncheck();
  await page.waitForFunction((expectedRatio) => {
    const rendering = window.__TINY_TRACTION_TEST__?.renderSnapshot();
    return (
      rendering?.postProcessing.internalSize.effectivePixelRatio === expectedRatio &&
      rendering.postProcessing.passes.find((pass) => pass.name === "fxaa")?.enabled === false &&
      rendering.postProcessing.passes.find((pass) => pass.name === "smaa")?.enabled === false
    );
  }, expectedOffRatio);

  const off = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.renderSnapshot());
  expect(off?.postProcessing.passes).toEqual([
    { name: "render", enabled: true },
    { name: "ambient-occlusion", enabled: false },
    { name: "vignette", enabled: false },
    { name: "fxaa", enabled: false },
    { name: "smaa", enabled: false },
    { name: "output", enabled: true },
  ]);
  expect(off?.postProcessing.internalSize.internalWidth).toBe(
    Math.round((off?.postProcessing.internalSize.cssWidth ?? 0) * expectedOffRatio),
  );

  await page.locator("#aa-quality").selectOption("fxaa");
  await expect
    .poll(async () => {
      const rendering = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.renderSnapshot());
      return rendering?.postProcessing.passes.find((pass) => pass.name === "fxaa")?.enabled;
    })
    .toBe(true);

  await page.locator("#aa-quality").selectOption("smaa");
  await page.locator("#shadow-quality").selectOption("medium");
  await page.locator("#ambient-occlusion").check();
  await page.locator("#vignette").check();
  await expect
    .poll(async () => page.evaluate(() => window.__TINY_TRACTION_TEST__?.renderSnapshot()))
    .toMatchObject({
      postProcessing: {
        passes: [
          { name: "render", enabled: true },
          { name: "ambient-occlusion", enabled: true },
          { name: "vignette", enabled: true },
          { name: "fxaa", enabled: false },
          { name: "smaa", enabled: true },
          { name: "output", enabled: true },
        ],
      },
    });

  await page.locator("#shadow-quality").selectOption("low");
  await expect
    .poll(async () => {
      const rendering = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.renderSnapshot());
      return rendering?.postProcessing.passes.find((pass) => pass.name === "ambient-occlusion")
        ?.enabled;
    })
    .toBe(false);

  await page.locator("#shadow-quality").selectOption("medium");
  await page.locator("#render-scale").selectOption("1");
  await page.locator("#aa-quality").selectOption("high");
  const expectedHighRatio = await page.evaluate(() => Math.min(window.devicePixelRatio * 1.25, 2));
  await expect
    .poll(async () => {
      const rendering = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.renderSnapshot());
      return rendering?.postProcessing.internalSize.effectivePixelRatio;
    })
    .toBe(expectedHighRatio);

  const high = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.renderSnapshot());
  expect(high?.postProcessing.passes.find((pass) => pass.name === "smaa")?.enabled).toBe(true);
  expect(high?.resources.geometries).toBeGreaterThanOrEqual(0);
  expect(high?.resources.textures).toBeGreaterThanOrEqual(0);
  expect(high?.resources.programs).toBeGreaterThanOrEqual(0);
});
