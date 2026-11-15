import { useCallback, useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { supabase } from './supabase';

// The bundled default logo (KYCO crest), used whenever no custom logo
// has been uploaded in Admin → System Settings.
export const DEFAULT_APP_LOGO: ImageSourcePropType = require('../../assets/images/logo-crest.png');

/**
 * Resolves the effective app/web logo.
 *
 * Admins can upload a replacement logo in System Settings; its public
 * URL is stored in site_settings under `app_logo_url`. When that setting
 * is empty — or the remote image fails to load — the bundled crest is
 * used instead, so the header never shows a broken image.
 *
 * Returns the Image `source` to render plus an `onError` handler that
 * must be attached to the same <Image> so a dead remote URL falls back
 * to the bundled crest.
 */
export function useAppLogo() {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'app_logo_url')
          .maybeSingle();
        if (!cancelled && !error) {
          const url = (data?.value || '').trim();
          setRemoteUrl(url ? url : null);
        }
      } catch {
        // Settings unreadable: stay on the bundled default logo.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onError = useCallback(() => {
    setLoadFailed(true);
  }, []);

  const isCustom = !!remoteUrl && !loadFailed;
  const source: ImageSourcePropType = isCustom ? { uri: remoteUrl as string } : DEFAULT_APP_LOGO;

  return { source, onError, isCustom, remoteUrl };
}
