import { describe, expect, it } from "vitest";
import {
  TRACK_MATERIAL_IDS,
  createTrackPatternTexture,
  isTrackMaterialId,
  trackPatternPixel,
} from "../../src/tracks/TrackAppearance";

describe("TrackAppearance", () => {
  it("exposes ten stable built-in material IDs", () => {
    expect(TRACK_MATERIAL_IDS).toHaveLength(10);
    expect(new Set(TRACK_MATERIAL_IDS).size).toBe(TRACK_MATERIAL_IDS.length);
    expect(isTrackMaterialId("track.rainbow")).toBe(true);
    expect(isTrackMaterialId("track.unknown")).toBe(false);
  });

  it("generates deterministic non-color pattern cues", () => {
    expect(trackPatternPixel("track.checker", 0.01, 0.01)).not.toEqual(
      trackPatternPixel("track.checker", 0.14, 0.01),
    );
    expect(trackPatternPixel("track.racing-stripes", 0.5, 0.5)).not.toEqual(
      trackPatternPixel("track.racing-stripes", 0.2, 0.5),
    );
    expect(trackPatternPixel("track.arrows", 0.276, 0.1)).not.toEqual(
      trackPatternPixel("track.arrows", 0.05, 0.1),
    );
  });

  it("creates portable generated textures only for patterned styles", () => {
    const rainbow = createTrackPatternTexture("track.rainbow", 16);
    expect(rainbow).not.toBeNull();
    expect(rainbow?.image.width).toBe(16);
    expect(createTrackPatternTexture("track.asphalt")).toBeNull();
    rainbow?.dispose();
  });
});
