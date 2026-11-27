import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { countCoveredSentences } from '../../lib/adminVoiceUploads';
import {
  READING_EXAMPLE,
  READING_FORMAT_LINES,
  validateReadingPackage,
  type ReadingPkg,
} from '../../lib/contentPackages';
import { fetchTaxonomy, type Taxonomy } from '../../lib/curriculumTaxonomy';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';
import { useLessonTagging } from '../../lib/useLessonTagging';
import ContentTagging from './ContentTagging';
import ContentUploadDoor from './ContentUploadDoor';
import GroupedContentList from './GroupedContentList';
import SentenceVoices from './SentenceVoices';
import {
  bulkAddCategory,
  bulkRemoveCategory,
  fetchCategoriesForType,
  fetchMembershipMap,
  flattenCategoryTree,
  primaryCategoryId,
  setItemCategories,
  type CategoryNode,
} from '../../lib/contentCategories';

// The same sentence split the learner app narrates with, so the
// sentences listed for voice uploads are exactly the units playback
// resolves.
function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text]).map((s) => s.trim()).filter(Boolean);
}

// Admin manager for Smart Reading stories. A story is a short text
// split into pages (1-5 is typical); learners either listen with
// karaoke highlighting or read aloud for a pronunciation score.
// Categories come from the Categories Manager (type "reading") and
// support sub-categories; the lesson tag makes the story appear as a
// recommendation when that lesson is finished.

interface StoryRow {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category_id: string | null;
  lesson_id: string | null;
  stage_id?: string | null;
  module_id?: string | null;
  pages: string[];
  level: string;
  is_published: boolean;
  order_index: number;
}

export default function ReadingManager() {
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  // Item id -> its category ids in display order (Round 85).
  const [memberships, setMemberships] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📖');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('');
  // Round 85: up to 5 categories per story.
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [stageTagging, setStageTagging] = useState(false);
  // Stage names for the grouped list (Round 76).
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [pages, setPages] = useState<string[]>(['']);
  // Comprehension questions (Round 39), edited as one line per question:
  // Question :: Option 1 :: Option 2 :: Option 3 :: <correct option number>
  const [questionsText, setQuestionsText] = useState('');
  // Voice uploads for this story's sentences.
  const [showVoices, setShowVoices] = useState(false);
  const [coverage, setCoverage] = useState<{ covered: number; total: number } | null>(null);
  const [coverageKey, setCoverageKey] = useState(0);

  const taggingAvailable = useLessonTagging('reading_stories');

  useEffect(() => {
    (async () => {
      const { error } = await supabase.from('reading_stories').select('stage_id').limit(1);
      setStageTagging(!error);
      setTaxonomy(await fetchTaxonomy());
    })();
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [storiesRes, catData] = await Promise.all([
        supabase.from('reading_stories').select('*').order('order_index').order('created_at'),
        fetchCategoriesForType('reading'),
      ]);
      if (storiesRes.error) throw storiesRes.error;
      setTableMissing(false);
      const rows = (storiesRes.data || []) as StoryRow[];
      setStories(rows);
      setCategories(catData);
      const map = await fetchMembershipMap('reading', rows, catData);
      setMemberships(Object.fromEntries(map));
    } catch (error: any) {
      if (/reading_stories/.test(error?.message || '')) {
        setTableMissing(true);
        setStories([]);
      } else {
        showAlert('Error', error.message);
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

  const categoryIdsFor = (row: StoryRow): string[] =>
    memberships[row.id] ?? (row.category_id ? [row.category_id] : []);

  const openEditForm = (row: StoryRow) => {
    setEditId(row.id);
    setTitle(row.title);
    setEmoji(row.emoji || '📖');
    setDescription(row.description || '');
    setLevel(row.level || '');
    setCategoryIds(categoryIdsFor(row));
    setLessonId(row.lesson_id ?? null);
    setStageId(row.stage_id ?? null);
    setModuleId(row.module_id ?? null);
    setPages(Array.isArray(row.pages) && row.pages.length ? row.pages.map(String) : ['']);
    setQuestionsText(
      Array.isArray((row as any).questions)
        ? (row as any).questions
            .map((item: any) => `${item.q} :: ${(item.options || []).join(' :: ')} :: ${(item.answer ?? 0) + 1}`)
            .join('\n')
        : '',
    );
    setShowForm(true);
  };

  const cancelEdit = () => {
    setShowForm(false);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showAlert('Missing Title', 'Give the story a title.');
      return;
    }
    const cleanPages = pages.map((p) => p.trim()).filter((p) => p.length > 0);
    if (cleanPages.length === 0) {
      showAlert('No Pages', 'Write at least one page of the story.');
      return;
    }
    const parsedQuestions = questionsText
      .split('\n')
      .map((line) => line.split('::').map((s) => s.trim()))
      .filter((parts) => parts.length >= 5 && parts[0].length > 0)
      .map((parts) => ({
        q: parts[0],
        options: [parts[1], parts[2], parts[3]].filter((o) => o.length > 0),
        answer: Math.min(Math.max(parseInt(parts[4], 10) || 1, 1), 3) - 1,
      }))
      .filter((item) => item.options.length >= 2);
    setSaving(true);
    try {
      const basePayload = {
        title: title.trim(),
        emoji: emoji.trim() || '📖',
        description: description.trim(),
        level: level.trim(),
        // Legacy column keeps the PRIMARY category (first in display order).
        category_id: primaryCategoryId(categoryIds, categories),
        pages: cleanPages,
        ...(taggingAvailable ? { lesson_id: lessonId } : {}),
        ...(stageTagging ? { stage_id: stageId, module_id: moduleId } : {}),
      };
      const payload: any = { ...basePayload, questions: parsedQuestions };
      const saveWith = async (p: any): Promise<{ error: any; id: string | null }> => {
        if (editId) {
          const { error } = await supabase.from('reading_stories').update(p).eq('id', editId);
          return { error, id: editId };
        }
        const { data, error } = await supabase
          .from('reading_stories')
          .insert([{ ...p, order_index: stories.length }])
          .select('id')
          .single();
        return { error, id: (data as { id: string } | null)?.id ?? null };
      };
      let { error, id: savedId } = await saveWith(payload);
      if (error && /questions/.test(error.message)) {
        // Migration 30 not run yet: save without the questions column.
        ({ error, id: savedId } = await saveWith(basePayload));
      }
      if (error) throw error;
      // Round 85: write the full membership set (join table + primary sync).
      if (savedId) await setItemCategories('reading', savedId, categoryIds, categories);
      cancelEdit();
      await fetchData();
    } catch (error: any) {
      showAlert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  // Sentences of the story being edited, in narration order - the
  // units the voice section below attaches recordings to.
  const storySentences = pages.flatMap((p) => splitSentences(p));

  // Coverage is counted when the voice section opens and after each
  // upload or removal inside it - not on every keystroke in the page
  // editor - so the effect reads the current pages through a ref.
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    if (!showVoices) return;
    let cancelled = false;
    (async () => {
      const sentences = pagesRef.current.flatMap((p) => splitSentences(p));
      const result = await countCoveredSentences(sentences).catch(() => null);
      if (!cancelled && result) setCoverage(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [showVoices, coverageKey]);

  const togglePublish = async (row: StoryRow) => {
    const { error } = await supabase
      .from('reading_stories')
      .update({ is_published: !row.is_published })
      .eq('id', row.id);
    if (error) showAlert('Update Failed', error.message);
    else await fetchData();
  };

  const handleDelete = (row: StoryRow) => {
    const run = async () => {
      const { error } = await supabase.from('reading_stories').delete().eq('id', row.id);
      if (error) showAlert('Delete Failed', error.message);
      else await fetchData();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete story "${row.title}"?`)) run();
    }
  };

  // ------------------------------------------------------------------
  // Round 97: upload door. New stories arrive as packages; the form
  // below is now edit-only. Questions are STRUCTURED data in the
  // package and convert to the stored { q, options, answer } shape
  // (answer 0-based) here - never the :: text format.
  // ------------------------------------------------------------------
  interface ResolvedReading extends ReadingPkg {
    resolvedStageId: string | null;
    resolvedModuleId: string | null;
    resolvedCategoryIds: string[];
    existingId: string | null;
  }

  const resolveReading = (items: ReadingPkg[]) => {
    const errors: string[] = [];
    const flatCats = flattenCategoryTree(categories);
    const resolved: ResolvedReading[] = items.map((s) => {
      let stageId = s.stage_id;
      if (!stageId && s.stage != null) {
        stageId = taxonomy?.stages.find((st) => st.order_index === s.stage)?.id ?? null;
        if (!stageId) errors.push(`"${s.title}": stage ${s.stage} was not found.`);
      }
      let moduleId: string | null = null;
      if (s.module != null) {
        if (!stageId) {
          errors.push(`"${s.title}": module ${s.module} needs its stage.`);
        } else {
          moduleId =
            taxonomy?.modules.find(
              (m) => m.stage_id === stageId && m.order_index % 100 === s.module
            )?.id ?? null;
          if (!moduleId) errors.push(`"${s.title}": module ${s.module} was not found in stage ${s.stage}.`);
        }
      }
      const catIds: string[] = [];
      for (const name of s.categories) {
        const hit = flatCats.find(({ cat }) => cat.name.trim().toLowerCase() === name.toLowerCase());
        if (!hit) {
          errors.push(`"${s.title}": category "${name}" does not exist in the Smart Reading tree - create it in the Categories Manager first.`);
        } else {
          catIds.push(hit.cat.id);
        }
      }
      const existing = stories.find(
        (r) =>
          r.title.trim().toLowerCase() === s.title.toLowerCase() &&
          (r.stage_id ?? null) === (stageId ?? null)
      );
      return {
        ...s,
        resolvedStageId: stageId,
        resolvedModuleId: moduleId,
        resolvedCategoryIds: catIds,
        existingId: existing?.id ?? null,
      };
    });
    const lines = resolved.map((r) =>
      r.existingId
        ? `Update "${r.title}" - replace its ${r.pages.length} pages and ${r.questions.length} questions.`
        : `Create "${r.title}" - ${r.pages.length} pages, ${r.questions.length} questions.`
    );
    return { errors, resolved, lines };
  };

  const planReading = async (items: ReadingPkg[]) => {
    const { errors, lines } = resolveReading(items);
    return { errors, lines };
  };

  const installReading = async (items: ReadingPkg[]): Promise<string[]> => {
    const { errors, resolved } = resolveReading(items);
    if (errors.length > 0) throw new Error(errors[0]);
    const results: string[] = [];
    let nextOrder = stories.reduce((mx, r) => Math.max(mx, r.order_index ?? 0), 0);
    for (const r of resolved) {
      const payload: any = {
        title: r.title,
        emoji: r.emoji,
        description: r.description,
        level: r.level,
        category_id: primaryCategoryId(r.resolvedCategoryIds, categories),
        pages: r.pages,
        questions: r.questions.map((q) => ({
          q: q.question,
          options: [...q.options],
          answer: q.correct - 1,
        })),
        ...(taggingAvailable ? { lesson_id: r.lesson_id } : {}),
        ...(stageTagging ? { stage_id: r.resolvedStageId, module_id: r.resolvedModuleId } : {}),
      };
      let id = r.existingId;
      if (id) {
        const { error } = await supabase.from('reading_stories').update(payload).eq('id', id);
        if (error) throw error;
        results.push(`Updated "${r.title}".`);
      } else {
        nextOrder += 1;
        const { data, error } = await supabase
          .from('reading_stories')
          .insert([{ ...payload, order_index: nextOrder }])
          .select('id')
          .single();
        if (error) throw error;
        id = (data as { id: string }).id;
        results.push(`Created "${r.title}".`);
      }
      await setItemCategories('reading', id, r.resolvedCategoryIds, categories);
    }
    await fetchData();
    return results;
  };

  if (tableMissing) {
    return (
      <View className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <Text className="text-lg font-bold text-amber-800 mb-2">Smart Reading is not switched on yet</Text>
        <Text className="text-amber-700">
          Run migration 19 (20261116000019_smart_reading.sql) in the Supabase SQL Editor, then come back here to add stories.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-6">
      <View className="flex-row justify-between items-center">
        <Text className="font-display text-3xl font-semibold text-navy">Smart Reading Stories</Text>
      </View>

      {!showForm ? (
        <ContentUploadDoor
          title="📤 Upload a reading package"
          blurb="New stories are no longer typed in here - they arrive as one JSON package file (the format the Content Studio will export), with questions as structured data. Pick a file, check the plan, then install. Existing stories below can still be edited, categorised and published as before."
          formatLines={READING_FORMAT_LINES}
          exampleJson={JSON.stringify(READING_EXAMPLE, null, 2)}
          exampleFileName="reading-package-example.json"
          validate={validateReadingPackage}
          plan={planReading}
          install={installReading}
        />
      ) : null}

      {showForm ? (
        <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm gap-5">
          <Text className="font-display text-xl font-semibold text-navy">Edit Story</Text>

          <View className="flex-col md:flex-row gap-4">
            <View className="flex-2">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Title</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="e.g., The Brave Little Bowler"
                value={title}
                onChangeText={setTitle}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Emoji</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                value={emoji}
                onChangeText={setEmoji}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Level Label</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="e.g., Stage 1"
                value={level}
                onChangeText={setLevel}
              />
            </View>
          </View>

          <View>
            <Text className="text-sm font-semibold text-text-secondary mb-2">Short Description</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="One line shown on the story card"
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View className="gap-3">
            <Text className="text-sm font-semibold text-text-secondary">Pages (short pages read best — 3 to 6 sentences each)</Text>
            {pages.map((page, i) => (
              <View key={i} className="gap-1">
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs font-bold text-slate-400">PAGE {i + 1}</Text>
                  {pages.length > 1 ? (
                    <Pressable onPress={() => setPages(pages.filter((_, j) => j !== i))}>
                      <Text className="text-xs font-bold text-red-500">Remove page</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                  placeholder="Write this page of the story..."
                  value={page}
                  onChangeText={(t) => setPages(pages.map((p, j) => (j === i ? t : p)))}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            ))}
            <Pressable onPress={() => setPages([...pages, ''])} className="self-start px-3 py-2 bg-slate-100 rounded-full border border-inkline">
              <Text className="text-sm font-semibold text-slate-600">+ Add page</Text>
            </Pressable>
          </View>

          <View>
            <Text className="text-sm font-semibold text-text-secondary">Comprehension Questions (optional)</Text>
            <Text className="text-xs text-slate-400 mb-2">
              One question per line: Question :: Option 1 :: Option 2 :: Option 3 :: correct option number (1, 2 or 3).
              Learners answer them on the story-finished screen.
            </Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder={'Who is the story about? :: Ken :: Mira :: The coach :: 1'}
              value={questionsText}
              onChangeText={setQuestionsText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {storySentences.length > 0 ? (
            <View className="border-t border-inkline pt-4">
              <View className="flex-row items-center justify-between flex-wrap gap-2">
                <Text className="text-sm font-semibold text-text-secondary">
                  🎙 Voices for this story
                  {coverage ? (
                    <Text className="text-slate-400 font-normal">
                      {' '}— {coverage.covered} of {coverage.total} sentences have a human voice
                    </Text>
                  ) : null}
                </Text>
                <Pressable
                  onPress={() => setShowVoices((s) => !s)}
                  className="px-3 py-2 bg-slate-100 rounded-full border border-inkline"
                >
                  <Text className="text-sm font-semibold text-slate-600">{showVoices ? 'Hide' : 'Upload voices'}</Text>
                </Pressable>
              </View>
              {showVoices ? (
                <View className="mt-3 gap-4">
                  <Text className="text-xs text-slate-400">
                    Upload a recording of each sentence for each voice you want students to hear.
                    Sentences without an upload are read by the device voice. If you edit a
                    sentence later, its uploads stay with the old text and it shows as unvoiced again.
                  </Text>
                  {storySentences.map((sentence, i) => (
                    <View key={`${i}-${sentence}`}>
                      <Text className="text-sm text-slate-600">
                        <Text className="font-bold text-slate-400">{i + 1}. </Text>
                        {sentence}
                      </Text>
                      <SentenceVoices
                        text={sentence}
                        lineType="reading"
                        refLabel={`Smart Reading: ${title.trim() || 'Story'}`}
                        onChanged={() => setCoverageKey((k) => k + 1)}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="border-t border-inkline pt-4">
            <ContentTagging
              categories={categories}
              categoryIds={categoryIds}
              onCategoryIds={setCategoryIds}
              categoryLabel="Shelf Categories (optional)"
              stageId={stageId}
              onStageId={setStageId}
              moduleId={moduleId}
              onModuleId={setModuleId}
              lessonId={lessonId}
              onLessonId={setLessonId}
            />
            {categories.length === 0 ? (
              <Text className="text-xs text-slate-400 mt-2">No reading categories yet — create them in the Categories Manager (type: Smart Reading).</Text>
            ) : null}
          </View>

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={cancelEdit} className="px-5 py-3 bg-white border border-inkline rounded-full">
              <Text className="font-bold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} className="px-5 py-3 bg-navy rounded-full border-b-4 border-navy-deep">
              <Text className="font-bold text-white">{saving ? 'Saving...' : 'Save Story'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* List: search + Stage -> Category collapsible groups (Round 76) */}
      {loading ? (
        <View className="bg-white rounded-2xl border border-inkline shadow-sm p-8 items-center">
          <ActivityIndicator size="large" color="#0A192F" />
        </View>
      ) : (
        <GroupedContentList
          items={stories}
          stages={(taxonomy?.stages || []).map((s) => ({ id: s.id, title: s.title }))}
          categories={flattenCategoryTree(categories).map(({ cat }) => ({ id: cat.id, name: cat.name }))}
          idOf={(row) => row.id}
          stageIdOf={(row) => row.stage_id ?? null}
          categoryIdOf={(row) => row.category_id ?? null}
          categoryIdsOf={(row) => categoryIdsFor(row)}
          titleOf={(row) => row.title}
          descriptionOf={(row) => row.description}
          itemNoun="stories"
          searchPlaceholder="Search stories by title…"
          emptyMessage="No stories yet. Upload a reading package above to add the first ones."
          bulkAssign={{
            onAssign: async (ids, categoryId) => {
              const res = await bulkAddCategory('reading', ids, categoryId, stories, categories);
              await fetchData();
              return res.message;
            },
            onRemove: async (ids, categoryId) => {
              const res = await bulkRemoveCategory('reading', ids, categoryId, stories, categories);
              await fetchData();
              return res.message;
            },
          }}
          renderItem={(row, isLast) => (
            <View
              key={row.id}
              className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-3 ${isLast ? '' : 'border-b border-inkline'}`}
            >
              <View className="flex-row items-center gap-3 flex-1">
                <Text className="text-2xl">{row.emoji}</Text>
                <View>
                  <Text className="font-display font-semibold text-navy text-base">{row.title}</Text>
                  <Text className="text-sm text-slate-500">
                    {(Array.isArray(row.pages) ? row.pages.length : 0)} pages
                    {row.level ? ` · ${row.level}` : ''}
                    {categoryIdsFor(row).length
                      ? ` · ${categoryIdsFor(row).map((id) => categories.find((c) => c.id === id)?.name || '').filter(Boolean).join(' · ')}`
                      : ''}
                    {row.lesson_id ? ' · 🎯 tied to a lesson' : ''}
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => togglePublish(row)}
                  className={`px-3 py-1.5 rounded-full border ${row.is_published ? 'bg-pitch-light border-pitch/30' : 'bg-slate-100 border-inkline'}`}
                >
                  <Text className={`text-sm font-semibold ${row.is_published ? 'text-pitch-dark' : 'text-slate-500'}`}>
                    {row.is_published ? 'Published' : 'Hidden'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => openEditForm(row)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                  <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(row)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                  <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
