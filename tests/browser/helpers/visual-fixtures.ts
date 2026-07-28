import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { waitForPlaying } from "./game-state";

export interface VisualFixtureDefinition {
  readonly id:
    | "ref-6006-portals"
    | "ref-6007-platform"
    | "ref-6008-close-approach"
    | "ref-6009-ramp-launch"
    | "ref-6010-cube-impact"
    | "ref-6011-ten-player";
  readonly referenceFile: string;
  readonly outputFile: string;
  readonly seed: number;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  /**
   * A test-only crop around the normal shared camera. The production camera
   * still enforces its documented minimum orthographic half-height.
   */
  readonly canvasZoom: number;
}

export const VISUAL_FIXTURES = Object.freeze({
  portals: Object.freeze({
    id: "ref-6006-portals",
    referenceFile: "1000006006.png",
    outputFile: "1000006006-portals-current.png",
    seed: 6006,
    viewport: Object.freeze({ width: 1536, height: 1039 }),
    canvasZoom: 1.25,
  }),
  platform: Object.freeze({
    id: "ref-6007-platform",
    referenceFile: "1000006007.png",
    outputFile: "1000006007-platform-current.png",
    seed: 6007,
    viewport: Object.freeze({ width: 1536, height: 1023 }),
    canvasZoom: 2.7,
  }),
  closeApproach: Object.freeze({
    id: "ref-6008-close-approach",
    referenceFile: "1000006008.png",
    outputFile: "1000006008-pristine-cubes-current.png",
    seed: 6008,
    viewport: Object.freeze({ width: 1536, height: 1023 }),
    canvasZoom: 2.05,
  }),
  rampLaunch: Object.freeze({
    id: "ref-6009-ramp-launch",
    referenceFile: "1000006009.png",
    outputFile: "1000006009-ramp-launch-current.png",
    seed: 6009,
    viewport: Object.freeze({ width: 1536, height: 863 }),
    canvasZoom: 2,
  }),
  cubeImpact: Object.freeze({
    id: "ref-6010-cube-impact",
    referenceFile: "1000006010.png",
    outputFile: "1000006010-cube-impact-current.png",
    seed: 6010,
    viewport: Object.freeze({ width: 1536, height: 863 }),
    canvasZoom: 1.85,
  }),
  tenPlayer: Object.freeze({
    id: "ref-6011-ten-player",
    referenceFile: "1000006011.png",
    outputFile: "1000006011-ten-player-current.png",
    seed: 6011,
    viewport: Object.freeze({ width: 1536, height: 863 }),
    canvasZoom: 1.6,
  }),
} satisfies Record<string, VisualFixtureDefinition>);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const VISUAL_EVIDENCE_DIRECTORY = path.join(
  projectRoot,
  "docs",
  "visual-evidence",
  "current-render",
);

interface CapturePresentation {
  readonly canvasZoom: number;
  readonly grayscale?: boolean;
  readonly showMarkers?: boolean;
}

export async function startVisualSandbox(
  page: Page,
  fixture: VisualFixtureDefinition,
  playerCount = 1,
): Promise<void> {
  await page.setViewportSize(fixture.viewport);
  await page.goto("/");
  await page.getByRole("button", { name: /start engine/i }).click();

  await page.getByRole("button", { name: /options/i }).click();
  await page.locator("#render-scale").selectOption("1");
  await page.locator("#aa-quality").selectOption("smaa");
  await page.locator("#shadow-quality").selectOption("medium");
  await page.locator("#ambient-occlusion").check();
  await page.locator("#vignette").check();
  await page.locator("#camera-smoothing").selectOption("instant");
  await page.locator("#particle-density").selectOption("full");
  await page.getByRole("button", { name: "Back" }).click();

  if (playerCount !== 1) {
    await page.getByRole("button", { name: /players/i }).click();
    await page.getByLabel("ACTIVE PLAYERS").fill(String(playerCount));
    await page.getByRole("button", { name: "Back" }).click();
  }

  await page.getByRole("button", { name: "PLAY", exact: true }).click();
  await page.getByRole("button", { name: /sandbox/i }).click();
  await waitForPlaying(page, playerCount);
  await page.waitForFunction(() => {
    const render = window.__TINY_TRACTION_TEST__?.renderSnapshot();
    return (
      render !== null &&
      render !== undefined &&
      render.postProcessing.internalSize.effectivePixelRatio === 1 &&
      render.postProcessing.passes.find((pass) => pass.name === "ambient-occlusion")?.enabled ===
        true &&
      render.postProcessing.passes.find((pass) => pass.name === "vignette")?.enabled === true &&
      render.postProcessing.passes.find((pass) => pass.name === "smaa")?.enabled === true
    );
  });
}

export async function pauseVisualFixture(page: Page): Promise<void> {
  const state = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.state());
  if (state === "playing") {
    await page.keyboard.press("p");
    await page.waitForFunction(() => window.__TINY_TRACTION_TEST__?.state() === "paused");
  }
}

export async function waitForRenderedFrames(page: Page, frameCount = 3): Promise<void> {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, frameCount);
}

export async function captureVisualFixture(
  page: Page,
  fixture: VisualFixtureDefinition,
  presentation: Omit<CapturePresentation, "canvasZoom"> = {},
  outputFile = fixture.outputFile,
): Promise<Buffer> {
  await setCapturePresentation(page, {
    canvasZoom: fixture.canvasZoom,
    ...presentation,
  });
  await waitForRenderedFrames(page);
  await mkdir(VISUAL_EVIDENCE_DIRECTORY, { recursive: true });
  const screenshot = await page.screenshot({
    animations: "disabled",
    path: path.join(VISUAL_EVIDENCE_DIRECTORY, outputFile),
  });
  assertPngDimensions(screenshot, fixture.viewport);
  return screenshot;
}

export function yawQuaternion(yawRadians: number): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
} {
  return {
    x: 0,
    y: Math.sin(yawRadians / 2),
    z: 0,
    w: Math.cos(yawRadians / 2),
  };
}

async function setCapturePresentation(
  page: Page,
  presentation: CapturePresentation,
): Promise<void> {
  await page.evaluate(({ canvasZoom, grayscale, showMarkers }) => {
    const canvas = document.getElementById("game-canvas");
    const markers = document.getElementById("player-markers");
    const ui = document.querySelector<HTMLElement>(".ui-layer");
    const root = document.querySelector<HTMLElement>(".game-root");

    if (
      !(canvas instanceof HTMLCanvasElement) ||
      markers === null ||
      ui === null ||
      root === null
    ) {
      throw new Error("The visual-capture surface is incomplete.");
    }

    ui.style.setProperty("display", "none", "important");
    markers.style.setProperty("display", showMarkers === true ? "block" : "none", "important");
    canvas.style.transformOrigin = "50% 50%";
    canvas.style.transform = `scale(${String(canvasZoom)})`;
    markers.style.transformOrigin = "50% 50%";
    markers.style.transform = showMarkers === true ? `scale(${String(canvasZoom)})` : "none";
    root.style.filter = grayscale === true ? "grayscale(1) contrast(1.08)" : "none";
  }, presentation);
}

function assertPngDimensions(
  screenshot: Buffer,
  expected: { readonly width: number; readonly height: number },
): void {
  const pngSignature = "89504e470d0a1a0a";
  if (screenshot.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error("Visual evidence was not encoded as PNG.");
  }
  const width = screenshot.readUInt32BE(16);
  const height = screenshot.readUInt32BE(20);
  if (width !== expected.width || height !== expected.height) {
    throw new Error(
      `Expected a ${String(expected.width)}x${String(expected.height)} PNG, received ${String(width)}x${String(height)}.`,
    );
  }
}
