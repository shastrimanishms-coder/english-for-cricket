-- ============================================================================
-- 20261127000043_word_bank_rebuild.sql
-- Round 97: rebuild_word_bank_for_lesson(p_lesson_id) — the RPC the
-- admin Learning Path lesson UPLOAD door calls after installing a
-- lesson package, so the Word Bank catalogue learns that lesson's
-- words without waiting for a full catalogue rebuild.
--
-- WHAT IT DOES (conservative, insert/update only):
--   1. Re-derives the lesson's taught words with EXACTLY the rule
--      file 40 uses (focus_1up word-card slides whose vocab-images
--      filename origin equals the lesson itself; word / emoji /
--      example / picture read from the slide).
--   2. Upserts those words into word_bank_words: new words are
--      inserted with this lesson as their attribution; existing
--      words get word / emoji / example / image_url refreshed —
--      but is_enabled is NEVER touched (an editor's Off stays Off)
--      and lesson_id attribution is NEVER moved (a word stays
--      grouped under its earliest teaching lesson, as file 40's
--      catalogue build does).
--   3. Refreshes THIS lesson's Learning Path rows in
--      word_bank_sources (delete the lesson's own rows, re-insert
--      from the derivation) so the grouped Word Bank manager and
--      the learner browse stay truthful after a slide swap.
--   4. NOTHING is ever deleted from word_bank_words: a word's
--      catalogue row survives while any lesson teaches it, and
--      student_word_bank progress is keyed on word_key, untouched.
--   Textbook sources are never touched here.
--
-- AUTHORITY: App Manager / Content Manager only — the function
-- raises unless public.can_edit_content() (file 28). EXECUTE is
-- granted to authenticated; anon cannot call it.
--
-- RETURNS: jsonb { lesson_id, words, added, updated }.
--
-- RUN: after files 40, 41 and 42. Safe to run more than once.
-- ============================================================================

create or replace function public.rebuild_word_bank_for_lesson(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_words integer := 0;
  v_added integer := 0;
  v_updated integer := 0;
begin
  if not public.can_edit_content() then
    raise exception 'Only content editors can rebuild the Word Bank.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.curriculum_lessons where id = p_lesson_id) then
    raise exception 'Lesson % not found.', p_lesson_id
      using errcode = 'P0002';
  end if;

  -- Upsert the lesson's derived words. xmax = 0 distinguishes a
  -- fresh insert from an update of an existing row.
  with derived as (
    select
      substring(ls.media_url from 'v2-w-[0-9]{6}-([a-z0-9-]+)\.png') as word_key,
      split_part(ls.prompt_text, ' ', 2) as word,
      split_part(ls.prompt_text, ' ', 1) as emoji,
      ls.correct_answer as example,
      ls.media_url as image_url
    from public.lesson_slides ls
    where ls.lesson_id = p_lesson_id
      and ls.slide_type = 'focus_1up'
      and ls.media_url like '%/v2-w-%'
      and ls.prompt_text like '% %'
      and ls.prompt_text <> '🎧 Listen to the coach:'
      and substring(ls.media_url from 'v2-w-([0-9]{6})-') in (
        select
          lpad(cs.order_index::text, 2, '0')
          || lpad((cm.order_index % 100)::text, 2, '0')
          || lpad((cl.order_index + 1)::text, 2, '0')
        from public.curriculum_lessons cl
        join public.curriculum_modules cm on cm.id = cl.module_id
        join public.curriculum_stages cs on cs.id = cm.stage_id
        where cl.id = p_lesson_id
      )
  ),
  deduped as (
    select distinct on (word_key) word_key, word, emoji, example, image_url
    from derived
    where word_key is not null
    order by word_key
  ),
  upserted as (
    insert into public.word_bank_words
      (word_key, word, emoji, example, image_url, lesson_id)
    select word_key, word, emoji, example, image_url, p_lesson_id
    from deduped
    on conflict (word_key) do update
      set word = excluded.word,
          emoji = excluded.emoji,
          example = excluded.example,
          image_url = excluded.image_url
      -- lesson_id deliberately NOT updated: attribution stays with
      -- the earliest teaching lesson. is_enabled deliberately NOT
      -- in the set list: an editor's Off is never overridden.
    returning (xmax = 0) as inserted
  )
  select
    count(*),
    count(*) filter (where inserted),
    count(*) filter (where not inserted)
  into v_words, v_added, v_updated
  from upserted;

  -- Refresh this lesson's own Learning Path source rows only.
  delete from public.word_bank_sources
  where source_kind = 'learning_path'
    and lesson_id = p_lesson_id;

  insert into public.word_bank_sources
    (word_key, source_kind, source_key, lesson_id)
  select k.word_key, 'learning_path', 'lp:' || p_lesson_id::text, p_lesson_id
  from public.word_bank_lesson_word_keys(p_lesson_id) as k(word_key)
  on conflict do nothing;

  return jsonb_build_object(
    'lesson_id', p_lesson_id,
    'words', v_words,
    'added', v_added,
    'updated', v_updated
  );
end;
$$;

comment on function public.rebuild_word_bank_for_lesson(uuid) is
  'Round 97: re-derives one lesson''s Word Bank words after a lesson package upload (file 40''s derivation rule). Insert/update only — never deletes catalogue rows, never touches is_enabled, never moves lesson attribution. Editors only (can_edit_content).';

revoke execute on function public.rebuild_word_bank_for_lesson(uuid) from public;
revoke execute on function public.rebuild_word_bank_for_lesson(uuid) from anon;
grant execute on function public.rebuild_word_bank_for_lesson(uuid) to authenticated;
