import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import {
  fetchVoicePrefs,
  resolveVoicesForTexts,
  setActiveVoiceMap,
  voiceUrlForText,
  type VoicePrefs,
} from '../../lib/lessonVoices';
import type { VoiceCategory } from '../../lib/voiceStudio';
import { cancelSpeechCue, playRecordedLine, speakWithCallback } from '../../lib/speechCue';
import { getStudentIdentity, type StudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';
import { useSafeBack } from '../../lib/useSafeBack';
import {
  fetchBrowseModule,
  syncWordBank,
  type BrowseWord,
  type WordBankStatus,
} from '../../lib/wordBank';
import type { WordStatus } from '../../lib/wordBankCore';

/**
 * My Word Bank (Round 92): the student's spaced-repetition home.
 *
 * The top card summarises the bank (synced on every visit, which is
 * also what enrols the words of newly finished lessons — including
 * lessons finished before this feature existed) and starts a review
 * session. Below it, the Word Dictionary browses every word in the
 * course by stage, module and LESSON (Round 94): each word shows
 * its picture, its example, tap-to-hear in a recorded voice, and
 * the student's own status for the word: Not started yet / New /
 * Learning / Mastered. Tapping a LESSON opens its book popup —
 * Learn (a shuffled flashcard book) or Test (build and say each
 * word) — see wordbook-book.tsx.
 *
 * Before migration 40 runs, every call here fails soft and the
 * screen shows its calm empty state.
 */

interface LessonPopup {
  lessonId: string;
  lessonTitle: string;
  lessonOrder: number;
  wordCount: number;
  moduleId: string;
  moduleNo: number;
  stageNo: number;
}

interface StageRow {
  id: string;
  title: string;
  order_index: number;
}

interface ModuleRow {
  id: string;
  title: string;
  stage_id: string;
  order_index: number;
}

interface LessonGroup {
  lessonId: string;
  lessonTitle: string;
  lessonOrder: number;
  words: BrowseWord[];
}

/** Group one module's browse words under their lessons, in lesson
 * order (the browse RPC already returns them sorted that way). */
function groupWordsByLesson(words: BrowseWord[]): LessonGroup[] {
  const groups = new Map<string, LessonGroup>();
  for (const w of words) {
    let g = groups.get(w.lessonId);
    if (!g) {
      g = {
        lessonId: w.lessonId,
        lessonTitle: w.lessonTitle,
        lessonOrder: w.lessonOrder,
        words: [],
      };
      groups.set(w.lessonId, g);
    }
    g.words.push(w);
  }
  return [...groups.values()].sort((a, b) => a.lessonOrder - b.lessonOrder);
}

const STATUS_STYLE: Record<WordStatus, { label: string; cls: string; text: string }> = {
  not_started: { label: 'Not started yet', cls: 'bg-slate-100 border-slate-200', text: 'text-slate-500' },
  new: { label: 'New', cls: 'bg-amber-50 border-gold', text: 'text-gold-dark' },
  learning: { label: 'Learning', cls: 'bg-navy border-navy', text: 'text-white' },
  mastered: { label: 'Mastered ⭐', cls: 'bg-emerald-500 border-emerald-600', text: 'text-white' },
};

export default function WordBank() {
  const router = useRouter();
  const goBack = useSafeBack();
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [status, setStatus] = useState<WordBankStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [openStages, setOpenStages] = useState<Set<number>>(new Set([1]));
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [browse, setBrowse] = useState<Map<string, BrowseWord[]>>(new Map());
  const [browseLoading, setBrowseLoading] = useState<Set<string>>(new Set());
  const [popup, setPopup] = useState<LessonPopup | null>(null);
  const prefsRef = useRef<VoicePrefs>({});
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idn = await getStudentIdentity();
      if (cancelled) return;
      setIdentity(idn);
      if (idn) {
        prefsRef.current = await fetchVoicePrefs(idn).catch(() => ({}));
        const s = await syncWordBank(idn);
        if (!cancelled) setStatus(s);
      }
      try {
        const [st, md] = await Promise.all([
          supabase.from('curriculum_stages').select('id, title, order_index').order('order_index'),
          supabase
            .from('curriculum_modules')
            .select('id, title, stage_id, order_index')
            .order('order_index'),
        ]);
        if (!cancelled) {
          if (st.data) setStages(st.data as StageRow[]);
          if (md.data) setModules(md.data as ModuleRow[]);
        }
      } catch {
        // The dictionary simply stays empty without the taxonomy.
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      setActiveVoiceMap(null);
      try {
        stopRef.current?.();
      } catch { /* nothing playing */ }
      cancelSpeechCue();
    };
  }, []);

  const playWord = useCallback(async (w: BrowseWord, moduleNo: number) => {
    try {
      stopRef.current?.();
    } catch { /* nothing playing */ }
    stopRef.current = null;
    const preferred: VoiceCategory[] = moduleNo % 2 === 1 ? ['M1', 'B1'] : ['F1', 'G1'];
    const map = await resolveVoicesForTexts([w.word], prefsRef.current, preferred);
    setActiveVoiceMap(map);
    const url = voiceUrlForText(w.word);
    if (url) {
      stopRef.current = playRecordedLine(url, () => {});
    } else {
      speakWithCallback(w.word);
    }
  }, []);

  const toggleStage = (n: number) =>
    setOpenStages((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const toggleModule = async (m: ModuleRow) => {
    const willOpen = !openModules.has(m.id);
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });
    if (willOpen && !browse.has(m.id) && identity) {
      setBrowseLoading((prev) => new Set(prev).add(m.id));
      const words = await fetchBrowseModule(identity, m.id);
      setBrowse((prev) => new Map(prev).set(m.id, words));
      setBrowseLoading((prev) => {
        const next = new Set(prev);
        next.delete(m.id);
        return next;
      });
    }
  };

  const due = status?.due ?? 0;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="My Word Bank" onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-7xl mx-auto">
          <View className="mb-6">
            <MicroLabel className="mb-2">Words That Stay With You</MicroLabel>
            <Text className="font-sans text-lg text-slate-500">
              Words from your finished lessons join your bank, then come back at just the right
              time — a day later, then a week, then a month — until they are yours for good.
            </Text>
          </View>

          {loading ? (
            <View className="py-16 items-center justify-center">
              <ActivityIndicator size="large" color="#0A192F" />
            </View>
          ) : (
            <>
              {/* The bank summary + review start */}
              <ElegantCard className="p-6 mb-8">
                {status && status.enrolled > 0 ? (
                  <View>
                    <View className="flex-row flex-wrap gap-2 mb-4">
                      <View className="rounded-full bg-pitch-light px-4 py-2">
                        <Text className="font-sans font-bold text-navy">
                          🌱 {status.enrolled} word{status.enrolled === 1 ? '' : 's'} in your bank
                        </Text>
                      </View>
                      <View className="rounded-full bg-amber-50 border border-gold px-4 py-2">
                        <Text className="font-sans font-bold text-gold-dark">New: {status.newWords}</Text>
                      </View>
                      <View className="rounded-full bg-navy px-4 py-2">
                        <Text className="font-sans font-bold text-white">Learning: {status.learning}</Text>
                      </View>
                      <View className="rounded-full bg-emerald-500 px-4 py-2">
                        <Text className="font-sans font-bold text-white">Mastered: {status.mastered} ⭐</Text>
                      </View>
                    </View>
                    {due > 0 ? (
                      <View>
                        <Text className="font-display text-xl font-semibold text-navy mb-1">
                          {due} word{due === 1 ? ' is' : 's are'} ready to review
                        </Text>
                        <Text className="font-sans text-slate-500 mb-4">
                          A short session of up to ten words — about three minutes.
                        </Text>
                        <Pressable
                          onPress={() => router.push('/learner/wordbank-review' as any)}
                          className="self-start px-8 py-4 bg-gold border-b-4 border-gold-dark rounded-full"
                        >
                          <Text className="text-navy font-bold text-base">Start review ›</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text className="font-sans text-slate-500">
                        All caught up! No words are due right now — they will be ready here when
                        it is time to meet them again.
                      </Text>
                    )}
                  </View>
                ) : (
                  <View className="items-center py-4">
                    <Text className="text-4xl mb-3">🌱</Text>
                    <Text className="font-display text-xl font-semibold text-navy text-center mb-2">
                      Your Word Bank is ready when you are
                    </Text>
                    <Text className="font-sans text-slate-500 text-center">
                      Finish a lesson and its words will join your bank here, ready to review.
                    </Text>
                  </View>
                )}
              </ElegantCard>

              {/* The dictionary */}
              <View className="mb-4">
                <MicroLabel className="mb-2">Word Dictionary</MicroLabel>
                <Text className="font-sans text-slate-500">
                  Every word in the course, stage by stage. Tap a word to hear it — or open a
                  lesson to Learn or Test all of its words as a book.
                </Text>
              </View>
              {stages.map((stage) => {
                const stageModules = modules.filter((m) => m.stage_id === stage.id);
                const open = openStages.has(stage.order_index);
                return (
                  <View key={stage.id} className="mb-6">
                    <Pressable
                      onPress={() => toggleStage(stage.order_index)}
                      className="flex-row items-center justify-between bg-navy rounded-[16px] px-5 py-4"
                    >
                      <Text className="font-display text-lg font-semibold text-white">
                        Stage {stage.order_index} · {stage.title}
                      </Text>
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#D4AF37" />
                    </Pressable>
                    {open
                      ? stageModules.map((m) => {
                          const moduleOpen = openModules.has(m.id);
                          const words = browse.get(m.id);
                          const moduleNo = m.order_index % 100;
                          return (
                            <View key={m.id} className="mt-4">
                              <Pressable
                                onPress={() => void toggleModule(m)}
                                className="flex-row items-center justify-between bg-white border border-inkline rounded-[14px] px-4 py-3 mb-2 shadow-sm"
                              >
                                <Text className="font-sans text-[13px] font-bold text-navy uppercase tracking-[1px]">
                                  {m.title.replace(/^Stage \d+ · /, '')}
                                </Text>
                                <Ionicons
                                  name={moduleOpen ? 'chevron-up' : 'chevron-down'}
                                  size={16}
                                  color="#B8912A"
                                />
                              </Pressable>
                              {moduleOpen ? (
                                browseLoading.has(m.id) ? (
                                  <View className="py-8 items-center">
                                    <ActivityIndicator color="#0A192F" />
                                  </View>
                                ) : !words || words.length === 0 ? (
                                  <Text className="font-sans text-slate-400 px-2 py-3">
                                    No words here yet.
                                  </Text>
                                ) : (
                                  <View>
                                    {/* Round 94: the module's words are
                                        grouped by LESSON. Tapping a
                                        lesson header opens its book
                                        popup (Learn / Test). */}
                                    {groupWordsByLesson(words).map((group) => (
                                      <View key={group.lessonId} className="mb-5">
                                        <Pressable
                                          onPress={() =>
                                            setPopup({
                                              lessonId: group.lessonId,
                                              lessonTitle: group.lessonTitle,
                                              lessonOrder: group.lessonOrder,
                                              wordCount: group.words.length,
                                              moduleId: m.id,
                                              moduleNo,
                                              stageNo: stage.order_index,
                                            })
                                          }
                                          className="flex-row items-center justify-between bg-pitch-light border border-gold rounded-[12px] px-4 py-3 mb-3"
                                        >
                                          <Text className="font-sans font-bold text-navy">
                                            Lesson {group.lessonOrder + 1} · {group.lessonTitle}
                                          </Text>
                                          <Text className="font-sans text-[12px] font-bold text-gold-dark">
                                            {group.words.length} words · Learn / Test ›
                                          </Text>
                                        </Pressable>
                                        <View className="flex-row flex-wrap justify-between gap-y-3">
                                          {group.words.map((w) => {
                                            const st = STATUS_STYLE[w.status];
                                            return (
                                              <Pressable
                                                key={w.wordKey}
                                                onPress={() => void playWord(w, moduleNo)}
                                                className="w-[48%] md:w-[31%] bg-white border border-inkline rounded-[16px] overflow-hidden shadow-sm"
                                              >
                                                {w.imageUrl ? (
                                                  <Image
                                                    source={{ uri: w.imageUrl }}
                                                    style={{ height: 96, width: '100%' }}
                                                    resizeMode="cover"
                                                  />
                                                ) : (
                                                  <View
                                                    style={{ height: 96 }}
                                                    className="bg-pitch-light items-center justify-center"
                                                  >
                                                    <Text style={{ fontSize: 40 }}>{w.emoji || '⭐'}</Text>
                                                  </View>
                                                )}
                                                <View className="p-3">
                                                  <Text className="font-sans font-bold text-navy text-base" numberOfLines={1}>
                                                    {w.emoji ? `${w.emoji} ` : ''}
                                                    {w.word} 🔊
                                                  </Text>
                                                  {w.example ? (
                                                    <Text className="text-slate-400 text-xs mb-2" numberOfLines={2}>
                                                      {w.example}
                                                    </Text>
                                                  ) : null}
                                                  <View
                                                    className={`self-start rounded-full border px-2.5 py-1 ${st.cls}`}
                                                  >
                                                    <Text className={`text-[11px] font-bold ${st.text}`}>
                                                      {st.label}
                                                    </Text>
                                                  </View>
                                                </View>
                                              </Pressable>
                                            );
                                          })}
                                        </View>
                                      </View>
                                    ))}
                                  </View>
                                )
                              ) : null}
                            </View>
                          );
                        })
                      : null}
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>

      {/* The lesson book popup (Round 94): Learn or Test. */}
      <Modal
        visible={popup !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPopup(null)}
      >
        <Pressable
          onPress={() => setPopup(null)}
          className="flex-1 bg-black/50 items-center justify-center px-6"
        >
          <Pressable
            onPress={() => {}}
            className="w-full max-w-md bg-white rounded-[20px] p-6 shadow-lg"
          >
            {popup ? (
              <View>
                <Text className="font-display text-xl font-semibold text-navy mb-1">
                  Lesson {popup.lessonOrder + 1} · {popup.lessonTitle}
                </Text>
                <Text className="font-sans text-slate-500 mb-5">
                  {popup.wordCount} word{popup.wordCount === 1 ? '' : 's'} in this lesson. How
                  would you like to meet them?
                </Text>
                <Pressable
                  onPress={() => {
                    const p = popup;
                    setPopup(null);
                    router.push({
                      pathname: '/learner/wordbook-book',
                      params: {
                        moduleId: p.moduleId,
                        lessonId: p.lessonId,
                        moduleNo: String(p.moduleNo),
                        mode: 'learn',
                        title: `Lesson ${p.lessonOrder + 1} · ${p.lessonTitle}`,
                      },
                    } as any);
                  }}
                  className="px-6 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center mb-3"
                >
                  <Text className="text-white font-bold text-base">📖 Learn</Text>
                  <Text className="text-white/70 text-xs mt-0.5">
                    See and hear every word, page by page
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const p = popup;
                    setPopup(null);
                    router.push({
                      pathname: '/learner/wordbook-book',
                      params: {
                        moduleId: p.moduleId,
                        lessonId: p.lessonId,
                        moduleNo: String(p.moduleNo),
                        mode: 'test',
                        title: `Lesson ${p.lessonOrder + 1} · ${p.lessonTitle}`,
                      },
                    } as any);
                  }}
                  className="px-6 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center mb-2"
                >
                  <Text className="text-navy font-bold text-base">🎯 Test</Text>
                  <Text className="text-navy/70 text-xs mt-0.5">
                    Build each word and say it out loud
                  </Text>
                </Pressable>
                <Pressable onPress={() => setPopup(null)} className="px-6 py-3 items-center">
                  <Text className="font-bold text-slate-500">Cancel</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
