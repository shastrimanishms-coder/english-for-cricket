import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import StudyDaysPicker, { isValidStudyDays } from '../../components/ui/StudyDaysPicker';
import { useRequireRole } from '../../hooks/useRequireRole';
import {
  distinctClassNames,
  groupStudentsByClass,
} from '../../lib/studentGroups';
import { supabase } from '../../lib/supabase';

interface Student {
  id: string;
  display_name: string;
  username: string;
  hashed_pin: string;
  date_of_birth: string; // UPDATED from age
  gender: string;
  avatar_url?: string;   // NEW
  class_name: string | null; // migration 14: class / group / team
  study_days: number[] | null; // migration 16: chosen study weekdays
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

  // PINs are masked in the list by default; tapping a PIN reveals it
  // (display-only - the value is already in the fetched row).
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});
  const [showSlips, setShowSlips] = useState(false);

  const togglePinReveal = (id: string) => {
    setRevealedPins(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Students organised by class / group / team for the list below.
  const studentGroups = useMemo(() => groupStudentsByClass(students), [students]);
  const toggleGroup = (label: string) =>
    setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  const toggleStudentExpanded = (id: string) =>
    setExpandedStudents(prev => ({ ...prev, [id]: !prev[id] }));
  
  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState(''); // UPDATED
  const [newGender, setNewGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [customPin, setCustomPin] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newStudyDays, setNewStudyDays] = useState<number[]>([]);

  // Collapsible class groups + student rows in the list below.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});

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

      // class_name arrives with migration 14; until it is run, fall
      // back to the old column list so this screen keeps working.
      const baseColumns =
        'id, display_name, username, hashed_pin, date_of_birth, gender, avatar_url, created_at';
      let studentsData: any[] | null = null;
      const withClass = await supabase
        .from('sub_accounts')
        .select(`${baseColumns}, class_name, study_days`)
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (withClass.error && /class_name|study_days/.test(withClass.error.message)) {
        const fallback = await supabase
          .from('sub_accounts')
          .select(baseColumns)
          .eq('organization_id', org.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (fallback.error) throw fallback.error;
        studentsData = (fallback.data || []).map((row: any) => ({
          ...row,
          class_name: null,
          study_days: null,
        }));
      } else if (withClass.error) {
        throw withClass.error;
      } else {
        studentsData = withClass.data;
      }
      setStudents((studentsData || []) as Student[]);
      
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
    setNewClassName('');
    setNewStudyDays([]);
    setShowForm(true);
  };

  const openEditForm = (student: Student) => {
    setEditId(student.id);
    setNewName(student.display_name);
    setNewDob(student.date_of_birth || '');
    setNewGender(student.gender as any);
    setCustomPin(student.hashed_pin);
    setNewClassName(student.class_name || '');
    setNewStudyDays(Array.isArray(student.study_days) ? student.study_days : []);
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
      const username = editId ? null : generateUsername(newName, orgCode);
      // One save attempt; includeClass=false is the pre-migration-14
      // shape, used as an automatic fallback so saving a student never
      // breaks just because the class column is not there yet.
      const attemptSave = async (includeClass: boolean, includeDays: boolean) => {
        const classField = includeClass ? { class_name: newClassName.trim() || null } : {};
        // Fewer than 3 picked days means "no plan set" - every day
        // counts toward the streak until a real plan is chosen.
        const daysField = includeDays
          ? { study_days: isValidStudyDays(newStudyDays) ? [...newStudyDays].sort((a, b) => a - b) : null }
          : {};
        if (editId) {
          return supabase
            .from('sub_accounts')
            .update({
              display_name: newName.trim(),
              date_of_birth: newDob.trim(),
              gender: newGender,
              hashed_pin: customPin.trim(),
              ...classField,
              ...daysField,
            })
            .eq('id', editId);
        }
        return supabase.from('sub_accounts').insert({
          organization_id: orgId,
          display_name: newName.trim(),
          username: username,
          hashed_pin: customPin.trim(),
          date_of_birth: newDob.trim(),
          gender: newGender,
          ...classField,
          ...daysField,
        });
      };

      let { error } = await attemptSave(true, true);
      let classDropped = false;
      let daysDropped = false;
      if (error && /class_name/.test(error.message)) {
        classDropped = true;
        ({ error } = await attemptSave(false, true));
      }
      if (error && /study_days/.test(error.message)) {
        daysDropped = true;
        ({ error } = await attemptSave(!classDropped, false));
      }
      if (error) throw error;

      const classNote =
        (classDropped
          ? '\n\nNote: the Class / Group field needs a one-time database update (migration 14) before it can be saved.'
          : '') +
        (daysDropped
          ? '\n\nNote: Study Days need a one-time database update (migration 16) before they can be saved.'
          : '');
      if (editId) {
        Alert.alert('Success', 'Student profile updated!' + classNote);
      } else {
        Alert.alert('Success', `Student added!\nUsername: ${username}\nPIN: ${customPin}` + classNote);
      }

      await fetchStudentsData();
      closeForm();

    } catch (error: any) {
      Alert.alert('Error saving student', error.message);
    } finally {
      setSaving(false);
    }
  };

  // Clears the student's placement-test recommendation (migration 21)
  // so they can re-take "Find Your Start" fresh. Fails with guidance
  // until the migration has run.
  const resetPlacement = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from('sub_accounts')
        .update({ placement_stage: null, placement_module_id: null, placement_taken_at: null })
        .eq('id', id);
      if (error) throw error;
      Alert.alert('Placement Reset', `${name} can now re-take the placement test.`);
    } catch (error: any) {
      Alert.alert('Reset Failed', `${error.message}\n\nIf this mentions "placement_stage", run migration 21 in Supabase first.`);
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
      <View className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-canvas">
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <ScreenHeader title="My Students" onBack={() => router.push('/manager')} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="max-w-5xl w-full mx-auto space-y-8 gap-8">
          
          <View className="flex-row justify-between items-center flex-wrap gap-4">
            <Text className="font-sans text-slate-500 text-lg">
              Manage student accounts. You can edit their profiles, view their PINs, or copy credentials below.
            </Text>
            {!showForm && (
              <View className="flex-row gap-3">
                {students.length > 0 && (
                  <Pressable
                    onPress={() => setShowSlips(true)}
                    className="items-center justify-center rounded-full border border-inkline bg-white px-5 py-3 active:opacity-90"
                  >
                    <Text className="font-sans text-sm font-semibold text-slate-600">🖨 Print Slips</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={openAddForm}
                  className="items-center justify-center rounded-full border-b-4 border-gold-dark bg-gold px-5 py-3 active:opacity-90"
                >
                  <Text className="font-sans text-sm font-bold text-navy">+ Add New Student</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Form for Add/Edit */}
          {showForm && (
            <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-4 gap-4">
              <Text className="font-display text-lg font-semibold text-navy">
                {editId ? 'Edit Student Account' : 'Create New Student Account'}
              </Text>

              <View className="flex-col md:flex-row gap-4">
                <View className="flex-1">
                  <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Display Name</Text>
                  <TextInput
                    className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy"
                    placeholder="Student's First Name"
                    value={newName}
                    onChangeText={setNewName}
                  />
                </View>
                <View className="w-full md:w-40">
                  <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Date of Birth</Text>
                  <TextInput
                    className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy"
                    placeholder="YYYY-MM-DD"
                    value={newDob}
                    onChangeText={handleDobFormat}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
                <View className="w-full md:w-32">
                  <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">4-Digit PIN</Text>
                  <TextInput
                    className="w-full bg-canvas p-4 rounded-xl border border-inkline text-navy font-mono tracking-widest"
                    value={customPin}
                    onChangeText={setCustomPin}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
              </View>

              <View>
                <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Gender (For Avatars & Voice AI)</Text>
                <View className="flex-row gap-2">
                  {['Male', 'Female', 'Other'].map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => setNewGender(g as any)}
                      className={`flex-1 py-3 rounded-xl border items-center ${newGender === g ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
                    >
                      <Text className={`font-sans font-semibold ${newGender === g ? 'text-white' : 'text-slate-500'}`}>
                        {g === 'Male' ? '👦' : g === 'Female' ? '👧' : '🏏'} {g}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Class / Group / Team (optional)</Text>
                <TextInput
                  className="w-full bg-canvas p-4 rounded-xl border border-inkline font-sans text-navy"
                  placeholder="e.g. Class 3-A, U12 Team, Saturday Group…"
                  value={newClassName}
                  onChangeText={setNewClassName}
                />
                {distinctClassNames(students).length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mt-2">
                    <Text className="font-sans text-xs text-slate-500 py-1.5">Tap to reuse:</Text>
                    {distinctClassNames(students).map((name) => (
                      <Pressable
                        key={name}
                        onPress={() => setNewClassName(name)}
                        className={`px-3 py-1.5 rounded-full border ${newClassName === name ? 'bg-navy border-navy' : 'bg-white border-inkline'}`}
                      >
                        <Text className={`font-sans text-xs font-semibold ${newClassName === name ? 'text-white' : 'text-slate-500'}`}>{name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View>
                <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Study Days (optional)</Text>
                <Text className="font-sans text-xs text-slate-500 mb-2">
                  The days this student plans to study. Only these days count for their streak — or let the student choose in their own profile.
                </Text>
                <StudyDaysPicker value={newStudyDays} onChange={setNewStudyDays} />
              </View>

              <View className="flex-row justify-end gap-3 mt-4">
                <Pressable
                  onPress={closeForm}
                  className="items-center justify-center rounded-full border border-inkline bg-white px-6 py-3 active:opacity-90"
                >
                  <Text className="font-sans text-sm font-semibold text-slate-600">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveStudent}
                  disabled={saving}
                  className={`items-center justify-center rounded-full border-b-4 border-gold-dark bg-gold px-6 py-3 ${saving ? 'opacity-50' : 'active:opacity-90'}`}
                >
                  <Text className="font-sans text-sm font-bold text-navy">{saving ? "Saving..." : "Save Account"}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Students List */}
          <View className="bg-white rounded-[20px] shadow-sm border border-inkline overflow-hidden">
            {students.length === 0 ? (
              <View className="p-12 items-center justify-center">
                <Text className="text-6xl mb-4">🎒</Text>
                <Text className="font-display text-lg font-semibold text-navy mb-2">No Students Yet</Text>
                <Text className="font-sans text-slate-500 text-center">
                  Click the &quot;Add New Student&quot; button above to generate your first sub-account.
                </Text>
              </View>
            ) : (
              <View>
                {studentGroups.map((group) => {
                  const groupOpen = !collapsedGroups[group.label];
                  return (
                    <View key={group.label}>
                      {/* Class / group / team header - tap to collapse */}
                      <Pressable
                        onPress={() => toggleGroup(group.label)}
                        className="flex-row items-center justify-between px-4 py-3 bg-canvas border-b border-inkline"
                      >
                        <Text className="font-sans font-bold text-navy text-sm">
                          {groupOpen ? '▾' : '▸'} 📚 {group.label}
                        </Text>
                        <MicroLabel>
                          {group.students.length} {group.students.length === 1 ? 'student' : 'students'}
                        </MicroLabel>
                      </Pressable>

                      {groupOpen && group.students.map((student) => {
                        const rowOpen = !!expandedStudents[student.id];
                        return (
                          <View key={student.id} className="border-b border-inkline">
                            {/* Collapsed row: name + ID only */}
                            <Pressable
                              onPress={() => toggleStudentExpanded(student.id)}
                              className="flex-row items-center gap-3 px-4 py-3 hover:bg-canvas"
                            >
                              <View className="w-10 h-10 bg-gold-light rounded-full items-center justify-center border border-gold/40">
                                <Text className="text-xl">{getMascot(student.gender, student.avatar_url)}</Text>
                              </View>
                              <View className="flex-1">
                                <Text className="font-sans font-bold text-navy text-base">{student.display_name}</Text>
                                <Text className="text-slate-400 text-xs font-mono">{student.username}</Text>
                              </View>
                              <Text className="text-slate-400 text-sm">{rowOpen ? '▾' : '▸'}</Text>
                            </Pressable>

                            {/* Expanded detail: age/gender, credentials, actions */}
                            {rowOpen && (
                              <View className="flex-col md:flex-row px-4 pb-4 md:items-center justify-between gap-4">
                                <Text className="font-sans text-slate-500 text-xs min-w-[200px]">
                                  {calculateAge(student.date_of_birth)} yrs • {student.gender}
                                </Text>

                                {/* Credentials */}
                                <View className="flex-row items-center flex-wrap gap-2">
                                  <View className="bg-canvas border border-inkline px-3 py-1 rounded-full">
                                    <Text className="font-mono text-xs text-slate-600">User: {student.username}</Text>
                                  </View>
                                  <Pressable
                                    onPress={() => togglePinReveal(student.id)}
                                    className="bg-pitch-light border border-pitch/30 px-3 py-1 rounded-full"
                                  >
                                    <Text className="font-mono text-xs text-pitch-dark font-bold">
                                      PIN: {revealedPins[student.id] ? student.hashed_pin : '••••'} {revealedPins[student.id] ? '🙈' : '👁'}
                                    </Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => copyCredentials(student.username, student.hashed_pin)}
                                    className="px-3 py-1 bg-navy border border-navy rounded-full"
                                  >
                                    <Text className="font-sans text-white font-bold text-xs">Copy Login</Text>
                                  </Pressable>
                                </View>

                                {/* Actions */}
                                <View className="flex-row gap-3">
                                  <Pressable
                                    onPress={() => openEditForm(student)}
                                    className="px-4 py-2 bg-white rounded-full border border-inkline"
                                  >
                                    <Text className="font-sans text-slate-600 font-semibold text-sm">Edit</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => resetPlacement(student.id, student.display_name)}
                                    className="px-4 py-2 bg-gold-light/60 rounded-full border border-gold/40"
                                  >
                                    <Text className="font-sans text-gold-dark font-semibold text-sm">Reset Placement</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => handleDelete(student.id, student.display_name)}
                                    className="px-4 py-2 bg-red-50 rounded-full border border-red-200"
                                  >
                                    <Text className="font-sans text-red-600 font-semibold text-sm">Delete</Text>
                                  </Pressable>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {/* Login Slips - one printable card per active student.
          On web the Print button calls window.print(); the @media
          print rules in global.css isolate #login-slips so only the
          slips reach the paper. On native this is a preview only. */}
      <Modal visible={showSlips} animationType="slide" onRequestClose={() => setShowSlips(false)}>
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row justify-between items-center p-4 border-b border-inkline">
            <Text className="font-display text-lg font-semibold text-navy">Login Slips ({students.length})</Text>
            <View className="flex-row gap-3">
              {Platform.OS === 'web' && (
                <Pressable onPress={() => window.print()} className="px-5 py-2.5 bg-gold border-b-4 border-gold-dark rounded-full active:opacity-90">
                  <Text className="font-sans text-navy font-bold text-sm">Print</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setShowSlips(false)} className="px-5 py-2.5 bg-white rounded-full border border-inkline active:opacity-90">
                <Text className="font-sans text-slate-600 font-bold text-sm">Close</Text>
              </Pressable>
            </View>
          </View>

          {Platform.OS !== 'web' && (
            <View className="mx-4 mt-4 bg-gold-light/50 border border-gold/40 rounded-xl p-3">
              <Text className="font-sans text-gold-dark text-sm">
                Printing works from the web version — open this page in a browser to print the slips. You can still read every login below.
              </Text>
            </View>
          )}

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View nativeID="login-slips" className="max-w-3xl w-full mx-auto gap-4">
              {students.map((student) => (
                <View key={student.id} className="border-2 border-dashed border-slate-300 rounded-2xl p-5 break-inside-avoid bg-white">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-base font-bold tracking-widest uppercase text-text-primary">🏏 English for Cricket</Text>
                    <Text className="text-xs text-text-secondary">Student Login Slip</Text>
                  </View>
                  <Text className="text-2xl font-bold text-text-primary mb-3">{student.display_name}</Text>
                  <View className="flex-row flex-wrap gap-6 mb-4">
                    <View>
                      <Text className="text-xs font-bold text-text-secondary uppercase">Username</Text>
                      <Text className="font-mono text-lg font-bold text-text-primary">{student.username}</Text>
                    </View>
                    <View>
                      <Text className="text-xs font-bold text-text-secondary uppercase">Secret PIN</Text>
                      <Text className="font-mono text-lg font-bold text-text-primary tracking-widest">{student.hashed_pin}</Text>
                    </View>
                    {student.class_name ? (
                      <View>
                        <Text className="text-xs font-bold text-text-secondary uppercase">Class / Group</Text>
                        <Text className="text-lg font-bold text-text-primary">{student.class_name}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View className="border-t border-slate-100 pt-3">
                    <Text className="text-sm text-text-secondary">1. Open English for Cricket and tap Log In.</Text>
                    <Text className="text-sm text-text-secondary">2. Choose the “Student PIN” tab.</Text>
                    <Text className="text-sm text-text-secondary">3. Type your Username and Secret PIN above. Keep this slip safe!</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}