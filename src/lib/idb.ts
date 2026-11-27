/**
 * A tiny promise wrapper over IndexedDB (Round 93) — just enough
 * for the offline stores: downloaded lesson packs, pack metadata,
 * and the progress sync queue. No new dependency for four small
 * stores' worth of code.
 *
 * Web only. On native, during static rendering, or in a browser
 * where IndexedDB is unavailable (some private modes), every
 * function fails soft: reads come back empty and writes are
 * silently dropped, so offline features degrade to "not available"
 * instead of ever breaking the app.
 */

const DB_NAME = 'efc-offline';
const DB_VERSION = 1;

export const IDB_STORES = {
  /** moduleId -> PackRecord (offlinePacks.ts) */
  packs: 'packs',
  /** moduleId -> cached inventory summary (offlinePacks.ts) */
  packMeta: 'packMeta',
  /** auto-incremented queue entries (progressQueue.ts) */
  queue: 'queue',
} as const;

type StoreName = (typeof IDB_STORES)[keyof typeof IDB_STORES];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORES.packs)) {
          db.createObjectStore(IDB_STORES.packs, { keyPath: 'moduleId' });
        }
        if (!db.objectStoreNames.contains(IDB_STORES.packMeta)) {
          db.createObjectStore(IDB_STORES.packMeta, { keyPath: 'moduleId' });
        }
        if (!db.objectStoreNames.contains(IDB_STORES.queue)) {
          db.createObjectStore(IDB_STORES.queue, {
            keyPath: 'qid',
            autoIncrement: true,
          });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | undefined> {
  return (async () => {
    const db = await openDb();
    if (!db) return undefined;
    return new Promise<T | undefined>((resolve) => {
      try {
        const tx = db.transaction(store, mode);
        const request = op(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  })();
}

export function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  return run<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>);
}

export function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>).then(
    (rows) => rows ?? []
  );
}

export function idbPut(store: StoreName, value: unknown): Promise<void> {
  return run(store, 'readwrite', (s) => s.put(value)).then(() => undefined);
}

export function idbAdd(store: StoreName, value: unknown): Promise<void> {
  return run(store, 'readwrite', (s) => s.add(value)).then(() => undefined);
}

export function idbDelete(store: StoreName, key: string | number): Promise<void> {
  return run(store, 'readwrite', (s) => s.delete(key)).then(() => undefined);
}

export function idbClear(store: StoreName): Promise<void> {
  return run(store, 'readwrite', (s) => s.clear()).then(() => undefined);
}
