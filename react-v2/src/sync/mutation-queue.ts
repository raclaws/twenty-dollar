/**
 * MutationQueue — persisted to IDB "mutation_queue" store.
 * FIFO processing, retry max 3 with exponential backoff.
 * Framework-agnostic — no React/MobX imports.
 */

import type { MutationEntry } from '@/types';
import { idbGetAll, idbPut, idbDelete, idbClear } from './idb';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

let processing = false;

/** In-memory queue (mirror of IDB for fast access) */
let queue: MutationEntry[] = [];

/** Load queue from IDB on init */
export async function hydrateQueue(): Promise<void> {
  const entries = await idbGetAll<MutationEntry>('mutation_queue');
  queue = entries.sort((a, b) => a.timestamp - b.timestamp);
}

/** Add a mutation to the queue (persists to IDB immediately) */
export async function enqueue(entry: Omit<MutationEntry, 'retries'>): Promise<void> {
  const full: MutationEntry = { ...entry, retries: 0 };
  queue.push(full);
  await idbPut('mutation_queue', full);
}

/** Get pending count */
export function pendingCount(): number {
  return queue.length;
}

/** Flush queue — FIFO, exponential backoff on failure */
export async function flush(): Promise<void> {
  if (processing) return;
  if (queue.length === 0) return;
  if (!navigator.onLine) return;

  processing = true;

  try {
    while (queue.length > 0) {
      const entry = queue[0];

      try {
        const response = await fetch(entry.path, {
          method: entry.method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: entry.body ? JSON.stringify(entry.body) : undefined,
        });

        if (response.ok || response.status === 409 || response.status === 404) {
          // Success or conflict/not-found (non-retryable) — remove from queue
          queue.shift();
          await idbDelete('mutation_queue', entry.id);
        } else if (response.status === 401) {
          // Auth failure — stop processing, user needs to re-authenticate
          break;
        } else {
          // Server error — retry with backoff
          entry.retries++;
          if (entry.retries >= MAX_RETRIES) {
            // Drop after max retries
            queue.shift();
            await idbDelete('mutation_queue', entry.id);
            console.error('[MutationQueue] Dropped after max retries:', entry);
          } else {
            // Update retries in IDB and wait
            await idbPut('mutation_queue', entry);
            const delay = BASE_DELAY_MS * Math.pow(2, entry.retries - 1);
            await sleep(delay);
          }
        }
      } catch {
        // Network error — stop processing (offline)
        break;
      }
    }
  } finally {
    processing = false;
  }
}

/** Synchronous flush via sendBeacon (best-effort for beforeunload) */
export function flushSync(): void {
  for (const entry of queue) {
    if (entry.method === 'POST' || entry.method === 'PUT' || entry.method === 'PATCH') {
      const blob = new Blob(
        [JSON.stringify(entry.body)],
        { type: 'application/json' }
      );
      navigator.sendBeacon(entry.path, blob);
    }
  }
}

/** Clear all pending mutations */
export async function clearQueue(): Promise<void> {
  queue = [];
  await idbClear('mutation_queue');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
