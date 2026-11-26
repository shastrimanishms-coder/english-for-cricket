import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MicroLabel } from '../../components/ui/Elegant';
import RewardsCard from '../../components/ui/RewardsCard';
import { evaluateStreakBadges } from '../../lib/badgeAwards';
import { endCurrentSession } from '../../lib/sessionEnd';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { useAppLogo } from '../../lib/useAppLogo';

// The header mark (Round 80): the full English for Cricket lockup
// in its white-lettering variant, made for navy surfaces, shown as
// a single image in place of the old medallion + text pair (the
// medallion alone read as the KYCO crest rather than the English
// for Cricket logo). The asset is the supplied white variant
// trimmed tightly to its artwork (900x676). An admin-set logo URL
// (site_settings app_logo_url, via useAppLogo) still overrides
// this bundled lockup when one is set.
const HEADER_LOCKUP = require('../../../assets/images/logo-lockup-white.png');

// The official mascot artwork (same files as Mascots.tsx), used
// large and faint as the dashboard watermark (Round 78).
const MASCOT_MALE = require('../../../assets/images/mascot-male.png');
const MASCOT_FEMALE = require('../../../assets/images/mascot-female.png');

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
  const { source: logoSource, onError: logoOnError, isCustom: logoIsCustom } = useAppLogo();
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
    // endCurrentSession signs out the Supabase session AND clears the
    // PIN student's AsyncStorage session (without that, "logout"
    // would leave a PIN student effectively still signed in on this
    // device), and clears the voice caches resolved for this student.
    await endCurrentSession();
    router.replace('/');
  };

  // Switch Account (Round 81, Part 3): families share one device, so
  // switching ends the session exactly like Log Out — nothing of this
  // student's session, caches or preferences carries over — but lands
  // on the switch list, where the next student picks their name and
  // re-enters only their password or PIN.
  const handleSwitchAccount = async () => {
    await endCurrentSession();
    router.replace('/switch-account');
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
        <View className="mx-auto w-full max-w-7xl flex-row items-center justify-between px-4 py-2 md:px-6">
          {logoIsCustom ? (
            <Image
              source={logoSource}
              onError={logoOnError}
              style={{ height: 38, width: 160 }}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={HEADER_LOCKUP}
              style={{ height: 50, width: 67 }}
              resizeMode="contain"
            />
          )}

          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={handleSwitchAccount}
              className="flex-row items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 active:bg-white/15"
            >
              <Ionicons name="swap-horizontal" size={13} color="#FFFFFF" />
              <Text className="font-sans text-xs font-bold uppercase tracking-[1.5px] text-white">
                Switch Account
              </Text>
            </Pressable>
            <Pressable
              onPress={handleLogout}
              className="rounded-full border border-white/25 px-4 py-2 active:bg-white/15"
            >
              <Text className="font-sans text-xs font-bold uppercase tracking-[1.5px] text-white">
                Log Out
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <View className="relative mx-auto w-full max-w-7xl">
          {/* Watermark (Round 78): the mascots no longer stand as
              small figurines beside the greeting - the official
              artwork now sits LARGE in the background at low
              opacity, anchored to the top-right of the content
              column behind the welcome area and the first cards,
              like the landing page treatment. The cards are
              opaque, so all text stays fully readable. */}
          <View
            pointerEvents="none"
            className="absolute right-0 top-0 flex-row items-start"
          >
            <Image
              source={MASCOT_FEMALE}
              style={{ width: 158, height: 281, opacity: 0.13, marginRight: -34 }}
              resizeMode="contain"
            />
            <Image
              source={MASCOT_MALE}
              style={{ width: 169, height: 300, opacity: 0.13 }}
              resizeMode="contain"
            />
          </View>

          <View className="relative">
            {/* Welcome Header */}
            <Animated.View entering={FadeIn.duration(400)} style={{ marginBottom: 28 }}>
              <MicroLabel className="mb-2">Your Academy</MicroLabel>
              <Text className="mb-2 font-display text-3xl font-semibold text-navy md:text-4xl">
                Welcome back, {studentName}!
              </Text>
              <View className="mb-3 h-[2px] w-16 rounded-full bg-gold" />
              <Text className="font-sans text-base text-slate-500">
                Choose a section below to continue your journey.
              </Text>
            </Animated.View>

            <RewardsCard />
          </View>

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
