import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, GoldButton, MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
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
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="Resources" onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-5xl mx-auto">
        <View className="mb-8">
          <MicroLabel className="mb-2">Downloads</MicroLabel>
          <Text className="font-sans text-lg text-slate-500">Download worksheets, guides, and study materials.</Text>
        </View>

        {/* Standing notice: more downloads are always on the way. */}
        <View className="flex-row items-center gap-3 bg-navy rounded-2xl px-5 py-4 mb-6">
          <Ionicons name="time-outline" size={22} color="#D4AF37" />
          <Text className="flex-1 font-sans text-sm text-white">
            We are working on more downloads — new ones will be available soon. Thank you for waiting!
          </Text>
        </View>

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0A192F" />
          </View>
        ) : downloads.length === 0 ? (
          <ElegantCard className="py-20 items-center justify-center px-6">
            <View className="w-20 h-20 rounded-full bg-navy items-center justify-center mb-4">
              <Ionicons name="document-text-outline" size={36} color="#D4AF37" />
            </View>
            <Text className="font-display text-xl font-semibold text-navy mb-2 text-center">Sorry, downloads are not ready yet</Text>
            <Text className="font-sans text-slate-500 text-center">
              We are working hard on them, and they will be here soon. Thank you for waiting — please come back and check again!
            </Text>
          </ElegantCard>
        ) : (
          <View className="flex-col gap-4">
            {downloads.map((item) => (
              <ElegantCard key={item.id} className="flex-col md:flex-row items-start md:items-center p-5 gap-4">
                <View className="w-14 h-14 rounded-full bg-navy items-center justify-center">
                  <Ionicons name="download-outline" size={26} color="#D4AF37" />
                </View>

                <View className="flex-1">
                  {item.category && (
                    <Text className="font-sans text-[11px] font-bold text-gold-dark uppercase tracking-[2px] mb-1">
                      {item.category}
                    </Text>
                  )}
                  <Text className="font-sans text-lg font-bold text-navy mb-1">
                    {item.title}
                  </Text>
                  <Text className="font-sans text-slate-500 text-sm" numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>

                <GoldButton
                  label="Download"
                  onPress={() => handleDownload(item)}
                  className="w-full md:w-auto mt-2 md:mt-0"
                />
              </ElegantCard>
            ))}
          </View>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}