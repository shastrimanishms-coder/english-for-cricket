import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ElegantCard,
  GhostButton,
  GoldButton,
  MicroLabel,
  ScreenHeader,
} from '../../components/ui/Elegant';
import { showAlert } from '../../lib/showAlert';
import { toSpeechText } from '../../lib/speechCue';
import {
  CATEGORY_LABELS,
  clearActorSession,
  getActorNext,
  getActorSession,
  recordingFileExtension,
  submitIntro,
  submitRecording,
  uploadRecording,
  type ActorNextLine,
  type ActorQueue,
  type ActorSession,
  type IntroStatus,
} from '../../lib/voiceStudio';

// ------------------------------------------------------------------ player

/**
 * Playback for one finished take. Only ever mounted after a recording
 * exists (a user action), so the web player is never constructed
 * during prerendering - the same caution the lesson player documents.
 */
function TakePlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
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
      // Playback is best-effort; the take can still be submitted.
    }
  };

  return (
    <Pressable
      onPress={toggle}
      className="items-center rounded-full border border-inkline bg-white px-6 py-3 active:opacity-90"
    >
      <Text className="font-sans text-base font-semibold text-navy">
        {status.playing ? '⏸ Pause' : '▶ Play my recording'}
      </Text>
    </Pressable>
  );
}

// ----------------------------------------------------------- recorder panel

type PanelPhase = 'idle' | 'recording' | 'recorded' | 'submitting';
type Pace = 'slow' | 'normal';

const WORDS_PER_SECOND: Record<Pace, number> = { slow: 1.4, normal: 2.2 };

interface RecorderPanelProps {
  text: string;
  hint?: string;
  submitLabel: string;
  onSubmitTake: (localUri: string, durationMs: number | null) => Promise<void>;
}

/**
 * The shared record flow for a line and for the introduction:
 * listen to the model voice, record with a word-by-word pacing
 * highlight and a live level meter, listen back, re-record or submit.
 */
function RecorderPanel({ text, hint, submitLabel, onSubmitTake }: RecorderPanelProps) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 100);

  const [phase, setPhase] = useState<PanelPhase>('idle');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [pace, setPace] = useState<Pace>('normal');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [pulseOn, setPulseOn] = useState(false);
  const [micDenied, setMicDenied] = useState(false);

  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const durationRef = useRef(0);
  const phaseRef = useRef<PanelPhase>('idle');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Microphone permission + audio mode, once per panel mount.
  useEffect(() => {
    void (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) setMicDenied(true);
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      } catch {
        // Recording may still work; the Record tap reports honestly.
      }
    })();
  }, []);

  // A new line (or a fresh target) resets the panel; a take in
  // progress for the old text is stopped and discarded.
  useEffect(() => {
    (async () => {
      if (phaseRef.current === 'recording') {
        try {
          await recorder.stop();
        } catch {
          // Best-effort cleanup only.
        }
      }
      setPhase('idle');
      setLocalUri(null);
      setDurationMs(null);
      setHighlightIndex(0);
      durationRef.current = 0;
    })();
  }, [text, recorder]);

  // Track the running duration so the final length survives the
  // recorder state settling after stop.
  useEffect(() => {
    if (phase === 'recording') {
      durationRef.current = recorderState.durationMillis;
    }
  }, [phase, recorderState.durationMillis]);

  // Word-by-word pacing highlight while recording.
  useEffect(() => {
    if (phase !== 'recording' || words.length <= 1) return;
    const interval = setInterval(() => {
      setHighlightIndex((i) => Math.min(i + 1, words.length - 1));
    }, 1000 / WORDS_PER_SECOND[pace]);
    return () => clearInterval(interval);
  }, [phase, pace, words.length]);

  // Single-word lines just pulse.
  useEffect(() => {
    if (phase !== 'recording' || words.length !== 1) return;
    const interval = setInterval(() => setPulseOn((p) => !p), 450);
    return () => clearInterval(interval);
  }, [phase, words.length]);

  const listen = () => {
    try {
      Speech.stop();
      Speech.speak(toSpeechText(text), { language: 'en' });
    } catch {
      // The model voice is a nicety, never a blocker.
    }
  };

  const startRecording = async () => {
    try {
      Speech.stop();
    } catch {
      // Ignore - recording matters more.
    }
    setLocalUri(null);
    setDurationMs(null);
    setHighlightIndex(0);
    setPulseOn(false);
    durationRef.current = 0;
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      showAlert(
        'Microphone unavailable',
        'We could not start recording. Please check the microphone permission and try again - Chrome works best.'
      );
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      const finalDuration = Math.round(
        recorder.getStatus().durationMillis || durationRef.current || 0
      );
      if (uri) {
        setLocalUri(uri);
        setDurationMs(finalDuration > 0 ? finalDuration : null);
        setPhase('recorded');
      } else {
        setPhase('idle');
        showAlert('Recording failed', 'No audio was captured. Please try again.');
      }
    } catch {
      setPhase('idle');
      showAlert('Recording failed', 'Something went wrong while stopping. Please try again.');
    }
  };

  const discardTake = () => {
    setLocalUri(null);
    setDurationMs(null);
    setHighlightIndex(0);
    setPhase('idle');
  };

  const submitTake = async () => {
    if (!localUri) return;
    setPhase('submitting');
    try {
      await onSubmitTake(localUri, durationMs);
      setLocalUri(null);
      setDurationMs(null);
      setHighlightIndex(0);
      setPhase('idle');
    } catch {
      // The parent already explained the failure; keep the take.
      setPhase('recorded');
    }
  };

  const metering = recorderState.metering;
  const meterLevel =
    metering === undefined || metering <= -160
      ? 0.35
      : Math.min(1, Math.max(0, (metering + 50) / 50));

  return (
    <View>
      {/* The line, with the pacing highlight while recording */}
      <Text className="font-display text-[32px] font-semibold leading-snug text-navy">
        {words.map((word, i) => {
          const isLit = phase === 'recording' && i <= highlightIndex;
          const backgroundColor =
            phase !== 'recording'
              ? 'transparent'
              : words.length === 1
                ? pulseOn
                  ? '#D4AF37'
                  : '#F3E5BE'
                : isLit
                  ? '#F3E5BE'
                  : 'transparent';
          return (
            <Text
              key={i}
              style={{
                backgroundColor,
                fontWeight: phase === 'recording' && i === highlightIndex ? '700' : undefined,
              }}
            >
              {word}
              {i < words.length - 1 ? ' ' : ''}
            </Text>
          );
        })}
      </Text>
      {hint ? (
        <Text className="mt-2 font-sans text-sm italic text-slate-500">{hint}</Text>
      ) : null}

      {/* Listen + pace */}
      <View className="mt-5 flex-row flex-wrap items-center gap-3">
        <Pressable
          onPress={listen}
          disabled={phase === 'recording' || phase === 'submitting'}
          className={`rounded-full border border-inkline bg-white px-5 py-2.5 ${
            phase === 'recording' || phase === 'submitting' ? 'opacity-50' : 'active:opacity-90'
          }`}
        >
          <Text className="font-sans text-sm font-bold text-navy">🔊 Listen first</Text>
        </Pressable>
        <View className="flex-row items-center gap-2">
          <Text className="font-sans text-xs font-bold uppercase tracking-wide text-slate-400">
            Guide pace
          </Text>
          {(['slow', 'normal'] as Pace[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => setPace(option)}
              className={`rounded-full border px-4 py-2 ${
                pace === option
                  ? 'border-gold bg-gold-light'
                  : 'border-inkline bg-white'
              }`}
            >
              <Text className="font-sans text-sm font-bold capitalize text-navy">
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text className="mt-2 font-sans text-xs text-slate-400">
        While you record, the words light up at the guide pace - try to speak along with them.
      </Text>

      {/* Record / stop */}
      {phase === 'idle' || phase === 'recording' ? (
        <View className="mt-6">
          <Pressable
            onPress={phase === 'recording' ? stopRecording : startRecording}
            disabled={micDenied}
            className={`h-14 items-center justify-center rounded-full ${
              micDenied
                ? 'bg-slate-300'
                : phase === 'recording'
                  ? 'bg-red-600 active:opacity-90'
                  : 'border-b-4 border-navy-deep bg-navy active:opacity-90'
            }`}
          >
            <Text className="font-sans text-lg font-bold text-white">
              {phase === 'recording' ? '■ Stop recording' : '● Record'}
            </Text>
          </Pressable>
          {micDenied ? (
            <Text className="mt-3 text-center font-sans text-sm font-semibold text-red-600">
              Microphone permission was denied. Please allow the microphone in your browser, then reload this page.
            </Text>
          ) : null}
          {phase === 'recording' ? (
            <View className="mt-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-sans text-sm font-bold text-red-600">
                  ● Recording…
                </Text>
                <Text className="font-sans text-sm text-slate-500">
                  {(recorderState.durationMillis / 1000).toFixed(1)}s
                </Text>
              </View>
              <View className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                <View
                  className="h-full rounded-full bg-pitch"
                  style={{ width: `${Math.round(meterLevel * 100)}%` }}
                />
              </View>
              <Text className="mt-1 font-sans text-xs text-slate-400">
                Keep the green bar moving - too small means too quiet.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Listen back / submit */}
      {phase === 'recorded' || phase === 'submitting' ? (
        <View className="mt-6 gap-3">
          {localUri ? <TakePlayer uri={localUri} /> : null}
          {durationMs ? (
            <Text className="text-center font-sans text-xs text-slate-400">
              Take length: {(durationMs / 1000).toFixed(1)} seconds
            </Text>
          ) : null}
          <View className="flex-row gap-3">
            <GhostButton
              label="Record again"
              onPress={discardTake}
              disabled={phase === 'submitting'}
              className="flex-1"
            />
            <GoldButton
              label={phase === 'submitting' ? 'Sending…' : submitLabel}
              onPress={submitTake}
              disabled={phase === 'submitting'}
              className="flex-1"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ screen

type QueueState = 'loading' | 'ok' | 'no_voice' | 'unavailable';

export default function StudioRecord() {
  const router = useRouter();
  const [session, setSession] = useState<ActorSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [queue, setQueue] = useState<ActorQueue | null>(null);
  const [queueState, setQueueState] = useState<QueueState>('loading');
  const [introStatus, setIntroStatus] = useState<IntroStatus>('pending');

  const loadQueue = useCallback(async (actorId: string) => {
    setQueueState((prev) => (prev === 'ok' ? prev : 'loading'));
    const result = await getActorNext(actorId);
    if (result.status === 'ok') {
      setQueue(result.queue);
      setIntroStatus(result.queue.introStatus);
      setQueueState('ok');
    } else if (result.status === 'no_voice') {
      setQueueState('no_voice');
    } else {
      setQueueState('unavailable');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await getActorSession();
      if (!alive) return;
      if (!stored) {
        router.replace('/studio');
        return;
      }
      setSession(stored);
      setIntroStatus(stored.introStatus);
      setSessionChecked(true);
      await loadQueue(stored.actorId);
    })();
    return () => {
      alive = false;
    };
  }, [router, loadQueue]);

  const handleSignOut = async () => {
    try {
      Speech.stop();
    } catch {
      // Nothing to stop.
    }
    await clearActorSession();
    router.replace('/studio');
  };

  const handleLineSubmit = useCallback(
    (line: ActorNextLine) =>
      async (localUri: string, durationMs: number | null) => {
        if (!session?.voiceSlug) throw new Error('No voice assigned.');
        try {
          const ext = recordingFileExtension(localUri);
          const path = await uploadRecording(
            session.voiceSlug,
            `${line.lineId}.${ext}`,
            localUri
          );
          const ok = await submitRecording(session.actorId, line.lineId, path, durationMs);
          if (!ok) throw new Error('The recording could not be registered.');
        } catch (error: any) {
          showAlert(
            'Could not submit',
            `${error?.message || 'Something went wrong.'} Your take is still here - please try submitting again.`
          );
          throw error;
        }
        await loadQueue(session.actorId);
      },
    [session, loadQueue]
  );

  const handleIntroSubmit = useCallback(
    async (localUri: string) => {
      if (!session?.voiceSlug) throw new Error('No voice assigned.');
      try {
        const ext = recordingFileExtension(localUri);
        const path = await uploadRecording(session.voiceSlug, `intro.${ext}`, localUri);
        const ok = await submitIntro(session.actorId, path);
        if (!ok) throw new Error('The introduction could not be registered.');
      } catch (error: any) {
        showAlert(
          'Could not submit',
          `${error?.message || 'Something went wrong.'} Your take is still here - please try submitting again.`
        );
        throw error;
      }
      setIntroStatus('submitted');
      await loadQueue(session.actorId);
    },
    [session, loadQueue]
  );

  if (!sessionChecked || !session) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  const voiceName = queue?.voiceName || session.voiceName || 'Your voice';
  const category = queue?.category || session.category;
  const progressPct =
    queue && queue.total > 0 ? Math.round((queue.done / queue.total) * 100) : 0;

  return (
    <View className="flex-1 bg-canvas">
      <SafeAreaView edges={['top']} className="w-full bg-navy">
        <ScreenHeader
          title="Voice Studio"
          right={
            <Pressable
              onPress={handleSignOut}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 active:bg-white/20"
            >
              <Text className="font-sans text-sm font-bold text-white">Sign out</Text>
            </Pressable>
          }
        />
      </SafeAreaView>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
        <View className="mx-auto w-full max-w-2xl gap-6">
          {/* Voice + progress header */}
          <ElegantCard className="p-6">
            <MicroLabel>Now recording as</MicroLabel>
            <View className="mt-2 flex-row flex-wrap items-center gap-3">
              <Text className="font-display text-3xl font-semibold text-navy">
                {voiceName}
              </Text>
              {category ? (
                <View className="rounded-full bg-navy px-3 py-1">
                  <Text className="font-sans text-xs font-bold text-gold">
                    {category} · {CATEGORY_LABELS[category]}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-1 font-sans text-sm text-slate-500">
              Signed in as {session.displayName || session.username}
            </Text>

            {queueState === 'ok' && queue ? (
              <View className="mt-5">
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans text-sm font-bold text-navy">
                    {queue.done} of {queue.total} lines recorded
                  </Text>
                  <Text className="font-sans text-sm text-slate-500">{progressPct}%</Text>
                </View>
                <View className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                  <View
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${progressPct}%` }}
                  />
                </View>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  <View className="rounded-full bg-pitch-light px-3 py-1.5">
                    <Text className="font-sans text-xs font-bold text-pitch-dark">
                      ✓ Approved: {queue.approved}
                    </Text>
                  </View>
                  <View className="rounded-full bg-gold-light px-3 py-1.5">
                    <Text className="font-sans text-xs font-bold text-gold-dark">
                      ⏳ Waiting for review: {queue.submitted}
                    </Text>
                  </View>
                  <View className="rounded-full bg-red-50 px-3 py-1.5">
                    <Text className="font-sans text-xs font-bold text-red-700">
                      ↩ To re-record: {queue.redo}
                    </Text>
                  </View>
                </View>
                {introStatus === 'approved' ? (
                  <Text className="mt-3 font-sans text-sm font-semibold text-pitch-dark">
                    ✓ Your introduction is approved - students can hear it when they pick your voice.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ElegantCard>

          {queueState === 'loading' ? (
            <ElegantCard className="items-center p-8">
              <ActivityIndicator size="large" color="#0A192F" />
              <Text className="mt-3 font-sans text-sm text-slate-500">
                Loading your lines…
              </Text>
            </ElegantCard>
          ) : null}

          {queueState === 'unavailable' ? (
            <ElegantCard className="p-6">
              <Text className="font-display text-xl font-semibold text-navy">
                The studio is not set up yet
              </Text>
              <Text className="mb-4 mt-2 font-sans text-sm text-slate-500">
                Your account works, but the recording studio behind it has not
                been switched on. Please ask the admin to finish the setup,
                then try again.
              </Text>
              <GhostButton
                label="Try again"
                onPress={() => void loadQueue(session.actorId)}
              />
            </ElegantCard>
          ) : null}

          {queueState === 'no_voice' ? (
            <ElegantCard className="p-6">
              <Text className="font-display text-xl font-semibold text-navy">
                No voice assigned yet
              </Text>
              <Text className="mt-2 font-sans text-sm text-slate-500">
                Your account has no voice linked to it yet, so there is nothing
                to record. Please ask the admin to link a voice to your
                account, then sign in again.
              </Text>
            </ElegantCard>
          ) : null}

          {queueState === 'ok' && queue ? (
            <>
              {/* Introduction task */}
              {introStatus !== 'approved' ? (
                <ElegantCard className="p-6">
                  <MicroLabel>First task</MicroLabel>
                  <Text className="mb-3 mt-1 font-display text-xl font-semibold text-navy">
                    Your introduction 🎙️
                  </Text>
                  {introStatus === 'submitted' ? (
                    <>
                      <Text className="font-sans text-base italic leading-relaxed text-slate-600">
                        “{session.introText}”
                      </Text>
                      <View className="mt-4 rounded-xl border border-pitch-light bg-pitch-light p-4">
                        <Text className="font-sans text-sm font-semibold text-pitch-dark">
                          ✓ Sent - waiting for the admin to review it. You can
                          keep recording your lines below meanwhile.
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text className="mb-4 font-sans text-sm text-slate-500">
                        Students hear this short introduction when they tap your
                        voice in their settings, so record it first - in your
                        warmest, clearest voice.
                      </Text>
                      {introStatus === 'redo' ? (
                        <View className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                          <Text className="font-sans text-sm font-bold text-red-700">
                            ↩ The admin asked for a new introduction
                            {session.introRedoReason
                              ? `: ${session.introRedoReason}`
                              : '.'}
                          </Text>
                        </View>
                      ) : null}
                      <RecorderPanel
                        text={session.introText ?? ''}
                        submitLabel="Submit introduction"
                        onSubmitTake={handleIntroSubmit}
                      />
                    </>
                  )}
                </ElegantCard>
              ) : null}

              {/* The next line */}
              {queue.next ? (
                <ElegantCard className="p-6">
                  <View className="mb-4 flex-row flex-wrap items-center gap-2">
                    <MicroLabel>{queue.next.ref}</MicroLabel>
                    <View className="rounded-full bg-navy/5 px-3 py-1">
                      <Text className="font-sans text-xs font-bold capitalize text-navy">
                        {queue.next.type}
                      </Text>
                    </View>
                    {queue.next.isRedo ? (
                      <View className="rounded-full bg-red-50 px-3 py-1">
                        <Text className="font-sans text-xs font-bold text-red-700">
                          ↩ Re-record
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {queue.next.isRedo && queue.next.redoReason ? (
                    <View className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                      <Text className="font-sans text-sm font-bold text-red-700">
                        ↩ The admin sent this one back: {queue.next.redoReason}
                      </Text>
                    </View>
                  ) : null}
                  <RecorderPanel
                    key={queue.next.lineId}
                    text={queue.next.text}
                    hint={queue.next.note || undefined}
                    submitLabel="Submit recording"
                    onSubmitTake={handleLineSubmit(queue.next)}
                  />
                </ElegantCard>
              ) : (
                <ElegantCard className="items-center p-8">
                  <Text className="text-5xl">🎉</Text>
                  <Text className="mt-3 text-center font-display text-2xl font-semibold text-navy">
                    All caught up!
                  </Text>
                  <Text className="mt-2 text-center font-sans text-sm text-slate-500">
                    Nothing is waiting for you right now. New lines - and any
                    recordings the admin sends back - will appear here.
                    Thank you for lending your voice!
                  </Text>
                </ElegantCard>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
