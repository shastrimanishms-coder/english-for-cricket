import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetVoiceSessionCaches } from './lessonVoices';
import { supabase } from './supabase';

/**
 * Ends the current learner session completely — used by Log Out and
 * by Switch Account (Round 81, Part 3), which must behave identically
 * up to where they land:
 *  - the Supabase auth session is signed out (email/Google learners);
 *  - the PIN student's AsyncStorage session is removed (PIN students
 *    have no Supabase session, so without this they would stay
 *    effectively signed in on the device);
 *  - the voice resolver's session caches are cleared: its recording
 *    cache holds URLs resolved with the OUTGOING student's voice
 *    preferences, and on a shared device the next student must never
 *    inherit them.
 * Per-student AsyncStorage keys (voice narrator preference, placement
 * flags) are keyed by student id and need no clearing — they simply
 * resolve to the new student after the switch.
 */
export async function endCurrentSession(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // A failed network sign-out must not strand the local session.
  }
  try {
    await AsyncStorage.removeItem('student_session');
  } catch {
    // Nothing more can be done locally; routing onward is still right.
  }
  resetVoiceSessionCaches();
}
