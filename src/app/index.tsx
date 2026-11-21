import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GoldButton, MicroLabel } from '../components/ui/Elegant';
import {
  LANDING_LANG_STORAGE_KEY,
  LANDING_LOCALES,
  LANDING_STRINGS,
  RTL_LOCALES,
  detectLandingLocale,
  type LandingLocale,
} from '../lib/landingStrings';
import { routeSignedInUser } from '../lib/routeSignedInUser';
import { supabase } from '../lib/supabase';
import { useAppLogo } from '../lib/useAppLogo';

// The KYCO mascots appear on this page as large background artwork,
// blended into the navy sections at low opacity rather than as a
// small foreground pair (which stretched the old hero). Transparent
// PNGs, 540x960 (aspect 0.5625).
const MASCOT_MALE = require('../../assets/images/mascot-male.png');
const MASCOT_FEMALE = require('../../assets/images/mascot-female.png');

// Feature icons, in the same order as the features in landingStrings.
const FEATURE_ICONS = [
  'library-outline',
  'mic-outline',
  'book-outline',
  'volume-high-outline',
  'refresh-outline',
  'star-outline',
  'calendar-outline',
  'compass-outline',
  'school-outline',
] as const;

export default function LandingPage() {
  const router = useRouter();

  // Header logo: an admin-uploaded logo (Admin → System Settings) when
  // one is set, otherwise the bundled default logo. A remote logo that fails
  // to load falls back to the crest via onError.
  const { source: logoSource, onError: logoOnError } = useAppLogo();

  // ---- Home page language -------------------------------------------
  // Only this public page is multilingual; the app itself stays in
  // English, and the buttons stay in English in every language. The
  // language comes from the visitor's saved choice, else their
  // browser language, else English.
  const [locale, setLocale] = useState<LandingLocale>('en');
  const t = LANDING_STRINGS[locale];
  const isRTL = RTL_LOCALES.includes(locale);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(LANDING_LANG_STORAGE_KEY);
      } catch {
        saved = null;
      }
      if (!alive) return;
      if (saved && LANDING_LOCALES.some((l) => l.code === saved)) {
        setLocale(saved as LandingLocale);
      } else {
        setLocale(detectLandingLocale());
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    try {
      window.localStorage.setItem(LANDING_LANG_STORAGE_KEY, locale);
    } catch {
      // A browser that refuses storage simply re-detects next visit.
    }
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    return () => {
      // The rest of the app is English and left-to-right.
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = 'en';
    };
  }, [locale, isRTL]);

  // Footer legal links point at CMS pages (/p/<slug>). Only show a
  // legal link once its page actually exists in `pages`, so visitors
  // never land on "Page Not Found" for content that has not been
  // created yet. If the check itself fails, keep showing the links
  // (the previous behaviour).
  const [existingLegalSlugs, setExistingLegalSlugs] = useState<string[] | null>(null);

  // A signed-in user who lands here — most importantly the Google
  // sign-in return, which Supabase sends back to the site root with the
  // session in the URL — goes straight to their own home instead of
  // sitting on the public page looking logged out.
  useEffect(() => {
    let cancelled = false;
    routeSignedInUser((path) => {
      if (!cancelled) router.replace(path);
    });
    // The OAuth return is processed asynchronously by supabase-js, so
    // also route if the sign-in event lands just after this check.
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !cancelled) {
        routeSignedInUser((path) => {
          if (!cancelled) router.replace(path);
        });
      }
    });
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [router]);

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

  // Body text on this page is justified (Shastri's direction,
  // 2026-11-21): it suits the page's formal style. Headings, labels
  // and buttons keep their own alignment.
  const justify = { textAlign: 'justify' as const };

  return (
    <ScrollView className="flex-1 bg-canvas">
      <View style={isRTL ? { direction: 'rtl' as const } : undefined}>
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
        {/* Language switcher: the page in the visitor's language.
            The buttons themselves stay in English in every language. */}
        <View className="max-w-7xl w-full mx-auto flex-row flex-wrap items-center gap-2 px-4 pb-4 md:px-6">
          {LANDING_LOCALES.map((option) => {
            const active = option.code === locale;
            return (
              <Pressable
                key={option.code}
                onPress={() => setLocale(option.code)}
                className={
                  active
                    ? 'rounded-full bg-navy px-3.5 py-1.5 active:opacity-90'
                    : 'rounded-full border border-inkline bg-white px-3.5 py-1.5 active:opacity-90'
                }
              >
                <Text
                  className={
                    active
                      ? 'font-sans text-xs font-bold text-gold'
                      : 'font-sans text-xs font-semibold text-slate-500'
                  }
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
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
              {t.heroTitle}
            </Text>
            <Text className="font-sans text-lg text-slate-300 mb-10 leading-relaxed" style={justify}>
              {t.heroIntro}
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
                {t.alreadyAccount}
              </Text>
            </Pressable>
            <Text className="font-sans text-sm text-slate-400 leading-relaxed" style={justify}>
              {t.pinNote}
            </Text>

            {/* Programme figures */}
            <View className="flex-row flex-wrap gap-x-8 gap-y-4 mt-10">
              {[
                { value: '320', label: t.statLessons },
                { value: '5', label: t.statStages },
                { value: '40', label: t.statModules },
                { value: '2,200+', label: t.statWords },
                { value: '100%', label: t.statFree },
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
          <MicroLabel className="text-center mb-3">{t.programmeLabel}</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center mb-4">
            {t.programmeTitle}
          </Text>
          <Text className="font-sans text-lg text-slate-500 text-center mb-12 max-w-2xl mx-auto leading-relaxed" style={justify}>
            {t.programmeIntro}
          </Text>
          <View className="flex-row flex-wrap justify-center gap-6">
            {t.features.map((feature, index) => (
              <View
                key={feature.title}
                className="w-full md:w-[31%] bg-white p-6 rounded-[20px] border border-inkline shadow-sm"
              >
                <View className="w-12 h-12 rounded-full bg-gold-light items-center justify-center mb-4">
                  <Ionicons name={FEATURE_ICONS[index] as any} size={24} color="#0A192F" />
                </View>
                <Text className="font-sans text-lg font-bold text-navy mb-2">{feature.title}</Text>
                <Text className="font-sans text-slate-500 leading-relaxed" style={justify}>{feature.text}</Text>
              </View>
            ))}
          </View>
          <Text className="font-sans text-slate-500 text-center leading-relaxed mt-12 max-w-2xl mx-auto" style={justify}>
            {t.beyondLessons}
          </Text>
        </View>
      </View>

      {/* HOW IT WORKS SECTION */}
      <View className="w-full bg-white">
        <View className="max-w-7xl w-full mx-auto px-6 py-16 md:py-20">
          <MicroLabel className="text-center mb-3">{t.startLabel}</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center mb-12">
            {t.howTitle}
          </Text>
          <View className="flex-col md:flex-row gap-6">
            {t.steps.map((item, index) => (
              <View key={item.title} className="flex-1 items-center px-4">
                <View className="w-12 h-12 rounded-full bg-navy items-center justify-center mb-4">
                  <Text className="font-display text-white font-semibold text-lg">{index + 1}</Text>
                </View>
                <Text className="font-sans text-lg font-bold text-navy mb-2 text-center">
                  {item.title}
                </Text>
                <Text className="font-sans text-slate-500 text-center leading-relaxed" style={justify}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Pathway strip: the five stages of the course */}
          <View className="mt-16 bg-navy rounded-[20px] px-6 py-8">
            <Text className="font-display text-white font-semibold text-center text-lg mb-6">
              {t.stagesTitle}
            </Text>
            <View className="flex-col md:flex-row md:flex-wrap items-center justify-center gap-3">
              {t.stages.map((stage, index, arr) => (
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
          <MicroLabel className="text-center mb-3">{t.commitmentLabel}</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-white text-center mb-12">
            {t.commitmentTitle}
          </Text>
          <View className="flex-col md:flex-row gap-10">
            {t.commitments.map((item) => (
              <View key={item.title} className="flex-1 px-2">
                <Text className="font-sans text-lg font-bold text-gold mb-2 text-center md:text-left">
                  {item.title}
                </Text>
                <Text className="font-sans text-slate-300 text-center md:text-left leading-relaxed" style={justify}>
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
              <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">{t.support}</Text>
            </Link>
            {/* Legal pages live in the CMS (/p/<slug>); each link is
                shown only once that page exists - see the check above. */}
            {showLegalLink('terms-and-conditions') && (
              <Link href="/p/terms-and-conditions" asChild>
                <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">{t.terms}</Text>
              </Link>
            )}
            {showLegalLink('privacy-policy') && (
              <Link href="/p/privacy-policy" asChild>
                <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">{t.privacy}</Text>
              </Link>
            )}
          </View>
          <Text className="text-slate-400 text-sm text-center mb-2">
            {t.initiativeLine}
          </Text>
          <Text className="text-slate-400 text-sm text-center">
            {t.rightsLine}
          </Text>
        </View>
      </View>
      </View>
    </ScrollView>
  );
}
