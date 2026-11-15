import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Platform, Pressable, SafeAreaView, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function LessonPlayerShell() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  // Player State
  const [loading, setLoading] = useState(true);
  const [slides, setSlides] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetchLessonData();
  }, [id]);

  const fetchLessonData = async () => {
    try {
      // We will expand this query to fetch the slides array in the next step
      const { data, error } = await supabase
        .from('curriculum_lessons')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      // Placeholder data until we attach the real slide renderer
      setSlides([1, 2, 3, 4]); 
    } catch (error: any) {
      Alert.alert('Error loading lesson', error.message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleExit = () => {
    const exitAction = () => router.back();

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to quit? You will lose your progress.')) {
        exitAction();
      }
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert('Quit Lesson?', 'You will lose your current progress.', [
        { text: 'Keep Learning', style: 'cancel' },
        { text: 'Quit', style: 'destructive', onPress: exitAction }
      ]);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background items-center justify-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </SafeAreaView>
    );
  }

  // Calculate percentage for the progress bar
  const progressPercentage = slides.length > 0 ? ((currentIndex + 1) / slides.length) * 100 : 0;
  // Dynamically bound the height so it never scrolls, regardless of device
  const screenHeight = Dimensions.get('window').height;

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <View className="flex-1 px-4 py-2 md:px-8" style={{ maxHeight: screenHeight }}>
        
        {/* Top Navigation & Progress Bar */}
        <View className="flex-row items-center justify-between mb-6 pt-2">
          <Pressable onPress={handleExit} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
            <Text className="text-2xl text-slate-400 font-bold">✕</Text>
          </Pressable>
          
          <View className="flex-1 h-4 bg-slate-200 rounded-full mx-4 overflow-hidden">
            <View 
              className="h-full bg-brand rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${progressPercentage}%` }} 
            />
          </View>

          {/* Placeholder for streak/hearts or accuracy score */}
          <View className="px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
            <Text className="text-xs font-bold text-slate-500 uppercase">Focus</Text>
          </View>
        </View>

        {/* Dynamic Slide Container - Fills remaining exact space */}
        <View className="flex-1 items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-4">
          <Text className="text-slate-400 font-mono text-center">
            Player Shell Initialized.{'\n'}
            Awaiting Slide Renderer for Slide {currentIndex + 1}
          </Text>
        </View>

      </View>
    </SafeAreaView>
  );
}