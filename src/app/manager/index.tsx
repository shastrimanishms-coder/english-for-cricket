import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRequireRole } from '../../hooks/useRequireRole';
import { supabase } from '../../lib/supabase';

export default function ManagerDashboard() {
  const router = useRouter();
  // Defense-in-depth: manager area is for the manager role only, matching
  // the one-home-per-role routing in login.tsx. (RLS remains the real
  // enforcement on the data.)
  const guardStatus = useRequireRole(['manager']);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Logout Error', error.message);
    } else {
      // Redirect back to the landing page after logging out
      router.replace('/');
    }
  };

  if (guardStatus !== 'authorized') {
    return (
      <View className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Dashboard Header */}
      <SafeAreaView edges={['top']} className="w-full bg-navy shadow-sm">
        <View className="max-w-7xl w-full mx-auto flex-row justify-between items-center px-6 py-5">
          <View>
            <Text className="font-display text-xl font-semibold text-white">
              English For Cricket
            </Text>
            <Text className="font-sans text-[11px] font-bold text-gold tracking-[2.5px] uppercase mt-1">
              Parent / Teacher Portal
            </Text>
          </View>

          <Pressable
            onPress={handleLogout}
            className="px-5 py-2.5 rounded-full bg-white/10 border border-white/25 active:bg-white/20"
          >
            <Text className="font-sans text-sm font-bold text-white">Log Out</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Main Dashboard Content */}
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-7xl w-full mx-auto">

          <View className="mb-8">
            <Text className="font-display text-3xl font-semibold text-navy mb-2">
              Dashboard Overview
            </Text>
            <Text className="font-sans text-slate-500 text-lg">
              Manage your students, track their progress, and update settings here.
            </Text>
          </View>

          {/* Action Cards Grid */}
          <View className="flex-row flex-wrap gap-6">

            {/* Manage Students Card */}
            <Pressable
              onPress={() => router.push('/manager/students')}
              className="flex-1 min-w-[260px] md:min-w-[300px] bg-white p-6 rounded-[20px] shadow-sm border border-inkline active:opacity-90"
            >
              <View className="w-14 h-14 rounded-full bg-navy items-center justify-center mb-4">
                <Ionicons name="people" size={26} color="#D4AF37" />
              </View>
              <Text className="font-display text-xl font-semibold text-navy mb-2">My Students</Text>
              <Text className="font-sans text-slate-500">
                Add new student accounts, generate login PINs, and manage access.
              </Text>
            </Pressable>

            {/* Learning Progress Card - UPDATED ROUTE */}
            <Pressable
              onPress={() => router.push('/manager/progress')}
              className="flex-1 min-w-[260px] md:min-w-[300px] bg-white p-6 rounded-[20px] shadow-sm border border-inkline active:opacity-90"
            >
              <View className="w-14 h-14 rounded-full bg-navy items-center justify-center mb-4">
                <Ionicons name="stats-chart" size={26} color="#D4AF37" />
              </View>
              <Text className="font-display text-xl font-semibold text-navy mb-2">Learning Progress</Text>
              <Text className="font-sans text-slate-500">
                View lesson completion rates, quiz scores, and voice accuracy.
              </Text>
            </Pressable>

            {/* Settings Card */}
            <Pressable
              onPress={() => router.push('/manager/settings')}
              className="flex-1 min-w-[260px] md:min-w-[300px] bg-white p-6 rounded-[20px] shadow-sm border border-inkline active:opacity-90"
            >
              <View className="w-14 h-14 rounded-full bg-navy items-center justify-center mb-4">
                <Ionicons name="settings" size={26} color="#D4AF37" />
              </View>
              <Text className="font-display text-xl font-semibold text-navy mb-2">Organization Settings</Text>
              <Text className="font-sans text-slate-500">
                Update your family/school name, email address, and AI Chat permissions.
              </Text>
            </Pressable>

          </View>

        </View>
      </ScrollView>
    </View>
  );
}
