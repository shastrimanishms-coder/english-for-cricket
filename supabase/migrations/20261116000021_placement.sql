-- ============================================================================
-- Migration 21: placement test result ("Find Your Start")
--
-- Stores the recommended starting stage/module from the placement
-- test on both student kinds. The test never locks anything — this is
-- advice the learner (and their manager) can see, and a manager can
-- clear it to let the student re-take the test fresh.
-- ============================================================================

alter table public.user_profiles
  add column if not exists placement_stage integer,
  add column if not exists placement_module_id uuid references public.curriculum_modules(id) on delete set null,
  add column if not exists placement_taken_at timestamptz;

alter table public.sub_accounts
  add column if not exists placement_stage integer,
  add column if not exists placement_module_id uuid references public.curriculum_modules(id) on delete set null,
  add column if not exists placement_taken_at timestamptz;

create or replace function public.set_placement(
  p_student_id uuid,
  p_student_kind text,
  p_stage integer,
  p_module_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_kind = 'sub_account' then
    update public.sub_accounts
    set placement_stage = p_stage,
        placement_module_id = p_module_id,
        placement_taken_at = now()
    where id = p_student_id and is_active = true;
  else
    update public.user_profiles
    set placement_stage = p_stage,
        placement_module_id = p_module_id,
        placement_taken_at = now()
    where id = p_student_id;
  end if;
  return found;
end;
$$;

comment on function public.set_placement(uuid, text, integer, uuid) is
  'Stores a placement-test recommendation. Client-asserted identity, same model as authenticate_student.';

grant execute on function public.set_placement(uuid, text, integer, uuid) to anon, authenticated;
