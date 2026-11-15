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
  const timeoutMs = Math.min(9000, Math.max(1600, words * 480 + 1000));
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

/** Stop any cue speech and invalidate its pending completion. */
export function cancelSpeechCue(): void {
  speakSeq++;
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
