import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SpeechScoreView from '../../components/ui/SpeechScoreView';
import {
  PLACEMENT_BANDS,
  resolvePlacement,
  savePlacement,
  stageForBandScores,
  type PlacementResult,
} from '../../lib/placementBank';
import { scoreSpeech, type SpeechScore } from '../../lib/speechScoring';
import { speakWithCallback } from '../../lib/speechCue';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { useSpeechCheck } from '../../lib/useSpeechCheck';

/**
 * Find Your Start — a short placement test (about 5-10 minutes).
 * Four items per stage band; climb while scoring 3+/4. The result is
 * a recommended starting stage — advice only, nothing is ever locked.
 */
export default function PlacementTest() {
  const router = useRouter();
  const [phase, setPhase] = useState<'intro' | 'test' | 'result'>('intro');
  const [bandIdx, setBandIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [bandScores, setBandScores] = useState<number[]>([]);
  const [bandCorrect, setBandCorrect] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [speakResult, setSpeakResult] = useState<{ score: SpeechScore; transcript: string } | null>(null);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [saving, setSaving] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const band = PLACEMENT_BANDS[bandIdx];
  const item = band?.[itemIdx];
  const answeredCount = bandIdx * 4 + itemIdx + (feedback ? 1 : 0);

  const finish = useCallback(
    async (scores: number[]) => {
      setSaving(true);
      const stage = stageForBandScores(scores);
      const resolved = await resolvePlacement(stage);
      setResult(resolved);
      const identity = await getStudentIdentity();
      if (identity) {
        await savePlacement(identity, resolved);
        // Remember on this device that the test is done, so the
        // first-login prompt on the home screen stops appearing.
        await AsyncStorage.setItem(`placement_done_${identity.studentId}`, '1').catch(() => {});
      }
      setSaving(false);
      setPhase('result');
    },
    []
  );

  const recordAnswer = useCallback(
    (correct: boolean) => {
      const newBandCorrect = bandCorrect + (correct ? 1 : 0);
      if (itemIdx + 1 < band.length) {
        setBandCorrect(newBandCorrect);
        setItemIdx(itemIdx + 1);
      } else {
        const scores = [...bandScores, newBandCorrect];
        setBandScores(scores);
        if (newBandCorrect < 3 || bandIdx + 1 >= PLACEMENT_BANDS.length) {
          finish(scores);
          return;
        }
        setBandCorrect(0);
        setBandIdx(bandIdx + 1);
        setItemIdx(0);
      }
      setFeedback(null);
      setPicked(null);
      setSpeakResult(null);
    },
    [band, bandCorrect, bandIdx, bandScores, finish, itemIdx]
  );

  const answerWithFeedback = useCallback(
    (correct: boolean, pickedValue: string | null) => {
      if (feedback) return;
      setPicked(pickedValue);
      setFeedback(correct ? 'right' : 'wrong');
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => recordAnswer(correct), 1100);
    },
    [feedback, recordAnswer]
  );

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      if (!item || item.type !== 'speak' || feedback) return;
      const score = scoreSpeech(item.line, transcript);
      setSpeakResult({ score, transcript });
      answerWithFeedback(score.passed, null);
    },
    onError: () => undefined,
  });

  return (
    <View className="flex-1 bg-white">
      <SafeAreaView edges={['top']} className="w-full bg-[#0A192F] shadow-sm">
        <View className="max-w-7xl w-full mx-auto flex-row items-center gap-3 p-4 md:p-6">
          <Pressable onPress={() => router.back()} className="px-3 py-2 bg-white/10 rounded-lg border border-white/20">
            <Text className="text-white font-bold text-sm">← Back</Text>
          </Pressable>
          <Text className="text-xl md:text-2xl font-bold text-white tracking-wider">Find Your Start 🎯</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-2xl w-full mx-auto">
          {phase === 'intro' ? (
            <View className="items-center py-8">
              <Text className="text-6xl mb-4">🎯</Text>
              <Text className="text-3xl font-bold text-[#0A192F] mb-3 text-center">Where should you start?</Text>
              <Text className="text-slate-500 text-center text-lg mb-4">
                Answer a few questions — listening, choosing and speaking. It takes about 5 to 10 minutes and the
                questions get harder as you go.
              </Text>
              <Text className="text-slate-400 text-center mb-8">
                At the end we suggest a starting stage. It is only a suggestion — every lesson stays open, always.
              </Text>
              <Pressable
                onPress={() => setPhase('test')}
                className="px-8 py-4 bg-brand rounded-full items-center w-full max-w-sm"
              >
                <Text className="text-white font-bold text-base">Start the test</Text>
              </Pressable>
            </View>
          ) : phase === 'result' ? (
            <View className="items-center py-8">
              <Text className="text-6xl mb-4">🏏</Text>
              <Text className="text-3xl font-bold text-[#0A192F] mb-3 text-center">Your start</Text>
              {saving || !result ? (
                <ActivityIndicator size="large" color="#0A192F" />
              ) : (
                <>
                  <Text className="text-xl font-bold text-brand text-center mb-2">
                    {result.stageTitle || `Stage ${result.stage}`}
                    {result.moduleTitle ? ` · ${result.moduleTitle}` : ''}
                  </Text>
                  <View className="flex-row flex-wrap justify-center gap-2 mb-6">
                    {bandScores.map((score, i) => (
                      <View key={i} className={`px-3 py-1.5 rounded-full ${score >= 3 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                        <Text className={`font-bold text-sm ${score >= 3 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          Stage {i + 1}: {score}/4
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text className="text-slate-500 text-center mb-8">
                    Start there, or anywhere you like — nothing is locked. You can re-take this test any time.
                  </Text>
                  <Pressable
                    onPress={() => router.replace('/learner/path')}
                    className="px-8 py-4 bg-brand rounded-full items-center w-full max-w-sm mb-3"
                  >
                    <Text className="text-white font-bold text-base">Go to the Learning Path</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.replace('/learner')}
                    className="px-8 py-4 bg-slate-100 border border-slate-200 rounded-full items-center w-full max-w-sm"
                  >
                    <Text className="text-slate-600 font-bold text-base">Learner Home</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : item ? (
            <View>
              <View className="flex-row justify-between items-center mb-2">
                <Text className="font-bold text-slate-400">Stage {bandIdx + 1} questions</Text>
                <Text className="font-bold text-slate-400">{answeredCount} answered</Text>
              </View>
              <View className="h-2 bg-slate-100 rounded-full mb-8 overflow-hidden">
                <View
                  className="h-full bg-[#D4AF37] rounded-full"
                  style={{ width: `${Math.min(100, ((bandIdx * 4 + itemIdx) / 20) * 100)}%` }}
                />
              </View>

              {item.type === 'listen' ? (
                <View>
                  <Text className="text-2xl font-bold text-[#0A192F] text-center mb-2">🎧 Listen, then tap what you heard</Text>
                  <Pressable
                    onPress={() => speakWithCallback(item.say)}
                    className="self-center px-6 py-3.5 bg-brand rounded-full items-center mb-6"
                  >
                    <Text className="text-white font-bold">🔊 Play the sound</Text>
                  </Pressable>
                  <View className="gap-3">
                    {item.options.map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => answerWithFeedback(opt === item.answer, opt)}
                        className={`p-4 rounded-2xl border-2 items-center ${
                          picked === opt
                            ? feedback === 'right'
                              ? 'border-emerald-400 bg-emerald-50'
                              : 'border-red-300 bg-red-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <Text className="font-bold text-lg text-[#0A192F]">{opt}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : item.type === 'quiz' ? (
                <View>
                  <Text className="text-2xl font-bold text-[#0A192F] text-center mb-6">{item.prompt}</Text>
                  <View className="gap-3">
                    {item.options.map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => answerWithFeedback(opt === item.answer, opt)}
                        className={`p-4 rounded-2xl border-2 items-center ${
                          picked === opt
                            ? feedback === 'right'
                              ? 'border-emerald-400 bg-emerald-50'
                              : 'border-red-300 bg-red-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <Text className="font-bold text-lg text-[#0A192F]">{opt}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View>
                  <Text className="text-2xl font-bold text-[#0A192F] text-center mb-2">🗣️ Say this line</Text>
                  <Text className="text-xl text-center text-slate-600 mb-6">“{item.line}”</Text>
                  <Pressable
                    onPress={() => speakWithCallback(item.line)}
                    className="self-center px-6 py-3 bg-slate-100 border border-slate-200 rounded-full items-center mb-4"
                  >
                    <Text className="font-bold text-slate-700">🔊 Listen first</Text>
                  </Pressable>
                  {speakResult ? <SpeechScoreView score={speakResult.score} transcript={speakResult.transcript} /> : null}
                  {speech.supported === false ? (
                    <View className="gap-3">
                      <Pressable
                        onPress={() => answerWithFeedback(true, null)}
                        className="px-6 py-4 bg-emerald-500 rounded-full items-center"
                      >
                        <Text className="text-white font-bold">I said it right ✓</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => answerWithFeedback(false, null)}
                        className="px-6 py-3.5 bg-slate-100 border border-slate-200 rounded-full items-center"
                      >
                        <Text className="font-bold text-slate-600">That was too hard</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        if (!speech.listening) speech.start();
                      }}
                      className={`px-6 py-4 rounded-full items-center ${speech.listening ? 'bg-red-400' : 'bg-brand'}`}
                    >
                      <Text className="text-white font-bold">
                        {speech.listening ? '🎙️ Listening… say it now!' : '🎤 Tap and say it'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              {feedback ? (
                <Text className={`text-center font-bold text-lg mt-6 ${feedback === 'right' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {feedback === 'right' ? '✓ Correct!' : 'Not quite — keep going!'}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
