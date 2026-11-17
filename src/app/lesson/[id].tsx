import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Celebration from '../../components/ui/Celebration';
import MascotPair from '../../components/ui/Mascots';
import NewBadgeCard from '../../components/ui/NewBadgeCard';
import SpeechScoreView from '../../components/ui/SpeechScoreView';
import TrickyWordsPractice, { type TrickyWord } from '../../components/lesson/TrickyWordsPractice';
import Recommendations from '../../components/lesson/Recommendations';
import {
  awardLessonBadges,
  evaluateStreakBadges,
  type AwardedBadge,
} from '../../lib/badgeAwards';
import { awardPoints, isTodayAStudyDay, POINTS } from '../../lib/points';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { scoreMessage, scoreSpeech, type SpeechScore } from '../../lib/speechScoring';
import { supabase } from '../../lib/supabase';
import {
  cancelSpeechCue,
  playDing,
  probeVoicesAvailable,
  speakWithCallback,
  toSpeechText,
  waitUntilSafeToListen,
} from '../../lib/speechCue';
import {
  speechErrorMessage,
  useSpeechCheck,
  type SpeechCheckError,
} from '../../lib/useSpeechCheck';

interface SlidePanel {
  id: number;
  text: string;
  media_url: string;
  audio_url: string;
  is_correct: boolean;
}

interface Slide {
  id: string;
  lesson_id: string;
  slide_type: string;
  prompt_text: string | null;
  media_url: string | null;
  audio_url: string | null;
  correct_answer: string | null;
  options: { panels?: SlidePanel[] } | null;
  order_index: number;
}

interface Lesson {
  id: string;
  title: string;
  module_id: string | null;
}

interface SlideAttempt {
  answered: boolean;
  wasCorrect: boolean | null;
  selectedPanelId: number | null;
  exploredPanelIds: number[];
  typingValue: string;
  /** Last speech-check result on a Speak & Repeat slide, if any. */
  speechResult: { transcript: string; score: SpeechScore } | null;
}

const EMPTY_ATTEMPT: SlideAttempt = {
  answered: false,
  wasCorrect: null,
  selectedPanelId: null,
  exploredPanelIds: [],
  typingValue: '',
  speechResult: null,
};

const SCORED_TYPES = ['quiz_4up', 'typing', 'speak_repeat'];

function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"()]/g, '')
    .replace(/\s+/g, ' ');
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} seconds`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;
}

/** Springs its children in with a scale pop, optionally delayed. */
function PopIn({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.set(withDelay(delay, withSpring(1, { damping: 11, stiffness: 240 })));
    opacity.set(withDelay(delay, withTiming(1, { duration: 250 })));
  }, [delay, scale, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The completion screen's 1-3 star rating, stars popping in staggered. */
function StarsRow({ count }: { count: number }) {
  return (
    <View className="flex-row justify-center gap-2 mb-4">
      {[0, 1, 2].map((i) => (
        <PopIn key={i} delay={200 + i * 160}>
          {i < count ? (
            <Text className="text-4xl">⭐</Text>
          ) : (
            <Text className="text-4xl text-slate-300">☆</Text>
          )}
        </PopIn>
      ))}
    </View>
  );
}

const BURST_STARS = Array.from({ length: 8 }, (_, i) => ({
  angle: (i / 8) * Math.PI * 2 + 0.4,
  distance: 46 + (i % 3) * 18,
  size: 15 + (i % 3) * 4,
}));

function BurstStar({
  config,
  progress,
}: {
  config: (typeof BURST_STARS)[number];
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const out = 1 - Math.pow(1 - p, 3);
    return {
      opacity: interpolate(p, [0, 0.6, 1], [1, 1, 0]),
      transform: [
        { translateX: Math.cos(config.angle) * config.distance * out },
        { translateY: Math.sin(config.angle) * config.distance * out + 36 * p * p },
        { scale: interpolate(p, [0, 0.3, 1], [0.4, 1.15, 0.9]) },
      ],
    };
  });
  return (
    <Animated.Text
      style={[
        burstStyles.particle,
        {
          left: '50%',
          top: '50%',
          marginLeft: -config.size / 2,
          marginTop: -config.size / 2,
          fontSize: config.size,
        },
        style,
      ]}
    >
      ⭐
    </Animated.Text>
  );
}

/**
 * AnswerBurst - a quick ⭐ burst over the slide card when an answer is
 * judged correct. Retriggers whenever `burstKey` increments; before the
 * first correct answer it renders nothing, and between bursts the stars
 * rest at opacity 0.
 */
function AnswerBurst({ burstKey }: { burstKey: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (burstKey === 0) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }));
  }, [burstKey, progress]);

  if (burstKey === 0) return null;
  return (
    <View pointerEvents="none" style={burstStyles.overlay}>
      {BURST_STARS.map((config, i) => (
        <BurstStar key={i} config={config} progress={progress} />
      ))}
    </View>
  );
}

const burstStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  particle: {
    position: 'absolute',
  },
});

/**
 * Speak & Repeat slide: listen to the phrase, say it into the
 * microphone, and get word-by-word colour feedback with a score
 * (70% passes). Where the device or browser cannot check speech at
 * all, the slide falls back to say-it-out-loud self-marking so the
 * student is never blocked by their hardware.
 */
/**
 * An image that hides itself when its file is missing or fails to
 * load. Curriculum slides reference their picture URLs before the
 * actual files are uploaded to storage; a broken-image frame would
 * look like a bug, while no picture at all just looks like a plain
 * slide - so pictures simply appear as they get uploaded.
 */
function FallbackImage({
  uri,
  className,
  height,
  fallback = null,
}: {
  uri: string;
  className?: string;
  /** Explicit height (screen-fit sizing); overrides any h-* class. */
  height?: number;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <Image
      source={{ uri }}
      className={className}
      style={height ? { height } : undefined}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The word-introduction grids as a guided speak-along: the panels
 * play one by one by themselves - picture and sound first, a ding,
 * then the microphone opens and the learner repeats the word (or
 * phrase) with the same word-by-word scoring as Speak & Repeat.
 * A pass moves on by itself; a miss offers Try Again or Next so
 * nobody gets stuck, and devices that cannot check speech fall
 * back to say-it-out-loud self-marking. Tapping any panel still
 * just plays its sound, like the old tap-to-listen grid.
 */
/**
 * The completed version of a gap-fill quiz prompt: "We are a ___ of
 * eleven." + the tapped word "team" -> "We are a team of eleven."
 * Hearing the whole finished sentence is the point of the exercise;
 * hearing the lone answer word teaches almost nothing. Returns null
 * when the prompt has no blank to fill.
 *
 * The prompt usually carries an instruction sentence first ("Which
 * word completes the sentence? ___! I am Ken."), so leading
 * instruction sentences are dropped - but EVERYTHING from the gap
 * onward is kept and spoken whole. The old version spoke only the
 * single sentence containing the blank, which for a prompt like
 * "___! I am Ken." produced just "Hello!" - the inconsistency
 * learners heard as "sometimes the full sentence, sometimes not".
 */
function completedSentence(
  prompt: string | null | undefined,
  answerText: string
): string | null {
  if (!prompt || !/_/.test(prompt)) return null;
  const answer = toSpeechText(answerText);
  if (!answer) return null;
  const sentences = (prompt.match(/[^.?!]+[.?!]*/g) || [prompt])
    .map((s) => s.trim())
    .filter(Boolean);
  let start = 0;
  while (
    start < sentences.length - 1 &&
    (sentences[start].endsWith('?') || /^(which|choose|tap|select)\b/i.test(sentences[start]))
  ) {
    start += 1;
  }
  const body = sentences.slice(start).join(' ');
  if (!/_/.test(body)) return null;
  return body.replace(/_+/g, answer).trim();
}

function GridSpeakSlide({
  slide,
  playOrSpeak,
  playModelThen,
  panelImgH,
  tight,
}: {
  slide: Slide;
  playOrSpeak: (url: string | null | undefined, text: string | null | undefined) => void;
  playModelThen: (
    url: string | null | undefined,
    text: string | null | undefined,
    onDone: () => void
  ) => void;
  panelImgH: number;
  tight: boolean;
}) {
  const panels = useMemo(() => slide.options?.panels || [], [slide]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'listening' | 'feedback' | 'selfmark' | 'done'>(
    'playing'
  );
  const [results, setResults] = useState<
    Record<number, { score: SpeechScore | null; passed: boolean }>
  >({});
  const [lastScore, setLastScore] = useState<SpeechScore | null>(null);
  const [error, setError] = useState<SpeechCheckError | null>(null);
  const runRef = useRef(0);
  const mountTokenRef = useRef({ cancelled: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      const panel = panels[activeIdx];
      if (!panel) return;
      const score = scoreSpeech(toSpeechText(panel.text), transcript);
      setLastScore(score);
      setError(null);
      setPhase('feedback');
      if (score.passed) {
        timerRef.current = setTimeout(() => {
          advancePanel(activeIdx, { score, passed: true });
        }, 1400);
      }
    },
    onError: (speechError) => {
      setError(speechError);
      setLastScore(null);
      setPhase('feedback');
    },
  });

  const speechRef = useRef(speech);
  useEffect(() => {
    speechRef.current = speech;
  });

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // The external half of a panel's turn: play its sound, ding, then
  // open the microphone (or fall back to self-marking). State resets
  // live with the callers so this can be kicked off from an effect
  // without setting state synchronously inside it; every setState
  // below happens in an async callback (sound finished / timer).
  const startSequence = useCallback(
    (idx: number) => {
      const panel = panels[idx];
      if (!panel) return;
      clearTimer();
      const run = ++runRef.current;
      const token = mountTokenRef.current;
      playModelThen(panel.audio_url, panel.text, () => {
        if (token.cancelled || runRef.current !== run) return;
        const tryStart = (attemptsLeft: number) => {
          if (token.cancelled || runRef.current !== run) return;
          const current = speechRef.current;
          if (current.supported) {
            setPhase('listening');
            try {
              Speech.stop();
            } catch {
              // TTS is a nicety, never a blocker.
            }
            // The model voice must be genuinely finished - not just
            // reported finished - before the mic opens, or the
            // recogniser hears the app itself through the speakers.
            // waitUntilSafeToListen also waits out a word-count
            // duration floor, because the idle flags themselves can
            // drop early on some voices.
            void waitUntilSafeToListen().then(() => {
              if (token.cancelled || runRef.current !== run) return;
              // The ding sounds HERE - a fixed beat before the mic
              // opens - never at "model finished" time. That signal
              // arrives early on some voices and very late on others
              // (the estimate fallback), which made the beep feel
              // random: too soon, too late, or as the slide loaded.
              playDing();
              timerRef.current = setTimeout(() => {
                if (token.cancelled || runRef.current !== run) return;
                setError(null);
                void speechRef.current.start();
              }, 250);
            });
          } else if (current.supported === false) {
            setPhase('selfmark');
          } else if (attemptsLeft > 0) {
            timerRef.current = setTimeout(() => tryStart(attemptsLeft - 1), 500);
          } else {
            // Support still unknown: show the manual speak button.
            setPhase('listening');
          }
        };
        tryStart(4);
      });
    },
    [panels, playModelThen]
  );

  const advancePanel = useCallback(
    (idx: number, result: { score: SpeechScore | null; passed: boolean }) => {
      clearTimer();
      setResults((prev) => ({ ...prev, [idx]: result }));
      if (idx + 1 < panels.length) {
        setActiveIdx(idx + 1);
        setPhase('playing');
        setError(null);
        setLastScore(null);
        startSequence(idx + 1);
      } else {
        runRef.current++;
        setPhase('done');
      }
    },
    [panels.length, startSequence]
  );

  // Start the sequence on arrival; leaving the slide cancels it.
  // The token is REPLACED on every run of this effect: if a previous
  // cleanup has marked the shared token cancelled (an effect re-run,
  // a dev double-invoke), reusing it would silently kill every
  // sequence that follows and the microphone would never open.
  useEffect(() => {
    const token = { cancelled: false };
    mountTokenRef.current = token;
    startSequence(0);
    return () => {
      token.cancelled = true;
      clearTimer();
      cancelSpeechCue();
      speechRef.current.abort();
    };
  }, [startSequence]);

  // No-voice hint, same reasoning as Speak & Repeat: if any panel
  // relies on the device voice and the browser has none, say so.
  const [noVoices, setNoVoices] = useState(false);
  useEffect(() => {
    if (!panels.some((p) => !p.audio_url)) return;
    let alive = true;
    void probeVoicesAvailable().then((ok) => {
      if (alive) setNoVoices(!ok);
    });
    return () => {
      alive = false;
    };
  }, [panels]);

  const startSpeaking = () => {
    setError(null);
    setLastScore(null);
    setPhase('listening');
    try {
      Speech.stop();
    } catch {
      // TTS is a nicety, never a blocker.
    }
    void speech.start();
  };

  const prompt =
    slide.prompt_text && !slide.prompt_text.startsWith('Tap each')
      ? slide.prompt_text
      : '🎧 Listen, then say each one!';

  return (
    <View>
      <Text className="text-xl font-bold text-[#0A192F] text-center mb-2">{prompt}</Text>
      {!tight || phase === 'done' ? (
        <Text className="text-sm text-slate-400 text-center mb-2">
          {phase === 'done'
            ? 'All of them done — tap Continue below! 🎉'
            : `Sound ${Math.min(activeIdx + 1, panels.length)} of ${panels.length}`}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {panels.map((panel, idx) => {
          const result = results[idx];
          const isActive = phase !== 'done' && idx === activeIdx;
          let borderClass = 'border-inkline';
          let bgClass = 'bg-white';
          if (result) {
            borderClass = result.passed ? 'border-pitch' : 'border-gold';
            bgClass = result.passed ? 'bg-pitch-light/50' : 'bg-gold-light/40';
          } else if (isActive) {
            borderClass = 'border-gold';
            bgClass = 'bg-gold-light/40';
          }
          return (
            <Pressable
              key={panel.id}
              onPress={() => playOrSpeak(panel.audio_url, panel.text)}
              className={`w-[48%] rounded-[20px] border ${borderClass} ${bgClass} p-2 items-center shadow-sm`}
            >
              {panel.media_url ? (
                <FallbackImage
                  key={panel.media_url}
                  uri={panel.media_url}
                  className="w-full rounded-2xl mb-2"
                  height={panelImgH}
                  fallback={
                    <View
                      className="w-full rounded-2xl mb-2 bg-canvas items-center justify-center"
                      style={{ height: panelImgH }}
                    >
                      <Text className="text-3xl">🔊</Text>
                    </View>
                  }
                />
              ) : (
                <View
                  className="w-full rounded-2xl mb-2 bg-canvas items-center justify-center"
                  style={{ height: panelImgH }}
                >
                  <Text className="text-3xl">🔊</Text>
                </View>
              )}
              <Text
                className={`${tight ? 'text-sm' : 'text-base'} font-sans font-bold text-navy text-center`}
              >
                {panel.text}
              </Text>
              <Text className="text-xs text-slate-400 mt-1">
                {result
                  ? result.score
                    ? `✅ ${result.score.accuracy}%`
                    : '✅ Said it'
                  : isActive
                    ? phase === 'playing'
                      ? '🔊 Listen…'
                      : '🎙️ Your turn!'
                    : 'Tap to listen'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {noVoices && phase !== 'done' ? (
        <Text className="text-amber-600 text-xs text-center mt-3">
          🔇 This browser has no voice installed, so the words may stay silent. Chrome, or the
          phone app, can read them aloud.
        </Text>
      ) : null}

      <View className={`items-center mt-3 ${tight ? 'min-h-[40px]' : 'min-h-[52px]'}`}>
        {phase === 'done' ? (
          <Text className="text-lg font-bold text-emerald-600">🎉 Great speaking!</Text>
        ) : phase === 'playing' ? (
          <Text className="text-slate-400">🔊 Listen…</Text>
        ) : phase === 'selfmark' ? (
          <View className="items-center">
            <Text className="text-slate-500 text-sm text-center mb-2">
              🎙️ This device can&apos;t check speech. Say it out loud, then tap:
            </Text>
            <Pressable
              onPress={() => advancePanel(activeIdx, { score: null, passed: true })}
              className="px-6 py-3 bg-emerald-600 rounded-full"
            >
              <Text className="text-white font-bold text-base">✅ I said it</Text>
            </Pressable>
          </View>
        ) : phase === 'feedback' ? (
          <View className="items-center w-full">
            {lastScore ? (
              <>
                <Text
                  className={`text-3xl font-bold ${
                    lastScore.passed ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {lastScore.accuracy}%
                </Text>
                <Text className="text-sm font-bold text-slate-600 mt-1">
                  {scoreMessage(lastScore.accuracy)}
                </Text>
                {lastScore.passed ? (
                  <Text className="text-slate-400 text-sm mt-2">⭐ Great! Next one coming…</Text>
                ) : (
                  <View className="flex-row gap-3 mt-3">
                    <Pressable onPress={startSpeaking} className="px-5 py-3 bg-navy border-b-4 border-navy-deep rounded-full">
                      <Text className="text-white font-bold text-sm">🎙️ Try Again</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => advancePanel(activeIdx, { score: lastScore, passed: false })}
                      className="px-5 py-3 bg-white border border-inkline rounded-full"
                    >
                      <Text className="text-slate-600 font-bold text-sm">Next ➡️</Text>
                    </Pressable>
                  </View>
                )}
              </>
            ) : (
              <>
                {error ? (
                  <Text className="text-red-500 text-sm text-center mb-2 max-w-md">
                    {speechErrorMessage(error)}
                  </Text>
                ) : null}
                <View className="flex-row gap-3">
                  <Pressable onPress={startSpeaking} className="px-5 py-3 bg-navy border-b-4 border-navy-deep rounded-full">
                    <Text className="text-white font-bold text-sm">🎙️ Try Again</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => advancePanel(activeIdx, { score: null, passed: true })}
                    className="px-5 py-3 bg-white border border-inkline rounded-full"
                  >
                    <Text className="text-slate-600 font-bold text-sm">✅ I said it — Next</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        ) : speech.listening ? (
          <View className="items-center">
            <Pressable onPress={speech.stop} className="px-6 py-3 bg-red-500 rounded-full mb-2">
              <Text className="text-white font-bold text-base">⏹ Listening… tap when done</Text>
            </Pressable>
            {speech.interim ? (
              <Text className="text-slate-500 italic text-center">
                &quot;{speech.interim}&quot;
              </Text>
            ) : (
              <Text className="text-slate-400">Say it now 🎧</Text>
            )}
          </View>
        ) : (
          <Pressable onPress={startSpeaking} className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full">
            <Text className="text-navy font-bold text-base">🎙️ Tap to Speak</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function SpeakRepeatSlide({
  slide,
  attempt,
  playOrSpeak,
  playModelThen,
  visitKey,
  imageHeight,
  onAnswered,
  onRetry,
}: {
  slide: Slide;
  attempt: SlideAttempt;
  imageHeight: number;
  playOrSpeak: (url: string | null | undefined, text: string | null | undefined) => void;
  playModelThen: (
    url: string | null | undefined,
    text: string | null | undefined,
    onDone: () => void
  ) => void;
  visitKey: number;
  onAnswered: (
    slide: Slide,
    correct: boolean,
    result: { transcript: string; score: SpeechScore } | null
  ) => void;
  onRetry: (slide: Slide) => void;
}) {
  const target = slide.correct_answer || slide.prompt_text || '';
  const instruction =
    slide.prompt_text && slide.prompt_text !== target ? slide.prompt_text : null;
  const [error, setError] = useState<SpeechCheckError | null>(null);

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      setError(null);
      const score = scoreSpeech(target, transcript);
      onAnswered(slide, score.passed, { transcript, score });
    },
    onError: (speechError) => setError(speechError),
  });

  const startSpeaking = () => {
    setError(null);
    try {
      Speech.stop();
    } catch {
      // TTS is a nicety, never a blocker.
    }
    void speech.start();
  };

  // The latest speech-check state, readable from timers without
  // making the auto-flow effect depend on the hook object's identity.
  const speechRef = useRef(speech);
  useEffect(() => {
    speechRef.current = speech;
  });

  // Hands-free flow: when the slide arrives, the model line plays by
  // itself; a ding then marks the learner's turn and the microphone
  // opens on its own (it closes by itself when they finish speaking).
  // Everything fails soft - Listen and Tap to Speak stay as the
  // manual path, and leaving the slide cancels the whole sequence.
  useEffect(() => {
    if (attempt.answered) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    playModelThen(slide.audio_url, target, () => {
      if (cancelled) return;
      const tryStart = (attemptsLeft: number) => {
        if (cancelled) return;
        const current = speechRef.current;
        if (current.supported) {
          try {
            Speech.stop();
          } catch {
            // TTS is a nicety, never a blocker.
          }
          // Wait for the model voice to be genuinely silent before
          // opening the mic (see waitUntilSafeToListen): a "done"
          // event can arrive while the last word is still playing,
          // and the idle flags can drop early too, so a word-count
          // duration floor applies as well.
          void waitUntilSafeToListen().then(() => {
            if (cancelled) return;
            // Ding HERE, a fixed beat before the mic opens - see
            // GridSpeakSlide: dinging at "model finished" time made
            // the beep feel random because that signal's timing
            // varies wildly between voices.
            playDing();
            timer = setTimeout(() => {
              if (cancelled) return;
              setError(null);
              void speechRef.current.start();
            }, 250);
          });
        } else if (current.supported === null && attemptsLeft > 0) {
          // The recogniser is still reporting whether it exists.
          timer = setTimeout(() => tryStart(attemptsLeft - 1), 500);
        }
      };
      tryStart(4);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      cancelSpeechCue();
      // Never leave a recognition session running into the next
      // slide: a leftover session makes the next start collide with
      // it and the new slide hears nothing.
      speechRef.current.abort();
    };
  }, [visitKey, attempt.answered, playModelThen, slide.audio_url, target]);

  // When the line can only be heard through the device voice (no
  // recorded audio), find out whether this browser has a voice at
  // all - with none installed, Listen is silent and the learner
  // deserves to know why.
  const [noVoices, setNoVoices] = useState(false);
  useEffect(() => {
    if (slide.audio_url) return;
    let alive = true;
    void probeVoicesAvailable().then((ok) => {
      if (alive) setNoVoices(!ok);
    });
    return () => {
      alive = false;
    };
  }, [slide.audio_url]);

  return (
    <View className="items-center">
      {slide.media_url ? (
        <FallbackImage
          uri={slide.media_url}
          className="w-full rounded-2xl mb-4"
          height={imageHeight}
        />
      ) : null}
      {instruction ? (
        <Text className="font-sans text-lg text-slate-500 text-center mb-2">{instruction}</Text>
      ) : null}
      <Text className="text-sm text-slate-400 mb-1">Listen, then say it out loud:</Text>
      <Text className="font-display text-3xl font-semibold text-navy text-center mb-6">{target}</Text>

      <Pressable
        onPress={() => playOrSpeak(slide.audio_url, target)}
        className="px-6 py-3 bg-navy border-b-4 border-navy-deep rounded-full mb-6"
      >
        <Text className="text-white font-bold text-base">🔊 Listen</Text>
      </Pressable>

      {noVoices ? (
        <Text className="text-amber-600 text-xs text-center max-w-md mb-6 -mt-3">
          🔇 This browser has no voice installed, so Listen may stay silent. Chrome, or
          the phone app, can read the line aloud.
        </Text>
      ) : null}

      {attempt.answered && attempt.speechResult ? (
        <View className="w-full items-center">
          <SpeechScoreView score={attempt.speechResult.score} transcript={attempt.speechResult.transcript} />
          {attempt.wasCorrect ? (
            <Text className="text-slate-400 text-sm mt-4">⭐ Great! Moving to the next slide…</Text>
          ) : (
            <>
              <Text className="text-slate-400 text-sm mt-4 text-center">
                🔁 This one will come back at the end of the lesson.
              </Text>
              <Pressable onPress={() => onRetry(slide)} className="px-6 py-3 mt-3 bg-navy border-b-4 border-navy-deep rounded-full">
                <Text className="text-white font-bold text-base">🎙️ Try Again Now</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : attempt.answered ? (
        <Text className="text-lg font-bold text-emerald-600">✅ You said it! Moving on…</Text>
      ) : speech.supported === null ? (
        <ActivityIndicator size="large" color="#0A192F" />
      ) : speech.supported === false ? (
        <View className="items-center">
          <View className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 max-w-md mb-4">
            <Text className="text-amber-700 text-sm text-center">
              🎙️ This device or browser can&apos;t check speech automatically. Say the phrase out
              loud, then tap below.
            </Text>
          </View>
          <Pressable
            onPress={() => onAnswered(slide, true, null)}
            className="px-8 py-4 bg-pitch rounded-full"
          >
            <Text className="text-white font-bold text-base">✅ I said it out loud</Text>
          </Pressable>
        </View>
      ) : (
        <View className="items-center w-full">
          {speech.listening ? (
            <>
              <Pressable onPress={speech.stop} className="px-8 py-4 bg-red-500 rounded-full mb-3">
                <Text className="text-white font-bold text-base">⏹ Listening… tap when done</Text>
              </Pressable>
              {speech.interim ? (
                <Text className="text-slate-500 italic text-center">&quot;{speech.interim}&quot;</Text>
              ) : (
                <Text className="text-slate-400 text-center">Say the phrase now 🎧</Text>
              )}
            </>
          ) : (
            <Pressable onPress={startSpeaking} className="px-8 py-4 bg-gold border-b-4 border-gold-dark rounded-full">
              <Text className="text-navy font-bold text-lg">🎙️ Tap to Speak</Text>
            </Pressable>
          )}
          {error ? (
            <View className="items-center mt-4 max-w-md">
              <Text className="text-red-500 text-sm text-center mb-2">
                {speechErrorMessage(error)}
              </Text>
              <Pressable onPress={() => onAnswered(slide, true, null)}>
                <Text className="text-slate-400 font-bold underline text-sm">
                  ✅ I said it out loud instead
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

export default function LessonPlayer() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  // The audio player is created lazily on the first tap (see playAudio):
  // the useAudioPlayer hook constructs a web Audio object during render,
  // which crashes server-side rendering ("Audio is not defined").
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  // Play order for this run. Starts as every slide in order; a scored
  // slide answered wrong is appended to the end and comes back, again
  // and again, until it is answered right - so `queue` can grow while
  // `queuePos` walks it.
  const [queue, setQueue] = useState<number[]>([]);
  const [queuePos, setQueuePos] = useState(0);
  // First-attempt result per scored slide: this is the honest score
  // (stars, stats) even though practice continues until mastery.
  const [firstResults, setFirstResults] = useState<Record<string, boolean>>({});
  // Slides fully dealt with, for the progress bar.
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  // How many slides had to come back for another try.
  const [practiceRounds, setPracticeRounds] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, SlideAttempt>>({});
  const [finished, setFinished] = useState(false);
  // Red-words review: the FIRST speech score per slide is kept here (the
  // attempts map itself is reset whenever a slide is re-queued), and the
  // tricky-words practice opens from the completion screen.
  const firstSpeechRef = useRef<Record<string, SpeechScore>>({});
  const [trickyWords, setTrickyWords] = useState<TrickyWord[]>([]);
  const [showTricky, setShowTricky] = useState(false);
  const [trickyFixed, setTrickyFixed] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  // Badges newly earned by this completion, shown one at a time on the
  // completion screen (badgeIndex walks the queue).
  const [earnedBadges, setEarnedBadges] = useState<AwardedBadge[]>([]);
  const [badgeIndex, setBadgeIndex] = useState(0);
  // Increments on every correct answer to retrigger the star burst.
  const [answerBurstKey, setAnswerBurstKey] = useState(0);

  const startTimeRef = useRef<number>(0); // set on mount in the effect below
  const recordedRef = useRef(false);

  const fetchLessonData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);

      const { data: lessonData, error: lessonError } = await supabase
        .from('curriculum_lessons')
        .select('id, title, module_id')
        .eq('id', id)
        .single();
      if (lessonError) throw lessonError;
      setLesson(lessonData);

      const { data: slideData, error: slideError } = await supabase
        .from('lesson_slides')
        .select('*')
        .eq('lesson_id', id)
        .order('order_index', { ascending: true });
      if (slideError) throw slideError;
      const loadedSlides = (slideData || []) as Slide[];
      setSlides(loadedSlides);
      // (Re)initialise the play queue for this run of the lesson.
      setQueue(loadedSlides.map((_, i) => i));
      setQueuePos(0);
    } catch (error: any) {
      setLoadError(error.message || 'Something went wrong while loading this lesson.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    (async () => {
      await fetchLessonData();
    })();
  }, [fetchLessonData]);

  // Release the lazily created player when the screen unmounts
  // (createAudioPlayer does not manage the lifecycle for us).
  useEffect(() => {
    return () => {
      playerRef.current?.release();
      playerRef.current = null;
      try {
        Speech.stop();
      } catch {
        // TTS is a nicety, never a blocker.
      }
    };
  }, []);

  // Never let the device's voice keep talking over the next slide (or
  // over the completion screen).
  useEffect(() => {
    try {
      Speech.stop();
    } catch {
      // TTS is a nicety, never a blocker.
    }
  }, [queuePos, finished]);

  // Screen-fit sizing: slide pictures and panels scale with the
  // window height so a whole slide stays visible without scrolling
  // on laptops, tablets and phones alike. Floors keep pictures
  // usable on very short (landscape) screens.
  const { height: winH } = useWindowDimensions();
  const compact = winH < 760;
  const tight = winH < 680;
  const shrink = tight ? 0.8 : 1;
  const focusImgH = Math.round(Math.min(256, Math.max(110, winH * 0.3)) * shrink);
  const wideImgH = Math.round(Math.min(208, Math.max(96, winH * 0.24)) * shrink);
  const panelImgH = Math.round(Math.min(100, Math.max(48, winH * 0.12)) * shrink);

  const playAudio = useCallback((url: string | null | undefined) => {
    if (!url) return;
    try {
      if (!playerRef.current) {
        playerRef.current = createAudioPlayer({ uri: url });
      } else {
        playerRef.current.replace({ uri: url });
      }
      playerRef.current.play();
    } catch (error) {
      console.log('Audio playback error:', error);
    }
  }, []);

  // Text-to-speech fallback: lessons whose slides carry no recorded
  // audio (every demo lesson, and any admin lesson built without
  // uploads) would otherwise be completely silent. The device's voice
  // reads the text aloud instead, in English.
  const speakText = useCallback((text: string | null | undefined) => {
    const spoken = toSpeechText(text || '');
    if (!spoken) return;
    try {
      Speech.stop();
      Speech.speak(spoken, { language: 'en' });
    } catch (error) {
      console.log('Speech error:', error);
    }
  }, []);

  // Recorded audio wins whenever a slide actually has some; only an
  // empty audio_url falls back to speaking the text.
  const playOrSpeak = useCallback(
    (url: string | null | undefined, text: string | null | undefined) => {
      if (url) {
        playAudio(url);
      } else {
        speakText(text);
      }
    },
    [playAudio, speakText]
  );

  // Hands-free variant of playOrSpeak for speaking slides: plays the
  // model line and calls onDone when the line is over, so the slide
  // can ding and open the microphone at exactly the right moment.
  // Recorded audio is watched via the player until it stops; the
  // device voice reports its own completion. A generous cap keeps a
  // stuck player from ever stalling the flow.
  const playModelThen = useCallback(
    (
      url: string | null | undefined,
      text: string | null | undefined,
      onDone: () => void
    ) => {
      if (!url) {
        speakWithCallback(text || '', onDone);
        return;
      }
      playAudio(url);
      const player = playerRef.current;
      if (!player) {
        onDone();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        onDone();
      };
      let started = false;
      const poll = setInterval(() => {
        try {
          if (player.playing || player.currentTime > 0) started = true;
          if (started && !player.playing) {
            clearInterval(poll);
            finish();
          }
        } catch {
          clearInterval(poll);
          finish();
        }
      }, 250);
      setTimeout(() => {
        clearInterval(poll);
        finish();
      }, 15000);
    },
    [playAudio]
  );

  const feedbackHaptic = useCallback((correct: boolean) => {
    if (Platform.OS === 'web') return;
    try {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    } catch {
      // Haptics are a nicety, never a blocker.
    }
  }, []);

  const updateAttempt = useCallback((slideId: string, patch: Partial<SlideAttempt>) => {
    setAttempts((prev) => ({
      ...prev,
      [slideId]: { ...(prev[slideId] || EMPTY_ATTEMPT), ...patch },
    }));
  }, []);

  const currentSlideIndex: number | undefined = queue[queuePos];
  const currentSlide: Slide | undefined =
    currentSlideIndex !== undefined ? slides[currentSlideIndex] : undefined;
  const currentAttempt: SlideAttempt =
    (currentSlide && attempts[currentSlide.id]) || EMPTY_ATTEMPT;

  // Animated progress bar: the fill glides to the new width (~400ms)
  // instead of jumping when the student moves between slides. Progress
  // counts slides fully dealt with, so practice rounds at the end do
  // not drag the bar backwards.
  const progressPct = slides.length > 0 ? (completedIds.length / slides.length) * 100 : 0;
  const progressSV = useSharedValue(0);
  useEffect(() => {
    progressSV.set(withTiming(progressPct, { duration: 400 }));
  }, [progressPct, progressSV]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressSV.value}%` }));

  // Slide-card answer feedback: a happy scale pulse (+ star burst) when
  // an answer is correct, a gentle shake when it is wrong. Purely visual -
  // scoring lives in the attempt state and is untouched by this.
  const cardScale = useSharedValue(1);
  const cardShakeX = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cardShakeX.value }, { scale: cardScale.value }],
  }));
  const feedbackAnim = useCallback(
    (correct: boolean) => {
      if (correct) {
        cardScale.set(
          withSequence(
            withSpring(1.02, { damping: 10, stiffness: 300 }),
            withSpring(1, { damping: 12, stiffness: 260 })
          )
        );
        setAnswerBurstKey((k) => k + 1);
      } else {
        cardShakeX.set(
          withSequence(
            withTiming(-8, { duration: 55 }),
            withTiming(8, { duration: 55 }),
            withTiming(-6, { duration: 55 }),
            withTiming(6, { duration: 55 }),
            withTiming(0, { duration: 60 })
          )
        );
      }
    },
    [cardScale, cardShakeX]
  );

  // The first attempt at each scored slide is recorded once and never
  // overwritten: it is the score the completion screen and the stats
  // use, even though a missed slide keeps coming back until the
  // student gets it right.
  const recordFirstResult = useCallback((slideId: string, correct: boolean) => {
    setFirstResults((prev) => (slideId in prev ? prev : { ...prev, [slideId]: correct }));
  }, []);

  const firstScore = useCallback(() => {
    let correct = 0;
    let total = 0;
    for (const slide of slides) {
      if (!SCORED_TYPES.includes(slide.slide_type)) continue;
      if (slide.id in firstResults) {
        total += 1;
        if (firstResults[slide.id]) correct += 1;
      }
    }
    return { correct, total };
  }, [slides, firstResults]);

  const recordCompletion = useCallback(
    async (correct: number, total: number) => {
      if (recordedRef.current || !lesson) return;
      recordedRef.current = true;

      const duration = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
      setDurationSeconds(duration);

      const identity = await getStudentIdentity();
      if (!identity) return; // Nobody signed in: nothing to record against.

      // lesson_completions exists only once migration 20261115000006 has been
      // run, so fail soft: log and continue to the completion screen.
      const { error: completionError } = await supabase.from('lesson_completions').insert([
        {
          student_id: identity.studentId,
          student_kind: identity.studentKind,
          lesson_id: lesson.id,
          module_id: lesson.module_id,
          score_correct: correct,
          score_total: total,
          duration_seconds: duration,
        },
      ]);
      if (completionError) {
        console.log('Lesson completion not recorded:', completionError.message);
      }

      // Same identity in activity_logs so admin/manager stats can unify both
      // populations. PIN-student inserts may be blocked by the current
      // activity_logs RLS (no session to attach); Phase 2 adds an RPC.
      const { error: activityError } = await supabase.from('activity_logs').insert([
        {
          student_id: identity.studentId,
          activity_type: 'lesson_slide',
          target_id: lesson.id,
          duration_seconds: duration,
        },
      ]);
      if (activityError) {
        console.log('Lesson activity not logged:', activityError.message);
      }

      // Badge awarding (lesson/module conditions). Runs whether the
      // writes above landed or failed soft, and itself fails soft. The
      // evaluators return any badges that were genuinely NEW so the
      // completion screen can celebrate them.
      const lessonBadges = await awardLessonBadges(identity, lesson);

      // A finished lesson is also a day of activity: re-evaluate streak
      // badges against the now-updated activity days. Fails soft.
      const streakBadges = await evaluateStreakBadges(identity);

      // XP & Stars (migration 18, fails soft): finishing pays XP once per
      // lesson, with an accuracy bonus; finishing on a chosen study day
      // also pays the study-day stars, once per day.
      const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;
      await awardPoints(
        identity,
        'lesson_complete',
        POINTS.LESSON_XP + Math.round(accuracyPct / 10),
        0,
        lesson.id
      );
      if (await isTodayAStudyDay(identity)) {
        await awardPoints(identity, 'study_day', 0, POINTS.STUDY_DAY_STARS, new Date().toISOString().slice(0, 10));
      }

      const freshBadges = [...lessonBadges, ...streakBadges];
      if (freshBadges.length > 0) {
        setEarnedBadges(freshBadges);
        setBadgeIndex(0);
      }
    },
    [lesson]
  );

  const finishLesson = useCallback(async () => {
    const { correct, total } = firstScore();
    // Red words from the FIRST attempt at each speaking slide — words the
    // scorer marked wrong or missing ("close" orange words are already
    // fine and stay out). Computed here, not at render time.
    const byWord = new Map<string, TrickyWord>();
    for (const slide of slides) {
      if (slide.slide_type !== 'speak_repeat') continue;
      const score = firstSpeechRef.current[slide.id];
      if (!score) continue;
      for (const w of score.words) {
        if (w.status !== 'wrong' && w.status !== 'missing') continue;
        const key = w.word.toLowerCase();
        if (!byWord.has(key)) byWord.set(key, { word: w.word, heard: w.heard });
      }
    }
    setTrickyWords([...byWord.values()].slice(0, 8));
    await recordCompletion(correct, total);
    setFinished(true);
  }, [firstScore, recordCompletion, slides]);

  // Move on from the current slide. A scored slide answered wrong is
  // appended to the end of the queue (and its attempt reset) so it
  // comes back for another try; the lesson only finishes when the
  // queue runs out, which means every scored slide has been answered
  // right at least once. Skipping is the one explicit way past a
  // slide without mastering it.
  const advance = useCallback(
    async (opts?: { skipped?: boolean }) => {
      if (!currentSlide || currentSlideIndex === undefined) return;
      const attempt = attempts[currentSlide.id] || EMPTY_ATTEMPT;
      const isScoredSlide = SCORED_TYPES.includes(currentSlide.slide_type);
      const needsRetry =
        isScoredSlide && !opts?.skipped && attempt.answered && attempt.wasCorrect === false;

      if (!needsRetry) {
        setCompletedIds((prev) =>
          prev.includes(currentSlide.id) ? prev : [...prev, currentSlide.id]
        );
      }

      let nextQueue = queue;
      if (needsRetry) {
        nextQueue = [...queue, currentSlideIndex];
        setQueue(nextQueue);
        setPracticeRounds((r) => r + 1);
        setAttempts((prev) => ({ ...prev, [currentSlide.id]: EMPTY_ATTEMPT }));
      }

      if (queuePos < nextQueue.length - 1) {
        setQueuePos(queuePos + 1);
      } else {
        await finishLesson();
      }
    },
    [currentSlide, currentSlideIndex, attempts, queue, queuePos, finishLesson]
  );

  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  // Auto-advance: once a scored slide is answered, let the feedback
  // sit briefly, then move on by itself - no Continue button to hunt
  // for. A wrong answer lingers longer so the student can read the
  // right answer before the slide goes to the back of the queue.
  const currentSlideId = currentSlide?.id;
  const currentAnswered = currentAttempt.answered;
  const currentWasCorrect = currentAttempt.wasCorrect;
  const currentIsScored = currentSlide ? SCORED_TYPES.includes(currentSlide.slide_type) : false;
  const currentIsSpeak = currentSlide?.slide_type === 'speak_repeat';
  useEffect(() => {
    if (finished || !currentIsScored || !currentAnswered) return;
    // A missed speaking slide needs longer: the learner has to read
    // the word-by-word feedback AND still have time to tap
    // "Try Again Now" before the slide re-queues - at 3s it vanished
    // first, which felt like the whole lesson had reset.
    const delay = currentWasCorrect ? 1500 : currentIsSpeak ? 6500 : 3000;
    const timer = setTimeout(() => {
      void advanceRef.current();
    }, delay);
    return () => clearTimeout(timer);
  }, [finished, currentIsScored, currentAnswered, currentWasCorrect, currentIsSpeak, currentSlideId, queuePos]);

  const handleExit = useCallback(() => {
    if (finished) {
      router.back();
      return;
    }
    const exitAction = () => router.back();
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to quit? You will lose your progress.')) {
        exitAction();
      }
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert('Quit Lesson?', 'You will lose your current progress.', [
        { text: 'Keep Learning', style: 'cancel' },
        { text: 'Quit', style: 'destructive', onPress: exitAction },
      ]);
    }
  }, [finished, router]);

  const handlePanelTap = useCallback(
    (slide: Slide, panel: SlidePanel) => {
      if (slide.slide_type === 'quiz_4up') {
        // A quiz tap speaks the finished sentence ("We are a team of
        // eleven."), not just the tapped word ("team").
        const sentence = completedSentence(slide.prompt_text, panel.text);
        if (sentence) {
          speakText(sentence);
        } else {
          playOrSpeak(panel.audio_url, panel.text);
        }
      } else {
        playOrSpeak(panel.audio_url, panel.text);
      }
      const attempt = attempts[slide.id] || EMPTY_ATTEMPT;

      if (slide.slide_type === 'grid_4up') {
        if (!attempt.exploredPanelIds.includes(panel.id)) {
          updateAttempt(slide.id, {
            exploredPanelIds: [...attempt.exploredPanelIds, panel.id],
          });
        }
        return;
      }

      if (slide.slide_type === 'quiz_4up' && !attempt.answered) {
        const correct = panel.is_correct === true;
        feedbackHaptic(correct);
        feedbackAnim(correct);
        recordFirstResult(slide.id, correct);
        updateAttempt(slide.id, {
          answered: true,
          wasCorrect: correct,
          selectedPanelId: panel.id,
        });
      }
    },
    [attempts, playOrSpeak, speakText, feedbackHaptic, feedbackAnim, updateAttempt, recordFirstResult]
  );

  const handleTypingCheck = useCallback(
    (slide: Slide) => {
      const attempt = attempts[slide.id] || EMPTY_ATTEMPT;
      if (attempt.answered) return;
      const correct =
        normalizeAnswer(attempt.typingValue) === normalizeAnswer(slide.correct_answer || '');
      feedbackHaptic(correct);
      feedbackAnim(correct);
      recordFirstResult(slide.id, correct);
      updateAttempt(slide.id, { answered: true, wasCorrect: correct });
    },
    [attempts, feedbackHaptic, feedbackAnim, updateAttempt, recordFirstResult]
  );

  const handleSpeechAnswered = useCallback(
    (
      slide: Slide,
      correct: boolean,
      result: { transcript: string; score: SpeechScore } | null
    ) => {
      const attempt = attempts[slide.id] || EMPTY_ATTEMPT;
      if (attempt.answered) return;
      feedbackHaptic(correct);
      feedbackAnim(correct);
      recordFirstResult(slide.id, correct);
      if (result && !firstSpeechRef.current[slide.id]) {
        firstSpeechRef.current[slide.id] = result.score;
      }
      updateAttempt(slide.id, { answered: true, wasCorrect: correct, speechResult: result });
    },
    [attempts, feedbackHaptic, feedbackAnim, updateAttempt, recordFirstResult]
  );

  // "Try Again Now" on a speaking slide: clear the attempt in place so
  // the student can immediately have another go (this also cancels
  // the pending auto-advance, whose effect watches `answered`).
  const handleSpeechRetry = useCallback(
    (slide: Slide) => {
      setAttempts((prev) => ({ ...prev, [slide.id]: EMPTY_ATTEMPT }));
    },
    []
  );

  // ---- Render helpers -------------------------------------------------------

  const renderPanel = (slide: Slide, panel: SlidePanel) => {
    const attempt = attempts[slide.id] || EMPTY_ATTEMPT;
    const isQuiz = slide.slide_type === 'quiz_4up';
    const selected = attempt.selectedPanelId === panel.id;
    const explored = attempt.exploredPanelIds.includes(panel.id);

    let borderClass = 'border-inkline';
    let bgClass = 'bg-white';
    if (isQuiz && attempt.answered && panel.is_correct) {
      borderClass = 'border-pitch';
      bgClass = 'bg-pitch-light/50';
    } else if (isQuiz && attempt.answered && selected && !panel.is_correct) {
      borderClass = 'border-red-400';
      bgClass = 'bg-red-50';
    } else if (selected || explored) {
      borderClass = 'border-gold';
      bgClass = 'bg-gold-light/40';
    }

    return (
      <Pressable
        key={panel.id}
        onPress={() => handlePanelTap(slide, panel)}
        className={`w-[48%] rounded-[20px] border ${borderClass} ${bgClass} p-3 items-center shadow-sm`}
      >
        {panel.media_url ? (
          <FallbackImage
            key={panel.media_url}
            uri={panel.media_url}
            className="w-full rounded-2xl mb-2"
            height={panelImgH}
            fallback={
              <View
                className="w-full rounded-2xl mb-2 bg-canvas items-center justify-center"
                style={{ height: panelImgH }}
              >
                <Text className="text-3xl">🔊</Text>
              </View>
            }
          />
        ) : (
          <View
            className="w-full rounded-2xl mb-2 bg-canvas items-center justify-center"
            style={{ height: panelImgH }}
          >
            <Text className="text-3xl">🔊</Text>
          </View>
        )}
        <Text className="font-sans text-base font-bold text-navy text-center">{panel.text}</Text>
        <Text className="text-xs text-slate-400 mt-1">Tap to listen</Text>
      </Pressable>
    );
  };

  const renderSlide = (slide: Slide) => {
    const attempt = attempts[slide.id] || EMPTY_ATTEMPT;
    const panels = slide.options?.panels || [];

    if (slide.slide_type === 'focus_1up') {
      return (
        <View className="items-center">
          {slide.media_url ? (
            <FallbackImage
              key={slide.media_url}
              uri={slide.media_url}
              className="w-full rounded-2xl mb-4"
              height={focusImgH}
            />
          ) : null}
          {slide.prompt_text ? (
            <Text className="font-sans text-lg text-slate-500 text-center mb-2">{slide.prompt_text}</Text>
          ) : null}
          {slide.correct_answer ? (
            <Text className="font-display text-3xl font-semibold text-navy text-center mb-4">
              {slide.correct_answer}
            </Text>
          ) : null}
          {slide.audio_url || slide.correct_answer || slide.prompt_text ? (
            <Pressable
              onPress={() =>
                playOrSpeak(slide.audio_url, slide.correct_answer || slide.prompt_text)
              }
              className="px-6 py-3 bg-navy border-b-4 border-navy-deep rounded-full"
            >
              <Text className="text-white font-bold text-base">🔊 Listen</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    if (slide.slide_type === 'grid_4up') {
      return (
        <GridSpeakSlide
          key={slide.id}
          slide={slide}
          playOrSpeak={playOrSpeak}
          playModelThen={playModelThen}
          panelImgH={panelImgH}
          tight={tight}
        />
      );
    }

    if (slide.slide_type === 'quiz_4up') {
      return (
        <View>
          {slide.prompt_text ? (
            <Text className="font-display text-2xl font-semibold text-navy text-center mb-3">
              {slide.prompt_text}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {panels.map((panel) => renderPanel(slide, panel))}
          </View>
          {attempt.answered ? (
            <Text
              className={`text-center text-lg font-bold mt-4 ${
                attempt.wasCorrect ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {attempt.wasCorrect ? 'Correct! Well done.' : 'Not quite - the green one is right.'}
            </Text>
          ) : (
            <Text className="text-center text-sm text-slate-400 mt-4">
              {slide.slide_type === 'quiz_4up'
                ? 'Tap the correct answer.'
                : 'Tap the picture that matches.'}
            </Text>
          )}
        </View>
      );
    }

    if (slide.slide_type === 'speak_repeat') {
      return (
        <SpeakRepeatSlide
          key={slide.id}
          slide={slide}
          attempt={attempt}
          playOrSpeak={playOrSpeak}
          playModelThen={playModelThen}
          visitKey={queuePos}
          imageHeight={wideImgH}
          onAnswered={handleSpeechAnswered}
          onRetry={handleSpeechRetry}
        />
      );
    }

    if (slide.slide_type === 'typing') {
      // Two shapes: "Type this sentence:" slides keep the sentence in
      // correct_answer - it must be SHOWN (learners copy what they
      // see) and Listen must read the sentence, not the instruction.
      // "Type the missing word: The ___ ..." slides carry the gapped
      // sentence inside the prompt; the answer stays hidden there.
      const prompt = slide.prompt_text || '';
      const isGap = prompt.includes('___');
      const isInstruction = !isGap && /type/i.test(prompt) && prompt.length < 60;
      const gapSplit = isGap ? prompt.indexOf(': ') : -1;
      const gapInstruction = gapSplit > 0 ? prompt.slice(0, gapSplit + 1) : null;
      const gapSentence = gapSplit > 0 ? prompt.slice(gapSplit + 2) : null;
      const listenText = isGap
        ? prompt
        : isInstruction
          ? slide.correct_answer
          : prompt || slide.correct_answer;
      return (
        <View className="items-center">
          {slide.media_url ? (
            <FallbackImage
              key={slide.media_url}
              uri={slide.media_url}
              className="w-full rounded-2xl mb-4"
              height={wideImgH}
            />
          ) : null}
          {isGap ? (
            <>
              {gapInstruction ? (
                <Text className="text-lg text-slate-500 text-center mb-2">{gapInstruction}</Text>
              ) : null}
              <Text className="font-display text-2xl font-semibold text-navy text-center mb-4">
                {gapSentence || prompt}
              </Text>
            </>
          ) : (
            <>
              {prompt ? (
                <Text className="text-lg text-slate-500 text-center mb-2">{prompt}</Text>
              ) : null}
              {isInstruction && slide.correct_answer ? (
                <Text className="font-display text-2xl font-semibold text-navy text-center mb-4">
                  {slide.correct_answer}
                </Text>
              ) : null}
            </>
          )}
          {slide.audio_url || listenText ? (
            <Pressable
              onPress={() => playOrSpeak(slide.audio_url, listenText)}
              className="px-6 py-3 bg-navy border-b-4 border-navy-deep rounded-full mb-4"
            >
              <Text className="text-white font-bold text-base">🔊 Listen</Text>
            </Pressable>
          ) : null}
          <TextInput
            className="w-full bg-white border border-inkline rounded-2xl p-4 font-sans text-lg text-slate-800 mb-4"
            placeholder={isGap ? 'Type the missing word here' : 'Type the sentence here'}
            value={attempt.typingValue}
            onChangeText={(text) => updateAttempt(slide.id, { typingValue: text })}
            editable={!attempt.answered}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!attempt.answered ? (
            <Pressable
              onPress={() => handleTypingCheck(slide)}
              className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full"
            >
              <Text className="text-navy font-bold text-base">Check Answer</Text>
            </Pressable>
          ) : (
            <View className="items-center">
              <Text
                className={`text-lg font-bold ${
                  attempt.wasCorrect ? 'text-emerald-600' : 'text-red-500'
                }`}
              >
                {attempt.wasCorrect ? 'Correct! Well done.' : 'Not quite.'}
              </Text>
              {!attempt.wasCorrect && slide.correct_answer ? (
                <Text className="text-slate-500 mt-2">
                  The answer is: {slide.correct_answer}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      );
    }

    return (
      <View className="items-center">
        <Text className="text-slate-400 text-center">
          This slide type (&quot;{slide.slide_type}&quot;) is not supported by the player yet.
        </Text>
      </View>
    );
  };

  // ---- Top-level states -----------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center p-6">
        <Text className="font-display text-2xl font-semibold text-navy mb-2 text-center">
          Couldn&apos;t load this lesson
        </Text>
        <Text className="text-slate-500 text-center mb-8">{loadError}</Text>
        <Pressable
          onPress={() => {
            (async () => {
              await fetchLessonData();
            })();
          }}
          className="px-6 py-3 bg-navy border-b-4 border-navy-deep rounded-full mb-3"
        >
          <Text className="text-white font-bold">Try Again</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="px-6 py-3">
          <Text className="text-slate-500 font-bold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (finished) {
    const { correct, total } = firstScore();
    const percentage = total > 0 ? Math.round((correct / total) * 100) : null;
    const starCount = percentage === null ? 0 : percentage >= 90 ? 3 : percentage >= 60 ? 2 : 1;
    const currentBadge = earnedBadges[badgeIndex];

    if (showTricky) {
      return (
        <SafeAreaView className="flex-1 bg-canvas items-center justify-center p-6">
          <TrickyWordsPractice
            words={trickyWords}
            lessonId={lesson?.id || ''}
            onClose={(n) => {
              setTrickyFixed(n);
              setShowTricky(false);
            }}
          />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center p-6">
        <View className="mb-2">
          <MascotPair height={130} />
        </View>
        <Text className="font-display text-3xl font-semibold text-navy mb-2 text-center">Lesson Complete!</Text>
        <Text className="font-sans text-lg text-slate-500 text-center mb-2">
          {lesson?.title}
        </Text>
        <PopIn>
          {percentage !== null ? (
            <Text className="text-xl font-bold text-pitch mb-2">
              You got {correct} out of {total} correct ({percentage}%)
            </Text>
          ) : (
            <Text className="text-xl font-bold text-pitch mb-2">Great listening practice!</Text>
          )}
        </PopIn>
        {percentage !== null ? <StarsRow count={starCount} /> : null}
        {practiceRounds > 0 ? (
          <Text className="text-emerald-600 font-bold text-center mb-2">
            💪 You kept practising until every answer was right!
          </Text>
        ) : null}
        <Text className="text-slate-400 mb-6">Time: {formatDuration(durationSeconds)}</Text>
        {currentBadge ? (
          <NewBadgeCard
            key={currentBadge.id}
            badge={currentBadge}
            onDismiss={() => setBadgeIndex((i) => i + 1)}
          />
        ) : null}
        {trickyWords.length > 0 && trickyFixed === null ? (
          <Pressable
            onPress={() => setShowTricky(true)}
            className="w-full max-w-sm px-6 py-4 bg-gold border-b-4 border-gold-dark rounded-full mb-3 items-center"
          >
            <Text className="text-navy font-bold text-base">
              🗣️ Fix {trickyWords.length} tricky word{trickyWords.length > 1 ? 's' : ''} · +2 ⭐ each
            </Text>
          </Pressable>
        ) : null}
        {trickyFixed !== null && trickyFixed > 0 ? (
          <Text className="text-emerald-600 font-bold text-center mb-3">
            ⭐ You fixed {trickyFixed} tricky word{trickyFixed > 1 ? 's' : ''}!
          </Text>
        ) : null}
        {lesson ? <Recommendations lessonId={lesson.id} /> : null}
        <Pressable
          onPress={() => router.replace('/learner/path')}
          className="w-full max-w-sm px-6 py-4 bg-navy border-b-4 border-navy-deep rounded-full mb-3 items-center"
        >
          <Text className="text-white font-bold text-base">Back to Learning Path</Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/learner')}
          className="w-full max-w-sm px-6 py-4 bg-white border border-inkline rounded-full items-center"
        >
          <Text className="text-slate-600 font-bold text-base">Learner Home</Text>
        </Pressable>
        <Celebration visible />
      </SafeAreaView>
    );
  }

  if (!currentSlide) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center p-6">
        <Text className="font-display text-2xl font-semibold text-navy mb-2 text-center">
          No slides yet
        </Text>
        <Text className="text-slate-500 text-center mb-8">
          This lesson doesn&apos;t have any slides yet. Please check back soon.
        </Text>
        <Pressable onPress={() => router.back()} className="px-6 py-3 bg-navy rounded-full">
          <Text className="text-white font-bold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isScored = SCORED_TYPES.includes(currentSlide.slide_type);
  // A scored slide coming back after an earlier miss.
  const isRepeat =
    isScored &&
    firstResults[currentSlide.id] !== undefined &&
    !(currentAttempt.answered && currentAttempt.wasCorrect);
  const isLastInQueue = queuePos >= queue.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 w-full max-w-3xl mx-auto px-4 py-2 md:px-8">
        {/* Top Navigation & Progress Bar */}
        <View className="flex-row items-center justify-between mb-2 pt-2">
          <Pressable
            onPress={handleExit}
            className="h-10 w-10 -ml-1 items-center justify-center rounded-full border border-inkline bg-white"
          >
            <Text className="text-base text-navy font-bold">✕</Text>
          </Pressable>

          <View className="flex-1 h-[10px] bg-gold-light rounded-full mx-4 overflow-hidden">
            <Animated.View
              style={[
                progressStyle,
                { height: '100%', borderRadius: 9999, backgroundColor: '#2E7D32' },
              ]}
            />
          </View>

          <View className="px-3 py-1.5 bg-white rounded-full border border-inkline">
            <Text className="text-xs font-bold text-navy uppercase tracking-wider">
              {completedIds.length} / {slides.length} done
            </Text>
          </View>
        </View>

        {lesson?.title ? (
          <Text className="text-center font-display text-base font-semibold text-navy/60 mb-2">{lesson.title}</Text>
        ) : null}

        {isRepeat ? (
          <View className="items-center mb-3">
            <View className="px-3 py-1 bg-gold-light/60 border border-gold/50 rounded-full">
              <Text className="text-xs font-bold text-gold-dark">
                🔁 Practice again — until it&apos;s right!
              </Text>
            </View>
          </View>
        ) : null}

        {/* Slide Container - wrapped in an Animated.View so a correct
            answer can pulse the card and a wrong one can shake it. */}
        <Animated.View style={[{ flex: 1 }, cardStyle]}>
          <ScrollView
            className="flex-1 bg-white rounded-[24px] border border-inkline shadow-sm"
            contentContainerStyle={{
              padding: compact ? 14 : 20,
              flexGrow: 1,
              justifyContent: 'center',
            }}
          >
            {renderSlide(currentSlide)}
          </ScrollView>
          <AnswerBurst burstKey={answerBurstKey} />
        </Animated.View>

        {/* Footer Navigation. Scored slides move on by themselves
            once answered (see the auto-advance effect); listening
            slides keep a Continue button. */}
        <View className="py-3 items-center">
          {isScored ? (
            currentAttempt.answered ? (
              <Text className="text-slate-400 text-sm">
                {currentAttempt.wasCorrect
                  ? '⭐ Great! Next slide coming…'
                  : '🔁 This slide will come back at the end'}
              </Text>
            ) : (
              <>
                <Text className="text-slate-400 text-sm mb-3">Answer to continue</Text>
                <Pressable
                  onPress={() => {
                    void advance({ skipped: true });
                  }}
                >
                  <Text className="text-slate-400 font-bold underline">Skip this slide</Text>
                </Pressable>
              </>
            )
          ) : (
            <Pressable
              onPress={() => {
                void advance();
              }}
              className="w-full max-w-md px-6 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center"
            >
              <Text className="text-navy font-bold text-lg">
                {isLastInQueue ? 'Finish Lesson' : 'Continue'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
