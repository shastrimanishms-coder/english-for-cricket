import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import AdminDropdown from './AdminDropdown';

// Round 76: shared list organiser for the admin content managers
// (Games, Smart Reading, Speaking Practice, Downloads, Videos).
// Every section gets the same behaviour:
//  - a search bar at the top that live-filters by title (and
//    description where an item has one); while searching, matches
//    show as one flat list, each labelled with its stage and
//    category so context is not lost, with a match count;
//  - otherwise items are grouped Stage -> Category under
//    tap-to-expand headers that all start collapsed (the same
//    pattern as Modules & Lessons), with Expand all / Collapse
//    all controls.
// Presentation only: the managers keep owning their data, editor
// forms and per-item rows - this component just arranges the rows,
// and collapsed groups never mount their item rows at all.

export interface ContentGroupStage {
  id: string;
  title: string;
}

export interface ContentGroupCategory {
  id: string;
  name: string;
}

interface GroupedContentListProps<T> {
  items: T[];
  /** Stages in display order. */
  stages: ContentGroupStage[];
  /** Categories in display order. */
  categories: ContentGroupCategory[];
  idOf: (item: T) => string;
  stageIdOf: (item: T) => string | null | undefined;
  categoryIdOf: (item: T) => string | null | undefined;
  /**
   * Round 85: when provided, ALL of an item's category memberships.
   * The item then appears under EACH of its categories in the grouped
   * view (counts are memberships), and search results label it with
   * every category. An empty list files it under "No category".
   * categoryIdOf stays as the legacy primary fallback.
   */
  categoryIdsOf?: (item: T) => string[] | null | undefined;
  /**
   * Round 89 (Part E): optional SECOND-level grouping override. When
   * both are provided, items are bucketed inside each stage group by
   * secondaryIdOf (one bucket per item) instead of by their category
   * memberships - the Workbooks manager groups Family -> Stage/Book
   * this way while its categories stay free for membership labels and
   * bulk assignment. Search labels still use categoryIdsOf.
   */
  secondaryGroups?: ContentGroupCategory[];
  secondaryIdOf?: (item: T) => string | null | undefined;
  /**
   * Round 89 (Part E): categories offered in the bulk-assign dropdown
   * when they differ from the grouping `categories` list. Defaults to
   * `categories`.
   */
  bulkCategories?: ContentGroupCategory[];
  titleOf: (item: T) => string;
  descriptionOf?: (item: T) => string | null | undefined;
  renderItem: (item: T, isLast: boolean) => React.ReactNode;
  /** Plural noun used in counts, e.g. "stories". */
  itemNoun?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /**
   * True (default): each stage group renders inside a white card,
   * suiting row-style lists. False: headers are standalone bars,
   * for sections whose items are cards of their own (Speaking).
   */
  framed?: boolean;
  /**
   * Round 78: bulk category assignment. When provided, every row
   * gains a checkbox and a selection toolbar appears ("N selected",
   * a category dropdown over the same `categories` list, Select all
   * visible, Clear, Assign). The selection lives in this component
   * keyed by item id, so it survives expanding/collapsing groups
   * and search filtering. The manager performs the actual update
   * (one .in('id', ids) update on its table) and refreshes its
   * items; it must throw on error so the toolbar can report it and
   * keep the selection. Permissions are the manager's own: whoever
   * can open the manager and edit an item can bulk-assign it.
   */
  bulkAssign?: {
    /**
     * Round 85 semantics: ADD the chosen category to every selected
     * item (existing memberships are kept). May return a feedback
     * message (e.g. reporting items skipped at the 5-category cap);
     * returning nothing keeps the default "assigned" message.
     */
    onAssign: (ids: string[], categoryId: string) => Promise<string | void>;
    /** Round 85: REMOVE the chosen category from every selected item. */
    onRemove?: (ids: string[], categoryId: string) => Promise<string | void>;
  };
}

interface CatGroup<T> {
  key: string;
  label: string;
  items: T[];
}

interface StageGroup<T> {
  key: string;
  label: string;
  total: number;
  cats: CatGroup<T>[];
}

const UNTAGGED_KEY = '__untagged';
const NO_CATEGORY_KEY = '__none';

// Last bulk-assign result message (Round 85): survives the remount
// every manager's refetch causes, so the admin actually sees it.
const lastBulkFeedback: { current: { ok: boolean; text: string } | null } = { current: null };
function rememberBulkFeedback(next: { ok: boolean; text: string } | null) {
  lastBulkFeedback.current = next;
}

export default function GroupedContentList<T>({
  items,
  stages,
  categories,
  idOf,
  stageIdOf,
  categoryIdOf,
  categoryIdsOf,
  secondaryGroups,
  secondaryIdOf,
  bulkCategories,
  titleOf,
  descriptionOf,
  renderItem,
  itemNoun = 'items',
  searchPlaceholder = 'Search by title…',
  emptyMessage = 'Nothing here yet.',
  framed = true,
  bulkAssign,
}: GroupedContentListProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Bulk-assign selection (Round 78): a Set of item ids, untouched
  // by group expand/collapse or by the search filter.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkMode, setBulkMode] = useState<'add' | 'remove'>('add');
  const [assigning, setAssigning] = useState(false);
  // Round 85: the bulk result message is ALSO kept in a module-level
  // slot (below) — every manager's refetch toggles its loading state,
  // which unmounts this list mid-assign and would otherwise take the
  // "added to N, skipped M" message with it before it is ever seen.
  const [feedback, setFeedbackState] = useState<{ ok: boolean; text: string } | null>(
    () => lastBulkFeedback.current,
  );
  const setFeedback = (next: { ok: boolean; text: string } | null) => {
    rememberBulkFeedback(next);
    setFeedbackState(next);
  };

  const toggleSelected = (id: string) => {
    setFeedback(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setFeedback(null);
  };

  const toggle = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const stageLabelOf = (item: T) => {
    const sid = stageIdOf(item) || null;
    if (!sid) return 'Untagged';
    return stages.find((s) => s.id === sid)?.title || 'Stage';
  };

  // Every category an item belongs to (Round 85 multi-membership);
  // falls back to the legacy primary when categoryIdsOf is absent.
  const catIdsOfItem = useCallback(
    (item: T): string[] => {
      if (categoryIdsOf) {
        return (categoryIdsOf(item) || []).filter(Boolean) as string[];
      }
      const cid = categoryIdOf(item) || null;
      return cid ? [cid] : [];
    },
    [categoryIdsOf, categoryIdOf],
  );

  const categoryLabelOf = (item: T) => {
    const ids = catIdsOfItem(item);
    if (ids.length === 0) return 'No category';
    return ids
      .map((id) => categories.find((c) => c.id === id)?.name || 'Category')
      .join(', ');
  };

  const searching = query.trim().length > 0;

  const matches = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (titleOf(item).toLowerCase().includes(q)) return true;
      const desc = descriptionOf ? descriptionOf(item) : null;
      return !!desc && desc.toLowerCase().includes(q);
    });
  }, [items, query, searching, titleOf, descriptionOf]);

  const groups = useMemo<StageGroup<T>[]>(() => {
    // Bucket items by stage, then by category inside each stage.
    const stageBuckets = new Map<string, { stageId: string | null; items: T[] }>();
    for (const item of items) {
      const sid = stageIdOf(item) || null;
      const key = sid ?? UNTAGGED_KEY;
      const bucket = stageBuckets.get(key) || { stageId: sid, items: [] };
      bucket.items.push(item);
      stageBuckets.set(key, bucket);
    }

    // Stage order: the given stage order first, then any stage ids
    // not in the list, with Untagged always last.
    const orderedStageKeys: string[] = [];
    for (const s of stages) {
      if (stageBuckets.has(s.id)) orderedStageKeys.push(s.id);
    }
    for (const key of stageBuckets.keys()) {
      if (key !== UNTAGGED_KEY && !orderedStageKeys.includes(key)) {
        orderedStageKeys.push(key);
      }
    }
    if (stageBuckets.has(UNTAGGED_KEY)) orderedStageKeys.push(UNTAGGED_KEY);

    // Round 89 (Part E): with a secondary grouping override, the
    // second level buckets by secondaryIdOf against secondaryGroups
    // and the empty bucket reads "Untagged"; otherwise the Round 85
    // category-membership bucketing below applies unchanged.
    const useSecondary = !!secondaryIdOf && !!secondaryGroups;
    const secondLevel = useSecondary ? secondaryGroups! : categories;
    const noneLabel = useSecondary ? 'Untagged' : 'No category';

    return orderedStageKeys.map((stageKey) => {
      const bucket = stageBuckets.get(stageKey)!;
      const catBuckets = new Map<string, { categoryId: string | null; items: T[] }>();
      for (const item of bucket.items) {
        if (useSecondary) {
          const sid = secondaryIdOf!(item) || null;
          const key = sid ?? NO_CATEGORY_KEY;
          const cb = catBuckets.get(key) || { categoryId: sid, items: [] };
          cb.items.push(item);
          catBuckets.set(key, cb);
          continue;
        }
        // Round 85: an item is filed under EACH of its categories
        // (exact memberships - a subcategory membership does not
        // also file it under the parent here); no memberships at
        // all files it under "No category".
        const ids = catIdsOfItem(item);
        if (ids.length === 0) {
          const cb = catBuckets.get(NO_CATEGORY_KEY) || { categoryId: null, items: [] };
          cb.items.push(item);
          catBuckets.set(NO_CATEGORY_KEY, cb);
        } else {
          for (const cid of ids) {
            const cb = catBuckets.get(cid) || { categoryId: cid, items: [] };
            cb.items.push(item);
            catBuckets.set(cid, cb);
          }
        }
      }

      // Second-level order: the given list order first, then any
      // unknown ids, with the empty bucket always last.
      const orderedCatKeys: string[] = [];
      for (const c of secondLevel) {
        if (catBuckets.has(c.id)) orderedCatKeys.push(c.id);
      }
      for (const key of catBuckets.keys()) {
        if (key !== NO_CATEGORY_KEY && !orderedCatKeys.includes(key)) {
          orderedCatKeys.push(key);
        }
      }
      if (catBuckets.has(NO_CATEGORY_KEY)) orderedCatKeys.push(NO_CATEGORY_KEY);

      return {
        key: stageKey,
        label:
          bucket.stageId === null
            ? 'Untagged'
            : stages.find((s) => s.id === bucket.stageId)?.title || 'Stage',
        total: bucket.items.length,
        cats: orderedCatKeys.map((ckey) => {
          const cb = catBuckets.get(ckey)!;
          return {
            key: `${stageKey}|${ckey}`,
            label:
              cb.categoryId === null
                ? noneLabel
                : secondLevel.find((c) => c.id === cb.categoryId)?.name || 'Category',
            items: cb.items,
          };
        }),
      };
    });
  }, [items, stages, categories, stageIdOf, catIdsOfItem, secondaryGroups, secondaryIdOf]);

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of groups) {
      next[g.key] = true;
      for (const c of g.cats) next[c.key] = true;
    }
    setOpen(next);
  };

  const collapseAll = () => setOpen({});

  // Ids of the rows currently on screen: the search matches while
  // searching, otherwise the items inside expanded groups.
  const visibleIds = useMemo(() => {
    if (!bulkAssign) return [];
    if (searching) return matches.map((item) => idOf(item));
    const ids: string[] = [];
    for (const g of groups) {
      if (!open[g.key]) continue;
      for (const c of g.cats) {
        if (!open[c.key]) continue;
        for (const item of c.items) ids.push(idOf(item));
      }
    }
    return ids;
  }, [bulkAssign, searching, matches, groups, open, idOf]);

  const selectAllVisible = () => {
    setFeedback(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const runBulkAssign = async () => {
    if (!bulkAssign || !bulkCategoryId || selectedIds.size === 0 || assigning) return;
    const removing = bulkMode === 'remove' && !!bulkAssign.onRemove;
    const ids = [...selectedIds];
    setAssigning(true);
    setFeedback(null);
    try {
      const result = removing
        ? await bulkAssign.onRemove!(ids, bulkCategoryId)
        : await bulkAssign.onAssign(ids, bulkCategoryId);
      setFeedback({
        ok: true,
        text:
          typeof result === 'string' && result
            ? result
            : removing
              ? `Category removed from ${ids.length} ${itemNoun}.`
              : `Category assigned to ${ids.length} ${itemNoun}.`,
      });
      setSelectedIds(new Set());
      setBulkCategoryId('');
    } catch (e: any) {
      setFeedback({
        ok: false,
        text: `Could not ${removing ? 'remove' : 'assign'} the category: ${e?.message || 'unknown error'}`,
      });
    } finally {
      setAssigning(false);
    }
  };

  // Row renderer: with bulk assignment on, each row is wrapped in a
  // flex row with a checkbox cell on the left; otherwise the
  // manager's row renders exactly as before.
  const renderRow = (item: T, isLast: boolean) => {
    if (!bulkAssign) return renderItem(item, isLast);
    const id = idOf(item);
    const checked = selectedIds.has(id);
    return (
      <View key={id} className="flex-row">
        <Pressable
          onPress={() => toggleSelected(id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          className="pl-4 pr-1 items-center justify-center"
        >
          <View
            className={`w-6 h-6 rounded-md border-2 items-center justify-center ${
              checked ? 'bg-gold border-gold-dark' : 'bg-white border-slate-300'
            }`}
          >
            {checked ? <Text className="text-navy font-bold text-sm">✓</Text> : null}
          </View>
        </Pressable>
        <View className="flex-1">{renderItem(item, isLast)}</View>
      </View>
    );
  };

  const renderStageHeader = (group: StageGroup<T>, expanded: boolean) => (
    <Pressable
      onPress={() => toggle(group.key)}
      className={
        framed
          ? 'flex-row items-center justify-between px-4 py-3.5 bg-slate-50 border-b border-inkline'
          : 'flex-row items-center justify-between px-4 py-3.5 bg-slate-50 border border-inkline rounded-xl'
      }
    >
      <Text className="font-display font-semibold text-navy">
        {expanded ? '▾' : '▸'}  {group.label}
        <Text className="font-sans text-slate-400 font-normal text-sm">
          {'   ·   '}
          {group.total} {itemNoun}
        </Text>
      </Text>
      <Text className="text-xs font-bold text-gold-dark uppercase tracking-wider">
        {expanded ? 'Hide' : 'Show'}
      </Text>
    </Pressable>
  );

  const renderCategoryHeader = (group: CatGroup<T>, expanded: boolean) => (
    <Pressable
      onPress={() => toggle(group.key)}
      className={
        framed
          ? 'flex-row items-center justify-between pl-8 pr-4 py-2.5 bg-slate-100 border-b border-inkline'
          : 'flex-row items-center justify-between ml-4 px-4 py-2.5 bg-slate-100 border border-inkline rounded-lg'
      }
    >
      <Text className="font-sans font-bold text-text-secondary text-sm">
        {expanded ? '▾' : '▸'}  {group.label}
        <Text className="text-slate-400 font-normal">
          {'   ·   '}
          {group.items.length} {itemNoun}
        </Text>
      </Text>
      <Text className="text-[11px] font-bold text-gold-dark uppercase tracking-wider">
        {expanded ? 'Hide' : 'Show'}
      </Text>
    </Pressable>
  );

  return (
    <View className="gap-4">
      {/* Search bar + expand/collapse controls */}
      <View className="flex-col md:flex-row gap-3 md:items-center">
        <View className="flex-1 flex-row items-center bg-white border border-inkline rounded-xl pl-4 pr-2">
          <Text className="text-base">🔍</Text>
          <TextInput
            className="flex-1 py-3 px-2"
            placeholder={searchPlaceholder}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} className="px-3 py-2">
              <Text className="text-slate-400 font-bold">✕</Text>
            </Pressable>
          ) : null}
        </View>
        {!searching && items.length > 0 ? (
          <View className="flex-row gap-2">
            <Pressable
              onPress={expandAll}
              className="px-3 py-2 bg-white rounded-full border border-inkline"
            >
              <Text className="text-navy text-sm font-semibold">Expand all</Text>
            </Pressable>
            <Pressable
              onPress={collapseAll}
              className="px-3 py-2 bg-white rounded-full border border-inkline"
            >
              <Text className="text-navy text-sm font-semibold">Collapse all</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Bulk category assignment (Round 78) */}
      {bulkAssign ? (
        selectedIds.size === 0 && !feedback ? (
          <Text className="text-sm text-slate-400">
            {bulkAssign.onRemove
              ? 'Tick items to add or remove a category for many at once.'
              : 'Tick items to assign a category to many at once.'}
          </Text>
        ) : (
          <View className="bg-white border border-gold/60 rounded-2xl p-4 gap-3 shadow-sm">
            <View className="flex-row items-center justify-between gap-3 flex-wrap">
              <Text className="font-sans font-bold text-navy">
                {selectedIds.size} selected
              </Text>
              {feedback ? (
                <Text className={`font-sans text-sm font-semibold ${feedback.ok ? 'text-green-700' : 'text-red-600'}`}>
                  {feedback.ok ? '✓ ' : ''}{feedback.text}
                </Text>
              ) : null}
            </View>
            {bulkAssign.onRemove ? (
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setBulkMode('add')}
                  className={`px-4 py-2 rounded-full border ${bulkMode === 'add' ? 'bg-navy border-navy' : 'bg-white border-inkline'}`}
                >
                  <Text className={`text-sm font-semibold ${bulkMode === 'add' ? 'text-gold-light' : 'text-navy'}`}>
                    Add category
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setBulkMode('remove')}
                  className={`px-4 py-2 rounded-full border ${bulkMode === 'remove' ? 'bg-navy border-navy' : 'bg-white border-inkline'}`}
                >
                  <Text className={`text-sm font-semibold ${bulkMode === 'remove' ? 'text-gold-light' : 'text-navy'}`}>
                    Remove category
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View className="flex-col lg:flex-row gap-3 lg:items-start">
              <View className="flex-1 min-w-[220px]">
                <AdminDropdown
                  value={bulkCategoryId}
                  onChange={setBulkCategoryId}
                  options={(bulkCategories ?? categories).map((c) => ({ id: c.id, label: c.name }))}
                  placeholder="Choose a category…"
                  noneLabel="Choose a category…"
                />
              </View>
              <View className="flex-row gap-2 flex-wrap">
                <Pressable
                  onPress={selectAllVisible}
                  className="px-4 py-3 bg-white rounded-full border border-inkline"
                >
                  <Text className="text-navy text-sm font-semibold">Select all visible</Text>
                </Pressable>
                <Pressable
                  onPress={clearSelection}
                  className="px-4 py-3 bg-white rounded-full border border-inkline"
                >
                  <Text className="text-navy text-sm font-semibold">Clear</Text>
                </Pressable>
                <Pressable
                  onPress={runBulkAssign}
                  disabled={!bulkCategoryId || selectedIds.size === 0 || assigning}
                  className={`px-5 py-3 rounded-full border-b-4 border-gold-dark bg-gold ${
                    !bulkCategoryId || selectedIds.size === 0 || assigning ? 'opacity-50' : ''
                  }`}
                >
                  <Text className="text-navy text-sm font-bold">
                    {assigning
                      ? bulkMode === 'remove' && bulkAssign.onRemove
                        ? 'Removing…'
                        : 'Assigning…'
                      : bulkMode === 'remove' && bulkAssign.onRemove
                        ? 'Remove'
                        : 'Assign'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )
      ) : null}

      {searching ? (
        <>
          <Text className="text-sm text-slate-500">
            {matches.length} {itemNoun} matching &quot;{query.trim()}&quot;
          </Text>
          {matches.length === 0 ? (
            <View className="bg-white rounded-2xl border border-inkline shadow-sm p-8 items-center">
              <Text className="text-slate-500">
                No {itemNoun} match &quot;{query.trim()}&quot;.
              </Text>
            </View>
          ) : framed ? (
            <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
              {matches.map((item, i) => (
                <View key={idOf(item)}>
                  <View className="px-4 pt-3">
                    <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {stageLabelOf(item)} · {categoryLabelOf(item)}
                    </Text>
                  </View>
                  {renderRow(item, i === matches.length - 1)}
                </View>
              ))}
            </View>
          ) : (
            <View className="gap-4">
              {matches.map((item) => (
                <View key={idOf(item)} className="gap-1.5">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {stageLabelOf(item)} · {categoryLabelOf(item)}
                  </Text>
                  {renderRow(item, true)}
                </View>
              ))}
            </View>
          )}
        </>
      ) : items.length === 0 ? (
        <View className="bg-white rounded-2xl border border-inkline shadow-sm p-8 items-center">
          <Text className="text-slate-500">{emptyMessage}</Text>
        </View>
      ) : (
        groups.map((group) => {
          const stageOpen = !!open[group.key];
          const body = stageOpen
            ? group.cats.map((cat) => {
                const catOpen = !!open[cat.key];
                return (
                  <View key={cat.key} className={framed ? undefined : 'gap-3'}>
                    {renderCategoryHeader(cat, catOpen)}
                    {catOpen
                      ? cat.items.map((item, i) =>
                          renderRow(item, i === cat.items.length - 1),
                        )
                      : null}
                  </View>
                );
              })
            : null;
          return framed ? (
            <View
              key={group.key}
              className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden"
            >
              {renderStageHeader(group, stageOpen)}
              {body}
            </View>
          ) : (
            <View key={group.key} className="gap-3">
              {renderStageHeader(group, stageOpen)}
              {body}
            </View>
          );
        })
      )}
    </View>
  );
}
