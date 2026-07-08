import type { Record, QueryOptions } from './types'

export type Listener<T> = (value: T) => void
export type Unsubscribe = () => void

export interface Observable<T> {
  get(): T
  subscribe(listener: Listener<T>): Unsubscribe
}

export interface ReactiveStore {
  observe(table: string, options?: QueryOptions): Observable<Record[]>
  notify(table: string): void
}

export function createReactiveLayer(store: import('./types').SyncStore): ReactiveStore {
  const subscriptions: Map<string, Set<() => void>> = new Map()

  function getTableSubs(table: string) {
    if (!subscriptions.has(table)) {
      subscriptions.set(table, new Set())
    }
    return subscriptions.get(table)!
  }

  return {
    observe(table: string, options?: QueryOptions): Observable<Record[]> {
      let current: Record[] = []
      const listeners: Set<Listener<Record[]>> = new Set()
      let initialized = false

      function refresh() {
        current = store.query(table, options)
        for (const fn of listeners) fn(current)
      }

      // Register this query to be refreshed when table changes
      const tableSubs = getTableSubs(table)
      const refreshFn = () => { refresh() }
      tableSubs.add(refreshFn)

      return {
        get() {
          if (!initialized) {
            initialized = true
            refresh()
          }
          return current
        },

        subscribe(listener: Listener<Record[]>): Unsubscribe {
          listeners.add(listener)
          if (!initialized) {
            initialized = true
            refresh()
          } else if (current.length > 0) {
            listener(current)
          }

          return () => {
            listeners.delete(listener)
            if (listeners.size === 0) {
              tableSubs.delete(refreshFn)
            }
          }
        }
      }
    },

    notify(table: string) {
      const subs = subscriptions.get(table)
      if (!subs) return
      queueMicrotask(() => {
        for (const fn of subs) fn()
      })
    }
  }
}
