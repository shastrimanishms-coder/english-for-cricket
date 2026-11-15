import { useEffect, useRef } from 'react';
import { getStudentIdentity, type StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';

const FLUSH_INTERVAL_MS = 60_000;
// Segments shorter than this are treated as bounces and never recorded,
// matching the players' original unmount-only telemetry.
const MIN_SEGMENT_SECONDS = 10;

interface ActivityLoggerOptions {
  activityType: string;
  targetId?: string | null;
  enabled?: boolean;
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
 * Records time spent in a player screen (games, videos) into activity_logs
 * for BOTH identity kinds - the hook the players used to hand-roll, which
 * only ever worked for email learners.
 *
 * How it works:
 *  - A "segment" starts when the hook becomes active for a target.
 *  - Every 60 seconds, and again on unmount / target change, the segment
 *    is flushed via the log_activity RPC (migration 20261115000008).
 *  - A segment is only written once it reaches 10 seconds; shorter
 *    remainders keep accumulating (or are dropped on unmount).
 *  - Everything fails soft: no identity, a missing RPC, or a rejected
 *    write simply means that segment is not recorded.
 *
 * For auth identities the profile role is checked once: only
 * individual_learners generate telemetry, exactly as the players behaved
 * before this hook existed (managers/admins previewing content do not
 * pollute learner stats).
 */
export function useActivityLogger({ activityType, targetId, enabled = true }: ActivityLoggerOptions) {
  const identityRef = useRef<StudentIdentity | null>(null);
  const identityPromiseRef = useRef<Promise<StudentIdentity | null> | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const segmentRef = useRef<{ activityType: string; targetId: string | null } | null>(null);

  useEffect(() => {
    if (!enabled || !targetId) return;

    const resolveIdentity = async (): Promise<StudentIdentity | null> => {
      if (identityRef.current) return identityRef.current;
      if (!identityPromiseRef.current) {
        identityPromiseRef.current = (async () => {
          const identity = await getStudentIdentity();
          if (!identity) return null;
          if (identity.studentKind === 'auth') {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('role')
              .eq('id', identity.studentId)
              .maybeSingle();
            if (profile?.role !== 'individual_learner') return null;
          }
          return identity;
        })();
      }
      const resolved = await identityPromiseRef.current;
      identityRef.current = resolved;
      return resolved;
    };

    const flush = async (final: boolean) => {
      const start = segmentStartRef.current;
      const segment = segmentRef.current;
      if (start === null || !segment) return;

      const elapsed = Math.floor((Date.now() - start) / 1000);
      if (elapsed < MIN_SEGMENT_SECONDS) {
        // Too short to count. On a periodic flush the segment keeps
        // running; on unmount the remainder is dropped as a bounce.
        if (final) segmentStartRef.current = null;
        return;
      }

      // Claim the elapsed time before awaiting anything, so an interval
      // flush and the unmount flush can never double-count it.
      segmentStartRef.current = Date.now();
      const identity = await resolveIdentity();
      if (!identity) return;
      await writeActivity(identity, segment.activityType, segment.targetId, elapsed);
    };

    segmentRef.current = { activityType, targetId };
    segmentStartRef.current = Date.now();

    const interval = setInterval(() => {
      void flush(false);
    }, FLUSH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      void flush(true);
    };
  }, [activityType, targetId, enabled]);
}
