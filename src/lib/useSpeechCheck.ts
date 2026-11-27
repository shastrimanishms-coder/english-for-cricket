import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Speech recognition for Speak & Repeat slides and Speaking Practice.
//
// Wraps expo-speech-recognition (device recogniser on iOS/Android,
// the Web Speech API on web) behind a small hook with three outcomes:
// a final transcript, an error, or "unsupported". Unsupported is a
// first-class result, not a failure: Firefox has no Web Speech API,
// Expo Go has no native module, and some devices have no recogniser -
// in all those cases the caller falls back to record-and-listen or
// say-it-out-loud practice, so nobody is ever blocked by their device.
//
// The native module is required lazily inside functions, never at
// module scope: evaluating it during web SSR can touch browser-only
// globals, the same trap the audio code in this app already avoids.

export type SpeechCheckError = 'permission' | 'no-speech' | 'network' | 'unsupported' | 'unknown';

interface SpeechModuleShape {
  ExpoSpeechRecognitionModule?: {
    start: (options: Record<string, unknown>) => void;
    stop: () => void;
    abort: () => void;
    requestPermissionsAsync?: () => Promise<{ granted: boolean }>;
    isRecognitionAvailable?: () => boolean;
    addListener?: (
      event: string,
      listener: (event: any) => void
    ) => { remove: () => void } | undefined;
  };
}

let cachedModule: SpeechModuleShape | null | undefined;

function loadSpeechModule(): SpeechModuleShape | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('expo-speech-recognition') as SpeechModuleShape;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

function probeSupported(): boolean {
  const mod = loadSpeechModule()?.ExpoSpeechRecognitionModule;
  if (!mod) return false;
  try {
    if (typeof mod.isRecognitionAvailable === 'function') {
      return mod.isRecognitionAvailable();
    }
    return Platform.OS !== 'web';
  } catch {
    return false;
  }
}

function mapErrorCode(code: string | undefined): SpeechCheckError {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission';
    case 'no-speech':
    case 'nomatch':
    case 'aborted':
      // An abort we did not ask for (browser stopped the session)
      // reads to the learner as "nothing was heard".
      return 'no-speech';
    case 'network':
      return 'network';
    default:
      return 'unknown';
  }
}

export function speechErrorMessage(error: SpeechCheckError): string {
  switch (error) {
    case 'permission':
      return 'Microphone permission is needed to check your speaking. You can allow it in your browser or device settings.';
    case 'no-speech':
      return "I couldn't hear anything that time — try again a little louder.";
    case 'network':
      return 'The speech checker needs an internet connection to hear you, and it could not connect that time. Please check your connection and try again. You can still record your voice or say the line out loud.';
    case 'unsupported':
      return "This device or browser can't check speech automatically.";
    default:
      return 'The speech checker hit a problem — please try again.';
  }
}

/**
 * How long a session may produce NOTHING AT ALL - no result, no
 * error, no end - before the hook gives up and reports 'no-speech'.
 * Chrome's own silence timeout is much shorter than this, so on a
 * healthy recogniser the watchdog never fires; it exists for the
 * sessions where Chrome's online speech service stalls silently
 * (a network hiccup can leave a session open with no result and
 * no error), which otherwise leaves the learner staring at
 * "Listening…" with a dead microphone button.
 * Any interim result pushes the deadline out by the full span.
 */
export const SPEECH_NO_HEAR_TIMEOUT_MS = 15000;

interface UseSpeechCheckOptions {
  /**
   * A finished recognition. `transcript` is the recogniser's top
   * candidate; `alternatives` is every candidate it returned for
   * the utterance (top first, always including `transcript`), so
   * scorers can use scoreSpeechBest - a lone word is often the
   * recogniser's second or third candidate, not its first.
   */
  onFinal: (transcript: string, alternatives: string[]) => void;
  onError: (error: SpeechCheckError) => void;
}

export function useSpeechCheck({ onFinal, onError }: UseSpeechCheckOptions) {
  // null = not probed yet (render nothing speech-specific until known).
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');

  const callbacksRef = useRef({ onFinal, onError });
  useEffect(() => {
    callbacksRef.current = { onFinal, onError };
  }, [onFinal, onError]);

  const subscriptionsRef = useRef<{ remove: () => void }[]>([]);
  const finalSeenRef = useRef(false);
  // The latest interim transcript. Some browsers end a session (or
  // report no-speech) without ever delivering a formal final result,
  // even though the learner's words were already on screen as the
  // interim line - in that case these words are the honest result
  // and must be scored, not thrown away as "nothing heard".
  const interimRef = useRef('');
  const activeRef = useRef(false);
  // Mic permission is asked once per hook instance: asking again on
  // every start spams the console on web (requestPermissionsAsync is
  // a no-op there) and can disturb a session that is about to begin.
  const permissionRef = useRef<'unknown' | 'granted' | 'denied'>('unknown');
  // Set when WE stop/abort a session on purpose, so the 'aborted'
  // error the recogniser then reports is swallowed instead of being
  // shown to the learner as a failure.
  const deliberateRef = useRef(false);
  // The no-hear watchdog (see SPEECH_NO_HEAR_TIMEOUT_MS). Armed when
  // a session starts, re-armed by every result event, cleared by
  // every terminal event.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const cleanupListeners = useCallback(() => {
    for (const sub of subscriptionsRef.current) {
      try {
        sub.remove();
      } catch {
        // Already removed: fine.
      }
    }
    subscriptionsRef.current = [];
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      // Probing touches the native module / browser API; keep it out
      // of the render path entirely.
      const ok = probeSupported();
      if (live) setSupported(ok);
    })();
    return () => {
      live = false;
      clearWatchdog();
      cleanupListeners();
      if (activeRef.current) {
        try {
          loadSpeechModule()?.ExpoSpeechRecognitionModule?.abort();
        } catch {
          // Nothing to abort: fine.
        }
        activeRef.current = false;
      }
    };
  }, [cleanupListeners, clearWatchdog]);

  const start = useCallback(async () => {
    const mod = loadSpeechModule()?.ExpoSpeechRecognitionModule;
    if (!mod || !probeSupported()) {
      callbacksRef.current.onError('unsupported');
      return;
    }

    if (permissionRef.current === 'denied') {
      callbacksRef.current.onError('permission');
      return;
    }
    if (permissionRef.current === 'unknown') {
      try {
        if (mod.requestPermissionsAsync) {
          const permission = await mod.requestPermissionsAsync();
          permissionRef.current = permission.granted ? 'granted' : 'denied';
          if (!permission.granted) {
            callbacksRef.current.onError('permission');
            return;
          }
        } else {
          permissionRef.current = 'granted';
        }
      } catch {
        // Permission APIs differ per platform; a failure here usually
        // surfaces again as a start error, which is mapped below.
        permissionRef.current = 'granted';
      }
    }

    // Rapid slide flows (lessons especially) can ask for a new
    // session while the previous one is still tearing down; starting
    // over the top of it makes Chrome abort BOTH sessions and the
    // learner hears nothing. Kill the old session first and give it
    // a beat to die before the new one begins.
    if (activeRef.current) {
      deliberateRef.current = true;
      try {
        mod.abort();
      } catch {
        // Already dead: fine.
      }
      activeRef.current = false;
      setListening(false);
      cleanupListeners();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    cleanupListeners();
    clearWatchdog();
    finalSeenRef.current = false;
    interimRef.current = '';
    deliberateRef.current = false;
    setInterim('');

    const addSub = (event: string, listener: (e: any) => void) => {
      try {
        const sub = mod.addListener?.(event, listener);
        if (sub) subscriptionsRef.current.push(sub);
      } catch {
        // Listener registration failed: start() below will error out.
      }
    };

    // Deliver the words that were heard as the session's result -
    // the interim line, when no formal final ever carried them.
    const deliverInterim = () => {
      const heard = interimRef.current.trim();
      if (!heard) return false;
      finalSeenRef.current = true;
      callbacksRef.current.onFinal(heard, [heard]);
      return true;
    };

    // The no-hear watchdog: if the recogniser produces nothing at
    // all for a long stretch, end the session honestly (the words
    // heard so far, if any, still count) instead of hanging in
    // "Listening…" forever. See SPEECH_NO_HEAR_TIMEOUT_MS.
    const armWatchdog = () => {
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        if (!activeRef.current || finalSeenRef.current) return;
        activeRef.current = false;
        setListening(false);
        cleanupListeners();
        try {
          loadSpeechModule()?.ExpoSpeechRecognitionModule?.abort();
        } catch {
          // Nothing to abort: fine.
        }
        if (!deliverInterim()) {
          callbacksRef.current.onError('no-speech');
        }
      }, SPEECH_NO_HEAR_TIMEOUT_MS);
    };

    addSub('result', (event: any) => {
      // Any sign of life pushes the no-hear deadline out.
      armWatchdog();
      // Every candidate the recogniser returned for this utterance,
      // top first. On web the module packs the alternatives of the
      // final segment into `results`; native events do the same.
      const alternatives: string[] = [];
      const results: any[] = Array.isArray(event?.results) ? event.results : [];
      for (const r of results) {
        const t = (r?.transcript || '').trim();
        if (t && !alternatives.includes(t)) alternatives.push(t);
      }
      if (event?.isFinal) {
        finalSeenRef.current = true;
        setInterim('');
        setListening(false);
        activeRef.current = false;
        clearWatchdog();
        cleanupListeners();
        if (alternatives.length > 0) {
          callbacksRef.current.onFinal(alternatives[0], alternatives);
        } else if (interimRef.current.trim()) {
          // The formal final came back EMPTY but the learner was
          // heard along the way (the interim line was on screen):
          // those words are the honest result, not "nothing heard".
          // A one-word answer lives or dies by this - a short
          // utterance is exactly the case where some recognisers
          // re-segment and emit an empty final.
          deliverInterim();
        } else {
          callbacksRef.current.onError('no-speech');
        }
      } else if (alternatives.length > 0) {
        interimRef.current = alternatives[0];
        setInterim(alternatives[0]);
      }
    });
    addSub('error', (event: any) => {
      setListening(false);
      activeRef.current = false;
      clearWatchdog();
      cleanupListeners();
      // An abort we requested ourselves is not a failure - but it
      // must not silently eat words that were already heard either.
      // When a session is stopped (the lesson's Stop button, moving
      // on in Speaking Practice) before the formal final lands, a
      // short answer often exists ONLY as the interim line; dropping
      // it is precisely the "it never hears my single word" failure.
      if (event?.error === 'aborted' && deliberateRef.current) {
        if (!finalSeenRef.current) deliverInterim();
        return;
      }
      const mapped = mapErrorCode(event?.error);
      // A no-speech report that contradicts words already heard
      // (they were on screen as the interim line) is a browser
      // quirk, not silence: score the words.
      if (mapped === 'no-speech' && !finalSeenRef.current && interimRef.current.trim()) {
        deliverInterim();
        return;
      }
      callbacksRef.current.onError(mapped);
    });
    addSub('end', () => {
      setListening(false);
      clearWatchdog();
      if (activeRef.current && !finalSeenRef.current) {
        activeRef.current = false;
        cleanupListeners();
        // The session ended without a formal final result. If words
        // were heard along the way, they are the result; only true
        // silence is a no-speech error.
        if (!deliverInterim()) {
          callbacksRef.current.onError('no-speech');
        }
      }
    });

    try {
      activeRef.current = true;
      setListening(true);
      mod.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        // Ask for the runner-up hearings too: scoreSpeechBest can
        // only rescue a lone word ranked second or third if the
        // recogniser actually returns it.
        maxAlternatives: 3,
      });
      armWatchdog();
    } catch {
      setListening(false);
      activeRef.current = false;
      clearWatchdog();
      cleanupListeners();
      callbacksRef.current.onError('unknown');
    }
  }, [cleanupListeners, clearWatchdog]);

  const stop = useCallback(() => {
    deliberateRef.current = true;
    try {
      loadSpeechModule()?.ExpoSpeechRecognitionModule?.stop();
    } catch {
      // Not running: fine.
    }
  }, []);

  const abort = useCallback(() => {
    deliberateRef.current = true;
    try {
      loadSpeechModule()?.ExpoSpeechRecognitionModule?.abort();
    } catch {
      // Not running: fine.
    }
    setListening(false);
    activeRef.current = false;
    clearWatchdog();
    cleanupListeners();
  }, [cleanupListeners, clearWatchdog]);

  return { supported, listening, interim, start, stop, abort };
}
