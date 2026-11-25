import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  LANDING_LOCALES,
  type LandingLocale,
} from '../../lib/landingStrings';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

// Pages & Translations (Round 78, migration 32). One editor for
// every long-form page that can appear in the visitor's home-page
// language: the legal documents, the Support page's static text and
// the six "How to use" help texts. English is the master - a
// language with no saved row simply shows English to visitors, so a
// translation only goes live when it is saved here on purpose.

const DOCUMENTS: { slug: string; label: string }[] = [
  { slug: 'terms-and-conditions', label: 'Terms & Conditions' },
  { slug: 'privacy-policy', label: 'Privacy Policy' },
  { slug: 'support-page', label: 'Support Page' },
  { slug: 'help-learning-path', label: 'Help: Learning Path' },
  { slug: 'help-reading', label: 'Help: Smart Reading' },
  { slug: 'help-speaking', label: 'Help: Speaking Practice' },
  { slug: 'help-games', label: 'Help: Games' },
  { slug: 'help-videos', label: 'Help: Videos' },
  { slug: 'help-downloads', label: 'Help: Downloads' },
];

interface TranslationRow {
  title: string;
  body: string;
}

export default function PageTranslationsManager() {
  const [slug, setSlug] = useState(DOCUMENTS[0].slug);
  const [lang, setLang] = useState<LandingLocale>('en');
  const [rows, setRows] = useState<Record<string, TranslationRow>>({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const fetchRows = useCallback(async (forSlug: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('page_translations')
        .select('lang, title, body')
        .eq('slug', forSlug);
      if (error) throw error;
      const map: Record<string, TranslationRow> = {};
      (data || []).forEach((row: { lang: string; title: string; body: string }) => {
        map[row.lang] = { title: row.title, body: row.body };
      });
      setRows(map);
      // Refresh the editors for whichever language is selected now.
      setLang((current) => {
        const row = map[current];
        setTitle(row?.title ?? '');
        setBody(row?.body ?? '');
        return current;
      });
      setSavedNote(null);
    } catch (error: any) {
      Alert.alert(
        'Could not load translations',
        `${error.message}\n\nIf the table is missing, run migration 32 first.`
      );
      setRows({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchRows(slug);
    })();
  }, [slug, fetchRows]);

  // Switching language loads that row into the editors (handler,
  // not an effect, so unsaved edits are never silently overwritten).
  const selectLang = (next: LandingLocale) => {
    setLang(next);
    const row = rows[next];
    setTitle(row?.title ?? '');
    setBody(row?.body ?? '');
    setSavedNote(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedNote(null);
    try {
      const { error } = await supabase.from('page_translations').upsert(
        {
          slug,
          lang,
          title: title.trim(),
          body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug,lang' }
      );
      if (error) throw error;
      setRows((prev) => ({ ...prev, [lang]: { title: title.trim(), body } }));
      setSavedNote(
        lang === 'en'
          ? 'Saved. This is the master text visitors fall back to.'
          : 'Saved. Visitors who chose this language on the home page now see it.'
      );
    } catch (error: any) {
      Alert.alert('Save failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Remove this translation?',
      'Visitors will see the English text for this page instead. The English master is never removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('page_translations')
                .delete()
                .eq('slug', slug)
                .eq('lang', lang);
              if (error) throw error;
              setRows((prev) => {
                const next = { ...prev };
                delete next[lang];
                return next;
              });
            } catch (error: any) {
              Alert.alert('Remove failed', error.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View>
      <Text className="font-display text-3xl font-semibold text-navy mb-2">
        Pages &amp; Translations
      </Text>
      <Text className="font-sans text-slate-500 mb-6 max-w-3xl">
        The legal pages, the Support page text and the “How to use” help texts, in the
        eight home-page languages. <Text className="font-bold">English is the master text</Text> —
        a language with no saved translation shows English, so nothing unfinished can go live
        by accident.
      </Text>

      {/* Document picker */}
      <View className="flex-row flex-wrap gap-2 mb-4">
        {DOCUMENTS.map((doc) => {
          const selected = slug === doc.slug;
          return (
            <Pressable
              key={doc.slug}
              onPress={() => setSlug(doc.slug)}
              className={`px-4 py-2.5 rounded-full border ${
                selected ? 'bg-navy border-navy' : 'bg-white border-inkline'
              }`}
            >
              <Text className={`font-sans font-bold text-sm ${selected ? 'text-white' : 'text-navy'}`}>
                {doc.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Language tabs */}
      <View className="flex-row flex-wrap gap-2 mb-6">
        {LANDING_LOCALES.map((l) => {
          const selected = lang === l.code;
          const has = !!rows[l.code];
          return (
            <Pressable
              key={l.code}
              onPress={() => selectLang(l.code)}
              className={`px-4 py-2.5 rounded-full border ${
                selected ? 'bg-gold border-gold' : 'bg-white border-inkline'
              }`}
            >
              <Text className={`font-sans font-bold text-sm ${selected ? 'text-navy' : 'text-slate-600'}`}>
                {l.label}
                {l.code === 'en' ? ' (master)' : ''}
                {has ? ' ●' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator size="large" color="#0A192F" />
        </View>
      ) : (
        <View className="bg-white rounded-[20px] border border-inkline shadow-sm p-6 max-w-4xl">
          {!rows[lang] && lang !== 'en' ? (
            <Text className="font-sans text-slate-500 mb-4">
              No {LANDING_LOCALES.find((l) => l.code === lang)?.label} translation yet —
              visitors see the English text. Type or paste the translation and save to publish it.
            </Text>
          ) : null}

          <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Title</Text>
          <TextInput
            className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy mb-4"
            value={title}
            onChangeText={setTitle}
            placeholder="Page title"
            placeholderTextColor="#94A3B8"
          />

          <Text className="font-sans text-sm font-semibold text-slate-500 mb-2">Body</Text>
          <TextInput
            className="w-full bg-white p-4 rounded-xl border border-inkline font-sans text-navy min-h-[320px] mb-4"
            value={body}
            onChangeText={setBody}
            placeholder="Page text"
            placeholderTextColor="#94A3B8"
            multiline
            textAlignVertical="top"
          />

          <Text className="font-sans text-sm text-slate-400 mb-5">
            Format: paragraphs are separated by a blank line. A line starting with “# ”,
            “## ” or “### ” becomes a heading; lines starting with “- ” become a bullet
            list; **bold** and *italic* work inside text.{'\n'}
            Help pages: use a “## How to use” heading with “- ” step lines, then a
            “## Tips for best results” heading with “- ” tip lines (translate the headings
            with the text).{'\n'}
            Support page: the body is four short parts separated by a line containing
            only --- : (1) intro under the title, (2) note above the contact form,
            (3) “Still stuck?” email note, (4) empty-FAQs note.
          </Text>

          {savedNote ? (
            <Text className="font-sans text-green-700 font-semibold mb-4">✓ {savedNote}</Text>
          ) : null}

          <View className="flex-row items-center gap-3">
            <AnimatedButton
              title={saving ? 'Saving...' : 'Save'}
              onPress={handleSave}
              disabled={saving}
              variant="primary"
            />
            {lang !== 'en' && rows[lang] ? (
              <Pressable
                onPress={handleDelete}
                className="px-5 py-3 rounded-full border border-red-200 bg-red-50"
              >
                <Text className="font-sans font-bold text-red-600">Remove translation</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
