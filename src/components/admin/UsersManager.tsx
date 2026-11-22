import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ROLE_NOTES, roleLabel } from '../../lib/roleLabels';
import { groupStudentsByClass } from '../../lib/studentGroups';
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
  org_code?: string | null;
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
  class_name?: string | null; // migration 14 (absent until it is run)
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

// One row of the get_admin_user_emails() RPC (migration
// 20261115000011): the login email for one auth account. Emails live
// in auth.users, which the client cannot read directly, so this RPC
// is the only route to them - and it returns rows to super_admins only.
interface AdminUserEmail {
  user_id: string;
  email: string;
}

const ROLE_OPTIONS = ['super_admin', 'content_manager', 'manager', 'individual_learner'] as const;

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
  // Login emails by profile id, from the get_admin_user_emails() RPC
  // (migration 11). Empty until that file is run - the screen then
  // behaves exactly as it did before emails existed here.
  const [emailById, setEmailById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Drill-down tree + search state. Sections start collapsed; while a
  // search query is present, matching branches render expanded.
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrgs, setExpandedOrgs] = useState<Record<string, boolean>>({});
  // Student rows are collapsed to name + ID by default; class/group
  // sections inside an org start open and can be collapsed per org.
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});
  const [collapsedClassGroups, setCollapsedClassGroups] = useState<Record<string, boolean>>({});
  const [individualsExpanded, setIndividualsExpanded] = useState(false);
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);

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
        supabase.from('organizations').select('*'),
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

      // Login emails come from the get_admin_user_emails() RPC
      // (migration 11). Until that file is run the RPC does not
      // exist: fail soft, exactly like the stats RPC above - the map
      // stays empty, no email lines render, email search matches
      // nothing, and no error is shown.
      const { data: emailData, error: emailError } = await supabase.rpc('get_admin_user_emails');
      if (emailError) {
        setEmailById(new Map());
      } else {
        const map = new Map<string, string>();
        (emailData || []).forEach((row: AdminUserEmail) => {
          if (row.email) map.set(row.user_id, row.email);
        });
        setEmailById(map);
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
    // App Manager / Content Manager rule (also enforced by a database
    // guard, migrations 20261122000028 + 20261122000029): the account's
    // login email must be an @englishforcricket.com address created
    // for that person. The 'manager' role is a school / club / parent
    // account and is deliberately NOT covered by this rule.
    if (editRole === 'content_manager' || editRole === 'super_admin') {
      const email = emailById.get(editingId);
      if (!email || !email.toLowerCase().endsWith('@englishforcricket.com')) {
        Alert.alert(
          editRole === 'super_admin' ? 'App Manager Rule' : 'Content Manager Rule',
          `A ${roleLabel(editRole)} account must use an @englishforcricket.com email address. Create the mailbox for this person first, have them register with that address, and then set this role.`
        );
        return;
      }
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
          <Text className="text-sm font-bold text-pitch">{stats ? topActivityLabel(stats) : 'None yet'}</Text>
        </View>
        <View className="items-end w-24">
          <Text className="text-xs font-bold text-slate-400 uppercase">Total Time</Text>
          <Text className="text-sm font-bold text-navy">{stats ? formatDuration(stats.total_seconds) : '0 mins'}</Text>
        </View>
        <View className="items-end w-20">
          <Text className="text-xs font-bold text-slate-400 uppercase">Lessons</Text>
          <Text className="text-sm font-bold text-navy">{stats ? stats.lessons_completed : 0}</Text>
        </View>
        <View className="items-end w-20">
          <Text className="text-xs font-bold text-slate-400 uppercase">Accuracy</Text>
          <Text className="text-sm font-bold text-navy">{stats?.avg_accuracy !== null && stats?.avg_accuracy !== undefined ? `${stats.avg_accuracy}%` : '—'}</Text>
        </View>
        <View className="items-end w-24">
          <Text className="text-xs font-bold text-slate-400 uppercase">Last Active</Text>
          <Text className="text-sm font-bold text-navy">{formatLastActive(stats?.last_active_at)}</Text>
        </View>
      </>
    );
  };


  // --- DRILL-DOWN TREE DERIVATION ---
  // Profiles are grouped under the organization they manage
  // (organizations.manager_id -> user_profiles.id); students hang off
  // their organization directly (sub_accounts.organization_id).
  // NOTE on emails: user_profiles has no email column (verified against
  // the live schema) - login emails live in auth.users, which the
  // client cannot read for other users. They arrive via the
  // get_admin_user_emails() RPC (migration 11, super_admin only) into
  // emailById above. When that migration has not been run the map is
  // empty: rows show name, role, joined date, location and the profile
  // ID only, and search covers those fields plus org name/code and
  // student usernames/IDs. Once it is run, each profile block gains an
  // email line and search matches emails too.
  const profilesById = new Map(managers.map(p => [p.id, p]));
  const orgNameById = new Map(organizations.map(o => [o.id, o.name]));
  const orgManagerIds = new Set(organizations.map(o => o.manager_id));
  const studentsByOrg = new Map<string, SubAccount[]>();
  students.forEach(s => {
    const list = studentsByOrg.get(s.organization_id) || [];
    list.push(s);
    studentsByOrg.set(s.organization_id, list);
  });
  const knownOrgIds = new Set(organizations.map(o => o.id));
  const unassignedStudents = students.filter(s => !knownOrgIds.has(s.organization_id));

  const q = searchQuery.trim().toLowerCase();
  const searching = q.length > 0;
  const matchesText = (...vals: (string | null | undefined)[]) =>
    vals.some(v => !!v && v.toLowerCase().includes(q));
  const studentMatches = (s: SubAccount) => matchesText(s.display_name, s.username, s.id, s.class_name);
  const profileMatches = (p: UserProfile) =>
    matchesText(p.display_name, p.role, p.country, p.region, p.id, emailById.get(p.id));

  interface OrgBranch {
    org: Organization;
    manager?: UserProfile;
    allStudents: SubAccount[];
    studentsToShow: SubAccount[];
    visible: boolean;
  }
  const orgBranches: OrgBranch[] = organizations
    .map(org => {
      const manager = profilesById.get(org.manager_id);
      const allStudents = studentsByOrg.get(org.id) || [];
      if (!searching) {
        return { org, manager, allStudents, studentsToShow: allStudents, visible: true };
      }
      const orgFieldMatch =
        matchesText(org.name, org.org_code) || (manager ? profileMatches(manager) : false);
      const matchingStudents = allStudents.filter(studentMatches);
      return {
        org,
        manager,
        allStudents,
        studentsToShow: orgFieldMatch ? allStudents : matchingStudents,
        visible: orgFieldMatch || matchingStudents.length > 0,
      };
    })
    .filter(b => b.visible);

  const individualProfilesAll = managers.filter(p => !orgManagerIds.has(p.id));
  const individualProfiles = searching ? individualProfilesAll.filter(profileMatches) : individualProfilesAll;
  const individualsOpen = individualsExpanded || (searching && individualProfiles.length > 0);

  const unassignedToShow = searching ? unassignedStudents.filter(studentMatches) : unassignedStudents;
  const unassignedOpen = unassignedExpanded || (searching && unassignedToShow.length > 0);

  const noSearchResults =
    searching && orgBranches.length === 0 && individualProfiles.length === 0 && unassignedToShow.length === 0;

  const toggleOrg = (orgId: string) =>
    setExpandedOrgs(prev => ({ ...prev, [orgId]: !prev[orgId] }));

  const toggleStudent = (studentId: string) =>
    setExpandedStudents(prev => ({ ...prev, [studentId]: !prev[studentId] }));

  const toggleClassGroup = (key: string) =>
    setCollapsedClassGroups(prev => ({ ...prev, [key]: !prev[key] }));

  // One student row: collapsed it shows just the name + ID (tap to
  // expand for stats + status + Archive/Delete); a search auto-expands
  // every matching row. Used under its organization (grouped by class)
  // and in the unassigned-students section.
  const renderStudentRow = (student: SubAccount, managerProfile?: UserProfile) => {
    const stats = statsFor('sub_account', student.id);
    const daysInactive = getDaysSince(student.last_login_at);
    const isMarked = !!student.marked_for_deletion_at;
    const orgName = orgNameById.get(student.organization_id);
    const rowOpen = searching || !!expandedStudents[student.id];

    return (
      <View key={student.id} className={`border p-3 rounded-2xl ml-2 ${isMarked ? 'bg-red-50 border-red-200' : student.is_archived ? 'bg-slate-100 border-inkline' : 'bg-canvas border-inkline'}`}>
        <Pressable onPress={() => toggleStudent(student.id)} className="flex-row items-center justify-between flex-wrap gap-3">
          <View className="flex-row items-center gap-4 flex-1">
            <Text className="text-slate-400 font-mono">└──</Text>
            <View className="flex-1">
              <Text className="font-bold text-navy text-base">{student.display_name || student.username}</Text>
              <Text className="text-xs text-slate-400 font-mono">{student.username}{orgName ? ` • ${orgName}` : ''}{managerProfile?.country ? ` • 📍 ${managerProfile.region ? managerProfile.region + ', ' : ''}${managerProfile.country}` : ''}</Text>
              {isMarked && <Text className="text-[10px] font-bold text-red-600 uppercase mt-0.5">Marked for Deletion</Text>}
              {student.is_archived && <Text className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Archived</Text>}
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            {daysInactive < 7 ? (
              <Text className="text-xs font-bold text-pitch">Active</Text>
            ) : (
              <Text className={`text-xs font-bold ${isMarked ? 'text-red-600' : 'text-amber-600'}`}>{daysInactive}d ago</Text>
            )}
            <Text className="text-slate-400 text-sm">{rowOpen ? '▾' : '▸'}</Text>
          </View>
        </Pressable>

        {rowOpen && (
          <View>
            <View className="flex-row items-center gap-6 flex-wrap mt-3">
              {renderStatsCells(stats)}
              <View className="items-end w-20">
                <Text className="text-xs font-bold text-slate-400 uppercase">Status</Text>
                {daysInactive < 7 ? (
                  <Text className="text-sm font-bold text-pitch">Active</Text>
                ) : (
                  <Text className={`text-sm font-bold ${isMarked ? 'text-red-600' : 'text-amber-600'}`}>{daysInactive}d ago</Text>
                )}
              </View>
            </View>

            <View className="flex-row justify-end gap-3 mt-3">
              <Pressable onPress={() => toggleSubArchive(student)} className="px-3 py-1.5 bg-white rounded-full border border-inkline">
                <Text className="text-text-secondary font-semibold text-xs">{student.is_archived ? 'Unarchive' : 'Archive'}</Text>
              </Pressable>
              <Pressable onPress={() => deleteSubAccountNow(student)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                <Text className="text-red-600 font-semibold text-xs">Delete Now</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  };

  // The students of one org, grouped under class / group / team
  // headings (each collapsible; a search forces every group open).
  const renderClassGroups = (orgId: string, list: SubAccount[], managerProfile?: UserProfile) => (
    <View className="space-y-3 gap-3">
      {groupStudentsByClass(list).map(group => {
        const groupKey = `${orgId}|${group.label}`;
        const groupOpen = searching || !collapsedClassGroups[groupKey];
        return (
          <View key={groupKey}>
            <Pressable
              onPress={() => toggleClassGroup(groupKey)}
              className="flex-row items-center justify-between py-1.5 ml-2"
            >
              <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {groupOpen ? '▾' : '▸'} 📚 {group.label}
              </Text>
              <Text className="text-xs font-bold text-slate-400">
                {group.students.length} {group.students.length === 1 ? 'student' : 'students'}
              </Text>
            </Pressable>
            {groupOpen && (
              <View className="space-y-3 gap-3 mt-1">
                {group.students.map(student => renderStudentRow(student, managerProfile))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );

  // One master-account block (identity, telemetry for standalone
  // learners, Edit/Delete + the inline edit form). Used for an org's
  // manager account and for each individual user.
  const renderProfileBlock = (profile: UserProfile) => {
    const isSuperAdmin = profile.role === 'super_admin';
    const location = profile.country ? `${profile.region ? profile.region + ', ' : ''}${profile.country}` : 'Unknown Location';
    const profileStats = statsFor('auth', profile.id);
    const isEditing = editingId === profile.id;

    return (
      <View key={profile.id} className={profile.is_archived ? 'bg-canvas' : 'bg-white'}>
        <View className="flex-col md:flex-row justify-between items-start mb-4 gap-4 md:gap-0">
          <View className="flex-1">
            <View className="flex-row items-center gap-3 mb-2 flex-wrap">
              <Text className="font-display font-semibold text-lg text-navy">{profile.display_name || 'Unnamed User'}</Text>
              <View className={`px-2.5 py-1 rounded-md ${isSuperAdmin ? 'bg-gold/20' : 'bg-slate-200'}`}>
                <Text className={`text-xs font-bold uppercase ${isSuperAdmin ? 'text-gold-dark' : 'text-slate-600'}`}>
                  {roleLabel(profile.role)}
                </Text>
              </View>
              {profile.is_archived && (
                <View className="px-2.5 py-1 rounded-md bg-slate-300">
                  <Text className="text-xs font-bold uppercase text-slate-600">Archived</Text>
                </View>
              )}
            </View>
            <Text className="text-slate-400 text-xs font-mono">ID: {profile.id}</Text>
            {emailById.get(profile.id) ? (
              <Text className="text-slate-600 text-sm font-semibold mt-1">✉ {emailById.get(profile.id)}</Text>
            ) : null}
            <View className="flex-row items-center gap-3 mt-1">
              <Text className="text-slate-400 text-xs font-bold">📍 {location}</Text>
              <Text className="text-slate-400 text-xs">Joined: {new Date(profile.created_at).toLocaleDateString()}</Text>
            </View>

            {/* Learner telemetry for email-learner master accounts */}
            {profile.role === 'individual_learner' && (
              <View className="flex-row items-center gap-6 mt-3 flex-wrap">
                {renderStatsCells(profileStats)}
              </View>
            )}
          </View>

          {!isEditing && (
            <View className="flex-row gap-3">
              <Pressable onPress={() => openEdit(profile)} className="px-4 py-2 bg-slate-100 rounded-full border border-inkline">
                <Text className="text-text-secondary font-semibold text-sm">Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => deleteMasterAccount(profile)}
                disabled={processing}
                className="px-4 py-2 bg-red-50 rounded-full border border-red-100"
              >
                <Text className="text-red-600 font-semibold text-sm">Delete Account</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Edit form for the master account */}
        {isEditing && (
          <View className="bg-canvas border border-inkline rounded-2xl p-4 mb-4 space-y-4 gap-4">
            <View>
              <Text className="text-sm font-semibold text-text-secondary mb-2">Display Name</Text>
              <TextInput
                className="w-full bg-white p-3 rounded-xl border border-inkline text-text-primary"
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
                    className={`px-3 py-2 rounded-full border ${editRole === r ? 'border-navy bg-navy' : 'border-inkline bg-white'}`}
                  >
                    <Text className={`font-semibold text-sm ${editRole === r ? 'text-white' : 'text-text-secondary'}`}>
                      {roleLabel(r)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {ROLE_NOTES[editRole] && (
                <Text className="text-xs text-slate-500 mt-2">{ROLE_NOTES[editRole]}</Text>
              )}
            </View>
            <View className="flex-col md:flex-row gap-4">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-secondary mb-2">Country</Text>
                <TextInput
                  className="w-full bg-white p-3 rounded-xl border border-inkline text-text-primary"
                  value={editCountry}
                  onChangeText={setEditCountry}
                  placeholder="e.g., Japan"
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-secondary mb-2">Region</Text>
                <TextInput
                  className="w-full bg-white p-3 rounded-xl border border-inkline text-text-primary"
                  value={editRegion}
                  onChangeText={setEditRegion}
                  placeholder="e.g., Osaka"
                />
              </View>
            </View>
            <View className="flex-row justify-end gap-3">
              <Pressable onPress={cancelEdit} className="px-4 py-2 bg-white rounded-full border border-inkline">
                <Text className="text-text-secondary font-semibold text-sm">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                disabled={savingEdit}
                className="px-4 py-2 bg-navy rounded-full border-b-4 border-navy-deep"
              >
                <Text className="text-white font-semibold text-sm">{savingEdit ? 'Saving...' : 'Save Changes'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="space-y-6 pb-12">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="font-display text-3xl font-semibold text-navy">Users & Analytics Tree</Text>
        <Pressable onPress={fetchData} className="px-4 py-2 bg-slate-100 rounded-full border border-inkline">
          <Text className="font-bold text-slate-700">↻ Refresh</Text>
        </Pressable>
      </View>

      {/* SUMMARY NUMBERS */}
      <View className="flex-row flex-wrap gap-4">
        <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[200px]">
          <Text className="text-slate-500 text-sm font-bold uppercase mb-1">Schools / Orgs Registered</Text>
          <Text className="font-display text-3xl font-semibold text-navy">{loading ? '—' : organizations.length}</Text>
        </View>
        <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[200px]">
          <Text className="text-slate-500 text-sm font-bold uppercase mb-1">Individual Users Registered</Text>
          <Text className="font-display text-3xl font-semibold text-navy">{loading ? '—' : managers.length}</Text>
        </View>
        <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[200px]">
          <Text className="text-slate-500 text-sm font-bold uppercase mb-1">Total Students</Text>
          <Text className="font-display text-3xl font-semibold text-navy">{loading ? '—' : students.length}</Text>
        </View>
      </View>

      {/* SEARCH */}
      <View className="flex-row items-center gap-3">
        <TextInput
          className="flex-1 bg-white p-3 rounded-xl border border-inkline text-text-primary"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search schools/orgs, manager or user names, emails, student names, usernames, or IDs…"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && (
          <Pressable onPress={() => setSearchQuery('')} className="px-4 py-3 bg-slate-100 rounded-full border border-inkline">
            <Text className="font-bold text-slate-700">✕ Clear</Text>
          </Pressable>
        )}
      </View>

      {!statsAvailable && (
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Text className="text-amber-800 text-sm font-semibold">
            Usage stats are not active yet — they switch on automatically once the latest database update (migration 8) has been run in Supabase. User accounts below are fully manageable in the meantime.
          </Text>
        </View>
      )}

      {/* RETENTION ENGINE COCKPIT */}
      <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden mb-2">
        <View className="bg-navy p-4">
          <Text className="font-display text-white font-semibold text-lg">Automated Retention Engine</Text>
          <Text className="text-white/80 text-xs mt-1">Review and process inactive accounts safely.</Text>
        </View>
        <View className="p-6 space-y-4">

          {/* Action Row 1: Reminders */}
          <View className="flex-row items-center justify-between bg-navy/5 border border-inkline p-4 rounded-2xl">
            <View>
              <Text className="font-sans font-bold text-navy text-base">Send Reminder Emails</Text>
              <Text className="text-sm text-slate-500 mt-1">7, 14, 21, and 28-day notices.</Text>
            </View>
            <View className="flex-row items-center gap-4">
              <Text className="font-display font-semibold text-2xl text-navy">{pendingReminders.length}</Text>
              <Pressable
                onPress={processReminders}
                disabled={processing || pendingReminders.length === 0}
                className={`px-4 py-2 rounded-full ${pendingReminders.length > 0 ? 'bg-navy' : 'bg-slate-300'}`}
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
              <Text className="font-display font-semibold text-2xl text-amber-900">{pendingDeletions.length}</Text>
              <Pressable
                onPress={processDeletionMarks}
                disabled={processing || pendingDeletions.length === 0}
                className={`px-4 py-2 rounded-full ${pendingDeletions.length > 0 ? 'bg-amber-600' : 'bg-slate-300'}`}
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
              <Text className="font-display font-semibold text-2xl text-red-900">{pendingHardDeletes.length}</Text>
              <Pressable
                onPress={processHardDeletes}
                disabled={processing || pendingHardDeletes.length === 0}
                className={`px-4 py-2 rounded-full ${pendingHardDeletes.length > 0 ? 'bg-red-600' : 'bg-slate-300'}`}
              >
                <Text className="text-white font-bold">Execute</Text>
              </Pressable>
            </View>
          </View>

        </View>
      </View>

      {/* ORGANIZATIONAL TREE */}
      <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
        <View className="bg-navy p-4 flex-row justify-between items-center">
          <Text className="font-display text-white font-semibold text-lg">Organizational Tree & Telemetry</Text>
          <Text className="text-slate-300 text-xs font-bold">
            {organizations.length} orgs • {managers.length} users • {students.length} students
          </Text>
        </View>

        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : managers.length === 0 && organizations.length === 0 && students.length === 0 ? (
          <View className="p-8 items-center"><Text className="text-slate-500">No users found.</Text></View>
        ) : noSearchResults ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No matches for “{searchQuery.trim()}”. Try a name, email, username, or ID.</Text>
          </View>
        ) : (
          <View>
            {/* SCHOOLS / ORGANIZATIONS - collapsed by default; a search
                auto-expands every matching branch. */}
            {orgBranches.map(branch => {
              const { org, manager, allStudents, studentsToShow } = branch;
              const isOpen = searching || !!expandedOrgs[org.id];
              return (
                <View key={org.id} className="border-b border-inkline">
                  <Pressable
                    onPress={() => toggleOrg(org.id)}
                    className="flex-row items-center justify-between px-6 py-4 bg-canvas hover:bg-slate-100"
                  >
                    <View className="flex-row items-center gap-3 flex-1 flex-wrap">
                      <Text className="text-slate-500 text-sm">{isOpen ? '▼' : '▶'}</Text>
                      <Text className="font-display font-semibold text-lg text-navy">🏫 {org.name}</Text>
                      {org.org_code ? (
                        <View className="px-2.5 py-1 rounded-md bg-slate-200">
                          <Text className="text-xs font-bold text-slate-600 font-mono">{org.org_code}</Text>
                        </View>
                      ) : null}
                      {manager ? (
                        <Text className="text-xs text-slate-400">Manager: {manager.display_name || 'Unnamed User'}</Text>
                      ) : (
                        <Text className="text-xs text-amber-600 font-semibold">Manager account not found</Text>
                      )}
                    </View>
                    <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {allStudents.length} {allStudents.length === 1 ? 'student' : 'students'}
                    </Text>
                  </Pressable>

                  {isOpen && (
                    <View className="px-6 py-4">
                      {manager ? (
                        renderProfileBlock(manager)
                      ) : (
                        <Text className="text-slate-400 text-sm italic mb-4">
                          This organization points at a manager account that no longer exists (ID: {org.manager_id}).
                        </Text>
                      )}

                      {/* Sub Accounts Analytics Tree */}
                      <View className="ml-4 pl-4 border-l-2 border-inkline py-2">
                        <Text className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">
                          {studentsToShow.length} Connected Sub-Accounts
                          {searching && studentsToShow.length !== allStudents.length ? ` (filtered from ${allStudents.length})` : ''}
                        </Text>

                        {studentsToShow.length === 0 ? (
                          <Text className="text-slate-400 text-sm italic ml-4">└── No students created yet.</Text>
                        ) : (
                          renderClassGroups(org.id, studentsToShow, manager)
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {/* INDIVIDUAL USERS - profiles not tied to any organization:
                admins, managers without an org, standalone learners. */}
            {(!searching || individualProfiles.length > 0) && (
              <View>
                <Pressable
                  onPress={() => setIndividualsExpanded(prev => !prev)}
                  className="flex-row items-center justify-between px-6 py-4 bg-canvas hover:bg-slate-100"
                >
                  <View className="flex-row items-center gap-3 flex-1 flex-wrap">
                    <Text className="text-slate-500 text-sm">{individualsOpen ? '▼' : '▶'}</Text>
                    <Text className="font-display font-semibold text-lg text-navy">👤 Individual Users</Text>
                    <Text className="text-xs text-slate-400">Admins, managers without a school/org, and standalone learners</Text>
                  </View>
                  <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {individualProfiles.length} {individualProfiles.length === 1 ? 'user' : 'users'}
                  </Text>
                </Pressable>

                {individualsOpen && (
                  <View className="px-6 py-2">
                    {individualProfiles.length === 0 ? (
                      <Text className="text-slate-400 text-sm italic py-4">No individual users — every account manages an organization.</Text>
                    ) : (
                      individualProfiles.map((profile, index) => (
                        <View key={profile.id} className={`py-4 ${index !== individualProfiles.length - 1 ? 'border-b border-inkline' : ''}`}>
                          {renderProfileBlock(profile)}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            )}

            {/* UNASSIGNED STUDENTS - only appears if a student's org row
                is missing, so no student can silently vanish. */}
            {unassignedToShow.length > 0 && (
              <View>
                <Pressable
                  onPress={() => setUnassignedExpanded(prev => !prev)}
                  className="flex-row items-center justify-between px-6 py-4 bg-amber-50 hover:bg-amber-100"
                >
                  <View className="flex-row items-center gap-3 flex-1 flex-wrap">
                    <Text className="text-slate-500 text-sm">{unassignedOpen ? '▼' : '▶'}</Text>
                    <Text className="font-display font-semibold text-lg text-navy">⚠️ Unassigned Students</Text>
                    <Text className="text-xs text-slate-500">Their organization record is missing</Text>
                  </View>
                  <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {unassignedToShow.length} {unassignedToShow.length === 1 ? 'student' : 'students'}
                  </Text>
                </Pressable>

                {unassignedOpen && (
                  <View className="px-6 py-4">
                    <View className="space-y-3 gap-3">
                      {unassignedToShow.map(student => renderStudentRow(student))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
