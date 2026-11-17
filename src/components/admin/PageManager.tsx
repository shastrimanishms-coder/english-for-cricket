import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface PageData {
  id: string;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

export default function PageManager() {
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');

  const fetchPages = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .order('title', { ascending: true });

      if (error) throw error;
      setPages(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchPages();
    })();
  }, [fetchPages]);

  // Auto-generate a URL-friendly slug from the title if the user hasn't typed one
  const handleTitleChange = (text: string) => {
    setTitle(text);
    if (!editId) {
      const autoSlug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      setSlug(autoSlug);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !slug.trim() || !content.trim()) {
      Alert.alert('Missing Fields', 'Title, Slug, and Content are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, ''), // Enforce safe URL characters
        content: content.trim(),
        updated_at: new Date().toISOString(),
      };

      if (editId) {
        const { error } = await supabase.from('pages').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pages').insert([payload]);
        if (error) throw error;
      }

      cancelEdit();
      await fetchPages();
    } catch (error: any) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (page: PageData) => {
    setEditId(page.id);
    setTitle(page.title);
    setSlug(page.slug);
    setContent(page.content || '');
  };

  const handleDelete = async (id: string, pageTitle: string) => {
    const confirmDelete = () => executeDelete(id);

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete the "${pageTitle}" page?`)) confirmDelete();
    } else {
      Alert.alert('Delete Page', `Delete "${pageTitle}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('pages').delete().eq('id', id);
      if (error) throw error;
      await fetchPages();
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setTitle('');
    setSlug('');
    setContent('');
  };

  return (
    <View className="space-y-8 gap-8 h-full">
      <View className="flex-row justify-between items-center">
        <Text className="font-display text-3xl font-semibold text-navy">Legal & Static Pages</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6 flex-shrink-0">
        <Text className="font-display text-xl font-semibold text-navy">
          {editId ? 'Edit Page' : 'Create New Page'}
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Page Title</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="e.g., Privacy Policy"
              value={title}
              onChangeText={handleTitleChange}
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">URL Slug</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline text-slate-500"
              placeholder="privacy-policy"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
            />
          </View>
        </View>

        <View className="flex-1 min-h-[250px]">
          <Text className="text-sm font-semibold text-text-secondary mb-2">Page Content (Supports basic HTML structure)</Text>
          <TextInput
            className="w-full flex-1 bg-canvas p-4 rounded-xl border border-inkline"
            placeholder="Type your policy or FAQ content here..."
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-inkline pt-4">
          {editId && (
            <View className="w-24">
              <AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" />
            </View>
          )}
          <View className="w-32">
            <AnimatedButton 
              title={saving ? "Saving..." : "Save Page"} 
              onPress={handleSave} 
              disabled={saving} 
              variant="primary" 
              size="sm" 
            />
          </View>
        </View>
      </View>

      {/* Pages List */}
      <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden flex-shrink-0">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : pages.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No static pages created yet.</Text>
          </View>
        ) : (
          pages.map((page, index) => (
            <View 
              key={page.id} 
              className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${index !== pages.length - 1 ? 'border-b border-inkline' : ''}`}
            >
              <View>
                <Text className="font-sans font-bold text-text-primary text-base">{page.title}</Text>
                <Text className="text-pitch text-xs font-mono mt-1">/pages/{page.slug}</Text>
              </View>
              
              <View className="flex-row gap-3">
                <Pressable onPress={() => handleEdit(page)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                  <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(page.id, page.title)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
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