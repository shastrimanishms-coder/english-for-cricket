import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GhostButton, GoldButton, MicroLabel, NavyButton } from '../components/ui/Elegant';
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

  // Contact form state. Submissions are stored in the support_messages
  // table (migration 20261115000010) and read by the admin in the panel
  // inbox - there is no email service connected yet, so nothing is mailed.
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formSending, setFormSending] = useState(false);
  const [formSent, setFormSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSendMessage = async () => {
    const name = formName.trim();
    const email = formEmail.trim();
    const subject = formSubject.trim();
    const message = formMessage.trim();

    if (!name || !email || !message) {
      setFormError('Please fill in your name, email and message.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('That email address does not look right - please check it and try again.');
      return;
    }

    setFormSending(true);
    setFormError(null);
    try {
      const { error } = await supabase.from('support_messages').insert([
        { name, email, subject: subject || null, message },
      ]);
      if (error) throw error;
      // Best-effort email notification through the send-support-email
      // Edge Function (the owner's SMTP server). The database row above
      // is the record of truth - if the function is not deployed yet the
      // message is still safe in the admin inbox, so failures are ignored.
      try {
        await supabase.functions.invoke('send-support-email', {
          body: { name, email, subject: subject || undefined, message },
        });
      } catch {
        // Email notification is optional; the inbox copy already saved.
      }
      setFormName('');
      setFormEmail('');
      setFormSubject('');
      setFormMessage('');
      setFormSent(true);
    } catch {
      setFormError(
        'Sorry, your message could not be sent just now. Please try again in a moment' +
          (supportEmail ? `, or email us directly at ${supportEmail}.` : '.')
      );
    } finally {
      setFormSending(false);
    }
  };

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
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="max-w-3xl w-full mx-auto">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="font-display text-3xl md:text-4xl font-semibold text-navy">Help & Support</Text>
            <Pressable onPress={() => router.back()} className="px-4 py-2 bg-white border border-inkline rounded-full">
              <Text className="font-sans font-bold text-navy">← Back</Text>
            </Pressable>
          </View>
          <Text className="font-sans text-slate-500 text-lg mb-8">
            Answers to common questions about learning with English for Cricket.
          </Text>

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color="#0A192F" />
            </View>
          ) : faqs.length === 0 ? (
            <View className="py-16 items-center justify-center bg-white rounded-[20px] border border-inkline shadow-sm px-6">
              <Text className="text-5xl mb-4">❓</Text>
              <Text className="font-sans text-xl font-bold text-navy mb-2">No FAQs Yet</Text>
              <Text className="font-sans text-slate-500 text-center">
                Help articles are on the way. If you need a hand right now, contact us below.
              </Text>
            </View>
          ) : (
            sections.map((section) => (
              <View key={section.name} className="mb-8">
                <MicroLabel className="mb-3">{section.name}</MicroLabel>
                <View className="bg-white rounded-[20px] border border-inkline shadow-sm overflow-hidden">
                  {section.items.map((faq, idx) => {
                    const expanded = expandedId === faq.id;
                    return (
                      <View key={faq.id} className={idx !== section.items.length - 1 ? 'border-b border-inkline' : ''}>
                        <Pressable
                          onPress={() => setExpandedId(expanded ? null : faq.id)}
                          className="flex-row items-center justify-between p-4"
                        >
                          <Text className="font-sans font-bold text-navy text-base flex-1 pr-4">{faq.question}</Text>
                          <Text className="text-gold-dark font-bold">{expanded ? '▲' : '▼'}</Text>
                        </Pressable>
                        {expanded && (
                          <View className="px-4 pb-4">
                            <Text className="font-sans text-slate-500 leading-relaxed">{faq.answer}</Text>
                            {faq.video_url ? (
                              <Pressable onPress={() => Linking.openURL(faq.video_url!)}>
                                <Text className="font-sans text-gold-dark font-bold mt-3">▶ Watch the video guide</Text>
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

          {/* Contact form - submissions land in the admin panel inbox
              (support_messages table). Shown whether or not the FAQs
              loaded, and independent of the support email below. */}
          <View className="bg-white rounded-[20px] border border-inkline shadow-sm p-6 mb-8">
            <Text className="font-display text-2xl font-semibold text-navy mb-2">Send us a message</Text>
            {formSent ? (
              <View className="items-center py-6">
                <Text className="text-5xl mb-4">✅</Text>
                <Text className="font-sans text-lg font-bold text-navy mb-2">Message sent</Text>
                <Text className="font-sans text-slate-500 text-center mb-6">
                  Thank you for getting in touch - we usually reply within a few days.
                </Text>
                <GhostButton label="Send another message" onPress={() => setFormSent(false)} />
              </View>
            ) : (
              <View>
                <Text className="font-sans text-slate-500 mb-5">
                  Questions, feedback or ideas - write to us here and we will get back to you by email.
                </Text>

                <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Your name *</Text>
                <TextInput
                  className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy mb-4"
                  placeholder="e.g., Yuki Tanaka"
                  placeholderTextColor="#94A3B8"
                  value={formName}
                  onChangeText={setFormName}
                  maxLength={120}
                  editable={!formSending}
                />

                <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Your email *</Text>
                <TextInput
                  className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy mb-4"
                  placeholder="you@example.com"
                  placeholderTextColor="#94A3B8"
                  value={formEmail}
                  onChangeText={setFormEmail}
                  maxLength={254}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!formSending}
                />

                <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Subject (optional)</Text>
                <TextInput
                  className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy mb-4"
                  placeholder="What is this about?"
                  placeholderTextColor="#94A3B8"
                  value={formSubject}
                  onChangeText={setFormSubject}
                  maxLength={200}
                  editable={!formSending}
                />

                <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Message *</Text>
                <TextInput
                  className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy min-h-[120px] mb-4"
                  placeholder="How can we help?"
                  placeholderTextColor="#94A3B8"
                  value={formMessage}
                  onChangeText={setFormMessage}
                  maxLength={5000}
                  multiline
                  textAlignVertical="top"
                  editable={!formSending}
                />

                {formError && (
                  <Text className="font-sans text-red-600 font-semibold mb-4">{formError}</Text>
                )}

                <GoldButton
                  label={formSending ? 'Sending...' : '📩 Send message'}
                  onPress={handleSendMessage}
                  disabled={formSending}
                  className="self-start"
                />
              </View>
            )}
          </View>

          {/* Contact - only shown when a support email is configured
              in System Settings (site_settings.support_email). */}
          {supportEmail && (
            <View className="bg-white rounded-[20px] border border-inkline shadow-sm p-6 items-center">
              <Text className="font-display text-2xl font-semibold text-navy mb-2">Still stuck?</Text>
              <Text className="font-sans text-slate-500 text-center mb-4">
                Send us an email and we will get back to you.
              </Text>
              <NavyButton
                label={`✉️ ${supportEmail}`}
                onPress={() => Linking.openURL(`mailto:${supportEmail}`)}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
