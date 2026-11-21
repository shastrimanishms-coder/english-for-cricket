import { supabase } from './supabase';
import {
  deleteVoiceFile,
  recordingFileExtension,
  uploadRecording,
  type VoiceCategory,
} from './voiceStudio';

// ---------------------------------------------------------------------------
// Direct voice uploads from the admin dashboard (Speaking Practice
// conversations, Smart Reading articles).
//
// An admin upload becomes a completely ordinary Voice Studio
// recording: a voice_lines row for the sentence (created on first
// use), a voice_recordings row under the chosen named voice, and the
// audio file on the Lolipop server next to every studio take. That
// keeps ONE voice system: the student's chosen voice applies, the
// playback resolution finds these recordings with no special cases,
// and a studio actor re-recording the same line later simply takes
// over the same (line, voice) row through the usual review flow.
//
// Admin uploads are born 'approved' - the admin is the reviewer.
// Line ids for upload-created lines start at 19001, above every
// scripted block, so seed packs can never collide with them.
// ---------------------------------------------------------------------------

export interface NamedVoice {
  id: string;
  display_name: string;
  category: VoiceCategory;
  slug: string;
  actor_id: string | null;
}

export interface SentenceRecording {
  recordingId: string;
  voiceId: string;
  voiceName: string;
  category: VoiceCategory;
  storagePath: string;
  status: string;
}

let voicesCache: Promise<NamedVoice[]> | null = null;

/** All active named voices, for the upload picker (cached per session). */
export function listNamedVoices(): Promise<NamedVoice[]> {
  if (!voicesCache) {
    voicesCache = (async () => {
      const { data, error } = await supabase
        .from('voices')
        .select('id, display_name, category, slug, actor_id')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('display_name', { ascending: true });
      if (error) throw error;
      return (data || []) as NamedVoice[];
    })().catch((e) => {
      voicesCache = null;
      throw e;
    });
  }
  return voicesCache;
}

/** Every recording attached to a sentence's exact text, any voice. */
export async function getSentenceRecordings(
  text: string
): Promise<SentenceRecording[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const { data: lines, error: lineError } = await supabase
    .from('voice_lines')
    .select('id, category')
    .eq('text', trimmed);
  if (lineError) throw lineError;
  if (!lines || lines.length === 0) return [];
  const categoryByLine = new Map<number, VoiceCategory>(
    lines.map((l) => [l.id as number, l.category as VoiceCategory])
  );
  const { data: recs, error: recError } = await supabase
    .from('voice_recordings')
    .select('id, line_id, voice_id, storage_path, status')
    .in('line_id', lines.map((l) => l.id));
  if (recError) throw recError;
  const voices = await listNamedVoices();
  const nameByVoice = new Map(voices.map((v) => [v.id, v.display_name]));
  return (recs || []).map((r) => ({
    recordingId: r.id as string,
    voiceId: r.voice_id as string,
    voiceName: nameByVoice.get(r.voice_id as string) || 'Voice',
    category: categoryByLine.get(r.line_id as number) || 'M1',
    storagePath: r.storage_path as string,
    status: r.status as string,
  }));
}

async function ensureLineId(
  text: string,
  category: VoiceCategory,
  lineType: 'dialogue' | 'reading',
  refLabel: string
): Promise<number> {
  const { data: existing, error } = await supabase
    .from('voice_lines')
    .select('id')
    .eq('text', text)
    .eq('category', category)
    .limit(1);
  if (error) throw error;
  if (existing && existing.length > 0) return existing[0].id as number;
  const { data: maxRow } = await supabase
    .from('voice_lines')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextId = Math.max(((maxRow?.id as number) || 0) + 1, 19001);
  const { error: insertError } = await supabase.from('voice_lines').insert({
    id: nextId,
    category,
    type: lineType,
    text,
    ref: refLabel,
    stage: 0,
    module: 0,
    lesson: 0,
    note: 'Added by an admin voice upload.',
  });
  if (insertError) throw insertError;
  return nextId;
}

/**
 * Upload an audio file as the given voice's recording of a sentence,
 * replacing any earlier take by the same voice. Returns the updated
 * recording list for the sentence.
 */
export async function attachUploadedVoice(params: {
  voice: NamedVoice;
  text: string;
  lineType: 'dialogue' | 'reading';
  refLabel: string;
  localUri: string;
}): Promise<SentenceRecording[]> {
  const text = params.text.trim();
  const lineId = await ensureLineId(
    text,
    params.voice.category,
    params.lineType,
    params.refLabel
  );
  const ext = recordingFileExtension(params.localUri);
  const storagePath = await uploadRecording(
    params.voice.slug,
    `${lineId}.${ext}`,
    params.localUri
  );
  const { data: existing } = await supabase
    .from('voice_recordings')
    .select('id, storage_path')
    .eq('line_id', lineId)
    .eq('voice_id', params.voice.id)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('voice_recordings')
      .update({
        storage_path: storagePath,
        status: 'approved',
        redo_reason: null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw error;
    if (existing.storage_path !== storagePath) {
      // A different file extension leaves the old take behind; remove
      // it so the server only ever holds the live take.
      await deleteVoiceFile(existing.storage_path as string).catch(() => {});
    }
  } else {
    const { error } = await supabase.from('voice_recordings').insert({
      line_id: lineId,
      voice_id: params.voice.id,
      actor_id: params.voice.actor_id,
      storage_path: storagePath,
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
  return getSentenceRecordings(text);
}

/** Remove one voice's recording of a sentence (row + audio file). */
export async function removeSentenceVoice(
  recording: SentenceRecording,
  text: string
): Promise<SentenceRecording[]> {
  const { error } = await supabase
    .from('voice_recordings')
    .delete()
    .eq('id', recording.recordingId);
  if (error) throw error;
  await deleteVoiceFile(recording.storagePath).catch(() => {});
  return getSentenceRecordings(text);
}

/** How many of the given sentences have at least one approved recording. */
export async function countCoveredSentences(
  texts: string[]
): Promise<{ covered: number; total: number }> {
  const wanted = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  if (wanted.length === 0) return { covered: 0, total: 0 };
  const { data: lines, error } = await supabase
    .from('voice_lines')
    .select('id, text')
    .in('text', wanted);
  if (error || !lines || lines.length === 0) {
    return { covered: 0, total: wanted.length };
  }
  const textByLine = new Map<number, string>(
    lines.map((l) => [l.id as number, l.text as string])
  );
  const { data: recs } = await supabase
    .from('voice_recordings')
    .select('line_id')
    .in('line_id', lines.map((l) => l.id))
    .eq('status', 'approved');
  const coveredTexts = new Set(
    (recs || []).map((r) => textByLine.get(r.line_id as number))
  );
  return { covered: coveredTexts.size, total: wanted.length };
}
