export interface ChangeEvent {
  table: string
  id: string
  type: 'insert' | 'update' | 'delete'
  data?: Record<string, unknown>
  timestamp: number
}

export interface SyncAdapter {
  hydrate(table: string, since?: number): Promise<Record<string, unknown>[]>
  subscribe(tables: string[], onEvent: (event: ChangeEvent) => void): () => void
  push?(changes: ChangeEvent[]): Promise<{ ok: boolean }>
}

export interface SyncManagerOptions {
  adapter: SyncAdapter
  store: import('./types').SyncStore
  tables: string[]
  reactive?: import('./reactive').ReactiveStore
  onSynced?: () => void
  onError?: (err: Error) => void
}

export interface SyncManager {
  start(): Promise<void>
  stop(): void
  lastSyncTime(table: string): number
}

export function createSyncManager(options: SyncManagerOptions): SyncManager {
  const { adapter, store, tables, reactive, onSynced, onError } = options
  const lastSync: { [table: string]: number } = {}
  let unsubscribe: (() => void) | null = null

  async function hydrate() {
    for (const table of tables) {
      const since = lastSync[table] || 0
      try {
        const records = await adapter.hydrate(table, since || undefined)
        if (records.length === 0 && !since) {
          // No server data and first sync — preserve local IDB (e.g. seeded data)
          lastSync[table] = Date.now()
          continue
        }
        if (!since) await store.clear(table)
        if (records.length > 0) {
          await store.putMany(table, records as import('./types').Record[])
        }
        reactive?.notify(table)
        lastSync[table] = Date.now()
      } catch (err) {
        onError?.(err as Error)
      }
    }
  }

  function handleEvent(event: ChangeEvent) {
    const { table, id, type, data, timestamp } = event
    switch (type) {
      case 'insert':
      case 'update':
        if (data) {
          store.put(table, { id, ...data } as import('./types').Record)
        }
        break
      case 'delete':
        store.delete(table, id)
        break
    }
    lastSync[table] = timestamp
    reactive?.notify(table)
  }

  return {
    async start() {
      await hydrate()
      unsubscribe = adapter.subscribe(tables, handleEvent)
      onSynced?.()
    },

    stop() {
      unsubscribe?.()
      unsubscribe = null
    },

    lastSyncTime(table: string) {
      return lastSync[table] || 0
    }
  }
}
