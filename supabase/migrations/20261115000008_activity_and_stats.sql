-- ============================================================================
-- 20261115000008_activity_and_stats.sql
-- Phase 2 Wave A backend: activity logging for ALL students, country/region
-- on sign-up, and the admin user-stats feed.
--
-- THREE things in this file:
--
-- 1. log_activity(...) - a function the game/video players call to record
--    how long a student played or watched. Until now only email learners
--    could write activity rows (they have a login session the safety rules
--    can check). PIN students have NO session - their "login" is the
--    authenticate_student function handing the app a payload it stores on
--    the device - so their playtime was never recorded at all. This
--    function accepts their calls too, with the same trust model as
--    authenticate_student: the app states who the student is, and the
--    function checks that the student exists and is still active before
--    writing anything. The data at stake is playtime seconds, not
--    credentials or personal data.
--    Email learners are held to a stricter rule: they may only log
--    activity for their own account (their login token must match).
--
-- 2. handle_new_user() - the sign-up trigger function from files 3 + 7,
--    unchanged except it now ALSO copies country and region into the new
--    profile when the sign-up form sends them (the register screen starts
--    sending them in Wave B). If they are not sent, the profile simply
--    gets empty values, exactly as today. The role handling - including
--    the cast to the user_role list type from file 7 - is identical.
--
-- 3. get_admin_user_stats() - one row per learner (email learners AND
--    PIN students together) with total time on the app, the split by
--    activity (games / videos / lessons), lessons completed, average
--    accuracy, and when they were last active. This feeds the admin
--    User Management stats in Wave B. It is a function, not a view, on
--    purpose: a view would be readable by anyone who can call the API,
--    while this function checks first that the caller is the admin
--    (super_admin) and returns NO rows to anyone else.
--    "avg_accuracy" is a percentage (0-100), empty when the student has
--    not answered any scored lesson questions yet.
--
-- RUN: after file 7. Safe to run more than once (CREATE OR REPLACE
-- throughout). Nothing in the app breaks if this file has not been run
-- yet: the players treat a missing log_activity as "skip recording",
-- and the stats function is only used by the admin screens.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. log_activity: validated activity writer for both identity kinds.
-- ----------------------------------------------------------------------------
create or replace function public.log_activity(
  p_student_id uuid,
  p_student_kind text,
  p_activity_type text,
  p_target_id uuid,
  p_duration_seconds int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration int := least(greatest(coalesce(p_duration_seconds, 0), 0), 86400);
begin
  if p_student_kind = 'sub_account' then
    -- PIN student: no session exists to check, so mirror
    -- authenticate_student's trust model - the student must exist and
    -- still be active.
    if not exists (
      select 1
      from public.sub_accounts
      where id = p_student_id
        and is_active = true
    ) then
      raise exception 'Unknown or inactive student'
        using errcode = 'P0001';
    end if;
  elsif p_student_kind = 'auth' then
    -- Email learner: a login token must be present and must belong to
    -- the student being logged for.
    if auth.uid() is null or auth.uid() <> p_student_id then
      raise exception 'Cannot log activity for another student'
        using errcode = 'P0001';
    end if;
  else
    raise exception 'Invalid student kind'
      using errcode = 'P0001';
  end if;

  insert into public.activity_logs (student_id, activity_type, target_id, duration_seconds)
  values (p_student_id, p_activity_type, p_target_id, v_duration);
end;
$$;

comment on function public.log_activity(uuid, text, text, uuid, int) is
  'Records one activity_logs row. PIN students (sub_account) are client-asserted like authenticate_student: the sub-account must exist and be active. Email learners (auth) may only log for their own auth.uid(). Duration is clamped to 0..86400 seconds.';

grant execute on function public.log_activity(uuid, text, text, uuid, int) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. handle_new_user: file 7's version + country/region from metadata.
--    (Role is a user_role ENUM - the cast and the whitelist from file 7
--    are kept exactly; do not "simplify" them away.)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name, role, country, region)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    case
      when new.raw_user_meta_data ->> 'role'
           in ('super_admin', 'manager', 'individual_learner')
        then (new.raw_user_meta_data ->> 'role')::public.user_role
      else 'individual_learner'::public.user_role
    end,
    nullif(new.raw_user_meta_data ->> 'country', ''),
    nullif(new.raw_user_meta_data ->> 'region', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the user_profiles row for a new auth user from sign-up metadata (display_name/role, cast to the user_role enum; country/region copied when present). Idempotent via ON CONFLICT DO NOTHING.';

-- ----------------------------------------------------------------------------
-- 3. get_admin_user_stats: unified per-learner stats, admin-only.
--    Identity classification is applied consistently everywhere: an id
--    counts as 'sub_account' when it exists in sub_accounts, otherwise
--    'auth' (activity_logs carries no kind column, so this existence
--    check is the only reliable way to tell the two id spaces apart -
--    the same fix for the "stats always zero" bug in UsersManager).
-- ----------------------------------------------------------------------------
create or replace function public.get_admin_user_stats()
returns table (
  student_id uuid,
  student_kind text,
  total_seconds bigint,
  game_seconds bigint,
  video_seconds bigint,
  lesson_seconds bigint,
  lessons_completed bigint,
  avg_accuracy numeric,
  last_active_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- Only the admin (super_admin) gets rows; everyone else gets an
  -- empty result. This check is what makes a function safer than a
  -- view here: views cannot run a check like this per caller.
  if not public.is_admin() then
    return;
  end if;

  return query
  with classified as (
    -- Every learner identity, from all four places one can appear, so
    -- students with zero recorded activity still show up.
    select up.id as sid, 'auth'::text as kind
    from public.user_profiles up
    where up.role = 'individual_learner'
      and not exists (select 1 from public.sub_accounts sa where sa.id = up.id)
    union
    select sa.id, 'sub_account'::text
    from public.sub_accounts sa
    union
    select al.student_id,
           case when exists (select 1 from public.sub_accounts sa where sa.id = al.student_id)
                then 'sub_account'::text else 'auth'::text end
    from public.activity_logs al
    union
    select lc.student_id, lc.student_kind
    from public.lesson_completions lc
  ),
  activity as (
    select
      al.student_id as sid,
      coalesce(sum(al.duration_seconds), 0)::bigint as tot,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'game'), 0)::bigint as game_s,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'video'), 0)::bigint as video_s,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'lesson_slide'), 0)::bigint as lesson_s,
      max(al.created_at) as last_at
    from public.activity_logs al
    group by al.student_id
  ),
  completions as (
    select
      lc.student_id as sid,
      lc.student_kind as kind,
      count(*)::bigint as done,
      coalesce(sum(lc.score_correct), 0) as correct_sum,
      coalesce(sum(lc.score_total), 0) as total_sum,
      max(lc.completed_at) as last_at
    from public.lesson_completions lc
    group by lc.student_id, lc.student_kind
  ),
  logins as (
    select u.id as sid, max(u.last_login_at) as last_at
    from (
      select id, last_login_at from public.user_profiles
      union all
      select id, last_login_at from public.sub_accounts
    ) u
    group by u.id
  )
  select
    c.sid,
    c.kind,
    coalesce(a.tot, 0),
    coalesce(a.game_s, 0),
    coalesce(a.video_s, 0),
    coalesce(a.lesson_s, 0),
    coalesce(cp.done, 0),
    case when coalesce(cp.total_sum, 0) > 0
         then round(cp.correct_sum::numeric * 100 / cp.total_sum, 1)
         else null
    end,
    greatest(a.last_at, cp.last_at, l.last_at)
  from classified c
  left join activity a on a.sid = c.sid
  left join completions cp on cp.sid = c.sid and cp.kind = c.kind
  left join logins l on l.sid = c.sid
  order by c.kind, c.sid;
end;
$$;

comment on function public.get_admin_user_stats() is
  'Admin-only per-learner stats: total/game/video/lesson seconds from activity_logs, lessons completed and average accuracy (percent) from lesson_completions, last active across logs, completions and last_login_at. Returns no rows to non-admins.';

grant execute on function public.get_admin_user_stats() to authenticated;
