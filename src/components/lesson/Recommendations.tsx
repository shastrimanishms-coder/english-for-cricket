import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EXTRA_META, fetchRecommendations, type ExtraKind, type Recommendation } from '../../lib/extras';
import { POINTS } from '../../lib/points';
import { getStudentIdentity } from '../../lib/studentIdentity';

const ROUTES: Record<ExtraKind, (id: string) => string> = {
  game: (id) => `/games/${id}`,
  video: (id) => `/videos/${id}`,
  download: () => '/downloads',
  speaking: () => '/learner/speaking',
  reading: () => '/learner/reading',
};

/**
 * "Keep going" cards on the lesson-complete screen: the games, videos,
 * downloads, speaking scenarios and stories an admin tagged to this
 * lesson. Optional extras — they never block the next lesson — and
 * each one pays +3 stars the first time it is done.
 */
export default function Recommendations({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    (async () => {
      const identity = await getStudentIdentity();
      setRecs(await fetchRecommendations(lessonId, identity));
    })();
  }, [lessonId]);

  if (recs.length === 0) return null;

  return (
    <View className="w-full max-w-sm mb-3">
      <Text className="text-center font-bold text-[#0A192F] mb-2">Keep going — try these next ⭐</Text>
      {recs.map((rec) => (
        <Pressable
          key={`${rec.kind}:${rec.id}`}
          onPress={() => router.push(ROUTES[rec.kind](rec.id) as any)}
          className="flex-row items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-2"
        >
          <Text className="text-2xl">{EXTRA_META[rec.kind].emoji}</Text>
          <View className="flex-1">
            <Text className="font-bold text-[#0A192F]" numberOfLines={1}>{rec.title}</Text>
            <Text className="text-slate-400 text-xs">{EXTRA_META[rec.kind].label} · extra practice</Text>
          </View>
          {rec.done ? (
            <Text className="text-emerald-600 font-bold">✓ Done</Text>
          ) : (
            <Text className="text-[#D4AF37] font-bold">+{POINTS.EXTRA_STARS} ⭐</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
