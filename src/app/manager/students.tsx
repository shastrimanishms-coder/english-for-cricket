import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native';
import AnimatedButton from '../../components/ui/AnimatedButton';
import { useRequireRole } from '../../hooks/useRequireRole';
import { supabase } from '../../lib/supabase';

interface Student {
  id: string;
  display_name: string;
  username: string;
  hashed_pin: string; 
  date_of_birth: string; // UPDATED from age
  gender: string;
  avatar_url?: string;   // NEW
  created_at: string;
}

export default function StudentManagement() {
  const router = useRouter();
  const guardStatus = useRequireRole(['manager']);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgCode, setOrgCode] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  
  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState(''); // UPDATED
  const [newGender, setNewGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [customPin, setCustomPin] = useState('');

  // Helper function to dynamically calculate age
  const calculateAge = (dob: string) => {
    if (!dob) return '?';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getMascot = (gender: string, avatar_url?: string) => {
    if (avatar_url) return avatar_url; // We'll render real images later
    if (gender === 'Male') return '👦';
    if (gender === 'Female') return '👧';
    return '🏏'; // Neutral Mascot
  };

  const copyCredentials = async (username: string, pin: string) => {
    await Clipboard.setStringAsync(`Login at: englishforcricket.com\nUsername: ${username}\nPIN: ${pin}`);
    Alert.alert('Copied!', 'Student credentials copied to clipboard.');
  };

  const handleDobFormat = (text: string) => {
  // Remove any non-numeric characters
  const cleaned = text.replace(/\D/g, '');
  let formatted = cleaned;
  
  // Auto-insert hyphens
  if (cleaned.length > 4) {
    formatted = cleaned.substring(0, 4) + '-' + cleaned.substring(4);
  }
  if (cleaned.length > 6) {
    formatted = formatted.substring(0, 7) + '-' + cleaned.substring(6, 8);
  }
  
  setNewDob(formatted);
};

  const fetchStudentsData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      // FIX: Securely route back to login if no manager session is found
      if (!user) {
        router.replace('/');
        return;
      }

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, org_code')
        .eq('manager_id', user.id)
        .single();

      if (orgError || !org) {
        Alert.alert('Organization Required', 'Please set up your Organization Settings first.');
        router.replace('/manager/settings');
        return;
      }

      setOrgId(org.id);
      setOrgCode(org.org_code);

      const { data: studentsData, error: studentsError } = await supabase
        .from('sub_accounts')
        .select('id, display_name, username, hashed_pin, date_of_birth, gender, avatar_url, created_at')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (studentsError) throw studentsError;
      setStudents(studentsData || []);
      
    } catch (error: any) {
      console.error('Error fetching students:', error.message);
      Alert.alert('Error', 'Could not load student data.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    (async () => {
      await fetchStudentsData();
    })();
  }, [fetchStudentsData]);

  const generateUsername = (name: string, code: string) => {
    const firstName = name.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    return `${firstName}-${code}-${randomSuffix}`;
  };

  const openAddForm = () => {
    setEditId(null);
    setNewName('');
    setNewDob('');
    setNewGender('');
    setCustomPin(Math.floor(1000 + Math.random() * 9000).toString());
    setShowForm(true);
  };

  const openEditForm = (student: Student) => {
    setEditId(student.id);
    setNewName(student.display_name);
    setNewDob(student.date_of_birth || '');
    setNewGender(student.gender as any);
    setCustomPin(student.hashed_pin);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
  };

  const handleSaveStudent = async () => {
    if (!newName.trim() || !newDob.trim() || !newGender || !customPin.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    
    // Validate YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDob.trim())) {
      Alert.alert('Invalid Date', 'Please format the Date of Birth exactly as YYYY-MM-DD (e.g., 2015-08-24).');
      return;
    }

    if (customPin.length !== 4) {
      Alert.alert('Invalid PIN', 'The PIN must be exactly 4 digits.');
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        const { error } = await supabase
          .from('sub_accounts')
          .update({
            display_name: newName.trim(),
            date_of_birth: newDob.trim(),
            gender: newGender,
            hashed_pin: customPin.trim()
          })
          .eq('id', editId);

        if (error) throw error;
        Alert.alert('Success', 'Student profile updated!');
      } else {
        const username = generateUsername(newName, orgCode);
        const { error } = await supabase
          .from('sub_accounts')
          .insert({
            organization_id: orgId,
            display_name: newName.trim(),
            username: username,
            hashed_pin: customPin.trim(),
            date_of_birth: newDob.trim(),
            gender: newGender,
          });

        if (error) throw error;
        Alert.alert('Success', `Student added!\nUsername: ${username}\nPIN: ${customPin}`);
      }

      await fetchStudentsData();
      closeForm();

    } catch (error: any) {
      Alert.alert('Error saving student', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) {
        executeDelete(id);
      }
    } else {
      Alert.alert('Delete Student', `Are you sure you want to delete ${name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => executeDelete(id) }
      ]);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('sub_accounts')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      await fetchStudentsData();
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
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
      <View className="w-full bg-surface shadow-sm border-b border-slate-200">
        <View className="max-w-5xl w-full mx-auto flex-row justify-between items-center p-6">
          <Text className="text-xl md:text-2xl font-bold text-text-primary">My Students</Text>
          <View className="w-40 md:w-48">
            <AnimatedButton 
              title="Back to Dashboard" 
              onPress={() => router.push('/manager')} 
              variant="outline" 
              size="sm" 
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-5xl w-full mx-auto space-y-8 gap-8">
          
          <View className="flex-row justify-between items-center flex-wrap gap-4">
            <Text className="text-text-secondary text-lg">
              Manage student accounts. You can edit their profiles, view their PINs, or copy credentials below.
            </Text>
            {!showForm && (
              <View className="w-full md:w-48">
                <AnimatedButton 
                  title="+ Add New Student" 
                  onPress={openAddForm} 
                  variant="primary" 
                />
              </View>
            )}
          </View>

          {/* Form for Add/Edit */}
          {showForm && (
            <View className="bg-brand/5 p-6 rounded-2xl border border-brand/20 space-y-4 gap-4">
              <Text className="text-lg font-bold text-brand">
                {editId ? 'Edit Student Account' : 'Create New Student Account'}
              </Text>
              
              <View className="flex-col md:flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-text-secondary mb-2">Display Name</Text>
                  <TextInput
                    className="w-full bg-white p-4 rounded-xl border border-slate-200 text-text-primary"
                    placeholder="Student's First Name"
                    value={newName}
                    onChangeText={setNewName}
                  />
                </View>
                <View className="w-full md:w-40">
                  <Text className="text-sm font-semibold text-text-secondary mb-2">Date of Birth</Text>
                  <TextInput
                    className="w-full bg-white p-4 rounded-xl border border-slate-200 text-text-primary"
                    placeholder="YYYY-MM-DD"
                    value={newDob}
                    onChangeText={handleDobFormat} 
                    keyboardType="number-pad" 
                    maxLength={10} 
                  />
                </View>
                <View className="w-full md:w-32">
                  <Text className="text-sm font-semibold text-text-secondary mb-2">4-Digit PIN</Text>
                  <TextInput
                    className="w-full bg-white p-4 rounded-xl border border-slate-200 text-text-primary font-mono tracking-widest"
                    value={customPin}
                    onChangeText={setCustomPin}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
              </View>

              <View>
                <Text className="text-sm font-semibold text-text-secondary mb-2">Gender (For Avatars & Voice AI)</Text>
                <View className="flex-row gap-2">
                  {['Male', 'Female', 'Other'].map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => setNewGender(g as any)}
                      className={`flex-1 py-3 rounded-xl border items-center ${newGender === g ? 'border-brand bg-brand' : 'border-slate-200 bg-white'}`}
                    >
                      <Text className={`font-semibold ${newGender === g ? 'text-white' : 'text-text-secondary'}`}>
                        {g === 'Male' ? '👦' : g === 'Female' ? '👧' : '🏏'} {g}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="flex-row justify-end gap-4 mt-4">
                <View className="w-32">
                  <AnimatedButton title="Cancel" onPress={closeForm} variant="outline" size="sm" />
                </View>
                <View className="w-40">
                  <AnimatedButton 
                    title={saving ? "Saving..." : "Save Account"} 
                    onPress={handleSaveStudent} 
                    disabled={saving} 
                    variant="primary" 
                    size="sm" 
                  />
                </View>
              </View>
            </View>
          )}

          {/* Students List */}
          <View className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {students.length === 0 ? (
              <View className="p-12 items-center justify-center">
                <Text className="text-6xl mb-4">🎒</Text>
                <Text className="text-lg font-bold text-text-primary mb-2">No Students Yet</Text>
                <Text className="text-text-secondary text-center">
                  Click the &quot;Add New Student&quot; button above to generate your first sub-account.
                </Text>
              </View>
            ) : (
              <View>
                {students.map((student) => (
                  <View key={student.id} className="flex-col md:flex-row p-4 border-b border-slate-50 md:items-center justify-between gap-4 hover:bg-slate-50">
                    
                    {/* Name & Mascot Avatar */}
                    <View className="flex-row items-center gap-3 min-w-[200px]">
                      <View className="w-12 h-12 bg-slate-100 rounded-full items-center justify-center border border-slate-200">
                        <Text className="text-2xl">{getMascot(student.gender, student.avatar_url)}</Text>
                      </View>
                      <View>
                        <Text className="font-bold text-text-primary text-base">{student.display_name}</Text>
                        <Text className="text-text-secondary text-xs">
                          {calculateAge(student.date_of_birth)} yrs • {student.gender}
                        </Text>
                      </View>
                    </View>

                    {/* Credentials */}
                    <View className="flex-row items-center flex-wrap gap-2">
                      <View className="bg-slate-100 px-3 py-1 rounded-md">
                        <Text className="font-mono text-xs text-slate-600">User: {student.username}</Text>
                      </View>
                      <View className="bg-green-100 px-3 py-1 rounded-md">
                        <Text className="font-mono text-xs text-green-800 font-bold">PIN: {student.hashed_pin}</Text>
                      </View>
                      
                      <Pressable 
                        onPress={() => copyCredentials(student.username, student.hashed_pin)}
                        className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-md"
                      >
                        <Text className="text-blue-600 font-bold text-xs">Copy Login</Text>
                      </Pressable>
                    </View>

                    {/* Actions */}
                    <View className="flex-row gap-3">
                      <Pressable 
                        onPress={() => openEditForm(student)}
                        className="px-4 py-2 bg-slate-100 rounded-lg border border-slate-200"
                      >
                        <Text className="text-text-secondary font-semibold text-sm">Edit</Text>
                      </Pressable>
                      <Pressable 
                        onPress={() => handleDelete(student.id, student.display_name)}
                        className="px-4 py-2 bg-red-50 rounded-lg border border-red-100"
                      >
                        <Text className="text-red-600 font-semibold text-sm">Delete</Text>
                      </Pressable>
                    </View>

                  </View>
                ))}
              </View>
            )}
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}