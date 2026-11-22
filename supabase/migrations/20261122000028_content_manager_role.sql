-- Migration 28: Content Manager role (Round 37, 2026-11-22).
--
-- Shastri wants to delegate day-to-day content work as the site grows.
-- A Content Manager signs in like the admin (email + password on the
-- main login page) and reaches the admin dashboard, but can only create
-- and edit learning content:
--   Learning Path (stages, modules, lessons, slides, lesson media),
--   Games, Downloads, Speaking Practice and Smart Reading.
-- Everything else - users, organisations, messages, Voice Studio,
-- badges, pages, categories, system settings - stays super_admin only,
-- enforced here by RLS (the dashboard also hides those sections, but
-- RLS is the real barrier).
--
-- Rules that come with the role:
--   * A Content Manager account must use an @englishforcricket.com
--     email address. Shastri creates the mailbox for each person he
--     appoints; a database guard (section 5) refuses the role for any
--     other email domain, whoever tries to set it.
--   * Accounts are appointed by promotion: the person registers a
--     normal account, then the super admin sets their role in
--     Users & Organizations. Public sign-up can never grant this role
--     (section 6 also closes the older hole where sign-up metadata
--     could request 'super_admin').

-- ---------------------------------------------------------------------
-- 1. The new role value.
--    Every comparison below casts role to text, so this file is safe
--    to run in a single paste even though the value is new.
-- ---------------------------------------------------------------------
alter type public.user_role add value if not exists 'content_manager';

-- ---------------------------------------------------------------------
-- 2. Role helpers, mirroring is_admin() from migration 04.
-- ---------------------------------------------------------------------
create or replace function public.is_content_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role::text = 'content_manager'
  );
$$;

comment on function public.is_content_manager() is
  'True when the current auth user has role content_manager in user_profiles. SECURITY DEFINER to avoid RLS recursion.';

create or replace function public.can_edit_content()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_content_manager();
$$;

comment on function public.can_edit_content() is
  'True for super_admin and content_manager: the two roles allowed to write learning content.';

-- ---------------------------------------------------------------------
-- 3. Write access to the content tables. These permissive policies sit
--    alongside the existing super_admin_all_* policies (policies OR
--    together), so nothing about super_admin access changes.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'curriculum_stages',
    'curriculum_modules',
    'curriculum_lessons',
    'lesson_slides',
    'lesson_media',
    'downloads',
    'games',
    'speaking_scenarios',
    'reading_stories'
  ]
  loop
    execute format('drop policy if exists %I on public.%I',
                   'content_manager_all_' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.can_edit_content()) '
      || 'with check (public.can_edit_content())',
      'content_manager_all_' || t, t);
  end loop;
end
$$;

-- Categories are only read by the content managers (the pickers in the
-- Games, Downloads, Speaking and Reading managers); editing categories
-- stays with the super admin.
drop policy if exists "content_manager_read_categories" on public.categories;
create policy "content_manager_read_categories"
  on public.categories
  for select
  to authenticated
  using (public.is_content_manager());

-- ---------------------------------------------------------------------
-- 4. File uploads for the same content areas: the games, downloads and
--    lesson_media buckets (migration 13 gave super_admin write access;
--    this adds content managers for exactly those three buckets).
-- ---------------------------------------------------------------------
drop policy if exists "Content buckets editor insert" on storage.objects;
create policy "Content buckets editor insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('games', 'downloads', 'lesson_media')
    and public.can_edit_content()
  );

drop policy if exists "Content buckets editor update" on storage.objects;
create policy "Content buckets editor update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('games', 'downloads', 'lesson_media')
    and public.can_edit_content()
  )
  with check (
    bucket_id in ('games', 'downloads', 'lesson_media')
    and public.can_edit_content()
  );

drop policy if exists "Content buckets editor delete" on storage.objects;
create policy "Content buckets editor delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('games', 'downloads', 'lesson_media')
    and public.can_edit_content()
  );

-- ---------------------------------------------------------------------
-- 5. The email-domain guard: role content_manager requires the
--    account's login email to end with @englishforcricket.com.
-- ---------------------------------------------------------------------
create or replace function public.guard_content_manager_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if new.role::text = 'content_manager' then
    select email into v_email from auth.users where id = new.id;
    if v_email is null
       or lower(v_email) not like '%@englishforcricket.com' then
      raise exception
        'Content Manager accounts must use an @englishforcricket.com email address.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_content_manager_email on public.user_profiles;
create trigger guard_content_manager_email
  before insert or update of role on public.user_profiles
  for each row
  execute function public.guard_content_manager_email();

-- ---------------------------------------------------------------------
-- 6. Sign-up can no longer request a privileged role. The profile
--    trigger (migrations 03/07) honoured a 'super_admin' value passed
--    in sign-up metadata; from now on public sign-up can only ever
--    produce 'manager' or 'individual_learner', and both privileged
--    roles (super_admin, content_manager) are granted afterwards by
--    an existing super admin from the dashboard.
-- ---------------------------------------------------------------------
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
           in ('manager', 'individual_learner')
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
  'Creates the user_profiles row for a new auth user from sign-up metadata (display_name/role, cast to the user_role enum; country/region copied when present). Privileged roles are never granted here: super_admin and content_manager are appointed later by an existing super admin. Idempotent via ON CONFLICT DO NOTHING.';
