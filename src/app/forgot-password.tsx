import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedButton from '../components/ui/AnimatedButton';
import { supabase } from '../lib/supabase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // Adjust this URL to your production domain later (e.g., https://englishforcricket.com/update-password)
        redirectTo: Platform.OS === 'web' ? `${window.location.origin}/update-password` : 'englishforcricket://update-password',
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (error: any) {
      Alert.alert('Reset Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-background justify-center px-6 py-12 md:px-12">
      <View className="max-w-md w-full mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <View className="mb-8">
          <Text className="text-3xl font-bold text-[#0A192F] mb-2">Reset Password</Text>
          <Text className="text-slate-500 text-sm">
            Enter the email address associated with your account, and we will send you a secure link to reset your password.
          </Text>
        </View>

        {submitted ? (
          <View className="bg-emerald-50 border border-emerald-200 p-6 rounded-xl items-center">
            <Text className="text-4xl mb-2">✉️</Text>
            <Text className="text-emerald-800 font-bold text-lg mb-1">Check your inbox</Text>
            <Text className="text-emerald-700 text-sm text-center">
              We&apos;ve sent a password reset link to {email}. It may take a few minutes to arrive.
            </Text>
            <View className="w-full mt-6">
              <Link href="/login" asChild>
                <AnimatedButton title="Return to Login" onPress={() => {}} variant="outline" />
              </Link>
            </View>
          </View>
        ) : (
          <View className="space-y-6">
            <View>
              <Text className="text-sm font-bold text-slate-700 mb-2">Email Address</Text>
              <TextInput
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
                placeholder="parent@school.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View className="mt-2">
              <AnimatedButton 
                title={loading ? "Sending..." : "Send Reset Link"} 
                onPress={handleReset} 
                disabled={loading} 
                variant="primary" 
              />
            </View>

            <View className="flex-row justify-center items-center gap-1 mt-4">
              <Text className="text-slate-500">Remember your password?</Text>
              <Link href="/login" asChild>
                <Text className="text-brand font-bold">Log in</Text>
              </Link>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}