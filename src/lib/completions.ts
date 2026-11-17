import type { StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';

/**
 * Which lessons has this student finished? Read via the
 * get_completed_lessons RPC (migration 22): lesson_completions has
 * no anon SELECT policy, so a direct table read silently returns
 * nothing for PIN students - the bug that left My Journey at 0/8
 * while XP and stars (also RPC-fed) counted up correctly.
 * Fails soft to an empty set until the migration is run.
 */
export async function fetchCompletedLessons(
  identity: StudentIdentity | null
): Promise<Set<string>> {
  const done = new Set<string>();
  if (!identity) return done;
  try {
    const { data, error } = await supabase.rpc('get_completed_lessons', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
    });
    if (error || !Array.isArray(data)) return done;
    for (const row of data as unknown[]) {
      if (typeof row === 'string') done.add(row);
    }
  } catch {
    // Migration 22 not run yet: nothing reads as finished.
  }
  return done;
}
