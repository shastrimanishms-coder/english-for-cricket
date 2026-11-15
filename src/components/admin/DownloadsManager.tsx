import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface Category {
  id: string;
  name: string;
}

interface Download {
  id: string;
  title: string;
  description: string;
  category_id: string;
  file_url: string;
}

export default function DownloadsManager() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch categories meant for downloads
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('type', 'downloads')
        .order('name');
      
      if (catError) throw catError;
      setCategories(catData || []);
      if (catData && catData.length > 0 && !categoryId) {
        setCategoryId(catData[0].id);
      }

      // Fetch downloads
      const { data: dlData, error: dlError } = await supabase
        .from('downloads')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (dlError) throw dlError;
      setDownloads(dlData || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all files, or restrict to 'application/pdf'
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
      }
    } catch (error) {
      console.log('Error picking document:', error);
    }
  };

  const uploadFile = async (file: any) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    let fileBody;
    if (Platform.OS === 'web') {
      // For web, we need to fetch the blob
      const res = await fetch(file.uri);
      fileBody = await res.blob();
    } else {
      // For native, we use FormData
      fileBody = {
        uri: file.uri,
        type: file.mimeType || 'application/octet-stream',
        name: file.name,
      } as any; // Cast for TS
    }

    const { error: uploadError } = await supabase.storage
      .from('downloads')
      .upload(filePath, fileBody);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('downloads').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!title.trim() || !categoryId) {
      Alert.alert('Missing Fields', 'Title and Category are required.');
      return;
    }
    if (!fileUrl && !selectedFile) {
      Alert.alert('Missing File', 'Please attach a file.');
      return;
    }

    setSaving(true);
    try {
      let finalFileUrl = fileUrl;

      // If a new file was picked, upload it first
      if (selectedFile) {
        finalFileUrl = await uploadFile(selectedFile);
      }

      if (editId) {
        // UPDATE existing
        const { error } = await supabase
          .from('downloads')
          .update({ 
            title: title.trim(), 
            description: description.trim(),
            category_id: categoryId,
            file_url: finalFileUrl
          })
          .eq('id', editId);
        if (error) throw error;
      } else {
        // CREATE new
        const { error } = await supabase
          .from('downloads')
          .insert([{ 
            title: title.trim(), 
            description: description.trim(),
            category_id: categoryId,
            file_url: finalFileUrl
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

  const handleEdit = (dl: Download) => {
    setEditId(dl.id);
    setTitle(dl.title);
    setDescription(dl.description || '');
    setCategoryId(dl.category_id);
    setFileUrl(dl.file_url);
    setSelectedFile(null); // Clear any pending selection
  };

  const handleDelete = async (id: string, dlTitle: string, currentFileUrl: string) => {
    const confirmDelete = () => executeDelete(id, currentFileUrl);

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete document "${dlTitle}"? This will also remove the file from storage.`)) confirmDelete();
    } else {
      Alert.alert('Delete Document', `Delete "${dlTitle}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDelete = async (id: string, currentFileUrl: string) => {
    try {
      // 1. Delete from database
      const { error: dbError } = await supabase.from('downloads').delete().eq('id', id);
      if (dbError) throw dbError;

      // 2. Extract filename and delete from storage bucket
      const urlParts = currentFileUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      if (fileName) {
        await supabase.storage.from('downloads').remove([fileName]);
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
    setFileUrl('');
    setSelectedFile(null);
    if (categories.length > 0) setCategoryId(categories[0].id);
  };

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-text-primary">Downloads & Workbooks CMS</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 gap-6">
        <Text className="text-lg font-bold text-[#0A192F]">
          {editId ? 'Edit Document' : 'Upload New Document'}
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Title</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder="e.g., Level 1 Workbook PDF"
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Category</Text>
            {categories.length === 0 ? (
              <Text className="p-4 text-red-500 bg-red-50 rounded-xl">Please create a 'Downloads' category first.</Text>
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
            placeholder="Briefly describe this resource..."
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">File Attachment</Text>
          <View className="flex-row items-center gap-4">
            <Pressable 
              onPress={pickDocument}
              className="px-4 py-3 bg-[#0A192F] rounded-lg"
            >
              <Text className="text-white font-bold text-sm">Choose File</Text>
            </Pressable>
            <View className="flex-1">
              {selectedFile ? (
                <Text className="text-brand font-semibold" numberOfLines={1}>Selected: {selectedFile.name}</Text>
              ) : fileUrl ? (
                <Text className="text-slate-600" numberOfLines={1}>Current File Linked.</Text>
              ) : (
                <Text className="text-slate-400">No file selected</Text>
              )}
            </View>
          </View>
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-slate-100 pt-4">
          {editId && (
            <View className="w-24">
              <AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" />
            </View>
          )}
          <View className="w-40">
            <AnimatedButton 
              title={saving ? "Uploading..." : "Save & Upload"} 
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
        ) : downloads.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No documents uploaded yet.</Text>
          </View>
        ) : (
          downloads.map((dl, index) => {
            const catName = categories.find(c => c.id === dl.category_id)?.name || 'Unknown Category';
            return (
              <View 
                key={dl.id} 
                className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${index !== downloads.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <View className="flex-1">
                  <Text className="font-bold text-text-primary text-base">{dl.title}</Text>
                  <Text className="text-brand text-xs font-bold uppercase tracking-wider mt-1">{catName}</Text>
                  {dl.description ? <Text className="text-sm text-slate-500 mt-1">{dl.description}</Text> : null}
                </View>
                
                <View className="flex-row gap-3">
                  <Pressable onPress={() => {
                    if (Platform.OS === 'web') window.open(dl.file_url, '_blank');
                  }} className="px-3 py-1.5 bg-blue-50 rounded border border-blue-100">
                    <Text className="text-blue-600 text-sm font-semibold">View File</Text>
                  </Pressable>
                  <Pressable onPress={() => handleEdit(dl)} className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200">
                    <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(dl.id, dl.title, dl.file_url)} className="px-3 py-1.5 bg-red-50 rounded border border-red-100">
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