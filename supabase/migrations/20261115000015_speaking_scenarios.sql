-- Migration 15: speaking scenarios for the standalone Speaking
-- Practice area (interviews + small talk role-plays), managed from
-- its own "Speaking Practice" section in the admin dashboard.
--
-- A scenario is a short scripted conversation: the app plays the
-- other person (turns with speaker = 'other', stored in jsonb) and
-- the learner speaks their lines (speaker = 'learner') and gets the
-- usual word-by-word speech score.
--
-- scenario_type is 'scripted' for everything today. A future update
-- adds AI conversations ('ai'); the column exists now so that later
-- step needs no schema change.
--
-- RLS matches the other content tables (migration 13): anyone can
-- read published scenarios (learners and PIN students use the
-- anonymous key), only super_admin can write.
--
-- The seven starter scenarios are seeded ONLY when the table is
-- empty, so re-running this file never duplicates them and never
-- overwrites scenarios the admin has since edited.
--
-- Safe to run once in the SQL Editor.

create table if not exists public.speaking_scenarios (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('Interview', 'Small Talk')),
  emoji text not null default '🎙️',
  description text,
  other_name text not null default 'Partner',
  turns jsonb not null default '[]'::jsonb,
  scenario_type text not null default 'scripted',
  is_published boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.speaking_scenarios enable row level security;

drop policy if exists "Speaking scenarios public read published" on public.speaking_scenarios;
create policy "Speaking scenarios public read published"
  on public.speaking_scenarios for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "Speaking scenarios admin full access" on public.speaking_scenarios;
create policy "Speaking scenarios admin full access"
  on public.speaking_scenarios for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------ seed data
insert into public.speaking_scenarios
  (title, category, emoji, description, other_name, turns, order_index)
select * from (values
  ('Post-Match Interview', 'Interview', '🎙️', 'A reporter interviews you after a great game.', 'Reporter', '[{"speaker":"other","text":"Great game today! How do you feel?"},{"speaker":"learner","text":"I feel very happy. It was a great match."},{"speaker":"other","text":"You hit two boundaries. Which shot was your favourite?"},{"speaker":"learner","text":"My favourite shot was the cover drive for four."},{"speaker":"other","text":"What did your coach tell you before the match?"},{"speaker":"learner","text":"He told me to watch the ball and play my shots."},{"speaker":"other","text":"One last question. What is your dream?"},{"speaker":"learner","text":"My dream is to play for my country one day."},{"speaker":"other","text":"Thank you, and good luck in the next match!"},{"speaker":"learner","text":"Thank you very much!"}]'::jsonb, 0),
  ('Meet the Young Captain', 'Interview', '🏆', 'Answer questions about your team like a real captain.', 'Reporter', '[{"speaker":"other","text":"Hello! Please tell us about your team."},{"speaker":"learner","text":"I am the captain of our school team."},{"speaker":"other","text":"When do you practise together?"},{"speaker":"learner","text":"We practise every Sunday morning."},{"speaker":"other","text":"Why do you like cricket?"},{"speaker":"learner","text":"Cricket teaches us teamwork and English."},{"speaker":"other","text":"When is your next match?"},{"speaker":"learner","text":"Our next match is on Saturday afternoon."}]'::jsonb, 1),
  ('Player of the Match', 'Interview', '⭐', 'You took three wickets! Talk about your bowling.', 'Reporter', '[{"speaker":"other","text":"Congratulations! You are the player of the match."},{"speaker":"learner","text":"Thank you! I took three wickets today."},{"speaker":"other","text":"The pitch looked slow. How did you bowl?"},{"speaker":"learner","text":"I bowled line and length, and I stayed patient."},{"speaker":"other","text":"Who do you want to thank?"},{"speaker":"learner","text":"I want to thank my team and my coach."},{"speaker":"other","text":"Well played today!"},{"speaker":"learner","text":"Thank you. See you at the next match!"}]'::jsonb, 2),
  ('First Day at Practice', 'Small Talk', '👋', 'Make a new friend at your first cricket practice.', 'Teammate', '[{"speaker":"other","text":"Hi there! Are you new here?"},{"speaker":"learner","text":"Yes, today is my first day. I am very excited."},{"speaker":"other","text":"Welcome to the team! Do you like batting or bowling?"},{"speaker":"learner","text":"I like batting. And you?"},{"speaker":"other","text":"I like bowling. Let us practise together!"},{"speaker":"learner","text":"That sounds great. Thank you!"},{"speaker":"other","text":"See you next Sunday, then."},{"speaker":"learner","text":"See you next Sunday!"}]'::jsonb, 3),
  ('At the Cricket Shop', 'Small Talk', '🛍️', 'Buy your first cricket bat in English.', 'Shopkeeper', '[{"speaker":"other","text":"Hello! Can I help you?"},{"speaker":"learner","text":"Yes, please. I am looking for a cricket bat."},{"speaker":"other","text":"Of course. What size do you need?"},{"speaker":"learner","text":"Size five, please. How much is it?"},{"speaker":"other","text":"This one is three thousand yen."},{"speaker":"learner","text":"I will take it. Thank you very much!"}]'::jsonb, 4),
  ('Making Plans with a Friend', 'Small Talk', '📞', 'Arrange a Sunday cricket game on the phone.', 'Friend', '[{"speaker":"other","text":"Hello! Are you free on Sunday?"},{"speaker":"learner","text":"Yes, I am free in the morning."},{"speaker":"other","text":"Let us play cricket in the park."},{"speaker":"learner","text":"Great idea! I will bring my bat and ball."},{"speaker":"other","text":"Perfect. See you at ten o''clock."},{"speaker":"learner","text":"See you then. Goodbye!"}]'::jsonb, 5),
  ('Talking with Your Coach', 'Small Talk', '🧢', 'A quick chat with your coach after practice.', 'Coach', '[{"speaker":"other","text":"Good morning! How is your batting this week?"},{"speaker":"learner","text":"It is getting better, Coach."},{"speaker":"other","text":"Good. Remember, always watch the ball carefully."},{"speaker":"learner","text":"Yes, Coach. I will practise every day."},{"speaker":"other","text":"That is the spirit. Keep working hard!"},{"speaker":"learner","text":"Thank you, Coach. See you on Sunday!"}]'::jsonb, 6)
) as v(title, category, emoji, description, other_name, turns, order_index)
where not exists (select 1 from public.speaking_scenarios);
