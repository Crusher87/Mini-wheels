import { DirectionalLight, type Object3D } from "three";
import type { ShadowQuality } from "../persistence/schema";
import { shadowMapSizeForQuality } from "./render-quality";

/**
 * Applies the selected map size to shadow-casting directional lights in a subtree.
 * Existing render targets are released before a size change so the renderer cannot
 * retain both the old and replacement shadow textures.
 */
export function applyDirectionalShadowQuality(root: Object3D, quality: ShadowQuality): number {
  const mapSize = shadowMapSizeForQuality(quality);
  let changedLightCount = 0;

  root.traverse((object) => {
    if (!(object instanceof DirectionalLight) || !object.castShadow) {
      return;
    }
    const shadow = object.shadow;
    if (shadow.mapSize.width === mapSize && shadow.mapSize.height === mapSize) {
      return;
    }

    shadow.map?.dispose();
    shadow.map = null;
    shadow.mapSize.set(mapSize, mapSize);
    shadow.needsUpdate = true;
    changedLightCount += 1;
  });

  return changedLightCount;
}
