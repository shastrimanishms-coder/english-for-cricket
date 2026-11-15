import { Link } from 'expo-router';
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

export default function RegisterScreen() {
  // Form State
  const [role, setRole] = useState<'individual_learner' | 'manager'>('individual_learner');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleRegister = async () => {
    // 1. Frontend Security Validations
    if (!email || !password || !displayName) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Your password must be at least 8 characters long.');
      return;
    }
    if (role === 'individual_learner' && (!age || !gender)) {
      Alert.alert('Missing Info', 'Age and Gender are required to calibrate your learning experience.');
      return;
    }

    try {
      setLoading(true);
      console.log("Attempting to register:", email);

      // 2. Execute Supabase SignUp
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            display_name: displayName.trim(),
            role: role,
            // Safely parse age to prevent NaN database errors
            age: role === 'individual_learner' && age ? parseInt(age, 10) : null,
            gender: role === 'individual_learner' ? gender : null,
          },
        },
      });

      console.log("Supabase response:", { data, error });
      setLoading(false);

      if (error) {
        Alert.alert('Registration Failed', error.message);
      } else if (data?.user) {
        // Registration successful! Show the "Check Inbox" screen.
        setIsSuccess(true);
      } else {
        Alert.alert('Error', 'An unknown error occurred during registration.');
      }
    } catch (err: any) {
      setLoading(false);
      console.error("Signup exception:", err);
      Alert.alert('Network Error', err.message || 'Could not connect to the server.');
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
      Alert.alert('Google Error', err.message || 'Could not connect to Google.');
    }
  };

  // SUCCESS STATE
  if (isSuccess) {
    return (
      <View className="flex-1 bg-surface-background justify-center items-center p-6">
        <View className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm items-center">
          <View className="w-20 h-20 bg-green-100 rounded-full justify-center items-center mb-6">
            <Text className="text-4xl">✉️</Text>
          </View>
          <Text className="text-3xl font-bold text-text-primary mb-4 text-center">
            Check Your Inbox
          </Text>
          <Text className="text-text-secondary text-center mb-8 leading-relaxed text-lg">
            We&apos;ve sent a verification link to <Text className="font-bold text-text-primary">{email}</Text>. 
            Please verify your email address to activate your account.
          </Text>
          <Link href="/login" asChild>
            <AnimatedButton title="Proceed to Login" onPress={() => {}} variant="primary" />
          </Link>
        </View>
      </View>
    );
  }

  // REGISTRATION FORM STATE
  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-surface-background"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="w-full max-w-lg mx-auto">
          
          <View className="mb-10">
            <Text className="text-3xl md:text-4xl font-bold text-text-primary mb-3">
              Create an Account
            </Text>
            <Text className="text-text-secondary text-lg">
              Join English For Cricket completely free.
            </Text>
          </View>

          {/* SMART ROLE TOGGLE */}
          <Text className="text-text-primary font-bold mb-3 ml-1">Who is this account for?</Text>
          <View className="flex-row gap-4 mb-8">
            <Pressable 
              onPress={() => setRole('individual_learner')}
              className={`flex-1 p-4 rounded-2xl border-2 transition-all justify-center items-center ${role === 'individual_learner' ? 'border-brand bg-green-50' : 'border-slate-200 bg-white'}`}
            >
              <Text className="text-2xl mb-2">🎓</Text>
              <Text className={`font-bold text-center ${role === 'individual_learner' ? 'text-brand' : 'text-text-secondary'}`}>
                I&apos;m a Student
              </Text>
              <Text className={`text-xs text-center mt-1 ${role === 'individual_learner' ? 'text-brand' : 'text-slate-400'}`}>
                (for individual account)
              </Text>
            </Pressable>
            
            <Pressable 
              onPress={() => setRole('manager')}
              className={`flex-1 p-4 rounded-2xl border-2 transition-all justify-center items-center ${role === 'manager' ? 'border-action bg-blue-50' : 'border-slate-200 bg-white'}`}
            >
              <Text className="text-2xl mb-2">👨‍👩‍👧‍👦</Text>
              <Text className={`font-bold text-center ${role === 'manager' ? 'text-action' : 'text-text-secondary'}`}>
                Parent / Teacher
              </Text>
              <Text className={`text-xs text-center mt-1 ${role === 'manager' ? 'text-action' : 'text-slate-400'}`}>
                (for multiple student accounts)
              </Text>
            </Pressable>
          </View>

          {/* CORE FORM FIELDS */}
          <View className="space-y-4 gap-4 mb-8">
            <TextInput
              className="w-full bg-white p-4 rounded-xl border border-slate-200 text-text-primary text-lg"
              placeholder={role === 'manager' ? "Organization or Full Name" : "Your Full Name"}
              placeholderTextColor="#94A3B8"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />
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
              placeholder="Password (min. 8 characters)"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {/* CONDITIONAL DEMOGRAPHICS (Only for Students) */}
            {role === 'individual_learner' && (
              <View className="p-4 bg-slate-50 rounded-xl border border-slate-100 mt-2 gap-4">
                <Text className="text-sm font-semibold text-text-secondary mb-1">
                  Required for voice recognition calibration:
                </Text>
                
                <TextInput
                  className="w-full bg-white p-4 rounded-xl border border-slate-200 text-text-primary text-lg"
                  placeholder="Age"
                  placeholderTextColor="#94A3B8"
                  value={age}
                  onChangeText={setAge}
                  keyboardType="number-pad"
                  maxLength={2}
                />

                <View className="flex-row gap-2">
                  {['Male', 'Female', 'Other'].map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => setGender(g as any)}
                      className={`flex-1 py-3 rounded-lg border items-center ${gender === g ? 'border-brand bg-brand' : 'border-slate-200 bg-white'}`}
                    >
                      <Text className={`font-semibold ${gender === g ? 'text-white' : 'text-text-secondary'}`}>
                        {g}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* SUBMIT BUTTON */}
          <AnimatedButton 
            title={loading ? "Creating Account..." : "Create Account"} 
            onPress={handleRegister} 
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

          <View className="flex-row justify-center mt-8">
            <Text className="text-text-secondary text-base">Already have an account? </Text>
            <Link href="/login" asChild>
              <Text className="text-action font-bold text-base">Log in here</Text>
            </Link>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}