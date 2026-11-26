import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, GoldButton } from '../components/ui/Elegant';
import { resetVoiceSessionCaches } from '../lib/lessonVoices';
import {
  loadSavedAccounts,
  rememberSavedAccount,
  removeSavedAccount,
  type SavedAccount,
} from '../lib/savedAccounts';
import { supabase } from '../lib/supabase';

/**
 * Switch Account (Round 81, Part 3).
 *
 * Families share one device. The learner dashboard's Switch Account
 * button ends the current session exactly like Log Out and lands
 * here: a list of the accounts that have logged in on this device
 * before (saved automatically at login — names and login identifiers
 * ONLY, never passwords or PINs; see src/lib/savedAccounts.ts).
 * Picking a name asks for just that account's own sign-in — its
 * password, its PIN, or (Round 89) its Google sign-in for accounts
 * that registered with Google and have no password — and then signs
 * in through the very same calls the login screen uses: there is no
 * separate switch authentication path.
 */
export default function SwitchAccountScreen() {
  const router = useRouter();
  const [loadingList, setLoadingList] = useState(true);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [selected, setSelected] = useState<SavedAccount | null>(null);
  const [credential, setCredential] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAccounts(await loadSavedAccounts());
    setLoadingList(false);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  const pickAccount = (account: SavedAccount) => {
    setSelected(account);
    setCredential('');
    setError(null);
    setConfirmRemoveKey(null);
  };

  const backToList = () => {
    setSelected(null);
    setCredential('');
    setError(null);
  };

  const handleRemove = async (account: SavedAccount) => {
    await removeSavedAccount(account.kind, account.identifier);
    setConfirmRemoveKey(null);
    if (selected && selected.kind === account.kind && selected.identifier === account.identifier) {
      backToList();
    }
    await refresh();
  };

  // Email learner: the login screen's own flow (signInWithPassword +
  // role routing), with the email already filled from the saved entry.
  const submitAuth = async (account: SavedAccount) => {
    if (!credential) {
      setError('Please enter your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: account.identifier,
        password: credential,
      });
      if (authError) {
        setBusy(false);
        if (authError.message.includes('Email not confirmed')) {
          setError('Please check your inbox and verify your email address.');
        } else {
          setError(authError.message);
        }
        return;
      }
      if (!authData?.user) {
        setBusy(false);
        setError('Login failed. Please try again.');
        return;
      }
      // Mirror the login screen: an email login supersedes any PIN
      // session left on this device.
      await AsyncStorage.removeItem('student_session');
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, display_name')
        .eq('id', authData.user.id)
        .single();
      setBusy(false);
      if (profileError || !profileData) {
        setError('Could not retrieve your user profile.');
        return;
      }
      await rememberSavedAccount({
        kind: 'auth',
        displayName:
          (profileData.display_name as string | null) ||
          account.displayName ||
          account.identifier.split('@')[0] ||
          account.identifier,
        identifier: account.identifier,
        provider: 'password',
      });
      // The previous student's resolved voices must not carry over.
      resetVoiceSessionCaches();
      const role = profileData.role;
      if (role === 'super_admin' || role === 'content_manager') router.replace('/admin');
      else if (role === 'manager') router.replace('/manager');
      else router.replace('/learner');
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || 'Could not connect to the server.');
    }
  };

  // PIN student: the login screen's own flow (authenticate_student),
  // with the username already filled from the saved entry.
  const submitPin = async (account: SavedAccount) => {
    if (!credential.trim()) {
      setError('Please enter your PIN.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('authenticate_student', {
        p_username: account.identifier,
        p_pin: credential.trim(),
      });
      setBusy(false);
      if (rpcError || !data) {
        setError('Oops! That PIN is incorrect. Try again!');
        return;
      }
      // Same as the login screen: persist the session WITHOUT the PIN
      // hash the RPC returns.
      const sessionData = { ...data };
      delete sessionData.hashed_pin;
      await AsyncStorage.setItem('student_session', JSON.stringify(sessionData));
      await rememberSavedAccount({
        kind: 'sub_account',
        displayName: data.display_name || account.displayName,
        identifier: account.identifier,
      });
      resetVoiceSessionCaches();
      router.replace('/learner');
    } catch {
      setBusy(false);
      setError('Could not connect to the server.');
    }
  };

  // Google account (Round 89): there is no password to type — the
  // switch goes through the app's ordinary Google sign-in, exactly
  // like the login screen's button. Supabase returns the browser to
  // the site root with the new session, and the landing page's
  // routeSignedInUser finishes the switch (profile routing + the
  // saved entry refreshed with provider 'google'). Signing in with a
  // different Google account than the one picked simply switches to
  // that account instead — the pick is a shortcut, not a lock.
  const submitGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Mirror the email flow: a Google sign-in supersedes any PIN
      // session left on this device.
      await AsyncStorage.removeItem('student_session');
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: Platform.OS === 'web' ? window.location.origin : 'englishforcricket://',
        },
      });
      if (oauthError) throw oauthError;
      // On web the browser is now navigating to Google; on native the
      // deep link returns to the app root. Either way this screen is
      // done — the busy state stays up for the handover.
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || 'Could not connect to Google.');
    }
  };

  const submit = () => {
    if (!selected || busy) return;
    void (selected.kind === 'auth' ? submitAuth(selected) : submitPin(selected));
  };

  // Which credential step fits the picked account: PIN students get
  // the PIN pad; Google accounts get the Google button (NO password
  // box — they have no password, Round 89); password accounts get
  // the password box; entries saved before the provider was recorded
  // get every choice.
  const mode = !selected
    ? null
    : selected.kind === 'sub_account'
      ? 'pin'
      : selected.provider === 'google'
        ? 'google'
        : selected.provider === 'password'
          ? 'password'
          : 'choice';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-canvas"
    >
      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="w-full max-w-lg mx-auto">
            <Link href="/" asChild>
              <Pressable className="self-start mb-4 py-2 pr-3">
                <Text className="font-sans text-navy font-semibold text-base">← Back to Home</Text>
              </Pressable>
            </Link>
            <ElegantCard className="p-6 md:p-8">
              <View className="mb-8 items-center">
                <Text className="text-6xl mb-4">🏏</Text>
                <Text className="font-display text-3xl md:text-4xl font-semibold text-navy mb-2 text-center">
                  Switch Account
                </Text>
                <Text className="font-sans text-slate-500 text-lg text-center px-4">
                  {selected
                    ? `Welcome back, ${selected.displayName}!`
                    : 'Who is learning now? Pick your name to continue.'}
                </Text>
              </View>

              {loadingList ? (
                <ActivityIndicator size="large" color="#0A192F" />
              ) : selected ? (
                <View className="gap-4">
                  <View className="bg-canvas border border-inkline rounded-xl px-4 py-3">
                    <Text className="font-sans font-bold text-navy text-lg">{selected.displayName}</Text>
                    <Text className="font-sans text-slate-500">
                      {selected.kind === 'auth' ? selected.identifier : `Username: ${selected.identifier}`}
                    </Text>
                  </View>

                  {mode === 'pin' ? (
                    <View>
                      <Text className="font-sans text-sm font-bold text-slate-500 mb-2 ml-1">Secret PIN</Text>
                      <TextInput
                        className="w-full bg-white p-5 rounded-xl border border-inkline text-navy text-2xl font-mono tracking-widest text-center"
                        placeholder="****"
                        placeholderTextColor="#94A3B8"
                        value={credential}
                        onChangeText={setCredential}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                        autoFocus
                        onSubmitEditing={submit}
                      />
                    </View>
                  ) : null}

                  {mode === 'google' || mode === 'choice' ? (
                    <View className="gap-3">
                      {mode === 'google' ? (
                        <Text className="font-sans text-slate-500 text-base text-center">
                          This account signs in with Google, so there is no password to type.
                        </Text>
                      ) : null}
                      <Pressable
                        onPress={() => void submitGoogle()}
                        disabled={busy}
                        className="w-full bg-white flex-row items-center justify-center p-4 rounded-xl border border-inkline shadow-sm"
                      >
                        <Text className="text-xl mr-3">🇬</Text>
                        <Text className="font-sans font-bold text-slate-700 text-lg">
                          {busy ? 'Opening Google...' : 'Continue with Google'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {mode === 'choice' ? (
                    <View className="flex-row items-center">
                      <View className="flex-1 h-[1px] bg-inkline" />
                      <Text className="mx-4 text-slate-400 font-sans font-bold">OR</Text>
                      <View className="flex-1 h-[1px] bg-inkline" />
                    </View>
                  ) : null}

                  {mode === 'password' || mode === 'choice' ? (
                    <View>
                      <Text className="font-sans text-sm font-bold text-slate-500 mb-2 ml-1">Password</Text>
                      <TextInput
                        className="w-full bg-white p-4 rounded-xl border border-inkline text-navy font-sans text-lg"
                        placeholder="Your password"
                        placeholderTextColor="#94A3B8"
                        value={credential}
                        onChangeText={setCredential}
                        secureTextEntry
                        autoCapitalize="none"
                        autoFocus={mode === 'password'}
                        onSubmitEditing={submit}
                      />
                    </View>
                  ) : null}

                  {error ? (
                    <Text className="font-sans text-red-600 text-base text-center">{error}</Text>
                  ) : null}

                  {mode !== 'google' ? (
                    <GoldButton
                      label={busy ? 'Checking...' : "Let's Go! 🚀"}
                      onPress={submit}
                      disabled={busy}
                      className="w-full"
                    />
                  ) : null}
                  <Pressable onPress={backToList} disabled={busy} className="py-2 items-center">
                    <Text className="font-sans font-bold text-slate-500 text-base">← Choose a different account</Text>
                  </Pressable>
                </View>
              ) : accounts.length === 0 ? (
                <View className="items-center gap-4">
                  <Text className="font-sans text-slate-500 text-center text-base">
                    No accounts have been saved on this device yet. Log in once and your name will appear here
                    next time.
                  </Text>
                  <GoldButton label="Go to Log In" onPress={() => router.replace('/login')} className="w-full" />
                </View>
              ) : (
                <View className="gap-3">
                  {accounts.map((account) => {
                    const key = `${account.kind}:${account.identifier}`;
                    const confirming = confirmRemoveKey === key;
                    return (
                      <View
                        key={key}
                        className="flex-row items-center bg-white border border-inkline rounded-xl px-4 py-3"
                      >
                        <Pressable onPress={() => pickAccount(account)} className="flex-1 flex-row items-center gap-3">
                          <View className="w-11 h-11 bg-gold-light rounded-full items-center justify-center border border-gold/40">
                            <Text className="text-xl">{account.kind === 'auth' ? '👤' : '🏏'}</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-sans font-bold text-navy text-lg">{account.displayName}</Text>
                            <Text className="font-sans text-slate-500 text-sm">
                              {account.kind === 'auth'
                                ? account.provider === 'google'
                                  ? `${account.identifier} · Google account`
                                  : account.identifier
                                : `Username: ${account.identifier}`}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                        </Pressable>
                        {confirming ? (
                          <View className="flex-row items-center gap-2 ml-2">
                            <Pressable
                              onPress={() => void handleRemove(account)}
                              className="bg-red-600 px-3 py-2 rounded-full"
                            >
                              <Text className="font-sans font-bold text-white text-xs">Remove</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => setConfirmRemoveKey(null)}
                              className="bg-canvas border border-inkline px-3 py-2 rounded-full"
                            >
                              <Text className="font-sans font-bold text-slate-600 text-xs">Keep</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => setConfirmRemoveKey(key)}
                            className="ml-2 p-2"
                            accessibilityLabel={`Remove ${account.displayName} from this device`}
                          >
                            <Ionicons name="close-circle-outline" size={20} color="#94A3B8" />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                  {confirmRemoveKey ? (
                    <Text className="font-sans text-xs text-slate-400 text-center">
                      Removing a name only forgets it on this device — the account itself is not deleted.
                    </Text>
                  ) : null}

                  <View className="mt-4">
                    <GoldButton
                      label="Use Another Account"
                      onPress={() => router.replace('/login')}
                      className="w-full"
                    />
                  </View>
                  <Text className="font-sans text-xs text-slate-400 text-center mt-2">
                    Only names, usernames and sign-in methods are saved on this device — passwords and PINs are
                    never saved, and are asked for every time.
                  </Text>
                </View>
              )}
            </ElegantCard>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
