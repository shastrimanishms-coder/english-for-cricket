import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

/**
 * Back navigation that can never strand the learner.
 *
 * A bare router.back() is a silent no-op when the current screen was
 * opened without navigation history (refreshed web page, deep link,
 * post-login redirect), which made the galleries feel like a dead end.
 * This goes back when there is history to go back to, and otherwise
 * replaces with the fallback route (the learner home by default).
 */
export function useSafeBack(fallback: Href = '/learner') {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  }, [router, fallback]);
}
