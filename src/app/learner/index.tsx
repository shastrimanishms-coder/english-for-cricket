import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MicroLabel } from '../../components/ui/Elegant';
import MascotPair from '../../components/ui/Mascots';
import RewardsCard from '../../components/ui/RewardsCard';
import { evaluateStreakBadges } from '../../lib/badgeAwards';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Define the content modules based on the new architecture. Icons are
// Ionicons line glyphs in navy-and-gold chips (elegant redesign) —
// the pastel emoji tiles are gone.
const LEARNING_MODULES: {
  id: string;
  title: string;
  description: string;
  cta: string;
  icon: IoniconName;
}[] = [
  {
    id: 'path',
    title: 'Learning Path',
    description: 'A structured course of lessons that carries learners from their first words to confident English, stage by stage.',
    cta: 'start learning',
    icon: 'library-outline',
  },
  {
    id: 'games',
    title: 'Games',
    description: 'Play Jumping Bird and other educational games. Learn English while playing.',
    cta: 'learn while playing',
    icon: 'game-controller-outline',
  },
  {
    id: 'downloads',
    title: 'Downloads',
    description: 'Download the English for Cricket workbooks, worksheets, and other study materials.',
    cta: 'download',
    icon: 'download-outline',
  },
  {
    id: 'video',
    title: 'Video Lectures',
    description: 'Watch our interactive classroom video lectures and pronunciation guides.',
    cta: 'enter classroom',
    icon: 'play-circle-outline',
  },
  {
    id: 'speaking',
    title: 'Speaking Practice',
    description: 'Listen to real cricket English, record your own voice, and practise saying it out loud.',
    cta: 'start speaking',
    icon: 'mic-outline',
  },
  {
    id: 'reading',
    title: 'Smart Reading',
    description: 'Read short stories while the words light up, or read aloud and get a score for every sentence.',
    cta: 'start reading',
    icon: 'book-outline',
  },
  {
    id: 'profile',
    title: 'Student Profile',
    description: 'Manage your profile, PIN, see your earned badges, and track your progress.',
    cta: 'manage profile',
    icon: 'person-outline',
  },
];

export default function LearnerDashboard() {
  const router = useRouter();
  const [studentName, setStudentName] = useState('Champion');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [showPlacementPrompt, setShowPlacementPrompt] = useState(false);

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
      if (identity) {
        await evaluateStreakBadges(identity);
        setStudentId(identity.studentId);
        // First-login placement prompt: show until the test is done on
        // this device or the learner skips it. The test itself lives
        // in the Profile ("Find Your Start") and can be retaken there
        // any time - the prompt says so.
        const done = await AsyncStorage.getItem(`placement_done_${identity.studentId}`);
        const dismissed = await AsyncStorage.getItem(`placement_prompt_dismissed_${identity.studentId}`);
        if (!done && !dismissed) setShowPlacementPrompt(true);
      }
    })();
  }, []);

  const dismissPlacementPrompt = useCallback(async () => {
    setShowPlacementPrompt(false);
    if (studentId) {
      await AsyncStorage.setItem(`placement_prompt_dismissed_${studentId}`, '1').catch(() => {});
    }
  }, [studentId]);

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
      case 'profile':
        router.push('/learner/profile');
        break;
      default:
        break;
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      {/* Top Navigation Bar - slim navy, refined type */}
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <View className="mx-auto w-full max-w-7xl flex-row items-center justify-between px-4 py-3.5 md:px-6">
          <View className="flex-row items-center gap-2.5">
            <Text className="text-2xl">🏏</Text>
            <Text className="font-display text-lg font-semibold tracking-wide text-white md:text-xl">
              English For Cricket
            </Text>
          </View>

          <Pressable
            onPress={handleLogout}
            className="rounded-full border border-white/25 px-4 py-2 active:bg-white/15"
          >
            <Text className="font-sans text-xs font-bold uppercase tracking-[1.5px] text-white">
              Log Out
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="mx-auto w-full max-w-7xl">
          {/* Welcome Header */}
          <Animated.View entering={FadeIn.duration(400)} style={{ marginBottom: 28 }}>
            <View className="flex-row items-start gap-4">
              <View className="flex-1">
                <MicroLabel className="mb-2">Your Academy</MicroLabel>
                <Text className="mb-2 font-display text-3xl font-semibold text-navy md:text-4xl">
                  Welcome back, {studentName}!
                </Text>
                <View className="mb-3 h-[2px] w-16 rounded-full bg-gold" />
                <Text className="font-sans text-base text-slate-500">
                  Choose a section below to continue your journey.
                </Text>
              </View>
              <MascotPair height={92} />
            </View>
          </Animated.View>

          <RewardsCard />

          {/* First-login placement prompt (until done or skipped) */}
          {showPlacementPrompt && (
            <View className="mb-8 rounded-[20px] border border-gold/60 bg-white p-5 shadow-sm">
              <MicroLabel className="mb-1.5">Find Your Start</MicroLabel>
              <Text className="mb-1 font-display text-xl font-semibold text-navy">
                New here? Find your starting stage
              </Text>
              <Text className="mb-4 font-sans text-slate-500">
                Take the short Find Your Start test (about 5 minutes) and we will suggest the
                best stage for you. You can skip it now and take or retake it any time from
                your Profile — nothing is ever locked.
              </Text>
              <View className="flex-row flex-wrap gap-3">
                <Pressable
                  onPress={() => router.push('/learner/placement')}
                  className="rounded-full border-b-4 border-gold-dark bg-gold px-5 py-3 active:opacity-90"
                >
                  <Text className="font-sans font-bold text-navy">Take the test</Text>
                </Pressable>
                <Pressable
                  onPress={dismissPlacementPrompt}
                  className="rounded-full border border-inkline bg-white px-5 py-3 active:opacity-90"
                >
                  <Text className="font-sans font-semibold text-slate-600">Skip for now</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Feature Grid - elegant white cards, staggered fade-in */}
          <View className="flex-row flex-wrap justify-between gap-y-5">
            {LEARNING_MODULES.map((module, index) => (
              <View key={module.id} className="w-full md:w-[48%] lg:w-[31%]">
                <Animated.View entering={FadeInDown.delay(index * 60).duration(500)} style={{ flex: 1 }}>
                  <Pressable
                    onPress={() => navigateToModule(module.id)}
                    className="flex-1 rounded-[20px] border border-inkline bg-white p-5 shadow-sm active:opacity-90"
                  >
                    <View className="mb-4 h-[52px] w-[52px] items-center justify-center rounded-full bg-navy">
                      <Ionicons name={module.icon} size={25} color="#D4AF37" />
                    </View>
                    <Text className="mb-1.5 font-display text-[22px] font-semibold text-navy">
                      {module.title}
                    </Text>
                    <Text className="mb-5 flex-1 font-sans text-[15px] leading-relaxed text-slate-500">
                      {module.description}
                    </Text>
                    <Text className="font-sans text-[13px] font-bold uppercase tracking-[1.5px] text-gold-dark">
                      {module.cta} ›
                    </Text>
                  </Pressable>
                </Animated.View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
