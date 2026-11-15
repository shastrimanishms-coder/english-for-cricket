import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';
import { useActivityLogger } from '../../lib/useActivityLogger';

interface VideoDetails {
  id: string;
  title: string;
  video_url: string;
}

type EmbedStatus = 'loading' | 'ready' | 'error';

export default function VideoPlayer() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [loading, setLoading] = useState(true);
  // A failed fetch (network/RLS) is NOT the same as a missing video: the
  // two states render differently (retry vs. plain "not found").
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus>('loading');
  const [embedKey, setEmbedKey] = useState(0);

  // Watch-time telemetry for both identity kinds (see useActivityLogger).
  // Starts once the video row is loaded; fails soft until migration
  // 20261115000008 (log_activity RPC) has been run.
  useActivityLogger({ activityType: 'video', targetId: video?.id ?? null });

  const fetchVideoDetails = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const { data, error } = await supabase
        .from('video_lectures')
        .select('id, title, video_url')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      setVideo(data);
      setEmbedStatus('loading');
    } catch (error: any) {
      console.error('Error fetching video:', error);
      setFetchError(error?.message || 'Something went wrong while loading this video.');
      setVideo(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      await fetchVideoDetails();
    })();
  }, [fetchVideoDetails]);

  const retryEmbed = useCallback(() => {
    setEmbedStatus('loading');
    setEmbedKey((k) => k + 1);
  }, []);

  // Helper to convert standard YouTube URLs to embed URLs for the WebView/iframe
  const getEmbedUrl = (url: string) => {
    if (url.includes('youtube.com/watch?v=')) {
      return url.replace('watch?v=', 'embed/');
    }
    if (url.includes('youtu.be/')) {
      return url.replace('youtu.be/', 'youtube.com/embed/');
    }
    return url;
  };

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
          Couldn&apos;t load this video
        </Text>
        <Text className="text-slate-400 text-center mb-6">
          Something went wrong while loading. Check your connection and try again.
        </Text>
        <Pressable
          onPress={() => {
            (async () => {
              await fetchVideoDetails();
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

  if (!video) {
    return (
      <View className="flex-1 bg-slate-900 items-center justify-center p-6">
        <Text className="text-white text-xl font-bold mb-4">Video not found.</Text>
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
          <Text className="text-white font-bold text-sm">← Back to Library</Text>
        </Pressable>
        <Text className="text-white font-bold text-lg" numberOfLines={1}>{video.title}</Text>
        <View className="w-24" />
      </View>

      <View className="flex-1 pt-16">
        {embedStatus === 'error' ? (
          <View className="flex-1 items-center justify-center p-6">
            <Text className="text-white text-xl font-bold mb-2 text-center">
              This video couldn&apos;t be loaded
            </Text>
            <Text className="text-slate-400 text-center mb-6">
              The video itself failed to load. You can try again, or pick a different video.
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
                src={getEmbedUrl(video.video_url)}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={video.title}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                onLoad={() => setEmbedStatus('ready')}
                onError={() => setEmbedStatus('error')}
              />
            ) : (
              <WebView
                key={embedKey}
                source={{ uri: getEmbedUrl(video.video_url) }}
                className="flex-1"
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                onLoadEnd={() => setEmbedStatus('ready')}
                onError={() => setEmbedStatus('error')}
                onHttpError={() => setEmbedStatus('error')}
              />
            )}
            {embedStatus === 'loading' ? (
              <View className="absolute inset-0 items-center justify-center bg-slate-900">
                <ActivityIndicator size="large" color="#ffffff" />
                <Text className="text-slate-400 mt-3">Loading video…</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
