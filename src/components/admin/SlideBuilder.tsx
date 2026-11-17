import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

// Database Interfaces
interface Module { id: string; title: string; order_index: number; }
interface Lesson { id: string; title: string; order_index: number; }
interface Slide {
  id: string;
  lesson_id: string;
  slide_type: string;
  prompt_text: string;
  media_url: string;
  audio_url: string;
  correct_answer: string;
  options: any; 
  order_index: number;
}

const TEMPLATES = [
  { id: 'focus_1up', label: 'Single Focus', icon: '🖼️', desc: '1 Image, 1 Phrase (Intro or Speech)' },
  { id: 'grid_4up', label: '4-Up Intro Grid', icon: '🪟', desc: '4 Images to tap and listen' },
  { id: 'quiz_4up', label: 'Listen & Match', icon: '🎯', desc: '1 Prompt, 4 Image Choices' },
  { id: 'typing', label: 'Typing Practice', icon: '⌨️', desc: '1 Image, Text Input Challenge' },
  { id: 'speak_repeat', label: 'Speak & Repeat', icon: '🎙️', desc: 'Listen, say it back, get a score' },
];

export default function SlideBuilder() {
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [slideType, setSlideType] = useState('focus_1up');
  const [promptText, setPromptText] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState(''); 
  const [orderIndex, setOrderIndex] = useState('0');
  
  // Dynamic Panels State
  const [panels, setPanels] = useState([
    { id: 0, text: '', mediaUrl: '', audioUrl: '', localImage: null as any, localAudio: null as any, isCorrect: true },
    { id: 1, text: '', mediaUrl: '', audioUrl: '', localImage: null as any, localAudio: null as any, isCorrect: false },
    { id: 2, text: '', mediaUrl: '', audioUrl: '', localImage: null as any, localAudio: null as any, isCorrect: false },
    { id: 3, text: '', mediaUrl: '', audioUrl: '', localImage: null as any, localAudio: null as any, isCorrect: false },
  ]);

  const fetchModules = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('curriculum_modules').select('*').order('order_index');
      if (error) throw error;
      setModules(data || []);
      if (data && data.length > 0) setSelectedModuleId(data[0].id);
    } catch (error: any) { Alert.alert('Error', error.message); } 
    finally { setLoading(false); }
  }, []);

  const fetchLessons = useCallback(async (modId: string) => {
    try {
      const { data, error } = await supabase.from('curriculum_lessons').select('*').eq('module_id', modId).order('order_index');
      if (error) throw error;
      setLessons(data || []);
    } catch (error: any) { Alert.alert('Error', error.message); }
  }, []);

  const fetchSlides = useCallback(async (lesId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('lesson_slides').select('*').eq('lesson_id', lesId).order('order_index');
      if (error) throw error;
      setSlides(data || []);
      setOrderIndex(data ? data.length.toString() : '0');
    } catch (error: any) { Alert.alert('Error', error.message); } 
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchModules();
    })();
  }, [fetchModules]);

  useEffect(() => {
    if (selectedModuleId) {
      (async () => {
        await fetchLessons(selectedModuleId);
      })();
    }
  }, [selectedModuleId, fetchLessons]);

  useEffect(() => {
    if (selectedLessonId) {
      (async () => {
        await fetchSlides(selectedLessonId);
      })();
    }
  }, [selectedLessonId, fetchSlides]);

  // Switching modules invalidates the lesson/slide selection. Doing the
  // reset here, in the event handler, instead of in an effect avoids the
  // setState-in-effect cascade. The initial module chosen by fetchModules
  // needs no reset because the selection starts empty anyway.
  const handleSelectModule = (modId: string) => {
    if (modId === selectedModuleId) return;
    setSelectedModuleId(modId);
    setSelectedLessonId('');
    setSlides([]);
  };

  const updatePanel = (index: number, field: string, value: any) => {
    const newPanels = [...panels];
    (newPanels[index] as any)[field] = value;
    setPanels(newPanels);
  };

  const pickImage = async (index: number) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets) updatePanel(index, 'localImage', result.assets[0]);
    } catch (error) { console.log(error); }
  };

  const pickAudio = async (index: number) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets) updatePanel(index, 'localAudio', result.assets[0]);
    } catch (error) { console.log(error); }
  };

  const uploadFile = async (file: any, prefix: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${prefix}_${Date.now()}_${Math.floor(Math.random()*1000)}.${fileExt}`;
    let fileBody;
    if (Platform.OS === 'web') {
      const res = await fetch(file.uri);
      fileBody = await res.blob();
    } else {
      fileBody = { uri: file.uri, type: file.mimeType || 'application/octet-stream', name: file.name } as any;
    }
    const { error } = await supabase.storage.from('lesson_media').upload(fileName, fileBody);
    if (error) throw error;
    const { data } = supabase.storage.from('lesson_media').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!selectedLessonId) return Alert.alert('Missing Lesson', 'Please select a lesson.');
    if (slideType.includes('4up') && !panels[0].text && !promptText) {
      return Alert.alert('Missing Info', 'Please provide text for the panels or prompt.');
    }
    if (slideType === 'speak_repeat' && !correctAnswer.trim() && !promptText.trim()) {
      return Alert.alert('Missing Phrase', 'Please enter the phrase the student must say.');
    }

    setSaving(true);
    try {
      const activePanelCount = slideType.includes('4up') ? 4 : 1;
      const processedPanels = [];

      for (let i = 0; i < activePanelCount; i++) {
        const p = panels[i];
        let finalImg = p.mediaUrl;
        let finalAud = p.audioUrl;
        if (p.localImage) finalImg = await uploadFile(p.localImage, 'img');
        if (p.localAudio) finalAud = await uploadFile(p.localAudio, 'aud');
        
        processedPanels.push({
          id: i,
          text: p.text.trim(),
          media_url: finalImg,
          audio_url: finalAud,
          is_correct: slideType === 'quiz_4up' ? p.isCorrect : true
        });
      }

      // Speak & Repeat: the phrase lives in correct_answer (it is what
      // gets scored); mirror it into prompt_text when no separate
      // instruction was typed, so lists and the player always have
      // text to show.
      const finalPromptText =
        slideType === 'speak_repeat' && !promptText.trim()
          ? correctAnswer.trim()
          : promptText.trim();

      const payload = {
        lesson_id: selectedLessonId,
        slide_type: slideType,
        prompt_text: finalPromptText,
        correct_answer: correctAnswer.trim(),
        order_index: parseInt(orderIndex) || 0,
        media_url: activePanelCount === 1 ? processedPanels[0].media_url : '',
        audio_url: activePanelCount === 1 ? processedPanels[0].audio_url : '',
        options: activePanelCount > 1 ? { panels: processedPanels } : null,
      };

      if (editId) {
        const { error } = await supabase.from('lesson_slides').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lesson_slides').insert([payload]);
        if (error) throw error;
      }

      cancelEdit();
      await fetchSlides(selectedLessonId);
    } catch (error: any) { Alert.alert('Save Failed', error.message); } 
    finally { setSaving(false); }
  };

  const handleEdit = (slide: Slide) => {
    setEditId(slide.id);
    setSlideType(slide.slide_type);
    setPromptText(slide.prompt_text || '');
    setCorrectAnswer(slide.correct_answer || '');
    setOrderIndex(slide.order_index?.toString() || '0');
    
    const newPanels = [...panels];
    if (slide.options && slide.options.panels) {
      slide.options.panels.forEach((p: any, i: number) => {
        if (i < 4) {
          newPanels[i].text = p.text || '';
          newPanels[i].mediaUrl = p.media_url || '';
          newPanels[i].audioUrl = p.audio_url || '';
          newPanels[i].isCorrect = p.is_correct || false;
          newPanels[i].localImage = null;
          newPanels[i].localAudio = null;
        }
      });
    } else {
      newPanels[0].mediaUrl = slide.media_url || '';
      newPanels[0].audioUrl = slide.audio_url || '';
      newPanels[0].text = slide.prompt_text || '';
    }
    setPanels(newPanels);
  };

  const handleDelete = async (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Delete this slide?")) executeDelete(id);
    } else {
      Alert.alert('Delete', 'Delete slide?', [{ text: 'Cancel' }, { text: 'Delete', onPress: () => executeDelete(id) }]);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      await supabase.from('lesson_slides').delete().eq('id', id);
      await fetchSlides(selectedLessonId);
    } catch (error: any) { Alert.alert('Error', error.message); }
  };

  const cancelEdit = () => {
    setEditId(null);
    setPromptText('');
    setCorrectAnswer('');
    setPanels(panels.map(p => ({ ...p, text: '', mediaUrl: '', audioUrl: '', localImage: null, localAudio: null, isCorrect: p.id === 0 })));
    setOrderIndex(slides.length.toString());
  };

  const renderPanelEditor = (index: number, showCorrectRadio = false) => {
    const p = panels[index];
    return (
      <View key={index} className={`flex-1 min-w-[250px] p-4 rounded-xl border ${p.isCorrect && showCorrectRadio ? 'border-emerald-500 bg-emerald-50' : 'border-inkline bg-canvas'}`}>
        <View className="flex-row justify-between items-center mb-3">
          <Text className="font-bold text-slate-700">Panel {index + 1}</Text>
          {showCorrectRadio && (
            <Pressable onPress={() => {
              const newPanels = [...panels];
              newPanels.forEach(np => np.isCorrect = false);
              newPanels[index].isCorrect = true;
              setPanels(newPanels);
            }} className={`px-3 py-1 rounded-full border ${p.isCorrect ? 'bg-pitch border-pitch-dark' : 'bg-white border-inkline'}`}>
              <Text className={p.isCorrect ? 'text-white text-xs font-bold' : 'text-slate-400 text-xs'}>Target Answer</Text>
            </Pressable>
          )}
        </View>

        <TextInput
          className="w-full bg-white p-3 rounded-xl border border-inkline mb-3"
          placeholder="Text (e.g., 'a boy')"
          value={p.text}
          onChangeText={(val) => updatePanel(index, 'text', val)}
        />
        
        <View className="flex-row gap-2 mb-2">
          <Pressable onPress={() => pickImage(index)} className="flex-1 bg-slate-200 py-2 items-center rounded-lg">
            <Text className="text-xs font-bold">🖼️ Image</Text>
          </Pressable>
          <Pressable onPress={() => pickAudio(index)} className="flex-1 bg-slate-200 py-2 items-center rounded-lg">
            <Text className="text-xs font-bold">🎧 Audio</Text>
          </Pressable>
        </View>
        
        <View className="flex-row gap-2">
          {(p.localImage || p.mediaUrl) ? <Text className="text-xs text-pitch font-bold">✓ Img</Text> : null}
          {(p.localAudio || p.audioUrl) ? <Text className="text-xs text-pitch font-bold">✓ Aud</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <View className="space-y-6">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="font-display text-3xl font-semibold text-navy">Rosetta Slide Builder</Text>
      </View>

      {/* Target Selector */}
      <View className="bg-navy p-4 rounded-[20px] flex-col md:flex-row gap-4 items-center z-10 shadow-sm">
        <Text className="font-sans text-white font-bold whitespace-nowrap">Editing Target:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1 max-h-12 bg-white/10 rounded-lg p-1">
          {modules.map(mod => (
            <Pressable key={mod.id} onPress={() => handleSelectModule(mod.id)} className={`px-3 py-1.5 rounded-full ${selectedModuleId === mod.id ? 'bg-gold' : 'hover:bg-white/10'}`}>
              <Text className={`text-sm ${selectedModuleId === mod.id ? 'text-navy font-bold' : 'text-slate-300'}`}>{mod.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text className="text-white font-bold">›</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1 max-h-12 bg-white/10 rounded-lg p-1">
          {lessons.map(les => (
            <Pressable key={les.id} onPress={() => setSelectedLessonId(les.id)} className={`px-3 py-1.5 rounded-full ${selectedLessonId === les.id ? 'bg-gold' : 'hover:bg-white/10'}`}>
              <Text className={`text-sm ${selectedLessonId === les.id ? 'text-navy font-bold' : 'text-slate-300'}`}>{les.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {!selectedLessonId ? (
        <View className="bg-white p-12 rounded-[20px] border border-inkline items-center justify-center">
          <Text className="text-slate-500 text-lg">Select a Module and Lesson to build interactive slides.</Text>
        </View>
      ) : (
        <>
          {/* Editor Form */}
          <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6">
            <View className="flex-row justify-between items-center">
              <Text className="font-display text-xl font-semibold text-navy">{editId ? 'Edit Slide' : 'Create New Slide'}</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold text-text-secondary">Sequence #</Text>
                <TextInput className="bg-canvas p-2 rounded-lg border border-inkline w-16 text-center" keyboardType="numeric" value={orderIndex} onChangeText={setOrderIndex} />
              </View>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-3 pb-2 border-b border-inkline">
              {TEMPLATES.map((type) => (
                <Pressable
                  key={type.id}
                  onPress={() => setSlideType(type.id)}
                  className={`mr-2 px-4 py-3 rounded-xl border ${slideType === type.id ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
                >
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-lg">{type.icon}</Text>
                    <Text className={`font-bold text-sm ${slideType === type.id ? 'text-white' : 'text-slate-700'}`}>{type.label}</Text>
                  </View>
                  <Text className={`text-xs ${slideType === type.id ? 'text-slate-300' : 'text-slate-500'}`}>{type.desc}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View className="mt-4">
              {(slideType === 'focus_1up' || slideType === 'typing') && (
                <View className="space-y-4">
                  <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider">Main Presentation Content</Text>
                  {renderPanelEditor(0)}
                  
                  {(slideType === 'focus_1up' || slideType === 'typing') && (
                    <View className="bg-pitch/5 p-4 rounded-xl border border-pitch/20 mt-4">
                      <Text className="text-sm font-bold text-pitch mb-2">🎙️ Target Answer (Required for Voice AI / Typing Verification)</Text>
                      <TextInput
                        className="w-full bg-white p-4 rounded-xl border border-inkline"
                        placeholder="e.g., The boy is eating."
                        value={correctAnswer}
                        onChangeText={setCorrectAnswer}
                      />
                    </View>
                  )}
                </View>
              )}

              {slideType === 'speak_repeat' && (
                <View className="space-y-4">
                  <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider">Main Presentation Content</Text>
                  {renderPanelEditor(0)}
                  <View className="bg-pitch/5 p-4 rounded-xl border border-pitch/20 mt-4">
                    <Text className="text-sm font-bold text-pitch mb-2">🎙️ Phrase the student must say (Required)</Text>
                    <TextInput
                      className="w-full bg-white p-4 rounded-xl border border-inkline"
                      placeholder="e.g., The bowler bowls the ball."
                      value={correctAnswer}
                      onChangeText={setCorrectAnswer}
                    />
                    <Text className="text-xs text-slate-500 mt-2">
                      The student listens (the Panel 1 audio above, or the device voice), says the
                      phrase into the microphone, and is scored word by word. 70% or more passes.
                      Add an instruction below only if you want different wording shown above the phrase.
                    </Text>
                    <TextInput
                      className="w-full bg-white p-4 rounded-xl border border-inkline mt-3"
                      placeholder="Optional instruction, e.g., Say it like a commentator!"
                      value={promptText}
                      onChangeText={setPromptText}
                    />
                  </View>
                </View>
              )}

              {(slideType === 'grid_4up' || slideType === 'quiz_4up') && (
                <View className="space-y-4">
                  {slideType === 'quiz_4up' && (
                    <View className="mb-4 bg-gold-light/40 p-4 rounded-xl border border-gold/40">
                      <Text className="text-sm font-bold text-navy mb-2">🎯 Main Quiz Prompt (Bottom Area)</Text>
                      <TextInput
                        className="w-full bg-white p-4 rounded-xl border border-inkline"
                        placeholder="e.g., The girl is drinking. (Select the matching image above)"
                        value={promptText}
                        onChangeText={setPromptText}
                      />
                    </View>
                  )}

                  <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider">Configure 4 Images (2x2 Grid)</Text>
                  <View className="flex-row flex-wrap gap-4">
                    {renderPanelEditor(0, slideType === 'quiz_4up')}
                    {renderPanelEditor(1, slideType === 'quiz_4up')}
                    {renderPanelEditor(2, slideType === 'quiz_4up')}
                    {renderPanelEditor(3, slideType === 'quiz_4up')}
                  </View>
                </View>
              )}
            </View>

            <View className="flex-row justify-end gap-4 mt-4 border-t border-inkline pt-4">
              {editId && <View className="w-24"><AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" /></View>}
              <View className="w-48"><AnimatedButton title={saving ? "Uploading Assets..." : "Save Interactive Slide"} onPress={handleSave} disabled={saving} variant="primary" size="sm" /></View>
            </View>
          </View>

          {/* List of Slides */}
          <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
            {loading ? <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
            : slides.length === 0 ? <View className="p-8 items-center"><Text className="text-slate-500">No slides built for this lesson yet.</Text></View>
            : slides.map((slide, index) => {
                const typeInfo = TEMPLATES.find(t => t.id === slide.slide_type) || TEMPLATES[0];
                const isGrid = slide.slide_type.includes('4up');
                const pCount = isGrid && slide.options?.panels ? slide.options.panels.length : 1;

                return (
                  <View key={slide.id} className={`flex-col md:flex-row justify-between items-start md:items-center p-4 gap-4 ${index !== slides.length - 1 ? 'border-b border-inkline' : ''}`}>
                    <View className="flex-row items-center gap-4 flex-1">
                      <View className="w-10 h-10 rounded-full bg-slate-100 items-center justify-center">
                        <Text className="font-bold text-slate-500">{slide.order_index}</Text>
                      </View>
                      
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Text className="text-xs uppercase font-bold tracking-wider text-navy">{typeInfo.icon} {typeInfo.label}</Text>
                          <Text className="text-xs text-slate-400">| {pCount} Panels</Text>
                        </View>
                        <Text className="font-bold text-text-primary text-base" numberOfLines={2}>
                          {slide.prompt_text || (isGrid && slide.options?.panels ? slide.options.panels[0].text + '...' : 'No prompt')}
                        </Text>
                      </View>
                    </View>
                    
                    <View className="flex-row gap-3">
                      <Pressable onPress={() => handleEdit(slide)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                        <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDelete(slide.id)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                        <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                );
            })}
          </View>
        </>
      )}
    </View>
  );
}