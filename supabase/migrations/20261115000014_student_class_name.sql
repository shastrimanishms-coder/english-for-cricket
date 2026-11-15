-- Migration 14: class / group / team name for students
--
-- Requested 2026-11-15: when a school/org manager adds a student,
-- they can record the student's class, group or team (one free-text
-- field - schools say "Class 3-A", clubs say "U12 Team"). The admin
-- Users & Organizations view and the manager's Students and Progress
-- screens then group students under their class/group/team, each
-- group and each student collapsible.
--
-- Nullable on purpose: existing students simply have no class yet and
-- appear under a "No class / group yet" heading until one is set.
-- Safe to run once in the SQL Editor (no-op if re-run).

alter table public.sub_accounts
  add column if not exists class_name text;
