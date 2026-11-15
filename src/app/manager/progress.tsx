import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import AnimatedButton from '../../components/ui/AnimatedButton';
import { useRequireRole } from '../../hooks/useRequireRole';
import { supabase } from '../../lib/supabase';

interface StudentBadge {
  title: string;
  image_url: string | null;
}

interface StudentProgress {
  id: string;
  display_name: string;
  gender: string | null;
  avatar_url: string | null;
  badges: StudentBadge[];
  playtimeSeconds: number;
  lessonsCompleted: number;
  accuracyPercent: number | null;
}

function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)} min`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hrs`;
}

export default function LearningProgress() {
  const router = useRouter();
  const guardStatus = useRequireRole(['manager']);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProgress[]>([]);

  const getMascot = (gender: string | null, avatar_url: string | null) => {
    if (avatar_url) return avatar_url;
    if (gender === 'Male') return '👦';
    if (gender === 'Female') return '👧';
    return '🏏';
  };

  const fetchProgressData = useCallback(async () => {
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

      const { data: studentsData, error: studentsError } = await supabase
        .from('sub_accounts')
        .select(`
          id, 
          display_name, 
          gender, 
          avatar_url,
          student_badges (
            badges (
              title, 
              image_url
            )
          )
        `)
        .eq('organization_id', org.id)
        .eq('is_active', true);

      if (studentsError) throw studentsError;

      const formattedStudents: StudentProgress[] = (studentsData || []).map((s) => ({
        id: s.id,
        display_name: s.display_name,
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
      if (studentIds.length > 0) {
        try {
          const { data: logs, error: logsError } = await supabase
            .from('activity_logs')
            .select('student_id, duration_seconds')
            .in('student_id', studentIds);
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
          const { data: completions, error: completionsError } = await supabase
            .from('lesson_completions')
            .select('student_id, score_correct, score_total')
            .eq('student_kind', 'sub_account')
            .in('student_id', studentIds);
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
  }, [router]);

  useEffect(() => {
    (async () => {
      await fetchProgressData();
    })();
  }, [fetchProgressData]);

  if (loading || guardStatus !== 'authorized') {
    return (
      <View className="flex-1 bg-surface-background justify-center items-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-background">
      <View className="w-full bg-surface shadow-sm border-b border-slate-200">
        <View className="max-w-5xl w-full mx-auto flex-row justify-between items-center p-6">
          <Text className="text-xl md:text-2xl font-bold text-text-primary">Learning Progress</Text>
          <View className="w-40 md:w-48">
            <AnimatedButton title="Back to Dashboard" onPress={() => router.push('/manager')} variant="outline" size="sm" />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-5xl w-full mx-auto space-y-6">
          <Text className="text-text-secondary text-lg mb-4">
            Track lesson completion, accuracy, and earned badges for all your students.
          </Text>

          {students.length === 0 ? (
            <View className="bg-white p-12 rounded-2xl border border-slate-200 items-center">
              <Text className="text-5xl mb-4">📊</Text>
              <Text className="text-xl font-bold text-text-primary">No Students Yet</Text>
              <Text className="text-text-secondary mt-2">Add students in the &apos;My Students&apos; tab to see their progress.</Text>
            </View>
          ) : (
            students.map((student) => (
              <View key={student.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
                
                {/* Header: Mascot & Name */}
                <View className="flex-row items-center gap-4 mb-6 border-b border-slate-100 pb-4">
                  <View className="w-16 h-16 bg-brand/10 rounded-full items-center justify-center border border-brand/20">
                    <Text className="text-4xl">{getMascot(student.gender, student.avatar_url)}</Text>
                  </View>
                  <Text className="text-2xl font-bold text-[#0A192F]">{student.display_name}</Text>
                </View>

                {/* Telemetry Stats */}
                <View className="flex-row flex-wrap gap-4 mb-6">
                  <View className="flex-1 min-w-[120px] bg-slate-50 p-4 rounded-xl border border-slate-100 items-center">
                    <Text className="text-xs font-bold text-slate-500 uppercase mb-1">Playtime</Text>
                    <Text className="text-xl font-bold text-text-primary">{formatPlaytime(student.playtimeSeconds)}</Text>
                  </View>
                  <View className="flex-1 min-w-[120px] bg-emerald-50 p-4 rounded-xl border border-emerald-100 items-center">
                    <Text className="text-xs font-bold text-emerald-600 uppercase mb-1">Accuracy</Text>
                    <Text className="text-xl font-bold text-emerald-800">
                      {student.accuracyPercent !== null ? `${student.accuracyPercent}%` : '--%'}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-[120px] bg-blue-50 p-4 rounded-xl border border-blue-100 items-center">
                    <Text className="text-xs font-bold text-blue-600 uppercase mb-1">Lessons</Text>
                    <Text className="text-xl font-bold text-blue-800">{student.lessonsCompleted}</Text>
                  </View>
                </View>

                {/* Badges Section */}
                <Text className="text-sm font-bold text-text-secondary uppercase mb-3">Earned Badges</Text>
                {student.badges.length === 0 ? (
                  <View className="bg-slate-50 py-6 rounded-xl border border-slate-100 items-center border-dashed">
                    <Text className="text-slate-400">No badges earned yet.</Text>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap gap-3">
                    {student.badges.map((badge, idx) => (
                      <View key={idx} className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-200 flex-row items-center gap-2">
                        <Text className="text-lg">{badge.image_url || '🏆'}</Text>
                        <Text className="font-bold text-amber-800 text-sm">{badge.title}</Text>
                      </View>
                    ))}
                  </View>
                )}

              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}