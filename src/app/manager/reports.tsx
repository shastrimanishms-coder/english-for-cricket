import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import { useRequireRole } from '../../hooks/useRequireRole';
import { downloadPdf, type PdfSection } from '../../lib/downloadPdf';
import {
  fetchManagerReports,
  formatActiveTime,
  formatReportDate,
  type ManagerReportsData,
  type StudentReport,
} from '../../lib/managerReports';
import { groupStudentsByClass } from '../../lib/studentGroups';

/**
 * Student Reports (Round 81, Part 2) — the manager-facing report:
 * total ACTIVE time and its per-section breakdown, completion counts,
 * the accuracies the data actually holds, learning-path progress,
 * study days and last-active, for every student in the manager's own
 * organisation, with Print / PDF export per student and for the
 * whole group. Data comes from src/lib/managerReports.ts (migration
 * 34's get_manager_reports RPC, with a client-side fallback).
 *
 * "Active time" is deliberate wording: since Round 81 the app only
 * records seconds while it is visible and being used, so these
 * figures are learning time, never login duration.
 */

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
const count = (v: number | null) => (v === null ? '—' : `${v}`);

function studentPdfSections(s: StudentReport): PdfSection[] {
  return [
    {
      heading: s.displayName,
      blocks: [
        {
          kind: 'table',
          rows: [
            ['Username', s.username || '—'],
            ['Class / group', s.className || '—'],
            ['Total active time', formatActiveTime(s.totalSeconds)],
            ['Learning Path — active time', formatActiveTime(s.lessonSeconds)],
            ['Games — active time', formatActiveTime(s.gameSeconds)],
            ['Smart Reading — active time', formatActiveTime(s.readingSeconds)],
            ['Speaking Practice — active time', formatActiveTime(s.speakingSeconds)],
            ['Videos — active time', formatActiveTime(s.videoSeconds)],
            [
              'Lessons completed',
              s.totalLessons > 0 ? `${s.lessonsCompleted} of ${s.totalLessons}` : `${s.lessonsCompleted}`,
            ],
            [
              'Current position',
              s.currentModuleTitle
                ? `${s.currentStageTitle ? `${s.currentStageTitle} — ` : ''}${s.currentModuleTitle}`
                : 'Not started',
            ],
            ['Lesson accuracy', pct(s.lessonAccuracy)],
            ['Stories / articles read', `${s.storiesRead}`],
            ['Reading accuracy (Read Aloud)', pct(s.readingAccuracy)],
            ['Conversations completed', count(s.speakingCompleted)],
            ['Study days', `${s.studyDays}`],
            ['Last active', formatReportDate(s.lastActiveAt)],
          ],
        },
        {
          kind: 'paragraphs',
          texts: [
            'Active time counts only while the app is visible and being used; time with the app open but idle is not counted. Speaking Practice conversations are scored live in the app and no score is stored, so this report counts completed conversations without an accuracy figure.',
          ],
        },
      ],
    },
  ];
}

function StatTile({ label, value, tone = 'canvas' }: { label: string; value: string; tone?: 'canvas' | 'pitch' | 'navy' }) {
  const tones = {
    canvas: 'bg-canvas border-inkline',
    pitch: 'bg-pitch-light border-pitch/20',
    navy: 'bg-navy/5 border-navy/10',
  } as const;
  return (
    <View className={`flex-1 min-w-[130px] p-4 rounded-xl border items-center ${tones[tone]}`}>
      <Text className="font-sans text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 text-center">{label}</Text>
      <Text className="font-display text-2xl font-semibold text-navy text-center">{value}</Text>
    </View>
  );
}

function SectionTimes({ s }: { s: StudentReport }) {
  const rows: [string, number][] = [
    ['Learning Path', s.lessonSeconds],
    ['Games', s.gameSeconds],
    ['Smart Reading', s.readingSeconds],
    ['Speaking Practice', s.speakingSeconds],
    ['Videos', s.videoSeconds],
  ];
  return (
    <View className="mb-6">
      <MicroLabel className="mb-3">Active time by section</MicroLabel>
      <View className="bg-canvas rounded-xl border border-inkline overflow-hidden">
        {rows.map(([label, seconds], i) => (
          <View
            key={label}
            className={`flex-row justify-between px-4 py-2.5 ${i < rows.length - 1 ? 'border-b border-inkline' : ''}`}
          >
            <Text className="font-sans text-slate-600">{label}</Text>
            <Text className="font-sans font-bold text-navy">{formatActiveTime(seconds)}</Text>
          </View>
        ))}
      </View>
      <Text className="font-sans text-xs text-slate-400 mt-2">
        Section times overlap the total active time — they show where the time went, and are not added to it.
      </Text>
    </View>
  );
}

export default function StudentReports() {
  const router = useRouter();
  const guardStatus = useRequireRole(['manager']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ManagerReportsData | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchManagerReports());
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('Could not load the reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    // groupStudentsByClass reads class_name/display_name (the
    // sub_accounts shape); adapt the report rows to it.
    const adapted = data.students.map((s) => ({ ...s, class_name: s.className, display_name: s.displayName }));
    return groupStudentsByClass(adapted);
  }, [data]);

  const generatedOn = useMemo(
    () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    []
  );

  const exportStudent = useCallback(
    (s: StudentReport) => {
      downloadPdf({
        title: `Student Report — ${s.displayName}`,
        meta: [`Generated ${generatedOn}`],
        sections: studentPdfSections(s),
      });
    },
    [generatedOn]
  );

  const exportAll = useCallback(() => {
    if (!data) return;
    const g = data.group;
    const sections: PdfSection[] = [
      {
        heading: 'Group Summary',
        blocks: [
          {
            kind: 'table',
            rows: [
              ['Students', `${g.studentCount}`],
              ['Total active time', formatActiveTime(g.totalSeconds)],
              ['Average active time per student', formatActiveTime(g.averageSecondsPerStudent)],
              ['Learning Path — active time', formatActiveTime(g.lessonSeconds)],
              ['Games — active time', formatActiveTime(g.gameSeconds)],
              ['Smart Reading — active time', formatActiveTime(g.readingSeconds)],
              ['Speaking Practice — active time', formatActiveTime(g.speakingSeconds)],
              ['Videos — active time', formatActiveTime(g.videoSeconds)],
              ['Lessons completed (all students)', `${g.lessonsCompleted}`],
              ['Stories / articles read (all students)', `${g.storiesRead}`],
              ['Conversations completed (all students)', count(g.speakingCompleted)],
              ['Average lesson accuracy', pct(g.lessonAccuracy)],
              ['Average reading accuracy', pct(g.readingAccuracy)],
            ],
          },
          {
            kind: 'paragraphs',
            texts: [
              'Active time counts only while the app is visible and being used; time with the app open but idle is not counted.',
            ],
          },
        ],
      },
      ...data.students.map((s) => {
        const [section] = studentPdfSections(s);
        return { ...section, pageBreakBefore: true };
      }),
    ];
    downloadPdf({
      title: 'Student Progress Reports',
      meta: [`Generated ${generatedOn}`, `${g.studentCount} student${g.studentCount === 1 ? '' : 's'}`],
      sections,
    });
  }, [data, generatedOn]);

  if (loading || guardStatus !== 'authorized') {
    return (
      <View className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  const group = data?.group;

  return (
    <View className="flex-1 bg-canvas">
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <ScreenHeader title="Student Reports" onBack={() => router.push('/manager')} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-5xl w-full mx-auto space-y-6">
          <Text className="font-sans text-slate-500 text-lg mb-2">
            Active time, progress and accuracy for every student — ready to print or save as PDF.
          </Text>
          <Text className="font-sans text-sm text-slate-400 mb-6">
            Times are active time: they count only while the app is visible and being used, never time spent
            merely logged in.
          </Text>

          {error ? (
            <View className="bg-white p-8 rounded-[20px] border border-inkline items-center">
              <Text className="font-sans text-slate-600 mb-4">{error}</Text>
              <Pressable onPress={() => void load()} className="bg-navy px-5 py-2.5 rounded-full">
                <Text className="font-sans font-bold text-white text-sm">Try Again</Text>
              </Pressable>
            </View>
          ) : !data || data.students.length === 0 ? (
            <View className="bg-white p-12 rounded-[20px] border border-inkline shadow-sm items-center">
              <View className="w-16 h-16 rounded-full bg-navy items-center justify-center mb-4">
                <Ionicons name="document-text" size={28} color="#D4AF37" />
              </View>
              <Text className="font-display text-xl font-semibold text-navy">No Students Yet</Text>
              <Text className="font-sans text-slate-500 mt-2">
                Add students in the &apos;My Students&apos; tab to see their reports.
              </Text>
            </View>
          ) : (
            <>
              {/* Group summary */}
              <View className="bg-white rounded-[20px] border border-inkline shadow-sm p-6 mb-6">
                <View className="flex-row items-center justify-between mb-4">
                  <MicroLabel>Group Summary — {group?.studentCount} students</MicroLabel>
                  {Platform.OS === 'web' ? (
                    <Pressable
                      onPress={exportAll}
                      className="flex-row items-center gap-2 bg-navy px-4 py-2 rounded-full active:opacity-90"
                    >
                      <Ionicons name="print" size={15} color="#D4AF37" />
                      <Text className="font-sans font-bold text-white text-sm">Print / PDF — All Students</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View className="flex-row flex-wrap gap-4 mb-4">
                  <StatTile label="Total active time" value={formatActiveTime(group?.totalSeconds ?? 0)} tone="navy" />
                  <StatTile label="Avg per student" value={formatActiveTime(group?.averageSecondsPerStudent ?? 0)} />
                  <StatTile label="Lessons completed" value={`${group?.lessonsCompleted ?? 0}`} tone="pitch" />
                  <StatTile label="Stories read" value={`${group?.storiesRead ?? 0}`} />
                  <StatTile label="Conversations done" value={count(group?.speakingCompleted ?? null)} />
                </View>
                <Text className="font-sans text-sm text-slate-500">
                  Average lesson accuracy {pct(group?.lessonAccuracy ?? null)} • Average reading accuracy{' '}
                  {pct(group?.readingAccuracy ?? null)}
                </Text>
              </View>

              {groups.map((grp) => {
                const groupOpen = !collapsedGroups[grp.label];
                return (
                  <View key={grp.label} className="mb-6">
                    <Pressable
                      onPress={() => setCollapsedGroups((prev) => ({ ...prev, [grp.label]: !prev[grp.label] }))}
                      className="flex-row items-center justify-between py-2"
                    >
                      <Text className="font-sans font-bold text-navy">
                        {groupOpen ? '▾' : '▸'} 📚 {grp.label}
                      </Text>
                      <MicroLabel>
                        {grp.students.length} {grp.students.length === 1 ? 'student' : 'students'}
                      </MicroLabel>
                    </Pressable>

                    {groupOpen &&
                      grp.students.map((student) => {
                        const rowOpen = !!expandedStudents[student.id];
                        return (
                          <View
                            key={student.id}
                            className="bg-white rounded-[20px] border border-inkline shadow-sm mb-4 overflow-hidden"
                          >
                            <Pressable
                              onPress={() =>
                                setExpandedStudents((prev) => ({ ...prev, [student.id]: !prev[student.id] }))
                              }
                              className="flex-row items-center gap-4 p-5"
                            >
                              <View className="w-12 h-12 bg-gold-light rounded-full items-center justify-center border border-gold/40">
                                <Text className="text-2xl">🏏</Text>
                              </View>
                              <View className="flex-1">
                                <Text className="font-sans text-lg font-bold text-navy">{student.displayName}</Text>
                                <Text className="text-xs text-slate-400 font-mono">{student.username}</Text>
                              </View>
                              <Text className="font-sans text-sm font-bold text-slate-500">
                                {formatActiveTime(student.totalSeconds)} active • {student.lessonsCompleted} lessons
                              </Text>
                              <Text className="text-slate-400">{rowOpen ? '▾' : '▸'}</Text>
                            </Pressable>

                            {rowOpen && (
                              <View className="px-6 pb-6">
                                <View className="flex-row flex-wrap gap-4 mb-6">
                                  <StatTile label="Total active time" value={formatActiveTime(student.totalSeconds)} tone="navy" />
                                  <StatTile
                                    label="Lessons"
                                    value={
                                      student.totalLessons > 0
                                        ? `${student.lessonsCompleted} / ${student.totalLessons}`
                                        : `${student.lessonsCompleted}`
                                    }
                                    tone="pitch"
                                  />
                                  <StatTile label="Lesson accuracy" value={pct(student.lessonAccuracy)} />
                                  <StatTile label="Study days" value={`${student.studyDays}`} />
                                </View>

                                <SectionTimes s={student} />

                                <View className="mb-6">
                                  <MicroLabel className="mb-3">Progress & Reading</MicroLabel>
                                  <View className="bg-canvas rounded-xl border border-inkline overflow-hidden">
                                    <View className="flex-row justify-between px-4 py-2.5 border-b border-inkline">
                                      <Text className="font-sans text-slate-600">Current position</Text>
                                      <Text className="font-sans font-bold text-navy">
                                        {student.currentModuleTitle
                                          ? `${student.currentStageTitle ? `${student.currentStageTitle} — ` : ''}${student.currentModuleTitle}`
                                          : 'Not started'}
                                      </Text>
                                    </View>
                                    <View className="flex-row justify-between px-4 py-2.5 border-b border-inkline">
                                      <Text className="font-sans text-slate-600">Stories / articles read</Text>
                                      <Text className="font-sans font-bold text-navy">{student.storiesRead}</Text>
                                    </View>
                                    <View className="flex-row justify-between px-4 py-2.5 border-b border-inkline">
                                      <Text className="font-sans text-slate-600">Reading accuracy (Read Aloud)</Text>
                                      <Text className="font-sans font-bold text-navy">{pct(student.readingAccuracy)}</Text>
                                    </View>
                                    <View className="flex-row justify-between px-4 py-2.5 border-b border-inkline">
                                      <Text className="font-sans text-slate-600">Conversations completed</Text>
                                      <Text className="font-sans font-bold text-navy">{count(student.speakingCompleted)}</Text>
                                    </View>
                                    <View className="flex-row justify-between px-4 py-2.5">
                                      <Text className="font-sans text-slate-600">Last active</Text>
                                      <Text className="font-sans font-bold text-navy">{formatReportDate(student.lastActiveAt)}</Text>
                                    </View>
                                  </View>
                                  <Text className="font-sans text-xs text-slate-400 mt-2">
                                    Speaking Practice is scored live in the app and no score is stored, so completed
                                    conversations are counted without an accuracy figure.
                                  </Text>
                                </View>

                                {Platform.OS === 'web' ? (
                                  <Pressable
                                    onPress={() => exportStudent(student)}
                                    className="flex-row items-center justify-center gap-2 bg-navy px-4 py-3 rounded-full active:opacity-90"
                                  >
                                    <Ionicons name="print" size={15} color="#D4AF37" />
                                    <Text className="font-sans font-bold text-white text-sm">
                                      Print / PDF — This Student
                                    </Text>
                                  </Pressable>
                                ) : null}
                              </View>
                            )}
                          </View>
                        );
                      })}
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
