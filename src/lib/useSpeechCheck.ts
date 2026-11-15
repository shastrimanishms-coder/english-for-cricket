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
      return 'The speech checker could not run in this browser — it needs an internet speech service, which some browsers (like Brave) block. Chrome works best. You can still record your voice or say the line out loud.';
    case 'unsupported':
      return "This device or browser can't check speech automatically.";
    default:
      return 'The speech checker hit a problem — please try again.';
  }
}

interface UseSpeechCheckOptions {
  onFinal: (transcript: string) => void;
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
  const activeRef = useRef(false);

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
  }, [cleanupListeners]);

  const start = useCallback(async () => {
    const mod = loadSpeechModule()?.ExpoSpeechRecognitionModule;
    if (!mod || !probeSupported()) {
      callbacksRef.current.onError('unsupported');
      return;
    }

    try {
      if (mod.requestPermissionsAsync) {
        const permission = await mod.requestPermissionsAsync();
        if (!permission.granted) {
          callbacksRef.current.onError('permission');
          return;
        }
      }
    } catch {
      // Permission APIs differ per platform; a failure here usually
      // surfaces again as a start error, which is mapped below.
    }

    cleanupListeners();
    finalSeenRef.current = false;
    setInterim('');

    const addSub = (event: string, listener: (e: any) => void) => {
      try {
        const sub = mod.addListener?.(event, listener);
        if (sub) subscriptionsRef.current.push(sub);
      } catch {
        // Listener registration failed: start() below will error out.
      }
    };

    addSub('result', (event: any) => {
      const transcript: string = event?.results?.[0]?.transcript || '';
      if (event?.isFinal) {
        finalSeenRef.current = true;
        setInterim('');
        setListening(false);
        activeRef.current = false;
        cleanupListeners();
        if (transcript.trim()) {
          callbacksRef.current.onFinal(transcript.trim());
        } else {
          callbacksRef.current.onError('no-speech');
        }
      } else if (transcript) {
        setInterim(transcript);
      }
    });
    addSub('error', (event: any) => {
      setListening(false);
      activeRef.current = false;
      cleanupListeners();
      callbacksRef.current.onError(mapErrorCode(event?.error));
    });
    addSub('end', () => {
      setListening(false);
      if (activeRef.current && !finalSeenRef.current) {
        activeRef.current = false;
        cleanupListeners();
        callbacksRef.current.onError('no-speech');
      }
    });

    try {
      activeRef.current = true;
      setListening(true);
      mod.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
    } catch {
      setListening(false);
      activeRef.current = false;
      cleanupListeners();
      callbacksRef.current.onError('unknown');
    }
  }, [cleanupListeners]);

  const stop = useCallback(() => {
    try {
      loadSpeechModule()?.ExpoSpeechRecognitionModule?.stop();
    } catch {
      // Not running: fine.
    }
  }, []);

  const abort = useCallback(() => {
    try {
      loadSpeechModule()?.ExpoSpeechRecognitionModule?.abort();
    } catch {
      // Not running: fine.
    }
    setListening(false);
    activeRef.current = false;
    cleanupListeners();
  }, [cleanupListeners]);

  return { supported, listening, interim, start, stop, abort };
}
