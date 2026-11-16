-- ============================================================================
-- Migration 19: Smart Reading
--
-- reading_stories: short stories/articles the admin uploads, stored as
-- an array of page texts (jsonb). Learners read them with karaoke
-- narration (Listen & Read) or read them aloud for a pronunciation
-- score (Read Aloud). reading_records stores one row per finished
-- session; writes go through record_reading() and manager/learner
-- reads through get_reading_records(), both client-asserted like the
-- other student RPCs (PIN students have no session to attach).
-- ============================================================================

create table if not exists public.reading_stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  emoji text not null default '📖',
  category_id uuid references public.categories(id) on delete set null,
  lesson_id uuid references public.curriculum_lessons(id) on delete set null,
  pages jsonb not null default '[]'::jsonb,
  level text not null default '',
  is_published boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.reading_stories enable row level security;

drop policy if exists "reading_stories_public_read" on public.reading_stories;
create policy "reading_stories_public_read"
  on public.reading_stories
  for select
  using (true);

drop policy if exists "super_admin_all_reading_stories" on public.reading_stories;
create policy "super_admin_all_reading_stories"
  on public.reading_stories
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.reading_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  student_kind text not null,
  story_id uuid references public.reading_stories(id) on delete cascade,
  mode text not null,
  accuracy integer,
  wpm integer,
  sentences_done integer not null default 0,
  sentences_total integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists reading_records_student
  on public.reading_records (student_id, student_kind, created_at desc);

alter table public.reading_records enable row level security;

drop policy if exists "admin_read_reading_records" on public.reading_records;
create policy "admin_read_reading_records"
  on public.reading_records
  for select
  to authenticated
  using (public.is_admin());

create or replace function public.record_reading(
  p_student_id uuid,
  p_student_kind text,
  p_story_id uuid,
  p_mode text,
  p_accuracy integer,
  p_wpm integer,
  p_sentences_done integer,
  p_sentences_total integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reading_records
    (student_id, student_kind, story_id, mode, accuracy, wpm, sentences_done, sentences_total)
  values
    (p_student_id, p_student_kind, p_story_id, p_mode, p_accuracy, p_wpm, p_sentences_done, p_sentences_total);
end;
$$;

create or replace function public.get_reading_records(
  p_student_id uuid,
  p_student_kind text
)
returns setof public.reading_records
language sql
security definer
set search_path = public
as $$
  select * from public.reading_records
  where student_id = p_student_id and student_kind = p_student_kind
  order by created_at desc
  limit 200;
$$;

grant execute on function public.record_reading(uuid, text, uuid, text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.get_reading_records(uuid, text) to anon, authenticated;
