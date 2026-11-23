import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ui/Elegant';
import SpeechScoreView from '../../components/ui/SpeechScoreView';
import { awardExtraIfTagged } from '../../lib/extras';
import {
  fetchVoicePrefs,
  resolveVoicesForTexts,
  setActiveVoiceMap,
  voiceUrlForText,
} from '../../lib/lessonVoices';
import { awardPoints, POINTS } from '../../lib/points';
import { scoreSpeech, type SpeechScore } from '../../lib/speechScoring';
import { playDing, playRecordedLine } from '../../lib/speechCue';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';
import { useSpeechCheck } from '../../lib/useSpeechCheck';

interface StoryQuestion {
  q: string;
  options: string[];
  answer: number;
}

interface Story {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category_id: string | null;
  lesson_id: string | null;
  pages: string[];
  level: string;
  order_index: number;
  questions?: StoryQuestion[];
}

// Comprehension questions shown on the story-finished screen (Round 39).
// One question at a time; a wrong tap can be retried, and the score
// counts first-try answers only.
function StoryQuestions({ questions }: { questions: StoryQuestion[] }) {
  const [idx, setIdx] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [missed, setMissed] = useState(false);
  const current = questions[idx];

  if (!current) {
    return (
      <View className="w-full max-w-sm bg-white border border-inkline rounded-3xl p-5 mb-8 items-center">
        <Text className="font-display text-xl font-semibold text-navy mb-1">Questions complete!</Text>
        <Text className="font-sans text-slate-500 text-center">
          You answered {firstTry} of {questions.length} on the first try ⭐
        </Text>
      </View>
    );
  }

  const choose = (i: number) => {
    if (picked !== null && picked === current.answer) return;
    setPicked(i);
    if (i === current.answer) {
      playDing();
      if (!missed) setFirstTry((n) => n + 1);
      setTimeout(() => { setIdx((n) => n + 1); setPicked(null); setMissed(false); }, 900);
    } else {
      setMissed(true);
    }
  };

  return (
    <View className="w-full max-w-sm bg-white border border-inkline rounded-3xl p-5 mb-8">
      <Text className="font-sans font-bold text-gold-dark text-sm mb-1">Quick Questions · {idx + 1} of {questions.length}</Text>
      <Text className="font-display text-xl font-semibold text-navy mb-4">{current.q}</Text>
      <View className="gap-2">
        {current.options.map((opt, i) => {
          const isPicked = picked === i;
          const isRight = isPicked && i === current.answer;
          const isWrong = isPicked && i !== current.answer;
          return (
            <Pressable
              key={i}
              onPress={() => choose(i)}
              className={`rounded-full px-5 py-3 border-2 ${isRight ? 'bg-green-50 border-pitch' : isWrong ? 'bg-red-50 border-red-300' : 'bg-canvas border-inkline'}`}
            >
              <Text className="font-sans font-bold text-slate-700">{opt}{isRight ? ' ✓' : ''}</Text>
            </Pressable>
          );
        })}
      </View>
      {missed && picked !== current.answer ? (
        <Text className="font-sans text-slate-500 mt-3 text-center">Not quite — try again!</Text>
      ) : null}
    </View>
  );
}

interface Category {
  id: string;
  name: string;
  parent_id?: string | null;
}

interface BestRecord {
  accuracy: number | null;
  mode: string;
}

const RATES = [0.8, 1, 1.2] as const;

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text]).map((s) => s.trim()).filter(Boolean);
}

/** Estimated narration time for a sentence at the given rate (ms). */
function estimateMs(sentence: string, rate: number): number {
  const words = sentence.split(/\s+/).filter(Boolean).length;
  return Math.max(1200, (words / (150 * rate)) * 60000);
}

export default function SmartReading() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bestByStory, setBestByStory] = useState<Record<string, BestRecord>>({});

  const [story, setStory] = useState<Story | null>(null);
  const [mode, setMode] = useState<'listen' | 'aloud' | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [sentIdx, setSentIdx] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rateIdx, setRateIdx] = useState(1);
  const [muted, setMuted] = useState(false);
  const [aloudResults, setAloudResults] = useState<{ accuracy: number; wpm: number }[]>([]);
  const [currentScore, setCurrentScore] = useState<{ score: SpeechScore; transcript: string } | null>(null);
  const [summary, setSummary] = useState<{ accuracy: number | null; wpm: number | null } | null>(null);

  const micStartRef = useRef(0);

  const sentences = useMemo(() => (story ? splitSentences(story.pages[pageIdx] || '') : []), [story, pageIdx]);
  const sentence = sentences[sentIdx] || '';
  const totalSentences = useMemo(
    () => (story ? story.pages.reduce((n, p) => n + splitSentences(p).length, 0) : 0),
    [story]
  );
  const sentencesBefore = useMemo(() => {
    if (!story) return 0;
    return story.pages.slice(0, pageIdx).reduce((n, p) => n + splitSentences(p).length, 0);
  }, [story, pageIdx]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [storiesRes, catsRes] = await Promise.all([
        supabase.from('reading_stories').select('*').eq('is_published', true).order('order_index').order('created_at'),
        supabase.from('categories').select('id, name, parent_id').eq('type', 'reading'),
      ]);
      if (storiesRes.error) throw storiesRes.error;
      setStories((storiesRes.data || []) as Story[]);
      setCategories((catsRes.data || []) as Category[]);

      const identity = await getStudentIdentity();
      if (identity) {
        const { data } = await supabase.rpc('get_reading_records', {
          p_student_id: identity.studentId,
          p_student_kind: identity.studentKind,
        });
        if (Array.isArray(data)) {
          const best: Record<string, BestRecord> = {};
          for (const r of data as any[]) {
            const cur = best[r.story_id];
            if (!cur || (r.accuracy ?? -1) > (cur.accuracy ?? -1)) {
              best[r.story_id] = { accuracy: r.accuracy, mode: r.mode };
            }
          }
          setBestByStory(best);
        }
      }
    } catch (error: any) {
      if (/reading_stories/.test(error?.message || '')) setTableMissing(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const stopNarration = useCallback(() => {
    setPlaying(false);
    try {
      Speech.stop();
    } catch {
      // Nothing speaking: fine.
    }
  }, []);

  useEffect(
    () => () => {
      try {
        Speech.stop();
      } catch {
        // Nothing speaking: fine.
      }
    },
    []
  );

  const finishStory = useCallback(
    async (results: { accuracy: number; wpm: number }[], listenMode: boolean) => {
      if (!story) return;
      stopNarration();
      const accuracy = results.length
        ? Math.round(results.reduce((n, r) => n + r.accuracy, 0) / results.length)
        : null;
      const wpm = results.length ? Math.round(results.reduce((n, r) => n + r.wpm, 0) / results.length) : null;
      setSummary({ accuracy, wpm });
      setMode(null);

      const identity = await getStudentIdentity();
      if (identity) {
        try {
          await supabase.rpc('record_reading', {
            p_student_id: identity.studentId,
            p_student_kind: identity.studentKind,
            p_story_id: story.id,
            p_mode: listenMode ? 'listen' : 'read_aloud',
            p_accuracy: accuracy,
            p_wpm: wpm,
            p_sentences_done: listenMode ? totalSentences : results.length,
            p_sentences_total: totalSentences,
          });
        } catch {
          // Recording is best-effort; the reading still happened.
        }
        await awardPoints(
          identity,
          'reading_done',
          POINTS.READING_XP,
          0,
          listenMode ? `${story.id}:listen` : story.id
        );
        // A lesson-tagged story also completes that lesson's extra.
        await awardExtraIfTagged(identity, 'reading', story.id, story.lesson_id);
      }
      await fetchData();
    },
    [story, stopNarration, totalSentences, fetchData]
  );

  // Listen & Read engine. While playing, this effect narrates the
  // current sentence and lights its words up one by one; moving on is
  // just a state change, and the cleanup stops the old sentence. Rate
  // and mute are deps, so changing them restarts the current sentence
  // in the new mode. With a recorded voice the highlight follows the
  // recording's own clock (see onProgress below); with the device
  // voice it runs on a word-length-weighted estimate.
  useEffect(() => {
    if (!story || mode !== 'listen' || !playing || summary) return;
    const text = sentence;
    if (!text) return;
    let advanced = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const rate = RATES[rateIdx];
    const wordList = text.split(/\s+/).filter(Boolean);
    const words = wordList.length;
    const est = estimateMs(text, rate);
    // Word boundaries weighted by word length: longer words hold the
    // voice longer, so the highlight follows real speech rhythm
    // instead of stepping evenly. cum[i] is the fraction of the
    // sentence at which word i begins.
    const weights = wordList.map((w) => w.length + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    const cum: number[] = [];
    let acc = 0;
    for (const w of weights) {
      cum.push(acc / totalWeight);
      acc += w;
    }
    const wordTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < words; i++) {
      wordTimers.push(setTimeout(() => setWordIdx(i), est * cum[i]));
    }
    timers.push(...wordTimers);
    const advance = () => {
      if (advanced) return;
      advanced = true;
      const pageSentences = splitSentences(story.pages[pageIdx] || '');
      if (sentIdx + 1 < pageSentences.length) {
        setSentIdx(sentIdx + 1);
        setWordIdx(0);
      } else if (pageIdx + 1 < story.pages.length) {
        setPageIdx(pageIdx + 1);
        setSentIdx(0);
        setWordIdx(0);
      } else {
        finishStory([], true);
      }
    };
    let stopRecording: (() => void) | null = null;
    const recordingUrl = muted ? null : voiceUrlForText(text);
    if (recordingUrl) {
      // A human recording of this sentence wins over the device
      // voice. Its highlight is paced by the recording itself: the
      // player reports its own position, and the word under the
      // voice is lit from the real duration — so every voice, fast
      // or slow, stays in step. The estimate timers above are only
      // a fallback until the first progress report arrives.
      let progressLive = false;
      const onProgress = (currentTime: number, duration: number) => {
        if (advanced || duration <= 0) return;
        if (!progressLive) {
          progressLive = true;
          wordTimers.forEach(clearTimeout);
        }
        const fraction = Math.min(1, currentTime / duration);
        let idx = 0;
        for (let i = 0; i < cum.length; i++) {
          if (fraction >= cum[i]) idx = i;
        }
        setWordIdx(idx);
      };
      stopRecording = playRecordedLine(recordingUrl, advance, onProgress);
    } else if (!muted) {
      try {
        Speech.speak(text, { language: 'en', rate, onDone: advance, onError: advance });
      } catch {
        // The estimate timer below still moves the story along.
      }
    }
    // Safety net: some voices never report onDone (and mute mode has no
    // voice at all).
    timers.push(setTimeout(advance, (recordingUrl ? Math.max(est, words * 650) : est) + 1800));
    return () => {
      advanced = true;
      timers.forEach(clearTimeout);
      if (stopRecording) stopRecording();
      try {
        Speech.stop();
      } catch {
        // Nothing speaking: fine.
      }
    };
  }, [story, mode, playing, summary, sentence, pageIdx, sentIdx, rateIdx, muted, finishStory]);

  // Human voices: when a story opens, resolve its sentences against
  // the Voice Studio's approved recordings. Sentences with a
  // recording are narrated by the real voice; the rest keep the
  // device voice. (Stories are admin-written, so a sentence joins
  // the studio script when its story is added there.)
  useEffect(() => {
    if (!story) return;
    let cancelled = false;
    (async () => {
      const identity = await getStudentIdentity();
      const prefs = identity ? await fetchVoicePrefs(identity) : {};
      const texts = story.pages.flatMap((p) => splitSentences(p));
      const map = await resolveVoicesForTexts(texts, prefs, []);
      if (!cancelled) setActiveVoiceMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [story]);

  // Leaving the screen clears the active voice map.
  useEffect(() => {
    return () => setActiveVoiceMap(null);
  }, []);

  const startListen = (fromPage: number, fromSent: number) => {
    setPageIdx(fromPage);
    setSentIdx(fromSent);
    setWordIdx(0);
    setPlaying(true);
  };

  const openStory = (s: Story) => {
    stopNarration();
    setStory(s);
    setMode(null);
    setPageIdx(0);
    setSentIdx(0);
    setWordIdx(0);
    setAloudResults([]);
    setCurrentScore(null);
    setSummary(null);
  };

  const backToShelf = () => {
    stopNarration();
    setStory(null);
    setMode(null);
    setSummary(null);
  };

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      if (!sentence) return;
      const score = scoreSpeech(sentence, transcript);
      const elapsedSec = Math.max(1, (Date.now() - micStartRef.current) / 1000);
      const words = sentence.split(/\s+/).filter(Boolean).length;
      const wpm = Math.round(words / (elapsedSec / 60));
      setCurrentScore({ score, transcript });
      setAloudResults((prev) => [...prev, { accuracy: score.accuracy, wpm }]);
    },
    onError: () => undefined,
  });

  const nextAloud = () => {
    setCurrentScore(null);
    if (sentIdx + 1 < sentences.length) {
      setSentIdx(sentIdx + 1);
    } else if (pageIdx + 1 < (story?.pages.length || 0)) {
      setPageIdx(pageIdx + 1);
      setSentIdx(0);
    } else {
      finishStory(aloudResults, false);
    }
  };

  const groups = useMemo(() => {
    const labelOf = (c: Category): string => {
      const parent = c.parent_id ? categories.find((p) => p.id === c.parent_id) : null;
      return parent ? `${parent.name} › ${c.name}` : c.name;
    };
    const byCat = new Map<string, Story[]>();
    for (const s of stories) {
      const key = s.category_id || 'none';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(s);
    }
    const out: { label: string; items: Story[] }[] = [];
    for (const c of categories) {
      const items = byCat.get(c.id);
      if (items?.length) out.push({ label: labelOf(c), items });
    }
    const rest = byCat.get('none');
    if (rest?.length) out.push({ label: out.length ? 'More Stories' : 'Stories', items: rest });
    return out;
  }, [stories, categories]);

  return (
    <View className="flex-1 bg-canvas">
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <ScreenHeader
          title="Smart Reading 📖"
          onBack={() => (story ? backToShelf() : router.back())}
          right={
            story && !summary ? (
              <Text className="font-sans text-white/70 font-bold text-sm">
                Page {pageIdx + 1} of {story.pages.length}
              </Text>
            ) : undefined
          }
        />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-3xl w-full mx-auto">
          {loading ? (
            <View className="py-16 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
          ) : tableMissing ? (
            <View className="items-center py-16">
              <Text className="text-5xl mb-4">📖</Text>
              <Text className="font-display text-2xl font-semibold text-navy mb-2 text-center">Smart Reading is coming soon</Text>
              <Text className="font-sans text-slate-500 text-center">Stories are being prepared. Please check back soon.</Text>
            </View>
          ) : !story ? (
            <>
              <Text className="font-sans text-slate-500 text-lg mb-6">
                Pick a story. Listen while the words light up, or read aloud and get a score for every sentence.
              </Text>
              {groups.length === 0 ? (
                <View className="items-center py-16">
                  <Text className="text-5xl mb-4">📚</Text>
                  <Text className="font-display text-xl font-semibold text-navy text-center">No stories yet</Text>
                  <Text className="font-sans text-slate-500 text-center">Your teacher has not added any stories yet.</Text>
                </View>
              ) : (
                groups.map((g) => (
                  <View key={g.label} className="mb-8">
                    <Text className="font-display text-xl font-semibold text-navy mb-3">{g.label}</Text>
                    {g.items.map((s) => {
                      const best = bestByStory[s.id];
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => openStory(s)}
                          className="flex-row items-center gap-4 bg-white border border-inkline rounded-[20px] shadow-sm p-4 mb-3"
                        >
                          <Text className="text-4xl">{s.emoji}</Text>
                          <View className="flex-1">
                            <Text className="font-display font-semibold text-navy text-lg">{s.title}</Text>
                            {s.description ? <Text className="font-sans text-slate-500">{s.description}</Text> : null}
                            <Text className="font-sans text-slate-400 text-sm">
                              {s.pages.length} page{s.pages.length > 1 ? 's' : ''}{s.level ? ` · ${s.level}` : ''}
                            </Text>
                          </View>
                          {best ? (
                            <View className="items-end">
                              <Text className="font-sans text-pitch font-bold">✓ Read</Text>
                              {best.accuracy !== null && best.accuracy !== undefined ? (
                                <Text className="font-sans text-slate-400 text-sm">Best {best.accuracy}%</Text>
                              ) : null}
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              )}
            </>
          ) : summary ? (
            <View className="items-center py-10">
              <Text className="text-6xl mb-4">🎉</Text>
              <Text className="font-display text-3xl font-semibold text-navy mb-2 text-center">Story finished!</Text>
              <Text className="font-sans text-lg text-slate-500 mb-6 text-center">{story.title}</Text>
              {summary.accuracy !== null ? (
                <Text className="font-sans text-xl font-bold text-pitch mb-1">Reading accuracy: {summary.accuracy}%</Text>
              ) : null}
              {summary.wpm !== null ? (
                <Text className="font-sans text-lg text-slate-500 mb-6">Speed: about {summary.wpm} words per minute</Text>
              ) : null}
              <Text className="font-sans text-gold-dark font-bold mb-8">+{POINTS.READING_XP} XP</Text>
              {story.questions && story.questions.length > 0 ? (
                <StoryQuestions key={story.id} questions={story.questions} />
              ) : null}
              <Pressable onPress={backToShelf} className="px-8 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center mb-3 w-full max-w-sm">
                <Text className="font-sans text-navy font-bold">Back to Stories</Text>
              </Pressable>
              <Pressable
                onPress={() => openStory(story)}
                className="px-8 py-4 bg-white border border-inkline rounded-full items-center w-full max-w-sm"
              >
                <Text className="font-sans text-slate-600 font-bold">Read it again</Text>
              </Pressable>
            </View>
          ) : mode === null ? (
            <View className="items-center py-8">
              <Text className="text-6xl mb-4">{story.emoji}</Text>
              <Text className="font-display text-3xl font-semibold text-navy mb-2 text-center">{story.title}</Text>
              {story.description ? <Text className="font-sans text-slate-500 text-center mb-2">{story.description}</Text> : null}
              <Text className="font-sans text-slate-400 mb-8">
                {story.pages.length} pages · {totalSentences} sentences{story.level ? ` · ${story.level}` : ''}
              </Text>
              <Pressable
                onPress={() => {
                  setMode('listen');
                  startListen(0, 0);
                }}
                className="w-full max-w-sm px-6 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center mb-3"
              >
                <Text className="font-sans text-white font-bold text-base">🔊 Listen &amp; Read</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('aloud')}
                className="w-full max-w-sm px-6 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center"
              >
                <Text className="font-sans text-navy font-bold text-base">🎤 Read Aloud &amp; Get Scored</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <View className="bg-white border border-inkline rounded-[20px] shadow-sm p-6 mb-4 min-h-[180px] justify-center">
                {mode === 'listen' ? (
                  <View className="flex-row flex-wrap">
                    {sentence.split(/\s+/).filter(Boolean).map((w, i) => (
                      <Text
                        key={i}
                        className={`font-display text-2xl leading-10 px-1 rounded ${playing && i === wordIdx ? 'bg-gold-light text-navy font-bold' : 'text-navy'}`}
                      >
                        {w}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text className="font-display text-2xl leading-10 text-navy">{sentence}</Text>
                )}
              </View>

              <Text className="text-center font-sans text-slate-400 font-bold mb-4">
                Sentence {sentencesBefore + sentIdx + 1} of {totalSentences}
              </Text>

              {mode === 'listen' ? (
                <View className="gap-3">
                  <View className="flex-row gap-3">
                    {playing ? (
                      <Pressable onPress={stopNarration} className="flex-1 px-4 py-3.5 bg-gold border-b-4 border-gold-dark rounded-full items-center">
                        <Text className="font-sans text-navy font-bold">⏸ Pause</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => startListen(pageIdx, sentIdx)}
                        className="flex-1 px-4 py-3.5 bg-navy border-b-4 border-navy-deep rounded-full items-center"
                      >
                        <Text className="font-sans text-white font-bold">▶ Play</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => setMuted((m) => !m)}
                      className={`flex-1 px-4 py-3.5 rounded-full items-center border ${muted ? 'bg-gold-light border-gold' : 'bg-white border-inkline'}`}
                    >
                      <Text className="font-sans font-bold text-slate-700">{muted ? '🔇 Sound off' : '🔊 Sound on'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setRateIdx((r) => (r + 1) % RATES.length)}
                      className="flex-1 px-4 py-3.5 bg-white border border-inkline rounded-full items-center"
                    >
                      <Text className="font-sans font-bold text-slate-700">🐢 Speed {RATES[rateIdx]}×</Text>
                    </Pressable>
                  </View>
                  <Text className="text-center font-sans text-slate-400 text-sm">
                    The words light up as they are read. Sound off still guides you word by word.
                  </Text>
                </View>
              ) : (
                <View className="gap-3">
                  {currentScore ? (
                    <SpeechScoreView score={currentScore.score} transcript={currentScore.transcript} />
                  ) : null}
                  {speech.supported === false ? (
                    <Text className="text-center font-sans text-slate-500">
                      Speech scoring is not available on this device/browser — read the sentence aloud, then tap Next.
                    </Text>
                  ) : (
                    <Pressable
                      onPress={() => {
                        if (!speech.listening) {
                          micStartRef.current = Date.now();
                          speech.start();
                        }
                      }}
                      className="px-6 py-4 rounded-full items-center bg-gold border-b-4 border-gold-dark"
                    >
                      <Text className="font-sans text-navy font-bold">
                        {speech.listening ? '🎙️ Listening… read the sentence!' : '🎤 Tap and read this sentence'}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={nextAloud} className="px-6 py-3.5 bg-white border border-inkline rounded-full items-center">
                    <Text className="font-sans font-bold text-slate-700">
                      {sentIdx + 1 < sentences.length || pageIdx + 1 < story.pages.length ? 'Next sentence →' : 'Finish story 🎉'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
