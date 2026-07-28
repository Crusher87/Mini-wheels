import { DirectionalLight, Group, WebGLRenderTarget } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  calculateInternalRenderSize,
  POST_PROCESSING_PASS_ORDER,
  resolveRenderQuality,
  type RenderQualitySettings,
} from "../../src/render/render-quality";
import { applyDirectionalShadowQuality } from "../../src/render/shadow-quality";

const BASE_SETTINGS: RenderQualitySettings = Object.freeze({
  renderScale: 1,
  aaQuality: "smaa",
  ambientOcclusion: true,
  vignette: true,
  shadowQuality: "medium",
});

describe("render quality planning", () => {
  it("keeps the documented pass order and maps every AA option truthfully", () => {
    expect(POST_PROCESSING_PASS_ORDER).toEqual([
      "render",
      "ambient-occlusion",
      "vignette",
      "fxaa",
      "smaa",
      "output",
    ]);

    expect(resolveRenderQuality({ ...BASE_SETTINGS, aaQuality: "off" }).selectedAaPass).toBe("off");
    expect(resolveRenderQuality({ ...BASE_SETTINGS, aaQuality: "fxaa" }).selectedAaPass).toBe(
      "fxaa",
    );
    expect(resolveRenderQuality({ ...BASE_SETTINGS, aaQuality: "smaa" }).selectedAaPass).toBe(
      "smaa",
    );
    const high = resolveRenderQuality({ ...BASE_SETTINGS, aaQuality: "high" });
    expect(high.selectedAaPass).toBe("smaa");
    expect(high.highQualitySupersampling).toBe(true);
  });

  it("sizes internal buffers without changing CSS dimensions and caps final DPR", () => {
    expect(
      calculateInternalRenderSize(1280, 720, 1.5, {
        renderScale: 0.75,
        aaQuality: "fxaa",
      }),
    ).toEqual({
      cssWidth: 1280,
      cssHeight: 720,
      effectivePixelRatio: 1.125,
      internalWidth: 1440,
      internalHeight: 810,
    });

    expect(
      calculateInternalRenderSize(1280, 720, 1, {
        renderScale: 1,
        aaQuality: "high",
      }),
    ).toMatchObject({
      cssWidth: 1280,
      cssHeight: 720,
      effectivePixelRatio: 1.25,
      internalWidth: 1600,
      internalHeight: 900,
    });

    expect(
      calculateInternalRenderSize(1920, 1080, 3, {
        renderScale: 1.25,
        aaQuality: "high",
      }),
    ).toMatchObject({
      effectivePixelRatio: 2,
      internalWidth: 3840,
      internalHeight: 2160,
    });
  });

  it("applies optional effects and maps the shadow quality profiles", () => {
    expect(
      resolveRenderQuality({
        ...BASE_SETTINGS,
        ambientOcclusion: true,
        vignette: false,
        shadowQuality: "low",
      }),
    ).toMatchObject({
      ambientOcclusionEnabled: false,
      vignetteEnabled: false,
      shadowMapSize: 1024,
    });
    expect(resolveRenderQuality({ ...BASE_SETTINGS, shadowQuality: "medium" })).toMatchObject({
      ambientOcclusionEnabled: true,
      shadowMapSize: 2048,
    });
    expect(resolveRenderQuality({ ...BASE_SETTINGS, shadowQuality: "high" }).shadowMapSize).toBe(
      4096,
    );
  });
});

describe("directional shadow quality", () => {
  it("releases an existing shadow target before changing its resolution", () => {
    const root = new Group();
    const light = new DirectionalLight();
    light.castShadow = true;
    const oldMap = new WebGLRenderTarget(512, 512);
    const dispose = vi.spyOn(oldMap, "dispose");
    light.shadow.map = oldMap;
    root.add(light);

    expect(applyDirectionalShadowQuality(root, "high")).toBe(1);
    expect(dispose).toHaveBeenCalledOnce();
    expect(light.shadow.map).toBeNull();
    expect(light.shadow.mapSize.toArray()).toEqual([4096, 4096]);
    expect(light.shadow.needsUpdate).toBe(true);
  });

  it("leaves non-shadow-casting lights alone and is idempotent", () => {
    const root = new Group();
    const active = new DirectionalLight();
    active.castShadow = true;
    active.shadow.mapSize.set(2048, 2048);
    const inactive = new DirectionalLight();
    inactive.castShadow = false;
    root.add(active, inactive);

    expect(applyDirectionalShadowQuality(root, "medium")).toBe(0);
    expect(active.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(inactive.shadow.mapSize.toArray()).toEqual([512, 512]);
  });
});
