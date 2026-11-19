import { supabase } from './supabase';
import type { StudentIdentity } from './studentIdentity';

/**
 * XP & Stars — the app's reward layer.
 *
 * XP is never spent: it drives the learner's level, named after the
 * English Through Cricket books. Stars are collectible credit for the
 * things we want more of: fixing tricky words, doing recommended extras,
 * and showing up on chosen study days. Everything fails soft — before
 * migration 18 runs, awards quietly no-op and totals read as zero.
 */

export const POINTS = {
  LESSON_XP: 20,
  SPEAKING_XP: 10,
  READING_XP: 10,
  EXTRA_STARS: 3,
  RED_WORD_STARS: 2,
  STUDY_DAY_STARS: 10,
  STREAK_WEEK_STARS: 25,
} as const;

export type PointKind =
  | 'lesson_complete'
  | 'speaking_pass'
  | 'reading_done'
  | 'red_word'
  | 'extra_game'
  | 'extra_video'
  | 'extra_download'
  | 'extra_speaking'
  | 'extra_reading'
  | 'study_day'
  | 'streak_week';

export const LEVELS = [
  { name: 'Rookie', xp: 0, emoji: '🌱' },
  { name: 'Player', xp: 150, emoji: '🏏' },
  { name: 'Captain', xp: 400, emoji: '⭐' },
  { name: 'MVP', xp: 900, emoji: '🏆' },
] as const;

export interface LevelInfo {
  name: string;
  emoji: string;
  /** XP needed for the next level, or null at the top level. */
  nextAt: number | null;
  /** 0..1 progress toward the next level (1 at the top level). */
  progress: number;
}

export function levelForXp(xp: number): LevelInfo {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const level of LEVELS) {
    if (xp >= level.xp) current = level;
  }
  const idx = LEVELS.indexOf(current);
  const next = idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
  if (!next) return { name: current.name, emoji: current.emoji, nextAt: null, progress: 1 };
  const span = next.xp - current.xp;
  return {
    name: current.name,
    emoji: current.emoji,
    nextAt: next.xp,
    progress: Math.min(1, Math.max(0, (xp - current.xp) / span)),
  };
}

/** Award points once per (kind, ref). Returns true when the award landed. */
export async function awardPoints(
  identity: StudentIdentity,
  kind: PointKind,
  xp: number,
  stars: number,
  ref?: string
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('award_points', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
      p_kind: kind,
      p_xp: xp,
      p_stars: stars,
      p_ref: ref ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Is today one of the student's chosen study days? No plan (or an
 * unreadable one) means every day counts — the pre-Study-Days behaviour.
 */
export async function isTodayAStudyDay(identity: StudentIdentity): Promise<boolean> {
  try {
    if (identity.studentKind === 'sub_account') {
      // PIN students cannot read sub_accounts directly (row security),
      // so their study days come through the migration-24 RPC. Until it
      // runs, or when no plan is saved, every day counts.
      const { data, error } = await supabase.rpc('get_student_study_days', {
        p_student_id: identity.studentId,
      });
      if (error || !Array.isArray(data) || data.length === 0) return true;
      return data.includes(new Date().getUTCDay());
    }
    const { data, error } = await supabase
      .from('user_profiles')
      .select('study_days')
      .eq('id', identity.studentId)
      .maybeSingle();
    if (error || !data) return true;
    const days = (data as { study_days?: number[] | null }).study_days;
    if (!days || days.length === 0) return true;
    return days.includes(new Date().getUTCDay());
  } catch {
    return true;
  }
}

export async function fetchPointTotals(
  identity: StudentIdentity
): Promise<{ xp: number; stars: number }> {
  try {
    const { data, error } = await supabase.rpc('get_point_totals', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
    });
    if (error || !data || !data[0]) return { xp: 0, stars: 0 };
    return { xp: Number(data[0].xp) || 0, stars: Number(data[0].stars) || 0 };
  } catch {
    return { xp: 0, stars: 0 };
  }
}
