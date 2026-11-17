import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoldButton, NavyButton, ScreenHeader } from '../../components/ui/Elegant';
import { useRequireRole } from '../../hooks/useRequireRole';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';

export default function OrganizationSettings() {
  const router = useRouter();
  const guardStatus = useRequireRole(['manager']);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Profile State
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  
  // Organization State
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgCode, setOrgCode] = useState('');

  // Change Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const fetchSettingsData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');
      
      setEmail(user.email || '');

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
        
      if (profile) setDisplayName(profile.display_name || '');

      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, org_code')
        .eq('manager_id', user.id)
        .single();

      if (org) {
        setOrgId(org.id);
        setOrgName(org.name);
        setOrgCode(org.org_code);
      }
    } catch (error: any) {
      console.error('Error fetching settings:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchSettingsData();
    })();
  }, [fetchSettingsData]);

  const generateOrgCode = (name: string) => {
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '');
    const prefix = cleanName.length >= 3 ? cleanName.substring(0, 3).toLowerCase() : 'org';
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    return `${prefix}${randomSuffix}`;
  };

  const handleSave = async () => {
    if (!orgName.trim() || !displayName.trim()) {
      Alert.alert('Missing Fields', 'Display Name and Organization Name are required.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authentication error');

      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id);

      if (profileError) throw profileError;

      let currentOrgCode = orgCode;
      
      if (!orgId) {
        currentOrgCode = generateOrgCode(orgName);
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({
            manager_id: user.id,
            name: orgName.trim(),
            org_code: currentOrgCode,
          })
          .select()
          .single();

        if (orgError) throw orgError;
        setOrgId(newOrg.id);
        setOrgCode(newOrg.org_code);
      } else {
        const { error: orgError } = await supabase
          .from('organizations')
          .update({ name: orgName.trim() })
          .eq('id', orgId);

        if (orgError) throw orgError;
      }

      Alert.alert('Success', 'Your settings have been saved.');
    } catch (error: any) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) {
      showAlert('Missing Password', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      showAlert('Password Too Short', 'Your new password needs at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Passwords Do Not Match', 'Please type the same new password in both boxes.');
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      showAlert('Password Updated', 'Your password has been changed. Use the new password the next time you sign in.');
    } catch (error: any) {
      showAlert('Could Not Change Password', error?.message || 'Something went wrong. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading || guardStatus !== 'authorized') {
    return (
      <View className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-canvas">
      {/* Header */}
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <ScreenHeader title="Organization Settings" onBack={() => router.back()} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-3xl w-full mx-auto space-y-8 gap-8">
          
          <View className="bg-white p-6 rounded-[20px] shadow-sm border border-inkline space-y-4 gap-4">
            <View>
              <Text className="font-display text-lg font-semibold text-navy mb-1">Family / School Profile</Text>
              <Text className="font-sans text-sm text-slate-500 mb-4">
                This entity acts as the umbrella for all your student accounts.
              </Text>
            </View>

            <View>
              <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Organization Name</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy text-base"
                placeholder="e.g., Shastri Family or Osaka Academy"
                value={orgName}
                onChangeText={setOrgName}
              />
            </View>

            <View>
              <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Organization Code (Auto-generated)</Text>
              <TextInput
                className="w-full bg-[#F1ECE1] p-4 rounded-xl border border-inkline font-sans text-slate-500 text-base"
                value={orgCode || 'Will be generated upon saving'}
                editable={false}
              />
              <Text className="font-sans text-xs text-slate-500 mt-2">
                This unique code is used to generate secure usernames for your students (e.g., kenji-{orgCode || 'abc'}-492).
              </Text>
            </View>
          </View>

          <View className="bg-white p-6 rounded-[20px] shadow-sm border border-inkline space-y-4 gap-4">
            <Text className="font-display text-lg font-semibold text-navy mb-2">Manager Information</Text>

            <View>
              <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Your Display Name</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy text-base"
                placeholder="Your Name"
                value={displayName}
                onChangeText={setDisplayName}
              />
            </View>

            <View>
              <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Email Address</Text>
              <View className="flex-row items-center gap-4">
                <TextInput
                  className="flex-1 bg-[#F1ECE1] p-4 rounded-xl border border-inkline font-sans text-slate-500 text-base"
                  value={email}
                  editable={false}
                />

                <Pressable
                  onPress={() => Alert.alert('Coming Soon', 'Email update flow requires re-verification.')}
                  className="items-center justify-center rounded-full border-b-4 border-navy-deep bg-navy px-5 py-3 active:opacity-90"
                >
                  <Text className="font-sans text-sm font-bold text-white">Update</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View className="bg-white p-6 rounded-[20px] shadow-sm border border-inkline space-y-4 gap-4">
            <View>
              <Text className="font-display text-lg font-semibold text-navy mb-1">Change Password</Text>
              <Text className="font-sans text-sm text-slate-500">
                Set a new password for your manager account. You will stay signed in here; the new password applies from your next sign-in.
              </Text>
            </View>

            <View>
              <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">New Password</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy text-base"
                placeholder="At least 6 characters"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View>
              <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Confirm New Password</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy text-base"
                placeholder="Type the new password again"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View className="w-full md:w-64">
              <NavyButton
                label={changingPassword ? 'Updating...' : 'Update Password'}
                onPress={handleChangePassword}
                disabled={changingPassword}
                className="w-full"
              />
            </View>
          </View>

          {/* UI FIX: Align save button nicely on desktop */}
          <View className="mt-4 w-full md:w-64 md:self-end">
            <GoldButton
              label={saving ? "Saving Changes..." : "Save Settings"}
              onPress={handleSave}
              disabled={saving}
              className="w-full"
            />
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}