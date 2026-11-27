/* Round 100: generate the static language pages into an exported
 * dist/ — seven landing pages (/ja/ … /zu/) plus, per language, the
 * Support, Terms & Conditions and Privacy Policy documents
 * (/ja/support/, /ja/terms-and-conditions/, /ja/privacy-policy/ …).
 *
 * Why: the app's home page holds all eight languages inside one
 * single-page-app URL with English-only meta, so search engines
 * could only ever index the English version. These pages are real
 * static HTML — correct lang/dir, translated title + description,
 * self-canonical, Open Graph tags and a full hreflang set — with
 * visible content in each language and English call-to-action
 * buttons into the app (buttons stay in English in every language,
 * Shastri's standing rule).
 *
 * Sources of truth (nothing is hand-copied, so nothing can drift):
 *   - Landing text: src/lib/landingStrings.ts, loaded by
 *     transpiling it with the project's own TypeScript compiler
 *     and reading its LANDING_STRINGS export.
 *   - Document text: scripts/lang-doc-data.json, a checked-in
 *     snapshot of the Supabase page_translations table. Refresh it
 *     with scripts/refresh-lang-doc-data.js after editing the
 *     translations in Admin → Pages & Translations, then rebuild.
 *     A document/language with no stored translation falls back to
 *     the English row (then the pages-table master), exactly like
 *     the app, and every fallback is printed in the build report.
 *
 * Usage: node scripts/generate-lang-pages.js [distDir]
 * Wired into scripts/make-dist.js; also runnable standalone after
 * `npx expo export`.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, 'dist');
if (!fs.existsSync(distDir)) {
  console.error(`dist directory not found: ${distDir}`);
  process.exit(1);
}

const SITE = 'https://englishforcricket.com';
const LANGS = ['ja', 'hi', 'ur', 'ps', 'sw', 'de', 'zu'];
const ALL_LANGS = ['en', ...LANGS];
const RTL = new Set(['ur', 'ps']);
const OG_LOCALES = {
  en: 'en_US', ja: 'ja_JP', hi: 'hi_IN', ur: 'ur_PK',
  ps: 'ps_AF', sw: 'sw_KE', de: 'de_DE', zu: 'zu_ZA',
};
// The site's keyword set, mirroring src/app/+html.tsx (a fixed site
// string, not a translation).
const KEYWORDS =
  'learn English, English for cricket, cricket English, free English lessons, English lessons for children, ESL, EFL, learn English through sport, 子供 英語 無料, クリケット 英語';

// ---------------------------------------------------------------------------
// Load the landing translations from src/lib/landingStrings.ts.
// ---------------------------------------------------------------------------
function loadLandingStrings() {
  const ts = require('typescript');
  const file = path.join(repoRoot, 'src/lib/landingStrings.ts');
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: 'landingStrings.ts',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, require);
  if (!mod.exports.LANDING_STRINGS || !mod.exports.LANDING_LOCALES) {
    throw new Error('landingStrings.ts did not export LANDING_STRINGS/LANDING_LOCALES');
  }
  return mod.exports;
}

const { LANDING_STRINGS, LANDING_LOCALES } = loadLandingStrings();
const LANG_LABELS = Object.fromEntries(LANDING_LOCALES.map((l) => [l.code, l.label]));

// ---------------------------------------------------------------------------
// Load the document snapshot.
// ---------------------------------------------------------------------------
const snapshot = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lang-doc-data.json'), 'utf8')
);

const DOCS = [
  { slug: 'support-page', path: 'support', enUrl: `${SITE}/support` },
  { slug: 'terms-and-conditions', path: 'terms-and-conditions', enUrl: `${SITE}/p/terms-and-conditions` },
  { slug: 'privacy-policy', path: 'privacy-policy', enUrl: `${SITE}/p/privacy-policy` },
];

const fallbacks = [];
function resolveDoc(slug, lang) {
  const doc = snapshot.documents[slug];
  if (!doc) throw new Error(`snapshot has no document ${slug}`);
  if (doc.translations[lang]) return { ...doc.translations[lang], sourceLang: lang };
  if (doc.translations.en) {
    fallbacks.push(`${slug}/${lang} -> en translation row`);
    return { ...doc.translations.en, sourceLang: 'en' };
  }
  if (doc.master) {
    fallbacks.push(`${slug}/${lang} -> pages-table English master`);
    return { ...doc.master, sourceLang: 'en' };
  }
  throw new Error(`no content at all for ${slug}/${lang}`);
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A meta description derived from existing text (never new wording):
 *  the whole text if short, else trimmed at a sentence end. */
function metaDesc(text, max = 170) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max + 60);
  let cut = -1;
  for (const delim of ['。', '۔', '؟ ', '. ', '! ', '? ']) {
    const i = slice.lastIndexOf(delim);
    if (i > 60) cut = Math.max(cut, i + delim.length);
  }
  if (cut > 0 && cut <= max + 50) return slice.slice(0, cut).trim();
  const sp = slice.lastIndexOf(' ', max);
  return (sp > 60 ? slice.slice(0, sp) : slice.slice(0, max)).trim();
}

function hreflangTags(pairs) {
  return pairs
    .map((p) => `  <link rel="alternate" hreflang="${p.lang}" href="${p.href}" />`)
    .join('\n');
}

function landingPairs() {
  return [
    ...ALL_LANGS.map((l) => ({
      lang: l,
      href: l === 'en' ? `${SITE}/` : `${SITE}/${l}/`,
    })),
    { lang: 'x-default', href: `${SITE}/` },
  ];
}

function docPairs(doc) {
  return [
    ...ALL_LANGS.map((l) => ({
      lang: l,
      href: l === 'en' ? doc.enUrl : `${SITE}/${l}/${doc.path}/`,
    })),
    { lang: 'x-default', href: doc.enUrl },
  ];
}

/** Visible language switcher: every version of the same page. */
function langNav(pairs, currentLang) {
  const links = pairs
    .filter((p) => p.lang !== 'x-default')
    .map((p) => {
      const label = LANG_LABELS[p.lang] || p.lang;
      const current = p.lang === currentLang ? ' aria-current="true" class="current"' : '';
      return `<a href="${p.href}" hreflang="${p.lang}"${current}>${esc(label)}</a>`;
    })
    .join('\n        ');
  return `<nav class="langs" aria-label="Languages">\n        ${links}\n      </nav>`;
}

// ---------------------------------------------------------------------------
// Rich text → HTML, mirroring src/components/ui/RichText.tsx:
// blank-line blocks; '# '/'## '/'### ' headings (a heading line may
// share its block with what follows); '- '/'* ' bullet lists;
// **bold** and *italic* inline; single line breaks preserved.
// ---------------------------------------------------------------------------
function renderInline(text) {
  return esc(text)
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return `<strong>${part.slice(2, -2)}</strong>`;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return `<em>${part.slice(1, -1)}</em>`;
      }
      return part;
    })
    .join('');
}

function headingOf(line) {
  if (line.startsWith('### ')) return { tag: 'h3', text: line.slice(4) };
  if (line.startsWith('## ')) return { tag: 'h2', text: line.slice(3) };
  if (line.startsWith('# ')) return { tag: 'h2', text: line.slice(2) };
  return null;
}

function renderBlock(lines) {
  if (lines.length > 1) {
    const h = headingOf(lines[0]);
    if (h) {
      return `<${h.tag}>${renderInline(h.text)}</${h.tag}>\n` + renderBlock(lines.slice(1));
    }
  }
  if (lines.length === 1) {
    const h = headingOf(lines[0]);
    if (h) return `<${h.tag}>${renderInline(h.text)}</${h.tag}>`;
  }
  if (lines.every((l) => l.startsWith('- ') || l.startsWith('* '))) {
    const items = lines.map((l) => `  <li>${renderInline(l.slice(2))}</li>`).join('\n');
    return `<ul>\n${items}\n</ul>`;
  }
  return `<p>${lines.map((l) => renderInline(l)).join('<br />')}</p>`;
}

function renderRichText(content) {
  return String(content)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => renderBlock(b.split('\n')))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Shared page furniture: navy #1B2A4A + gold, warm paper background,
// system fonts (each script falls back to the reader's own fonts).
// ---------------------------------------------------------------------------
const CSS = `
  :root { --navy:#1B2A4A; --navy-deep:#111E36; --gold:#C9A227; --gold-soft:#E7CE7A;
    --ink:#22304A; --muted:#5A6B84; --paper:#F7F4EC; --card:#FFFFFF; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans",
    "Noto Sans JP", "Noto Sans Devanagari", "Noto Naskh Arabic", sans-serif;
    line-height:1.65; }
  a { color:var(--navy); }
  .topbar { background:var(--navy-deep); color:#fff; padding:10px 16px;
    display:flex; flex-wrap:wrap; gap:8px 20px; align-items:center; justify-content:space-between; }
  .brand { font-weight:700; letter-spacing:.02em; color:#fff; text-decoration:none; }
  .brand span { color:var(--gold-soft); }
  .langs { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:.9rem; }
  .langs a { color:#C7D0DE; text-decoration:none; }
  .langs a.current { color:var(--gold-soft); font-weight:700; }
  .hero { background:linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%);
    color:#E9EDF4; padding:44px 16px 40px; }
  .wrap { max-width:960px; margin:0 auto; }
  .hero h1 { color:#fff; font-size:2.3rem; line-height:1.25; margin:0 0 14px; }
  .hero p { max-width:46rem; margin:0 0 18px; }
  .hero img { width:100%; max-width:880px; height:auto; border-radius:14px;
    display:block; margin:26px auto 0; box-shadow:0 10px 30px rgba(0,0,0,.35); }
  .cta { display:flex; flex-wrap:wrap; gap:12px; margin:20px 0 10px; }
  .btn { display:inline-block; padding:13px 26px; border-radius:999px;
    font-weight:700; text-decoration:none; font-size:1.02rem; }
  .btn-gold { background:var(--gold); color:var(--navy-deep); }
  .btn-ghost { border:2px solid #E9EDF4; color:#fff; }
  .account-line { font-size:.95rem; }
  .account-line a { color:var(--gold-soft); }
  .pin-note { font-size:.88rem; color:#B9C4D6; max-width:44rem; }
  .stats { display:flex; flex-wrap:wrap; gap:14px; margin:26px 0 4px; }
  .stat { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.16);
    border-radius:12px; padding:12px 20px; min-width:130px; }
  .stat b { display:block; font-size:1.7rem; color:var(--gold-soft); line-height:1.15; }
  .stat span { font-size:.92rem; color:#D8DEE9; }
  main { padding:10px 16px 8px; }
  section { margin:34px 0; }
  .eyebrow { color:var(--gold); font-weight:700; text-transform:uppercase;
    letter-spacing:.08em; font-size:.82rem; margin:0 0 4px; }
  h2 { color:var(--navy); font-size:1.55rem; line-height:1.3; margin:0 0 10px; }
  h3 { color:var(--navy); margin:0 0 6px; font-size:1.08rem; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:14px; }
  .card { background:var(--card); border:1px solid #E4DECF; border-radius:12px; padding:16px 18px; }
  .card p { margin:0; color:var(--muted); }
  ol.steps li, ul.plain li { margin-bottom:10px; }
  .stages { list-style:none; padding:0; margin:0; }
  .stages li { background:var(--card); border:1px solid #E4DECF; border-radius:12px;
    padding:12px 18px; margin-bottom:10px; }
  .stages b { color:var(--navy); }
  .stages span { color:var(--muted); display:block; }
  .commitment { background:var(--navy); border-radius:16px; padding:26px 24px; color:#E9EDF4; }
  .commitment h2 { color:#fff; }
  .commitment .card { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.16); }
  .commitment .card h3 { color:var(--gold-soft); }
  .commitment .card p { color:#C7D0DE; }
  .doc { background:var(--card); border:1px solid #E4DECF; border-radius:16px;
    padding:28px 26px; margin:26px 0; }
  .doc h1 { color:var(--navy); font-size:1.9rem; line-height:1.3; margin:0 0 18px; }
  .doc h2 { margin-top:26px; }
  .doc p { color:#3D4C63; }
  .doc li { color:#3D4C63; margin-bottom:6px; }
  .cta-box { background:var(--navy); border-radius:14px; padding:22px;
    text-align:center; margin:24px 0; }
  footer { background:var(--navy-deep); color:#C7D0DE; padding:26px 16px 34px; margin-top:40px; }
  footer nav { display:flex; flex-wrap:wrap; gap:6px 18px; margin-bottom:12px; }
  footer a { color:var(--gold-soft); text-decoration:none; }
  footer p { margin:4px 0; font-size:.92rem; }
`;

function headHtml({ lang, title, description, canonical, pairs, extraJsonLd }) {
  const ogLocaleAlternates = ALL_LANGS.filter((l) => l !== lang)
    .map((l) => `  <meta property="og:locale:alternate" content="${OG_LOCALES[l]}" />`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="${lang}"${RTL.has(lang) ? ' dir="rtl"' : ''}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="keywords" content="${esc(KEYWORDS)}" />
  <link rel="canonical" href="${canonical}" />
${hreflangTags(pairs)}
  <meta name="theme-color" content="#1B2A4A" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="English for Cricket" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${SITE}/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="${OG_LOCALES[lang]}" />
${ogLocaleAlternates}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${SITE}/og-image.png" />
${extraJsonLd ? `  <script type="application/ld+json">${extraJsonLd}</script>\n` : ''}  <style>${CSS}</style>
</head>`;
}

function topbar(pairs, currentLang) {
  return `  <div class="topbar">
    <a class="brand" href="${SITE}/">English for <span>Cricket</span></a>
    ${langNav(pairs, currentLang)}
  </div>`;
}

// ---------------------------------------------------------------------------
// Landing pages.
// ---------------------------------------------------------------------------
function landingJsonLd(lang, s) {
  const graph = {
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
        url: `${SITE}/`,
        inLanguage: lang,
      },
      {
        '@type': 'Course',
        name: 'English for Cricket',
        description: s.heroIntro,
        inLanguage: lang,
        provider: {
          '@type': 'Organization',
          name: 'Kansai Youth Cricket Organization',
          sameAs: 'https://kyco.jp/',
        },
      },
    ],
  };
  return JSON.stringify(graph);
}

function landingPage(lang) {
  const s = LANDING_STRINGS[lang];
  const pairs = landingPairs();
  const url = `${SITE}/${lang}/`;
  const title = `English for Cricket — ${s.heroTitle}`;
  const cards = (items) =>
    items
      .map(
        (it) =>
          `        <div class="card"><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></div>`
      )
      .join('\n');
  return `${headHtml({
    lang,
    title,
    description: metaDesc(s.heroIntro),
    canonical: url,
    pairs,
    extraJsonLd: landingJsonLd(lang, s),
  })}
<body>
${topbar(pairs, lang)}
  <div class="hero">
    <div class="wrap">
      <h1>${esc(s.heroTitle)}</h1>
      <p>${esc(s.heroIntro)}</p>
      <div class="cta">
        <a class="btn btn-gold" href="/register">Start Learning for Free</a>
        <a class="btn btn-ghost" href="/login">Log In</a>
      </div>
      <p class="account-line"><a href="/login">${esc(s.alreadyAccount)}</a></p>
      <p class="pin-note">${esc(s.pinNote)}</p>
      <div class="stats">
        <div class="stat"><b>320</b><span>${esc(s.statLessons)}</span></div>
        <div class="stat"><b>5</b><span>${esc(s.statStages)}</span></div>
        <div class="stat"><b>40</b><span>${esc(s.statModules)}</span></div>
        <div class="stat"><b>${esc(s.statFree)}</b><span>${esc(s.statGrowing)}</span></div>
      </div>
      <img src="/og-image.png" alt="English for Cricket" width="1200" height="630" />
    </div>
  </div>
  <main>
    <div class="wrap">
      <section>
        <p class="eyebrow">${esc(s.programmeLabel)}</p>
        <h2>${esc(s.programmeTitle)}</h2>
        <p>${esc(s.programmeIntro)}</p>
        <div class="cards">
${cards(s.features)}
        </div>
        <p>${esc(s.beyondLessons)}</p>
      </section>
      <section>
        <p class="eyebrow">${esc(s.startLabel)}</p>
        <h2>${esc(s.howTitle)}</h2>
        <ol class="steps">
${s.steps.map((st) => `          <li><strong>${esc(st.title)}</strong> — ${esc(st.text)}</li>`).join('\n')}
        </ol>
      </section>
      <section>
        <h2>${esc(s.stagesTitle)}</h2>
        <ul class="stages">
${s.stages.map((st) => `          <li><b>${esc(st.name)}</b><span>${esc(st.note)}</span></li>`).join('\n')}
        </ul>
      </section>
      <section>
        <p class="eyebrow">${esc(s.tipsLabel)}</p>
        <h2>${esc(s.tipsTitle)}</h2>
        <p>${esc(s.tipsIntro)}</p>
        <div class="cards">
${cards(s.tips)}
        </div>
      </section>
      <section class="commitment">
        <p class="eyebrow">${esc(s.commitmentLabel)}</p>
        <h2>${esc(s.commitmentTitle)}</h2>
        <div class="cards">
${cards(s.commitments)}
        </div>
      </section>
    </div>
  </main>
  <footer>
    <div class="wrap">
      <nav>
        <a href="/${lang}/support/">${esc(s.support)}</a>
        <a href="/${lang}/terms-and-conditions/">${esc(s.terms)}</a>
        <a href="/${lang}/privacy-policy/">${esc(s.privacy)}</a>
      </nav>
      <p>${esc(s.initiativeLine)}</p>
      <p>${esc(s.rightsLine)}</p>
    </div>
  </footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Document pages (Support / Terms / Privacy per language).
// ---------------------------------------------------------------------------
function docPage(lang, doc) {
  const s = LANDING_STRINGS[lang];
  const resolved = resolveDoc(doc.slug, lang);
  const pairs = docPairs(doc);
  const url = `${SITE}/${lang}/${doc.path}/`;
  const title = `${resolved.title} — English for Cricket`;

  let bodyHtml;
  let descriptionSource;
  if (doc.slug === 'support-page') {
    // The stored body is four parts split by a line of --- :
    // intro, formIntro, emailNote, emptyNote (see src/app/support.tsx).
    // The static page renders the informational parts and points to
    // the real form in the app with an English button; the fourth
    // part is the app's empty-FAQ-list note and is not page content.
    const parts = resolved.body.split(/\n\s*---\s*\n/).map((p) => p.trim());
    descriptionSource = parts[0] || resolved.body;
    bodyHtml = [
      parts[0] ? renderRichText(parts[0]) : '',
      parts[1] ? renderRichText(parts[1]) : '',
      `      <div class="cta-box"><a class="btn btn-gold" href="/support">Contact Support</a></div>`,
      parts[2] ? renderRichText(parts[2]) : '',
    ]
      .filter(Boolean)
      .join('\n');
  } else {
    descriptionSource = resolved.body;
    bodyHtml = renderRichText(resolved.body);
  }

  const otherDocs = DOCS.filter((d) => d.slug !== doc.slug)
    .map((d) => {
      const other = resolveDoc(d.slug, lang);
      return `        <a href="/${lang}/${d.path}/">${esc(other.title)}</a>`;
    })
    .join('\n');

  return `${headHtml({
    lang,
    title,
    description: metaDesc(descriptionSource.replace(/\n\s*---\s*\n/g, ' ')),
    canonical: url,
    pairs,
    extraJsonLd: null,
  })}
<body>
${topbar(pairs, lang)}
  <main>
    <div class="wrap">
      <article class="doc">
        <h1>${esc(resolved.title)}</h1>
${bodyHtml}
      </article>
    </div>
  </main>
  <footer>
    <div class="wrap">
      <nav>
        <a href="/${lang}/">English for Cricket</a>
${otherDocs}
      </nav>
      <p>${esc(s.rightsLine)}</p>
    </div>
  </footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Generate everything.
// ---------------------------------------------------------------------------
let written = 0;
function writePage(relPath, html) {
  const file = path.join(distDir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written += 1;
  console.log(`  wrote ${relPath} (${Buffer.byteLength(html)} bytes)`);
}

for (const lang of LANGS) {
  writePage(path.join(lang, 'index.html'), landingPage(lang));
  for (const doc of DOCS) {
    writePage(path.join(lang, doc.path, 'index.html'), docPage(lang, doc));
  }
}
console.log(`generate-lang-pages: ${written} static pages written to ${distDir}`);
if (fallbacks.length) {
  console.log('FALLBACKS (no stored translation; English shown):');
  for (const f of [...new Set(fallbacks)]) console.log(`  ${f}`);
} else {
  console.log('fallbacks: none — every document exists in all 8 languages');
}
