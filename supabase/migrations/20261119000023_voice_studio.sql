-- ============================================================================
-- Migration 23: Voice Studio — human voice recordings for the learning path
--
-- WHAT THIS BUILDS (Shastri's design, agreed 2026-11-19):
--   A hidden recording studio inside the app. The admin creates voice-actor
--   accounts (username + password only, like student PIN accounts) and sends
--   the credentials to actors by mail/message. Each actor is linked to one
--   named VOICE (e.g. "Amy", "John") in one of four voice CATEGORIES:
--     M1 adult male · F1 adult female · B1 young male (Ken) · G1 young female (Mira)
--   The actor chooses the voice's name; the admin may rename it later.
--   Actors work through the line queue (public.voice_lines, seeded from the
--   complete 18,011-line script) one line at a time: record, listen back,
--   re-record or submit. The admin reviews every submission in the panel and
--   can approve it or send it back with a reason. Approved recordings are
--   what the lesson player will use (with device TTS as fallback).
--   Every voice also records an INTRODUCTION line; students browsing voices
--   in their profile settings tap a voice to hear that intro as a sample,
--   and pick which named voice they want per category.
--
-- IDENTITY MODEL: actors have no Supabase auth session, exactly like PIN
-- students. All actor operations go through SECURITY DEFINER RPCs that
-- verify username/password or the actor id server-side, mirroring
-- authenticate_student. Actor passwords are stored readable ON PURPOSE:
-- the admin creates them and must be able to re-send them, the same
-- standing decision as student PINs (migration 5's hashing stays unrun).
-- Admin operations use normal table access guarded by public.is_admin().
--
-- STORAGE: bucket 'voice-recordings' is public-read (recordings are played
-- to learners by public URL, like vocab-images). Actors upload as anon;
-- the bucket policy below allows anon insert/update ONLY in this bucket.
-- A stray file with no voice_recordings row is inert: nothing plays a
-- recording until submit_recording() has registered it and an admin has
-- approved it. Paths are '<voice slug>/<line id>.<ext>' and
-- '<voice slug>/intro.<ext>'.
-- ============================================================================

-- ------------------------------------------------------------- actors
create table if not exists public.voice_actors (
  id           uuid primary key default gen_random_uuid(),
  username     text not null unique,
  password     text not null,
  display_name text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table public.voice_actors is
  'Voice-actor login accounts (username + password, no email). Password readable by super_admin so it can be re-sent, same standing decision as student PINs.';

-- ------------------------------------------------------------- voices
create table if not exists public.voices (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,  -- storage folder name, e.g. 'amy'
  display_name      text not null,         -- what students see, e.g. 'Amy'
  name_chosen       boolean not null default false, -- actor picked the name on first login (one-time; admin can still rename)
  category          text not null check (category in ('M1', 'F1', 'B1', 'G1')),
  actor_id          uuid references public.voice_actors (id) on delete set null,
  intro_text        text not null default 'Hello! I am one of your English voices. Listen to me in your lessons, and let us learn English together!',
  intro_path        text,                  -- storage path of the intro recording
  intro_status      text not null default 'pending'
                      check (intro_status in ('pending', 'submitted', 'approved', 'redo')),
  intro_redo_reason text,
  from_stage        integer not null default 1,  -- assignment window:
  to_stage          integer not null default 5,  -- record only these stages
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

comment on table public.voices is
  'A named, student-selectable voice. Belongs to one category (M1/F1/B1/G1) and optionally to one actor account. Recordings are stored per voice, so two actors in the same category are two distinct voices.';

-- ------------------------------------------------------------- lines
create table if not exists public.voice_lines (
  id       integer primary key,            -- the script line number (1..18011)
  category text not null check (category in ('M1', 'F1', 'B1', 'G1')),
  type     text not null,                  -- word | sentence | question | reading | dialogue | letter | sound | number
  text     text not null,
  ref      text not null,                  -- e.g. 'S3 M4 L2 pattern' (front-section lines: descriptive ref)
  stage    integer not null default 0,     -- 0 = front section (alphabet/numbers/scenarios)
  module   integer not null default 0,
  lesson   integer not null default 0,
  note     text not null default ''
);

create index if not exists voice_lines_category_idx on public.voice_lines (category, stage, module, lesson, id);
create index if not exists voice_lines_lookup_idx on public.voice_lines (text, category);

comment on table public.voice_lines is
  'The recording queue: every line the app can speak, seeded from the complete voice script (18,011 lines). One line is recorded once per voice that covers its category.';

-- ------------------------------------------------------------- recordings
create table if not exists public.voice_recordings (
  id           uuid primary key default gen_random_uuid(),
  line_id      integer not null references public.voice_lines (id) on delete cascade,
  voice_id     uuid not null references public.voices (id) on delete cascade,
  actor_id     uuid references public.voice_actors (id) on delete set null,
  storage_path text not null,
  status       text not null default 'submitted'
                 check (status in ('submitted', 'approved', 'redo')),
  redo_reason  text,
  take_count   integer not null default 1,
  duration_ms  integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  unique (line_id, voice_id)
);

create index if not exists voice_recordings_voice_status_idx on public.voice_recordings (voice_id, status);
create index if not exists voice_recordings_status_idx on public.voice_recordings (status, created_at);

comment on table public.voice_recordings is
  'One recording per (line, voice). Only status=approved recordings are ever played to students.';

-- ------------------------------------------------- student voice prefs
-- Same two-table pattern as placement (migration 21): a jsonb map of
-- category -> voice_id on both student kinds.
alter table public.user_profiles
  add column if not exists voice_prefs jsonb not null default '{}'::jsonb;
alter table public.sub_accounts
  add column if not exists voice_prefs jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------- bucket
insert into storage.buckets (id, name, public)
values ('voice-recordings', 'voice-recordings', true)
on conflict (id) do update set public = true;

drop policy if exists "Voice recordings public read" on storage.objects;
create policy "Voice recordings public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'voice-recordings');

-- Actors are signed-out (anon) clients: they may add/replace files ONLY in
-- this bucket. Registration + approval in the tables is the real gate.
drop policy if exists "Voice recordings actor insert" on storage.objects;
create policy "Voice recordings actor insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'voice-recordings');

drop policy if exists "Voice recordings actor update" on storage.objects;
create policy "Voice recordings actor update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'voice-recordings')
  with check (bucket_id = 'voice-recordings');

drop policy if exists "Voice recordings admin delete" on storage.objects;
create policy "Voice recordings admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'voice-recordings' and public.is_admin());

-- ------------------------------------------------------------- RLS
alter table public.voice_actors enable row level security;
alter table public.voices enable row level security;
alter table public.voice_lines enable row level security;
alter table public.voice_recordings enable row level security;

-- voice_actors: NO anon access (passwords). Super_admin manages accounts.
drop policy if exists "voice_actors_admin_all" on public.voice_actors;
create policy "voice_actors_admin_all"
  on public.voice_actors for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- voices: public read of ACTIVE voices (students browse the voice picker);
-- writes are super_admin only. Actor-side changes go through RPCs.
drop policy if exists "voices_select_public" on public.voices;
create policy "voices_select_public"
  on public.voices for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "voices_admin_write" on public.voices;
create policy "voices_admin_write"
  on public.voices for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- voice_lines: the script is public text (it is the app's own lesson text).
drop policy if exists "voice_lines_select_public" on public.voice_lines;
create policy "voice_lines_select_public"
  on public.voice_lines for select
  to anon, authenticated
  using (true);

drop policy if exists "voice_lines_admin_write" on public.voice_lines;
create policy "voice_lines_admin_write"
  on public.voice_lines for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- voice_recordings: no direct anon access; actors work through RPCs and
-- playback resolves through get_voice_line_audio(). Admin reviews directly.
drop policy if exists "voice_recordings_admin_all" on public.voice_recordings;
create policy "voice_recordings_admin_all"
  on public.voice_recordings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- RPCs
-- ============================================================================

-- ------------------------------------------------- actor sign-in
create or replace function public.authenticate_actor(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.voice_actors%rowtype;
  v public.voices%rowtype;
begin
  select * into a from public.voice_actors
  where username = p_username and password = p_password and is_active = true;
  if not found then
    return null;
  end if;

  select * into v from public.voices
  where actor_id = a.id and is_active = true
  order by sort_order asc, created_at asc
  limit 1;

  return jsonb_build_object(
    'actor_id', a.id,
    'username', a.username,
    'display_name', a.display_name,
    'voice_id', v.id,
    'voice_name', v.display_name,
    'voice_slug', v.slug,
    'name_chosen', coalesce(v.name_chosen, true),
    'category', v.category,
    'intro_text', v.intro_text,
    'intro_status', v.intro_status,
    'intro_redo_reason', v.intro_redo_reason,
    'from_stage', v.from_stage,
    'to_stage', v.to_stage
  );
end;
$$;

comment on function public.authenticate_actor(text, text) is
  'Voice-actor sign-in (username + password). Returns the actor and their active voice, or null. Mirrors authenticate_student.';

grant execute on function public.authenticate_actor(text, text) to anon, authenticated;

-- ------------------------------------------------- first-login voice naming
-- On their first login the actor chooses the name of their voice
-- (e.g. 'Amy'). It can be chosen ONCE: once name_chosen is set, this
-- RPC refuses, and only the admin can rename the voice afterwards
-- (from the dashboard). The storage slug is derived from the name,
-- with a numeric suffix if another voice already uses it. Naming
-- happens before any recording, so deriving the slug here is safe.
create or replace function public.set_voice_name(
  p_actor_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.voices%rowtype;
  clean_name text;
  base_slug text;
  final_slug text;
  suffix integer := 2;
begin
  clean_name := trim(p_name);
  if clean_name = '' or length(clean_name) > 40 then
    return jsonb_build_object('error', 'invalid_name');
  end if;

  select * into v from public.voices
  where actor_id = p_actor_id and is_active = true
  order by sort_order asc, created_at asc
  limit 1;
  if not found then
    return jsonb_build_object('error', 'no_voice');
  end if;
  if v.name_chosen then
    return jsonb_build_object('error', 'already_chosen');
  end if;

  base_slug := regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'voice';
  end if;
  final_slug := base_slug;
  while exists (select 1 from public.voices where slug = final_slug and id <> v.id) loop
    final_slug := base_slug || '-' || suffix;
    suffix := suffix + 1;
  end loop;

  update public.voices
  set display_name = clean_name,
      slug = final_slug,
      name_chosen = true,
      -- Keep a not-yet-recorded introduction in step with the name:
      -- the default script embeds the old (placeholder) name.
      intro_text = case
        when v.intro_status = 'pending' and position(v.display_name in v.intro_text) > 0
        then replace(v.intro_text, v.display_name, clean_name)
        else v.intro_text
      end
  where id = v.id;

  return jsonb_build_object(
    'ok', true,
    'voice_name', clean_name,
    'voice_slug', final_slug
  );
end;
$$;

comment on function public.set_voice_name(uuid, text) is
  'First-login voice naming: the actor chooses their voice''s name once; only the admin can rename it afterwards.';

grant execute on function public.set_voice_name(uuid, text) to anon, authenticated;

-- ------------------------------------------------- actor queue
-- Returns the actor's progress counts and their next line: lines sent back
-- for re-recording come first, then the lowest unrecorded line in the
-- voice's category and stage window. "Done" for a line means THIS voice
-- has a recording with status submitted or approved.
create or replace function public.get_actor_next(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.voices%rowtype;
  total_count integer;
  done_count integer;
  approved_count integer;
  submitted_count integer;
  redo_count integer;
  nxt record;
begin
  select * into v from public.voices
  where actor_id = p_actor_id and is_active = true
  order by sort_order asc, created_at asc
  limit 1;
  if not found then
    return jsonb_build_object('error', 'no_voice');
  end if;

  select count(*) into total_count
  from public.voice_lines l
  where l.category = v.category and l.stage between v.from_stage and v.to_stage;

  select
    count(*) filter (where r.status in ('submitted', 'approved')),
    count(*) filter (where r.status = 'approved'),
    count(*) filter (where r.status = 'submitted'),
    count(*) filter (where r.status = 'redo')
  into done_count, approved_count, submitted_count, redo_count
  from public.voice_recordings r
  where r.voice_id = v.id;

  -- Next line: redo first, then lowest unrecorded.
  select l.id, l.text, l.type, l.ref, l.note, r.redo_reason, (r.id is not null) as is_redo
  into nxt
  from public.voice_lines l
  left join public.voice_recordings r
    on r.line_id = l.id and r.voice_id = v.id
  where l.category = v.category
    and l.stage between v.from_stage and v.to_stage
    and (r.id is null or r.status = 'redo')
  order by (case when r.status = 'redo' then 0 else 1 end),
           l.stage asc, l.module asc, l.lesson asc, l.id asc
  limit 1;

  return jsonb_build_object(
    'voice_id', v.id,
    'voice_name', v.display_name,
    'category', v.category,
    'intro_status', v.intro_status,
    'total', total_count,
    'done', coalesce(done_count, 0),
    'approved', coalesce(approved_count, 0),
    'submitted', coalesce(submitted_count, 0),
    'redo', coalesce(redo_count, 0),
    'next', case when nxt.id is null then null else jsonb_build_object(
      'line_id', nxt.id,
      'text', nxt.text,
      'type', nxt.type,
      'ref', nxt.ref,
      'note', nxt.note,
      'is_redo', nxt.is_redo,
      'redo_reason', nxt.redo_reason
    ) end
  );
end;
$$;

comment on function public.get_actor_next(uuid) is
  'Voice Studio queue for one actor: progress counts + next line to record (redo lines first). Client-asserted actor id, same model as authenticate_student.';

grant execute on function public.get_actor_next(uuid) to anon, authenticated;

-- ------------------------------------------------- submit a line recording
-- The client uploads the audio file to the voice-recordings bucket first,
-- then registers it here. Upserts the (line, voice) row as 'submitted'.
create or replace function public.submit_recording(
  p_actor_id uuid,
  p_line_id integer,
  p_storage_path text,
  p_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.voices%rowtype;
  r public.voice_recordings%rowtype;
begin
  select * into v from public.voices
  where actor_id = p_actor_id and is_active = true
  order by sort_order asc, created_at asc
  limit 1;
  if not found then
    return jsonb_build_object('error', 'no_voice');
  end if;

  insert into public.voice_recordings
    (line_id, voice_id, actor_id, storage_path, status, redo_reason, take_count, duration_ms, updated_at, reviewed_at)
  values
    (p_line_id, v.id, p_actor_id, p_storage_path, 'submitted', null, 1, p_duration_ms, now(), null)
  on conflict (line_id, voice_id) do update
    set storage_path = excluded.storage_path,
        status = 'submitted',
        redo_reason = null,
        take_count = public.voice_recordings.take_count + 1,
        duration_ms = excluded.duration_ms,
        actor_id = p_actor_id,
        updated_at = now(),
        reviewed_at = null
  returning * into r;

  return jsonb_build_object('recording_id', r.id, 'take_count', r.take_count);
end;
$$;

comment on function public.submit_recording(uuid, integer, text, integer) is
  'Registers an uploaded line recording for the actor''s voice as submitted (awaiting admin review). Re-submitting a redo line bumps take_count.';

grant execute on function public.submit_recording(uuid, integer, text, integer) to anon, authenticated;

-- ------------------------------------------------- submit the intro
create or replace function public.submit_intro(
  p_actor_id uuid,
  p_storage_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.voices%rowtype;
begin
  select * into v from public.voices
  where actor_id = p_actor_id and is_active = true
  order by sort_order asc, created_at asc
  limit 1;
  if not found then
    return jsonb_build_object('error', 'no_voice');
  end if;

  update public.voices
  set intro_path = p_storage_path,
      intro_status = 'submitted',
      intro_redo_reason = null
  where id = v.id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.submit_intro(uuid, text) is
  'Registers the actor''s uploaded introduction recording for their voice (awaiting admin review).';

grant execute on function public.submit_intro(uuid, text) to anon, authenticated;

-- ------------------------------------------------- admin review helpers
-- Progress board for the admin panel: one row per voice.
create or replace function public.get_voice_progress()
returns table (
  voice_id uuid,
  voice_name text,
  category text,
  actor_username text,
  intro_status text,
  total_lines bigint,
  recorded bigint,
  approved bigint,
  submitted bigint,
  redo bigint
)
language sql
security definer
set search_path = public
as $$
  select
    v.id,
    v.display_name,
    v.category,
    a.username,
    v.intro_status,
    (select count(*) from public.voice_lines l
       where l.category = v.category and l.stage between v.from_stage and v.to_stage),
    (select count(*) from public.voice_recordings r
       where r.voice_id = v.id and r.status in ('submitted', 'approved')),
    (select count(*) from public.voice_recordings r
       where r.voice_id = v.id and r.status = 'approved'),
    (select count(*) from public.voice_recordings r
       where r.voice_id = v.id and r.status = 'submitted'),
    (select count(*) from public.voice_recordings r
       where r.voice_id = v.id and r.status = 'redo')
  from public.voices v
  left join public.voice_actors a on a.id = v.actor_id
  where public.is_admin()
  order by v.sort_order asc, v.created_at asc;
$$;

comment on function public.get_voice_progress() is
  'Admin Voice Studio progress board. Returns rows only for super_admin callers.';

grant execute on function public.get_voice_progress() to authenticated;

-- ------------------------------------------------- playback lookup
-- The lesson player asks: for this exact line text and category, which
-- APPROVED recording should play? The student's preferred voice wins;
-- otherwise the first active voice (by sort order) that has one.
create or replace function public.get_voice_line_audio(
  p_text text,
  p_category text,
  p_voice_id uuid default null
)
returns text
language sql
security definer
set search_path = public
as $$
  select r.storage_path
  from public.voice_lines l
  join public.voice_recordings r on r.line_id = l.id and r.status = 'approved'
  join public.voices v on v.id = r.voice_id and v.is_active = true
  where l.text = p_text and l.category = p_category
  order by (r.voice_id = p_voice_id) desc, v.sort_order asc, v.created_at asc
  limit 1;
$$;

comment on function public.get_voice_line_audio(text, text, uuid) is
  'Playback resolution: storage path of the approved recording for a line, preferring the student''s chosen voice. Null means fall back to device TTS.';

grant execute on function public.get_voice_line_audio(text, text, uuid) to anon, authenticated;

-- ------------------------------------------------- student voice prefs
create or replace function public.set_voice_pref(
  p_student_id uuid,
  p_student_kind text,
  p_category text,
  p_voice_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_category not in ('M1', 'F1', 'B1', 'G1') then
    return false;
  end if;

  if p_student_kind = 'sub_account' then
    update public.sub_accounts
    set voice_prefs = voice_prefs || jsonb_build_object(p_category, p_voice_id)
    where id = p_student_id and is_active = true;
  else
    update public.user_profiles
    set voice_prefs = voice_prefs || jsonb_build_object(p_category, p_voice_id)
    where id = p_student_id;
  end if;
  return found;
end;
$$;

comment on function public.set_voice_pref(uuid, text, text, uuid) is
  'Stores the student''s chosen named voice for one category. Client-asserted identity, same model as set_placement.';

grant execute on function public.set_voice_pref(uuid, text, text, uuid) to anon, authenticated;
