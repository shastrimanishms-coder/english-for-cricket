import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EXTRA_META, fetchRecommendations, type ExtraKind, type Recommendation } from '../../lib/extras';
import { POINTS } from '../../lib/points';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';

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
  const [nextLesson, setNextLesson] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    (async () => {
      const identity = await getStudentIdentity();
      const found = await fetchRecommendations(lessonId, identity);
      setRecs(found);
      if (found.length === 0) {
        // No extras tagged to this lesson yet: still point the learner
        // somewhere useful - the next lesson in the same module.
        try {
          const { data: current } = await supabase
            .from('curriculum_lessons')
            .select('module_id, order_index')
            .eq('id', lessonId)
            .maybeSingle();
          if (current?.module_id) {
            const { data: next } = await supabase
              .from('curriculum_lessons')
              .select('id, title')
              .eq('module_id', current.module_id)
              .gt('order_index', current.order_index ?? 0)
              .order('order_index', { ascending: true })
              .limit(1);
            if (next && next.length > 0) setNextLesson(next[0] as any);
          }
        } catch {
          // Fail soft: the completion screen simply shows no card.
        }
      }
    })();
  }, [lessonId]);

  if (recs.length === 0) {
    if (!nextLesson) return null;
    return (
      <View className="w-full max-w-sm mb-3">
        <Text className="text-center font-display text-lg font-semibold text-navy mb-2">Keep going ⭐</Text>
        <Pressable
          onPress={() => router.push(`/lesson/${nextLesson.id}` as any)}
          className="flex-row items-center gap-3 bg-white border border-inkline rounded-[20px] px-4 py-3 mb-2 shadow-sm"
        >
          <Text className="text-2xl">📚</Text>
          <View className="flex-1">
            <Text className="font-sans font-bold text-navy" numberOfLines={1}>{nextLesson.title}</Text>
            <Text className="text-slate-400 text-xs">Next lesson in this module</Text>
          </View>
          <Text className="text-gold-dark font-bold">Start ›</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="w-full max-w-sm mb-3">
      <Text className="text-center font-display text-lg font-semibold text-navy mb-2">Keep going — try these next ⭐</Text>
      {recs.map((rec) => (
        <Pressable
          key={`${rec.kind}:${rec.id}`}
          onPress={() => router.push(ROUTES[rec.kind](rec.id) as any)}
          className="flex-row items-center gap-3 bg-white border border-inkline rounded-[20px] px-4 py-3 mb-2 shadow-sm"
        >
          <Text className="text-2xl">{EXTRA_META[rec.kind].emoji}</Text>
          <View className="flex-1">
            <Text className="font-sans font-bold text-navy" numberOfLines={1}>{rec.title}</Text>
            <Text className="text-slate-400 text-xs">{EXTRA_META[rec.kind].label} · extra practice</Text>
          </View>
          {rec.done ? (
            <Text className="text-pitch font-bold">✓ Done</Text>
          ) : (
            <Text className="text-gold-dark font-bold">+{POINTS.EXTRA_STARS} ⭐</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
