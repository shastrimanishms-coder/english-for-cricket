-- ============================================================================
-- Migration 17: Stages, sub-categories, and "Belongs to" lesson tagging
--
-- 1) curriculum_stages: a stage sits ABOVE modules
--    (Stage -> Module -> Lesson). Modules gain a nullable stage_id so
--    existing modules keep working untouched.
-- 2) categories gain parent_id: sub-categories for every section
--    (downloads, games, videos, speaking, reading, curriculum).
-- 3) Content items gain a lesson_id "Belongs to" tag (games,
--    video_lectures, downloads, speaking_scenarios) so a finished lesson
--    can recommend its tied extras. Speaking scenarios also gain a
--    category_id (they had none).
--
-- Everything is additive and fail-soft: the app falls back gracefully
-- until this migration has run.
-- ============================================================================

-- 1) Stages -------------------------------------------------------------------
create table if not exists public.curriculum_stages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.curriculum_stages enable row level security;

drop policy if exists "stages_public_read" on public.curriculum_stages;
create policy "stages_public_read"
  on public.curriculum_stages
  for select
  using (true);

drop policy if exists "super_admin_all_curriculum_stages" on public.curriculum_stages;
create policy "super_admin_all_curriculum_stages"
  on public.curriculum_stages
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.curriculum_modules
  add column if not exists stage_id uuid
  references public.curriculum_stages(id) on delete set null;

-- 2) Sub-categories ------------------------------------------------------------
alter table public.categories
  add column if not exists parent_id uuid
  references public.categories(id) on delete set null;

-- 3) "Belongs to" lesson tags ---------------------------------------------------
alter table public.games
  add column if not exists lesson_id uuid
  references public.curriculum_lessons(id) on delete set null;

alter table public.video_lectures
  add column if not exists lesson_id uuid
  references public.curriculum_lessons(id) on delete set null;

alter table public.downloads
  add column if not exists lesson_id uuid
  references public.curriculum_lessons(id) on delete set null;

alter table public.speaking_scenarios
  add column if not exists lesson_id uuid
  references public.curriculum_lessons(id) on delete set null;

alter table public.speaking_scenarios
  add column if not exists category_id uuid
  references public.categories(id) on delete set null;
