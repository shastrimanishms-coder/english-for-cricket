-- ============================================================================
-- Migration 32: Page translations (Round 78)
--
-- 1. public.page_translations holds per-language versions of the
--    site's long-form pages: the legal documents (terms-and-conditions,
--    privacy-policy), the Support page's static text (support-page)
--    and the six "How to use" help texts (help-*). English is the
--    master; visitors see the language they chose on the home page
--    (localStorage efc_landing_lang) when a row exists for it, and
--    English otherwise.
-- 2. RLS: anyone may read; only admins (public.is_admin()) may write.
--    Non-English rows are added by the admin in the dashboard
--    (Pages & Translations) or by reviewed draft SQL - never by this
--    migration, so unreviewed translations cannot go live by accident.
-- 3. English seeds: the legal documents are copied from the live
--    public.pages rows (the current source of truth); the Support
--    page text and the six help texts are seeded literally below.
-- ============================================================================

create table if not exists public.page_translations (
  slug text not null,
  lang text not null,
  title text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (slug, lang)
);

alter table public.page_translations enable row level security;

drop policy if exists page_translations_public_read on public.page_translations;
create policy page_translations_public_read
  on public.page_translations
  for select
  using (true);

drop policy if exists page_translations_admin_insert on public.page_translations;
create policy page_translations_admin_insert
  on public.page_translations
  for insert
  with check (public.is_admin());

drop policy if exists page_translations_admin_update on public.page_translations;
create policy page_translations_admin_update
  on public.page_translations
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists page_translations_admin_delete on public.page_translations;
create policy page_translations_admin_delete
  on public.page_translations
  for delete
  using (public.is_admin());

-- English master rows for the legal documents, copied from the live
-- pages table so the translation system starts from the exact text
-- visitors see today.
insert into public.page_translations (slug, lang, title, body)
select slug, 'en', title, content
from public.pages
where slug in ('terms-and-conditions', 'privacy-policy')
on conflict (slug, lang) do nothing;

-- English rows for the Support page's static text and the six
-- "How to use" help texts. The support-page body is four short parts
-- separated by a line containing only --- : (1) the intro under the
-- title, (2) the note above the contact form, (3) the "Still stuck?"
-- email note, (4) the empty-FAQs note. Help bodies use the standard
-- page format: a "## How to use" heading with "- " step lines, then
-- a "## Tips for best results" heading with "- " tip lines.
insert into public.page_translations (slug, lang, title, body)
values
  ('support-page', 'en', 'Help & Support', $r78$Answers to common questions about learning with English for Cricket.
---
Questions, feedback or ideas - write to us here and we will get back to you by email.
---
Send us an email and we will get back to you.
---
Help articles are on the way. If you need a hand right now, contact us below.$r78$),
  ('help-learning-path', 'en', 'How to use the Learning Path', $r78$## How to use
- Start at the stage that is open for you. Your next unfinished lesson opens by itself — just tap it to begin.
- Inside a lesson, listen to the words and sentences, say them out loud, and tap your answers.
- When you hear the beep, it is your turn to speak. Speak clearly, like talking to a friend.
- Finish the lesson to earn points and keep your streak going.
- Tap a stage or module heading to open or close it and look around your path.

## Tips for best results
- Do a little every day — one lesson a day is a great habit.
- Say every word out loud, not just in your head. Your voice needs practice too!
- If a lesson feels hard, do it once more. Repeating is how learning sticks.
- Choose your study days in your Profile, so rest days never break your streak.$r78$),
  ('help-reading', 'en', 'How to use Smart Reading', $r78$## How to use
- Tap a story card to open it. A tick on a card shows your best score for that story.
- Choose "Listen & Read" to hear the story read aloud — the words light up as they are read.
- Or choose "Read Aloud" and read the sentences yourself; the app listens and gives you a score.
- Use the Speed button if the voice is too fast or too slow for you.
- Answer the questions at the end of the story to check you understood it.
- Tap "Download PDF" to save or print the story and read it anywhere.

## Tips for best results
- Pick your favourite story voices in Profile, under "My Voices", before you start.
- Listen to a story first, then read it aloud yourself — that order works best.
- Read a little every day; short stories count too.
- When reading starts to feel easy, try a story from the next stage.$r78$),
  ('help-speaking', 'en', 'How to use Speaking Practice', $r78$## How to use
- Choose "Practise My Lesson Lines" to say words and sentences from your lessons, or pick a conversation card to talk with a partner.
- Listen to your partner's line first — tap the speaker button to hear it again.
- When you hear the beep, speak your line out loud. The app listens and gives you a score.
- In a conversation, take turns until you reach the end — then try it once more!

## Tips for best results
- Speaking works best in the Chrome browser. Please allow the microphone when the app asks.
- Find a quiet place — noise makes it hard for the app to hear you.
- Speak clearly and not too fast, like talking to a friend.
- Keep the microphone near your mouth when you speak.
- Do not worry about mistakes — every try makes your English stronger.$r78$),
  ('help-games', 'en', 'How to use Games', $r78$## How to use
- Tap any game card to play it.
- Read or listen to the question, then tap your answer — each game shows you what to do.
- Finish the game to see your score and your stars — three stars is the best!
- Use the stage and topic buttons at the top to find games for your level.

## Tips for best results
- Start with games from your own stage, then try harder ones.
- Play a game again to beat your stars.
- Listen carefully — many games practise your ears as well as your eyes.
- A few minutes of games every day keeps your words fresh.$r78$),
  ('help-videos', 'en', 'How to use Videos', $r78$## How to use
- Tap a video card to open it and watch.
- Pause any time you want to think, and watch again as many times as you like.
- Say the words out loud along with the video — your voice is part of the lesson!

## Tips for best results
- Watch with the sound on, in a quiet place.
- Watch a video once for fun, then once more to listen carefully.
- New videos are being made — check back soon for more.$r78$),
  ('help-downloads', 'en', 'How to use Downloads', $r78$## How to use
- Tap a file to download or open it.
- Worksheets and workbooks go with your lessons — print them and write on them with a pencil.
- Guides and charts are good to keep near your study place.

## Tips for best results
- Ask a grown-up to help with printing.
- Do the worksheet soon after the lesson, while the words are fresh.
- Keep your finished worksheets together — it is lovely to see how much you have learned.
- New downloads are being made — check back soon for more.$r78$)
on conflict (slug, lang) do nothing;
