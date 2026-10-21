import { describe, expect, it } from "vitest";
import { createStarterMapDocument } from "../../src/maps/MapDocument";
import { compileMapDocument } from "../../src/maps/MapCompiler";
import { authoredSpawnTransform } from "../../src/world/AuthoredMapArena";

describe("start-grid allocation", () => {
  it("places 1–10 players in distinct, compact slots with P1 in the front row", () => {
    let nextId = 0;
    const blueprint = compileMapDocument(
      createStarterMapDocument("Grid", () => `grid-${String(nextId++)}`),
    );
    for (let playerCount = 1; playerCount <= 10; playerCount += 1) {
      const slots = Array.from({ length: playerCount }, (_, index) =>
        authoredSpawnTransform(blueprint, playerCount, index),
      );
      for (const [index, slot] of slots.entries()) {
        for (const other of slots.slice(index + 1)) {
          expect(
            Math.hypot(slot.position.x - other.position.x, slot.position.z - other.position.z),
          ).toBeGreaterThan(2);
        }
      }
      const xs = slots.map((slot) => slot.position.x);
      const zs = slots.map((slot) => slot.position.z);
      // Two columns keep a full grid narrow instead of one 20+ unit wide row.
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(6);
      expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(20);
    }
  });
});
