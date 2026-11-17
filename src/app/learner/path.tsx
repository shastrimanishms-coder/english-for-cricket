import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GhostButton, GoldButton, ScreenHeader } from '../../components/ui/Elegant';
import { fetchCompletedLessons } from '../../lib/completions';
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
  stage_id?: string | null;
}

interface Stage {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
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
  title?: string;
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

      // Stages (migration 17) are the primary grouping when any module has
      // one: Stage -> Module -> Lesson. Fail-soft: without stages we keep
      // the older category grouping below.
      const stagesRes = await supabase
        .from('curriculum_stages')
        .select('id, title, description, order_index')
        .order('order_index', { ascending: true });
      const stages = (!stagesRes.error ? (stagesRes.data || []) : []) as Stage[];
      const useStages = stages.length > 0 && modules.some((m) => m.stage_id);

      if (useStages) {
        const grouped: CategoryGroup[] = stages.map((stage) => ({
          category: null,
          title: stage.title,
          modules: modules.filter((m) => m.stage_id === stage.id),
        }));
        const assignedIds = new Set(grouped.flatMap((g) => g.modules.map((m) => m.id)));
        const rest = modules.filter((m) => !assignedIds.has(m.id));
        if (rest.length > 0) grouped.push({ category: null, title: 'More Modules', modules: rest });
        setGroups(grouped.filter((g) => g.modules.length > 0));
      } else {
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
      }
      setExpandedModules(new Set(modules.map((m) => m.id)));

      // Completion ticks via the migration-22 RPC: the completions
      // table has no anon read policy, so a direct select silently
      // returned nothing for PIN students and the ticks never showed.
      const identity = await getStudentIdentity();
      if (identity) {
        setCompletedLessonIds(await fetchCompletedLessons(identity));
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
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center p-6">
        <Text className="font-display text-2xl font-semibold text-navy mb-2 text-center">
          Couldn&apos;t load your learning path
        </Text>
        <Text className="font-sans text-slate-500 text-center mb-8">{loadError}</Text>
        <GoldButton
          label="Try Again"
          onPress={() => {
            (async () => {
              await fetchPathData();
            })();
          }}
          className="mb-3"
        />
        <GhostButton label="Go Back" onPress={() => router.back()} />
      </View>
    );
  }

  const hasModules = groups.some((g) => g.modules.length > 0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Learning Path" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-4xl w-full mx-auto">
          {!hasModules ? (
            <View className="items-center py-16">
              <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-gold-light">
                <Ionicons name="library-outline" size={36} color="#0A192F" />
              </View>
              <Text className="font-display text-2xl font-semibold text-navy mb-2 text-center">
                No lessons available yet
              </Text>
              <Text className="font-sans text-slate-500 text-center">
                Your learning path is being prepared. Please check back soon.
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.category?.id || group.title || 'ungrouped'} className="mb-10">
                <Text className="font-display text-2xl md:text-3xl font-semibold text-navy mb-1">
                  {group.title || (group.category ? group.category.name : 'More Modules')}
                </Text>
                {group.category?.description ? (
                  <Text className="font-sans text-slate-500 mb-4">{group.category.description}</Text>
                ) : null}

                {group.modules.map((module) => {
                  const moduleLessons = lessonsByModule[module.id] || [];
                  const expanded = expandedModules.has(module.id);
                  const doneCount = moduleLessons.filter((l) => completedLessonIds.has(l.id)).length;
                  return (
                    <View
                      key={module.id}
                      className="mb-4 rounded-[20px] border border-inkline bg-white shadow-sm overflow-hidden"
                    >
                      <Pressable
                        onPress={() => toggleModule(module.id)}
                        className="flex-row justify-between items-center p-4"
                      >
                        <View className="flex-1 pr-3">
                          <Text className="font-display text-lg font-semibold text-navy">{module.title}</Text>
                          {module.description ? (
                            <Text className="font-sans text-sm text-slate-500">{module.description}</Text>
                          ) : null}
                          <Text className="font-sans text-xs text-slate-400 mt-1">
                            {moduleLessons.length} lesson{moduleLessons.length === 1 ? '' : 's'}
                            {doneCount > 0
                              ? doneCount === moduleLessons.length
                                ? ' · 🎉 Module complete!'
                                : ` · ${doneCount} of ${moduleLessons.length} finished`
                              : ''}
                          </Text>
                        </View>
                        <Ionicons
                          name={expanded ? 'chevron-down' : 'chevron-forward'}
                          size={20}
                          color="#B8912A"
                        />
                      </Pressable>

                      {expanded &&
                        (moduleLessons.length === 0 ? (
                          <Text className="px-4 pb-4 font-sans text-sm text-slate-400">
                            No lessons in this module yet.
                          </Text>
                        ) : (
                          moduleLessons.map((lesson) => {
                            const completed = completedLessonIds.has(lesson.id);
                            // The first unfinished lesson in the module is
                            // "next" - a signpost only; every lesson stays
                            // tappable, learners can start anywhere.
                            const isNext =
                              !completed &&
                              moduleLessons.find((l) => !completedLessonIds.has(l.id))?.id === lesson.id;
                            return (
                              <Pressable
                                key={lesson.id}
                                onPress={() => router.push(`/lesson/${lesson.id}`)}
                                className="flex-row justify-between items-center px-4 py-3 bg-white border-t border-inkline"
                              >
                                <View className="flex-1 pr-3">
                                  <Text className="font-sans text-base font-semibold text-slate-800">
                                    {lesson.title}
                                  </Text>
                                  {lesson.description ? (
                                    <Text className="font-sans text-sm text-slate-400">{lesson.description}</Text>
                                  ) : null}
                                </View>
                                {completed ? (
                                  <View className="w-7 h-7 rounded-full bg-pitch items-center justify-center">
                                    <Text className="text-white font-bold text-sm">✓</Text>
                                  </View>
                                ) : isNext ? (
                                  <View className="px-3 py-1.5 rounded-full bg-gold border-b-4 border-gold-dark">
                                    <Text className="font-sans text-navy font-bold text-sm">▶ Next</Text>
                                  </View>
                                ) : (
                                  <Text className="font-sans text-gold-dark font-bold">Start ›</Text>
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
    </SafeAreaView>
  );
}
