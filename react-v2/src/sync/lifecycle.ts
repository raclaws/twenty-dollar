/**
 * Lifecycle handlers — manages page visibility, online/offline, beforeunload.
 * Framework-agnostic — no React/MobX imports.
 */

import { flush, flushSync } from './mutation-queue';

export type NetworkStatus = 'online' | 'offline';

let networkStatusCallback: ((status: NetworkStatus) => void) | null = null;
let rehydrateCallback: (() => Promise<void>) | null = null;

export function registerLifecycleHandlers(options: {
  onNetworkChange: (status: NetworkStatus) => void;
  onRehydrate: () => Promise<void>;
}): () => void {
  networkStatusCallback = options.onNetworkChange;
  rehydrateCallback = options.onRehydrate;

  // Online/offline
  const handleOnline = () => {
    networkStatusCallback?.('online');
    flush();
  };

  const handleOffline = () => {
    networkStatusCallback?.('offline');
  };

  // Visibility change
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      flush();
    }
  };

  // Before unload — sync flush
  const handleBeforeUnload = () => {
    flushSync();
  };

  // Page show (bfcache restoration)
  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      rehydrateCallback?.();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('pageshow', handlePageShow);

  // Set initial status
  networkStatusCallback?.(navigator.onLine ? 'online' : 'offline');

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pageshow', handlePageShow);
    networkStatusCallback = null;
    rehydrateCallback = null;
  };
}
