import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';

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
}

const EMPTY_ATTEMPT: SlideAttempt = {
  answered: false,
  wasCorrect: null,
  selectedPanelId: null,
  exploredPanelIds: [],
  typingValue: '',
};

const SCORED_TYPES = ['quiz_4up', 'typing'];

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

export default function LessonPlayer() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const player = useAudioPlayer(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, SlideAttempt>>({});
  const [finished, setFinished] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

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
      setSlides((slideData || []) as Slide[]);
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

  const playAudio = useCallback(
    (url: string | null | undefined) => {
      if (!url) return;
      try {
        player.replace({ uri: url });
        player.play();
      } catch (error) {
        console.log('Audio playback error:', error);
      }
    },
    [player]
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

  const currentSlide: Slide | undefined = slides[currentIndex];
  const currentAttempt: SlideAttempt =
    (currentSlide && attempts[currentSlide.id]) || EMPTY_ATTEMPT;

  const scoreFor = useCallback(
    (slideList: Slide[], attemptMap: Record<string, SlideAttempt>) => {
      let correct = 0;
      let total = 0;
      for (const slide of slideList) {
        if (!SCORED_TYPES.includes(slide.slide_type)) continue;
        const attempt = attemptMap[slide.id];
        if (attempt?.answered) {
          total += 1;
          if (attempt.wasCorrect) correct += 1;
        }
      }
      return { correct, total };
    },
    []
  );

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
    },
    [lesson]
  );

  const handleContinue = useCallback(async () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return;
    }
    const { correct, total } = scoreFor(slides, attempts);
    await recordCompletion(correct, total);
    setFinished(true);
  }, [currentIndex, slides, attempts, scoreFor, recordCompletion]);

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
      playAudio(panel.audio_url);
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
        updateAttempt(slide.id, {
          answered: true,
          wasCorrect: correct,
          selectedPanelId: panel.id,
        });
      }
    },
    [attempts, playAudio, feedbackHaptic, updateAttempt]
  );

  const handleTypingCheck = useCallback(
    (slide: Slide) => {
      const attempt = attempts[slide.id] || EMPTY_ATTEMPT;
      if (attempt.answered) return;
      const correct =
        normalizeAnswer(attempt.typingValue) === normalizeAnswer(slide.correct_answer || '');
      feedbackHaptic(correct);
      updateAttempt(slide.id, { answered: true, wasCorrect: correct });
    },
    [attempts, feedbackHaptic, updateAttempt]
  );

  // ---- Render helpers -------------------------------------------------------

  const renderPanel = (slide: Slide, panel: SlidePanel) => {
    const attempt = attempts[slide.id] || EMPTY_ATTEMPT;
    const isQuiz = slide.slide_type === 'quiz_4up';
    const selected = attempt.selectedPanelId === panel.id;
    const explored = attempt.exploredPanelIds.includes(panel.id);

    let borderClass = 'border-slate-200';
    let bgClass = 'bg-slate-50';
    if (isQuiz && attempt.answered && panel.is_correct) {
      borderClass = 'border-emerald-500';
      bgClass = 'bg-emerald-50';
    } else if (isQuiz && attempt.answered && selected && !panel.is_correct) {
      borderClass = 'border-red-400';
      bgClass = 'bg-red-50';
    } else if (selected || explored) {
      borderClass = 'border-brand';
      bgClass = 'bg-amber-50';
    }

    return (
      <Pressable
        key={panel.id}
        onPress={() => handlePanelTap(slide, panel)}
        className={`w-[48%] rounded-2xl border-2 ${borderClass} ${bgClass} p-3 items-center`}
      >
        {panel.media_url ? (
          <Image
            source={{ uri: panel.media_url }}
            className="w-full h-28 rounded-xl mb-2"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-28 rounded-xl mb-2 bg-slate-200 items-center justify-center">
            <Text className="text-3xl">🔊</Text>
          </View>
        )}
        <Text className="text-base font-bold text-slate-800 text-center">{panel.text}</Text>
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
            <Image
              source={{ uri: slide.media_url }}
              className="w-full h-64 rounded-2xl mb-6"
              resizeMode="cover"
            />
          ) : null}
          {slide.prompt_text ? (
            <Text className="text-lg text-slate-500 text-center mb-2">{slide.prompt_text}</Text>
          ) : null}
          {slide.correct_answer ? (
            <Text className="text-3xl font-bold text-[#0A192F] text-center mb-6">
              {slide.correct_answer}
            </Text>
          ) : null}
          {slide.audio_url ? (
            <Pressable
              onPress={() => playAudio(slide.audio_url)}
              className="px-6 py-3 bg-brand rounded-full"
            >
              <Text className="text-white font-bold text-base">🔊 Listen</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    if (slide.slide_type === 'grid_4up') {
      return (
        <View>
          {slide.prompt_text ? (
            <Text className="text-xl font-bold text-[#0A192F] text-center mb-2">
              {slide.prompt_text}
            </Text>
          ) : null}
          <Text className="text-sm text-slate-400 text-center mb-4">
            Tap each picture to hear it. Explored {attempt.exploredPanelIds.length} of{' '}
            {panels.length}.
          </Text>
          <View className="flex-row flex-wrap justify-between gap-y-4">
            {panels.map((panel) => renderPanel(slide, panel))}
          </View>
        </View>
      );
    }

    if (slide.slide_type === 'quiz_4up') {
      return (
        <View>
          {slide.prompt_text ? (
            <Text className="text-2xl font-bold text-[#0A192F] text-center mb-4">
              {slide.prompt_text}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap justify-between gap-y-4">
            {panels.map((panel) => renderPanel(slide, panel))}
          </View>
          {attempt.answered ? (
            <Text
              className={`text-center text-lg font-bold mt-6 ${
                attempt.wasCorrect ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {attempt.wasCorrect ? 'Correct! Well done.' : 'Not quite - the green one is right.'}
            </Text>
          ) : (
            <Text className="text-center text-sm text-slate-400 mt-6">
              Tap the picture that matches.
            </Text>
          )}
        </View>
      );
    }

    if (slide.slide_type === 'typing') {
      return (
        <View className="items-center">
          {slide.media_url ? (
            <Image
              source={{ uri: slide.media_url }}
              className="w-full h-52 rounded-2xl mb-6"
              resizeMode="cover"
            />
          ) : null}
          {slide.prompt_text ? (
            <Text className="text-lg text-slate-500 text-center mb-4">{slide.prompt_text}</Text>
          ) : null}
          <TextInput
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-lg text-slate-800 mb-4"
            placeholder="Type the sentence here"
            value={attempt.typingValue}
            onChangeText={(text) => updateAttempt(slide.id, { typingValue: text })}
            editable={!attempt.answered}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!attempt.answered ? (
            <Pressable
              onPress={() => handleTypingCheck(slide)}
              className="px-6 py-3 bg-brand rounded-full"
            >
              <Text className="text-white font-bold text-base">Check Answer</Text>
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
      <SafeAreaView className="flex-1 bg-surface-background items-center justify-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background items-center justify-center p-6">
        <Text className="text-2xl font-bold text-[#0A192F] mb-2 text-center">
          Couldn&apos;t load this lesson
        </Text>
        <Text className="text-slate-500 text-center mb-8">{loadError}</Text>
        <Pressable
          onPress={() => {
            (async () => {
              await fetchLessonData();
            })();
          }}
          className="px-6 py-3 bg-brand rounded-full mb-3"
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
    const { correct, total } = scoreFor(slides, attempts);
    const percentage = total > 0 ? Math.round((correct / total) * 100) : null;
    return (
      <SafeAreaView className="flex-1 bg-surface-background items-center justify-center p-6">
        <Text className="text-6xl mb-4">🏆</Text>
        <Text className="text-3xl font-bold text-[#0A192F] mb-2 text-center">Lesson Complete!</Text>
        <Text className="text-lg text-slate-500 text-center mb-2">
          {lesson?.title}
        </Text>
        {percentage !== null ? (
          <Text className="text-xl font-bold text-brand mb-2">
            You got {correct} out of {total} correct ({percentage}%)
          </Text>
        ) : (
          <Text className="text-xl font-bold text-brand mb-2">Great listening practice!</Text>
        )}
        <Text className="text-slate-400 mb-10">Time: {formatDuration(durationSeconds)}</Text>
        <Pressable
          onPress={() => router.replace('/learner/path')}
          className="w-full max-w-sm px-6 py-4 bg-brand rounded-full mb-3 items-center"
        >
          <Text className="text-white font-bold text-base">Back to Learning Path</Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/learner')}
          className="w-full max-w-sm px-6 py-4 bg-slate-100 border border-slate-200 rounded-full items-center"
        >
          <Text className="text-slate-600 font-bold text-base">Learner Home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!currentSlide) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background items-center justify-center p-6">
        <Text className="text-2xl font-bold text-[#0A192F] mb-2 text-center">
          No slides yet
        </Text>
        <Text className="text-slate-500 text-center mb-8">
          This lesson doesn&apos;t have any slides yet. Please check back soon.
        </Text>
        <Pressable onPress={() => router.back()} className="px-6 py-3 bg-brand rounded-full">
          <Text className="text-white font-bold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const progressPercentage = slides.length > 0 ? ((currentIndex + 1) / slides.length) * 100 : 0;
  const isScored = SCORED_TYPES.includes(currentSlide.slide_type);
  const canContinue = !isScored || currentAttempt.answered;
  const isLast = currentIndex === slides.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <View className="flex-1 px-4 py-2 md:px-8">
        {/* Top Navigation & Progress Bar */}
        <View className="flex-row items-center justify-between mb-2 pt-2">
          <Pressable onPress={handleExit} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
            <Text className="text-2xl text-slate-400 font-bold">✕</Text>
          </Pressable>

          <View className="flex-1 h-4 bg-slate-200 rounded-full mx-4 overflow-hidden">
            <View
              className="h-full bg-brand rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </View>

          <View className="px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
            <Text className="text-xs font-bold text-slate-500 uppercase">
              {currentIndex + 1} / {slides.length}
            </Text>
          </View>
        </View>

        {lesson?.title ? (
          <Text className="text-center text-sm font-bold text-slate-400 mb-4">{lesson.title}</Text>
        ) : null}

        {/* Slide Container */}
        <ScrollView
          className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm"
          contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }}
        >
          {renderSlide(currentSlide)}
        </ScrollView>

        {/* Footer Navigation */}
        <View className="py-4 items-center">
          {canContinue ? (
            <Pressable
              onPress={() => {
                (async () => {
                  await handleContinue();
                })();
              }}
              className="w-full max-w-md px-6 py-4 bg-brand rounded-full items-center"
            >
              <Text className="text-white font-bold text-lg">
                {isLast ? 'Finish Lesson' : 'Continue'}
              </Text>
            </Pressable>
          ) : (
            <>
              <Text className="text-slate-400 text-sm mb-3">Answer to continue</Text>
              <Pressable
                onPress={() => {
                  (async () => {
                    // Skip: advance without recording an attempt for this slide.
                    if (currentIndex < slides.length - 1) {
                      setCurrentIndex(currentIndex + 1);
                    } else {
                      const { correct, total } = scoreFor(slides, attempts);
                      await recordCompletion(correct, total);
                      setFinished(true);
                    }
                  })();
                }}
              >
                <Text className="text-slate-400 font-bold underline">Skip this slide</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
