-- ============================================================================
-- 20261115000006_lesson_completions.sql
-- Creates public.lesson_completions: one row per finished lesson attempt,
-- written by the lesson player (src/app/lesson/[id].tsx) on completion.
--
-- WHY: until now nothing recorded that a student finished a lesson, so the
-- manager progress dashboard's "Lessons" and "Accuracy" figures had no data
-- source. This table is that source (the player also writes an
-- activity_logs row with activity_type = 'lesson_slide').
--
-- IDENTITY MODEL: students exist in two identity spaces in this app -
--   * email learners: student_kind = 'auth',        student_id = auth.users.id
--   * PIN students:   student_kind = 'sub_account', student_id = sub_accounts.id
-- student_kind discriminates the two so reports never mix the id spaces
-- (the exact bug that made UsersManager's stats permanently zero).
--
-- >>> INSERT TRUST MODEL - READ BEFORE RUNNING <<<
-- PIN students have NO Supabase session (their "login" is the
-- authenticate_student RPC returning a payload the app stores locally).
-- They therefore cannot present a JWT, and no RLS policy can verify an
-- insert's student_id against a caller identity. The INSERT policy below
-- is consequently `with check (true)` for anon + authenticated: inserts
-- are CLIENT-ASSERTED for PIN students, exactly like the existing
-- authenticate_student trust pattern (an anon-callable function that
-- trusts the caller to identify the student). This is a deliberate mirror
-- of the app's existing model for young children with PIN logins - the
-- data at stake is lesson scores, not credentials or personal data.
-- If that ever stops being acceptable, the fix is a SECURITY DEFINER
-- log_lesson_completion(...) RPC that validates the student's PIN
-- server-side before inserting (planned Phase 2, alongside the matching
-- fix for activity_logs inserts by PIN students).
--
-- SELECT policies are strict:
--   * an auth learner sees only their own rows;
--   * a manager sees rows for students in their own organization(s)
--     (sub_accounts.organization_id -> organizations.manager_id);
--   * a super_admin sees everything (public.is_admin(), see file 1/4).
-- No UPDATE/DELETE policies: completion records are append-only from the
-- app; corrections happen in the dashboard if ever needed.
--
-- The lesson player fails soft until this file is run: it catches the
-- insert error and still shows the completion screen.
-- ============================================================================

create table if not exists public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  student_kind text not null check (student_kind in ('auth', 'sub_account')),
  lesson_id uuid not null references public.curriculum_lessons (id) on delete cascade,
  module_id uuid references public.curriculum_modules (id) on delete set null,
  score_correct integer not null default 0,
  score_total integer not null default 0,
  duration_seconds integer not null default 0,
  completed_at timestamptz not null default now()
);

comment on table public.lesson_completions is
  'One row per completed lesson attempt, written by the lesson player. student_kind discriminates auth users (auth) from PIN students (sub_account).';

create index if not exists lesson_completions_student_idx
  on public.lesson_completions (student_id, student_kind);
create index if not exists lesson_completions_lesson_idx
  on public.lesson_completions (lesson_id);
create index if not exists lesson_completions_module_idx
  on public.lesson_completions (module_id);

alter table public.lesson_completions enable row level security;

-- INSERT: client-asserted (see trust-model note in the header).
drop policy if exists "lesson_completions_insert_client_asserted" on public.lesson_completions;
create policy "lesson_completions_insert_client_asserted"
  on public.lesson_completions
  for insert
  to anon, authenticated
  with check (true);

-- SELECT: the student themselves (email learners).
drop policy if exists "lesson_completions_select_own_auth" on public.lesson_completions;
create policy "lesson_completions_select_own_auth"
  on public.lesson_completions
  for select
  to authenticated
  using (student_kind = 'auth' and student_id = auth.uid());

-- SELECT: the owning manager (PIN students in their organization).
drop policy if exists "lesson_completions_select_manager" on public.lesson_completions;
create policy "lesson_completions_select_manager"
  on public.lesson_completions
  for select
  to authenticated
  using (
    student_kind = 'sub_account'
    and exists (
      select 1
      from public.sub_accounts sa
      join public.organizations o on o.id = sa.organization_id
      where sa.id = lesson_completions.student_id
        and o.manager_id = auth.uid()
    )
  );

-- SELECT: super_admin sees all rows.
drop policy if exists "lesson_completions_select_admin" on public.lesson_completions;
create policy "lesson_completions_select_admin"
  on public.lesson_completions
  for select
  to authenticated
  using (public.is_admin());
