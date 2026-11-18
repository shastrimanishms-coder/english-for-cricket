import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, GoldButton, MicroLabel } from '../../components/ui/Elegant';
import {
  authenticateActor,
  getActorSession,
  saveActorSession,
} from '../../lib/voiceStudio';

/**
 * Voice Studio sign-in. Actors have no email and no Supabase session:
 * the admin creates a username + password and sends it with this
 * page's link. A saved session forwards straight to the studio.
 */
export default function StudioLogin() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await getActorSession();
      if (!alive) return;
      if (session) {
        router.replace('/studio/record');
      } else {
        setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  const handleSignIn = async () => {
    if (!username.trim() || !password) {
      setErrorMessage('Please type the username and password you were sent.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const result = await authenticateActor(username, password);
    if (result.status === 'ok') {
      await saveActorSession(result.session);
      router.replace('/studio/record');
      return;
    }
    setSubmitting(false);
    setErrorMessage(
      result.status === 'invalid'
        ? 'That username and password were not recognised. Please check them and try again.'
        : 'The Voice Studio is not set up yet. Please ask the admin to finish setting it up, then try again.'
    );
  };

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <View className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6">
          <Text className="font-display text-2xl font-semibold text-white">
            Voice Studio
          </Text>
          <Text className="mt-1 font-sans text-sm text-slate-300">
            Record the voices for English for Cricket lessons.
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
        <View className="mx-auto w-full max-w-md">
          <ElegantCard className="p-6">
            <MicroLabel>For voice actors</MicroLabel>
            <Text className="mb-1 mt-2 font-display text-2xl font-semibold text-navy">
              Welcome back
            </Text>
            <Text className="mb-6 font-sans text-sm text-slate-500">
              Sign in with the username and password you were sent. Your
              lines will be waiting for you, one at a time.
            </Text>

            <View className="gap-4">
              <View>
                <Text className="mb-2 font-sans text-sm font-bold text-slate-700">
                  Username
                </Text>
                <TextInput
                  className="w-full rounded-xl border border-inkline bg-canvas p-4 font-sans text-navy"
                  placeholder="e.g. amy-voice"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </View>
              <View>
                <Text className="mb-2 font-sans text-sm font-bold text-slate-700">
                  Password
                </Text>
                <TextInput
                  className="w-full rounded-xl border border-inkline bg-canvas p-4 font-sans text-navy"
                  placeholder="Your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                  onSubmitEditing={handleSignIn}
                />
              </View>

              {errorMessage ? (
                <View className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <Text className="font-sans text-sm font-semibold text-red-700">
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              <GoldButton
                label={submitting ? 'Signing in…' : 'Sign in to the studio'}
                onPress={handleSignIn}
                disabled={submitting}
              />
              <Text className="text-center font-sans text-xs text-slate-400">
                No account? The admin creates actor accounts - ask them for
                your username and password.
              </Text>
            </View>
          </ElegantCard>
        </View>
      </ScrollView>
    </View>
  );
}
