import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActiveTimeTracker, createActiveTimeEnvironment } from './activeTime';
import { getStudentIdentity, type StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';

interface ActivityLoggerOptions {
  activityType: string;
  targetId?: string | null;
  enabled?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * activity_logs.target_id is a uuid column (and log_activity's
 * p_target_id parameter is uuid too), so label-style targets the
 * screens use for whole-section streams ('speaking-practice', 'app')
 * must go over the wire as NULL — before Round 81 they were sent
 * as-is, the write was rejected, and speaking time silently never
 * landed. Section totals aggregate by activity_type, so nothing is
 * lost by nulling the label.
 */
function writableTargetId(targetId: string | null | undefined): string | null {
  return targetId && UUID_RE.test(targetId) ? targetId : null;
}

async function writeActivity(
  identity: StudentIdentity,
  activityType: string,
  targetId: string | null,
  durationSeconds: number
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_activity', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
      p_activity_type: activityType,
      p_target_id: targetId,
      p_duration_seconds: durationSeconds,
    });
    if (!error) return;

    // The RPC does not exist until migration 20261115000008 has been run
    // (or it rejected the call). Email learners keep the pre-RPC behaviour
    // of inserting into activity_logs directly, so their telemetry keeps
    // working either way. PIN students have no session the table's rules
    // can accept, so their segment is dropped until the RPC is live.
    if (identity.studentKind !== 'auth') return;
    const { error: insertError } = await supabase.from('activity_logs').insert([
      {
        student_id: identity.studentId,
        activity_type: activityType,
        target_id: targetId,
        duration_seconds: durationSeconds,
      },
    ]);
    if (insertError) {
      console.log('Activity not logged:', insertError.message);
    }
  } catch (error) {
    // Telemetry must never break the player.
    console.log('Activity logging failed:', error);
  }
}

/**
 * Records ACTIVE time spent in a screen into activity_logs for BOTH
 * identity kinds.
 *
 * Round 81 replaced the original wall-clock segments with the
 * active-time engine (src/lib/activeTime.ts): a second is recorded
 * only while the app is visible and focused AND the student has
 * interacted (tap, key, scroll, or a screen change) within the last
 * 60 seconds. Students leave accounts logged in and tabs open, so
 * anything else would report login duration, not learning time.
 * Accrued seconds flush through the log_activity RPC (migration
 * 20261115000008) in chunks of at most 30 seconds, plus a final
 * remainder of 10+ seconds when the screen closes or the target
 * changes; shorter remainders are dropped as bounces.
 *
 * For auth identities the profile role is checked (cached per
 * student id): only individual_learners generate telemetry
 * (managers/admins previewing content do not pollute learner stats).
 */
export function useActivityLogger({ activityType, targetId, enabled = true }: ActivityLoggerOptions) {
  // Learner-role verdicts for auth identities, cached per student id:
  // the role check costs a query, but the IDENTITY itself is resolved
  // fresh at every flush (see below), so this cache can never pin a
  // chunk to the wrong student — a different id misses the cache.
  const roleCheckRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const trackerRef = useRef<ActiveTimeTracker | null>(null);
  const pathname = usePathname();

  // A screen change is an interaction (the student is demonstrably
  // still here and using the app), on every platform.
  useEffect(() => {
    trackerRef.current?.noteInteraction();
  }, [pathname]);

  useEffect(() => {
    if (!enabled || !targetId) return;

    // Identity is resolved FRESH at every flush, never cached: the
    // whole-app logger lives in the root layout across logins, logouts
    // and account switches, so a cached identity would either pin the
    // stream to "nobody" (resolved before login) or — worse on a
    // shared device — keep writing the PREVIOUS student's time after
    // a switch. getStudentIdentity reads the current session each
    // time, so chunks always land on whoever is learning right now,
    // and are dropped while nobody is.
    const resolveIdentity = async (): Promise<StudentIdentity | null> => {
      const identity = await getStudentIdentity();
      if (!identity) return null;
      if (identity.studentKind === 'auth') {
        let check = roleCheckRef.current.get(identity.studentId);
        if (!check) {
          check = (async () => {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('role')
              .eq('id', identity.studentId)
              .maybeSingle();
            return profile?.role === 'individual_learner';
          })();
          roleCheckRef.current.set(identity.studentId, check);
        }
        if (!(await check)) return null;
      }
      return identity;
    };

    const segment = { activityType, targetId: writableTargetId(targetId) };
    const tracker = new ActiveTimeTracker({
      env: createActiveTimeEnvironment(),
      onFlush: (seconds) => {
        void (async () => {
          const identity = await resolveIdentity();
          if (!identity) return;
          await writeActivity(identity, segment.activityType, segment.targetId, seconds);
        })();
      },
    });
    trackerRef.current = tracker;
    tracker.start();

    return () => {
      // stop() emits the final remainder (>= 10s) through onFlush.
      tracker.stop();
      if (trackerRef.current === tracker) trackerRef.current = null;
    };
  }, [activityType, targetId, enabled]);
}
