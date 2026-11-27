import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
} from '../../lib/lessonVoices';
import type { VoiceCategory } from '../../lib/voiceStudio';
import { scoreSpeechBest } from '../../lib/speechScoring';
import { newSpeakingSessionId } from '../../lib/speakingResults';
import { cancelSpeechCue, playDing, playRecordedLine, speakWithCallback } from '../../lib/speechCue';
import { getStudentIdentity, type StudentIdentity } from '../../lib/studentIdentity';
import { useActivityLogger } from '../../lib/useActivityLogger';
import { useSafeBack } from '../../lib/useSafeBack';
import { useSpeechCheck } from '../../lib/useSpeechCheck';
import {
  awardWordBankSession,
  fetchDueWords,
  recordWordReview,
  syncWordBank,
} from '../../lib/wordBank';
import {
  activityForIndex,
  composeSession,
  pickDistractors,
  sessionStars,
  type DueWord,
  type WordActivityType,
} from '../../lib/wordBankCore';

/**
 * My Word Bank — a review session (Round 92).
 *
 * Up to ten due words, each met once, in one of four small
 * activities rotated through the session: Hear and tap, Picture to
 * word, Say the word (optional, skippable), and — Stages 2 and up
 * only — Build the word with letter tiles. Stage 1 sessions are
 * tap-and-speak only, the standing Stage 1 rule.
 *
 * PRIVACY: the only thing that leaves the device per word is ONE
 * boolean — was the first attempt correct — sent to
 * record_word_review. The Say-the-word check scores on the device;
 * the recognised text is shown on screen (as in Speaking Practice)
 * and then discarded. It is never stored, and neither is anything
 * the student tapped or built.
 */

type Outcome = 'correct' | 'wrong' | 'skip';

interface SessionItem {
  word: DueWord;
  activity: WordActivityType;
  startStep: number;
  options: DueWord[];
}

type SayFn = (text: string) => void;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function WordPicture({ word, height }: { word: DueWord; height: number }) {
  if (word.imageUrl) {
    return (
      <Image
        source={{ uri: word.imageUrl }}
        style={{ height, width: '100%', borderRadius: 16, backgroundColor: '#FFFFFF' }}
        resizeMode="contain"
      />
    );
  }
  return (
    <View
      style={{ height, width: '100%', borderRadius: 16 }}
      className="bg-pitch-light items-center justify-center"
    >
      <Text style={{ fontSize: 64 }}>{word.emoji || '⭐'}</Text>
    </View>
  );
}

function Feedback({
  outcome,
  word,
  onNext,
  last,
}: {
  outcome: Outcome;
  word: DueWord;
  onNext: () => void;
  last: boolean;
}) {
  return (
    <View className="mt-5">
      <View
        className={`rounded-2xl p-4 mb-4 ${
          outcome === 'correct'
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-amber-50 border border-amber-200'
        }`}
      >
        <Text
          className={`text-center font-bold text-lg ${
            outcome === 'correct' ? 'text-emerald-700' : 'text-amber-700'
          }`}
        >
          {outcome === 'correct' ? 'Well done! This word is growing stronger. 🌱' : `Not yet — the word is “${word.word}”.`}
        </Text>
        {word.example ? (
          <Text className="text-center text-slate-600 mt-1">{word.example}</Text>
        ) : null}
      </View>
      <Pressable
        onPress={onNext}
        className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center"
      >
        <Text className="text-white font-bold text-base">{last ? 'Finish' : 'Next word →'}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hear and tap: hear the word, tap its picture.
// ---------------------------------------------------------------------------

function HearTap({
  item,
  say,
  onDone,
  last,
}: {
  item: SessionItem;
  say: SayFn;
  onDone: (o: Outcome) => void;
  last: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const decided = picked !== null;
  const correct = picked === item.word.wordKey;

  useEffect(() => {
    const t = setTimeout(() => say(item.word.word), 400);
    return () => clearTimeout(t);
    // Play once when the word arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.word.wordKey]);

  return (
    <View>
      <Text className="font-display text-2xl font-semibold text-navy text-center mb-1">Hear and tap 👂</Text>
      <Text className="text-slate-500 text-center mb-5">Listen to the word, then tap its picture.</Text>
      <Pressable
        onPress={() => say(item.word.word)}
        className="self-center px-8 py-4 bg-gold border-b-4 border-gold-dark rounded-full mb-6"
      >
        <Text className="text-navy font-bold text-lg">🔊 Listen</Text>
      </Pressable>
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {item.options.map((opt) => {
          const isTarget = opt.wordKey === item.word.wordKey;
          const isPicked = picked === opt.wordKey;
          const border = !decided
            ? 'border-inkline'
            : isTarget
              ? 'border-emerald-500'
              : isPicked
                ? 'border-red-400'
                : 'border-inkline';
          return (
            <Pressable
              key={opt.wordKey}
              disabled={decided}
              onPress={() => {
                setPicked(opt.wordKey);
                if (isTarget) playDing();
              }}
              className={`w-[48%] bg-white border-2 ${border} rounded-[16px] overflow-hidden`}
            >
              {opt.imageUrl ? (
                <Image source={{ uri: opt.imageUrl }} style={{ height: 104, width: '100%', backgroundColor: '#FFFFFF' }} resizeMode="contain" />
              ) : (
                <View style={{ height: 104 }} className="bg-pitch-light items-center justify-center">
                  <Text style={{ fontSize: 44 }}>{opt.emoji || '⭐'}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {decided ? (
        <Feedback outcome={correct ? 'correct' : 'wrong'} word={item.word} onNext={() => onDone(correct ? 'correct' : 'wrong')} last={last} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Picture to word: see the picture, tap the word it names.
// ---------------------------------------------------------------------------

function PictureWord({
  item,
  onDone,
  last,
}: {
  item: SessionItem;
  onDone: (o: Outcome) => void;
  last: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const decided = picked !== null;
  const correct = picked === item.word.wordKey;

  return (
    <View>
      <Text className="font-display text-2xl font-semibold text-navy text-center mb-1">Picture to word 🖼️</Text>
      <Text className="text-slate-500 text-center mb-5">What is this word?</Text>
      <View className="mb-6">
        <WordPicture word={item.word} height={180} />
      </View>
      <View className="gap-3">
        {item.options.map((opt) => {
          const isTarget = opt.wordKey === item.word.wordKey;
          const isPicked = picked === opt.wordKey;
          const cls = !decided
            ? 'bg-white border-inkline'
            : isTarget
              ? 'bg-emerald-50 border-emerald-500'
              : isPicked
                ? 'bg-red-50 border-red-400'
                : 'bg-white border-inkline';
          return (
            <Pressable
              key={opt.wordKey}
              disabled={decided}
              onPress={() => {
                setPicked(opt.wordKey);
                if (isTarget) playDing();
              }}
              className={`border-2 ${cls} rounded-full py-3.5 items-center`}
            >
              <Text className="font-sans font-bold text-navy text-lg">
                {opt.emoji ? `${opt.emoji} ` : ''}
                {opt.word}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {decided ? (
        <Feedback outcome={correct ? 'correct' : 'wrong'} word={item.word} onNext={() => onDone(correct ? 'correct' : 'wrong')} last={last} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Say the word: optional speaking check at the usual 70% pass mark.
// Skipping records NOTHING — the word simply stays due.
// ---------------------------------------------------------------------------

function SayWord({
  item,
  say,
  onDone,
  last,
}: {
  item: SessionItem;
  say: SayFn;
  onDone: (o: Outcome) => void;
  last: boolean;
}) {
  const [result, setResult] = useState<{ heard: string; accuracy: number } | null>(null);
  const decidedRef = useRef(false);

  const speech = useSpeechCheck({
    onFinal: (_transcript, alternatives) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      const score = scoreSpeechBest(item.word.word, alternatives);
      if (score.accuracy >= 70) playDing();
      setResult({ heard: score.heard, accuracy: score.accuracy });
    },
    onError: () => {
      decidedRef.current = false;
    },
  });

  const decided = result !== null;
  const correct = decided && result.accuracy >= 70;

  return (
    <View>
      <Text className="font-display text-2xl font-semibold text-navy text-center mb-1">Say the word 🎤</Text>
      <Text className="text-slate-500 text-center mb-5">Say this word out loud. You can skip it if you like.</Text>
      <View className="mb-4">
        <WordPicture word={item.word} height={150} />
      </View>
      <Text className="font-display text-4xl font-semibold text-navy text-center mb-2">{item.word.word}</Text>
      {item.word.example ? (
        <Text className="text-slate-500 text-center mb-5">{item.word.example}</Text>
      ) : null}

      <Pressable
        onPress={() => say(item.word.word)}
        className="self-center px-6 py-3 bg-white border border-inkline rounded-full mb-4"
      >
        <Text className="font-bold text-slate-700">🔊 Listen first</Text>
      </Pressable>

      {result ? (
        <View
          className={`rounded-2xl p-4 mb-2 ${
            correct ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
          }`}
        >
          <Text className="text-center text-slate-600">
            It sounded like: <Text className="font-bold">“{result.heard}”</Text>
          </Text>
          <Text className={`text-center font-bold text-lg ${correct ? 'text-emerald-600' : 'text-amber-600'}`}>
            {result.accuracy}% {correct ? '— well said!' : '— nearly there.'}
          </Text>
        </View>
      ) : speech.supported === false ? (
        <Pressable
          onPress={() => {
            if (decidedRef.current) return;
            decidedRef.current = true;
            playDing();
            setResult({ heard: item.word.word, accuracy: 100 });
          }}
          className="px-6 py-4 bg-emerald-500 rounded-full items-center mb-3"
        >
          <Text className="text-white font-bold">I said it right ✓</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => {
            if (!speech.listening && !decidedRef.current) speech.start();
          }}
          className={`px-6 py-4 rounded-full items-center mb-3 ${speech.listening ? 'bg-red-400' : 'bg-gold border-b-4 border-gold-dark'}`}
        >
          <Text className="text-white font-bold text-base">
            {speech.listening ? '🎙️ Listening… speak now!' : '🎤 Tap and say the word'}
          </Text>
        </Pressable>
      )}
      {speech.listening && speech.interim ? (
        <Text className="text-center text-slate-400 mb-3">“{speech.interim}”</Text>
      ) : null}

      {decided ? (
        <Feedback outcome={correct ? 'correct' : 'wrong'} word={item.word} onNext={() => onDone(correct ? 'correct' : 'wrong')} last={last} />
      ) : (
        <Pressable onPress={() => onDone('skip')} className="px-6 py-3 items-center">
          <Text className="font-bold text-slate-500">Skip this word for now</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Build the word: letter tiles (Stages 2 and up only).
// Correct on the first attempt = built with no wrong tile tapped.
// ---------------------------------------------------------------------------

function BuildWord({
  item,
  say,
  onDone,
  last,
}: {
  item: SessionItem;
  say: SayFn;
  onDone: (o: Outcome) => void;
  last: boolean;
}) {
  const letters = useMemo(() => item.word.word.replace(/ /g, ''), [item.word]);
  const tiles = useMemo(
    () => shuffle(letters.split('').map((ch, i) => ({ ch, id: i }))),
    [letters]
  );
  const [placed, setPlaced] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [wrongTile, setWrongTile] = useState<number | null>(null);
  const done = placed.length === letters.length && letters.length > 0;
  const correct = done && mistakes === 0;

  useEffect(() => {
    if (done && mistakes === 0) playDing();
  }, [done, mistakes]);

  const tapTile = (tile: { ch: string; id: number }) => {
    if (done || placed.includes(tile.id)) return;
    if (tile.ch === letters[placed.length]) {
      setPlaced((p) => [...p, tile.id]);
    } else {
      setMistakes((m) => m + 1);
      setWrongTile(tile.id);
      setTimeout(() => setWrongTile(null), 450);
    }
  };

  return (
    <View>
      <Text className="font-display text-2xl font-semibold text-navy text-center mb-1">Build the word 🔤</Text>
      <Text className="text-slate-500 text-center mb-5">Tap the letters in order to build the word for this picture.</Text>
      <View className="mb-5">
        <WordPicture word={item.word} height={150} />
      </View>

      <View className="flex-row flex-wrap justify-center gap-1.5 mb-5">
        {letters.split('').map((_, i) => (
          <View
            key={i}
            className={`w-9 h-11 rounded-lg border-2 items-center justify-center ${
              i < placed.length ? 'bg-navy border-navy' : 'bg-white border-dashed border-slate-300'
            }`}
          >
            <Text className="font-display text-xl font-semibold text-white">
              {i < placed.length ? letters[i] : ''}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap justify-center gap-2 mb-4">
        {tiles.map((tile) => {
          const used = placed.includes(tile.id);
          return (
            <Pressable
              key={tile.id}
              disabled={used || done}
              onPress={() => tapTile(tile)}
              className={`w-11 h-12 rounded-xl border-2 items-center justify-center ${
                used
                  ? 'bg-slate-100 border-slate-200 opacity-40'
                  : wrongTile === tile.id
                    ? 'bg-red-100 border-red-400'
                    : 'bg-white border-gold-dark'
              }`}
            >
              <Text className="font-display text-xl font-semibold text-navy">{tile.ch}</Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row justify-center gap-3 mb-2">
        <Pressable
          onPress={() => say(item.word.word)}
          className="px-5 py-2.5 bg-white border border-inkline rounded-full"
        >
          <Text className="font-bold text-slate-700">🔊 Hear it</Text>
        </Pressable>
        {!done ? (
          <Pressable onPress={() => setPlaced([])} className="px-5 py-2.5 bg-white border border-inkline rounded-full">
            <Text className="font-bold text-slate-600">Start again</Text>
          </Pressable>
        ) : null}
      </View>

      {done ? (
        <Feedback outcome={correct ? 'correct' : 'wrong'} word={item.word} onNext={() => onDone(correct ? 'correct' : 'wrong')} last={last} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The session screen
// ---------------------------------------------------------------------------

export default function WordBankReview() {
  const router = useRouter();
  const goBack = useSafeBack();
  useActivityLogger({ activityType: 'word_bank' });

  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [gains, setGains] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [starsAwarded, setStarsAwarded] = useState(0);
  const sessionIdRef = useRef<string>(newSpeakingSessionId());
  const stopRef = useRef<(() => void) | null>(null);
  const awardDoneRef = useRef(false);

  const say = useCallback<SayFn>((text) => {
    try {
      stopRef.current?.();
    } catch { /* nothing playing */ }
    stopRef.current = null;
    const url = voiceUrlForText(text);
    if (url) {
      stopRef.current = playRecordedLine(url, () => {});
    } else {
      speakWithCallback(text);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idn = await getStudentIdentity();
      if (cancelled) return;
      setIdentity(idn);
      if (!idn) {
        setLoading(false);
        return;
      }
      // Enrolment first (backfills lessons finished before the
      // feature existed), then the due list.
      await syncWordBank(idn);
      const due = await fetchDueWords(idn);
      if (cancelled) return;
      const session = composeSession(due, new Date());
      const built: SessionItem[] = session.map((w, i) => {
        const options =
          activityForIndex(w.stageNo, i) === 'hear_tap' || activityForIndex(w.stageNo, i) === 'picture_word'
            ? shuffle([w, ...pickDistractors(due, w, 3)])
            : [w];
        return { word: w, activity: activityForIndex(w.stageNo, i), startStep: w.step, options };
      });
      setItems(built);
      setLoading(false);

      // Resolve recorded voices for every word that can be heard in
      // this session (session words + distractor pool), grouped by
      // module parity exactly as the lesson player picks its model
      // voices (odd modules M1/B1, even modules F1/G1).
      try {
        const prefs = await fetchVoicePrefs(idn);
        const merged = new Map<string, string>();
        for (const parity of [1, 0] as const) {
          const texts = due.filter((w) => w.moduleNo % 2 === parity).map((w) => w.word);
          if (texts.length === 0) continue;
          const preferred: VoiceCategory[] = parity === 1 ? ['M1', 'B1'] : ['F1', 'G1'];
          const map = await resolveVoicesForTexts(texts, prefs, preferred);
          for (const [k, v] of map) merged.set(k, v);
        }
        if (!cancelled) setActiveVoiceMap(merged);
      } catch {
        // Recordings are a nicety; the device voice covers the rest.
      }
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

  const handleDone = useCallback(
    async (outcome: Outcome) => {
      const item = items[index];
      if (!item) return;
      if (outcome !== 'skip' && identity) {
        const res = await recordWordReview(identity, item.word.wordKey, outcome === 'correct');
        setReviewed((r) => r + 1);
        if (res) {
          if (res.step > item.startStep) setGains((g) => g + 1);
          if (res.mastered) setMasteredCount((m) => m + 1);
        }
      }
      if (index + 1 >= items.length) setFinished(true);
      else setIndex(index + 1);
    },
    [items, index, identity]
  );

  // Pay the session's stars once, when the summary is reached.
  useEffect(() => {
    if (!finished || awardDoneRef.current || !identity) return;
    awardDoneRef.current = true;
    const stars = sessionStars(gains);
    setStarsAwarded(stars);
    void awardWordBankSession(identity, stars, sessionIdRef.current);
  }, [finished, identity, gains]);

  const current = items[index];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Word Review" onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-3xl mx-auto">
          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color="#0A192F" />
            </View>
          ) : finished ? (
            <ElegantCard className="py-12 items-center justify-center px-6">
              <Text className="text-5xl mb-4">🎉</Text>
              <Text className="font-display text-2xl font-semibold text-navy text-center mb-2">
                Review complete!
              </Text>
              <Text className="font-sans text-slate-500 text-center mb-1">
                You practised {reviewed} word{reviewed === 1 ? '' : 's'} today.
              </Text>
              {gains > 0 ? (
                <Text className="font-sans text-slate-600 text-center mb-1">
                  {gains} word{gains === 1 ? ' is' : 's are'} growing stronger. 🌱
                </Text>
              ) : null}
              {masteredCount > 0 ? (
                <Text className="font-sans font-bold text-emerald-600 text-center mb-1">
                  ⭐ {masteredCount} word{masteredCount === 1 ? '' : 's'} mastered — you know{' '}
                  {masteredCount === 1 ? 'it' : 'them'} for good!
                </Text>
              ) : null}
              <Text className="font-sans text-slate-500 text-center mb-4">
                Words you met today will come back when it is time to meet them again.
              </Text>
              {starsAwarded > 0 ? (
                <Text className="text-xl font-bold text-[#D4AF37] mb-6">+{starsAwarded} ⭐ earned</Text>
              ) : null}
              <Pressable
                onPress={() => router.replace('/learner/wordbank' as any)}
                className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center"
              >
                <Text className="text-white font-bold text-base">Back to My Word Bank</Text>
              </Pressable>
            </ElegantCard>
          ) : !current ? (
            <ElegantCard className="py-16 items-center justify-center px-6">
              <View className="w-20 h-20 rounded-full bg-navy items-center justify-center mb-4">
                <Text className="text-3xl">🌱</Text>
              </View>
              <Text className="font-display text-xl font-semibold text-navy mb-2 text-center">
                Nothing to review right now
              </Text>
              <Text className="font-sans text-slate-500 text-center mb-6">
                All caught up! Words from your finished lessons will be ready here when it is
                time to meet them again.
              </Text>
              <Pressable
                onPress={() => router.replace('/learner/wordbank' as any)}
                className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center"
              >
                <Text className="text-white font-bold text-base">Back to My Word Bank</Text>
              </Pressable>
            </ElegantCard>
          ) : (
            <View>
              <View className="mb-5">
                <MicroLabel className="mb-2">
                  Word {index + 1} of {items.length}
                </MicroLabel>
                <View className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <View
                    className="h-full bg-gold rounded-full"
                    style={{ width: `${((index + 1) / items.length) * 100}%` }}
                  />
                </View>
              </View>
              <ElegantCard className="p-6">
                {current.activity === 'hear_tap' ? (
                  <HearTap key={current.word.wordKey} item={current} say={say} onDone={handleDone} last={index + 1 >= items.length} />
                ) : current.activity === 'picture_word' ? (
                  <PictureWord key={current.word.wordKey} item={current} onDone={handleDone} last={index + 1 >= items.length} />
                ) : current.activity === 'say_word' ? (
                  <SayWord key={current.word.wordKey} item={current} say={say} onDone={handleDone} last={index + 1 >= items.length} />
                ) : (
                  <BuildWord key={current.word.wordKey} item={current} say={say} onDone={handleDone} last={index + 1 >= items.length} />
                )}
              </ElegantCard>
              <View className="items-center mt-4">
                <Ionicons name="bookmarks-outline" size={16} color="#B8912A" />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
