-- ============================================================================
-- Migration 20: extras completion read-back
--
-- Extra-credit awards (migration 18's point_events with kind extra_*)
-- double as the completion record for recommended extras: the award
-- exists exactly when the student did the thing. This RPC reads them
-- back per student for the lesson-complete recommendations and the
-- My Journey map. Client-asserted identity, same model as the other
-- student RPCs.
-- ============================================================================

create or replace function public.get_extra_completions(
  p_student_id uuid,
  p_student_kind text
)
returns table (kind text, ref_id text)
language sql
security definer
set search_path = public
as $$
  select kind, ref_id
  from public.point_events
  where student_id = p_student_id
    and student_kind = p_student_kind
    and kind in ('extra_game', 'extra_video', 'extra_download', 'extra_speaking', 'extra_reading')
    and ref_id is not null;
$$;

grant execute on function public.get_extra_completions(uuid, text) to anon, authenticated;
