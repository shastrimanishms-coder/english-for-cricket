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

export default function SystemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings State
  const [logoUrl, setLogoUrl] = useState('');
  const [selectedLogo, setSelectedLogo] = useState<any>(null);
  const [supportEmail, setSupportEmail] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: settingsData, error: settingsError } = await supabase.from('site_settings').select('*');
      if (settingsError) throw settingsError;

      const settingsMap: Record<string, string> = {};
      settingsData?.forEach(s => settingsMap[s.key] = s.value);
      setLogoUrl(settingsMap['site_logo_url'] || '');
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

  const pickLogo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets) setSelectedLogo(result.assets[0]);
    } catch (error) { console.log(error); }
  };

  const uploadLogo = async (file: any) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `logo_${Date.now()}.${fileExt}`;
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

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      let finalLogoUrl = logoUrl;
      if (selectedLogo) {
        finalLogoUrl = await uploadLogo(selectedLogo);
        setLogoUrl(finalLogoUrl);
        setSelectedLogo(null);
      }

      const updates = [
        { key: 'site_logo_url', value: finalLogoUrl },
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

  return (
    <View className="space-y-8 gap-8 pb-12">
      <View className="flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-text-primary">System Settings</Text>
      </View>

      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 gap-6">
        <Text className="text-lg font-bold text-[#0A192F]">Global Configuration</Text>

        <View className="flex-col md:flex-row gap-6">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Support Contact Email</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
              placeholder="support@englishforcricket.com"
              value={supportEmail}
              onChangeText={setSupportEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Site Logo</Text>
            <View className="flex-row items-center gap-4">
              <Pressable onPress={pickLogo} className="px-4 py-3 bg-[#0A192F] rounded-lg">
                <Text className="text-white font-bold text-sm">Upload Logo</Text>
              </Pressable>
              <View>
                {selectedLogo ? <Text className="text-brand font-semibold text-xs" numberOfLines={1}>{selectedLogo.name}</Text>
                : logoUrl ? <Image source={{ uri: logoUrl }} className="w-24 h-8 object-contain bg-slate-100 rounded" />
                : <Text className="text-slate-400 text-xs">No logo set</Text>}
              </View>
            </View>
            <Text className="text-xs text-slate-400 mt-2">Upload a transparent PNG for the main navigation bar.</Text>
          </View>
        </View>

        <View className="flex-row justify-end mt-2 pt-4 border-t border-slate-100">
          <View className="w-48">
            <AnimatedButton title={saving ? "Saving Config..." : "Save Configuration"} onPress={handleSaveSettings} disabled={saving} variant="primary" size="sm" />
          </View>
        </View>
      </View>

      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <View className="mb-6">
          <Text className="text-lg font-bold text-[#0A192F]">Admin Role Management</Text>
        </View>
        <View className="border border-slate-200 rounded-xl overflow-hidden">
          {loading ? <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
          : users.map((user, index) => {
            const isSuperAdmin = user.role === 'super_admin';
            return (
              <View key={user.id} className={`p-4 flex-row items-center justify-between ${index !== users.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <View className="w-1/2">
                  <Text className="font-mono text-sm text-slate-600">{user.id}</Text>
                </View>
                <View className={`px-2.5 py-1 rounded-md ${isSuperAdmin ? 'bg-[#D4AF37]/20' : 'bg-slate-100'}`}>
                  <Text className={`text-xs font-bold uppercase ${isSuperAdmin ? 'text-[#D4AF37]' : 'text-slate-500'}`}>{user.role.replace('_', ' ')}</Text>
                </View>
                <Pressable onPress={() => handleToggleRole(user.id, user.role)} className={`px-3 py-1.5 rounded border ${isSuperAdmin ? 'bg-slate-100 border-slate-200' : 'bg-brand/10 border-brand/30'}`}>
                  <Text className={`text-xs font-semibold ${isSuperAdmin ? 'text-slate-500' : 'text-brand'}`}>{isSuperAdmin ? 'Demote to Manager' : 'Make Super Admin'}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}