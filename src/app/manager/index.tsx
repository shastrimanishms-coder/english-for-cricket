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
      <View className="flex-1 bg-surface-background justify-center items-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-background">
      {/* Dashboard Header */}
      <SafeAreaView edges={['top']} className="w-full bg-surface shadow-sm border-b border-slate-200">
        <View className="max-w-7xl w-full mx-auto flex-row justify-between items-center p-6">
          <View>
            <Text className="text-xl font-bold text-text-primary tracking-widest uppercase">
              English For Cricket
            </Text>
            <Text className="text-sm font-semibold text-action tracking-widest uppercase">
              Parent / Teacher Portal
            </Text>
          </View>
          
          <Pressable 
            onPress={handleLogout}
            className="px-6 py-2 bg-slate-100 rounded-lg border border-slate-200"
          >
            <Text className="text-text-secondary font-bold">Log Out</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Main Dashboard Content */}
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-7xl w-full mx-auto">
          
          <View className="mb-8">
            <Text className="text-3xl font-bold text-text-primary mb-2">
              Dashboard Overview
            </Text>
            <Text className="text-text-secondary text-lg">
              Manage your students, track their progress, and update settings here.
            </Text>
          </View>

          {/* Action Cards Grid */}
          <View className="flex-row flex-wrap gap-6">
            
            {/* Manage Students Card */}
            <Pressable 
              onPress={() => router.push('/manager/students')}
              className="flex-1 min-w-[260px] md:min-w-[300px] bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
            >
              <Text className="text-4xl mb-4">👨‍🎓</Text>
              <Text className="text-xl font-bold text-text-primary mb-2">My Students</Text>
              <Text className="text-text-secondary">
                Add new student accounts, generate login PINs, and manage access.
              </Text>
            </Pressable>

            {/* Learning Progress Card - UPDATED ROUTE */}
            <Pressable 
              onPress={() => router.push('/manager/progress')}
              className="flex-1 min-w-[260px] md:min-w-[300px] bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
            >
              <Text className="text-4xl mb-4">📊</Text>
              <Text className="text-xl font-bold text-text-primary mb-2">Learning Progress</Text>
              <Text className="text-text-secondary">
                View lesson completion rates, quiz scores, and voice accuracy.
              </Text>
            </Pressable>

            {/* Settings Card */}
            <Pressable 
              onPress={() => router.push('/manager/settings')}
              className="flex-1 min-w-[260px] md:min-w-[300px] bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
            >
              <Text className="text-4xl mb-4">⚙️</Text>
              <Text className="text-xl font-bold text-text-primary mb-2">Organization Settings</Text>
              <Text className="text-text-secondary">
                Update your family/school name, email address, and AI Chat permissions.
              </Text>
            </Pressable>

          </View>

        </View>
      </ScrollView>
    </View>
  );
}