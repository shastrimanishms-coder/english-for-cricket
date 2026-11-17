import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GoldButton, MicroLabel } from '../components/ui/Elegant';
import MascotPair from '../components/ui/Mascots';
import { supabase } from '../lib/supabase';
import { useAppLogo } from '../lib/useAppLogo';

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
              <Text className="font-sans text-sm font-bold text-navy">Login</Text>
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

      {/* HERO SECTION */}
      <View className="w-full bg-navy">
        <View className="max-w-7xl w-full mx-auto flex-col md:flex-row items-center px-6 py-16 md:py-24">

          {/* Left Side: Text and Call to Action */}
          <View className="flex-1 md:pr-12 w-full mb-12 md:mb-0">
            <Text className="font-sans text-[11px] font-bold text-gold tracking-[2.5px] uppercase mb-4">
              English for Cricket
            </Text>
            <Text className="font-display text-4xl md:text-5xl font-semibold text-white mb-6">
              Learn English Through Cricket
            </Text>
            <Text className="font-sans text-lg text-slate-300 mb-10 leading-relaxed">
              English for Cricket helps children and young people learn real English through
              the game they love — interactive lessons, cricket games and videos that make
              new words stick. It&apos;s an initiative of KYCO, the Kansai Youth Cricket
              Organization, and it&apos;s completely free — and always will be.
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
                Already learning? Log in →
              </Text>
            </Pressable>
            <Text className="font-sans text-sm text-slate-400 leading-relaxed">
              At a school or club? Your teacher can give you a username and PIN — no email
              needed.
            </Text>
            <View className="mt-8 self-start items-center">
              <MascotPair height={180} />
              <Text className="font-sans text-sm text-slate-300 mt-2 text-center">
                Meet the KYCO mascots — they&apos;ll cheer you on as you learn! 🦊
              </Text>
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
            Everything You Need to Learn
          </Text>
          <Text className="font-sans text-lg text-slate-500 text-center mb-12 max-w-2xl mx-auto leading-relaxed">
            Lessons, games and videos built entirely around cricket — so every new English
            word comes with a bat, a ball and a reason to remember it.
          </Text>
          <View className="flex-row flex-wrap justify-center gap-6">
            {[
              {
                icon: 'book-outline',
                title: 'Interactive Lessons',
                text: 'Short, playful lessons built around cricket words and sentences — listen, tap, match and type your way through each one.',
              },
              {
                icon: 'game-controller-outline',
                title: 'Cricket Games',
                text: 'Practise English while you play. Cricket games turn new words into points, catches and runs.',
              },
              {
                icon: 'play-circle-outline',
                title: 'Video Lessons',
                text: "Watch real cricket explained in simple English, starting with the ICC's official guide to the game.",
              },
              {
                icon: 'map-outline',
                title: 'Your Learning Path',
                text: 'Lessons are organised into a step-by-step path, from your very first cricket words to confident match-day English.',
              },
              {
                icon: 'trophy-outline',
                title: 'Badges & Streaks',
                text: 'Finish lessons, complete modules and learn every day to earn badges and keep your streak alive.',
              },
              {
                icon: 'school-outline',
                title: 'For Schools & Clubs',
                text: "Teachers and coaches can add a whole class with simple PIN logins, print login slips, and follow everyone's progress.",
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
                title: 'Sign up — or get a PIN',
                text: 'Register free with an email address, or ask your teacher for a username and PIN. Learning on your own or with your whole class both work.',
              },
              {
                step: '2',
                title: 'Follow your Learning Path',
                text: 'Work through lessons, games and videos in order, at your own pace — at home, at school or at the club.',
              },
              {
                step: '3',
                title: 'Earn badges & streaks',
                text: 'Every finished lesson counts. Collect badges, complete modules and keep your daily learning streak going.',
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

          {/* Pathway strip: the journey through the curriculum */}
          <View className="mt-16 bg-navy rounded-[20px] px-6 py-8">
            <Text className="font-display text-white font-semibold text-center text-lg mb-6">
              Your journey: from first words to match day
            </Text>
            <View className="flex-col md:flex-row items-center justify-center gap-3">
              {[
                'Meet the cricket words',
                'Build your sentences',
                'Talk on match day',
                'Cheer like a fan',
              ].map((stage, index, arr) => (
                <View key={stage} className="flex-row items-center gap-3">
                  <View className="bg-white/10 border border-white/20 rounded-full px-4 py-2">
                    <Text className="text-slate-100 font-semibold text-sm">{stage}</Text>
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
          <Text className="text-slate-400 text-sm text-center">
            © 2026 Kansai Youth Cricket Organization. All rights reserved.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}