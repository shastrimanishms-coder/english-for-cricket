-- Migration 33 (Round 80): clearing a voice preference.
--
-- set_voice_pref (migration 23) only ever SET a category's voice:
-- a student who picked a voice in Profile -> My Voices could change
-- it but never un-pick it. The picker now toggles: tapping the
-- chosen voice again calls the same RPC with p_voice_id = null.
-- With the old function body that stored {"M1": null} in
-- voice_prefs (which every reader already treats as "no choice"),
-- but the key lingered. This replacement REMOVES the key outright
-- when p_voice_id is null, so a cleared category is stored exactly
-- like a category that was never picked. Non-null behaviour is
-- unchanged from migration 23.

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
    if p_voice_id is null then
      update public.sub_accounts
      set voice_prefs = voice_prefs - p_category
      where id = p_student_id and is_active = true;
    else
      update public.sub_accounts
      set voice_prefs = voice_prefs || jsonb_build_object(p_category, p_voice_id)
      where id = p_student_id and is_active = true;
    end if;
  else
    if p_voice_id is null then
      update public.user_profiles
      set voice_prefs = voice_prefs - p_category
      where id = p_student_id;
    else
      update public.user_profiles
      set voice_prefs = voice_prefs || jsonb_build_object(p_category, p_voice_id)
      where id = p_student_id;
    end if;
  end if;
  return found;
end;
$$;

comment on function public.set_voice_pref(uuid, text, text, uuid) is
  'Stores the student''s chosen named voice for one category; a null p_voice_id clears the category back to no preference. Client-asserted identity, same model as set_placement.';

grant execute on function public.set_voice_pref(uuid, text, text, uuid) to anon, authenticated;
