/**
 * My Word Bank — the pure scheduling core (Round 92).
 *
 * Spaced repetition over the words a student has met in finished
 * lessons. This module is deliberately free of Supabase and React so
 * the ladder can be unit-tested directly; the database RPC
 * record_word_review (migration 40) implements EXACTLY the same
 * rules server-side, where the stored truth lives:
 *
 *   Steps: 0 = New, then intervals of 1, 3, 7, 14 and 30 days for
 *   steps 1..5, and step 6 = Mastered (never due again).
 *   Correct on the FIRST attempt of a review: one step later.
 *   Not correct on the first attempt: drop two steps, floored at
 *   step 1 (the first step of the ladder), lapses + 1, and the word
 *   is due again after the new step's interval — so it reappears in
 *   a later session, never again in the same one (a session is a
 *   snapshot taken at its start).
 *
 * PRIVACY: a bank row holds only a word's identity, its step, its
 * next due date and its lapse count. Nothing about what the student
 * said, typed or tapped is ever stored — a review outcome reaches
 * the database as a single boolean (correct on first attempt).
 */

export const WORD_STEP_MASTERED = 6;

/** Days until a word at each step is due again (steps 1..5). */
export const STEP_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export const SESSION_MAX_WORDS = 10;
export const SESSION_MAX_NEW = 3;
/** Stars paid per session: +1 per word that stepped up, capped. */
export const SESSION_STAR_CAP = 5;

export interface BankWordState {
  wordKey: string;
  /** 0 = New (enrolled, never reviewed), 1..5 = learning, 6 = Mastered. */
  step: number;
  /** ISO timestamp of the next due moment; null when Mastered. */
  dueAt: string | null;
  lapses: number;
}

export interface DueWord extends BankWordState {
  word: string;
  emoji: string;
  example: string;
  imageUrl: string;
  stageNo: number;
  /** The module (within its stage) that teaches the word — drives
   * the model-voice parity, exactly as in the lesson player. */
  moduleNo: number;
}

export interface ReviewOutcome {
  step: number;
  /** Days until the word is due again; null when it is Mastered. */
  intervalDays: number | null;
  mastered: boolean;
}

/** The ladder, in one place. Mirrors record_word_review (migration 40). */
export function applyReview(step: number, correctFirst: boolean): ReviewOutcome {
  const next = correctFirst
    ? Math.min(WORD_STEP_MASTERED, step + 1)
    : Math.max(1, step - 2);
  return {
    step: next,
    intervalDays: next >= WORD_STEP_MASTERED ? null : STEP_INTERVAL_DAYS[next],
    mastered: next >= WORD_STEP_MASTERED,
  };
}

/** The due moment after a review, given when the review happened. */
export function nextDueAt(from: Date, outcome: ReviewOutcome): string | null {
  if (outcome.intervalDays === null) return null;
  const d = new Date(from.getTime() + outcome.intervalDays * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export type WordStatus = 'not_started' | 'new' | 'learning' | 'mastered';

export function statusForStep(step: number | null | undefined): WordStatus {
  if (step === null || step === undefined) return 'not_started';
  if (step <= 0) return 'new';
  if (step >= WORD_STEP_MASTERED) return 'mastered';
  return 'learning';
}

/**
 * Compose one review session from the words that are due:
 * most-overdue learning words first, with up to SESSION_MAX_NEW
 * brand-new words mixed in; at most SESSION_MAX_WORDS in total.
 * New words are interleaved through the session rather than bunched
 * at the end. Words answered earlier today are not due (their
 * due_at moved forward), so a session never repeats a word.
 */
export function composeSession<T extends BankWordState>(dueWords: T[], now: Date): T[] {
  const nowMs = now.getTime();
  const due = dueWords.filter(
    (w) => w.step < WORD_STEP_MASTERED && w.dueAt !== null && Date.parse(w.dueAt) <= nowMs
  );
  const byDue = (a: T, b: T) => Date.parse(a.dueAt as string) - Date.parse(b.dueAt as string);
  const fresh = due.filter((w) => w.step === 0).sort(byDue);
  const learning = due.filter((w) => w.step > 0).sort(byDue);

  let newTake = Math.min(SESSION_MAX_NEW, fresh.length);
  const learnTake = Math.min(learning.length, SESSION_MAX_WORDS - newTake);
  // If the learning queue ran short, fill the remaining places with
  // more new words (a first-ever session is all new words).
  newTake = Math.min(fresh.length, newTake + (SESSION_MAX_WORDS - learnTake - newTake));
  const pickedNew = fresh.slice(0, newTake);
  const pickedLearn = learning.slice(0, learnTake);

  // Interleave: roughly one new word after every two learning words.
  const out: T[] = [];
  let li = 0;
  let ni = 0;
  while (li < pickedLearn.length || ni < pickedNew.length) {
    if (li < pickedLearn.length) out.push(pickedLearn[li++]);
    if (li < pickedLearn.length) out.push(pickedLearn[li++]);
    if (ni < pickedNew.length) out.push(pickedNew[ni++]);
  }
  return out.slice(0, SESSION_MAX_WORDS);
}

export type WordActivityType = 'hear_tap' | 'picture_word' | 'say_word' | 'build_word';

/**
 * The activities a stage may use. Stage 1 is tap-and-speak only —
 * the standing Stage 1 rule (no typing anywhere in Stage 1) — so
 * letter tiles start at Stage 2.
 */
export function activitiesForStage(stageNo: number): WordActivityType[] {
  return stageNo <= 1
    ? ['hear_tap', 'picture_word', 'say_word']
    : ['hear_tap', 'picture_word', 'say_word', 'build_word'];
}

/** Rotate activity types through a session so it stays varied. */
export function activityForIndex(stageNo: number, index: number): WordActivityType {
  const allowed = activitiesForStage(stageNo);
  return allowed[index % allowed.length];
}

/**
 * Pick up to `count` distractor words for a target: same-stage words
 * first (they make the honest confusions), then any others. The
 * target itself is never included.
 */
export function pickDistractors<T extends { wordKey: string; stageNo: number }>(
  pool: T[],
  target: T,
  count: number,
  rand: () => number = Math.random
): T[] {
  const others = pool.filter((w) => w.wordKey !== target.wordKey);
  const shuffled = (arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sameStage = shuffled(others.filter((w) => w.stageNo === target.stageNo));
  const rest = shuffled(others.filter((w) => w.stageNo !== target.stageNo));
  return [...sameStage, ...rest].slice(0, count);
}

/** +1 star per word that stepped up in the session, capped. */
export function sessionStars(stepGains: number): number {
  return Math.max(0, Math.min(SESSION_STAR_CAP, stepGains));
}
