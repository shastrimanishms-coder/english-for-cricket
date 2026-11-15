import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface FAQ {
  id: string;
  section_name: string;
  question: string;
  answer: string;
  video_url: string;
  order_index: number;
}

export default function HelpCenterManager() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [existingSections, setExistingSections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [orderIndex, setOrderIndex] = useState('0');

  const fetchFaqs = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_faqs')
        .select('*')
        .order('section_name', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;
      
      const fetchedFaqs = data || [];
      setFaqs(fetchedFaqs);
      
      // Extract unique section names for quick-select chips
      const sections = Array.from(new Set(fetchedFaqs.map(f => f.section_name)));
      setExistingSections(sections as string[]);
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchFaqs();
    })();
  }, [fetchFaqs]);

  const handleSave = async () => {
    if (!sectionName.trim() || !question.trim() || !answer.trim()) {
      Alert.alert('Missing Fields', 'Section, Question, and Answer are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        section_name: sectionName.trim(),
        question: question.trim(),
        answer: answer.trim(),
        video_url: videoUrl.trim(),
        order_index: parseInt(orderIndex) || 0,
      };

      if (editId) {
        const { error } = await supabase.from('support_faqs').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('support_faqs').insert([payload]);
        if (error) throw error;
      }

      cancelEdit();
      await fetchFaqs();
    } catch (error: any) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (faq: FAQ) => {
    setEditId(faq.id);
    setSectionName(faq.section_name);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setVideoUrl(faq.video_url || '');
    setOrderIndex(faq.order_index?.toString() || '0');
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = () => executeDelete(id);

    if (Platform.OS === 'web') {
      if (window.confirm('Delete this support question?')) confirmDelete();
    } else {
      Alert.alert('Delete', 'Delete this support question?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('support_faqs').delete().eq('id', id);
      if (error) throw error;
      await fetchFaqs();
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setSectionName('');
    setQuestion('');
    setAnswer('');
    setVideoUrl('');
    setOrderIndex('0');
  };

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-text-primary">Help Center & FAQ Manager</Text>
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 gap-6">
        <Text className="text-lg font-bold text-[#0A192F]">
          {editId ? 'Edit Support Item' : 'Add Support Item'}
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Section / Category</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 mb-2"
              placeholder="e.g., Getting Started, Gameplay"
              value={sectionName}
              onChangeText={setSectionName}
            />
            {existingSections.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                {existingSections.map(sec => (
                  <Pressable 
                    key={sec} 
                    onPress={() => setSectionName(sec)}
                    className="px-3 py-1.5 bg-slate-100 rounded-md border border-slate-200 mr-2"
                  >
                    <Text className="text-xs font-bold text-slate-600">{sec}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
          <View className="w-full md:w-32">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Order Index</Text>
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
          <Text className="text-sm font-semibold text-text-secondary mb-2">Question / Topic</Text>
          <TextInput
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
            placeholder="e.g., How do I reset a student PIN?"
            value={question}
            onChangeText={setQuestion}
          />
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Answer</Text>
          <TextInput
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 min-h-[100px]"
            placeholder="Provide the step-by-step answer..."
            value={answer}
            onChangeText={setAnswer}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Embedded Video URL (Optional)</Text>
          <TextInput
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
            placeholder="https://youtube.com/watch?v=..."
            value={videoUrl}
            onChangeText={setVideoUrl}
            autoCapitalize="none"
          />
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-slate-100 pt-4">
          {editId && (
            <View className="w-24">
              <AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" />
            </View>
          )}
          <View className="w-32">
            <AnimatedButton 
              title={saving ? "Saving..." : "Save Item"} 
              onPress={handleSave} 
              disabled={saving} 
              variant="primary" 
              size="sm" 
            />
          </View>
        </View>
      </View>

      {/* FAQs List */}
      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : faqs.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No support articles created yet.</Text>
          </View>
        ) : (
          faqs.map((faq, index) => (
            <View 
              key={faq.id} 
              className={`flex-col md:flex-row justify-between items-start p-4 gap-4 ${index !== faqs.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              <View className="flex-1 pr-4">
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-xs font-bold text-brand uppercase tracking-wider">{faq.section_name}</Text>
                  {faq.video_url && <Text className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">Has Video</Text>}
                </View>
                <Text className="font-bold text-text-primary text-base mb-1">{faq.question}</Text>
                <Text className="text-sm text-slate-500" numberOfLines={2}>{faq.answer}</Text>
              </View>
              
              <View className="flex-row gap-3 mt-2 md:mt-0">
                <Pressable onPress={() => handleEdit(faq)} className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200">
                  <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(faq.id)} className="px-3 py-1.5 bg-red-50 rounded border border-red-100">
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