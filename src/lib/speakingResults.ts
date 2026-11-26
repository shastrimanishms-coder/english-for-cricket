import { supabase } from './supabase';
import type { StudentIdentity } from './studentIdentity';

/**
 * Speaking line results (Round 82) — the write side of
 * public.speaking_line_results (migration 35).
 *
 * PRIVACY — what is stored, and what is NEVER stored:
 * Each record holds only the SCORE the app's own scorer produced
 * and OUR OWN curriculum phrase the learner was asked to say (plus
 * the ids the manager report needs to group attempts into sessions
 * and name the conversation). The recognised transcript of what the
 * child actually said is used on the device to compute the score
 * and is then discarded — it is never sent to the database, and no
 * audio is recorded or stored anywhere by this feature.
 *
 * Recording is fire-and-forget by design: a failed write (offline,
 * migration 35 not run yet, unknown identity) must never block or
 * break the conversation, so every failure is swallowed here.
 */

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when an id is a real uuid (database scenario ids are; the
 * built-in starter scenarios use slug ids and record NULL). */
export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_SHAPE.test(value);
}

/** A fresh session id for one play of a conversation / lines run. */
export function newSpeakingSessionId(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SpeakingLineRecord {
  sessionId: string;
  /** Database scenario id, or null for built-in scenarios / lesson lines. */
  scenarioId: string | null;
  scenarioTitle: string | null;
  lineIndex: number;
  /** OUR curriculum phrase the learner was asked to say. */
  targetText: string;
  /** The scorer's 0–100 accuracy for this attempt. */
  score: number;
}

/**
 * The exact argument object sent to record_speaking_line(). Kept as
 * a pure function so the verification rig can assert the payload
 * shape — in particular that it contains NO transcript field.
 */
export function buildSpeakingLineArgs(identity: StudentIdentity, record: SpeakingLineRecord) {
  return {
    p_student_id: identity.studentId,
    p_student_kind: identity.studentKind,
    p_session_id: record.sessionId,
    p_scenario_id: isUuid(record.scenarioId) ? record.scenarioId : null,
    p_scenario_title: record.scenarioTitle,
    p_line_index: record.lineIndex,
    p_target_text: record.targetText,
    p_score: Math.round(record.score),
  };
}

/** Fire-and-forget: records one scored learner-line attempt. */
export function recordSpeakingLine(identity: StudentIdentity | null, record: SpeakingLineRecord): void {
  if (!identity || !record.targetText) return;
  void (async () => {
    try {
      await supabase.rpc('record_speaking_line', buildSpeakingLineArgs(identity, record));
    } catch {
      // Best-effort only — speaking practice never depends on it.
    }
  })();
}
