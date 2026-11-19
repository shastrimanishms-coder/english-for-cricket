import type { StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';

interface BadgeRow {
  id: string;
  title: string;
  image_url: string | null;
  condition_type: string;
  condition_target: string;
}

/**
 * A badge that was newly awarded by an evaluation call, in the shape the
 * UI needs to celebrate it (the lesson player's "New Badge!" card, the
 * game player's toast). Evaluation functions return these so callers can
 * surface the moment; callers that do not care can keep ignoring the
 * return value exactly as before.
 */
export interface AwardedBadge {
  id: string;
  title: string;
  image_url: string | null;
}

interface CompletedLessonRef {
  id: string;
  module_id: string | null;
}

/**
 * Badge awarding.
 *
 * The condition model comes from the admin BadgesManager:
 *  - condition_type 'lesson' ("Complete a Lesson"): condition_target is a
 *    curriculum_lessons id; earned by completing that lesson.
 *  - condition_type 'module' ("Complete a Module"): condition_target is a
 *    curriculum_modules id; earned when EVERY lesson in the module has a
 *    completion for this student.
 *  - condition_type 'game' ("Play a Game"): condition_target is a games
 *    id; earned by opening that game (see evaluateGameBadge).
 *  - condition_type 'streak' ("Daily Login Streak"): condition_target is
 *    a number of consecutive active days; earned when the student's
 *    current streak reaches it (see evaluateStreakBadges).
 *
 * Progress reads prefer the SECURITY DEFINER helpers from migration
 * 20261115000009 (get_module_progress / get_activity_days): PIN students
 * hold no session, so the tables' own select policies give them no read
 * path. Until that migration is run the helpers error, and evaluation
 * falls back to direct reads - which work for email learners (their own
 * rows) and simply find nothing for PIN students, exactly as before.
 *
 * Everything fails soft: badge problems must never break the flow that
 * triggered evaluation. In particular, student_badges insert policies
 * for PIN students are not known to permit the write, so a blocked
 * insert is logged and dropped. Already-earned badges are checked first
 * so repeat evaluations do not create duplicates where reads are
 * permitted.
 */

async function fetchBadges(): Promise<BadgeRow[] | null> {
  const { data, error } = await supabase
    .from('badges')
    .select('id, title, image_url, condition_type, condition_target');
  if (error || !data) return null;
  return data as BadgeRow[];
}

/**
 * Inserts the given badges for the student, skipping ones already held,
 * and returns the badges that were genuinely NEW (and recorded) so the
 * caller can celebrate them. A blocked insert returns an empty array -
 * the badge was not recorded, so there is nothing truthful to show.
 */
async function awardBadges(
  identity: StudentIdentity,
  matched: BadgeRow[]
): Promise<AwardedBadge[]> {
  if (matched.length === 0) return [];

  const { data: existing } = await supabase
    .from('student_badges')
    .select('badge_id')
    .eq('student_id', identity.studentId)
    .in(
      'badge_id',
      matched.map((b) => b.id)
    );
  const alreadyEarned = new Set((existing || []).map((row) => row.badge_id));
  const fresh = matched.filter((badge) => !alreadyEarned.has(badge.id));
  if (fresh.length === 0) return [];

  const { error: insertError } = await supabase
    .from('student_badges')
    .insert(fresh.map((badge) => ({ student_id: identity.studentId, badge_id: badge.id })));
  if (insertError) {
    console.log('Badge award not recorded:', insertError.message);
    return [];
  }
  return fresh.map((badge) => ({ id: badge.id, title: badge.title, image_url: badge.image_url }));
}

/**
 * Module progress for one student: prefers the get_module_progress RPC
 * (migration 20261115000009), which is the only read path that works for
 * PIN students. Falls back to direct table reads when the RPC is
 * unavailable; `justCompletedLessonId` is counted as done in the
 * fallback because a PIN student cannot re-read their own completion
 * rows (and a just-written row may not be visible yet either way).
 */
async function moduleProgress(
  identity: StudentIdentity,
  moduleId: string,
  justCompletedLessonId?: string
): Promise<{ total: number; completed: number } | null> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_module_progress', {
    p_student_id: identity.studentId,
    p_student_kind: identity.studentKind,
    p_module_id: moduleId,
  });
  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    const row = rpcData[0] as { total_lessons: number; completed_lessons: number };
    // The RPC reads committed data and evaluation runs after the
    // completion insert in the completion path, so the just-finished
    // lesson is already counted when its write landed - do NOT add it
    // again here (that would double-count). The add-in below belongs
    // only to the direct-read fallback, where a PIN student's own rows
    // are unreadable.
    return { total: row.total_lessons, completed: row.completed_lessons };
  }

  const { data: moduleLessons } = await supabase
    .from('curriculum_lessons')
    .select('id')
    .eq('module_id', moduleId);
  if (!moduleLessons || moduleLessons.length === 0) return null;

  const { data: completions } = await supabase
    .from('lesson_completions')
    .select('lesson_id')
    .eq('student_id', identity.studentId)
    .eq('student_kind', identity.studentKind)
    .in(
      'lesson_id',
      moduleLessons.map((l) => l.id)
    );
  const doneLessonIds = new Set((completions || []).map((c) => c.lesson_id));
  if (justCompletedLessonId) doneLessonIds.add(justCompletedLessonId);
  return { total: moduleLessons.length, completed: doneLessonIds.size };
}

/**
 * Lesson-completion triggers: 'lesson' badges for the finished lesson
 * and 'module' badges for its module when every lesson in it is done.
 */
export async function awardLessonBadges(
  identity: StudentIdentity,
  lesson: CompletedLessonRef
): Promise<AwardedBadge[]> {
  try {
    const badges = await fetchBadges();
    if (!badges) return [];

    const earned: BadgeRow[] = [];

    for (const badge of badges) {
      if (badge.condition_type === 'lesson' && badge.condition_target === lesson.id) {
        earned.push(badge);
      }
    }

    const moduleBadges = badges.filter(
      (b) => b.condition_type === 'module' && lesson.module_id && b.condition_target === lesson.module_id
    );
    if (moduleBadges.length > 0 && lesson.module_id) {
      const progress = await moduleProgress(identity, lesson.module_id, lesson.id);
      if (progress && progress.total > 0 && progress.completed >= progress.total) {
        earned.push(...moduleBadges);
      }
    }

    return await awardBadges(identity, earned);
  } catch (error) {
    console.log('Badge awarding skipped:', error);
    return [];
  }
}

/**
 * Game badges. BadgesManager words this condition "Play a Game" with the
 * target being a specific game. V1 semantics: OPENING the game earns the
 * badge - the game player calls this once the game row has loaded and
 * activity logging has started. There is no completion signal from
 * embedded games (they are third-party iframes/WebViews), so "opened and
 * started playing" is the strongest event available; a game whose embed
 * subsequently fails to load may still have earned its badge.
 */
export async function evaluateGameBadge(
  identity: StudentIdentity,
  gameId: string
): Promise<AwardedBadge[]> {
  try {
    const badges = await fetchBadges();
    if (!badges) return [];

    const earned: BadgeRow[] = [];
    for (const badge of badges) {
      if (badge.condition_type === 'game' && badge.condition_target === gameId) {
        earned.push(badge);
      }
    }

    return await awardBadges(identity, earned);
  } catch (error) {
    console.log('Game badge evaluation skipped:', error);
    return [];
  }
}

function toUtcDateString(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftUtcDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Current streak from a set of active days (YYYY-MM-DD, UTC - the same
 * basis get_activity_days returns). A streak is still alive when the
 * most recent active day is yesterday: the student has until the end of
 * today to extend it. It is dead (0) when neither today nor yesterday
 * was active.
 */
export function computeCurrentStreak(
  activeDays: Iterable<string>,
  studyDays?: number[] | null
): number {
  const days = new Set(activeDays);

  // Study-days mode (migration 16): the student picked the weekdays
  // they study (at least 3). Only those days count: a non-study day
  // neither extends nor breaks the streak, a missed study day breaks
  // it, and today's study day is still "pending" until the day ends,
  // so it neither counts nor breaks yet.
  if (studyDays && studyDays.length >= 3) {
    const study = new Set(studyDays);
    const today = todayUtc();
    let streak = 0;
    let cursor = today;
    for (let i = 0; i < 370; i++) {
      const weekday = new Date(`${cursor}T00:00:00.000Z`).getUTCDay();
      if (study.has(weekday)) {
        if (days.has(cursor)) {
          streak += 1;
        } else if (cursor !== today) {
          break;
        }
      }
      cursor = shiftUtcDate(cursor, -1);
    }
    return streak;
  }

  let cursor: string;
  if (days.has(todayUtc())) {
    cursor = todayUtc();
  } else if (days.has(shiftUtcDate(todayUtc(), -1))) {
    cursor = shiftUtcDate(todayUtc(), -1);
  } else {
    return 0;
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftUtcDate(cursor, -1);
  }
  return streak;
}

/**
 * The student's chosen study days (migration 16), or null when they
 * have not chosen any (every day counts) or the column is not there
 * yet. Fails soft for the same reason fetchActivityDays does.
 */
async function fetchStudyDays(identity: StudentIdentity): Promise<number[] | null> {
  try {
    if (identity.studentKind === 'sub_account') {
      // PIN students cannot read sub_accounts directly (row security),
      // so their study days come through the migration-24 RPC.
      const { data, error } = await supabase.rpc('get_student_study_days', {
        p_student_id: identity.studentId,
      });
      if (error || !Array.isArray(data)) return null;
      const days = data.filter(
        (d): d is number => typeof d === 'number' && d >= 0 && d <= 6
      );
      return days.length >= 3 ? days : null;
    }
    const { data, error } = await supabase
      .from('user_profiles')
      .select('study_days')
      .eq('id', identity.studentId)
      .maybeSingle();
    if (error || !data) return null;
    const raw = (data as { study_days?: unknown }).study_days;
    if (!Array.isArray(raw)) return null;
    const days = raw.filter(
      (d): d is number => typeof d === 'number' && d >= 0 && d <= 6
    );
    return days.length >= 3 ? days : null;
  } catch {
    return null;
  }
}

/**
 * Active days for streak evaluation: the get_activity_days RPC
 * (migration 20261115000009) first - the only source that works for PIN
 * students. When the RPC is unavailable, email learners fall back to
 * direct reads of their own activity/completion rows; PIN students have
 * no such read path, so their day list is empty until the RPC exists.
 */
async function fetchActivityDays(identity: StudentIdentity): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_activity_days', {
    p_student_id: identity.studentId,
    p_student_kind: identity.studentKind,
  });
  if (!error && Array.isArray(data)) {
    return (data as unknown[]).map((d) => String(d).slice(0, 10));
  }

  if (identity.studentKind !== 'auth') return [];

  const days = new Set<string>();
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('created_at')
    .eq('student_id', identity.studentId);
  for (const row of logs || []) days.add(toUtcDateString(row.created_at));
  const { data: completions } = await supabase
    .from('lesson_completions')
    .select('completed_at')
    .eq('student_id', identity.studentId)
    .eq('student_kind', identity.studentKind);
  for (const row of completions || []) days.add(toUtcDateString(row.completed_at));
  return [...days];
}

/**
 * Streak badges ("Daily Login Streak", target = number of consecutive
 * days): awards every streak badge whose target the student's current
 * streak has reached. Called on lesson completion and when the learner
 * home screen mounts, so any recorded activity counts toward the streak.
 */
export async function evaluateStreakBadges(identity: StudentIdentity): Promise<AwardedBadge[]> {
  try {
    const badges = await fetchBadges();
    if (!badges) return [];

    const streakBadges = badges.filter((b) => b.condition_type === 'streak');
    if (streakBadges.length === 0) return [];

    const [activityDays, studyDays] = await Promise.all([
      fetchActivityDays(identity),
      fetchStudyDays(identity),
    ]);
    const streak = computeCurrentStreak(activityDays, studyDays);
    if (streak <= 0) return [];

    const earned: BadgeRow[] = [];
    for (const badge of streakBadges) {
      const target = Number.parseInt(badge.condition_target, 10);
      if (Number.isFinite(target) && target > 0 && target <= streak) {
        earned.push(badge);
      }
    }

    return await awardBadges(identity, earned);
  } catch (error) {
    console.log('Streak badge evaluation skipped:', error);
    return [];
  }
}
