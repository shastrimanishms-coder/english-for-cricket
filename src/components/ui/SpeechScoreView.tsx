import { Text, View } from 'react-native';
import { scoreMessage, type SpeechScore } from '../../lib/speechScoring';

// The feedback panel shown after a speaking attempt: what the device
// heard, the target phrase with every word coloured by how it landed
// (green = perfect, orange = close, red = needs another try), and the
// overall score. Shared by the lesson player's Speak & Repeat slides
// and the Speaking Practice screen so both speak the same language.

const CHIP_CLASSES: Record<string, string> = {
  correct: 'bg-emerald-100 border-emerald-300',
  close: 'bg-amber-100 border-amber-300',
  wrong: 'bg-red-100 border-red-300',
  missing: 'bg-red-50 border-red-200',
};

const CHIP_TEXT_CLASSES: Record<string, string> = {
  correct: 'text-emerald-800',
  close: 'text-amber-800',
  wrong: 'text-red-700',
  missing: 'text-red-400',
};

export default function SpeechScoreView({
  score,
  transcript,
}: {
  score: SpeechScore;
  transcript: string;
}) {
  const accuracyColor =
    score.accuracy >= 90
      ? 'text-emerald-600'
      : score.accuracy >= 70
        ? 'text-emerald-600'
        : score.accuracy >= 50
          ? 'text-amber-600'
          : 'text-red-500';

  return (
    <View className="w-full items-center">
      <Text className={`text-5xl font-bold ${accuracyColor}`}>{score.accuracy}%</Text>
      <Text className="text-base font-bold text-slate-700 mt-1 mb-4 text-center">
        {scoreMessage(score.accuracy)}
      </Text>

      <View className="flex-row flex-wrap justify-center gap-2 mb-3">
        {score.words.map((w, idx) => (
          <View
            key={`${w.word}-${idx}`}
            className={`px-3 py-2 rounded-xl border ${CHIP_CLASSES[w.status]} items-center`}
          >
            <Text className={`text-lg font-bold ${CHIP_TEXT_CLASSES[w.status]}`}>{w.word}</Text>
            {w.heard && w.status !== 'correct' ? (
              <Text className="text-xs text-slate-500">you: {w.heard}</Text>
            ) : null}
            {w.status === 'missing' ? <Text className="text-xs text-slate-400">not heard</Text> : null}
          </View>
        ))}
      </View>

      {transcript ? (
        <Text className="text-sm text-slate-500 text-center mb-1">
          You said: &quot;{transcript}&quot;
        </Text>
      ) : null}
      {score.extraWords.length > 0 ? (
        <Text className="text-xs text-slate-400 text-center">
          Extra words heard: {score.extraWords.join(', ')}
        </Text>
      ) : null}

      <View className="flex-row gap-4 mt-3">
        <Text className="text-xs text-emerald-700 font-bold">🟩 Perfect</Text>
        <Text className="text-xs text-amber-700 font-bold">🟧 Close</Text>
        <Text className="text-xs text-red-500 font-bold">🟥 Try again</Text>
      </View>
    </View>
  );
}
