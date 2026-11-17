import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { awardExtraIfTagged } from '../../lib/extras';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';
import { useActivityLogger } from '../../lib/useActivityLogger';
import { useSafeBack } from '../../lib/useSafeBack';

interface VideoDetails {
  id: string;
  title: string;
  video_url: string;
  lesson_id?: string | null;
}

type EmbedStatus = 'loading' | 'ready' | 'error';

export default function VideoPlayer() {
  const { id } = useLocalSearchParams();
  const goBack = useSafeBack();
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

  // If this video is tagged to a lesson, opening it completes that
  // lesson's recommended extra (+3 stars, once per video). Fails soft.
  useEffect(() => {
    if (!video) return;
    (async () => {
      const identity = await getStudentIdentity();
      if (identity) await awardExtraIfTagged(identity, 'video', video.id, video.lesson_id);
    })();
  }, [video]);

  // Layout: portrait keeps the video in a 16:9 frame at the top of the
  // screen (with the title beneath it); landscape gives the video the
  // full available area, like a fullscreen player.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const fetchVideoDetails = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      let { data, error } = await supabase
        .from('video_lectures')
        .select('id, title, video_url, lesson_id')
        .eq('id', id)
        .maybeSingle();

      if (error && /lesson_id/.test(error.message)) {
        // Migration 17 not run yet: the tag column does not exist.
        const retry = await supabase
          .from('video_lectures')
          .select('id, title, video_url')
          .eq('id', id)
          .maybeSingle();
        data = retry.data as typeof data;
        error = retry.error;
      }

      if (error) throw error;
      setVideo(data as VideoDetails);
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
      <SafeAreaView className="flex-1 bg-navy-deep items-center justify-center">
        <ActivityIndicator size="large" color="#ffffff" />
      </SafeAreaView>
    );
  }

  if (fetchError) {
    return (
      <SafeAreaView className="flex-1 bg-navy-deep items-center justify-center p-6">
        <Text className="text-white font-display text-xl font-semibold mb-2 text-center">
          Couldn&apos;t load this video
        </Text>
        <Text className="text-slate-400 font-sans text-center mb-6">
          Something went wrong while loading. Check your connection and try again.
        </Text>
        <Pressable
          onPress={() => {
            (async () => {
              await fetchVideoDetails();
            })();
          }}
          className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full mb-3"
        >
          <Text className="font-sans font-bold text-navy">Try Again</Text>
        </Pressable>
        <Pressable onPress={goBack} className="px-6 py-3">
          <Text className="font-sans font-bold text-slate-300">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!video) {
    return (
      <SafeAreaView className="flex-1 bg-navy-deep items-center justify-center p-6">
        <Text className="text-white font-display text-xl font-semibold mb-4">Video not found.</Text>
        <Pressable onPress={goBack} className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full">
          <Text className="font-sans font-bold text-navy">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // The embed itself (web iframe / native WebView) plus its loading
  // overlay - shared by the portrait and landscape layouts below.
  const embed = (
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
        <View className="absolute inset-0 items-center justify-center bg-navy-deep">
          <ActivityIndicator size="large" color="#ffffff" />
          <Text className="text-slate-400 font-sans mt-3">Loading video…</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-navy-deep">
      <View className="flex-row items-center justify-between p-4 bg-navy-deep/70 z-10 absolute top-0 left-0 right-0">
        <Pressable onPress={goBack} className="h-10 w-10 items-center justify-center bg-white/10 rounded-full border border-white/20">
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </Pressable>
        <Text className="text-white font-display font-semibold text-lg flex-1 text-center mx-2" numberOfLines={1}>{video.title}</Text>
        <View className="w-10" />
      </View>

      <View className="flex-1 pt-16">
        {embedStatus === 'error' ? (
          <View className="flex-1 items-center justify-center p-6">
            <Text className="text-white font-display text-xl font-semibold mb-2 text-center">
              This video couldn&apos;t be loaded
            </Text>
            <Text className="text-slate-400 font-sans text-center mb-6">
              The video itself failed to load. You can try again, or pick a different video.
            </Text>
            <Pressable onPress={retryEmbed} className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full mb-3">
              <Text className="font-sans font-bold text-navy">Retry</Text>
            </Pressable>
            <Pressable onPress={goBack} className="px-6 py-3">
              <Text className="font-sans font-bold text-slate-300">Go Back</Text>
            </Pressable>
          </View>
        ) : isLandscape ? (
          <View className="flex-1">{embed}</View>
        ) : (
          <View>
            <View style={{ width: '100%', aspectRatio: 16 / 9 }} className="bg-black">
              {embed}
            </View>
            <View className="p-6">
              <Text className="text-white font-display text-xl font-semibold mb-2">{video.title}</Text>
              <Text className="text-slate-400 font-sans">
                Rotate your phone sideways to watch in fullscreen.
              </Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
