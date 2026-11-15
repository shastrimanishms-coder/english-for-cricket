-- ============================================================================
-- 20261115000007_fix_signup_trigger_role_cast.sql
-- FIX for file 3: the sign-up trigger failed on EVERY registration.
--
-- ROOT CAUSE (confirmed 2026-11-15 by simulating a sign-up in the SQL
-- Editor - the database returned the exact error):
--   ERROR 42804: column "role" is of type user_role but expression is of
--   type text. You will need to rewrite or cast the expression.
-- public.user_profiles.role is a Postgres ENUM type (public.user_role),
-- not a plain text column. File 3's function inserted the metadata text
-- without a cast, so the insert raised, the whole sign-up transaction
-- rolled back, and Supabase Auth reported "Database error saving new
-- user" (HTTP 500) for every new registration.
--
-- WHAT THIS FILE DOES: replaces ONLY the function body from file 3 (the
-- trigger itself is unchanged). The role text is now cast to the enum,
-- and only the three role values the app actually uses are accepted -
-- anything else in the sign-up metadata falls back to
-- 'individual_learner' instead of breaking the registration.
--
-- RUN: after file 3. Safe to run more than once (CREATE OR REPLACE).
-- Afterwards, test by registering a brand-new account in the app: the
-- sign-up should succeed and the new user should be able to log in
-- without a "Profile Error".
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name, role)
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
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the user_profiles row for a new auth user from sign-up metadata (display_name/role). Role is cast to the user_role enum (fix from migration 7). Idempotent via ON CONFLICT DO NOTHING.';
