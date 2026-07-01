import type { SyncAdapter, ChangeEvent } from './sync-engine'
import { updateSyncStatus } from '~/components/SyncIndicator'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const TABLE_TO_ENDPOINT: Record<string, string> = {
  accounts: '/api/accounts',
  payees: '/api/payees',
  category_groups: '/api/categories',
  categories: '/api/categories',
  transactions: '/api/transactions',
  split_entries: '',
  assignments: '/api/budget/assignments',
  schedules: '/api/schedules',
}

export function createRestAdapter(_baseUrl: string): SyncAdapter {
  return {
    async hydrate(table: string) {
      const endpoint = TABLE_TO_ENDPOINT[table]
      if (!endpoint) return []

      const res = await fetch(endpoint)
      if (!res.ok) return []
      const body = await res.json()

      if (table === 'category_groups') {
        return Array.isArray(body) ? body.map((g: any) => ({ id: g.id, name: g.name, icon: g.icon ?? null, sort_order: g.sort_order ?? 0 })) : []
      }
      if (table === 'categories') {
        if (!Array.isArray(body)) return []
        return body.flatMap((g: any) =>
          (g.categories ?? []).map((c: any) => ({
            id: c.id,
            group_id: c.group_id ?? g.id,
            name: c.name,
            icon: c.icon ?? null,
            sort_order: c.sort_order ?? 0,
            target_type: c.target_type ?? null,
            target_amount: c.target_amount ?? null,
            target_date: c.target_date ?? null,
          }))
        )
      }

      return Array.isArray(body) ? body : body.data ?? []
    },

    subscribe(_tables: string[], _onEvent: (event: ChangeEvent) => void) {
      return () => {}
    },

    async push(changes: ChangeEvent[]) {
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ changes }),
      })
      return { ok: res.ok }
    },
  }
}

function flashErrorThenRecover() {
  updateSyncStatus('error')
  setTimeout(() => updateSyncStatus('connected'), 2000)
}

function handleUnauthorized(status: number) {
  if (status === 401) {
    localStorage.removeItem('user_name')
    localStorage.removeItem('user_email')
    window.location.href = '/login'
  }
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  updateSyncStatus('syncing')
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      handleUnauthorized(res.status)
      flashErrorThenRecover()
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(res.status, err.error ?? 'Request failed')
    }
    updateSyncStatus('connected')
    return res.json()
  } catch (e) {
    if (!(e instanceof ApiError)) updateSyncStatus('offline')
    throw e
  }
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  updateSyncStatus('syncing')
  try {
    const res = await fetch(path)
    if (!res.ok) {
      handleUnauthorized(res.status)
      flashErrorThenRecover()
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(res.status, err.error ?? 'Request failed')
    }
    updateSyncStatus('connected')
    return res.json()
  } catch (e) {
    if (!(e instanceof ApiError)) updateSyncStatus('offline')
    throw e
  }
}

export async function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  updateSyncStatus('syncing')
  try {
    const res = await fetch(path, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      handleUnauthorized(res.status)
      flashErrorThenRecover()
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(res.status, err.error ?? 'Request failed')
    }
    updateSyncStatus('connected')
    return res.json()
  } catch (e) {
    if (!(e instanceof ApiError)) updateSyncStatus('offline')
    throw e
  }
}

export async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  updateSyncStatus('syncing')
  try {
    const res = await fetch(path, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      handleUnauthorized(res.status)
      flashErrorThenRecover()
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(res.status, err.error ?? 'Request failed')
    }
    updateSyncStatus('connected')
    return res.json()
  } catch (e) {
    if (!(e instanceof ApiError)) updateSyncStatus('offline')
    throw e
  }
}

export async function apiDelete(path: string): Promise<void> {
  updateSyncStatus('syncing')
  try {
    const res = await fetch(path, { method: 'DELETE' })
    if (!res.ok) {
      handleUnauthorized(res.status)
      flashErrorThenRecover()
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(res.status, err.error ?? 'Request failed')
    }
    updateSyncStatus('connected')
  } catch (e) {
    if (!(e instanceof ApiError)) updateSyncStatus('offline')
    throw e
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}
