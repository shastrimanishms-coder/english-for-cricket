import { supabase } from './supabase';
import { toSpeechText } from './speechCue';
import {
  getRecordingPublicUrl,
  type VoiceCategory,
} from './voiceStudio';
import type { StudentIdentity } from './studentIdentity';

// ---------------------------------------------------------------------------
// Human-voice playback resolution.
//
// The Voice Studio stores one row per script line in voice_lines (the
// line's exact text and its voice category), and approved recordings in
// voice_recordings. Playback anywhere in the app resolves through the
// get_voice_line_audio RPC: given a line's exact text and category it
// returns the approved recording's storage path, preferring the
// student's chosen named voice for that category.
//
// This module keeps three session-level caches so lessons do not pay
// the lookup cost on every slide:
//   - the line index: cleaned text -> the line's raw text + category
//     (cleaned with the same toSpeechText the speakers use, so slide
//     text with emoji or gap blanks still matches its script line);
//   - recording resolutions: category + raw text -> public URL | none;
//   - the active map: the current screen's cleaned text -> URL, which
//     the speech engine consults before falling back to the device
//     voice. Screens set it on entry and clear it on exit.
//
// Everything fails soft: any error simply leaves the device voice in
// charge, exactly as before this module existed.
// ---------------------------------------------------------------------------

export type VoicePrefs = Partial<Record<VoiceCategory, string>>;

interface LineEntry {
  raw: string;
  category: VoiceCategory;
}

let lineIndex: Map<string, LineEntry[]> | null = null;
let lineIndexPromise: Promise<void> | null = null;

async function ensureLineIndex(): Promise<void> {
  if (lineIndex) return;
  if (!lineIndexPromise) {
    lineIndexPromise = (async () => {
      const map = new Map<string, LineEntry[]>();
      const PAGE = 1000;
      // 18k+ small rows; fetch in parallel batches of pages.
      for (let from = 0; ; from += PAGE * 6) {
        const pages = await Promise.all(
          Array.from({ length: 6 }, (_, i) => {
            const start = from + i * PAGE;
            return supabase
              .from('voice_lines')
              .select('text, category')
              .range(start, start + PAGE - 1);
          })
        );
        let any = false;
        for (const { data, error } of pages) {
          if (error || !data) continue;
          if (data.length > 0) any = true;
          for (const row of data as { text: string; category: VoiceCategory }[]) {
            const key = toSpeechText(row.text);
            if (!key) continue;
            const entries = map.get(key) || [];
            // One raw text per (cleaned text, category) is enough: the
            // RPC matches on the raw text, and duplicates clean to the
            // same spoken line.
            if (!entries.some((e) => e.category === row.category)) {
              entries.push({ raw: row.text, category: row.category });
              map.set(key, entries);
            }
          }
        }
        if (!any) break;
      }
      lineIndex = map;
    })().catch(() => {
      // A failed index load must never break a lesson: leave the map
      // unset so a later screen can try again.
      lineIndexPromise = null;
    });
  }
  await lineIndexPromise;
}

const recordingCache = new Map<string, string | null>();

async function recordingUrlFor(
  entry: LineEntry,
  preferredVoiceId: string | null
): Promise<string | null> {
  const cacheKey = `${entry.category}|${entry.raw}`;
  const cached = recordingCache.get(cacheKey);
  if (cached !== undefined) {
    // A cached hit was resolved with someone's preference; the RPC's
    // own ordering already prefers the student's voice only when the
    // caller passes it, so a cached URL is reused as-is. A cached
    // "none" is final for the session: recordings appear over time,
    // but re-checking every lesson would cost a call per line.
    return cached;
  }
  try {
    const { data, error } = await supabase.rpc('get_voice_line_audio', {
      p_text: entry.raw,
      p_category: entry.category,
      p_voice_id: preferredVoiceId,
    });
    const url =
      !error && typeof data === 'string' && data
        ? getRecordingPublicUrl(data)
        : null;
    recordingCache.set(cacheKey, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Resolve a batch of spoken texts to recording URLs. Returns a map of
 * cleaned text -> public audio URL for every text that has an approved
 * recording; texts without one are simply absent (device voice).
 * `preferred` lists the categories to try first for this context (for
 * a lesson, its model and "you" voices by module parity).
 */
export async function resolveVoicesForTexts(
  texts: (string | null | undefined)[],
  prefs: VoicePrefs,
  preferred: VoiceCategory[] = []
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    await ensureLineIndex();
    if (!lineIndex) return out;
    const jobs: Promise<void>[] = [];
    const seen = new Set<string>();
    for (const text of texts) {
      const key = toSpeechText(text || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entries = lineIndex.get(key);
      if (!entries || entries.length === 0) continue;
      const ordered = [
        ...preferred
          .map((cat) => entries.find((e) => e.category === cat))
          .filter((e): e is LineEntry => !!e),
        ...entries.filter((e) => !preferred.includes(e.category)),
      ];
      jobs.push(
        (async () => {
          for (const entry of ordered) {
            const url = await recordingUrlFor(
              entry,
              prefs[entry.category] ?? null
            );
            if (url) {
              out.set(key, url);
              return;
            }
          }
        })()
      );
    }
    await Promise.all(jobs);
  } catch {
    // Resolution is a nicety; the device voice covers any failure.
  }
  return out;
}

// ------------------------------------------------------------ active map

let activeVoiceMap: Map<string, string> | null = null;

/** The current screen's resolved voices (cleaned text -> audio URL). */
export function setActiveVoiceMap(map: Map<string, string> | null): void {
  activeVoiceMap = map;
}

/** Recording URL for a text about to be spoken, or null for TTS. */
export function voiceUrlForText(text: string | null | undefined): string | null {
  if (!activeVoiceMap || !text) return null;
  return activeVoiceMap.get(toSpeechText(text)) ?? null;
}

// ------------------------------------------------------- resolution gate
//
// Screens that start speaking the moment they open (Smart Reading's
// narration, Speaking Practice's conversation) must not mistake
// "the lookup is still running" for "no recording exists": the
// synchronous voiceUrlForText returns null in both cases, so the
// first line came out in the device voice while later lines — read
// after the map had landed — used the recording. A tracked
// resolution closes that race. Beginning one flips the gate to
// pending SYNCHRONOUSLY (before any await), the opening lines
// resolve first and publish their map, then the full set follows.
// The gate for a text stays closed until its lookup has genuinely
// completed — the first batch settling covers the opening lines,
// the full settle covers the remainder — and only then may a
// screen fall back to the device voice for that text. Safety
// timers open the gate even if the network stalls outright (8s
// for the opening lines, 20s for the rest): a genuinely dead
// lookup must not freeze a screen, and the real resolution still
// publishes its map when it lands, so later lines pick the
// recordings up.

/** How many opening lines resolve (and publish) before the rest. */
export const FIRST_VOICE_BATCH = 6;

let gateSeq = 0;
let gateFirstSettled = true;
let gateAllSettled = true;
let gateFirstResolve: (() => void) | null = null;
let gateAllResolve: (() => void) | null = null;
let gateFirstPromise: Promise<void> = Promise.resolve();
let gateAllPromise: Promise<void> = Promise.resolve();
let gateFirstTimer: ReturnType<typeof setTimeout> | null = null;
let gateAllTimer: ReturnType<typeof setTimeout> | null = null;

export interface ActiveVoiceResolution {
  /** Resolves when the opening lines' lookups have completed. */
  firstReady: Promise<void>;
  /** Resolves when every line's lookup has completed. */
  settled: Promise<void>;
}

function flipGate(seq: number, first: boolean): void {
  if (seq !== gateSeq) return;
  if (!gateFirstSettled) {
    gateFirstSettled = true;
    gateFirstResolve?.();
  }
  if (!first && !gateAllSettled) {
    gateAllSettled = true;
    gateAllResolve?.();
  }
}

function clearGateTimers(): void {
  if (gateFirstTimer) clearTimeout(gateFirstTimer);
  if (gateAllTimer) clearTimeout(gateAllTimer);
  gateFirstTimer = null;
  gateAllTimer = null;
}

/**
 * Begin a tracked resolution for the screen now opening. The gate
 * flips to pending synchronously, so a playback effect running
 * later in the same commit already sees it closed. Returns the
 * sequence token runActiveVoiceResolution expects.
 */
export function beginActiveVoiceResolution(): number {
  const seq = ++gateSeq;
  gateFirstSettled = false;
  gateAllSettled = false;
  gateFirstPromise = new Promise((resolve) => {
    gateFirstResolve = resolve;
  });
  gateAllPromise = new Promise((resolve) => {
    gateAllResolve = resolve;
  });
  clearGateTimers();
  gateFirstTimer = setTimeout(() => flipGate(seq, true), 8000);
  gateAllTimer = setTimeout(() => flipGate(seq, false), 20000);
  return seq;
}

/**
 * Run the two-phase resolution begun by beginActiveVoiceResolution:
 * the first FIRST_VOICE_BATCH texts resolve and publish first,
 * then the full set (whose per-line lookups reuse the session
 * caches, so the opening lines cost nothing twice).
 */
export function runActiveVoiceResolution(
  seq: number,
  texts: (string | null | undefined)[],
  prefs: VoicePrefs,
  preferred: VoiceCategory[] = []
): ActiveVoiceResolution {
  void resolveVoicesForTexts(texts.slice(0, FIRST_VOICE_BATCH), prefs, preferred)
    .then((map) => {
      if (seq === gateSeq) setActiveVoiceMap(map);
    })
    .catch(() => {})
    .finally(() => {
      if (gateFirstTimer) clearTimeout(gateFirstTimer);
      gateFirstTimer = null;
      flipGate(seq, true);
    });
  void resolveVoicesForTexts(texts, prefs, preferred)
    .then((map) => {
      if (seq === gateSeq) setActiveVoiceMap(map);
    })
    .catch(() => {})
    .finally(() => {
      if (gateAllTimer) clearTimeout(gateAllTimer);
      gateAllTimer = null;
      flipGate(seq, false);
    });
  return { firstReady: gateFirstPromise, settled: gateAllPromise };
}

/**
 * True while the lookup for this text has not genuinely completed:
 * the opening batch is still running, or this text has no recording
 * in the published map yet while the full resolution is still
 * running (its recording may simply not have landed yet). Playback
 * must wait rather than fall back to the device voice.
 */
export function voiceGatePendingFor(text: string | null | undefined): boolean {
  if (!gateFirstSettled) return true;
  if (gateAllSettled) return false;
  return voiceUrlForText(text) == null;
}

/** Abandon any tracked resolution and clear the active map (screen exit). */
export function clearActiveVoiceResolution(): void {
  gateSeq++;
  clearGateTimers();
  gateFirstSettled = true;
  gateAllSettled = true;
  gateFirstResolve?.();
  gateAllResolve?.();
  gateFirstResolve = null;
  gateAllResolve = null;
  setActiveVoiceMap(null);
}

// ---------------------------------------------------------------- prefs

/**
 * The student's chosen named voices, via the get_voice_prefs RPC
 * (migration 26). Until that migration is run — or for any other
 * failure — this returns an empty set, and playback simply uses the
 * first approved voice in each category.
 */
export async function fetchVoicePrefs(
  identity: StudentIdentity
): Promise<VoicePrefs> {
  try {
    const { data, error } = await supabase.rpc('get_voice_prefs', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
    });
    if (error || !data || typeof data !== 'object') return {};
    return data as VoicePrefs;
  } catch {
    return {};
  }
}
