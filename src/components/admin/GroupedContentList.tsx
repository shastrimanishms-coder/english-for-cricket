import React, { useMemo, useState } from 'react';
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
    onAssign: (ids: string[], categoryId: string) => Promise<void>;
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

export default function GroupedContentList<T>({
  items,
  stages,
  categories,
  idOf,
  stageIdOf,
  categoryIdOf,
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
  const [assigning, setAssigning] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

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

  const categoryLabelOf = (item: T) => {
    const cid = categoryIdOf(item) || null;
    if (!cid) return 'No category';
    return categories.find((c) => c.id === cid)?.name || 'Category';
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

    return orderedStageKeys.map((stageKey) => {
      const bucket = stageBuckets.get(stageKey)!;
      const catBuckets = new Map<string, { categoryId: string | null; items: T[] }>();
      for (const item of bucket.items) {
        const cid = categoryIdOf(item) || null;
        const ckey = cid ?? NO_CATEGORY_KEY;
        const cb = catBuckets.get(ckey) || { categoryId: cid, items: [] };
        cb.items.push(item);
        catBuckets.set(ckey, cb);
      }

      // Category order: the given category order first, then any
      // unknown ids, with "No category" always last.
      const orderedCatKeys: string[] = [];
      for (const c of categories) {
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
                ? 'No category'
                : categories.find((c) => c.id === cb.categoryId)?.name || 'Category',
            items: cb.items,
          };
        }),
      };
    });
  }, [items, stages, categories, stageIdOf, categoryIdOf]);

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
    const ids = [...selectedIds];
    setAssigning(true);
    setFeedback(null);
    try {
      await bulkAssign.onAssign(ids, bulkCategoryId);
      setFeedback({
        ok: true,
        text: `Category assigned to ${ids.length} ${itemNoun}.`,
      });
      setSelectedIds(new Set());
      setBulkCategoryId('');
    } catch (e: any) {
      setFeedback({
        ok: false,
        text: `Could not assign the category: ${e?.message || 'unknown error'}`,
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
            Tick items to assign a category to many at once.
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
            <View className="flex-col lg:flex-row gap-3 lg:items-start">
              <View className="flex-1 min-w-[220px]">
                <AdminDropdown
                  value={bulkCategoryId}
                  onChange={setBulkCategoryId}
                  options={categories.map((c) => ({ id: c.id, label: c.name }))}
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
                    {assigning ? 'Assigning…' : 'Assign'}
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
