import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';

interface GameDetails {
  id: string;
  title: string;
  game_url: string;
}

export default function GamePlayer() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [game, setGame] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(true);
  // Mount timestamp for playtime telemetry. Kept in a ref (set inside the
  // effect) so no impure call happens during render.
  const startTimeRef = useRef<number>(0);

  const fetchGameDetails = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('id, title, game_url')
        .eq('id', id)
        .single();

      if (error) throw error;
      setGame(data);
    } catch (error) {
      console.error('Error fetching game:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const logPlaytime = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // Only log for authenticated users

      // Check if they are a student (sub_account) by looking up their profile
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', session.user.id).single();
      if (profile?.role !== 'individual_learner') return;

      const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (durationSeconds < 10) return; // Ignore bounces under 10 seconds

      await supabase.from('activity_logs').insert([{
        student_id: session.user.id,
        activity_type: 'game',
        target_id: id,
        duration_seconds: durationSeconds
      }]);
    } catch (error) {
      console.log('Telemetry error:', error);
    }
  }, [id]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    (async () => {
      await fetchGameDetails();
    })();

    // Telemetry: Log playtime when the component unmounts
    return () => {
      logPlaytime();
    };
  }, [fetchGameDetails, logPlaytime]);

  if (loading) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center">
        <ActivityIndicator size="large" color="#ffffff" />
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
        {Platform.OS === 'web' ? (
          <iframe 
            src={game.game_url} 
            style={{ width: '100%', height: '100%', border: 'none' }} 
            title={game.title}
            allowFullScreen
          />
        ) : (
          <WebView 
            source={{ uri: game.game_url }} 
            className="flex-1"
            allowsInlineMediaPlayback
            bounces={false}
          />
        )}
      </View>
    </View>
  );
}