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
import SpeechScoreView from '../../components/ui/SpeechScoreView';
import { scoreSpeech, type SpeechScore } from '../../lib/speechScoring';
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

  const currentRef = useRef<{ text: string; index: number }>({ text: '', index: 0 });
  useEffect(() => {
    currentRef.current = { text: current?.text || '', index };
  }, [current, index]);

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      setCheckError(null);
      const { text, index: lineIndex } = currentRef.current;
      const score = scoreSpeech(text, transcript);
      setCheckResult({ transcript, score });
      setLineScores((prev) => ({
        ...prev,
        [lineIndex]: Math.max(prev[lineIndex] ?? 0, score.accuracy),
      }));
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
      Speech.speak(current.text, { language: 'en' });
    } catch (error) {
      console.log('Speech error:', error);
    }
  }, [current]);

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

  const attemptedScores = Object.values(lineScores);
  const avgScore =
    attemptedScores.length > 0
      ? Math.round(attemptedScores.reduce((a, b) => a + b, 0) / attemptedScores.length)
      : null;

  return (
    <View className="flex-1 bg-white">
      {/* Top Navigation Bar - Dark Navy (matches learner home / path) */}
      <SafeAreaView edges={['top']} className="w-full bg-[#0A192F] shadow-sm">
        <View className="max-w-7xl w-full mx-auto flex-row justify-between items-center p-4 md:p-6">
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={goBack}
              className="px-3 py-2 bg-white/10 rounded-lg border border-white/20"
            >
              <Text className="text-white font-bold text-sm">← Back</Text>
            </Pressable>
            <Text className="text-xl md:text-2xl font-bold text-white tracking-wider">
              Speaking Practice
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0A192F" />
          <Text className="text-slate-400 mt-3">Preparing your lines…</Text>
        </View>
      ) : finished ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-6xl mb-4">🎉</Text>
          <Text className="text-3xl font-bold text-[#0A192F] mb-2 text-center">
            Great speaking!
          </Text>
          <Text className="text-lg text-slate-500 text-center mb-8">
            You practised {items.length} {items.length === 1 ? 'line' : 'lines'} out loud.
            Keep it up, champion!
          </Text>
          {avgScore !== null ? (
            <Text className="text-xl font-bold text-brand text-center -mt-4 mb-8">
              🎙️ Average speaking score: {avgScore}%
            </Text>
          ) : null}
          <Pressable
            onPress={practiceAgain}
            className="w-full max-w-sm px-6 py-4 bg-brand rounded-full mb-3 items-center"
          >
            <Text className="text-white font-bold text-base">Practice Again</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/learner')}
            className="w-full max-w-sm px-6 py-4 bg-slate-100 border border-slate-200 rounded-full items-center"
          >
            <Text className="text-slate-600 font-bold text-base">Learner Home</Text>
          </Pressable>
          <Celebration visible />
        </View>
      ) : current ? (
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
          <View className="max-w-3xl w-full mx-auto flex-1">
            {/* Progress */}
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-bold text-slate-500 uppercase">
                Line {index + 1} of {items.length}
              </Text>
              <Text className="text-xs font-bold text-brand uppercase">
                {current.lessonTitle}
              </Text>
            </View>
            <View className="h-3 bg-slate-200 rounded-full overflow-hidden mb-6">
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
            <View className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 items-center mb-6">
              <Text className="text-sm text-slate-400 mb-3">
                Listen, then say it out loud:
              </Text>
              <Text className="text-3xl md:text-4xl font-bold text-[#0A192F] text-center leading-snug">
                {current.text}
              </Text>
            </View>

            {/* Actions */}
            <View className="items-center gap-3">
              <Pressable onPress={listen} className="px-8 py-3 bg-brand rounded-full">
                <Text className="text-white font-bold text-base">🔊 Listen</Text>
              </Pressable>

              {/* Automatic speech check, where the device supports it */}
              {speech.supported ? (
                checkResult ? (
                  <View className="w-full max-w-xl bg-slate-50 rounded-3xl border border-slate-200 p-6 items-center">
                    <SpeechScoreView score={checkResult.score} transcript={checkResult.transcript} />
                  </View>
                ) : speech.listening ? (
                  <>
                    <Pressable onPress={speech.stop} className="px-8 py-3 bg-red-500 rounded-full">
                      <Text className="text-white font-bold text-base">
                        ⏹ Listening… tap when done
                      </Text>
                    </Pressable>
                    {speech.interim ? (
                      <Text className="text-slate-500 italic text-center">
                        &quot;{speech.interim}&quot;
                      </Text>
                    ) : (
                      <Text className="text-slate-400">Say the line now 🎧</Text>
                    )}
                  </>
                ) : (
                  <Pressable onPress={startCheck} className="px-8 py-3 bg-[#0A192F] rounded-full">
                    <Text className="text-white font-bold text-base">
                      🎙️ Speak &amp; Check My Voice
                    </Text>
                  </Pressable>
                )
              ) : null}
              {checkError && speech.supported ? (
                <Text className="text-red-500 text-sm text-center max-w-md">
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
                    className="px-8 py-3 bg-red-500 rounded-full"
                  >
                    <Text className="text-white font-bold text-base">
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
                    className="px-8 py-3 bg-[#0A192F] rounded-full"
                  >
                    <Text className="text-white font-bold text-base">🎙️ Record Your Voice</Text>
                  </Pressable>
                )
              ) : (
                <View className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 max-w-md">
                  <Text className="text-amber-700 text-sm text-center">
                    🎙️ Recording isn&apos;t available here (microphone permission or browser
                    support). You can still Listen and say the line out loud!
                  </Text>
                </View>
              )}

              {recordingUri && !isRecording ? (
                <View className="flex-row items-center gap-4">
                  <Pressable
                    onPress={playRecording}
                    className="px-6 py-3 bg-slate-100 border border-slate-200 rounded-full"
                  >
                    <Text className="text-slate-700 font-bold text-base">▶️ Play Back</Text>
                  </Pressable>
                  <Pressable onPress={retry} className="px-3 py-3">
                    <Text className="text-slate-400 font-bold underline">Try again</Text>
                  </Pressable>
                </View>
              ) : null}

              {checkResult && !checkResult.score.passed ? (
                <>
                  <Pressable
                    onPress={retry}
                    className="w-full max-w-md px-6 py-4 bg-[#0A192F] rounded-full items-center mt-3"
                  >
                    <Text className="text-white font-bold text-lg">🎙️ Try Again</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      (async () => {
                        await advance();
                      })();
                    }}
                    className="px-3 py-2"
                  >
                    <Text className="text-slate-400 font-bold underline">Next line anyway →</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    (async () => {
                      await advance();
                    })();
                  }}
                  className="w-full max-w-md px-6 py-4 bg-brand rounded-full items-center mt-3"
                >
                  <Text className="text-white font-bold text-lg">
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
