import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GhostButton, GoldButton, ScreenHeader } from '../../components/ui/Elegant';
import { HelpButton } from '../../components/ui/HelpPopup';
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
  key: string;
  category: Category | null; // null = modules with no matching category
  title?: string;
  description?: string | null;
  modules: Module[];
}

interface NextLesson {
  lesson: Lesson;
  moduleTitle: string;
  stageTitle: string;
}

export default function LearningPath() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, Lesson[]>>({});
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  // Accordion state: one stage open at a time, and inside it one
  // module open at a time. The page opens on the stage and module of
  // the student's next unfinished lesson, so it lands where they
  // left off instead of unrolling the whole path.
  const [expandedStageKey, setExpandedStageKey] = useState<string | null>(null);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [nextLesson, setNextLesson] = useState<NextLesson | null>(null);
  const [totals, setTotals] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

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

      let grouped: CategoryGroup[];
      if (useStages) {
        grouped = stages.map((stage) => ({
          key: stage.id,
          category: null,
          title: stage.title,
          description: stage.description,
          modules: modules.filter((m) => m.stage_id === stage.id),
        }));
        const assignedIds = new Set(grouped.flatMap((g) => g.modules.map((m) => m.id)));
        const rest = modules.filter((m) => !assignedIds.has(m.id));
        if (rest.length > 0) {
          grouped.push({ key: 'more-modules', category: null, title: 'More Modules', modules: rest });
        }
      } else {
        // Modules carry no category link in the current schema (CurriculumManager
        // never writes one). Group by category_id when a module has one; modules
        // without one fall under the single curriculum category when there is
        // exactly one, otherwise under a trailing ungrouped section.
        grouped = categories.map((category) => ({
          key: category.id,
          category,
          modules: modules.filter((m) => m.category_id === category.id),
        }));
        const assigned = new Set(grouped.flatMap((g) => g.modules.map((m) => m.id)));
        const unassigned = modules.filter((m) => !assigned.has(m.id));
        if (unassigned.length > 0) {
          if (grouped.length === 1) {
            grouped[0].modules = [...grouped[0].modules, ...unassigned];
          } else {
            grouped.push({ key: 'ungrouped', category: null, modules: unassigned });
          }
        }
      }
      grouped = grouped.filter((g) => g.modules.length > 0);
      setGroups(grouped);

      // Completion ticks via the migration-22 RPC: the completions
      // table has no anon read policy, so a direct select silently
      // returned nothing for PIN students and the ticks never showed.
      let completed = new Set<string>();
      const identity = await getStudentIdentity();
      if (identity) {
        completed = await fetchCompletedLessons(identity);
      }
      setCompletedLessonIds(completed);

      // Progress + where to continue: walk the path in order (stage,
      // then module, then lesson) and find the first unfinished
      // lesson. The accordion opens on that stage and module, and the
      // Continue card at the top jumps straight to it.
      let done = 0;
      let total = 0;
      let next: NextLesson | null = null;
      for (const group of grouped) {
        for (const module of group.modules) {
          for (const lesson of byModule[module.id] || []) {
            total++;
            if (completed.has(lesson.id)) {
              done++;
            } else if (!next) {
              next = {
                lesson,
                moduleTitle: module.title,
                stageTitle: group.title || group.category?.name || '',
              };
              setExpandedStageKey(group.key);
              setExpandedModuleId(module.id);
            }
          }
        }
      }
      setTotals({ done, total });
      setNextLesson(next);
      if (!next && grouped.length > 0) {
        // Everything finished (or nothing started with no lessons):
        // open the first stage so the page is not a wall of headers.
        setExpandedStageKey(grouped[0].key);
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

  const toggleStage = useCallback((key: string) => {
    setExpandedStageKey((prev) => (prev === key ? null : key));
  }, []);

  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModuleId((prev) => (prev === moduleId ? null : moduleId));
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
  const allDone = totals.total > 0 && totals.done === totals.total;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Learning Path" onBack={() => router.back()} right={<HelpButton slug="help-learning-path" />} />

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
            <>
              {/* Continue card: overall progress + a jump straight to
                  the next unfinished lesson, so returning students do
                  not have to hunt for where they left off. */}
              <View className="mb-8 rounded-[20px] bg-navy p-5 shadow-sm">
                {allDone ? (
                  <>
                    <Text className="font-display text-xl font-semibold text-white mb-1">
                      🎉 You finished the whole path!
                    </Text>
                    <Text className="font-sans text-sm text-slate-300 mb-4">
                      All {totals.total} lessons complete. You can revisit any lesson below to
                      practise again.
                    </Text>
                  </>
                ) : nextLesson ? (
                  <>
                    <Text className="font-sans text-xs font-bold uppercase tracking-widest text-gold mb-1">
                      {totals.done > 0 ? 'Continue where you left off' : 'Start your journey'}
                    </Text>
                    <Text className="font-display text-xl font-semibold text-white mb-1">
                      {nextLesson.lesson.title}
                    </Text>
                    <Text className="font-sans text-sm text-slate-300 mb-3">
                      {nextLesson.stageTitle} · {nextLesson.moduleTitle}
                    </Text>
                    <Text className="font-sans text-sm text-slate-300 mb-4">
                      {totals.done} of {totals.total} lessons finished
                    </Text>
                    <GoldButton
                      label="▶ Continue"
                      onPress={() => router.push(`/lesson/${nextLesson.lesson.id}`)}
                    />
                  </>
                ) : null}
                {totals.total > 0 && (
                  <View className="mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
                    <View
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${Math.round((totals.done / totals.total) * 100)}%` }}
                    />
                  </View>
                )}
              </View>

              {groups.map((group) => {
                const groupLessons = group.modules.flatMap((m) => lessonsByModule[m.id] || []);
                const groupDone = groupLessons.filter((l) => completedLessonIds.has(l.id)).length;
                const stageExpanded = expandedStageKey === group.key;
                return (
                  <View key={group.key} className="mb-6">
                    <Pressable
                      onPress={() => toggleStage(group.key)}
                      className="flex-row justify-between items-center rounded-[20px] border border-inkline bg-white p-4 shadow-sm"
                    >
                      <View className="flex-1 pr-3">
                        <Text className="font-display text-2xl font-semibold text-navy">
                          {group.title || (group.category ? group.category.name : 'More Modules')}
                        </Text>
                        {group.description || group.category?.description ? (
                          <Text className="font-sans text-slate-500 mt-1">
                            {group.description || group.category?.description}
                          </Text>
                        ) : null}
                        <Text className="font-sans text-xs text-slate-400 mt-1">
                          {group.modules.length} module{group.modules.length === 1 ? '' : 's'} ·{' '}
                          {groupLessons.length} lesson{groupLessons.length === 1 ? '' : 's'}
                          {groupDone > 0
                            ? groupDone === groupLessons.length
                              ? ' · 🎉 Stage complete!'
                              : ` · ${groupDone} of ${groupLessons.length} finished`
                            : ''}
                        </Text>
                      </View>
                      <Ionicons
                        name={stageExpanded ? 'chevron-down' : 'chevron-forward'}
                        size={22}
                        color="#B8912A"
                      />
                    </Pressable>

                    {stageExpanded &&
                      group.modules.map((module) => {
                        const moduleLessons = lessonsByModule[module.id] || [];
                        const expanded = expandedModuleId === module.id;
                        const doneCount = moduleLessons.filter((l) =>
                          completedLessonIds.has(l.id)
                        ).length;
                        return (
                          <View
                            key={module.id}
                            className="mt-4 ml-3 rounded-[20px] border border-inkline bg-white shadow-sm overflow-hidden"
                          >
                            <Pressable
                              onPress={() => toggleModule(module.id)}
                              className="flex-row justify-between items-center p-4"
                            >
                              <View className="flex-1 pr-3">
                                <Text className="font-display text-lg font-semibold text-navy">
                                  {module.title}
                                </Text>
                                {module.description ? (
                                  <Text className="font-sans text-sm text-slate-500">
                                    {module.description}
                                  </Text>
                                ) : null}
                                <Text className="font-sans text-xs text-slate-400 mt-1">
                                  {moduleLessons.length} lesson
                                  {moduleLessons.length === 1 ? '' : 's'}
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
                                    moduleLessons.find((l) => !completedLessonIds.has(l.id))?.id ===
                                      lesson.id;
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
                                          <Text className="font-sans text-sm text-slate-400">
                                            {lesson.description}
                                          </Text>
                                        ) : null}
                                      </View>
                                      {completed ? (
                                        <View className="w-7 h-7 rounded-full bg-pitch items-center justify-center">
                                          <Text className="text-white font-bold text-sm">✓</Text>
                                        </View>
                                      ) : isNext ? (
                                        <View className="px-3 py-1.5 rounded-full bg-gold border-b-4 border-gold-dark">
                                          <Text className="font-sans text-navy font-bold text-sm">
                                            ▶ Next
                                          </Text>
                                        </View>
                                      ) : (
                                        <Text className="font-sans text-gold-dark font-bold">
                                          Start ›
                                        </Text>
                                      )}
                                    </Pressable>
                                  );
                                })
                              ))}
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
    </SafeAreaView>
  );
}
