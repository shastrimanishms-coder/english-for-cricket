import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { awardExtraIfTagged } from '../../lib/extras';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';
import { useSafeBack } from '../../lib/useSafeBack';

interface DownloadItem {
  id: string;
  title: string;
  description: string;
  file_url: string;
  category: string;
  lesson_id?: string | null;
}

export default function DownloadsGallery() {
  const goBack = useSafeBack();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDownloads = async () => {
      try {
        let { data, error } = await supabase
          .from('downloads')
          .select('id, title, description, file_url, lesson_id, categories(name)')
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (error && /lesson_id/.test(error.message)) {
          // Migration 17 not run yet: the tag column does not exist.
          const retry = await supabase
            .from('downloads')
            .select('id, title, description, file_url, categories(name)')
            .eq('is_published', true)
            .order('created_at', { ascending: false });
          data = retry.data as typeof data;
          error = retry.error;
        }

        if (error) throw error;
        
        const formattedData = data?.map(item => ({
          ...item,
          category: item.categories ? (item.categories as any).name : 'Uncategorized'
        }));
        
        setDownloads(formattedData || []);
      } catch (error) {
        console.error('Error fetching downloads:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDownloads();
  }, []);

  const handleDownload = async (item: DownloadItem) => {
    try {
      const supported = await Linking.canOpenURL(item.file_url);
      if (supported) {
        await Linking.openURL(item.file_url);
        // Opening a lesson-tagged download completes that lesson's
        // recommended extra (+3 stars, once per item). Fails soft.
        const identity = await getStudentIdentity();
        if (identity) await awardExtraIfTagged(identity, 'download', item.id, item.lesson_id);
      } else {
        Alert.alert('Error', 'Cannot open this file type on your device.');
      }
    } catch (error: any) {
      Alert.alert('Download Failed', error.message);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-5xl mx-auto">
        <Pressable onPress={goBack} className="self-start px-4 py-2 bg-slate-200 rounded-lg mb-4">
          <Text className="font-bold text-slate-700">← Back</Text>
        </Pressable>
        <View className="mb-8">
          <Text className="text-4xl font-bold text-text-primary mb-2">Resources</Text>
          <Text className="text-lg text-text-secondary">Download worksheets, guides, and study materials.</Text>
        </View>

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0A192F" />
          </View>
        ) : downloads.length === 0 ? (
          <View className="py-20 items-center justify-center bg-white rounded-2xl border border-slate-200">
            <Text className="text-6xl mb-4">📄</Text>
            <Text className="text-xl font-bold text-text-primary mb-2">No Files Yet</Text>
            <Text className="text-text-secondary">Check back soon for new resources!</Text>
          </View>
        ) : (
          <View className="flex-col gap-4">
            {downloads.map((item) => (
              <View key={item.id} className="flex-col md:flex-row items-start md:items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm gap-4">
                <View className="w-16 h-16 bg-blue-50 rounded-xl items-center justify-center border border-blue-100">
                  <Text className="text-3xl">📥</Text>
                </View>
                
                <View className="flex-1">
                  {item.category && (
                    <Text className="text-xs font-bold text-brand uppercase tracking-wider mb-1">
                      {item.category}
                    </Text>
                  )}
                  <Text className="text-lg font-bold text-text-primary mb-1">
                    {item.title}
                  </Text>
                  <Text className="text-text-secondary text-sm" numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>

                <Pressable 
                  onPress={() => handleDownload(item)}
                  className="w-full md:w-auto px-6 py-3 bg-[#0A192F] rounded-lg items-center justify-center mt-2 md:mt-0"
                >
                  <Text className="text-white font-bold text-sm">Download</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}