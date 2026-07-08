/**
 * SyncStore — framework-agnostic in-memory store backed by IndexedDB.
 * No React/MobX imports. Pure data layer.
 *
 * Per-table in-memory Map<string, Record>. Reads from Map (sync), writes to Map + IDB (async).
 */

import { idbGetAll, idbPut, idbPutMany, idbDelete, idbCount, type StoreName } from './idb';

export class SyncStore<T extends { id?: string; month?: string }> {
  private data: Map<string, T> = new Map();
  private readonly storeName: StoreName;
  private readonly keyField: 'id' | 'month';

  constructor(storeName: StoreName, keyField: 'id' | 'month' = 'id') {
    this.storeName = storeName;
    this.keyField = keyField;
  }

  private getKey(record: T): string {
    const key = this.keyField === 'month' ? record.month : record.id;
    if (!key) throw new Error(`Record missing key field "${this.keyField}"`);
    return key;
  }

  /** Sync read — returns from in-memory Map */
  get(key: string): T | undefined {
    return this.data.get(key);
  }

  /** Sync read — returns all records from in-memory Map */
  getAll(): T[] {
    return Array.from(this.data.values());
  }

  /** Returns the in-memory Map directly (for MobX observable wrapping) */
  getMap(): Map<string, T> {
    return this.data;
  }

  /** Write to Map + async IDB persist */
  put(record: T): void {
    const key = this.getKey(record);
    this.data.set(key, record);
    // Fire and forget IDB write
    idbPut(this.storeName, record).catch((err) => {
      console.error(`[SyncStore:${this.storeName}] IDB put failed:`, err);
    });
  }

  /** Batch write to Map + async IDB persist */
  putMany(records: T[]): void {
    for (const record of records) {
      const key = this.getKey(record);
      this.data.set(key, record);
    }
    idbPutMany(this.storeName, records).catch((err) => {
      console.error(`[SyncStore:${this.storeName}] IDB putMany failed:`, err);
    });
  }

  /** Delete from Map + async IDB delete */
  delete(key: string): void {
    this.data.delete(key);
    idbDelete(this.storeName, key).catch((err) => {
      console.error(`[SyncStore:${this.storeName}] IDB delete failed:`, err);
    });
  }

  /** Query with predicate (sync, operates on in-memory Map) */
  query(predicate: (record: T) => boolean): T[] {
    const results: T[] = [];
    for (const record of this.data.values()) {
      if (predicate(record)) results.push(record);
    }
    return results;
  }

  /** Count records matching optional predicate */
  count(predicate?: (record: T) => boolean): number {
    if (!predicate) return this.data.size;
    let n = 0;
    for (const record of this.data.values()) {
      if (predicate(record)) n++;
    }
    return n;
  }

  /** Count records in IDB (for integrity checks) */
  async countIDB(): Promise<number> {
    return idbCount(this.storeName);
  }

  /** Hydrate in-memory Map from IDB. Call once at app init. */
  async hydrate(): Promise<void> {
    const records = await idbGetAll<T>(this.storeName);
    this.data.clear();
    for (const record of records) {
      const key = this.getKey(record);
      this.data.set(key, record);
    }
  }

  /** Replace all in-memory data (e.g., from server hydration) and persist to IDB */
  replaceAll(records: T[]): void {
    this.data.clear();
    for (const record of records) {
      const key = this.getKey(record);
      this.data.set(key, record);
    }
    idbPutMany(this.storeName, records).catch((err) => {
      console.error(`[SyncStore:${this.storeName}] IDB replaceAll failed:`, err);
    });
  }

  /** Clear all data from memory and IDB */
  clear(): void {
    this.data.clear();
  }
}
