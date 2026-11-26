/**
 * DEPRECATED (Round 87): superseded by
 * scripts/generate-textbook-workbook-games.py, which builds ALL 144
 * textbook workbook games into the same JSON file. Do not run this
 * script — it would overwrite the full set with the single sample.
 *
 * Round 86 generator — SAMPLE playable textbook workbook game:
 * Book 1, Lesson 1 only, for Shastri's look-and-feel approval
 * before the full 144-lesson production.
 *
 * The traditional textbook workbooks are a SECOND family on the
 * Round 83 'workbook' engine. They are NOT tied to app curriculum
 * lessons (stage/module/lesson ids are NULL); the payload carries
 * source:'textbook' + book/lesson + the printed codes instead.
 *
 * Content source of truth — nothing invented:
 *   ~/workspace/tools/build-book1-v2.py  (lesson data + WB_EXTRA[1]
 *   + the a_star starbox builder)
 *   ~/workspace/your_files/english-for-cricket-textbooks-v2/
 *     book-1-workbook.html               (the rendered print pages)
 *
 * Book 1 Workbook · Starter A · Lesson 1 "Hello!" (B1-WB-L01):
 *   Page 1 — Activity 1 Trace It: hello / good morning / goodbye
 *            Activity 2 Circle It: "Circle the hello." over the
 *            pictures morning / friend / hello (in print order)
 *            (+ a "More space" draw-your-favourite-word filler —
 *            drawing, no playable twin)
 *   Page 2 — Activity 3 Colour It: "Colour the sun yellow." /
 *            "Colour the star gold."
 *            Activity 4 Draw It: "Draw a friend. Say: Hello,
 *            friend!" (drawing has no twin; the say-aloud line
 *            plays as a speech check)
 *            Star box: "Well done! You finished Lesson 1 —
 *            Hello!!" / "Colour the star. Say one thing you can
 *            do now!"
 *
 * Conversions (same discipline as Round 83):
 *   Trace It  → letter-tile word building (phrases keep their
 *               printed space as a gap, not a tile)
 *   Circle It → tap the right picture
 *   Colour It → tap the named colour; the picture fills
 *   Draw It   → its printed say-aloud line, speech-checked;
 *               the drawing itself stays on paper
 *
 * Game id family: e4000000-… with suffix book*1000 + lesson
 * (B1-L01 → …001001), leaving room for all 144 (B5-L27 → …005027).
 *
 * Usage: node scripts/generate-textbook-workbook-sample.js
 * Outputs:
 *   scripts/textbook-workbook-games.json
 *   ~/workspace/your_files/textbook-workbook-sample/
 *     TextbookWorkbook-Sample-B1-L01.sql  (delete-by-id + insert)
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '..', 'your_files', 'textbook-workbook-sample');

const book = 1;
const lesson = 1;
const gameId = `e4000000-0000-4000-8000-${String(book * 1000 + lesson).padStart(12, '0')}`;

const row = {
  id: gameId,
  title: 'Textbook Workbook — Hello!',
  description:
    'The playable workbook for Lesson 1 (B1-L01) of Book 1: The Foundation — Starter A, from the printed English for Cricket textbook workbook. No printing needed — play the pages!',
  game_url: '',
  thumbnail_url: null,
  engine: 'workbook',
  stage_id: null,
  module_id: null,
  lesson_id: null,
  category_id: null,
  is_published: true,
  // Backdated like Round 83 so the Arcade's newest-first order
  // keeps the existing games first; textbook workbook games are
  // browsed through the Textbook Workbook Practice page.
  created_at: new Date(Date.UTC(2026, 0, 1) + (book * 1000 + lesson) * 1000).toISOString(),
  data: {
    version: 1,
    source: 'textbook',
    book,
    lesson,
    code: 'B1-L01',
    workbookCode: 'B1-WB-L01',
    bookTitle: 'The Foundation',
    partTitle: 'Starter A',
    lessonTitle: 'Hello!',
    // The textbook lesson's own Promise lines (build-book1-v2.py).
    goal: 'The words hello, good morning and goodbye · How to be polite and friendly',
    scene: '',
    // The printed star box, verbatim (the double "!" is the
    // book's own: its title "Hello!" plus the star box's "!").
    finishLine: 'Well done! You finished Lesson 1 — Hello!!',
    finishSub: 'Colour the star. Say one thing you can do now!',
    pages: [
      {
        kind: 'write',
        title: 'Trace It and Circle It',
        activities: [
          {
            type: 'word_build',
            heading: 'Trace It',
            // Print order; examples are the book's own Remember
            // Words lines for this lesson.
            words: [
              { word: 'hello', example: 'Say hello!', emoji: '👋', image: '' },
              { word: 'good morning', example: 'Say it in the morning.', emoji: '🌅', image: '' },
              { word: 'goodbye', example: 'Wave and say goodbye.', emoji: '🖐', image: '' },
            ],
          },
          {
            type: 'pick_picture',
            heading: 'Circle It',
            prompt: 'Circle the hello.',
            // Print order: morning.jpg, friend.jpg, hello.jpg.
            options: [
              { word: 'morning', emoji: '🌅', image: '' },
              { word: 'friend', emoji: '🧑‍🤝‍🧑', image: '' },
              { word: 'hello', emoji: '👋', image: '' },
            ],
            answer: 2,
          },
        ],
      },
      {
        kind: 'play',
        title: 'Colour It and Draw It',
        activities: [
          {
            type: 'colour_it',
            heading: 'Colour It',
            items: [
              { thing: 'sun', emoji: '☀️', instruction: 'Colour the sun yellow.', colour: 'yellow', choices: ['red', 'yellow', 'blue'] },
              { thing: 'star', emoji: '⭐', instruction: 'Colour the star gold.', colour: 'gold', choices: ['green', 'gold', 'purple'] },
            ],
          },
          {
            type: 'say_it',
            heading: 'Draw It',
            note: 'The printed page says: draw a friend. Drawing stays on paper — say the words from the page here!',
            phrases: ['Hello, friend!'],
          },
        ],
      },
    ],
  },
};

fs.writeFileSync(path.join(__dirname, 'textbook-workbook-games.json'), JSON.stringify([row], null, 1));

// ---- SQL (delete-by-id + insert; games inserts NEVER carry
// order_index — the table has none) ----
fs.mkdirSync(OUT_DIR, { recursive: true });
const sqlStr = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const sql = `-- Round 86 SAMPLE — playable textbook workbook game: Book 1, Lesson 1 (B1-L01)
-- Delete-by-id + insert: safe to re-run. No order_index (the games table has none).
delete from public.games where id = ${sqlStr(row.id)};
insert into public.games (id, title, description, game_url, thumbnail_url, engine, data, stage_id, module_id, lesson_id, category_id, is_published, created_at) values (${sqlStr(row.id)}, ${sqlStr(row.title)}, ${sqlStr(row.description)}, '', ${sqlStr(row.thumbnail_url)}, 'workbook', ${sqlStr(JSON.stringify(row.data))}::jsonb, ${sqlStr(row.stage_id)}, ${sqlStr(row.module_id)}, ${sqlStr(row.lesson_id)}, null, true, ${sqlStr(row.created_at)});
`;
const out = path.join(OUT_DIR, 'TextbookWorkbook-Sample-B1-L01.sql');
fs.writeFileSync(out, sql);
console.log(`Built 1 textbook workbook sample game (${row.id}) → ${out} (${Buffer.byteLength(sql)} bytes)`);
