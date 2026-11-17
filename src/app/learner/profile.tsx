import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedButton from '../../components/ui/AnimatedButton';
import RewardsCard from '../../components/ui/RewardsCard';
import StudyDaysPicker, { isValidStudyDays } from '../../components/ui/StudyDaysPicker';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';

interface EarnedBadge {
  title: string;
  description: string | null;
  image_url: string | null;
}

export default function StudentProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [isEmailUser, setIsEmailUser] = useState(false);
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
        
        setIsEmailUser(false);
        await loadBadges(targetId);
        setLoading(false);
        return; // CRITICAL: Stop here. Do not fall through to Email check.
      }
      
      // SCENARIO 2: Email Learner (Standard Supabase Auth)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
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
      <View className="flex-1 bg-surface-background items-center justify-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
      <View className="max-w-2xl w-full mx-auto space-y-6">
        
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-3xl font-bold text-[#0A192F]">My Profile</Text>
          <Pressable onPress={() => router.push('/learner')} className="px-4 py-2 bg-slate-200 rounded-lg">
            <Text className="font-bold text-slate-700">← Back</Text>
          </Pressable>
        </View>

        {/* Identity Card */}
        <View className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm items-center">
          <View className="w-24 h-24 bg-brand/10 rounded-full items-center justify-center mb-4">
            <Text className="text-5xl">👤</Text>
          </View>
          <Text className="text-2xl font-bold text-text-primary mb-1">
            {profile?.username || profile?.display_name}
          </Text>
          <Text className="text-slate-500 font-mono">ID: {profile?.id.split('-')[0]}</Text>
          
          <View className="flex-row gap-4 mt-6 w-full">
            <View className="flex-1 bg-emerald-50 p-4 rounded-xl border border-emerald-100 items-center">
              <Text className="text-xs font-bold text-emerald-600 uppercase mb-1">Status</Text>
              <Text className="text-lg font-bold text-emerald-800">Active</Text>
            </View>
            <View className="flex-1 bg-blue-50 p-4 rounded-xl border border-blue-100 items-center">
              <Text className="text-xs font-bold text-blue-600 uppercase mb-1">Role</Text>
              <Text className="text-lg font-bold text-blue-800 capitalize">
                {isEmailUser ? 'Learner' : 'Student'}
              </Text>
            </View>
          </View>
        </View>

        {/* Location (email learners only) */}
        {isEmailUser && (
          <View className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <Text className="text-xl font-bold text-[#0A192F] mb-4">My Location</Text>
            <View className="space-y-4 gap-4">
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-2">Country</Text>
                <TextInput
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-text-primary"
                  placeholder="e.g., Japan"
                  value={country}
                  onChangeText={setCountry}
                  autoCapitalize="words"
                />
              </View>
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-2">Region</Text>
                <TextInput
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-text-primary"
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
          </View>
        )}

        {/* XP & Stars */}
        <RewardsCard />

        {/* My Progress: Journey map + placement test live here now
            (moved off the home grid at Shastri's request) */}
        <View className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <Text className="text-xl font-bold text-[#0A192F] mb-4">My Progress</Text>
          <Pressable
            onPress={() => router.push('/learner/journey')}
            className="flex-row items-center justify-between py-3 border-b border-slate-100"
          >
            <View className="flex-1 pr-3">
              <Text className="text-base font-bold text-slate-800">🗺️ My Journey</Text>
              <Text className="text-sm text-slate-500">
                Your whole path on one map — lessons finished, extras collected, and what is still waiting.
              </Text>
            </View>
            <Text className="text-[#D4AF37] font-bold text-lg">›</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/learner/placement')}
            className="flex-row items-center justify-between py-3"
          >
            <View className="flex-1 pr-3">
              <Text className="text-base font-bold text-slate-800">🎯 Find Your Start</Text>
              <Text className="text-sm text-slate-500">
                Take or retake the short placement test any time. It suggests the best stage to start from — nothing is ever locked.
              </Text>
            </View>
            <Text className="text-[#D4AF37] font-bold text-lg">›</Text>
          </Pressable>
        </View>

        {/* Study Days (migration 16) */}
        <View className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <Text className="text-xl font-bold text-[#0A192F] mb-2">My Study Days 📅</Text>
          <Text className="text-slate-500 mb-4">
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
        </View>

        {/* Earned Badges (hidden until the student earns one) */}
        {earnedBadges.length > 0 && (
          <View className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <Text className="text-xl font-bold text-[#0A192F] mb-4">My Badges</Text>
            <View className="flex-row flex-wrap gap-4">
              {earnedBadges.map((badge, idx) => (
                <View key={idx} className="items-center w-24">
                  {badge.image_url && badge.image_url.startsWith('http') ? (
                    <Image
                      source={{ uri: badge.image_url }}
                      className="w-16 h-16 rounded-full border border-amber-200 bg-amber-50"
                    />
                  ) : (
                    <View className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 items-center justify-center">
                      <Text className="text-3xl">{badge.image_url || '🏆'}</Text>
                    </View>
                  )}
                  <Text className="font-bold text-slate-700 text-sm text-center mt-2">{badge.title}</Text>
                  {badge.description ? (
                    <Text className="text-xs text-slate-400 text-center mt-0.5">{badge.description}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Security Settings (Only shown for PIN Students) */}
        {!isEmailUser && (
          <View className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <Text className="text-xl font-bold text-[#0A192F] mb-4">Security Settings</Text>
            <Text className="text-slate-500 mb-4">Update your 4-digit secret PIN to keep your account safe.</Text>
            
            <View className="space-y-4">
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-2">Current PIN</Text>
                <TextInput
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-2xl font-mono tracking-widest text-center"
                  placeholder="****"
                  value={currentPin}
                  onChangeText={setCurrentPin}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                />
              </View>

              <View>
                <Text className="text-sm font-bold text-slate-700 mb-2">New Secret PIN</Text>
                <TextInput
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-2xl font-mono tracking-widest text-center"
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
          </View>
        )}

      </View>
    </ScrollView>
    </SafeAreaView>
  );
}