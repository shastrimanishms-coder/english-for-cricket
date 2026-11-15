-- ============================================================================
-- 20261115000009_badge_progress_rpcs.sql
-- Phase 2 Wave C backend: two read helpers the badge system needs so that
-- PIN students' badges can be evaluated as completely as email learners'.
--
-- WHY THESE EXIST: badge rules like "finish every lesson in this module"
-- and "use the app N days in a row" need to READ a student's progress.
-- Email learners can read their own rows because they have a login
-- session. PIN students have NO session - their "login" is the
-- authenticate_student function handing the app a payload it stores on the
-- device - so the normal safety rules give them no read path at all, and
-- their module and streak badges could never be checked. These two
-- functions are that read path, with the same trust model as
-- log_activity (file 8) and authenticate_student: the app states who the
-- student is, and for PIN students the function first checks the student
-- exists and is still active. The data at stake is lesson-completion
-- counts and activity dates, not credentials or personal data.
-- Email learners are held to a stricter rule when they are signed in:
-- their login token must belong to the student being asked about.
--
-- WHAT EACH FUNCTION DOES:
-- 1. get_activity_days(student, kind) - the list of calendar days the
--    student was active, from game/video/lesson time records and from
--    finished lessons. The app counts consecutive days from this list to
--    work out the current streak for "Daily Login Streak" badges.
--    Days are taken in UTC (the timestamp's date after converting to
--    UTC), so a day means the same thing on every device and matches how
--    the app itself counts streaks.
-- 2. get_module_progress(student, kind, module) - how many lessons the
--    module has in total, and how many of them this student has
--    finished. The app uses it to award "Complete a Module" badges for
--    both kinds of student.
--
-- RUN: after file 8. Safe to run more than once (CREATE OR REPLACE
-- throughout). OPTIONAL but recommended: nothing breaks if this file has
-- not been run yet. The app falls back to direct reads where it can
-- (email learners), and PIN students' module/streak badges simply
-- evaluate less completely until it is run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_activity_days: distinct active days (UTC) for one student.
--    Returns NO rows when the identity check fails (unknown/inactive PIN
--    student, another student's id while signed in, or a bad kind).
-- ----------------------------------------------------------------------------
create or replace function public.get_activity_days(
  p_student_id uuid,
  p_student_kind text
)
returns setof date
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_kind = 'sub_account' then
    -- PIN student: no session exists to check, so mirror
    -- authenticate_student's trust model - the student must exist and
    -- still be active, otherwise say nothing.
    if not exists (
      select 1
      from public.sub_accounts
      where id = p_student_id
        and is_active = true
    ) then
      return;
    end if;
  elsif p_student_kind = 'auth' then
    -- Email learner: when a login token IS present it must belong to
    -- the student being asked about.
    if auth.uid() is not null and auth.uid() <> p_student_id then
      return;
    end if;
  else
    return;
  end if;

  -- activity_logs carries no kind column, so rows are matched by
  -- student_id alone (the same classification approach as file 8's
  -- stats function); lesson_completions does carry the kind, so it is
  -- matched exactly.
  return query
  select distinct (al.created_at at time zone 'utc')::date
  from public.activity_logs al
  where al.student_id = p_student_id
  union
  select distinct (lc.completed_at at time zone 'utc')::date
  from public.lesson_completions lc
  where lc.student_id = p_student_id
    and lc.student_kind = p_student_kind;
end;
$$;

comment on function public.get_activity_days(uuid, text) is
  'Distinct UTC calendar days a student was active (activity_logs created_at union lesson_completions completed_at), for streak badges. PIN students (sub_account) are client-asserted like authenticate_student: the sub-account must exist and be active, else no rows. For auth students, a present JWT must match the student id.';

grant execute on function public.get_activity_days(uuid, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. get_module_progress: (total lessons, lessons this student finished)
--    for one module. Returns NO rows when the identity check fails.
-- ----------------------------------------------------------------------------
create or replace function public.get_module_progress(
  p_student_id uuid,
  p_student_kind text,
  p_module_id uuid
)
returns table (
  total_lessons int,
  completed_lessons int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_kind = 'sub_account' then
    if not exists (
      select 1
      from public.sub_accounts
      where id = p_student_id
        and is_active = true
    ) then
      return;
    end if;
  elsif p_student_kind = 'auth' then
    if auth.uid() is not null and auth.uid() <> p_student_id then
      return;
    end if;
  else
    return;
  end if;

  return query
  select
    (
      select count(*)::int
      from public.curriculum_lessons cl
      where cl.module_id = p_module_id
    ),
    (
      select count(distinct lc.lesson_id)::int
      from public.lesson_completions lc
      join public.curriculum_lessons cl on cl.id = lc.lesson_id
      where lc.student_id = p_student_id
        and lc.student_kind = p_student_kind
        and cl.module_id = p_module_id
    );
end;
$$;

comment on function public.get_module_progress(uuid, text, uuid) is
  'For one module: total lessons (curriculum_lessons.module_id) and how many distinct ones this student has in lesson_completions. Feeds Complete-a-Module badges for both identity kinds. Same identity checks as get_activity_days; returns no rows when they fail.';

grant execute on function public.get_module_progress(uuid, text, uuid) to anon, authenticated;
