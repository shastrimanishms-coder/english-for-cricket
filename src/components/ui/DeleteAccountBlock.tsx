import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { removeSavedAccount } from '../../lib/savedAccounts';
import { endCurrentSession } from '../../lib/sessionEnd';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';

/**
 * Self-service account deletion (Round 84, migration 37).
 *
 * Rendered ONLY for signed-in email accounts: the learner Profile
 * shows it when the session is an auth session, and the manager
 * Settings page shows it for managers. PIN students never see it -
 * they hold no Supabase session, and their accounts are deleted by
 * their manager, as before.
 *
 * The flow is deliberately three steps, because deletion is
 * permanent:
 *   1. The block states plainly what will be deleted.
 *   2. The account holder proves the account is theirs again -
 *      with their password (the Change Password re-authentication
 *      pattern), or, for accounts that signed in with Google and
 *      never set a password, by typing the account email exactly.
 *      A session left signed in on a shared device is not enough.
 *   3. A final "Yes, delete my account" confirmation calls the
 *      delete_my_account RPC, which removes the account and every
 *      learning record (migration 36's cleanup). The RPC itself
 *      refuses managers whose students are still enrolled; that
 *      message is shown as-is and the account stays signed in.
 *
 * On success the device is cleaned up with the Round 81 machinery:
 * the saved-account entry for Switch Account is removed, the
 * session is ended, and the user lands on the public home page
 * with a short "account deleted" notice.
 */
export default function DeleteAccountBlock({
  email,
  providers,
  variant,
}: {
  email: string;
  /** Sign-in providers on the auth user, e.g. ['email'] or ['google']. */
  providers: string[];
  variant: 'learner' | 'manager';
}) {
  const router = useRouter();
  const [step, setStep] = useState<'closed' | 'prove' | 'confirm'>('closed');
  const [credential, setCredential] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const hasPassword = providers.includes('email');

  const reset = () => {
    setStep('closed');
    setCredential('');
    setError('');
    setWorking(false);
  };

  const handleProve = async () => {
    setError('');
    if (hasPassword) {
      if (!credential) {
        setError('Please enter your password. This proves the account is yours before it is deleted.');
        return;
      }
      setWorking(true);
      try {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email,
          password: credential,
        });
        if (verifyError) {
          setError('The password you entered does not match this account. Please check it and try again.');
          return;
        }
        setStep('confirm');
      } catch (err: any) {
        setError(err?.message || 'Something went wrong. Please try again.');
      } finally {
        setWorking(false);
      }
    } else {
      // Google sign-in accounts have no password to re-enter. The
      // deliberate friction here is typing the account email
      // exactly; the deletion RPC still requires the live session.
      if (credential.trim().toLowerCase() !== email.trim().toLowerCase()) {
        setError('Please type the email address of this account exactly, to prove it is yours.');
        return;
      }
      setStep('confirm');
    }
  };

  const handleDelete = async () => {
    setError('');
    setWorking(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('delete_my_account');
      if (rpcError) throw rpcError;
      const result = (data || {}) as { ok?: boolean; error?: string };
      if (!result.ok) {
        // A refusal (for example a manager whose students are still
        // enrolled) is not a failure of the device: show the plain
        // message, stay signed in, and close the flow.
        showAlert('Account Not Deleted', result.error || 'Your account could not be deleted.');
        reset();
        return;
      }
      // The account is gone. Clean this device: forget the saved
      // Switch Account entry, end the (now invalid) session, and
      // land on the public home with the deletion notice.
      await removeSavedAccount('auth', email);
      await endCurrentSession();
      router.replace('/?deleted=1');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setWorking(false);
    }
  };

  return (
    <View className="bg-white p-6 rounded-[20px] shadow-sm border border-red-200 space-y-4 gap-4">
      <View>
        <Text className="font-display text-lg font-semibold text-red-800 mb-1">Delete My Account</Text>
        <Text className="font-sans text-sm text-slate-500">
          If you no longer need your account, you can delete it here. Deletion is permanent and cannot be undone.
        </Text>
      </View>

      {step === 'closed' ? (
        <View className="w-full md:w-64">
          <Pressable
            onPress={() => setStep('prove')}
            className="items-center justify-center rounded-full border border-red-300 bg-red-50 px-5 py-3 active:opacity-90"
          >
            <Text className="font-sans text-sm font-bold text-red-700">Delete my account</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'prove' ? (
        <View className="space-y-4 gap-4">
          <View className="rounded-xl bg-red-50 border border-red-200 p-4">
            <Text className="font-sans text-sm text-red-800">
              Deleting this account permanently deletes the account itself and everything in it: learning
              progress, lesson and reading scores, speaking results, activity time, points, stars and badges.
              There is no way to get any of it back.
            </Text>
            {variant === 'manager' ? (
              <Text className="font-sans text-sm text-red-800 mt-2">
                If your students are still enrolled, deletion will be refused until those students have been
                deleted or moved, so that no student is left without a manager.
              </Text>
            ) : null}
          </View>

          <View>
            <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">
              {hasPassword ? 'Your Password' : 'Type your account email to continue'}
            </Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy text-base"
              placeholder={hasPassword ? 'Your password now' : email}
              value={credential}
              onChangeText={setCredential}
              secureTextEntry={hasPassword}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={hasPassword ? 'default' : 'email-address'}
            />
            <Text className="font-sans text-xs text-slate-500 mt-2">
              {hasPassword
                ? 'Enter your current password, so that only you can delete this account.'
                : 'This account uses Google sign-in and has no password, so we ask for the account email instead.'}
            </Text>
          </View>

          {error ? <Text className="font-sans text-sm font-bold text-red-700">{error}</Text> : null}

          <View className="flex-row gap-3">
            <Pressable
              onPress={handleProve}
              disabled={working}
              className="items-center justify-center rounded-full border-b-4 border-red-800 bg-red-600 px-5 py-3 active:opacity-90"
            >
              <Text className="font-sans text-sm font-bold text-white">{working ? 'Checking...' : 'Continue'}</Text>
            </Pressable>
            <Pressable
              onPress={reset}
              disabled={working}
              className="items-center justify-center rounded-full border border-inkline bg-white px-5 py-3 active:opacity-90"
            >
              <Text className="font-sans text-sm font-bold text-slate-600">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 'confirm' ? (
        <View className="space-y-4 gap-4">
          <Text className="font-sans text-base font-bold text-navy">Are you sure?</Text>
          <Text className="font-sans text-sm text-slate-500">
            This is the final step. Your account and all of its records will be deleted now, and this cannot be
            undone.
          </Text>
          {error ? <Text className="font-sans text-sm font-bold text-red-700">{error}</Text> : null}
          <View className="flex-row gap-3 flex-wrap">
            <Pressable
              onPress={handleDelete}
              disabled={working}
              className="items-center justify-center rounded-full border-b-4 border-red-800 bg-red-600 px-5 py-3 active:opacity-90"
            >
              <Text className="font-sans text-sm font-bold text-white">
                {working ? 'Deleting...' : 'Yes, delete my account'}
              </Text>
            </Pressable>
            <Pressable
              onPress={reset}
              disabled={working}
              className="items-center justify-center rounded-full border border-inkline bg-white px-5 py-3 active:opacity-90"
            >
              <Text className="font-sans text-sm font-bold text-slate-600">Keep my account</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
