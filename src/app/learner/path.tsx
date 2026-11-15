import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';

interface Category {
  id: string;
  name: string;
  description: string | null;
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  category_id?: string | null;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  order_index: number;
}

interface CategoryGroup {
  category: Category | null; // null = modules with no matching category
  modules: Module[];
}

export default function LearningPath() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, Lesson[]>>({});
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const fetchPathData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);

      const [categoriesRes, modulesRes, lessonsRes] = await Promise.all([
        supabase.from('categories').select('id, name, description').eq('type', 'curriculum').order('name'),
        supabase.from('curriculum_modules').select('*').order('order_index', { ascending: true }),
        supabase.from('curriculum_lessons').select('*').order('order_index', { ascending: true }),
      ]);
      if (categoriesRes.error) throw categoriesRes.error;
      if (modulesRes.error) throw modulesRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      const categories = (categoriesRes.data || []) as Category[];
      const modules = (modulesRes.data || []) as Module[];
      const lessons = (lessonsRes.data || []) as Lesson[];

      const byModule: Record<string, Lesson[]> = {};
      for (const lesson of lessons) {
        if (!byModule[lesson.module_id]) byModule[lesson.module_id] = [];
        byModule[lesson.module_id].push(lesson);
      }
      setLessonsByModule(byModule);

      // Modules carry no category link in the current schema (CurriculumManager
      // never writes one). Group by category_id when a module has one; modules
      // without one fall under the single curriculum category when there is
      // exactly one, otherwise under a trailing ungrouped section.
      const grouped: CategoryGroup[] = categories.map((category) => ({
        category,
        modules: modules.filter((m) => m.category_id === category.id),
      }));
      const assigned = new Set(grouped.flatMap((g) => g.modules.map((m) => m.id)));
      const unassigned = modules.filter((m) => !assigned.has(m.id));
      if (unassigned.length > 0) {
        if (grouped.length === 1) {
          grouped[0].modules = [...grouped[0].modules, ...unassigned];
        } else {
          grouped.push({ category: null, modules: unassigned });
        }
      }
      setGroups(grouped.filter((g) => g.modules.length > 0));
      setExpandedModules(new Set(modules.map((m) => m.id)));

      // Completion ticks: lesson_completions exists only after migration
      // 20261115000006 runs, so any failure here just hides the ticks.
      const identity = await getStudentIdentity();
      if (identity) {
        const { data: completions, error: completionsError } = await supabase
          .from('lesson_completions')
          .select('lesson_id')
          .eq('student_id', identity.studentId)
          .eq('student_kind', identity.studentKind);
        if (!completionsError && completions) {
          setCompletedLessonIds(new Set(completions.map((c: any) => c.lesson_id)));
        }
      }
    } catch (error: any) {
      setLoadError(error.message || 'Something went wrong while loading your learning path.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchPathData();
    })();
  }, [fetchPathData]);

  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-2xl font-bold text-[#0A192F] mb-2 text-center">
          Couldn&apos;t load your learning path
        </Text>
        <Text className="text-slate-500 text-center mb-8">{loadError}</Text>
        <Pressable
          onPress={() => {
            (async () => {
              await fetchPathData();
            })();
          }}
          className="px-6 py-3 bg-[#D4AF37] rounded-full mb-3"
        >
          <Text className="text-white font-bold">Try Again</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="px-6 py-3">
          <Text className="text-slate-500 font-bold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const hasModules = groups.some((g) => g.modules.length > 0);

  return (
    <View className="flex-1 bg-white">
      {/* Top Navigation Bar - Dark Navy (matches learner home) */}
      <SafeAreaView edges={['top']} className="w-full bg-[#0A192F] shadow-sm">
        <View className="max-w-7xl w-full mx-auto flex-row justify-between items-center p-4 md:p-6">
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.back()} className="px-3 py-2 bg-white/10 rounded-lg border border-white/20">
              <Text className="text-white font-bold text-sm">← Back</Text>
            </Pressable>
            <Text className="text-xl md:text-2xl font-bold text-white tracking-wider">
              Learning Path
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-4xl w-full mx-auto">
          {!hasModules ? (
            <View className="items-center py-16">
              <Text className="text-5xl mb-4">📚</Text>
              <Text className="text-2xl font-bold text-[#0A192F] mb-2 text-center">
                No lessons available yet
              </Text>
              <Text className="text-slate-500 text-center">
                Your learning path is being prepared. Please check back soon.
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.category?.id || 'ungrouped'} className="mb-10">
                <Text className="text-2xl md:text-3xl font-bold text-[#0A192F] mb-1">
                  {group.category ? group.category.name : 'More Modules'}
                </Text>
                {group.category?.description ? (
                  <Text className="text-slate-500 mb-4">{group.category.description}</Text>
                ) : null}

                {group.modules.map((module) => {
                  const moduleLessons = lessonsByModule[module.id] || [];
                  const expanded = expandedModules.has(module.id);
                  const doneCount = moduleLessons.filter((l) => completedLessonIds.has(l.id)).length;
                  return (
                    <View
                      key={module.id}
                      className="mb-4 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden"
                    >
                      <Pressable
                        onPress={() => toggleModule(module.id)}
                        className="flex-row justify-between items-center p-4"
                      >
                        <View className="flex-1 pr-3">
                          <Text className="text-lg font-bold text-[#0A192F]">{module.title}</Text>
                          {module.description ? (
                            <Text className="text-sm text-slate-500">{module.description}</Text>
                          ) : null}
                          <Text className="text-xs text-slate-400 mt-1">
                            {moduleLessons.length} lesson{moduleLessons.length === 1 ? '' : 's'}
                            {doneCount > 0 ? ` · ${doneCount} completed` : ''}
                          </Text>
                        </View>
                        <Text className="text-slate-400 text-xl">{expanded ? '▾' : '▸'}</Text>
                      </Pressable>

                      {expanded &&
                        (moduleLessons.length === 0 ? (
                          <Text className="px-4 pb-4 text-sm text-slate-400">
                            No lessons in this module yet.
                          </Text>
                        ) : (
                          moduleLessons.map((lesson) => {
                            const completed = completedLessonIds.has(lesson.id);
                            return (
                              <Pressable
                                key={lesson.id}
                                onPress={() => router.push(`/lesson/${lesson.id}`)}
                                className="flex-row justify-between items-center px-4 py-3 bg-white border-t border-slate-100"
                              >
                                <View className="flex-1 pr-3">
                                  <Text className="text-base font-semibold text-slate-800">
                                    {lesson.title}
                                  </Text>
                                  {lesson.description ? (
                                    <Text className="text-sm text-slate-400">{lesson.description}</Text>
                                  ) : null}
                                </View>
                                {completed ? (
                                  <View className="w-7 h-7 rounded-full bg-emerald-500 items-center justify-center">
                                    <Text className="text-white font-bold text-sm">✓</Text>
                                  </View>
                                ) : (
                                  <Text className="text-[#D4AF37] font-bold">Start ›</Text>
                                )}
                              </Pressable>
                            );
                          })
                        ))}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
