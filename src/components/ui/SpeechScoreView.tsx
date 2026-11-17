import { Text, View } from 'react-native';
import { scoreMessage, type SpeechScore } from '../../lib/speechScoring';

// The feedback panel shown after a speaking attempt: what the device
// heard, the target phrase with every word coloured by how it landed
// (green = perfect, orange = close, red = needs another try), and the
// overall score. Shared by the lesson player's Speak & Repeat slides
// and the Speaking Practice screen so both speak the same language.

const CHIP_CLASSES: Record<string, string> = {
  correct: 'bg-pitch-light/60 border-pitch/40',
  close: 'bg-gold-light/50 border-gold/50',
  wrong: 'bg-red-50 border-red-200',
  missing: 'bg-red-50/60 border-red-100',
};

const CHIP_TEXT_CLASSES: Record<string, string> = {
  correct: 'text-pitch-dark',
  close: 'text-gold-dark',
  wrong: 'text-red-600',
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
      <Text className={`font-display text-5xl font-bold ${accuracyColor}`}>{score.accuracy}%</Text>
      <Text className="mt-1 mb-4 text-center font-sans text-base font-bold text-slate-700">
        {scoreMessage(score.accuracy)}
      </Text>

      <View className="flex-row flex-wrap justify-center gap-2 mb-3">
        {score.words.map((w, idx) => (
          <View
            key={`${w.word}-${idx}`}
            className={`items-center rounded-full border px-4 py-2 ${CHIP_CLASSES[w.status]}`}
          >
            <Text className={`font-sans text-lg font-bold ${CHIP_TEXT_CLASSES[w.status]}`}>{w.word}</Text>
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

      <View className="mt-3 flex-row gap-4">
        <Text className="text-xs font-bold text-pitch">● Perfect</Text>
        <Text className="text-xs font-bold text-gold-dark">● Close</Text>
        <Text className="text-xs font-bold text-red-500">● Try again</Text>
      </View>
    </View>
  );
}
