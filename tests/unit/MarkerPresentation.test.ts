import { describe, expect, it } from "vitest";
import { markerSizeMultiplier } from "../../src/render/DomMarkerSystem";

describe("marker presentation", () => {
  it("maps all persisted marker-size options to distinct readable scales", () => {
    expect(markerSizeMultiplier("small")).toBe(0.8);
    expect(markerSizeMultiplier("medium")).toBe(1);
    expect(markerSizeMultiplier("large")).toBe(1.25);
  });
});
