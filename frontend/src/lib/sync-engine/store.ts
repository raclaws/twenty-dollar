import type { StoreConfig, SyncStore, Record, QueryOptions } from './types'

export function createSyncStore(config: StoreConfig): Promise<SyncStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(config.name, 2)

    request.onupgradeneeded = () => {
      const db = request.result
      // Drop old stores that no longer exist in config
      for (const name of Array.from(db.objectStoreNames)) {
        if (!(name in config.tables)) {
          db.deleteObjectStore(name)
        }
      }
      for (const [tableName, schema] of Object.entries(config.tables)) {
        if (!db.objectStoreNames.contains(tableName)) {
          const store = db.createObjectStore(tableName, { keyPath: 'id' })
          if (schema.indexes) {
            for (const idx of schema.indexes) {
              store.createIndex(idx, idx, { unique: false })
            }
          }
        }
      }
    }

    request.onsuccess = () => {
      const db = request.result
      buildStore(db, config).then(resolve).catch(reject)
    }

    request.onerror = () => reject(request.error)
  })
}

async function buildStore(db: IDBDatabase, config: StoreConfig): Promise<SyncStore> {
  // In-memory mirror — hot queries hit this, not IDB
  const cache: { [table: string]: Map<string, Record> } = {}

  for (const tableName of Object.keys(config.tables)) {
    cache[tableName] = new Map()
    // Hydrate memory from IDB on init
    const records = await idbGetAll(db, tableName)
    for (const r of records) {
      cache[tableName].set(r.id, r)
    }
  }

  function tx(table: string, mode: IDBTransactionMode) {
    return db.transaction(table, mode).objectStore(table)
  }

  const store: SyncStore = {
    async put(table, record) {
      cache[table].set(record.id, record)
      return new Promise((resolve, reject) => {
        const req = tx(table, 'readwrite').put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },

    async putMany(table, records) {
      for (const r of records) cache[table].set(r.id, r)
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(table, 'readwrite')
        const s = transaction.objectStore(table)
        for (const r of records) s.put(r)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
    },

    async get(table, id) {
      return cache[table].get(id)
    },

    async getAll(table) {
      return Array.from(cache[table].values())
    },

    async query(table, options?: QueryOptions) {
      const all = Array.from(cache[table].values())
      return applyQuery(all, options)
    },

    async count(table, options?: QueryOptions) {
      if (!options || !options.where) {
        return cache[table].size
      }
      return applyQuery(Array.from(cache[table].values()), { where: options.where }).length
    },

    async delete(table, id) {
      cache[table].delete(id)
      return new Promise((resolve, reject) => {
        const req = tx(table, 'readwrite').delete(id)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },

    async clear(table) {
      cache[table].clear()
      return new Promise((resolve, reject) => {
        const req = tx(table, 'readwrite').clear()
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },

    close() {
      db.close()
    }
  }

  return store
}

function idbGetAll(db: IDBDatabase, table: string): Promise<Record[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(table, 'readonly').objectStore(table).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function applyQuery(records: Record[], options?: QueryOptions): Record[] {
  if (!options) return records

  let result = records

  if (options.where) {
    result = result.filter(r => {
      for (const [field, value] of Object.entries(options.where!)) {
        const rv = r[field]
        if (Array.isArray(value)) {
          if (!value.includes(rv as string)) return false
        } else {
          if (rv !== value) return false
        }
      }
      return true
    })
  }

  if (options.sort) {
    const { field, dir } = options.sort
    result = [...result].sort((a, b) => {
      const av = a[field]
      const bv = b[field]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return dir === 'asc' ? -1 : 1
      if (av > bv) return dir === 'asc' ? 1 : -1
      return 0
    })
  }

  if (options.offset) {
    result = result.slice(options.offset)
  }

  if (options.limit) {
    result = result.slice(0, options.limit)
  }

  return result
}
