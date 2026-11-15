import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface VideoLecture {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
}

export default function VideosGallery() {
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
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-7xl mx-auto">
        <View className="mb-8">
          <Text className="text-4xl font-bold text-text-primary mb-2">Video Library</Text>
          <Text className="text-lg text-text-secondary">Watch and learn at your own pace.</Text>
        </View>

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0A192F" />
          </View>
        ) : videos.length === 0 ? (
          <View className="py-20 items-center justify-center bg-white rounded-2xl border border-slate-200">
            <Text className="text-6xl mb-4">📺</Text>
            <Text className="text-xl font-bold text-text-primary mb-2">No Videos Yet</Text>
            <Text className="text-text-secondary">Check back soon for new lessons!</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-6">
            {videos.map((video) => (
              <Link key={video.id} href={`/videos/${video.id}`} asChild>
                <Pressable className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {video.thumbnail_url ? (
                    <Image source={{ uri: video.thumbnail_url }} className="w-full h-48 bg-slate-100 object-cover" />
                  ) : (
                    <View className="w-full h-48 bg-slate-100 items-center justify-center">
                      <Text className="text-4xl">▶️</Text>
                    </View>
                  )}
                  <View className="p-5">
                    {video.category && (
                      <Text className="text-xs font-bold text-brand uppercase tracking-wider mb-1">
                        {video.category}
                      </Text>
                    )}
                    <Text className="text-xl font-bold text-text-primary mb-2" numberOfLines={1}>
                      {video.title}
                    </Text>
                    <Text className="text-text-secondary text-sm" numberOfLines={2}>
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