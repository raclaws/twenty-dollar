/**
 * IndexedDB wrapper — framework-agnostic, no React/MobX imports.
 * Database: "twenty-dollar" v1
 * One object store per entity + "mutation_queue"
 */

const DB_NAME = 'twenty-dollar';
const DB_VERSION = 1;

const STORES = [
  'accounts',
  'payees',
  'category_groups',
  'categories',
  'transactions',
  'split_entries',
  'assignments',
  'schedules',
  'import_rules',
  'month_locks',
  'mutation_queue',
] as const;

export type StoreName = (typeof STORES)[number];

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, {
            keyPath: storeName === 'month_locks' ? 'month' : 'id',
          });
        }
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getDB(): Promise<IDBDatabase> {
  return openDB();
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbPutMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    for (const value of values) {
      objectStore.put(value);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbCount(store: StoreName): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbClearAll(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export { STORES, DB_NAME, DB_VERSION };
