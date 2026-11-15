import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface Category {
  id: string;
  name: string;
  description: string;
  type: string;
}

const CATEGORY_TYPES = [
  { id: 'curriculum', label: 'Curriculum & Lessons', color: 'bg-blue-100 text-blue-800' },
  { id: 'downloads', label: 'Downloads & Workbooks', color: 'bg-pink-100 text-pink-800' },
  { id: 'games', label: 'Games & Arcade', color: 'bg-teal-100 text-teal-800' },
  { id: 'videos', label: 'Video Lectures', color: 'bg-orange-100 text-orange-800' },
];

export default function CategoriesManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedType, setSelectedType] = useState('curriculum');

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('type', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchCategories();
    })();
  }, [fetchCategories]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Field', 'Category name is required.');
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        // Update existing
        const { error } = await supabase
          .from('categories')
          .update({ 
            name: name.trim(), 
            description: description.trim(),
            type: selectedType 
          })
          .eq('id', editId);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('categories')
          .insert([{ 
            name: name.trim(), 
            description: description.trim(),
            type: selectedType
          }]);
        if (error) throw error;
      }

      cancelEdit();
      await fetchCategories();
    } catch (error: any) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (cat: Category) => {
    setEditId(cat.id);
    setName(cat.name);
    setDescription(cat.description || '');
    setSelectedType(cat.type || 'curriculum');
  };

  const handleDelete = async (id: string, catName: string) => {
    const confirmDelete = () => {
      executeDelete(id);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete category "${catName}"?`)) confirmDelete();
    } else {
      Alert.alert('Delete Category', `Delete "${catName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      await fetchCategories();
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setName('');
    setDescription('');
    setSelectedType('curriculum');
  };

  const getTypeStyle = (typeId: string) => {
    const typeDef = CATEGORY_TYPES.find(t => t.id === typeId);
    return typeDef ? typeDef.color : 'bg-slate-100 text-slate-800';
  };

  const getTypeName = (typeId: string) => {
    const typeDef = CATEGORY_TYPES.find(t => t.id === typeId);
    return typeDef ? typeDef.label : typeId;
  };

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-text-primary">Categories Manager</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 gap-6">
        <Text className="text-lg font-bold text-[#0A192F]">
          {editId ? 'Edit Category' : 'Create New Category'}
        </Text>
        
        {/* Type Selector */}
        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-3">What is this category for?</Text>
          <View className="flex-row flex-wrap gap-3">
            {CATEGORY_TYPES.map((type) => (
              <Pressable
                key={type.id}
                onPress={() => setSelectedType(type.id)}
                className={`px-4 py-2 rounded-full border ${selectedType === type.id ? 'border-[#0A192F] bg-[#0A192F]' : 'border-slate-200 bg-slate-50'}`}
              >
                <Text className={`font-semibold text-sm ${selectedType === type.id ? 'text-white' : 'text-slate-600'}`}>
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Category Name</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder="e.g., Eiken Pre-2, Worksheets..."
              value={name}
              onChangeText={setName}
            />
          </View>
          <View className="flex-2">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Description (Optional)</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder="What belongs in this category?"
              value={description}
              onChangeText={setDescription}
            />
          </View>
        </View>

        <View className="flex-row justify-end gap-4 mt-2">
          {editId && (
            <View className="w-24">
              <AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" />
            </View>
          )}
          <View className="w-32">
            <AnimatedButton 
              title={saving ? "Saving..." : "Save"} 
              onPress={handleSave} 
              disabled={saving} 
              variant="primary" 
              size="sm" 
            />
          </View>
        </View>
      </View>

      {/* Categories List */}
      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : categories.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No categories found. Create your first one above.</Text>
          </View>
        ) : (
          categories.map((cat, index) => (
            <View 
              key={cat.id} 
              className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${index !== categories.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              <View className="flex-row items-center flex-wrap gap-3">
                <Text className="font-bold text-text-primary text-base">{cat.name}</Text>
                
                {/* Visual Type Badge */}
                <View className={`px-2.5 py-1 rounded-md ${getTypeStyle(cat.type)}`}>
                  <Text className="text-xs font-bold uppercase tracking-wider">{getTypeName(cat.type)}</Text>
                </View>

                {cat.description ? <Text className="text-sm text-slate-500 w-full md:w-auto">{cat.description}</Text> : null}
              </View>
              
              <View className="flex-row gap-3">
                <Pressable onPress={() => handleEdit(cat)} className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200">
                  <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(cat.id, cat.name)} className="px-3 py-1.5 bg-red-50 rounded border border-red-100">
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