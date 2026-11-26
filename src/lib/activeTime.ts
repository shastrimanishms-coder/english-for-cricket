import { AppState, Platform } from 'react-native';
import type { ActiveTimeEnvironment } from './activeTimeCore';

export * from './activeTimeCore';

/**
 * Platform environments for the ActiveTimeTracker (Round 81). The
 * shipped product is the static web export, so the web adapter is the
 * primary one; the native adapter keeps the same rule as far as React
 * Native allows (AppState foreground = visible + focused; navigation
 * changes are fed in as interactions by useActivityLogger, since
 * native has no global pointer/key event stream to listen to).
 */

function createWebEnvironment(): ActiveTimeEnvironment {
  const doc = document;
  const win = window;
  return {
    isVisible: () => doc.visibilityState === 'visible',
    isFocused: () => (typeof doc.hasFocus === 'function' ? doc.hasFocus() : true),
    onInteraction: (cb) => {
      // Capture-phase + passive: hear about the gesture without ever
      // interfering with it. Scroll counts: reading a long story page
      // is active use even between taps.
      const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
      for (const name of events) {
        win.addEventListener(name, cb, { passive: true, capture: true });
      }
      return () => {
        for (const name of events) {
          win.removeEventListener(name, cb, { capture: true } as EventListenerOptions);
        }
      };
    },
    onVisibilityChange: (cb) => {
      doc.addEventListener('visibilitychange', cb);
      win.addEventListener('focus', cb);
      win.addEventListener('blur', cb);
      return () => {
        doc.removeEventListener('visibilitychange', cb);
        win.removeEventListener('focus', cb);
        win.removeEventListener('blur', cb);
      };
    },
  };
}

function createNativeEnvironment(): ActiveTimeEnvironment {
  return {
    isVisible: () => AppState.currentState === 'active',
    isFocused: () => AppState.currentState === 'active',
    // No global gesture stream exists on native; useActivityLogger
    // notes every navigation/screen change as an interaction, and
    // returning the app to the foreground counts too (below).
    onInteraction: () => () => {},
    onVisibilityChange: (cb) => {
      const sub = AppState.addEventListener('change', cb);
      return () => sub.remove();
    },
  };
}

export function createActiveTimeEnvironment(): ActiveTimeEnvironment {
  if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
    return createWebEnvironment();
  }
  return createNativeEnvironment();
}
