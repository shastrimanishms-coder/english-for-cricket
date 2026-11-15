import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type StudentKind = 'auth' | 'sub_account';

export interface StudentIdentity {
  studentId: string;
  studentKind: StudentKind;
  displayName: string | null;
}

/**
 * Resolves who is currently learning on this device, across the app's two
 * identity spaces:
 *  - PIN students: no Supabase session; the authenticate_student RPC payload
 *    is stored in AsyncStorage as `student_session` (id = sub_accounts.id).
 *  - Email learners: a Supabase auth session; id = auth.users.id and the
 *    display name comes from user_profiles.
 * PIN session wins when both exist, mirroring learner/profile.tsx.
 * Returns null when nobody is signed in by either route.
 */
export async function getStudentIdentity(): Promise<StudentIdentity | null> {
  try {
    const studentStr = await AsyncStorage.getItem('student_session');
    if (studentStr) {
      const sessionData = JSON.parse(studentStr);
      const studentId = sessionData.id || sessionData.student_id;
      if (studentId) {
        return {
          studentId,
          studentKind: 'sub_account',
          displayName: sessionData.display_name || null,
        };
      }
    }
  } catch {
    // Corrupt/unreadable local blob: fall through to the auth session check.
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  let displayName: string | null = null;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('id', session.user.id)
    .maybeSingle();
  if (profile?.display_name) displayName = profile.display_name;

  return { studentId: session.user.id, studentKind: 'auth', displayName };
}
