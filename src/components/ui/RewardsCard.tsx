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
    <View className="mb-8 rounded-full border border-inkline bg-white py-3 pl-5 pr-5 shadow-sm">
      <View className="flex-row items-center gap-3">
        <Text className="text-xl">{level.emoji}</Text>
        <Text className="font-sans text-sm font-bold uppercase tracking-[1.5px] text-navy">
          {level.name} · {totals.xp} XP
        </Text>
        <View className="h-[3px] flex-1 overflow-hidden rounded-full bg-gold-light">
          <View
            className="h-full rounded-full bg-gold"
            style={{ width: `${Math.round(level.progress * 100)}%` }}
          />
        </View>
        <Text className="font-sans text-sm font-bold uppercase tracking-[1.5px] text-navy">
          ⭐ {totals.stars} stars
        </Text>
      </View>
      <Text className="mt-1.5 pl-9 text-xs font-medium text-slate-400">
        {level.nextAt
          ? `${level.nextAt - totals.xp} XP to the next level`
          : 'Top level — you are an MVP! 🏆'}
      </Text>
    </View>
  );
}
