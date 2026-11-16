import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchTaxonomy, type Taxonomy } from '../../lib/curriculumTaxonomy';
import { EXTRA_META, fetchAllTagged, fetchExtrasDone, type TaggedItem } from '../../lib/extras';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';

/**
 * My Journey: the whole path as one map — stages, modules, lessons —
 * with a tick for every finished lesson and little icons for each
 * lesson's recommended extras (filled = done, pale = still waiting).
 * Extras are never required; the map just shows what's left to collect.
 */
export default function MyJourney() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [taggedByLesson, setTaggedByLesson] = useState<Map<string, TaggedItem[]>>(new Map());
  const [extrasDone, setExtrasDone] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [taxonomy, tagged] = await Promise.all([fetchTaxonomy(), fetchAllTagged()]);
      setTax(taxonomy);
      setTaggedByLesson(tagged);

      const identity = await getStudentIdentity();
      if (identity) {
        const { data } = await supabase
          .from('lesson_completions')
          .select('lesson_id')
          .eq('student_id', identity.studentId)
          .eq('student_kind', identity.studentKind);
        if (Array.isArray(data)) {
          setCompleted(new Set(data.map((r: any) => r.lesson_id)));
        }
        setExtrasDone(await fetchExtrasDone(identity));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const stats = useMemo(() => {
    if (!tax) return { lessonsDone: 0, lessonsTotal: 0, extrasDone: 0, extrasTotal: 0 };
    let extrasTotal = 0;
    let extrasDoneCount = 0;
    for (const items of taggedByLesson.values()) {
      extrasTotal += items.length;
      for (const item of items) {
        if (extrasDone.has(`${item.kind}:${item.id}`)) extrasDoneCount += 1;
      }
    }
    return {
      lessonsDone: tax.lessons.filter((l) => completed.has(l.id)).length,
      lessonsTotal: tax.lessons.length,
      extrasDone: extrasDoneCount,
      extrasTotal,
    };
  }, [tax, taggedByLesson, extrasDone, completed]);

  const sections = useMemo(() => {
    if (!tax) return [];
    const moduleBlock = (moduleId: string) => {
      const mod = tax.modules.find((m) => m.id === moduleId);
      return {
        module: mod,
        lessons: tax.lessons.filter((l) => l.module_id === moduleId),
      };
    };
    if (tax.hasStages && tax.stages.length > 0) {
      const out = tax.stages.map((stage) => ({
        title: stage.title,
        blocks: tax.modules.filter((m) => m.stage_id === stage.id).map((m) => moduleBlock(m.id)),
      }));
      const rest = tax.modules.filter((m) => !m.stage_id || !tax.stages.some((s) => s.id === m.stage_id));
      if (rest.length) out.push({ title: 'More Modules', blocks: rest.map((m) => moduleBlock(m.id)) });
      return out.filter((s) => s.blocks.length > 0);
    }
    return [{ title: 'Your Path', blocks: tax.modules.map((m) => moduleBlock(m.id)) }];
  }, [tax]);

  return (
    <View className="flex-1 bg-white">
      <SafeAreaView edges={['top']} className="w-full bg-[#0A192F] shadow-sm">
        <View className="max-w-7xl w-full mx-auto flex-row items-center gap-3 p-4 md:p-6">
          <Pressable onPress={() => router.back()} className="px-3 py-2 bg-white/10 rounded-lg border border-white/20">
            <Text className="text-white font-bold text-sm">← Back</Text>
          </Pressable>
          <Text className="text-xl md:text-2xl font-bold text-white tracking-wider">My Journey 🗺️</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-4xl w-full mx-auto">
          {loading ? (
            <View className="py-16 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
          ) : !tax || tax.lessons.length === 0 ? (
            <View className="items-center py-16">
              <Text className="text-5xl mb-4">🗺️</Text>
              <Text className="text-2xl font-bold text-[#0A192F] mb-2 text-center">Your journey is being prepared</Text>
              <Text className="text-slate-500 text-center">Lessons will appear here soon.</Text>
            </View>
          ) : (
            <>
              <View className="flex-row gap-3 mb-8">
                <View className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 items-center">
                  <Text className="text-2xl font-bold text-[#0A192F]">📚 {stats.lessonsDone}/{stats.lessonsTotal}</Text>
                  <Text className="text-slate-500 text-sm">lessons finished</Text>
                </View>
                <View className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 items-center">
                  <Text className="text-2xl font-bold text-[#0A192F]">⭐ {stats.extrasDone}/{stats.extrasTotal}</Text>
                  <Text className="text-slate-500 text-sm">extras collected</Text>
                </View>
              </View>

              {sections.map((section) => (
                <View key={section.title} className="mb-8">
                  <Text className="text-2xl font-bold text-[#0A192F] mb-3">{section.title}</Text>
                  {section.blocks.map(({ module, lessons }) => (
                    <View key={module?.id} className="mb-4 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <Text className="font-bold text-[#0A192F] text-lg mb-2">{module?.title}</Text>
                      {lessons.map((lesson) => {
                        const extras = taggedByLesson.get(lesson.id) || [];
                        const isDone = completed.has(lesson.id);
                        return (
                          <View key={lesson.id} className="flex-row items-center gap-3 py-1.5">
                            <Text className={`text-base ${isDone ? 'text-emerald-600 font-bold' : 'text-slate-300'}`}>
                              {isDone ? '✓' : '○'}
                            </Text>
                            <Text className={`flex-1 ${isDone ? 'text-[#0A192F] font-semibold' : 'text-slate-600'}`}>
                              {lesson.title}
                            </Text>
                            {extras.map((item) => {
                              const done = extrasDone.has(`${item.kind}:${item.id}`);
                              return (
                                <Text
                                  key={`${item.kind}:${item.id}`}
                                  className={`text-lg ${done ? '' : 'opacity-30'}`}
                                >
                                  {EXTRA_META[item.kind].emoji}
                                  {done ? '✓' : ''}
                                </Text>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ))}

              <Text className="text-slate-400 text-center text-sm mb-6">
                Pale icons are extras still waiting for you. They are always optional — your next lesson is never locked.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
