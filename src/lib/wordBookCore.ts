/**
 * Word Bank lesson books — the pure logic (Round 94).
 *
 * Shastri's design: inside My Word Bank, every lesson opens as a
 * small book in two modes. LEARN is a flashcard book (picture, word,
 * example, listen) — pure study that records nothing. TEST is the
 * same book turned into a check: picture only, build the word from
 * scrambled letter tiles, then say it. Both books shuffle their
 * words every time they open (and Learn's Replay shuffles again).
 *
 * This module is deliberately free of Supabase and React so the
 * rules can be unit-tested directly (see the r94 core rig):
 *
 *   SHUFFLE — Fisher–Yates over a copy; the input is never mutated.
 *
 *   WORD SLOTS — a word becomes a row of slots. Letters need tiles;
 *   separators (spaces, hyphens, apostrophes) are FIXED slots that
 *   are already in place, so "twenty-one" is nine letter tiles
 *   around one fixed hyphen, and a two-word entry keeps its gap.
 *
 *   THE TEST BOOLEAN — the single outcome a Test page sends to
 *   record_word_review for an ENROLLED word (migration 40's ladder):
 *     correct  = built with NO wrong tile taps
 *                AND the speak step did not fail
 *                (passed, skipped, or unavailable all leave the
 *                build result standing — speaking is a bonus check,
 *                never a trap);
 *     wrong    = any wrong tap while building,
 *                OR the speak step was attempted and failed.
 *   Words whose lesson is not completed yet are not enrolled: the
 *   Test book lets the student practise them but sends NOTHING.
 *
 * PRIVACY: nothing here stores anything. The Test book's only write
 * is the same single boolean the review sessions already send; the
 * speech check scores on the device and its transcript is discarded,
 * exactly as in Speaking Practice and the Round 92 review.
 */

/** Fisher–Yates shuffle over a copy of the input. */
export function shuffleWords<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type WordSlot =
  | { kind: 'letter'; ch: string; letterIndex: number }
  | { kind: 'separator'; ch: string };

const SEPARATORS = new Set([' ', '-', '‐', '‑', "'", '’', '/']);

/**
 * Split a word into its book slots: one slot per character, with
 * separators marked as fixed (pre-placed, no tile needed) and
 * letters numbered left to right.
 */
export function splitWordSlots(word: string): WordSlot[] {
  const slots: WordSlot[] = [];
  let letterIndex = 0;
  for (const ch of word) {
    if (SEPARATORS.has(ch)) {
      slots.push({ kind: 'separator', ch });
    } else {
      slots.push({ kind: 'letter', ch, letterIndex });
      letterIndex += 1;
    }
  }
  return slots;
}

/** Just the letters of a word, in order (the tiles' source). */
export function wordLetters(word: string): string[] {
  return splitWordSlots(word)
    .filter((s): s is Extract<WordSlot, { kind: 'letter' }> => s.kind === 'letter')
    .map((s) => s.ch);
}

export interface LetterTile {
  ch: string;
  /** Stable identity — letters repeat ("twenty-one" has two t's). */
  id: number;
}

/** The scrambled tiles for a word: one per letter, shuffled. */
export function buildTiles(word: string, rand: () => number = Math.random): LetterTile[] {
  return shuffleWords(
    wordLetters(word).map((ch, id) => ({ ch, id })),
    rand
  );
}

export type SpeakOutcome = 'passed' | 'failed' | 'skipped' | 'unavailable';

/**
 * The one boolean a Test page reports for an enrolled word.
 * `wrongTaps` counts every wrong tile tapped while building
 * (untapping a placed tile to undo is NOT a wrong tap).
 */
export function testWordResult(wrongTaps: number, speak: SpeakOutcome): boolean {
  if (wrongTaps > 0) return false;
  return speak !== 'failed';
}
