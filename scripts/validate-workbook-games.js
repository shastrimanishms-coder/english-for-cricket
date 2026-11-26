/**
 * Round 83 validator — checks every generated workbook game payload
 * against the workbook engine's schema AND back against the lesson
 * spec it was generated from (nothing invented, nothing lost).
 *
 * Usage: node scripts/validate-workbook-games.js
 * Exit code 0 only when all 320 games pass every check.
 */
const fs = require('fs');
const path = require('path');

const SPEC_DIR = path.join(__dirname, '..', '..', 'curriculum-specs-v2');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'workbook-games.json'), 'utf8'));
const specs = new Map();
for (const f of fs.readdirSync(SPEC_DIR).filter((x) => /^stage\d+-module\d+\.json$/.test(x))) {
  const s = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), 'utf8'));
  specs.set(`${s.stage}:${s.module}`, s);
}

const IMG_RE = /^https:\/\/hjckfuthcuxedpgiughj\.supabase\.co\/storage\/v1\/object\/public\/vocab-images\/v2-[ws]-\d{6}-[a-z0-9-]+\.png$|^https:\/\/hjckfuthcuxedpgiughj\.supabase\.co\/storage\/v1\/object\/public\/vocab-images\/v2-s-\d{6}\.png$/;
let failures = 0;
const fail = (id, msg) => {
  failures += 1;
  console.log(`FAIL ${id}: ${msg}`);
};

if (rows.length !== 320) fail('ALL', `expected 320 rows, got ${rows.length}`);
const ids = new Set();
const titles = new Set();
const covered = new Set();

for (const r of rows) {
  const d = r.data || {};
  const tag = `${r.title} [S${d.stage} M${d.module} L${d.lesson}]`;
  if (ids.has(r.id)) fail(tag, 'duplicate game id');
  ids.add(r.id);
  if (titles.has(r.title)) fail(tag, 'duplicate title');
  titles.add(r.title);
  covered.add(`${d.stage}:${d.module}:${d.lesson}`);
  if (r.engine !== 'workbook') fail(tag, 'engine is not workbook');
  if (!r.lesson_id || !r.module_id || !r.stage_id) fail(tag, 'missing stage/module/lesson tag');
  if (!IMG_RE.test(r.thumbnail_url || '')) fail(tag, `bad thumbnail URL ${r.thumbnail_url}`);
  if (r.thumbnail_url !== d.scene) fail(tag, 'thumbnail is not the lesson scene');

  const spec = specs.get(`${d.stage}:${d.module}`);
  if (!spec) {
    fail(tag, 'no spec for stage/module');
    continue;
  }
  const L = spec.lessons[d.lesson - 1];
  if (!L) {
    fail(tag, 'no lesson in spec');
    continue;
  }
  if (d.lessonTitle !== L.title) fail(tag, 'lesson title differs from spec');
  if (d.goal !== (L.goal || '')) fail(tag, 'goal differs from spec');
  if (d.moduleTitle !== spec.moduleTitle) fail(tag, 'module title differs from spec');

  const pages = d.pages || [];
  if (pages.length !== 3) fail(tag, `expected 3 pages, got ${pages.length}`);
  const kinds = pages.map((p) => p.kind).join(',');
  if (kinds !== 'words,write,speak') fail(tag, `page kinds out of order: ${kinds}`);

  const acts = {};
  for (const p of pages) for (const a of p.activities || []) acts[a.type] = a;

  // Page 1 — word cards + say it
  const wc = acts.word_cards;
  if (!wc) fail(tag, 'missing word_cards');
  else {
    const specWords = (L.vocab || []).map((v) => v.w);
    if (specWords.length > 0) {
      const got = wc.words.map((w) => w.word);
      if (JSON.stringify(got) !== JSON.stringify(specWords)) fail(tag, 'word cards differ from spec vocab');
    } else if (wc.words.length < 4) fail(tag, 'assessment review set has fewer than 4 words');
    for (const w of wc.words) {
      if (!w.word || !w.example) fail(tag, 'word card missing word/example');
      if (!IMG_RE.test(w.image || '')) fail(tag, `word card bad image for "${w.word}"`);
    }
  }
  const si = acts.say_it;
  if (!si || JSON.stringify(si.phrases) !== JSON.stringify(L.phrases || [])) fail(tag, 'say_it phrases differ from spec');

  // Page 2 — match + phonics or word_build
  const mt = acts.match;
  if (!mt) fail(tag, 'missing match');
  else {
    if (mt.pairs.length < 4) fail(tag, 'match has fewer than 4 pairs');
    const ws = mt.pairs.map((p) => p.word);
    if (new Set(ws).size !== ws.length) fail(tag, 'match words not unique');
    if (wc && JSON.stringify(ws) !== JSON.stringify(wc.words.map((w) => w.word))) fail(tag, 'match set differs from word cards');
    for (const p of mt.pairs) if (!IMG_RE.test(p.image || '')) fail(tag, `match bad image for "${p.word}"`);
  }
  const hasPhonics = !!(L.phonics && L.phonics.length > 0);
  if (hasPhonics) {
    const ph = acts.phonics;
    if (!ph) fail(tag, 'spec has phonics but payload has no phonics activity');
    else {
      if (ph.cards.length !== L.phonics.length) fail(tag, 'phonics card count differs from spec');
      ph.cards.forEach((c, i) => {
        const sp = L.phonics[i];
        if (c.letter !== sp.letter || c.sound !== sp.sound || c.word !== sp.word) fail(tag, `phonics card ${i} differs from spec`);
        if (!IMG_RE.test(c.image || '')) fail(tag, `phonics bad image for "${c.word}"`);
      });
    }
    if (acts.word_build) fail(tag, 'phonics lesson should not also carry word_build (print parity)');
  } else {
    const wb = acts.word_build;
    if (!wb) fail(tag, 'missing word_build');
    else {
      if (wb.words.length < 1 || wb.words.length > 3) fail(tag, `word_build has ${wb.words.length} words (want 1-3)`);
      for (const w of wb.words) {
        if (!w.word || /\s/.test(w.word)) fail(tag, `word_build word not tile-able: "${w.word}"`);
        if (!IMG_RE.test(w.image || '')) fail(tag, `word_build bad image for "${w.word}"`);
      }
    }
    if (acts.phonics) fail(tag, 'phonics activity present but spec has none');
  }

  // Page 3 — circle + pattern + dialogue
  const ci = acts.circle;
  if (!ci || ci.items.length !== (L.structure || []).length) fail(tag, 'circle item count differs from spec structure');
  else {
    ci.items.forEach((it, i) => {
      const sp = L.structure[i];
      if (it.question !== sp.q) fail(tag, `circle ${i} question differs`);
      if (!Array.isArray(it.options) || it.options.length < 2) fail(tag, `circle ${i} has fewer than 2 options`);
      if (it.answer !== 0 || it.options[0] !== sp.a) fail(tag, `circle ${i} answer does not point at the spec's correct sentence`);
      const want = [sp.a, ...(sp.wrong || [])].slice().sort();
      const got = it.options.slice().sort();
      if (JSON.stringify(want) !== JSON.stringify(got)) fail(tag, `circle ${i} options differ from spec`);
    });
  }
  const pt = acts.pattern;
  if (!pt || pt.pairs.length !== (L.patterns || []).length) fail(tag, 'pattern pair count differs from spec');
  else {
    pt.pairs.forEach((p, i) => {
      const sp = L.patterns[i];
      if (p.model !== sp.model || p.say !== sp.say) fail(tag, `pattern ${i} differs from spec`);
      if (!IMG_RE.test(p.modelImage || '') || !IMG_RE.test(p.sayImage || '')) fail(tag, `pattern ${i} bad image`);
      if (!p.say.trim()) fail(tag, `pattern ${i} say is empty`);
      // A one-word "say" (e.g. "Bowling!") is genuine spec content:
      // the player renders it as listen-and-repeat instead of tiles.
    });
  }
  const dl = acts.dialogue;
  if (!dl || dl.lines.length !== (L.dialogue || []).length) fail(tag, 'dialogue line count differs from spec');
  else {
    dl.lines.forEach((ln, i) => {
      const sp = L.dialogue[i];
      if (ln.who !== sp.who || ln.line !== sp.line) fail(tag, `dialogue ${i} differs from spec`);
      const wantLearner = sp.who === 'You' || sp.who === 'Ken' || sp.who === 'Mira';
      if (ln.learner !== wantLearner) fail(tag, `dialogue ${i} learner flag wrong`);
    });
    if (!dl.lines.some((ln) => ln.learner)) fail(tag, 'dialogue has no learner line');
  }
}

if (covered.size !== 320) fail('ALL', `covered ${covered.size} distinct lessons, expected 320`);
console.log(failures === 0 ? `VALIDATOR PASS: 320/320 workbook games valid.` : `VALIDATOR FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
