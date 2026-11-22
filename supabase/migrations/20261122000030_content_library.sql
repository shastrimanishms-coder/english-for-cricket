-- ============================================================================
-- Migration 30: Content library (Round 39)
--
-- 1. reading_stories.questions — comprehension questions for Smart
--    Reading: [{ "q": "...", "options": ["A","B","C"], "answer": 0 }]
--    (answer = index of the correct option). The learner answers them
--    on the story-finished screen.
-- 2. games.engine + games.data — built-in games. When engine is set,
--    the app plays the game itself from the data jsonb instead of
--    loading an uploaded HTML file:
--      picture_tap  { items: [{ word, image }] }
--      mascot_says  { items: [{ text, image }] }   (spoken commands)
--      number_catch { items: [{ value, word }] }
--      memory_pairs { items: [{ word, image }] }
--      sort_it      { mode: "order", items: [..] }
--                   { mode: "groups", groups: [{ label, words: [..] }] }
--    Uploaded games (engine null) keep working exactly as before.
-- 3. stage_id + module_id tags on games / speaking_scenarios /
--    reading_stories, so content can be tagged to a whole module
--    (lesson_id tagging from migration 17 stays for finer tagging).
--    All additive; every read in the app fails soft without them.
-- ============================================================================

alter table public.reading_stories
  add column if not exists questions jsonb not null default '[]'::jsonb;

alter table public.games
  add column if not exists engine text,
  add column if not exists data jsonb;

alter table public.games
  add column if not exists stage_id uuid references public.curriculum_stages(id) on delete set null,
  add column if not exists module_id uuid references public.curriculum_modules(id) on delete set null;

alter table public.speaking_scenarios
  add column if not exists stage_id uuid references public.curriculum_stages(id) on delete set null,
  add column if not exists module_id uuid references public.curriculum_modules(id) on delete set null;

alter table public.reading_stories
  add column if not exists stage_id uuid references public.curriculum_stages(id) on delete set null,
  add column if not exists module_id uuid references public.curriculum_modules(id) on delete set null;
