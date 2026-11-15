import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function StaticPageView() {
  const { slug } = useLocalSearchParams();
  const [page, setPage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPage() {
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('*')
          .eq('slug', slug)
          .single();
        
        if (error) throw error;
        setPage(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchPage();
  }, [slug]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  if (!page) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-xl font-bold text-[#0A192F]">Page Not Found</Text>
        <Text className="text-slate-500 mt-2">The page you are looking for does not exist.</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: page.title }} />
      <View className="max-w-3xl w-full mx-auto p-6 md:p-12">
        <Text className="text-3xl md:text-4xl font-bold text-[#0A192F] mb-8">{page.title}</Text>
        <Text className="text-base text-slate-700 leading-relaxed">
          {page.content}
        </Text>
      </View>
    </ScrollView>
  );
}