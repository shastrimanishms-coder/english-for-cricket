import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface Category {
  id: string;
  name: string;
  description: string;
  type: string;
  parent_id?: string | null;
}

const CATEGORY_TYPES = [
  { id: 'curriculum', label: 'Curriculum & Lessons', color: 'bg-navy/10 text-navy' },
  { id: 'downloads', label: 'Downloads & Workbooks', color: 'bg-gold-light/70 text-gold-dark' },
  { id: 'games', label: 'Games & Arcade', color: 'bg-pitch-light text-pitch-dark' },
  { id: 'videos', label: 'Video Lectures', color: 'bg-slate-100 text-slate-700' },
  { id: 'speaking', label: 'Speaking Practice', color: 'bg-navy/5 text-navy-soft' },
  { id: 'reading', label: 'Smart Reading', color: 'bg-pitch/10 text-pitch-dark' },
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
  const [parentId, setParentId] = useState<string | null>(null);
  // True once a fetched row proves the parent_id column exists (migration 17).
  const [hasParentColumn, setHasParentColumn] = useState(false);

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
      if ((data || []).length > 0 && 'parent_id' in data[0]) setHasParentColumn(true);
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
      const payload: any = {
        name: name.trim(),
        description: description.trim(),
        type: selectedType,
      };
      // Only write parent_id when the column exists (migration 17) or a
      // parent is actually chosen — pre-migration saves keep working.
      if (hasParentColumn || parentId) payload.parent_id = parentId;
      if (editId) {
        // Update existing
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editId);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('categories')
          .insert([payload]);
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
    setParentId(cat.parent_id ?? null);
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
    setParentId(null);
  };

  // Categories that may be a parent: same type, not this category, and not
  // one of its own descendants (which would create a loop).
  const descendantIds = (id: string | null): Set<string> => {
    const out = new Set<string>();
    if (!id) return out;
    let frontier = [id];
    while (frontier.length) {
      const next: string[] = [];
      for (const c of categories) {
        if (c.parent_id && frontier.includes(c.parent_id) && !out.has(c.id)) {
          out.add(c.id);
          next.push(c.id);
        }
      }
      frontier = next;
    }
    return out;
  };
  const excluded = descendantIds(editId);
  const parentOptions = categories.filter(
    (c) => c.type === selectedType && c.id !== editId && !excluded.has(c.id)
  );

  // Display order: grouped by type, parents first, children indented under
  // their parent (depth-first, capped at 3 levels).
  const displayCategories: { cat: Category; depth: number }[] = (() => {
    const out: { cat: Category; depth: number }[] = [];
    const byType = new Map<string, Category[]>();
    for (const c of categories) {
      if (!byType.has(c.type)) byType.set(c.type, []);
      byType.get(c.type)!.push(c);
    }
    const typeOrder = [...CATEGORY_TYPES.map((t) => t.id), ...[...byType.keys()].filter((t) => !CATEGORY_TYPES.some((x) => x.id === t))];
    for (const type of typeOrder) {
      const list = byType.get(type) || [];
      const ids = new Set(list.map((c) => c.id));
      const roots = list.filter((c) => !c.parent_id || !ids.has(c.parent_id));
      const walk = (cat: Category, depth: number) => {
        out.push({ cat, depth });
        if (depth >= 3) return;
        list.filter((c) => c.parent_id === cat.id).forEach((child) => walk(child, depth + 1));
      };
      roots.forEach((r) => walk(r, 0));
    }
    return out;
  })();

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
        <Text className="font-display text-3xl font-semibold text-navy">Categories Manager</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <Text className="font-display text-xl font-semibold text-navy">
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
                className={`px-4 py-2 rounded-full border ${selectedType === type.id ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
              >
                <Text className={`font-semibold text-sm ${selectedType === type.id ? 'text-white' : 'text-slate-600'}`}>
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Parent (sub-category) Selector */}
        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-3">Parent category (leave as Top level for a main category)</Text>
          <View className="flex-row flex-wrap gap-3">
            <Pressable
              onPress={() => setParentId(null)}
              className={`px-4 py-2 rounded-full border ${parentId === null ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
            >
              <Text className={`font-semibold text-sm ${parentId === null ? 'text-white' : 'text-slate-600'}`}>Top level</Text>
            </Pressable>
            {parentOptions.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setParentId(c.id)}
                className={`px-4 py-2 rounded-full border ${parentId === c.id ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
              >
                <Text className={`font-semibold text-sm ${parentId === c.id ? 'text-white' : 'text-slate-600'}`}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
          {parentOptions.length === 0 ? (
            <Text className="text-xs text-slate-400 mt-2">No other categories of this type yet — create the parent first, then the sub-category under it.</Text>
          ) : null}
        </View>

        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Category Name</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="e.g., Worksheets, Match Reports..."
              value={name}
              onChangeText={setName}
            />
          </View>
          <View className="flex-2">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Description (Optional)</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
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
      <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : categories.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No categories found. Create your first one above.</Text>
          </View>
        ) : (
          displayCategories.map(({ cat, depth }, index) => (
            <View
              key={cat.id}
              className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${index !== displayCategories.length - 1 ? 'border-b border-inkline' : ''}`}
              style={{ paddingLeft: 16 + depth * 24 }}
            >
              <View className="flex-row items-center flex-wrap gap-3">
                <Text className="font-bold text-text-primary text-base">{depth > 0 ? '↳ ' : ''}{cat.name}</Text>
                
                {/* Visual Type Badge */}
                <View className={`px-2.5 py-1 rounded-md ${getTypeStyle(cat.type)}`}>
                  <Text className="text-xs font-bold uppercase tracking-wider">{getTypeName(cat.type)}</Text>
                </View>

                {cat.description ? <Text className="text-sm text-slate-500 w-full md:w-auto">{cat.description}</Text> : null}
              </View>
              
              <View className="flex-row gap-3">
                <Pressable onPress={() => handleEdit(cat)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                  <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(cat.id, cat.name)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
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