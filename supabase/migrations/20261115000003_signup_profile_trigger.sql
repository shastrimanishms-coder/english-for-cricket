-- ============================================================================
-- 20261115000003_signup_profile_trigger.sql
-- Ensures every new auth.users row gets a matching public.user_profiles row.
--
-- WHY: src/app/register.tsx calls supabase.auth.signUp() with metadata
--   { display_name, role, age, gender }
-- and NEVER inserts into user_profiles itself. src/app/login.tsx then does
--   select role from user_profiles where id = auth.user.id
-- and shows "Profile Error" if no row exists. So a database trigger on
-- auth.users is the ONLY thing that can create the profile row - if it is
-- missing, every new user is locked out at first login.
--
-- STATUS (2026-11-15): UNVERIFIED either way. A throwaway sign-up was
-- created during testing (muse-test-20261115@mailinator.com), but email
-- confirmation is ON, so the profile row could not be observed from the app.
--
-- >>> CHECK FIRST (30 seconds, Supabase Dashboard -> SQL Editor): <<<
--   select id, role, display_name
--   from public.user_profiles
--   where id = '52c981b8-44f7-42c9-8640-ed8cae55d2e9';
--   * If a row comes back  -> a working trigger already exists.
--   * If no row comes back -> no (working) trigger; this file fixes it.
--
-- >>> IF A TRIGGER ALREADY EXISTS, LOOK BEFORE REPLACING: <<<
-- This file uses CREATE OR REPLACE + ON CONFLICT DO NOTHING, so running it
-- is harmless for existing profiles. BUT it would replace the body of an
-- existing function named public.handle_new_user. If a trigger exists under
-- a DIFFERENT function name, both triggers will fire; the ON CONFLICT DO
-- NOTHING keeps that safe (second insert is skipped). To see what exists:
--   select t.tgname, p.proname
--   from pg_trigger t
--   join pg_proc p  on p.oid = t.tgfoid
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
-- and to read an existing function body before deciding:
--   select pg_get_functiondef(oid) from pg_proc where proname = '<name>';
-- If an existing function does MORE than insert the profile row (e.g. also
-- creates an organizations row), merge its extra work into this file first
-- instead of blindly replacing it.
--
-- WHAT THIS FUNCTION INSERTS - only the columns the code provably uses:
--   id           (login.tsx, useRequireRole.ts, everywhere)
--   display_name (manager/settings.tsx reads/updates it)
--   role         (login.tsx routing: 'super_admin' | 'manager' |
--                 'individual_learner'; register.tsx only ever sends
--                 'manager' or 'individual_learner')
-- AGE / GENDER: register.tsx sends age + gender in the sign-up metadata,
-- but no code reads them back from user_profiles, and we could not verify
-- whether those columns exist on the table. The default insert below does
-- NOT reference them (referencing a non-existent column would break every
-- sign-up). If the columns DO exist - check with:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'user_profiles';
-- then use the extended variant commented out at the bottom of this file.
--
-- Google sign-ups: register.tsx also offers Google OAuth, whose metadata
-- has no display_name/role keys, so the function falls back to
-- full_name/name metadata and role 'individual_learner'.
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
    coalesce(
      new.raw_user_meta_data ->> 'role',
      'individual_learner'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the user_profiles row for a new auth user from sign-up metadata (display_name/role). Idempotent via ON CONFLICT DO NOTHING.';

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- EXTENDED VARIANT - only if user_profiles actually has age and gender
-- columns (see the information_schema check in the header). If it does,
-- replace the function above with this version so the age/gender collected
-- by register.tsx are stored instead of discarded. register.tsx sends age
-- as a JSON number (or null) and gender as 'Male' | 'Female' | 'Other'
-- (or null); managers always send null for both.
-- ============================================================================
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   insert into public.user_profiles (id, display_name, role, age, gender)
--   values (
--     new.id,
--     coalesce(
--       new.raw_user_meta_data ->> 'display_name',
--       new.raw_user_meta_data ->> 'full_name',
--       new.raw_user_meta_data ->> 'name',
--       split_part(new.email, '@', 1)
--     ),
--     coalesce(new.raw_user_meta_data ->> 'role', 'individual_learner'),
--     (new.raw_user_meta_data ->> 'age')::integer,
--     new.raw_user_meta_data ->> 'gender'
--   )
--   on conflict (id) do nothing;
--   return new;
-- end;
-- $$;
