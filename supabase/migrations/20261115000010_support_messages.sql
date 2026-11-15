-- ============================================================================
-- 20261115000010_support_messages.sql
-- Stores messages sent from the public Help & Support page contact form
-- (src/app/support.tsx, "Send us a message") so the admin can read and
-- manage them in the panel inbox (HelpCenterManager -> Messages).
--
-- WHY A TABLE: there is no email-sending service connected to this project,
-- so form submissions cannot be emailed anywhere yet. They are stored here
-- instead and read in the admin panel. When an email service is connected
-- later, a trigger / Edge Function can forward new rows without changing
-- the form.
--
-- ACCESS MODEL:
--   * INSERT: open to everyone (anon + authenticated) - the form is public.
--     The WITH CHECK applies basic sanity rules (non-blank name / email /
--     message, plausible email shape, sane length caps) so empty or junk
--     rows cannot be written through the API.
--   * SELECT / UPDATE / DELETE: super_admin only, via public.is_admin()
--     (SECURITY DEFINER helper from migration 20261115000001, re-created in
--     20261115000004) - the same policy shape used for every other CMS
--     table. Nobody else can read the inbox: visitors cannot see each
--     other's messages, and submitters get no read-back.
--   * Every policy is DROP IF EXISTS + CREATE, so re-running is safe.
-- ============================================================================

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  -- Set when the admin replies from the panel inbox (HelpCenterManager):
  -- replied_at stamps the latest reply, reply_text stores what was sent.
  -- Written only through the super_admin UPDATE policy below.
  replied_at timestamptz,
  reply_text text
);

-- Inbox lists newest first.
create index if not exists support_messages_created_at_desc_idx
  on public.support_messages (created_at desc);

alter table public.support_messages enable row level security;

-- ----------------------------------------------------------------------------
-- INSERT: anyone may submit the contact form (public page, often logged
-- out). Sanity checks keep out blank fields, implausible emails and
-- oversized payloads.
-- ----------------------------------------------------------------------------

drop policy if exists "support_messages_insert_public" on public.support_messages;
create policy "support_messages_insert_public"
  on public.support_messages
  for insert
  to anon, authenticated
  with check (
    length(btrim(name)) > 0
    and length(btrim(email)) > 0
    and email like '%@%.%'
    and length(btrim(message)) > 0
    and length(name) <= 120
    and length(email) <= 254
    and length(message) <= 5000
    and (subject is null or length(subject) <= 200)
    and is_read = false
  );

-- ----------------------------------------------------------------------------
-- SELECT / UPDATE / DELETE: super_admin only (the admin inbox). Mirrors the
-- "super_admin_all_<table>" grants in 20261115000004, split per command so
-- the public INSERT policy above stays the only other door.
-- ----------------------------------------------------------------------------

drop policy if exists "super_admin_select_support_messages" on public.support_messages;
create policy "super_admin_select_support_messages"
  on public.support_messages
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "super_admin_update_support_messages" on public.support_messages;
create policy "super_admin_update_support_messages"
  on public.support_messages
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "super_admin_delete_support_messages" on public.support_messages;
create policy "super_admin_delete_support_messages"
  on public.support_messages
  for delete
  to authenticated
  using (public.is_admin());
