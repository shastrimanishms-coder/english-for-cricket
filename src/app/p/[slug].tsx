import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard } from '../../components/ui/Elegant';
import { renderRichText } from '../../components/ui/RichText';
import { fetchPageTranslation, isRTLLang } from '../../lib/pageTranslations';
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

        // Round 78: when a translation of this page exists in the
        // language the visitor chose on the home page, it replaces
        // the English master from the pages table. English content
        // stays the fallback for every other case.
        let resolved = data;
        const translation = await fetchPageTranslation(String(slug));
        if (translation) {
          resolved = {
            ...data,
            title: translation.title || data.title,
            content: translation.body || data.content,
            lang: translation.lang,
          };
        }
        setPage(resolved);
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
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  if (!page) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="font-display text-xl font-semibold text-navy">Page Not Found</Text>
        <Text className="font-sans text-slate-500 mt-2">The page you are looking for does not exist.</Text>
      </View>
    );
  }

  const rtl = isRTLLang(typeof page.lang === 'string' ? page.lang : 'en');

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
    <ScrollView className="flex-1">
      <Stack.Screen options={{ title: page.title }} />
      <View className="max-w-3xl w-full mx-auto p-4 md:p-8">
        {/* Same "Back to Home" link as the login/register screens.
            Buttons stay in English in every language (Shastri's
            standing rule), even when the page body is translated. */}
        <Link href="/" asChild>
          <Pressable className="self-start mb-4 py-2 pr-3">
            <Text className="font-sans text-navy font-semibold text-base">← Back to Home</Text>
          </Pressable>
        </Link>
        <ElegantCard className="p-6 md:p-10">
          <Text
            className="font-display text-3xl md:text-4xl font-semibold text-navy mb-8"
            style={rtl ? { textAlign: 'right' } : undefined}
          >
            {page.title}
          </Text>
          <View style={rtl ? ({ direction: 'rtl' } as object) : undefined}>
            {renderRichText(typeof page.content === 'string' ? page.content : '')}
          </View>
        </ElegantCard>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}
