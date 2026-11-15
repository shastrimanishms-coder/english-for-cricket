import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface UserProfile {
  id: string;
  display_name: string | null;
  role: string;
  country: string | null;
  region: string | null;
  created_at: string;
  last_login_at: string | null;
  is_archived: boolean;
  reminder_level: number;
}

interface Organization {
  id: string;
  name: string;
  manager_id: string;
}

interface SubAccount {
  id: string;
  organization_id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
  is_archived?: boolean | null;
  last_login_at: string | null;
  created_at: string;
  marked_for_deletion_at: string | null;
  reminder_level: number;
}

// One row of the get_admin_user_stats() RPC (migration
// 20261115000008). avg_accuracy is a percentage (0-100) or null when
// the student has not answered any scored lesson questions yet.
interface AdminUserStats {
  student_id: string;
  student_kind: string; // 'auth' | 'sub_account'
  total_seconds: number;
  game_seconds: number;
  video_seconds: number;
  lesson_seconds: number;
  lessons_completed: number;
  avg_accuracy: number | null;
  last_active_at: string | null;
}

const ROLE_OPTIONS = ['super_admin', 'manager', 'individual_learner'] as const;

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} mins`;
}

function topActivityLabel(stats: AdminUserStats): string {
  const entries: [string, number][] = [
    ['🎮 Games', Number(stats.game_seconds) || 0],
    ['📺 Videos', Number(stats.video_seconds) || 0],
    ['📚 Lessons', Number(stats.lesson_seconds) || 0],
  ];
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : 'None yet';
}

function formatLastActive(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never';
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function UsersManager() {
  const [managers, setManagers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<SubAccount[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [statsByKey, setStatsByKey] = useState<Map<string, AdminUserStats>>(new Map());
  const [statsAvailable, setStatsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Master-account edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<string>('individual_learner');
  const [editCountry, setEditCountry] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [profileRes, subRes, orgRes] = await Promise.all([
        supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('sub_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('organizations').select('id, name, manager_id'),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (subRes.error) throw subRes.error;
      // Organizations only provide the tree grouping + location context;
      // if that read fails the rest of the screen still works.
      if (!orgRes.error) setOrganizations(orgRes.data || []);

      setManagers(profileRes.data || []);
      setStudents(subRes.data || []);

      // Stats come from the get_admin_user_stats() RPC (migration 8).
      // Until that file is run the RPC does not exist: fail soft, show
      // the profiles with '—' placeholders and an explanatory note
      // instead of the old client-side join's fake zeros.
      const { data: statsData, error: statsError } = await supabase.rpc('get_admin_user_stats');
      if (statsError) {
        setStatsAvailable(false);
        setStatsByKey(new Map());
      } else {
        setStatsAvailable(true);
        const map = new Map<string, AdminUserStats>();
        (statsData || []).forEach((row: AdminUserStats) => {
          map.set(`${row.student_kind}:${row.student_id}`, {
            ...row,
            total_seconds: Number(row.total_seconds) || 0,
            game_seconds: Number(row.game_seconds) || 0,
            video_seconds: Number(row.video_seconds) || 0,
            lesson_seconds: Number(row.lesson_seconds) || 0,
            lessons_completed: Number(row.lessons_completed) || 0,
            avg_accuracy: row.avg_accuracy === null || row.avg_accuracy === undefined ? null : Number(row.avg_accuracy),
          });
        });
        setStatsByKey(map);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const getDaysSince = (dateString: string | null) => {
    if (!dateString) return 0;
    const diffTime = Math.abs(new Date().getTime() - new Date(dateString).getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const statsFor = (kind: 'auth' | 'sub_account', id: string) => statsByKey.get(`${kind}:${id}`);

  // --- RETENTION ENGINE LOGIC ---
  const pendingReminders = students.filter(s => {
    if (s.marked_for_deletion_at) return false;
    const days = getDaysSince(s.last_login_at);
    if (days >= 28 && s.reminder_level < 4) return true;
    if (days >= 21 && days < 28 && s.reminder_level < 3) return true;
    if (days >= 14 && days < 21 && s.reminder_level < 2) return true;
    if (days >= 7 && days < 14 && s.reminder_level < 1) return true;
    return false;
  });

  const pendingDeletions = students.filter(s => getDaysSince(s.last_login_at) >= 30 && !s.marked_for_deletion_at);
  const pendingHardDeletes = students.filter(s => s.marked_for_deletion_at && getDaysSince(s.marked_for_deletion_at) >= 90);

  const processReminders = async () => {
    setProcessing(true);
    try {
      // In Phase 2, we will connect this to your SMTP email API.
      // For now, it updates the database states so the queue clears.
      for (const s of pendingReminders) {
        const days = getDaysSince(s.last_login_at);
        let newLevel = s.reminder_level;
        if (days >= 28) newLevel = 4;
        else if (days >= 21) newLevel = 3;
        else if (days >= 14) newLevel = 2;
        else if (days >= 7) newLevel = 1;

        await supabase.from('sub_accounts').update({ reminder_level: newLevel }).eq('id', s.id);
      }
      Alert.alert('Success', `${pendingReminders.length} reminder emails processed and logged.`);
      await fetchData();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setProcessing(false); }
  };

  const processDeletionMarks = async () => {
    setProcessing(true);
    try {
      for (const s of pendingDeletions) {
        await supabase.from('sub_accounts').update({ marked_for_deletion_at: new Date().toISOString() }).eq('id', s.id);
      }
      Alert.alert('Success', `${pendingDeletions.length} accounts marked for deletion.`);
      await fetchData();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setProcessing(false); }
  };

  const processHardDeletes = async () => {
    const confirm = () => {
      setProcessing(true);
      Promise.all(pendingHardDeletes.map(s => supabase.from('sub_accounts').delete().eq('id', s.id)))
        .then(() => {
          Alert.alert('Success', `${pendingHardDeletes.length} accounts permanently deleted.`);
          fetchData();
        })
        .catch(e => Alert.alert('Error', e.message))
        .finally(() => setProcessing(false));
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`PERMANENTLY delete ${pendingHardDeletes.length} accounts? This cannot be undone.`)) confirm();
    } else {
      Alert.alert('WARNING', `Permanently delete ${pendingHardDeletes.length} accounts?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Forever', style: 'destructive', onPress: confirm }
      ]);
    }
  };

  // --- MASTER ACCOUNT POWERS ---
  const openEdit = (profile: UserProfile) => {
    setEditingId(profile.id);
    setEditDisplayName(profile.display_name || '');
    setEditRole(profile.role);
    setEditCountry(profile.country || '');
    setEditRegion(profile.region || '');
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editDisplayName.trim()) {
      Alert.alert('Missing Field', 'Display name cannot be empty.');
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: editDisplayName.trim(),
          role: editRole,
          country: editCountry.trim() || null,
          region: editRegion.trim() || null,
        })
        .eq('id', editingId);
      if (error) throw error;
      setEditingId(null);
      await fetchData();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // True account deletion goes through the delete-user Edge Function
  // (it holds the service-role key and calls the Auth Admin API).
  // Deleting only the user_profiles row would leave the login alive,
  // so that is never offered as a substitute.
  const deleteMasterAccount = (profile: UserProfile) => {
    const name = profile.display_name || 'this user';
    const run = async () => {
      setProcessing(true);
      try {
        const { data, error } = await supabase.functions.invoke('delete-user', {
          body: { user_id: profile.id },
        });

        if (error) {
          const status = (error as any)?.context?.status;
          let serverMessage = '';
          try {
            const body = await (error as any)?.context?.json?.();
            if (body?.error) serverMessage = body.error;
          } catch { /* response body was not JSON */ }

          if (serverMessage) {
            Alert.alert('Cannot Delete Account', serverMessage);
          } else if (status === 404 || /not found/i.test(error.message || '')) {
            Alert.alert(
              'Delete Function Not Deployed',
              'True account deletion needs the delete-user Edge Function, which is not deployed yet. Deleting only the profile row would leave the login account alive, so nothing was deleted. See supabase/functions/README.md for the deploy steps.'
            );
          } else {
            Alert.alert('Delete Failed', error.message);
          }
          return;
        }

        if (data?.error) {
          Alert.alert('Cannot Delete Account', data.error);
          return;
        }

        Alert.alert('Success', `Account for ${name} deleted.`);
        await fetchData();
      } catch (e: any) {
        Alert.alert('Delete Failed', e.message);
      } finally {
        setProcessing(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete the account for ${name}? This removes their login completely and cannot be undone.`)) run();
    } else {
      Alert.alert('Delete Account', `Delete the account for ${name}? This removes their login completely and cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: run },
      ]);
    }
  };

  // --- SUB-ACCOUNT POWERS ---
  const toggleSubArchive = async (student: SubAccount) => {
    try {
      const { error } = await supabase
        .from('sub_accounts')
        .update({ is_archived: !student.is_archived })
        .eq('id', student.id);
      if (error) throw error;
      await fetchData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteSubAccountNow = (student: SubAccount) => {
    const label = student.display_name || student.username;
    const run = async () => {
      try {
        const { error } = await supabase.from('sub_accounts').delete().eq('id', student.id);
        if (error) throw error;
        await fetchData();
      } catch (e: any) {
        Alert.alert('Delete Failed', e.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Permanently delete student ${label} now? This is separate from the 90-day retention pipeline and cannot be undone.`)) run();
    } else {
      Alert.alert('Delete Student', `Permanently delete ${label} now? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: run },
      ]);
    }
  };

  const renderStatsCells = (stats: AdminUserStats | undefined) => {
    if (!statsAvailable) {
      return (
        <>
          <View className="items-end w-24">
            <Text className="text-xs font-bold text-slate-400 uppercase">Total Time</Text>
            <Text className="text-sm font-bold text-slate-400">—</Text>
          </View>
          <View className="items-end w-24">
            <Text className="text-xs font-bold text-slate-400 uppercase">Last Active</Text>
            <Text className="text-sm font-bold text-slate-400">—</Text>
          </View>
        </>
      );
    }
    return (
      <>
        <View className="items-end">
          <Text className="text-xs font-bold text-slate-400 uppercase">Top Activity</Text>
          <Text className="text-sm font-bold text-brand">{stats ? topActivityLabel(stats) : 'None yet'}</Text>
        </View>
        <View className="items-end w-24">
          <Text className="text-xs font-bold text-slate-400 uppercase">Total Time</Text>
          <Text className="text-sm font-bold text-[#0A192F]">{stats ? formatDuration(stats.total_seconds) : '0 mins'}</Text>
        </View>
        <View className="items-end w-20">
          <Text className="text-xs font-bold text-slate-400 uppercase">Lessons</Text>
          <Text className="text-sm font-bold text-[#0A192F]">{stats ? stats.lessons_completed : 0}</Text>
        </View>
        <View className="items-end w-20">
          <Text className="text-xs font-bold text-slate-400 uppercase">Accuracy</Text>
          <Text className="text-sm font-bold text-[#0A192F]">{stats?.avg_accuracy !== null && stats?.avg_accuracy !== undefined ? `${stats.avg_accuracy}%` : '—'}</Text>
        </View>
        <View className="items-end w-24">
          <Text className="text-xs font-bold text-slate-400 uppercase">Last Active</Text>
          <Text className="text-sm font-bold text-[#0A192F]">{formatLastActive(stats?.last_active_at)}</Text>
        </View>
      </>
    );
  };

  const orgManagerById = new Map(organizations.map(o => [o.id, o.manager_id]));
  const orgNameById = new Map(organizations.map(o => [o.id, o.name]));

  return (
    <View className="space-y-6 pb-12">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-2xl font-bold text-text-primary">Users & Analytics Tree</Text>
        <Pressable onPress={fetchData} className="px-4 py-2 bg-slate-200 rounded-lg">
          <Text className="font-bold text-slate-700">↻ Refresh</Text>
        </Pressable>
      </View>

      {!statsAvailable && (
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Text className="text-amber-800 text-sm font-semibold">
            Usage stats are not active yet — they switch on automatically once the latest database update (migration 8) has been run in Supabase. User accounts below are fully manageable in the meantime.
          </Text>
        </View>
      )}

      {/* RETENTION ENGINE COCKPIT */}
      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-2">
        <View className="bg-brand p-4">
          <Text className="text-white font-bold text-lg">Automated Retention Engine</Text>
          <Text className="text-white/80 text-xs mt-1">Review and process inactive accounts safely.</Text>
        </View>
        <View className="p-6 space-y-4">

          {/* Action Row 1: Reminders */}
          <View className="flex-row items-center justify-between bg-blue-50 border border-blue-200 p-4 rounded-xl">
            <View>
              <Text className="font-bold text-blue-900 text-base">Send Reminder Emails</Text>
              <Text className="text-sm text-blue-700 mt-1">7, 14, 21, and 28-day notices.</Text>
            </View>
            <View className="flex-row items-center gap-4">
              <Text className="font-bold text-2xl text-blue-900">{pendingReminders.length}</Text>
              <Pressable
                onPress={processReminders}
                disabled={processing || pendingReminders.length === 0}
                className={`px-4 py-2 rounded-lg ${pendingReminders.length > 0 ? 'bg-blue-600' : 'bg-slate-300'}`}
              >
                <Text className="text-white font-bold">Process</Text>
              </Pressable>
            </View>
          </View>

          {/* Action Row 2: Mark for Deletion */}
          <View className="flex-row items-center justify-between bg-amber-50 border border-amber-200 p-4 rounded-xl">
            <View>
              <Text className="font-bold text-amber-900 text-base">Mark for Deletion (30 Days)</Text>
              <Text className="text-sm text-amber-700 mt-1">Flags accounts inactive for 30+ days.</Text>
            </View>
            <View className="flex-row items-center gap-4">
              <Text className="font-bold text-2xl text-amber-900">{pendingDeletions.length}</Text>
              <Pressable
                onPress={processDeletionMarks}
                disabled={processing || pendingDeletions.length === 0}
                className={`px-4 py-2 rounded-lg ${pendingDeletions.length > 0 ? 'bg-amber-600' : 'bg-slate-300'}`}
              >
                <Text className="text-white font-bold">Process</Text>
              </Pressable>
            </View>
          </View>

          {/* Action Row 3: Hard Delete */}
          <View className="flex-row items-center justify-between bg-red-50 border border-red-200 p-4 rounded-xl">
            <View>
              <Text className="font-bold text-red-900 text-base">Permanent Deletion (90 Days)</Text>
              <Text className="text-sm text-red-700 mt-1">Deletes accounts flagged 90+ days ago.</Text>
            </View>
            <View className="flex-row items-center gap-4">
              <Text className="font-bold text-2xl text-red-900">{pendingHardDeletes.length}</Text>
              <Pressable
                onPress={processHardDeletes}
                disabled={processing || pendingHardDeletes.length === 0}
                className={`px-4 py-2 rounded-lg ${pendingHardDeletes.length > 0 ? 'bg-red-600' : 'bg-slate-300'}`}
              >
                <Text className="text-white font-bold">Execute</Text>
              </Pressable>
            </View>
          </View>

        </View>
      </View>

      {/* ORGANIZATIONAL TREE */}
      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <View className="bg-[#0A192F] p-4 flex-row justify-between items-center">
          <Text className="text-white font-bold">Organizational Tree & Telemetry</Text>
        </View>

        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : managers.length === 0 ? (
          <View className="p-8 items-center"><Text className="text-slate-500">No users found.</Text></View>
        ) : (
          managers.map((manager, index) => {
            const orgStudents = students.filter(s => orgManagerById.get(s.organization_id) === manager.id);
            const isSuperAdmin = manager.role === 'super_admin';
            const location = manager.country ? `${manager.region ? manager.region + ', ' : ''}${manager.country}` : 'Unknown Location';
            const managerStats = statsFor('auth', manager.id);
            const isEditing = editingId === manager.id;

            return (
              <View key={manager.id} className={`p-6 ${manager.is_archived ? 'bg-slate-50' : 'bg-white'} ${index !== managers.length - 1 ? 'border-b border-slate-200' : ''}`}>
                <View className="flex-col md:flex-row justify-between items-start mb-4 gap-4 md:gap-0">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-3 mb-2 flex-wrap">
                      <Text className="font-bold text-lg text-[#0A192F]">{manager.display_name || 'Unnamed User'}</Text>
                      <View className={`px-2.5 py-1 rounded-md ${isSuperAdmin ? 'bg-[#D4AF37]/20' : 'bg-slate-200'}`}>
                        <Text className={`text-xs font-bold uppercase ${isSuperAdmin ? 'text-[#D4AF37]' : 'text-slate-600'}`}>
                          {manager.role.replace('_', ' ')}
                        </Text>
                      </View>
                      {manager.is_archived && (
                        <View className="px-2.5 py-1 rounded-md bg-slate-300">
                          <Text className="text-xs font-bold uppercase text-slate-600">Archived</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-slate-400 text-xs font-mono">ID: {manager.id}</Text>
                    <View className="flex-row items-center gap-3 mt-1">
                      <Text className="text-slate-400 text-xs font-bold">📍 {location}</Text>
                      <Text className="text-slate-400 text-xs">Joined: {new Date(manager.created_at).toLocaleDateString()}</Text>
                    </View>

                    {/* Learner telemetry for email-learner master accounts */}
                    {manager.role === 'individual_learner' && (
                      <View className="flex-row items-center gap-6 mt-3 flex-wrap">
                        {renderStatsCells(managerStats)}
                      </View>
                    )}
                  </View>

                  {!isEditing && (
                    <View className="flex-row gap-3">
                      <Pressable onPress={() => openEdit(manager)} className="px-4 py-2 bg-slate-100 rounded-lg border border-slate-200">
                        <Text className="text-text-secondary font-semibold text-sm">Edit</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => deleteMasterAccount(manager)}
                        disabled={processing}
                        className="px-4 py-2 bg-red-50 rounded-lg border border-red-100"
                      >
                        <Text className="text-red-600 font-semibold text-sm">Delete Account</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Edit form for the master account */}
                {isEditing && (
                  <View className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-4 gap-4">
                    <View>
                      <Text className="text-sm font-semibold text-text-secondary mb-2">Display Name</Text>
                      <TextInput
                        className="w-full bg-white p-3 rounded-xl border border-slate-200 text-text-primary"
                        value={editDisplayName}
                        onChangeText={setEditDisplayName}
                        placeholder="Full name"
                      />
                    </View>
                    <View>
                      <Text className="text-sm font-semibold text-text-secondary mb-2">Role</Text>
                      <View className="flex-row gap-2 flex-wrap">
                        {ROLE_OPTIONS.map(r => (
                          <Pressable
                            key={r}
                            onPress={() => setEditRole(r)}
                            className={`px-3 py-2 rounded-xl border ${editRole === r ? 'border-brand bg-brand' : 'border-slate-200 bg-white'}`}
                          >
                            <Text className={`font-semibold text-sm ${editRole === r ? 'text-white' : 'text-text-secondary'}`}>
                              {r.replace('_', ' ')}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <View className="flex-col md:flex-row gap-4">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-text-secondary mb-2">Country</Text>
                        <TextInput
                          className="w-full bg-white p-3 rounded-xl border border-slate-200 text-text-primary"
                          value={editCountry}
                          onChangeText={setEditCountry}
                          placeholder="e.g., Japan"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-text-secondary mb-2">Region</Text>
                        <TextInput
                          className="w-full bg-white p-3 rounded-xl border border-slate-200 text-text-primary"
                          value={editRegion}
                          onChangeText={setEditRegion}
                          placeholder="e.g., Osaka"
                        />
                      </View>
                    </View>
                    <View className="flex-row justify-end gap-3">
                      <Pressable onPress={cancelEdit} className="px-4 py-2 bg-white rounded-lg border border-slate-200">
                        <Text className="text-text-secondary font-semibold text-sm">Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={saveEdit}
                        disabled={savingEdit}
                        className="px-4 py-2 bg-brand rounded-lg"
                      >
                        <Text className="text-white font-semibold text-sm">{savingEdit ? 'Saving...' : 'Save Changes'}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Sub Accounts Analytics Tree */}
                <View className="ml-4 pl-4 border-l-2 border-slate-200 py-2">
                  <Text className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">
                    {orgStudents.length} Connected Sub-Accounts
                  </Text>

                  {orgStudents.length === 0 ? (
                    <Text className="text-slate-400 text-sm italic ml-4">└── No students created yet.</Text>
                  ) : (
                    <View className="space-y-3 gap-3">
                      {orgStudents.map(student => {
                        const stats = statsFor('sub_account', student.id);
                        const daysInactive = getDaysSince(student.last_login_at);
                        const isMarked = !!student.marked_for_deletion_at;
                        const orgName = orgNameById.get(student.organization_id);

                        return (
                          <View key={student.id} className={`border p-3 rounded-xl ml-2 ${isMarked ? 'bg-red-50 border-red-200' : student.is_archived ? 'bg-slate-100 border-slate-200' : 'bg-slate-50 border-slate-200'}`}>
                            <View className="flex-row items-center justify-between flex-wrap gap-3">
                              <View className="flex-row items-center gap-4">
                                <Text className="text-slate-400 font-mono">└──</Text>
                                <View>
                                  <Text className="font-bold text-[#0A192F] text-base">{student.display_name || student.username}</Text>
                                  <Text className="text-xs text-slate-400 font-mono">{student.username}{orgName ? ` • ${orgName}` : ''}{manager.country ? ` • 📍 ${manager.region ? manager.region + ', ' : ''}${manager.country}` : ''}</Text>
                                  {isMarked && <Text className="text-[10px] font-bold text-red-600 uppercase mt-0.5">Marked for Deletion</Text>}
                                  {student.is_archived && <Text className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Archived</Text>}
                                </View>
                              </View>

                              <View className="flex-row items-center gap-6 flex-wrap">
                                {renderStatsCells(stats)}
                                <View className="items-end w-20">
                                  <Text className="text-xs font-bold text-slate-400 uppercase">Status</Text>
                                  {daysInactive < 7 ? (
                                    <Text className="text-sm font-bold text-emerald-600">Active</Text>
                                  ) : (
                                    <Text className={`text-sm font-bold ${isMarked ? 'text-red-600' : 'text-amber-600'}`}>{daysInactive}d ago</Text>
                                  )}
                                </View>
                              </View>
                            </View>

                            <View className="flex-row justify-end gap-3 mt-3">
                              <Pressable onPress={() => toggleSubArchive(student)} className="px-3 py-1.5 bg-white rounded-lg border border-slate-200">
                                <Text className="text-text-secondary font-semibold text-xs">{student.is_archived ? 'Unarchive' : 'Archive'}</Text>
                              </Pressable>
                              <Pressable onPress={() => deleteSubAccountNow(student)} className="px-3 py-1.5 bg-red-50 rounded-lg border border-red-100">
                                <Text className="text-red-600 font-semibold text-xs">Delete Now</Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
