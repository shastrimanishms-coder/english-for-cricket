import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, GhostButton, GoldButton } from '../components/ui/Elegant';
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
    <SafeAreaView className="flex-1 bg-canvas justify-center px-6 py-12 md:px-12">
      <ElegantCard className="max-w-md w-full mx-auto p-8">
        <View className="mb-8">
          <Text className="font-display text-3xl font-semibold text-navy mb-2">Reset Password</Text>
          <Text className="font-sans text-slate-500 text-sm">
            Enter the email address associated with your account, and we will send you a secure link to reset your password.
          </Text>
        </View>

        {submitted ? (
          <View className="bg-pitch-light border border-pitch/20 p-6 rounded-xl items-center">
            <Text className="text-4xl mb-2">✉️</Text>
            <Text className="font-sans text-pitch-dark font-bold text-lg mb-1">Check your inbox</Text>
            <Text className="font-sans text-pitch-dark text-sm text-center">
              We&apos;ve sent a password reset link to {email}. It may take a few minutes to arrive.
            </Text>
            <View className="w-full mt-6">
              <Link href="/login" asChild>
                <GhostButton label="Return to Login" onPress={() => {}} className="w-full" />
              </Link>
            </View>
          </View>
        ) : (
          <View className="space-y-6">
            <View>
              <Text className="font-sans text-sm font-bold text-navy mb-2">Email Address</Text>
              <TextInput
                className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy"
                placeholder="parent@school.com"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View className="mt-2">
              <GoldButton
                label={loading ? "Sending..." : "Send Reset Link"}
                onPress={handleReset}
                disabled={loading}
                className="w-full"
              />
            </View>

            <View className="flex-row justify-center items-center gap-1 mt-4">
              <Text className="font-sans text-slate-500">Remember your password?</Text>
              <Link href="/login" asChild>
                <Text className="font-sans text-gold-dark font-bold">Log in</Text>
              </Link>
            </View>
          </View>
        )}
      </ElegantCard>
    </SafeAreaView>
  );
}