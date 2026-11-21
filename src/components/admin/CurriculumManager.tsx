import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, Pressable, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface Module {
  id: string;
  title: string;
  description: string;
  order_index: number;
  stage_id?: string | null;
}

interface Stage {
  id: string;
  title: string;
  description: string | null;
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

  // Stages (migration 17). Fail-soft: stagesAvailable stays false until the
  // curriculum_stages table exists, and the stage picker simply hides.
  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesAvailable, setStagesAvailable] = useState(false);
  const [formStageId, setFormStageId] = useState<string | null>(null);
  const [stageEditId, setStageEditId] = useState<string | null>(null);
  const [stageTitle, setStageTitle] = useState('');
  const [stageOrder, setStageOrder] = useState('0');
  const [stageSaving, setStageSaving] = useState(false);
  // Which stage groups are expanded in the modules list (all start
  // collapsed so the list opens short).
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [orderIndex, setOrderIndex] = useState('0');

  const fetchModules = useCallback(async () => {
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
  }, []);

  const fetchStages = useCallback(async () => {
    const { data, error } = await supabase
      .from('curriculum_stages')
      .select('*')
      .order('order_index', { ascending: true });
    if (error) {
      setStagesAvailable(false);
      setStages([]);
      return;
    }
    setStagesAvailable(true);
    setStages((data || []) as Stage[]);
  }, []);

  useEffect(() => {
    (async () => {
      await fetchModules();
      await fetchStages();
    })();
  }, [fetchModules, fetchStages]);

  const saveStage = async () => {
    if (!stageTitle.trim()) {
      Alert.alert('Missing Field', 'Stage title is required.');
      return;
    }
    setStageSaving(true);
    try {
      const payload = { title: stageTitle.trim(), order_index: parseInt(stageOrder) || 0 };
      if (stageEditId) {
        const { error } = await supabase.from('curriculum_stages').update(payload).eq('id', stageEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('curriculum_stages').insert([payload]);
        if (error) throw error;
      }
      setStageEditId(null);
      setStageTitle('');
      setStageOrder(stages.length.toString());
      await fetchStages();
    } catch (error: any) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setStageSaving(false);
    }
  };

  const deleteStage = async (stage: Stage) => {
    const run = async () => {
      const { error } = await supabase.from('curriculum_stages').delete().eq('id', stage.id);
      if (error) Alert.alert('Delete Failed', error.message);
      else {
        if (formStageId === stage.id) setFormStageId(null);
        await fetchStages();
        await fetchModules();
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete stage "${stage.title}"? Its modules keep existing, just without a stage.`)) run();
    } else {
      Alert.alert('Delete Stage', `Delete "${stage.title}"? Modules keep existing without a stage.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: run },
      ]);
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

    if (activeView === 'modules' && stagesAvailable) {
      payload.stage_id = formStageId;
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
    if (activeView === 'modules') setFormStageId(item.stage_id ?? null);
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
    setFormStageId(null);

    // Auto-increment the order index for the next item based on current length
    const nextOrder = activeView === 'modules' ? modules.length : lessons.length;
    setOrderIndex(nextOrder.toString());
  };

  const isModuleView = activeView === 'modules';

  // ---- Collapsible stage groups for the modules list -----------------
  // Forty modules in one flat list is unwieldy, so the modules view
  // groups them under their stage with tap-to-expand headers; a module
  // row itself is shared with the (short) lessons list.
  const toggleStageGroup = (key: string) =>
    setExpandedStages((prev) => ({ ...prev, [key]: !prev[key] }));

  const orphanModules = modules.filter(
    (m) => !m.stage_id || !stages.some((s) => s.id === m.stage_id),
  );

  const renderItemRow = (item: any, isLast: boolean) => (
    <View
      key={item.id}
      className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 md:gap-0 ${isLast ? '' : 'border-b border-inkline'}`}
    >
      <View className="flex-row items-center gap-4 flex-1">
        <View className="w-10 h-10 rounded-full bg-pitch/10 items-center justify-center">
          <Text className="font-bold text-pitch">{item.order_index}</Text>
        </View>
        <View>
          <Text className="font-bold text-text-primary text-base">{item.title}</Text>
          {item.description ? <Text className="text-sm text-slate-500 mt-1">{item.description}</Text> : null}
        </View>
      </View>
      <View className="flex-row gap-3">
        {isModuleView && (
          <Pressable onPress={() => openLessonsView(item)} className="px-3 py-1.5 bg-canvas rounded-full border border-inkline">
            <Text className="text-navy text-sm font-semibold">Manage Lessons →</Text>
          </Pressable>
        )}
        <Pressable onPress={() => handleEdit(item)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
          <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
        </Pressable>
        <Pressable onPress={() => handleDelete(item.id, item.title)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
          <Text className="text-red-600 text-sm font-semibold">Delete</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderStageGroupHeader = (groupKey: string, label: string, count: number, expanded: boolean) => (
    <Pressable
      onPress={() => toggleStageGroup(groupKey)}
      className="flex-row items-center justify-between px-4 py-3.5 bg-slate-50 border-b border-inkline"
    >
      <Text className="font-display font-semibold text-navy">
        {expanded ? '▾' : '▸'}  {label}
        <Text className="font-sans text-slate-400 font-normal text-sm">   ·   {count} modules</Text>
      </Text>
      <Text className="text-xs font-bold text-gold-dark uppercase tracking-wider">{expanded ? 'Hide' : 'Show'}</Text>
    </Pressable>
  );

  return (
    <View className="space-y-8 gap-8">
      {/* Header Area */}
      <View className="flex-row justify-between items-center">
        {isModuleView ? (
          <Text className="font-display text-3xl font-semibold text-navy">Curriculum Modules</Text>
        ) : (
          <View className="flex-row items-center gap-4">
            <Pressable onPress={goBackToModules} className="px-3 py-2 bg-slate-100 rounded-full border border-inkline">
              <Text className="font-bold text-slate-700">← Back</Text>
            </Pressable>
            <View>
              <Text className="text-xs font-bold text-pitch uppercase tracking-wider">Managing Lessons For</Text>
              <Text className="font-display text-3xl font-semibold text-navy">{selectedModule?.title}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <Text className="font-display text-xl font-semibold text-navy">
          {editId 
            ? `Edit ${isModuleView ? 'Module' : 'Lesson'}` 
            : `Add New ${isModuleView ? 'Module' : 'Lesson'}`
          }
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-2">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Title</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder={isModuleView ? "e.g., Level 1: The Pitch" : "e.g., Lesson 1: Vocabulary"}
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Order / Sequence Number</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
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
            className="w-full bg-canvas p-4 rounded-xl border border-inkline"
            placeholder="Briefly describe what this covers..."
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {isModuleView && stagesAvailable ? (
          <View>
            <Text className="text-sm font-semibold text-text-secondary mb-2">Stage (Stage → Module → Lesson)</Text>
            <View className="flex-row flex-wrap gap-2">
              <Pressable
                onPress={() => setFormStageId(null)}
                className={`px-3 py-2 rounded-full border ${formStageId === null ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
              >
                <Text className={`text-xs font-semibold ${formStageId === null ? 'text-white' : 'text-slate-600'}`}>No stage</Text>
              </Pressable>
              {stages.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setFormStageId(s.id)}
                  className={`px-3 py-2 rounded-full border ${formStageId === s.id ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
                >
                  <Text className={`text-xs font-semibold ${formStageId === s.id ? 'text-white' : 'text-slate-600'}`}>{s.title}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

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

      {/* Stages Manager (modules view only) */}
      {isModuleView ? (
        <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm gap-4">
          <Text className="font-display text-xl font-semibold text-navy">Stages</Text>
          {!stagesAvailable ? (
            <Text className="text-sm text-slate-500">
              Stages live above modules (Stage → Module → Lesson). Run migration 17 in Supabase to switch them on — modules keep working without stages until then.
            </Text>
          ) : (
            <>
              <View className="flex-col md:flex-row gap-4">
                <View className="flex-2">
                  <Text className="text-sm font-semibold text-text-secondary mb-2">Stage Title</Text>
                  <TextInput
                    className="w-full bg-canvas p-3 rounded-xl border border-inkline"
                    placeholder="e.g., Stage 1: The Foundation"
                    value={stageTitle}
                    onChangeText={setStageTitle}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-text-secondary mb-2">Order</Text>
                  <TextInput
                    className="w-full bg-canvas p-3 rounded-xl border border-inkline"
                    placeholder="0"
                    keyboardType="numeric"
                    value={stageOrder}
                    onChangeText={setStageOrder}
                  />
                </View>
                <View className="justify-end">
                  <AnimatedButton
                    title={stageSaving ? 'Saving...' : stageEditId ? 'Save Stage' : 'Add Stage'}
                    onPress={saveStage}
                    disabled={stageSaving}
                    variant="primary"
                    size="sm"
                  />
                </View>
                {stageEditId ? (
                  <View className="justify-end">
                    <AnimatedButton
                      title="Cancel"
                      onPress={() => { setStageEditId(null); setStageTitle(''); }}
                      variant="outline"
                      size="sm"
                    />
                  </View>
                ) : null}
              </View>
              {stages.length === 0 ? (
                <Text className="text-sm text-slate-500">No stages yet. Create Stage 1, then pick it on each module below.</Text>
              ) : (
                stages.map((s) => (
                  <View key={s.id} className="flex-row items-center justify-between border-t border-inkline pt-3">
                    <Text className="font-semibold text-text-primary">{s.order_index}. {s.title}
                      <Text className="text-slate-400 font-normal">  ·  {modules.filter((m) => m.stage_id === s.id).length} modules</Text>
                    </Text>
                    <View className="flex-row gap-3">
                      <Pressable
                        onPress={() => { setStageEditId(s.id); setStageTitle(s.title); setStageOrder(s.order_index.toString()); }}
                        className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline"
                      >
                        <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => deleteStage(s)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                        <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </View>
      ) : null}

      {/* Dynamic List: modules are grouped under collapsible stage
          headers; lessons (one module at a time) stay a short flat list. */}
      <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : isModuleView ? (
          modules.length === 0 ? (
            <View className="p-8 items-center">
              <Text className="text-slate-500">No Modules added yet.</Text>
            </View>
          ) : stagesAvailable && stages.length > 0 ? (
            <>
              {stages.map((stage) => {
                const groupModules = modules.filter((m) => m.stage_id === stage.id);
                const expanded = !!expandedStages[stage.id];
                return (
                  <View key={stage.id}>
                    {renderStageGroupHeader(stage.id, `${stage.order_index}. ${stage.title}`, groupModules.length, expanded)}
                    {expanded ? groupModules.map((m, i) => renderItemRow(m, i === groupModules.length - 1)) : null}
                  </View>
                );
              })}
              {orphanModules.length > 0 ? (
                <View>
                  {renderStageGroupHeader('__none', 'No stage', orphanModules.length, !!expandedStages['__none'])}
                  {expandedStages['__none'] ? orphanModules.map((m, i) => renderItemRow(m, i === orphanModules.length - 1)) : null}
                </View>
              ) : null}
            </>
          ) : (
            modules.map((m, i) => renderItemRow(m, i === modules.length - 1))
          )
        ) : lessons.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No Lessons added yet.</Text>
          </View>
        ) : (
          lessons.map((l, i) => renderItemRow(l, i === lessons.length - 1))
        )}
      </View>
    </View>
  );
}
