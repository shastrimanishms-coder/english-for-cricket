import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { computeCurrentStreak } from '../../lib/badgeAwards';
import { awardPoints, fetchPointTotals, levelForXp, POINTS } from '../../lib/points';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';

/**
 * The learner's XP & Stars card: current level (Rookie -> Player ->
 * Captain -> MVP, after the book series), progress to the next level,
 * and the star balance. Also quietly pays the streak-week stars when a
 * 7+ day streak is showing. Everything fails soft — before migration 18
 * the card simply reads zero.
 */
export default function RewardsCard() {
  const [totals, setTotals] = useState<{ xp: number; stars: number } | null>(null);

  useEffect(() => {
    (async () => {
      const identity = await getStudentIdentity();
      if (!identity) return;

      // Streak-week stars: best-effort from the student's own activity
      // days (legacy all-days streak — stricter than the study-days
      // streak, so it can only ever under-award, never over-award).
      try {
        const { data } = await supabase
          .from('activity_logs')
          .select('created_at')
          .eq('student_id', identity.studentId)
          .eq('student_kind', identity.studentKind)
          .order('created_at', { ascending: false })
          .limit(60);
        const days = [...new Set((data || []).map((r: any) => String(r.created_at).slice(0, 10)))];
        if (computeCurrentStreak(days) >= 7) {
          const now = new Date();
          const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
          await awardPoints(identity, 'streak_week', 0, POINTS.STREAK_WEEK_STARS, monday.toISOString().slice(0, 10));
        }
      } catch {
        // Streak stars are a bonus; never block the card on them.
      }

      setTotals(await fetchPointTotals(identity));
    })();
  }, []);

  if (!totals) return null;
  const level = levelForXp(totals.xp);

  return (
    <View className="bg-[#0A192F] rounded-2xl p-5 mb-8">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Text className="text-3xl">{level.emoji}</Text>
          <View>
            <Text className="text-white font-bold text-lg">{level.name}</Text>
            <Text className="text-white/60 text-xs font-semibold">{totals.xp} XP earned</Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-[#D4AF37] font-bold text-lg">⭐ {totals.stars}</Text>
          <Text className="text-white/60 text-xs font-semibold">stars collected</Text>
        </View>
      </View>
      <View className="h-2.5 bg-white/15 rounded-full mt-4 overflow-hidden">
        <View className="h-full bg-[#D4AF37] rounded-full" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </View>
      <Text className="text-white/70 text-xs mt-2">
        {level.nextAt
          ? `${level.nextAt - totals.xp} XP to the next level`
          : 'Top level — you are an MVP! 🏆'}
      </Text>
    </View>
  );
}
