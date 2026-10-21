import { describe, expect, it } from "vitest";
import { createStarterMapDocument, withMapTitle } from "../../src/maps/MapDocument";
import { MapRepository } from "../../src/maps/MapRepository";
import { EditorSession } from "../../src/editor/EditorSession";
import { encodeMapDocument } from "../../src/maps/MapCodec";

describe("MapRepository", () => {
  it("creates, saves, lists, and duplicates self-contained maps in memory fallback", async () => {
    let id = 0;
    let minute = 0;
    const createId = () => `repository-${String(++id)}`;
    const repository = new MapRepository({
      indexedDB: null,
      createId,
      now: () => new Date(Date.UTC(2026, 6, 30, 20, minute++)),
    });
    const document = createStarterMapDocument("Saved Track", createId);

    expect(await repository.initialize()).toBe("memory");
    const created = await repository.createMap(document);
    const saved = await repository.saveMap(
      created.localMapId,
      withMapTitle(created.document, "Renamed Track"),
    );
    const duplicate = await repository.duplicateMap(created.localMapId);
    const listed = await repository.listMaps();

    expect(saved.revision).toBe(2);
    expect(created.thumbnailDataUrl).toMatch(/^data:image\/svg\+xml,/);
    expect(encodeMapDocument(created.document)).not.toContain("thumbnailDataUrl");
    expect(saved.document.header.title).toBe("Renamed Track");
    expect(duplicate.document.header.title).toBe("Renamed Track Copy");
    expect(duplicate.document.header.documentId).not.toBe(saved.document.header.documentId);
    expect(listed.map((record) => record.document.header.title)).toEqual([
      "Renamed Track Copy",
      "Renamed Track",
    ]);
    const restorePoints = await repository.listRestorePoints(created.localMapId);
    expect(restorePoints).toHaveLength(1);
    expect(restorePoints[0]?.revision).toBe(1);
    expect(restorePoints[0]?.document.header.title).toBe("Saved Track");
    const recovered = await repository.restorePointAsCopy(
      created.localMapId,
      restorePoints[0]!.localRestorePointId,
    );
    expect(recovered.document.header.title).toBe("Saved Track Recovered Copy");
    expect(await repository.getMap("missing")).toBeNull();
  });

  it("stores local prefabs while placed copies remain self-contained", async () => {
    let id = 0;
    const createId = () => `prefab-repository-${String(++id)}`;
    const repository = new MapRepository({ indexedDB: null, createId });
    const source = new EditorSession(createStarterMapDocument("Source", createId), createId);
    const first = source.placeEntity("shape.block", [0, 0, 0], {
      elevation: 0,
      primarySize: 3,
      yawRadians: 0,
    });
    const second = source.placeEntity("shape.column", [5, 0, 0], {
      elevation: 0,
      primarySize: 2,
      yawRadians: 0,
    });
    source.selectMany([first.id, second.id]);
    const prefabDocument = source.createSelectedPrefabDocument("Castle Gate");
    expect(prefabDocument).not.toBeNull();

    const prefab = await repository.createPrefab("Castle Gate", prefabDocument!);
    expect((await repository.listPrefabs()).map((item) => item.title)).toEqual(["Castle Gate"]);
    expect((await repository.getPrefab(prefab.localPrefabId))?.document.entities).toHaveLength(2);

    const target = new EditorSession(createStarterMapDocument("Target", createId), createId);
    expect(target.placePrefab(prefab.document, [20, 0, 10], Math.PI / 2)).toBe(true);
    expect(target.selectedEntities).toHaveLength(2);
    expect(new Set(target.selectedEntities.map((entity) => entity.groupId)).size).toBe(1);
    expect(await repository.deletePrefab(prefab.localPrefabId)).toBe(true);
    expect(await repository.listPrefabs()).toEqual([]);
    expect(target.document.entities).toHaveLength(4);
  });

  it("favorites, trashes, restores, imports, and permanently deletes maps safely", async () => {
    let id = 0;
    let minute = 0;
    const createId = () => `library-repository-${String(++id)}`;
    const repository = new MapRepository({
      indexedDB: null,
      createId,
      now: () => new Date(Date.UTC(2026, 7, 8, 20, minute++)),
    });
    const created = await repository.createMap(createStarterMapDocument("Keep Me", createId));

    expect((await repository.setFavorite(created.localMapId, true)).favorite).toBe(true);
    expect((await repository.moveToTrash(created.localMapId)).trashedAt).not.toBeNull();
    expect(await repository.listMaps()).toEqual([]);
    expect(await repository.listMaps({ includeTrashed: true })).toHaveLength(1);
    expect((await repository.restoreMap(created.localMapId)).trashedAt).toBeNull();

    const imported = await repository.importMap(encodeMapDocument(created.document));
    expect(imported.document.header.title).toBe("Keep Me");
    expect(imported.localMapId).not.toBe(created.localMapId);
    await expect(repository.importMap("{not valid json")).rejects.toThrow();

    for (let revision = 0; revision < 22; revision += 1) {
      await repository.saveMap(
        created.localMapId,
        withMapTitle(created.document, `Keep Me ${String(revision)}`),
      );
    }
    expect(await repository.listRestorePoints(created.localMapId)).toHaveLength(20);

    for (let entry = 0; entry < 14; entry += 1) {
      await repository.appendRecoveryEntry(
        created.localMapId,
        withMapTitle(created.document, `Durable Edit ${String(entry)}`),
        23,
      );
    }
    expect((await repository.latestRecoveryEntry(created.localMapId))?.document.header.title).toBe(
      "Durable Edit 13",
    );
    await repository.clearRecoveryJournal(created.localMapId);
    expect(await repository.latestRecoveryEntry(created.localMapId)).toBeNull();
    await repository.appendRecoveryEntry(created.localMapId, created.document, 23);

    expect(await repository.deleteMapPermanently(created.localMapId)).toBe(true);
    expect(await repository.listRestorePoints(created.localMapId)).toEqual([]);
    expect(await repository.latestRecoveryEntry(created.localMapId)).toBeNull();
    expect(await repository.deleteMapPermanently(created.localMapId)).toBe(false);
    expect((await repository.listMaps()).map((record) => record.localMapId)).toEqual([
      imported.localMapId,
    ]);
  });
});
