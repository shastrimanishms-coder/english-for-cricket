// Word-level scoring for speaking practice.
//
// A speech recogniser (device or browser) turns the student's voice
// into a transcript; this module compares that transcript against the
// target phrase word by word, so the feedback can show exactly which
// words landed and which need another try:
//
//   correct  - the recogniser heard this word (green)
//   close    - it heard something very similar (orange)
//   wrong    - it heard a different word in this slot (red)
//   missing  - the word never made it into the transcript (red)
//
// The pass mark is deliberately forgiving (70%): the app is global,
// used by children and adults with every accent, and the recognisers
// themselves are imperfect. A "close" word earns half credit.

export const SPEECH_PASS_MARK = 70;

export type WordStatus = 'correct' | 'close' | 'wrong' | 'missing';

export interface ScoredWord {
  /** The target word, as written in the phrase. */
  word: string;
  status: WordStatus;
  /** What the recogniser heard in this slot, when it heard something else. */
  heard?: string;
}

export interface SpeechScore {
  /** 0-100. Correct words count 1, close words count 0.5. */
  accuracy: number;
  passed: boolean;
  words: ScoredWord[];
  /** Words the student added that are not in the target phrase. */
  extraWords: string[];
}

/** Lowercase, drop punctuation, split into words. */
export function normalizeWords(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/** Character-level Levenshtein distance (small strings only). */
function charDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[n];
}

/** Two words are "close" when a recogniser could plausibly confuse them. */
function isCloseWord(target: string, heard: string): boolean {
  if (target === heard) return false;
  const dist = charDistance(target, heard);
  const limit = Math.max(1, Math.floor(Math.max(target.length, heard.length) / 3));
  if (dist <= limit) return true;
  // Same opening sound (e.g. "bowls" heard as "balls" shares the frame,
  // "ship"/"sheep" style vowel slips share the start).
  return target.length >= 3 && heard.length >= 3 && target[0] === heard[0] && dist <= limit + 1;
}

export function scoreSpeech(target: string, transcript: string): SpeechScore {
  const targetWords = normalizeWords(target);
  const heardWords = normalizeWords(transcript);

  if (targetWords.length === 0) {
    return { accuracy: 0, passed: false, words: [], extraWords: heardWords };
  }
  if (heardWords.length === 0) {
    return {
      accuracy: 0,
      passed: false,
      words: targetWords.map((word) => ({ word, status: 'missing' as WordStatus })),
      extraWords: [],
    };
  }

  // Word-level edit-distance alignment between target and transcript.
  const m = targetWords.length;
  const n = heardWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // target word missing
        dp[i][j - 1] + 1, // extra heard word
        dp[i - 1][j - 1] + (targetWords[i - 1] === heardWords[j - 1] ? 0 : 1)
      );
    }
  }

  const words: ScoredWord[] = new Array(m);
  const extraWords: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && targetWords[i - 1] === heardWords[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      words[i - 1] = { word: targetWords[i - 1], status: 'correct' };
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      const t = targetWords[i - 1];
      const h = heardWords[j - 1];
      words[i - 1] = { word: t, status: isCloseWord(t, h) ? 'close' : 'wrong', heard: h };
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      words[i - 1] = { word: targetWords[i - 1], status: 'missing' };
      i--;
    } else if (j > 0) {
      extraWords.unshift(heardWords[j - 1]);
      j--;
    } else {
      words[i - 1] = { word: targetWords[i - 1], status: 'missing' };
      i--;
    }
  }

  let credit = 0;
  for (const w of words) {
    if (w.status === 'correct') credit += 1;
    else if (w.status === 'close') credit += 0.5;
  }
  const accuracy = Math.round((credit / m) * 100);
  return { accuracy, passed: accuracy >= SPEECH_PASS_MARK, words, extraWords };
}

/** Short, encouraging headline for a score. Never punitive - kids use this. */
export function scoreMessage(accuracy: number): string {
  if (accuracy >= 90) return 'Excellent! That sounded great! 🌟';
  if (accuracy >= SPEECH_PASS_MARK) return "Great — that's a pass! ✅";
  if (accuracy >= 50) return 'Good try — almost there! 💪';
  return 'Keep going — listen once more and try again 🎧';
}
