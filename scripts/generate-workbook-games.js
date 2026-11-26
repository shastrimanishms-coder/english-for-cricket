/**
 * Round 83 generator — playable workbook games for all 320 lessons.
 *
 * Reads the app curriculum specs (~/workspace/curriculum-specs-v2/) and
 * builds one `games` row per lesson with engine 'workbook'. The data
 * payload mirrors the printed Learning Path Workbook page-for-page:
 *   Page 1 "Words and Say"   — word cards + Say it! phrases
 *   Page 2 "Write"           — Match + Letters and sounds (phonics) or
 *                              Look and write (word building)
 *   Page 3 "Speak and Play"  — Circle the correct sentence, Copy the
 *                              pattern, Read with a partner
 * Nothing is invented: every word, example, phrase, dialogue line,
 * pattern and structure question comes from the lesson's own spec —
 * the same extraction discipline as the print workbooks
 * (build_s1m1.py). Assessment lessons (Lesson 8 of each module) have
 * no new vocab in the app; their cards use the module review set —
 * the spec's own `returns.words`, topped up to six from the module
 * pool in introduction order, exactly as the print books do.
 *
 * Picture URLs follow generate-v2.js exactly: a word's picture lives
 * under the stage/module/lesson where the word was FIRST introduced.
 *
 * Usage: node scripts/generate-workbook-games.js
 * Outputs:
 *   scripts/workbook-games.json            (all 320 rows, for the validator)
 *   ~/workspace/your_files/round83/WorkbookGames-PartNN.sql
 *     (delete-by-id + insert, each part <= ~60 KB, re-run safe)
 */
const fs = require('fs');
const path = require('path');

const SPEC_DIR = path.join(__dirname, '..', '..', 'curriculum-specs-v2');
const OUT_DIR = path.join(__dirname, '..', '..', 'your_files', 'round83');
const BASE = 'https://hjckfuthcuxedpgiughj.supabase.co/storage/v1/object/public/vocab-images';

const STAGE_IDS = {
  1: 'd3352863-2ae5-4404-b39d-9ade3dac2cbd',
  2: '0880276e-8c46-4aba-a96d-c7aa0a30c632',
  3: '6fb44af7-815c-4157-adc5-cf67ad89617c',
  4: '99de5623-0254-4d9a-b355-2febe00efcf5',
  5: '1d102515-cffd-4df0-b530-99c67ca1a6f1',
};
const STAGE_NAMES = {
  1: 'The Foundation',
  2: 'The Rookie',
  3: 'The Player',
  4: 'The Strategist',
  5: 'The Captain',
};

const pad2 = (n) => String(n).padStart(2, '0');
const slug = (w) => String(w).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const wordImg = (w, o) => `${BASE}/v2-w-${pad2(o.s)}${pad2(o.m)}${pad2(o.l)}-${slug(w)}.png`;
const sceneImg = (s, m, l) => `${BASE}/v2-s-${pad2(s)}${pad2(m)}${pad2(l)}.png`;
const moduleUuid = (s, m) => `e0000000-0000-4000-8000-${String(s * 100 + m).padStart(12, '0')}`;
const lessonUuid = (s, m, l) => `e1000000-0000-4000-8000-${String(s * 10000 + m * 100 + l).padStart(12, '0')}`;
const gameUuid = (s, m, l) => `e3000000-0000-4000-8000-${String(s * 10000 + m * 100 + l).padStart(12, '0')}`;

const specFiles = fs
  .readdirSync(SPEC_DIR)
  .filter((f) => /^stage\d+-module\d+\.json$/.test(f))
  .sort();
if (specFiles.length !== 40) throw new Error(`Expected 40 module specs, found ${specFiles.length}`);
const specs = specFiles.map((f) => JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), 'utf8')));

// Global first-introduction map: word -> { s, m, l, e, ex }.
const origin = new Map();
for (const spec of specs) {
  spec.lessons.forEach((L, li) => {
    (L.vocab || []).forEach((v) => {
      if (!origin.has(v.w)) origin.set(v.w, { s: spec.stage, m: spec.module, l: li + 1, e: v.e, ex: v.ex });
    });
  });
}
const imgFor = (w, fallback) => {
  const o = origin.get(w) || fallback;
  return wordImg(w, o);
};

const rows = [];
for (const spec of specs) {
  const s = spec.stage;
  const m = spec.module;
  // Module pool in introduction order (for assessment top-ups).
  const pool = [];
  const poolSeen = new Set();
  spec.lessons.forEach((L) => {
    (L.vocab || []).forEach((v) => {
      if (!poolSeen.has(v.w)) {
        poolSeen.add(v.w);
        pool.push(v);
      }
    });
  });

  spec.lessons.forEach((L, li) => {
    const l = li + 1;
    const assessment = !!L.assessment || !(L.vocab && L.vocab.length > 0);
    let words;
    if (!assessment) {
      words = (L.vocab || []).map((v) => ({ w: v.w, e: v.e, ex: v.ex }));
    } else {
      const ret = ((L.returns && L.returns.words) || []).map((v) => ({ w: v.w, e: v.e, ex: v.ex }));
      const have = new Set(ret.map((v) => v.w));
      for (const v of pool) {
        if (ret.length >= 6) break;
        if (!have.has(v.w)) {
          ret.push({ w: v.w, e: v.e, ex: v.ex });
          have.add(v.w);
        }
      }
      words = ret;
    }
    const fallback = { s, m, l };
    const card = (v) => ({ word: v.w, example: v.ex, emoji: v.e || '', image: imgFor(v.w, fallback) });

    const pages = [
      {
        kind: 'words',
        title: 'Words and Say',
        activities: [
          {
            type: 'word_cards',
            heading: assessment ? 'Words I remember' : 'Words I will learn',
            words: words.map(card),
          },
          { type: 'say_it', heading: 'Say it!', phrases: [...(L.phrases || [])] },
        ],
      },
      {
        kind: 'write',
        title: 'Write',
        activities: [
          { type: 'match', heading: 'Match', pairs: words.map(card) },
          ...(L.phonics && L.phonics.length > 0
            ? [
                {
                  type: 'phonics',
                  heading: 'Letters and sounds',
                  cards: L.phonics.map((p) => ({
                    letter: p.letter,
                    sound: p.sound,
                    word: p.word,
                    emoji: p.e || '',
                    image: imgFor(p.word, { s, m, l: 1 }),
                  })),
                },
              ]
            : [
                {
                  type: 'word_build',
                  heading: 'Look and write',
                  words: words.slice(3, 6).map(card),
                },
              ]),
        ],
      },
      {
        kind: 'speak',
        title: 'Speak and Play',
        activities: [
          {
            type: 'circle',
            heading: 'Circle the correct sentence',
            items: (L.structure || []).map((q) => ({
              question: q.q,
              options: [q.a, ...(q.wrong || [])],
              answer: 0,
            })),
          },
          {
            type: 'pattern',
            heading: 'Copy the pattern',
            pairs: (L.patterns || []).map((p) => ({
              model: p.model,
              say: p.say,
              modelImage: imgFor(p.modelImg, fallback),
              sayImage: imgFor(p.sayImg, fallback),
            })),
          },
          {
            type: 'dialogue',
            heading: 'Read with a partner',
            // Ken and Mira are the learner characters: in lessons
            // whose dialogue names them instead of "You", their lines
            // are the ones the child reads aloud and is checked on.
            lines: (L.dialogue || []).map((d) => ({
              who: d.who,
              line: d.line,
              learner: d.who === 'You' || d.who === 'Ken' || d.who === 'Mira',
            })),
          },
        ],
      },
    ];

    rows.push({
      id: gameUuid(s, m, l),
      title: `Workbook — ${L.title}`,
      description: `The playable workbook for Lesson ${l} of ${spec.moduleTitle} (Stage ${s} · ${STAGE_NAMES[s]}). No printing needed — play the pages!`,
      game_url: '',
      thumbnail_url: sceneImg(s, m, l),
      engine: 'workbook',
      stage_id: STAGE_IDS[s],
      module_id: moduleUuid(s, m),
      lesson_id: lessonUuid(s, m, l),
      category_id: null,
      is_published: true,
      // Backdated so the Arcade's newest-first order keeps the
      // existing games first; workbook games are browsed through the
      // Workbook Practice page. Offset keeps a stable order.
      created_at: new Date(Date.UTC(2026, 0, 1) + (s * 10000 + m * 100 + l) * 1000).toISOString(),
      data: {
        version: 1,
        stage: s,
        module: m,
        lesson: l,
        stageName: STAGE_NAMES[s],
        moduleTitle: spec.moduleTitle,
        lessonTitle: L.title,
        goal: L.goal || '',
        scene: sceneImg(s, m, l),
        assessment,
        pages,
      },
    });
  });
}

if (rows.length !== 320) throw new Error(`Expected 320 games, built ${rows.length}`);
fs.writeFileSync(path.join(__dirname, 'workbook-games.json'), JSON.stringify(rows, null, 1));

// ---- SQL parts (<= ~60 KB each) ----
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) {
  if (/^WorkbookGames-Part\d+\.sql$/.test(f)) fs.unlinkSync(path.join(OUT_DIR, f));
}
const sqlStr = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const rowSql = (r) =>
  `insert into public.games (id, title, description, game_url, thumbnail_url, engine, data, stage_id, module_id, lesson_id, category_id, is_published, created_at) values (${sqlStr(r.id)}, ${sqlStr(r.title)}, ${sqlStr(r.description)}, '', ${sqlStr(r.thumbnail_url)}, 'workbook', ${sqlStr(JSON.stringify(r.data))}::jsonb, ${sqlStr(r.stage_id)}, ${sqlStr(r.module_id)}, ${sqlStr(r.lesson_id)}, null, true, ${sqlStr(r.created_at)});`;

const MAX = 60000;
let part = 1;
let buf = '';
const flush = () => {
  if (!buf) return;
  const name = `WorkbookGames-Part${String(part).padStart(2, '0')}.sql`;
  fs.writeFileSync(path.join(OUT_DIR, name), buf);
  console.log(`${name}: ${Buffer.byteLength(buf)} bytes`);
  part += 1;
  buf = '';
};
for (const r of rows) {
  const chunk = `-- ${r.title} (Stage ${r.data.stage} · Module ${r.data.module} · Lesson ${r.data.lesson})\ndelete from public.games where id = ${sqlStr(r.id)};\n${rowSql(r)}\n`;
  if (buf && Buffer.byteLength(buf) + Buffer.byteLength(chunk) > MAX) flush();
  buf += chunk;
}
flush();
console.log(`Built ${rows.length} workbook games in ${part - 1} SQL parts.`);
