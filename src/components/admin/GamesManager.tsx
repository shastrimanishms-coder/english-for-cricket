import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform, ScrollView, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  GAMES_EXAMPLE,
  GAMES_FORMAT_LINES,
  validateGamesPackage,
  type GamePkg,
} from '../../lib/contentPackages';
import { contentTypeForFileName } from '../../lib/fileTypes';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';
import AdminDropdown from './AdminDropdown';
import ContentTagging from './ContentTagging';
import ContentUploadDoor from './ContentUploadDoor';
import GroupedContentList from './GroupedContentList';
import BuiltinGame from '../games/BuiltinGame';
import { fetchTaxonomy, type Taxonomy } from '../../lib/curriculumTaxonomy';
import { useLessonTagging } from '../../lib/useLessonTagging';
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

type Category = CategoryNode;

interface Game {
  id: string;
  title: string;
  description: string;
  category_id: string | null;
  lesson_id?: string | null;
  stage_id?: string | null;
  module_id?: string | null;
  engine?: string | null;
  data?: any;
  game_url: string;
  thumbnail_url: string;
}

export default function GamesManager() {
  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // Round 89 (Part E): workbook-engine games are OUT of this manager
  // entirely - they live in the dedicated Workbooks manager. This
  // manager only ever sees ordinary games and the 'games' tree.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Round 85: an item can belong to up to 5 categories at once.
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  // Item id -> its category ids in display order (Round 85).
  const [memberships, setMemberships] = useState<Record<string, string[]>>({});
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const taggingAvailable = useLessonTagging('games');
  const [stageTagging, setStageTagging] = useState(false);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [previewGame, setPreviewGame] = useState<Game | null>(null);
  // List filters (dropdowns, Round 42)
  const [fCategory, setFCategory] = useState('');
  const [fStage, setFStage] = useState('');
  const [fModule, setFModule] = useState('');

  useEffect(() => {
    (async () => {
      const { error } = await supabase.from('games').select('stage_id').limit(1);
      setStageTagging(!error);
      setTaxonomy(await fetchTaxonomy());
    })();
  }, []);
  
  const [gameUrl, setGameUrl] = useState('');
  const [selectedGameFile, setSelectedGameFile] = useState<any>(null);

  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const catData = await fetchCategoriesForType('games');
      setCategories(catData);

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false });

      if (gameError) throw gameError;
      // Workbook-engine rows are excluded client-side (a SQL
      // .neq('engine', 'workbook') would also drop the NULL-engine
      // uploaded games, which DO belong here).
      const rows = ((gameData || []) as Game[]).filter((g) => g.engine !== 'workbook');
      setGames(rows);
      const gamesMap = await fetchMembershipMap('games', rows, catData);
      setMemberships(Object.fromEntries(gamesMap));
    } catch (error: any) {
      showAlert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const categoryIdsFor = (game: Game): string[] =>
    memberships[game.id] ?? (game.category_id ? [game.category_id] : []);

  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

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

  const pickGameFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/html', 'application/zip'], // Accept HTML or ZIP
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedGameFile(result.assets[0]);
      }
    } catch (error) {
      console.log('Error picking game file:', error);
    }
  };

  const uploadFileToSupabase = async (file: any, prefix: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${prefix}_${Date.now()}.${fileExt}`;
    
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
        contentType: contentTypeForFileName(file.name, file.mimeType)
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('games').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const editingGame = editId ? games.find((g) => g.id === editId) : undefined;
  const isBuiltinEdit = !!editingGame?.engine;
  const formCategories = categories;

  const handleSave = async () => {
    if (!title.trim()) {
      showAlert('Missing Fields', 'A title is required.');
      return;
    }
    // Built-in games play from their data - they have no file and must
    // never be blocked by the file requirement (Round 42 fix).
    if (!isBuiltinEdit && !gameUrl && !selectedGameFile) {
      showAlert('Missing File', 'Please upload the Game File (HTML/ZIP).');
      return;
    }

    setSaving(true);
    try {
      let finalThumbUrl = thumbnailUrl;
      let finalGameUrl = gameUrl;

      // Upload Game File if new one selected
      if (selectedGameFile) {
        finalGameUrl = await uploadFileToSupabase(selectedGameFile, 'game');
      }

      // Upload Thumbnail if new one selected
      if (selectedImage) {
        finalThumbUrl = await uploadFileToSupabase(selectedImage, 'thumb');
      }

      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        // Legacy column keeps the PRIMARY category (first in display
        // order) within the games tree.
        category_id: primaryCategoryId(categoryIds, categories),
        ...(taggingAvailable ? { lesson_id: lessonId } : {}),
        ...(stageTagging ? { stage_id: stageId, module_id: moduleId } : {}),
        game_url: finalGameUrl,
        thumbnail_url: finalThumbUrl,
      };
      let savedId = editId;
      if (editId) {
        const { error } = await supabase.from('games').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('games')
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        savedId = (data as { id: string }).id;
      }
      // Round 85: write the full membership set (join table + primary
      // sync) under the games tree.
      if (savedId) {
        await setItemCategories('games', savedId, categoryIds, categories);
      }

      cancelEdit();
      await fetchData();
    } catch (error: any) {
      showAlert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (game: Game) => {
    setEditId(game.id);
    setTitle(game.title);
    setDescription(game.description || '');
    setCategoryIds(categoryIdsFor(game));
    setLessonId(game.lesson_id ?? null);
    setStageId(game.stage_id ?? null);
    setModuleId(game.module_id ?? null);
    setGameUrl(game.game_url);
    setThumbnailUrl(game.thumbnail_url || '');
    setSelectedImage(null);
    setSelectedGameFile(null);
  };

  const handleDelete = async (id: string, gameTitle: string, currentThumbUrl: string, currentGameUrl: string) => {
    const confirmDelete = () => executeDelete(id, currentThumbUrl, currentGameUrl);

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete game "${gameTitle}"? This removes the files from storage too.`)) confirmDelete();
    } else {
      Alert.alert('Delete Game', `Delete "${gameTitle}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDelete = async (id: string, currentThumbUrl: string, currentGameUrl: string) => {
    try {
      const { error: dbError } = await supabase.from('games').delete().eq('id', id);
      if (dbError) throw dbError;

      const filesToDelete = [];
      
      if (currentThumbUrl) {
        const urlParts = currentThumbUrl.split('/');
        filesToDelete.push(urlParts[urlParts.length - 1]);
      }
      if (currentGameUrl) {
        const urlParts = currentGameUrl.split('/');
        filesToDelete.push(urlParts[urlParts.length - 1]);
      }

      if (filesToDelete.length > 0) {
        await supabase.storage.from('games').remove(filesToDelete);
      }

      await fetchData();
    } catch (error: any) {
      showAlert('Delete Failed', error.message);
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setTitle('');
    setDescription('');
    setGameUrl('');
    setThumbnailUrl('');
    setSelectedImage(null);
    setSelectedGameFile(null);
    setLessonId(null);
    setStageId(null);
    setModuleId(null);
    setCategoryIds([]);
  };

  // ------------------------------------------------------------------
  // Round 97: upload door. New built-in games arrive as packages;
  // the form below is now edit-only. Workbook-engine games stay out
  // of this door entirely (validator rejects them by name).
  // ------------------------------------------------------------------
  interface ResolvedGame extends GamePkg {
    resolvedStageId: string | null;
    resolvedModuleId: string | null;
    resolvedCategoryIds: string[];
    existingId: string | null;
  }

  const resolveGames = (items: GamePkg[]) => {
    const errors: string[] = [];
    const flatCats = flattenCategoryTree(categories);
    const resolved: ResolvedGame[] = items.map((g) => {
      let stageId = g.stage_id;
      if (!stageId && g.stage != null) {
        stageId = taxonomy?.stages.find((st) => st.order_index === g.stage)?.id ?? null;
        if (!stageId) errors.push(`"${g.title}": stage ${g.stage} was not found.`);
      }
      let moduleId: string | null = null;
      if (g.module != null) {
        if (!stageId) {
          errors.push(`"${g.title}": module ${g.module} needs its stage.`);
        } else {
          moduleId =
            taxonomy?.modules.find(
              (m) => m.stage_id === stageId && m.order_index % 100 === g.module
            )?.id ?? null;
          if (!moduleId) errors.push(`"${g.title}": module ${g.module} was not found in stage ${g.stage}.`);
        }
      }
      const catIds: string[] = [];
      for (const name of g.categories) {
        const hit = flatCats.find(({ cat }) => cat.name.trim().toLowerCase() === name.toLowerCase());
        if (!hit) {
          errors.push(`"${g.title}": category "${name}" does not exist in the Games tree - create it in the Categories Manager first.`);
        } else {
          catIds.push(hit.cat.id);
        }
      }
      const existing = games.find((r) => r.title.trim().toLowerCase() === g.title.toLowerCase());
      return {
        ...g,
        resolvedStageId: stageId,
        resolvedModuleId: moduleId,
        resolvedCategoryIds: catIds,
        existingId: existing?.id ?? null,
      };
    });
    const lines = resolved.map((r) =>
      r.existingId
        ? `Update "${r.title}" (${r.engine}) - replace its details and data.`
        : `Create "${r.title}" (${r.engine}).`
    );
    return { errors, resolved, lines };
  };

  const planGames = async (items: GamePkg[]) => {
    const { errors, lines } = resolveGames(items);
    return { errors, lines };
  };

  const installGames = async (items: GamePkg[]): Promise<string[]> => {
    const { errors, resolved } = resolveGames(items);
    if (errors.length > 0) throw new Error(errors[0]);
    const results: string[] = [];
    for (const r of resolved) {
      const payload: any = {
        title: r.title,
        description: r.description,
        engine: r.engine,
        data: r.data,
        thumbnail_url: r.thumbnail_url,
        game_url: '',
        category_id: primaryCategoryId(r.resolvedCategoryIds, categories),
        ...(taggingAvailable ? { lesson_id: r.lesson_id } : {}),
        ...(stageTagging ? { stage_id: r.resolvedStageId, module_id: r.resolvedModuleId } : {}),
      };
      let id = r.existingId;
      if (id) {
        const { error } = await supabase.from('games').update(payload).eq('id', id);
        if (error) throw error;
        results.push(`Updated "${r.title}".`);
      } else {
        const { data, error } = await supabase.from('games').insert([payload]).select('id').single();
        if (error) throw error;
        id = (data as { id: string }).id;
        results.push(`Created "${r.title}".`);
      }
      await setItemCategories('games', id, r.resolvedCategoryIds, categories);
    }
    await fetchData();
    return results;
  };

  const visibleGames = games.filter((g) => {
    if (fCategory && !categoryIdsFor(g).includes(fCategory)) return false;
    if (fStage && g.stage_id !== fStage) return false;
    if (fModule && g.module_id !== fModule) return false;
    return true;
  });
  const stageName = (id?: string | null) => taxonomy?.stages.find((s) => s.id === id)?.title || '';
  const moduleName = (id?: string | null) => taxonomy?.modules.find((m) => m.id === id)?.title || '';

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="font-display text-3xl font-semibold text-navy">Games & Arcade CMS</Text>
      </View>

      {/* Round 97: new games arrive through the upload door; the
          form below opens only when editing an existing game. */}
      {!editId ? (
        <ContentUploadDoor
          title="📤 Upload a games package"
          blurb="New built-in games are no longer created here - they arrive as one JSON package file (the format the Content Studio will export). Pick a file, check the plan, then install. Workbook games keep their own import in the Workbooks tab. Existing games below can still be edited, categorised and deleted as before."
          formatLines={GAMES_FORMAT_LINES}
          exampleJson={JSON.stringify(GAMES_EXAMPLE, null, 2)}
          exampleFileName="games-package-example.json"
          validate={validateGamesPackage}
          plan={planGames}
          install={installGames}
        />
      ) : null}

      {/* Editor Form (existing games only) */}
      {editId ? (
      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <Text className="font-display text-xl font-semibold text-navy">
          Edit Game Module
        </Text>
        
        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Game Title</Text>
          <TextInput
            className="w-full bg-canvas p-4 rounded-xl border border-inkline"
            placeholder="e.g., Jumping Bird"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View className="border-t border-inkline pt-4">
          <ContentTagging
            categories={formCategories}
            categoryIds={categoryIds}
            onCategoryIds={setCategoryIds}
            stageId={stageId}
            onStageId={setStageId}
            moduleId={moduleId}
            onModuleId={setModuleId}
            lessonId={lessonId}
            onLessonId={setLessonId}
          />
          {categories.length === 0 ? (
            <Text className="text-xs text-slate-400 mt-2">No Games categories yet — create them under Categories and they will appear in the dropdown.</Text>
          ) : null}
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Short Intro / How to Play</Text>
          <TextInput
            className="w-full bg-canvas p-4 rounded-xl border border-inkline"
            placeholder="Briefly describe how to play..."
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View className="flex-col md:flex-row gap-6 border-t border-inkline pt-6">
          {/* Game File Upload - built-in games have no file at all */}
          {isBuiltinEdit ? (
            <View className="flex-1 bg-navy/5 border border-inkline rounded-xl p-4">
              <Text className="text-sm font-bold text-navy">Built-in game — no file needed</Text>
              <Text className="text-xs text-slate-500 mt-1">
                This game plays inside the app from its built-in data (engine: {editingGame?.engine}). There is no file to upload;
                use Play/Test in the list below to try it here.
              </Text>
            </View>
          ) : (
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">1. Upload Game File (.html or .zip)</Text>
            <View className="flex-row items-center gap-4">
              <Pressable
                onPress={pickGameFile}
                className="px-4 py-3 bg-navy rounded-full"
              >
                <Text className="text-white font-bold text-sm">Choose File</Text>
              </Pressable>
              <View className="flex-1">
                {selectedGameFile ? (
                  <Text className="text-pitch font-semibold text-xs" numberOfLines={1}>Selected: {selectedGameFile.name}</Text>
                ) : gameUrl ? (
                  <Text className="text-emerald-600 text-xs font-semibold" numberOfLines={1}>Game file active in storage.</Text>
                ) : (
                  <Text className="text-slate-400 text-xs">No file selected</Text>
                )}
              </View>
            </View>
          </View>
          )}

          {/* Thumbnail Upload */}
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">2. Upload Game Thumbnail</Text>
            <View className="flex-row items-center gap-4">
              <Pressable 
                onPress={pickImage}
                className="px-4 py-3 bg-navy rounded-full"
              >
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
          </View>
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-inkline pt-4">
          {editId && (
            <View className="w-24">
              <AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" />
            </View>
          )}
          <View className="w-48">
            <AnimatedButton
              title={saving ? "Saving..." : "Save Game"}
              onPress={handleSave}
              disabled={saving}
              variant="primary"
              size="sm"
            />
          </View>
        </View>
      </View>
      ) : null}

      {/* Built-in game preview */}
      {previewGame ? (
        <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
          <View className="flex-row items-center justify-between p-4 border-b border-inkline">
            <Text className="font-display text-lg font-semibold text-navy">Testing: {previewGame.title}</Text>
            <Pressable onPress={() => setPreviewGame(null)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
              <Text className="text-text-secondary text-sm font-semibold">Close</Text>
            </Pressable>
          </View>
          <ScrollView className="p-4" style={{ maxHeight: 560 }}>
            <BuiltinGame key={previewGame.id} engine={previewGame.engine || ''} data={previewGame.data} title={previewGame.title} />
          </ScrollView>
        </View>
      ) : null}

      {/* List filters */}
      <View className="flex-col md:flex-row gap-4">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-text-secondary mb-2">Filter by Category</Text>
          <AdminDropdown value={fCategory} onChange={setFCategory} options={[
            ...flattenCategoryTree(categories).map(({ cat, depth }) => ({ id: cat.id, label: `${'↳ '.repeat(depth)}${cat.name}` })),
          ]} placeholder="All categories" noneLabel="All categories" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-text-secondary mb-2">Filter by Stage</Text>
          <AdminDropdown
            value={fStage}
            onChange={(id) => { setFStage(id); setFModule(''); }}
            options={(taxonomy?.stages || []).map((s) => ({ id: s.id, label: s.title }))}
            placeholder="All stages"
            noneLabel="All stages"
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-text-secondary mb-2">Filter by Module</Text>
          <AdminDropdown
            value={fModule}
            onChange={setFModule}
            options={(taxonomy?.modules || []).filter((m) => !fStage || m.stage_id === fStage).map((m) => ({ id: m.id, label: m.title }))}
            placeholder="All modules"
            noneLabel="All modules"
          />
        </View>
      </View>

      {/* List: search + Stage -> Category collapsible groups (Round 76) */}
      {loading ? (
        <View className="bg-white rounded-2xl border border-inkline shadow-sm p-8 items-center">
          <ActivityIndicator size="large" color="#0A192F" />
        </View>
      ) : (
        <GroupedContentList
          items={visibleGames}
          stages={(taxonomy?.stages || []).map((s) => ({ id: s.id, title: s.title }))}
          categories={[
            ...flattenCategoryTree(categories).map(({ cat }) => ({ id: cat.id, name: cat.name })),
          ]}
          idOf={(g) => g.id}
          stageIdOf={(g) => g.stage_id ?? null}
          categoryIdOf={(g) => g.category_id ?? null}
          categoryIdsOf={(g) => categoryIdsFor(g)}
          titleOf={(g) => g.title}
          descriptionOf={(g) => g.description}
          itemNoun="games"
          searchPlaceholder="Search games by title…"
          emptyMessage={games.length === 0 ? 'No games added yet.' : 'No games match these filters.'}
          bulkAssign={{
            // Games tree only (Round 89 Part E): workbook games are
            // managed, and bulk-filed, in the Workbooks manager.
            onAssign: async (ids, categoryId) => {
              const res = await bulkAddCategory('games', ids, categoryId, games, categories);
              await fetchData();
              return res.message;
            },
            onRemove: async (ids, categoryId) => {
              const res = await bulkRemoveCategory('games', ids, categoryId, games, categories);
              await fetchData();
              return res.message;
            },
          }}
          renderItem={(game, isLast) => {
            const catName =
              categoryIdsFor(game)
                .map((id) => categories.find((c) => c.id === id)?.name)
                .filter(Boolean)
                .join(' · ') || 'No category';
            const tagLine = [stageName(game.stage_id), moduleName(game.module_id)].filter(Boolean).join(' · ');
            return (
              <View
                key={game.id}
                className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${isLast ? '' : 'border-b border-inkline'}`}
              >
                <View className="flex-row items-center gap-4 flex-1">
                  {game.thumbnail_url ? (
                    <Image source={{ uri: game.thumbnail_url }} className="w-12 h-12 rounded-lg bg-slate-100" />
                  ) : (
                    <View className="w-12 h-12 rounded-lg bg-slate-100 items-center justify-center">
                      <Text className="text-xl">🎮</Text>
                    </View>
                  )}
                  <View>
                    <Text className="font-bold text-text-primary text-base">{game.title}</Text>
                    <Text className="text-pitch text-xs font-bold uppercase tracking-wider mt-1">
                      {catName}{game.engine ? ' · Built-in' : ''}
                    </Text>
                    {tagLine ? <Text className="text-slate-400 text-xs mt-0.5">{tagLine}</Text> : null}
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <Pressable onPress={() => {
                    if (game.engine) {
                      setPreviewGame(game);
                    } else if (Platform.OS === 'web' && game.game_url) {
                      window.open(game.game_url, '_blank');
                    } else {
                      showAlert('No File', 'This game has no file and is not a built-in game.');
                    }
                  }} className="px-3 py-1.5 bg-canvas rounded-full border border-inkline">
                    <Text className="text-navy text-sm font-semibold">Play/Test</Text>
                  </Pressable>
                  <Pressable onPress={() => handleEdit(game)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                    <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(game.id, game.title, game.thumbnail_url, game.game_url)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                    <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}