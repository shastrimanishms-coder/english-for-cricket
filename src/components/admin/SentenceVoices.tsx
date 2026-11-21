import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  attachUploadedVoice,
  getSentenceRecordings,
  listNamedVoices,
  removeSentenceVoice,
  type NamedVoice,
  type SentenceRecording,
} from '../../lib/adminVoiceUploads';
import { getRecordingPublicUrl } from '../../lib/voiceStudio';

// Per-sentence voice uploads for the admin managers (Speaking
// Practice lines, Smart Reading sentences). Each attached voice is an
// ordinary Voice Studio recording - see lib/adminVoiceUploads - so
// students hear these through the same voice choices as lesson lines.
// Uploads made here are approved immediately: the admin is the
// reviewer. If the sentence's text is edited afterwards, its
// recordings stay with the old text and the sentence shows as
// unvoiced again - the fallback is the device voice, never silence.

interface Props {
  text: string;
  lineType: 'dialogue' | 'reading';
  refLabel: string;
  onChanged?: () => void;
}

export default function SentenceVoices({ text, lineType, refLabel, onChanged }: Props) {
  const [voices, setVoices] = useState<NamedVoice[]>([]);
  const [attached, setAttached] = useState<SentenceRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenVoiceId, setChosenVoiceId] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState('');
  const [playingId, setPlayingId] = useState('');
  const playerRef = useRef<AudioPlayer | null>(null);

  const trimmed = text.trim();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [v, recs] = await Promise.all([
          listNamedVoices(),
          getSentenceRecordings(trimmed),
        ]);
        if (cancelled) return;
        setVoices(v);
        setAttached(recs);
        setError('');
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Could not load the voices for this sentence.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trimmed]);

  useEffect(() => {
    return () => {
      try {
        playerRef.current?.release();
      } catch {
        // Release is best-effort.
      }
      playerRef.current = null;
    };
  }, []);

  const togglePlay = (rec: SentenceRecording) => {
    try {
      if (playingId === rec.recordingId) {
        playerRef.current?.pause();
        setPlayingId('');
        return;
      }
      const url = getRecordingPublicUrl(rec.storagePath);
      if (!playerRef.current) {
        playerRef.current = createAudioPlayer({ uri: url });
      } else {
        playerRef.current.replace({ uri: url });
      }
      playerRef.current.play();
      setPlayingId(rec.recordingId);
    } catch {
      setError('Playback failed in this browser.');
    }
  };

  const pickAndUpload = async (voice: NamedVoice) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setBusy(voice.id);
      setError('');
      const updated = await attachUploadedVoice({
        voice,
        text: trimmed,
        lineType,
        refLabel,
        localUri: result.assets[0].uri,
      });
      setAttached(updated);
      setChosenVoiceId('');
      setPickerOpen(false);
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'The upload failed. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const handleRemove = async (rec: SentenceRecording) => {
    try {
      setBusy(rec.recordingId);
      setError('');
      const updated = await removeSentenceVoice(rec, trimmed);
      setAttached(updated);
      setConfirmRemoveId('');
      if (playingId === rec.recordingId) setPlayingId('');
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Could not remove that recording.');
    } finally {
      setBusy('');
    }
  };

  const available = voices.filter(
    (v) => !attached.some((a) => a.voiceId === v.id)
  );
  const chosenVoice = voices.find((v) => v.id === chosenVoiceId) || null;

  if (!trimmed) return null;

  return (
    <View className="mt-2 rounded-xl border border-inkline bg-white p-3 gap-2">
      <Text className="text-xs font-bold text-slate-500">
        🎙 Voices for this {lineType === 'dialogue' ? 'line' : 'sentence'}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color="#0A192F" />
      ) : (
        <>
          {attached.length === 0 ? (
            <Text className="text-xs text-slate-400">
              No human voice yet — the device voice reads this for now.
            </Text>
          ) : (
            attached.map((rec) => {
              const voice = voices.find((v) => v.id === rec.voiceId) || null;
              return (
                <View key={rec.recordingId} className="flex-row items-center gap-2 flex-wrap">
                  <Text className="text-sm font-semibold text-navy">{rec.voiceName}</Text>
                  <View className="px-2 py-0.5 rounded-md bg-slate-100">
                    <Text className="text-[10px] font-bold text-slate-500">{rec.category}</Text>
                  </View>
                  <View className={`px-2 py-0.5 rounded-md ${rec.status === 'approved' ? 'bg-pitch/10' : 'bg-gold/20'}`}>
                    <Text className={`text-[10px] font-bold ${rec.status === 'approved' ? 'text-pitch' : 'text-gold-dark'}`}>
                      {rec.status === 'approved' ? 'LIVE' : rec.status.toUpperCase()}
                    </Text>
                  </View>
                  <Pressable onPress={() => togglePlay(rec)} className="px-2.5 py-1 rounded-full bg-slate-100 border border-inkline">
                    <Text className="text-xs font-bold text-slate-600">{playingId === rec.recordingId ? '⏸ Pause' : '▶ Play'}</Text>
                  </Pressable>
                  {voice ? (
                    <Pressable
                      onPress={() => void pickAndUpload(voice)}
                      disabled={busy !== ''}
                      className="px-2.5 py-1 rounded-full bg-slate-100 border border-inkline"
                    >
                      <Text className="text-xs font-bold text-slate-600">{busy === voice.id ? 'Uploading…' : 'Replace'}</Text>
                    </Pressable>
                  ) : null}
                  {confirmRemoveId === rec.recordingId ? (
                    <Pressable
                      onPress={() => void handleRemove(rec)}
                      disabled={busy !== ''}
                      className="px-2.5 py-1 rounded-full bg-red-50 border border-red-200"
                    >
                      <Text className="text-xs font-bold text-red-500">{busy === rec.recordingId ? 'Removing…' : 'Tap again to remove'}</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => setConfirmRemoveId(rec.recordingId)} className="px-2.5 py-1 rounded-full bg-white border border-inkline">
                      <Text className="text-xs font-bold text-slate-400">Remove</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}

          {voices.length === 0 ? (
            <Text className="text-xs text-slate-400">
              No named voices exist yet — create one under Contributors → Voice Studio first, then uploads can be attached to it.
            </Text>
          ) : available.length > 0 ? (
            <View className="flex-row items-center gap-2 flex-wrap mt-1">
              <View className="relative">
                <Pressable
                  onPress={() => setPickerOpen((o) => !o)}
                  className="px-3 py-2 rounded-full bg-canvas border border-inkline"
                >
                  <Text className="text-xs font-bold text-slate-600">
                    {chosenVoice ? `${chosenVoice.display_name} (${chosenVoice.category})` : 'Choose a voice…'} {pickerOpen ? '▴' : '▾'}
                  </Text>
                </Pressable>
                {pickerOpen ? (
                  <View className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-inkline bg-white py-1 shadow-lg" style={{ zIndex: 50 }}>
                    {available.map((v) => (
                      <Pressable
                        key={v.id}
                        onPress={() => { setChosenVoiceId(v.id); setPickerOpen(false); }}
                        className="px-3 py-2"
                      >
                        <Text className="text-sm text-slate-600">{v.display_name} · {v.category}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <Pressable
                onPress={() => chosenVoice && void pickAndUpload(chosenVoice)}
                disabled={!chosenVoice || busy !== ''}
                className={`px-3 py-2 rounded-full border ${chosenVoice ? 'bg-navy border-navy' : 'bg-slate-100 border-inkline'}`}
              >
                <Text className={`text-xs font-bold ${chosenVoice ? 'text-white' : 'text-slate-400'}`}>
                  {chosenVoice && busy === chosenVoice.id ? 'Uploading…' : 'Upload audio file'}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
        </>
      )}
    </View>
  );
}
