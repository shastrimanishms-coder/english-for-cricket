import { awardPoints } from './points';
import type { StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';
import type { DueWord, WordStatus } from './wordBankCore';

/**
 * My Word Bank — the client side of migration 40.
 *
 * Everything flows through SECURITY DEFINER RPCs (the two tables
 * have row security on and no client policies), with the identity
 * rules of record_speaking_line: PIN students are client-asserted
 * (the sub-account must exist and be active); email learners may
 * only ever touch their own bank.
 *
 * PRIVACY: the only per-student data is (word, step, due date,
 * lapse count). A review sends ONE boolean — correct on the first
 * attempt — never a transcript, a recording, or the answer the
 * student gave. See wordBankCore.ts and migration 40.
 *
 * Every function fails soft: before migration 40 runs, the bank
 * simply reads as empty and enrolment no-ops, exactly like the
 * pre-migration behaviour of rounds 81/82/85.
 */

export interface WordBankStatus {
  enrolled: number;
  due: number;
  newWords: number;
  learning: number;
  mastered: number;
}

export interface BrowseWord {
  wordKey: string;
  word: string;
  emoji: string;
  example: string;
  imageUrl: string;
  lessonId: string;
  lessonTitle: string;
  lessonOrder: number;
  status: WordStatus;
  step: number | null;
}

function parseStatus(data: unknown): WordBankStatus | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    enrolled: num(d.enrolled),
    due: num(d.due),
    newWords: num(d.new_words),
    learning: num(d.learning),
    mastered: num(d.mastered),
  };
}

/**
 * Enrol every word from the student's completed lessons (idempotent
 * — the lazy backfill that also covers lessons finished before this
 * feature existed) and return the bank's summary counts. Returns
 * null when the bank is unavailable (signed out, or migration 40
 * not run yet).
 */
export async function syncWordBank(identity: StudentIdentity | null): Promise<WordBankStatus | null> {
  if (!identity) return null;
  try {
    const { data, error } = await supabase.rpc('sync_word_bank', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
    });
    if (error) return null;
    return parseStatus(data);
  } catch {
    return null;
  }
}

/** Fire-and-forget enrolment, called when a lesson is completed. */
export function syncWordBankEnrolments(identity: StudentIdentity | null): void {
  if (!identity) return;
  void syncWordBank(identity).catch(() => {
    // Enrolment is a nicety; the bank re-syncs on every visit.
  });
}

/** Every word currently due for this student, most overdue first. */
export async function fetchDueWords(identity: StudentIdentity | null): Promise<DueWord[]> {
  if (!identity) return [];
  try {
    const { data, error } = await supabase.rpc('get_word_bank_due', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
      wordKey: String(row.word_key),
      word: String(row.word),
      emoji: String(row.emoji ?? ''),
      example: String(row.example ?? ''),
      imageUrl: String(row.image_url ?? ''),
      stageNo: Number(row.stage_no) || 1,
      moduleNo: Number(row.module_no) || 1,
      step: Number(row.step) || 0,
      dueAt: row.due_at ? String(row.due_at) : null,
      lapses: Number(row.lapses) || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Record one word's review outcome. The ONLY thing sent is whether
 * the first attempt was correct; the server applies the ladder.
 * Returns the new step, or null when the write did not land.
 */
export async function recordWordReview(
  identity: StudentIdentity,
  wordKey: string,
  correctFirst: boolean
): Promise<{ step: number; mastered: boolean } | null> {
  try {
    const { data, error } = await supabase.rpc('record_word_review', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
      p_word_key: wordKey,
      p_correct_first: correctFirst,
    });
    if (error || !data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    return { step: Number(d.step) || 0, mastered: d.mastered === true };
  } catch {
    return null;
  }
}

/** One module's dictionary: every word it introduces, with status. */
export async function fetchBrowseModule(
  identity: StudentIdentity | null,
  moduleId: string
): Promise<BrowseWord[]> {
  if (!identity) return [];
  try {
    const { data, error } = await supabase.rpc('get_word_bank_browse', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
      p_module_id: moduleId,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
      wordKey: String(row.word_key),
      word: String(row.word),
      emoji: String(row.emoji ?? ''),
      example: String(row.example ?? ''),
      imageUrl: String(row.image_url ?? ''),
      lessonId: String(row.lesson_id),
      lessonTitle: String(row.lesson_title ?? ''),
      lessonOrder: Number(row.lesson_order) || 0,
      status: (String(row.status) as WordStatus) || 'not_started',
      step: row.step === null || row.step === undefined ? null : Number(row.step),
    }));
  } catch {
    return [];
  }
}

/**
 * Session stars: one ledger row per review session (kind
 * 'word_review', ref = the session id, so a replayed or re-sent
 * award can never double-pay), +1 star per word that stepped up,
 * capped — the cap lives in wordBankCore.sessionStars.
 */
export async function awardWordBankSession(
  identity: StudentIdentity,
  stars: number,
  sessionId: string
): Promise<void> {
  if (stars <= 0) return;
  await awardPoints(identity, 'word_review', 0, stars, sessionId);
}
