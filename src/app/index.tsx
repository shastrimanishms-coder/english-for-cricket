import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

// Fallback figures for the live landing counts (the counts at the
// time of this build), used until — or unless — the database answers.
const COUNT_FALLBACKS = { games: 68, speaking: 47, reading: 40, videos: 1, downloads: 0, workbooks: 321 };

// Feature icons, in the same order as the features in landingStrings.
const FEATURE_ICONS = [
  'library-outline',
  'journal-outline',
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

  // Account-deleted notice (Round 84): self-service deletion ends
  // here with ?deleted=1 so the user gets a clear confirmation on
  // the public page instead of a silent sign-out. Dismissible, and
  // shown in English like the page's other buttons and notices.
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();
  const [deletedNoticeShown, setDeletedNoticeShown] = useState(true);
  const showDeletedNotice = deleted === '1' && deletedNoticeShown;

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
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const t = LANDING_STRINGS[locale];
  const isRTL = RTL_LOCALES.includes(locale);

  // Urdu and Pashto are written in the Nastaliq script, whose glyphs
  // stand far taller than Latin ones. With Latin line heights the
  // lines crowd together and spill over whatever sits below them, so
  // the RTL languages get generous line heights on every text block.
  const lh = {
    title: isRTL ? { lineHeight: 78 } : undefined,
    h2: isRTL ? { lineHeight: 58 } : undefined,
    cardTitle: isRTL ? { lineHeight: 38 } : undefined,
    stageHead: isRTL ? { lineHeight: 42 } : undefined,
    bodyLg: isRTL ? { lineHeight: 46 } : undefined,
    body: isRTL ? { lineHeight: 34 } : undefined,
    small: isRTL ? { lineHeight: 27 } : undefined,
    micro: isRTL ? { lineHeight: 22 } : undefined,
  };

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

  // Home page hero video: an admin can replace it in Admin → System
  // Settings (site_settings.home_hero_video_url). Empty — or the
  // setting being unreadable — keeps the default ICC explainer, so
  // the hero never sits empty.
  const [heroVideoSetting, setHeroVideoSetting] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'home_hero_video_url')
          .maybeSingle();
        if (!error && data?.value) setHeroVideoSetting(data.value.trim());
      } catch {
        // Keep the default video.
      }
    })();
  }, []);

  // Live content counts for the hero figures: read from the database on
  // every visit, so the numbers grow by themselves as new games,
  // conversations, reading texts, videos, downloads and playable
  // workbooks are published. The starting values are the counts at the
  // time of this build and remain as the fallback if a count cannot
  // be read (each figure falls back on its own).
  const [liveCounts, setLiveCounts] = useState(COUNT_FALLBACKS);

  useEffect(() => {
    (async () => {
      try {
        const opts = { count: 'exact' as const, head: true };
        const [g, sp, rd, vd, dl, wb] = await Promise.all([
          supabase.from('games').select('id', opts).eq('is_published', true).neq('engine', 'workbook'),
          supabase.from('speaking_scenarios').select('id', opts).eq('is_published', true),
          supabase.from('reading_stories').select('id', opts).eq('is_published', true),
          supabase.from('video_lectures').select('id', opts).eq('is_published', true),
          supabase.from('downloads').select('id', opts).eq('is_published', true),
          supabase.from('games').select('id', opts).eq('is_published', true).eq('engine', 'workbook'),
        ]);
        setLiveCounts({
          games: g.count ?? COUNT_FALLBACKS.games,
          speaking: sp.count ?? COUNT_FALLBACKS.speaking,
          reading: rd.count ?? COUNT_FALLBACKS.reading,
          videos: vd.count ?? COUNT_FALLBACKS.videos,
          downloads: dl.count ?? COUNT_FALLBACKS.downloads,
          workbooks: wb.count ?? COUNT_FALLBACKS.workbooks,
        });
      } catch {
        // Keep the fallback figures.
      }
    })();
  }, []);

  // The live figures count up smoothly to their real values when the
  // database answers, so a visitor can see that they are live.
  const displayRef = useRef({ ...COUNT_FALLBACKS });
  const [displayCounts, setDisplayCounts] = useState({ ...COUNT_FALLBACKS });

  useEffect(() => {
    const from = { ...displayRef.current };
    const to = liveCounts;
    const keys = Object.keys(to) as (keyof typeof to)[];
    if (keys.every((k) => from[k] === to[k])) return;
    const steps = 24;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      const k = 1 - Math.pow(1 - i / steps, 3);
      const next = { ...from };
      for (const key of keys) {
        next[key] = Math.round(from[key] + (to[key] - from[key]) * k);
      }
      displayRef.current = next;
      setDisplayCounts(next);
      if (i >= steps) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [liveCounts]);

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

  // Hero video: by default the ICC's official beginner explainer
  // "What Is Cricket? Get to know the sport" (YouTube; embedding
  // verified). An admin can replace it in System Settings with any
  // YouTube link or a direct video file link (MP4/WebM). Watch URLs
  // are converted to embed URLs exactly the way the video player
  // screen does it; file links are played directly.
  const DEFAULT_HERO_VIDEO_URL = 'https://www.youtube.com/watch?v=g-beFHld19c';
  const getEmbedUrl = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/');
    if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/');
    return url;
  };
  const heroVideoUrl = heroVideoSetting || DEFAULT_HERO_VIDEO_URL;
  const heroIsFile = /\.(mp4|webm|mov|m4v)([?#]|$)/i.test(heroVideoUrl);
  const heroEmbedUrl = `${getEmbedUrl(heroVideoUrl)}?rel=0`;

  // Body text on this page is justified (Shastri's direction,
  // 2026-11-21): it suits the page's formal style. Headings, labels
  // and buttons keep their own alignment.
  const justify = { textAlign: 'justify' as const };

  return (
    <ScrollView className="flex-1 bg-canvas">
      <View style={isRTL ? { direction: 'rtl' as const } : undefined}>
      {/* HEADER */}
      <SafeAreaView edges={['top']} className="relative z-50 w-full bg-white shadow-sm" style={{ zIndex: 50 }}>
        <View className="max-w-7xl w-full mx-auto flex-row justify-between items-center px-4 py-4 md:p-6">
          <View className="h-9 w-12 md:h-14 md:w-[76px]">
            <Image
              source={logoSource}
              onError={logoOnError}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          </View>
          <View className="flex-row items-center space-x-2 gap-2 md:space-x-4 md:gap-4">
            {/* Language dropdown: the page in the visitor's language,
                chosen from a menu beside the account buttons. The
                buttons themselves stay in English in every language. */}
            <View className="relative">
              <Pressable
                onPress={() => setLangMenuOpen((open) => !open)}
                className="flex-row items-center gap-1.5 rounded-full border border-inkline bg-white px-3 py-2 active:opacity-90 md:px-4 md:py-2.5"
              >
                <Text className="font-sans text-xs font-semibold text-slate-600 md:text-sm">
                  {LANDING_LOCALES.find((l) => l.code === locale)?.label ?? 'English'}
                </Text>
                <Text className="text-[10px] text-slate-400">{langMenuOpen ? '▴' : '▾'}</Text>
              </Pressable>
              {langMenuOpen ? (
                <>
                  <Pressable
                    onPress={() => setLangMenuOpen(false)}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 } as any}
                  />
                  <View
                    className="absolute end-0 top-full z-50 mt-2 w-44 rounded-2xl border border-inkline bg-white py-2 shadow-lg"
                    style={{ zIndex: 50 }}
                  >
                    {LANDING_LOCALES.map((option) => {
                      const active = option.code === locale;
                      return (
                        <Pressable
                          key={option.code}
                          onPress={() => { setLocale(option.code); setLangMenuOpen(false); }}
                          className="px-4 py-2 active:opacity-80"
                        >
                          <Text className={active ? 'font-sans text-sm font-bold text-navy' : 'font-sans text-sm text-slate-600'}>
                            {option.label}{active ? '  ✓' : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </View>
            <Pressable
              onPress={() => router.push('/login')}
              className="items-center rounded-full border border-inkline bg-white px-3.5 py-2 active:opacity-90 md:px-5 md:py-2.5"
            >
              <Text className="font-sans text-xs font-bold text-navy md:text-sm">Log In</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/register')}
              className="items-center rounded-full border-b-4 border-gold-dark bg-gold px-3.5 py-2 active:opacity-90 md:px-5 md:py-2.5"
            >
              <Text className="font-sans text-xs font-bold text-navy md:text-sm">Register</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {showDeletedNotice ? (
        <View className="w-full bg-gold-light border-b border-gold">
          <View className="max-w-7xl w-full mx-auto flex-row items-center justify-between px-4 py-3 md:px-6 gap-3">
            <Text className="font-sans text-sm font-bold text-navy flex-1">
              Your account has been deleted. Thank you for learning with English for Cricket.
            </Text>
            <Pressable onPress={() => setDeletedNoticeShown(false)} className="px-2 py-1">
              <Text className="font-sans text-base font-bold text-navy">✕</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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
            top: 0,
            // Full height of the blue hero section: she stands behind
            // the video frame from the very top of the section to its
            // base, her head and ears above the player.
            height: '100%',
            aspectRatio: 540 / 960,
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
        <View className="max-w-7xl w-full mx-auto flex-col px-6 py-16 md:py-24 relative">
          <View className="flex-col md:flex-row items-center gap-12 w-full">

          {/* Left Side: Text and Call to Action */}
          <View className="flex-1 w-full">
            <Text className="font-sans text-[11px] font-bold text-gold tracking-[2.5px] uppercase mb-4">
              English for Cricket
            </Text>
            <Text className="font-display text-4xl md:text-5xl font-semibold text-white mb-6" style={lh.title}>
              {t.heroTitle}
            </Text>
            <Text className="font-sans text-lg text-slate-300 mb-10 leading-relaxed" style={[justify, lh.bodyLg]}>
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
              <Text className="font-sans text-gold-light font-semibold underline" style={lh.body}>
                {t.alreadyAccount}
              </Text>
            </Pressable>
            <Text className="font-sans text-sm text-slate-400 leading-relaxed" style={[justify, lh.small]}>
              {t.pinNote}
            </Text>

          </View>

          {/* Right Side: Intro Video with Poster Image */}
          <View className="w-full md:flex-1 aspect-video md:aspect-auto md:h-80 rounded-[20px] overflow-hidden bg-navy-deep shadow-lg relative">
            {/* Background Poster Image */}
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1000&auto=format&fit=crop' }}
              className="absolute inset-0 w-full h-full opacity-40"
              resizeMode="cover"
            />
            {/* Video overlay: the admin-chosen home page video, or the
                ICC's "What Is Cricket?" explainer by default */}
            {heroIsFile && Platform.OS === 'web' ? (
              <video
                src={heroVideoUrl}
                controls
                playsInline
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, backgroundColor: '#000' }}
              />
            ) : Platform.OS === 'web' ? (
              <iframe
                src={heroEmbedUrl}
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, border: 'none' }}
                title="What Is Cricket? Get to know the sport — ICC"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            ) : (
              <WebView
                source={{ uri: heroIsFile ? heroVideoUrl : heroEmbedUrl }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
              />
            )}
          </View>
          </View>

          {/* Programme figures — one elegant gold-edged band across
              the full width of the hero, in TWO deliberate rows
              (Round 89, Part D): the first row describes the course
              itself (lessons, stages, modules, words, and the 100%
              free promise closing the row), the second row is the
              library — games, speaking, reading, videos, downloads
              and digital workbooks, every one counted live from the
              database on each visit with its "and growing" label.
              On narrow screens each row wraps and stacks cleanly. */}
          <View
            className="mt-12 w-full rounded-[16px] px-6 py-4"
            style={{
              borderWidth: 1,
              borderColor: 'rgba(212, 175, 55, 0.35)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
            }}
          >
            {[
              [
                { value: '320', label: t.statLessons, growing: false },
                { value: '5', label: t.statStages, growing: false },
                { value: '40', label: t.statModules, growing: false },
                { value: '2,200+', label: t.statWords, growing: false },
                { value: '100%', label: t.statFree, growing: false },
              ],
              [
                { value: String(displayCounts.games), label: t.statGames, growing: true },
                { value: String(displayCounts.speaking), label: t.statSpeaking, growing: true },
                { value: String(displayCounts.reading), label: t.statReading, growing: true },
                { value: String(displayCounts.videos), label: t.statVideos, growing: true },
                { value: String(displayCounts.downloads), label: t.statDownloads, growing: true },
                { value: String(displayCounts.workbooks), label: t.statWorkbooks, growing: true },
              ],
            ].map((row, rowIndex) => (
              <View
                key={rowIndex}
                className="flex-row flex-wrap justify-between gap-x-6 gap-y-4"
                style={
                  rowIndex > 0
                    ? {
                        marginTop: 16,
                        paddingTop: 16,
                        borderTopWidth: 1,
                        borderTopColor: 'rgba(212, 175, 55, 0.18)',
                      }
                    : undefined
                }
              >
                {row.map((stat) => (
                  <View key={stat.label}>
                    <Text
                      className="font-display text-2xl font-semibold text-gold"
                      style={{ textShadowColor: 'rgba(212, 175, 55, 0.45)', textShadowRadius: 10 }}
                    >
                      {stat.value}
                    </Text>
                    <Text className="font-sans text-xs text-slate-400 uppercase tracking-wider" style={lh.micro}>
                      {stat.label}
                    </Text>
                    {stat.growing && (
                      <Text className="font-sans text-[11px] text-gold-light" style={lh.micro}>
                        {t.statGrowing}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* FEATURES SECTION */}
      <View className="w-full">
        <View className="max-w-7xl w-full mx-auto px-6 py-16 md:py-20">
          <MicroLabel className="text-center mb-3">{t.programmeLabel}</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center mb-4" style={lh.h2}>
            {t.programmeTitle}
          </Text>
          <Text className="font-sans text-lg text-slate-500 text-center mb-12 max-w-2xl mx-auto leading-relaxed" style={[justify, lh.bodyLg]}>
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
                <Text className="font-sans text-lg font-bold text-navy mb-2" style={lh.cardTitle}>{feature.title}</Text>
                <Text className="font-sans text-slate-500 leading-relaxed" style={[justify, lh.body]}>{feature.text}</Text>
              </View>
            ))}
          </View>
          <Text className="font-sans text-slate-500 text-center leading-relaxed mt-12 max-w-2xl mx-auto" style={[justify, lh.body]}>
            {t.beyondLessons}
          </Text>
        </View>
      </View>

      {/* HOW IT WORKS SECTION */}
      <View className="w-full bg-white">
        <View className="max-w-7xl w-full mx-auto px-6 py-16 md:py-20">
          <MicroLabel className="text-center mb-3">{t.startLabel}</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center mb-12" style={lh.h2}>
            {t.howTitle}
          </Text>
          <View className="flex-col md:flex-row gap-6">
            {t.steps.map((item, index) => (
              <View key={item.title} className="flex-1 items-center px-4">
                <View className="w-12 h-12 rounded-full bg-navy items-center justify-center mb-4">
                  <Text className="font-display text-white font-semibold text-lg">{index + 1}</Text>
                </View>
                <Text className="font-sans text-lg font-bold text-navy mb-2 text-center" style={lh.cardTitle}>
                  {item.title}
                </Text>
                <Text className="font-sans text-slate-500 text-center leading-relaxed" style={[justify, lh.body]}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Pathway strip: the five stages of the course */}
          <View className="mt-16 bg-navy rounded-[20px] px-6 py-8">
            <Text className="font-display text-white font-semibold text-center text-lg mb-6" style={lh.stageHead}>
              {t.stagesTitle}
            </Text>
            <View className="flex-col md:flex-row md:flex-wrap items-center justify-center gap-3">
              {t.stages.map((stage, index, arr) => (
                <View key={stage.name} className="flex-row items-center gap-3">
                  <View className="bg-white/10 border border-white/20 rounded-[14px] px-4 py-2 items-center">
                    <Text className="text-slate-100 font-semibold text-sm">{stage.name}</Text>
                    <Text className="text-slate-400 text-xs text-center mt-0.5" style={lh.micro}>{stage.note}</Text>
                  </View>
                  {index < arr.length - 1 && (
                    <Text className="text-gold font-bold hidden md:flex">{isRTL ? '←' : '→'}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* TIPS SECTION — how learners get the best from the programme */}
      <View className="w-full bg-amber-50">
        <View className="max-w-7xl w-full mx-auto px-6 py-16 md:py-20">
          <MicroLabel className="text-center mb-3">{t.tipsLabel}</MicroLabel>
          <Text className="font-display text-3xl md:text-4xl font-semibold text-navy text-center mb-4" style={lh.h2}>
            {t.tipsTitle}
          </Text>
          <Text className="font-sans text-lg text-slate-500 text-center mb-12 max-w-2xl mx-auto leading-relaxed" style={[justify, lh.bodyLg]}>
            {t.tipsIntro}
          </Text>
          <View className="flex-row flex-wrap justify-center gap-6">
            {t.tips.map((tip, index) => (
              <View
                key={tip.title}
                className="w-full md:w-[31%] bg-white p-6 rounded-[20px] border border-inkline shadow-sm"
              >
                <View className="w-12 h-12 rounded-full bg-navy items-center justify-center mb-4">
                  <Text className="font-display text-white font-semibold text-lg">{index + 1}</Text>
                </View>
                <Text className="font-sans text-lg font-bold text-navy mb-2" style={lh.cardTitle}>{tip.title}</Text>
                <Text className="font-sans text-slate-500 leading-relaxed" style={[justify, lh.body]}>{tip.text}</Text>
              </View>
            ))}
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
          <Text className="font-display text-3xl md:text-4xl font-semibold text-white text-center mb-12" style={lh.h2}>
            {t.commitmentTitle}
          </Text>
          <View className="flex-col md:flex-row gap-10">
            {t.commitments.map((item) => (
              <View key={item.title} className="flex-1 px-2">
                <Text className="font-sans text-lg font-bold text-gold mb-2 text-center md:text-start" style={lh.cardTitle}>
                  {item.title}
                </Text>
                <Text className="font-sans text-slate-300 text-center md:text-start leading-relaxed" style={[justify, lh.body]}>
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
              <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">{LANDING_STRINGS.en.support}</Text>
            </Link>
            {/* Legal pages live in the CMS (/p/<slug>); each link is
                shown only once that page exists - see the check above. */}
            {showLegalLink('terms-and-conditions') && (
              <Link href="/p/terms-and-conditions" asChild>
                <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">{LANDING_STRINGS.en.terms}</Text>
              </Link>
            )}
            {showLegalLink('privacy-policy') && (
              <Link href="/p/privacy-policy" asChild>
                <Text className="font-sans text-slate-500 font-semibold hover:text-gold-dark">{LANDING_STRINGS.en.privacy}</Text>
              </Link>
            )}
          </View>
          <Text className="text-slate-400 text-sm text-center mb-2" style={lh.small}>
            {t.initiativeLine}
          </Text>
          <Text className="text-slate-400 text-sm text-center" style={lh.small}>
            {t.rightsLine}
          </Text>
        </View>
      </View>
      </View>
    </ScrollView>
  );
}
