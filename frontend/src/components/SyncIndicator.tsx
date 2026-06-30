import { createSignal, createMemo, onMount, onCleanup, type Component } from 'solid-js'

export type SyncStatus = 'connected' | 'syncing' | 'offline' | 'error' | 'reconnecting'

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>('offline')
const [lastSynced, setLastSynced] = createSignal<string>('')
const [pendingCount, setPendingCount] = createSignal(0)
const [displayStatus, setDisplayStatus] = createSignal<SyncStatus>('offline')

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
    switch (status()) {
      case 'connected': return 'sync-box--connected'
      case 'syncing': return 'sync-box--syncing'
      case 'offline': return 'sync-box--offline'
      case 'error': return 'sync-box--error'
      case 'reconnecting': return 'sync-box--reconnecting'
    }
  })

  const tooltip = createMemo(() => {
    switch (status()) {
      case 'connected': return 'Connected'
      case 'syncing': return 'Syncing...'
      case 'offline': return 'Offline'
      case 'error': return 'Sync failed'
      case 'reconnecting': return 'Connecting...'
    }
  })

  return (
    <div class={`sync-box ${boxClass()}`} title={tooltip()} />
  )
}

export default SyncIndicator
