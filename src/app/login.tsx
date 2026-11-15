import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native';
import AnimatedButton from '../components/ui/AnimatedButton';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  
  // Toggle State
  const [loginMode, setLoginMode] = useState<'email' | 'pin'>('email');
  const [loading, setLoading] = useState(false);

  // Standard Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Student Auth State
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
      showAlert('Missing Fields', 'Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) {
        setLoading(false);
        if (authError.message.includes('Email not confirmed')) {
          showAlert('Email Not Verified', 'Please check your inbox and verify your email address.');
        } else {
          showAlert('Login Failed', authError.message);
        }
        return;
      }

      if (authData?.user) {
        // An email login supersedes any PIN-student session left on this
        // device; drop it so the two session types can never be confused.
        await AsyncStorage.removeItem('student_session');

        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single();
        
        setLoading(false);

        if (profileError || !profileData) {
          showAlert('Profile Error', 'Could not retrieve your user profile.');
          return;
        }

        const userRole = profileData.role;
        if (userRole === 'super_admin') {
          router.replace('/admin');
        } else if (userRole === 'manager') {
          router.replace('/manager');
        } else {
          router.replace('/learner');
        }
      }
    } catch (err: any) {
      setLoading(false);
      showAlert('Network Error', err.message || 'Could not connect to the server.');
    }
  };

  const handlePinLogin = async () => {
    if (!username.trim() || !pin.trim()) {
      showAlert('Missing Fields', 'Please enter both your Username and PIN.');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('authenticate_student', {
        p_username: username.trim().toLowerCase(),
        p_pin: pin.trim(),
      });

      setLoading(false);

      if (error) {
        showAlert('Login Failed', 'Oops! That username or PIN is incorrect. Try again!');
        return;
      }

      if (data) {
        // Save the student session locally before routing - but strip the
        // PIN value from what gets persisted. The authenticate_student RPC
        // returns it, yet nothing ever reads it back (changing a PIN asks
        // the student to type the current one), so storing it would only
        // leave a working credential sitting on the device.
        const sessionData = { ...data };
        delete sessionData.hashed_pin;
        await AsyncStorage.setItem('student_session', JSON.stringify(sessionData));

        showAlert('Welcome!', `Hi ${data.display_name}! Routing to Learner Dashboard...`);
        router.replace('/learner');
      }
    } catch {
      setLoading(false);
      showAlert('Network Error', 'Could not connect to the server.');
    }
  };

  // --- NEW GOOGLE AUTH FUNCTION ---
  const handleGoogleAuth = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: Platform.OS === 'web' ? window.location.origin : 'englishforcricket://',
        },
      });

      if (error) throw error;
    } catch (err: any) {
      setLoading(false);
      showAlert('Google Error', err.message || 'Could not connect to Google.');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-surface-background"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="w-full max-w-lg mx-auto">
          
          <View className="mb-8 items-center">
            {loginMode === 'pin' ? (
              <Text className="text-6xl mb-4">🏏</Text>
            ) : (
              <View className="h-16" />
            )}
            <Text className="text-3xl md:text-4xl font-bold text-text-primary mb-2 text-center">
              Welcome Back
            </Text>
            <Text className="text-text-secondary text-lg text-center px-4">
              {loginMode === 'pin' 
                ? "For kids logging in with a Username and PIN." 
                : "For parents, teachers, and individual learners."}
            </Text>
          </View>

          {/* LOGIN TOGGLE */}
          <View className="flex-row bg-slate-200 p-1 rounded-xl mb-8">
            <Pressable
              onPress={() => setLoginMode('email')}
              className={`flex-1 py-3 rounded-lg items-center ${loginMode === 'email' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`font-bold text-base ${loginMode === 'email' ? 'text-text-primary' : 'text-text-secondary'}`}>
                Email Account
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLoginMode('pin')}
              className={`flex-1 py-3 rounded-lg items-center ${loginMode === 'pin' ? 'bg-brand shadow-sm' : ''}`}
            >
              <Text className={`font-bold text-base ${loginMode === 'pin' ? 'text-white' : 'text-text-secondary'}`}>
                Student PIN
              </Text>
            </Pressable>
          </View>

          {/* DYNAMIC FORM */}
          {loginMode === 'pin' ? (
            <View className="space-y-4 gap-4 mb-8">
              <View>
                <Text className="text-sm font-bold text-text-secondary mb-2 ml-1">Username</Text>
                <TextInput
                  className="w-full bg-white p-5 rounded-2xl border-2 border-slate-200 text-text-primary text-xl font-mono"
                  placeholder="e.g. kenji-sha-123"
                  placeholderTextColor="#94A3B8"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View>
                <Text className="text-sm font-bold text-text-secondary mb-2 ml-1">Secret PIN</Text>
                <TextInput
                  className="w-full bg-white p-5 rounded-2xl border-2 border-slate-200 text-text-primary text-2xl font-mono tracking-widest text-center"
                  placeholder="****"
                  placeholderTextColor="#94A3B8"
                  value={pin}
                  onChangeText={setPin}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                />
              </View>
              <AnimatedButton 
                title={loading ? "Checking..." : "Let's Go! 🚀"} 
                onPress={handlePinLogin} 
                disabled={loading} 
                variant="primary" 
              />
            </View>
          ) : (
            <View className="space-y-4 gap-4 mb-2">
              <TextInput
                className="w-full bg-white p-4 rounded-xl border border-slate-200 text-text-primary text-lg"
                placeholder="Email Address"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                className="w-full bg-white p-4 rounded-xl border border-slate-200 text-text-primary text-lg"
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <View className="flex-row justify-end mb-4 mt-2">
                <Link href="/forgot-password" asChild>
                  <Text className="text-sm font-bold text-brand hover:underline">Forgot Password?</Text>
                </Link>
              </View>
              <AnimatedButton 
                title={loading ? "Logging in..." : "Log In"} 
                onPress={handleEmailLogin} 
                disabled={loading} 
                variant="primary" 
              />

              {/* --- NEW GOOGLE AUTH BUTTON SECTION --- */}
              <View className="flex-row items-center my-6">
                <View className="flex-1 h-[1px] bg-slate-200" />
                <Text className="mx-4 text-slate-400 font-bold">OR</Text>
                <View className="flex-1 h-[1px] bg-slate-200" />
              </View>

              <Pressable
                onPress={handleGoogleAuth}
                disabled={loading}
                className="w-full bg-white flex-row items-center justify-center p-4 rounded-xl border border-slate-200 shadow-sm"
              >
                <Text className="text-xl mr-3">🇬</Text>
                <Text className="font-bold text-slate-700 text-lg">Continue with Google</Text>
              </Pressable>
              {/* --- END GOOGLE AUTH BUTTON SECTION --- */}

              <View className="flex-row justify-center mt-6">
                <Text className="text-text-secondary text-base">Don&apos;t have an account? </Text>
                <Link href="/register" asChild>
                  <Text className="text-brand font-bold text-base">Register here</Text>
                </Link>
              </View>
            </View>
            
          )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}