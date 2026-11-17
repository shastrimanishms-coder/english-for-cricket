import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import { useRequireRole } from '../../hooks/useRequireRole';
import { fetchExtrasDone } from '../../lib/extras';
import { fetchPointTotals, levelForXp } from '../../lib/points';
import { groupStudentsByClass } from '../../lib/studentGroups';
import { supabase } from '../../lib/supabase';

interface StudentBadge {
  title: string;
  image_url: string | null;
}

interface StudentProgress {
  id: string;
  display_name: string;
  username: string;
  class_name: string | null; // migration 14: class / group / team
  gender: string | null;
  avatar_url: string | null;
  badges: StudentBadge[];
  playtimeSeconds: number;
  lessonsCompleted: number;
  accuracyPercent: number | null;
}

type ReportPeriod = 'today' | 'week' | 'overall';

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'Today',
  week: 'This Week',
  overall: 'Overall',
};

/**
 * The local-time start of a report period, as an ISO string for the
 * database filters (null = no filter, all time). "This Week" starts
 * on Monday, matching the school week.
 */
function periodStartISO(period: ReportPeriod): string | null {
  if (period === 'overall') return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
  }
  return start.toISOString();
}

function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)} min`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hrs`;
}

/**
 * XP, stars, recommended extras and Smart Reading for one student —
 * fetched only when the student's card is expanded. All sources fail
 * soft (migrations 18-20), and the block hides itself when the student
 * has no rewards activity yet.
 */
function StudentExtras({ studentId }: { studentId: string }) {
  const [info, setInfo] = useState<{
    xp: number;
    stars: number;
    extras: number;
    readingBest: number | null;
    readingCount: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const identity = { studentId, studentKind: 'sub_account' as const, displayName: null };
      const totals = await fetchPointTotals(identity);
      const done = await fetchExtrasDone(identity);
      let readingBest: number | null = null;
      let readingCount = 0;
      try {
        const { data } = await supabase.rpc('get_reading_records', {
          p_student_id: studentId,
          p_student_kind: 'sub_account',
        });
        if (Array.isArray(data)) {
          readingCount = data.length;
          for (const r of data as any[]) {
            if (r.accuracy != null) readingBest = Math.max(readingBest ?? 0, r.accuracy);
          }
        }
      } catch {
        // Smart Reading not switched on yet.
      }
      setInfo({ xp: totals.xp, stars: totals.stars, extras: done.size, readingBest, readingCount });
    })();
  }, [studentId]);

  if (!info) return null;
  if (info.xp === 0 && info.stars === 0 && info.readingCount === 0) return null;
  const level = levelForXp(info.xp);

  return (
    <View className="mb-6 bg-gold-light/50 border border-gold/40 rounded-2xl p-4">
      <MicroLabel className="mb-1">Rewards & Extras</MicroLabel>
      <Text className="font-sans text-slate-600">
        {level.emoji} {level.name} · {info.xp} XP · ⭐ {info.stars} stars · {info.extras} recommended extras done
        {info.readingCount > 0
          ? ` · 📖 Smart Reading: ${info.readingCount} session${info.readingCount > 1 ? 's' : ''}${info.readingBest !== null ? `, best accuracy ${info.readingBest}%` : ''}`
          : ''}
      </Text>
    </View>
  );
}

export default function LearningProgress() {
  const router = useRouter();
  const guardStatus = useRequireRole(['manager']);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  // Report period for the playtime / lessons / accuracy figures.
  // Badges are always all-time (they are earned once, not per period).
  const [period, setPeriod] = useState<ReportPeriod>('overall');

  // Collapsible class groups + student cards, same organisation as
  // the Students screen and the admin tree.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});
  const studentGroups = useMemo(() => groupStudentsByClass(students), [students]);

  const getMascot = (gender: string | null, avatar_url: string | null) => {
    if (avatar_url) return avatar_url;
    if (gender === 'Male') return '👦';
    if (gender === 'Female') return '👧';
    return '🏏';
  };

  const fetchProgressData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('manager_id', user.id)
        .single();

      if (orgError || !org) throw new Error('Organization not found');

      // class_name arrives with migration 14; until it is run, fall
      // back to the select without it so this screen keeps working.
      const badgesJoin = `
          student_badges (
            badges (
              title,
              image_url
            )
          )
        `;
      let studentsData: any[] | null = null;
      const withClass = await supabase
        .from('sub_accounts')
        .select(`id, display_name, username, class_name, gender, avatar_url, ${badgesJoin}`)
        .eq('organization_id', org.id)
        .eq('is_active', true);
      if (withClass.error && /class_name/.test(withClass.error.message)) {
        const fallback = await supabase
          .from('sub_accounts')
          .select(`id, display_name, username, gender, avatar_url, ${badgesJoin}`)
          .eq('organization_id', org.id)
          .eq('is_active', true);
        if (fallback.error) throw fallback.error;
        studentsData = fallback.data;
      } else if (withClass.error) {
        throw withClass.error;
      } else {
        studentsData = withClass.data;
      }

      const formattedStudents: StudentProgress[] = (studentsData || []).map((s) => ({
        id: s.id,
        display_name: s.display_name,
        username: s.username || '',
        class_name: s.class_name ?? null,
        gender: s.gender,
        avatar_url: s.avatar_url,
        badges: ((s.student_badges || []) as any[]).flatMap((sb: any) => {
          // PostgREST returns the joined `badges` row as an object (many-to-one)
          // or an array (one-to-many) depending on the relationship shape.
          const b = sb?.badges;
          return Array.isArray(b) ? b : b ? [b] : [];
        }) as StudentBadge[],
        playtimeSeconds: 0,
        lessonsCompleted: 0,
        accuracyPercent: null,
      }));

      // Real telemetry aggregates for these students. Each query fails
      // soft on its own: if a table is unreachable (e.g. its RLS does not
      // cover this manager), the affected figures simply stay at zero
      // instead of breaking the whole dashboard.
      const studentIds = formattedStudents.map((s) => s.id);
      const since = periodStartISO(period);
      if (studentIds.length > 0) {
        try {
          let logsQuery = supabase
            .from('activity_logs')
            .select('student_id, duration_seconds')
            .in('student_id', studentIds);
          if (since) logsQuery = logsQuery.gte('created_at', since);
          const { data: logs, error: logsError } = await logsQuery;
          if (logsError) throw logsError;
          const totals = new Map<string, number>();
          for (const row of logs || []) {
            totals.set(row.student_id, (totals.get(row.student_id) || 0) + (row.duration_seconds || 0));
          }
          for (const s of formattedStudents) {
            s.playtimeSeconds = totals.get(s.id) || 0;
          }
        } catch (logsErr) {
          console.log('Playtime totals unavailable:', logsErr);
        }

        try {
          let completionsQuery = supabase
            .from('lesson_completions')
            .select('student_id, score_correct, score_total')
            .eq('student_kind', 'sub_account')
            .in('student_id', studentIds);
          if (since) completionsQuery = completionsQuery.gte('completed_at', since);
          const { data: completions, error: completionsError } = await completionsQuery;
          if (completionsError) throw completionsError;
          const counts = new Map<string, number>();
          const correct = new Map<string, number>();
          const total = new Map<string, number>();
          for (const row of completions || []) {
            counts.set(row.student_id, (counts.get(row.student_id) || 0) + 1);
            correct.set(row.student_id, (correct.get(row.student_id) || 0) + (row.score_correct || 0));
            total.set(row.student_id, (total.get(row.student_id) || 0) + (row.score_total || 0));
          }
          for (const s of formattedStudents) {
            s.lessonsCompleted = counts.get(s.id) || 0;
            const t = total.get(s.id) || 0;
            s.accuracyPercent = t > 0 ? Math.round(((correct.get(s.id) || 0) / t) * 100) : null;
          }
        } catch (completionsErr) {
          console.log('Lesson completion totals unavailable:', completionsErr);
        }
      }

      setStudents(formattedStudents);
    } catch (error) {
      console.error('Error fetching progress:', error instanceof Error ? error.message : error);
      Alert.alert('Error', 'Could not load learning progress.');
    } finally {
      setLoading(false);
    }
  }, [router, period]);

  useEffect(() => {
    (async () => {
      await fetchProgressData();
    })();
  }, [fetchProgressData]);

  if (loading || guardStatus !== 'authorized') {
    return (
      <View className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <ScreenHeader title="Learning Progress" onBack={() => router.push('/manager')} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-5xl w-full mx-auto space-y-6">
          <Text className="font-sans text-slate-500 text-lg mb-4">
            Track lesson completion, accuracy, and earned badges for all your students.
          </Text>

          {/* Report period: the figures below (playtime, lessons,
              accuracy) cover just this period. Badges are earned
              once, so they always show all-time. */}
          <View className="flex-row gap-2 mb-2">
            {(Object.keys(PERIOD_LABELS) as ReportPeriod[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                className={`px-5 py-2.5 rounded-full border ${
                  period === p
                    ? 'bg-navy border-navy'
                    : 'bg-white border-inkline'
                }`}
              >
                <Text className={`font-sans font-bold text-sm ${period === p ? 'text-white' : 'text-slate-600'}`}>
                  {PERIOD_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="font-sans text-sm text-slate-500 mb-6">
            {PERIOD_LABELS[period]}: {students.reduce((sum, s) => sum + s.lessonsCompleted, 0)} lessons
            completed • {formatPlaytime(students.reduce((sum, s) => sum + s.playtimeSeconds, 0))} total
            playtime • Badges are always all-time
          </Text>

          {students.length === 0 ? (
            <View className="bg-white p-12 rounded-[20px] border border-inkline shadow-sm items-center">
              <View className="w-16 h-16 rounded-full bg-navy items-center justify-center mb-4">
                <Ionicons name="stats-chart" size={28} color="#D4AF37" />
              </View>
              <Text className="font-display text-xl font-semibold text-navy">No Students Yet</Text>
              <Text className="font-sans text-slate-500 mt-2">Add students in the &apos;My Students&apos; tab to see their progress.</Text>
            </View>
          ) : (
            studentGroups.map((group) => {
              const groupOpen = !collapsedGroups[group.label];
              return (
                <View key={group.label} className="mb-6">
                  {/* Class / group / team header - tap to collapse */}
                  <Pressable
                    onPress={() => setCollapsedGroups(prev => ({ ...prev, [group.label]: !prev[group.label] }))}
                    className="flex-row items-center justify-between py-2"
                  >
                    <Text className="font-sans font-bold text-navy">
                      {groupOpen ? '▾' : '▸'} 📚 {group.label}
                    </Text>
                    <MicroLabel>
                      {group.students.length} {group.students.length === 1 ? 'student' : 'students'}
                    </MicroLabel>
                  </Pressable>

                  {groupOpen && group.students.map((student) => {
                    const rowOpen = !!expandedStudents[student.id];
                    return (
                      <View key={student.id} className="bg-white rounded-[20px] border border-inkline shadow-sm mb-4 overflow-hidden">
                        {/* Collapsed header: name + ID + headline figures */}
                        <Pressable
                          onPress={() => setExpandedStudents(prev => ({ ...prev, [student.id]: !prev[student.id] }))}
                          className="flex-row items-center gap-4 p-5"
                        >
                          <View className="w-12 h-12 bg-gold-light rounded-full items-center justify-center border border-gold/40">
                            <Text className="text-2xl">{getMascot(student.gender, student.avatar_url)}</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-sans text-lg font-bold text-navy">{student.display_name}</Text>
                            <Text className="text-xs text-slate-400 font-mono">{student.username}</Text>
                          </View>
                          <Text className="font-sans text-sm font-bold text-slate-500">
                            {student.lessonsCompleted} lessons • {student.accuracyPercent !== null ? `${student.accuracyPercent}%` : '--%'}
                          </Text>
                          <Text className="text-slate-400">{rowOpen ? '▾' : '▸'}</Text>
                        </Pressable>

                        {rowOpen && (
                          <View className="px-6 pb-6">
                            {/* Telemetry Stats */}
                            <View className="flex-row flex-wrap gap-4 mb-6">
                              <View className="flex-1 min-w-[120px] bg-canvas p-4 rounded-xl border border-inkline items-center">
                                <Text className="font-sans text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Playtime</Text>
                                <Text className="font-display text-2xl font-semibold text-navy">{formatPlaytime(student.playtimeSeconds)}</Text>
                              </View>
                              <View className="flex-1 min-w-[120px] bg-pitch-light p-4 rounded-xl border border-pitch/20 items-center">
                                <Text className="font-sans text-[11px] font-bold text-pitch-dark uppercase tracking-wider mb-1">Accuracy</Text>
                                <Text className="font-display text-2xl font-semibold text-pitch-dark">
                                  {student.accuracyPercent !== null ? `${student.accuracyPercent}%` : '--%'}
                                </Text>
                              </View>
                              <View className="flex-1 min-w-[120px] bg-navy/5 p-4 rounded-xl border border-navy/10 items-center">
                                <Text className="font-sans text-[11px] font-bold text-navy uppercase tracking-wider mb-1">Lessons</Text>
                                <Text className="font-display text-2xl font-semibold text-navy">{student.lessonsCompleted}</Text>
                              </View>
                            </View>

                            <StudentExtras studentId={student.id} />

                            {/* Badges Section */}
                            <MicroLabel className="mb-3">Earned Badges</MicroLabel>
                            {student.badges.length === 0 ? (
                              <View className="bg-canvas py-6 rounded-xl border border-inkline items-center border-dashed">
                                <Text className="font-sans text-slate-400">No badges earned yet.</Text>
                              </View>
                            ) : (
                              <View className="flex-row flex-wrap gap-3">
                                {student.badges.map((badge, idx) => (
                                  <View key={idx} className="bg-gold-light/60 px-4 py-2 rounded-full border border-gold/40 flex-row items-center gap-2">
                                    <Text className="text-lg">{badge.image_url || '🏆'}</Text>
                                    <Text className="font-sans font-bold text-gold-dark text-sm">{badge.title}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}