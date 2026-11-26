-- ============================================================================
-- 20261126000035_speaking_accuracy.sql
-- Round 82: speaking accuracy + "Practice focus" in manager reports.
--
-- PART 1 — public.speaking_line_results: one row per SCORED ATTEMPT
-- at a learner line in Speaking Practice (scenario dialogue turns
-- and "Practise My Lesson Lines" lines). Until now the score existed
-- only on screen and was thrown away; this table keeps it so the
-- manager reports can show a speaking accuracy figure and a
-- practice-focus list.
--
-- PRIVACY — DATA MINIMISATION (standing rule, Shastri 2026-11-26:
-- privacy and child safety rule over features; store ONLY what the
-- reporting feature needs). Field-by-field audit:
--   student_id / student_kind — whose result this is (the report is
--     per student). Needed.
--   session_id — one play of a conversation / lines run; the
--     accuracy rule is "first attempt per line per session", which
--     is impossible to compute without grouping attempts into
--     sessions. Needed.
--   scenario_id / scenario_title — report context: the practice
--     list names the conversation a phrase came from. scenario_id
--     is NULL for built-in scenarios and lesson lines. Needed.
--   line_index — which line in the session (with session_id, makes
--     the first-attempt rule computable). Needed.
--   target_text — OUR OWN curriculum phrase the learner was asked
--     to say; the practice-focus list is a list of these phrases.
--     It is never anything the child said. Needed.
--   score / passed — the number the report averages (passed is
--     score >= 70, the app's existing pass mark, computed here so
--     the rule lives in exactly one place). Needed.
--   created_at — recency: practice focus orders by the latest
--     failure and counts passes after it. Needed.
-- NOTHING ELSE IS STORED. In particular: NO transcript of what the
-- child actually said (the recogniser's text is used on the device
-- to compute the score and is then discarded), NO audio, NO device,
-- browser, IP or user-agent data, NO free-text fields.
--
-- Writes go through record_speaking_line() only (the table has RLS
-- on and no client policies; reads happen inside the SECURITY
-- DEFINER get_manager_reports()). Identity rules mirror
-- log_activity (file 8) exactly: PIN students (sub_account) are
-- client-asserted — the sub-account must exist and be active;
-- email learners (auth) may only record for their own auth.uid().
--
-- ACCOUNT DELETION: the app's two deletion paths are (a) a direct
-- delete of the sub_accounts row (UsersManager) and (b) the
-- admin_delete_user() RPC for auth accounts (file 31). A BEFORE
-- DELETE trigger on sub_accounts and one added line in
-- admin_delete_user() below remove this table's rows on both paths.
-- NOTE: the older per-student tables (reading_records,
-- point_events, lesson_completions, activity_logs) are NOT cleaned
-- by either path today — that pre-existing gap is recorded here,
-- deliberately not fixed in this round.
--
-- PART 2 — get_manager_reports() gains three columns (appended, so
-- the Round 81 columns keep their order): speaking_accuracy
-- (numeric, NULL when the student has no recorded lines),
-- speaking_lines_attempted (the denominator: first-attempt lines),
-- practice_focus (jsonb array, possibly empty). The function must
-- be dropped and recreated — CREATE OR REPLACE cannot change a
-- RETURNS TABLE shape. The Reports screen reads the new fields only
-- when present, so everything keeps working before this file runs.
--
-- THE ACCURACY RULE (implemented below, in one place):
--   For each recorded session and each line in it, take the FIRST
--   attempt's result. Speaking accuracy = passed first attempts /
--   all first attempts, as a percentage. Retries never inflate it:
--   failing a line and then passing it on the second try still
--   counts as a failed first attempt (the later pass is not lost —
--   it is what the practice-focus graduation rule below reads).
--   Sessions are counted whether or not the student reached the
--   end of the conversation: a first attempt is a first attempt.
--   (An earlier draft counted only completed sessions; that needed
--   a separate sessions table — more stored data for no reporting
--   gain — so it was dropped under the minimisation rule.)
--
-- THE PRACTICE-FOCUS RULES (implemented below):
--   Speaking (max 6, latest failure first): a phrase is listed when
--     it has at least 2 failed attempts AND fewer than 2 passed
--     attempts after its most recent failure — so a phrase the
--     student has since mastered (two clean passes after the last
--     failure) graduates off the list.
--   Reading (max 3, most recent first): stories whose LATEST
--     accuracy-bearing reading_records row is under 80%.
--   Lessons (max 3, most recent first): lessons whose LATEST
--     completion scored under 70% (with score_total > 0).
--   Combined in that order, capped at 10 items per student.
--
-- RUN: after files 8, 19, 31, 34. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: the table
-- ---------------------------------------------------------------------------

create table if not exists public.speaking_line_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  student_kind text not null check (student_kind in ('auth', 'sub_account')),
  session_id uuid not null,
  scenario_id uuid,
  scenario_title text,
  line_index integer not null,
  target_text text not null,
  score integer not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists speaking_line_results_student_time
  on public.speaking_line_results (student_id, student_kind, created_at);
create index if not exists speaking_line_results_student_text
  on public.speaking_line_results (student_id, target_text);

-- Locked down: no direct client access at all. Writes only via
-- record_speaking_line(), reads only via get_manager_reports().
alter table public.speaking_line_results enable row level security;

-- ---------------------------------------------------------------------------
-- Part 1: the write path (mirrors log_activity's identity rules)
-- ---------------------------------------------------------------------------

create or replace function public.record_speaking_line(
  p_student_id uuid,
  p_student_kind text,
  p_session_id uuid,
  p_scenario_id uuid,
  p_scenario_title text,
  p_line_index integer,
  p_target_text text,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score int := least(greatest(coalesce(p_score, 0), 0), 100);
begin
  if p_student_kind = 'sub_account' then
    -- PIN student: no session exists to check, so mirror
    -- authenticate_student's trust model - the student must exist
    -- and still be active.
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
    -- Email learner: a login token must be present and must belong
    -- to the student being recorded for.
    if auth.uid() is null or auth.uid() <> p_student_id then
      raise exception 'Cannot record speaking results for another student'
        using errcode = 'P0001';
    end if;
  else
    raise exception 'Invalid student kind'
      using errcode = 'P0001';
  end if;

  if p_target_text is null or length(trim(p_target_text)) = 0 then
    raise exception 'Missing target text'
      using errcode = 'P0001';
  end if;

  -- Only the score and OUR OWN target phrase are stored. The
  -- recognised transcript of the child's speech is never passed to
  -- this function and never stored anywhere.
  insert into public.speaking_line_results
    (student_id, student_kind, session_id, scenario_id, scenario_title,
     line_index, target_text, score, passed)
  values
    (p_student_id, p_student_kind, p_session_id, p_scenario_id,
     nullif(p_scenario_title, ''), greatest(coalesce(p_line_index, 0), 0),
     p_target_text, v_score, v_score >= 70);
end;
$$;

comment on function public.record_speaking_line(uuid, text, uuid, uuid, text, integer, text, integer) is
  'Round 82: records ONE scored Speaking Practice attempt — the score and our own curriculum target phrase only; the child''s recognised speech is never stored. PIN students client-asserted (must exist and be active); email learners only for themselves. passed = score >= 70 (the app pass mark).';

grant execute on function public.record_speaking_line(uuid, text, uuid, uuid, text, integer, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 1b: account deletion covers the new table, on both paths.
-- ---------------------------------------------------------------------------

create or replace function public.delete_speaking_results_on_student_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.speaking_line_results
  where student_id = old.id
    and student_kind = 'sub_account';
  return old;
end;
$$;

drop trigger if exists trg_delete_speaking_results on public.sub_accounts;
create trigger trg_delete_speaking_results
  before delete on public.sub_accounts
  for each row
  execute function public.delete_speaking_results_on_student_delete();

-- admin_delete_user (file 31) recreated verbatim, plus ONE line:
-- the new table's rows for the deleted auth account go too.
create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_students integer;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'Only the App Manager can delete accounts.');
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'You cannot delete your own account.');
  end if;

  select count(*) into v_students
  from public.sub_accounts s
  join public.organizations o on o.id = s.organization_id
  where o.manager_id = p_user_id;

  if v_students > 0 then
    return jsonb_build_object('ok', false, 'error',
      'This account manages ' || v_students || ' student account(s). Delete or move those students first, then delete this account.');
  end if;

  -- Round 82: speaking line results for this account are deleted
  -- with it (the older per-student tables are not touched here —
  -- see the note at the top of this file).
  delete from public.speaking_line_results
  where student_id = p_user_id
    and student_kind = 'auth';

  delete from public.organizations where manager_id = p_user_id;
  delete from auth.users where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Part 2: get_manager_reports() with speaking accuracy + practice focus.
-- (DROP first: CREATE OR REPLACE cannot change the return shape.)
-- ---------------------------------------------------------------------------

drop function if exists public.get_manager_reports();

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
  total_lessons bigint,
  speaking_accuracy numeric,
  speaking_lines_attempted bigint,
  practice_focus jsonb
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
  ),
  -- Round 82: first attempt per (session, line) — retries in the
  -- same session never replace it.
  speaking_first as (
    select distinct on (slr.student_id, slr.session_id, slr.line_index)
      slr.student_id as sid,
      slr.passed as passed
    from public.speaking_line_results slr
    join org_students os on os.sid = slr.student_id
    where slr.student_kind = 'sub_account'
    order by slr.student_id, slr.session_id, slr.line_index, slr.created_at asc, slr.id asc
  ),
  speaking_acc as (
    select
      sf.sid,
      count(*)::bigint as lines_n,
      round(100.0 * (count(*) filter (where sf.passed)) / count(*), 1) as acc
    from speaking_first sf
    group by sf.sid
  ),
  -- Round 82 practice focus — speaking: phrases with >= 2 failures
  -- and < 2 passes after the most recent failure.
  speaking_fail_stats as (
    select
      slr.student_id as sid,
      slr.target_text as target_text,
      count(*)::bigint as fails,
      max(slr.created_at) as last_fail_at
    from public.speaking_line_results slr
    join org_students os on os.sid = slr.student_id
    where slr.student_kind = 'sub_account'
      and not slr.passed
    group by slr.student_id, slr.target_text
    having count(*) >= 2
  ),
  speaking_focus_candidates as (
    select
      fs.sid,
      fs.target_text,
      fs.last_fail_at,
      (select count(*)
         from public.speaking_line_results p
         where p.student_id = fs.sid
           and p.student_kind = 'sub_account'
           and p.target_text = fs.target_text
           and p.passed
           and p.created_at > fs.last_fail_at) as passes_after,
      (select x.scenario_title
         from public.speaking_line_results x
         where x.student_id = fs.sid
           and x.student_kind = 'sub_account'
           and x.target_text = fs.target_text
           and not x.passed
         order by x.created_at desc
         limit 1) as last_scenario_title
    from speaking_fail_stats fs
  ),
  speaking_focus as (
    -- Ranked AFTER graduated phrases are removed, so a mastered
    -- phrase never eats one of the six slots.
    select
      sfc.sid,
      case
        when length(sfc.target_text) > 90 then left(sfc.target_text, 89) || '…'
        else sfc.target_text
      end as label,
      coalesce(sfc.last_scenario_title, 'Speaking Practice') as detail,
      row_number() over (partition by sfc.sid order by sfc.last_fail_at desc) as rn
    from speaking_focus_candidates sfc
    where sfc.passes_after < 2
  ),
  -- Round 82 practice focus — reading: latest accuracy-bearing
  -- record per story under 80%.
  reading_latest as (
    select distinct on (rr.student_id, rr.story_id)
      rr.student_id as sid,
      rr.story_id as story_id,
      rr.accuracy as accuracy,
      rr.created_at as created_at
    from public.reading_records rr
    join org_students os on os.sid = rr.student_id
    where rr.student_kind = 'sub_account'
      and rr.accuracy is not null
    order by rr.student_id, rr.story_id, rr.created_at desc
  ),
  reading_focus as (
    select
      rl.sid,
      rs.title as label,
      'Read Aloud accuracy ' || rl.accuracy || '%' as detail,
      row_number() over (partition by rl.sid order by rl.created_at desc) as rn
    from reading_latest rl
    join public.reading_stories rs on rs.id = rl.story_id
    where rl.accuracy < 80
  ),
  -- Round 82 practice focus — lessons: latest completion per lesson
  -- under 70%.
  lesson_latest as (
    select distinct on (lc.student_id, lc.lesson_id)
      lc.student_id as sid,
      lc.lesson_id as lesson_id,
      lc.score_correct as correct,
      lc.score_total as total,
      lc.completed_at as completed_at
    from public.lesson_completions lc
    join org_students os on os.sid = lc.student_id
    where lc.student_kind = 'sub_account'
      and lc.score_total > 0
    order by lc.student_id, lc.lesson_id, lc.completed_at desc
  ),
  lesson_focus as (
    select
      ll.sid,
      cl.title as label,
      coalesce(cs.title || ' · ', '') || cm.title || ' — ' ||
        round(100.0 * ll.correct / ll.total)::int || '%' as detail,
      row_number() over (partition by ll.sid order by ll.completed_at desc) as rn
    from lesson_latest ll
    join public.curriculum_lessons cl on cl.id = ll.lesson_id
    join public.curriculum_modules cm on cm.id = cl.module_id
    left join public.curriculum_stages cs on cs.id = cm.stage_id
    where round(100.0 * ll.correct / ll.total) < 70
  ),
  focus_items as (
    select sid, 0 as grp, rn,
      jsonb_build_object('type', 'speaking', 'label', label, 'detail', detail) as item
    from speaking_focus
    where rn <= 6
    union all
    select sid, 1, rn,
      jsonb_build_object('type', 'reading', 'label', label, 'detail', detail)
    from reading_focus
    where rn <= 3
    union all
    select sid, 2, rn,
      jsonb_build_object('type', 'lesson', 'label', label, 'detail', detail)
    from lesson_focus
    where rn <= 3
  ),
  focus_ranked as (
    select
      fi.sid,
      fi.item,
      row_number() over (partition by fi.sid order by fi.grp, fi.rn) as pos
    from focus_items fi
  ),
  practice as (
    select
      fr.sid,
      jsonb_agg(fr.item order by fr.pos) as items
    from focus_ranked fr
    where fr.pos <= 10
    group by fr.sid
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
    (select count(*)::bigint from public.curriculum_lessons),
    sa.acc,
    coalesce(sa.lines_n, 0),
    coalesce(pf.items, '[]'::jsonb)
  from org_students os
  left join activity a on a.sid = os.sid
  left join completions cp on cp.sid = os.sid
  left join reading r on r.sid = os.sid
  left join speaking sp on sp.sid = os.sid
  left join days d on d.sid = os.sid
  left join position pos on pos.sid = os.sid
  left join speaking_acc sa on sa.sid = os.sid
  left join practice pf on pf.sid = os.sid;
end;
$$;

comment on function public.get_manager_reports() is
  'Per-student report figures for the CALLING manager''s own organisation only (organisation resolved from auth.uid()). Round 81 figures plus Round 82: speaking_accuracy (first attempt per line per session, from speaking_line_results; NULL when none recorded) and practice_focus (speaking phrases not yet mastered, low Read Aloud stories, low-scoring lessons; max 10).';

grant execute on function public.get_manager_reports() to authenticated;
