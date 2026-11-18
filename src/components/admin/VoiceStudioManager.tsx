import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showAlert } from '../../lib/showAlert';
import { supabase } from '../../lib/supabase';
import {
  CATEGORY_LABELS,
  VOICE_CATEGORIES,
  defaultIntroText,
  getRecordingPublicUrl,
  getVoiceProgress,
  slugifyVoiceName,
  type IntroStatus,
  type VoiceCategory,
  type VoiceProgressRow,
} from '../../lib/voiceStudio';

/**
 * Voice Studio admin panel (migration 23): progress per voice, the
 * review queue for submitted takes and introductions, and the
 * actor/voice management forms. All table access runs under the
 * admin's own session, guarded by the is_admin() RLS policies.
 * Until the migration is run, the panel shows a "not set up" notice
 * instead of failing.
 */

interface ActorRow {
  id: string;
  username: string;
  password: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface VoiceRow {
  id: string;
  slug: string;
  display_name: string;
  category: VoiceCategory;
  actor_id: string | null;
  intro_text: string;
  intro_path: string | null;
  intro_status: IntroStatus;
  intro_redo_reason: string | null;
  from_stage: number;
  to_stage: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

interface ReviewRow {
  id: string;
  line_id: number;
  storage_path: string;
  take_count: number;
  duration_ms: number | null;
  created_at: string;
  lineText: string;
  lineRef: string;
  lineType: string;
  voiceName: string;
}

const REDO_REASONS = [
  'Too quiet',
  'Wrong word',
  'Too fast',
  'Too slow',
  'Background noise',
  'Other',
];

const INTRO_STATUS_STYLES: Record<IntroStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  submitted: 'bg-gold-light text-gold-dark',
  approved: 'bg-pitch-light text-pitch-dark',
  redo: 'bg-red-50 text-red-700',
};

function joined(value: any): any {
  return Array.isArray(value) ? value[0] : value;
}

/** Play/pause for one submitted recording (public bucket URL). */
function ReviewPlayer({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      if (status.duration > 0 && status.currentTime >= status.duration - 0.1) {
        void player.seekTo(0);
      }
      player.play();
    } catch {
      // Playback is best-effort in the review list.
    }
  };

  return (
    <Pressable
      onPress={toggle}
      className="rounded-full bg-navy px-4 py-2 active:opacity-90"
    >
      <Text className="font-sans text-sm font-bold text-white">
        {status.playing ? '⏸ Pause' : '▶ Play'}
      </Text>
    </Pressable>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="rounded-[20px] border border-inkline bg-white p-6 shadow-sm">
      <Text className="mb-4 font-display text-xl font-semibold text-navy">
        {title}
      </Text>
      {children}
    </View>
  );
}

const inputClass =
  'w-full rounded-xl border border-inkline bg-canvas p-3.5 font-sans text-navy';
const labelClass = 'mb-2 font-sans text-sm font-bold text-slate-700';

export default function VoiceStudioManager() {
  const [loading, setLoading] = useState(true);
  const [notSetUp, setNotSetUp] = useState(false);
  const [progress, setProgress] = useState<VoiceProgressRow[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewRow[]>([]);
  const [actors, setActors] = useState<ActorRow[]>([]);
  const [voices, setVoices] = useState<VoiceRow[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  // Send-back state for line recordings
  const [redoTargetId, setRedoTargetId] = useState<string | null>(null);
  const [redoChip, setRedoChip] = useState(REDO_REASONS[0]);
  const [redoNote, setRedoNote] = useState('');

  // Send-back state for introductions
  const [introRedoId, setIntroRedoId] = useState<string | null>(null);
  const [introRedoReason, setIntroRedoReason] = useState('');

  // New actor form
  const [actorUsername, setActorUsername] = useState('');
  const [actorPassword, setActorPassword] = useState('');
  const [actorDisplayName, setActorDisplayName] = useState('');
  const [savingActor, setSavingActor] = useState(false);

  // Voice form (create + edit)
  const [editVoiceId, setEditVoiceId] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState('');
  const [voiceSlug, setVoiceSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [voiceCategory, setVoiceCategory] = useState<VoiceCategory>('F1');
  const [voiceActorId, setVoiceActorId] = useState<string | null>(null);
  const [fromStage, setFromStage] = useState('1');
  const [toStage, setToStage] = useState('5');
  const [introText, setIntroText] = useState('');
  const [introTouched, setIntroTouched] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [progressRows, voicesRes, actorsRes, reviewRes] = await Promise.all([
        getVoiceProgress(),
        supabase
          .from('voices')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('voice_actors')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('voice_recordings')
          .select(
            'id, line_id, voice_id, storage_path, take_count, duration_ms, created_at, voice_lines ( text, ref, type ), voices ( display_name )'
          )
          .eq('status', 'submitted')
          .order('created_at', { ascending: true })
          .limit(100),
      ]);

      setNotSetUp(
        progressRows === null && !!voicesRes.error && !!actorsRes.error
      );
      setProgress(progressRows ?? []);
      if (!voicesRes.error) setVoices((voicesRes.data ?? []) as VoiceRow[]);
      if (!actorsRes.error) setActors((actorsRes.data ?? []) as ActorRow[]);
      if (!reviewRes.error) {
        const rows = ((reviewRes.data ?? []) as any[]).map((row) => {
          const line = joined(row.voice_lines) ?? {};
          const voice = joined(row.voices) ?? {};
          return {
            id: row.id,
            line_id: row.line_id,
            storage_path: row.storage_path,
            take_count: row.take_count ?? 1,
            duration_ms: row.duration_ms ?? null,
            created_at: row.created_at,
            lineText: line.text ?? '',
            lineRef: line.ref ?? '',
            lineType: line.type ?? '',
            voiceName: voice.display_name ?? '',
          } as ReviewRow;
        });
        setReviewQueue(rows);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadAll();
    })();
  }, [loadAll]);

  // ------------------------------------------------------------ reviews

  const approveRecording = async (row: ReviewRow) => {
    setActingId(row.id);
    try {
      const { error } = await supabase
        .from('voice_recordings')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      await loadAll();
    } catch (error: any) {
      showAlert('Approve failed', error.message);
    } finally {
      setActingId(null);
    }
  };

  const sendBackRecording = async (row: ReviewRow) => {
    const reason = redoNote.trim() ? `${redoChip} — ${redoNote.trim()}` : redoChip;
    setActingId(row.id);
    try {
      const { error } = await supabase
        .from('voice_recordings')
        .update({
          status: 'redo',
          redo_reason: reason,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) throw error;
      setRedoTargetId(null);
      setRedoNote('');
      setRedoChip(REDO_REASONS[0]);
      await loadAll();
    } catch (error: any) {
      showAlert('Send back failed', error.message);
    } finally {
      setActingId(null);
    }
  };

  const approveIntro = async (voice: VoiceRow) => {
    setActingId(voice.id);
    try {
      const { error } = await supabase
        .from('voices')
        .update({ intro_status: 'approved' })
        .eq('id', voice.id);
      if (error) throw error;
      await loadAll();
    } catch (error: any) {
      showAlert('Approve failed', error.message);
    } finally {
      setActingId(null);
    }
  };

  const sendBackIntro = async (voice: VoiceRow) => {
    if (!introRedoReason.trim()) {
      showAlert('Reason needed', 'Please say what to fix, so the actor knows what to change.');
      return;
    }
    setActingId(voice.id);
    try {
      const { error } = await supabase
        .from('voices')
        .update({ intro_status: 'redo', intro_redo_reason: introRedoReason.trim() })
        .eq('id', voice.id);
      if (error) throw error;
      setIntroRedoId(null);
      setIntroRedoReason('');
      await loadAll();
    } catch (error: any) {
      showAlert('Send back failed', error.message);
    } finally {
      setActingId(null);
    }
  };

  // ------------------------------------------------------------- actors

  const createActor = async () => {
    if (!actorUsername.trim() || !actorPassword) {
      showAlert('Missing fields', 'A username and a password are both required.');
      return;
    }
    setSavingActor(true);
    try {
      const { error } = await supabase.from('voice_actors').insert([
        {
          username: actorUsername.trim(),
          password: actorPassword,
          display_name: actorDisplayName.trim() || null,
        },
      ]);
      if (error) throw error;
      setActorUsername('');
      setActorPassword('');
      setActorDisplayName('');
      await loadAll();
    } catch (error: any) {
      showAlert('Could not create actor', error.message);
    } finally {
      setSavingActor(false);
    }
  };

  const toggleActorActive = async (actor: ActorRow) => {
    setActingId(actor.id);
    try {
      const { error } = await supabase
        .from('voice_actors')
        .update({ is_active: !actor.is_active })
        .eq('id', actor.id);
      if (error) throw error;
      await loadAll();
    } catch (error: any) {
      showAlert('Update failed', error.message);
    } finally {
      setActingId(null);
    }
  };

  // ------------------------------------------------------------- voices

  const handleVoiceNameChange = (value: string) => {
    setVoiceName(value);
    if (!slugTouched) setVoiceSlug(slugifyVoiceName(value));
    if (!introTouched) setIntroText(defaultIntroText(value));
  };

  const resetVoiceForm = () => {
    setEditVoiceId(null);
    setVoiceName('');
    setVoiceSlug('');
    setSlugTouched(false);
    setVoiceCategory('F1');
    setVoiceActorId(null);
    setFromStage('1');
    setToStage('5');
    setIntroText('');
    setIntroTouched(false);
  };

  const startEditVoice = (voice: VoiceRow) => {
    setEditVoiceId(voice.id);
    setVoiceName(voice.display_name);
    setVoiceSlug(voice.slug);
    setSlugTouched(true);
    setVoiceCategory(voice.category);
    setVoiceActorId(voice.actor_id);
    setFromStage(String(voice.from_stage));
    setToStage(String(voice.to_stage));
    setIntroText(voice.intro_text);
    setIntroTouched(true);
  };

  const clampStage = (raw: string, fallback: number) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(5, Math.max(1, parsed));
  };

  const saveVoice = async () => {
    if (!voiceName.trim() || !voiceSlug.trim()) {
      showAlert('Missing fields', 'The voice needs a name and a folder slug.');
      return;
    }
    const from = clampStage(fromStage, 1);
    const to = clampStage(toStage, 5);
    if (to < from) {
      showAlert('Stage window', 'The “to stage” cannot be before the “from stage”.');
      return;
    }
    setSavingVoice(true);
    try {
      const payload = {
        display_name: voiceName.trim(),
        slug: voiceSlug.trim(),
        category: voiceCategory,
        actor_id: voiceActorId,
        from_stage: from,
        to_stage: to,
        intro_text: introText.trim() || defaultIntroText(voiceName),
      };
      if (editVoiceId) {
        const { error } = await supabase
          .from('voices')
          .update(payload)
          .eq('id', editVoiceId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('voices')
          .insert([{ ...payload, is_active: true }]);
        if (error) throw error;
      }
      resetVoiceForm();
      await loadAll();
    } catch (error: any) {
      showAlert('Could not save voice', error.message);
    } finally {
      setSavingVoice(false);
    }
  };

  const toggleVoiceActive = async (voice: VoiceRow) => {
    setActingId(voice.id);
    try {
      const { error } = await supabase
        .from('voices')
        .update({ is_active: !voice.is_active })
        .eq('id', voice.id);
      if (error) throw error;
      await loadAll();
    } catch (error: any) {
      showAlert('Update failed', error.message);
    } finally {
      setActingId(null);
    }
  };

  const actorNameById = (id: string | null) =>
    actors.find((a) => a.id === id)?.username ?? null;

  const submittedIntros = voices.filter(
    (v) => v.intro_status === 'submitted' && v.intro_path
  );

  if (loading) {
    return (
      <View className="items-center justify-center py-24">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="gap-6">
      <View>
        <Text className="font-display text-3xl font-semibold capitalize text-navy">
          Voice Studio
        </Text>
        <Text className="mt-1 font-sans text-sm text-slate-500">
          Real voices for the lessons: create actor accounts, review their
          recordings, and follow the progress of each voice.
        </Text>
      </View>

      {notSetUp ? (
        <View className="rounded-[20px] border border-gold bg-gold-light/60 p-6">
          <Text className="font-display text-xl font-semibold text-navy">
            Voice Studio is not set up yet
          </Text>
          <Text className="mt-2 font-sans text-sm text-slate-600">
            The database migration for the Voice Studio (migration 23) has not
            been run yet, so there are no actor accounts, voices or recordings
            to manage. Run the migration, then reload this page.
          </Text>
        </View>
      ) : null}

      {/* ------------------------------------------------ progress board */}
      <SectionCard title="Progress by voice">
        {progress.length === 0 ? (
          <Text className="font-sans text-sm text-slate-500">
            No voices yet. Create an actor and a voice below to get started.
          </Text>
        ) : (
          <View className="gap-3">
            {progress.map((row) => {
              const pct =
                row.totalLines > 0
                  ? Math.round((row.recorded / row.totalLines) * 100)
                  : 0;
              return (
                <View
                  key={row.voiceId}
                  className="rounded-xl border border-inkline bg-canvas p-4"
                >
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="font-sans text-base font-bold text-navy">
                      {row.voiceName}
                    </Text>
                    <View className="rounded-full bg-navy px-2.5 py-0.5">
                      <Text className="font-sans text-[11px] font-bold text-gold">
                        {row.category} · {CATEGORY_LABELS[row.category]}
                      </Text>
                    </View>
                    <View
                      className={`rounded-full px-2.5 py-0.5 ${INTRO_STATUS_STYLES[row.introStatus]}`}
                    >
                      <Text className="font-sans text-[11px] font-bold">
                        Intro: {row.introStatus}
                      </Text>
                    </View>
                    <Text className="font-sans text-xs text-slate-400">
                      {row.actorUsername
                        ? `Actor: ${row.actorUsername}`
                        : 'No actor linked'}
                    </Text>
                  </View>
                  <View className="mt-3 flex-row items-center justify-between">
                    <Text className="font-sans text-sm font-bold text-navy">
                      {row.recorded} of {row.totalLines} lines recorded
                    </Text>
                    <Text className="font-sans text-sm text-slate-500">{pct}%</Text>
                  </View>
                  <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                    <View
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                  <View className="mt-3 flex-row flex-wrap gap-2">
                    <Text className="rounded-full bg-pitch-light px-3 py-1 font-sans text-xs font-bold text-pitch-dark">
                      ✓ Approved: {row.approved}
                    </Text>
                    <Text className="rounded-full bg-gold-light px-3 py-1 font-sans text-xs font-bold text-gold-dark">
                      ⏳ Waiting: {row.submitted}
                    </Text>
                    <Text className="rounded-full bg-red-50 px-3 py-1 font-sans text-xs font-bold text-red-700">
                      ↩ To re-record: {row.redo}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>

      {/* -------------------------------------------------- review queue */}
      <SectionCard title={`Review queue (${reviewQueue.length})`}>
        {reviewQueue.length === 0 ? (
          <Text className="font-sans text-sm text-slate-500">
            Nothing waiting. Submitted recordings will appear here for a
            listen before they can be used in lessons.
          </Text>
        ) : (
          <View className="gap-3">
            {reviewQueue.map((row) => (
              <View
                key={row.id}
                className="rounded-xl border border-inkline bg-canvas p-4"
              >
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="font-sans text-xs font-bold uppercase tracking-wide text-gold-dark">
                    {row.lineRef}
                  </Text>
                  <View className="rounded-full bg-navy/5 px-2.5 py-0.5">
                    <Text className="font-sans text-[11px] font-bold capitalize text-navy">
                      {row.lineType}
                    </Text>
                  </View>
                  <Text className="font-sans text-xs text-slate-400">
                    {row.voiceName} · Take {row.take_count}
                    {row.duration_ms
                      ? ` · ${(row.duration_ms / 1000).toFixed(1)}s`
                      : ''}
                  </Text>
                </View>
                <Text className="mt-2 font-sans text-base font-semibold text-navy">
                  {row.lineText}
                </Text>
                <View className="mt-3 flex-row flex-wrap items-center gap-2">
                  <ReviewPlayer url={getRecordingPublicUrl(row.storage_path)} />
                  <Pressable
                    onPress={() => void approveRecording(row)}
                    disabled={actingId === row.id}
                    className="rounded-full bg-pitch px-4 py-2 active:opacity-90"
                  >
                    <Text className="font-sans text-sm font-bold text-white">
                      ✓ Approve
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setRedoTargetId(redoTargetId === row.id ? null : row.id)
                    }
                    disabled={actingId === row.id}
                    className="rounded-full border border-red-200 bg-white px-4 py-2 active:opacity-90"
                  >
                    <Text className="font-sans text-sm font-bold text-red-700">
                      ↩ Send back
                    </Text>
                  </Pressable>
                </View>

                {redoTargetId === row.id ? (
                  <View className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <Text className={labelClass}>What should the actor fix?</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {REDO_REASONS.map((reason) => (
                        <Pressable
                          key={reason}
                          onPress={() => setRedoChip(reason)}
                          className={`rounded-full border px-3.5 py-1.5 ${
                            redoChip === reason
                              ? 'border-gold bg-gold-light'
                              : 'border-inkline bg-white'
                          }`}
                        >
                          <Text className="font-sans text-sm font-bold text-navy">
                            {reason}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      className="mt-3 w-full rounded-xl border border-inkline bg-white p-3 font-sans text-navy"
                      placeholder="Add a note (optional) - e.g. the word 'boundary' is unclear"
                      value={redoNote}
                      onChangeText={setRedoNote}
                    />
                    <View className="mt-3 flex-row gap-2">
                      <Pressable
                        onPress={() => void sendBackRecording(row)}
                        disabled={actingId === row.id}
                        className="rounded-full bg-red-600 px-5 py-2.5 active:opacity-90"
                      >
                        <Text className="font-sans text-sm font-bold text-white">
                          Send back for re-recording
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setRedoTargetId(null)}
                        className="rounded-full border border-inkline bg-white px-5 py-2.5 active:opacity-90"
                      >
                        <Text className="font-sans text-sm font-bold text-slate-600">
                          Cancel
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      {/* --------------------------------------------- introduction review */}
      <SectionCard title={`Introductions to review (${submittedIntros.length})`}>
        {submittedIntros.length === 0 ? (
          <Text className="font-sans text-sm text-slate-500">
            No introductions waiting. When an actor submits their
            introduction, it appears here; approved introductions are the
            samples students hear in their voice settings.
          </Text>
        ) : (
          <View className="gap-3">
            {submittedIntros.map((voice) => (
              <View
                key={voice.id}
                className="rounded-xl border border-inkline bg-canvas p-4"
              >
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="font-sans text-base font-bold text-navy">
                    {voice.display_name}
                  </Text>
                  <View className="rounded-full bg-navy px-2.5 py-0.5">
                    <Text className="font-sans text-[11px] font-bold text-gold">
                      {voice.category} · {CATEGORY_LABELS[voice.category]}
                    </Text>
                  </View>
                </View>
                <Text className="mt-2 font-sans text-sm italic text-slate-600">
                  “{voice.intro_text}”
                </Text>
                <View className="mt-3 flex-row flex-wrap items-center gap-2">
                  <ReviewPlayer
                    url={getRecordingPublicUrl(voice.intro_path as string)}
                  />
                  <Pressable
                    onPress={() => void approveIntro(voice)}
                    disabled={actingId === voice.id}
                    className="rounded-full bg-pitch px-4 py-2 active:opacity-90"
                  >
                    <Text className="font-sans text-sm font-bold text-white">
                      ✓ Approve
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setIntroRedoId(introRedoId === voice.id ? null : voice.id)
                    }
                    disabled={actingId === voice.id}
                    className="rounded-full border border-red-200 bg-white px-4 py-2 active:opacity-90"
                  >
                    <Text className="font-sans text-sm font-bold text-red-700">
                      ↩ Send back
                    </Text>
                  </Pressable>
                </View>
                {introRedoId === voice.id ? (
                  <View className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <TextInput
                      className="w-full rounded-xl border border-inkline bg-white p-3 font-sans text-navy"
                      placeholder="What should they fix? e.g. Please smile more and slow down a little"
                      value={introRedoReason}
                      onChangeText={setIntroRedoReason}
                    />
                    <View className="mt-3 flex-row gap-2">
                      <Pressable
                        onPress={() => void sendBackIntro(voice)}
                        disabled={actingId === voice.id}
                        className="rounded-full bg-red-600 px-5 py-2.5 active:opacity-90"
                      >
                        <Text className="font-sans text-sm font-bold text-white">
                          Send back
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setIntroRedoId(null)}
                        className="rounded-full border border-inkline bg-white px-5 py-2.5 active:opacity-90"
                      >
                        <Text className="font-sans text-sm font-bold text-slate-600">
                          Cancel
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      {/* ------------------------------------------------ actors & voices */}
      <SectionCard title="Actors & voices">
        {/* Create actor */}
        <Text className="mb-3 font-sans text-base font-bold text-navy">
          New actor account
        </Text>
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-3">
            <View className="min-w-[200px] flex-1">
              <Text className={labelClass}>Username</Text>
              <TextInput
                className={inputClass}
                placeholder="e.g. amy-voice"
                value={actorUsername}
                onChangeText={setActorUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View className="min-w-[200px] flex-1">
              <Text className={labelClass}>Password</Text>
              <TextInput
                className={inputClass}
                placeholder="You choose it - you will send it to the actor"
                value={actorPassword}
                onChangeText={setActorPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View className="min-w-[200px] flex-1">
              <Text className={labelClass}>Display name (optional)</Text>
              <TextInput
                className={inputClass}
                placeholder="e.g. Amy Smith"
                value={actorDisplayName}
                onChangeText={setActorDisplayName}
              />
            </View>
          </View>
          <Pressable
            onPress={() => void createActor()}
            disabled={savingActor}
            className={`self-start rounded-full border-b-4 border-navy-deep bg-navy px-6 py-3 ${savingActor ? 'opacity-50' : 'active:opacity-90'}`}
          >
            <Text className="font-sans text-sm font-bold text-white">
              {savingActor ? 'Creating…' : 'Create actor account'}
            </Text>
          </Pressable>
          <Text className="font-sans text-xs text-slate-400">
            Send the actor their username, this password and the studio link
            (/studio) by mail or message. Passwords stay visible here so you
            can re-send them, just like student PINs.
          </Text>
        </View>

        {/* Actors list */}
        {actors.length > 0 ? (
          <View className="mt-6 gap-2">
            <Text className="font-sans text-sm font-bold uppercase tracking-wide text-slate-400">
              Actor accounts
            </Text>
            {actors.map((actor) => {
              const linked = voices.filter((v) => v.actor_id === actor.id);
              return (
                <View
                  key={actor.id}
                  className="flex-row flex-wrap items-center justify-between gap-2 rounded-xl border border-inkline bg-canvas px-4 py-3"
                >
                  <View className="flex-1">
                    <Text className="font-sans text-sm font-bold text-navy">
                      {actor.username}
                      {actor.display_name ? ` · ${actor.display_name}` : ''}
                    </Text>
                    <Text className="font-sans text-xs text-slate-500">
                      Password: {actor.password} · Voice:{' '}
                      {linked.length > 0
                        ? linked.map((v) => v.display_name).join(', ')
                        : 'none linked yet'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void toggleActorActive(actor)}
                    disabled={actingId === actor.id}
                    className={`rounded-full px-4 py-1.5 ${
                      actor.is_active ? 'bg-pitch-light' : 'bg-slate-200'
                    }`}
                  >
                    <Text
                      className={`font-sans text-xs font-bold ${
                        actor.is_active ? 'text-pitch-dark' : 'text-slate-500'
                      }`}
                    >
                      {actor.is_active ? 'Active' : 'Disabled'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Voice form */}
        <View className="mt-8 border-t border-inkline pt-6">
          <Text className="mb-3 font-sans text-base font-bold text-navy">
            {editVoiceId ? 'Edit voice' : 'New voice'}
          </Text>
          <View className="gap-3">
            <View className="flex-row flex-wrap gap-3">
              <View className="min-w-[200px] flex-1">
                <Text className={labelClass}>Voice name (students see this)</Text>
                <TextInput
                  className={inputClass}
                  placeholder="e.g. Amy"
                  value={voiceName}
                  onChangeText={handleVoiceNameChange}
                />
              </View>
              <View className="min-w-[200px] flex-1">
                <Text className={labelClass}>Folder slug (storage)</Text>
                <TextInput
                  className={inputClass}
                  placeholder="e.g. amy"
                  value={voiceSlug}
                  onChangeText={(value) => {
                    setVoiceSlug(value);
                    setSlugTouched(true);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View>
              <Text className={labelClass}>Category</Text>
              <View className="flex-row flex-wrap gap-2">
                {VOICE_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setVoiceCategory(cat)}
                    className={`rounded-full border px-4 py-2 ${
                      voiceCategory === cat
                        ? 'border-gold bg-gold-light'
                        : 'border-inkline bg-white'
                    }`}
                  >
                    <Text className="font-sans text-sm font-bold text-navy">
                      {cat} · {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text className={labelClass}>Recorded by (actor account)</Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => setVoiceActorId(null)}
                  className={`rounded-full border px-4 py-2 ${
                    voiceActorId === null
                      ? 'border-gold bg-gold-light'
                      : 'border-inkline bg-white'
                  }`}
                >
                  <Text className="font-sans text-sm font-bold text-navy">
                    No actor yet
                  </Text>
                </Pressable>
                {actors.map((actor) => (
                  <Pressable
                    key={actor.id}
                    onPress={() => setVoiceActorId(actor.id)}
                    className={`rounded-full border px-4 py-2 ${
                      voiceActorId === actor.id
                        ? 'border-gold bg-gold-light'
                        : 'border-inkline bg-white'
                    }`}
                  >
                    <Text className="font-sans text-sm font-bold text-navy">
                      {actor.username}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="flex-row flex-wrap gap-3">
              <View className="w-32">
                <Text className={labelClass}>From stage</Text>
                <TextInput
                  className={inputClass}
                  value={fromStage}
                  onChangeText={setFromStage}
                  keyboardType="number-pad"
                />
              </View>
              <View className="w-32">
                <Text className={labelClass}>To stage</Text>
                <TextInput
                  className={inputClass}
                  value={toStage}
                  onChangeText={setToStage}
                  keyboardType="number-pad"
                />
              </View>
              <View className="flex-1 justify-end pb-1">
                <Text className="font-sans text-xs text-slate-400">
                  The actor only records lines from these stages (1-5). Split
                  stages between two voices in the same category if you like.
                </Text>
              </View>
            </View>

            <View>
              <Text className={labelClass}>Introduction script</Text>
              <TextInput
                className={inputClass}
                value={introText}
                onChangeText={(value) => {
                  setIntroText(value);
                  setIntroTouched(true);
                }}
                multiline
              />
              <Text className="mt-1 font-sans text-xs text-slate-400">
                The actor records this as their sample; students hear it when
                they tap the voice in their settings.
              </Text>
            </View>

            <View className="flex-row gap-2">
              <Pressable
                onPress={() => void saveVoice()}
                disabled={savingVoice}
                className={`rounded-full border-b-4 border-gold-dark bg-gold px-6 py-3 ${savingVoice ? 'opacity-50' : 'active:opacity-90'}`}
              >
                <Text className="font-sans text-sm font-bold text-navy">
                  {savingVoice
                    ? 'Saving…'
                    : editVoiceId
                      ? 'Save voice changes'
                      : 'Create voice'}
                </Text>
              </Pressable>
              {editVoiceId ? (
                <Pressable
                  onPress={resetVoiceForm}
                  className="rounded-full border border-inkline bg-white px-6 py-3 active:opacity-90"
                >
                  <Text className="font-sans text-sm font-bold text-slate-600">
                    Cancel editing
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {/* Voices list */}
        {voices.length > 0 ? (
          <View className="mt-6 gap-2">
            <Text className="font-sans text-sm font-bold uppercase tracking-wide text-slate-400">
              Voices
            </Text>
            {voices.map((voice) => (
              <View
                key={voice.id}
                className="flex-row flex-wrap items-center justify-between gap-2 rounded-xl border border-inkline bg-canvas px-4 py-3"
              >
                <View className="flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="font-sans text-sm font-bold text-navy">
                      {voice.display_name}
                    </Text>
                    <View className="rounded-full bg-navy px-2.5 py-0.5">
                      <Text className="font-sans text-[11px] font-bold text-gold">
                        {voice.category} · {CATEGORY_LABELS[voice.category]}
                      </Text>
                    </View>
                    <View
                      className={`rounded-full px-2.5 py-0.5 ${INTRO_STATUS_STYLES[voice.intro_status]}`}
                    >
                      <Text className="font-sans text-[11px] font-bold">
                        Intro: {voice.intro_status}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-0.5 font-sans text-xs text-slate-500">
                    Folder: {voice.slug} · Stages {voice.from_stage}-
                    {voice.to_stage} · Actor:{' '}
                    {actorNameById(voice.actor_id) ?? 'none'}
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => startEditVoice(voice)}
                    className="rounded-full border border-inkline bg-white px-4 py-1.5 active:opacity-90"
                  >
                    <Text className="font-sans text-xs font-bold text-navy">
                      Edit
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void toggleVoiceActive(voice)}
                    disabled={actingId === voice.id}
                    className={`rounded-full px-4 py-1.5 ${
                      voice.is_active ? 'bg-pitch-light' : 'bg-slate-200'
                    }`}
                  >
                    <Text
                      className={`font-sans text-xs font-bold ${
                        voice.is_active ? 'text-pitch-dark' : 'text-slate-500'
                      }`}
                    >
                      {voice.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </SectionCard>
    </View>
  );
}
