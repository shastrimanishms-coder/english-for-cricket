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
import { fetchTaxonomy, type Taxonomy } from '../../lib/curriculumTaxonomy';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';
import { useLessonTagging } from '../../lib/useLessonTagging';
import ContentTagging from './ContentTagging';
import GroupedContentList from './GroupedContentList';
import SentenceVoices from './SentenceVoices';

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
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📖');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
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
      const [storiesRes, catsRes] = await Promise.all([
        supabase.from('reading_stories').select('*').order('order_index').order('created_at'),
        supabase.from('categories').select('id, name, parent_id').eq('type', 'reading').order('name'),
      ]);
      if (storiesRes.error) throw storiesRes.error;
      setTableMissing(false);
      setStories((storiesRes.data || []) as StoryRow[]);
      setCategories((catsRes.data || []) as { id: string; name: string }[]);
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

  const openCreateForm = () => {
    setEditId(null);
    setTitle('');
    setEmoji('📖');
    setDescription('');
    setLevel('');
    setCategoryId('');
    setLessonId(null);
    setStageId(null);
    setModuleId(null);
    setPages(['']);
    setQuestionsText('');
    setShowForm(true);
  };

  const openEditForm = (row: StoryRow) => {
    setEditId(row.id);
    setTitle(row.title);
    setEmoji(row.emoji || '📖');
    setDescription(row.description || '');
    setLevel(row.level || '');
    setCategoryId(row.category_id || '');
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
        category_id: categoryId || null,
        pages: cleanPages,
        ...(taggingAvailable ? { lesson_id: lessonId } : {}),
        ...(stageTagging ? { stage_id: stageId, module_id: moduleId } : {}),
      };
      const payload: any = { ...basePayload, questions: parsedQuestions };
      const saveWith = async (p: any) => {
        if (editId) {
          const { error } = await supabase.from('reading_stories').update(p).eq('id', editId);
          return error;
        }
        const { error } = await supabase
          .from('reading_stories')
          .insert([{ ...p, order_index: stories.length }]);
        return error;
      };
      let error = await saveWith(payload);
      if (error && /questions/.test(error.message)) {
        // Migration 30 not run yet: save without the questions column.
        error = await saveWith(basePayload);
      }
      if (error) throw error;
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
        {!showForm ? (
          <Pressable onPress={openCreateForm} className="px-4 py-2.5 bg-navy rounded-full">
            <Text className="text-white font-bold text-sm">+ New Story</Text>
          </Pressable>
        ) : null}
      </View>

      {showForm ? (
        <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm gap-5">
          <Text className="font-display text-xl font-semibold text-navy">{editId ? 'Edit Story' : 'New Story'}</Text>

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
              categoryId={categoryId}
              onCategoryId={setCategoryId}
              categoryLabel="Shelf Category (optional)"
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
          categories={categories}
          idOf={(row) => row.id}
          stageIdOf={(row) => row.stage_id ?? null}
          categoryIdOf={(row) => row.category_id ?? null}
          titleOf={(row) => row.title}
          descriptionOf={(row) => row.description}
          itemNoun="stories"
          searchPlaceholder="Search stories by title…"
          emptyMessage="No stories yet. Add your first one above."
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
                    {row.category_id ? ` · ${categories.find((c) => c.id === row.category_id)?.name || ''}` : ''}
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
