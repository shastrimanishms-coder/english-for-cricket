-- ============================================================================
-- 20261115000012_support_message_replies.sql
-- Stores the individual replies that make up a support conversation, so
-- the admin Messages inbox (HelpCenterManager) can show each sender's
-- messages and the admin's answers as one chronological thread instead
-- of a single flat list.
--
-- WHY A TABLE: until now a reply sent from the panel was only stamped
-- onto its support_messages row (replied_at / reply_text), which can
-- hold just ONE reply per message. Admin replies are stored here so a
-- conversation can hold many replies, in order. The replied_at /
-- reply_text columns on support_messages remain in use as the
-- latest-reply stamp (badges / quick markers), written alongside each
-- new row here.
--
-- ACCESS MODEL:
--   * SELECT / INSERT / DELETE: super_admin only, via public.is_admin()
--     (SECURITY DEFINER helper from migration 20261115000001) - exactly
--     the policy shape used for support_messages in
--     20261115000010. The inbox is an admin-only surface; senders never
--     read this table (their copies arrive by email).
--   * No UPDATE policy: replies are append-only; a wrong reply is
--     deleted and re-sent, never silently edited.
--   * Deleting a support_messages row cascades to its replies.
--   * Every policy is DROP IF EXISTS + CREATE, so re-running is safe.
-- ============================================================================

create table if not exists public.support_message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.support_messages(id) on delete cascade,
  author text not null default 'admin' check (author in ('admin', 'user')),
  body text not null,
  created_at timestamptz not null default now()
);

-- Thread timelines read one message's replies in time order.
create index if not exists support_message_replies_message_created_idx
  on public.support_message_replies (message_id, created_at);

alter table public.support_message_replies enable row level security;

-- ----------------------------------------------------------------------------
-- SELECT / INSERT / DELETE: super_admin only (the admin inbox). Mirrors
-- the "super_admin_*_support_messages" policies in 20261115000010.
-- ----------------------------------------------------------------------------

drop policy if exists "super_admin_select_support_message_replies" on public.support_message_replies;
create policy "super_admin_select_support_message_replies"
  on public.support_message_replies
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "super_admin_insert_support_message_replies" on public.support_message_replies;
create policy "super_admin_insert_support_message_replies"
  on public.support_message_replies
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "super_admin_delete_support_message_replies" on public.support_message_replies;
create policy "super_admin_delete_support_message_replies"
  on public.support_message_replies
  for delete
  to authenticated
  using (public.is_admin());
