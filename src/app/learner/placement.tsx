import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GhostButton, GoldButton, ScreenHeader } from '../../components/ui/Elegant';
import SpeechScoreView from '../../components/ui/SpeechScoreView';
import {
  PLACEMENT_BANDS,
  resolvePlacement,
  savePlacement,
  stageForBandScores,
  type PlacementResult,
} from '../../lib/placementBank';
import { scoreSpeechBest, type SpeechScore } from '../../lib/speechScoring';
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
    onFinal: (_transcript, alternatives) => {
      if (!item || item.type !== 'speak' || feedback) return;
      const score = scoreSpeechBest(item.line, alternatives);
      setSpeakResult({ score, transcript: score.heard });
      answerWithFeedback(score.passed, null);
    },
    onError: () => undefined,
  });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Find Your Start" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-2xl w-full mx-auto">
          {phase === 'intro' ? (
            <View className="items-center py-8">
              <View className="mb-4 h-24 w-24 items-center justify-center rounded-full bg-gold-light">
                <Ionicons name="flag-outline" size={44} color="#0A192F" />
              </View>
              <Text className="font-display text-3xl font-semibold text-navy mb-3 text-center">Where should you start?</Text>
              <Text className="font-sans text-slate-500 text-center text-lg mb-4">
                Answer a few questions — listening, choosing and speaking. It takes about 5 to 10 minutes and the
                questions get harder as you go.
              </Text>
              <Text className="font-sans text-slate-400 text-center mb-8">
                At the end we suggest a starting stage. It is only a suggestion — every lesson stays open, always.
              </Text>
              <GoldButton
                label="Start the test"
                onPress={() => setPhase('test')}
                className="w-full max-w-sm"
              />
            </View>
          ) : phase === 'result' ? (
            <View className="items-center py-8">
              <Text className="text-6xl mb-4">🏏</Text>
              <Text className="font-display text-3xl font-semibold text-navy mb-3 text-center">Your start</Text>
              {saving || !result ? (
                <ActivityIndicator size="large" color="#0A192F" />
              ) : (
                <>
                  <Text className="font-display text-[22px] font-semibold text-navy text-center mb-2">
                    {result.stageTitle || `Stage ${result.stage}`}
                    {result.moduleTitle ? ` · ${result.moduleTitle}` : ''}
                  </Text>
                  <View className="flex-row flex-wrap justify-center gap-2 mb-6">
                    {bandScores.map((score, i) => (
                      <View key={i} className={`px-3 py-1.5 rounded-full ${score >= 3 ? 'bg-pitch-light' : 'bg-gold-light'}`}>
                        <Text className={`font-sans font-bold text-sm ${score >= 3 ? 'text-pitch-dark' : 'text-gold-dark'}`}>
                          Stage {i + 1}: {score}/4
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text className="font-sans text-slate-500 text-center mb-8">
                    Start there, or anywhere you like — nothing is locked. You can re-take this test any time.
                  </Text>
                  <GoldButton
                    label="Go to the Learning Path"
                    onPress={() => router.replace('/learner/path')}
                    className="w-full max-w-sm mb-3"
                  />
                  <GhostButton
                    label="Learner Home"
                    onPress={() => router.replace('/learner')}
                    className="w-full max-w-sm"
                  />
                </>
              )}
            </View>
          ) : item ? (
            <View>
              <View className="flex-row justify-between items-center mb-2">
                <Text className="font-sans font-bold text-slate-400">Stage {bandIdx + 1} questions</Text>
                <Text className="font-sans font-bold text-slate-400">{answeredCount} answered</Text>
              </View>
              <View className="h-1.5 bg-gold-light rounded-full mb-8 overflow-hidden">
                <View
                  className="h-full bg-gold rounded-full"
                  style={{ width: `${Math.min(100, ((bandIdx * 4 + itemIdx) / 20) * 100)}%` }}
                />
              </View>

              {item.type === 'listen' ? (
                <View>
                  <Text className="font-display text-2xl font-semibold text-navy text-center mb-4">🎧 Listen, then tap what you heard</Text>
                  <GoldButton
                    label="🔊 Play the sound"
                    onPress={() => speakWithCallback(item.say)}
                    className="self-center mb-6"
                  />
                  <View className="gap-3">
                    {item.options.map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => answerWithFeedback(opt === item.answer, opt)}
                        className={`p-4 rounded-[20px] border items-center shadow-sm ${
                          picked === opt
                            ? feedback === 'right'
                              ? 'border-pitch bg-pitch-light'
                              : 'border-red-300 bg-red-50'
                            : 'border-inkline bg-white'
                        }`}
                      >
                        <Text className="font-sans font-bold text-lg text-navy">{opt}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : item.type === 'quiz' ? (
                <View>
                  <Text className="font-display text-2xl font-semibold text-navy text-center mb-6">{item.prompt}</Text>
                  <View className="gap-3">
                    {item.options.map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => answerWithFeedback(opt === item.answer, opt)}
                        className={`p-4 rounded-[20px] border items-center shadow-sm ${
                          picked === opt
                            ? feedback === 'right'
                              ? 'border-pitch bg-pitch-light'
                              : 'border-red-300 bg-red-50'
                            : 'border-inkline bg-white'
                        }`}
                      >
                        <Text className="font-sans font-bold text-lg text-navy">{opt}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View>
                  <Text className="font-display text-2xl font-semibold text-navy text-center mb-2">🗣️ Say this line</Text>
                  <Text className="font-sans text-xl text-center text-slate-600 mb-6">“{item.line}”</Text>
                  <GhostButton
                    label="🔊 Listen first"
                    onPress={() => speakWithCallback(item.line)}
                    className="self-center mb-4"
                  />
                  {speakResult ? <SpeechScoreView score={speakResult.score} transcript={speakResult.transcript} /> : null}
                  {speech.supported === false ? (
                    <View className="gap-3">
                      <Pressable
                        onPress={() => answerWithFeedback(true, null)}
                        className="px-6 py-4 bg-pitch border-b-4 border-pitch-dark rounded-full items-center"
                      >
                        <Text className="font-sans text-white font-bold">I said it right ✓</Text>
                      </Pressable>
                      <GhostButton label="That was too hard" onPress={() => answerWithFeedback(false, null)} />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        if (!speech.listening) speech.start();
                      }}
                      className={`px-6 py-4 rounded-full items-center border-b-4 ${
                        speech.listening ? 'bg-red-400 border-red-500' : 'bg-gold border-gold-dark'
                      }`}
                    >
                      <Text className={`font-sans font-bold ${speech.listening ? 'text-white' : 'text-navy'}`}>
                        {speech.listening ? '🎙️ Listening… say it now!' : '🎤 Tap and say it'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              {feedback ? (
                <Text className={`font-sans text-center font-bold text-lg mt-6 ${feedback === 'right' ? 'text-pitch' : 'text-gold-dark'}`}>
                  {feedback === 'right' ? '✓ Correct!' : 'Not quite — keep going!'}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
