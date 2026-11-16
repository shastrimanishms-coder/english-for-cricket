import { awardPoints, POINTS, type PointKind } from './points';
import type { StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';

/**
 * Recommended extras — the connected-curriculum layer.
 *
 * Any game / video / download / speaking scenario / reading story an
 * admin tags with a lesson ("Belongs to") becomes a recommendation on
 * that lesson's completion screen. Doing one pays +3 stars, once per
 * item per student; the award row itself is the completion record the
 * Journey map reads back. Extras NEVER gate lesson progress.
 */

export type ExtraKind = 'game' | 'video' | 'download' | 'speaking' | 'reading';

export const EXTRA_META: Record<ExtraKind, { emoji: string; label: string; pointKind: PointKind }> = {
  game: { emoji: '🎮', label: 'Play', pointKind: 'extra_game' },
  speaking: { emoji: '🎙️', label: 'Speak', pointKind: 'extra_speaking' },
  reading: { emoji: '📖', label: 'Read', pointKind: 'extra_reading' },
  video: { emoji: '📺', label: 'Watch', pointKind: 'extra_video' },
  download: { emoji: '📄', label: 'Download', pointKind: 'extra_download' },
};

const KIND_ORDER: ExtraKind[] = ['game', 'speaking', 'reading', 'video', 'download'];

export interface Recommendation {
  kind: ExtraKind;
  id: string;
  title: string;
  done: boolean;
}

export interface TaggedItem {
  kind: ExtraKind;
  id: string;
  title: string;
  lessonId: string;
}

const TABLES: Record<ExtraKind, { table: string; publishedOnly: boolean }> = {
  game: { table: 'games', publishedOnly: false },
  video: { table: 'video_lectures', publishedOnly: true },
  download: { table: 'downloads', publishedOnly: false },
  speaking: { table: 'speaking_scenarios', publishedOnly: true },
  reading: { table: 'reading_stories', publishedOnly: true },
};

async function fetchTagged(lessonId: string | null): Promise<TaggedItem[]> {
  const out: TaggedItem[] = [];
  await Promise.all(
    KIND_ORDER.map(async (kind) => {
      const { table, publishedOnly } = TABLES[kind];
      try {
        let query = supabase.from(table).select('id, title, lesson_id').not('lesson_id', 'is', null);
        if (lessonId) query = query.eq('lesson_id', lessonId);
        if (publishedOnly) query = query.eq('is_published', true);
        const { data, error } = await query;
        if (error || !data) return;
        for (const row of data as any[]) {
          out.push({ kind, id: row.id, title: row.title, lessonId: row.lesson_id });
        }
      } catch {
        // Table or column missing (migrations 17/19 not run): no extras.
      }
    })
  );
  return out;
}

/** Done set as `${kind}:${id}` keys, from the student's extra awards. */
export async function fetchExtrasDone(identity: StudentIdentity): Promise<Set<string>> {
  const done = new Set<string>();
  try {
    const { data, error } = await supabase.rpc('get_extra_completions', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
    });
    if (error || !Array.isArray(data)) return done;
    for (const row of data as { kind: string; ref_id: string }[]) {
      const kind = (Object.keys(EXTRA_META) as ExtraKind[]).find(
        (k) => EXTRA_META[k].pointKind === row.kind
      );
      if (kind) done.add(`${kind}:${row.ref_id}`);
    }
  } catch {
    // No ledger yet (migration 18/20 not run): nothing reads as done.
  }
  return done;
}

/**
 * Up to 4 recommendations for a finished lesson: one per kind first
 * (in KIND_ORDER), then seconds, so the learner sees variety.
 */
export async function fetchRecommendations(
  lessonId: string,
  identity: StudentIdentity | null
): Promise<Recommendation[]> {
  const tagged = await fetchTagged(lessonId);
  const done = identity ? await fetchExtrasDone(identity) : new Set<string>();
  const byKind = new Map<ExtraKind, TaggedItem[]>();
  for (const item of tagged) {
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind)!.push(item);
  }
  const picks: Recommendation[] = [];
  for (let round = 0; round < 2 && picks.length < 4; round++) {
    for (const kind of KIND_ORDER) {
      if (picks.length >= 4) break;
      const item = (byKind.get(kind) || [])[round];
      if (item) picks.push({ kind, id: item.id, title: item.title, done: done.has(`${kind}:${item.id}`) });
    }
  }
  return picks;
}

/** Every tagged item in the app (for the Journey map), grouped by lesson. */
export async function fetchAllTagged(): Promise<Map<string, TaggedItem[]>> {
  const tagged = await fetchTagged(null);
  const byLesson = new Map<string, TaggedItem[]>();
  for (const item of tagged) {
    if (!byLesson.has(item.lessonId)) byLesson.set(item.lessonId, []);
    byLesson.get(item.lessonId)!.push(item);
  }
  return byLesson;
}

/**
 * Pay the extra stars when a tagged item is actually done. Untagged
 * content pays nothing — the stars exist to reward following a
 * recommendation. Idempotent per item via the points ledger.
 */
export async function awardExtraIfTagged(
  identity: StudentIdentity,
  kind: ExtraKind,
  id: string,
  lessonId: string | null | undefined
): Promise<void> {
  if (!lessonId) return;
  await awardPoints(identity, EXTRA_META[kind].pointKind, 0, POINTS.EXTRA_STARS, id);
}
