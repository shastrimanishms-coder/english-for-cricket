import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface UserProfile {
  id: string;
  role: string;
  country: string;
  region: string;
  created_at: string;
  last_login_at: string;
  is_archived: boolean;
  reminder_level: number;
}

interface SubAccount {
  id: string;
  parent_id: string;
  username: string;
  pin: string;
  is_active: boolean;
  last_login_at: string;
  created_at: string;
  marked_for_deletion_at: string | null;
  reminder_level: number;
}

interface ActivityLog {
  student_id: string;
  activity_type: string;
  duration_seconds: number;
}

export default function UsersManager() {
  const [managers, setManagers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<SubAccount[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [profileRes, subRes, logsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('sub_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('activity_logs').select('student_id, activity_type, duration_seconds')
      ]);

      if (profileRes.error) throw profileRes.error;
      if (subRes.error) throw subRes.error;
      if (logsRes.error) throw logsRes.error;

      setManagers(profileRes.data || []);
      setStudents(subRes.data || []);
      setActivityLogs(logsRes.data || []);
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

  // --- ANALYTICS LOGIC ---
  const getStudentAnalytics = (studentId: string) => {
    const logs = activityLogs.filter(log => log.student_id === studentId);
    if (logs.length === 0) return { totalMinutes: 0, topInterest: 'None yet' };

    let totalSeconds = 0;
    const interestMap: Record<string, number> = { 'game': 0, 'video': 0, 'lesson_slide': 0 };

    logs.forEach(log => {
      totalSeconds += log.duration_seconds;
      if (interestMap[log.activity_type] !== undefined) interestMap[log.activity_type] += log.duration_seconds;
    });

    const topInterestType = Object.keys(interestMap).reduce((a, b) => interestMap[a] > interestMap[b] ? a : b);
    const interestLabels: Record<string, string> = { 'game': '🎮 Games', 'video': '📺 Videos', 'lesson_slide': '📚 Learning' };

    return {
      totalMinutes: Math.floor(totalSeconds / 60),
      topInterest: interestMap[topInterestType] > 0 ? interestLabels[topInterestType] : 'Mixed'
    };
  };

  return (
    <View className="space-y-6 pb-12">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-2xl font-bold text-text-primary">Users & Analytics Tree</Text>
        <Pressable onPress={fetchData} className="px-4 py-2 bg-slate-200 rounded-lg">
          <Text className="font-bold text-slate-700">↻ Refresh</Text>
        </Pressable>
      </View>

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
            const orgStudents = students.filter(s => s.parent_id === manager.id);
            const isSuperAdmin = manager.role === 'super_admin';
            const location = manager.country ? `${manager.region ? manager.region + ', ' : ''}${manager.country}` : 'Unknown Location';

            return (
              <View key={manager.id} className={`p-6 ${manager.is_archived ? 'bg-slate-50' : 'bg-white'} ${index !== managers.length - 1 ? 'border-b border-slate-200' : ''}`}>
                <View className="flex-col md:flex-row justify-between items-start mb-4 gap-4 md:gap-0">
                  <View>
                    <View className="flex-row items-center gap-3 mb-2">
                      <Text className="font-bold text-lg text-[#0A192F]">Master Account:</Text>
                      <View className={`px-2.5 py-1 rounded-md ${isSuperAdmin ? 'bg-[#D4AF37]/20' : 'bg-slate-200'}`}>
                        <Text className={`text-xs font-bold uppercase ${isSuperAdmin ? 'text-[#D4AF37]' : 'text-slate-600'}`}>
                          {manager.role.replace('_', ' ')}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-slate-500 text-sm font-mono">{manager.id}</Text>
                    <View className="flex-row items-center gap-3 mt-1">
                      <Text className="text-slate-400 text-xs font-bold">📍 {location}</Text>
                      <Text className="text-slate-400 text-xs">Joined: {new Date(manager.created_at).toLocaleDateString()}</Text>
                    </View>
                  </View>
                </View>

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
                        const analytics = getStudentAnalytics(student.id);
                        const daysInactive = getDaysSince(student.last_login_at);
                        const isMarked = !!student.marked_for_deletion_at;
                        
                        return (
                          <View key={student.id} className={`flex-row items-center justify-between border p-3 rounded-xl ml-2 ${isMarked ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                            <View className="flex-row items-center gap-4">
                              <Text className="text-slate-400 font-mono">└──</Text>
                              <View>
                                <Text className="font-bold text-[#0A192F] text-base">{student.username}</Text>
                                {isMarked && <Text className="text-[10px] font-bold text-red-600 uppercase mt-0.5">Marked for Deletion</Text>}
                              </View>
                            </View>

                            <View className="flex-row items-center gap-6">
                              <View className="items-end">
                                <Text className="text-xs font-bold text-slate-400 uppercase">Top Interest</Text>
                                <Text className="text-sm font-bold text-brand">{analytics.topInterest}</Text>
                              </View>
                              <View className="items-end w-24">
                                <Text className="text-xs font-bold text-slate-400 uppercase">Total Time</Text>
                                <Text className="text-sm font-bold text-[#0A192F]">{analytics.totalMinutes} mins</Text>
                              </View>
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