import { createSignal, createMemo, onMount, onCleanup, type Component } from 'solid-js'
import { getOutboxCount, drainOutboxNow } from '~/lib/server-first'

export type SyncStatus = 'connected' | 'syncing' | 'offline' | 'error' | 'reconnecting'

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>('syncing')
const [lastSynced, setLastSynced] = createSignal<string>('')
const [pendingCount, setPendingCount] = createSignal(0)
const [displayStatus, setDisplayStatus] = createSignal<SyncStatus>('syncing')

export function useSyncStatus() {
  return { syncStatus, lastSynced, pendingCount }
}

let syncingHoldTimer: ReturnType<typeof setTimeout> | null = null

export function updateSyncStatus(status: SyncStatus) {
  setSyncStatus(status)
  if (status === 'syncing' || status === 'reconnecting') {
    setDisplayStatus(status)
    if (syncingHoldTimer) clearTimeout(syncingHoldTimer)
    syncingHoldTimer = setTimeout(() => { syncingHoldTimer = null }, 1500)
  } else if (status === 'connected') {
    setLastSynced('just now')
    if (syncingHoldTimer) {
      const remaining = 1500
      setTimeout(() => setDisplayStatus('connected'), remaining)
    } else {
      setDisplayStatus('connected')
    }
  } else {
    if (syncingHoldTimer) {
      setTimeout(() => setDisplayStatus(status), 1500)
    } else {
      setDisplayStatus(status)
    }
  }
}

export function updatePendingCount(count: number) {
  setPendingCount(count)
}

let retryInterval: ReturnType<typeof setInterval> | null = null

function startRetryLoop() {
  if (retryInterval) return
  retryInterval = setInterval(async () => {
    const current = syncStatus()
    if (current === 'connected') {
      stopRetryLoop()
      return
    }
    updateSyncStatus('reconnecting')
    await new Promise(r => setTimeout(r, 2500))
    try {
      const resp = await fetch('/api/health', { method: 'GET', signal: AbortSignal.timeout(3000) })
      if (resp.ok) {
        updateSyncStatus('connected')
        stopRetryLoop()
        if (getOutboxCount() > 0) drainOutboxNow()
      } else {
        updateSyncStatus('offline')
      }
    } catch {
      updateSyncStatus('offline')
    }
  }, 8000)
}

function stopRetryLoop() {
  if (retryInterval) {
    clearInterval(retryInterval)
    retryInterval = null
  }
}

export function useOnlineDetector() {
  function handleOnline() {
    updateSyncStatus('reconnecting')
    startRetryLoop()
  }

  function handleOffline() {
    updateSyncStatus('offline')
    startRetryLoop()
  }

  onMount(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (!navigator.onLine) {
      updateSyncStatus('offline')
    }
    startRetryLoop()
  })

  onCleanup(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })
}

const SyncIndicator: Component = () => {
  useOnlineDetector()

  const status = displayStatus

  const boxClass = createMemo(() => {
    if (pendingCount() > 0) return 'sync-box--pending'
    switch (status()) {
      case 'connected': return 'sync-box--connected'
      case 'syncing': return 'sync-box--syncing'
      case 'offline': return 'sync-box--offline'
      case 'error': return 'sync-box--error'
      case 'reconnecting': return 'sync-box--reconnecting'
    }
  })

  const label = createMemo(() => {
    const pending = pendingCount()
    if (pending > 0) return `Pending (${pending})`
    switch (status()) {
      case 'connected': return lastSynced() ? 'Saved' : 'Connected'
      case 'syncing': return 'Saving...'
      case 'offline': return 'Offline'
      case 'error': return 'Save failed'
      case 'reconnecting': return 'Connecting...'
    }
  })

  return (
    <div class="sync-indicator">
      <span class="sync-indicator__label">{label()}</span>
      <span class={`sync-box ${boxClass()}`} />
    </div>
  )
}

export default SyncIndicator
