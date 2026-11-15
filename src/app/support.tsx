import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

interface FAQ {
  id: string;
  section_name: string;
  question: string;
  answer: string;
  video_url: string | null;
  order_index: number;
}

// Learner-facing Help Center. Content is managed in the admin panel
// (Support & FAQs). support_faqs has no publish flag, so every row the
// admin saves is shown here, grouped by section.
export default function SupportScreen() {
  const router = useRouter();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSupport = useCallback(async () => {
    try {
      setLoading(true);
      const [faqRes, settingsRes] = await Promise.all([
        supabase
          .from('support_faqs')
          .select('id, section_name, question, answer, video_url, order_index')
          .order('section_name', { ascending: true })
          .order('order_index', { ascending: true }),
        supabase.from('site_settings').select('key, value'),
      ]);

      if (!faqRes.error) setFaqs(faqRes.data || []);

      if (!settingsRes.error && settingsRes.data) {
        const map: Record<string, string> = {};
        settingsRes.data.forEach((row: { key: string; value: string }) => {
          map[row.key] = row.value;
        });
        setSupportEmail(map['support_email'] || null);
      }
    } catch (error) {
      console.error('Error loading support content:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchSupport();
    })();
  }, [fetchSupport]);

  const sections: { name: string; items: FAQ[] }[] = [];
  faqs.forEach((faq) => {
    const existing = sections.find((s) => s.name === faq.section_name);
    if (existing) existing.items.push(faq);
    else sections.push({ name: faq.section_name || 'General', items: [faq] });
  });

  return (
    <View className="flex-1 bg-surface-background">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="max-w-3xl w-full mx-auto">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-3xl md:text-4xl font-bold text-text-primary">Help & Support</Text>
            <Pressable onPress={() => router.back()} className="px-4 py-2 bg-slate-200 rounded-lg">
              <Text className="font-bold text-slate-700">← Back</Text>
            </Pressable>
          </View>
          <Text className="text-text-secondary text-lg mb-8">
            Answers to common questions about learning with English for Cricket.
          </Text>

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color="#0A192F" />
            </View>
          ) : faqs.length === 0 ? (
            <View className="py-16 items-center justify-center bg-white rounded-2xl border border-slate-200 px-6">
              <Text className="text-5xl mb-4">❓</Text>
              <Text className="text-xl font-bold text-text-primary mb-2">No FAQs Yet</Text>
              <Text className="text-text-secondary text-center">
                Help articles are on the way. If you need a hand right now, contact us below.
              </Text>
            </View>
          ) : (
            sections.map((section) => (
              <View key={section.name} className="mb-8">
                <Text className="text-sm font-bold text-brand uppercase tracking-wider mb-3">{section.name}</Text>
                <View className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {section.items.map((faq, idx) => {
                    const expanded = expandedId === faq.id;
                    return (
                      <View key={faq.id} className={idx !== section.items.length - 1 ? 'border-b border-slate-100' : ''}>
                        <Pressable
                          onPress={() => setExpandedId(expanded ? null : faq.id)}
                          className="flex-row items-center justify-between p-4"
                        >
                          <Text className="font-bold text-text-primary text-base flex-1 pr-4">{faq.question}</Text>
                          <Text className="text-slate-400 font-bold">{expanded ? '▲' : '▼'}</Text>
                        </Pressable>
                        {expanded && (
                          <View className="px-4 pb-4">
                            <Text className="text-text-secondary leading-relaxed">{faq.answer}</Text>
                            {faq.video_url ? (
                              <Pressable onPress={() => Linking.openURL(faq.video_url!)}>
                                <Text className="text-action font-bold mt-3">▶ Watch the video guide</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}

          {/* Contact - only shown when a support email is configured
              in System Settings (site_settings.support_email). */}
          {supportEmail && (
            <View className="bg-white rounded-2xl border border-slate-200 p-6 items-center">
              <Text className="text-xl font-bold text-text-primary mb-2">Still stuck?</Text>
              <Text className="text-text-secondary text-center mb-4">
                Send us an email and we will get back to you.
              </Text>
              <Pressable
                onPress={() => Linking.openURL(`mailto:${supportEmail}`)}
                className="px-6 py-3 bg-brand rounded-xl"
              >
                <Text className="text-white font-bold">✉️ {supportEmail}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
