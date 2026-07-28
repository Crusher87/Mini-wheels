import { RENDER_CONFIG } from "../config/runtime-defaults";
import type { AaQuality, GameSettings, ShadowQuality } from "../persistence/schema";

export const POST_PROCESSING_PASS_ORDER = Object.freeze([
  "render",
  "ambient-occlusion",
  "vignette",
  "fxaa",
  "smaa",
  "output",
] as const);

export type PostProcessingPassName = (typeof POST_PROCESSING_PASS_ORDER)[number];
export type SelectedAaPass = Exclude<AaQuality, "high">;

export interface RenderQualitySettings {
  readonly renderScale: GameSettings["renderScale"];
  readonly aaQuality: AaQuality;
  readonly ambientOcclusion: boolean;
  readonly vignette: boolean;
  readonly shadowQuality: ShadowQuality;
}

export interface RenderQualityPlan {
  readonly selectedAaPass: SelectedAaPass;
  readonly ambientOcclusionEnabled: boolean;
  readonly vignetteEnabled: boolean;
  readonly highQualitySupersampling: boolean;
  readonly shadowMapSize: 1024 | 2048 | 4096;
}

export interface InternalRenderSize {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly effectivePixelRatio: number;
  readonly internalWidth: number;
  readonly internalHeight: number;
}

const SHADOW_MAP_SIZE: Readonly<Record<ShadowQuality, 1024 | 2048 | 4096>> = Object.freeze({
  low: 1024,
  medium: 2048,
  high: 4096,
});

const HIGH_QUALITY_SCALE_MULTIPLIER = 1.25;

function positiveFiniteOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function shadowMapSizeForQuality(quality: ShadowQuality): 1024 | 2048 | 4096 {
  return SHADOW_MAP_SIZE[quality];
}

export function resolveRenderQuality(settings: RenderQualitySettings): RenderQualityPlan {
  return Object.freeze({
    selectedAaPass: settings.aaQuality === "high" ? "smaa" : settings.aaQuality,
    ambientOcclusionEnabled: settings.ambientOcclusion && settings.shadowQuality !== "low",
    vignetteEnabled: settings.vignette,
    highQualitySupersampling: settings.aaQuality === "high",
    shadowMapSize: shadowMapSizeForQuality(settings.shadowQuality),
  });
}

export function calculateInternalRenderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  settings: Pick<RenderQualitySettings, "aaQuality" | "renderScale">,
): InternalRenderSize {
  const safeWidth = Math.max(1, Math.round(positiveFiniteOr(cssWidth, 1)));
  const safeHeight = Math.max(1, Math.round(positiveFiniteOr(cssHeight, 1)));
  const safeDevicePixelRatio = positiveFiniteOr(devicePixelRatio, 1);
  const qualityMultiplier = settings.aaQuality === "high" ? HIGH_QUALITY_SCALE_MULTIPLIER : 1;
  const effectivePixelRatio = Math.min(
    safeDevicePixelRatio * settings.renderScale * qualityMultiplier,
    RENDER_CONFIG.pixelRatioCap,
  );

  return Object.freeze({
    cssWidth: safeWidth,
    cssHeight: safeHeight,
    effectivePixelRatio,
    internalWidth: Math.max(1, Math.round(safeWidth * effectivePixelRatio)),
    internalHeight: Math.max(1, Math.round(safeHeight * effectivePixelRatio)),
  });
}
