-- ============================================================================
-- 20261117000022_completed_lessons_rpc.sql
-- Read-back for lesson completions, for students themselves.
--
-- WHY: lesson_completions (migration 6) deliberately has NO anon
-- SELECT policy - its select policies cover the student only when
-- they are an authenticated email learner, plus managers and admins.
-- PIN students browse as anon, so the learner app (My Journey, the
-- Learning Path ticks) could never read a PIN student's own finished
-- lessons back: Journey showed 0/8 forever even though the rows were
-- being written and XP/stars (migration 18's definer RPCs) worked.
--
-- This mirrors the established pattern of get_extra_completions
-- (migration 20): a SECURITY DEFINER read that trusts the
-- client-asserted student identity, exactly like authenticate_student
-- itself. It returns only lesson ids - no scores, no personal data.
-- ============================================================================

create or replace function public.get_completed_lessons(
  p_student_id uuid,
  p_student_kind text
)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select distinct lesson_id
  from public.lesson_completions
  where student_id = p_student_id
    and student_kind = p_student_kind;
$$;

grant execute on function public.get_completed_lessons(uuid, text) to anon, authenticated;
