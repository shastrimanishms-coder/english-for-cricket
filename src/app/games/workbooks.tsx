import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import { HelpButton } from '../../components/ui/HelpPopup';
import ListFilterChips from '../../components/ui/ListFilterChips';
import {
  buildShelfChips,
  fetchCategoriesForType,
  fetchMembershipMap,
  matchesShelfChip,
  type CategoryNode,
} from '../../lib/contentCategories';
import { supabase } from '../../lib/supabase';
import { useSafeBack } from '../../lib/useSafeBack';

// Workbook Practice (Round 83): every lesson's playable workbook,
// organised Stage → Module → Lesson. The games themselves are
// ordinary `games` rows with engine 'workbook', tagged with stage /
// module / lesson ids; this page is just the tidy shelf for them.
//
// Round 89: the listings are CARDS now — the same card view as the
// Arcade games shelf (cover image, title, subtitle, stage pill) —
// still grouped in the collapsible Stage → Module accordions, and a
// category filter (Round 85 chips over the 'workbooks' category
// tree, Round 88) sits on top: picking a category shows a flat grid
// of that category's workbooks across all stages. The chips hide
// until workbook categories actually hold memberships.

const STAGE_ORDER: Record<string, number> = {
  'd3352863-2ae5-4404-b39d-9ade3dac2cbd': 1,
  '0880276e-8c46-4aba-a96d-c7aa0a30c632': 2,
  '6fb44af7-815c-4157-adc5-cf67ad89617c': 3,
  '99de5623-0254-4d9a-b355-2febe00efcf5': 4,
  '1d102515-cffd-4df0-b530-99c67ca1a6f1': 5,
};
const STAGE_NAMES: Record<number, string> = {
  1: 'The Foundation',
  2: 'The Rookie',
  3: 'The Player',
  4: 'The Strategist',
  5: 'The Captain',
};

interface WbGame {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  category_id: string | null;
  stage_id: string | null;
  module_id: string | null;
  lesson_id: string | null;
  data: any;
}

/** The card's cover: the row thumbnail, else the payload's scene
 *  picture, else the first pictured word in the workbook pages. */
function cardImage(g: WbGame): string | null {
  if (g.thumbnail_url) return g.thumbnail_url;
  if (g.data && typeof g.data.scene === 'string' && g.data.scene) return g.data.scene;
  const pages = Array.isArray(g.data?.pages) ? g.data.pages : [];
  for (const page of pages) {
    for (const act of page?.activities || []) {
      for (const w of act?.words || []) {
        if (w && typeof w.image === 'string' && w.image) return w.image;
      }
      for (const p of act?.pairs || []) {
        if (p && typeof p.image === 'string' && p.image) return p.image;
      }
    }
  }
  return null;
}

export default function WorkbookPractice() {
  const goBack = useSafeBack();
  const [games, setGames] = useState<WbGame[]>([]);
  const [moduleTitles, setModuleTitles] = useState<Map<string, string>>(new Map());
  const [lessonMeta, setLessonMeta] = useState<Map<string, { title: string; order: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openStages, setOpenStages] = useState<Set<number>>(new Set([1]));
  // Round 87: modules are collapsible accordions inside their stage
  // too (Shastri's ask) — stages start open as before, modules start
  // closed so a stage's eight modules stay a tidy list.
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  // Round 89: category filter over the workbooks tree.
  const [wbCats, setWbCats] = useState<CategoryNode[]>([]);
  const [wbMemberships, setWbMemberships] = useState<Map<string, string[]>>(new Map());
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('games')
          .select('id, title, description, thumbnail_url, category_id, stage_id, module_id, lesson_id, data')
          .eq('engine', 'workbook')
          .eq('is_published', true);
        if (error) throw error;
        const rows = ((data || []) as WbGame[]).filter((g) => g.stage_id);
        setGames(rows);

        // Workbooks categories + memberships (fail-soft: no tree or
        // no memberships yet → no chips, the accordions carry on).
        const cats = await fetchCategoriesForType('workbooks');
        setWbCats(cats);
        setWbMemberships(await fetchMembershipMap('workbooks', rows, cats));

        const moduleIds = Array.from(new Set(rows.map((r) => r.module_id).filter(Boolean))) as string[];
        const lessonIds = Array.from(new Set(rows.map((r) => r.lesson_id).filter(Boolean))) as string[];
        if (moduleIds.length > 0) {
          const { data: mods } = await supabase
            .from('curriculum_modules')
            .select('id, title')
            .in('id', moduleIds);
          if (mods) {
            setModuleTitles(new Map((mods as any[]).map((mm) => [mm.id, String(mm.title).replace(/^Stage \d+ · Module \d+: /, '')])));
          }
        }
        if (lessonIds.length > 0) {
          const { data: lessons } = await supabase
            .from('curriculum_lessons')
            .select('id, title, order_index')
            .in('id', lessonIds);
          if (lessons) {
            setLessonMeta(
              new Map((lessons as any[]).map((ll) => [ll.id, { title: ll.title, order: ll.order_index ?? 0 }]))
            );
          }
        }
      } catch (error) {
        console.error('Error fetching workbook games:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stages = useMemo(() => {
    const byStage = new Map<number, Map<string, WbGame[]>>();
    for (const g of games) {
      const stageNo = g.stage_id ? STAGE_ORDER[g.stage_id] ?? 0 : 0;
      if (!stageNo || !g.module_id) continue;
      if (!byStage.has(stageNo)) byStage.set(stageNo, new Map());
      const byModule = byStage.get(stageNo)!;
      if (!byModule.has(g.module_id)) byModule.set(g.module_id, []);
      byModule.get(g.module_id)!.push(g);
    }
    return Array.from(byStage.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([stageNo, byModule]) => ({
        stageNo,
        modules: Array.from(byModule.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([moduleId, moduleGames]) => ({
            moduleId,
            title: moduleTitles.get(moduleId) || 'Module',
            games: moduleGames.sort(
              (a, b) => (lessonMeta.get(a.lesson_id || '')?.order ?? 0) - (lessonMeta.get(b.lesson_id || '')?.order ?? 0)
            ),
          })),
      }));
  }, [games, moduleTitles, lessonMeta]);

  const chips = useMemo(
    () => buildShelfChips(wbCats, wbMemberships, games.map((g) => g.id)),
    [wbCats, wbMemberships, games],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return null;
    return games
      .filter((g) => matchesShelfChip(wbCats, wbMemberships, g.id, filter))
      .sort((a, b) => {
        const sa = (a.stage_id && STAGE_ORDER[a.stage_id]) || 0;
        const sb = (b.stage_id && STAGE_ORDER[b.stage_id]) || 0;
        if (sa !== sb) return sa - sb;
        return (lessonMeta.get(a.lesson_id || '')?.order ?? 0) - (lessonMeta.get(b.lesson_id || '')?.order ?? 0);
      });
  }, [filter, games, wbCats, wbMemberships, lessonMeta]);

  const catName = (g: WbGame): string | null => {
    const primary = (wbMemberships.get(g.id) || [])[0];
    if (!primary) return null;
    return wbCats.find((c) => c.id === primary)?.name || null;
  };

  const renderCard = (g: WbGame) => {
    const stageNo = g.stage_id ? STAGE_ORDER[g.stage_id] : undefined;
    const meta = g.lesson_id ? lessonMeta.get(g.lesson_id) : undefined;
    const lessonNo = (meta?.order ?? (typeof g.data?.lesson === 'number' ? g.data.lesson - 1 : 0)) + 1;
    const title = `Lesson ${lessonNo} — ${meta?.title || g.data?.lessonTitle || g.title.replace(/^Workbook — /, '')}`;
    const pages = Array.isArray(g.data?.pages) ? g.data.pages.length : 3;
    const image = cardImage(g);
    const category = catName(g);
    return (
      <Link key={g.id} href={`/games/${g.id}`} asChild>
        <Pressable className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] bg-white rounded-[20px] border border-inkline shadow-sm overflow-hidden hover:shadow-md transition-shadow">
          {image ? (
            <Image source={{ uri: image }} className="w-full h-48 bg-pitch-light" resizeMode="cover" />
          ) : (
            <View className="w-full h-48 bg-pitch-light items-center justify-center">
              <View className="w-16 h-16 rounded-full bg-navy items-center justify-center">
                <Ionicons name="book-outline" size={30} color="#D4AF37" />
              </View>
            </View>
          )}
          <View className="p-5">
            <View className="flex-row items-center justify-between gap-2 mb-1">
              {category ? (
                <Text className="font-sans text-[11px] font-bold text-gold-dark uppercase tracking-[2px]">
                  {category}
                </Text>
              ) : (
                <View />
              )}
              {stageNo ? (
                <View className="rounded-full bg-gold-light px-2 py-0.5">
                  <Text className="font-sans text-xs font-bold text-navy">Stage {stageNo}</Text>
                </View>
              ) : null}
            </View>
            <Text className="font-display text-xl font-semibold text-navy mb-2" numberOfLines={1}>
              {title}
            </Text>
            <Text className="font-sans text-slate-500 text-sm" numberOfLines={2}>
              {g.description || `Workbook · ${pages} pages`}
            </Text>
          </View>
        </Pressable>
      </Link>
    );
  };

  const toggleStage = (stageNo: number) =>
    setOpenStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageNo)) next.delete(stageNo);
      else next.add(stageNo);
      return next;
    });

  const toggleModule = (moduleId: string) =>
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Workbook Practice" onBack={goBack} right={<HelpButton slug="help-games" />} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-7xl mx-auto">
          <View className="mb-6">
            <MicroLabel className="mb-2">Playable Workbooks</MicroLabel>
            <Text className="font-sans text-lg text-slate-500">
              The same three pages as the printed workbook for every lesson — words, writing games and speaking practice. A touch pen is lovely for these pages; fingers work too.
            </Text>
          </View>

          {!loading && games.length > 0 && chips.length > 1 ? (
            <ListFilterChips chips={chips} selectedKey={filter} onChange={setFilter} />
          ) : null}

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color="#0A192F" />
            </View>
          ) : games.length === 0 ? (
            <ElegantCard className="py-20 items-center justify-center px-6">
              <View className="w-20 h-20 rounded-full bg-navy items-center justify-center mb-4">
                <Text className="text-3xl">📘</Text>
              </View>
              <Text className="font-display text-xl font-semibold text-navy mb-2">No Workbook Games Yet</Text>
              <Text className="font-sans text-slate-500 text-center">The playable workbooks will appear here soon.</Text>
            </ElegantCard>
          ) : filtered ? (
            filtered.length === 0 ? (
              <ElegantCard className="py-16 items-center justify-center px-6">
                <Text className="font-display text-xl font-semibold text-navy mb-2">Nothing in this category yet</Text>
                <Text className="font-sans text-slate-500 text-center">Try another category, or tap All to browse by stage.</Text>
              </ElegantCard>
            ) : (
              <View className="flex-row flex-wrap gap-6">{filtered.map(renderCard)}</View>
            )
          ) : (
            stages.map(({ stageNo, modules }) => (
              <View key={stageNo} className="mb-6">
                <Pressable
                  onPress={() => toggleStage(stageNo)}
                  className="flex-row items-center justify-between bg-navy rounded-[16px] px-5 py-4"
                >
                  <Text className="font-display text-lg font-semibold text-white">
                    Stage {stageNo} · {STAGE_NAMES[stageNo]}
                  </Text>
                  <Ionicons name={openStages.has(stageNo) ? 'chevron-up' : 'chevron-down'} size={20} color="#D4AF37" />
                </Pressable>
                {openStages.has(stageNo)
                  ? modules.map(({ moduleId, title, games: moduleGames }) => (
                      <View key={moduleId} className="mt-4">
                        <Pressable
                          onPress={() => toggleModule(moduleId)}
                          className="flex-row items-center justify-between bg-white border border-inkline rounded-[14px] px-4 py-3 mb-2 shadow-sm"
                        >
                          <Text className="font-sans text-[13px] font-bold text-navy uppercase tracking-[1px]">
                            {title}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            <Text className="font-sans text-xs text-slate-400">{moduleGames.length} lessons</Text>
                            <Ionicons name={openModules.has(moduleId) ? 'chevron-up' : 'chevron-down'} size={16} color="#B8912A" />
                          </View>
                        </Pressable>
                        {openModules.has(moduleId) ? (
                          <View className="flex-row flex-wrap gap-6">{moduleGames.map(renderCard)}</View>
                        ) : null}
                      </View>
                    ))
                  : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
