import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { HELP_TEXTS_EN } from '../../lib/helpTexts';
import {
  fetchPageTranslation,
  isRTLLang,
  type PageTranslation,
} from '../../lib/pageTranslations';
import { renderRichText } from './RichText';

// ---------------------------------------------------------------------------
// "How to use" help (Round 78). A small button for the navy screen
// headers; tapping it opens a popup with the feature's steps and
// tips. The text lives in page_translations (slugs help-*) so the
// admin can edit it in every language; the popup speaks the language
// the visitor chose on the home page and falls back to the built-in
// English master. The Close button sits at the BOTTOM of the popup,
// as requested. Button labels stay in English in every language
// (Shastri's standing rule); only the help text itself translates.
// ---------------------------------------------------------------------------

export function HelpButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<PageTranslation | null>(null);

  const openPopup = useCallback(async () => {
    setOpen(true);
    if (content) return;
    setLoading(true);
    const row = await fetchPageTranslation(slug);
    if (row) setContent(row);
    setLoading(false);
  }, [content, slug]);

  const fallback = HELP_TEXTS_EN[slug];
  const title = content?.title || fallback?.title || 'How to use';
  const body = content?.body || fallback?.body || '';
  const rtl = isRTLLang(content?.lang ?? 'en');

  return (
    <>
      <Pressable
        onPress={openPopup}
        className="flex-row items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-2 active:bg-white/20"
        accessibilityLabel="How to use"
      >
        <Text className="font-sans text-sm font-bold text-gold">?</Text>
        <Text className="font-sans text-sm font-bold text-white">How to use</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 items-center justify-center bg-navy/70 p-5">
          <View className="w-full max-w-lg overflow-hidden rounded-[20px] bg-white shadow-lg">
            <View className="bg-navy px-6 py-4">
              <Text
                className="font-display text-xl font-semibold text-white"
                style={rtl ? { textAlign: 'right' } : undefined}
              >
                {title}
              </Text>
            </View>

            {loading && !content ? (
              <View className="items-center py-14">
                <ActivityIndicator size="large" color="#0A192F" />
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 420 }}
                contentContainerStyle={{ padding: 24 }}
              >
                <View style={rtl ? ({ direction: 'rtl' } as object) : undefined}>
                  {renderRichText(body)}
                </View>
              </ScrollView>
            )}

            {/* Close lives at the bottom of the popup, as requested. */}
            <View className="border-t border-inkline px-6 py-4">
              <Pressable
                onPress={() => setOpen(false)}
                className="items-center rounded-full bg-gold px-6 py-3.5 active:opacity-90"
              >
                <Text className="font-sans text-base font-bold text-navy">Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
