import { canonicalMapDocument, decodeMapDocument, encodeMapDocument } from "./MapCodec";
import {
  createMapId,
  duplicateMapDocument,
  type MapDocument,
  type MapIdFactory,
} from "./MapDocument";

const DATABASE_NAME = "mini-wheels-editor";
const DATABASE_VERSION = 4;
const MAP_STORE = "maps";
const PREFAB_STORE = "prefabs";
const RESTORE_POINT_STORE = "restore-points";
const RECOVERY_JOURNAL_STORE = "recovery-journal";
const MAXIMUM_RESTORE_POINTS_PER_MAP = 20;
const MAXIMUM_RECOVERY_ENTRIES_PER_MAP = 12;

export interface MapRecord {
  readonly localMapId: string;
  readonly document: MapDocument;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly favorite: boolean;
  readonly trashedAt: string | null;
  readonly thumbnailDataUrl: string;
}

interface StoredMapRecord extends Omit<MapRecord, "document" | "thumbnailDataUrl"> {
  readonly documentJson: string;
  readonly thumbnailDataUrl?: string;
}

export interface PrefabRecord {
  readonly localPrefabId: string;
  readonly title: string;
  readonly document: MapDocument;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface StoredPrefabRecord extends Omit<PrefabRecord, "document"> {
  readonly documentJson: string;
}

export interface RestorePointRecord {
  readonly localRestorePointId: string;
  readonly localMapId: string;
  readonly document: MapDocument;
  readonly createdAt: string;
  readonly revision: number;
}

interface StoredRestorePointRecord extends Omit<RestorePointRecord, "document"> {
  readonly documentJson: string;
}

export interface RecoveryJournalRecord {
  readonly localJournalId: string;
  readonly localMapId: string;
  readonly document: MapDocument;
  readonly createdAt: string;
  readonly baseRevision: number;
}

interface StoredRecoveryJournalRecord extends Omit<RecoveryJournalRecord, "document"> {
  readonly documentJson: string;
}

export interface MapRepositoryOptions {
  readonly indexedDB?: IDBFactory | null;
  readonly now?: () => Date;
  readonly createId?: MapIdFactory;
}

export type MapStorageMode = "indexed-db" | "memory";

export class MapRepository {
  private readonly memory = new Map<string, StoredMapRecord>();
  private readonly memoryPrefabs = new Map<string, StoredPrefabRecord>();
  private readonly memoryRestorePoints = new Map<string, StoredRestorePointRecord>();
  private readonly memoryRecoveryJournal = new Map<string, StoredRecoveryJournalRecord>();
  private readonly factory: IDBFactory | null;
  private readonly now: () => Date;
  private readonly createId: MapIdFactory;
  private databasePromise: Promise<IDBDatabase | null> | undefined;
  private mode: MapStorageMode = "memory";

  public constructor(options: MapRepositoryOptions = {}) {
    this.factory =
      options.indexedDB === undefined
        ? typeof globalThis.indexedDB === "undefined"
          ? null
          : globalThis.indexedDB
        : options.indexedDB;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createMapId;
  }

  public get storageMode(): MapStorageMode {
    return this.mode;
  }

  public async initialize(): Promise<MapStorageMode> {
    await this.database();
    return this.mode;
  }

  public async listMaps(
    options: { readonly includeTrashed?: boolean } = {},
  ): Promise<readonly MapRecord[]> {
    const database = await this.database();
    const stored =
      database === null
        ? [...this.memory.values()]
        : await requestAsPromise<StoredMapRecord[]>(
            database
              .transaction(MAP_STORE, "readonly")
              .objectStore(MAP_STORE)
              .getAll() as IDBRequest<StoredMapRecord[]>,
          );
    return Object.freeze(
      stored
        .filter((record) => options.includeTrashed === true || record.trashedAt === null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((record) => this.decodeRecord(record)),
    );
  }

  public async getMap(localMapId: string): Promise<MapRecord | null> {
    const database = await this.database();
    const stored =
      database === null
        ? this.memory.get(localMapId)
        : await requestAsPromise<StoredMapRecord | undefined>(
            database
              .transaction(MAP_STORE, "readonly")
              .objectStore(MAP_STORE)
              .get(localMapId) as IDBRequest<StoredMapRecord | undefined>,
          );
    return stored === undefined ? null : this.decodeRecord(stored);
  }

  public async createMap(document: MapDocument): Promise<MapRecord> {
    const timestamp = this.now().toISOString();
    const record: StoredMapRecord = Object.freeze({
      localMapId: this.createId(),
      documentJson: encodeMapDocument(canonicalMapDocument(document)),
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
      favorite: false,
      trashedAt: null,
      thumbnailDataUrl: mapThumbnailDataUrl(document),
    });
    await this.put(record);
    return this.decodeRecord(record);
  }

  public async saveMap(localMapId: string, document: MapDocument): Promise<MapRecord> {
    const current = await this.getStored(localMapId);
    if (current === undefined) {
      throw new Error(`Map "${localMapId}" no longer exists.`);
    }
    const record: StoredMapRecord = Object.freeze({
      ...current,
      documentJson: encodeMapDocument(canonicalMapDocument(document)),
      thumbnailDataUrl: mapThumbnailDataUrl(document),
      updatedAt: this.now().toISOString(),
      revision: current.revision + 1,
    });
    const restorePoint: StoredRestorePointRecord = Object.freeze({
      localRestorePointId: this.createId(),
      localMapId,
      documentJson: current.documentJson,
      createdAt: this.now().toISOString(),
      revision: current.revision,
    });
    await this.putMapWithRestorePoint(record, restorePoint);
    await this.pruneRestorePoints(localMapId);
    return this.decodeRecord(record);
  }

  public async duplicateMap(localMapId: string): Promise<MapRecord> {
    const source = await this.getMap(localMapId);
    if (source === null) {
      throw new Error(`Map "${localMapId}" no longer exists.`);
    }
    return this.createMap(
      duplicateMapDocument(source.document, `${source.document.header.title} Copy`, this.createId),
    );
  }

  public async setFavorite(localMapId: string, favorite: boolean): Promise<MapRecord> {
    return this.updateMapRecord(localMapId, (current) => ({ ...current, favorite }));
  }

  public async moveToTrash(localMapId: string): Promise<MapRecord> {
    return this.updateMapRecord(localMapId, (current) => ({
      ...current,
      trashedAt: this.now().toISOString(),
    }));
  }

  public async restoreMap(localMapId: string): Promise<MapRecord> {
    return this.updateMapRecord(localMapId, (current) => ({ ...current, trashedAt: null }));
  }

  public async deleteMapPermanently(localMapId: string): Promise<boolean> {
    const database = await this.database();
    if (database === null) {
      const deleted = this.memory.delete(localMapId);
      for (const point of this.memoryRestorePoints.values()) {
        if (point.localMapId === localMapId) {
          this.memoryRestorePoints.delete(point.localRestorePointId);
        }
      }
      for (const entry of this.memoryRecoveryJournal.values()) {
        if (entry.localMapId === localMapId) {
          this.memoryRecoveryJournal.delete(entry.localJournalId);
        }
      }
      return deleted;
    }
    if ((await this.getMap(localMapId)) === null) {
      return false;
    }
    const restorePoints = await this.listRestorePoints(localMapId);
    const recoveryEntries = await this.listRecoveryEntries(localMapId);
    const transaction = database.transaction(
      [MAP_STORE, RESTORE_POINT_STORE, RECOVERY_JOURNAL_STORE],
      "readwrite",
    );
    transaction.objectStore(MAP_STORE).delete(localMapId);
    for (const point of restorePoints) {
      transaction.objectStore(RESTORE_POINT_STORE).delete(point.localRestorePointId);
    }
    for (const entry of recoveryEntries) {
      transaction.objectStore(RECOVERY_JOURNAL_STORE).delete(entry.localJournalId);
    }
    await transactionComplete(transaction);
    return true;
  }

  public async importMap(documentJson: string): Promise<MapRecord> {
    return this.createMap(decodeMapDocument(documentJson));
  }

  public async listRestorePoints(localMapId: string): Promise<readonly RestorePointRecord[]> {
    const database = await this.database();
    const stored =
      database === null
        ? [...this.memoryRestorePoints.values()]
        : await requestAsPromise<StoredRestorePointRecord[]>(
            database
              .transaction(RESTORE_POINT_STORE, "readonly")
              .objectStore(RESTORE_POINT_STORE)
              .getAll() as IDBRequest<StoredRestorePointRecord[]>,
          );
    return Object.freeze(
      stored
        .filter((point) => point.localMapId === localMapId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((point) => this.decodeRestorePoint(point)),
    );
  }

  public async restorePointAsCopy(
    localMapId: string,
    localRestorePointId: string,
  ): Promise<MapRecord> {
    const point = (await this.listRestorePoints(localMapId)).find(
      (candidate) => candidate.localRestorePointId === localRestorePointId,
    );
    if (point === undefined) {
      throw new Error("That restore point no longer exists.");
    }
    return this.createMap(
      duplicateMapDocument(
        point.document,
        `${point.document.header.title} Recovered Copy`,
        this.createId,
      ),
    );
  }

  public async appendRecoveryEntry(
    localMapId: string,
    document: MapDocument,
    baseRevision: number,
  ): Promise<RecoveryJournalRecord> {
    if ((await this.getStored(localMapId)) === undefined) {
      throw new Error(`Map "${localMapId}" no longer exists.`);
    }
    const stored: StoredRecoveryJournalRecord = Object.freeze({
      localJournalId: this.createId(),
      localMapId,
      documentJson: encodeMapDocument(canonicalMapDocument(document)),
      createdAt: this.now().toISOString(),
      baseRevision,
    });
    await this.putRecoveryEntry(stored);
    await this.pruneRecoveryJournal(localMapId);
    return this.decodeRecoveryEntry(stored);
  }

  public async latestRecoveryEntry(localMapId: string): Promise<RecoveryJournalRecord | null> {
    return (await this.listRecoveryEntries(localMapId))[0] ?? null;
  }

  public async clearRecoveryJournal(localMapId: string): Promise<void> {
    const entries = await this.listRecoveryEntries(localMapId);
    const database = await this.database();
    if (database === null) {
      for (const entry of entries) {
        this.memoryRecoveryJournal.delete(entry.localJournalId);
      }
      return;
    }
    const transaction = database.transaction(RECOVERY_JOURNAL_STORE, "readwrite");
    for (const entry of entries) {
      transaction.objectStore(RECOVERY_JOURNAL_STORE).delete(entry.localJournalId);
    }
    await transactionComplete(transaction);
  }

  public async listPrefabs(): Promise<readonly PrefabRecord[]> {
    const database = await this.database();
    const stored =
      database === null
        ? [...this.memoryPrefabs.values()]
        : await requestAsPromise<StoredPrefabRecord[]>(
            database
              .transaction(PREFAB_STORE, "readonly")
              .objectStore(PREFAB_STORE)
              .getAll() as IDBRequest<StoredPrefabRecord[]>,
          );
    return Object.freeze(
      stored
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((record) => this.decodePrefabRecord(record)),
    );
  }

  public async getPrefab(localPrefabId: string): Promise<PrefabRecord | null> {
    const database = await this.database();
    const stored =
      database === null
        ? this.memoryPrefabs.get(localPrefabId)
        : await requestAsPromise<StoredPrefabRecord | undefined>(
            database
              .transaction(PREFAB_STORE, "readonly")
              .objectStore(PREFAB_STORE)
              .get(localPrefabId) as IDBRequest<StoredPrefabRecord | undefined>,
          );
    return stored === undefined ? null : this.decodePrefabRecord(stored);
  }

  public async createPrefab(title: string, document: MapDocument): Promise<PrefabRecord> {
    const timestamp = this.now().toISOString();
    const record: StoredPrefabRecord = Object.freeze({
      localPrefabId: this.createId(),
      title: title.trim().slice(0, 80),
      documentJson: encodeMapDocument(canonicalMapDocument(document)),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.putPrefab(record);
    return this.decodePrefabRecord(record);
  }

  public async deletePrefab(localPrefabId: string): Promise<boolean> {
    const database = await this.database();
    if (database === null) {
      return this.memoryPrefabs.delete(localPrefabId);
    }
    if ((await this.getPrefab(localPrefabId)) === null) {
      return false;
    }
    const transaction = database.transaction(PREFAB_STORE, "readwrite");
    transaction.objectStore(PREFAB_STORE).delete(localPrefabId);
    await transactionComplete(transaction);
    return true;
  }

  public close(): void {
    void this.databasePromise?.then((database) => database?.close());
    this.databasePromise = undefined;
  }

  private async getStored(localMapId: string): Promise<StoredMapRecord | undefined> {
    const database = await this.database();
    return database === null
      ? this.memory.get(localMapId)
      : requestAsPromise<StoredMapRecord | undefined>(
          database
            .transaction(MAP_STORE, "readonly")
            .objectStore(MAP_STORE)
            .get(localMapId) as IDBRequest<StoredMapRecord | undefined>,
        );
  }

  private async put(record: StoredMapRecord): Promise<void> {
    const database = await this.database();
    if (database === null) {
      this.memory.set(record.localMapId, record);
      return;
    }
    const transaction = database.transaction(MAP_STORE, "readwrite");
    transaction.objectStore(MAP_STORE).put(record);
    await transactionComplete(transaction);
  }

  private async updateMapRecord(
    localMapId: string,
    update: (current: StoredMapRecord) => StoredMapRecord,
  ): Promise<MapRecord> {
    const current = await this.getStored(localMapId);
    if (current === undefined) {
      throw new Error(`Map "${localMapId}" no longer exists.`);
    }
    const record = Object.freeze({
      ...update(current),
      updatedAt: this.now().toISOString(),
    });
    await this.put(record);
    return this.decodeRecord(record);
  }

  private async putPrefab(record: StoredPrefabRecord): Promise<void> {
    const database = await this.database();
    if (database === null) {
      this.memoryPrefabs.set(record.localPrefabId, record);
      return;
    }
    const transaction = database.transaction(PREFAB_STORE, "readwrite");
    transaction.objectStore(PREFAB_STORE).put(record);
    await transactionComplete(transaction);
  }

  private async putMapWithRestorePoint(
    map: StoredMapRecord,
    restorePoint: StoredRestorePointRecord,
  ): Promise<void> {
    const database = await this.database();
    if (database === null) {
      this.memory.set(map.localMapId, map);
      this.memoryRestorePoints.set(restorePoint.localRestorePointId, restorePoint);
      return;
    }
    const transaction = database.transaction([MAP_STORE, RESTORE_POINT_STORE], "readwrite");
    transaction.objectStore(MAP_STORE).put(map);
    transaction.objectStore(RESTORE_POINT_STORE).put(restorePoint);
    await transactionComplete(transaction);
  }

  private async putRecoveryEntry(entry: StoredRecoveryJournalRecord): Promise<void> {
    const database = await this.database();
    if (database === null) {
      this.memoryRecoveryJournal.set(entry.localJournalId, entry);
      return;
    }
    const transaction = database.transaction(RECOVERY_JOURNAL_STORE, "readwrite");
    transaction.objectStore(RECOVERY_JOURNAL_STORE).put(entry);
    await transactionComplete(transaction);
  }

  private async listRecoveryEntries(localMapId: string): Promise<readonly RecoveryJournalRecord[]> {
    const database = await this.database();
    const stored =
      database === null
        ? [...this.memoryRecoveryJournal.values()]
        : await requestAsPromise<StoredRecoveryJournalRecord[]>(
            database
              .transaction(RECOVERY_JOURNAL_STORE, "readonly")
              .objectStore(RECOVERY_JOURNAL_STORE)
              .getAll() as IDBRequest<StoredRecoveryJournalRecord[]>,
          );
    return Object.freeze(
      stored
        .filter((entry) => entry.localMapId === localMapId)
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.localJournalId.localeCompare(left.localJournalId),
        )
        .map((entry) => this.decodeRecoveryEntry(entry)),
    );
  }

  private async pruneRecoveryJournal(localMapId: string): Promise<void> {
    const entries = await this.listRecoveryEntries(localMapId);
    const expired = entries.slice(MAXIMUM_RECOVERY_ENTRIES_PER_MAP);
    if (expired.length === 0) {
      return;
    }
    const database = await this.database();
    if (database === null) {
      for (const entry of expired) {
        this.memoryRecoveryJournal.delete(entry.localJournalId);
      }
      return;
    }
    const transaction = database.transaction(RECOVERY_JOURNAL_STORE, "readwrite");
    for (const entry of expired) {
      transaction.objectStore(RECOVERY_JOURNAL_STORE).delete(entry.localJournalId);
    }
    await transactionComplete(transaction);
  }

  private async pruneRestorePoints(localMapId: string): Promise<void> {
    const points = await this.listRestorePoints(localMapId);
    const expired = points.slice(MAXIMUM_RESTORE_POINTS_PER_MAP);
    if (expired.length === 0) {
      return;
    }
    const database = await this.database();
    if (database === null) {
      for (const point of expired) {
        this.memoryRestorePoints.delete(point.localRestorePointId);
      }
      return;
    }
    const transaction = database.transaction(RESTORE_POINT_STORE, "readwrite");
    for (const point of expired) {
      transaction.objectStore(RESTORE_POINT_STORE).delete(point.localRestorePointId);
    }
    await transactionComplete(transaction);
  }

  private decodeRecord(record: StoredMapRecord): MapRecord {
    const document = decodeMapDocument(record.documentJson);
    return Object.freeze({
      localMapId: record.localMapId,
      document,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      revision: record.revision,
      favorite: record.favorite,
      trashedAt: record.trashedAt,
      thumbnailDataUrl: record.thumbnailDataUrl ?? mapThumbnailDataUrl(document),
    });
  }

  private decodePrefabRecord(record: StoredPrefabRecord): PrefabRecord {
    return Object.freeze({
      localPrefabId: record.localPrefabId,
      title: record.title,
      document: decodeMapDocument(record.documentJson),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private decodeRestorePoint(record: StoredRestorePointRecord): RestorePointRecord {
    return Object.freeze({
      localRestorePointId: record.localRestorePointId,
      localMapId: record.localMapId,
      document: decodeMapDocument(record.documentJson),
      createdAt: record.createdAt,
      revision: record.revision,
    });
  }

  private decodeRecoveryEntry(record: StoredRecoveryJournalRecord): RecoveryJournalRecord {
    return Object.freeze({
      localJournalId: record.localJournalId,
      localMapId: record.localMapId,
      document: decodeMapDocument(record.documentJson),
      createdAt: record.createdAt,
      baseRevision: record.baseRevision,
    });
  }

  private database(): Promise<IDBDatabase | null> {
    this.databasePromise ??= this.openDatabase();
    return this.databasePromise;
  }

  private async openDatabase(): Promise<IDBDatabase | null> {
    if (this.factory === null) {
      this.mode = "memory";
      return null;
    }
    try {
      const request = this.factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MAP_STORE)) {
          database.createObjectStore(MAP_STORE, { keyPath: "localMapId" });
        }
        if (!database.objectStoreNames.contains(PREFAB_STORE)) {
          database.createObjectStore(PREFAB_STORE, { keyPath: "localPrefabId" });
        }
        if (!database.objectStoreNames.contains(RESTORE_POINT_STORE)) {
          database.createObjectStore(RESTORE_POINT_STORE, { keyPath: "localRestorePointId" });
        }
        if (!database.objectStoreNames.contains(RECOVERY_JOURNAL_STORE)) {
          database.createObjectStore(RECOVERY_JOURNAL_STORE, { keyPath: "localJournalId" });
        }
      });
      const database = await requestAsPromise(request);
      database.addEventListener("versionchange", () => database.close());
      this.mode = "indexed-db";
      return database;
    } catch {
      this.mode = "memory";
      return null;
    }
  }
}

function mapThumbnailDataUrl(document: MapDocument): string {
  const trackCount = document.tracks.length;
  const objectCount = document.entities.length;
  const accent = document.header.mapType === "free-roam" ? "#2bd866" : "#ff9d2e";
  const trackMarks = Array.from({ length: Math.min(5, Math.max(1, trackCount)) }, (_, index) => {
    const offset = 24 + index * 9;
    return `<path d="M14 ${String(offset)} C32 ${String(offset - 18)} 56 ${String(offset + 18)} 82 ${String(offset)}"/>`;
  }).join("");
  const objectMarks = Array.from({ length: Math.min(8, objectCount) }, (_, index) => {
    const x = 18 + (index % 4) * 20;
    const y = 58 + Math.floor(index / 4) * 14;
    return `<rect x="${String(x)}" y="${String(y)}" width="7" height="7"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#dfe8ee"/><g fill="none" stroke="#415870" stroke-width="7" stroke-linecap="round">${trackMarks}</g><g fill="${accent}">${objectMarks}</g><path d="M0 88H96" stroke="#08a8bb" stroke-width="4"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed.")),
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
    );
  });
}
