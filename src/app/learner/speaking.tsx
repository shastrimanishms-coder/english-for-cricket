import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Celebration from '../../components/ui/Celebration';
import { MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import SpeechScoreView from '../../components/ui/SpeechScoreView';
import { scoreSpeech, type SpeechScore } from '../../lib/speechScoring';
import {
  cancelSpeechCue,
  playDing,
  probeVoicesAvailable,
  speakWithCallback,
  toSpeechText,
  waitUntilSafeToListen,
} from '../../lib/speechCue';
import {
  SPEAKING_SCENARIOS,
  learnerLineCount,
  type SpeakingScenario,
} from '../../lib/speakingScenarios';
import { awardExtraIfTagged } from '../../lib/extras';
import { awardPoints, POINTS } from '../../lib/points';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';
import { useActivityLogger } from '../../lib/useActivityLogger';
import { useSafeBack } from '../../lib/useSafeBack';
import {
  speechErrorMessage,
  useSpeechCheck,
  type SpeechCheckError,
} from '../../lib/useSpeechCheck';

interface PracticeItem {
  text: string;
  lessonTitle: string;
}

interface SlideRow {
  lesson_id: string;
  slide_type: string;
  correct_answer: string | null;
  options: { panels?: { text?: string }[] } | null;
}

// Used when the learner has no lesson content yet (or it cannot be
// loaded): a small built-in set of cricket English lines so the screen
// is never empty.
const FALLBACK_ITEMS: PracticeItem[] = [
  'The bowler bowls the ball.',
  'I have a bat and a ball.',
  'How is that, umpire?',
  'We love cricket!',
  'The batter hits the ball to the boundary.',
  'Four runs! Great shot!',
  'Please pass me the ball.',
  'Our team plays cricket on Sunday.',
].map((text) => ({ text, lessonTitle: 'Cricket English' }));

const MAX_ITEMS = 24;

// The AudioRecorder class is not a top-level value export of
// expo-audio - it lives on the native module (AudioRecorder on native,
// AudioRecorderWeb on web), which is exactly where the useAudioRecorder
// hook gets it from. We construct it lazily inside the Record tap
// handler for the same reason the lesson player creates its audio
// player lazily: constructing audio objects during render crashes web
// SSR ("Audio is not defined").
interface RecorderModuleShape {
  AudioRecorder?: new (options: Partial<RecordingOptions>) => AudioRecorder;
  AudioRecorderWeb?: new (options: Partial<RecordingOptions>) => AudioRecorder;
}

export default function SpeakingPractice() {
  const router = useRouter();
  const goBack = useSafeBack();

  const [items, setItems] = useState<PracticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  // The screen opens on a menu: practise lines from your lessons, or
  // role-play a speaking scenario (interview / small talk) where the
  // app plays the other person.
  const [mode, setMode] = useState<'menu' | 'lines' | 'scenario'>('menu');
  const [scenario, setScenario] = useState<SpeakingScenario | null>(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [scenarioDone, setScenarioDone] = useState(false);
  const [scenarioScores, setScenarioScores] = useState<Record<number, number>>({});
  // The full word-by-word score of the learner's best attempt at
  // each scenario turn, so the conversation bubbles above can show
  // their answer colour-coded (green / orange / red per word).
  const [scenarioWordScores, setScenarioWordScores] = useState<Record<number, SpeechScore>>({});
  const wordScoresRef = useRef<Record<number, SpeechScore>>({});
  // Scenario flow is automatic now (no "Your Turn" button): the
  // partner's line ending advances the conversation, and a passed
  // line advances after a short pause. scenarioNext is defined
  // further down; the speech callbacks reach it through this ref.
  const scenarioNextRef = useRef<(() => Promise<void>) | null>(null);
  const passTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The learner's own name, shown in the conversation instead of a
  // generic "You" wherever we know it (PIN students carry their name
  // in the session; email learners in their profile).
  const [learnerName, setLearnerName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getStudentIdentity().then((identity) => {
      if (alive) setLearnerName(identity?.displayName || null);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Recording state for the current item. Recording is strictly
  // best-effort: when the microphone is denied or unsupported,
  // recordSupported flips to false and Listen + say-it-out-loud
  // practice keeps working on its own.
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordSupported, setRecordSupported] = useState(true);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const playbackRef = useRef<AudioPlayer | null>(null);

  // Practice time counts toward the learner's activity stats, like
  // games and videos do. Fails soft inside the hook.
  useActivityLogger({ activityType: 'speaking', targetId: 'speaking-practice' });

  // Build the practice list live from the learner's own lessons:
  // slide words/sentences and panel texts, labelled by lesson.
  useEffect(() => {
    (async () => {
      try {
        const { data: lessonRows, error: lessonError } = await supabase
          .from('curriculum_lessons')
          .select('id, title');
        if (lessonError) throw lessonError;

        const titleById = new Map((lessonRows || []).map((l) => [l.id, l.title]));
        const built: PracticeItem[] = [];
        const seen = new Set<string>();
        const addLine = (raw: string | null | undefined, lessonId: string) => {
          const text = (raw || '').trim();
          const key = text.toLowerCase();
          if (!text || seen.has(key) || built.length >= MAX_ITEMS) return;
          seen.add(key);
          built.push({ text, lessonTitle: titleById.get(lessonId) || 'Lesson' });
        };

        if (lessonRows && lessonRows.length > 0) {
          const { data: slideRows, error: slideError } = await supabase
            .from('lesson_slides')
            .select('lesson_id, slide_type, correct_answer, options')
            .in(
              'lesson_id',
              lessonRows.map((l) => l.id)
            )
            .order('order_index', { ascending: true });
          if (slideError) throw slideError;

          for (const slide of (slideRows || []) as SlideRow[]) {
            if (
              slide.slide_type === 'focus_1up' ||
              slide.slide_type === 'typing' ||
              slide.slide_type === 'speak_repeat'
            ) {
              addLine(slide.correct_answer, slide.lesson_id);
            } else if (slide.slide_type === 'grid_4up' || slide.slide_type === 'quiz_4up') {
              for (const panel of slide.options?.panels || []) {
                addLine(panel.text, slide.lesson_id);
              }
            }
          }
        }

        setItems(built.length > 0 ? built : FALLBACK_ITEMS);
      } catch (error) {
        console.log('Speaking practice content failed to load:', error);
        setItems(FALLBACK_ITEMS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Speaking scenarios: the admin-managed table wins when it has
  // published rows; the built-in starter library is the fallback so
  // the menu is never empty (e.g. before migration 15 is run).
  const [dbScenarios, setDbScenarios] = useState<SpeakingScenario[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        let { data, error } = await supabase
          .from('speaking_scenarios')
          .select('id, title, category, emoji, description, other_name, turns, lesson_id')
          .eq('is_published', true)
          .order('order_index', { ascending: true })
          .order('created_at', { ascending: true });
        if (error && /lesson_id/.test(error.message)) {
          // Migration 17 not run yet: the tag column does not exist.
          const retry = await supabase
            .from('speaking_scenarios')
            .select('id, title, category, emoji, description, other_name, turns')
            .eq('is_published', true)
            .order('order_index', { ascending: true })
            .order('created_at', { ascending: true });
          data = retry.data as typeof data;
          error = retry.error;
        }
        if (error) throw error;
        const rows: SpeakingScenario[] = (data || [])
          .map((row: any) => ({
            id: row.id,
            title: row.title,
            category: row.category === 'Small Talk' ? ('Small Talk' as const) : ('Interview' as const),
            emoji: row.emoji || '🎙️',
            description: row.description || '',
            otherName: row.other_name || 'Partner',
            turns: Array.isArray(row.turns) ? row.turns : [],
            lessonId: row.lesson_id ?? null,
          }))
          .filter((s: SpeakingScenario) => s.turns.length > 0);
        if (rows.length > 0) setDbScenarios(rows);
      } catch (error) {
        console.log('Speaking scenarios failed to load, using built-ins:', error);
      }
    })();
  }, []);
  const scenarios = dbScenarios ?? SPEAKING_SCENARIOS;

  // The voice must never talk over the next line.
  useEffect(() => {
    try {
      Speech.stop();
    } catch {
      // TTS is a nicety, never a blocker.
    }
  }, [index, finished]);

  // Recording timer (display only; the counter itself is reset by the
  // record/stop handlers).
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  // Release audio objects when leaving the screen.
  useEffect(() => {
    return () => {
      try {
        Speech.stop();
      } catch {
        // TTS is a nicety, never a blocker.
      }
      const recorder = recorderRef.current;
      if (recorder) {
        if (recorder.isRecording) {
          recorder.stop().catch(() => undefined);
        }
        try {
          recorder.release();
        } catch {
          // Already released / unsupported: nothing to clean up.
        }
        recorderRef.current = null;
      }
      playbackRef.current?.release();
      playbackRef.current = null;
    };
  }, []);

  const current: PracticeItem | undefined = items[index];

  // ---- Speech checking (recogniser + word-by-word score) ---------------
  // Where the device or browser supports it, the learner can have their
  // voice checked automatically: the recogniser's transcript is scored
  // against the line with the same engine the lesson slides use. Where
  // it does not, the record-and-listen flow below remains the practice.
  const [checkResult, setCheckResult] = useState<{ transcript: string; score: SpeechScore } | null>(
    null
  );
  const [checkError, setCheckError] = useState<SpeechCheckError | null>(null);
  // Best score per line, for the completion summary.
  const [lineScores, setLineScores] = useState<Record<number, number>>({});

  // The active speech-check target: a lesson line in lines mode, or
  // the learner's current dialogue turn in scenario mode. The
  // recogniser's callback reads it through this ref so it always
  // scores against what is on screen right now.
  const activeTargetRef = useRef<{ text: string; kind: 'line' | 'turn'; index: number }>({
    text: '',
    kind: 'line',
    index: 0,
  });
  useEffect(() => {
    if (mode === 'scenario' && scenario) {
      const turn = scenario.turns[turnIndex];
      activeTargetRef.current = {
        text: turn && turn.speaker === 'learner' ? turn.text : '',
        kind: 'turn',
        index: turnIndex,
      };
    } else {
      activeTargetRef.current = { text: current?.text || '', kind: 'line', index };
    }
  }, [mode, scenario, turnIndex, current, index]);

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      setCheckError(null);
      const target = activeTargetRef.current;
      if (!target.text) return;
      const score = scoreSpeech(target.text, transcript);
      setCheckResult({ transcript, score });
      if (target.kind === 'turn') {
        setScenarioScores((prev) => ({
          ...prev,
          [target.index]: Math.max(prev[target.index] ?? 0, score.accuracy),
        }));
        const bestSoFar = wordScoresRef.current[target.index];
        if (!bestSoFar || score.accuracy >= bestSoFar.accuracy) {
          wordScoresRef.current = { ...wordScoresRef.current, [target.index]: score };
          setScenarioWordScores(wordScoresRef.current);
        }
        if (score.passed) {
          // A passed line moves the conversation on by itself after
          // a short pause to enjoy the score; scenarioNext clears
          // this timer if the learner taps Next first.
          if (passTimerRef.current) clearTimeout(passTimerRef.current);
          passTimerRef.current = setTimeout(() => {
            void scenarioNextRef.current?.();
          }, 2000);
        }
      } else {
        setLineScores((prev) => ({
          ...prev,
          [target.index]: Math.max(prev[target.index] ?? 0, score.accuracy),
        }));
      }
    },
    onError: (error) => setCheckError(error),
  });

  const startCheck = useCallback(() => {
    setCheckError(null);
    setCheckResult(null);
    try {
      Speech.stop();
    } catch {
      // TTS is a nicety, never a blocker.
    }
    void speech.start();
  }, [speech]);

  const listen = useCallback(() => {
    if (!current) return;
    try {
      Speech.stop();
      Speech.speak(toSpeechText(current.text), { language: 'en' });
    } catch (error) {
      console.log('Speech error:', error);
    }
  }, [current]);

  // ---- Hands-free speaking flow -------------------------------------
  // When a line (or the learner's dialogue turn) arrives, the app
  // reads it aloud by itself; a ding then marks the learner's turn
  // and the microphone opens on its own, closing when they finish
  // speaking. The buttons all stay as the manual path, and leaving
  // the line cancels the sequence. Refs keep the timers pointed at
  // the latest recogniser state without retriggering the effects.
  const supportedRef = useRef<boolean | null>(null);
  useEffect(() => {
    supportedRef.current = speech.supported;
  }, [speech.supported]);
  const startCheckRef = useRef(startCheck);
  useEffect(() => {
    startCheckRef.current = startCheck;
  });

  const cueLearnerTurn = useCallback((text: string) => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    speakWithCallback(text, () => {
      if (cancelled) return;
      const tryStart = (attemptsLeft: number) => {
        if (cancelled) return;
        if (supportedRef.current) {
          // Same rule as the lesson player: wait until the model
          // voice is genuinely finished (floor + idle), THEN ding a
          // fixed beat before the mic opens. Dinging at callback
          // time made the beep land early or late at random, and
          // opening the mic on the callback alone let the recogniser
          // hear the app's own voice.
          void waitUntilSafeToListen().then(() => {
            if (cancelled) return;
            playDing();
            timer = setTimeout(() => {
              if (!cancelled) startCheckRef.current();
            }, 250);
          });
        } else if (supportedRef.current === null && attemptsLeft > 0) {
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
    };
  }, []);

  // Lesson lines: cue each line as it arrives.
  useEffect(() => {
    if (mode !== 'lines' || loading || finished || !current) return;
    return cueLearnerTurn(current.text);
  }, [mode, index, finished, loading, items, current, cueLearnerTurn]);

  // Scenarios: the other person's lines are spoken as their turn
  // arrives and the conversation then moves on BY ITSELF - there is
  // no "Your Turn" button to tap. The learner's turns get the full
  // model-ding-microphone cue.
  useEffect(() => {
    if (mode !== 'scenario' || !scenario || scenarioDone) return;
    const turn = scenario.turns[turnIndex];
    if (!turn) return;
    if (turn.speaker === 'other') {
      speakWithCallback(turn.text, () => {
        void scenarioNextRef.current?.();
      });
      return () => cancelSpeechCue();
    }
    return cueLearnerTurn(turn.text);
  }, [mode, scenario, turnIndex, scenarioDone, cueLearnerTurn]);

  // Whether this browser has any voice at all: with none installed
  // (common on Linux desktops), Listen is silent and the learner
  // deserves to know why.
  const [noVoices, setNoVoices] = useState(false);
  useEffect(() => {
    let alive = true;
    void probeVoicesAvailable().then((ok) => {
      if (alive) setNoVoices(!ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const stopPlayback = useCallback(() => {
    try {
      playbackRef.current?.pause();
    } catch {
      // Nothing playing: fine.
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      Speech.stop();
    } catch {
      // TTS is a nicety, never a blocker.
    }
    stopPlayback();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setRecordSupported(false);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      const moduleShape = AudioModule as unknown as RecorderModuleShape;
      const RecorderCtor = moduleShape.AudioRecorder ?? moduleShape.AudioRecorderWeb;
      if (!RecorderCtor) {
        setRecordSupported(false);
        return;
      }

      // A fresh recorder per take avoids reuse quirks after a stop.
      if (recorderRef.current) {
        try {
          recorderRef.current.release();
        } catch {
          // Already released / unsupported: nothing to clean up.
        }
        recorderRef.current = null;
      }
      const recorder = new RecorderCtor({ ...RecordingPresets.HIGH_QUALITY });
      recorderRef.current = recorder;
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingUri(null);
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch (error) {
      console.log('Recording unavailable:', error);
      setRecordSupported(false);
      setIsRecording(false);
    }
  }, [stopPlayback]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    setIsRecording(false);
    if (!recorder) return;
    try {
      await recorder.stop();
      setRecordingUri(recorder.uri);
    } catch (error) {
      console.log('Recording stop failed:', error);
      setRecordingUri(null);
    }
    // iOS keeps playback routed to the earpiece after recording unless
    // the audio mode is switched back.
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // Audio mode is a nicety, never a blocker.
    }
  }, []);

  const playRecording = useCallback(() => {
    if (!recordingUri) return;
    try {
      Speech.stop();
    } catch {
      // TTS is a nicety, never a blocker.
    }
    try {
      if (!playbackRef.current) {
        playbackRef.current = createAudioPlayer({ uri: recordingUri });
      } else {
        playbackRef.current.replace({ uri: recordingUri });
      }
      playbackRef.current.play();
    } catch (error) {
      console.log('Recording playback error:', error);
    }
  }, [recordingUri]);

  const advance = useCallback(async () => {
    if (isRecording) await stopRecording();
    if (speech.listening) speech.abort();
    stopPlayback();
    setRecordingUri(null);
    setCheckResult(null);
    setCheckError(null);
    if (index < items.length - 1) {
      setIndex(index + 1);
    } else {
      setFinished(true);
    }
  }, [index, items.length, isRecording, stopRecording, stopPlayback, speech]);

  const retry = useCallback(() => {
    stopPlayback();
    setRecordingUri(null);
    setCheckResult(null);
    setCheckError(null);
  }, [stopPlayback]);

  const practiceAgain = useCallback(() => {
    stopPlayback();
    setRecordingUri(null);
    setCheckResult(null);
    setCheckError(null);
    setLineScores({});
    setIndex(0);
    setFinished(false);
  }, [stopPlayback]);

  // ---- Scenario mode ------------------------------------------------
  const resetTurnState = useCallback(() => {
    stopPlayback();
    setRecordingUri(null);
    setCheckResult(null);
    setCheckError(null);
  }, [stopPlayback]);

  const listenText = useCallback((text: string) => {
    try {
      Speech.stop();
      Speech.speak(toSpeechText(text), { language: 'en' });
    } catch (error) {
      console.log('Speech error:', error);
    }
  }, []);

  const startScenario = useCallback(
    (next: SpeakingScenario) => {
      resetTurnState();
      if (speech.listening) speech.abort();
      setScenario(next);
      setTurnIndex(0);
      setScenarioScores({});
      wordScoresRef.current = {};
      setScenarioWordScores({});
      setScenarioDone(false);
      setMode('scenario');
    },
    [resetTurnState, speech]
  );

  const backToMenu = useCallback(() => {
    resetTurnState();
    if (speech.listening) speech.abort();
    try {
      Speech.stop();
    } catch {
      // TTS is a nicety, never a blocker.
    }
    setMode('menu');
    setScenario(null);
    setScenarioDone(false);
    setFinished(false);
  }, [resetTurnState, speech]);

  const scenarioNext = useCallback(async () => {
    if (passTimerRef.current) {
      clearTimeout(passTimerRef.current);
      passTimerRef.current = null;
    }
    if (isRecording) await stopRecording();
    if (speech.listening) speech.abort();
    resetTurnState();
    if (scenario && turnIndex < scenario.turns.length - 1) {
      setTurnIndex(turnIndex + 1);
    } else {
      setScenarioDone(true);
    }
  }, [isRecording, stopRecording, speech, resetTurnState, scenario, turnIndex]);

  const scenarioAgain = useCallback(() => {
    resetTurnState();
    setTurnIndex(0);
    setScenarioScores({});
    wordScoresRef.current = {};
    setScenarioWordScores({});
    setScenarioDone(false);
  }, [resetTurnState]);

  // Keep the ref pointed at the latest scenarioNext for the speech
  // callbacks (auto-advance after the partner speaks / after a pass).
  useEffect(() => {
    scenarioNextRef.current = scenarioNext;
  });

  const scenarioScoreValues = Object.values(scenarioScores);
  const scenarioAvg =
    scenarioScoreValues.length > 0
      ? Math.round(scenarioScoreValues.reduce((a, b) => a + b, 0) / scenarioScoreValues.length)
      : null;

  // Finishing a scenario pays speaking XP (once per scenario per day)
  // and, when the scenario is tagged to a lesson, completes that
  // lesson's recommended extra (+3 stars). Fails soft.
  useEffect(() => {
    if (!scenarioDone || !scenario) return;
    (async () => {
      const identity = await getStudentIdentity();
      if (!identity) return;
      await awardPoints(
        identity,
        'speaking_pass',
        POINTS.SPEAKING_XP,
        0,
        `${scenario.id}:${new Date().toISOString().slice(0, 10)}`
      );
      await awardExtraIfTagged(identity, 'speaking', scenario.id, scenario.lessonId);
    })();
  }, [scenarioDone, scenario]);

  const renderScenarioCard = (s: SpeakingScenario) => (
    <Pressable
      key={s.id}
      onPress={() => startScenario(s)}
      className="bg-white rounded-[20px] border border-inkline shadow-sm p-6 mb-4"
    >
      <View className="flex-row items-start gap-4">
        <Text className="text-4xl">{s.emoji}</Text>
        <View className="flex-1">
          <Text className="font-display text-xl font-semibold text-navy">{s.title}</Text>
          <Text className="font-sans text-slate-500 mt-1">{s.description}</Text>
          <Text className="font-sans text-xs font-bold text-pitch uppercase tracking-[1.5px] mt-2">
            {learnerLineCount(s)} lines to speak • with the {s.otherName}
          </Text>
        </View>
        <Text className="text-gold text-2xl">›</Text>
      </View>
    </Pressable>
  );

  const attemptedScores = Object.values(lineScores);
  const avgScore =
    attemptedScores.length > 0
      ? Math.round(attemptedScores.reduce((a, b) => a + b, 0) / attemptedScores.length)
      : null;

  const scenarioTurn = scenario && !scenarioDone ? scenario.turns[turnIndex] : undefined;
  const scenarioIsLastTurn = scenario ? turnIndex === scenario.turns.length - 1 : false;

  return (
    <View className="flex-1 bg-canvas">
      {/* Slim navy header (matches the rest of the learner side) */}
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <ScreenHeader
          title="Speaking Practice"
          onBack={mode !== 'menu' ? backToMenu : goBack}
        />
      </SafeAreaView>

      {mode === 'menu' ? (
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View className="max-w-3xl w-full mx-auto">
            <Text className="font-sans text-lg text-slate-500 mb-6">
              Choose how you want to practise speaking today.
            </Text>

            <Pressable
              onPress={() => setMode('lines')}
              className="bg-white rounded-[20px] border border-inkline shadow-sm p-6 mb-8"
            >
              <Text className="text-4xl mb-2">📚</Text>
              <Text className="font-display text-xl font-semibold text-navy mb-1">Practise My Lesson Lines</Text>
              <Text className="font-sans text-slate-500">
                Say the words and sentences from your lessons out loud, and get your voice checked.
              </Text>
              <Text className="font-sans text-sm font-bold uppercase tracking-[2px] text-gold-dark mt-3">Start →</Text>
            </Pressable>

            <MicroLabel className="mb-3">🎙️ Interviews</MicroLabel>
            {scenarios
              .filter(s => s.category === 'Interview')
              .map(s => renderScenarioCard(s))}

            <MicroLabel className="mb-3 mt-6">💬 Small Talk</MicroLabel>
            {scenarios
              .filter(s => s.category === 'Small Talk')
              .map(s => renderScenarioCard(s))}
          </View>
        </ScrollView>
      ) : mode === 'scenario' ? (
        !scenario ? null : scenarioDone ? (
          <View className="flex-1 items-center justify-center p-6">
            <Text className="text-6xl mb-4">🎉</Text>
            <Text className="font-display text-3xl font-semibold text-navy mb-2 text-center">
              Great conversation!
            </Text>
            <Text className="font-sans text-lg text-slate-500 text-center mb-8">
              You finished “{scenario.title}” with the {scenario.otherName}. Well done!
            </Text>
            {scenarioAvg !== null ? (
              <Text className="font-sans text-xl font-bold text-pitch text-center -mt-4 mb-8">
                🎙️ Average speaking score: {scenarioAvg}%
              </Text>
            ) : null}
            <Pressable
              onPress={scenarioAgain}
              className="w-full max-w-sm px-6 py-4 bg-gold border-b-4 border-gold-dark rounded-full mb-3 items-center"
            >
              <Text className="font-sans text-navy font-bold text-base">Practice Again</Text>
            </Pressable>
            <Pressable
              onPress={backToMenu}
              className="w-full max-w-sm px-6 py-4 bg-white border border-inkline rounded-full items-center mb-3"
            >
              <Text className="font-sans text-slate-600 font-bold text-base">🎙️ All Speaking Practice</Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace('/learner')}
              className="w-full max-w-sm px-6 py-4 bg-white border border-inkline rounded-full items-center"
            >
              <Text className="font-sans text-slate-600 font-bold text-base">Learner Home</Text>
            </Pressable>
            <Celebration visible />
          </View>
        ) : scenarioTurn ? (
          <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
            <View className="max-w-3xl w-full mx-auto flex-1">
              {/* Progress */}
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-sans text-xs font-bold text-slate-500 uppercase tracking-[1.5px]">
                  {scenario.emoji} {scenario.title}
                </Text>
                <Text className="font-sans text-xs font-bold text-gold-dark uppercase tracking-[1.5px]">
                  Turn {turnIndex + 1} of {scenario.turns.length}
                </Text>
              </View>
              <View className="h-2 bg-inkline rounded-full overflow-hidden mb-6">
                <View
                  style={{
                    width: `${((turnIndex + 1) / scenario.turns.length) * 100}%`,
                    height: '100%',
                    borderRadius: 9999,
                    backgroundColor: '#2E7D32',
                  }}
                />
              </View>

              {/* Conversation so far */}
              {turnIndex > 0 ? (
                <View className="mb-6 gap-2">
                  {scenario.turns.slice(0, turnIndex).map((t, i) => (
                    <View
                      key={i}
                      className={`max-w-[85%] rounded-2xl px-4 py-2 ${t.speaker === 'other' ? 'self-start bg-white border border-inkline' : 'self-end bg-pitch-light'}`}
                    >
                      <Text className="font-sans text-xs font-bold text-slate-400 mb-0.5">
                        {t.speaker === 'other' ? scenario.otherName : learnerName || 'You'}
                        {t.speaker === 'learner' && scenarioScores[i] !== undefined
                          ? ` • ${scenarioScores[i]}%`
                          : ''}
                      </Text>
                      {t.speaker === 'learner' && scenarioWordScores[i] ? (
                        <View className="flex-row flex-wrap gap-x-1.5">
                          {scenarioWordScores[i].words.map((w, wi) => (
                            <Text
                              key={`${w.word}-${wi}`}
                              className={`font-bold ${
                                w.status === 'correct'
                                  ? 'text-emerald-600'
                                  : w.status === 'close'
                                    ? 'text-amber-600'
                                    : w.status === 'wrong'
                                      ? 'text-red-500'
                                      : 'text-red-300'
                              }`}
                            >
                              {w.word}
                            </Text>
                          ))}
                        </View>
                      ) : (
                        <Text className="font-sans text-slate-600">{t.text}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Current turn */}
              <View className="bg-white rounded-[20px] border border-inkline shadow-sm p-8 items-center mb-6">
                <Text className="font-sans text-sm text-slate-400 mb-3">
                  {scenarioTurn.speaker === 'other'
                    ? `${scenario.otherName} says:`
                    : learnerName
                      ? `${learnerName}, your turn — say this:`
                      : 'Your turn — say this:'}
                </Text>
                <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center leading-snug">
                  {scenarioTurn.text}
                </Text>
              </View>

              <View className="items-center gap-3">
                <Pressable
                  onPress={() => listenText(scenarioTurn.text)}
                  className="px-8 py-3 bg-navy border-b-4 border-navy-deep rounded-full"
                >
                  <Text className="font-sans text-white font-bold text-base">🔊 Listen</Text>
                </Pressable>

                {noVoices ? (
                  <Text className="font-sans text-amber-600 text-xs text-center max-w-md">
                    🔇 This browser has no voice installed, so Listen may stay silent.
                    Chrome, or the phone app, can read the line aloud.
                  </Text>
                ) : null}

                {scenarioTurn.speaker === 'other' ? (
                  <Text className="font-sans text-slate-400 text-sm text-center mt-3 max-w-md">
                    🎧 Listen… when {scenario.otherName} finishes, it&apos;s your turn
                    automatically — just wait for the beep.
                  </Text>
                ) : (
                  <>
                    {/* Automatic speech check, where the device supports it */}
                    {speech.supported ? (
                      checkResult ? (
                        <View className="w-full max-w-xl bg-white rounded-[20px] border border-inkline shadow-sm p-6 items-center">
                          <SpeechScoreView score={checkResult.score} transcript={checkResult.transcript} />
                        </View>
                      ) : speech.listening ? (
                        <>
                          <Pressable onPress={speech.stop} className="px-8 py-3 bg-gold border-b-4 border-gold-dark rounded-full">
                            <Text className="font-sans text-navy font-bold text-base">
                              ⏹ Listening… tap when done
                            </Text>
                          </Pressable>
                          {speech.interim ? (
                            <Text className="font-sans text-slate-500 italic text-center">
                              &quot;{speech.interim}&quot;
                            </Text>
                          ) : (
                            <Text className="font-sans text-slate-400">Say your line now 🎧</Text>
                          )}
                        </>
                      ) : (
                        <View className="items-center">
                          <Text className="font-sans text-slate-400 text-sm text-center">
                            🎧 After the beep, just speak — the microphone opens by itself.
                          </Text>
                          <Pressable onPress={startCheck} className="px-3 py-2">
                            <Text className="font-sans text-slate-400 font-bold underline text-sm">
                              Tap to speak now
                            </Text>
                          </Pressable>
                        </View>
                      )
                    ) : null}
                    {checkError && speech.supported ? (
                      <Text className="font-sans text-red-500 text-sm text-center max-w-md">
                        {speechErrorMessage(checkError)}
                      </Text>
                    ) : null}

                    {recordSupported ? (
                      isRecording ? (
                        <Pressable
                          onPress={() => {
                            (async () => {
                              await stopRecording();
                            })();
                          }}
                          className="px-8 py-3 bg-gold border-b-4 border-gold-dark rounded-full"
                        >
                          <Text className="font-sans text-navy font-bold text-base">
                            ⏹ Stop ({recordingSeconds}s)
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => {
                            (async () => {
                              await startRecording();
                            })();
                          }}
                          className="px-8 py-3 bg-navy border-b-4 border-navy-deep rounded-full"
                        >
                          <Text className="font-sans text-white font-bold text-base">🎙️ Record Your Voice</Text>
                        </Pressable>
                      )
                    ) : (
                      <View className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 max-w-md">
                        <Text className="font-sans text-amber-700 text-sm text-center">
                          🎙️ Recording isn&apos;t available here (microphone permission or browser
                          support). You can still Listen and say the line out loud!
                        </Text>
                      </View>
                    )}

                    {recordingUri && !isRecording ? (
                      <View className="flex-row items-center gap-4">
                        <Pressable
                          onPress={playRecording}
                          className="px-6 py-3 bg-white border border-inkline rounded-full"
                        >
                          <Text className="font-sans text-navy font-bold text-base">▶️ Play Back</Text>
                        </Pressable>
                        <Pressable onPress={retry} className="px-3 py-3">
                          <Text className="font-sans text-slate-400 font-bold underline">Try again</Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {checkResult && !checkResult.score.passed ? (
                      <>
                        <Pressable
                          onPress={retry}
                          className="w-full max-w-md px-6 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center mt-3"
                        >
                          <Text className="font-sans text-white font-bold text-lg">🎙️ Try Again</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            (async () => {
                              await scenarioNext();
                            })();
                          }}
                          className="px-3 py-2"
                        >
                          <Text className="font-sans text-slate-400 font-bold underline">Continue anyway →</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        onPress={() => {
                          (async () => {
                            await scenarioNext();
                          })();
                        }}
                        className="w-full max-w-md px-6 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center mt-3"
                      >
                        <Text className="font-sans text-navy font-bold text-lg">
                          {checkResult
                            ? scenarioIsLastTurn
                              ? '✅ Finish'
                              : '✅ Great! Next →'
                            : '✅ I said it!'}
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        ) : null
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0A192F" />
          <Text className="font-sans text-slate-400 mt-3">Preparing your lines…</Text>
        </View>
      ) : finished ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-6xl mb-4">🎉</Text>
          <Text className="font-display text-3xl font-semibold text-navy mb-2 text-center">
            Great speaking!
          </Text>
          <Text className="font-sans text-lg text-slate-500 text-center mb-8">
            You practised {items.length} {items.length === 1 ? 'line' : 'lines'} out loud.
            Keep it up, champion!
          </Text>
          {avgScore !== null ? (
            <Text className="font-sans text-xl font-bold text-pitch text-center -mt-4 mb-8">
              🎙️ Average speaking score: {avgScore}%
            </Text>
          ) : null}
          <Pressable
            onPress={practiceAgain}
            className="w-full max-w-sm px-6 py-4 bg-gold border-b-4 border-gold-dark rounded-full mb-3 items-center"
          >
            <Text className="font-sans text-navy font-bold text-base">Practice Again</Text>
          </Pressable>
          <Pressable
            onPress={backToMenu}
            className="w-full max-w-sm px-6 py-4 bg-white border border-inkline rounded-full items-center mb-3"
          >
            <Text className="font-sans text-slate-600 font-bold text-base">🎙️ All Speaking Practice</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/learner')}
            className="w-full max-w-sm px-6 py-4 bg-white border border-inkline rounded-full items-center"
          >
            <Text className="font-sans text-slate-600 font-bold text-base">Learner Home</Text>
          </Pressable>
          <Celebration visible />
        </View>
      ) : current ? (
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
          <View className="max-w-3xl w-full mx-auto flex-1">
            {/* Progress */}
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-sans text-xs font-bold text-slate-500 uppercase tracking-[1.5px]">
                Line {index + 1} of {items.length}
              </Text>
              <Text className="font-sans text-xs font-bold text-gold-dark uppercase tracking-[1.5px]">
                {current.lessonTitle}
              </Text>
            </View>
            <View className="h-2 bg-inkline rounded-full overflow-hidden mb-6">
              <View
                style={{
                  width: `${((index + 1) / items.length) * 100}%`,
                  height: '100%',
                  borderRadius: 9999,
                  backgroundColor: '#2E7D32',
                }}
              />
            </View>

            {/* The line to practise */}
            <View className="bg-white rounded-[20px] border border-inkline shadow-sm p-8 items-center mb-6">
              <Text className="font-sans text-sm text-slate-400 mb-3">
                Listen, then say it out loud:
              </Text>
              <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center leading-snug">
                {current.text}
              </Text>
            </View>

            {/* Actions */}
            <View className="items-center gap-3">
              <Pressable onPress={listen} className="px-8 py-3 bg-navy border-b-4 border-navy-deep rounded-full">
                <Text className="font-sans text-white font-bold text-base">🔊 Listen</Text>
              </Pressable>

              {noVoices ? (
                <Text className="font-sans text-amber-600 text-xs text-center max-w-md">
                  🔇 This browser has no voice installed, so Listen may stay silent.
                  Chrome, or the phone app, can read the line aloud.
                </Text>
              ) : null}

              {/* Automatic speech check, where the device supports it */}
              {speech.supported ? (
                checkResult ? (
                  <View className="w-full max-w-xl bg-white rounded-[20px] border border-inkline shadow-sm p-6 items-center">
                    <SpeechScoreView score={checkResult.score} transcript={checkResult.transcript} />
                  </View>
                ) : speech.listening ? (
                  <>
                    <Pressable onPress={speech.stop} className="px-8 py-3 bg-gold border-b-4 border-gold-dark rounded-full">
                      <Text className="font-sans text-navy font-bold text-base">
                        ⏹ Listening… tap when done
                      </Text>
                    </Pressable>
                    {speech.interim ? (
                      <Text className="font-sans text-slate-500 italic text-center">
                        &quot;{speech.interim}&quot;
                      </Text>
                    ) : (
                      <Text className="font-sans text-slate-400">Say the line now 🎧</Text>
                    )}
                  </>
                ) : (
                  <View className="items-center">
                    <Text className="font-sans text-slate-400 text-sm text-center">
                      🎧 After the beep, just speak — the microphone opens by itself.
                    </Text>
                    <Pressable onPress={startCheck} className="px-3 py-2">
                      <Text className="font-sans text-slate-400 font-bold underline text-sm">
                        Tap to speak now
                      </Text>
                    </Pressable>
                  </View>
                )
              ) : null}
              {checkError && speech.supported ? (
                <Text className="font-sans text-red-500 text-sm text-center max-w-md">
                  {speechErrorMessage(checkError)}
                </Text>
              ) : null}

              {recordSupported ? (
                isRecording ? (
                  <Pressable
                    onPress={() => {
                      (async () => {
                        await stopRecording();
                      })();
                    }}
                    className="px-8 py-3 bg-gold border-b-4 border-gold-dark rounded-full"
                  >
                    <Text className="font-sans text-navy font-bold text-base">
                      ⏹ Stop ({recordingSeconds}s)
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      (async () => {
                        await startRecording();
                      })();
                    }}
                    className="px-8 py-3 bg-navy border-b-4 border-navy-deep rounded-full"
                  >
                    <Text className="font-sans text-white font-bold text-base">🎙️ Record Your Voice</Text>
                  </Pressable>
                )
              ) : (
                <View className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 max-w-md">
                  <Text className="font-sans text-amber-700 text-sm text-center">
                    🎙️ Recording isn&apos;t available here (microphone permission or browser
                    support). You can still Listen and say the line out loud!
                  </Text>
                </View>
              )}

              {recordingUri && !isRecording ? (
                <View className="flex-row items-center gap-4">
                  <Pressable
                    onPress={playRecording}
                    className="px-6 py-3 bg-white border border-inkline rounded-full"
                  >
                    <Text className="font-sans text-navy font-bold text-base">▶️ Play Back</Text>
                  </Pressable>
                  <Pressable onPress={retry} className="px-3 py-3">
                    <Text className="font-sans text-slate-400 font-bold underline">Try again</Text>
                  </Pressable>
                </View>
              ) : null}

              {checkResult && !checkResult.score.passed ? (
                <>
                  <Pressable
                    onPress={retry}
                    className="w-full max-w-md px-6 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center mt-3"
                  >
                    <Text className="font-sans text-white font-bold text-lg">🎙️ Try Again</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      (async () => {
                        await advance();
                      })();
                    }}
                    className="px-3 py-2"
                  >
                    <Text className="font-sans text-slate-400 font-bold underline">Next line anyway →</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    (async () => {
                      await advance();
                    })();
                  }}
                  className="w-full max-w-md px-6 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center mt-3"
                >
                  <Text className="font-sans text-navy font-bold text-lg">
                    {checkResult ? '✅ Great! Next Line' : '✅ I said it!'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}
