-- Migration 26: read a student's Voice Studio voice preferences.
--
-- Voice preferences (which named voice a student chose for each
-- category: M1/F1/B1/G1) are stored as voice_prefs jsonb on
-- user_profiles and sub_accounts, and written through the
-- set_voice_pref RPC (migration 23). Email learners can read their own
-- profile row, but PIN students (sub_accounts) cannot read their row
-- directly - the same gap migration 24 closed for study days. Lesson
-- playback needs the preferences to ask get_voice_line_audio for the
-- student's chosen voice, so this adds the matching read RPC with the
-- same client-asserted identity model as set_voice_pref.

create or replace function public.get_voice_prefs(
  p_student_id uuid,
  p_student_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefs jsonb;
begin
  if p_student_kind = 'sub_account' then
    select voice_prefs into v_prefs
    from public.sub_accounts
    where id = p_student_id and is_active = true;
  else
    select voice_prefs into v_prefs
    from public.user_profiles
    where id = p_student_id;
  end if;
  return coalesce(v_prefs, '{}'::jsonb);
end;
$$;

comment on function public.get_voice_prefs(uuid, text) is
  'Returns a student''s Voice Studio voice preferences (category -> voice id). Client-asserted identity, same model as set_voice_pref.';

grant execute on function public.get_voice_prefs(uuid, text) to anon, authenticated;
