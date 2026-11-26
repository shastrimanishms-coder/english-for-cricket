import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { fetchTaxonomy, type Taxonomy } from '../../lib/curriculumTaxonomy';
import { contentTypeForFileName } from '../../lib/fileTypes';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';
import BelongsToPicker from './BelongsToPicker';
import CategoryMultiSelect from './CategoryMultiSelect';
import GroupedContentList from './GroupedContentList';
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

interface Video {
  id: string;
  title: string;
  description: string;
  category_id: string;
  lesson_id?: string | null;
  video_url: string;
  thumbnail_url: string;
  is_published: boolean;
}

export default function VideosManager() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Taxonomy for the grouped list (Round 76): videos have no stage
  // column of their own, so a video's stage is the stage of the
  // lesson it belongs to (untagged videos are Untagged).
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);

  useEffect(() => {
    (async () => {
      setTaxonomy(await fetchTaxonomy());
    })();
  }, []);

  const stageIdForVideo = (vid: Video): string | null => {
    if (!vid.lesson_id || !taxonomy) return null;
    const lesson = taxonomy.lessons.find((l) => l.id === vid.lesson_id);
    const mod = lesson ? taxonomy.modules.find((m) => m.id === lesson.module_id) : undefined;
    return mod?.stage_id ?? null;
  };
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Round 85: up to 5 categories per video (at least one required).
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  // Item id -> its category ids in display order (Round 85).
  const [memberships, setMemberships] = useState<Record<string, string[]>>({});
  const [lessonId, setLessonId] = useState<string | null>(null);
  const taggingAvailable = useLessonTagging('video_lectures');
  
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedVideoFile, setSelectedVideoFile] = useState<any>(null);

  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [isPublished, setIsPublished] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const catData = await fetchCategoriesForType('videos');
      setCategories(catData);

      // The learner gallery/player read from `video_lectures` (and
      // filter on is_published), so the CMS writes there too. Uploaded
      // files still live in the 'videos' storage bucket - only the
      // table changed.
      const { data: vidData, error: vidError } = await supabase
        .from('video_lectures')
        .select('*')
        .order('created_at', { ascending: false });

      if (vidError) throw vidError;
      const rows = (vidData || []) as Video[];
      setVideos(rows);
      const map = await fetchMembershipMap('videos', rows, catData);
      setMemberships(Object.fromEntries(map));
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const categoryIdsFor = (vid: Video): string[] =>
    memberships[vid.id] ?? (vid.category_id ? [vid.category_id] : []);

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

  const pickVideoFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*', // Accept MP4 and other video formats
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedVideoFile(result.assets[0]);
      }
    } catch (error) {
      console.log('Error picking video file:', error);
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
      .from('videos')
      .upload(fileName, fileBody, {
        contentType: contentTypeForFileName(file.name, file.mimeType)
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('videos').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!title.trim() || categoryIds.length === 0) {
      Alert.alert('Missing Fields', 'Title and at least one Category are required.');
      return;
    }
    if (!videoUrl.trim() && !selectedVideoFile) {
      Alert.alert('Missing File', 'Please upload a Video File or paste an external URL.');
      return;
    }

    setSaving(true);
    try {
      let finalThumbUrl = thumbnailUrl;
      let finalVideoUrl = videoUrl.trim();

      if (selectedVideoFile) {
        finalVideoUrl = await uploadFileToSupabase(selectedVideoFile, 'vid');
      }

      if (selectedImage) {
        finalThumbUrl = await uploadFileToSupabase(selectedImage, 'thumb');
      }

      const primary = primaryCategoryId(categoryIds, categories);
      let savedId = editId;
      if (editId) {
        const { error } = await supabase
          .from('video_lectures')
          .update({
            title: title.trim(),
            description: description.trim(),
            category_id: primary,
            ...(taggingAvailable ? { lesson_id: lessonId } : {}),
            video_url: finalVideoUrl,
            thumbnail_url: finalThumbUrl,
            is_published: isPublished
          })
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('video_lectures')
          .insert([{
            title: title.trim(),
            description: description.trim(),
            category_id: primary,
            ...(taggingAvailable ? { lesson_id: lessonId } : {}),
            video_url: finalVideoUrl,
            thumbnail_url: finalThumbUrl,
            is_published: isPublished
          }])
          .select('id')
          .single();
        if (error) throw error;
        savedId = (data as { id: string }).id;
      }
      // Round 85: write the full membership set (join table + primary sync).
      if (savedId) await setItemCategories('videos', savedId, categoryIds, categories);

      cancelEdit();
      await fetchData();
    } catch (error: any) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (vid: Video) => {
    setEditId(vid.id);
    setTitle(vid.title);
    setDescription(vid.description || '');
    setCategoryIds(categoryIdsFor(vid));
    setLessonId(vid.lesson_id ?? null);
    setVideoUrl(vid.video_url);
    setThumbnailUrl(vid.thumbnail_url || '');
    setIsPublished(vid.is_published !== false);
    setSelectedImage(null);
    setSelectedVideoFile(null);
  };

  const togglePublished = async (vid: Video) => {
    try {
      const { error } = await supabase
        .from('video_lectures')
        .update({ is_published: !vid.is_published })
        .eq('id', vid.id);
      if (error) throw error;
      await fetchData();
    } catch (error: any) {
      Alert.alert('Update Failed', error.message);
    }
  };

  const handleDelete = async (id: string, vidTitle: string, currentThumbUrl: string, currentVideoUrl: string) => {
    const confirmDelete = () => executeDelete(id, currentThumbUrl, currentVideoUrl);

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete video "${vidTitle}"? This removes any uploaded files from storage too.`)) confirmDelete();
    } else {
      Alert.alert('Delete Video', `Delete "${vidTitle}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDelete = async (id: string, currentThumbUrl: string, currentVideoUrl: string) => {
    try {
      const { error: dbError } = await supabase.from('video_lectures').delete().eq('id', id);
      if (dbError) throw dbError;

      const filesToDelete = [];
      
      // Only attempt to delete from storage if it's a Supabase URL, not YouTube/Vimeo
      if (currentThumbUrl && currentThumbUrl.includes('supabase.co')) {
        const urlParts = currentThumbUrl.split('/');
        filesToDelete.push(urlParts[urlParts.length - 1]);
      }
      if (currentVideoUrl && currentVideoUrl.includes('supabase.co')) {
        const urlParts = currentVideoUrl.split('/');
        filesToDelete.push(urlParts[urlParts.length - 1]);
      }

      if (filesToDelete.length > 0) {
        await supabase.storage.from('videos').remove(filesToDelete);
      }

      await fetchData();
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setTitle('');
    setDescription('');
    setVideoUrl('');
    setThumbnailUrl('');
    setIsPublished(true);
    setSelectedImage(null);
    setSelectedVideoFile(null);
    setLessonId(null);
    setCategoryIds([]);
  };

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="font-display text-3xl font-semibold text-navy">Video Lectures CMS</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <Text className="font-display text-xl font-semibold text-navy">
          {editId ? 'Edit Video Lecture' : 'Add New Video Lecture'}
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Video Title</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="e.g., Level 1: Intro to The Pitch"
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Categories (choose 1 to 5)</Text>
            {categories.length === 0 ? (
              <Text className="p-4 text-red-500 bg-red-50 rounded-xl">Please create a &apos;Videos&apos; category first.</Text>
            ) : (
              <CategoryMultiSelect
                categories={categories}
                selectedIds={categoryIds}
                onChange={setCategoryIds}
              />
            )}
          </View>
        </View>

        {taggingAvailable ? (
          <View className="border-t border-inkline pt-4">
            <BelongsToPicker value={lessonId} onChange={setLessonId} />
          </View>
        ) : null}

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Description</Text>
          <TextInput
            className="w-full bg-canvas p-4 rounded-xl border border-inkline"
            placeholder="What will students learn in this video?"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View className="flex-col md:flex-row gap-6 border-t border-inkline pt-6">
          {/* Video Source Selection */}
          <View className="flex-1 space-y-4 gap-4">
            <Text className="text-sm font-semibold text-text-secondary">1. Video Source</Text>
            
            <View>
              <Text className="text-xs text-slate-500 mb-1">Option A: Upload MP4 File</Text>
              <View className="flex-row items-center gap-4">
                <Pressable 
                  onPress={pickVideoFile}
                  className="px-4 py-3 bg-navy rounded-full"
                >
                  <Text className="text-white font-bold text-sm">Upload Video</Text>
                </Pressable>
                <View className="flex-1">
                  {selectedVideoFile ? (
                    <Text className="text-pitch font-semibold text-xs" numberOfLines={1}>Selected: {selectedVideoFile.name}</Text>
                  ) : videoUrl.includes('supabase.co') ? (
                    <Text className="text-emerald-600 text-xs font-semibold" numberOfLines={1}>Video file active in storage.</Text>
                  ) : (
                    <Text className="text-slate-400 text-xs">No file selected</Text>
                  )}
                </View>
              </View>
            </View>

            <View>
              <Text className="text-xs text-slate-500 mb-1">Option B: External URL (YouTube/Vimeo)</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="https://youtube.com/watch?v=..."
                value={videoUrl}
                onChangeText={setVideoUrl}
                autoCapitalize="none"
              />
            </View>
          </View>
          
          {/* Thumbnail Upload */}
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">2. Custom Thumbnail (Optional)</Text>
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
                  <Image source={{ uri: thumbnailUrl }} className="w-16 h-12 rounded-md border border-inkline object-cover" />
                ) : (
                  <Text className="text-slate-400 text-xs">No thumbnail</Text>
                )}
              </View>
            </View>
            <View className="mt-4">
              <Text className="text-xs text-slate-500 mb-1">...or paste a thumbnail image URL</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="https://example.com/thumbnail.jpg"
                value={thumbnailUrl}
                onChangeText={setThumbnailUrl}
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>

        {/* Publish state: only published lectures appear in the learner gallery */}
        <View className="flex-row items-center justify-between border-t border-inkline pt-4">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-semibold text-text-secondary">Published</Text>
            <Text className="text-xs text-slate-400 mt-0.5">Published lectures are visible to students. Drafts stay hidden.</Text>
          </View>
          <Pressable
            onPress={() => setIsPublished(prev => !prev)}
            className={`px-4 py-2.5 rounded-full ${isPublished ? 'bg-pitch' : 'bg-slate-300'}`}
          >
            <Text className="text-white font-bold text-sm">{isPublished ? '● Published' : '○ Draft'}</Text>
          </Pressable>
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-inkline pt-4">
          {editId && (
            <View className="w-24">
              <AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" />
            </View>
          )}
          <View className="w-48">
            <AnimatedButton 
              title={saving ? "Saving..." : "Save Lecture"} 
              onPress={handleSave} 
              disabled={saving || categories.length === 0} 
              variant="primary" 
              size="sm" 
            />
          </View>
        </View>
      </View>

      {/* List: search + Stage -> Category collapsible groups (Round 76) */}
      {loading ? (
        <View className="bg-white rounded-2xl border border-inkline shadow-sm p-8 items-center">
          <ActivityIndicator size="large" color="#0A192F" />
        </View>
      ) : (
        <GroupedContentList
          items={videos}
          stages={(taxonomy?.stages || []).map((s) => ({ id: s.id, title: s.title }))}
          categories={flattenCategoryTree(categories).map(({ cat }) => ({ id: cat.id, name: cat.name }))}
          idOf={(vid) => vid.id}
          stageIdOf={stageIdForVideo}
          categoryIdOf={(vid) => vid.category_id ?? null}
          categoryIdsOf={(vid) => categoryIdsFor(vid)}
          titleOf={(vid) => vid.title}
          descriptionOf={(vid) => vid.description}
          itemNoun="videos"
          searchPlaceholder="Search videos by title…"
          emptyMessage="No videos added yet."
          bulkAssign={{
            onAssign: async (ids, categoryId) => {
              const res = await bulkAddCategory('videos', ids, categoryId, videos, categories);
              await fetchData();
              return res.message;
            },
            onRemove: async (ids, categoryId) => {
              const res = await bulkRemoveCategory('videos', ids, categoryId, videos, categories);
              await fetchData();
              return res.message;
            },
          }}
          renderItem={(vid, isLast) => {
            const catName =
              categoryIdsFor(vid)
                .map((id) => categories.find((c) => c.id === id)?.name)
                .filter(Boolean)
                .join(' · ') || 'No category';
            return (
              <View
                key={vid.id}
                className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${isLast ? '' : 'border-b border-inkline'}`}
              >
                <View className="flex-row items-center gap-4 flex-1">
                  {vid.thumbnail_url ? (
                    <Image source={{ uri: vid.thumbnail_url }} className="w-16 h-12 rounded-lg bg-slate-100 object-cover" />
                  ) : (
                    <View className="w-16 h-12 rounded-lg bg-slate-100 items-center justify-center">
                      <Text className="text-xl">📺</Text>
                    </View>
                  )}
                  <View>
                    <Text className="font-bold text-text-primary text-base">{vid.title}</Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Text className="text-pitch text-xs font-bold uppercase tracking-wider">{catName}</Text>
                      <Pressable
                        onPress={() => togglePublished(vid)}
                        className={`px-2 py-0.5 rounded-full ${vid.is_published ? 'bg-pitch-light' : 'bg-slate-200'}`}
                      >
                        <Text className={`text-[10px] font-bold uppercase ${vid.is_published ? 'text-pitch-dark' : 'text-slate-500'}`}>
                          {vid.is_published ? 'Published' : 'Draft'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
                
                <View className="flex-row gap-3">
                  <Pressable onPress={() => {
                    if (Platform.OS === 'web') window.open(vid.video_url, '_blank');
                  }} className="px-3 py-1.5 bg-canvas rounded-full border border-inkline">
                    <Text className="text-navy text-sm font-semibold">Watch</Text>
                  </Pressable>
                  <Pressable onPress={() => handleEdit(vid)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                    <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(vid.id, vid.title, vid.thumbnail_url, vid.video_url)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
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