import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchTaxonomy, lessonPathLabel, type Taxonomy } from '../../lib/curriculumTaxonomy';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';
import AdminDropdown from './AdminDropdown';

// Round 94: the Word Bank catalogue manager (Asset Managers menu).
//
// The catalogue (public.word_bank_words, migration 40) is derived
// from the lesson word-card slides — 2,233 words — and drives My
// Word Bank: enrolment, review sessions and the Learn/Test books.
// This screen is where an App Manager or Content Manager curates
// it: search, cascade Stage -> Module -> Lesson, and per word edit
// the example sentence, the emoji, the picture URL, or switch the
// word off entirely.
//
// The word TEXT is deliberately read-only: every recording is
// matched by exact text, so retyping a word would orphan its
// audio. Switching a word off (migration 41's is_enabled) removes
// it from enrolment, review dealing and the dictionary browse;
// students' existing bank rows go dormant — never deleted — and
// come back if the word is switched on again.
//
// Before migration 41 runs, the is_enabled column does not exist:
// the catalogue read fails with the column in the error, and this
// screen shows a calm "run Migration 41" panel instead of an
// error. Learner screens are unaffected either way.

interface WordRow {
  word_key: string;
  word: string;
  emoji: string;
  example: string;
  image_url: string;
  lesson_id: string;
  is_enabled: boolean;
}

const PAGE_SIZE = 50;
const FETCH_PAGE = 1000;

export default function WordBankManager() {
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [words, setWords] = useState<WordRow[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);

  const [search, setSearch] = useState('');
  const [stageId, setStageId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formExample, setFormExample] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const tax = await fetchTaxonomy();
      setTaxonomy(tax);
      const all: WordRow[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('word_bank_words')
          .select('word_key, word, emoji, example, image_url, lesson_id, is_enabled')
          .order('word', { ascending: true })
          .range(from, from + FETCH_PAGE - 1);
        if (error) {
          if ((error.message || '').includes('is_enabled')) {
            setNeedsMigration(true);
            setWords([]);
            return;
          }
          throw new Error(error.message);
        }
        const rows = (data || []) as WordRow[];
        all.push(...rows);
        if (rows.length < FETCH_PAGE) break;
        from += FETCH_PAGE;
      }
      setWords(all);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the word catalogue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // --- taxonomy lookups -------------------------------------------------------
  const lessonById = useMemo(() => {
    const map = new Map<string, Taxonomy['lessons'][number]>();
    for (const l of taxonomy?.lessons || []) map.set(l.id, l);
    return map;
  }, [taxonomy]);
  const moduleById = useMemo(() => {
    const map = new Map<string, Taxonomy['modules'][number]>();
    for (const m of taxonomy?.modules || []) map.set(m.id, m);
    return map;
  }, [taxonomy]);

  const wordsPerLesson = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w.lesson_id, (counts.get(w.lesson_id) || 0) + 1);
    return counts;
  }, [words]);

  const moduleOptions = useMemo(
    () =>
      (taxonomy?.modules || [])
        .filter((m) => !stageId || m.stage_id === stageId)
        .map((m) => ({ id: m.id, label: m.title })),
    [taxonomy, stageId]
  );
  const lessonOptions = useMemo(
    () =>
      (taxonomy?.lessons || [])
        .filter((l) => !moduleId || l.module_id === moduleId)
        .map((l) => ({
          id: l.id,
          label: `Lesson ${l.order_index + 1} · ${l.title} (${wordsPerLesson.get(l.id) || 0} words)`,
        })),
    [taxonomy, moduleId, wordsPerLesson]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return words.filter((w) => {
      if (q && !w.word.toLowerCase().includes(q)) return false;
      const lesson = lessonById.get(w.lesson_id);
      if (!lesson) return false;
      if (lessonId) return w.lesson_id === lessonId;
      if (moduleId) return lesson.module_id === moduleId;
      if (stageId) {
        const mod = moduleById.get(lesson.module_id);
        return mod?.stage_id === stageId;
      }
      return true;
    });
  }, [words, search, stageId, moduleId, lessonId, lessonById, moduleById]);

  const enabledCount = useMemo(() => words.filter((w) => w.is_enabled).length, [words]);
  const visible = filtered.slice(0, visibleCount);

  // --- writes -------------------------------------------------------------------
  const applyLocal = (key: string, patch: Partial<WordRow>) =>
    setWords((prev) => prev.map((w) => (w.word_key === key ? { ...w, ...patch } : w)));

  const toggleEnabled = async (row: WordRow) => {
    const next = !row.is_enabled;
    setTogglingKey(row.word_key);
    applyLocal(row.word_key, { is_enabled: next });
    const { error } = await supabase
      .from('word_bank_words')
      .update({ is_enabled: next })
      .eq('word_key', row.word_key);
    setTogglingKey(null);
    if (error) {
      applyLocal(row.word_key, { is_enabled: row.is_enabled });
      showAlert('Could not save', error.message);
    }
  };

  const startEdit = (row: WordRow) => {
    setEditingKey(row.word_key);
    setFormExample(row.example);
    setFormEmoji(row.emoji);
    setFormImageUrl(row.image_url);
    setFormEnabled(row.is_enabled);
  };

  const saveEdit = async (row: WordRow) => {
    setSaving(true);
    const patch = {
      example: formExample.trim(),
      emoji: formEmoji.trim(),
      image_url: formImageUrl.trim(),
      is_enabled: formEnabled,
    };
    const { error } = await supabase
      .from('word_bank_words')
      .update(patch)
      .eq('word_key', row.word_key);
    setSaving(false);
    if (error) {
      showAlert('Could not save', error.message);
      return;
    }
    applyLocal(row.word_key, patch);
    setEditingKey(null);
  };

  // --- render -------------------------------------------------------------------
  if (loading) {
    return (
      <View className="py-20 items-center justify-center">
        <ActivityIndicator size="large" color="#0A192F" />
        <Text className="text-slate-500 mt-3">Loading the word catalogue…</Text>
      </View>
    );
  }

  if (needsMigration) {
    return (
      <View className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <Text className="font-display text-xl font-semibold text-navy mb-2">
          One setup step is still needed
        </Text>
        <Text className="text-slate-600 leading-6">
          The Word Bank manager needs Migration 41, which adds the on/off switch
          (is_enabled) to the word catalogue and lets the review functions respect it.
          Run <Text className="font-bold">Migration41-Word-Bank-Admin.sql</Text> in the Supabase
          SQL editor, then reopen this tab. Nothing is broken meanwhile: students keep using
          their Word Bank exactly as before — the catalogue simply cannot be edited until the
          migration runs.
        </Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <Text className="font-display text-xl font-semibold text-navy mb-2">
          The catalogue could not be loaded
        </Text>
        <Text className="text-slate-600 mb-4">{loadError}</Text>
        <Pressable
          onPress={() => void load()}
          className="self-start px-6 py-3 bg-navy rounded-full"
        >
          <Text className="text-white font-bold">Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text className="font-display text-2xl font-semibold text-navy mb-1">Word Bank</Text>
      <Text className="text-slate-500 mb-1">
        {words.length.toLocaleString()} words in the catalogue · {enabledCount.toLocaleString()}{' '}
        switched on. These are the words students meet in My Word Bank — in review sessions and in
        the Learn / Test lesson books.
      </Text>
      <Text className="text-slate-400 text-sm mb-5">
        Switching a word off removes it from enrolment, reviews and the dictionary. Students keep
        their progress, dormant, and it returns if the word is switched back on.
      </Text>

      {/* Filters */}
      <View className="bg-white border border-inkline rounded-2xl p-4 mb-5">
        <TextInput
          value={search}
          onChangeText={(t) => {
            setSearch(t);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by word…"
          className="bg-canvas border border-inkline rounded-xl px-4 py-3 mb-3 font-sans text-sm"
        />
        <View className="flex-row flex-wrap gap-3">
          <View className="flex-1 min-w-[180px]">
            <Text className="text-[11px] font-bold uppercase tracking-[1px] text-slate-400 mb-1">
              Stage
            </Text>
            <AdminDropdown
              value={stageId}
              options={(taxonomy?.stages || []).map((s) => ({ id: s.id, label: s.title }))}
              onChange={(id) => {
                setStageId(id);
                setModuleId('');
                setLessonId('');
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="All stages"
              noneLabel="All stages"
            />
          </View>
          <View className="flex-1 min-w-[180px]">
            <Text className="text-[11px] font-bold uppercase tracking-[1px] text-slate-400 mb-1">
              Module
            </Text>
            <AdminDropdown
              value={moduleId}
              options={moduleOptions}
              onChange={(id) => {
                setModuleId(id);
                setLessonId('');
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="All modules"
              noneLabel="All modules"
            />
          </View>
          <View className="flex-1 min-w-[180px]">
            <Text className="text-[11px] font-bold uppercase tracking-[1px] text-slate-400 mb-1">
              Lesson
            </Text>
            <AdminDropdown
              value={lessonId}
              options={lessonOptions}
              onChange={(id) => {
                setLessonId(id);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="All lessons"
              noneLabel="All lessons"
            />
          </View>
        </View>
        <Text className="text-slate-400 text-sm mt-3">
          Showing {visible.length} of {filtered.length} matching word
          {filtered.length === 1 ? '' : 's'}
          {lessonId
            ? ` · this lesson teaches ${wordsPerLesson.get(lessonId) || 0} words`
            : ''}
          .
        </Text>
      </View>

      {/* Rows */}
      <View className="gap-2">
        {visible.map((row) => {
          const editing = editingKey === row.word_key;
          return (
            <View
              key={row.word_key}
              className={`bg-white border rounded-2xl p-3 ${
                row.is_enabled ? 'border-inkline' : 'border-inkline opacity-70'
              }`}
            >
              <View className="flex-row items-center gap-3">
                {row.image_url ? (
                  <Image
                    source={{ uri: row.image_url }}
                    style={{ width: 44, height: 44, borderRadius: 10 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{ width: 44, height: 44, borderRadius: 10 }}
                    className="bg-pitch-light items-center justify-center"
                  >
                    <Text style={{ fontSize: 22 }}>{row.emoji || '⭐'}</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="font-sans font-bold text-navy text-base">
                    {row.emoji ? `${row.emoji} ` : ''}
                    {row.word}
                  </Text>
                  <Text className="text-slate-400 text-xs" numberOfLines={1}>
                    {row.example || '(no example sentence)'}
                  </Text>
                  <Text className="text-slate-400 text-[11px]" numberOfLines={1}>
                    {taxonomy ? lessonPathLabel(taxonomy, row.lesson_id) || '' : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void toggleEnabled(row)}
                  disabled={togglingKey === row.word_key}
                  className={`px-3.5 py-2 rounded-full border ${
                    row.is_enabled ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-100 border-slate-300'
                  }`}
                >
                  <Text className={`text-xs font-bold ${row.is_enabled ? 'text-white' : 'text-slate-500'}`}>
                    {row.is_enabled ? 'On' : 'Off'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => (editing ? setEditingKey(null) : startEdit(row))}
                  className="px-3.5 py-2 rounded-full bg-navy"
                >
                  <Text className="text-xs font-bold text-white">{editing ? 'Close' : 'Edit'}</Text>
                </Pressable>
              </View>

              {editing ? (
                <View className="mt-3 pt-3 border-t border-inkline">
                  <Text className="text-[11px] font-bold uppercase tracking-[1px] text-slate-400 mb-1">
                    The word (cannot be changed)
                  </Text>
                  <Text className="font-sans font-bold text-navy mb-1">{row.word}</Text>
                  <Text className="text-slate-400 text-xs mb-3">
                    Recordings are matched by the exact word text, so the word itself stays as
                    the lessons teach it. To retire a word, switch it off instead.
                  </Text>

                  <Text className="text-[11px] font-bold uppercase tracking-[1px] text-slate-400 mb-1">
                    Example sentence
                  </Text>
                  <TextInput
                    value={formExample}
                    onChangeText={setFormExample}
                    placeholder="The example sentence students see and hear"
                    multiline
                    className="bg-canvas border border-inkline rounded-xl px-3 py-2.5 mb-3 font-sans text-sm"
                  />

                  <View className="flex-row gap-3 mb-3">
                    <View style={{ width: 90 }}>
                      <Text className="text-[11px] font-bold uppercase tracking-[1px] text-slate-400 mb-1">
                        Emoji
                      </Text>
                      <TextInput
                        value={formEmoji}
                        onChangeText={setFormEmoji}
                        placeholder="⭐"
                        className="bg-canvas border border-inkline rounded-xl px-3 py-2.5 font-sans text-sm"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[11px] font-bold uppercase tracking-[1px] text-slate-400 mb-1">
                        Picture URL
                      </Text>
                      <TextInput
                        value={formImageUrl}
                        onChangeText={setFormImageUrl}
                        placeholder="https://…"
                        autoCapitalize="none"
                        className="bg-canvas border border-inkline rounded-xl px-3 py-2.5 font-sans text-sm"
                      />
                    </View>
                    {formImageUrl.trim() ? (
                      <Image
                        source={{ uri: formImageUrl.trim() }}
                        style={{ width: 52, height: 52, borderRadius: 10, marginTop: 14 }}
                        resizeMode="cover"
                      />
                    ) : null}
                  </View>

                  <View className="flex-row items-center gap-3 mb-4">
                    <Pressable
                      onPress={() => setFormEnabled((v) => !v)}
                      className={`px-3.5 py-2 rounded-full border ${
                        formEnabled ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-100 border-slate-300'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${formEnabled ? 'text-white' : 'text-slate-500'}`}>
                        {formEnabled ? 'On' : 'Off'}
                      </Text>
                    </Pressable>
                    <Text className="text-slate-500 text-sm flex-1">
                      Switched on, this word joins students&rsquo; banks, reviews and books.
                    </Text>
                  </View>

                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={() => void saveEdit(row)}
                      disabled={saving}
                      className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full"
                    >
                      <Text className="text-navy font-bold">{saving ? 'Saving…' : 'Save changes'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setEditingKey(null)}
                      className="px-6 py-3 bg-white border border-inkline rounded-full"
                    >
                      <Text className="font-bold text-slate-600">Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <View className="py-12 items-center">
          <Text className="text-slate-400">No words match these filters.</Text>
        </View>
      ) : visibleCount < filtered.length ? (
        <Pressable
          onPress={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="self-center mt-5 px-8 py-3.5 bg-white border border-inkline rounded-full"
        >
          <Text className="font-bold text-navy">
            Show more ({filtered.length - visibleCount} remaining)
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
