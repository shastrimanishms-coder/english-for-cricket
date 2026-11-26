-- ============================================================================
-- Migration 38 (Round 85): multiple categories per content item,
-- ordered categories.
--
-- 1) categories.sort_order: display order WITHIN each sibling level of
--    the existing category tree (categories.parent_id, migration 17).
--    Display order everywhere is depth-first: parents in sort_order,
--    each followed by its subcategories in their sort_order.
--    Backfilled so the order Shastri already sees is preserved: the
--    five stage-name categories first, in stage order, then the rest
--    by name - per (type, parent) sibling group.
--
-- 2) public.content_categories: ONE generic join table for every
--    content type (games, reading, speaking, downloads, videos), so an
--    item can belong to up to 5 categories at once - e.g. a legend
--    keeps its stage category AND joins a "Legends" category.
--    Backfilled from the legacy category_id columns, which are KEPT
--    and stay synced (by the app's data layer) to the item's PRIMARY
--    category = its first membership in category display order, so
--    every existing reader keeps working unchanged.
--
-- 3) A trigger caps memberships at 5 per item (the admin UI enforces
--    the same cap; this is the backstop for direct SQL writes).
--
-- Everything is additive and re-run safe; the app falls back to the
-- legacy single category_id behaviour until this migration has run.
-- ============================================================================

-- 1) Ordered categories -------------------------------------------------------
alter table public.categories
  add column if not exists sort_order integer not null default 0;

-- Backfill only rows never ordered (sort_order = 0), so re-running
-- this migration after an admin has reordered categories by hand
-- does not clobber their order.
with ranked as (
  select
    id,
    row_number() over (
      partition by type, parent_id
      order by
        case name
          when 'The Foundation' then 1
          when 'The Rookie' then 2
          when 'The Player' then 3
          when 'The Strategist' then 4
          when 'The Captain' then 5
          else 6
        end,
        name
    ) as rn
  from public.categories
)
update public.categories c
set sort_order = r.rn * 10
from ranked r
where r.id = c.id
  and c.sort_order = 0;

-- 2) Generic membership join ---------------------------------------------------
create table if not exists public.content_categories (
  category_id uuid not null
    references public.categories(id) on delete cascade,
  content_type text not null
    check (content_type in ('games', 'reading', 'speaking', 'downloads', 'videos')),
  content_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (category_id, content_type, content_id)
);

create index if not exists content_categories_content_idx
  on public.content_categories (content_type, content_id);

alter table public.content_categories enable row level security;

-- Read: public, mirroring the content tables themselves (shelves are
-- readable by signed-out visitors too).
drop policy if exists "content_categories_public_read" on public.content_categories;
create policy "content_categories_public_read"
  on public.content_categories
  for select
  using (true);

-- Write: the same roles that may write the content tables
-- (super_admin via is_admin(), content_manager via can_edit_content()).
drop policy if exists "content_categories_editor_all" on public.content_categories;
create policy "content_categories_editor_all"
  on public.content_categories
  for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- 3) Max 5 categories per item (backstop) --------------------------------------
create or replace function public.enforce_content_category_cap()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.content_categories
    where content_type = new.content_type
      and content_id = new.content_id
  ) >= 5 then
    raise exception 'An item can belong to at most 5 categories.';
  end if;
  return new;
end;
$$;

drop trigger if exists content_categories_cap on public.content_categories;
create trigger content_categories_cap
  before insert on public.content_categories
  for each row execute function public.enforce_content_category_cap();

-- 4) Backfill memberships from the legacy category_id columns ------------------
insert into public.content_categories (category_id, content_type, content_id)
select category_id, 'games', id
from public.games
where category_id is not null
union all
select category_id, 'reading', id
from public.reading_stories
where category_id is not null
union all
select category_id, 'speaking', id
from public.speaking_scenarios
where category_id is not null
union all
select category_id, 'downloads', id
from public.downloads
where category_id is not null
union all
select category_id, 'videos', id
from public.video_lectures
where category_id is not null
on conflict do nothing;
