import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedButton from '../../components/ui/AnimatedButton';
import DeleteAccountBlock from '../../components/ui/DeleteAccountBlock';
import { ElegantCard, ScreenHeader } from '../../components/ui/Elegant';
import RewardsCard from '../../components/ui/RewardsCard';
import StudyDaysPicker, { isValidStudyDays } from '../../components/ui/StudyDaysPicker';
import {
  fetchNarratorCategory,
  saveNarratorCategory,
  type NarratorCategory,
} from '../../lib/lessonVoices';
import { showAlert } from '../../lib/showAlert';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';
import {
  VOICE_CATEGORIES,
  getRecordingPublicUrl,
  setVoicePref,
  type VoiceCategory,
  type VoiceOption,
} from '../../lib/voiceStudio';

// What each voice category is FOR (Round 78): the old headings only
// named the kind of speaker ("Adult man"), which did not tell the
// student what the choice controls. These follow the actual casting:
// lesson adults and Speaking Practice partners are cast by role
// (Coach M1, Reporter/Shopkeeper F1, Friend/Teammate B1), Ken and
// Mira are the learner characters, and Smart Reading stories are
// narrated by a man's or a woman's voice.
const CATEGORY_PURPOSES: Record<VoiceCategory, { heading: string; blurb: string }> = {
  M1: {
    heading: "Men's voices",
    blurb: 'The men you hear in lessons and conversations — teachers, coaches, captains and reporters — and stories read aloud by a man.',
  },
  F1: {
    heading: "Women's voices",
    blurb: 'The women you hear in lessons and conversations — teachers, reporters and shopkeepers — and stories read aloud by a woman.',
  },
  B1: {
    heading: "Boy's voice — Ken",
    blurb: 'Ken, the boy learner in your lessons, and boy partners such as friends and teammates in Speaking Practice.',
  },
  G1: {
    heading: "Girl's voice — Mira",
    blurb: 'Mira, the girl learner in your lessons and conversations.',
  },
};

interface EarnedBadge {
  title: string;
  description: string | null;
  image_url: string | null;
}

/**
 * Sample player for one voice's approved introduction recording.
 * Only mounted once the voice list has loaded on the client, so the
 * web player is never constructed during prerendering.
 */
function VoiceSampleButton({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
        void player.seekTo(0);
      }
      player.play();
    } catch {
      // Samples are a preview nicety only.
    }
  };

  return (
    <Pressable
      onPress={toggle}
      className="rounded-full bg-navy px-4 py-2 active:opacity-90"
    >
      <Text className="font-sans text-sm font-bold text-white">
        {status.playing ? '⏸ Pause' : '▶ Hear sample'}
      </Text>
    </Pressable>
  );
}

export default function StudentProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [isEmailUser, setIsEmailUser] = useState(false);
  // Auth account details for the Delete Account block (Round 84):
  // only ever set on the email/Google path below - PIN students
  // (scenario 1) return before this is touched and never see it.
  const [authEmail, setAuthEmail] = useState('');
  const [authProviders, setAuthProviders] = useState<string[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');

  // Location (email learners only - user_profiles carries the columns;
  // PIN students' sub_accounts rows have none).
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  // Study days (migration 16, both identity kinds): the weekdays the
  // student plans to study. Only these days count toward their streak.
  const [studyDays, setStudyDays] = useState<number[]>([]);
  const [savingStudyDays, setSavingStudyDays] = useState(false);

  // My Voices (migration 23): named human voices per category,
  // recorded by voice actors in the Voice Studio. Fails soft - until
  // voices exist (or the migration is run) the card shows its
  // "coming soon" line.
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  // Overrides hold a voice id, or null for "cleared on this screen"
  // (Round 80): a null override must REMOVE the loaded choice, not
  // just sit on top of it.
  const [voicePrefOverrides, setVoicePrefOverrides] = useState<Record<string, string | null>>({});
  const [savingVoiceCat, setSavingVoiceCat] = useState<VoiceCategory | null>(null);

  // The student's current choices ride along on the profile row this
  // screen already loads (voice_prefs jsonb on both student tables);
  // choices made on this screen override them immediately. A stored
  // null (a category cleared before migration 33 removed the key
  // outright) counts as no choice, exactly like a missing key.
  const loadedVoicePrefs: Record<string, string> = (() => {
    const prefs = profile?.voice_prefs;
    return prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, string>)
      : {};
  })();
  const voicePrefs: Record<string, string> = {};
  for (const [cat, id] of Object.entries(loadedVoicePrefs)) {
    if (id) voicePrefs[cat] = id;
  }
  for (const [cat, id] of Object.entries(voicePrefOverrides)) {
    if (id) voicePrefs[cat] = id;
    else delete voicePrefs[cat];
  }

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('voices')
          .select('id, display_name, category, intro_path, intro_status, sort_order')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (!error && data) setVoiceOptions(data as VoiceOption[]);
      } catch {
        // The picker simply stays in its coming-soon state.
      }
    })();
  }, []);

  // Story narrator (Round 80): a separate Smart Reading switch —
  // stories narrated by men's or women's voices, independent of the
  // lesson voice picks above. Device-local per student; null is
  // "no preference", where narration follows the lesson picks.
  const [narratorCat, setNarratorCat] = useState<NarratorCategory | null>(null);
  const [savingNarrator, setSavingNarrator] = useState(false);

  useEffect(() => {
    (async () => {
      const identity = await getStudentIdentity();
      if (identity) setNarratorCat(await fetchNarratorCategory(identity));
    })();
  }, []);

  const handlePickNarrator = async (category: NarratorCategory) => {
    if (savingNarrator) return;
    // Tapping the current choice again clears back to no preference.
    const next = narratorCat === category ? null : category;
    setSavingNarrator(true);
    try {
      const identity = await getStudentIdentity();
      if (!identity) {
        throw new Error('We could not find your sign-in. Please log in again.');
      }
      const ok = await saveNarratorCategory(identity, next);
      if (!ok) {
        throw new Error('Your choice could not be saved yet. Please try again later.');
      }
      setNarratorCat(next);
    } catch (error: any) {
      showAlert('Could not save', error.message || 'Please try again.');
    } finally {
      setSavingNarrator(false);
    }
  };

  const handlePickVoice = async (category: VoiceCategory, voiceId: string) => {
    if (savingVoiceCat) return;
    // Tapping the currently chosen voice again CLEARS the category
    // back to no selection (Round 80) — the student is never trapped
    // with a pick they no longer want. An unset category behaves
    // exactly as it did before this picker existed: the app uses
    // its default voice for the category.
    const clearing = voicePrefs[category] === voiceId;
    setSavingVoiceCat(category);
    try {
      const identity = await getStudentIdentity();
      if (!identity) {
        throw new Error('We could not find your sign-in. Please log in again.');
      }
      const ok = await setVoicePref(
        identity.studentId,
        identity.studentKind,
        category,
        clearing ? null : voiceId
      );
      if (!ok) {
        throw new Error('Your voice choice could not be saved yet. Please try again later.');
      }
      setVoicePrefOverrides((prev) => ({ ...prev, [category]: clearing ? null : voiceId }));
    } catch (error: any) {
      showAlert('Could not save', error.message || 'Please try again.');
    } finally {
      setSavingVoiceCat(null);
    }
  };

  // Earned badges for either identity kind. Fails soft: if the read is
  // blocked (PIN students hold no session for the table's rules to check),
  // the badges section simply stays hidden.
  const loadBadges = useCallback(async (studentId: string) => {
    try {
      const { data, error } = await supabase
        .from('student_badges')
        .select('badge_id, badges ( title, description, image_url )')
        .eq('student_id', studentId);
      if (error || !data) return;
      const list: EarnedBadge[] = (data as any[]).flatMap((row) => {
        const b = Array.isArray(row?.badges) ? row.badges[0] : row?.badges;
        return b ? [{ title: b.title, description: b.description ?? null, image_url: b.image_url ?? null }] : [];
      });
      setEarnedBadges(list);
    } catch {
      // Badges are a nice-to-have on this screen; never break the profile.
    }
  }, []);

  const fetchProfileData = useCallback(async () => {
    try {
      const studentStr = await AsyncStorage.getItem('student_session');
      
      // SCENARIO 1: PIN Student (Sub-Account)
      if (studentStr) {
        const sessionData = JSON.parse(studentStr);
        const targetId = sessionData.id || sessionData.student_id; 

        // Attempt to get fresh data, but don't panic if security rules block it
        const { data } = await supabase
          .from('sub_accounts')
          .select('*')
          .eq('id', targetId)
          .maybeSingle(); 

        if (data) {
          setProfile(data);
          setStudyDays(Array.isArray(data.study_days) ? data.study_days : []);
        } else {
          // FAILSAFE: Use local session data instead of logging out
          setProfile({
            id: targetId,
            username: sessionData.username || 'Student',
            display_name: sessionData.display_name || 'Student',
            is_active: true,
            created_at: sessionData.created_at || new Date().toISOString(),
          });
        }

        // PIN students cannot read sub_accounts directly (row security
        // returns no row to the anon key), so the direct read above
        // normally lands in the failsafe and the saved study days never
        // show. Read them back through the migration-24 RPC instead.
        // Until that migration runs this quietly keeps whatever the
        // direct read produced.
        try {
          const { data: rpcDays, error: rpcError } = await supabase.rpc('get_student_study_days', {
            p_student_id: targetId,
          });
          if (!rpcError && Array.isArray(rpcDays)) {
            setStudyDays(rpcDays.filter((d): d is number => typeof d === 'number'));
          }
        } catch {
          // Study days are one card on this screen; never break it.
        }

        setIsEmailUser(false);
        await loadBadges(targetId);
        setLoading(false);
        return; // CRITICAL: Stop here. Do not fall through to Email check.
      }
      
      // SCENARIO 2: Email Learner (Standard Supabase Auth)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setAuthEmail(session.user.email || '');
        const meta: any = session.user.app_metadata || {};
        setAuthProviders(
          Array.isArray(meta.providers) && meta.providers.length > 0
            ? meta.providers
            : meta.provider
              ? [meta.provider]
              : []
        );
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
          
        if (error) throw error;
        if (data) {
          setProfile({ ...data, display_name: data.display_name || 'Individual Learner' });
          setCountry(data.country || '');
          setRegion(data.region || '');
          setStudyDays(Array.isArray(data.study_days) ? data.study_days : []);
          setIsEmailUser(true);
          await loadBadges(session.user.id);
          setLoading(false);
          return;
        }
      }

      // If we reach this point, absolutely no session exists.
      Alert.alert('Session Error', 'Profile not found. Please log in again.');
      await AsyncStorage.removeItem('student_session');
      router.replace('/');

    } catch (error: any) {
      console.error('Profile fetch error:', error.message);
      setLoading(false);
    }
  }, [router, loadBadges]);

  useEffect(() => {
    (async () => {
      await fetchProfileData();
    })();
  }, [fetchProfileData]);

  const handleSaveLocation = async () => {
    if (!profile?.id) return;
    setSavingLocation(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ country: country.trim() || null, region: region.trim() || null })
        .eq('id', profile.id);
      if (error) throw error;
      setProfile({ ...profile, country: country.trim() || null, region: region.trim() || null });
      Alert.alert('Success', 'Your location has been saved.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleSaveStudyDays = async () => {
    if (!profile?.id || !isValidStudyDays(studyDays)) return;
    setSavingStudyDays(true);
    try {
      const days = [...studyDays].sort((a, b) => a - b);
      if (isEmailUser) {
        const { error } = await supabase
          .from('user_profiles')
          .update({ study_days: days })
          .eq('id', profile.id);
        if (error) throw error;
      } else {
        // PIN students hold no session: the client-asserted RPC
        // (migration 16) checks the sub-account exists and is active.
        const { data: ok, error } = await supabase.rpc('update_student_study_days', {
          p_student_id: profile.id,
          p_days: days,
        });
        if (error) throw error;
        if (!ok) throw new Error('Your study days could not be saved. Please try again.');
      }
      setProfile({ ...profile, study_days: days });
      showAlert('Saved!', 'Your study days are set. Only these days count for your streak now — every other day is free practice.');
    } catch (error: any) {
      showAlert('Could not save', error.message || 'Please try again.');
    } finally {
      setSavingStudyDays(false);
    }
  };

  const handleUpdatePin = async () => {
    if (newPin.length !== 4) {
      Alert.alert('Invalid PIN', 'Your new secret PIN must be exactly 4 digits.');
      return;
    }

    setUpdating(true);
    try {
      // Call our secure database function
      const { data: success, error } = await supabase.rpc('update_student_pin', {
        p_student_id: profile.id,
        p_current_pin: currentPin,
        p_new_pin: newPin
      });

      if (error) throw error;
      
      if (!success) {
        Alert.alert('Incorrect PIN', 'The current PIN you entered does not match our records.');
        return;
      }
      
      Alert.alert('Success', 'Your PIN has been updated successfully!');
      
      // Refresh the locally stored session, but never persist the PIN value
      // itself: nothing reads it back (changing the PIN always asks the
      // student to type the current one), so keeping it on the device would
      // only expose the credential.
      const newSession = { ...profile };
      delete newSession.hashed_pin;
      await AsyncStorage.setItem('student_session', JSON.stringify(newSession));
      
      setCurrentPin('');
      setNewPin('');
      setProfile(newSession);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
    <SafeAreaView edges={['top']} className="w-full bg-navy">
      <ScreenHeader title="My Profile" onBack={() => router.push('/learner')} />
    </SafeAreaView>
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
      <View className="max-w-2xl w-full mx-auto space-y-6">

        {/* Identity Card */}
        <ElegantCard className="p-6 items-center">
          <View className="w-24 h-24 bg-gold-light rounded-full items-center justify-center mb-4">
            <Text className="text-5xl">👤</Text>
          </View>
          <Text className="font-display text-2xl font-semibold text-navy mb-1">
            {profile?.username || profile?.display_name}
          </Text>
          <Text className="text-slate-500 font-mono">ID: {profile?.id.split('-')[0]}</Text>

          <View className="flex-row gap-4 mt-6 w-full">
            <View className="flex-1 bg-pitch-light p-4 rounded-xl border border-pitch-light items-center">
              <Text className="font-sans text-xs font-bold text-pitch-dark uppercase mb-1">Status</Text>
              <Text className="font-sans text-lg font-bold text-pitch-dark">Active</Text>
            </View>
            <View className="flex-1 bg-navy/5 p-4 rounded-xl border border-inkline items-center">
              <Text className="font-sans text-xs font-bold text-navy uppercase mb-1">Role</Text>
              <Text className="font-sans text-lg font-bold text-navy capitalize">
                {isEmailUser ? 'Learner' : 'Student'}
              </Text>
            </View>
          </View>
        </ElegantCard>

        {/* Location (email learners only) */}
        {isEmailUser && (
          <ElegantCard className="p-6">
            <Text className="font-display text-xl font-semibold text-navy mb-4">My Location</Text>
            <View className="space-y-4 gap-4">
              <View>
                <Text className="font-sans text-sm font-bold text-slate-700 mb-2">Country</Text>
                <TextInput
                  className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy"
                  placeholder="e.g., Japan"
                  value={country}
                  onChangeText={setCountry}
                  autoCapitalize="words"
                />
              </View>
              <View>
                <Text className="font-sans text-sm font-bold text-slate-700 mb-2">Region</Text>
                <TextInput
                  className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy"
                  placeholder="e.g., Osaka"
                  value={region}
                  onChangeText={setRegion}
                  autoCapitalize="words"
                />
              </View>
              <View className="mt-2">
                <AnimatedButton
                  title={savingLocation ? "Saving..." : "Save Location"}
                  onPress={handleSaveLocation}
                  disabled={savingLocation}
                  variant="primary"
                />
              </View>
            </View>
          </ElegantCard>
        )}

        {/* XP & Stars */}
        <RewardsCard />

        {/* My Progress: Journey map + placement test live here now
            (moved off the home grid at Shastri's request) */}
        <ElegantCard className="p-6">
          <Text className="font-display text-xl font-semibold text-navy mb-4">My Progress</Text>
          <Pressable
            onPress={() => router.push('/learner/journey')}
            className="flex-row items-center justify-between py-3 border-b border-inkline"
          >
            <View className="flex-1 pr-3">
              <Text className="font-sans text-base font-bold text-navy">🗺️ My Journey</Text>
              <Text className="font-sans text-sm text-slate-500">
                Your whole path on one map — lessons finished, extras collected, and what is still waiting.
              </Text>
            </View>
            <Text className="text-gold font-bold text-lg">›</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/learner/placement')}
            className="flex-row items-center justify-between py-3"
          >
            <View className="flex-1 pr-3">
              <Text className="font-sans text-base font-bold text-navy">🎯 Find Your Start</Text>
              <Text className="font-sans text-sm text-slate-500">
                Take or retake the short placement test any time. It suggests the best stage to start from — nothing is ever locked.
              </Text>
            </View>
            <Text className="text-gold font-bold text-lg">›</Text>
          </Pressable>
        </ElegantCard>

        {/* Offline Learning (Round 93): module packs that make the
            lessons play with no connection. */}
        <ElegantCard className="p-6">
          <Text className="font-display text-xl font-semibold text-navy mb-4">Offline Learning</Text>
          <Pressable
            onPress={() => router.push('/learner/my-downloads')}
            className="flex-row items-center justify-between py-3"
          >
            <View className="flex-1 pr-3">
              <Text className="font-sans text-base font-bold text-navy">📥 My Downloads</Text>
              <Text className="font-sans text-sm text-slate-500">
                Save a module to this device while you are online, and its lessons — pictures and voices included — play anywhere, even with no connection.
              </Text>
            </View>
            <Text className="text-gold font-bold text-lg">›</Text>
          </Pressable>
        </ElegantCard>

        {/* My Voices (migration 23): pick the named human voice for
            each kind of speaker. Samples play the actor's approved
            introduction recording. */}
        <ElegantCard className="p-6">
          <Text className="font-display text-xl font-semibold text-navy mb-2">My Voices 🎙️</Text>
          <Text className="font-sans text-slate-500 mb-4">
            Real people are recording the voices for your lessons. For each kind of speaker, pick the voice you like best — tap “Hear sample” to listen to them say hello. Tap a voice you have chosen again to clear it and go back to no preference.
          </Text>
          {voiceOptions.length === 0 ? (
            <Text className="font-sans text-slate-500">
              Your teachers are preparing real voices — coming soon 🎧
            </Text>
          ) : (
            VOICE_CATEGORIES.map((category) => {
              const choices = voiceOptions.filter((v) => v.category === category);
              if (choices.length === 0) return null;
              return (
                <View key={category} className="mb-4">
                  <Text className="font-sans text-base font-bold text-navy">
                    {CATEGORY_PURPOSES[category].heading}
                  </Text>
                  <Text className="font-sans text-sm text-slate-500 mt-0.5 mb-2">
                    {CATEGORY_PURPOSES[category].blurb}
                  </Text>
                  <View className="gap-2">
                    {choices.map((voice) => {
                      const selected = voicePrefs[category] === voice.id;
                      const canPlay =
                        voice.intro_status === 'approved' && !!voice.intro_path;
                      return (
                        <View
                          key={voice.id}
                          className={`flex-row items-center justify-between rounded-xl border p-3 ${
                            selected
                              ? 'border-gold bg-gold-light/50'
                              : 'border-inkline bg-white'
                          }`}
                        >
                          <Pressable
                            className="flex-1 pr-3"
                            onPress={() => handlePickVoice(category, voice.id)}
                            disabled={savingVoiceCat === category}
                          >
                            <Text className="font-sans text-base font-bold text-navy">
                              {voice.display_name}
                              {selected ? '  ✓' : ''}
                            </Text>
                            <Text className="font-sans text-xs text-slate-500">
                              {selected
                                ? 'Your voice for these lines — tap again to clear'
                                : savingVoiceCat === category
                                  ? 'Saving…'
                                  : 'Tap to choose this voice'}
                            </Text>
                          </Pressable>
                          {canPlay ? (
                            <VoiceSampleButton
                              url={getRecordingPublicUrl(voice.intro_path as string)}
                            />
                          ) : (
                            <Text className="font-sans text-xs text-slate-400">
                              Sample coming soon
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}

          {/* Story narrator (Round 80): a separate switch for Smart
              Reading only, independent of the lesson voice picks
              above. Tapping the chosen option again clears it back
              to no preference. */}
          <View className="mt-6 border-t border-inkline pt-5">
            <Text className="font-sans text-base font-bold text-navy">
              Story narrator — Smart Reading
            </Text>
            <Text className="font-sans text-sm text-slate-500 mt-0.5 mb-2">
              Choose who reads your stories aloud in Smart Reading: a man or a woman. This is only for stories, and it is separate from your lesson voices above.
            </Text>
            <View className="gap-2">
              {(
                [
                  ['M1', 'Male voices'],
                  ['F1', 'Female voices'],
                ] as [NarratorCategory, string][]
              ).map(([category, label]) => {
                const selected = narratorCat === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => handlePickNarrator(category)}
                    disabled={savingNarrator}
                    className={`flex-row items-center justify-between rounded-xl border p-3 ${
                      selected
                        ? 'border-gold bg-gold-light/50'
                        : 'border-inkline bg-white'
                    }`}
                  >
                    <View className="flex-1 pr-3">
                      <Text className="font-sans text-base font-bold text-navy">
                        {label}
                        {selected ? '  ✓' : ''}
                      </Text>
                      <Text className="font-sans text-xs text-slate-500">
                        {selected
                          ? 'Your choice for stories — tap again for no preference'
                          : savingNarrator
                            ? 'Saving…'
                            : 'Tap to choose this narrator'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {narratorCat === null ? (
              <Text className="font-sans text-xs text-slate-400 mt-2">
                No preference — stories follow your lesson voice choices above.
              </Text>
            ) : null}
          </View>
        </ElegantCard>

        {/* Study Days (migration 16) */}
        <ElegantCard className="p-6">
          <Text className="font-display text-xl font-semibold text-navy mb-2">My Study Days 📅</Text>
          <Text className="font-sans text-slate-500 mb-4">
            Pick the days you plan to study each week. Your streak and streak badges only count these days — rest days never break your streak, and you can still practise on any day you like.
          </Text>
          <StudyDaysPicker value={studyDays} onChange={setStudyDays} />
          <View className="mt-4">
            <AnimatedButton
              title={savingStudyDays ? 'Saving...' : 'Save My Study Days'}
              onPress={handleSaveStudyDays}
              disabled={savingStudyDays || !isValidStudyDays(studyDays)}
              variant="primary"
            />
          </View>
        </ElegantCard>

        {/* Earned Badges (hidden until the student earns one) */}
        {earnedBadges.length > 0 && (
          <ElegantCard className="p-6">
            <Text className="font-display text-xl font-semibold text-navy mb-4">My Badges</Text>
            <View className="flex-row flex-wrap gap-4">
              {earnedBadges.map((badge, idx) => (
                <View key={idx} className="items-center w-24">
                  {badge.image_url && badge.image_url.startsWith('http') ? (
                    <Image
                      source={{ uri: badge.image_url }}
                      className="w-16 h-16 rounded-full border border-gold bg-gold-light"
                    />
                  ) : (
                    <View className="w-16 h-16 rounded-full bg-gold-light border border-gold items-center justify-center">
                      <Text className="text-3xl">{badge.image_url || '🏆'}</Text>
                    </View>
                  )}
                  <Text className="font-sans font-bold text-navy text-sm text-center mt-2">{badge.title}</Text>
                  {badge.description ? (
                    <Text className="font-sans text-xs text-slate-400 text-center mt-0.5">{badge.description}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </ElegantCard>
        )}

        {/* Security Settings (Only shown for PIN Students) */}
        {!isEmailUser && (
          <ElegantCard className="p-6">
            <Text className="font-display text-xl font-semibold text-navy mb-4">Security Settings</Text>
            <Text className="font-sans text-slate-500 mb-4">Update your 4-digit secret PIN to keep your account safe.</Text>

            <View className="space-y-4">
              <View>
                <Text className="font-sans text-sm font-bold text-slate-700 mb-2">Current PIN</Text>
                <TextInput
                  className="w-full bg-canvas p-4 rounded-xl border border-inkline text-2xl font-mono tracking-widest text-center text-navy"
                  placeholder="****"
                  value={currentPin}
                  onChangeText={setCurrentPin}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                />
              </View>

              <View>
                <Text className="font-sans text-sm font-bold text-slate-700 mb-2">New Secret PIN</Text>
                <TextInput
                  className="w-full bg-canvas p-4 rounded-xl border border-inkline text-2xl font-mono tracking-widest text-center text-navy"
                  placeholder="****"
                  value={newPin}
                  onChangeText={setNewPin}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                />
              </View>

              <View className="mt-2">
                <AnimatedButton
                  title={updating ? "Updating..." : "Update PIN"}
                  onPress={handleUpdatePin}
                  disabled={updating || currentPin.length !== 4 || newPin.length !== 4}
                  variant="primary"
                />
              </View>
            </View>
          </ElegantCard>
        )}

        {/* Delete Account (Round 84): signed-in email/Google
            accounts only. isEmailUser is set solely on the auth
            path in fetchProfileData; PIN students never reach it,
            because their accounts are deleted by their manager. */}
        {isEmailUser && authEmail ? (
          <DeleteAccountBlock email={authEmail} providers={authProviders} variant="learner" />
        ) : null}

      </View>
    </ScrollView>
    </View>
  );
}