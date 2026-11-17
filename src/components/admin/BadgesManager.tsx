import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface Badge {
  id: string;
  title: string;
  description: string;
  image_url: string;
  condition_type: string;
  condition_target: string;
}

const CONDITION_TYPES = [
  { id: 'streak', label: 'Daily Login Streak' },
  { id: 'module', label: 'Complete a Module' },
  { id: 'lesson', label: 'Complete a Lesson' },
  { id: 'game', label: 'Play a Game' },
];

export default function BadgesManager() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Lookups for target selection
  const [modules, setModules] = useState<{id: string, title: string}[]>([]);
  const [lessons, setLessons] = useState<{id: string, title: string}[]>([]);
  const [games, setGames] = useState<{id: string, title: string}[]>([]);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [conditionType, setConditionType] = useState('streak');
  const [conditionTarget, setConditionTarget] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch the target lookups
      const [modRes, lesRes, gamRes, badRes] = await Promise.all([
        supabase.from('curriculum_modules').select('id, title').order('order_index'),
        supabase.from('curriculum_lessons').select('id, title').order('order_index'),
        supabase.from('games').select('id, title').order('created_at'),
        supabase.from('badges').select('*').order('created_at', { ascending: false })
      ]);

      if (modRes.error) throw modRes.error;
      if (lesRes.error) throw lesRes.error;
      if (gamRes.error) throw gamRes.error;
      if (badRes.error) throw badRes.error;

      setModules(modRes.data || []);
      setLessons(lesRes.data || []);
      setGames(gamRes.data || []);
      setBadges(badRes.data || []);
    } catch (error: any) { Alert.alert('Error', error.message); } 
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const pickImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets) setSelectedImage(result.assets[0]);
    } catch (error) { console.log(error); }
  };

  const uploadImage = async (file: any) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `badge_${Date.now()}.${fileExt}`;
    let fileBody;
    if (Platform.OS === 'web') {
      const res = await fetch(file.uri);
      fileBody = await res.blob();
    } else {
      fileBody = { uri: file.uri, type: file.mimeType || 'image/png', name: file.name } as any;
    }
    const { error } = await supabase.storage.from('badges').upload(fileName, fileBody);
    if (error) throw error;
    const { data } = supabase.storage.from('badges').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!title.trim() || !conditionTarget.trim() || (!imageUrl && !selectedImage)) {
      Alert.alert('Missing Fields', 'Title, Badge Image, and Condition Target are required.');
      return;
    }

    setSaving(true);
    try {
      let finalImageUrl = imageUrl;
      if (selectedImage) {
        finalImageUrl = await uploadImage(selectedImage);
      }

      const payload = {
        title: title.trim(),
        description: description.trim(),
        condition_type: conditionType,
        condition_target: conditionTarget.trim(),
        image_url: finalImageUrl
      };

      if (editId) {
        const { error } = await supabase.from('badges').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('badges').insert([payload]);
        if (error) throw error;
      }

      cancelEdit();
      await fetchData();
    } catch (error: any) { Alert.alert('Save Failed', error.message); } 
    finally { setSaving(false); }
  };

  const handleEdit = (badge: Badge) => {
    setEditId(badge.id);
    setTitle(badge.title);
    setDescription(badge.description);
    setConditionType(badge.condition_type);
    setConditionTarget(badge.condition_target);
    setImageUrl(badge.image_url);
    setSelectedImage(null);
  };

  const handleDelete = async (id: string, currentImg: string) => {
    const confirmDelete = async () => {
      try {
        const { error } = await supabase.from('badges').delete().eq('id', id);
        if (error) throw error;
        if (currentImg) {
          const fileName = currentImg.split('/').pop();
          if (fileName) await supabase.storage.from('badges').remove([fileName]);
        }
        await fetchData();
      } catch (error: any) { Alert.alert('Delete Failed', error.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm("Delete this badge?")) confirmDelete();
    } else {
      Alert.alert('Delete', 'Delete badge?', [{ text: 'Cancel' }, { text: 'Delete', onPress: confirmDelete }]);
    }
  };

  const cancelEdit = () => {
    setEditId(null); setTitle(''); setDescription(''); setConditionTarget(''); setImageUrl(''); setSelectedImage(null);
  };

  // Helper to render the correct target selector based on conditionType
  const renderTargetSelector = () => {
    if (conditionType === 'streak') {
      return (
        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Number of Consecutive Days</Text>
          <TextInput className="bg-canvas p-4 rounded-xl border border-inkline" placeholder="e.g., 3, 7, 30" keyboardType="numeric" value={conditionTarget} onChangeText={setConditionTarget} />
        </View>
      );
    }

    let sourceArray = modules;
    if (conditionType === 'lesson') sourceArray = lessons;
    if (conditionType === 'game') sourceArray = games;

    return (
      <View>
        <Text className="text-sm font-semibold text-text-secondary mb-2">Select Target {conditionType.charAt(0).toUpperCase() + conditionType.slice(1)}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 max-h-16">
          {sourceArray.length === 0 ? (
            <Text className="text-slate-400 p-2 text-sm italic">No items available. Create one first.</Text>
          ) : sourceArray.map(item => (
            <Pressable 
              key={item.id} 
              onPress={() => setConditionTarget(item.id)}
              className={`px-4 py-3 rounded-lg border ${conditionTarget === item.id ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
            >
              <Text className={`text-sm font-semibold ${conditionTarget === item.id ? 'text-white' : 'text-slate-600'}`}>{item.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="font-display text-3xl font-semibold text-navy">Gamification: Badges</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <Text className="font-display text-xl font-semibold text-navy">{editId ? 'Edit Badge' : 'Create New Badge'}</Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-2">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Badge Title</Text>
            <TextInput className="w-full bg-canvas p-4 rounded-xl border border-inkline" placeholder="e.g., Early Bird, Level 1 Master" value={title} onChangeText={setTitle} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Badge Artwork</Text>
            <View className="flex-row items-center gap-4">
              <Pressable onPress={pickImage} className="px-4 py-3 bg-navy rounded-full"><Text className="text-white font-bold text-sm">Upload Image</Text></Pressable>
              {selectedImage ? <Text className="text-pitch font-semibold text-xs" numberOfLines={1}>{selectedImage.name}</Text>
              : imageUrl ? <Image source={{ uri: imageUrl }} className="w-12 h-12 rounded-full border border-inkline" />
              : null}
            </View>
          </View>
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Unlock Description (Shown to students)</Text>
          <TextInput className="w-full bg-canvas p-4 rounded-xl border border-inkline" placeholder="e.g., Earned for logging in 3 days in a row!" value={description} onChangeText={setDescription} />
        </View>

        <View className="border-t border-inkline pt-6">
          <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Unlock Conditions</Text>
          <View className="mb-4">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Requirement Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
              {CONDITION_TYPES.map(type => (
                <Pressable 
                  key={type.id} 
                  onPress={() => { setConditionType(type.id); setConditionTarget(''); }}
                  className={`px-4 py-2 rounded-full border ${conditionType === type.id ? 'border-navy bg-navy' : 'border-inkline bg-canvas'}`}
                >
                  <Text className={`font-semibold text-sm ${conditionType === type.id ? 'text-white' : 'text-slate-600'}`}>{type.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {renderTargetSelector()}
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-inkline pt-4">
          {editId && <View className="w-24"><AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" /></View>}
          <View className="w-40"><AnimatedButton title={saving ? "Saving..." : "Save Badge"} onPress={handleSave} disabled={saving} variant="primary" size="sm" /></View>
        </View>
      </View>

      {/* List */}
      <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
        {loading ? <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        : badges.length === 0 ? <View className="p-8 items-center"><Text className="text-slate-500">No badges created yet.</Text></View>
        : badges.map((badge, index) => {
            const cType = CONDITION_TYPES.find(c => c.id === badge.condition_type)?.label || badge.condition_type;
            return (
              <View key={badge.id} className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 ${index !== badges.length - 1 ? 'border-b border-inkline' : ''}`}>
                <View className="flex-row items-center gap-4 flex-1">
                  {badge.image_url ? <Image source={{ uri: badge.image_url }} className="w-14 h-14 rounded-full bg-slate-100 border border-inkline" />
                  : <View className="w-14 h-14 rounded-full bg-slate-100" />}
                  <View className="flex-1">
                    <Text className="font-bold text-text-primary text-base">{badge.title}</Text>
                    <Text className="text-xs font-bold text-pitch uppercase mt-0.5">Unlocks by: {cType}</Text>
                    {badge.description ? <Text className="text-sm text-slate-500 mt-1">{badge.description}</Text> : null}
                  </View>
                </View>
                
                <View className="flex-row gap-3">
                  <Pressable onPress={() => handleEdit(badge)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                    <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(badge.id, badge.image_url)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                    <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
        })}
      </View>
    </View>
  );
}