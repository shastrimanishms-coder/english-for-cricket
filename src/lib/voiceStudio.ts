import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { StudentKind } from './studentIdentity';

/**
 * Voice Studio (migration 23): human voice recordings for the
 * learning path. Actors sign in with a username + password (no
 * Supabase session, exactly like PIN students) and work through the
 * line queue one line at a time; the admin reviews every take.
 *
 * Everything here fails soft: until Shastri runs migration 23 the
 * tables and RPCs do not exist, and every wrapper answers with its
 * "unavailable" result so screens can show a friendly "not set up
 * yet" message instead of crashing.
 */

export type VoiceCategory = 'M1' | 'F1' | 'B1' | 'G1';

export const VOICE_CATEGORIES: VoiceCategory[] = ['M1', 'F1', 'B1', 'G1'];

export const CATEGORY_LABELS: Record<VoiceCategory, string> = {
  M1: 'Adult man',
  F1: 'Adult woman',
  B1: 'Young man · Ken',
  G1: 'Young woman · Mira',
};

export type IntroStatus = 'pending' | 'submitted' | 'approved' | 'redo';

// ---------------------------------------------------------------- session

export interface ActorSession {
  actorId: string;
  username: string;
  displayName: string | null;
  voiceId: string | null;
  voiceName: string | null;
  voiceSlug: string | null;
  category: VoiceCategory | null;
  introText: string | null;
  introStatus: IntroStatus;
  introRedoReason: string | null;
  fromStage: number;
  toStage: number;
}

const ACTOR_SESSION_KEY = 'actor_session';

export async function getActorSession(): Promise<ActorSession | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTOR_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActorSession;
    return parsed && parsed.actorId ? parsed : null;
  } catch {
    // Corrupt/unreadable local blob: treat as signed out.
    return null;
  }
}

export async function saveActorSession(session: ActorSession): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTOR_SESSION_KEY, JSON.stringify(session));
  } catch {
    // A failed save only means the actor signs in again next time.
  }
}

export async function clearActorSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTOR_SESSION_KEY);
  } catch {
    // Nothing else to do - the session is gone either way on restart.
  }
}

// ------------------------------------------------------------------- RPCs

export type ActorAuthResult =
  | { status: 'ok'; session: ActorSession }
  | { status: 'invalid' }
  | { status: 'unavailable' };

/** Actor sign-in via the authenticate_actor RPC (migration 23). */
export async function authenticateActor(
  username: string,
  password: string
): Promise<ActorAuthResult> {
  try {
    const { data, error } = await supabase.rpc('authenticate_actor', {
      p_username: username.trim(),
      p_password: password,
    });
    if (error) return { status: 'unavailable' };
    if (!data) return { status: 'invalid' };
    const row = data as Record<string, unknown>;
    return {
      status: 'ok',
      session: {
        actorId: String(row.actor_id ?? ''),
        username: String(row.username ?? username.trim()),
        displayName: (row.display_name as string | null) ?? null,
        voiceId: (row.voice_id as string | null) ?? null,
        voiceName: (row.voice_name as string | null) ?? null,
        voiceSlug: (row.voice_slug as string | null) ?? null,
        category: (row.category as VoiceCategory | null) ?? null,
        introText: (row.intro_text as string | null) ?? null,
        introStatus: (row.intro_status as IntroStatus | null) ?? 'pending',
        introRedoReason: (row.intro_redo_reason as string | null) ?? null,
        fromStage: Number(row.from_stage ?? 1),
        toStage: Number(row.to_stage ?? 5),
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export interface ActorNextLine {
  lineId: number;
  text: string;
  type: string;
  ref: string;
  note: string;
  isRedo: boolean;
  redoReason: string | null;
}

export interface ActorQueue {
  voiceId: string;
  voiceName: string;
  category: VoiceCategory;
  introStatus: IntroStatus;
  total: number;
  done: number;
  approved: number;
  submitted: number;
  redo: number;
  next: ActorNextLine | null;
}

export type ActorNextResult =
  | { status: 'ok'; queue: ActorQueue }
  | { status: 'no_voice' }
  | { status: 'unavailable' };

/** The actor's progress counts + next line (redo lines come first). */
export async function getActorNext(actorId: string): Promise<ActorNextResult> {
  try {
    const { data, error } = await supabase.rpc('get_actor_next', {
      p_actor_id: actorId,
    });
    if (error || !data) return { status: 'unavailable' };
    const row = data as Record<string, unknown>;
    if (row.error) return { status: 'no_voice' };
    const rawNext = (row.next as Record<string, unknown> | null) ?? null;
    return {
      status: 'ok',
      queue: {
        voiceId: String(row.voice_id ?? ''),
        voiceName: String(row.voice_name ?? ''),
        category: (row.category as VoiceCategory) ?? 'M1',
        introStatus: (row.intro_status as IntroStatus | null) ?? 'pending',
        total: Number(row.total ?? 0),
        done: Number(row.done ?? 0),
        approved: Number(row.approved ?? 0),
        submitted: Number(row.submitted ?? 0),
        redo: Number(row.redo ?? 0),
        next: rawNext
          ? {
              lineId: Number(rawNext.line_id ?? 0),
              text: String(rawNext.text ?? ''),
              type: String(rawNext.type ?? ''),
              ref: String(rawNext.ref ?? ''),
              note: String(rawNext.note ?? ''),
              isRedo: Boolean(rawNext.is_redo),
              redoReason: (rawNext.redo_reason as string | null) ?? null,
            }
          : null,
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Register an uploaded line recording as submitted for review. */
export async function submitRecording(
  actorId: string,
  lineId: number,
  storagePath: string,
  durationMs: number | null
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('submit_recording', {
      p_actor_id: actorId,
      p_line_id: lineId,
      p_storage_path: storagePath,
      p_duration_ms: durationMs,
    });
    if (error || !data) return false;
    const row = data as Record<string, unknown>;
    return !row.error;
  } catch {
    return false;
  }
}

/** Register the uploaded introduction recording for the actor's voice. */
export async function submitIntro(actorId: string, storagePath: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('submit_intro', {
      p_actor_id: actorId,
      p_storage_path: storagePath,
    });
    if (error || !data) return false;
    const row = data as Record<string, unknown>;
    return !row.error;
  } catch {
    return false;
  }
}

export interface VoiceProgressRow {
  voiceId: string;
  voiceName: string;
  category: VoiceCategory;
  actorUsername: string | null;
  introStatus: IntroStatus;
  totalLines: number;
  recorded: number;
  approved: number;
  submitted: number;
  redo: number;
}

/**
 * Admin progress board (get_voice_progress RPC). Returns null when
 * the RPC is missing (migration not run) or the caller is not an
 * admin, so the panel can show its "not set up yet" state.
 */
export async function getVoiceProgress(): Promise<VoiceProgressRow[] | null> {
  try {
    const { data, error } = await supabase.rpc('get_voice_progress');
    if (error || !data) return null;
    return (data as Record<string, unknown>[]).map((row) => ({
      voiceId: String(row.voice_id ?? ''),
      voiceName: String(row.voice_name ?? ''),
      category: (row.category as VoiceCategory) ?? 'M1',
      actorUsername: (row.actor_username as string | null) ?? null,
      introStatus: (row.intro_status as IntroStatus | null) ?? 'pending',
      totalLines: Number(row.total_lines ?? 0),
      recorded: Number(row.recorded ?? 0),
      approved: Number(row.approved ?? 0),
      submitted: Number(row.submitted ?? 0),
      redo: Number(row.redo ?? 0),
    }));
  } catch {
    return null;
  }
}

/** Store the student's chosen named voice for one category. */
export async function setVoicePref(
  studentId: string,
  studentKind: StudentKind,
  category: VoiceCategory,
  voiceId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('set_voice_pref', {
      p_student_id: studentId,
      p_student_kind: studentKind,
      p_category: category,
      p_voice_id: voiceId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- storage

export const VOICE_BUCKET = 'voice-recordings';

/** Public playback URL for a storage path inside the voice bucket. */
export function getRecordingPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(VOICE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  webm: 'audio/webm',
  m4a: 'audio/m4a',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

/**
 * File extension for a finished take. The recorder's own URI wins
 * when it carries a real extension (native recordings do); web blob
 * URLs carry none, so fall back to the platform's recording format
 * (Chrome records webm, native records m4a).
 */
export function recordingFileExtension(localUri: string): string {
  if (localUri && !localUri.startsWith('blob:') && !localUri.startsWith('data:')) {
    const clean = localUri.split('?')[0].split('#')[0];
    const dot = clean.lastIndexOf('.');
    const ext = dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
    if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
  }
  return Platform.OS === 'web' ? 'webm' : 'm4a';
}

/**
 * Upload one take into the voice bucket at '<slug>/<fileName>',
 * replacing any earlier take at the same path. Mirrors the
 * BadgesManager upload pattern. Returns the storage path.
 */
export async function uploadRecording(
  slug: string,
  fileName: string,
  localUri: string
): Promise<string> {
  const storagePath = `${slug}/${fileName}`;
  let fileBody;
  if (Platform.OS === 'web') {
    const res = await fetch(localUri);
    fileBody = await res.blob();
  } else {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    fileBody = {
      uri: localUri,
      type: MIME_BY_EXTENSION[ext] ?? 'audio/m4a',
      name: fileName,
    } as any;
  }
  const { error } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(storagePath, fileBody, { upsert: true });
  if (error) throw error;
  return storagePath;
}

// ---------------------------------------------------------------- helpers

/** Storage-folder slug from a voice name: 'Mary Jane!' -> 'mary-jane'. */
export function slugifyVoiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The default introduction script for a voice, containing its name. */
export function defaultIntroText(name: string): string {
  const trimmed = name.trim();
  const greeting = trimmed ? `Hello! My name is ${trimmed}.` : 'Hello!';
  return `${greeting} I will be one of your English voices. Listen to me in your lessons, and let us learn English together!`;
}

/** One selectable voice, as shown in the student's profile picker. */
export interface VoiceOption {
  id: string;
  display_name: string;
  category: VoiceCategory;
  intro_path: string | null;
  intro_status: IntroStatus;
  sort_order: number;
}
