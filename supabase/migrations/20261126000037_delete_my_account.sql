-- ============================================================================
-- Migration 37: Self-service account deletion (Round 84)
--
-- delete_my_account(): a signed-in user deletes THEIR OWN account.
-- Until now the only deletion routes were the App Manager's
-- admin_delete_user (migration 31) and a manager deleting a PIN
-- student; an individual learner or a manager who wanted to leave
-- had to email support. Shastri asked for a Delete Account button in
-- Profile for signed-in accounts (individual learners and managers).
-- PIN students get NO button and NO route here - they hold no
-- Supabase session, and their deletion stays with their manager,
-- exactly as before.
--
-- HOW IT WORKS - the same machinery as admin_delete_user, narrowed
-- to the caller:
--   * The target is auth.uid() and nothing else. There is no id
--     parameter, so the function can never be aimed at another
--     person's account.
--   * No auth user (anon / PIN session) -> refused.
--   * Staff accounts (super_admin, content_manager) are refused:
--     they are managed through the admin dashboard, and the App
--     Manager deleting the only admin account would lock everyone
--     out of the site's controls. The message points to support.
--   * The manager guard is admin_delete_user's, verbatim in effect:
--     a manager whose organization still has student accounts is
--     refused, with the same plain message, until the students are
--     deleted or moved. Students are never deleted or stranded by
--     this function.
--   * delete_all_student_data (migration 36) removes the caller's
--     learner records from all six per-student tables; the
--     organizations they manage are then removed (the guard has
--     already established that those organizations hold no
--     students), and the auth.users row is deleted from the
--     SECURITY DEFINER function, exactly as admin_delete_user does
--     it. The user_profiles row follows by its foreign-key cascade,
--     which also fires migration 36's BEFORE DELETE trigger - a
--     harmless second pass over tables already emptied.
--   * Because the auth.users row itself is removed (not just the
--     profile), the login is gone completely and the same email
--     address can be used to register a fresh account afterwards.
--
-- Voice Studio actor accounts are a separate system (username
-- sign-in, adult volunteers, their own consent and deletion route);
-- they are not touched here.
--
-- The client re-authenticates the user with their password before
-- calling this (the Change Password pattern), so a session left
-- signed in on a shared device is not enough on its own to delete
-- an account. Accounts that signed in with Google and never set a
-- password confirm with their account email instead; this function
-- still requires the live authenticated session either way.
--
-- RUN: after migration 36. Safe to run more than once.
-- ============================================================================

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_students integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error',
      'You must be signed in to delete your account.');
  end if;

  select role into v_role from public.user_profiles where id = v_uid;

  if v_role in ('super_admin', 'content_manager') then
    return jsonb_build_object('ok', false, 'error',
      'This type of account cannot be deleted here. Please contact us through the Support page for help.');
  end if;

  -- The manager guard, mirroring admin_delete_user: students must
  -- be deleted or moved first; they are never touched here.
  select count(*) into v_students
  from public.sub_accounts s
  join public.organizations o on o.id = s.organization_id
  where o.manager_id = v_uid;

  if v_students > 0 then
    return jsonb_build_object('ok', false, 'error',
      'This account manages ' || v_students || ' student account(s). Delete or move those students first, then delete this account.');
  end if;

  -- All of the caller's own learner records (progress, scores,
  -- points, reading records, speaking results, activity time,
  -- badges) - the one helper from migration 36.
  perform public.delete_all_student_data(v_uid, 'auth');

  -- Organizations the caller manages hold no students at this
  -- point (guard above) and are removed with the account, as in
  -- admin_delete_user.
  delete from public.organizations where manager_id = v_uid;

  -- The login itself. The profile row follows by cascade, firing
  -- migration 36's profile trigger as a no-op second pass.
  delete from auth.users where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.delete_my_account() is
  'Round 84: self-service account deletion for signed-in individual learners and managers. Target is always auth.uid(); refuses anon callers and staff roles; refuses managers who still have student accounts; removes all per-student data via delete_all_student_data, the caller''s (now empty) organizations, and the auth.users row itself.';

-- Signed-in users only: never reachable with the anon key.
revoke execute on function public.delete_my_account() from public;
revoke execute on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
