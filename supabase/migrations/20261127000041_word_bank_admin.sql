-- ============================================================================
-- 20261127000041_word_bank_admin.sql
-- Round 94: the Word Bank lesson books (Learn / Test) + the admin
-- Word Bank manager.
--
-- WHAT CHANGES: the books themselves need no schema — a Test page
-- reports through migration 40's record_word_review, one boolean
-- per enrolled word, exactly like a review session. This file is
-- for the ADMIN MANAGER (Asset Managers -> Word Bank):
--
--   1. word_bank_words gains `is_enabled boolean not null default
--      true` — the catalogue's on/off switch. Switching a word off
--      removes it from enrolment, review dealing and the dictionary
--      browse; students' existing bank rows go DORMANT (never
--      deleted) and return if the word is switched back on.
--   2. The four migration-40 RPCs are recreated to respect the
--      switch:
--        sync_word_bank      — enrolment skips disabled words, and
--                              the summary counts only enabled rows;
--        get_word_bank_due   — disabled words are never dealt;
--        get_word_bank_browse — disabled words leave the dictionary;
--        record_word_review  — a review for a DISABLED word that the
--                              student already holds is a CALM NO-OP
--                              SUCCESS: it returns the row's current
--                              state unchanged (a book opened before
--                              the word was switched off can finish
--                              without an error). A disabled word the
--                              student does not hold raises the same
--                              'not in this student's bank' error as
--                              any unenrolled word.
--      Everything else — identity rules, the ladder, privacy — is
--      migration 40 verbatim.
--   3. RLS policies let can_edit_content() roles (App Manager via
--      is_admin(), Content Manager) SELECT and UPDATE the catalogue
--      directly, which is all the manager does. The word TEXT is
--      not protected by the database — the manager simply never
--      offers to edit it (recordings match by exact text); the
--      policy boundary is the role, as everywhere else.
--
-- PRIVACY: unchanged. The catalogue is shared curriculum content;
-- no student data is added, moved or exposed by this file.
--
-- GRACEFUL DEGRADATION: until this file runs, the four RPCs behave
-- exactly as in migration 40 (every word counts as enabled) and
-- learner screens are untouched; only the admin tab notices — its
-- catalogue read asks for is_enabled, fails, and shows a calm
-- "run Migration 41" panel.
--
-- RUN: after file 40. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: the switch.
-- ---------------------------------------------------------------------------

alter table public.word_bank_words
  add column if not exists is_enabled boolean not null default true;

comment on column public.word_bank_words.is_enabled is
  'Round 94: catalogue on/off switch, edited from the admin Word Bank manager. Disabled words leave enrolment, review dealing and the dictionary browse; students'' bank rows go dormant, never deleted.';

-- ---------------------------------------------------------------------------
-- Part 2: catalogue access for the manager (App Manager + Content
-- Manager). SELECT and UPDATE only — the catalogue is derived by
-- migration 40, never inserted or deleted from the admin UI.
-- ---------------------------------------------------------------------------

drop policy if exists "word_bank_words_editor_select" on public.word_bank_words;
create policy "word_bank_words_editor_select"
  on public.word_bank_words
  for select
  to authenticated
  using (public.can_edit_content());

drop policy if exists "word_bank_words_editor_update" on public.word_bank_words;
create policy "word_bank_words_editor_update"
  on public.word_bank_words
  for update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- ---------------------------------------------------------------------------
-- Part 3: sync_word_bank — enrolment skips disabled words; the
-- summary counts only enabled rows (dormant rows are invisible,
-- exactly as in browse and the due list).
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
  'Round 92, switch-aware since Round 94 (file 41): enrols the words of all the student''s completed lessons into their Word Bank (idempotent, disabled words skipped) and returns summary counts {enrolled, due, new_words, learning, mastered} over enabled words only. Identity rules mirror record_speaking_line.';

grant execute on function public.sync_word_bank(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 4: get_word_bank_due — disabled words are never dealt.
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
    and w.is_enabled
  order by b.due_at asc;
end;
$$;

comment on function public.get_word_bank_due(uuid, text) is
  'Round 92, switch-aware since Round 94 (file 41): every enabled Word Bank word currently due for the student (step < 6, due_at reached), most overdue first, joined to the catalogue. Identity rules mirror record_speaking_line.';

grant execute on function public.get_word_bank_due(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 5: record_word_review — the ladder, unchanged, plus the
-- disabled-word rule: a held word's review becomes a calm no-op
-- success returning the current state (see the header).
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
  v_enabled boolean;
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

  select b.step, b.due_at into v_step, v_due
  from public.student_word_bank b
  where b.student_id = p_student_id
    and b.student_kind = p_student_kind
    and b.word_key = p_word_key;

  if v_step is null then
    raise exception 'Word is not in this student''s bank' using errcode = 'P0001';
  end if;

  -- Round 94: a word switched off after the student enrolled keeps
  -- its row dormant. A late review (a book or session opened before
  -- the switch) succeeds calmly and changes nothing.
  select w.is_enabled into v_enabled
  from public.word_bank_words w
  where w.word_key = p_word_key;

  if v_enabled is distinct from true then
    return jsonb_build_object(
      'step', v_step,
      'due_at', v_due,
      'mastered', v_step = 6
    );
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
  'Round 92, switch-aware since Round 94 (file 41): applies ONE Word Bank review outcome (correct on first attempt, yes/no) to the ladder: correct -> step+1 (cap 6 Mastered); not correct -> step-2 floored at step 1, lapses+1; due_at = now + the new step''s interval (1/3/7/14/30 days), NULL when Mastered. Stores nothing about the attempt itself. A review for a DISABLED word the student holds is a no-op success returning the current state. Identity rules mirror record_speaking_line.';

grant execute on function public.record_word_review(uuid, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 6: get_word_bank_browse — disabled words leave the
-- dictionary (and with it the Learn / Test books, which read the
-- same rows).
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
    and w.is_enabled
  order by cl.order_index asc, w.word asc;
end;
$$;

comment on function public.get_word_bank_browse(uuid, text, uuid) is
  'Round 92, switch-aware since Round 94 (file 41): the Word Bank dictionary for one module — every ENABLED word the module introduces (catalogue attribution: earliest teaching lesson) with the student''s status (not_started / new / learning / mastered). Identity rules mirror record_speaking_line.';

grant execute on function public.get_word_bank_browse(uuid, text, uuid) to anon, authenticated;
