import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

// Shared cues for the hands-free speaking flow used by Speak &
// Repeat lesson slides and by Speaking Practice:
//
//   1. the model line speaks automatically when the slide/turn loads
//   2. a short ding sounds when it becomes the learner's turn
//   3. the microphone opens by itself and closes when they finish
//
// Everything here fails soft: a missing voice, a blocked autoplay or
// a broken player must never block practice - the Listen and Speak
// buttons always remain as the manual path.

import dingAsset from '../../assets/sounds/ding.wav';

let dingPlayer: AudioPlayer | null = null;

/** The "your turn" chime. Lazily created (never during render). */
export function playDing(): void {
  try {
    if (!dingPlayer) {
      dingPlayer = createAudioPlayer(dingAsset);
    } else {
      try {
        void dingPlayer.seekTo(0);
      } catch {
        // Seeking is best-effort.
      }
    }
    dingPlayer.play();
  } catch (error) {
    console.log('Ding playback unavailable:', error);
  }
}

/**
 * Clean a display string before handing it to the device voice.
 * Slide text is written for eyes - emoji markers (⭐ 🎬 🏏), gap
 * blanks (___) - and voices read those literally: "star", "clapper
 * board", "underscore underscore underscore". Strip pictographs and
 * symbols, turn gap blanks into the word "blank", and collapse the
 * extra spaces so the voice only ever reads the actual words.
 */
export function toSpeechText(text: string): string {
  return (text || '')
    .replace(/_+/g, ' blank ')
    .replace(/[\p{Extended_Pictographic}\p{So}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sequence guard: starting (or cancelling) a line invalidates every
// earlier pending completion callback, so a stale "finished" event
// can never open the microphone on the wrong slide.
let speakSeq = 0;

// Earliest moment the microphone may open after the most recent
// model line STARTED, as a wall-clock timestamp. Some voices report
// "done" (and drop their speechSynthesis.speaking flag) while the
// last words are still coming out of the speakers; neither signal
// can be trusted on its own, so the mic additionally waits out a
// duration floor estimated from the line's word count. Set by
// speakWithCallback; consumed by waitUntilSafeToListen.
let micFloorUntil = 0;

/**
 * Speak text aloud and call onDone exactly once when the line is
 * over - via the utterance's own done/stopped/error events when the
 * platform reports them, or a word-count-based estimate when it
 * never does (some web voices are silent about finishing).
 */
export function speakWithCallback(text: string, onDone?: () => void): void {
  const spoken = toSpeechText(text);
  if (!spoken) {
    onDone?.();
    return;
  }
  const seq = ++speakSeq;
  let fired = false;
  const fire = () => {
    if (fired || seq !== speakSeq) return;
    fired = true;
    onDone?.();
  };
  const words = spoken.split(/\s+/).length;
  // Mic floor for this line: typical speech runs ~400ms per word;
  // the floor adds a margin and is clamped so a one-word line still
  // gets a safe pause and a long line cannot stall the flow forever.
  micFloorUntil =
    Date.now() + Math.min(9000, Math.max(900, words * 420 + 500));
  // Generous on purpose: network voices (Chrome on Linux especially)
  // can speak much slower than this estimate, and firing early opens
  // the microphone while the model line is still playing - the
  // recogniser then hears the app instead of the learner. The real
  // onDone event wins whenever the platform reports it; this timer
  // is only the safety net for voices that never report finishing.
  const timeoutMs = Math.min(12000, Math.max(2200, words * 650 + 1800));
  setTimeout(fire, timeoutMs);
  try {
    Speech.stop();
    Speech.speak(spoken, {
      language: 'en',
      onDone: fire,
      onStopped: fire,
      onError: fire,
    });
  } catch (error) {
    console.log('Speech error:', error);
    fire();
  }
}

interface SpeechSynthLike {
  speaking: boolean;
  pending: boolean;
}

/**
 * Wait until the device voice is genuinely silent - not merely
 * reported finished. Some voices (Chrome's network voices on Linux
 * especially) fire their "done" event while the last word is still
 * coming out of the speakers; a microphone opened at that moment
 * hears the app itself and the learner gets scored on the model's
 * voice. Polls the browser's own speech queue; on native platforms
 * (no such queue to inspect) it resolves at once.
 */
export function waitForSpeechIdle(maxMs = 3500): Promise<void> {
  return new Promise((resolve) => {
    const synth = (globalThis as unknown as { speechSynthesis?: SpeechSynthLike })
      .speechSynthesis;
    if (!synth) {
      resolve();
      return;
    }
    const startedAt = Date.now();
    const check = () => {
      let busy = false;
      try {
        busy = synth.speaking || synth.pending;
      } catch {
        busy = false;
      }
      if (!busy || Date.now() - startedAt >= maxMs) {
        resolve();
        return;
      }
      setTimeout(check, 120);
    };
    check();
  });
}

/**
 * Wait until it is genuinely safe to open the microphone: the
 * duration floor of the most recent model line has passed AND the
 * browser's speech queue reports idle. Either signal alone has
 * proven unreliable (Chrome's network voices on Linux report both
 * "done" and not-speaking while audio is still playing, and the
 * recogniser then transcribes the app itself and passes the slide
 * without the learner saying a word). Resolves anyway after maxMs
 * so a stuck floor can never hang a slide.
 */
export function waitUntilSafeToListen(maxMs = 10000): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const floorLeft = micFloorUntil - Date.now();
      if (floorLeft <= 0 || Date.now() - startedAt >= maxMs) {
        void waitForSpeechIdle(2500).then(resolve);
        return;
      }
      setTimeout(check, Math.min(120, floorLeft));
    };
    check();
  });
}

/** Stop any cue speech and invalidate its pending completion. */
export function cancelSpeechCue(): void {
  speakSeq++;
  micFloorUntil = 0;
  try {
    Speech.stop();
  } catch {
    // TTS is a nicety, never a blocker.
  }
}

let voicesCache: boolean | null = null;

/**
 * Whether this device/browser has any speech voice at all. Linux
 * desktops and some browsers ship with zero voices, which makes
 * Listen silently do nothing; the screens use this to show an honest
 * hint instead. A probe failure answers "yes" (never nag wrongly).
 */
export async function probeVoicesAvailable(): Promise<boolean> {
  if (voicesCache !== null) return voicesCache;
  try {
    let voices = await Speech.getAvailableVoicesAsync();
    if (!voices || voices.length === 0) {
      // Web browsers often publish their voices a beat late.
      await new Promise(resolve => setTimeout(resolve, 700));
      voices = await Speech.getAvailableVoicesAsync();
    }
    voicesCache = Array.isArray(voices) && voices.length > 0;
  } catch {
    voicesCache = true;
  }
  return voicesCache;
}
