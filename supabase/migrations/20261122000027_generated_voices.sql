-- Migration 27: generated (cloud TTS) voices for English for Cricket.
-- Creates the five Azure-generated voices Shastri picked on 2026-11-22
-- (Ryan + Thomas for M1, Olivia + Mia + Emily for F1) as ordinary named
-- voices, plus a key-gated function the library builder uses to register
-- each generated recording as born approved. Safe to run more than once.

insert into public.voices
  (slug, display_name, name_chosen, category, actor_id, intro_text, intro_path, intro_status, from_stage, to_stage, is_active, sort_order)
values
  ('ryan', 'Ryan', true, 'M1', null, 'Hello! My name is Ryan. I will be one of your English voices. Listen to me in your lessons, and let us learn English together!', 'ryan/intro.mp3', 'approved', 1, 5, true, 10),
  ('thomas', 'Thomas', true, 'M1', null, 'Hello! My name is Thomas. I will be one of your English voices. Listen to me in your lessons, and let us learn English together!', 'thomas/intro.mp3', 'approved', 1, 5, true, 20),
  ('olivia', 'Olivia', true, 'F1', null, 'Hello! My name is Olivia. I will be one of your English voices. Listen to me in your lessons, and let us learn English together!', 'olivia/intro.mp3', 'approved', 1, 5, true, 10),
  ('mia', 'Mia', true, 'F1', null, 'Hello! My name is Mia. I will be one of your English voices. Listen to me in your lessons, and let us learn English together!', 'mia/intro.mp3', 'approved', 1, 5, true, 20),
  ('emily', 'Emily', true, 'F1', null, 'Hello! My name is Emily. I will be one of your English voices. Listen to me in your lessons, and let us learn English together!', 'emily/intro.mp3', 'approved', 1, 5, true, 30)
on conflict (slug) do nothing;

create or replace function public.register_generated_recording(
  p_key text, p_line_id integer, p_voice_slug text, p_storage_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voice uuid;
  v_id uuid;
begin
  if p_key is distinct from 'e398d41f5fa5be1da402a66041abc3b29eaab39cacb41967' then
    return jsonb_build_object('error', 'bad_key');
  end if;
  select id into v_voice from public.voices where slug = p_voice_slug;
  if v_voice is null then
    return jsonb_build_object('error', 'no_voice');
  end if;
  insert into public.voice_recordings
    (line_id, voice_id, actor_id, storage_path, status, reviewed_at)
  values
    (p_line_id, v_voice, null, p_storage_path, 'approved', now())
  on conflict (line_id, voice_id) do update
    set storage_path = excluded.storage_path,
        status = 'approved',
        reviewed_at = now()
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

revoke all on function public.register_generated_recording(text, integer, text, text) from public;
grant execute on function public.register_generated_recording(text, integer, text, text) to anon, authenticated;
