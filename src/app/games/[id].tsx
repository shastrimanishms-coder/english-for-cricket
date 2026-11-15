import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';
import { useActivityLogger } from '../../lib/useActivityLogger';

interface GameDetails {
  id: string;
  title: string;
  game_url: string;
}

type EmbedStatus = 'loading' | 'ready' | 'error';

export default function GamePlayer() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [game, setGame] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(true);
  // A failed fetch (network/RLS) is NOT the same as a missing game: the
  // two states render differently (retry vs. plain "not found").
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus>('loading');
  const [embedKey, setEmbedKey] = useState(0);

  // Playtime telemetry for both identity kinds (see useActivityLogger).
  // Starts once the game row is loaded; fails soft until migration
  // 20261115000008 (log_activity RPC) has been run.
  useActivityLogger({ activityType: 'game', targetId: game?.id ?? null });

  const fetchGameDetails = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const { data, error } = await supabase
        .from('games')
        .select('id, title, game_url')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      setGame(data);
      setEmbedStatus('loading');
    } catch (error: any) {
      console.error('Error fetching game:', error);
      setFetchError(error?.message || 'Something went wrong while loading this game.');
      setGame(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      await fetchGameDetails();
    })();
  }, [fetchGameDetails]);

  const retryEmbed = useCallback(() => {
    setEmbedStatus('loading');
    setEmbedKey((k) => k + 1);
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  if (fetchError) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center p-6">
        <Text className="text-white text-xl font-bold mb-2 text-center">
          Couldn&apos;t load this game
        </Text>
        <Text className="text-slate-400 text-center mb-6">
          Something went wrong while loading. Check your connection and try again.
        </Text>
        <Pressable
          onPress={() => {
            (async () => {
              await fetchGameDetails();
            })();
          }}
          className="px-6 py-3 bg-white rounded-lg mb-3"
        >
          <Text className="font-bold text-slate-900">Try Again</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="px-6 py-3">
          <Text className="font-bold text-slate-300">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!game) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center p-6">
        <Text className="text-white text-xl font-bold mb-4">Game not found.</Text>
        <Pressable onPress={() => router.back()} className="px-6 py-3 bg-white rounded-lg">
          <Text className="font-bold text-slate-900">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-900">
      <View className="flex-row items-center justify-between p-4 bg-black/50 z-10 absolute top-0 left-0 right-0">
        <Pressable onPress={() => router.back()} className="px-4 py-2 bg-white/10 rounded-full border border-white/20">
          <Text className="text-white font-bold text-sm">← Back to Arcade</Text>
        </Pressable>
        <Text className="text-white font-bold text-lg">{game.title}</Text>
        <View className="w-24" /> {/* Spacer for centering */}
      </View>

      <View className="flex-1 pt-16">
        {embedStatus === 'error' ? (
          <View className="flex-1 items-center justify-center p-6">
            <Text className="text-white text-xl font-bold mb-2 text-center">
              This game couldn&apos;t be loaded
            </Text>
            <Text className="text-slate-400 text-center mb-6">
              The game itself failed to load. You can try again, or pick a different game.
            </Text>
            <Pressable onPress={retryEmbed} className="px-6 py-3 bg-white rounded-lg mb-3">
              <Text className="font-bold text-slate-900">Retry</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} className="px-6 py-3">
              <Text className="font-bold text-slate-300">Go Back</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {Platform.OS === 'web' ? (
              <iframe
                key={embedKey}
                src={game.game_url}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={game.title}
                allowFullScreen
                onLoad={() => setEmbedStatus('ready')}
                onError={() => setEmbedStatus('error')}
              />
            ) : (
              <WebView
                key={embedKey}
                source={{ uri: game.game_url }}
                className="flex-1"
                allowsInlineMediaPlayback
                bounces={false}
                onLoadEnd={() => setEmbedStatus('ready')}
                onError={() => setEmbedStatus('error')}
                onHttpError={() => setEmbedStatus('error')}
              />
            )}
            {embedStatus === 'loading' ? (
              <View className="absolute inset-0 items-center justify-center bg-slate-900">
                <ActivityIndicator size="large" color="#ffffff" />
                <Text className="text-slate-400 mt-3">Loading game…</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
