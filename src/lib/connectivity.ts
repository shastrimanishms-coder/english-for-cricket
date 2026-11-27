import { Platform } from 'react-native';

/**
 * Connectivity helpers (Round 93, offline packs Phase 1).
 *
 * `navigator.onLine` is the browser's own verdict: false means the
 * device definitely has no route to the network (airplane mode,
 * Wi-Fi off), while true only means "probably connected" — a dead
 * router still reports true. Callers therefore use this only as a
 * fast path: when it says offline, queue/serve locally without
 * burning time on doomed requests; when it says online, sends are
 * attempted for real and any network-flavoured failure is treated
 * as offline after the fact (see isNetworkError in progressQueue).
 *
 * Native builds have no offline-pack support in Phase 1, so this
 * always reports "online" there and every code path behaves exactly
 * as it did before this module existed.
 */
export function isOfflineNow(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

/** Subscribe to the browser's "back online" moment. Returns an unsubscribe. */
export function onBackOnline(handler: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
