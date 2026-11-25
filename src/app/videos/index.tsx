import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import { HelpButton } from '../../components/ui/HelpPopup';
import { supabase } from '../../lib/supabase';
import { useSafeBack } from '../../lib/useSafeBack';

interface VideoLecture {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
}

export default function VideosGallery() {
  const goBack = useSafeBack();
  const [videos, setVideos] = useState<VideoLecture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const { data, error } = await supabase
          .from('video_lectures')
          .select('id, title, description, thumbnail_url, categories(name)')
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        const formattedData = data?.map(item => ({
          ...item,
          category: item.categories ? (item.categories as any).name : 'Uncategorized'
        }));
        
        setVideos(formattedData || []);
      } catch (error) {
        console.error('Error fetching videos:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Video Library" onBack={goBack} right={<HelpButton slug="help-videos" />} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-7xl mx-auto">
        <View className="mb-8">
          <MicroLabel className="mb-2">Videos</MicroLabel>
          <Text className="font-sans text-lg text-slate-500">Watch and learn at your own pace.</Text>
        </View>

        {/* Standing notice: more videos are always on the way. */}
        <View className="flex-row items-center gap-3 bg-navy rounded-2xl px-5 py-4 mb-6">
          <Ionicons name="time-outline" size={22} color="#D4AF37" />
          <Text className="flex-1 font-sans text-sm text-white">
            We are working on more videos — new ones will be available soon. Thank you for waiting!
          </Text>
        </View>

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0A192F" />
          </View>
        ) : videos.length === 0 ? (
          <ElegantCard className="py-20 items-center justify-center px-6">
            <View className="w-20 h-20 rounded-full bg-navy items-center justify-center mb-4">
              <Ionicons name="play-circle-outline" size={38} color="#D4AF37" />
            </View>
            <Text className="font-display text-xl font-semibold text-navy mb-2 text-center">Sorry, videos are not ready yet</Text>
            <Text className="font-sans text-slate-500 text-center">
              We are working hard on them, and they will be here soon. Thank you for waiting — please come back and check again!
            </Text>
          </ElegantCard>
        ) : (
          <View className="flex-row flex-wrap gap-6">
            {videos.map((video) => (
              <Link key={video.id} href={`/videos/${video.id}`} asChild>
                <Pressable className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] bg-white rounded-[20px] border border-inkline shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {video.thumbnail_url ? (
                    <Image source={{ uri: video.thumbnail_url }} className="w-full h-48 bg-pitch-light object-cover" />
                  ) : (
                    <View className="w-full h-48 bg-pitch-light items-center justify-center">
                      <View className="w-16 h-16 rounded-full bg-navy items-center justify-center">
                        <Ionicons name="play" size={28} color="#D4AF37" />
                      </View>
                    </View>
                  )}
                  <View className="p-5">
                    {video.category && (
                      <Text className="font-sans text-[11px] font-bold text-gold-dark uppercase tracking-[2px] mb-1">
                        {video.category}
                      </Text>
                    )}
                    <Text className="font-display text-xl font-semibold text-navy mb-2" numberOfLines={1}>
                      {video.title}
                    </Text>
                    <Text className="font-sans text-slate-500 text-sm" numberOfLines={2}>
                      {video.description}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}