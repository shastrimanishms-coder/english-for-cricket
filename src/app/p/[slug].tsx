import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

/**
 * Minimal, safe rich-text rendering for CMS page content. The content is
 * parsed into React Native elements - it is never injected as HTML.
 * Supported markup (anything else renders as literal text):
 *  - Paragraphs are split on blank lines; single line breaks inside a
 *    paragraph are preserved.
 *  - Lines starting '# ', '## ' or '### ' are headings.
 *  - Consecutive lines starting '- ' or '* ' form a bullet list.
 *  - **bold** and *italic* spans work inline.
 * Content without any markup renders as the same plain paragraphs it
 * always did.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <Text key={key} className="font-bold">
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <Text key={key} className="italic">
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

function renderRichText(content: string): ReactNode {
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks.map((block, blockIndex) => {
    const key = `block-${blockIndex}`;
    const lines = block.split('\n');

    if (lines.length === 1) {
      const line = lines[0];
      if (line.startsWith('### ')) {
        return (
          <Text key={key} className="text-lg font-bold text-[#0A192F] mt-4 mb-3">
            {renderInline(line.slice(4), key)}
          </Text>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <Text key={key} className="text-xl font-bold text-[#0A192F] mt-5 mb-3">
            {renderInline(line.slice(3), key)}
          </Text>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <Text key={key} className="text-2xl font-bold text-[#0A192F] mt-6 mb-3">
            {renderInline(line.slice(2), key)}
          </Text>
        );
      }
    }

    const isBulletList = lines.every((line) => line.startsWith('- ') || line.startsWith('* '));
    if (isBulletList) {
      return (
        <View key={key} className="mb-4">
          {lines.map((line, lineIndex) => (
            <View key={`${key}-${lineIndex}`} className="flex-row mb-1.5">
              <Text className="text-base text-slate-700 leading-relaxed mr-2">•</Text>
              <Text className="flex-1 text-base text-slate-700 leading-relaxed">
                {renderInline(line.slice(2), `${key}-${lineIndex}`)}
              </Text>
            </View>
          ))}
        </View>
      );
    }

    return (
      <Text key={key} className="text-base text-slate-700 leading-relaxed mb-4">
        {renderInline(block, key)}
      </Text>
    );
  });
}

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
    <SafeAreaView edges={['top']} className="flex-1 bg-slate-50">
    <ScrollView className="flex-1">
      <Stack.Screen options={{ title: page.title }} />
      <View className="max-w-3xl w-full mx-auto p-6 md:p-12">
        <Text className="text-3xl md:text-4xl font-bold text-[#0A192F] mb-8">{page.title}</Text>
        <View>{renderRichText(typeof page.content === 'string' ? page.content : '')}</View>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}