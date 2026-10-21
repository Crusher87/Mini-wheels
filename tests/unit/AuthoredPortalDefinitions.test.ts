import { describe, expect, it } from "vitest";
import { EditorSession } from "../../src/editor/EditorSession";
import { compileMapDocument } from "../../src/maps/MapCompiler";
import { decodeMapDocument, encodeMapDocument } from "../../src/maps/MapCodec";
import { createStarterMapDocument } from "../../src/maps/MapDocument";
import { authoredPortalDefinitions } from "../../src/world/WorldSession";

describe("authoredPortalDefinitions", () => {
  it("links two portable endpoints into one rotated Test Mode pair", () => {
    let nextId = 0;
    const createId = () => `portal-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Portals", createId), createId);
    const first = session.placeEntity("travel.portal", [-8, 0, 2], {
      elevation: 0,
      primarySize: 3,
      secondarySize: 4,
      yawRadians: 0,
    });
    const second = session.placeEntity("travel.portal", [12, 0, -4], {
      elevation: 1,
      primarySize: 5,
      secondarySize: 6,
      yawRadians: Math.PI,
    });
    session.select(first.id);
    session.select(second.id, true);
    expect(session.linkSelectedPortals()).toBe(true);

    const roundTripped = decodeMapDocument(encodeMapDocument(session.document));
    const definitions = authoredPortalDefinitions(compileMapDocument(roundTripped));
    expect(definitions).toHaveLength(2);
    expect(definitions[0]).toMatchObject({
      id: first.id,
      position: { x: -8, y: 2, z: 2 },
      halfExtents: { x: 1.5, y: 2, z: 0.175 },
    });
    expect(definitions[1]).toMatchObject({
      id: second.id,
      position: { x: 12, y: 4, z: -4 },
      halfExtents: { x: 2.5, y: 3, z: 0.175 },
    });
    expect(definitions[0]?.pairId).toBe(definitions[1]?.pairId);

    expect(session.duplicateSelected()).toBe(true);
    const duplicates = session.selectedEntities;
    expect(duplicates).toHaveLength(2);
    expect(duplicates[0]?.properties["peerPortalEntityId"]).toBe(duplicates[1]?.id);
    expect(duplicates[1]?.properties["peerPortalEntityId"]).toBe(duplicates[0]?.id);
    expect(() => decodeMapDocument(encodeMapDocument(session.document))).not.toThrow();
  });

  it("warns for an unlinked endpoint and rejects one-way references", () => {
    let nextId = 0;
    const createId = () => `unlinked-${String(nextId++)}`;
    const session = new EditorSession(createStarterMapDocument("Unlinked", createId), createId);
    const first = session.placeEntity("travel.portal", [0, 0, 0], {
      elevation: 0,
      primarySize: 3,
      secondarySize: 4,
      yawRadians: 0,
    });
    const second = session.placeEntity("travel.portal", [8, 0, 0], {
      elevation: 0,
      primarySize: 3,
      secondarySize: 4,
      yawRadians: 0,
    });
    expect(compileMapDocument(session.document).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "travel.portal-unlinked", entityId: first.id }),
      ]),
    );

    const broken = {
      ...session.document,
      entities: session.document.entities.map((entity) =>
        entity.id === first.id
          ? {
              ...entity,
              properties: { ...entity.properties, peerPortalEntityId: second.id },
            }
          : entity,
      ),
    };
    expect(() => decodeMapDocument(JSON.stringify(broken))).toThrow(/must link to each other/);
  });
});
