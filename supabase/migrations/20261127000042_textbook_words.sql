-- ============================================================================
-- 20261127000042_textbook_words.sql
-- Round 96: My Word Bank grows to cover the TEXTBOOK series.
--
-- WHAT IT IS: the Word Bank (files 40/41) catalogues the Learning
-- Path's 2,233 words. The five printed textbooks (144 lessons) end
-- every lesson with a Remember Words list too, and Shastri's
-- direction (2026-11-27) is that the bank covers them as well:
-- ONE bank entry per word across both series; a textbook word
-- enrols when the student finishes that lesson's digital workbook
-- game; the learner browse gains a Textbooks -> Book -> Lesson
-- tree in the same style as the Learning Path tree.
--
-- WHAT THIS FILE DOES:
--   1. word_bank_words.lesson_id becomes NULLABLE. It holds the
--      Learning Path attribution; textbook-only words have none.
--      (Learning Path rows are untouched.)
--   2. A SOURCES table (public.word_bank_sources): one row per
--      (word, teaching place). Learning Path rows point at the
--      catalogue's attribution lesson; textbook rows carry the
--      book number, the lesson number within the book, and the
--      lesson's title as printed. Backfilled here for the 2,233
--      Learning Path words; the textbook rows arrive with the
--      Round 96 install files.
--   3. sync_word_bank is recreated (file 41's version verbatim,
--      plus textbook enrolment): a textbook completion is the
--      points-ledger row the workbook player already writes —
--      kind 'extra_game', ref_id = the game id (award_points,
--      file 18; awardWorkbookPractice in the app). The textbook
--      games are the e4000000-... family (engine 'workbook', no
--      lesson tag); the id's suffix is book*1000 + lesson within
--      the book (Round 87). Enrolment inserts exactly the words
--      sourced from that book + lesson. No point row, no
--      enrolment — and nothing new is recorded about the student:
--      enrolment DERIVES from records that already exist.
--   4. get_word_bank_due is recreated: textbook words join the
--      same due pool. A word's effective stage is its Learning
--      Path stage when it has one; otherwise its book number —
--      with Books 1-2 sitting at the Stage 1 activity level, so
--      review sessions never deal the build-the-word letter tiles
--      for them (the books' own rule: tiles start above the two
--      youngest levels; the Learn/Test BOOKS always use tiles, by
--      Shastri's Round 94 design, and are unaffected). The
--      module_no a textbook word reports is its textbook lesson
--      number, which drives only the model-voice parity, exactly
--      as a module number does for Learning Path words.
--   5. A sibling browse RPC, get_word_bank_browse_textbook, lists
--      one book's words per lesson with the student's status —
--      the same shape the Learning Path browse consumes.
--   6. record_word_review is NOT recreated: it keys on word_key
--      alone and already serves textbook words, including file
--      41's disabled-word calm no-op.
--   7. delete_all_student_data is NOT recreated either: since
--      file 40 it deletes student_word_bank rows on every route,
--      and textbook enrolment adds no new per-student table — the
--      bank row is the only per-student artefact, exactly as
--      before. CONFIRMED here, unchanged.
--
-- PRIVACY: unchanged, and nothing is added. The catalogue and the
-- sources table are shared curriculum content (which book teaches
-- which of OUR words, where). student_word_bank keeps its file-40
-- shape; a textbook review still sends ONE boolean.
--
-- is_enabled (file 41) is respected everywhere, exactly as before:
-- sync skips disabled words (both series), the due list never
-- deals them, both browses exclude them, and the summary counts
-- enabled rows only.
--
-- GRACEFUL DEGRADATION: until this file runs, the app behaves as
-- in Round 95 — the textbook tree reads through the new RPC,
-- fails soft, and shows nothing; Learning Path behaviour is
-- untouched because the recreated RPCs are supersets.
--
-- RUN: after files 40 and 41. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: a textbook-only word has no Learning Path lesson.
-- ---------------------------------------------------------------------------

alter table public.word_bank_words
  alter column lesson_id drop not null;

comment on column public.word_bank_words.lesson_id is
  'The Learning Path lesson this word is grouped under (its earliest teaching lesson, file 40). NULL for textbook-only words since Round 96 (file 42) — their teaching places live in word_bank_sources.';

-- ---------------------------------------------------------------------------
-- Part 2: the sources table — every place a word is taught.
-- ---------------------------------------------------------------------------

create table if not exists public.word_bank_sources (
  word_key text not null
    references public.word_bank_words(word_key) on delete cascade,
  source_kind text not null
    check (source_kind in ('learning_path', 'textbook')),
  -- 'lp:<lesson uuid>' or 'tb:<book>:<lesson in book>' — the
  -- natural key of the teaching place, so re-running an install
  -- can replace exactly its own rows.
  source_key text not null,
  lesson_id uuid
    references public.curriculum_lessons(id) on delete cascade,
  book_no integer check (book_no between 1 and 5),
  book_lesson_no integer check (book_lesson_no between 1 and 40),
  lesson_title text,
  primary key (word_key, source_key),
  check (
    (source_kind = 'learning_path' and lesson_id is not null
       and book_no is null and book_lesson_no is null)
    or
    (source_kind = 'textbook' and lesson_id is null
       and book_no is not null and book_lesson_no is not null)
  )
);

create index if not exists word_bank_sources_textbook
  on public.word_bank_sources (book_no, book_lesson_no)
  where source_kind = 'textbook';

alter table public.word_bank_sources enable row level security;

comment on table public.word_bank_sources is
  'Round 96: every teaching place of every Word Bank word — its Learning Path attribution lesson and/or its textbook Remember Words lessons (book, lesson in book, printed lesson title). Shared curriculum content; no student data. Read by the enrolment helper, the due list and the admin Word Bank manager (editors only).';

-- The admin Word Bank manager reads the sources to list and filter
-- textbook words (App Manager + Content Manager, as in file 41).
drop policy if exists "word_bank_sources_editor_select" on public.word_bank_sources;
create policy "word_bank_sources_editor_select"
  on public.word_bank_sources
  for select
  to authenticated
  using (public.can_edit_content());

-- Backfill: one Learning Path source per catalogued word, from
-- its current attribution (the earliest teaching lesson — the
-- same grouping the dictionary browse has always used; the seven
-- words taught by two lessons still enrol from either, because
-- enrolment derives per lesson via word_bank_lesson_word_keys).
insert into public.word_bank_sources
  (word_key, source_kind, source_key, lesson_id)
select w.word_key, 'learning_path', 'lp:' || w.lesson_id::text, w.lesson_id
from public.word_bank_words w
where w.lesson_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 3: the words one textbook lesson teaches (internal helper).
-- ---------------------------------------------------------------------------

create or replace function public.word_bank_textbook_word_keys(
  p_book_no integer,
  p_book_lesson_no integer
)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select s.word_key
  from public.word_bank_sources s
  where s.source_kind = 'textbook'
    and s.book_no = p_book_no
    and s.book_lesson_no = p_book_lesson_no;
$$;

comment on function public.word_bank_textbook_word_keys(integer, integer) is
  'Round 96: the word_keys one textbook lesson''s Remember Words list teaches. Internal helper for sync_word_bank; EXECUTE revoked from client roles.';

revoke execute on function public.word_bank_textbook_word_keys(integer, integer) from public;
revoke execute on function public.word_bank_textbook_word_keys(integer, integer) from anon;
revoke execute on function public.word_bank_textbook_word_keys(integer, integer) from authenticated;

-- ---------------------------------------------------------------------------
-- Part 4: sync_word_bank — file 41 verbatim, plus textbook
-- enrolment from the student's workbook-game completions.
-- ---------------------------------------------------------------------------

create or replace function public.sync_word_bank(
  p_student_id uuid,
  p_student_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_kind = 'sub_account' then
    if not exists (
      select 1 from public.sub_accounts
      where id = p_student_id and is_active = true
    ) then
      raise exception 'Unknown or inactive student' using errcode = 'P0001';
    end if;
  elsif p_student_kind = 'auth' then
    if auth.uid() is null or auth.uid() <> p_student_id then
      raise exception 'Cannot use the word bank of another student'
        using errcode = 'P0001';
    end if;
  else
    raise exception 'Invalid student kind' using errcode = 'P0001';
  end if;

  insert into public.student_word_bank
    (student_id, student_kind, word_key, step, due_at, lapses, updated_at)
  select p_student_id, p_student_kind, k.word_key, 0, now(), 0, now()
  from public.lesson_completions lc
  cross join lateral public.word_bank_lesson_word_keys(lc.lesson_id) as k(word_key)
  join public.word_bank_words w
    on w.word_key = k.word_key
    and w.is_enabled
  where lc.student_id = p_student_id
    and lc.student_kind = p_student_kind
  on conflict do nothing;

  -- Round 96: textbook words enrol from the student's digital
  -- workbook completions. The completion record is the points
  -- ledger row the workbook player writes on open and on Finish
  -- (kind 'extra_game', ref_id = the game id; the ledger dedupes
  -- to one row per game). The textbook family is the
  -- e4000000-... id range with engine 'workbook' and no lesson
  -- tag; the id suffix is book*1000 + lesson within the book.
  insert into public.student_word_bank
    (student_id, student_kind, word_key, step, due_at, lapses, updated_at)
  select p_student_id, p_student_kind, k.word_key, 0, now(), 0, now()
  from public.point_events pe
  join public.games g
    on g.id::text = pe.ref_id
  cross join lateral public.word_bank_textbook_word_keys(
    (substring(g.id::text from 30 for 7)::integer) / 1000,
    (substring(g.id::text from 30 for 7)::integer) % 1000
  ) as k(word_key)
  join public.word_bank_words w
    on w.word_key = k.word_key
    and w.is_enabled
  where pe.student_id = p_student_id
    and pe.student_kind = p_student_kind
    and pe.kind = 'extra_game'
    and g.engine = 'workbook'
    and g.lesson_id is null
    and g.id::text like 'e4000000-0000-4000-8000-%'
  on conflict do nothing;

  return (
    select jsonb_build_object(
      'enrolled', count(*),
      'due', count(*) filter (where b.step < 6 and b.due_at <= now()),
      'new_words', count(*) filter (where b.step = 0),
      'learning', count(*) filter (where b.step between 1 and 5),
      'mastered', count(*) filter (where b.step = 6)
    )
    from public.student_word_bank b
    join public.word_bank_words w
      on w.word_key = b.word_key
      and w.is_enabled
    where b.student_id = p_student_id
      and b.student_kind = p_student_kind
  );
end;
$$;

comment on function public.sync_word_bank(uuid, text) is
  'Round 92, switch-aware since Round 94 (file 41), textbook-aware since Round 96 (file 42): enrols the words of all the student''s completed Learning Path lessons AND of every textbook lesson whose digital workbook game the student has finished (idempotent, disabled words skipped) and returns summary counts {enrolled, due, new_words, learning, mastered} over enabled words only. Identity rules mirror record_speaking_line.';

grant execute on function public.sync_word_bank(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 5: get_word_bank_due — one pool for both series. A word's
-- effective stage is its Learning Path stage when it has one;
-- otherwise its book number, with Books 1-2 at the Stage 1
-- activity level (no letter tiles in review sessions). The
-- module number of a textbook word is its textbook lesson
-- number (model-voice parity only).
-- ---------------------------------------------------------------------------

create or replace function public.get_word_bank_due(
  p_student_id uuid,
  p_student_kind text
)
returns table (
  word_key text,
  word text,
  emoji text,
  example text,
  image_url text,
  step integer,
  due_at timestamptz,
  lapses integer,
  stage_no integer,
  module_no integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_kind = 'sub_account' then
    if not exists (
      select 1 from public.sub_accounts
      where id = p_student_id and is_active = true
    ) then
      raise exception 'Unknown or inactive student' using errcode = 'P0001';
    end if;
  elsif p_student_kind = 'auth' then
    if auth.uid() is null or auth.uid() <> p_student_id then
      raise exception 'Cannot use the word bank of another student'
        using errcode = 'P0001';
    end if;
  else
    raise exception 'Invalid student kind' using errcode = 'P0001';
  end if;

  return query
  select
    w.word_key,
    w.word,
    w.emoji,
    w.example,
    w.image_url,
    b.step,
    b.due_at,
    b.lapses,
    coalesce(
      cs.order_index,
      case when tb.book_no <= 2 then 1 else tb.book_no end
    ),
    coalesce((cm.order_index % 100), tb.book_lesson_no)
  from public.student_word_bank b
  join public.word_bank_words w on w.word_key = b.word_key
  left join public.curriculum_lessons cl on cl.id = w.lesson_id
  left join public.curriculum_modules cm on cm.id = cl.module_id
  left join public.curriculum_stages cs on cs.id = cm.stage_id
  left join lateral (
    select s.book_no, s.book_lesson_no
    from public.word_bank_sources s
    where s.word_key = w.word_key
      and s.source_kind = 'textbook'
    order by s.book_no asc, s.book_lesson_no asc
    limit 1
  ) tb on true
  where b.student_id = p_student_id
    and b.student_kind = p_student_kind
    and b.step < 6
    and b.due_at <= now()
    and w.is_enabled
  order by b.due_at asc;
end;
$$;

comment on function public.get_word_bank_due(uuid, text) is
  'Round 92, switch-aware since Round 94 (file 41), textbook-aware since Round 96 (file 42): every enabled Word Bank word currently due for the student (step < 6, due_at reached), most overdue first — Learning Path and textbook words in one pool. stage_no is the word''s Learning Path stage, or for textbook-only words its book number with Books 1-2 reported as 1 (the no-letter-tiles activity level); module_no is the Learning Path module, or the textbook lesson number. Identity rules mirror record_speaking_line.';

grant execute on function public.get_word_bank_due(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 6: the textbook dictionary browse — one book's words,
-- grouped by the app under their lessons, with the student's
-- status for each. The sibling of get_word_bank_browse.
-- ---------------------------------------------------------------------------

create or replace function public.get_word_bank_browse_textbook(
  p_student_id uuid,
  p_student_kind text,
  p_book_no integer
)
returns table (
  word_key text,
  word text,
  emoji text,
  example text,
  image_url text,
  book_lesson_no integer,
  lesson_title text,
  status text,
  step integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_kind = 'sub_account' then
    if not exists (
      select 1 from public.sub_accounts
      where id = p_student_id and is_active = true
    ) then
      raise exception 'Unknown or inactive student' using errcode = 'P0001';
    end if;
  elsif p_student_kind = 'auth' then
    if auth.uid() is null or auth.uid() <> p_student_id then
      raise exception 'Cannot use the word bank of another student'
        using errcode = 'P0001';
    end if;
  else
    raise exception 'Invalid student kind' using errcode = 'P0001';
  end if;

  return query
  select
    w.word_key,
    w.word,
    w.emoji,
    w.example,
    w.image_url,
    s.book_lesson_no,
    s.lesson_title,
    case
      when b.student_id is null then 'not_started'
      when b.step = 0 then 'new'
      when b.step = 6 then 'mastered'
      else 'learning'
    end,
    b.step
  from public.word_bank_sources s
  join public.word_bank_words w on w.word_key = s.word_key
  left join public.student_word_bank b
    on b.word_key = s.word_key
    and b.student_id = p_student_id
    and b.student_kind = p_student_kind
  where s.source_kind = 'textbook'
    and s.book_no = p_book_no
    and w.is_enabled
  order by s.book_lesson_no asc, w.word asc;
end;
$$;

comment on function public.get_word_bank_browse_textbook(uuid, text, integer) is
  'Round 96: the Word Bank dictionary for one textbook — every ENABLED word the book''s Remember Words lists teach, per lesson, with the student''s status (not_started / new / learning / mastered). A word taught by several of the book''s lessons appears under each. Identity rules mirror record_speaking_line.';

grant execute on function public.get_word_bank_browse_textbook(uuid, text, integer) to anon, authenticated;
