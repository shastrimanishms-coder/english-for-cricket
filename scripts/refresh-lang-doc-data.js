/* Round 100: refresh the checked-in snapshot of the long-form page
 * translations that the static language pages are generated from.
 *
 * The Support / Terms / Privacy texts live in the Supabase
 * `page_translations` table (edited in Admin → Pages & Translations).
 * scripts/generate-lang-pages.js renders the static /<lang>/ pages
 * from the snapshot in scripts/lang-doc-data.json so builds stay
 * reproducible and offline; run this script after editing the
 * translations in the admin, then rebuild, to update the static
 * pages:
 *
 *   node scripts/refresh-lang-doc-data.js
 *   npx expo export            (or however the dist is produced)
 *   node scripts/make-dist.js <zip>
 *
 * Reads go through the public REST API with the anon key from .env —
 * the same public read the app itself performs. The English master
 * rows of the `pages` table are captured too, as the final fallback
 * (mirroring the app: translation row → English translation row →
 * pages master).
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'lang-doc-data.json');
const SLUGS = ['support-page', 'terms-and-conditions', 'privacy-policy'];
const LANGS = ['en', 'ja', 'hi', 'ur', 'ps', 'sw', 'de', 'zu'];

function readEnv() {
  const env = {};
  const file = path.join(repoRoot, '.env');
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function getJson(url, key) {
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

(async () => {
  const env = readEnv();
  const base = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('.env is missing the Supabase URL or anon key');

  const slugFilter = `slug=in.(${SLUGS.join(',')})`;
  const translations = await getJson(
    `${base}/rest/v1/page_translations?select=slug,lang,title,body&${slugFilter}&order=slug,lang`,
    key
  );
  const masters = await getJson(
    `${base}/rest/v1/pages?select=slug,title,content&${slugFilter}`,
    key
  );

  const documents = {};
  for (const slug of SLUGS) documents[slug] = { translations: {}, master: null };
  for (const row of translations) {
    if (!documents[row.slug]) continue;
    documents[row.slug].translations[row.lang] = { title: row.title, body: row.body };
  }
  for (const row of masters) {
    if (!documents[row.slug]) continue;
    documents[row.slug].master = { title: row.title, body: row.content };
  }

  const missing = [];
  for (const slug of SLUGS) {
    for (const lang of LANGS) {
      if (!documents[slug].translations[lang]) missing.push(`${slug}/${lang}`);
    }
    if (!documents[slug].master) missing.push(`${slug}/pages-master`);
  }

  const snapshot = {
    about:
      'Snapshot of page_translations (Support, Terms & Conditions, Privacy Policy) ' +
      'for the static language pages. Refresh with scripts/refresh-lang-doc-data.js ' +
      'after editing translations in Admin → Pages & Translations, then rebuild.',
    fetchedAt: new Date().toISOString(),
    slugs: SLUGS,
    langs: LANGS,
    documents,
  };
  fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`wrote ${OUT}`);
  console.log(
    `translations: ${translations.length} rows; masters: ${masters.length} rows`
  );
  if (missing.length) {
    console.log(`MISSING (generator will fall back to English): ${missing.join(', ')}`);
  } else {
    console.log('all 8 languages present for all 3 documents');
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
