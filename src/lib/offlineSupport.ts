import { Platform } from 'react-native';
import { clearAllPacks } from './offlinePacks';
import { clearQueueForStudent, initProgressQueueSync } from './progressQueue';

/**
 * Offline support bootstrap (Round 93): called once from the root
 * layout. Two jobs:
 *
 *  1. Register the service worker (production web only — the dev
 *     server must never be cached, and native has no service
 *     workers). The worker itself lives in public/sw.js and is
 *     version-stamped at packaging time; the browser's own
 *     byte-compare on sw.js is what rolls a new build in.
 *  2. Arm the progress-queue replay triggers (reconnect, tab
 *     visible, once now) so anything earned offline is sent when
 *     the connection returns.
 *
 * Everything fails soft: a browser without service workers simply
 * never gets the offline shell, exactly as before this round.
 */
export function initOfflineSupport(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  initProgressQueueSync();

  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing (old browser, blocked) leaves the
      // online app untouched.
    });
  };
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

/**
 * Account deletion device cleanup (Round 93): the deleted student's
 * queued progress can never land (the account is gone), and the
 * packs on this device were built with that student's voice picks.
 * Both are removed. Another student sharing the device simply
 * downloads their packs again — packs are curriculum content, and
 * nothing of theirs is stored inside one.
 */
export async function clearOfflineDataForStudent(studentId: string): Promise<void> {
  try {
    await clearQueueForStudent(studentId);
  } catch {
    // Fail soft: deletion itself has already succeeded server-side.
  }
  try {
    await clearAllPacks();
  } catch {
    // Same reasoning — local cleanup must never block the flow.
  }
}
