-- ============================================================================
-- 20261115000011_admin_user_emails.sql
-- Admin-only feed of account login emails for the Users & Organizations
-- screen (UsersManager): show each account's email and let the admin
-- SEARCH by email.
--
-- WHY A FUNCTION: user_profiles has no email column - login emails live
-- in auth.users, which the client API cannot read for other users (and
-- must never be exposed as a plain table or view). This function is the
-- narrow bridge: SECURITY DEFINER so it can read auth.users, but it
-- checks first that the caller is the admin (super_admin) via
-- public.is_admin() and returns NO rows to anyone else - the exact same
-- pattern as get_admin_user_stats() in migration 20261115000008.
--
-- OPTIONAL BUT RECOMMENDED: nothing breaks if this file has not been
-- run yet. UsersManager calls the function fail-soft (the same way it
-- treats get_admin_user_stats before migration 8): if the call errors,
-- the screen simply shows no email lines and email search matches
-- nothing, exactly as before this file existed. Once the file is run,
-- emails appear and become searchable with no app change.
--
-- RUN: after file 10. Safe to run more than once (CREATE OR REPLACE).
-- ============================================================================

create or replace function public.get_admin_user_emails()
returns table (
  user_id uuid,
  email text
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
  select u.id, u.email::text
  from auth.users u
  where u.email is not null
  order by u.email;
end;
$$;

comment on function public.get_admin_user_emails() is
  'Admin-only (super_admin) list of login emails from auth.users, keyed by user id. Returns no rows to non-admins. Feeds the email display and email search in the admin Users & Organizations screen.';

-- The function is born with EXECUTE available to PUBLIC (the Postgres
-- default); take that back and hand it to signed-in users only. The
-- is_admin() check inside is the real gate - this is defence in depth
-- so anonymous callers cannot even invoke it.
revoke execute on function public.get_admin_user_emails() from public;
grant execute on function public.get_admin_user_emails() to authenticated;
