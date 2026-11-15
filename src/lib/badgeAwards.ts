import type { StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';

interface BadgeRow {
  id: string;
  condition_type: string;
  condition_target: string;
}

interface CompletedLessonRef {
  id: string;
  module_id: string | null;
}

/**
 * Badge awarding v1 - lesson-completion triggers only.
 *
 * The condition model comes from the admin BadgesManager:
 *  - condition_type 'lesson': condition_target is a curriculum_lessons id;
 *    earned by completing that lesson.
 *  - condition_type 'module': condition_target is a curriculum_modules id;
 *    earned when EVERY lesson in the module has a completion for this
 *    student.
 *  - 'game' and 'streak' conditions are deliberately NOT evaluated here;
 *    they need game-play and daily-login tracking, which arrive in a
 *    later pass.
 *
 * Everything fails soft: badge problems must never break the lesson
 * completion flow. In particular, student_badges insert policies for PIN
 * students (who hold no session) are not known to permit the write, so a
 * blocked insert is logged and dropped. Already-earned badges are checked
 * first so repeat completions do not create duplicates where reads are
 * permitted.
 */
export async function awardLessonBadges(
  identity: StudentIdentity,
  lesson: CompletedLessonRef
): Promise<void> {
  try {
    const { data: badges, error: badgesError } = await supabase
      .from('badges')
      .select('id, condition_type, condition_target');
    if (badgesError || !badges) return;

    const badgeRows = badges as BadgeRow[];
    const earned = new Set<string>();

    for (const badge of badgeRows) {
      if (badge.condition_type === 'lesson' && badge.condition_target === lesson.id) {
        earned.add(badge.id);
      }
    }

    const moduleBadges = badgeRows.filter(
      (b) => b.condition_type === 'module' && lesson.module_id && b.condition_target === lesson.module_id
    );
    if (moduleBadges.length > 0 && lesson.module_id) {
      const { data: moduleLessons } = await supabase
        .from('curriculum_lessons')
        .select('id')
        .eq('module_id', lesson.module_id);
      if (moduleLessons && moduleLessons.length > 0) {
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
        // The lesson that triggered this call counts as completed even if
        // its row cannot be read back (PIN students cannot re-read their
        // own completions under the current select policies).
        doneLessonIds.add(lesson.id);
        if (moduleLessons.every((l) => doneLessonIds.has(l.id))) {
          for (const badge of moduleBadges) earned.add(badge.id);
        }
      }
    }

    if (earned.size === 0) return;

    const { data: existing } = await supabase
      .from('student_badges')
      .select('badge_id')
      .eq('student_id', identity.studentId)
      .in('badge_id', [...earned]);
    const alreadyEarned = new Set((existing || []).map((row) => row.badge_id));
    const freshBadgeIds = [...earned].filter((badgeId) => !alreadyEarned.has(badgeId));
    if (freshBadgeIds.length === 0) return;

    const { error: insertError } = await supabase
      .from('student_badges')
      .insert(freshBadgeIds.map((badgeId) => ({ student_id: identity.studentId, badge_id: badgeId })));
    if (insertError) {
      console.log('Badge award not recorded:', insertError.message);
    }
  } catch (error) {
    console.log('Badge awarding skipped:', error);
  }
}
