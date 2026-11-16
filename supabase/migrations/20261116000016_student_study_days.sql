-- Migration 16: student study days (rest-day-aware streaks).
--
-- A student picks the days of the week they plan to study - at
-- least 3. Only those days count toward their streak (and therefore
-- toward streak badges): a non-study day neither extends nor breaks
-- the streak, and a missed STUDY day breaks it. Students may still
-- practise on any day; activity on other days simply does not move
-- the streak. NULL means "not chosen yet" - every day counts, which
-- is the behaviour the app had before this feature.
--
-- Days are stored as weekday numbers matching JavaScript's
-- Date.getUTCDay() (0 = Sunday .. 6 = Saturday), the same UTC basis
-- the streak calculation already uses.
--
-- Email learners save through a normal user_profiles update (their
-- own row). PIN students hold no session, so they save through the
-- client-asserted RPC below, the same pattern as update_student_pin
-- and log_activity: the sub-account must exist and be active.
--
-- Safe to run once in the SQL Editor; safe to re-run.

alter table public.sub_accounts
  add column if not exists study_days smallint[];

alter table public.user_profiles
  add column if not exists study_days smallint[];

comment on column public.sub_accounts.study_days is
  'Weekdays the student plans to study (0=Sunday..6=Saturday, UTC basis), at least 3 when set. NULL = not chosen, every day counts toward streaks.';
comment on column public.user_profiles.study_days is
  'Weekdays the learner plans to study (0=Sunday..6=Saturday, UTC basis), at least 3 when set. NULL = not chosen, every day counts toward streaks.';

create or replace function public.update_student_study_days(
  p_student_id uuid,
  p_days int[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days int[];
begin
  if p_days is null then
    return false;
  end if;

  -- Normalise: keep valid weekday numbers only, de-duplicated.
  select array_agg(distinct d order by d) into v_days
  from unnest(p_days) as d
  where d between 0 and 6;

  -- A study plan is 3 to 7 days; anything else is not a plan.
  if v_days is null or cardinality(v_days) < 3 or cardinality(v_days) > 7 then
    return false;
  end if;

  update public.sub_accounts
  set study_days = v_days
  where id = p_student_id
    and is_active = true;

  return found;
end;
$$;

comment on function public.update_student_study_days(uuid, int[]) is
  'Sets a PIN student''s study days (3-7 weekday numbers, 0=Sunday..6=Saturday). Client-asserted like authenticate_student: the sub-account must exist and be active. Returns true when a row was updated.';

grant execute on function public.update_student_study_days(uuid, int[]) to anon, authenticated;
