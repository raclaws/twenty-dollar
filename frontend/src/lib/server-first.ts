import { updateSyncStatus, updatePendingCount } from '~/components/SyncIndicator'

export interface ServerFirstOpts<T> {
  optimistic: () => Promise<void>
  request: () => Promise<T>
  rollback: () => Promise<void>
}

export async function serverFirst<T>(opts: ServerFirstOpts<T>): Promise<T | null> {
  await opts.optimistic()
  updateSyncStatus('syncing')

  try {
    const result = await opts.request()
    updateSyncStatus('connected')
    return result
  } catch (err: any) {
    if (err?.status === 404) {
      updateSyncStatus('connected')
      return null
    }

    await opts.rollback()

    if (isOffline(err)) {
      addToOutbox(opts)
      updateSyncStatus('offline')
    } else {
      updateSyncStatus('error')
    }
    return null
  }
}

function isOffline(err: any): boolean {
  if (!navigator.onLine) return true
  if (err instanceof TypeError && err.message.includes('fetch')) return true
  return false
}

// --- Outbox ---

interface OutboxEntry {
  id: string
  timestamp: number
  opts: ServerFirstOpts<any>
}

let outbox: OutboxEntry[] = []
let draining = false
let drainTimer: ReturnType<typeof setInterval> | null = null

function addToOutbox(opts: ServerFirstOpts<any>) {
  outbox.push({ id: crypto.randomUUID(), timestamp: Date.now(), opts })
  updatePendingCount(outbox.length)
  startDrainLoop()
}

function startDrainLoop() {
  if (drainTimer) return
  drainTimer = setInterval(drainOutbox, 5000)
}

function stopDrainLoop() {
  if (drainTimer) {
    clearInterval(drainTimer)
    drainTimer = null
  }
}

async function drainOutbox() {
  if (draining || outbox.length === 0) return
  if (!navigator.onLine) return

  draining = true
  updateSyncStatus('syncing')

  while (outbox.length > 0) {
    const entry = outbox[0]
    try {
      await entry.opts.request()
      outbox.shift()
      updatePendingCount(outbox.length)
    } catch (err: any) {
      if (isOffline(err)) {
        updateSyncStatus('offline')
        break
      }
      if (err?.status >= 400 && err?.status < 500) {
        outbox.shift()
        updatePendingCount(outbox.length)
        continue
      }
      break
    }
  }

  draining = false
  if (outbox.length === 0) {
    stopDrainLoop()
    updateSyncStatus('connected')
  }
}

export function getOutboxCount(): number {
  return outbox.length
}
