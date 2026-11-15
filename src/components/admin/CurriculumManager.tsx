import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface Module {
  id: string;
  title: string;
  description: string;
  order_index: number;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string;
  order_index: number;
}

export default function CurriculumManager() {
  // State for views: 'modules' | 'lessons'
  const [activeView, setActiveView] = useState<'modules' | 'lessons'>('modules');
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);

  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [orderIndex, setOrderIndex] = useState('0');

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('curriculum_modules')
        .select('*')
        .order('order_index', { ascending: true });
      if (error) throw error;
      setModules(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLessons = async (moduleId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('curriculum_lessons')
        .select('*')
        .eq('module_id', moduleId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      setLessons(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const openLessonsView = (mod: Module) => {
    setSelectedModule(mod);
    setActiveView('lessons');
    cancelEdit();
    fetchLessons(mod.id);
  };

  const goBackToModules = () => {
    setSelectedModule(null);
    setActiveView('modules');
    cancelEdit();
    fetchModules();
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Field', 'Title is required.');
      return;
    }

    setSaving(true);
    const table = activeView === 'modules' ? 'curriculum_modules' : 'curriculum_lessons';
    const payload: any = {
      title: title.trim(),
      description: description.trim(),
      order_index: parseInt(orderIndex) || 0,
    };

    if (activeView === 'lessons' && selectedModule) {
      payload.module_id = selectedModule.id;
    }

    try {
      if (editId) {
        const { error } = await supabase.from(table).update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert([payload]);
        if (error) throw error;
      }

      cancelEdit();
      if (activeView === 'modules') await fetchModules();
      else if (selectedModule) await fetchLessons(selectedModule.id);
    } catch (error: any) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: any) => {
    setEditId(item.id);
    setTitle(item.title);
    setDescription(item.description || '');
    setOrderIndex(item.order_index?.toString() || '0');
  };

  const handleDelete = async (id: string, itemTitle: string) => {
    const confirmDelete = () => executeDelete(id);
    const itemType = activeView === 'modules' ? 'Module' : 'Lesson';

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${itemType} "${itemTitle}"? This will delete everything inside it too.`)) confirmDelete();
    } else {
      Alert.alert(`Delete ${itemType}`, `Delete "${itemTitle}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDelete = async (id: string) => {
    const table = activeView === 'modules' ? 'curriculum_modules' : 'curriculum_lessons';
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      
      if (activeView === 'modules') await fetchModules();
      else if (selectedModule) await fetchLessons(selectedModule.id);
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setTitle('');
    setDescription('');
    
    // Auto-increment the order index for the next item based on current length
    const nextOrder = activeView === 'modules' ? modules.length : lessons.length;
    setOrderIndex(nextOrder.toString());
  };

  const isModuleView = activeView === 'modules';

  return (
    <View className="space-y-8 gap-8">
      {/* Header Area */}
      <View className="flex-row justify-between items-center">
        {isModuleView ? (
          <Text className="text-2xl font-bold text-text-primary">Curriculum Modules</Text>
        ) : (
          <View className="flex-row items-center gap-4">
            <Pressable onPress={goBackToModules} className="p-2 bg-slate-200 rounded-lg">
              <Text className="font-bold text-slate-700">← Back</Text>
            </Pressable>
            <View>
              <Text className="text-xs font-bold text-brand uppercase tracking-wider">Managing Lessons For</Text>
              <Text className="text-2xl font-bold text-text-primary">{selectedModule?.title}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 gap-6">
        <Text className="text-lg font-bold text-[#0A192F]">
          {editId 
            ? `Edit ${isModuleView ? 'Module' : 'Lesson'}` 
            : `Add New ${isModuleView ? 'Module' : 'Lesson'}`
          }
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-2">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Title</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder={isModuleView ? "e.g., Level 1: The Pitch" : "e.g., Lesson 1: Vocabulary"}
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Order / Sequence Number</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder="0"
              keyboardType="numeric"
              value={orderIndex}
              onChangeText={setOrderIndex}
            />
          </View>
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Description</Text>
          <TextInput
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
            placeholder="Briefly describe what this covers..."
            value={description}
            onChangeText={setDescription}
          />
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

      {/* Dynamic List */}
      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : (isModuleView ? modules : lessons).length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No {isModuleView ? 'Modules' : 'Lessons'} added yet.</Text>
          </View>
        ) : (
          (isModuleView ? modules : lessons).map((item: any, index: number) => {
            const arrLength = isModuleView ? modules.length : lessons.length;
            return (
              <View 
                key={item.id} 
                className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${index !== arrLength - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <View className="flex-row items-center gap-4 flex-1">
                  <View className="w-10 h-10 rounded-full bg-brand/10 items-center justify-center">
                    <Text className="font-bold text-brand">{item.order_index}</Text>
                  </View>
                  <View>
                    <Text className="font-bold text-text-primary text-base">{item.title}</Text>
                    {item.description ? <Text className="text-sm text-slate-500 mt-1">{item.description}</Text> : null}
                  </View>
                </View>
                
                <View className="flex-row gap-3">
                  {isModuleView && (
                    <Pressable onPress={() => openLessonsView(item)} className="px-3 py-1.5 bg-blue-50 rounded border border-blue-100">
                      <Text className="text-blue-600 text-sm font-semibold">Manage Lessons →</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => handleEdit(item)} className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200">
                    <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(item.id, item.title)} className="px-3 py-1.5 bg-red-50 rounded border border-red-100">
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