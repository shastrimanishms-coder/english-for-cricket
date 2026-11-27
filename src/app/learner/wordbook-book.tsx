import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { scoreSpeech } from '../../lib/speechScoring';
import { newSpeakingSessionId } from '../../lib/speakingResults';
import { cancelSpeechCue, playDing, playRecordedLine, speakWithCallback } from '../../lib/speechCue';
import { getStudentIdentity, type StudentIdentity } from '../../lib/studentIdentity';
import { useActivityLogger } from '../../lib/useActivityLogger';
import { useSafeBack } from '../../lib/useSafeBack';
import { useSpeechCheck } from '../../lib/useSpeechCheck';
import {
  awardWordBankSession,
  fetchBrowseModule,
  fetchBrowseTextbook,
  recordWordReview,
  type BrowseWord,
} from '../../lib/wordBank';
import {
  buildTiles,
  shuffleWords,
  splitWordSlots,
  testWordResult,
  wordLetters,
  type LetterTile,
  type SpeakOutcome,
} from '../../lib/wordBookCore';
import { sessionStars } from '../../lib/wordBankCore';

/**
 * A Word Bank lesson book (Round 94) — Shastri's design.
 *
 * LEARN: a flashcard book. One word per page — big picture, the
 * word, its example sentence, and ONE Listen button (Round 95)
 * that plays the word and then, when it ends, the sentence, as a
 * single sequence — with Continue turning the page and a back
 * arrow returning. The word order is shuffled every time the book
 * opens, and Replay at the end shuffles again. Learn is pure
 * study: it records NOTHING — no ladder calls, no scores, no
 * stars.
 *
 * TEST: the same book as a check, shuffled every run. Each page
 * shows the picture ONLY (no word, no example anywhere), scrambled
 * letter tiles to build the word (separators like the hyphen in
 * "twenty-one" are fixed slots), and — once the word is built —
 * the word is revealed, Listen unlocks, and a Speak button checks
 * pronunciation at the usual 70%. Per word the book sends ONE
 * boolean to record_word_review, and only for ENROLLED words
 * (whose lesson is finished): built with no wrong taps and the
 * speak step not failed. Words from unfinished lessons can be
 * practised but send nothing. The summary pays the session's
 * stars by the Round 92 rule (+1 per stepped-up word, cap +5,
 * one 'word_review' ledger row) and offers a Learn book holding
 * only the missed words.
 *
 * PRIVACY: the speak check scores on the device; its transcript
 * is shown on the page and discarded — never stored, exactly as
 * in Speaking Practice. Nothing about taps or answers is stored;
 * the single boolean per enrolled word is all that leaves.
 */

type SayFn = (text: string) => void;
/** Round 95: play a word, then its sentence, as one sequence;
 * onDone fires when the whole sequence has finished. */
type SayPairFn = (wordText: string, sentenceText: string | undefined, onDone: () => void) => void;

/** A word or sentence recording runs a few seconds at most; if a
 * part has not reported its end within this long it is treated
 * as stalled and the Listen sequence moves on without it. */
const PAIR_PART_TIMEOUT_MS = 15000;

function WordPicture({ word, height }: { word: BrowseWord; height: number }) {
  if (word.imageUrl) {
    return (
      <Image
        testID="book-picture-img"
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
      <Text style={{ fontSize: 72 }}>{word.emoji || '⭐'}</Text>
    </View>
  );
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <View className="mb-5">
      <MicroLabel className="mb-2">
        Word {Math.min(index + 1, total)} of {total}
      </MicroLabel>
      <View className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <View
          className="h-full bg-gold rounded-full"
          style={{ width: `${total > 0 ? ((index + 1) / total) * 100 : 0}%` }}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// LEARN — one flashcard page.
// ---------------------------------------------------------------------------

function LearnPage({
  word,
  sayPair,
  onPrev,
  onNext,
  isFirst,
  isLast,
}: {
  word: BrowseWord;
  sayPair: SayPairFn;
  onPrev: () => void;
  onNext: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  // Round 95: ONE Listen button. While the word → sentence
  // sequence plays, the button shows its playing state and a
  // re-tap cannot stack a second sequence.
  const [playing, setPlaying] = useState(false);
  const listen = () => {
    if (playing) return;
    setPlaying(true);
    sayPair(word.word, word.example || undefined, () => setPlaying(false));
  };
  return (
    <View>
      <View className="mb-5">
        <WordPicture word={word} height={210} />
      </View>
      <Text
        testID="book-word"
        className="font-display text-4xl font-semibold text-navy text-center mb-2"
      >
        {word.word}
      </Text>
      {word.example ? (
        <Text className="font-sans text-lg text-slate-500 text-center mb-6">{word.example}</Text>
      ) : null}
      <View className="flex-row justify-center mb-7">
        <Pressable
          onPress={listen}
          disabled={playing}
          className={`px-8 py-3.5 bg-gold border-b-4 border-gold-dark rounded-full ${playing ? 'opacity-70' : ''}`}
        >
          <Text className="text-navy font-bold">{playing ? '🔊 Listening…' : '🔊 Listen'}</Text>
        </Pressable>
      </View>
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={onPrev}
          disabled={isFirst}
          className={`px-5 py-3 rounded-full ${isFirst ? 'opacity-30' : ''}`}
        >
          <Text className="font-bold text-slate-600">‹ Back</Text>
        </Pressable>
        <Pressable
          onPress={onNext}
          className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full"
        >
          <Text className="text-white font-bold text-base">{isLast ? 'Finish' : 'Continue ›'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TEST — one page: build the word, then say it.
// ---------------------------------------------------------------------------

interface PageResult {
  correct: boolean;
  buildClean: boolean;
  spokeWell: boolean | null;
}

function TestPage({
  word,
  say,
  onDone,
  isLast,
}: {
  word: BrowseWord;
  say: SayFn;
  onDone: (r: PageResult) => void;
  isLast: boolean;
}) {
  const slots = useMemo(() => splitWordSlots(word.word), [word]);
  const letters = useMemo(() => wordLetters(word.word), [word]);
  const tiles = useMemo<LetterTile[]>(() => buildTiles(word.word), [word]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [wrongTile, setWrongTile] = useState<number | null>(null);
  const formed = placed.length === letters.length && letters.length > 0;

  const [speak, setSpeak] = useState<SpeakOutcome | null>(null);
  const [heard, setHeard] = useState('');
  const [speakError, setSpeakError] = useState(false);
  const decidedRef = useRef(false);

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      const score = scoreSpeech(word.word, transcript);
      const passed = score.accuracy >= 70;
      if (passed) playDing();
      setHeard(transcript);
      setSpeak(passed ? 'passed' : 'failed');
    },
    onError: () => {
      decidedRef.current = false;
      setSpeakError(true);
    },
  });

  useEffect(() => {
    if (formed && wrongTaps === 0) playDing();
  }, [formed, wrongTaps]);

  const tapTile = (tile: LetterTile) => {
    if (formed || placed.includes(tile.id)) return;
    if (tile.ch === letters[placed.length]) {
      setPlaced((p) => [...p, tile.id]);
    } else {
      setWrongTaps((n) => n + 1);
      setWrongTile(tile.id);
      setTimeout(() => setWrongTile(null), 450);
    }
  };

  /** Untap: tapping a placed slot takes that tile — and every tile
   * placed after it — back off the board. Undoing is never a
   * mistake; only tapping a wrong tile counts. */
  const tapSlot = (letterIndex: number) => {
    if (formed) return;
    if (letterIndex < placed.length) setPlaced((p) => p.slice(0, letterIndex));
  };

  const finish = (outcome: SpeakOutcome, spokeWell: boolean | null) => {
    onDone({
      correct: testWordResult(wrongTaps, outcome),
      buildClean: wrongTaps === 0,
      spokeWell,
    });
  };

  return (
    <View>
      <Text className="font-display text-2xl font-semibold text-navy text-center mb-1">
        Build the word 🔤
      </Text>
      <Text className="text-slate-500 text-center mb-5">
        What word is this picture? Tap the letters in order.
      </Text>
      <View className="mb-5">
        <WordPicture word={word} height={170} />
      </View>

      {/* Slots: letters fill in as tiles are placed; separators
          (the hyphen in "twenty-one", a space) are already home. */}
      <View className="flex-row flex-wrap justify-center gap-1.5 mb-5">
        {slots.map((slot, i) => {
          if (slot.kind === 'separator') {
            return (
              <View key={i} className="w-5 h-11 items-center justify-center">
                <Text className="font-display text-xl font-semibold text-slate-400">
                  {slot.ch === ' ' ? '' : slot.ch}
                </Text>
              </View>
            );
          }
          const filled = slot.letterIndex < placed.length;
          return (
            <Pressable
              key={i}
              testID={`book-slot-${slot.letterIndex}`}
              onPress={() => tapSlot(slot.letterIndex)}
              className={`w-9 h-11 rounded-lg border-2 items-center justify-center ${
                filled ? 'bg-navy border-navy' : 'bg-white border-dashed border-slate-300'
              }`}
            >
              <Text className="font-display text-xl font-semibold text-white">
                {filled ? letters[slot.letterIndex] : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!formed ? (
        <>
          <View className="flex-row flex-wrap justify-center gap-2 mb-4">
            {tiles.map((tile) => {
              const used = placed.includes(tile.id);
              return (
                <Pressable
                  key={tile.id}
                  testID={`book-tile-${tile.id}`}
                  disabled={used}
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
          {placed.length > 0 ? (
            <View className="items-center">
              <Pressable
                onPress={() => setPlaced([])}
                className="px-5 py-2.5 bg-white border border-inkline rounded-full"
              >
                <Text className="font-bold text-slate-600">Start again</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        <View>
          {/* The word is built: reveal it, unlock Listen, and offer
              the speak check. */}
          <Text
            testID="book-word"
            className="font-display text-4xl font-semibold text-navy text-center mb-4"
          >
            {word.word}
          </Text>
          {speak === null ? (
            <View>
              <View className="flex-row justify-center gap-3 mb-3">
                <Pressable
                  onPress={() => say(word.word)}
                  className="px-6 py-3.5 bg-gold border-b-4 border-gold-dark rounded-full"
                >
                  <Text className="text-navy font-bold">🔊 Listen</Text>
                </Pressable>
                {speech.supported === false ? null : (
                  <Pressable
                    onPress={() => {
                      setSpeakError(false);
                      if (!speech.listening && !decidedRef.current) void speech.start();
                    }}
                    className={`px-6 py-3.5 rounded-full ${
                      speech.listening ? 'bg-red-400' : 'bg-navy border-b-4 border-navy-deep'
                    }`}
                  >
                    <Text className="text-white font-bold">
                      {speech.listening ? '🎙️ Listening…' : '🎤 Speak'}
                    </Text>
                  </Pressable>
                )}
              </View>
              {speech.supported === false ? (
                <View className="items-center">
                  <Text className="text-slate-500 text-center mb-3">
                    This device cannot check speaking. Say the word out loud — how did it go?
                  </Text>
                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={() => finish('unavailable', true)}
                      className="px-6 py-3.5 bg-emerald-500 rounded-full"
                    >
                      <Text className="text-white font-bold">I said it ✓</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => finish('skipped', null)}
                      className="px-6 py-3.5 bg-white border border-inkline rounded-full"
                    >
                      <Text className="font-bold text-slate-600">Skip</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="items-center">
                  {speech.listening && speech.interim ? (
                    <Text className="text-center text-slate-400 mb-2">“{speech.interim}”</Text>
                  ) : null}
                  {speakError ? (
                    <Text className="text-center text-amber-600 mb-2">
                      The speech checker could not hear that — you can try again, or skip.
                    </Text>
                  ) : null}
                  <Pressable onPress={() => finish('skipped', null)} className="px-6 py-3">
                    <Text className="font-bold text-slate-500">Skip speaking</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View>
              <View
                className={`rounded-2xl p-4 mb-4 ${
                  speak === 'passed'
                    ? 'bg-emerald-50 border border-emerald-200'
                    : 'bg-amber-50 border border-amber-200'
                }`}
              >
                <Text className="text-center text-slate-600">
                  It sounded like: <Text className="font-bold">“{heard}”</Text>
                </Text>
                <Text
                  className={`text-center font-bold text-lg ${
                    speak === 'passed' ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {speak === 'passed' ? 'Well said! 🎉' : 'Nearly there — listen and try the word again later.'}
                </Text>
                {wrongTaps > 0 ? (
                  <Text className="text-center text-slate-500 mt-1">
                    The building needed a few tries — this word will come back for more practice.
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => finish(speak, speak === 'passed')}
                className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center"
              >
                <Text className="text-white font-bold text-base">
                  {isLast ? 'Finish' : 'Next word →'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The book screen
// ---------------------------------------------------------------------------

interface TestResult extends PageResult {
  wordKey: string;
  word: string;
  emoji: string;
  imageUrl: string;
  steppedUp: boolean;
}

export default function WordBook() {
  const router = useRouter();
  const goBack = useSafeBack();
  const params = useLocalSearchParams<{
    moduleId?: string;
    lessonId?: string;
    keys?: string;
    mode?: string;
    moduleNo?: string;
    title?: string;
    // Round 96: a textbook book names its source instead of a
    // module — source 'textbook' + the book number. lessonId is
    // then the synthetic textbook lesson key (see wordBank.ts).
    source?: string;
    bookNo?: string;
  }>();
  const isTextbook = params.source === 'textbook' && !!params.bookNo;
  const mode = params.mode === 'test' ? 'test' : 'learn';
  const moduleNo = Number(params.moduleNo) || 1;
  useActivityLogger({ activityType: 'word_bank' });

  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<BrowseWord[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<TestResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [starsAwarded, setStarsAwarded] = useState(0);
  const sessionIdRef = useRef<string>(newSpeakingSessionId());
  const awardDoneRef = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);

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

  // Round 95: the Learn book's combined Listen sequence — the word
  // first, then (when it ends) the example sentence. Each part
  // resolves exactly as `say` does (recorded voice from the active
  // map first, device voice as fallback) and falls back
  // independently; a part that cannot play at all still ends, so
  // the sequence always completes. pairSeqRef invalidates the
  // chain when the page turns or the screen goes away, so a
  // sentence never starts playing on the wrong page. Each part
  // also carries a safety timer — the same caller's-timer pattern
  // the lesson player pairs with playRecordedLine — so a recording
  // that stalls (its player never reports the end) cannot wedge
  // the sequence on the playing state.
  const pairSeqRef = useRef(0);
  const pairTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPairTimer = useCallback(() => {
    if (pairTimerRef.current) {
      clearTimeout(pairTimerRef.current);
      pairTimerRef.current = null;
    }
  }, []);
  const sayPair = useCallback<SayPairFn>(
    (wordText, sentenceText, onDone) => {
      const seq = ++pairSeqRef.current;
      const alive = () => pairSeqRef.current === seq;
      clearPairTimer();
      try {
        stopRef.current?.();
      } catch { /* nothing playing */ }
      stopRef.current = null;
      const finish = () => {
        clearPairTimer();
        if (alive()) onDone();
      };
      const playPart = (text: string, next: () => void) => {
        let advanced = false;
        const advance = () => {
          if (advanced || !alive()) return;
          advanced = true;
          clearPairTimer();
          next();
        };
        pairTimerRef.current = setTimeout(() => {
          if (!alive()) return;
          // Abandon the stalled part: silence it, then move on.
          try {
            stopRef.current?.();
          } catch { /* nothing playing */ }
          cancelSpeechCue();
          advance();
        }, PAIR_PART_TIMEOUT_MS);
        const url = voiceUrlForText(text);
        if (url) {
          stopRef.current = playRecordedLine(url, advance);
        } else {
          speakWithCallback(text, advance);
        }
      };
      if (sentenceText) {
        playPart(wordText, () => playPart(sentenceText, finish));
      } else {
        playPart(wordText, finish);
      }
    },
    [clearPairTimer]
  );

  const stopPair = useCallback(() => {
    pairSeqRef.current++;
    clearPairTimer();
    try {
      stopRef.current?.();
    } catch { /* nothing playing */ }
    stopRef.current = null;
  }, [clearPairTimer]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idn = await getStudentIdentity();
      if (cancelled) return;
      setIdentity(idn);
      let words: BrowseWord[] = [];
      if (idn && (params.moduleId || isTextbook)) {
        const all = isTextbook
          ? await fetchBrowseTextbook(idn, Number(params.bookNo))
          : await fetchBrowseModule(idn, params.moduleId as string);
        if (params.keys) {
          const wanted = new Set(params.keys.split(',').filter(Boolean));
          words = all.filter((w) => wanted.has(w.wordKey));
        } else if (params.lessonId) {
          words = all.filter((w) => w.lessonId === params.lessonId);
        } else {
          words = all;
        }
      }
      if (cancelled) return;
      // Shuffled on every open — Shastri's rule for both books.
      setDeck(shuffleWords(words));
      setLoading(false);

      // Resolve recorded voices for every text this book can play
      // (each word and its example sentence), with the module's
      // model-voice parity, exactly as the lesson player picks.
      try {
        if (idn && words.length > 0) {
          const prefs = await fetchVoicePrefs(idn);
          const preferred: VoiceCategory[] = moduleNo % 2 === 1 ? ['M1', 'B1'] : ['F1', 'G1'];
          const texts: string[] = [];
          for (const w of words) {
            texts.push(w.word);
            if (w.example) texts.push(w.example);
          }
          const map = await resolveVoicesForTexts(texts, prefs, preferred);
          if (!cancelled) setActiveVoiceMap(map);
        }
      } catch {
        // Recordings are a nicety; the device voice covers the rest.
      }
    })();
    const pairSeq = pairSeqRef;
    return () => {
      cancelled = true;
      pairSeq.current++;
      if (pairTimerRef.current) {
        clearTimeout(pairTimerRef.current);
        pairTimerRef.current = null;
      }
      setActiveVoiceMap(null);
      try {
        stopRef.current?.();
      } catch { /* nothing playing */ }
      cancelSpeechCue();
    };
    // The book is built once per mount; Replay re-shuffles locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = deck[index];
  const atEnd = !loading && deck.length > 0 && index >= deck.length;

  // --- Learn navigation ------------------------------------------------------
  const replayLearn = useCallback(() => {
    setDeck((d) => shuffleWords(d));
    setIndex(0);
  }, []);

  // --- Test bookkeeping --------------------------------------------------------
  const handlePageDone = useCallback(
    async (r: PageResult) => {
      const w = deck[index];
      if (!w) return;
      let steppedUp = false;
      // Only ENROLLED words (their lesson is finished) report to
      // the ladder — exactly one boolean each. The rest is
      // practice only and sends nothing.
      if (identity && w.status !== 'not_started') {
        const res = await recordWordReview(identity, w.wordKey, r.correct);
        if (res) steppedUp = res.step > (w.step ?? 0);
      }
      setResults((prev) => [
        ...prev,
        {
          ...r,
          wordKey: w.wordKey,
          word: w.word,
          emoji: w.emoji,
          imageUrl: w.imageUrl,
          steppedUp,
        },
      ]);
      if (index + 1 >= deck.length) setFinished(true);
      else setIndex(index + 1);
    },
    [deck, index, identity]
  );

  // Pay the test's stars once, when the summary is reached — the
  // Round 92 rule: +1 per stepped-up word, capped at +5, one
  // 'word_review' ledger row for the whole book.
  useEffect(() => {
    if (mode !== 'test' || !finished || awardDoneRef.current || !identity) return;
    awardDoneRef.current = true;
    const stars = sessionStars(results.filter((r) => r.steppedUp).length);
    setStarsAwarded(stars);
    void awardWordBankSession(identity, stars, sessionIdRef.current);
  }, [mode, finished, identity, results]);

  const missed = results.filter((r) => !r.correct);
  const builtClean = results.filter((r) => r.buildClean).length;
  const spokenWell = results.filter((r) => r.spokeWell === true).length;

  const practiseMissed = () => {
    router.replace({
      pathname: '/learner/wordbook-book',
      params: {
        // Round 96: a textbook book re-opens against its own source,
        // never against a Learning Path module.
        ...(isTextbook
          ? { source: 'textbook', bookNo: params.bookNo ?? '' }
          : { moduleId: params.moduleId ?? '' }),
        moduleNo: String(moduleNo),
        mode: 'learn',
        keys: missed.map((r) => r.wordKey).join(','),
        title: 'Practise these words',
      },
    } as any);
  };

  const headerTitle =
    mode === 'test' ? 'Word Test' : params.title ? String(params.title) : 'Learn the Words';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title={headerTitle} onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-3xl mx-auto">
          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color="#0A192F" />
            </View>
          ) : deck.length === 0 ? (
            <ElegantCard className="py-16 items-center justify-center px-6">
              <Text className="text-4xl mb-3">📖</Text>
              <Text className="font-display text-xl font-semibold text-navy text-center mb-2">
                This book is empty
              </Text>
              <Text className="font-sans text-slate-500 text-center mb-6">
                There are no words here yet.
              </Text>
              <Pressable
                onPress={goBack}
                className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full"
              >
                <Text className="text-white font-bold">Back</Text>
              </Pressable>
            </ElegantCard>
          ) : mode === 'learn' ? (
            atEnd ? (
              <ElegantCard className="py-12 items-center justify-center px-6">
                <Text className="text-5xl mb-4">📚</Text>
                <Text className="font-display text-2xl font-semibold text-navy text-center mb-2">
                  You have seen every word!
                </Text>
                <Text className="font-sans text-slate-500 text-center mb-6">
                  All {deck.length} word{deck.length === 1 ? '' : 's'} in this book. Read them
                  again any time — they will be in a new order.
                </Text>
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={replayLearn}
                    className="px-8 py-4 bg-gold border-b-4 border-gold-dark rounded-full"
                  >
                    <Text className="text-navy font-bold text-base">↻ Replay</Text>
                  </Pressable>
                  <Pressable
                    onPress={goBack}
                    className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full"
                  >
                    <Text className="text-white font-bold text-base">Back to lessons</Text>
                  </Pressable>
                </View>
              </ElegantCard>
            ) : (
              <View>
                <Progress index={index} total={deck.length} />
                <ElegantCard className="p-6">
                  <LearnPage
                    key={`${current.wordKey}-${index}`}
                    word={current}
                    sayPair={sayPair}
                    onPrev={() => {
                      stopPair();
                      setIndex((i) => Math.max(0, i - 1));
                    }}
                    onNext={() => {
                      stopPair();
                      setIndex((i) => i + 1);
                    }}
                    isFirst={index === 0}
                    isLast={index + 1 >= deck.length}
                  />
                </ElegantCard>
              </View>
            )
          ) : finished ? (
            <ElegantCard className="py-10 px-6">
              <View className="items-center">
                <Text className="text-5xl mb-4">🎉</Text>
                <Text className="font-display text-2xl font-semibold text-navy text-center mb-2">
                  Test complete!
                </Text>
                <Text className="font-sans text-slate-600 text-center mb-1">
                  You built {builtClean} of {results.length} word{results.length === 1 ? '' : 's'}{' '}
                  with no mistakes. 🔤
                </Text>
                {spokenWell > 0 ? (
                  <Text className="font-sans text-slate-600 text-center mb-1">
                    You spoke {spokenWell} word{spokenWell === 1 ? '' : 's'} beautifully. 🎤
                  </Text>
                ) : null}
                {starsAwarded > 0 ? (
                  <Text className="text-xl font-bold text-[#D4AF37] my-3">
                    +{starsAwarded} ⭐ earned
                  </Text>
                ) : null}
              </View>
              {missed.length > 0 ? (
                <View className="mt-4">
                  <Text className="font-sans font-bold text-navy mb-2">
                    Practise these words a little more:
                  </Text>
                  <View className="gap-2 mb-4">
                    {missed.map((r) => (
                      <View
                        key={r.wordKey}
                        className="flex-row items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
                      >
                        {r.imageUrl ? (
                          <Image
                            source={{ uri: r.imageUrl }}
                            style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFFFFF' }}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={{ fontSize: 22 }}>{r.emoji || '⭐'}</Text>
                        )}
                        <Text className="font-sans font-bold text-navy">{r.word}</Text>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    onPress={practiseMissed}
                    className="px-8 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center mb-3"
                  >
                    <Text className="text-navy font-bold text-base">Practise these words ›</Text>
                  </Pressable>
                </View>
              ) : (
                <Text className="font-sans text-emerald-600 text-center font-bold mt-2 mb-2">
                  Every word right — wonderful work! ⭐
                </Text>
              )}
              <Pressable
                onPress={goBack}
                className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center mt-2"
              >
                <Text className="text-white font-bold text-base">Back to lessons</Text>
              </Pressable>
            </ElegantCard>
          ) : current ? (
            <View>
              <Progress index={index} total={deck.length} />
              <ElegantCard className="p-6">
                <TestPage
                  key={`${current.wordKey}-${index}`}
                  word={current}
                  say={say}
                  onDone={handlePageDone}
                  isLast={index + 1 >= deck.length}
                />
              </ElegantCard>
              <View className="items-center mt-4">
                <Ionicons name="bookmarks-outline" size={16} color="#B8912A" />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
