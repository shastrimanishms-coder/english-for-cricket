import { supabase } from './supabase';

// Round 85: multiple categories per content item.
//
// Data model (migration 38): ONE generic join table,
// public.content_categories (category_id, content_type, content_id),
// holds every membership for games, reading, speaking, downloads and
// videos. The legacy category_id column on each content table is KEPT
// and stays synced to the item's PRIMARY category - its first
// membership in category display order - so every older reader
// (grouping fallbacks, reports, card labels) keeps working.
//
// Category display order is depth-first over the existing category
// tree (categories.parent_id): parents in sort_order, each followed
// by its subcategories in their sort_order (ties broken by name).
//
// Everything here is fail-soft in the codebase's usual way: until
// migration 38 has run, the join table / sort_order column simply do
// not exist, reads fall back to the legacy category_id, and writes
// degrade to setting the legacy primary only.
//
// Round 88: 'workbooks' joins the type set. Workbook-engine games
// (engine 'workbook' - the Learning Path and textbook workbook games)
// are filed under their OWN category tree (categories.type =
// 'workbooks') with memberships recorded under content_type
// 'workbooks', while their rows stay in the games table - so
// CONTENT_TABLE maps 'workbooks' to 'games' for the legacy primary
// sync. Migration 39 extends the content_categories CHECK to permit
// the new value; until it runs, reads simply find no memberships
// (a CHECK never blocks a SELECT) and writes fail soft into the
// legacy-primary-only path below, exactly as before migration 38.

export type ContentType = 'games' | 'reading' | 'speaking' | 'downloads' | 'videos' | 'workbooks';

export const CONTENT_TABLE: Record<ContentType, string> = {
  games: 'games',
  reading: 'reading_stories',
  speaking: 'speaking_scenarios',
  downloads: 'downloads',
  videos: 'video_lectures',
  workbooks: 'games',
};

export const MAX_CATEGORIES_PER_ITEM = 5;

export interface CategoryNode {
  id: string;
  name: string;
  parent_id?: string | null;
  sort_order?: number | null;
}

/** Sibling order: sort_order first (0/unset sorts as 0), then name. */
function bySiblingOrder(a: CategoryNode, b: CategoryNode): number {
  const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  return d !== 0 ? d : a.name.localeCompare(b.name);
}

/**
 * Flatten a category set into display order: depth-first, parents
 * before their subcategories, siblings in sort_order. Categories
 * whose parent is not in the set are treated as roots. Cycle-safe.
 */
export function flattenCategoryTree(
  cats: CategoryNode[],
): { cat: CategoryNode; depth: number }[] {
  const ids = new Set(cats.map((c) => c.id));
  const childrenOf = new Map<string, CategoryNode[]>();
  const roots: CategoryNode[] = [];
  for (const c of cats) {
    if (c.parent_id && ids.has(c.parent_id)) {
      const list = childrenOf.get(c.parent_id) || [];
      list.push(c);
      childrenOf.set(c.parent_id, list);
    } else {
      roots.push(c);
    }
  }
  roots.sort(bySiblingOrder);
  for (const list of childrenOf.values()) list.sort(bySiblingOrder);

  const out: { cat: CategoryNode; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (cat: CategoryNode, depth: number) => {
    if (visited.has(cat.id)) return;
    visited.add(cat.id);
    out.push({ cat, depth });
    for (const child of childrenOf.get(cat.id) || []) walk(child, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  // Anything unreachable (a parent cycle) still shows, at depth 0.
  for (const c of [...cats].sort(bySiblingOrder)) {
    if (!visited.has(c.id)) walk(c, 0);
  }
  return out;
}

/** Category ids in display (depth-first) order. */
export function categoryDisplayOrder(cats: CategoryNode[]): string[] {
  return flattenCategoryTree(cats).map(({ cat }) => cat.id);
}

/** Order a set of category ids by display order (unknown ids last, stable). */
export function orderCategoryIds(ids: string[], cats: CategoryNode[]): string[] {
  const order = categoryDisplayOrder(cats);
  const rank = new Map(order.map((id, i) => [id, i] as const));
  return [...new Set(ids)].sort(
    (a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** The primary category of a selection: the first in display order. */
export function primaryCategoryId(ids: string[], cats: CategoryNode[]): string | null {
  const ordered = orderCategoryIds(ids, cats);
  return ordered.length > 0 ? ordered[0] : null;
}

/** A category plus every descendant subcategory id (for chip filtering). */
export function subtreeIds(cats: CategoryNode[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const c of cats) {
    if (c.parent_id) {
      const list = childrenOf.get(c.parent_id) || [];
      list.push(c.id);
      childrenOf.set(c.parent_id, list);
    }
  }
  const out = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const child of childrenOf.get(cur) || []) {
      if (!out.has(child)) {
        out.add(child);
        queue.push(child);
      }
    }
  }
  return out;
}

/**
 * Fetch one type's categories with the tree + order columns, falling
 * back to plainer column sets on older databases (no sort_order yet).
 */
export async function fetchCategoriesForType(type: ContentType): Promise<CategoryNode[]> {
  const columnSets = [
    'id, name, parent_id, sort_order',
    'id, name, parent_id',
    'id, name',
  ];
  for (const cols of columnSets) {
    const { data, error } = await supabase
      .from('categories')
      .select(cols)
      .eq('type', type)
      .order('name');
    if (!error && data) return data as unknown as CategoryNode[];
  }
  return [];
}

interface MembershipItem {
  id: string;
  category_id?: string | null;
}

/**
 * Membership map for a set of items: item id -> its category ids in
 * display order. Join-table rows are merged with the legacy
 * category_id (a legacy-only item still counts as a member of its
 * primary category), so the map is correct before and after the
 * migration, and for rows written by SQL packs that only set
 * category_id.
 */
export async function fetchMembershipMap(
  type: ContentType,
  items: MembershipItem[],
  cats: CategoryNode[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, Set<string>>();
  for (const item of items) {
    const set = new Set<string>();
    if (item.category_id) set.add(item.category_id);
    map.set(item.id, set);
  }

  try {
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('content_categories')
        .select('category_id, content_id')
        .eq('content_type', type)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = (data || []) as { category_id: string; content_id: string }[];
      for (const row of rows) {
        const set = map.get(row.content_id);
        if (set) set.add(row.category_id);
      }
      if (rows.length < pageSize) break;
    }
  } catch {
    // Join table not there yet (migration 38 not run): legacy-only map.
  }

  const ordered = new Map<string, string[]>();
  for (const [itemId, set] of map) {
    ordered.set(itemId, orderCategoryIds([...set], cats));
  }
  return ordered;
}

/** Write one item's full membership set + sync its legacy primary. */
async function writeMemberships(
  type: ContentType,
  itemId: string,
  categoryIds: string[],
  cats: CategoryNode[],
): Promise<void> {
  const unique = orderCategoryIds(categoryIds, cats);
  if (unique.length > MAX_CATEGORIES_PER_ITEM) {
    throw new Error(`An item can belong to at most ${MAX_CATEGORIES_PER_ITEM} categories.`);
  }

  try {
    const { error: delError } = await supabase
      .from('content_categories')
      .delete()
      .eq('content_type', type)
      .eq('content_id', itemId);
    if (delError) throw delError;
    if (unique.length > 0) {
      const { error: insError } = await supabase.from('content_categories').insert(
        unique.map((categoryId) => ({
          category_id: categoryId,
          content_type: type,
          content_id: itemId,
        })),
      );
      if (insError) throw insError;
    }
  } catch (e: any) {
    // Pre-migration database: the join write is skipped and the
    // legacy primary below still records the first category.
    if (!/content_categories|42P01|PGRST205/i.test(e?.message || '')) throw e;
  }

  const { error } = await supabase
    .from(CONTENT_TABLE[type])
    .update({ category_id: unique.length > 0 ? unique[0] : null })
    .eq('id', itemId);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Learner shelves
// ---------------------------------------------------------------------

export interface ShelfChip {
  key: string;
  label: string;
}

/**
 * Chips for a learner shelf: "All" plus one chip per category, in
 * depth-first display order, that has at least one of the shelf's
 * items — counting DESCENDANTS, so a parent category appears when
 * only its subcategory holds items. Chip keys are `cat:<id>`.
 */
export function buildShelfChips(
  categories: CategoryNode[],
  memberships: Map<string, string[]>,
  itemIds: string[],
): ShelfChip[] {
  const memberSets = itemIds.map((id) => new Set(memberships.get(id) ?? []));
  const chips: ShelfChip[] = [{ key: 'all', label: 'All' }];
  for (const { cat } of flattenCategoryTree(categories)) {
    const sub = subtreeIds(categories, cat.id);
    if (memberSets.some((set) => [...set].some((id) => sub.has(id)))) {
      chips.push({ key: `cat:${cat.id}`, label: cat.name });
    }
  }
  return chips;
}

/**
 * Whether an item belongs under a shelf chip: "All" matches
 * everything; a parent category's chip matches items filed under it
 * OR under any of its subcategories; a subcategory chip matches only
 * its own items.
 */
export function matchesShelfChip(
  categories: CategoryNode[],
  memberships: Map<string, string[]>,
  itemId: string,
  chipKey: string,
): boolean {
  if (chipKey === 'all') return true;
  const catId = chipKey.startsWith('cat:') ? chipKey.slice(4) : chipKey;
  const sub = subtreeIds(categories, catId);
  return (memberships.get(itemId) ?? []).some((id) => sub.has(id));
}

/** Replace an item's categories (admin edit form save). */
export async function setItemCategories(
  type: ContentType,
  itemId: string,
  categoryIds: string[],
  cats: CategoryNode[],
): Promise<void> {
  await writeMemberships(type, itemId, categoryIds, cats);
}

export interface BulkCategoryResult {
  changed: number;
  skippedAtCap: number;
  alreadyHad: number;
  notPresent: number;
  message: string;
}

/** Bulk ADD one category to many items, respecting the 5-cap. */
export async function bulkAddCategory(
  type: ContentType,
  itemIds: string[],
  categoryId: string,
  items: MembershipItem[],
  cats: CategoryNode[],
): Promise<BulkCategoryResult> {
  const current = await fetchMembershipMap(type, items, cats);
  let changed = 0;
  let skippedAtCap = 0;
  let alreadyHad = 0;
  for (const id of itemIds) {
    const set = current.get(id) || [];
    if (set.includes(categoryId)) {
      alreadyHad += 1;
    } else if (set.length >= MAX_CATEGORIES_PER_ITEM) {
      skippedAtCap += 1;
    } else {
      await writeMemberships(type, id, [...set, categoryId], cats);
      changed += 1;
    }
  }
  const parts = [`Category added to ${changed} item${changed === 1 ? '' : 's'}.`];
  if (alreadyHad > 0) parts.push(`${alreadyHad} already had it.`);
  if (skippedAtCap > 0) {
    parts.push(
      `${skippedAtCap} skipped - already in ${MAX_CATEGORIES_PER_ITEM} categories (the maximum).`,
    );
  }
  return { changed, skippedAtCap, alreadyHad, notPresent: 0, message: parts.join(' ') };
}

/** Bulk REMOVE one category from many items. */
export async function bulkRemoveCategory(
  type: ContentType,
  itemIds: string[],
  categoryId: string,
  items: MembershipItem[],
  cats: CategoryNode[],
): Promise<BulkCategoryResult> {
  const current = await fetchMembershipMap(type, items, cats);
  let changed = 0;
  let notPresent = 0;
  for (const id of itemIds) {
    const set = current.get(id) || [];
    if (!set.includes(categoryId)) {
      notPresent += 1;
    } else {
      await writeMemberships(
        type,
        id,
        set.filter((c) => c !== categoryId),
        cats,
      );
      changed += 1;
    }
  }
  const parts = [`Category removed from ${changed} item${changed === 1 ? '' : 's'}.`];
  if (notPresent > 0) parts.push(`${notPresent} did not have it.`);
  return { changed, skippedAtCap: 0, alreadyHad: 0, notPresent, message: parts.join(' ') };
}
