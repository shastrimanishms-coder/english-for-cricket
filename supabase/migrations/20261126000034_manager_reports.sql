-- ============================================================================
-- 20261126000034_manager_reports.sql
-- Round 81: manager student reports.
--
-- get_manager_reports() returns ONE ROW PER STUDENT in the calling
-- manager's own organisation, with every figure the Reports screen
-- shows:
--   - active seconds per stream from activity_logs ('app' is the
--     whole-app total; 'lesson_slide' / 'game' / 'reading' /
--     'speaking' / 'video' are the section breakdown — the sections
--     overlap the total by design and must never be added to it),
--   - lessons completed (distinct lessons) with summed score
--     correct/total for accuracy, from lesson_completions,
--   - stories read (distinct stories) and average accuracy from
--     reading_records (accuracy is only recorded for Read Aloud
--     sessions; Listen sessions carry NULL and are excluded from the
--     average, not counted as zero),
--   - conversations completed from point_events kind 'speaking_pass'
--     (Speaking Practice stores no per-conversation score — the award
--     IS the completion record — so there is deliberately NO speaking
--     accuracy figure anywhere in this report),
--   - study days: distinct UTC days with any activity or completion
--     (the same definition as get_activity_days, file 9),
--   - last active across activity, completions and last login,
--   - current position: stage/module titles of the furthest lesson
--     the student has completed, in path order,
--   - total_lessons: the size of the whole learning path.
--
-- WHY A FUNCTION: like get_admin_user_stats (file 8), the caller
-- check lives inside — the function resolves the caller's own
-- organisation from auth.uid() and returns rows for that
-- organisation only, so a manager can never see another
-- organisation's students. Everyone else gets no rows.
--
-- RUN: after files 8, 9, 18, 19. Safe to run more than once (CREATE
-- OR REPLACE). Nothing breaks if it has not been run yet: the
-- Reports screen falls back to client-side aggregation over the
-- tables and RPCs the Learning Progress screen already uses (with
-- the conversations count unavailable until this file runs).
-- ============================================================================

create or replace function public.get_manager_reports()
returns table (
  student_id uuid,
  app_seconds bigint,
  lesson_seconds bigint,
  game_seconds bigint,
  reading_seconds bigint,
  speaking_seconds bigint,
  video_seconds bigint,
  lessons_completed bigint,
  lesson_correct bigint,
  lesson_total bigint,
  stories_read bigint,
  reading_accuracy numeric,
  speaking_completed bigint,
  study_days bigint,
  last_active_at timestamptz,
  current_stage_title text,
  current_module_title text,
  total_lessons bigint
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_org_id uuid;
begin
  select o.id into v_org_id
  from public.organizations o
  where o.manager_id = auth.uid()
  limit 1;

  if v_org_id is null then
    return;
  end if;

  return query
  with org_students as (
    select sa.id as sid, sa.last_login_at as login_at
    from public.sub_accounts sa
    where sa.organization_id = v_org_id
      and sa.is_active = true
  ),
  activity as (
    select
      al.student_id as sid,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'app'), 0)::bigint as app_s,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'lesson_slide'), 0)::bigint as lesson_s,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'game'), 0)::bigint as game_s,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'reading'), 0)::bigint as reading_s,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'speaking'), 0)::bigint as speaking_s,
      coalesce(sum(al.duration_seconds) filter (where al.activity_type = 'video'), 0)::bigint as video_s,
      max(al.created_at) as last_at
    from public.activity_logs al
    join org_students os on os.sid = al.student_id
    group by al.student_id
  ),
  completions as (
    select
      lc.student_id as sid,
      count(distinct lc.lesson_id)::bigint as done,
      coalesce(sum(lc.score_correct), 0)::bigint as correct_sum,
      coalesce(sum(lc.score_total), 0)::bigint as total_sum,
      max(lc.completed_at) as last_at
    from public.lesson_completions lc
    join org_students os on os.sid = lc.student_id
    where lc.student_kind = 'sub_account'
    group by lc.student_id
  ),
  reading as (
    select
      rr.student_id as sid,
      count(distinct rr.story_id)::bigint as stories,
      round(avg(rr.accuracy), 1) as acc
    from public.reading_records rr
    join org_students os on os.sid = rr.student_id
    where rr.student_kind = 'sub_account'
    group by rr.student_id
  ),
  speaking as (
    select
      pe.student_id as sid,
      count(*)::bigint as done
    from public.point_events pe
    join org_students os on os.sid = pe.student_id
    where pe.student_kind = 'sub_account'
      and pe.kind = 'speaking_pass'
    group by pe.student_id
  ),
  days as (
    select d.sid, count(*)::bigint as n
    from (
      select os.sid as sid, (al.created_at at time zone 'utc')::date as day
      from public.activity_logs al
      join org_students os on os.sid = al.student_id
      union
      select os.sid, (lc.completed_at at time zone 'utc')::date
      from public.lesson_completions lc
      join org_students os on os.sid = lc.student_id
      where lc.student_kind = 'sub_account'
    ) d
    group by d.sid
  ),
  position as (
    select distinct on (lc.student_id)
      lc.student_id as sid,
      cs.title as stage_title,
      cm.title as module_title
    from public.lesson_completions lc
    join org_students os on os.sid = lc.student_id
    join public.curriculum_lessons cl on cl.id = lc.lesson_id
    join public.curriculum_modules cm on cm.id = cl.module_id
    left join public.curriculum_stages cs on cs.id = cm.stage_id
    where lc.student_kind = 'sub_account'
    order by lc.student_id, cm.order_index desc, cl.order_index desc
  )
  select
    os.sid,
    coalesce(a.app_s, 0),
    coalesce(a.lesson_s, 0),
    coalesce(a.game_s, 0),
    coalesce(a.reading_s, 0),
    coalesce(a.speaking_s, 0),
    coalesce(a.video_s, 0),
    coalesce(cp.done, 0),
    coalesce(cp.correct_sum, 0),
    coalesce(cp.total_sum, 0),
    coalesce(r.stories, 0),
    r.acc,
    coalesce(sp.done, 0),
    coalesce(d.n, 0),
    greatest(a.last_at, cp.last_at, os.login_at),
    pos.stage_title,
    pos.module_title,
    (select count(*)::bigint from public.curriculum_lessons)
  from org_students os
  left join activity a on a.sid = os.sid
  left join completions cp on cp.sid = os.sid
  left join reading r on r.sid = os.sid
  left join speaking sp on sp.sid = os.sid
  left join days d on d.sid = os.sid
  left join position pos on pos.sid = os.sid;
end;
$$;

comment on function public.get_manager_reports() is
  'Round 81: per-student report figures for the CALLING manager''s own organisation only (organisation resolved from auth.uid(); no rows for anyone else). Active seconds per activity_logs stream, lessons/stories/speaking completions and accuracies from the tables that actually store them — speaking has no stored score, so no speaking accuracy is returned.';

grant execute on function public.get_manager_reports() to authenticated;
