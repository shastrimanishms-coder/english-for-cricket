import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import MascotPair from '../../components/ui/Mascots';
import RewardsCard from '../../components/ui/RewardsCard';
import { evaluateStreakBadges } from '../../lib/badgeAwards';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';

/**
 * The one gently looping animation on this screen: a cricket ball that
 * bounces ~6px on a slow 1.6s ease loop beside the greeting.
 */
function BouncingBall() {
  const bounce = useSharedValue(0);

  useEffect(() => {
    bounce.set(
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 800, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [bounce]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));

  return <Animated.Text style={[{ fontSize: 34 }, style]}>🏏</Animated.Text>;
}

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
    id: 'speaking',
    title: 'Speaking Practice',
    description: 'Listen to real cricket English, record your own voice, and practise saying it out loud.',
    cta: 'start speaking >',
    imageColor: '#FEF3C7',
    icon: '🎙️',
  },
  {
    id: 'journey',
    title: 'My Journey',
    description: 'See your whole path on one map — lessons finished, extras collected, and what is still waiting.',
    cta: 'see my journey >',
    imageColor: '#FEF9C3',
    icon: '🗺️',
  },
  {
    id: 'reading',
    title: 'Smart Reading',
    description: 'Read short stories while the words light up, or read aloud and get a score for every sentence.',
    cta: 'start reading >',
    imageColor: '#DCFCE7',
    icon: '📖',
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
      // Streak badges accrue from ANY recorded activity (games, videos,
      // lessons), not just lesson completions - re-evaluate whenever the
      // learner lands on their home screen. Fails soft.
      if (identity) await evaluateStreakBadges(identity);
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
      case 'speaking':
        router.push('/learner/speaking');
        break;
      case 'reading':
        router.push('/learner/reading');
        break;
      case 'journey':
        router.push('/learner/journey');
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
      <SafeAreaView edges={['top']} className="w-full bg-[#0A192F] shadow-sm">
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
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="max-w-7xl w-full mx-auto">
          
          {/* Welcome Header */}
          <Animated.View entering={FadeIn.duration(400)} style={{ marginBottom: 40 }}>
            <View className="flex-row items-start gap-4">
              <BouncingBall />
              <View className="flex-1">
                <Text className="text-3xl md:text-4xl font-bold text-[#0A192F] mb-2">
                  Welcome back, {studentName}!
                </Text>
                <Text className="text-slate-500 text-lg">
                  Choose a section below to continue your journey.
                </Text>
              </View>
              <MascotPair height={92} />
            </View>
          </Animated.View>

          <RewardsCard />

          {/* Feature Grid - cards fade and rise in, staggered ~60ms apart */}
          <View className="flex-row flex-wrap justify-between gap-y-8">
            {LEARNING_MODULES.map((module, index) => (
              <View
                key={module.id}
                className="w-full md:w-[48%] lg:w-[31%]"
              >
                <Animated.View
                  entering={FadeInDown.delay(index * 60).duration(500)}
                  style={{ flex: 1 }}
                >
                  <View className="flex-col flex-1">
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
                </Animated.View>
              </View>
            ))}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}