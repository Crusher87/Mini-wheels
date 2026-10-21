import { expect, test, type Page } from "@playwright/test";

interface SyntheticMenuPadApi {
  setButton(buttonIndex: number, pressed: boolean): void;
}

async function activate(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();
}

async function installSyntheticMenuPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const gamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: "Synthetic Menu Pad",
      index: 0,
      mapping: "standard",
      timestamp: 0,
      vibrationActuator: null,
    } as unknown as Gamepad;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    Object.defineProperty(window, "__SYNTHETIC_MENU_PAD__", {
      configurable: true,
      value: {
        setButton(buttonIndex: number, pressed: boolean) {
          const button = buttons[buttonIndex];
          if (button !== undefined) {
            button.pressed = pressed;
            button.touched = pressed;
            button.value = Number(pressed);
          }
        },
      } satisfies SyntheticMenuPadApi,
    });
  });
}

async function setMenuPadButton(page: Page, buttonIndex: number, pressed: boolean): Promise<void> {
  await page.evaluate(
    ({ index, value }) => {
      (
        window as unknown as Window & {
          __SYNTHETIC_MENU_PAD__: SyntheticMenuPadApi;
        }
      ).__SYNTHETIC_MENU_PAD__.setButton(index, value);
    },
    { index: buttonIndex, value: pressed },
  );
}

test("UI-001/002: keyboard navigation escapes every panel and unfinished modes stay disabled", async ({
  page,
}) => {
  await activate(page);

  await expect(page.getByRole("button", { name: "PLAY", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /players/i })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "PLAYERS" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();

  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await expect(page.getByRole("button", { name: /sandbox/i })).toBeEnabled();
  for (const mode of ["INFECTED", "ICE AGE", "ICE DIAMONDS", "STONE HEDGE"]) {
    await expect(page.getByRole("button", { name: new RegExp(mode, "i") })).toBeDisabled();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();

  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await expect(page.locator("#screen-loading")).toBeHidden();
  await page.keyboard.press("p");
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#screen-pause")).toBeHidden();
});

test("UI-007/A11Y: Mini Wheels branding and 150% layouts stay inside their panels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await activate(page);
  await page.getByRole("button", { name: /options/i }).click();
  await page.locator("#ui-scale").fill("1.5");
  await page.reload();

  await expect(page).toHaveTitle("Mini Wheels — Physics Sandbox");
  await expect(page.locator("#screen-activation h1")).toHaveText(/MINI\s*WHEELS/);
  expect(
    await page.locator("#screen-activation").evaluate((screen) => {
      const card = screen.querySelector(".activation-card");
      const heading = screen.querySelector("h1");
      if (!(card instanceof HTMLElement) || !(heading instanceof HTMLElement)) {
        return false;
      }
      const parent = card.getBoundingClientRect();
      const child = heading.getBoundingClientRect();
      return child.left >= parent.left - 1 && child.right <= parent.right + 1;
    }),
  ).toBe(true);

  await page.getByRole("button", { name: /start engine/i }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  expect(
    await page.locator("#screen-modes").evaluate((screen) => {
      const titles = [...screen.querySelectorAll(".mode-card strong")];
      return (
        screen.scrollWidth <= screen.clientWidth + 1 &&
        titles.every((title) => {
          const card = title.closest(".mode-card");
          if (!(card instanceof HTMLElement)) {
            return false;
          }
          const parent = card.getBoundingClientRect();
          const child = title.getBoundingClientRect();
          return child.left >= parent.left - 1 && child.right <= parent.right + 1;
        })
      );
    }),
  ).toBe(true);

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /players/i }).click();
  expect(
    await page.locator("#screen-players").evaluate((screen) => {
      const screenRect = screen.getBoundingClientRect();
      const cards = [...screen.querySelectorAll(".setting-card")];
      return (
        screen.scrollWidth <= screen.clientWidth + 1 &&
        cards.every((card) => {
          const rect = card.getBoundingClientRect();
          return rect.left >= screenRect.left - 1 && rect.right <= screenRect.right + 1;
        })
      );
    }),
  ).toBe(true);

  await page.setViewportSize({ width: 843, height: 813 });
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await expect(page.locator("#screen-loading")).toBeHidden();
  await page.keyboard.press("p");
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  expect(
    await page.locator("#screen-pause").evaluate((screen) => {
      const card = screen.querySelector(".pause-card");
      const markers = document.querySelector(".player-markers");
      const ui = document.querySelector(".ui-layer");
      if (
        !(card instanceof HTMLElement) ||
        !(markers instanceof HTMLElement) ||
        !(ui instanceof HTMLElement)
      ) {
        return false;
      }
      const cardRect = card.getBoundingClientRect();
      const controls = [...card.querySelectorAll<HTMLElement>("h2, button")].map((element) =>
        element.getBoundingClientRect(),
      );
      return (
        card.scrollWidth <= card.clientWidth + 1 &&
        controls.every(
          (rect) => rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1,
        ) &&
        Number.parseInt(getComputedStyle(markers).zIndex, 10) <
          Number.parseInt(getComputedStyle(ui).zIndex, 10)
      );
    }),
  ).toBe(true);
});

test("A11Y/Profile B: every v4 option applies semantic presentation hooks and resets", async ({
  page,
}) => {
  await activate(page);
  await page.getByRole("button", { name: /options/i }).click();

  await expect(page.getByRole("group", { name: "DISPLAY & GRAPHICS" })).toBeVisible();
  await expect(page.getByRole("group", { name: "INTERFACE & MOTION" })).toBeVisible();
  await expect(page.getByRole("group", { name: "CONTROLLER RESPONSE" })).toBeVisible();
  await expect(page.getByRole("group", { name: "AUDIO" })).toBeVisible();

  await page.locator("#fullscreen-preference").check();
  await page.locator("#ui-scale").fill("1.4");
  await page.locator("#marker-size").selectOption("large");
  await page.locator("#analog-dead-zone").fill("0.25");
  await page.locator("#analog-sensitivity").fill("1.5");
  await page.locator("#master-volume").fill("0.55");
  await page.locator("#effects-volume").fill("0.65");
  await page.locator("#music-volume").fill("0.35");
  await page.locator("#reduced-motion").check();
  await page.locator("#camera-smoothing").selectOption("instant");
  await page.locator("#particle-density").selectOption("off");
  await page.locator("#high-contrast-interactables").check();
  await page.locator("#automatic-upright-recovery").check();

  await expect(page.locator("#ui-scale-output")).toHaveText("140%");
  await expect(page.locator("#analog-dead-zone-output")).toHaveText("25%");
  await expect(page.locator("#analog-sensitivity-output")).toHaveText("1.50×");
  await expect(page.locator("#game-root")).toHaveAttribute("data-marker-size", "large");
  await expect(page.locator("#game-root")).toHaveAttribute("data-reduced-motion", "true");
  await expect(page.locator("#game-root")).toHaveAttribute("data-camera-smoothing", "instant");
  await expect(page.locator("#game-root")).toHaveAttribute("data-particle-density", "off");
  await expect(page.locator("#game-root")).toHaveAttribute(
    "data-high-contrast-interactables",
    "true",
  );
  await expect(page.locator("#game-root")).toHaveAttribute(
    "data-automatic-upright-recovery",
    "true",
  );

  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem("mini-wheels.settings");
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
  });
  expect(persisted).toMatchObject({
    schemaVersion: 4,
    fullscreenPreference: true,
    uiScale: 1.4,
    markerSize: "large",
    analogDeadZone: 0.25,
    analogSensitivity: 1.5,
    masterVolume: 0.55,
    effectsVolume: 0.65,
    musicVolume: 0.35,
    reducedMotion: true,
    cameraSmoothing: "instant",
    particleDensity: "off",
    highContrastInteractables: true,
    automaticUprightRecovery: true,
  });

  await page.getByRole("button", { name: /reset defaults/i }).click();
  await expect(page.locator("#ui-scale-output")).toHaveText("100%");
  await expect(page.locator("#marker-size")).toHaveValue("medium");
  await expect(page.locator("#game-root")).toHaveAttribute("data-marker-size", "medium");
  await expect(page.locator("#game-root")).toHaveAttribute(
    "data-high-contrast-interactables",
    "false",
  );
});

test("UI-001: a standard controller activates, navigates, confirms, and cancels", async ({
  page,
}) => {
  await installSyntheticMenuPad(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /start engine/i })).toBeVisible();

  await setMenuPadButton(page, 0, true);
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  await setMenuPadButton(page, 0, false);
  await page.waitForTimeout(50);

  await setMenuPadButton(page, 13, true);
  await expect(page.getByRole("button", { name: /players/i })).toBeFocused();
  await setMenuPadButton(page, 13, false);
  await page.waitForTimeout(50);

  await setMenuPadButton(page, 0, true);
  await expect(page.getByRole("heading", { name: "PLAYERS" })).toBeVisible();
  await setMenuPadButton(page, 0, false);
  await page.waitForTimeout(50);

  await setMenuPadButton(page, 1, true);
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  await setMenuPadButton(page, 1, false);
  await page.waitForTimeout(50);
});
