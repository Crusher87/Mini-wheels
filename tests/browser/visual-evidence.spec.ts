import { expect, test } from "@playwright/test";
import {
  VISUAL_FIXTURES,
  captureVisualFixture,
  pauseVisualFixture,
  startVisualSandbox,
  waitForRenderedFrames,
  yawQuaternion,
} from "./helpers/visual-fixtures";

test.skip(
  process.env["PW_VISUAL_EVIDENCE"] !== "1",
  "Visual evidence runs separately at native presentation quality.",
);

test.describe("VIS-001–008 current-render evidence", () => {
  test.describe.configure({ timeout: 120_000 });

  test("captures the horizontal/upright portal composition", async ({ page }) => {
    const fixture = VISUAL_FIXTURES.portals;
    await startVisualSandbox(page, fixture);
    await page.evaluate(() =>
      window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
        position: { x: 27.8, y: 0.75, z: -29.8 },
      }),
    );
    await pauseVisualFixture(page);

    const screenshot = await captureVisualFixture(page, fixture);
    const snapshot = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
    expect(screenshot.byteLength).toBeGreaterThan(20_000);
    expect(snapshot?.interactions.portals.endpoints).toHaveLength(4);
  });

  test("captures P1 settled on the elevated horizontal shuttle", async ({ page }) => {
    const fixture = VISUAL_FIXTURES.platform;
    await startVisualSandbox(page, fixture);
    const shuttle = await page.evaluate(() =>
      window.__TINY_TRACTION_TEST__
        ?.snapshot()
        ?.movers.movingPlatforms.find(({ id }) => id === "horizontal-shuttle"),
    );
    if (shuttle === undefined) {
      throw new Error("The horizontal shuttle was not available to the visual fixture.");
    }
    await page.evaluate(
      ({ x, y, z }) =>
        window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
          position: { x, y: y + 0.7, z },
        }),
      shuttle.position,
    );
    await page.waitForTimeout(450);
    await pauseVisualFixture(page);

    const screenshot = await captureVisualFixture(page, fixture);
    const snapshot = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
    expect(screenshot.byteLength).toBeGreaterThan(20_000);
    expect(snapshot?.vehicle.y).toBeGreaterThan(8);
  });

  test("captures the pristine cube mass, P1 silhouette, exhaust, and shadows", async ({ page }) => {
    const fixture = VISUAL_FIXTURES.closeApproach;
    await startVisualSandbox(page, fixture);
    await page.evaluate(() =>
      window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
        position: { x: 28, y: 0.75, z: -32.7 },
        rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
        linearVelocity: { x: -15, y: 0, z: 0 },
      }),
    );
    await page.waitForFunction(
      () => (window.__TINY_TRACTION_TEST__?.snapshot()?.particles.liveCount ?? 0) >= 8,
    );
    await pauseVisualFixture(page);
    await page.evaluate(() =>
      window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
        position: { x: 15.2, y: 0.75, z: -32.7 },
        rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
      }),
    );

    const screenshot = await captureVisualFixture(page, fixture);
    const snapshot = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
    expect(screenshot.byteLength).toBeGreaterThan(20_000);
    expect(snapshot?.arena.cubes).toHaveLength(96);
    expect(snapshot?.particles.liveCount).toBeGreaterThanOrEqual(8);
  });

  test("captures P1 airborne beyond the authored ramp booster", async ({ page }) => {
    const fixture = VISUAL_FIXTURES.rampLaunch;
    await startVisualSandbox(page, fixture);
    const approachYaw = (157.6 * Math.PI) / 180;
    await page.evaluate(
      ({ rotation }) =>
        window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
          position: { x: -9.33, y: 0.9, z: -16.95 },
          rotation,
          linearVelocity: { x: -3.05, y: 0, z: 7.39 },
        }),
      { rotation: yawQuaternion(approachYaw) },
    );
    await page.keyboard.down("KeyW");
    await page.waitForFunction(
      () => {
        const vehicle = window.__TINY_TRACTION_TEST__?.snapshot()?.vehicle;
        return vehicle !== undefined && vehicle.y > 2.5 && vehicle.linearVelocity.y > 0;
      },
      undefined,
      { timeout: 4_000 },
    );
    await page.keyboard.up("KeyW");
    await pauseVisualFixture(page);
    await page.evaluate(
      ({ rotation }) =>
        window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
          position: { x: -13.25, y: 4.8, z: -6.99 },
          rotation,
        }),
      { rotation: yawQuaternion(approachYaw) },
    );
    await waitForRenderedFrames(page);

    const screenshot = await captureVisualFixture(page, fixture);
    const snapshot = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
    expect(screenshot.byteLength).toBeGreaterThan(20_000);
    expect(snapshot?.vehicle.y).toBeGreaterThan(2.5);
  });

  test("captures a deterministic disrupted-cube pose with an approach trail", async ({ page }) => {
    const fixture = VISUAL_FIXTURES.cubeImpact;
    await startVisualSandbox(page, fixture);
    await page.evaluate(() =>
      window.__TINY_TRACTION_TEST__?.setVehicleState(0, {
        position: { x: 28, y: 0.75, z: -32.8 },
        rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
        linearVelocity: { x: -18, y: 0, z: 0 },
      }),
    );
    await page.waitForFunction(
      () => (window.__TINY_TRACTION_TEST__?.snapshot()?.particles.liveCount ?? 0) >= 10,
    );
    await pauseVisualFixture(page);
    await page.evaluate(() => {
      const api = window.__TINY_TRACTION_TEST__;
      const cubes = api?.snapshot()?.arena.cubes ?? [];
      for (let index = 0; index < cubes.length; index += 1) {
        const cube = cubes[index];
        if (cube === undefined) {
          continue;
        }
        const xIndex = Math.floor(index / 16);
        const layerIndex = Math.floor((index % 16) / 4);
        if (xIndex < 3 || layerIndex === 3) {
          continue;
        }
        const phase = index * 1.61803398875;
        const radial = 1.25 + (index % 5) * 0.52;
        const tilt = ((index % 7) - 3) * 0.18;
        api?.setCubeState(index, {
          position: {
            x: cube.authoredPosition.x + 1.2 + Math.cos(phase) * radial,
            y: 0.58 + (index % 4) * 0.28,
            z: cube.authoredPosition.z + Math.sin(phase) * radial,
          },
          rotation: {
            x: 0,
            y: 0,
            z: Math.sin(tilt / 2),
            w: Math.cos(tilt / 2),
          },
        });
      }
      api?.setVehicleState(0, {
        position: { x: 12.4, y: 0.8, z: -32.8 },
        rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
      });
    });
    await waitForRenderedFrames(page);

    const screenshot = await captureVisualFixture(page, fixture);
    const snapshot = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
    const displacedCount =
      snapshot?.arena.cubes.filter(({ authoredPosition, currentPosition }) => {
        return (
          Math.hypot(
            currentPosition.x - authoredPosition.x,
            currentPosition.y - authoredPosition.y,
            currentPosition.z - authoredPosition.z,
          ) > 0.25
        );
      }).length ?? 0;
    expect(screenshot.byteLength).toBeGreaterThan(20_000);
    expect(displacedCount).toBeGreaterThanOrEqual(20);
    expect(snapshot?.particles.liveCount).toBeGreaterThanOrEqual(10);
  });

  test("captures the ten-player color ring and grayscale marker companion", async ({ page }) => {
    const fixture = VISUAL_FIXTURES.tenPlayer;
    await startVisualSandbox(page, fixture, 10);
    await page.evaluate(() => {
      const api = window.__TINY_TRACTION_TEST__;
      for (let index = 0; index < 10; index += 1) {
        const angle = ((index * 36 + 1) * Math.PI) / 180;
        const outwardYaw = angle + Math.PI;
        api?.setVehicleState(index, {
          position: {
            x: Math.sin(angle) * 5,
            y: 0.75,
            z: Math.cos(angle) * 5,
          },
          rotation: {
            x: 0,
            y: Math.sin(outwardYaw / 2),
            z: 0,
            w: Math.cos(outwardYaw / 2),
          },
          linearVelocity: {
            x: Math.sin(angle) * 8,
            y: 0,
            z: Math.cos(angle) * 8,
          },
        });
      }
    });
    await page.waitForFunction(
      () => (window.__TINY_TRACTION_TEST__?.snapshot()?.particles.liveCount ?? 0) >= 35,
    );
    await pauseVisualFixture(page);

    const colorScreenshot = await captureVisualFixture(page, fixture);
    const grayscaleScreenshot = await captureVisualFixture(
      page,
      fixture,
      { grayscale: true, showMarkers: true },
      "vis-007-ten-player-grayscale-markers-current.png",
    );
    const snapshot = await page.evaluate(() => window.__TINY_TRACTION_TEST__?.snapshot());
    expect(colorScreenshot.byteLength).toBeGreaterThan(20_000);
    expect(grayscaleScreenshot.byteLength).toBeGreaterThan(20_000);
    expect(snapshot?.vehicles.map(({ color }) => color)).toEqual([
      "#FF0000",
      "#FF7B00",
      "#FFFF00",
      "#7C00FF",
      "#00FF00",
      "#00FFFF",
      "#0000FF",
      "#FF00FF",
      "#E1E1E1",
      "#000000",
    ]);
    await expect(page.locator(".player-marker")).toHaveCount(10);
  });
});
