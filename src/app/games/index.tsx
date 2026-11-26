import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import { HelpButton } from '../../components/ui/HelpPopup';
import { supabase } from '../../lib/supabase';
import { useSafeBack } from '../../lib/useSafeBack';

// The Arcade (Round 87, Shastri's restructure): the root is a clean
// three-card hub — Learning Path Workbooks, Textbook Workbooks and
// Games — and each card opens its own section. The games list itself
// (filter chips + cards) lives at /games/all, unchanged.

interface HubCounts {
  lp: number;
  tb: number;
  games: number;
}

function HubCard({
  href,
  emoji,
  title,
  blurb,
  count,
  countNoun,
}: {
  href: string;
  emoji: string;
  title: string;
  blurb: string;
  count?: number;
  countNoun: string;
}) {
  return (
    <Link href={href as any} asChild>
      <Pressable className="mb-4 bg-white rounded-[20px] border-2 border-gold shadow-sm overflow-hidden">
        <View className="flex-row items-center gap-4 p-5">
          <View className="w-14 h-14 rounded-full bg-navy items-center justify-center">
            <Text className="text-2xl">{emoji}</Text>
          </View>
          <View className="flex-1">
            <Text className="font-display text-xl font-semibold text-navy">{title}</Text>
            <Text className="font-sans text-slate-500 text-sm">{blurb}</Text>
            {typeof count === 'number' ? (
              <Text className="font-sans text-gold-dark font-bold text-sm mt-1">
                {count} {countNoun} to play
              </Text>
            ) : null}
          </View>
          <Text className="text-gold-dark font-bold text-lg">›</Text>
        </View>
      </Pressable>
    </Link>
  );
}

export default function ArcadeHub() {
  const goBack = useSafeBack();
  const [counts, setCounts] = useState<HubCounts | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Live counts per family (fail-soft: if any count query
        // fails, the cards simply render without a count line).
        const base = () =>
          supabase.from('games').select('id', { count: 'exact', head: true }).eq('is_published', true);
        const [lp, tb, total] = await Promise.all([
          base().eq('engine', 'workbook').not('stage_id', 'is', null),
          base().eq('engine', 'workbook').is('stage_id', null),
          base(),
        ]);
        if (lp.error || tb.error || total.error) return;
        const lpCount = lp.count ?? 0;
        const tbCount = tb.count ?? 0;
        setCounts({
          lp: lpCount,
          tb: tbCount,
          games: Math.max(0, (total.count ?? 0) - lpCount - tbCount),
        });
      } catch {
        // counts are a nicety — the hub works without them
      }
    })();
  }, []);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Arcade" onBack={goBack} right={<HelpButton slug="help-games" />} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-7xl mx-auto">
          <View className="mb-8">
            <MicroLabel className="mb-2">Games</MicroLabel>
            <Text className="font-sans text-lg text-slate-500">Play and practice your English vocabulary.</Text>
          </View>

          <HubCard
            href="/games/workbooks"
            emoji="📘"
            title="Learning Path Workbooks"
            blurb="Play the workbook pages for every Learning Path lesson — stage by stage, module by module."
            count={counts?.lp}
            countNoun="workbooks"
          />
          <HubCard
            href="/games/textbook-workbooks"
            emoji="📗"
            title="Textbook Workbooks"
            blurb="Play the workbook pages from the printed English for Cricket books — Book 1 to Book 5, lesson by lesson."
            count={counts?.tb}
            countNoun="workbooks"
          />
          <HubCard
            href="/games/all"
            emoji="🎮"
            title="Games"
            blurb="The arcade games — word games, challenges and cricket fun for every stage."
            count={counts?.games}
            countNoun="games"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
