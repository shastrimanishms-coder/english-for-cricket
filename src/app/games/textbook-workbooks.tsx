import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import { HelpButton } from '../../components/ui/HelpPopup';
import { supabase } from '../../lib/supabase';
import { useSafeBack } from '../../lib/useSafeBack';

// Textbook Workbook Practice (Round 86): the playable twins of the
// TRADITIONAL printed textbook workbooks (Books 1–5), organised
// Book → Lesson. Same 'workbook' engine as the Learning Path
// workbook games, distinguished by data.source === 'textbook';
// these rows carry no stage/module/lesson tags because the books
// are not tied to app curriculum lessons.

interface TbGame {
  id: string;
  title: string;
  thumbnail_url: string | null;
  data: any;
}

export default function TextbookWorkbookPractice() {
  const goBack = useSafeBack();
  const [games, setGames] = useState<TbGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [openBooks, setOpenBooks] = useState<Set<number>>(new Set([1]));
  // Round 87: the part/level groupings inside each book (Starter A/B,
  // Level 1–13) are collapsible accordions too, mirroring the
  // Learning Path page's stage → module pattern. Parts start closed.
  const [openParts, setOpenParts] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('games')
          .select('id, title, thumbnail_url, data')
          .eq('engine', 'workbook')
          .eq('is_published', true);
        if (error) throw error;
        const rows = ((data || []) as TbGame[]).filter((g) => g.data && g.data.source === 'textbook');
        setGames(rows);
      } catch (error) {
        console.error('Error fetching textbook workbook games:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const books = useMemo(() => {
    const byBook = new Map<number, TbGame[]>();
    for (const g of games) {
      const bookNo = Number(g.data.book) || 0;
      if (!bookNo) continue;
      if (!byBook.has(bookNo)) byBook.set(bookNo, []);
      byBook.get(bookNo)!.push(g);
    }
    return Array.from(byBook.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bookNo, bookGames]) => {
        const sorted = bookGames.sort((a, b) => (Number(a.data.lesson) || 0) - (Number(b.data.lesson) || 0));
        // Group the book's lessons under their part/level titles, in
        // the order the parts first appear (Starter A before B,
        // Level 1 before Level 2, and so on).
        const parts: { partTitle: string; games: TbGame[] }[] = [];
        for (const g of sorted) {
          const pt = g.data.partTitle || '';
          const last = parts[parts.length - 1];
          if (last && last.partTitle === pt) last.games.push(g);
          else parts.push({ partTitle: pt, games: [g] });
        }
        return {
          bookNo,
          bookTitle: sorted[0].data.bookTitle || '',
          parts,
        };
      });
  }, [games]);

  const toggleBook = (bookNo: number) =>
    setOpenBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookNo)) next.delete(bookNo);
      else next.add(bookNo);
      return next;
    });

  const togglePart = (key: string) =>
    setOpenParts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Textbook Workbook Practice" onBack={goBack} right={<HelpButton slug="help-games" />} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-7xl mx-auto">
          <View className="mb-6">
            <MicroLabel className="mb-2">Playable Textbook Workbooks</MicroLabel>
            <Text className="font-sans text-lg text-slate-500">
              The same pages as the printed English for Cricket textbook workbooks, book by book and lesson by lesson. A touch pen is lovely for these pages; fingers work too.
            </Text>
          </View>

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color="#0A192F" />
            </View>
          ) : games.length === 0 ? (
            <ElegantCard className="py-20 items-center justify-center px-6">
              <View className="w-20 h-20 rounded-full bg-navy items-center justify-center mb-4">
                <Text className="text-3xl">📗</Text>
              </View>
              <Text className="font-display text-xl font-semibold text-navy mb-2">No Textbook Workbook Games Yet</Text>
              <Text className="font-sans text-slate-500 text-center">The playable textbook workbooks will appear here soon.</Text>
            </ElegantCard>
          ) : (
            books.map(({ bookNo, bookTitle, parts }) => (
              <View key={bookNo} className="mb-6">
                <Pressable
                  onPress={() => toggleBook(bookNo)}
                  className="flex-row items-center justify-between bg-navy rounded-[16px] px-5 py-4"
                >
                  <Text className="font-display text-lg font-semibold text-white">
                    Book {bookNo} · {bookTitle}
                  </Text>
                  <Ionicons name={openBooks.has(bookNo) ? 'chevron-up' : 'chevron-down'} size={20} color="#D4AF37" />
                </Pressable>
                {openBooks.has(bookNo)
                  ? parts.map(({ partTitle, games: partGames }) => {
                      const partKey = `${bookNo}:${partTitle}`;
                      return (
                      <View key={partKey} className="mt-4">
                        <Pressable
                          onPress={() => togglePart(partKey)}
                          className="flex-row items-center justify-between bg-white border border-inkline rounded-[14px] px-4 py-3 mb-2 shadow-sm"
                        >
                          <Text className="font-sans text-[13px] font-bold text-navy uppercase tracking-[1px]">
                            {partTitle}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            <Text className="font-sans text-xs text-slate-400">{partGames.length} lessons</Text>
                            <Ionicons name={openParts.has(partKey) ? 'chevron-up' : 'chevron-down'} size={16} color="#B8912A" />
                          </View>
                        </Pressable>
                        {openParts.has(partKey) ? (
                        <View className="gap-2">
                          {partGames.map((g) => (
                      <Link key={g.id} href={`/games/${g.id}`} asChild>
                        <Pressable className="flex-row items-center gap-3 bg-white border border-inkline rounded-[16px] px-3 py-2.5 shadow-sm">
                          {g.thumbnail_url ? (
                            <Image source={{ uri: g.thumbnail_url }} className="w-16 h-12 rounded-[10px] bg-pitch-light" resizeMode="cover" />
                          ) : (
                            <View className="w-16 h-12 rounded-[10px] bg-pitch-light items-center justify-center">
                              <Text className="text-xl">📗</Text>
                            </View>
                          )}
                          <View className="flex-1">
                            <Text className="font-sans font-bold text-navy" numberOfLines={1}>
                              {g.data.code} — {g.data.lessonTitle || g.title}
                            </Text>
                            <Text className="text-slate-400 text-xs">
                              Textbook Workbook · {Array.isArray(g.data.pages) ? g.data.pages.length : 2} pages
                            </Text>
                          </View>
                          <Text className="text-gold-dark font-bold">Play ›</Text>
                        </Pressable>
                      </Link>
                          ))}
                        </View>
                        ) : null}
                      </View>
                      );
                    })
                  : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
