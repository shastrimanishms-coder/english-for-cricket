import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, GoldButton } from '../components/ui/Elegant';
import { supabase } from '../lib/supabase';

export default function UpdatePassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if the user is actually in a recovery session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        Alert.alert('Invalid Session', 'Your password reset link is invalid or has expired. Please request a new one.');
        router.replace('/forgot-password');
      }
    });
  }, [router]);

  const handleUpdate = async () => {
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;
      
      Alert.alert('Success', 'Your password has been updated successfully.', [
        { text: 'Log In', onPress: () => router.replace('/login') }
      ]);
    } catch (error: any) {
      Alert.alert('Update Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas justify-center px-6 py-12 md:px-12">
      <ElegantCard className="max-w-md w-full mx-auto p-8 space-y-6">
        <View className="mb-2">
          <Text className="font-display text-3xl font-semibold text-navy mb-2">Create New Password</Text>
          <Text className="font-sans text-slate-500 text-sm">
            Please enter your new password below. Make sure it&apos;s secure.
          </Text>
        </View>

        <View>
          <Text className="font-sans text-sm font-bold text-navy mb-2">New Password</Text>
          <TextInput
            className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy"
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <View>
          <Text className="font-sans text-sm font-bold text-navy mb-2">Confirm New Password</Text>
          <TextInput
            className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy"
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        <View className="mt-4">
          <GoldButton
            label={loading ? "Updating..." : "Update Password"}
            onPress={handleUpdate}
            disabled={loading}
            className="w-full"
          />
        </View>
      </ElegantCard>
    </SafeAreaView>
  );
}