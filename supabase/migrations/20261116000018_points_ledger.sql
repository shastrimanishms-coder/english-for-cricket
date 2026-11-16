-- ============================================================================
-- Migration 18: XP & Stars points ledger
--
-- One append-only ledger for every reward in the app. XP is never spent
-- (it drives the learner's level: Rookie -> Player -> Captain -> MVP);
-- Stars are the collectible credit (red words fixed, recommended extras,
-- study days). Awards go through award_points(), which is idempotent
-- per (student, kind, ref_id): finishing the same lesson twice, or
-- fixing the same red word twice in one lesson, never double-pays.
-- Client-asserted student identity, same trust model as
-- authenticate_student / update_student_study_days (PIN students have
-- no Supabase session to attach).
-- ============================================================================

create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  student_kind text not null,
  kind text not null,
  xp integer not null default 0,
  stars integer not null default 0,
  ref_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists point_events_dedupe
  on public.point_events (student_id, student_kind, kind, ref_id)
  where ref_id is not null;

create index if not exists point_events_student
  on public.point_events (student_id, student_kind);

alter table public.point_events enable row level security;

-- No direct student access: totals and awards flow through the RPCs.
drop policy if exists "admin_read_point_events" on public.point_events;
create policy "admin_read_point_events"
  on public.point_events
  for select
  to authenticated
  using (public.is_admin());

create or replace function public.award_points(
  p_student_id uuid,
  p_student_kind text,
  p_kind text,
  p_xp integer,
  p_stars integer,
  p_ref text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.point_events (student_id, student_kind, kind, xp, stars, ref_id)
  values (p_student_id, p_student_kind, p_kind, greatest(p_xp, 0), greatest(p_stars, 0), p_ref)
  on conflict do nothing;
end;
$$;

comment on function public.award_points(uuid, text, text, integer, integer, text) is
  'Awards XP/stars once per (student, kind, ref_id). Client-asserted identity, same model as authenticate_student.';

create or replace function public.get_point_totals(
  p_student_id uuid,
  p_student_kind text
)
returns table (xp bigint, stars bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(xp), 0), coalesce(sum(stars), 0)
  from public.point_events
  where student_id = p_student_id and student_kind = p_student_kind;
$$;

grant execute on function public.award_points(uuid, text, text, integer, integer, text) to anon, authenticated;
grant execute on function public.get_point_totals(uuid, text) to anon, authenticated;
