import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, ScreenHeader } from '../../components/ui/Elegant';
import { fetchCompletedLessons } from '../../lib/completions';
import { fetchTaxonomy, type Taxonomy } from '../../lib/curriculumTaxonomy';
import { EXTRA_META, fetchAllTagged, fetchExtrasDone, type TaggedItem } from '../../lib/extras';
import { getStudentIdentity } from '../../lib/studentIdentity';

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
        // Via the migration-22 RPC: the completions table itself has
        // no anon read policy, so a direct select returns nothing
        // for PIN students (the old 0/8-forever bug).
        setCompleted(await fetchCompletedLessons(identity));
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
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="My Journey" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-4xl w-full mx-auto">
          {loading ? (
            <View className="py-16 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
          ) : !tax || tax.lessons.length === 0 ? (
            <View className="items-center py-16">
              <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-gold-light">
                <Ionicons name="map-outline" size={36} color="#0A192F" />
              </View>
              <Text className="font-display text-2xl font-semibold text-navy mb-2 text-center">Your journey is being prepared</Text>
              <Text className="font-sans text-slate-500 text-center">Lessons will appear here soon.</Text>
            </View>
          ) : (
            <>
              <View className="flex-row gap-3 mb-8">
                <ElegantCard className="flex-1 p-4 items-center">
                  <Ionicons name="book-outline" size={22} color="#0A192F" />
                  <Text className="font-display text-2xl font-semibold text-navy mt-1">{stats.lessonsDone}/{stats.lessonsTotal}</Text>
                  <Text className="font-sans text-slate-500 text-sm">lessons finished</Text>
                </ElegantCard>
                <ElegantCard className="flex-1 p-4 items-center">
                  <Ionicons name="star" size={22} color="#D4AF37" />
                  <Text className="font-display text-2xl font-semibold text-navy mt-1">{stats.extrasDone}/{stats.extrasTotal}</Text>
                  <Text className="font-sans text-slate-500 text-sm">extras collected</Text>
                </ElegantCard>
              </View>

              {sections.map((section) => (
                <View key={section.title} className="mb-8">
                  <Text className="font-display text-2xl font-semibold text-navy mb-3">{section.title}</Text>
                  {section.blocks.map(({ module, lessons }) => (
                    <ElegantCard key={module?.id} className="mb-4 p-4 md:p-5">
                      <Text className="font-display font-semibold text-navy text-lg mb-2">{module?.title}</Text>
                      {lessons.map((lesson) => {
                        const extras = taggedByLesson.get(lesson.id) || [];
                        const isDone = completed.has(lesson.id);
                        return (
                          <View key={lesson.id} className="flex-row items-center gap-3 py-2">
                            {isDone ? (
                              <View className="h-6 w-6 items-center justify-center rounded-full bg-pitch">
                                <Text className="text-xs font-bold text-white">✓</Text>
                              </View>
                            ) : (
                              <View className="h-6 w-6 rounded-full border border-inkline bg-white" />
                            )}
                            <Text className={`font-sans flex-1 ${isDone ? 'text-navy font-semibold' : 'text-slate-500'}`}>
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
                    </ElegantCard>
                  ))}
                </View>
              ))}

              <Text className="font-sans text-slate-400 text-center text-sm mb-6">
                Pale icons are extras still waiting for you. They are always optional — your next lesson is never locked.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
