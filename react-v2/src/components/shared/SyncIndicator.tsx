import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';

export const SyncIndicator = observer(function SyncIndicator() {
  const { syncStatusStore } = useStore();
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function handleOnline() {
      syncStatusStore.setStatus('syncing');
      startRetry();
    }
    function handleOffline() {
      syncStatusStore.setStatus('offline');
      startRetry();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!navigator.onLine) {
      syncStatusStore.setStatus('offline');
    }
    startRetry();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (retryRef.current) clearInterval(retryRef.current);
    };
  }, [syncStatusStore]);

  function startRetry() {
    if (retryRef.current) return;
    retryRef.current = setInterval(async () => {
      if (syncStatusStore.status === 'online') {
        if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
        return;
      }
      syncStatusStore.setStatus('syncing');
      try {
        const resp = await fetch('/api/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
          syncStatusStore.setStatus('online');
          if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
        } else {
          syncStatusStore.setStatus('offline');
        }
      } catch {
        syncStatusStore.setStatus('offline');
      }
    }, 8000);
  }

  const status = syncStatusStore.status;
  const pending = syncStatusStore.pendingWriteCount;

  const boxClass = pending > 0
    ? 'sync-box--pending'
    : `sync-box--${status}`;

  const label = pending > 0
    ? `Pending (${pending})`
    : status === 'online' ? 'Saved'
    : status === 'syncing' ? 'Saving...'
    : status === 'offline' ? 'Offline'
    : 'Save failed';

  return (
    <div className="sync-indicator">
      <span className="sync-indicator__label">{label}</span>
      <span className={`sync-box ${boxClass}`} />
    </div>
  );
});
