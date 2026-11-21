import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import SentenceVoices from './SentenceVoices';

// Admin manager for the standalone Speaking Practice area ONLY
// (interviews + small talk role-plays). Lessons keep their own
// Speak & Repeat slides in the Slide Builder - this section never
// touches lesson content.
//
// A scenario is a scripted conversation: the app plays the other
// person ('other' turns) and the learner speaks the 'learner' turns
// and gets the word-by-word speech score. scenario_type stays
// 'scripted' for now; AI conversations arrive in a future update
// and will live in the same table.

interface ScenarioTurn {
  speaker: 'other' | 'learner';
  text: string;
}

interface ScenarioRow {
  id: string;
  title: string;
  category: string;
  emoji: string;
  description: string | null;
  other_name: string;
  turns: ScenarioTurn[];
  scenario_type: string;
  is_published: boolean;
  order_index: number;
  created_at: string;
  lesson_id?: string | null;
  category_id?: string | null;
}

const CATEGORIES = ['Interview', 'Small Talk'] as const;

export default function SpeakingManager() {
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  // Which turn's voice-upload panel is open (one at a time).
  const [openVoiceTurn, setOpenVoiceTurn] = useState<number | null>(null);
  const [category, setCategory] = useState<string>('Interview');
  const [emoji, setEmoji] = useState('🎙️');
  const [description, setDescription] = useState('');
  const [otherName, setOtherName] = useState('');
  const [turns, setTurns] = useState<ScenarioTurn[]>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>('');
  const [speakingCats, setSpeakingCats] = useState<{ id: string; name: string }[]>([]);
  const taggingAvailable = useLessonTagging('speaking_scenarios');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('speaking_scenarios')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTableMissing(false);
      setScenarios((data || []) as ScenarioRow[]);
    } catch (error: any) {
      if (/speaking_scenarios/.test(error?.message || '')) {
        // Migration 15 not run yet: show guidance instead of an error.
        setTableMissing(true);
        setScenarios([]);
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
      const { data } = await supabase.from('categories').select('id, name').eq('type', 'speaking').order('name');
      setSpeakingCats((data || []) as { id: string; name: string }[]);
    })();
  }, [fetchData]);

  const openCreateForm = () => {
    setEditId(null);
    setTitle('');
    setCategory('Interview');
    setEmoji('🎙️');
    setDescription('');
    setOtherName('');
    setTurns([
      { speaker: 'other', text: '' },
      { speaker: 'learner', text: '' },
    ]);
    setShowForm(true);
  };

  const openEditForm = (row: ScenarioRow) => {
    setEditId(row.id);
    setTitle(row.title);
    setCategory(row.category);
    setEmoji(row.emoji || '🎙️');
    setDescription(row.description || '');
    setOtherName(row.other_name || '');
    setTurns(Array.isArray(row.turns) ? row.turns : []);
    setLessonId(row.lesson_id ?? null);
    setCategoryId(row.category_id ?? '');
    setShowForm(true);
  };

  const cancelEdit = () => {
    setShowForm(false);
    setEditId(null);
  };

  const updateTurn = (index: number, patch: Partial<ScenarioTurn>) => {
    setTurns(prev => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const addTurn = (speaker: 'other' | 'learner') => {
    setTurns(prev => [...prev, { speaker, text: '' }]);
  };

  const removeTurn = (index: number) => {
    setTurns(prev => prev.filter((_, i) => i !== index));
  };

  const moveTurn = (index: number, direction: -1 | 1) => {
    setTurns(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showAlert('Missing Title', 'Give the scenario a title.');
      return;
    }
    const cleanTurns = turns
      .map(t => ({ speaker: t.speaker, text: t.text.trim() }))
      .filter(t => t.text.length > 0);
    if (cleanTurns.length < 2) {
      showAlert('Too Short', 'A scenario needs at least two lines with text.');
      return;
    }
    if (!cleanTurns.some(t => t.speaker === 'learner')) {
      showAlert('No Learner Lines', 'Add at least one line for the student to speak (🗣️ You).');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        emoji: emoji.trim() || '🎙️',
        description: description.trim() || null,
        other_name: otherName.trim() || 'Partner',
        turns: cleanTurns,
        ...(taggingAvailable ? { lesson_id: lessonId, category_id: categoryId || null } : {}),
      };
      if (editId) {
        const { error } = await supabase
          .from('speaking_scenarios')
          .update(payload)
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('speaking_scenarios')
          .insert([{ ...payload, order_index: scenarios.length }]);
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

  const togglePublish = async (row: ScenarioRow) => {
    try {
      const { error } = await supabase
        .from('speaking_scenarios')
        .update({ is_published: !row.is_published })
        .eq('id', row.id);
      if (error) throw error;
      await fetchData();
    } catch (error: any) {
      showAlert('Update Failed', error.message);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('speaking_scenarios').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (error: any) {
      showAlert('Delete Failed', error.message);
    }
  };

  const handleDelete = (row: ScenarioRow) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete scenario "${row.title}"?`)) {
        void executeDelete(row.id);
      }
    } else {
      Alert.alert('Delete Scenario', `Delete "${row.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void executeDelete(row.id) },
      ]);
    }
  };

  const learnerLineCount = (row: ScenarioRow) =>
    (Array.isArray(row.turns) ? row.turns : []).filter(t => t.speaker === 'learner').length;

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center flex-wrap gap-4">
        <Text className="font-display text-3xl font-semibold text-navy">Speaking Practice CMS</Text>
        {!showForm && !tableMissing && (
          <Pressable onPress={openCreateForm} className="px-5 py-3 bg-gold rounded-full border-b-4 border-gold-dark">
            <Text className="text-navy font-bold text-sm">+ New Scenario</Text>
          </Pressable>
        )}
      </View>

      <View className="bg-navy p-5 rounded-[20px]">
        <Text className="font-display text-lg font-semibold text-white mb-1">🎙️ Speaking-only content</Text>
        <Text className="text-slate-300 text-sm">
          These scenarios power the learner&apos;s Speaking Practice area (Interviews &amp; Small
          Talk). The app plays the other person; the student speaks their own lines and gets a
          speech score. Lesson speaking stays separate — Speak &amp; Repeat slides live in the
          Slide Builder. Talking with an AI partner is planned for a future update; these scripted
          scenarios are ready for it.
        </Text>
      </View>

      {tableMissing ? (
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <Text className="font-bold text-amber-800 mb-2">One-time database update needed</Text>
          <Text className="text-amber-700 text-sm">
            This section needs migration 15 (the speaking_scenarios table) before it can store
            scenarios. Run supabase/migrations/20261115000015_speaking_scenarios.sql in the
            Supabase SQL Editor, then come back — the seven starter scenarios will be waiting
            here, and learners keep using the built-in copies until then.
          </Text>
        </View>
      ) : showForm ? (
        <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
          <Text className="font-display text-xl font-semibold text-navy">
            {editId ? 'Edit Scenario' : 'Create New Scenario'}
          </Text>

          <View className="flex-col md:flex-row gap-4">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Title</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="e.g., Post-Match Interview"
                value={title}
                onChangeText={setTitle}
              />
            </View>
            <View className="w-full md:w-24">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Emoji</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline text-center"
                value={emoji}
                onChangeText={setEmoji}
                maxLength={4}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">
                The app plays… (name)
              </Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="e.g., Reporter, Coach, Teammate"
                value={otherName}
                onChangeText={setOtherName}
              />
            </View>
          </View>

          <View className="flex-col md:flex-row gap-4">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Category</Text>
              <View className="flex-row gap-2">
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    className={`px-4 py-3 rounded-full border ${category === cat ? 'bg-navy border-navy' : 'bg-white border-inkline'}`}
                  >
                    <Text className={`font-bold text-sm ${category === cat ? 'text-white' : 'text-text-secondary'}`}>
                      {cat === 'Interview' ? '🎙️ Interview' : '💬 Small Talk'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Short Description</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="One line shown on the scenario card"
                value={description}
                onChangeText={setDescription}
              />
            </View>
          </View>

          {taggingAvailable ? (
            <View className="gap-4 border-t border-inkline pt-4">
              {speakingCats.length > 0 ? (
                <View>
                  <Text className="text-sm font-semibold text-text-secondary mb-2">Shelf Category (optional)</Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Pressable
                      onPress={() => setCategoryId('')}
                      className={`px-3 py-2 rounded-full border ${categoryId === '' ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
                    >
                      <Text className={`text-xs font-semibold ${categoryId === '' ? 'text-white' : 'text-slate-600'}`}>None</Text>
                    </Pressable>
                    {speakingCats.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => setCategoryId(c.id)}
                        className={`px-3 py-2 rounded-full border ${categoryId === c.id ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
                      >
                        <Text className={`text-xs font-semibold ${categoryId === c.id ? 'text-white' : 'text-slate-600'}`}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <BelongsToPicker value={lessonId} onChange={setLessonId} />
            </View>
          ) : null}

          {/* Dialogue editor */}
          <View>
            <Text className="text-sm font-semibold text-text-secondary mb-2">
              The Conversation — in order, top to bottom
            </Text>
            <View className="gap-3">
              {turns.map((turn, i) => (
                <Fragment key={i}>
                <View className="flex-row items-start gap-2">
                  <Pressable
                    onPress={() =>
                      updateTurn(i, { speaker: turn.speaker === 'other' ? 'learner' : 'other' })
                    }
                    className={`px-3 py-3 rounded-xl border w-28 items-center ${turn.speaker === 'other' ? 'bg-slate-100 border-inkline' : 'bg-pitch/10 border-pitch/30'}`}
                  >
                    <Text className="font-bold text-xs text-text-secondary">
                      {turn.speaker === 'other' ? '👤 Them' : '🗣️ You'}
                    </Text>
                  </Pressable>
                  <TextInput
                    className="flex-1 bg-canvas p-3 rounded-xl border border-inkline"
                    placeholder={
                      turn.speaker === 'other' ? 'What they say…' : 'What the student says…'
                    }
                    value={turn.text}
                    onChangeText={text => updateTurn(i, { text })}
                    multiline
                  />
                  <View className="flex-row gap-1 pt-2">
                    <Pressable onPress={() => moveTurn(i, -1)} className="px-2 py-1">
                      <Text className="text-slate-400 font-bold">↑</Text>
                    </Pressable>
                    <Pressable onPress={() => moveTurn(i, 1)} className="px-2 py-1">
                      <Text className="text-slate-400 font-bold">↓</Text>
                    </Pressable>
                    <Pressable onPress={() => removeTurn(i)} className="px-2 py-1">
                      <Text className="text-red-400 font-bold">✕</Text>
                    </Pressable>
                  </View>
                </View>
                {turn.speaker === 'other' && turn.text.trim() ? (
                  <View className="ml-32">
                    <Pressable
                      onPress={() => setOpenVoiceTurn(openVoiceTurn === i ? null : i)}
                      className="self-start px-3 py-1.5 rounded-full bg-slate-100 border border-inkline"
                    >
                      <Text className="text-xs font-bold text-slate-600">
                        {openVoiceTurn === i ? '🎙 Hide voices' : '🎙 Voices for this line'}
                      </Text>
                    </Pressable>
                    {openVoiceTurn === i ? (
                      <SentenceVoices
                        key={turn.text.trim()}
                        text={turn.text}
                        lineType="dialogue"
                        refLabel={`Speaking Practice: ${title.trim() || 'Scenario'}`}
                      />
                    ) : null}
                  </View>
                ) : null}
                </Fragment>
              ))}
            </View>
            <View className="flex-row gap-2 mt-3">
              <Pressable
                onPress={() => addTurn('other')}
                className="px-4 py-2 bg-slate-100 border border-inkline rounded-full"
              >
                <Text className="text-text-secondary font-bold text-xs">+ 👤 Their line</Text>
              </Pressable>
              <Pressable
                onPress={() => addTurn('learner')}
                className="px-4 py-2 bg-pitch/10 border border-pitch/30 rounded-full"
              >
                <Text className="text-pitch font-bold text-xs">+ 🗣️ Student line</Text>
              </Pressable>
            </View>
            <Text className="text-xs text-slate-400 mt-2">
              Tap 👤/🗣️ to switch who says a line. Empty lines are dropped when you save.
            </Text>
          </View>

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={cancelEdit} className="px-5 py-3 bg-white border border-inkline rounded-full">
              <Text className="text-text-secondary font-bold text-sm">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={saving}
              className="px-5 py-3 bg-navy rounded-full border-b-4 border-navy-deep"
            >
              <Text className="text-white font-bold text-sm">{saving ? 'Saving…' : 'Save Scenario'}</Text>
            </Pressable>
          </View>
        </View>
      ) : loading ? (
        <View className="p-12 items-center">
          <ActivityIndicator size="large" color="#0A192F" />
        </View>
      ) : scenarios.length === 0 ? (
        <View className="bg-white rounded-[20px] border border-inkline p-12 items-center">
          <Text className="text-5xl mb-4">🎙️</Text>
          <Text className="font-display text-xl font-semibold text-navy mb-2">No Scenarios Yet</Text>
          <Text className="text-text-secondary text-center">
            Create your first interview or small-talk scenario with the button above.
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {scenarios.map(row => (
            <View key={row.id} className="bg-white p-5 rounded-[20px] border border-inkline shadow-sm">
              <View className="flex-row items-start justify-between gap-4 flex-wrap">
                <View className="flex-row items-start gap-3 flex-1 min-w-[240px]">
                  <Text className="text-3xl">{row.emoji || '🎙️'}</Text>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="font-display font-semibold text-navy text-lg">{row.title}</Text>
                      <View className="px-2 py-0.5 rounded-md bg-slate-100">
                        <Text className="text-[11px] font-bold text-slate-500 uppercase">{row.category}</Text>
                      </View>
                      <View className={`px-2 py-0.5 rounded-md ${row.is_published ? 'bg-pitch-light' : 'bg-amber-50'}`}>
                        <Text className={`text-[11px] font-bold uppercase ${row.is_published ? 'text-pitch-dark' : 'text-amber-600'}`}>
                          {row.is_published ? 'Live' : 'Hidden'}
                        </Text>
                      </View>
                    </View>
                    {row.description ? (
                      <Text className="text-sm text-text-secondary mt-1">{row.description}</Text>
                    ) : null}
                    <Text className="text-xs text-slate-400 mt-1">
                      {(Array.isArray(row.turns) ? row.turns.length : 0)} lines • {learnerLineCount(row)} for the
                      student • with the {row.other_name}
                    </Text>
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => void togglePublish(row)}
                    className="px-3 py-2 bg-slate-100 rounded-full border border-inkline"
                  >
                    <Text className="text-text-secondary font-semibold text-xs">
                      {row.is_published ? 'Hide' : 'Publish'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openEditForm(row)}
                    className="px-3 py-2 bg-slate-100 rounded-full border border-inkline"
                  >
                    <Text className="text-text-secondary font-semibold text-xs">Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(row)}
                    className="px-3 py-2 bg-red-50 rounded-full border border-red-100"
                  >
                    <Text className="text-red-600 font-semibold text-xs">Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
