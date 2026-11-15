import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';

// Define the content modules based on the new architecture
const LEARNING_MODULES = [
  {
    id: 'path',
    title: 'Learning Path',
    description: 'Step-by-step Eiken-aligned lessons from beginner to expert. Immersion style learning.',
    cta: 'start learning >',
    imageColor: '#E0E7FF', 
    icon: '📚',
  },
  {
    id: 'games',
    title: 'Games',
    description: 'Play Jumping Bird and other educational games. Learn English while playing.',
    cta: 'learn while playing >',
    imageColor: '#CCFBF1', 
    icon: '🎮',
  },
  {
    id: 'downloads',
    title: 'Downloads',
    description: 'Download the English for Cricket workbooks, worksheets, and other study materials.',
    cta: 'download >',
    imageColor: '#FCE7F3', 
    icon: '📄',
  },
  {
    id: 'video',
    title: 'Video Lectures',
    description: 'Watch our interactive classroom video lectures and pronunciation guides.',
    cta: 'enter classroom >',
    imageColor: '#FFEDD5', 
    icon: '📺',
  },
  {
    id: 'profile',
    title: 'Student Profile',
    description: 'Manage your profile, PIN, see your earned badges, and track your progress.',
    cta: 'manage profile >',
    imageColor: '#E2E8F0', 
    icon: '👤',
  },
];

export default function LearnerDashboard() {
  const router = useRouter();
  const [studentName, setStudentName] = useState('Champion');

  // Greet the actual student: PIN students carry their display name in the
  // local session blob, email learners in user_profiles. Falls back to the
  // generic greeting when no identity resolves.
  useEffect(() => {
    (async () => {
      const identity = await getStudentIdentity();
      if (identity?.displayName) setStudentName(identity.displayName);
    })();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // PIN students have no Supabase session - their session lives in
    // AsyncStorage, so it must be cleared explicitly or "logout" would
    // leave them effectively still signed in on this device.
    await AsyncStorage.removeItem('student_session');
    router.replace('/');
  };

  // This function now handles routing dynamically based on the card clicked
  const navigateToModule = (id: string) => {
    switch (id) {
      case 'games':
        router.push('/games');
        break;
      case 'video':
        router.push('/videos');
        break;
      case 'downloads':
        router.push('/downloads');
        break;
      case 'path':
        router.push('/learner/path');
        break;
      case 'profile':
        router.push('/learner/profile');
        break;
      default:
        break;
    }
  };

  return (
    <View className="flex-1 bg-white">
      {/* Top Navigation Bar - Dark Navy */}
      <View className="w-full bg-[#0A192F] shadow-sm">
        <View className="max-w-7xl w-full mx-auto flex-row justify-between items-center p-4 md:p-6">
          <View className="flex-row items-center gap-3">
            <Text className="text-3xl">🏏</Text>
            <Text className="text-xl md:text-2xl font-bold text-white tracking-wider">
              English For Cricket
            </Text>
          </View>
          
          <Pressable 
            onPress={handleLogout}
            className="px-4 py-2 bg-white/10 rounded-lg border border-white/20 hover:bg-white/20"
          >
            <Text className="text-white font-bold text-sm">Log Out</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-7xl w-full mx-auto">
          
          {/* Welcome Header */}
          <View className="mb-10">
            <Text className="text-3xl md:text-4xl font-bold text-[#0A192F] mb-2">
              Welcome back, {studentName}!
            </Text>
            <Text className="text-slate-500 text-lg">
              Choose a section below to continue your journey.
            </Text>
          </View>

          {/* Feature Grid */}
          <View className="flex-row flex-wrap justify-between gap-y-8">
            {LEARNING_MODULES.map((module) => (
              <View 
                key={module.id} 
                className="w-full md:w-[48%] lg:w-[31%] flex-col"
              >
                {/* Image Area - Using colored blocks with emojis until real assets are added */}
                <View 
                  style={{ backgroundColor: module.imageColor }} 
                  className="w-full h-48 rounded-t-xl items-center justify-center"
                >
                  <Text className="text-7xl">{module.icon}</Text>
                </View>

                {/* Content Area */}
                <View className="pt-4 pb-2 px-1 flex-1 justify-between">
                  <View>
                    <Text className="text-2xl font-bold text-[#D4AF37] mb-3 capitalize">
                      {module.title}
                    </Text>
                    <Text className="text-slate-600 text-base leading-relaxed mb-6">
                      {module.description}
                    </Text>
                  </View>
                  
                  <Pressable onPress={() => navigateToModule(module.id)}>
                    <Text className="text-[#D4AF37] font-bold text-base uppercase tracking-wider">
                      {module.cta}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}