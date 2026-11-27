import { fetchCompletedLessons } from './completions';
import { isOfflineNow } from './connectivity';
import { IDB_STORES, idbAdd, idbDelete, idbGetAll } from './idb';
import type { PointKind } from './points';
import type { StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';

/**
 * The offline progress queue (Round 93, offline packs Phase 1).
 *
 * Lesson completions, points awards and activity-log segments are
 * the only progress the app writes while a student learns. Online,
 * they are sent exactly as they always were — this module is not
 * on the online path at all. When a send fails because the network
 * is gone (or the browser already knows it is offline), the SAME
 * payload is stored on the device in IndexedDB and replayed, in
 * order, when the connection returns. The queue survives the
 * browser being closed: it lives in IndexedDB, not in memory.
 *
 * Replay is protected against double-landing:
 *  - points: the award_points RPC itself pays once per
 *    (student, kind, ref), so a replayed award is a no-op;
 *  - lesson completions: before inserting, the replay checks the
 *    student's completed-lessons set (get_completed_lessons) and
 *    skips a lesson that is already recorded — the one trade-off
 *    is that a genuine second attempt finished offline in the same
 *    disconnected window as a first could be folded into it, which
 *    costs an attempts-table row and nothing else (XP is deduped
 *    server-side either way);
 *  - activity segments: appended by the log_activity RPC; a
 *    segment is removed from the queue only after the server
 *    confirms, so the only theoretical duplicate is a send whose
 *    response was lost after the server committed (at most one
 *    ≤30-second chunk, the same risk the online flush already has
 *    when a tab closes mid-request).
 *
 * Nothing new is collected: the queue stores the exact payloads
 * the online RPCs already receive — student id/kind, the award or
 * segment fields — and nothing else.
 */

export interface LessonCompletionRow {
  student_id: string;
  student_kind: string;
  lesson_id: string;
  module_id: string | null;
  score_correct: number;
  score_total: number;
  duration_seconds: number;
}

export type ProgressQueueEntry =
  | {
      type: 'award_points';
      identity: StudentIdentity;
      kind: PointKind;
      xp: number;
      stars: number;
      ref: string | null;
      queuedAt: number;
    }
  | {
      type: 'log_activity';
      identity: StudentIdentity;
      activityType: string;
      targetId: string | null;
      durationSeconds: number;
      queuedAt: number;
    }
  | {
      type: 'lesson_completion';
      identity: StudentIdentity;
      row: LessonCompletionRow;
      queuedAt: number;
    };

type StoredEntry = ProgressQueueEntry & { qid?: number };

/**
 * True when a Supabase failure looks like the network rather than
 * the server: PostgREST errors carry a non-empty `code` (PGRST…,
 * 42501, 23505…); a dead connection surfaces with an empty/missing
 * code or as a thrown TypeError ("Failed to fetch" and friends).
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.length > 0) return false;
  const message = String((error as { message?: unknown }).message ?? '');
  if (
    /failed to fetch|networkerror|network error|load failed|fetch failed|internet|offline/i.test(
      message
    )
  ) {
    return true;
  }
  // No server error code and no recognisable server message: the
  // request never really reached PostgREST.
  return code === undefined || code === '';
}

export async function enqueueProgress(entry: ProgressQueueEntry): Promise<void> {
  await idbAdd(IDB_STORES.queue, entry);
}

export async function queuedProgressCount(): Promise<number> {
  const rows = await idbGetAll<StoredEntry>(IDB_STORES.queue);
  return rows.length;
}

/** Drop every queued entry belonging to one student (account deletion). */
export async function clearQueueForStudent(studentId: string): Promise<void> {
  const rows = await idbGetAll<StoredEntry>(IDB_STORES.queue);
  for (const row of rows) {
    if (row.identity?.studentId === studentId && row.qid !== undefined) {
      await idbDelete(IDB_STORES.queue, row.qid);
    }
  }
}

type SendOutcome = 'sent' | 'retry' | 'drop';

async function sendAwardPoints(
  entry: Extract<ProgressQueueEntry, { type: 'award_points' }>
): Promise<SendOutcome> {
  try {
    const { error } = await supabase.rpc('award_points', {
      p_student_id: entry.identity.studentId,
      p_student_kind: entry.identity.studentKind,
      p_kind: entry.kind,
      p_xp: entry.xp,
      p_stars: entry.stars,
      p_ref: entry.ref,
    });
    if (!error) return 'sent';
    return isNetworkError(error) ? 'retry' : 'drop';
  } catch (err) {
    return isNetworkError(err) ? 'retry' : 'drop';
  }
}

async function sendLogActivity(
  entry: Extract<ProgressQueueEntry, { type: 'log_activity' }>
): Promise<SendOutcome> {
  const { identity } = entry;
  try {
    const { error } = await supabase.rpc('log_activity', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
      p_activity_type: entry.activityType,
      p_target_id: entry.targetId,
      p_duration_seconds: entry.durationSeconds,
    });
    if (!error) return 'sent';
    if (isNetworkError(error)) return 'retry';
    // Same fallback as the online writer: pre-migration or a
    // rejected RPC, email learners insert directly; PIN students
    // have no session the table accepts, so the segment is dropped
    // (exactly what the online path does today).
    if (identity.studentKind !== 'auth') return 'drop';
    const { error: insertError } = await supabase.from('activity_logs').insert([
      {
        student_id: identity.studentId,
        activity_type: entry.activityType,
        target_id: entry.targetId,
        duration_seconds: entry.durationSeconds,
      },
    ]);
    if (!insertError) return 'sent';
    return isNetworkError(insertError) ? 'retry' : 'drop';
  } catch (err) {
    return isNetworkError(err) ? 'retry' : 'drop';
  }
}

async function sendLessonCompletion(
  entry: Extract<ProgressQueueEntry, { type: 'lesson_completion' }>
): Promise<SendOutcome> {
  try {
    // Already recorded (the original send landed but its response
    // was lost, or the lesson was finished again while online):
    // do not write a second attempts row.
    const completed = await fetchCompletedLessons(entry.identity);
    if (completed.has(entry.row.lesson_id)) return 'sent';
    const { error } = await supabase.from('lesson_completions').insert([entry.row]);
    if (!error) return 'sent';
    if ((error as { code?: string }).code === '23505') return 'sent';
    return isNetworkError(error) ? 'retry' : 'drop';
  } catch (err) {
    return isNetworkError(err) ? 'retry' : 'drop';
  }
}

function sendEntry(entry: ProgressQueueEntry): Promise<SendOutcome> {
  switch (entry.type) {
    case 'award_points':
      return sendAwardPoints(entry);
    case 'log_activity':
      return sendLogActivity(entry);
    case 'lesson_completion':
      return sendLessonCompletion(entry);
  }
}

let flushing = false;

async function drainQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (let guard = 0; guard < 500; guard += 1) {
      const rows = await idbGetAll<StoredEntry>(IDB_STORES.queue);
      if (rows.length === 0) return;
      const head = rows[0];
      if (head.qid === undefined) return;
      const outcome = await sendEntry(head);
      if (outcome === 'retry') return;
      await idbDelete(IDB_STORES.queue, head.qid);
    }
  } catch {
    // A broken queue must never break the app; the next trigger
    // (reconnect, next launch, next award) tries again.
  } finally {
    flushing = false;
  }
}

interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void>
  ): Promise<void>;
}

/**
 * Replay the queue in order. Stops at the first entry the network
 * still cannot deliver, so ordering is preserved and a still-dead
 * connection costs one failed request. Safe to call any time.
 *
 * Flushes are serialised with the Web Locks API when the browser
 * offers it: reconnecting and reloading at the same moment would
 * otherwise run two flushes against the same queue — one in the
 * page going away, one in its replacement — and entries without
 * server-side dedupe (activity segments) could land twice. The
 * lock is released automatically when its holder's page dies, so
 * a flush killed mid-pass can never deadlock the next one; the
 * surviving entries are simply picked up by the next trigger.
 */
export async function flushProgressQueue(): Promise<void> {
  if (isOfflineNow()) return;
  const locks =
    typeof navigator !== 'undefined'
      ? (navigator as { locks?: LockManagerLike }).locks
      : undefined;
  if (locks?.request) {
    try {
      await locks.request(
        'efc-progress-flush',
        { ifAvailable: true },
        async (lock) => {
          // Another page is already flushing this queue; its pass
          // (or the next trigger after it) covers these entries.
          if (lock) await drainQueue();
        }
      );
      return;
    } catch {
      // Lock machinery failed — fall through to a plain pass.
    }
  }
  await drainQueue();
}

let syncInitialised = false;

/** Wire the replay triggers: reconnect, tab-visible, and once now. */
export function initProgressQueueSync(): void {
  if (syncInitialised) return;
  syncInitialised = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      void flushProgressQueue();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void flushProgressQueue();
    });
  }
  void flushProgressQueue();
}

/**
 * Record a lesson completion now, or queue it if the network is
 * gone. Online this performs exactly the insert the lesson player
 * has always done. Returns 'sent', 'queued', or 'failed' (a real
 * server rejection — the caller keeps its existing fail-soft log).
 */
export async function recordLessonCompletion(
  identity: StudentIdentity,
  row: LessonCompletionRow
): Promise<'sent' | 'queued' | 'failed'> {
  const entry: ProgressQueueEntry = {
    type: 'lesson_completion',
    identity,
    row,
    queuedAt: Date.now(),
  };
  if (isOfflineNow()) {
    await enqueueProgress(entry);
    return 'queued';
  }
  try {
    const { error } = await supabase.from('lesson_completions').insert([row]);
    if (!error) return 'sent';
    if (isNetworkError(error)) {
      await enqueueProgress(entry);
      return 'queued';
    }
    return 'failed';
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueProgress(entry);
      return 'queued';
    }
    return 'failed';
  }
}
