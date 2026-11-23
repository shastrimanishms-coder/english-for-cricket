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
import { voiceUrlForText } from './lessonVoices';

let dingPlayer: AudioPlayer | null = null;

// The human-voice line player: when the current screen has resolved a
// Voice Studio recording for the line about to be spoken, the
// recording plays through here instead of the device voice. Kept
// separate from the ding player so the two never fight over a source.
let linePlayer: AudioPlayer | null = null;
let linePoll: ReturnType<typeof setInterval> | null = null;

function stopRecordingLine(): void {
  if (linePoll) {
    clearInterval(linePoll);
    linePoll = null;
  }
  try {
    linePlayer?.pause();
  } catch {
    // Pausing is best-effort.
  }
}

/**
 * Play a recorded line and call onEnded when it finishes. Mirrors the
 * lesson player's watch-the-player pattern: poll until playback has
 * started and then stopped, and give up waiting if it never starts
 * (a blocked autoplay must not stall the speaking flow - the caller's
 * own safety timer also fires). Returns false when playback could not
 * even be attempted, so the caller can fall back to the device voice.
 */
function playRecordingLine(
  url: string,
  onEnded: () => void,
  onProgress?: (currentTimeSec: number, durationSec: number) => void
): boolean {
  try {
    stopRecordingLine();
    if (!linePlayer) {
      linePlayer = createAudioPlayer({ uri: url });
    } else {
      linePlayer.replace({ uri: url });
    }
    linePlayer.play();
    const player = linePlayer;
    let started = false;
    const waited = Date.now();
    linePoll = setInterval(() => {
      try {
        if (player.playing || player.currentTime > 0) started = true;
        // Report the player's own clock: callers that highlight words
        // pace themselves by the real recording, not by an estimate,
        // so every voice stays in step.
        if (onProgress && player.duration > 0) {
          onProgress(player.currentTime, player.duration);
        }
        if ((started && !player.playing) || (!started && Date.now() - waited > 2500)) {
          stopRecordingLine();
          onEnded();
        }
      } catch {
        stopRecordingLine();
        onEnded();
      }
    }, onProgress ? 120 : 200);
    return true;
  } catch (error) {
    console.log('Recorded line playback unavailable:', error);
    return false;
  }
}

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
 * Play a recorded line for screens with their own narration flow
 * (Smart Reading): onEnded fires when the recording finishes, and the
 * returned function stops it early (and suppresses onEnded). If the
 * recording cannot be played at all, onEnded fires at once so the
 * caller's own timers remain the only clock.
 */
export function playRecordedLine(
  url: string,
  onEnded: () => void,
  onProgress?: (currentTimeSec: number, durationSec: number) => void
): () => void {
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnded();
  };
  if (!playRecordingLine(url, finish, onProgress)) {
    finish();
    return () => {};
  }
  return () => {
    ended = true;
    stopRecordingLine();
  };
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
  // A human recording, when the current screen resolved one for this
  // exact line, always wins over the device voice. The mic floor set
  // above still applies: a recording's real length is close to the
  // word-count estimate, and the floor only ever errs on the safe
  // side (a slightly longer pause before the microphone opens).
  const recordingUrl = voiceUrlForText(text);
  if (recordingUrl) {
    try {
      Speech.stop();
    } catch {
      // Nothing to stop; the recording attempt proceeds regardless.
    }
    if (playRecordingLine(recordingUrl, fire)) return;
  }
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
  stopRecordingLine();
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
