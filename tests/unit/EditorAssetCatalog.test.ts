import { describe, expect, it } from "vitest";
import {
  EDITOR_ASSET_IDS,
  WEDGE_INDICES,
  editorAssetCatalog,
  editorAssetEntityDimensions,
  editorAssetManifest,
  freeformPlatformPrism,
  normalizedSimpleFloorOutline,
  regularPolygonPrism,
  roundedPlatformPrism,
  trackCornerPrism,
  tunnelComponentLayout,
  wedgeVertices,
} from "../../src/editor/EditorAssetCatalog";
import { EditorSession } from "../../src/editor/EditorSession";
import { decodeMapDocument, encodeMapDocument } from "../../src/maps/MapCodec";
import { createStarterMapDocument } from "../../src/maps/MapDocument";

describe("EditorAssetCatalog", () => {
  it("registers every shipped asset with a complete stable contract", () => {
    const catalog = editorAssetCatalog();

    expect(catalog.map((entry) => entry.id)).toEqual(EDITOR_ASSET_IDS);
    expect(new Set(catalog.map((entry) => entry.id)).size).toBe(catalog.length);
    for (const entry of catalog) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.searchTerms.length).toBeGreaterThan(2);
      expect(entry.minimumPrimarySize).toBeLessThan(entry.defaultPrimarySize);
      expect(entry.defaultPrimarySize).toBeLessThanOrEqual(entry.maximumPrimarySize);
      if (entry.physicsClass === "sensor") {
        expect(entry.colliderKind === "none" || entry.colliderKind === "sensor-cuboid").toBe(true);
      } else {
        expect(entry.colliderKind).not.toBe("sensor-cuboid");
      }
      expect(entry.resetBehavior).toContain("authored");
      expect(editorAssetManifest(entry.id)).toBe(entry);
    }
  });

  it("creates, resizes, saves, and reloads every catalog entity", () => {
    let nextId = 0;
    const createId = () => `catalog-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Catalog", createId), createId);

    for (const [index, assetId] of EDITOR_ASSET_IDS.entries()) {
      const manifest = editorAssetManifest(assetId)!;
      const entity = session.placeEntity(assetId, [index * 8, 0, 0], {
        elevation: 0,
        primarySize: manifest.defaultPrimarySize,
        secondarySize: manifest.defaultSecondarySize,
        yawRadians: index * 0.1,
      });
      const dimensions = editorAssetEntityDimensions(entity);
      expect(dimensions).not.toBeNull();
      expect(Object.values(dimensions!).every(Number.isFinite)).toBe(true);
      const originalBottom = entity.transform.position[1] - dimensions!.height / 2;
      session.select(entity.id);
      expect(
        session.editSelected({
          primarySize: Math.min(manifest.maximumPrimarySize, manifest.defaultPrimarySize + 1),
        }),
      ).toBe(true);
      if (assetId === "shape.block" || assetId === "shape.column") {
        const resized = session.selectedEntity!;
        const resizedDimensions = editorAssetEntityDimensions(resized)!;
        expect(resized.transform.position[1] - resizedDimensions.height / 2).toBeCloseTo(
          originalBottom,
        );
      }
    }

    const encoded = encodeMapDocument(session.document);
    const decoded = decodeMapDocument(encoded);
    expect(decoded.entities.map((entity) => entity.assetId)).toEqual(
      session.document.entities.map((entity) => entity.assetId),
    );
    expect(encodeMapDocument(decoded)).toBe(encoded);
  });

  it("generates a finite, bounded wedge shared by ramp preview and collision", () => {
    const vertices = wedgeVertices(5, 3, 8);

    expect(vertices).toHaveLength(18);
    expect([...vertices].every(Number.isFinite)).toBe(true);
    expect(Math.max(...WEDGE_INDICES)).toBeLessThan(vertices.length / 3);
    expect(WEDGE_INDICES.length % 3).toBe(0);
    expect(editorAssetManifest("track.ramp")?.colliderKind).toBe("convex-hull");
    expect(editorAssetManifest("track.jump")?.colliderKind).toBe("convex-hull");

    const triangleNormal = (triangleIndex: number) => {
      const offset = triangleIndex * 3;
      const point = (vertexIndex: number) => {
        const vertexOffset = WEDGE_INDICES[offset + vertexIndex]! * 3;
        return [
          vertices[vertexOffset]!,
          vertices[vertexOffset + 1]!,
          vertices[vertexOffset + 2]!,
        ] as const;
      };
      const a = point(0);
      const b = point(1);
      const c = point(2);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
      return [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ] as const;
    };

    expect(triangleNormal(0)[1]).toBeLessThan(0);
    expect(triangleNormal(2)[1]).toBeGreaterThan(0);
    expect(triangleNormal(2)[2]).toBeLessThan(0);
    expect(triangleNormal(4)[2]).toBeGreaterThan(0);
    expect(triangleNormal(6)[0]).toBeLessThan(0);
    expect(triangleNormal(7)[0]).toBeGreaterThan(0);
  });

  it("defines bounded dynamic ball, cube, and domino physics contracts", () => {
    const ball = editorAssetManifest("physics.ball");
    const cube = editorAssetManifest("physics.cube");
    const domino = editorAssetManifest("physics.domino");

    expect(ball).toMatchObject({
      physicsClass: "dynamic",
      colliderKind: "sphere",
      renderKind: "sphere",
    });
    expect(cube).toMatchObject({
      physicsClass: "dynamic",
      colliderKind: "cuboid",
      renderKind: "box",
    });
    expect(domino).toMatchObject({
      physicsClass: "dynamic",
      colliderKind: "cuboid",
      renderKind: "box",
    });

    let nextId = 0;
    const createId = () => `physics-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Physics", createId), createId);
    const entity = session.placeEntity("physics.ball", [0, 0, 0], {
      elevation: 0,
      primarySize: 2,
      yawRadians: 0,
    });
    session.select(entity.id);
    expect(
      session.editSelectedDynamicPhysics({ mass: 7.5, friction: 1.25, restitution: 0.9 }),
    ).toBe(true);
    expect(session.selectedEntity?.properties).toMatchObject({
      mass: 7.5,
      friction: 1.25,
      restitution: 0.9,
    });
    expect(
      decodeMapDocument(encodeMapDocument(session.document)).entities.at(-1)?.properties,
    ).toMatchObject({
      mass: 7.5,
      friction: 1.25,
      restitution: 0.9,
    });
  });

  it("defines deterministic kinematic platform, rotating obstacle, and door contracts", () => {
    expect(editorAssetManifest("motion.moving-platform")).toMatchObject({
      physicsClass: "kinematic",
      colliderKind: "cuboid",
    });
    expect(editorAssetManifest("motion.rotating-bar")).toMatchObject({
      physicsClass: "kinematic",
      colliderKind: "cuboid",
    });
    expect(editorAssetManifest("motion.door")).toMatchObject({
      physicsClass: "kinematic",
      colliderKind: "cuboid",
      renderKind: "box",
    });
    expect(editorAssetManifest("decoration.sculpture")).toMatchObject({
      physicsClass: "static",
      colliderKind: "convex-hull",
      renderKind: "polygon-prism",
    });
  });

  it("defines boost and launch pads as saved sensor interactables", () => {
    expect(editorAssetManifest("travel.boost-pad")).toMatchObject({
      category: "travel",
      physicsClass: "sensor",
      colliderKind: "sensor-cuboid",
      renderKind: "booster-pad",
    });
    expect(editorAssetManifest("travel.launch-pad")).toMatchObject({
      category: "travel",
      physicsClass: "sensor",
      colliderKind: "sensor-cuboid",
      renderKind: "booster-pad",
    });
    expect(editorAssetManifest("travel.portal")).toMatchObject({
      category: "travel",
      physicsClass: "sensor",
      colliderKind: "sensor-cuboid",
      renderKind: "portal",
    });
    expect(editorAssetManifest("travel.bounce-pad")).toMatchObject({
      category: "travel",
      physicsClass: "sensor",
      colliderKind: "sensor-cuboid",
      renderKind: "surface-pad",
    });
    expect(editorAssetManifest("travel.slow-zone")).toMatchObject({
      category: "travel",
      physicsClass: "sensor",
      colliderKind: "sensor-cuboid",
      renderKind: "surface-pad",
    });
  });

  it("defines editable guidance markers and optionally solid signs", () => {
    expect(editorAssetManifest("travel.direction-arrow")).toMatchObject({
      category: "travel",
      physicsClass: "static",
      colliderKind: "none",
      renderKind: "direction-arrow",
    });
    expect(editorAssetManifest("decoration.arrow-sign")).toMatchObject({
      category: "decoration",
      physicsClass: "static",
      colliderKind: "compound",
      renderKind: "arrow-sign",
    });

    let nextId = 0;
    const createId = () => `guidance-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Guidance", createId), createId);
    const marker = session.placeEntity("travel.direction-arrow", [0, 0, 0], {
      elevation: 0,
      primarySize: 3,
      yawRadians: 0,
    });
    session.select(marker.id);
    expect(session.editSelectedGuidance({ color: "#ff8800", glow: 1.5, solid: true })).toBe(true);
    expect(session.selectedEntity?.properties).toMatchObject({
      color: "#ff8800",
      glow: 1.5,
    });
    expect(session.selectedEntity?.properties).not.toHaveProperty("solid", true);

    const sign = session.placeEntity("decoration.arrow-sign", [8, 0, 0], {
      elevation: 0,
      primarySize: 4,
      yawRadians: Math.PI / 2,
    });
    session.select(sign.id);
    expect(session.editSelectedGuidance({ color: "#12abef", glow: 0.8, solid: true })).toBe(true);
    const decoded = decodeMapDocument(encodeMapDocument(session.document));
    expect(decoded.entities.find((entity) => entity.id === sign.id)?.properties).toMatchObject({
      color: "#12abef",
      glow: 0.8,
      solid: true,
    });
  });

  it("defines bounded non-blocking lights and color strips", () => {
    expect(editorAssetManifest("decoration.point-light")).toMatchObject({
      category: "decoration",
      physicsClass: "static",
      colliderKind: "none",
      renderKind: "point-light",
      cost: "medium",
    });
    expect(editorAssetManifest("decoration.color-strip")).toMatchObject({
      category: "decoration",
      physicsClass: "static",
      colliderKind: "none",
      renderKind: "color-strip",
    });

    let nextId = 0;
    const createId = () => `decoration-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Decoration", createId), createId);
    const light = session.placeEntity("decoration.point-light", [0, 0, 0], {
      elevation: 0,
      primarySize: 4,
      yawRadians: 0,
    });
    session.select(light.id);
    expect(
      session.editSelectedDecoration({
        color: "#ffcc44",
        glow: 0,
        intensity: 7.5,
        range: 22,
        enabled: true,
      }),
    ).toBe(true);
    expect(session.selectedEntity?.properties).toMatchObject({
      color: "#ffcc44",
      intensity: 7.5,
      range: 22,
      enabled: true,
    });

    const strip = session.placeEntity("decoration.color-strip", [8, 0, 0], {
      elevation: 0,
      primarySize: 10,
      yawRadians: 0,
    });
    session.select(strip.id);
    expect(
      session.editSelectedDecoration({
        color: "#44ddff",
        glow: 1.6,
        intensity: 0,
        range: 2,
        enabled: false,
      }),
    ).toBe(true);
    const decoded = decodeMapDocument(encodeMapDocument(session.document));
    expect(decoded.entities.find((entity) => entity.id === strip.id)?.properties).toMatchObject({
      color: "#44ddff",
      glow: 1.6,
      enabled: false,
    });
  });

  it("generates closed bounded polygon and rounded prisms for preview and collision", () => {
    const polygon = regularPolygonPrism(8, 0.5, 8, 6);
    const rounded = roundedPlatformPrism(10, 0.5, 6, 1.5);

    expect(polygon.vertices).toHaveLength(42);
    expect(polygon.indices).toHaveLength(72);
    expect(rounded.vertices.length).toBeGreaterThan(polygon.vertices.length);
    for (const mesh of [polygon, rounded]) {
      expect([...mesh.vertices].every(Number.isFinite)).toBe(true);
      expect([...mesh.indices].every((index) => index < mesh.vertices.length / 3)).toBe(true);
      expect(mesh.indices.length % 3).toBe(0);
      const heights = [...mesh.vertices].filter((_, index) => index % 3 === 1);
      expect(Math.min(...heights)).toBeCloseTo(-0.25);
      expect(Math.max(...heights)).toBeCloseTo(0.25);
    }
  });

  it("triangulates concave freeform floors and rejects crossed outlines", () => {
    const concave = [
      [-4, -3],
      [4, -3],
      [4, 3],
      [0, 1],
      [-4, 3],
    ] as const;
    const prism = freeformPlatformPrism(concave, 0.5);

    expect(prism.vertices).toHaveLength(concave.length * 2 * 3);
    expect(prism.indices).toHaveLength((concave.length - 2) * 6 + concave.length * 6);
    expect([...prism.indices].every((index) => index < prism.vertices.length / 3)).toBe(true);
    expect(editorAssetManifest("floor.freeform")?.colliderKind).toBe("trimesh");
    expect(
      normalizedSimpleFloorOutline([
        [-2, -2],
        [2, 2],
        [-2, 2],
        [2, -2],
      ]),
    ).toBeNull();
  });

  it("builds a closed modular quarter turn with exact static collision geometry", () => {
    const corner = trackCornerPrism(8, 5, 0.35);
    const coordinates = [...corner.vertices];
    const xs = coordinates.filter((_, index) => index % 3 === 0);
    const ys = coordinates.filter((_, index) => index % 3 === 1);
    const zs = coordinates.filter((_, index) => index % 3 === 2);

    expect(corner.vertices).toHaveLength(156);
    expect(corner.indices).toHaveLength(300);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10.5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(10.5);
    expect(Math.min(...ys)).toBeCloseTo(-0.175);
    expect(Math.max(...ys)).toBeCloseTo(0.175);
    expect([...corner.indices].every((index) => index < corner.vertices.length / 3)).toBe(true);
    expect(editorAssetManifest("track.modular-corner")?.colliderKind).toBe("trimesh");
  });

  it("keeps the tunnel opening clear with two walls and a separate roof", () => {
    const layout = tunnelComponentLayout(12, 6, 4.5, 0.45, 0.45);

    expect(layout.map((component) => component.kind)).toEqual(["left-wall", "right-wall", "roof"]);
    expect(layout[0]?.size).toEqual([0.45, 4.5, 12]);
    expect(layout[1]?.position[0]).toBeCloseTo(3.225);
    expect(layout[2]?.size).toEqual([6.9, 0.45, 12]);
    expect(layout[2]?.position[1]).toBeCloseTo(2.25);
    expect(editorAssetManifest("track.tunnel")?.colliderKind).toBe("compound");
  });
});
