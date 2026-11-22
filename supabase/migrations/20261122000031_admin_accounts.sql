-- ============================================================================
-- Migration 31: Admin account powers (Round 40)
--
-- 1. user_profiles gains the same retention fields sub_accounts already
--    has, so individual accounts join the inactivity pipeline
--    (7/14/21/28-day reminders, 30-day mark, 90-day hard delete).
-- 2. admin_delete_user(p_user_id): true account deletion from the admin
--    dashboard WITHOUT the delete-user Edge Function. A SECURITY
--    DEFINER function owned by postgres removes the auth.users row
--    (the profile follows by its foreign-key cascade).
--    Rules mirror the Edge Function exactly:
--      * caller must be the App Manager (public.is_admin());
--      * you cannot delete your own account;
--      * a manager who still has student accounts is REFUSED - the
--        students must be deleted or moved first;
--      * organizations with no students are removed with the account.
-- ============================================================================

alter table public.user_profiles
  add column if not exists reminder_level integer not null default 0,
  add column if not exists marked_for_deletion_at timestamptz;

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

  delete from public.organizations where manager_id = p_user_id;
  delete from auth.users where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
