import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
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

interface Game {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
  category_id?: string | null;
  stage_id?: string | null;
}

// Stage labels for the card pill, keyed by the curriculum stage
// ids the games are tagged with (same map as the Speaking
// Practice shelf).
const STAGE_LABELS: Record<string, string> = {
  'd3352863-2ae5-4404-b39d-9ade3dac2cbd': 'Stage 1',
  '0880276e-8c46-4aba-a96d-c7aa0a30c632': 'Stage 2',
  '6fb44af7-815c-4157-adc5-cf67ad89617c': 'Stage 3',
  '99de5623-0254-4d9a-b355-2febe00efcf5': 'Stage 4',
  '1d102515-cffd-4df0-b530-99c67ca1a6f1': 'Stage 5',
};

export default function GamesGallery() {
  const goBack = useSafeBack();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  // Category quick-jump filter (Round 76, categories only since
  // Round 79): 'all' or 'cat:<id>'.
  const [filter, setFilter] = useState('all');
  // Round 85: category tree + multi-category memberships, so a game
  // appears under every category it belongs to (parent chips count
  // their subcategories' games too).
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [memberships, setMemberships] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    const fetchGames = async () => {
      try {
        // stage_id / category_id arrive in migration 30; fall back to
        // the older column set if they are somehow missing so the
        // arcade never empties over a column.
        let { data, error } = await supabase
          .from('games')
          .select('id, title, description, thumbnail_url, category_id, stage_id, categories(name)')
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (error && /stage_id|category_id/.test(error.message || '')) {
          const retry = await supabase
            .from('games')
            .select('id, title, description, thumbnail_url, categories(name)')
            .eq('is_published', true)
            .order('created_at', { ascending: false });
          data = retry.data as typeof data;
          error = retry.error;
        }

        if (error) throw error;

        // Map the joined category name for the UI
        const formattedData = data?.map(item => ({
          ...item,
          category: item.categories ? (item.categories as any).name : 'Uncategorized'
        }));

        const rows = (formattedData || []) as Game[];
        setGames(rows);

        // Round 85: categories + memberships (fail-soft: before
        // migration 38 the map falls back to each game's primary
        // category, exactly the old behaviour).
        const cats = await fetchCategoriesForType('games');
        setCategories(cats);
        setMemberships(await fetchMembershipMap('games', rows, cats));
      } catch (error) {
        console.error('Error fetching games:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGames();
  }, []);

  // Chips: "All" plus one per category (from the Categories manager)
  // that has games, in category display order (depth-first over the
  // tree, Round 85). Empty categories never appear. Stage chips were
  // removed in Round 79: the categories are named after the stages,
  // so stage chips duplicated the category names. A game filed under
  // several categories shows under each of their chips, and a parent
  // chip also shows games filed under its subcategories.
  const chips = buildShelfChips(
    categories,
    memberships,
    games.map((g) => g.id),
  );

  const visibleGames =
    filter === 'all'
      ? games
      : games.filter((g) => matchesShelfChip(categories, memberships, g.id, filter));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Arcade" onBack={goBack} right={<HelpButton slug="help-games" />} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-7xl mx-auto">
        <View className="mb-8">
          <MicroLabel className="mb-2">Games</MicroLabel>
          <Text className="font-sans text-lg text-slate-500">Play and practice your English vocabulary.</Text>
        </View>

        {/* Workbook Practice (Round 83): the playable twin of every
            printed lesson workbook, organised stage → module → lesson. */}
        <Link href={'/games/workbooks' as any} asChild>
          <Pressable className="mb-8 bg-white rounded-[20px] border-2 border-gold shadow-sm overflow-hidden">
            <View className="flex-row items-center gap-4 p-5">
              <View className="w-14 h-14 rounded-full bg-navy items-center justify-center">
                <Text className="text-2xl">📘</Text>
              </View>
              <View className="flex-1">
                <Text className="font-display text-xl font-semibold text-navy">Workbook Practice</Text>
                <Text className="font-sans text-slate-500 text-sm">
                  Play the workbook pages for every lesson — the same pages as the printed book, no printing needed.
                </Text>
              </View>
              <Text className="text-gold-dark font-bold text-lg">›</Text>
            </View>
          </Pressable>
        </Link>

        {!loading && games.length > 0 ? (
          <ListFilterChips chips={chips} selectedKey={filter} onChange={setFilter} />
        ) : null}

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0A192F" />
          </View>
        ) : games.length === 0 ? (
          <ElegantCard className="py-20 items-center justify-center px-6">
            <View className="w-20 h-20 rounded-full bg-navy items-center justify-center mb-4">
              <Ionicons name="game-controller-outline" size={36} color="#D4AF37" />
            </View>
            <Text className="font-display text-xl font-semibold text-navy mb-2">No Games Yet</Text>
            <Text className="font-sans text-slate-500">Check back soon for new releases!</Text>
          </ElegantCard>
        ) : (
          <View className="flex-row flex-wrap gap-6">
            {visibleGames.map((game) => (
              <Link key={game.id} href={`/games/${game.id}`} asChild>
                <Pressable className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] bg-white rounded-[20px] border border-inkline shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {game.thumbnail_url ? (
                    <Image source={{ uri: game.thumbnail_url }} className="w-full h-48 bg-pitch-light object-cover" />
                  ) : (
                    <View className="w-full h-48 bg-pitch-light items-center justify-center">
                      <View className="w-16 h-16 rounded-full bg-navy items-center justify-center">
                        <Ionicons name="game-controller-outline" size={30} color="#D4AF37" />
                      </View>
                    </View>
                  )}
                  <View className="p-5">
                    <View className="flex-row items-center justify-between gap-2 mb-1">
                      {game.category ? (
                        <Text className="font-sans text-[11px] font-bold text-gold-dark uppercase tracking-[2px]">
                          {game.category}
                        </Text>
                      ) : (
                        <View />
                      )}
                      {game.stage_id && STAGE_LABELS[game.stage_id] ? (
                        <View className="rounded-full bg-gold-light px-2 py-0.5">
                          <Text className="font-sans text-xs font-bold text-navy">
                            {STAGE_LABELS[game.stage_id]}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="font-display text-xl font-semibold text-navy mb-2" numberOfLines={1}>
                      {game.title}
                    </Text>
                    <Text className="font-sans text-slate-500 text-sm" numberOfLines={2}>
                      {game.description}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}