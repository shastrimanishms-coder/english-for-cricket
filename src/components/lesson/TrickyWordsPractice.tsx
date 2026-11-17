import * as Speech from 'expo-speech';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { awardPoints, POINTS } from '../../lib/points';
import { scoreSpeech } from '../../lib/speechScoring';
import { speakWithCallback } from '../../lib/speechCue';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { useSpeechCheck } from '../../lib/useSpeechCheck';

export interface TrickyWord {
  /** The word as written in the lesson. */
  word: string;
  /** What the recogniser heard the learner say, when it heard something else. */
  heard?: string;
}

interface Props {
  words: TrickyWord[];
  lessonId: string;
  onClose: (fixedCount: number) => void;
}

/**
 * Red-words review (Shastri's design): after a lesson, the words that came
 * out red get one more friendly round — one word at a time, hear it,
 * try it, see what it sounded like, try again until it's right.
 *
 * Accent fairness: a single word counts as FIXED at "close" (orange,
 * ~60%) or better, because children, teens and adults all pronounce
 * words differently and one-word recognition is the hardest case.
 * Tries are unlimited, skipping is allowed, and every fixed word pays
 * +2 stars once per lesson (the points ledger dedupes).
 */
const FIXED_AT = 60;

export default function TrickyWordsPractice({ words, lessonId, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [fixed, setFixed] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState<{ heard: string; accuracy: number } | null>(null);
  const [done, setDone] = useState(false);
  const busyRef = useRef(false);

  const current = words[index];

  const markFixed = useCallback(
    async (word: string) => {
      setFixed((prev) => new Set(prev).add(word.toLowerCase()));
      const identity = await getStudentIdentity();
      if (identity) {
        await awardPoints(identity, 'red_word', 0, POINTS.RED_WORD_STARS, `${lessonId}:${word.toLowerCase()}`);
      }
    },
    [lessonId]
  );

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      if (!current || busyRef.current) return;
      busyRef.current = true;
      const score = scoreSpeech(current.word, transcript);
      setAttempt({ heard: transcript, accuracy: score.accuracy });
      if (score.accuracy >= FIXED_AT) {
        (async () => {
          await markFixed(current.word);
        })();
      }
      busyRef.current = false;
    },
    onError: () => {
      busyRef.current = false;
    },
  });

  if (done || !current) {
    return (
      <View className="items-center">
        <Text className="text-5xl mb-4">🎉</Text>
        <Text className="text-2xl font-bold text-[#0A192F] text-center mb-2">Tricky Words Practice</Text>
        <Text className="text-lg text-slate-500 text-center mb-2">
          You fixed {fixed.size} of {words.length} words!
        </Text>
        {fixed.size > 0 ? (
          <Text className="text-xl font-bold text-[#D4AF37] mb-6">+{fixed.size * POINTS.RED_WORD_STARS} ⭐ earned</Text>
        ) : null}
        <Pressable onPress={() => onClose(fixed.size)} className="px-8 py-4 bg-navy border-b-4 border-navy-deep rounded-full items-center">
          <Text className="text-white font-bold text-base">Done</Text>
        </Pressable>
      </View>
    );
  }

  const isFixed = fixed.has(current.word.toLowerCase());
  const next = () => {
    setAttempt(null);
    if (index + 1 >= words.length) setDone(true);
    else setIndex(index + 1);
  };

  return (
    <View className="w-full max-w-md">
      <Text className="text-center text-slate-400 font-bold mb-1">
        Word {index + 1} of {words.length} · ⭐ {fixed.size * POINTS.RED_WORD_STARS} earned
      </Text>
      <Text className="text-2xl font-bold text-[#0A192F] text-center mb-6">Fix your tricky words 🗣️</Text>

      <View className="bg-white border-2 border-red-200 rounded-3xl p-6 items-center mb-4">
        <Text className="text-4xl font-bold text-[#0A192F] mb-2">{current.word}</Text>
        {current.heard ? (
          <Text className="text-slate-500 text-center">
            In the lesson it sounded like: <Text className="font-bold text-red-500">“{current.heard}”</Text>
          </Text>
        ) : (
          <Text className="text-slate-500 text-center">This word was hard to hear in the lesson.</Text>
        )}
      </View>

      <View className="flex-row gap-3 mb-4">
        <Pressable
          onPress={() => speakWithCallback(current.word)}
          className="flex-1 px-4 py-3 bg-white border border-inkline rounded-full items-center"
        >
          <Text className="font-bold text-slate-700">🔊 Listen</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            try {
              Speech.stop();
              Speech.speak(current.word, { language: 'en', rate: 0.55 });
            } catch {
              speakWithCallback(current.word);
            }
          }}
          className="flex-1 px-4 py-3 bg-white border border-inkline rounded-full items-center"
        >
          <Text className="font-bold text-slate-700">🐢 Listen slowly</Text>
        </Pressable>
      </View>

      {attempt ? (
        <View className={`rounded-2xl p-4 mb-4 ${isFixed ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          <Text className="text-center text-slate-600">
            It sounded like: <Text className="font-bold">“{attempt.heard}”</Text>
          </Text>
          <Text className={`text-center font-bold text-lg ${isFixed ? 'text-emerald-600' : 'text-amber-600'}`}>
            {attempt.accuracy}% {isFixed ? '— Fixed! +2 ⭐' : '— nearly there, try again!'}
          </Text>
        </View>
      ) : null}

      {speech.supported === false ? (
        <Pressable
          onPress={async () => {
            await markFixed(current.word);
            setAttempt({ heard: current.word, accuracy: 100 });
          }}
          className="px-6 py-4 bg-emerald-500 rounded-full items-center mb-3"
        >
          <Text className="text-white font-bold">I said it right ✓</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => {
            if (!speech.listening) speech.start();
          }}
          className={`px-6 py-4 rounded-full items-center mb-3 ${speech.listening ? 'bg-red-400' : 'bg-gold border-b-4 border-gold-dark'}`}
        >
          <Text className="text-white font-bold text-base">
            {speech.listening ? '🎙️ Listening… speak now!' : '🎤 Try it — tap and say the word'}
          </Text>
        </Pressable>
      )}
      {speech.listening && speech.interim ? (
        <Text className="text-center text-slate-400 mb-3">“{speech.interim}”</Text>
      ) : null}

      <View className="flex-row gap-3">
        <Pressable onPress={next} className="flex-1 px-4 py-3 bg-white border border-inkline rounded-full items-center">
          <Text className="font-bold text-slate-600">{isFixed ? 'Next word →' : 'Skip for now'}</Text>
        </Pressable>
        <Pressable
          onPress={() => onClose(fixed.size)}
          className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-full items-center"
        >
          <Text className="font-bold text-slate-500">Finish</Text>
        </Pressable>
      </View>
    </View>
  );
}
