import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform, ScrollView, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface Category {
  id: string;
  name: string;
}

interface Game {
  id: string;
  title: string;
  description: string;
  category_id: string;
  game_url: string;
  thumbnail_url: string;
}

export default function GamesManager() {
  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  
  const [gameUrl, setGameUrl] = useState('');
  const [selectedGameFile, setSelectedGameFile] = useState<any>(null);

  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('type', 'games')
        .order('name');
      
      if (catError) throw catError;
      setCategories(catData || []);
      if (catData && catData.length > 0) {
        // Default to the first category only when none is selected yet.
        // The functional update keeps fetchData free of reactive deps.
        setCategoryId(prev => prev || catData[0].id);
      }

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (gameError) throw gameError;
      setGames(gameData || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

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
        contentType: file.mimeType || (fileExt === 'html' ? 'text/html' : 'application/octet-stream')
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('games').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!title.trim() || !categoryId) {
      Alert.alert('Missing Fields', 'Title and Category are required.');
      return;
    }
    if (!gameUrl && !selectedGameFile) {
      Alert.alert('Missing File', 'Please upload the Game File (HTML/ZIP).');
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

      if (editId) {
        const { error } = await supabase
          .from('games')
          .update({ 
            title: title.trim(), 
            description: description.trim(),
            category_id: categoryId,
            game_url: finalGameUrl,
            thumbnail_url: finalThumbUrl
          })
          .eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('games')
          .insert([{ 
            title: title.trim(), 
            description: description.trim(),
            category_id: categoryId,
            game_url: finalGameUrl,
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

  const handleEdit = (game: Game) => {
    setEditId(game.id);
    setTitle(game.title);
    setDescription(game.description || '');
    setCategoryId(game.category_id);
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
      Alert.alert('Delete Failed', error.message);
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
    if (categories.length > 0) setCategoryId(categories[0].id);
  };

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-text-primary">Games & Arcade CMS</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 gap-6">
        <Text className="text-lg font-bold text-[#0A192F]">
          {editId ? 'Edit Game Module' : 'Upload New Game'}
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Game Title</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder="e.g., Jumping Bird"
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Category</Text>
            {categories.length === 0 ? (
              <Text className="p-4 text-red-500 bg-red-50 rounded-xl">Please create a &apos;Games&apos; category first.</Text>
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
          <Text className="text-sm font-semibold text-text-secondary mb-2">Short Intro / How to Play</Text>
          <TextInput
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
            placeholder="Briefly describe how to play..."
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View className="flex-col md:flex-row gap-6 border-t border-slate-100 pt-6">
          {/* Game File Upload */}
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">1. Upload Game File (.html or .zip)</Text>
            <View className="flex-row items-center gap-4">
              <Pressable 
                onPress={pickGameFile}
                className="px-4 py-3 bg-[#0A192F] rounded-lg"
              >
                <Text className="text-white font-bold text-sm">Choose File</Text>
              </Pressable>
              <View className="flex-1">
                {selectedGameFile ? (
                  <Text className="text-brand font-semibold text-xs" numberOfLines={1}>Selected: {selectedGameFile.name}</Text>
                ) : gameUrl ? (
                  <Text className="text-emerald-600 text-xs font-semibold" numberOfLines={1}>Game file active in storage.</Text>
                ) : (
                  <Text className="text-slate-400 text-xs">No file selected</Text>
                )}
              </View>
            </View>
          </View>
          
          {/* Thumbnail Upload */}
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">2. Upload Game Thumbnail</Text>
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
                  <Image source={{ uri: thumbnailUrl }} className="w-12 h-12 rounded-md border border-slate-200" />
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
              title={saving ? "Uploading..." : "Save & Upload Game"} 
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
        ) : games.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No games added yet.</Text>
          </View>
        ) : (
          games.map((game, index) => {
            const catName = categories.find(c => c.id === game.category_id)?.name || 'Unknown Category';
            return (
              <View 
                key={game.id} 
                className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${index !== games.length - 1 ? 'border-b border-slate-100' : ''}`}
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
                    <Text className="text-brand text-xs font-bold uppercase tracking-wider mt-1">{catName}</Text>
                  </View>
                </View>
                
                <View className="flex-row gap-3">
                  <Pressable onPress={() => {
                    if (Platform.OS === 'web') window.open(game.game_url, '_blank');
                  }} className="px-3 py-1.5 bg-blue-50 rounded border border-blue-100">
                    <Text className="text-blue-600 text-sm font-semibold">Play/Test</Text>
                  </Pressable>
                  <Pressable onPress={() => handleEdit(game)} className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200">
                    <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(game.id, game.title, game.thumbnail_url, game.game_url)} className="px-3 py-1.5 bg-red-50 rounded border border-red-100">
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