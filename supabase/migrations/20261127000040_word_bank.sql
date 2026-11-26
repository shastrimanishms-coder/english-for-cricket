-- ============================================================================
-- 20261127000040_word_bank.sql
-- Round 92: My Word Bank — spaced-repetition word review.
--
-- WHAT IT IS: every word a lesson teaches joins the student's Word
-- Bank when the lesson is completed. The bank brings words back at
-- growing intervals (1, 3, 7, 14, 30 days, then Mastered) — the
-- personal, adaptive repetition that complements the curriculum's
-- built-in returns (~40% of every lesson revisits earlier words in
-- new forms, on a fixed schedule for every student). Shastri
-- approved the plan (Word Review & Offline Packs, 2026-11-26) and
-- confirmed building the Word Bank on 2026-11-27, decisions:
--   D1 words enter the bank when their lesson is completed;
--   D2 a review session holds at most 10 words;
--   D3 speaking checks inside review are optional, 70% pass mark.
--
-- THE WORD CATALOGUE (public.word_bank_words): derived, never
-- re-authored. The authoritative per-lesson word list already lives
-- in lesson_slides: generate-v2.js emits one focus_1up "word card"
-- slide per taught word, with prompt_text "<emoji> <word>",
-- correct_answer = the word's example sentence, and media_url =
-- the word's picture in the vocab-images bucket. The picture's
-- filename carries the word's FIRST-introduction stage/module/
-- lesson (v2-w-<SS><MM><LL>-<slug>.png), so a word card belongs to
-- the lesson that teaches the word exactly when the filename's
-- origin equals the slide's own lesson. The two other focus_1up
-- shapes are excluded by construction: scene/story slides use
-- v2-s-*.png pictures, and pattern-model slides carry the fixed
-- prompt '🎧 Listen to the coach:'.
-- VERIFIED against the curriculum specs before this file was
-- written (2026-11-27): the rule reproduces the specs' vocabulary
-- EXACTLY — 2,240 lesson-word attributions, 2,233 unique words
-- (the plan's figure); the 7 words listed in two lessons' vocab
-- are attributed to their earliest lesson for grouping, and a
-- completion of EITHER lesson enrols them (enrolment uses the
-- per-lesson key helper below, not the grouped attribution).
-- A word's identity (word_key) is the picture filename's slug —
-- stable, unique per word, and independent of display casing.
--
-- PRIVACY — DATA MINIMISATION (standing rule, Shastri 2026-11-26:
-- privacy and child safety rule over features; store ONLY what the
-- feature needs). public.student_word_bank holds, per student per
-- word, ONLY:
--   student_id / student_kind — whose bank row this is. Needed.
--   word_key — which curriculum word (a slug of OUR OWN word).
--   step — where the word sits on the ladder (0 New .. 6 Mastered).
--   due_at — when it should be reviewed again (NULL when Mastered).
--   lapses — how many first attempts were not correct; the ladder's
--     drop rule is a function of step alone, so this is kept only
--     because the plan's bank row specifies it (it lets a future
--     report show "words that needed more tries" without storing
--     anything about the attempts themselves).
--   updated_at — when the row last changed.
-- NOTHING ELSE IS STORED. A review outcome reaches the database as
-- ONE boolean (correct on the first attempt). In particular: NO
-- transcript of what the child said (the Say-the-word check scores
-- on the device, exactly like Speaking Practice; the recogniser's
-- text is discarded), NO audio, NO typed/built answers, NO
-- per-attempt history, NO device or browser data, NO free text.
--
-- IDENTITY: all four RPCs mirror record_speaking_line (file 35)
-- exactly — PIN students (sub_account) are client-asserted (the
-- sub-account must exist and be active); email learners (auth) may
-- only touch their own bank (auth.uid() must match). Both tables
-- have RLS on and NO client policies: reads and writes flow only
-- through these SECURITY DEFINER functions.
--
-- ACCOUNT DELETION: delete_all_student_data (file 36) is recreated
-- below VERBATIM plus the student_word_bank delete, so the bank is
-- wiped on every deletion route the helper serves (the sub_accounts
-- and user_profiles BEFORE DELETE triggers and admin_delete_user —
-- which between them also cover delete_my_account, file 37, since
-- it removes the auth account and the profile cascade fires the
-- trigger). The catalogue (word_bank_words) is shared curriculum
-- content with no student data and is never deleted.
--
-- SCHEDULING (implemented in record_word_review, in one place; the
-- app mirrors it in src/lib/wordBankCore.ts for display only):
--   correct on first attempt -> step + 1 (cap 6 = Mastered);
--   not correct -> step - 2, floored at step 1, lapses + 1.
--   due_at = now + the new step's interval (1/3/7/14/30 days for
--   steps 1..5); Mastered words get due_at NULL and never return.
--   A word reviewed today is therefore never due again today: it
--   reappears in a later session, never twice in one session.
--
-- GRACEFUL DEGRADATION: until this file runs, every RPC is missing
-- and the app's word-bank calls fail soft — the dashboard card
-- shows no count, the bank screens show their empty state, and
-- lesson completion is unaffected (enrolment is fire-and-forget).
--
-- RUN: after files 6 (lesson_completions), 36 (deletion helper).
-- Safe to run more than once: the catalogue insert upserts, and
-- enrolment uses ON CONFLICT DO NOTHING.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: the word catalogue (shared curriculum content, derived)
-- ---------------------------------------------------------------------------

create table if not exists public.word_bank_words (
  word_key text primary key,
  word text not null,
  emoji text not null default '',
  example text not null default '',
  image_url text not null default '',
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade
);

alter table public.word_bank_words enable row level security;

-- The derivation, shared by the catalogue build and (per lesson) by
-- enrolment: a lesson's taught words are its focus_1up word-card
-- slides whose picture origin is that same lesson.
create or replace function public.word_bank_lesson_word_keys(p_lesson_id uuid)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct substring(ls.media_url from 'v2-w-[0-9]{6}-([a-z0-9-]+)\.png')
  from public.lesson_slides ls
  join public.curriculum_lessons cl on cl.id = ls.lesson_id
  join public.curriculum_modules cm on cm.id = cl.module_id
  join public.curriculum_stages cs on cs.id = cm.stage_id
  where ls.lesson_id = p_lesson_id
    and ls.slide_type = 'focus_1up'
    and ls.media_url like '%/v2-w-%'
    and ls.prompt_text like '% %'
    and ls.prompt_text <> '🎧 Listen to the coach:'
    and substring(ls.media_url from 'v2-w-([0-9]{6})-') =
        lpad(cs.order_index::text, 2, '0')
        || lpad((cm.order_index % 100)::text, 2, '0')
        || lpad((cl.order_index + 1)::text, 2, '0');
$$;

comment on function public.word_bank_lesson_word_keys(uuid) is
  'Round 92: the word_keys a lesson teaches, derived from its focus_1up word-card slides whose vocab-images filename origin equals the lesson itself. Internal helper for the catalogue build and sync_word_bank; EXECUTE revoked from client roles.';

revoke execute on function public.word_bank_lesson_word_keys(uuid) from public;
revoke execute on function public.word_bank_lesson_word_keys(uuid) from anon;
revoke execute on function public.word_bank_lesson_word_keys(uuid) from authenticated;

-- Populate (or refresh) the catalogue: one row per word, grouped
-- under its EARLIEST teaching lesson.
with word_slides as (
  select
    substring(ls.media_url from 'v2-w-[0-9]{6}-([a-z0-9-]+)\.png') as word_key,
    split_part(ls.prompt_text, ' ', 2) as word,
    split_part(ls.prompt_text, ' ', 1) as emoji,
    ls.correct_answer as example,
    ls.media_url as image_url,
    ls.lesson_id as lesson_id,
    (cm.order_index * 100 + cl.order_index) as lesson_sort
  from public.lesson_slides ls
  join public.curriculum_lessons cl on cl.id = ls.lesson_id
  join public.curriculum_modules cm on cm.id = cl.module_id
  join public.curriculum_stages cs on cs.id = cm.stage_id
  where ls.slide_type = 'focus_1up'
    and ls.media_url like '%/v2-w-%'
    and ls.prompt_text like '% %'
    and ls.prompt_text <> '🎧 Listen to the coach:'
    and substring(ls.media_url from 'v2-w-([0-9]{6})-') =
        lpad(cs.order_index::text, 2, '0')
        || lpad((cm.order_index % 100)::text, 2, '0')
        || lpad((cl.order_index + 1)::text, 2, '0')
),
ranked as (
  select
    ws.*,
    row_number() over (partition by ws.word_key order by ws.lesson_sort, ws.lesson_id) as rn
  from word_slides ws
  where ws.word_key is not null
)
insert into public.word_bank_words (word_key, word, emoji, example, image_url, lesson_id)
select word_key, word, emoji, example, image_url, lesson_id
from ranked
where rn = 1
on conflict (word_key) do update
  set word = excluded.word,
      emoji = excluded.emoji,
      example = excluded.example,
      image_url = excluded.image_url,
      lesson_id = excluded.lesson_id;

-- ---------------------------------------------------------------------------
-- Part 2: the per-student bank
-- ---------------------------------------------------------------------------

create table if not exists public.student_word_bank (
  student_id uuid not null,
  student_kind text not null check (student_kind in ('auth', 'sub_account')),
  word_key text not null references public.word_bank_words(word_key) on delete cascade,
  step integer not null default 0 check (step between 0 and 6),
  due_at timestamptz,
  lapses integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (student_id, student_kind, word_key),
  check ((step = 6) = (due_at is null))
);

create index if not exists student_word_bank_due
  on public.student_word_bank (student_id, student_kind, due_at)
  where step < 6;

-- Locked down: no direct client access at all. Reads and writes
-- only via the RPCs below.
alter table public.student_word_bank enable row level security;

-- ---------------------------------------------------------------------------
-- Part 3: enrolment + summary. Enrols the words of EVERY lesson the
-- student has completed (so pre-existing completions backfill on
-- first visit) and returns the bank's summary counts.
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
  where lc.student_id = p_student_id
    and lc.student_kind = p_student_kind
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
    where b.student_id = p_student_id
      and b.student_kind = p_student_kind
  );
end;
$$;

comment on function public.sync_word_bank(uuid, text) is
  'Round 92: enrols the words of all the student''s completed lessons into their Word Bank (idempotent) and returns summary counts {enrolled, due, new_words, learning, mastered}. Identity rules mirror record_speaking_line.';

grant execute on function public.sync_word_bank(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 4: the due list (session source), most overdue first.
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
    cs.order_index,
    (cm.order_index % 100)
  from public.student_word_bank b
  join public.word_bank_words w on w.word_key = b.word_key
  join public.curriculum_lessons cl on cl.id = w.lesson_id
  join public.curriculum_modules cm on cm.id = cl.module_id
  join public.curriculum_stages cs on cs.id = cm.stage_id
  where b.student_id = p_student_id
    and b.student_kind = p_student_kind
    and b.step < 6
    and b.due_at <= now()
  order by b.due_at asc;
end;
$$;

comment on function public.get_word_bank_due(uuid, text) is
  'Round 92: every Word Bank word currently due for the student (step < 6, due_at reached), most overdue first, joined to the catalogue. Identity rules mirror record_speaking_line.';

grant execute on function public.get_word_bank_due(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 5: record ONE review outcome — a single boolean. The ladder
-- lives here so the rule exists in exactly one stored place.
-- ---------------------------------------------------------------------------

create or replace function public.record_word_review(
  p_student_id uuid,
  p_student_kind text,
  p_word_key text,
  p_correct_first boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step integer;
  v_new integer;
  v_due timestamptz;
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

  select b.step into v_step
  from public.student_word_bank b
  where b.student_id = p_student_id
    and b.student_kind = p_student_kind
    and b.word_key = p_word_key;

  if v_step is null then
    raise exception 'Word is not in this student''s bank' using errcode = 'P0001';
  end if;

  if p_correct_first then
    v_new := least(6, v_step + 1);
  else
    v_new := greatest(1, v_step - 2);
  end if;

  v_due := case
    when v_new = 6 then null
    else now() + (case v_new
      when 1 then interval '1 day'
      when 2 then interval '3 days'
      when 3 then interval '7 days'
      when 4 then interval '14 days'
      when 5 then interval '30 days'
    end)
  end;

  update public.student_word_bank b
  set step = v_new,
      due_at = v_due,
      lapses = b.lapses + (case when p_correct_first then 0 else 1 end),
      updated_at = now()
  where b.student_id = p_student_id
    and b.student_kind = p_student_kind
    and b.word_key = p_word_key;

  return jsonb_build_object(
    'step', v_new,
    'due_at', v_due,
    'mastered', v_new = 6
  );
end;
$$;

comment on function public.record_word_review(uuid, text, text, boolean) is
  'Round 92: applies ONE Word Bank review outcome (correct on first attempt, yes/no) to the ladder: correct -> step+1 (cap 6 Mastered); not correct -> step-2 floored at step 1, lapses+1; due_at = now + the new step''s interval (1/3/7/14/30 days), NULL when Mastered. Stores nothing about the attempt itself. Identity rules mirror record_speaking_line.';

grant execute on function public.record_word_review(uuid, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 6: the dictionary browse — one module's words with the
-- student's status for each.
-- ---------------------------------------------------------------------------

create or replace function public.get_word_bank_browse(
  p_student_id uuid,
  p_student_kind text,
  p_module_id uuid
)
returns table (
  word_key text,
  word text,
  emoji text,
  example text,
  image_url text,
  lesson_id uuid,
  lesson_title text,
  lesson_order integer,
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
    w.lesson_id,
    cl.title,
    cl.order_index,
    case
      when b.student_id is null then 'not_started'
      when b.step = 0 then 'new'
      when b.step = 6 then 'mastered'
      else 'learning'
    end,
    b.step
  from public.word_bank_words w
  join public.curriculum_lessons cl on cl.id = w.lesson_id
  left join public.student_word_bank b
    on b.word_key = w.word_key
    and b.student_id = p_student_id
    and b.student_kind = p_student_kind
  where cl.module_id = p_module_id
  order by cl.order_index asc, w.word asc;
end;
$$;

comment on function public.get_word_bank_browse(uuid, text, uuid) is
  'Round 92: the Word Bank dictionary for one module — every word the module introduces (catalogue attribution: earliest teaching lesson) with the student''s status (not_started / new / learning / mastered). Identity rules mirror record_speaking_line.';

grant execute on function public.get_word_bank_browse(uuid, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 7: account deletion covers the bank. delete_all_student_data
-- (file 36) recreated VERBATIM, plus the student_word_bank delete —
-- the table list still lives in exactly one place, and every route
-- the helper serves (both BEFORE DELETE triggers, admin_delete_
-- user, and through them delete_my_account) wipes the bank too.
-- ---------------------------------------------------------------------------

create or replace function public.delete_all_student_data(
  p_student_id uuid,
  p_student_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Tables keyed by student_id + student_kind.
  delete from public.lesson_completions
  where student_id = p_student_id
    and student_kind = p_student_kind;

  delete from public.point_events
  where student_id = p_student_id
    and student_kind = p_student_kind;

  delete from public.reading_records
  where student_id = p_student_id
    and student_kind = p_student_kind;

  delete from public.speaking_line_results
  where student_id = p_student_id
    and student_kind = p_student_kind;

  -- Round 92: the Word Bank goes with the account too.
  delete from public.student_word_bank
  where student_id = p_student_id
    and student_kind = p_student_kind;

  -- Tables keyed by student_id alone (no kind column exists; the
  -- two id spaces are disjoint - the same classification files 8
  -- and 9 already rely on).
  delete from public.activity_logs
  where student_id = p_student_id;

  delete from public.student_badges
  where student_id = p_student_id;
end;
$$;

comment on function public.delete_all_student_data(uuid, text) is
  'Deletes EVERY per-student data row for one student (lesson_completions, point_events, reading_records, speaking_line_results, student_word_bank by id+kind; activity_logs, student_badges by id). Internal only - called by the sub_accounts/user_profiles BEFORE DELETE triggers and by admin_delete_user. EXECUTE is revoked from all client roles on purpose. (File 36, extended by file 40.)';

revoke execute on function public.delete_all_student_data(uuid, text) from public;
revoke execute on function public.delete_all_student_data(uuid, text) from anon;
revoke execute on function public.delete_all_student_data(uuid, text) from authenticated;
