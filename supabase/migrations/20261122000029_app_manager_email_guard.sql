-- =====================================================================
-- Migration 29 (Round 38): the @englishforcricket.com email rule now
-- covers the App Manager (super_admin) as well as Content Managers.
--
-- Shastri's rule (2026-11-22): an App Manager or Content Manager must
-- have an @englishforcricket.com email id. Migration 28's guard only
-- covered content_manager; this replaces the guard function so both
-- privileged roles are checked, on screen (UsersManager) and here in
-- the database. The 'manager' role (a school / club / parent account
-- that manages its own students) is NOT an app administrator and is
-- deliberately not covered - those accounts belong to outside schools
-- and parents with their own email addresses.
--
-- Existing rows are untouched: the trigger fires only when a role is
-- inserted or changed, and the only current super_admin account
-- (admin@englishforcricket.com) already complies.
-- =====================================================================

create or replace function public.guard_content_manager_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if new.role::text in ('content_manager', 'super_admin') then
    select email into v_email from auth.users where id = new.id;
    if v_email is null
       or lower(v_email) not like '%@englishforcricket.com' then
      raise exception
        'App Manager and Content Manager accounts must use an @englishforcricket.com email address.';
    end if;
  end if;
  return new;
end;
$$;
