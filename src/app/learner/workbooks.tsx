import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import { HelpButton } from '../../components/ui/HelpPopup';
import { supabase } from '../../lib/supabase';
import { useSafeBack } from '../../lib/useSafeBack';

// Digital Workbooks (Round 88, Shastri's decision): the playable
// workbooks live on the student dashboard now, not in the Arcade —
// they are study material tied to the lessons and the printed
// books, not arcade games. This section page carries the two
// family cards (the design and live counts come from Round 87's
// Arcade hub, moved here); each card opens its practice page,
// whose URL is unchanged (/games/workbooks and
// /games/textbook-workbooks — the printed books point there).

interface WorkbookCounts {
  lp: number;
  tb: number;
}

function WorkbookFamilyCard({
  href,
  emoji,
  title,
  blurb,
  count,
}: {
  href: string;
  emoji: string;
  title: string;
  blurb: string;
  count?: number;
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
                {count} workbooks to play
              </Text>
            ) : null}
          </View>
          <Text className="text-gold-dark font-bold text-lg">›</Text>
        </View>
      </Pressable>
    </Link>
  );
}

export default function DigitalWorkbooks() {
  const goBack = useSafeBack();
  const [counts, setCounts] = useState<WorkbookCounts | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Live counts per family (fail-soft: if any count query
        // fails, the cards simply render without a count line).
        // Learning Path workbook games carry a stage tag; textbook
        // workbook games do not.
        const base = () =>
          supabase.from('games').select('id', { count: 'exact', head: true }).eq('is_published', true);
        const [lp, tb] = await Promise.all([
          base().eq('engine', 'workbook').not('stage_id', 'is', null),
          base().eq('engine', 'workbook').is('stage_id', null),
        ]);
        if (lp.error || tb.error) return;
        setCounts({ lp: lp.count ?? 0, tb: tb.count ?? 0 });
      } catch {
        // counts are a nicety — the section works without them
      }
    })();
  }, []);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Digital Workbooks" onBack={goBack} right={<HelpButton slug="help-games" />} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-7xl mx-auto">
          <View className="mb-8">
            <MicroLabel className="mb-2">Digital Workbooks</MicroLabel>
            <Text className="font-sans text-lg text-slate-500">
              Play the workbook pages for every lesson and every textbook — the same pages as the printed books, no printing needed.
            </Text>
          </View>

          <WorkbookFamilyCard
            href="/games/workbooks"
            emoji="📘"
            title="Learning Path Workbooks"
            blurb="Play the workbook pages for every Learning Path lesson — stage by stage, module by module."
            count={counts?.lp}
          />
          <WorkbookFamilyCard
            href="/games/textbook-workbooks"
            emoji="📗"
            title="Textbook Workbooks"
            blurb="Play the workbook pages from the printed English for Cricket books — Book 1 to Book 5, lesson by lesson."
            count={counts?.tb}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
