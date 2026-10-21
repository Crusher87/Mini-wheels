import { expect, test } from "@playwright/test";

test.skip(
  process.env["PW_PRODUCTION_SMOKE"] !== "1",
  "This smoke test requires the optimized production preview.",
);

test("PROD-001: optimized build boots Rapier without development instrumentation", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const wasmResponsePromise = page.waitForResponse(
    (response) => /\.wasm(?:$|\?)/u.test(response.url()) && response.status() === 200,
  );

  await page.goto("/");
  const wasmResponse = await wasmResponsePromise;
  await expect(page.getByRole("button", { name: /start engine/i })).toBeVisible();

  expect(wasmResponse.headers()["content-type"]).toContain("application/wasm");
  expect(
    await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, "__MINI_WHEELS_TEST__")),
  ).toBe(false);

  const scriptSource = await page.locator('script[type="module"]').getAttribute("src");
  const stylesheetSource = await page
    .locator('link[rel="stylesheet"]')
    .first()
    .getAttribute("href");
  expect(scriptSource).toMatch(/^\.\/assets\/index-[A-Za-z0-9_-]+\.js$/u);
  expect(stylesheetSource).toMatch(/^\.\/assets\/index-[A-Za-z0-9_-]+\.css$/u);

  const bundleResponse = await page.request.get(new URL(scriptSource ?? "", page.url()).href);
  expect(bundleResponse.ok()).toBe(true);
  expect(await bundleResponse.text()).not.toContain("__MINI_WHEELS_TEST__");

  await page.getByRole("button", { name: /start engine/i }).click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
