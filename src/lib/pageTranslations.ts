import { Platform } from 'react-native';
import {
  LANDING_LOCALES,
  LANDING_LANG_STORAGE_KEY,
  RTL_LOCALES,
  type LandingLocale,
} from './landingStrings';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Page translations (Round 78, migration 32).
//
// Long-form pages - the legal documents, the Support page's static
// text and the "How to use" help texts - live in page_translations,
// one row per (slug, language). English is the master. A visitor sees
// the language they picked on the home page: the landing screen
// stores that choice in localStorage under efc_landing_lang (web).
// When no row exists in that language, English is shown instead.
// On native there is no stored landing choice, so English is used.
// ---------------------------------------------------------------------------

export interface PageTranslation {
  slug: string;
  lang: string;
  title: string;
  body: string;
}

/** The language the visitor chose on the home page (web only). */
export function getStoredLandingLang(): LandingLocale {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(LANDING_LANG_STORAGE_KEY);
      if (saved && LANDING_LOCALES.some((l) => l.code === saved)) {
        return saved as LandingLocale;
      }
    } catch {
      // A browser that refuses storage simply gets English.
    }
  }
  return 'en';
}

export function isRTLLang(lang: string): boolean {
  return (RTL_LOCALES as string[]).includes(lang);
}

/**
 * The translation of a page for the visitor's landing language,
 * falling back to the English row, then to null (callers then use
 * their built-in English defaults). Fails soft: any error - for
 * example the table not existing yet - returns null.
 */
export async function fetchPageTranslation(
  slug: string
): Promise<PageTranslation | null> {
  const lang = getStoredLandingLang();
  try {
    if (lang !== 'en') {
      const { data, error } = await supabase
        .from('page_translations')
        .select('slug, lang, title, body')
        .eq('slug', slug)
        .eq('lang', lang)
        .maybeSingle();
      if (!error && data) return data as PageTranslation;
    }
    const { data, error } = await supabase
      .from('page_translations')
      .select('slug, lang, title, body')
      .eq('slug', slug)
      .eq('lang', 'en')
      .maybeSingle();
    if (!error && data) return data as PageTranslation;
  } catch {
    // Translations are a nicety; the English defaults cover failures.
  }
  return null;
}
