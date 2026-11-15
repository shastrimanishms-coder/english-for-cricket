import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';

interface VideoDetails {
  id: string;
  title: string;
  video_url: string;
}

export default function VideoPlayer() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState<number>(Date.now());

  useEffect(() => {
    fetchVideoDetails();
    
    // Telemetry: Log watch time when the component unmounts
    return () => {
      logWatchTime();
    };
  }, [id]);

  const fetchVideoDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('video_lectures')
        .select('id, title, video_url')
        .eq('id', id)
        .single();

      if (error) throw error;
      setVideo(data);
    } catch (error) {
      console.error('Error fetching video:', error);
    } finally {
      setLoading(false);
    }
  };

  const logWatchTime = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; 

      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', session.user.id).single();
      if (profile?.role !== 'individual_learner') return;

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      if (durationSeconds < 10) return; // Ignore quick bounces

      await supabase.from('activity_logs').insert([{
        student_id: session.user.id,
        activity_type: 'video',
        target_id: id,
        duration_seconds: durationSeconds
      }]);
    } catch (error) {
      console.log('Telemetry error:', error);
    }
  };

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
        {Platform.OS === 'web' ? (
          <iframe 
            src={getEmbedUrl(video.video_url)} 
            style={{ width: '100%', height: '100%', border: 'none' }} 
            title={video.title}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        ) : (
          <WebView 
            source={{ uri: getEmbedUrl(video.video_url) }} 
            className="flex-1"
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
          />
        )}
      </View>
    </View>
  );
}