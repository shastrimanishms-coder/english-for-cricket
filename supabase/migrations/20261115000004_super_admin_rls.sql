-- ============================================================================
-- 20261115000004_super_admin_rls.sql
-- Grants the super_admin role full SELECT / INSERT / UPDATE / DELETE on
-- user_profiles, organizations, sub_accounts and every CMS-managed content
-- table.
--
-- CONFIRMED INTENT: Shastri confirmed on 2026-11-15 that the admin
-- (super_admin) must have FULL powers - see, edit, update and delete all
-- users and data. This file is therefore a required part of the repair,
-- not an optional extra.
--
-- WHY IT IS NEEDED: verification with the real admin account (2026-11-15)
-- showed the super_admin could see only its OWN user_profiles row and zero
-- organizations / sub_accounts through the API. The admin panel
-- (src/app/admin/index.tsx and src/components/admin/*.tsx) selects,
-- inserts, updates and deletes across all of the tables below - e.g.
-- UsersManager lists ALL user_profiles + sub_accounts and hard-deletes
-- sub_accounts; SystemSettings lists all user_profiles and updates roles.
-- Without these policies the panel renders empty / fails silently.
--
-- HOW IT WORKS:
--   * Policies are ADDITIVE (permissive): these sit alongside any existing
--     own-row / manager / public policies and only widen access for users
--     whose user_profiles.role = 'super_admin'. Nobody else's access
--     changes.
--   * The role check goes through public.is_admin() (SECURITY DEFINER, see
--     20261115000001), which reads user_profiles WITHOUT being subject to
--     its RLS - that is what prevents infinite policy recursion on
--     user_profiles itself. It is re-created here (CREATE OR REPLACE) so
--     this file also works standalone.
--   * Every policy is DROP IF EXISTS + CREATE, so re-running is safe.
--
-- ONE THING RLS CANNOT DO: deleting rows in public.user_profiles /
-- public.sub_accounts is covered by these policies, but deleting a user's
-- actual LOGIN (the auth.users record) is not something RLS or the public
-- API can do. Auth-account deletion needs the Supabase Admin API /
-- dashboard, or an Edge Function using the service-role key. That is a
-- separate future step; until then, "delete user" in the panel removes
-- their data rows, and the login itself must be removed from
-- Dashboard -> Authentication -> Users.
-- ============================================================================

create or replace function public.is_admin()
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
      and role = 'super_admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- People & organisations
-- user_profiles : SystemSettings (select all, update role), UsersManager
-- organizations : UsersManager / admin overview; manager/settings writes own
-- sub_accounts  : UsersManager (select all, update reminder/deletion flags,
--                 hard delete), manager/students CRUD within own org
-- activity_logs : UsersManager reads student_id/activity_type/duration for
--                 stats; rows are written by the app (games/videos players),
--                 never edited in the CMS -> admin SELECT is all the code
--                 needs, but full access is granted per Shastri's
--                 full-powers decision so nothing in the panel can stall.
-- student_badges: manager/progress.tsx reads badges per student; no code
--                 writes this table yet (awarding is unbuilt) -> full
--                 access granted for the same reason.
-- ----------------------------------------------------------------------------

drop policy if exists "super_admin_all_user_profiles" on public.user_profiles;
create policy "super_admin_all_user_profiles"
  on public.user_profiles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_organizations" on public.organizations;
create policy "super_admin_all_organizations"
  on public.organizations
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_sub_accounts" on public.sub_accounts;
create policy "super_admin_all_sub_accounts"
  on public.sub_accounts
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_activity_logs" on public.activity_logs;
create policy "super_admin_all_activity_logs"
  on public.activity_logs
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_student_badges" on public.student_badges;
create policy "super_admin_all_student_badges"
  on public.student_badges
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- CMS content tables. Every manager component below performs
-- select + insert + update + delete as the signed-in super_admin:
--   categories        CategoriesManager
--   curriculum_modules, curriculum_lessons   CurriculumManager
--   lesson_slides     SlideBuilder / CurriculumManager
--   downloads         DownloadsManager
--   games             GamesManager
--   videos            VideosManager (admin writes THIS table)
--   video_lectures    learner-side video table (both tables exist; the
--                     split is a known code-side issue - admin gets full
--                     access to both so either can be managed/cleaned)
--   badges            BadgesManager
--   pages             PageManager
--   support_faqs      HelpCenterManager
--   site_settings     SystemSettings (select + upsert)
-- lesson_media / assets (created by migrations 000001 / 000002) already
-- carry their own super_admin write policies; they are repeated here so
-- this file alone expresses the full admin grant. The statements are
-- guarded by to_regclass so this file still runs if run before them.
-- ----------------------------------------------------------------------------

drop policy if exists "super_admin_all_categories" on public.categories;
create policy "super_admin_all_categories"
  on public.categories
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_curriculum_modules" on public.curriculum_modules;
create policy "super_admin_all_curriculum_modules"
  on public.curriculum_modules
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_curriculum_lessons" on public.curriculum_lessons;
create policy "super_admin_all_curriculum_lessons"
  on public.curriculum_lessons
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_lesson_slides" on public.lesson_slides;
create policy "super_admin_all_lesson_slides"
  on public.lesson_slides
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_downloads" on public.downloads;
create policy "super_admin_all_downloads"
  on public.downloads
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_games" on public.games;
create policy "super_admin_all_games"
  on public.games
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_videos" on public.videos;
create policy "super_admin_all_videos"
  on public.videos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_video_lectures" on public.video_lectures;
create policy "super_admin_all_video_lectures"
  on public.video_lectures
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_badges" on public.badges;
create policy "super_admin_all_badges"
  on public.badges
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_pages" on public.pages;
create policy "super_admin_all_pages"
  on public.pages
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_support_faqs" on public.support_faqs;
create policy "super_admin_all_support_faqs"
  on public.support_faqs
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_all_site_settings" on public.site_settings;
create policy "super_admin_all_site_settings"
  on public.site_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- New tables from migrations 000001 / 000002 (guarded: skipped if absent).
do $$
begin
  if to_regclass('public.lesson_media') is not null then
    execute 'drop policy if exists "super_admin_all_lesson_media" on public.lesson_media';
    execute 'create policy "super_admin_all_lesson_media" on public.lesson_media
             for all to authenticated
             using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.assets') is not null then
    execute 'drop policy if exists "super_admin_all_assets" on public.assets';
    execute 'create policy "super_admin_all_assets" on public.assets
             for all to authenticated
             using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;
