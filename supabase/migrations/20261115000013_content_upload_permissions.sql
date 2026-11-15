-- Migration 13: content upload permissions (games / downloads / videos)
--
-- Problem found 2026-11-15: uploading a game or a downloadable book in
-- the admin CMS silently failed, and the admin lists for games and
-- videos showed nothing - not even the seeded demo rows. Diagnosis:
-- in the original schema, the games / downloads / video_lectures
-- tables and the storage buckets never received usable RLS policies
-- (categories, badges and the curriculum tables did, which is why the
-- rest of the CMS worked). With RLS enabled and no matching policy,
-- every read and write from the app is denied.
--
-- This migration establishes the intended end state, idempotently:
--   * All six app buckets exist and are public (files are served to
--     learners through their public URLs).
--   * Anyone (including signed-out and PIN students, who use the
--     anonymous key) can READ files in those buckets and can read
--     PUBLISHED rows of games / downloads / video_lectures.
--   * Only super_admin (public.is_admin()) can write files or rows.
--
-- Safe to run once in the SQL Editor; re-running drops and recreates
-- the same policies.

-- ---------------------------------------------------------------- buckets
insert into storage.buckets (id, name, public)
values
  ('games', 'games', true),
  ('downloads', 'downloads', true),
  ('videos', 'videos', true),
  ('lesson_media', 'lesson_media', true),
  ('assets', 'assets', true),
  ('badges', 'badges', true)
on conflict (id) do update set public = true;

-- ------------------------------------------------------- storage.objects
drop policy if exists "App buckets public read" on storage.objects;
create policy "App buckets public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('games', 'downloads', 'videos', 'lesson_media', 'assets', 'badges'));

drop policy if exists "App buckets admin insert" on storage.objects;
create policy "App buckets admin insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('games', 'downloads', 'videos', 'lesson_media', 'assets', 'badges')
    and public.is_admin()
  );

drop policy if exists "App buckets admin update" on storage.objects;
create policy "App buckets admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('games', 'downloads', 'videos', 'lesson_media', 'assets', 'badges')
    and public.is_admin()
  )
  with check (
    bucket_id in ('games', 'downloads', 'videos', 'lesson_media', 'assets', 'badges')
    and public.is_admin()
  );

drop policy if exists "App buckets admin delete" on storage.objects;
create policy "App buckets admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('games', 'downloads', 'videos', 'lesson_media', 'assets', 'badges')
    and public.is_admin()
  );

-- ------------------------------------------- publish-by-default for CMS
-- The Games and Downloads managers have no publish toggle: saving in
-- the CMS means "put it live". Make that the column default so new
-- rows are visible to learners without a second step. (The Videos
-- manager has an explicit toggle and sets the value itself.)
alter table public.games alter column is_published set default true;
alter table public.downloads alter column is_published set default true;
alter table public.video_lectures alter column is_published set default true;

-- ------------------------------------------------------------------ games
alter table public.games enable row level security;

drop policy if exists "Games public read published" on public.games;
create policy "Games public read published"
  on public.games for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "Games admin full access" on public.games;
create policy "Games admin full access"
  on public.games for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -------------------------------------------------------------- downloads
alter table public.downloads enable row level security;

drop policy if exists "Downloads public read published" on public.downloads;
create policy "Downloads public read published"
  on public.downloads for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "Downloads admin full access" on public.downloads;
create policy "Downloads admin full access"
  on public.downloads for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------- video_lectures
alter table public.video_lectures enable row level security;

drop policy if exists "Videos public read published" on public.video_lectures;
create policy "Videos public read published"
  on public.video_lectures for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "Videos admin full access" on public.video_lectures;
create policy "Videos admin full access"
  on public.video_lectures for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
