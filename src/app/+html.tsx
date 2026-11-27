import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// The root HTML for every exported page. Search engines and social
// platforms read this shell before any JavaScript runs, so the title,
// description, canonical address, sharing cards and structured data
// for the whole site live here. Page copy itself stays in the app.
const TITLE = 'English for Cricket — Learn English Through Cricket, Free for Every Learner';
const DESCRIPTION =
  'English for Cricket is a complete, free English-learning programme built around the game of cricket: 320 structured lessons in five stages, speaking practice with natural voice audio, guided reading, games and workbooks. Provided by KYCO, the Kansai Youth Cricket Organization. Free for every learner, always.';
const CANONICAL = 'https://englishforcricket.com/';
const OG_IMAGE = 'https://englishforcricket.com/og-image.png';

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Kansai Youth Cricket Organization',
      alternateName: 'KYCO',
      url: 'https://kyco.jp/',
    },
    {
      '@type': 'WebSite',
      name: 'English for Cricket',
      url: CANONICAL,
      inLanguage: 'en',
    },
    {
      '@type': 'Course',
      name: 'English for Cricket',
      description: DESCRIPTION,
      provider: {
        '@type': 'Organization',
        name: 'Kansai Youth Cricket Organization',
        sameAs: 'https://kyco.jp/',
      },
    },
  ],
};

export default function Root({ children }: PropsWithChildren) {
  // SDK 58 static rendering: a custom root HTML component MUST render
  // the generated document nodes, or the exported pages lose them.
  // headNodes carries the React Native Web stylesheet and the asset
  // preloads; bodyNodes carries the JavaScript bundles. Round 69
  // shipped this shell without them, so v69-v71 exported pages with
  // no CSS and no JS (unstyled, non-interactive). Fixed in Round 72.
  const { headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta
          name="keywords"
          content="learn English, English for cricket, cricket English, free English lessons, English lessons for children, ESL, EFL, learn English through sport, 子供 英語 無料, クリケット 英語"
        />
        <link rel="canonical" href={CANONICAL} />
        <meta name="theme-color" content="#0A192F" />
        {/* Installable app (Round 93): the manifest + touch icon let
            students add English for Cricket to their home screen,
            and the service worker (public/sw.js, registered by
            src/lib/offlineSupport.ts) lets it open offline. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="English for Cricket" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="English for Cricket" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(STRUCTURED_DATA)}</script>
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
