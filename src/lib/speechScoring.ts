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
    .filter(Boolean)
    .flatMap((word) => CONTRACTIONS[word] || [word]);
}

// A speech check scores what the words SOUND like, not how they are
// spelled. Contractions are expanded so "don't" and "do not" - the
// same sounds - score the same either way round.
const CONTRACTIONS: Record<string, string[]> = {
  dont: ['do', 'not'],
  cant: ['can', 'not'],
  wont: ['will', 'not'],
  isnt: ['is', 'not'],
  arent: ['are', 'not'],
  didnt: ['did', 'not'],
  doesnt: ['does', 'not'],
  havent: ['have', 'not'],
  hasnt: ['has', 'not'],
  wasnt: ['was', 'not'],
  werent: ['were', 'not'],
  couldnt: ['could', 'not'],
  shouldnt: ['should', 'not'],
  wouldnt: ['would', 'not'],
  im: ['i', 'am'],
  youre: ['you', 'are'],
  hes: ['he', 'is'],
  shes: ['she', 'is'],
  its: ['it', 'is'],
  thats: ['that', 'is'],
  whats: ['what', 'is'],
  lets: ['let', 'us'],
  ive: ['i', 'have'],
  weve: ['we', 'have'],
  ill: ['i', 'will'],
  youll: ['you', 'will'],
  well: ['we', 'will'],
};

// Words a recogniser cannot tell apart by ear, plus number words and
// the digits recognisers often write instead. If the sounds are the
// same, the spoken word was right, whichever spelling came back.
const SOUND_EQUALS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  to: 'to',
  too: 'to',
  their: 'there',
  theyre: 'there',
  your: 'your',
  for: '4',
  see: 'see',
  sea: 'see',
  right: 'right',
  write: 'right',
  won: '1',
  by: 'by',
  buy: 'by',
  bye: 'by',
  here: 'here',
  hear: 'here',
  where: 'where',
  wear: 'where',
  are: 'are',
  r: 'are',
};

/** Canonical form for comparison: sound-equal words share one form. */
function soundForm(word: string): string {
  return SOUND_EQUALS[word] || word;
}

function sameWord(a: string, b: string): boolean {
  return soundForm(a) === soundForm(b);
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
        dp[i - 1][j - 1] + (sameWord(targetWords[i - 1], heardWords[j - 1]) ? 0 : 1)
      );
    }
  }

  const words: ScoredWord[] = new Array(m);
  const extraWords: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && sameWord(targetWords[i - 1], heardWords[j - 1]) && dp[i][j] === dp[i - 1][j - 1]) {
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

  // Lone-word targets get one extra fairness step: a near-twin
  // counts as close even when its opening sound differs - either it
  // is within two letter changes, or it keeps the word's ending and
  // is within half its length ("pitch" heard as "beach": the classic
  // short/long-vowel swap, same final sound). In a sentence the
  // stricter rule above applies, because the surrounding words carry
  // context; a single spoken word has nothing else to earn credit
  // from, and recognisers routinely swap an opening consonant.
  if (m === 1 && words[0].status === 'wrong' && words[0].heard) {
    const t = targetWords[0];
    const h = words[0].heard;
    const dist = charDistance(t, h);
    const keepsEnding = t[t.length - 1] === h[h.length - 1];
    if (dist <= 2 || (keepsEnding && dist <= Math.ceil(Math.max(t.length, h.length) / 2))) {
      words[0] = { ...words[0], status: 'close' };
    }
  }

  let credit = 0;
  for (const w of words) {
    if (w.status === 'correct') credit += 1;
    // A lone word has no sentence around it to carry the score, so
    // "close" (the recogniser heard a near-twin: "pitch" as "peach",
    // "team" as "Tim") earns most of the credit - at half credit a
    // well-said single word could never reach the pass mark.
    else if (w.status === 'close') credit += m === 1 ? 0.75 : 0.5;
  }
  const accuracy = Math.round((credit / m) * 100);
  return { accuracy, passed: accuracy >= SPEECH_PASS_MARK, words, extraWords };
}

export interface BestSpeechScore extends SpeechScore {
  /** The transcript that earned this score. */
  heard: string;
}

/**
 * Score a recognition result that came back with several candidate
 * transcripts (the recogniser's alternatives) and keep the best.
 *
 * A recogniser ranks its candidates by how likely the phrase is in
 * everyday language, not by what a child was asked to say - so for a
 * lone curriculum word the right hearing is routinely candidate #2
 * or #3 ("pitch" ranked below "page"). Scoring only the top
 * candidate throws that hearing away and reports a failure the
 * student did not earn. The alternatives are the recogniser's own
 * hearings of the SAME utterance, so taking the best-scoring one
 * invents nothing: it only stops the language model's ranking from
 * overruling the student's voice. Sentence behaviour is unchanged -
 * scoreSpeech itself is untouched; this only chooses which of the
 * recogniser's own transcripts gets scored.
 */
export function scoreSpeechBest(target: string, transcripts: string[]): BestSpeechScore {
  const unique: string[] = [];
  for (const t of transcripts || []) {
    const clean = (t || '').trim();
    if (clean && !unique.includes(clean)) unique.push(clean);
  }
  if (unique.length === 0) {
    return { ...scoreSpeech(target, ''), heard: '' };
  }
  let best: BestSpeechScore | null = null;
  for (const heard of unique) {
    const score = scoreSpeech(target, heard);
    if (!best || score.accuracy > best.accuracy) {
      best = { ...score, heard };
    }
  }
  return best as BestSpeechScore;
}

/** Short, encouraging headline for a score. Never punitive - kids use this. */
export function scoreMessage(accuracy: number): string {
  if (accuracy >= 90) return 'Excellent! That sounded great! 🌟';
  if (accuracy >= SPEECH_PASS_MARK) return "Great — that's a pass! ✅";
  if (accuracy >= 50) return 'Good try — almost there! 💪';
  return 'Keep going — listen once more and try again 🎧';
}
