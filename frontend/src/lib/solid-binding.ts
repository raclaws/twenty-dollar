import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js'
import type { ReactiveStore } from './sync-engine/reactive'
import type { QueryOptions, Record } from './sync-engine/types'

export function createQuery(
  reactive: ReactiveStore,
  table: string,
  options?: QueryOptions | Accessor<QueryOptions | undefined>,
): Accessor<Record[]> {
  const [data, setData] = createSignal<Record[]>([])

  if (typeof options === 'function') {
    let unsub: (() => void) | null = null

    createEffect(() => {
      unsub?.()
      const opts = options()
      const obs = reactive.observe(table, opts)
      unsub = obs.subscribe(setData)
    })

    onCleanup(() => unsub?.())
  } else {
    const obs = reactive.observe(table, options)
    const unsub = obs.subscribe(setData)
    onCleanup(unsub)
  }

  return data
}

export function createRecord(
  reactive: ReactiveStore,
  table: string,
  id: Accessor<string>,
): Accessor<Record | undefined> {
  const all = createQuery(reactive, table)
  return () => all().find(r => r.id === id())
}
