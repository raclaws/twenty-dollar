/**
 * serverFirst — optimistic update with rollback on server error.
 * Framework-agnostic (no React/MobX imports).
 *
 * Flow:
 *   Online:  optimistic() → fetch → if !ok → rollback()
 *   Offline: optimistic() → fetch throws → detect offline → onOffline() (queue) → keep optimistic
 */

export interface ServerFirstOpts {
  /** Apply the optimistic local state change immediately */
  optimistic: () => void;
  /** The actual API call — must return a Response (or throw on network error) */
  request: () => Promise<Response>;
  /** Revert local state on server failure */
  rollback: () => void;
  /** Called when offline — use this to enqueue the mutation for later retry */
  onOffline?: () => void;
}

/**
 * Execute a server-first optimistic mutation.
 * Returns true if the optimistic change stands, false if rolled back.
 */
export async function serverFirst(opts: ServerFirstOpts): Promise<boolean> {
  opts.optimistic();

  try {
    const res = await opts.request();
    if (!res.ok) {
      opts.rollback();
      return false;
    }
    return true;
  } catch (_err: unknown) {
    if (!navigator.onLine) {
      // Offline — keep optimistic change, enqueue for later
      opts.onOffline?.();
      return true;
    }
    // Online but request failed (server down, CORS, etc.) — rollback
    opts.rollback();
    return false;
  }
}
