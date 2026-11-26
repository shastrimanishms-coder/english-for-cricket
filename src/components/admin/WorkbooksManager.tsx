import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { contentTypeForFileName } from '../../lib/fileTypes';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';
import CategoryMultiSelect from './CategoryMultiSelect';
import ContentTagging from './ContentTagging';
import GroupedContentList from './GroupedContentList';
import { fetchTaxonomy, type Taxonomy } from '../../lib/curriculumTaxonomy';
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

// Round 89 (Part E): the dedicated Workbooks manager. Workbook-engine
// games live ONLY here - the Games manager no longer lists, counts or
// files them at all. Two families share the games table:
//   - Learning Path workbooks (stage/module/lesson tagged rows)
//   - Textbook workbooks (data.source === 'textbook', Book/Part in
//     the payload)
// Categories come from the 'workbooks' tree only (Round 88/39), with
// the Round 85 membership model (join table + primary sync).
// There is deliberately NO visual page editor: new workbooks arrive
// through the JSON import at the bottom of this screen.

interface WorkbookGame {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  lesson_id?: string | null;
  stage_id?: string | null;
  module_id?: string | null;
  engine?: string | null;
  data?: any;
  thumbnail_url: string | null;
  is_published?: boolean | null;
}

const FAMILIES = [
  { id: 'lp', title: 'Learning Path' },
  { id: 'tb', title: 'Textbook' },
];

const isTextbook = (g: WorkbookGame) => g.data?.source === 'textbook';
const familyIdOf = (g: WorkbookGame) => (isTextbook(g) ? 'tb' : 'lp');
const secondaryIdOf = (g: WorkbookGame) =>
  isTextbook(g) ? `book-${g.data?.book ?? 0}` : (g.stage_id ?? null);

/**
 * Validate an imported workbook payload file. Accepts either a bare
 * workbook payload ({ pages: [...] }) or a game-row-shaped object
 * carrying one under "data". Returns plain-language errors - the
 * first few problems found - or the payload + title to create.
 */
export function validateWorkbookImport(text: string): {
  errors: string[];
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  payload?: any;
} {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { errors: ['The file is not valid JSON.'] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { errors: ['The file must contain a JSON object.'] };
  }
  const payload =
    parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
      ? parsed.data
      : parsed;
  const errors: string[] = [];
  if (!Array.isArray(payload.pages) || payload.pages.length === 0) {
    errors.push('The workbook payload needs a "pages" array with at least one page.');
  } else {
    payload.pages.forEach((page: any, i: number) => {
      if (!page || typeof page !== 'object' || Array.isArray(page)) {
        errors.push(`Page ${i + 1} is not an object.`);
      } else if (!Array.isArray(page.activities)) {
        errors.push(`Page ${i + 1} has no "activities" array.`);
      }
    });
  }
  if (errors.length > 0) return { errors: errors.slice(0, 6) };
  const title =
    (typeof parsed.title === 'string' && parsed.title.trim()) ||
    (typeof payload.title === 'string' && payload.title.trim()) ||
    'Imported Workbook';
  return {
    errors: [],
    title,
    description: typeof parsed.description === 'string' ? parsed.description : '',
    thumbnailUrl: typeof parsed.thumbnail_url === 'string' ? parsed.thumbnail_url : '',
    payload,
  };
}

export default function WorkbooksManager() {
  const [workbooks, setWorkbooks] = useState<WorkbookGame[]>([]);
  const [wbCategories, setWbCategories] = useState<CategoryNode[]>([]);
  const [memberships, setMemberships] = useState<Record<string, string[]>>({});
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [isPublished, setIsPublished] = useState(true);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [moduleId, setModuleId] = useState<string | null>(null);

  // Import state
  const [importAsset, setImportAsset] = useState<any>(null);
  const [importPublish, setImportPublish] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importMessage, setImportMessage] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const wbData = await fetchCategoriesForType('workbooks');
      setWbCategories(wbData);
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('engine', 'workbook')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as WorkbookGame[];
      setWorkbooks(rows);
      const map = await fetchMembershipMap('workbooks', rows, wbData);
      setMemberships(Object.fromEntries(map));
    } catch (error: any) {
      showAlert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setTaxonomy(await fetchTaxonomy());
      await fetchData();
    })();
  }, [fetchData]);

  const categoryIdsFor = (g: WorkbookGame): string[] =>
    memberships[g.id] ?? (g.category_id ? [g.category_id] : []);
  const editingGame = editId ? workbooks.find((g) => g.id === editId) : undefined;
  const editingIsTextbook = editingGame ? isTextbook(editingGame) : false;

  const pickImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0]);
      }
    } catch (error) {
      console.log('Error picking image:', error);
    }
  };

  const uploadImageToSupabase = async (file: any) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `thumb_${Date.now()}.${fileExt}`;
    let fileBody;
    if (Platform.OS === 'web') {
      const res = await fetch(file.uri);
      fileBody = await res.blob();
    } else {
      fileBody = {
        uri: file.uri,
        type: file.mimeType || 'application/octet-stream',
        name: file.name,
      } as any;
    }
    const { error: uploadError } = await supabase.storage
      .from('games')
      .upload(fileName, fileBody, {
        contentType: contentTypeForFileName(file.name, file.mimeType),
      });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('games').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleEdit = (g: WorkbookGame) => {
    setEditId(g.id);
    setTitle(g.title);
    setDescription(g.description || '');
    setThumbnailUrl(g.thumbnail_url || '');
    setSelectedImage(null);
    setIsPublished(g.is_published !== false);
    setCategoryIds(categoryIdsFor(g));
    setLessonId(g.lesson_id ?? null);
    setStageId(g.stage_id ?? null);
    setModuleId(g.module_id ?? null);
  };

  const cancelEdit = () => {
    setEditId(null);
    setTitle('');
    setDescription('');
    setThumbnailUrl('');
    setSelectedImage(null);
    setIsPublished(true);
    setCategoryIds([]);
    setLessonId(null);
    setStageId(null);
    setModuleId(null);
  };

  const handleSave = async () => {
    if (!editId) return;
    if (!title.trim()) {
      showAlert('Missing Fields', 'A title is required.');
      return;
    }
    setSaving(true);
    try {
      let finalThumbUrl = thumbnailUrl;
      if (selectedImage) {
        finalThumbUrl = await uploadImageToSupabase(selectedImage);
      }
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        thumbnail_url: finalThumbUrl,
        is_published: isPublished,
        // Legacy column keeps the PRIMARY workbooks category.
        category_id: primaryCategoryId(categoryIds, wbCategories),
      };
      // The family tags the form can safely carry: stage/module/
      // lesson belong to Learning Path workbooks. A textbook
      // workbook's Book/Part live inside its payload and are not
      // edited here.
      if (!editingIsTextbook) {
        payload.stage_id = stageId;
        payload.module_id = moduleId;
        payload.lesson_id = lessonId;
      }
      const { error } = await supabase.from('games').update(payload).eq('id', editId);
      if (error) throw error;
      await setItemCategories('workbooks', editId, categoryIds, wbCategories);
      cancelEdit();
      await fetchData();
    } catch (error: any) {
      showAlert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (g: WorkbookGame) => {
    try {
      const { error } = await supabase
        .from('games')
        .update({ is_published: g.is_published === false })
        .eq('id', g.id);
      if (error) throw error;
      await fetchData();
    } catch (error: any) {
      showAlert('Update Failed', error.message);
    }
  };

  const handleDelete = (g: WorkbookGame) => {
    const executeDelete = async () => {
      try {
        const { error } = await supabase.from('games').delete().eq('id', g.id);
        if (error) throw error;
        if (editId === g.id) cancelEdit();
        await fetchData();
      } catch (error: any) {
        showAlert('Delete Failed', error.message);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete workbook "${g.title}"? This cannot be undone.`)) {
        void executeDelete();
      }
    } else {
      Alert.alert('Delete Workbook', `Delete "${g.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void executeDelete() },
      ]);
    }
  };

  const pickImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImportAsset(result.assets[0]);
        setImportErrors([]);
        setImportMessage('');
      }
    } catch (error) {
      console.log('Error picking import file:', error);
    }
  };

  const runImport = async () => {
    if (!importAsset || importing) return;
    setImporting(true);
    setImportErrors([]);
    setImportMessage('');
    try {
      const res = await fetch(importAsset.uri);
      const text = await res.text();
      const check = validateWorkbookImport(text);
      if (check.errors.length > 0 || !check.payload) {
        setImportErrors(
          check.errors.length > 0 ? check.errors : ['The file could not be read as a workbook.'],
        );
        return;
      }
      const { data, error } = await supabase
        .from('games')
        .insert([
          {
            title: check.title,
            description: check.description || '',
            engine: 'workbook',
            data: check.payload,
            game_url: '',
            thumbnail_url: check.thumbnailUrl || '',
            is_published: importPublish,
            category_id: null,
          },
        ])
        .select('id')
        .single();
      if (error) throw error;
      void data;
      setImportMessage(
        `Imported "${check.title}" as a ${importPublish ? 'published' : 'draft'} workbook. Find it in the list below to tag or edit it.`,
      );
      setImportAsset(null);
      await fetchData();
    } catch (error: any) {
      setImportErrors([`Import failed: ${error.message || 'unknown error'}`]);
    } finally {
      setImporting(false);
    }
  };

  const flatWbCategories = flattenCategoryTree(wbCategories).map(({ cat }) => ({
    id: cat.id,
    name: cat.name,
  }));
  const secondaryGroups = [
    ...(taxonomy?.stages || []).map((s) => ({ id: s.id, name: s.title })),
    ...[1, 2, 3, 4, 5].map((n) => ({ id: `book-${n}`, name: `Book ${n}` })),
  ];
  const stageName = (id?: string | null) =>
    taxonomy?.stages.find((s) => s.id === id)?.title || '';
  const moduleName = (id?: string | null) =>
    taxonomy?.modules.find((m) => m.id === id)?.title || '';

  return (
    <View className="space-y-8 gap-8">
      <View>
        <Text className="font-display text-3xl font-semibold text-navy">Workbooks CMS</Text>
        <Text className="text-sm text-slate-500 mt-1">
          Every workbook in the app — Learning Path and Textbook — is managed here, and only here.
          The Games manager no longer includes workbooks.
        </Text>
      </View>

      {/* Edit form (shown while editing) */}
      {editId ? (
        <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
          <Text className="font-display text-xl font-semibold text-navy">Edit Workbook</Text>

          <View>
            <Text className="text-sm font-semibold text-text-secondary mb-2">Workbook Title</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="e.g., Lesson 1 — Hello!"
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View>
            <Text className="text-sm font-semibold text-text-secondary mb-2">Short Description</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="What learners practise in this workbook…"
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View className="border-t border-inkline pt-4">
            {editingIsTextbook ? (
              <View>
                <Text className="text-sm font-semibold text-text-secondary mb-2">Workbooks Categories</Text>
                <CategoryMultiSelect
                  categories={wbCategories}
                  selectedIds={categoryIds}
                  onChange={setCategoryIds}
                />
                <Text className="text-xs text-slate-400 mt-2">
                  This is a Textbook workbook — its Book and Part live inside its payload and are
                  not edited here.
                </Text>
              </View>
            ) : (
              <ContentTagging
                categories={wbCategories}
                categoryIds={categoryIds}
                onCategoryIds={setCategoryIds}
                stageId={stageId}
                onStageId={setStageId}
                moduleId={moduleId}
                onModuleId={setModuleId}
                lessonId={lessonId}
                onLessonId={setLessonId}
              />
            )}
          </View>

          <View className="flex-col md:flex-row gap-6 border-t border-inkline pt-6">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Cover Thumbnail</Text>
              <View className="flex-row items-center gap-4">
                <Pressable onPress={pickImage} className="px-4 py-3 bg-navy rounded-full">
                  <Text className="text-white font-bold text-sm">Upload Image</Text>
                </Pressable>
                <View>
                  {selectedImage ? (
                    <Text className="text-pitch font-semibold text-xs" numberOfLines={1}>{selectedImage.name}</Text>
                  ) : thumbnailUrl ? (
                    <Image source={{ uri: thumbnailUrl }} className="w-12 h-12 rounded-md border border-inkline" />
                  ) : (
                    <Text className="text-slate-400 text-xs">No thumbnail</Text>
                  )}
                </View>
              </View>
              <TextInput
                className="w-full bg-canvas p-3 rounded-xl border border-inkline mt-3"
                placeholder="…or paste a thumbnail URL"
                value={thumbnailUrl}
                onChangeText={setThumbnailUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Publish State</Text>
              <Pressable
                onPress={() => setIsPublished((v) => !v)}
                className={`self-start px-4 py-2.5 rounded-full border ${isPublished ? 'bg-pitch-light border-pitch/30' : 'bg-slate-100 border-inkline'}`}
              >
                <Text className={`text-sm font-semibold ${isPublished ? 'text-pitch-dark' : 'text-slate-500'}`}>
                  {isPublished ? 'Published — learners can see it' : 'Hidden — draft'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="flex-row justify-end gap-4 mt-2 border-t border-inkline pt-4">
            <View className="w-24">
              <AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" />
            </View>
            <View className="w-48">
              <AnimatedButton
                title={saving ? 'Saving...' : 'Save Workbook'}
                onPress={handleSave}
                disabled={saving}
                variant="primary"
                size="sm"
              />
            </View>
          </View>
        </View>
      ) : null}

      {/* List: search + Family -> Stage/Book collapsible groups */}
      {loading ? (
        <View className="bg-white rounded-2xl border border-inkline shadow-sm p-8 items-center">
          <ActivityIndicator size="large" color="#0A192F" />
        </View>
      ) : (
        <GroupedContentList
          items={workbooks}
          stages={FAMILIES}
          categories={flatWbCategories}
          bulkCategories={flatWbCategories}
          secondaryGroups={secondaryGroups}
          secondaryIdOf={secondaryIdOf}
          idOf={(g) => g.id}
          stageIdOf={(g) => familyIdOf(g)}
          categoryIdOf={(g) => g.category_id ?? null}
          categoryIdsOf={(g) => categoryIdsFor(g)}
          titleOf={(g) => g.title}
          descriptionOf={(g) => g.description}
          itemNoun="workbooks"
          searchPlaceholder="Search workbooks by title…"
          emptyMessage="No workbooks yet — import one below."
          bulkAssign={{
            onAssign: async (ids, categoryId) => {
              const res = await bulkAddCategory('workbooks', ids, categoryId, workbooks, wbCategories);
              await fetchData();
              return res.message;
            },
            onRemove: async (ids, categoryId) => {
              const res = await bulkRemoveCategory('workbooks', ids, categoryId, workbooks, wbCategories);
              await fetchData();
              return res.message;
            },
          }}
          renderItem={(g, isLast) => {
            const catName =
              categoryIdsFor(g)
                .map((id) => wbCategories.find((c) => c.id === id)?.name)
                .filter(Boolean)
                .join(' · ') || 'No category';
            const tagLine = isTextbook(g)
              ? `Book ${g.data?.book ?? '?'}${g.data?.code ? ` · ${g.data.code}` : ''}`
              : [stageName(g.stage_id), moduleName(g.module_id)].filter(Boolean).join(' · ');
            const published = g.is_published !== false;
            return (
              <View
                key={g.id}
                className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${isLast ? '' : 'border-b border-inkline'}`}
              >
                <View className="flex-row items-center gap-4 flex-1">
                  {g.thumbnail_url ? (
                    <Image source={{ uri: g.thumbnail_url }} className="w-12 h-12 rounded-lg bg-slate-100" />
                  ) : (
                    <View className="w-12 h-12 rounded-lg bg-slate-100 items-center justify-center">
                      <Text className="text-xl">📗</Text>
                    </View>
                  )}
                  <View>
                    <Text className="font-bold text-text-primary text-base">{g.title}</Text>
                    <Text className="text-pitch text-xs font-bold uppercase tracking-wider mt-1">
                      {catName}
                    </Text>
                    {tagLine ? <Text className="text-slate-400 text-xs mt-0.5">{tagLine}</Text> : null}
                  </View>
                </View>

                <View className="flex-row gap-3 items-center">
                  <View className={`px-2 py-0.5 rounded-md ${published ? 'bg-pitch-light' : 'bg-amber-50'}`}>
                    <Text className={`text-[11px] font-bold uppercase ${published ? 'text-pitch-dark' : 'text-amber-600'}`}>
                      {published ? 'Live' : 'Hidden'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => togglePublish(g)}
                    className="px-3 py-1.5 bg-canvas rounded-full border border-inkline"
                  >
                    <Text className="text-navy text-sm font-semibold">{published ? 'Hide' : 'Publish'}</Text>
                  </Pressable>
                  <Pressable onPress={() => handleEdit(g)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                    <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(g)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                    <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Import a workbook payload (the creation path - no page editor) */}
      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-4 gap-4">
        <Text className="font-display text-xl font-semibold text-navy">Import a Workbook</Text>
        <Text className="text-sm text-slate-500">
          Upload a workbook payload JSON file — either the payload itself
          ({'{ "pages": [ { "activities": [...] } ] }'}) or an object carrying it under
          &quot;data&quot; (with optional &quot;title&quot;, &quot;description&quot; and
          &quot;thumbnail_url&quot;). The file is checked before anything is created, and
          problems are reported in plain language. New workbooks are tagged and categorised
          afterwards from the list above.
        </Text>
        <View className="flex-row items-center gap-4 flex-wrap">
          <Pressable onPress={pickImportFile} className="px-4 py-3 bg-navy rounded-full">
            <Text className="text-white font-bold text-sm">Choose JSON File</Text>
          </Pressable>
          {importAsset ? (
            <Text className="text-pitch font-semibold text-xs" numberOfLines={1}>
              Selected: {importAsset.name}
            </Text>
          ) : (
            <Text className="text-slate-400 text-xs">No file selected</Text>
          )}
          <Pressable
            onPress={() => setImportPublish((v) => !v)}
            className={`px-4 py-2.5 rounded-full border ${importPublish ? 'bg-pitch-light border-pitch/30' : 'bg-slate-100 border-inkline'}`}
          >
            <Text className={`text-sm font-semibold ${importPublish ? 'text-pitch-dark' : 'text-slate-500'}`}>
              {importPublish ? 'Publish immediately' : 'Create as draft'}
            </Text>
          </Pressable>
          <View className="w-48">
            <AnimatedButton
              title={importing ? 'Importing...' : 'Import Workbook'}
              onPress={runImport}
              disabled={!importAsset || importing}
              variant="primary"
              size="sm"
            />
          </View>
        </View>
        {importErrors.length > 0 ? (
          <View className="bg-red-50 border border-red-100 rounded-xl p-4">
            {importErrors.map((e, i) => (
              <Text key={i} className="text-red-600 text-sm font-semibold">• {e}</Text>
            ))}
          </View>
        ) : null}
        {importMessage ? (
          <View className="bg-pitch-light border border-pitch/30 rounded-xl p-4">
            <Text className="text-pitch-dark text-sm font-semibold">{importMessage}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
