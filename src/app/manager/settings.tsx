import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import AnimatedButton from '../../components/ui/AnimatedButton';
import { useRequireRole } from '../../hooks/useRequireRole';
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

  if (loading || guardStatus !== 'authorized') {
    return (
      <View className="flex-1 bg-surface-background justify-center items-center">
        <ActivityIndicator size="large" color="#047857" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-surface-background">
      {/* Header */}
      <View className="w-full bg-surface shadow-sm border-b border-slate-200">
        <View className="max-w-4xl w-full mx-auto flex-row justify-between items-center p-6">
          <Text className="text-xl md:text-2xl font-bold text-text-primary">Organization Settings</Text>
          
          {/* UI FIX: Constrain header button width */}
          <View className="w-40 md:w-48">
            <AnimatedButton 
              title="Back to Dashboard" 
              onPress={() => router.back()} 
              variant="outline" 
              size="sm" 
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-3xl w-full mx-auto space-y-8 gap-8">
          
          <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4 gap-4">
            <View>
              <Text className="text-lg font-bold text-text-primary mb-1">Family / School Profile</Text>
              <Text className="text-sm text-text-secondary mb-4">
                This entity acts as the umbrella for all your student accounts.
              </Text>
            </View>

            <View>
              <Text className="text-sm font-semibold text-text-secondary mb-2">Organization Name</Text>
              <TextInput
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-text-primary text-base"
                placeholder="e.g., Shastri Family or Osaka Academy"
                value={orgName}
                onChangeText={setOrgName}
              />
            </View>

            <View>
              <Text className="text-sm font-semibold text-text-secondary mb-2">Organization Code (Auto-generated)</Text>
              <TextInput
                className="w-full bg-slate-100 p-4 rounded-xl border border-slate-200 text-slate-500 text-base"
                value={orgCode || 'Will be generated upon saving'}
                editable={false}
              />
              <Text className="text-xs text-text-secondary mt-2">
                This unique code is used to generate secure usernames for your students (e.g., kenji-{orgCode || 'abc'}-492).
              </Text>
            </View>
          </View>

          <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4 gap-4">
            <Text className="text-lg font-bold text-text-primary mb-2">Manager Information</Text>
            
            <View>
              <Text className="text-sm font-semibold text-text-secondary mb-2">Your Display Name</Text>
              <TextInput
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-text-primary text-base"
                placeholder="Your Name"
                value={displayName}
                onChangeText={setDisplayName}
              />
            </View>

            <View>
              <Text className="text-sm font-semibold text-text-secondary mb-2">Email Address</Text>
              <View className="flex-row items-center gap-4">
                <TextInput
                  className="flex-1 bg-slate-100 p-4 rounded-xl border border-slate-200 text-slate-500 text-base"
                  value={email}
                  editable={false}
                />
                
                {/* UI FIX: Constrain inline button width */}
                <View className="w-24 md:w-32">
                  <AnimatedButton 
                    title="Update" 
                    onPress={() => Alert.alert('Coming Soon', 'Email update flow requires re-verification.')} 
                    variant="secondary" 
                    size="sm" 
                  />
                </View>
              </View>
            </View>
          </View>

          {/* UI FIX: Align save button nicely on desktop */}
          <View className="mt-4 w-full md:w-64 md:self-end">
            <AnimatedButton 
              title={saving ? "Saving Changes..." : "Save Settings"} 
              onPress={handleSave} 
              disabled={saving} 
              variant="primary" 
            />
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}