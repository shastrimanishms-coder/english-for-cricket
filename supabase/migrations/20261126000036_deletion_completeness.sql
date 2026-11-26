-- ============================================================================
-- 20261126000036_deletion_completeness.sql
-- Round 82 fix: deleting a student now deletes ALL of their data.
--
-- WHY: migration 35 recorded that the older per-student tables were
-- cleaned by NEITHER of the app's deletion paths. Shastri approved
-- closing the gap on 2026-11-26, under his standing rule (privacy
-- and child safety first): a deleted student's data must actually
-- be deleted.
--
-- THE AUDIT (every migration 1-35 + the base schema's table list,
-- cross-checked against src/lib/backup.ts's table inventory):
-- per-student data lives in exactly six tables -
--   activity_logs        student_id only (no kind column - files 8/9
--                        already classify by id alone; the auth and
--                        sub_account id spaces are disjoint)
--   lesson_completions   student_id + student_kind (file 6)
--   point_events         student_id + student_kind (file 18; this is
--                        also the XP/stars ledger AND the backing
--                        store get_extra_completions reads - file 20)
--   reading_records      student_id + student_kind (file 19)
--   speaking_line_results student_id + student_kind (file 35 -
--                        already covered there; kept covered here)
--   student_badges       student_id only (badge AWARDS; the badges
--                        table itself is shared definitions/content)
-- Everything else a student "has" is a COLUMN on their own account
-- row - voice_prefs (file 23), study_days (file 16), placement
-- (file 21), class_name (file 14) on sub_accounts, and the same
-- columns on user_profiles - so it dies with the row itself and
-- needs no separate cleanup.
-- Badges are otherwise computed live from completions/activity
-- (file 9's RPCs), points totals are computed from point_events
-- (file 18) - there is no separate balances/awards table to clean.
--
-- DELIBERATELY NOT DELETED (named so Shastri can overrule):
--   * support_messages / support_message_replies - the public
--     Help & Support contact-form inbox. Rows carry only the name,
--     email and message a sender typed into a public form; there is
--     NO account key on them, so an account deletion cannot identify
--     "this account's messages" (matching by typed email would be
--     guesswork and could delete a stranger's message). The admin
--     can delete inbox messages in the panel, as today.
--   * assets / lesson_media uploaded_by - shared teaching content;
--     the foreign key is ON DELETE SET NULL by design (files 1/2):
--     the content stays, the uploader link clears. Not student data.
--   * Voice Studio tables (voice_actors, voices, voice_lines,
--     voice_recordings) - consenting ADULT volunteer actors, a
--     separate system with its own deletion route. Out of scope.
--   * organizations - unchanged: admin_delete_user already removes
--     a manager's EMPTY organizations and refuses while students
--     remain. No shared content is ever deleted by this file.
--
-- THE DELETION PATHS, and how each is covered after this file:
--   1. Direct delete of a sub_accounts row (UsersManager's
--      delete-student button + the inactivity hard-delete loop)
--      -> BEFORE DELETE trigger on sub_accounts (below). This
--      REPLACES migration 35's speaking-only trigger with one
--      trigger function covering every audited table.
--   2. admin_delete_user() RPC (UsersManager master-account delete
--      + the inactivity hard-delete loop for auth accounts)
--      -> recreated below with the full cleanup added, otherwise
--      verbatim from migration 35.
--   3. Every OTHER route that removes an auth account - the retired
--      delete-user Edge Function (no longer called by the app; it
--      deletes auth.users and then the profile row explicitly), or
--      a manual deletion in the Supabase dashboard - removes the
--      user_profiles row (by its FK cascade from auth.users, or
--      explicitly). PostgreSQL fires row triggers for cascaded
--      deletes too, so a BEFORE DELETE trigger on user_profiles
--      (below) covers ALL of these routes with the same cleanup.
--      No auth-account deletion route remains uncovered.
--
-- All cleanup runs through ONE helper, delete_all_student_data(),
-- so the table list lives in exactly one place. The helper is
-- SECURITY DEFINER (the per-student tables have no client DELETE
-- policies at all - this is the only sanctioned way rows leave
-- them) and its EXECUTE is revoked from every client role: it must
-- only ever run from the two triggers and admin_delete_user, never
-- as a callable RPC (it deletes by id, so a public RPC would be a
-- data-destruction vector).
--
-- No live feature behaviour changes: nothing here touches how data
-- is written or read, only what happens when an account row is
-- deleted. Deletes are idempotent (deleting zero rows is fine) and
-- the RPC/trigger double coverage on path 2 is a harmless no-op
-- the second time.
--
-- RUN: after file 35. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The one cleanup helper: every audited per-student table.
-- ---------------------------------------------------------------------------

create or replace function public.delete_all_student_data(
  p_student_id uuid,
  p_student_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Tables keyed by student_id + student_kind.
  delete from public.lesson_completions
  where student_id = p_student_id
    and student_kind = p_student_kind;

  delete from public.point_events
  where student_id = p_student_id
    and student_kind = p_student_kind;

  delete from public.reading_records
  where student_id = p_student_id
    and student_kind = p_student_kind;

  delete from public.speaking_line_results
  where student_id = p_student_id
    and student_kind = p_student_kind;

  -- Tables keyed by student_id alone (no kind column exists; the
  -- two id spaces are disjoint - the same classification files 8
  -- and 9 already rely on).
  delete from public.activity_logs
  where student_id = p_student_id;

  delete from public.student_badges
  where student_id = p_student_id;
end;
$$;

comment on function public.delete_all_student_data(uuid, text) is
  'Round 82 fix: deletes EVERY per-student data row for one student (lesson_completions, point_events, reading_records, speaking_line_results by id+kind; activity_logs, student_badges by id). Internal only - called by the sub_accounts/user_profiles BEFORE DELETE triggers and by admin_delete_user. EXECUTE is revoked from all client roles on purpose.';

-- Lock the helper down: only the SECURITY DEFINER callers below
-- (same owner) may run it.
revoke execute on function public.delete_all_student_data(uuid, text) from public;
revoke execute on function public.delete_all_student_data(uuid, text) from anon;
revoke execute on function public.delete_all_student_data(uuid, text) from authenticated;

-- ---------------------------------------------------------------------------
-- Path 1: sub_accounts row deletion (PIN students).
-- Replaces migration 35's speaking-only trigger.
-- ---------------------------------------------------------------------------

create or replace function public.delete_student_data_on_sub_account_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_all_student_data(old.id, 'sub_account');
  return old;
end;
$$;

drop trigger if exists trg_delete_speaking_results on public.sub_accounts;
drop function if exists public.delete_speaking_results_on_student_delete();

drop trigger if exists trg_delete_student_data on public.sub_accounts;
create trigger trg_delete_student_data
  before delete on public.sub_accounts
  for each row
  execute function public.delete_student_data_on_sub_account_delete();

-- ---------------------------------------------------------------------------
-- Path 3 (and the backstop for path 2): user_profiles row deletion.
-- Fires for the FK cascade from auth.users AND for explicit profile
-- deletes, so every auth-account deletion route is covered.
-- ---------------------------------------------------------------------------

create or replace function public.delete_student_data_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_all_student_data(old.id, 'auth');
  return old;
end;
$$;

drop trigger if exists trg_delete_student_data on public.user_profiles;
create trigger trg_delete_student_data
  before delete on public.user_profiles
  for each row
  execute function public.delete_student_data_on_profile_delete();

-- ---------------------------------------------------------------------------
-- Path 2: admin_delete_user (files 31 + 35) recreated verbatim,
-- with the speaking-only delete replaced by the full cleanup call
-- in the same position (after the students guard, before the
-- organization and auth.users deletes).
-- ---------------------------------------------------------------------------

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

  -- Round 82 fix (migration 36): ALL of this account's per-student
  -- data is deleted with it (migration 35 covered speaking_line_
  -- results only). The user_profiles trigger above would catch
  -- these rows again when the profile cascades below - a no-op.
  perform public.delete_all_student_data(p_user_id, 'auth');

  delete from public.organizations where manager_id = p_user_id;
  delete from auth.users where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;
