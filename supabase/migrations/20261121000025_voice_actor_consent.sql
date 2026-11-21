-- ============================================================================
-- Migration 25: Voice Studio — first-login consent gate
--
-- WHAT THIS BUILDS (Shastri's design, agreed 2026-11-21):
--   Before a voice actor can choose a voice name or record anything,
--   they must read and accept the Voice Actor Privacy Policy and the
--   Voice Actor Terms and Conditions (wording in src/lib/voiceConsent.ts).
--   Acceptance is stored on the actor row with its date and the terms
--   version. An actor who declines has their account deleted
--   completely — actor row, their voice, and any recordings — exactly
--   as if the account had never been created, and is signed out.
--
--   authenticate_actor is recreated (same body as migration 23) with
--   two extra fields so the app can show the gate: consent_accepted
--   and consent_version. Actors who accepted an older version are
--   asked again when the app ships a newer CONSENT_VERSION (the app
--   compares the stored version itself).
--
-- RUN ORDER: after migration 23 (voice_studio). Additive only.
-- ============================================================================

alter table public.voice_actors
  add column if not exists consent_accepted_at timestamptz,
  add column if not exists consent_version text;

comment on column public.voice_actors.consent_accepted_at is
  'When the actor accepted the Voice Actor Privacy Policy + Terms (first-login consent gate, migration 25). Null = not yet accepted.';
comment on column public.voice_actors.consent_version is
  'Which version of the consent documents the actor accepted.';

-- ------------------------------------------------------- sign-in (+ consent)
-- Same body as migration 23, plus the two consent fields.
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
    'to_stage', v.to_stage,
    'consent_accepted', a.consent_accepted_at is not null,
    'consent_version', a.consent_version
  );
end;
$$;

comment on function public.authenticate_actor(text, text) is
  'Voice-actor sign-in (username + password). Returns the actor and their active voice, or null. Mirrors authenticate_student. Migration 25 adds consent_accepted / consent_version.';

grant execute on function public.authenticate_actor(text, text) to anon, authenticated;

-- ------------------------------------------------------------ record consent
create or replace function public.record_actor_consent(
  p_actor_id uuid,
  p_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.voice_actors
  set consent_accepted_at = now(),
      consent_version = p_version
  where id = p_actor_id and is_active = true;
  if not found then
    return jsonb_build_object('error', 'no_actor');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.record_actor_consent(uuid, text) is
  'Stores a voice actor''s acceptance of the Privacy Policy + Terms, with the accepted version. Called from the first-login consent gate.';

grant execute on function public.record_actor_consent(uuid, text) to anon, authenticated;

-- ----------------------------------------------------------- decline consent
-- Declining deletes the account completely: the actor's recordings,
-- their voice, and the actor row — as if never created. (Voices
-- reference actors ON DELETE SET NULL, so the voice must go first;
-- voice_recordings rows are removed explicitly rather than relying
-- on the cascade from voices.)
create or replace function public.decline_actor_consent(
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.voice_recordings
  where voice_id in (select id from public.voices where actor_id = p_actor_id);
  delete from public.voices where actor_id = p_actor_id;
  delete from public.voice_actors where id = p_actor_id;
  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.decline_actor_consent(uuid) is
  'A voice actor declined the Privacy Policy + Terms at the consent gate: delete their recordings, voice and actor account completely.';

grant execute on function public.decline_actor_consent(uuid) to anon, authenticated;
