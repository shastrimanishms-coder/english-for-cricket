import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GoldButton, MicroLabel } from '../components/ui/Elegant';
import { supabase } from '../lib/supabase';
import { useAppLogo } from '../lib/useAppLogo';

// The KYCO mascots appear on this page as large background artwork,
// blended into the navy sections at low opacity rather than as a
// small foreground pair (which stretched the old hero). Transparent
// PNGs, 540x960 (aspect 0.5625).
const MASCOT_MALE = require('../../assets/images/mascot-male.png');
const MASCOT_FEMALE = require('../../assets/images/mascot-female.png');

export default function LandingPage() {
  const router = useRouter();

  // Header logo: an admin-uploaded logo (Admin → System Settings) when
  // one is set, otherwise the bundled default logo. A remote logo that fails
  // to load falls back to the crest via onError.
  const { source: logoSource, onError: logoOnError } = useAppLogo();

  // Footer legal links point at CMS pages (/p/<slug>). Only show a
  // legal link once its page actually exists in `pages`, so visitors
  // never land on "Page Not Found" for content that has not been
  // created yet. If the check itself fails, keep showing the links
  // (the previous behaviour).
  const [existingLegalSlugs, setExistingLegalSlugs] = useState<string[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('slug')
          .in('slug', ['terms-and-conditions', 'privacy-policy']);
        if (!error && data) {
          setExistingLegalSlugs(data.map((row: { slug: string }) => row.slug));
        }
      } catch {
        // Keep the links visible if the check cannot be made.
      }
    })();
  }, []);

  const showLegalLink = (slug: string) =>
    existingLegalSlugs === null || existingLegalSlugs.includes(slug);

  // Hero video: the ICC's official beginner explainer "What Is Cricket?
  // Get to know the sport" (YouTube; embedding verified). Kept as a
  // watch URL and converted to an embed URL exactly the way the video
  // player screen does it.
  const HERO_VIDEO_URL = 'https://www.youtube.com/watch?v=g-beFHld19c';
  const getEmbedUrl = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/');
    if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/');
    return url;
  };
  const heroEmbedUrl = `${getEmbedUrl(HERO_VIDEO_URL)}?rel=0`;

  return (
    <ScrollView className="flex-1 bg-canvas">
      {/* HEADER */}
      <SafeAreaView edges={['top']} className="w-full bg-white shadow-sm">
        <View className="max-w-7xl w-full mx-auto flex-row justify-between items-center px-4 py-4 md:p-6">
          <View className="flex-row items-center">
            <Image
              source={logoSource}
              onError={logoOnError}
              style={{ width: 76, height: 56 }}
              resizeMode="contain"
            />
          </View>
          <View className="flex-row items-center space-x-4 gap-4">
            <Pressable
              onPress={() => router.push('/login')}
              className="items-center rounded-full border border-inkline bg-white px-5 py-2.5 active:opacity-90"
            >
              <Text className="font-sans text-sm font-bold text-navy">Log In</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/register')}
              className="items-center rounded-full border-b-4 border-gold-dark bg-gold px-5 py-2.5 active:opacity-90"
            >
              <Text className="font-sans text-sm font-bold text-navy">Register</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* HERO SECTION — the mascots stand large in the background,
          blended into the navy at low opacity. */}
      <View className="w-full bg-navy relative overflow-hidden">
        <Image
          source={MASCOT_FEMALE}
          resizeMode="contain"
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -30,
            bottom: -40,
            height: 640,
            width: 360,
            opacity: 0.16,
          }}
        />
        <Image
          source={MASCOT_MALE}
          resizeMode="contain"
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -70,
            bottom: -60,
            height: 560,
            width: 315,
            opacity: 0.1,
            transform: [{ scaleX: -1 }],
          }}
        />
        <View className="max-w-7xl w-full mx-auto flex-col md:flex-row items-center px-6 py-16 md:py-24 relative">

          {/* Left Side: Text and Call to Action */}
          <View className="flex-1 md:pr-12 w-full mb-12 md:mb-0">
            <Text className="font-sans text-[11px] font-bold text-gold tracking-[2.5px] uppercase mb-4">
              English for Cricket
            </Text>
            <Text className="font-display text-4xl md:text-5xl font-semibold text-white mb-6">
              Learn English Through Cricket
            </Text>
            <Text className="font-sans text-lg text-slate-300 mb-10 leading-relaxed">
              English for Cricket is a complete English-learning programme built around the
              game of cricket. Across 320 structured lessons, learners progress from their
              first words to confident, independent communication — through listening,
              speaking, reading and play. The programme is provided by KYCO, the Kansai
              Youth Cricket Organization, and is free to every learner. It will always
              remain so.
            </Text>
            <View className="w-full max-w-xs mb-4">
              <GoldButton
                label="Start Learning for Free"
                onPress={() => router.push('/register')}
                className="w-full"
              />
            </View>
            <Pressable onPress={() => router.push('/login')} className="mb-6 self-start">
              <Text className="font-sans text-gold-light font-semibold underline">
                Already have an account? Log in
              </Text>
            </Pressable>
            <Text className="font-sans text-sm text-slate-400 leading-relaxed">
              Learners at participating schools and clubs receive a username and PIN from
              their teacher or coach. No email address is required.
            </Text>

            {/* Programme figures */}
            <View className="flex-row flex-wrap gap-x-8 gap-y-4 mt-10">
              {[
                { value: '320', label: 'Lessons' },
                { value: '5', label: 'Stages' },
                { value: '40', label: 'Modules' },
                { value: '2,200+', label: 'Words' },
                { value: '100%', label: 'Free, always' },
              ].map((stat) => (
                <View key={stat.label}>
                  <Text className="font-display text-2xl font-semibold text-gold">
                    {stat.value}
                  </Text>
                  <Text className="font-sans text-xs text-slate-400 uppercase tracking-wider">
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Right Side: Intro Video with Poster Image */}
          <View className="flex-1 w-full aspect-video md:aspect-auto md:h-80 rounded-[20px] overflow-hidden bg-navy-deep shadow-lg relative">
            {/* Background Poster Image */}
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1000&auto=format&fit=crop' }}
              className="absolute inset-0 w-full h-full opacity-40"
              resizeMode="cover"
            />
            {/* Video overlay: the ICC's "What Is Cricket?" explainer */}
            {Platform.OS === 'web' ? (
              <iframe
                src={heroEmbedUrl}
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, border: 'none' }}
                title="What Is Cricket? Get to know the sport — ICC"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            ) : (
              <WebView
                source={{ uri: heroEmbedUrl }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
              />
            )}
          </View>

        </View>
      </View>

      {/* FEATURES SECTION */}
      <View className="w-full">
        <View className="max-w-7xl w-full mx-auto px-6 py-16 md:py-20">
          <MicroLabel className="text-center mb-3">The Programme</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center mb-4">
            Everything a Learner Needs
          </Text>
          <Text className="font-sans text-lg text-slate-500 text-center mb-12 max-w-2xl mx-auto leading-relaxed">
            A complete course in one place: structured lessons, spoken practice, guided
            reading and considered review — every element built around cricket, so that
            each new word arrives with a context that makes it memorable.
          </Text>
          <View className="flex-row flex-wrap justify-center gap-6">
            {[
              {
                icon: 'library-outline',
                title: 'The Learning Path',
                text: 'A structured course of 320 lessons in five stages and forty modules. Each lesson builds carefully on those before it, introducing new language and returning to earlier language in new forms until it is secure.',
              },
              {
                icon: 'mic-outline',
                title: 'Speaking Practice',
                text: 'Guided conversations — interviews and everyday small talk — in which learners speak their part aloud and receive a score for every line, against a pass mark of seventy per cent.',
              },
              {
                icon: 'book-outline',
                title: 'Smart Reading',
                text: 'Short stories in two forms: Listen and Read, in which each word is highlighted as it is spoken, and Read Aloud, in which the learner\u2019s own reading is scored sentence by sentence.',
              },
              {
                icon: 'volume-high-outline',
                title: 'Real Human Voices',
                text: 'Every line of the course is being recorded by real voice artists, in several distinct voices. Learners choose the voice they wish to hear, and listen to natural, human English throughout.',
              },
              {
                icon: 'refresh-outline',
                title: 'Tricky Words Review',
                text: 'Words and phrases a learner finds difficult are gathered automatically and presented again for review, so that weaker points receive further practice until they are mastered.',
              },
              {
                icon: 'star-outline',
                title: 'XP, Stars and Badges',
                text: 'Learners earn experience points and stars for completed work, and badges for significant achievements. A class may follow its own weekly star board; there are no public rankings.',
              },
              {
                icon: 'calendar-outline',
                title: 'Study Days and Streaks',
                text: 'Each learner chooses the days of the week on which they will study. Only those days count towards the learning streak, so a rest day can never break it.',
              },
              {
                icon: 'compass-outline',
                title: 'Find Your Start',
                text: 'A short placement assessment recommends the stage at which a new learner should begin. Nothing is locked; the recommendation simply provides a sensible starting point.',
              },
              {
                icon: 'school-outline',
                title: 'For Schools and Clubs',
                text: 'Teachers and coaches may enrol a whole class with simple username-and-PIN logins, print a login slip for every learner, and follow the progress of the entire group.',
              },
            ].map((feature) => (
              <View
                key={feature.title}
                className="w-full md:w-[31%] bg-white p-6 rounded-[20px] border border-inkline shadow-sm"
              >
                <View className="w-12 h-12 rounded-full bg-gold-light items-center justify-center mb-4">
                  <Ionicons name={feature.icon as any} size={24} color="#0A192F" />
                </View>
                <Text className="font-sans text-lg font-bold text-navy mb-2">{feature.title}</Text>
                <Text className="font-sans text-slate-500 leading-relaxed">{feature.text}</Text>
              </View>
            ))}
          </View>
          <Text className="font-sans text-slate-500 text-center leading-relaxed mt-12 max-w-2xl mx-auto">
            Beyond the lessons, a library of cricket games, video lessons and downloadable
            workbooks accompanies the course — including the ICC&apos;s official
            introduction to the game.
          </Text>
        </View>
      </View>

      {/* HOW IT WORKS SECTION */}
      <View className="w-full bg-white">
        <View className="max-w-7xl w-full mx-auto px-6 py-16 md:py-20">
          <MicroLabel className="text-center mb-3">Getting Started</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center mb-12">
            How It Works
          </Text>
          <View className="flex-col md:flex-row gap-6">
            {[
              {
                step: '1',
                title: 'Register, or receive a PIN',
                text: 'Create a free account with an email address, or receive a username and PIN from a teacher or coach. Both routes provide full access to the programme.',
              },
              {
                step: '2',
                title: 'Follow the Learning Path',
                text: 'Work through the stages in order, at your own pace — at home, at school or at the club. A short placement assessment can identify the appropriate starting point.',
              },
              {
                step: '3',
                title: 'Practise, review and progress',
                text: 'Speaking practice, guided reading and targeted review reinforce every lesson, while points, stars and badges provide a clear record of progress.',
              },
            ].map((item) => (
              <View key={item.step} className="flex-1 items-center px-4">
                <View className="w-12 h-12 rounded-full bg-navy items-center justify-center mb-4">
                  <Text className="font-display text-white font-semibold text-lg">{item.step}</Text>
                </View>
                <Text className="font-sans text-lg font-bold text-navy mb-2 text-center">
                  {item.title}
                </Text>
                <Text className="font-sans text-slate-500 text-center leading-relaxed">
                  {item.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Pathway strip: the five stages of the course */}
          <View className="mt-16 bg-navy rounded-[20px] px-6 py-8">
            <Text className="font-display text-white font-semibold text-center text-lg mb-6">
              The five stages of the course
            </Text>
            <View className="flex-col md:flex-row md:flex-wrap items-center justify-center gap-3">
              {[
                { name: 'The Foundation', note: 'First words and sentences' },
                { name: 'The Rookie', note: 'Everyday English, securely established' },
                { name: 'The Player', note: 'Independent reading and conversation' },
                { name: 'The Strategist', note: 'Analysis and the language of the game' },
                { name: 'The Captain', note: 'Advanced communication and leadership' },
              ].map((stage, index, arr) => (
                <View key={stage.name} className="flex-row items-center gap-3">
                  <View className="bg-white/10 border border-white/20 rounded-[14px] px-4 py-2 items-center">
                    <Text className="text-slate-100 font-semibold text-sm">{stage.name}</Text>
                    <Text className="text-slate-400 text-xs text-center mt-0.5">{stage.note}</Text>
                  </View>
                  {index < arr.length - 1 && (
                    <Text className="text-gold font-bold hidden md:flex">→</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* COMMITMENT SECTION — the male mascot stands large in the
          background, blended into the navy. */}
      <View className="w-full bg-navy relative overflow-hidden">
        <Image
          source={MASCOT_MALE}
          resizeMode="contain"
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -50,
            bottom: -70,
            height: 600,
            width: 338,
            opacity: 0.13,
          }}
        />
        <View className="max-w-7xl w-full mx-auto px-6 py-16 md:py-20 relative">
          <MicroLabel className="text-center mb-3">Our Commitment</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-white text-center mb-12">
            Free. Safe. For Every Learner.
          </Text>
          <View className="flex-col md:flex-row gap-10">
            {[
              {
                title: 'Free of charge, permanently',
                text: 'English for Cricket carries no fees and no advertising, and it never will. Every part of the programme is offered to every learner on equal terms.',
              },
              {
                title: 'Designed for children\u2019s safety',
                text: 'There are no public profiles, no open messaging and no external advertising. Learners see the progress of their own class only, and nothing further.',
              },
              {
                title: 'Prepared with care',
                text: 'The programme is designed and maintained by the volunteers of KYCO in Kansai, Japan, for young cricketers — and for every child who would like to learn English through the game.',
              },
            ].map((item) => (
              <View key={item.title} className="flex-1 px-2">
                <Text className="font-sans text-lg font-bold text-gold mb-2 text-center md:text-left">
                  {item.title}
                </Text>
                <Text className="font-sans text-slate-300 text-center md:text-left leading-relaxed">
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
          <View className="items-center mt-12">
            <View className="w-full max-w-xs">
              <GoldButton
                label="Register — Free of Charge"
                onPress={() => router.push('/register')}
                className="w-full"
              />
            </View>
          </View>
        </View>
      </View>

      {/* FOOTER */}
      <View className="w-full bg-canvas border-t border-inkline">
        <View className="max-w-7xl w-full mx-auto flex-col items-center p-8 md:p-12">
          <View className="flex-row flex-wrap justify-center gap-4 md:gap-8 mb-6">
            <Link href="/support" asChild>
              <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">Support</Text>
            </Link>
            {/* Legal pages live in the CMS (/p/<slug>); each link is
                shown only once that page exists - see the check above. */}
            {showLegalLink('terms-and-conditions') && (
              <Link href="/p/terms-and-conditions" asChild>
                <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">Terms & Conditions</Text>
              </Link>
            )}
            {showLegalLink('privacy-policy') && (
              <Link href="/p/privacy-policy" asChild>
                <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">Privacy Policy</Text>
              </Link>
            )}
          </View>
          <Text className="text-slate-400 text-sm text-center mb-2">
            English for Cricket is an educational initiative of KYCO, the Kansai Youth
            Cricket Organization.
          </Text>
          <Text className="text-slate-400 text-sm text-center">
            © 2026 Kansai Youth Cricket Organization. All rights reserved.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
