-- Migration 24: let PIN students read back their own study days.
--
-- Migration 16 added study_days to sub_accounts and a write RPC
-- (update_student_study_days), but PIN students hold no session and
-- sub_accounts has no anon SELECT policy, so the app could save a
-- student's days yet never read them back: the profile picker looked
-- empty after every refresh, and the streak helpers (which read the
-- column directly) silently fell back to "no plan".
--
-- This read RPC follows the same client-asserted pattern as
-- authenticate_student / get_completed_lessons: the sub-account must
-- exist and be active. Returns the saved weekday numbers
-- (0 = Sunday .. 6 = Saturday), or NULL when no plan is chosen yet.
--
-- Safe to run once in the SQL Editor; safe to re-run.

create or replace function public.get_student_study_days(
  p_student_id uuid
)
returns int[]
language sql
security definer
set search_path = public
stable
as $$
  select study_days::int[]
  from public.sub_accounts
  where id = p_student_id
    and is_active = true;
$$;

comment on function public.get_student_study_days(uuid) is
  'Returns a PIN student''s saved study days (weekday numbers, 0=Sunday..6=Saturday), or NULL when not chosen. Client-asserted like authenticate_student: the sub-account must exist and be active.';

grant execute on function public.get_student_study_days(uuid) to anon, authenticated;
