import { expect, test } from "@playwright/test";

const visualEvidenceEnabled = process.env["PW_VISUAL_EVIDENCE"] === "1";

test("ED foundation: creates, previews, saves, reloads, and duplicates a browser-local map", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();

  await expect(page.getByRole("button", { name: /create/i })).toBeVisible();
  await page.getByRole("button", { name: /create/i }).click();
  await expect(page.getByRole("heading", { name: "MAP LIBRARY" })).toBeVisible();
  await expect(page.getByText("BUILT-IN · LOCKED")).toBeVisible();
  await expect(page.locator("#map-storage-status")).toContainText("SAVED IN THIS BROWSER");

  await page.getByRole("button", { name: /new playground/i }).click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("2");
  await expect(page.locator("#editor-map-health")).toHaveText("GREEN");
  await expect
    .poll(() => page.evaluate(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state))
    .toBe("editing");

  await page.locator("#editor-map-name").fill("Jump Garden");
  await expect(page.locator("#editor-save-status")).toHaveText("NAME CHANGE NOT SAVED");
  await page.locator("#editor-save-button").click();
  await expect(page.locator("#editor-save-status")).toHaveText("SAVED LOCALLY");
  await expect(page.locator("#editor-map-revision")).toHaveText("2");

  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "YOUR MAPS" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jump Garden", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "DUPLICATE" }).click();
  await expect(page.getByRole("heading", { name: "Jump Garden Copy" })).toBeVisible();
  await expect(page.locator("#map-library-count")).toHaveText("2 MAPS");

  await page.reload();
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await expect(page.getByRole("heading", { name: "Jump Garden", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jump Garden Copy" })).toBeVisible();
});

test("ED foundation: Escape leaves the library without affecting the existing play flow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();

  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
});

test("ED normal play: launches a saved map from the library and returns to maps", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-map-name").fill("Family Race");
  await page.locator("#editor-race-mode").selectOption("circuit");
  await page.locator("#editor-save-button").click();
  await page.getByRole("button", { name: "Library" }).click();

  await page.getByRole("button", { name: "PLAY MAP" }).click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  await expect(page.locator("#toast")).toHaveText(
    "This map is not ready for a race yet, so you can just drive around.",
  );
  await expect
    .poll(() => page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.race.phase))
    .toBe("free-roam");
  await page.keyboard.press("KeyP");
  await expect(page.getByRole("heading", { name: "RACE PAUSED" })).toBeVisible();
  await expect(page.locator("#reset-button")).toHaveText("RESET RACE");
  await page.locator("#return-menu-button").click();
  await expect(page.getByRole("heading", { name: "MAP LIBRARY" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Family Race" })).toBeVisible();
});

test("ED library: searches tags, favorites, exports, restores, deletes, and safely imports maps", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-map-name").fill("Rainbow Leap");
  await page.locator("#editor-map-tags").fill("rainbow, jumps, family");
  await page.locator("#editor-map-tags").dispatchEvent("change");
  await page.locator("#editor-save-button").click();
  await page.getByRole("button", { name: "Library" }).click();

  await page.locator("#map-library-search").fill("jumps");
  await expect(page.getByRole("heading", { name: "Rainbow Leap" })).toBeVisible();
  await page.getByRole("button", { name: "☆ FAVORITE" }).click();
  await expect(page.getByRole("button", { name: "★ FAVORITE" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#map-library-favorites").check();
  await expect(page.locator("#map-library-count")).toHaveText("1 MAP");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("rainbow-leap.mini-wheels.json");
  const exportedPath = await download.path();
  expect(exportedPath).not.toBeNull();

  await page.getByRole("button", { name: "RESTORE POINTS" }).click();
  await expect(page.getByRole("button", { name: "RECOVER AS COPY" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close restore points" }).click();

  await page.getByRole("button", { name: "MOVE TO TRASH" }).click();
  await expect(page.locator("#map-library-count")).toHaveText("0 MAPS");
  await page.locator("#map-library-favorites").uncheck();
  await page.locator("#map-library-search").fill("");
  await page.getByRole("button", { name: "VIEW TRASH" }).click();
  await page.getByRole("button", { name: "RESTORE MAP" }).click();
  await expect(page.locator("#map-library-count")).toHaveText("0 MAPS");
  await page.getByRole("button", { name: "BACK TO MAPS" }).click();
  await expect(page.getByRole("heading", { name: "Rainbow Leap" })).toBeVisible();

  await page.getByRole("button", { name: "MOVE TO TRASH" }).click();
  await page.getByRole("button", { name: "VIEW TRASH" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "DELETE FOREVER" }).click();
  await expect(page.locator("#map-library-count")).toHaveText("0 MAPS");

  await page.locator("#map-import-input").setInputFiles(exportedPath);
  await page.getByRole("button", { name: "BACK TO MAPS" }).click();
  await expect(page.getByRole("heading", { name: "Rainbow Leap" })).toBeVisible();
  await expect(page.getByText(/#rainbow #jumps #family/)).toBeVisible();
});

test("ED recovery: reload restores the last durably journaled edit before autosave", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-map-name").fill("Crash Safe Course");
  await page.locator("#editor-save-button").click();
  await page.locator("#editor-top-down-button").click();
  await page.locator('[data-editor-asset="shape.block"]').click();
  await page.locator("#editor-viewport-chrome").click({ position: { x: 500, y: 300 } });
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await expect(page.locator("#editor-save-status")).toContainText("RECOVERY SAVED");

  await page.reload();
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: "EDIT MAP" }).click();
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await expect(page.locator("#editor-save-status")).toContainText("RECOVERED");
});

test("ED surface snap: repeated placement stacks on visible tops and can be disabled", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  await page.locator('[data-editor-asset="shape.block"]').click();
  const viewport = page.locator("#editor-viewport-chrome");
  await viewport.click({ position: { x: 520, y: 300 } });
  const firstHeight = Number(await page.locator("#editor-position-y").inputValue());
  await viewport.click({ position: { x: 520, y: 300 } });
  const stackedHeight = Number(await page.locator("#editor-position-y").inputValue());
  expect(stackedHeight).toBeGreaterThan(firstHeight + 1);

  await page.locator("#editor-surface-snap").uncheck();
  await viewport.click({ position: { x: 520, y: 300 } });
  const groundHeight = Number(await page.locator("#editor-position-y").inputValue());
  expect(groundHeight).toBeCloseTo(firstHeight);
});

test("ED test mode: drives an immutable map snapshot and returns to the live edit session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-map-name").fill("Test Mode Playground");
  await page.locator("#editor-top-down-button").click();
  await page.locator("#editor-zoom-slider").evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = "0.45";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const floorTool = page.locator('[data-editor-asset="floor.rectangle"]');
  await floorTool.click();
  await page.locator("#editor-viewport-chrome").click({ position: { x: 260, y: 220 } });
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await expect(floorTool).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#editor-undo-button")).toBeEnabled();
  await expect(page.locator("#editor-save-status")).toHaveAttribute("data-save-state", "pending");
  await page.locator("#editor-test-button").click();

  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  const before = await page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle);
  expect(before).toBeDefined();
  await page.keyboard.down("w");
  await page.waitForTimeout(1_000);
  await page.keyboard.up("w");
  const after = await page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle);
  expect(after).toBeDefined();
  expect(Math.hypot(after!.x - before!.x, after!.z - before!.z)).toBeGreaterThan(0.1);
  expect(after!.authoredSurface).toBe("normal");
  expect(after!.authoredBoostCount).toBe(0);
  expect(after!.authoredBounceCount).toBe(0);
  expect(after!.authoredHazardCount).toBe(0);

  await page.keyboard.press("KeyP");
  await expect(page.locator("#screen-pause")).toBeVisible();
  await expect(page.getByRole("heading", { name: "TEST PAUSED" })).toBeVisible();
  await expect(page.locator("#reset-button")).toContainText("RESET TEST");
  await page.locator("#reset-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();

  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-map-name")).toHaveValue("Test Mode Playground");
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await expect(page.locator("#editor-zoom-output")).toHaveText("45%");
  await expect(page.locator("#editor-top-down-button")).toHaveAttribute("aria-pressed", "true");
  await expect(floorTool).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#editor-undo-button")).toBeEnabled();
  await expect(page.locator("#editor-save-status")).toHaveAttribute("data-save-state", "pending");
  await expect
    .poll(() => page.evaluate(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state))
    .toBe("editing");
});

test("ED world settings: preview, Test Mode, recovery, and lifecycle stay map-owned", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  await page.locator("#editor-environment-ground").selectOption("void");
  await page.locator("#editor-environment-sky").selectOption("night");
  await expect(page.locator("#editor-environment-background")).toHaveValue("#18243d");
  await page.locator("#editor-environment-gravity-preset").selectOption("moon");
  await page.locator(".editor-environment-advanced summary").click();
  await page.locator("#editor-environment-fog").check();
  await page.locator("#editor-environment-fog-near").fill("12");
  await page.locator("#editor-environment-fog-near").dispatchEvent("change");
  await page.locator("#editor-environment-fog-far").fill("80");
  await page.locator("#editor-environment-fog-far").dispatchEvent("change");
  await page.locator("#editor-environment-music").selectOption("music.starlight");
  await expect
    .poll(() =>
      page.evaluate(() => window.__MINI_WHEELS_TEST__?.audioSnapshot().activeMusicVoiceCount ?? 0),
    )
    .toBe(1);
  await page.locator("#editor-environment-oob").fill("-10");
  await page.locator("#editor-environment-oob").dispatchEvent("change");
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "title",
    "Undo Edit world settings",
  );

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  const environment = await page.evaluate(
    () => window.__MINI_WHEELS_TEST__?.snapshot()?.environment,
  );
  expect(environment).toMatchObject({
    groundMode: "void",
    skyPreset: "night",
    fogEnabled: true,
    gravity: [0, -1.62, 0],
    musicAssetId: "music.starlight",
    outOfBoundsHeight: -10,
  });
  await page.evaluate(() => window.__MINI_WHEELS_TEST__?.moveVehicle(0, { x: 0, y: -20, z: 0 }));
  await expect
    .poll(() => page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle.y ?? -99))
    .toBeGreaterThan(0);

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-environment-sky")).toHaveValue("night");
  await expect(page.locator("#editor-environment-ground")).toHaveValue("void");
  await page.getByRole("button", { name: "Library" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__MINI_WHEELS_TEST__?.audioSnapshot().activeMusicVoiceCount ?? 1),
    )
    .toBe(0);
});

test("ED test walls: a glancing car slides without catching or bouncing", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const centerX = bounds!.x + bounds!.width / 2;
  const centerY = bounds!.y + bounds!.height / 2;
  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(centerX, centerY + 210);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY - 210, { steps: 14 });
  await page.mouse.up();
  await page.locator("#editor-track-wall-left").check();
  await page.locator("#editor-track-wall-right").check();
  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 1.6, y: 0.8, z: -4 },
      linearVelocity: { x: 12, y: 0, z: 8 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  });
  const collisionHandle = await page.waitForFunction(
    () => {
      const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
      return vehicle !== undefined && vehicle.x > 2 && Math.abs(vehicle.linearVelocity.x) < 3
        ? vehicle
        : false;
    },
    undefined,
    { polling: 10, timeout: 2_000 },
  );
  const vehicle = await collisionHandle.jsonValue();

  expect(vehicle).not.toBe(false);
  if (vehicle === false) {
    throw new Error("The wall collision response was not captured.");
  }
  expect(Math.abs(vehicle.x)).toBeLessThan(4);
  expect(vehicle.y).toBeGreaterThan(-0.5);
  expect(vehicle.z, JSON.stringify(vehicle)).toBeGreaterThan(-4);
  expect(Math.abs(vehicle.linearVelocity.x), JSON.stringify(vehicle)).toBeLessThan(3);
  expect(Math.abs(vehicle.linearVelocity.y), JSON.stringify(vehicle)).toBeLessThan(2);
  expect(vehicle.linearVelocity.z, JSON.stringify(vehicle)).toBeGreaterThan(2);

  const separationCountBeforeTip = await page.evaluate(
    () => window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle.authoredWallSeparationCount ?? 0,
  );
  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 2.55, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
      linearVelocity: { x: 4, y: 0, z: 2 },
      angularVelocity: { x: 5, y: 0, z: 5 },
    });
  });
  const separationHandle = await page.waitForFunction(
    (previousCount) => {
      const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
      return (vehicle?.authoredWallSeparationCount ?? 0) > previousCount ? vehicle : false;
    },
    separationCountBeforeTip,
    { polling: 10, timeout: 2_000 },
  );
  const separated = await separationHandle.jsonValue();
  expect(separated).toBeTruthy();
  if (separated === false || separated === undefined) {
    throw new Error("The authored-wall separation response was not captured.");
  }
  expect(separated.x, JSON.stringify(separated)).toBeLessThan(3);
  expect(separated.upAxisY, JSON.stringify(separated)).toBeLessThan(0.8);
  expect(separated.automaticUprightRecoveryCount).toBe(0);
  await page.waitForTimeout(350);
  const cleared = await page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle);
  expect(cleared).toBeDefined();
  expect(cleared!.x, JSON.stringify(cleared)).toBeLessThan(2.5);
});

test("ED authoring: places, edits, undoes, duplicates, deletes, and autosaves objects", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();

  const viewport = page.locator("#editor-viewport-chrome");
  const floorTool = page.locator('[data-editor-asset="floor.rectangle"]');
  await floorTool.click();
  await expect(floorTool).toHaveAttribute("aria-pressed", "true");
  await viewport.click({ position: { x: 360, y: 270 } });
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await page.keyboard.press("Escape");
  await expect(floorTool).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#editor-selection-panel")).toBeVisible();

  await viewport.hover({ position: { x: 360, y: 270 } });
  await page.mouse.wheel(0, -100);
  await expect(page.locator("#editor-primary-size")).toHaveValue("6.5");
  await page.waitForTimeout(350);
  await expect(page.locator("#editor-undo-button")).toBeEnabled();

  await page.locator("#editor-position-x").fill("7.5");
  await page.locator("#editor-position-z").fill("-3");
  await page.locator("#editor-yaw").fill("45");
  await page.locator("#editor-yaw").press("Enter");
  await expect(page.locator("#editor-position-x")).toHaveValue("7.5");
  await expect(page.locator("#editor-position-z")).toHaveValue("-3");

  await page.locator("#editor-duplicate-button").click();
  await expect(page.locator("#editor-object-count")).toHaveText("4");
  await page.locator("#editor-delete-button").click();
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await page.locator("#editor-undo-button").click();
  await expect(page.locator("#editor-object-count")).toHaveText("4");

  await page.locator("#editor-top-down-button").click();
  await expect(page.locator("#editor-top-down-button")).toHaveAttribute("aria-pressed", "true");
  const viewportBounds = await viewport.boundingBox();
  expect(viewportBounds).not.toBeNull();
  await page.mouse.move(viewportBounds!.x + 420, viewportBounds!.y + 280);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(viewportBounds!.x + 470, viewportBounds!.y + 310);
  await page.mouse.up({ button: "right" });
  await expect(page.locator("#editor-top-down-button")).toHaveAttribute("aria-pressed", "false");

  await expect(page.locator("#editor-save-status")).toHaveText("SAVED LOCALLY", {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "EDIT MAP" }).click();
  await expect(page.locator("#editor-object-count")).toHaveText("4");
});

test("ED groups: select, transform, duplicate, ungroup, undo, and reload as units", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await page.locator('[data-editor-asset="shape.block"]').click();
  await viewport.click({ position: { x: 520, y: 350 } });
  await viewport.click({ position: { x: 760, y: 350 } });
  await page.keyboard.press("Escape");
  await viewport.click({ position: { x: 520, y: 350 }, modifiers: ["Shift"] });
  await expect(page.locator("#editor-selected-count")).toHaveText("2");
  await page.locator("#editor-group-button").click();
  await expect(page.locator("#editor-group-button")).toBeDisabled();
  await expect(page.locator("#editor-ungroup-button")).toBeEnabled();
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "aria-label",
    "Undo Group objects",
  );

  await page.keyboard.press("Escape");
  await viewport.click({ position: { x: 520, y: 350 } });
  await expect(page.locator("#editor-selected-count")).toHaveText("2");
  await page.locator("#editor-duplicate-multi-button").click();
  await expect(page.locator("#editor-object-count")).toHaveText("6");
  await expect(page.locator("#editor-ungroup-button")).toBeEnabled();
  await page.locator("#editor-ungroup-button").click();
  await expect(page.locator("#editor-group-button")).toBeEnabled();
  await expect(page.locator("#editor-ungroup-button")).toBeDisabled();
  await page.locator("#editor-undo-button").click();
  await expect(page.locator("#editor-ungroup-button")).toBeEnabled();

  await expect(page.locator("#editor-save-status")).toHaveText("SAVED LOCALLY", {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "EDIT MAP" }).click();
  await expect(page.locator("#editor-object-count")).toHaveText("6");
  await viewport.click({ position: { x: 520, y: 350 } });
  await expect(page.locator("#editor-selected-count")).toHaveText("2");
  await expect(page.locator("#editor-prefab-save-panel")).toBeVisible();
  await page.locator("#editor-prefab-name").fill("Block Pair");
  await page.locator("#editor-save-prefab-button").click();
  const prefabButton = page.getByRole("button", { name: /Block Pair 2 Objects/i });
  await expect(prefabButton).toBeVisible();
  await prefabButton.click();
  await viewport.hover({ position: { x: 900, y: 500 } });
  await page.mouse.wheel(0, -100);
  await viewport.click({ position: { x: 900, y: 500 } });
  await expect(page.locator("#editor-object-count")).toHaveText("8");
  await page.getByRole("button", { name: "Remove prefab Block Pair" }).click();
  await expect(prefabButton).toHaveCount(0);
  await expect(page.locator("#editor-object-count")).toHaveText("8");
});

test("ED floors: click places the preset while drag draws a rectangular floor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-grid-snap").check();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.locator('[data-editor-asset="floor.rectangle"]').click();

  await page.mouse.move(bounds!.x + 280, bounds!.y + 220);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 620, bounds!.y + 400, { steps: 6 });
  await expect(page.locator("#editor-wheel-hud")).toContainText(/FLOOR .* × .* M/);
  await page.mouse.up();
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await expect(page.locator("#toast")).toContainText(/Floor .* × .* M placed/);

  await viewport.click({ position: { x: 760, y: 250 } });
  await expect(page.locator("#editor-object-count")).toHaveText("4");
  await expect(page.locator("#toast")).toContainText("Floor placed");
});

test("ED catalog: searches, places, compiles, and restores built-in construction objects", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();

  const search = page.locator("#editor-object-search");
  await search.fill("jump");
  await expect(page.locator('[data-editor-asset="track.jump"]')).toBeVisible();
  await expect(page.locator('[data-editor-asset="floor.rectangle"]')).toBeHidden();
  await search.fill("");

  const viewport = page.locator("#editor-viewport-chrome");
  const placements = [
    { assetId: "floor.circle", x: 260, y: 180 },
    { assetId: "floor.rounded", x: 400, y: 180 },
    { assetId: "floor.polygon", x: 540, y: 180 },
    { assetId: "shape.block", x: 260, y: 380 },
    { assetId: "shape.column", x: 400, y: 380 },
    { assetId: "track.barrier", x: 540, y: 380 },
    { assetId: "track.ramp", x: 680, y: 380 },
    { assetId: "track.jump", x: 820, y: 380 },
    { assetId: "floor.void-base", x: 680, y: 540 },
    { assetId: "track.modular-straight", x: 260, y: 540 },
    { assetId: "track.modular-corner", x: 400, y: 540 },
    { assetId: "track.bridge", x: 540, y: 540 },
    { assetId: "track.guard-rail", x: 680, y: 540 },
    { assetId: "track.overpass-support", x: 820, y: 540 },
    { assetId: "track.tunnel", x: 820, y: 250 },
    { assetId: "race.player-spawn", x: 260, y: 250 },
    { assetId: "race.checkpoint", x: 400, y: 250 },
    { assetId: "race.finish-gate", x: 540, y: 250 },
    { assetId: "race.shortcut-marker", x: 610, y: 250 },
    { assetId: "race.recovery-volume", x: 680, y: 250 },
    { assetId: "race.recovery-pose", x: 750, y: 250 },
    { assetId: "race.out-of-bounds-volume", x: 820, y: 250 },
  ] as const;
  for (const placement of placements) {
    const card = page.locator(`[data-editor-asset="${placement.assetId}"]`);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await viewport.click({ position: { x: placement.x, y: placement.y } });
  }
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.locator('[data-editor-asset="floor.freeform"]').click();
  await page.mouse.move(bounds!.x + 260, bounds!.y + 460);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 460, bounds!.y + 460, { steps: 3 });
  await page.mouse.move(bounds!.x + 460, bounds!.y + 590, { steps: 3 });
  await page.mouse.move(bounds!.x + 360, bounds!.y + 540, { steps: 2 });
  await page.mouse.move(bounds!.x + 260, bounds!.y + 590, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator("#toast")).toContainText("Freeform floor placed");
  await expect(page.locator("#editor-object-count")).toHaveText("25");
  await page.mouse.move(bounds!.x + 540, bounds!.y + 460);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 700, bounds!.y + 590, { steps: 3 });
  await page.mouse.move(bounds!.x + 540, bounds!.y + 590, { steps: 3 });
  await page.mouse.move(bounds!.x + 700, bounds!.y + 460, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator("#toast")).toContainText("without crossing over itself");
  await expect(page.locator("#editor-object-count")).toHaveText("25");
  if (visualEvidenceEnabled) {
    await page.screenshot({ path: "test-results/editor-construction-catalog.png" });
  }

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  const colliderCount = await page.evaluate(
    () => window.__MINI_WHEELS_TEST__?.snapshot()?.colliderCount ?? 0,
  );
  // Construction solids, tunnel pieces, five race sensors, five starter-road chunks,
  // and the map-owned environment ground.
  expect(colliderCount).toBe(30);

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("25");
});

test("ED dynamic toys: authored balls, cubes, and dominoes simulate, recover, and restore", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await page.locator('[data-editor-asset="physics.ball"]').click();
  await viewport.click({ position: { x: 660, y: 320 } });
  await page.locator("#editor-position-x").fill("-3");
  await page.locator("#editor-position-y").fill("1");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await expect(page.locator("#editor-physics-panel")).toBeVisible();
  await page.locator("#editor-physics-mass").fill("4");
  await page.locator("#editor-physics-mass").press("Enter");
  await page.locator("#editor-physics-restitution").fill("0.9");
  await page.locator("#editor-physics-restitution").press("Enter");

  await page.locator('[data-editor-asset="physics.cube"]').click();
  await viewport.click({ position: { x: 500, y: 500 } });
  await page.locator("#editor-position-x").fill("3");
  await page.locator("#editor-position-y").fill("1");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");

  await page.locator('[data-editor-asset="physics.domino"]').click();
  await viewport.click({ position: { x: 430, y: 410 } });
  await page.locator("#editor-position-x").fill("6");
  await page.locator("#editor-position-y").fill("2");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await expect(page.locator("#editor-physics-panel")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("5");

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const arena = window.__MINI_WHEELS_TEST__?.snapshot()?.arena;
        return [arena?.ballCount ?? 0, arena?.cubeCount ?? 0];
      }),
    )
    .toEqual([1, 2]);

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setBallState(0, {
      position: { x: 0, y: 8, z: 0 },
      linearVelocity: { x: 4, y: 0, z: 0 },
    });
  });
  await page.waitForFunction(() => {
    const ball = window.__MINI_WHEELS_TEST__?.snapshot()?.arena.balls[0];
    return ball !== undefined && ball.currentPosition.x > 1 && ball.currentPosition.y < 8;
  });

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setCubeState(0, {
      position: { x: 20, y: -30, z: 20 },
      linearVelocity: { x: 10, y: -10, z: 10 },
      angularVelocity: { x: 5, y: 5, z: 5 },
    });
  });
  await page.waitForFunction(() => {
    const cube = window.__MINI_WHEELS_TEST__?.snapshot()?.arena.cubes[0];
    return (
      cube !== undefined &&
      Math.abs(cube.currentPosition.x - cube.authoredPosition.x) < 0.1 &&
      Math.abs(cube.currentPosition.z - cube.authoredPosition.z) < 0.1 &&
      Math.hypot(cube.linearVelocity.x, cube.linearVelocity.y, cube.linearVelocity.z) < 0.5
    );
  });

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("5");
});

test("ED motion objects: platforms, doors, and rotating bars move deterministically", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await page.locator('[data-editor-asset="motion.moving-platform"]').click();
  await viewport.click({ position: { x: 620, y: 360 } });
  await expect(page.locator("#editor-motion-panel")).toBeVisible();
  await page.locator("#editor-position-x").fill("0");
  await page.locator("#editor-position-y").fill("0.15");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await page.locator("#editor-motion-offset-y").fill("4");
  await page.locator("#editor-motion-offset-y").press("Enter");
  await page.locator("#editor-motion-speed").fill("4");
  await page.locator("#editor-motion-speed").press("Enter");
  await page.locator("#editor-motion-dwell").fill("0");
  await page.locator("#editor-motion-dwell").press("Enter");

  await page.locator('[data-editor-asset="motion.rotating-bar"]').click();
  await viewport.click({ position: { x: 440, y: 500 } });
  await page.locator("#editor-position-x").fill("8");
  await page.locator("#editor-position-y").fill("0.3");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await expect(page.locator("#editor-motion-speed-label")).toHaveText("SPIN (DEG/S)");
  await page.locator("#editor-motion-speed").fill("180");
  await page.locator("#editor-motion-speed").press("Enter");

  await page.locator('[data-editor-asset="motion.door"]').click();
  await viewport.click({ position: { x: 540, y: 430 } });
  await expect(page.locator("#editor-motion-panel")).toBeVisible();
  await page.locator("#editor-position-x").fill("-8");
  await page.locator("#editor-position-y").fill("2");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await page.locator("#editor-motion-offset-y").fill("5");
  await page.locator("#editor-motion-offset-y").press("Enter");
  await expect(page.locator("#editor-object-count")).toHaveText("5");

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  const initial = await page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.movers);
  expect(initial?.movingPlatforms).toHaveLength(2);
  expect(initial?.rotatingBars).toHaveLength(1);
  const initialPlatformY = initial?.movingPlatforms[0]?.position.y ?? 0;
  const initialBarYaw = initial?.rotatingBars[0]?.yawRadians ?? 0;
  await page.waitForFunction(
    ({ platformY, barYaw }) => {
      const movers = window.__MINI_WHEELS_TEST__?.snapshot()?.movers;
      const nextPlatformY = movers?.movingPlatforms[0]?.position.y;
      const nextBarYaw = movers?.rotatingBars[0]?.yawRadians;
      return (
        nextPlatformY !== undefined &&
        nextBarYaw !== undefined &&
        nextPlatformY > platformY + 0.5 &&
        Math.abs(nextBarYaw - barYaw) > 0.5
      );
    },
    { platformY: initialPlatformY, barYaw: initialBarYaw },
  );

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("5");
});

test("ED travel pads: boost, launch, bounce, and slow effects activate in Test Mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await page.locator('[data-editor-asset="travel.boost-pad"]').click();
  await viewport.click({ position: { x: 620, y: 360 } });
  await expect(page.locator("#editor-boost-panel")).toBeVisible();
  await page.locator("#editor-position-x").fill("0");
  await page.locator("#editor-position-y").fill("0.08");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await page.locator("#editor-boost-speed").fill("10");
  await page.locator("#editor-boost-speed").press("Enter");

  await page.locator('[data-editor-asset="travel.launch-pad"]').click();
  await viewport.click({ position: { x: 760, y: 360 } });
  await expect(page.locator("#editor-boost-heading")).toHaveText("LAUNCH PAD");
  await page.locator("#editor-position-x").fill("8");
  await page.locator("#editor-position-y").fill("0.08");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await page.locator("#editor-boost-speed").fill("6");
  await page.locator("#editor-boost-lift").fill("9");
  await page.locator("#editor-boost-lift").press("Enter");

  await page.locator('[data-editor-asset="travel.bounce-pad"]').click();
  await viewport.click({ position: { x: 500, y: 440 } });
  await expect(page.locator("#editor-surface-pad-heading")).toHaveText("BOUNCE PAD");
  await page.locator("#editor-position-x").fill("-8");
  await page.locator("#editor-position-y").fill("0.08");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await page.locator("#editor-surface-pad-strength").fill("11");
  await page.locator("#editor-surface-pad-strength").press("Enter");

  await page.locator('[data-editor-asset="travel.slow-zone"]').click();
  await viewport.click({ position: { x: 700, y: 520 } });
  await expect(page.locator("#editor-surface-pad-heading")).toHaveText("SLOW ZONE");
  await page.locator("#editor-position-x").fill("16");
  await page.locator("#editor-position-y").fill("0.08");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await page.locator("#editor-surface-pad-strength").fill("0.4");
  await page.locator("#editor-surface-pad-strength").press("Enter");
  await expect(page.locator("#editor-object-count")).toHaveText("6");

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  await expect
    .poll(() => page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.interactions.boosters))
    .toMatchObject({ padCount: 4, sensorColliderCount: 4 });

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 0, y: 0.25, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  });
  await page.waitForFunction(() => {
    const snapshot = window.__MINI_WHEELS_TEST__?.snapshot();
    return (
      (snapshot?.interactions.boosters.activationCount ?? 0) >= 1 &&
      (snapshot?.vehicle.linearVelocity.z ?? 0) > 5
    );
  });

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: -8, y: 0.25, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 3, y: -5, z: 4 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  });
  await page.waitForFunction(() => {
    const last = window.__MINI_WHEELS_TEST__?.snapshot()?.interactions.boosters.lastActivation;
    return last?.effect === "bounce" && (last.bodies[0]?.exitLinearVelocity.y ?? 0) >= 11;
  });

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 16, y: 0.25, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 10, y: 0, z: -5 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  });
  await page.waitForFunction(() => {
    const last = window.__MINI_WHEELS_TEST__?.snapshot()?.interactions.boosters.lastActivation;
    const entry = last?.bodies[0]?.entryLinearVelocity;
    const exit = last?.bodies[0]?.exitLinearVelocity;
    return (
      last?.effect === "slow" &&
      entry !== undefined &&
      exit !== undefined &&
      Math.abs(exit.x - entry.x * 0.4) < 0.01 &&
      Math.abs(exit.z - entry.z * 0.4) < 0.01 &&
      last.particleCount === 0
    );
  });

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 8, y: 0.25, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  });
  await page.waitForFunction(() => {
    const snapshot = window.__MINI_WHEELS_TEST__?.snapshot();
    return (
      (snapshot?.interactions.boosters.activationCount ?? 0) >= 2 &&
      (snapshot?.vehicle.linearVelocity.y ?? 0) > 5
    );
  });

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("6");
});

test("ED decoration: guidance, lights, strips, and sculpture survive Test Mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await page.locator('[data-editor-asset="travel.direction-arrow"]').click();
  await viewport.click({ position: { x: 540, y: 380 } });
  await expect(page.locator("#editor-guidance-heading")).toHaveText("FLOOR ARROW");
  await expect(page.locator("#editor-guidance-solid-field")).toBeHidden();
  await page.locator("#editor-guidance-color").fill("#ff8800");
  await page.locator("#editor-guidance-glow").fill("1.4");
  await page.locator("#editor-guidance-glow").press("Enter");

  await page.locator('[data-editor-asset="decoration.arrow-sign"]').click();
  await viewport.click({ position: { x: 720, y: 380 } });
  await expect(page.locator("#editor-guidance-heading")).toHaveText("SIGN");
  await expect(page.locator("#editor-guidance-solid-field")).toBeVisible();
  await page.locator("#editor-guidance-color").fill("#22ccff");
  await page.locator("#editor-guidance-solid").check();

  await page.locator('[data-editor-asset="decoration.point-light"]').click();
  await viewport.click({ position: { x: 830, y: 430 } });
  await expect(page.locator("#editor-decoration-heading")).toHaveText("LAMP");
  await expect(page.locator("#editor-decoration-intensity-field")).toBeVisible();
  await page.locator("#editor-decoration-color").fill("#ffcc44");
  await page.locator("#editor-decoration-intensity").fill("7.5");
  await page.locator("#editor-decoration-range").fill("22");
  await page.locator("#editor-decoration-range").press("Enter");

  await page.locator('[data-editor-asset="decoration.color-strip"]').click();
  await viewport.click({ position: { x: 650, y: 500 } });
  await expect(page.locator("#editor-decoration-heading")).toHaveText("GLOW STRIP");
  await expect(page.locator("#editor-decoration-glow-field")).toBeVisible();
  await expect(page.locator("#editor-decoration-intensity-field")).toBeHidden();
  await page.locator("#editor-decoration-color").fill("#44ddff");
  await page.locator("#editor-decoration-glow").fill("1.6");
  await page.locator("#editor-decoration-glow").press("Enter");

  await page.locator('[data-editor-asset="decoration.sculpture"]').click();
  await viewport.click({ position: { x: 560, y: 540 } });
  await expect(page.locator("#editor-object-count")).toHaveText("7");

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  await expect
    .poll(() => page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.arena))
    .toMatchObject({
      guidanceVisualCount: 2,
      guidanceColliderCount: 2,
      decorationVisualCount: 2,
      pointLightCount: 1,
    });

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("7");
});

test("ED portals: two linked endpoints teleport a vehicle without a re-entry loop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await page.locator('[data-editor-asset="travel.portal"]').click();
  await viewport.click({ position: { x: 435, y: 365 } });
  await page.locator("#editor-position-x").fill("-10");
  await page.locator("#editor-position-y").fill("2");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");

  await viewport.click({ position: { x: 755, y: 365 } });
  await page.locator("#editor-position-x").fill("10");
  await page.locator("#editor-position-y").fill("2");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-yaw").fill("180");
  await page.locator("#editor-yaw").press("Enter");
  await page.keyboard.press("Escape");

  await viewport.click({ position: { x: 150, y: 326 }, modifiers: ["Shift"] });
  await expect(page.locator("#editor-portal-link-panel")).toBeVisible();
  await expect(page.locator("#editor-link-portals-button")).toBeEnabled();
  await page.locator("#editor-link-portals-button").click();
  await expect(page.locator("#toast")).toContainText("Portals linked");
  await expect(page.locator("#editor-object-count")).toHaveText("4");

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  await expect
    .poll(() => page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.interactions.portals))
    .toMatchObject({ endpointCount: 2, pairCount: 1, sensorColliderCount: 2 });

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: -10, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 10 },
      angularVelocity: { x: 0, y: 1, z: 0 },
    });
  });
  const teleportedHandle = await page.waitForFunction(() => {
    const snapshot = window.__MINI_WHEELS_TEST__?.snapshot();
    return (snapshot?.interactions.portals.teleportCount ?? 0) === 1 ? snapshot : false;
  });
  const teleported = await teleportedHandle.jsonValue();
  expect(teleported).not.toBe(false);
  if (teleported === false || teleported === null || teleported === undefined) {
    throw new Error("The authored portal pair did not teleport the vehicle.");
  }
  expect(teleported.vehicle.x).toBeCloseTo(10, 1);
  expect(teleported.vehicle.linearVelocity.z).toBeLessThan(-5);
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(
      () => window.__MINI_WHEELS_TEST__?.snapshot()?.interactions.portals.teleportCount,
    ),
  ).toBe(1);

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("4");
});

test("ED no-code links: a button smoothly opens a door in Test Mode", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await page.locator('[data-editor-asset="interaction.button"]').click();
  await viewport.click({ position: { x: 430, y: 365 } });
  const buttonPosition = {
    x: Number(await page.locator("#editor-position-x").inputValue()),
    y: Number(await page.locator("#editor-position-y").inputValue()),
    z: Number(await page.locator("#editor-position-z").inputValue()),
  };

  await page.locator('[data-editor-asset="motion.door"]').click();
  await viewport.click({ position: { x: 700, y: 365 } });
  await page.keyboard.press("Escape");
  await viewport.click({ position: { x: 430, y: 365 } });
  await viewport.click({ position: { x: 700, y: 365 }, modifiers: ["Shift"] });
  await expect(page.locator("#editor-interaction-link-panel")).toBeVisible();
  await expect(page.locator("#editor-interaction-event")).toHaveValue("pressed");
  await expect(page.locator("#editor-interaction-action")).toHaveValue("open");
  await page.locator("#editor-add-interaction-link-button").click();
  await expect(page.locator("#toast")).toContainText("Interaction linked");
  await expect(page.locator("#editor-interaction-link-list")).toContainText("pressed → open");
  await expect(page.locator("#editor-object-count")).toHaveText("4");

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  const initialDoorY = await page.evaluate(
    () => window.__MINI_WHEELS_TEST__?.snapshot()?.movers.movingPlatforms[0]?.position.y ?? 0,
  );
  await page.evaluate((position) => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: position.x, y: position.y + 0.6, z: position.z },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  }, buttonPosition);
  await page.waitForFunction((startingY) => {
    const snapshot = window.__MINI_WHEELS_TEST__?.snapshot();
    return (
      (snapshot?.interactions.authored.activationCount ?? 0) === 1 &&
      (snapshot?.movers.movingPlatforms[0]?.position.y ?? startingY) > startingY + 0.5
    );
  }, initialDoorY);

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("4");
  await expect(page.locator("#editor-interaction-link-list")).toContainText("pressed → open");
});

test("ED tunnel: a vehicle drives through the open compound collider", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();

  await page.locator('[data-editor-asset="track.tunnel"]').click();
  await page.locator("#editor-viewport-chrome").click({ position: { x: 760, y: 300 } });
  await page.locator("#editor-position-x").fill("0");
  await page.locator("#editor-position-y").fill("2.475");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-yaw").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 0, y: 0.8, z: -9 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 14 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  });
  await page.keyboard.down("KeyW");
  const throughHandle = await page.waitForFunction(
    () => {
      const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
      return vehicle !== undefined && vehicle.z > 7 ? vehicle : false;
    },
    undefined,
    { polling: 10, timeout: 4_000 },
  );
  await page.keyboard.up("KeyW");
  const through = await throughHandle.jsonValue();

  expect(through).not.toBe(false);
  if (through === false) {
    throw new Error("The vehicle did not clear the authored tunnel.");
  }
  expect(Math.abs(through.x), JSON.stringify(through)).toBeLessThan(2.5);
  expect(through.y, JSON.stringify(through)).toBeLessThan(2);
  expect(through.recoveryCount).toBe(0);

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("3");
});

test("ED race sensors: checkpoint and finish gates never block the vehicle", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();

  for (const [assetId, z] of [
    ["race.checkpoint", "0"],
    ["race.finish-gate", "4"],
  ] as const) {
    await page.locator(`[data-editor-asset="${assetId}"]`).click();
    await page.locator("#editor-viewport-chrome").click({ position: { x: 760, y: 300 } });
    await page.locator("#editor-position-x").fill("0");
    await page.locator("#editor-position-y").fill("2");
    await page.locator("#editor-position-z").fill(z);
    await page.locator("#editor-yaw").fill("0");
    await page.locator("#editor-position-z").press("Enter");
  }
  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 0, y: 0.8, z: -6 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 14 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  });
  await page.keyboard.down("KeyW");
  const crossedHandle = await page.waitForFunction(
    () => {
      const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
      return vehicle !== undefined && vehicle.z > 7 ? vehicle : false;
    },
    undefined,
    { polling: 10, timeout: 4_000 },
  );
  await page.keyboard.up("KeyW");
  const crossed = await crossedHandle.jsonValue();

  expect(crossed).not.toBe(false);
  if (crossed === false) {
    throw new Error("The vehicle was blocked by an authored race sensor.");
  }
  expect(Math.abs(crossed.x), JSON.stringify(crossed)).toBeLessThan(2.5);
  expect(crossed.recoveryCount).toBe(0);

  await page.keyboard.press("KeyP");
  await page.locator("#return-menu-button").click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await expect(page.locator("#editor-object-count")).toHaveText("4");
});

test("ED recovery link: a volume recovers the car to its assigned safe pose", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await page.locator('[data-editor-asset="race.recovery-volume"]').click();
  await viewport.click({ position: { x: 435, y: 365 } });
  await page.locator("#editor-position-x").fill("-10");
  await page.locator("#editor-position-y").fill("1.5");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-position-z").press("Enter");

  await page.locator('[data-editor-asset="race.recovery-pose"]').click();
  await viewport.click({ position: { x: 755, y: 365 } });
  await page.locator("#editor-position-x").fill("10");
  await page.locator("#editor-position-y").fill("0.06");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-yaw").fill("90");
  await page.locator("#editor-yaw").press("Enter");
  await page.keyboard.press("Escape");

  await viewport.click({ position: { x: 150, y: 326 }, modifiers: ["Shift"] });
  await expect(page.locator("#editor-recovery-link-panel")).toBeVisible();
  await expect(page.locator("#editor-assign-recovery-pose-button")).toBeEnabled();
  await page.locator("#editor-assign-recovery-pose-button").click();
  await expect(page.locator("#toast")).toContainText("Safe recovery pose assigned");

  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: -10, y: 1.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 3, y: 0, z: 0 },
      angularVelocity: { x: 1, y: 1, z: 1 },
    });
  });
  const recoveredHandle = await page.waitForFunction(
    () => {
      const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
      return vehicle !== undefined && vehicle.recoveryCount > 0 ? vehicle : false;
    },
    undefined,
    { timeout: 3_000 },
  );
  const recovered = await recoveredHandle.jsonValue();
  expect(recovered).not.toBe(false);
  if (recovered === false) {
    throw new Error("The authored recovery volume did not recover the vehicle.");
  }
  expect(recovered.x).toBeCloseTo(10, 1);
  expect(recovered.y).toBeGreaterThan(0.8);
  expect(recovered.z).toBeCloseTo(0, 1);
  expect(recovered.speed).toBeLessThan(0.2);
  expect(recovered.recoveryProtectionSeconds).toBeGreaterThan(0.8);
  expect(
    Math.hypot(
      recovered.angularVelocity.x,
      recovered.angularVelocity.y,
      recovered.angularVelocity.z,
    ),
  ).toBeLessThan(0.2);
});

test("ED scored route: authored checkpoints gate finish progress in Test Mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();
  const viewport = page.locator("#editor-viewport-chrome");

  await viewport.click({ position: { x: 468, y: 326 } });
  await page.locator("#editor-position-z").fill("-15");
  await page.locator("#editor-position-z").press("Enter");

  const placeGate = async (assetId: "race.checkpoint" | "race.finish-gate", x: number) => {
    await page.locator(`[data-editor-asset="${assetId}"]`).click();
    await viewport.click({ position: { x: 468 + x * 33, y: 326 } });
    await page.locator("#editor-position-x").fill(String(x));
    await page.locator("#editor-position-y").fill("2");
    await page.locator("#editor-position-z").fill("0");
    await page.locator("#editor-yaw").fill("90");
    await page.locator("#editor-yaw").press("Enter");
  };

  await placeGate("race.checkpoint", -8);
  await page.locator("#editor-group-checkpoints-button").click();
  await page.keyboard.press("Escape");
  await placeGate("race.checkpoint", 0);
  await page.locator("#editor-group-checkpoints-button").click();
  await page.keyboard.press("Escape");
  await viewport.click({ position: { x: 204, y: 326 } });
  await viewport.click({ position: { x: 468, y: 326 }, modifiers: ["Shift"] });
  await expect(page.locator("#editor-link-route-button")).toBeEnabled();
  await page.locator("#editor-link-route-button").click();

  await placeGate("race.finish-gate", 8);
  await page.locator("#editor-race-mode").selectOption("point-to-point");
  await page.locator("#editor-finish-rule").selectOption("required-group");
  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  await page.waitForFunction(
    () => window.__MINI_WHEELS_TEST__?.snapshot()?.race.phase === "racing",
  );

  const teleportThrough = async (x: number) => {
    await page.evaluate((positionX) => {
      window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
        position: { x: positionX, y: 1, z: 0 },
        rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
        linearVelocity: { x: 6, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
      });
    }, x);
  };

  await teleportThrough(8);
  await page.waitForFunction(
    () => (window.__MINI_WHEELS_TEST__?.snapshot()?.race.players[0]?.invalidRouteCount ?? 0) > 0,
  );
  expect(await page.evaluate(() => window.__MINI_WHEELS_TEST__?.snapshot()?.race.finishCount)).toBe(
    0,
  );

  await teleportThrough(-8);
  await page.waitForFunction(
    () =>
      (window.__MINI_WHEELS_TEST__?.snapshot()?.race.players[0]?.completedGroupIds.length ?? 0) ===
      1,
  );
  await page.evaluate(() => window.__MINI_WHEELS_TEST__?.dropVehicle());
  await page.waitForFunction(() => {
    const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
    return (
      vehicle !== undefined &&
      vehicle.recoveryCount > 0 &&
      Math.abs(vehicle.x + 8) < 0.5 &&
      vehicle.recoveryProtectionSeconds > 0
    );
  });
  await teleportThrough(0);
  await page.waitForFunction(
    () =>
      (window.__MINI_WHEELS_TEST__?.snapshot()?.race.players[0]?.completedGroupIds.length ?? 0) ===
      2,
  );
  await teleportThrough(8);
  await page.waitForFunction(
    () => window.__MINI_WHEELS_TEST__?.snapshot()?.race.players[0]?.finished === true,
  );
  await expect(page.locator("#race-hud")).toContainText("FINISHED #1");
});

test("ED ramp: a vehicle climbs the solid authored slope instead of tunneling into it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-top-down-button").click();

  await page.locator('[data-editor-asset="track.ramp"]').click();
  await page.locator("#editor-viewport-chrome").click({ position: { x: 760, y: 300 } });
  await page.locator("#editor-position-x").fill("0");
  await page.locator("#editor-position-y").fill("1.6");
  await page.locator("#editor-position-z").fill("0");
  await page.locator("#editor-yaw").fill("0");
  await page.locator("#editor-position-z").press("Enter");
  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");

  await page.evaluate(() => {
    window.__MINI_WHEELS_TEST__?.setVehicleState(0, {
      position: { x: 0, y: 0.8, z: -5.5 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 13 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    });
  });
  await page.keyboard.down("KeyW");
  const climbHandle = await page.waitForFunction(
    () => {
      const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
      return vehicle !== undefined && vehicle.z > -1 && vehicle.y > 1.5 ? vehicle : false;
    },
    undefined,
    { polling: 10, timeout: 3_000 },
  );
  await page.keyboard.up("KeyW");
  const climbed = await climbHandle.jsonValue();

  expect(climbed).not.toBe(false);
  if (climbed === false) {
    throw new Error("The authored ramp climb was not captured.");
  }
  expect(climbed.z, JSON.stringify(climbed)).toBeGreaterThan(-1);
  expect(climbed.y, JSON.stringify(climbed)).toBeGreaterThan(1.5);
  expect(climbed.linearVelocity.z, JSON.stringify(climbed)).toBeGreaterThan(1);

  const airborneHandle = await page.waitForFunction(
    () => {
      const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
      return (vehicle?.airborneSeconds ?? 0) >= 0.18 ? vehicle : false;
    },
    undefined,
    { polling: 10, timeout: 3_000 },
  );
  const airborne = await airborneHandle.jsonValue();
  expect(airborne).not.toBe(false);
  if (airborne === false || airborne === undefined) {
    throw new Error("The authored ramp flight was not captured.");
  }
  expect(airborne.jumpLandingAssistCount).toBe(0);

  const landingHandle = await page.waitForFunction(
    () => {
      const vehicle = window.__MINI_WHEELS_TEST__?.snapshot()?.vehicle;
      return (vehicle?.jumpLandingAssistCount ?? 0) >= 3 && (vehicle?.upAxisY ?? -1) > 0.5
        ? vehicle
        : false;
    },
    undefined,
    { polling: 10, timeout: 4_000 },
  );
  const landing = await landingHandle.jsonValue();
  expect(landing).not.toBe(false);
  if (landing === false || landing === undefined) {
    throw new Error("The near-road jump landing assist was not captured.");
  }
  expect(landing.recoveryCount).toBe(0);
  expect(landing.upAxisY, JSON.stringify(landing)).toBeGreaterThan(0.5);
  expect(landing.speed, JSON.stringify(landing)).toBeGreaterThan(1);
});

test("ED precision: tutorial, snapping, box selection, direct transforms, and clipboard work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();

  await expect(page.locator("#editor-tutorial")).toBeVisible();
  await expect(page.locator("#editor-tutorial-instruction")).toHaveText("Move the camera.");
  await page.locator("#editor-tutorial-show-button").click();
  await expect(page.locator("#editor-tutorial")).toHaveClass(/is-demonstrating/);
  await page.locator("#editor-tutorial-skip-button").click();
  await expect(page.locator("#editor-tutorial")).toBeHidden();

  await page.locator("#editor-grid-snap").check();
  await page.locator("#editor-angle-snap").check();
  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();

  await page.locator('[data-editor-asset="floor.rectangle"]').click();
  await viewport.click({ position: { x: 360, y: 270 } });
  await viewport.click({ position: { x: 500, y: 360 } });
  await page.keyboard.press("Escape");
  await expect(page.locator("#editor-object-count")).toHaveText("4");
  const selectedX = Number(await page.locator("#editor-position-x").inputValue());
  const selectedZ = Number(await page.locator("#editor-position-z").inputValue());
  expect(Number.isInteger(selectedX)).toBe(true);
  expect(Number.isInteger(selectedZ)).toBe(true);

  await page.keyboard.down("Shift");
  await page.mouse.move(bounds!.x + 250, bounds!.y + 170);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 600, bounds!.y + 440, { steps: 8 });
  await expect(page.locator("#editor-selection-marquee")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.locator("#editor-multi-selection-panel")).toBeVisible();
  const selectedCount = Number(await page.locator("#editor-selected-count").textContent());
  expect(selectedCount).toBeGreaterThanOrEqual(2);

  await page.locator('[data-editor-transform="move"]').click();
  await page.mouse.move(bounds!.x + 500, bounds!.y + 360);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 555, bounds!.y + 390, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "aria-label",
    /Undo Move objects/,
  );

  const countBeforePaste = Number(await page.locator("#editor-object-count").textContent());
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.locator("#editor-object-count")).toHaveText(
    String(countBeforePaste + selectedCount),
  );
  await expect(page.locator("#editor-multi-selection-panel")).toBeVisible();
});

test("ED track: draws, reshapes globally, adds walls, extends, autosaves, and restores a spline road", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(bounds!.x + 240, bounds!.y + 310);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 380, bounds!.y + 250, { steps: 8 });
  await page.mouse.move(bounds!.x + 540, bounds!.y + 350, { steps: 8 });
  await page.mouse.move(bounds!.x + 700, bounds!.y + 290, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await expect(page.locator("#editor-track-panel")).toBeVisible();
  await expect(page.locator("#editor-track-width")).toHaveValue("6");
  await page.keyboard.press("Escape");
  await viewport.hover({ position: { x: 540, y: 350 } });
  await page.mouse.wheel(0, -100);
  await expect(page.locator("#editor-track-width")).toHaveValue("6.5");
  await page.waitForTimeout(350);

  await page.locator("#editor-track-elevation").fill("2");
  await page.locator("#editor-track-bank").fill("15");
  await page.locator("#editor-track-bank").press("Enter");
  await page.locator("#editor-track-wall-left").check();
  await page.locator("#editor-track-wall-right").check();
  await expect(page.locator("#editor-track-wall-left")).toBeChecked();
  await expect(page.locator("#editor-track-wall-right")).toBeChecked();

  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(bounds!.x + 700, bounds!.y + 290);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 810, bounds!.y + 390, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await page.keyboard.press("Escape");

  await expect(page.locator("#editor-save-status")).toHaveText("SAVED LOCALLY", {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "EDIT MAP" }).click();
  await expect(page.locator("#editor-object-count")).toHaveText("3");
});

test("ED wall brush: paints and erases an independent road range with one-step undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const start = { x: bounds!.x + 260, y: bounds!.y + 340 };
  const middle = { x: bounds!.x + 500, y: bounds!.y + 340 };
  const end = { x: bounds!.x + 740, y: bounds!.y + 340 };

  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y, { steps: 10 });
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();

  const paintLeft = page.locator('[data-editor-wall-brush="paint-left"]');
  await paintLeft.click();
  await expect(paintLeft).toHaveClass(/is-active/);
  await page.mouse.move(start.x + 70, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x - 70, end.y, { steps: 16 });
  await page.mouse.up();
  await expect(page.locator("#toast")).toContainText("Left wall range painted");
  await expect(page.locator("#editor-track-wall-left")).toBeChecked();
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "title",
    "Undo Paint track walls",
  );

  const erase = page.locator('[data-editor-wall-brush="erase-both"]');
  await erase.click();
  await page.mouse.move(middle.x - 45, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 45, middle.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#toast")).toContainText("Wall range erased");
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "title",
    "Undo Erase track walls",
  );
  if (visualEvidenceEnabled) {
    await page.screenshot({ path: "test-results/editor-wall-brush.png" });
  }

  await page.locator("#editor-undo-button").click();
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "title",
    "Undo Paint track walls",
  );

  const selectRange = page.locator("#editor-select-track-range-button");
  await selectRange.click();
  await expect(selectRange).toHaveClass(/is-active/);
  await page.mouse.move(middle.x - 65, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 65, middle.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator("#editor-track-range-panel")).toBeVisible();
  await expect(page.locator("#editor-track-range-length")).not.toHaveText("0 M");
  await page.locator("#editor-track-range-side").selectOption("left");
  await page.locator("#editor-track-range-style").selectOption("wall.sunset");
  await page.locator("#editor-track-range-wall-height").fill("2");
  await page.locator("#editor-track-range-wall-thickness").fill("0.35");
  await page.locator("#editor-apply-track-range-button").click();
  await expect(page.locator("#toast")).toContainText(
    "Wall style applied only inside the selected range",
  );
  await expect(page.locator("#editor-track-range-style")).toHaveValue("wall.sunset");
  await expect(page.locator("#editor-track-range-wall-height")).toHaveValue("2");
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "title",
    "Undo Style track wall range",
  );
  await page.locator("#editor-track-range-road-width").fill("9");
  await page.locator("#editor-track-range-road-bank").fill("18");
  await page.locator("#editor-track-range-road-material").selectOption("track.rainbow");
  await page.locator("#editor-track-range-road-surface").selectOption("boost");
  await expect(page.locator("#editor-track-range-road-strength-field")).toBeVisible();
  await expect(page.locator("#editor-track-range-road-cooldown-field")).toBeVisible();
  await page.locator("#editor-track-range-road-strength").fill("1.75");
  await page.locator("#editor-track-range-road-cooldown").fill("1.2");
  await page.locator("#editor-apply-track-road-range-button").click();
  await expect(page.locator("#toast")).toContainText("Road style eased into the selected range");
  await expect(page.locator("#editor-track-range-road-width")).toHaveValue("9");
  await expect(page.locator("#editor-track-range-road-material")).toHaveValue("track.rainbow");
  await expect(page.locator("#editor-track-range-road-strength")).toHaveValue("1.75");
  await expect(page.locator("#editor-track-range-road-cooldown")).toHaveValue("1.2");
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "title",
    "Undo Style road range",
  );
  if (visualEvidenceEnabled) {
    await page.screenshot({ path: "test-results/editor-wall-range-style.png" });
  }
  await page.locator("#editor-test-button").click();
  await page.waitForFunction(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state === "playing");
  expect(await page.evaluate(() => window.__MINI_WHEELS_TEST__?.appSnapshot().state)).toBe(
    "playing",
  );
});

test("ED track points: selects, drags, edits, inserts, removes, and undoes a control point", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const start = { x: bounds!.x + 300, y: bounds!.y + 330 };
  const bend = { x: bounds!.x + 500, y: bounds!.y + 245 };
  const end = { x: bounds!.x + 700, y: bounds!.y + 335 };

  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(bend.x, bend.y, { steps: 10 });
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await page.mouse.click(end.x, end.y);
  await expect(page.locator("#editor-track-node-panel")).toBeVisible();
  await expect(page.locator("#editor-track-node-index")).toContainText("OF");

  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(end.x + 55, end.y - 25, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "aria-label",
    /Undo Move track point/,
  );

  await page.locator("#editor-track-node-y").fill("3");
  await page.locator("#editor-track-node-width").fill("7.5");
  await page.locator("#editor-track-node-bank").fill("12.5");
  await page.locator("#editor-track-node-bank").press("Enter");
  await expect(page.locator("#editor-track-node-y")).toHaveValue("3");
  await expect(page.locator("#editor-track-node-width")).toHaveValue("7.5");

  const beforeInsert = await page.locator("#editor-track-node-index").textContent();
  const beforeTotal = Number(beforeInsert?.split(" OF ")[1]);
  await page.locator("#editor-insert-track-node-button").click();
  await expect(page.locator("#editor-track-node-index")).toContainText(
    `OF ${String(beforeTotal + 1)}`,
  );
  await page.locator("#editor-delete-track-node-button").click();
  await expect(page.locator("#editor-track-node-index")).toContainText(`OF ${String(beforeTotal)}`);
});

test("ED split track: a middle point becomes two reconnectable open ends", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const points = [
    { x: bounds!.x + 250, y: bounds!.y + 360 },
    { x: bounds!.x + 370, y: bounds!.y + 225 },
    { x: bounds!.x + 500, y: bounds!.y + 360 },
    { x: bounds!.x + 630, y: bounds!.y + 225 },
    { x: bounds!.x + 750, y: bounds!.y + 360 },
  ];

  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    await page.mouse.move(point.x, point.y, { steps: 8 });
  }
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await page.mouse.click(points[2]!.x, points[2]!.y);
  await expect(page.locator("#editor-track-node-panel")).toBeVisible();
  await expect(page.locator("#editor-track-node-kind")).toHaveText("CONTROL POINT");
  await expect(page.locator("#editor-split-track-button")).toBeVisible();
  await page.locator("#editor-split-track-button").click();

  await expect(page.locator("#toast")).toHaveText(
    "Track split into two roads. Both new ends are ready to reconnect.",
  );
  await expect(page.locator("#editor-object-count")).toHaveText("4");
  await expect(page.locator("#editor-track-node-kind")).toHaveText("OPEN END");
  await expect(page.locator("#editor-split-track-button")).toBeHidden();
  await expect(page.locator("#editor-undo-button")).toHaveAttribute("title", "Undo Split track");
  if (visualEvidenceEnabled) {
    await page.screenshot({ path: "test-results/editor-track-split.png" });
  }

  await page.locator("#editor-undo-button").click();
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await expect(page.locator("#editor-track-node-kind")).toHaveText("CONTROL POINT");
});

test("ED curve handles: tangents reshape the road, support vertical shaping, and reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const start = { x: bounds!.x + 300, y: bounds!.y + 340 };
  const middle = { x: bounds!.x + 500, y: bounds!.y + 250 };
  const end = { x: bounds!.x + 700, y: bounds!.y + 340 };
  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await page.mouse.click(middle.x, middle.y);
  await expect(page.locator("#editor-track-node-panel")).toBeVisible();
  await expect(page.locator("#editor-reset-track-tangent-button")).toBeVisible();

  const outgoing = { x: middle.x + (end.x - start.x) / 3, y: middle.y };
  const incoming = { x: middle.x - (end.x - start.x) / 3, y: middle.y };
  await page.mouse.move(incoming.x, incoming.y);
  await expect(page.locator("#editor-hover-label")).toContainText("CURVE HANDLE");
  await page.mouse.move(outgoing.x, outgoing.y);
  await expect(page.locator("#editor-hover-label")).toContainText("CURVE HANDLE");
  await page.mouse.down();
  await page.mouse.move(outgoing.x + 25, outgoing.y + 80, { steps: 5 });
  await page.mouse.up();
  await page.mouse.move(incoming.x, incoming.y);
  await expect(page.locator("#editor-hover-label")).toContainText("CURVE HANDLE");
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "aria-label",
    /Undo Shape track curve/,
  );

  await page.locator("#editor-reset-track-tangent-button").click();
  await expect(page.locator("#editor-undo-button")).toHaveAttribute(
    "aria-label",
    /Undo Reset track curve/,
  );

  await page.mouse.move(outgoing.x, outgoing.y);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(outgoing.x, outgoing.y - 55, { steps: 4 });
  await expect(page.locator("#editor-wheel-hud")).toContainText("CURVE HEIGHT");
  await page.keyboard.up("Shift");
  await page.mouse.up();
  if (visualEvidenceEnabled) {
    await page.screenshot({ path: "test-results/editor-curve-handles.png" });
  }
});

test("ED viewport: zoom stays available while selected and hover picks the visible object", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const center = { x: bounds!.width / 2, y: bounds!.height / 2 };

  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(bounds!.x + center.x - 140, bounds!.y + center.y);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + center.x + 140, bounds!.y + center.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await viewport.hover({ position: center });
  await expect(page.locator("#editor-hover-label")).toHaveText("HOVER · START LINE");
  await viewport.click({ position: center });
  await expect(page.locator("#editor-selected-name")).toHaveText("START LINE");

  await viewport.hover({ position: center });
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, 240);
  await page.keyboard.up("Alt");
  await expect(page.locator("#editor-zoom-slider")).not.toHaveValue("1");

  await page.locator("#editor-zoom-slider").evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = "0.15";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#editor-zoom-output")).toHaveText("15%");
  await expect(page.locator("#editor-selected-name")).toHaveText("START LINE");
});

test("ED endpoints: either end magnetically bridges into one wall-safe loop", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  await page.locator("#editor-grid-snap").check();
  await page.locator("#editor-angle-snap").check();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const centerX = bounds!.x + bounds!.width * 0.54;
  const centerY = bounds!.y + bounds!.height * 0.5;
  const start = { x: centerX - 230, y: centerY - 105 };
  const end = { x: centerX - 230, y: centerY + 105 };

  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of [
    { x: centerX - 120, y: centerY - 190 },
    { x: centerX + 90, y: centerY - 185 },
    { x: centerX + 250, y: centerY - 80 },
    { x: centerX + 245, y: centerY + 90 },
    { x: centerX + 70, y: centerY + 185 },
    { x: centerX - 130, y: centerY + 175 },
    end,
  ]) {
    await page.mouse.move(point.x, point.y, { steps: 3 });
  }
  await page.mouse.up();
  await page.locator("#editor-track-wall-left").check();
  await page.locator("#editor-track-wall-right").check();

  await page.mouse.move(start.x + 3, start.y + 2);
  await page.mouse.down();
  for (const point of [
    { x: centerX - 315, y: centerY - 55 },
    { x: centerX - 330, y: centerY },
    { x: centerX - 310, y: centerY + 60 },
    { x: end.x + 2, y: end.y - 2 },
  ]) {
    await page.mouse.move(point.x, point.y, { steps: 3 });
  }
  await page.mouse.up();

  await expect(page.locator("#toast")).toHaveText("Track loop connected smoothly.");
  await expect(page.locator("#editor-track-panel")).toHaveAttribute("data-track-closed", "true");
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  await expect(page.locator("#editor-track-wall-left")).toBeChecked();
  await expect(page.locator("#editor-track-wall-right")).toBeChecked();
  await page.locator("#editor-smooth-track-button").click();
  await expect(page.locator("#toast")).toHaveText("Track curves smoothed. Undo is available.");
  await expect(page.locator("#editor-undo-button")).toHaveAttribute("title", "Undo Smooth track");
  if (visualEvidenceEnabled) {
    await page.screenshot({ path: "test-results/editor-track-endpoint-join.png" });
  }
});

test("ED layers: an endpoint extension eases toward the chosen new height", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const y = bounds!.y + bounds!.height * 0.52;
  const start = { x: bounds!.x + bounds!.width * 0.28, y };
  const end = { x: bounds!.x + bounds!.width * 0.52, y };

  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await page.locator("#editor-track-tool-button").click();
  await viewport.hover();
  await page.keyboard.down("Shift");
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, -100);
  }
  await page.keyboard.up("Shift");

  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.76, y - 40, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator("#toast")).toHaveText("Track extended smoothly.");
  const averageElevation = Number(await page.locator("#editor-track-elevation").inputValue());
  expect(averageElevation).toBeGreaterThan(0.25);
  expect(averageElevation).toBeLessThan(2);
  if (visualEvidenceEnabled) {
    await page.screenshot({ path: "test-results/editor-track-layer-ramp.png" });
  }
});

test("ED endpoint pins: inspect height and connect a ground stroke to an elevated end", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();

  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const highStart = {
    x: bounds!.x + bounds!.width * 0.58,
    y: bounds!.y + bounds!.height * 0.42,
  };
  const highEnd = {
    x: bounds!.x + bounds!.width * 0.76,
    y: bounds!.y + bounds!.height * 0.42,
  };

  await page.locator("#editor-track-tool-button").click();
  await viewport.hover();
  await page.keyboard.down("Shift");
  for (let index = 0; index < 12; index += 1) {
    await page.mouse.wheel(0, -100);
  }
  await page.keyboard.up("Shift");
  await page.mouse.move(highStart.x, highStart.y);
  await page.mouse.down();
  await page.mouse.move(highEnd.x, highEnd.y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.press("Escape");

  let endpointScreen: { x: number; y: number } | null = null;
  for (const deltaY of [-100, -90, -110, -80, -120, -70, -130]) {
    for (const deltaX of [0, -10, 10, -20, 20, -30, 30]) {
      await page.mouse.move(highEnd.x + deltaX, highEnd.y + deltaY);
      if ((await page.locator("#editor-hover-label").textContent())?.includes("OPEN TRACK END")) {
        endpointScreen = { x: highEnd.x + deltaX, y: highEnd.y + deltaY };
        break;
      }
    }
  }
  expect(endpointScreen).not.toBeNull();
  await page.mouse.click(endpointScreen!.x, endpointScreen!.y);
  await expect(page.locator("#editor-track-node-panel")).toBeVisible();
  await expect(page.locator("#editor-track-node-kind")).toContainText("OPEN");
  const endpointHeight = Number(await page.locator("#editor-track-node-y").inputValue());
  expect(endpointHeight).toBeGreaterThan(2);
  await expect(page.locator("#editor-track-node-help")).toContainText("ready to connect");

  await page.locator("#editor-track-tool-button").click();
  await viewport.hover();
  await page.keyboard.down("Shift");
  for (let index = 0; index < 12; index += 1) {
    await page.mouse.wheel(0, 100);
  }
  await page.keyboard.up("Shift");
  const groundStart = {
    x: bounds!.x + bounds!.width * 0.28,
    y: bounds!.y + bounds!.height * 0.63,
  };
  await page.mouse.move(groundStart.x, groundStart.y);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.46, groundStart.y - 20, { steps: 8 });
  await page.mouse.move(endpointScreen!.x, endpointScreen!.y, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator("#toast")).toHaveText(
    "New road connected with a smooth height transition.",
  );
  await expect(page.locator("#editor-object-count")).toHaveText("3");
  const joinedAverage = Number(await page.locator("#editor-track-elevation").inputValue());
  expect(joinedAverage).toBeGreaterThan(0);
  expect(joinedAverage).toBeLessThan(endpointHeight);
  if (visualEvidenceEnabled) {
    await page.screenshot({ path: "test-results/editor-elevated-endpoint-join.png" });
  }
});

test("VIS-EDITOR-001: captures the editor authoring workspace", async ({ page }) => {
  test.skip(!visualEvidenceEnabled, "Run with --visual to capture editor evidence.");
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await expect(page.locator("#screen-editor")).toBeVisible();
  await page.locator('[data-editor-asset="floor.rectangle"]').click();
  await page.locator("#editor-viewport-chrome").click({ position: { x: 360, y: 270 } });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "test-results/editor-authoring.png" });
});

test("VIS-EDITOR-TRACK-001: captures spline and wall authoring", async ({ page }) => {
  test.skip(!visualEvidenceEnabled, "Run with --visual to capture editor evidence.");
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.locator("#editor-grid-snap").check();
  await page.locator("#editor-angle-snap").check();
  await page.locator("#editor-track-tool-button").click();
  const centerX = bounds!.x + bounds!.width * 0.5;
  const centerY = bounds!.y + bounds!.height * 0.5;
  const radiusX = Math.min(330, bounds!.width * 0.34);
  const radiusY = Math.min(210, bounds!.height * 0.3);
  await page.mouse.move(centerX + radiusX, centerY);
  await page.mouse.down();
  for (let index = 1; index <= 48; index += 1) {
    const angle = (index / 50) * Math.PI * 2;
    await page.mouse.move(centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY);
  }
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.locator("#editor-track-bank").fill("35");
  await page.locator("#editor-track-bank").press("Enter");
  await page.locator("#editor-track-wall-left").check();
  await page.locator("#editor-track-wall-right").check();
  await page.screenshot({ path: "test-results/editor-track-authoring.png" });
});

test("VIS-EDITOR-BANK-001: banked road stays above its floor", async ({ page }) => {
  test.skip(!visualEvidenceEnabled, "Run with --visual to capture editor evidence.");
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const centerX = bounds!.x + bounds!.width * 0.5;
  const centerY = bounds!.y + bounds!.height * 0.5;
  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(centerX - 330, centerY + 110);
  await page.mouse.down();
  await page.mouse.move(centerX - 110, centerY - 90);
  await page.mouse.move(centerX + 120, centerY + 70);
  await page.mouse.move(centerX + 340, centerY - 110);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.locator("#editor-track-bank").fill("35");
  await page.locator("#editor-track-bank").press("Enter");
  await page.locator("#editor-track-wall-left").check();
  await page.locator("#editor-track-wall-right").check();
  await page.screenshot({ path: "test-results/editor-track-bank-raised.png" });
});

test("VIS-EDITOR-WALL-SMOOTH-001: captures a cleaned tight hairpin", async ({ page }) => {
  test.skip(!visualEvidenceEnabled, "Run with --visual to capture editor evidence.");
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: /create/i }).click();
  await page.getByRole("button", { name: /new playground/i }).click();
  await page.locator("#editor-tutorial-skip-button").click();
  const viewport = page.locator("#editor-viewport-chrome");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const centerX = bounds!.x + bounds!.width * 0.5;
  const centerY = bounds!.y + bounds!.height * 0.5;
  await page.locator("#editor-track-tool-button").click();
  await page.mouse.move(centerX - 330, centerY - 150);
  await page.mouse.down();
  for (const point of [
    { x: centerX + 210, y: centerY - 150 },
    { x: centerX + 300, y: centerY - 60 },
    { x: centerX + 280, y: centerY + 100 },
    { x: centerX + 170, y: centerY + 155 },
    { x: centerX - 120, y: centerY + 145 },
    { x: centerX - 190, y: centerY + 90 },
    { x: centerX - 185, y: centerY + 15 },
    { x: centerX - 135, y: centerY - 20 },
    { x: centerX - 85, y: centerY + 12 },
    { x: centerX - 90, y: centerY + 75 },
    { x: centerX - 145, y: centerY + 105 },
    { x: centerX - 220, y: centerY + 80 },
  ]) {
    await page.mouse.move(point.x, point.y, { steps: 3 });
  }
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.locator("#editor-track-wall-left").check();
  await page.locator("#editor-track-wall-right").check();
  await page.locator("#editor-smooth-track-button").click();
  await page.locator("#editor-top-down-button").click();
  await page.screenshot({ path: "test-results/editor-track-wall-smooth.png" });
});
