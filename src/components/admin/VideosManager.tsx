import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform, ScrollView, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface Category {
  id: string;
  name: string;
}

interface Video {
  id: string;
  title: string;
  description: string;
  category_id: string;
  video_url: string;
  thumbnail_url: string;
}

export default function VideosManager() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedVideoFile, setSelectedVideoFile] = useState<any>(null);

  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('type', 'videos')
        .order('name');
      
      if (catError) throw catError;
      setCategories(catData || []);
      if (catData && catData.length > 0 && !categoryId) {
        setCategoryId(catData[0].id);
      }

      const { data: vidData, error: vidError } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (vidError) throw vidError;
      setVideos(vidData || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

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
        contentType: file.mimeType || (prefix === 'vid' ? 'video/mp4' : 'image/jpeg')
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('videos').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!title.trim() || !categoryId) {
      Alert.alert('Missing Fields', 'Title and Category are required.');
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

      if (editId) {
        const { error } = await supabase
          .from('videos')
          .update({ 
            title: title.trim(), 
            description: description.trim(),
            category_id: categoryId,
            video_url: finalVideoUrl,
            thumbnail_url: finalThumbUrl
          })
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('videos')
          .insert([{ 
            title: title.trim(), 
            description: description.trim(),
            category_id: categoryId,
            video_url: finalVideoUrl,
            thumbnail_url: finalThumbUrl
          }]);
        if (error) throw error;
      }

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
    setCategoryId(vid.category_id);
    setVideoUrl(vid.video_url);
    setThumbnailUrl(vid.thumbnail_url || '');
    setSelectedImage(null);
    setSelectedVideoFile(null);
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
      const { error: dbError } = await supabase.from('videos').delete().eq('id', id);
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
    setSelectedImage(null);
    setSelectedVideoFile(null);
    if (categories.length > 0) setCategoryId(categories[0].id);
  };

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-text-primary">Video Lectures CMS</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 gap-6">
        <Text className="text-lg font-bold text-[#0A192F]">
          {editId ? 'Edit Video Lecture' : 'Add New Video Lecture'}
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Video Title</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder="e.g., Level 1: Intro to The Pitch"
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Category</Text>
            {categories.length === 0 ? (
              <Text className="p-4 text-red-500 bg-red-50 rounded-xl">Please create a 'Videos' category first.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategoryId(cat.id)}
                    className={`mr-2 px-4 py-3 rounded-xl border ${categoryId === cat.id ? 'border-brand bg-brand' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <Text className={`font-semibold text-sm ${categoryId === cat.id ? 'text-white' : 'text-slate-600'}`}>
                      {cat.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Description</Text>
          <TextInput
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
            placeholder="What will students learn in this video?"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View className="flex-col md:flex-row gap-6 border-t border-slate-100 pt-6">
          {/* Video Source Selection */}
          <View className="flex-1 space-y-4 gap-4">
            <Text className="text-sm font-semibold text-text-secondary">1. Video Source</Text>
            
            <View>
              <Text className="text-xs text-slate-500 mb-1">Option A: Upload MP4 File</Text>
              <View className="flex-row items-center gap-4">
                <Pressable 
                  onPress={pickVideoFile}
                  className="px-4 py-3 bg-[#0A192F] rounded-lg"
                >
                  <Text className="text-white font-bold text-sm">Upload Video</Text>
                </Pressable>
                <View className="flex-1">
                  {selectedVideoFile ? (
                    <Text className="text-brand font-semibold text-xs" numberOfLines={1}>Selected: {selectedVideoFile.name}</Text>
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
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
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
                className="px-4 py-3 bg-[#0A192F] rounded-lg"
              >
                <Text className="text-white font-bold text-sm">Upload Image</Text>
              </Pressable>
              <View>
                {selectedImage ? (
                  <Text className="text-brand font-semibold text-xs" numberOfLines={1}>{selectedImage.name}</Text>
                ) : thumbnailUrl ? (
                  <Image source={{ uri: thumbnailUrl }} className="w-16 h-12 rounded-md border border-slate-200 object-cover" />
                ) : (
                  <Text className="text-slate-400 text-xs">No thumbnail</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-slate-100 pt-4">
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

      {/* List */}
      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : videos.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No videos added yet.</Text>
          </View>
        ) : (
          videos.map((vid, index) => {
            const catName = categories.find(c => c.id === vid.category_id)?.name || 'Unknown Category';
            return (
              <View 
                key={vid.id} 
                className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${index !== videos.length - 1 ? 'border-b border-slate-100' : ''}`}
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
                    <Text className="text-brand text-xs font-bold uppercase tracking-wider mt-1">{catName}</Text>
                  </View>
                </View>
                
                <View className="flex-row gap-3">
                  <Pressable onPress={() => {
                    if (Platform.OS === 'web') window.open(vid.video_url, '_blank');
                  }} className="px-3 py-1.5 bg-blue-50 rounded border border-blue-100">
                    <Text className="text-blue-600 text-sm font-semibold">Watch</Text>
                  </Pressable>
                  <Pressable onPress={() => handleEdit(vid)} className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200">
                    <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(vid.id, vid.title, vid.thumbnail_url, vid.video_url)} className="px-3 py-1.5 bg-red-50 rounded border border-red-100">
                    <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}