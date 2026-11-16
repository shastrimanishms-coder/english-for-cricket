import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';
import { useLessonTagging } from '../../lib/useLessonTagging';
import BelongsToPicker from './BelongsToPicker';

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
  const [pages, setPages] = useState<string[]>(['']);

  const taggingAvailable = useLessonTagging('reading_stories');

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
    setPages(['']);
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
    setPages(Array.isArray(row.pages) && row.pages.length ? row.pages.map(String) : ['']);
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
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        emoji: emoji.trim() || '📖',
        description: description.trim(),
        level: level.trim(),
        category_id: categoryId || null,
        pages: cleanPages,
        ...(taggingAvailable ? { lesson_id: lessonId } : {}),
      };
      if (editId) {
        const { error } = await supabase.from('reading_stories').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reading_stories')
          .insert([{ ...payload, order_index: stories.length }]);
        if (error) throw error;
      }
      cancelEdit();
      await fetchData();
    } catch (error: any) {
      showAlert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

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
        <Text className="text-2xl font-bold text-text-primary">Smart Reading Stories</Text>
        {!showForm ? (
          <Pressable onPress={openCreateForm} className="px-4 py-2.5 bg-[#0A192F] rounded-lg">
            <Text className="text-white font-bold text-sm">+ New Story</Text>
          </Pressable>
        ) : null}
      </View>

      {showForm ? (
        <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm gap-5">
          <Text className="text-lg font-bold text-[#0A192F]">{editId ? 'Edit Story' : 'New Story'}</Text>

          <View className="flex-col md:flex-row gap-4">
            <View className="flex-2">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Title</Text>
              <TextInput
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
                placeholder="e.g., The Brave Little Bowler"
                value={title}
                onChangeText={setTitle}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Emoji</Text>
              <TextInput
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
                value={emoji}
                onChangeText={setEmoji}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Level Label</Text>
              <TextInput
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
                placeholder="e.g., Stage 1"
                value={level}
                onChangeText={setLevel}
              />
            </View>
          </View>

          <View>
            <Text className="text-sm font-semibold text-text-secondary mb-2">Short Description</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder="One line shown on the story card"
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View>
            <Text className="text-sm font-semibold text-text-secondary mb-2">Shelf Category (optional)</Text>
            <View className="flex-row flex-wrap gap-2">
              <Pressable
                onPress={() => setCategoryId('')}
                className={`px-3 py-2 rounded-full border ${categoryId === '' ? 'border-[#0A192F] bg-[#0A192F]' : 'border-slate-200 bg-slate-50'}`}
              >
                <Text className={`text-xs font-semibold ${categoryId === '' ? 'text-white' : 'text-slate-600'}`}>None</Text>
              </Pressable>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  className={`px-3 py-2 rounded-full border ${categoryId === c.id ? 'border-[#0A192F] bg-[#0A192F]' : 'border-slate-200 bg-slate-50'}`}
                >
                  <Text className={`text-xs font-semibold ${categoryId === c.id ? 'text-white' : 'text-slate-600'}`}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            {categories.length === 0 ? (
              <Text className="text-xs text-slate-400 mt-2">No reading categories yet — create them in the Categories Manager (type: Smart Reading).</Text>
            ) : null}
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
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
                  placeholder="Write this page of the story..."
                  value={page}
                  onChangeText={(t) => setPages(pages.map((p, j) => (j === i ? t : p)))}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            ))}
            <Pressable onPress={() => setPages([...pages, ''])} className="self-start px-3 py-2 bg-slate-100 rounded-lg border border-slate-200">
              <Text className="text-sm font-semibold text-slate-600">+ Add page</Text>
            </Pressable>
          </View>

          {taggingAvailable ? (
            <View className="border-t border-slate-100 pt-4">
              <BelongsToPicker value={lessonId} onChange={setLessonId} />
            </View>
          ) : null}

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={cancelEdit} className="px-5 py-3 bg-slate-100 border border-slate-200 rounded-xl">
              <Text className="font-bold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} className="px-5 py-3 bg-[#0A192F] rounded-xl">
              <Text className="font-bold text-white">{saving ? 'Saving...' : 'Save Story'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : stories.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No stories yet. Add your first one above.</Text>
          </View>
        ) : (
          stories.map((row, index) => (
            <View
              key={row.id}
              className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-3 ${index !== stories.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              <View className="flex-row items-center gap-3 flex-1">
                <Text className="text-2xl">{row.emoji}</Text>
                <View>
                  <Text className="font-bold text-text-primary">{row.title}</Text>
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
                  className={`px-3 py-1.5 rounded border ${row.is_published ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-100 border-slate-200'}`}
                >
                  <Text className={`text-sm font-semibold ${row.is_published ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {row.is_published ? 'Published' : 'Hidden'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => openEditForm(row)} className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200">
                  <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(row)} className="px-3 py-1.5 bg-red-50 rounded border border-red-100">
                  <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
