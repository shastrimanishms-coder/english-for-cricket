import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface UserProfile {
  id: string;
  role: string;
  created_at: string;
}

// Bundled default logo (full English for Cricket lockup), shown whenever
// no custom logo is set.
const BUNDLED_LOGO = require('../../../assets/images/logo-full.png');

export default function SystemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings State
  const [supportEmail, setSupportEmail] = useState('');
  // App / Web Logo: public URL stored in site_settings.app_logo_url.
  // Empty means the app uses the bundled default logo.
  const [appLogoUrl, setAppLogoUrl] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  // Home Page Video: stored in site_settings.home_hero_video_url.
  // Empty means the home page shows the default ICC explainer.
  const [heroVideoUrl, setHeroVideoUrl] = useState('');
  const [videoBusy, setVideoBusy] = useState(false);
  // Change Password (the signed-in admin's own account).
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: settingsData, error: settingsError } = await supabase.from('site_settings').select('*');
      if (settingsError) throw settingsError;

      const settingsMap: Record<string, string> = {};
      settingsData?.forEach(s => settingsMap[s.key] = s.value);
      setAppLogoUrl(settingsMap['app_logo_url'] || '');
      setHeroVideoUrl(settingsMap['home_hero_video_url'] || '');
      setSupportEmail(settingsMap['support_email'] || 'support@englishforcricket.com');

      const { data: usersData, error: usersError } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
      if (usersError) throw usersError;
      setUsers(usersData || []);
    } catch (error: any) { Alert.alert('Error', error.message); } 
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const uploadLogoFile = async (file: any) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `app-logo_${Date.now()}.${fileExt}`;
    let fileBody;
    if (Platform.OS === 'web') {
      const res = await fetch(file.uri);
      fileBody = await res.blob();
    } else {
      fileBody = { uri: file.uri, type: file.mimeType || 'image/png', name: file.name } as any;
    }
    const { error } = await supabase.storage.from('assets').upload(fileName, fileBody);
    if (error) throw error;
    const { data } = supabase.storage.from('assets').getPublicUrl(fileName);
    return data.publicUrl;
  };

  // Pick an image, upload it, and save it as the live app/web logo in
  // one go — the header picks the new logo up immediately, no rebuild.
  const handleUploadLogo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets) return;
      setLogoBusy(true);
      const publicUrl = await uploadLogoFile(result.assets[0]);
      const { error } = await supabase.from('site_settings').upsert([{ key: 'app_logo_url', value: publicUrl }]);
      if (error) throw error;
      setAppLogoUrl(publicUrl);
      setLogoPreviewFailed(false);
      Alert.alert('Success', 'Logo updated. The new logo is now live in the app and website header.');
    } catch (error: any) { Alert.alert('Logo Upload Failed', error.message); }
    finally { setLogoBusy(false); }
  };

  const handleResetLogo = async () => {
    const doReset = async () => {
      try {
        setLogoBusy(true);
        const { error } = await supabase.from('site_settings').upsert([{ key: 'app_logo_url', value: '' }]);
        if (error) throw error;
        setAppLogoUrl('');
        setLogoPreviewFailed(false);
        Alert.alert('Success', 'Default logo restored.');
      } catch (error: any) { Alert.alert('Reset Failed', error.message); }
      finally { setLogoBusy(false); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Go back to the bundled default logo?')) doReset();
    } else {
      Alert.alert('Use Default Logo?', 'The bundled default logo will be shown again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', onPress: doReset }]);
    }
  };

  const handleSaveHeroVideo = async () => {
    const url = heroVideoUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      Alert.alert('Invalid Link', 'Please paste a full link starting with https://');
      return;
    }
    setVideoBusy(true);
    try {
      const { error } = await supabase.from('site_settings').upsert([{ key: 'home_hero_video_url', value: url }]);
      if (error) throw error;
      setHeroVideoUrl(url);
      Alert.alert('Success', url
        ? 'Home page video updated. It is live on the home page now — no rebuild needed.'
        : 'Home page video cleared. The default ICC video will be shown.');
    } catch (error: any) { Alert.alert('Save Failed', error.message); }
    finally { setVideoBusy(false); }
  };

  // Same pattern as the manager settings: the current password is
  // verified by re-authenticating before the change is allowed.
  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Current Password Needed', 'Please enter your current password. This proves the account is yours before it is changed.');
      return;
    }
    if (!newPassword) {
      Alert.alert('Missing Password', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Password Too Short', 'Your new password needs at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords Do Not Match', 'Please type the same new password in both boxes.');
      return;
    }
    setChangingPassword(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      if (!email) throw new Error('Your account email could not be found. Please sign out and sign in again.');
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (verifyError) {
        Alert.alert('Current Password Incorrect', 'The current password you entered does not match this account. Please check it and try again.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password Updated', 'Your admin password has been changed. Use the new password the next time you sign in.');
    } catch (error: any) { Alert.alert('Could Not Change Password', error?.message || 'Something went wrong. Please try again.'); }
    finally { setChangingPassword(false); }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: 'support_email', value: supportEmail.trim() }
      ];

      const { error } = await supabase.from('site_settings').upsert(updates);
      if (error) throw error;
      Alert.alert('Success', 'System settings saved.');
    } catch (error: any) { Alert.alert('Save Failed', error.message); } 
    finally { setSaving(false); }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'super_admin' ? 'manager' : 'super_admin';
    const confirmAction = async () => {
      try {
        const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId);
        if (error) throw error;
        await fetchData();
      } catch (error: any) { Alert.alert('Update Failed', error.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Change role to ${newRole}?`)) confirmAction();
    } else {
      Alert.alert('Confirm Role Change', `Change role?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: confirmAction }]);
    }
  };

  // Effective logo for the previews: the uploaded one when set (and
  // loadable), otherwise the bundled default logo.
  const previewLogoSource = appLogoUrl && !logoPreviewFailed ? { uri: appLogoUrl } : BUNDLED_LOGO;

  return (
    <View className="space-y-8 gap-8 pb-12">
      <View className="flex-row justify-between items-center">
        <Text className="font-display text-3xl font-semibold text-navy">System Settings</Text>
      </View>

      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <Text className="font-display text-xl font-semibold text-navy">Global Configuration</Text>

        <View className="flex-col md:flex-row gap-6">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Support Contact Email</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="support@englishforcricket.com"
              value={supportEmail}
              onChangeText={setSupportEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
        </View>

        <View className="flex-row justify-end mt-2 pt-4 border-t border-inkline">
          <View className="w-48">
            <AnimatedButton title={saving ? "Saving Config..." : "Save Configuration"} onPress={handleSaveSettings} disabled={saving} variant="primary" size="sm" />
          </View>
        </View>
      </View>

      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <View>
          <Text className="font-display text-xl font-semibold text-navy">App / Web Logo</Text>
          <Text className="text-xs text-slate-400 mt-2">
            PNG with transparency works best. The logo appears in the website and app header.
            Festive or seasonal versions can be swapped in anytime and take effect immediately
            for web and app visitors — no rebuild needed.
          </Text>
        </View>

        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">On light</Text>
            <View className="bg-slate-100 border border-inkline rounded-xl h-24 items-center justify-center p-3">
              <Image source={previewLogoSource} onError={() => setLogoPreviewFailed(true)} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">On dark</Text>
            <View className="bg-navy border border-inkline rounded-xl h-24 items-center justify-center p-3">
              <Image source={previewLogoSource} onError={() => setLogoPreviewFailed(true)} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
          </View>
        </View>

        <Text className="text-sm text-slate-500">
          {appLogoUrl && !logoPreviewFailed
            ? 'A custom logo is currently live in the header.'
            : 'Currently using the bundled default logo.'}
        </Text>

        <View className="flex-row items-center gap-4 flex-wrap">
          <View className="w-48">
            <AnimatedButton title={logoBusy ? "Working..." : "Upload New Logo"} onPress={handleUploadLogo} disabled={logoBusy} variant="primary" size="sm" />
          </View>
          {appLogoUrl ? (
            <Pressable onPress={handleResetLogo} disabled={logoBusy} className="px-3 py-1.5 rounded-full border bg-slate-100 border-inkline">
              <Text className="text-xs font-semibold text-slate-500">Use Default Logo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <View>
          <Text className="font-display text-xl font-semibold text-navy">Home Page Video</Text>
          <Text className="text-xs text-slate-400 mt-2">
            The video shown at the top of the public home page. Paste a YouTube link
            (the normal watch link or the short share link), or a direct link to a video
            file such as an MP4 on your own hosting. Changes take effect immediately —
            no rebuild needed. Leave the box empty and save to go back to the default
            ICC “What is Cricket?” video.
          </Text>
        </View>
        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Video Link</Text>
          <TextInput
            className="w-full bg-canvas p-4 rounded-xl border border-inkline"
            placeholder="https://www.youtube.com/watch?v=…  or  https://englishforcricket.com/media/intro.mp4"
            value={heroVideoUrl}
            onChangeText={setHeroVideoUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text className="text-sm text-slate-500 mt-3">
            {heroVideoUrl.trim()
              ? 'A custom video is currently set for the home page.'
              : 'Currently showing the default ICC “What is Cricket?” video.'}
          </Text>
        </View>
        <View className="flex-row justify-end pt-4 border-t border-inkline">
          <View className="w-48">
            <AnimatedButton title={videoBusy ? "Saving..." : "Save Video"} onPress={handleSaveHeroVideo} disabled={videoBusy} variant="primary" size="sm" />
          </View>
        </View>
      </View>

      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <View>
          <Text className="font-display text-xl font-semibold text-navy">Change Admin Password</Text>
          <Text className="text-xs text-slate-400 mt-2">
            Changes the password of the admin account you are signed in with.
            Your current password is required, so a signed-in session alone
            is never enough to change it.
          </Text>
        </View>
        <View className="flex-col gap-4">
          <View>
            <Text className="text-sm font-semibold text-text-secondary mb-2">Current Password</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="Your current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View className="flex-col md:flex-row gap-4">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">New Password</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="At least 6 characters"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-text-secondary mb-2">Confirm New Password</Text>
              <TextInput
                className="w-full bg-canvas p-4 rounded-xl border border-inkline"
                placeholder="Type the new password again"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>
        <View className="flex-row justify-end pt-4 border-t border-inkline">
          <View className="w-48">
            <AnimatedButton title={changingPassword ? "Changing..." : "Change Password"} onPress={handleChangePassword} disabled={changingPassword} variant="primary" size="sm" />
          </View>
        </View>
      </View>

      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm">
        <View className="mb-6">
          <Text className="font-display text-xl font-semibold text-navy">Admin Role Management</Text>
        </View>
        <View className="border border-inkline rounded-xl overflow-hidden">
          {loading ? <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
          : users.map((user, index) => {
            const isSuperAdmin = user.role === 'super_admin';
            return (
              <View key={user.id} className={`p-4 flex-row items-center justify-between ${index !== users.length - 1 ? 'border-b border-inkline' : ''}`}>
                <View className="w-1/2">
                  <Text className="font-mono text-sm text-slate-600">{user.id}</Text>
                </View>
                <View className={`px-2.5 py-1 rounded-md ${isSuperAdmin ? 'bg-gold/20' : 'bg-slate-100'}`}>
                  <Text className={`text-xs font-bold uppercase ${isSuperAdmin ? 'text-gold-dark' : 'text-slate-500'}`}>{user.role.replace('_', ' ')}</Text>
                </View>
                <Pressable onPress={() => handleToggleRole(user.id, user.role)} className={`px-3 py-1.5 rounded border ${isSuperAdmin ? 'bg-slate-100 border-inkline' : 'bg-pitch/10 border-pitch/30'}`}>
                  <Text className={`text-xs font-semibold ${isSuperAdmin ? 'text-slate-500' : 'text-pitch'}`}>{isSuperAdmin ? 'Demote to Manager' : 'Make Super Admin'}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}