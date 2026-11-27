// Round 97: content package formats + validators for the admin
// upload doors (the admin half of the Content Studio plan).
//
// Content is no longer typed into admin forms. Each content section
// takes ONE JSON package file - the shape the future Content Studio
// exports - validates it completely, shows a plain-language plan,
// and only then installs. These validators are pure (no Supabase):
// they check everything that can be checked from the file alone.
// Placement, category-name resolution and create-vs-update matching
// need live data and happen in each manager's plan step.
//
// A package that fails validation installs NOTHING - the doors run
// the install step only on a fully valid, planned package.
//
// Formats (version tag "format" is optional but checked when given):
//   Lesson:   one object { format: "efc-lesson@1", lesson_id?,
//             title, module_id? | (stage, module), slides: [...] }
//   Speaking: { format: "efc-speaking@1", scenarios: [...] }
//             (a bare array of scenarios is also accepted)
//   Reading:  { format: "efc-reading@1", stories: [...] }
//             (a bare array of stories is also accepted)
//   Games:    { format: "efc-games@1", games: [...] }
//             (a bare array of games is also accepted)

export const LESSON_SLIDE_TYPES = [
  'focus_1up',
  'grid_4up',
  'quiz_4up',
  'typing',
  'speak_repeat',
] as const;

export const GAME_ENGINES = [
  'picture_tap',
  'mascot_says',
  'number_catch',
  'memory_pairs',
  'sort_it',
  'sentence_builder',
  'transformer',
  'choice_chase',
  'scenario_cards',
  'data_dash',
] as const;

export const SPEAKING_TYPES = ['Interview', 'Small Talk'] as const;

const MAX_ERRORS = 8;

export interface LessonSlidePkg {
  slide_type: string;
  prompt_text: string;
  media_url: string;
  audio_url: string;
  correct_answer: string;
  options: unknown;
}

export interface LessonPkg {
  lesson_id: string | null;
  title: string;
  module_id: string | null;
  stage: number | null;
  module: number | null;
  description: string;
  slides: LessonSlidePkg[];
}

export interface SpeakingTurnPkg {
  speaker: 'other' | 'learner';
  text: string;
}

export interface SpeakingPkg {
  title: string;
  partner_name: string;
  type: string;
  emoji: string;
  description: string;
  stage: number | null;
  stage_id: string | null;
  module: number | null;
  lesson_id: string | null;
  categories: string[];
  turns: SpeakingTurnPkg[];
}

export interface ReadingQuestionPkg {
  question: string;
  options: [string, string, string];
  /** 1-based: which of the three options is correct. */
  correct: number;
}

export interface ReadingPkg {
  title: string;
  emoji: string;
  level: string;
  description: string;
  pages: string[];
  questions: ReadingQuestionPkg[];
  stage: number | null;
  stage_id: string | null;
  module: number | null;
  lesson_id: string | null;
  categories: string[];
}

export interface GamePkg {
  title: string;
  description: string;
  engine: string;
  data: Record<string, unknown>;
  thumbnail_url: string;
  stage: number | null;
  stage_id: string | null;
  module: number | null;
  lesson_id: string | null;
  categories: string[];
}

type Validation<T> = { errors: string[]; items?: T[] };

function parseJson(text: string): { value: any; error?: string } {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { value: null, error: 'The file is not valid JSON.' };
  }
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

function optNum(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Unwrap { format, <key>: [...] } or a bare array into the item list. */
function unwrapList(
  value: any,
  key: string,
  formatTag: string,
  errors: string[]
): any[] | null {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) {
    if (value.format !== undefined && value.format !== formatTag) {
      errors.push(`This file's format is "${String(value.format)}" - this door expects "${formatTag}".`);
      return null;
    }
    if (Array.isArray(value[key])) return value[key];
    errors.push(`The file needs a "${key}" array (or be a bare JSON array of items).`);
    return null;
  }
  errors.push('The file must contain a JSON object or array.');
  return null;
}

function readTags(raw: any, label: string, errors: string[]) {
  const stage = optNum(raw.stage);
  const module = optNum(raw.module);
  const stage_id = str(raw.stage_id) || null;
  const lesson_id = str(raw.lesson_id) || null;
  if (raw.stage !== undefined && stage === null) {
    errors.push(`${label}: "stage" must be a number (1-5).`);
  }
  if (stage !== null && (stage < 1 || stage > 5)) {
    errors.push(`${label}: "stage" must be between 1 and 5.`);
  }
  if (raw.module !== undefined && module === null) {
    errors.push(`${label}: "module" must be a number (1-8 within its stage).`);
  }
  if (module !== null && stage === null && !stage_id) {
    errors.push(`${label}: "module" needs its "stage" too, so the module can be found.`);
  }
  const categories: string[] = [];
  if (raw.categories !== undefined) {
    if (!Array.isArray(raw.categories) || raw.categories.some((c: any) => typeof c !== 'string' || !c.trim())) {
      errors.push(`${label}: "categories" must be an array of category names.`);
    } else if (raw.categories.length > 5) {
      errors.push(`${label}: at most 5 categories per item.`);
    } else {
      for (const c of raw.categories) categories.push(c.trim());
    }
  }
  return { stage, module, stage_id, lesson_id, categories };
}

function checkDuplicateTitles(titles: string[], noun: string, errors: string[]) {
  const seen = new Map<string, number>();
  titles.forEach((t, i) => {
    const key = t.toLowerCase();
    if (seen.has(key)) {
      errors.push(`Duplicate title "${t}" (${noun} ${seen.get(key)! + 1} and ${i + 1}) - titles must be unique inside one package.`);
    } else {
      seen.set(key, i);
    }
  });
}

// ---------------------------------------------------------------------------
// Lesson package (one complete lesson with all its slides).
// ---------------------------------------------------------------------------

export function validateLessonPackage(text: string): Validation<LessonPkg> {
  const { value, error } = parseJson(text);
  if (error) return { errors: [error] };
  if (!isPlainObject(value)) {
    return { errors: ['The lesson package must be one JSON object (one complete lesson).'] };
  }
  const errors: string[] = [];
  if (value.format !== undefined && value.format !== 'efc-lesson@1') {
    errors.push(`This file's format is "${String(value.format)}" - this door expects "efc-lesson@1".`);
  }
  const title = str(value.title);
  if (!title) errors.push('The lesson needs a "title".');
  const module_id = str(value.module_id) || null;
  const stage = optNum(value.stage);
  const module = optNum(value.module);
  if (!module_id && stage === null && !str(value.stage_id)) {
    errors.push('Say where the lesson belongs: "module_id", or "stage" + "module" numbers.');
  }
  if (module !== null && stage === null && !module_id) {
    errors.push('"module" needs its "stage" too, so the module can be found.');
  }
  const slides: LessonSlidePkg[] = [];
  if (!Array.isArray(value.slides) || value.slides.length === 0) {
    errors.push('The lesson needs a "slides" array with at least one slide.');
  } else {
    value.slides.forEach((raw: any, i: number) => {
      const label = `Slide ${i + 1}`;
      if (!isPlainObject(raw)) {
        errors.push(`${label} is not an object.`);
        return;
      }
      const slide_type = str(raw.slide_type);
      if (!(LESSON_SLIDE_TYPES as readonly string[]).includes(slide_type)) {
        errors.push(`${label}: unknown slide_type "${String(raw.slide_type ?? '')}" (expected one of ${LESSON_SLIDE_TYPES.join(', ')}).`);
        return;
      }
      for (const field of ['prompt_text', 'media_url', 'audio_url', 'correct_answer'] as const) {
        if (raw[field] !== undefined && typeof raw[field] !== 'string') {
          errors.push(`${label}: "${field}" must be text.`);
          return;
        }
      }
      slides.push({
        slide_type,
        prompt_text: str(raw.prompt_text),
        media_url: str(raw.media_url),
        audio_url: str(raw.audio_url),
        correct_answer: str(raw.correct_answer),
        options: raw.options === undefined ? null : raw.options,
      });
    });
  }
  if (errors.length > 0) return { errors: errors.slice(0, MAX_ERRORS) };
  return {
    errors: [],
    items: [
      {
        lesson_id: str(value.lesson_id) || null,
        title,
        module_id,
        stage,
        module,
        description: str(value.description),
        slides,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Speaking package.
// ---------------------------------------------------------------------------

const SPEAKER_ALIASES: Record<string, 'other' | 'learner'> = {
  other: 'other',
  partner: 'other',
  them: 'other',
  learner: 'learner',
  student: 'learner',
  you: 'learner',
};

export function validateSpeakingPackage(text: string): Validation<SpeakingPkg> {
  const { value, error } = parseJson(text);
  if (error) return { errors: [error] };
  const errors: string[] = [];
  const list = unwrapList(value, 'scenarios', 'efc-speaking@1', errors);
  if (!list) return { errors: errors.slice(0, MAX_ERRORS) };
  if (list.length === 0) return { errors: ['The package contains no scenarios.'] };

  const items: SpeakingPkg[] = [];
  list.forEach((raw: any, idx: number) => {
    const label = `Scenario ${idx + 1}${isPlainObject(raw) && str(raw.title) ? ` "${str(raw.title)}"` : ''}`;
    if (!isPlainObject(raw)) {
      errors.push(`${label} is not an object.`);
      return;
    }
    const title = str(raw.title);
    if (!title) errors.push(`${label}: a scenario needs a "title".`);
    const type = str(raw.type || raw.category) || 'Interview';
    if (!(SPEAKING_TYPES as readonly string[]).includes(type)) {
      errors.push(`${label}: "type" must be "Interview" or "Small Talk".`);
    }
    const tags = readTags(raw, label, errors);
    const turns: SpeakingTurnPkg[] = [];
    if (!Array.isArray(raw.turns) || raw.turns.length < 2) {
      errors.push(`${label}: "turns" needs at least two lines (the partner opens, the student answers).`);
    } else {
      raw.turns.forEach((t: any, ti: number) => {
        if (!isPlainObject(t)) {
          errors.push(`${label}: line ${ti + 1} is not an object.`);
          return;
        }
        const speaker = SPEAKER_ALIASES[str(t.speaker).toLowerCase()];
        if (!speaker) {
          errors.push(`${label}: line ${ti + 1} has speaker "${String(t.speaker ?? '')}" - use "other" (the partner) or "learner" (the student).`);
          return;
        }
        const lineText = str(t.text);
        if (!lineText) {
          errors.push(`${label}: line ${ti + 1} has no text.`);
          return;
        }
        turns.push({ speaker, text: lineText });
      });
      if (turns.length === raw.turns.length && turns.length >= 2) {
        if (turns[0].speaker !== 'other') {
          errors.push(`${label}: the conversation must start with the partner ("other").`);
        }
        for (let i = 1; i < turns.length; i++) {
          if (turns[i].speaker === turns[i - 1].speaker) {
            errors.push(`${label}: lines must alternate partner / student - lines ${i} and ${i + 1} are both "${turns[i].speaker}".`);
            break;
          }
        }
        if (turns[turns.length - 1].speaker !== 'learner') {
          errors.push(`${label}: the conversation must end with the student's line ("learner").`);
        }
      }
    }
    items.push({
      title,
      partner_name: str(raw.partner_name || raw.other_name) || 'Partner',
      type,
      emoji: str(raw.emoji) || '🎙️',
      description: str(raw.description),
      stage: tags.stage,
      stage_id: tags.stage_id,
      module: tags.module,
      lesson_id: tags.lesson_id,
      categories: tags.categories,
      turns,
    });
  });
  checkDuplicateTitles(items.map((s) => s.title).filter(Boolean), 'scenario', errors);
  if (errors.length > 0) return { errors: errors.slice(0, MAX_ERRORS) };
  return { errors: [], items };
}

// ---------------------------------------------------------------------------
// Reading package. Questions are STRUCTURED data - never the :: format.
// ---------------------------------------------------------------------------

export function validateReadingPackage(text: string): Validation<ReadingPkg> {
  const { value, error } = parseJson(text);
  if (error) return { errors: [error] };
  const errors: string[] = [];
  const list = unwrapList(value, 'stories', 'efc-reading@1', errors);
  if (!list) return { errors: errors.slice(0, MAX_ERRORS) };
  if (list.length === 0) return { errors: ['The package contains no stories.'] };

  const items: ReadingPkg[] = [];
  list.forEach((raw: any, idx: number) => {
    const label = `Story ${idx + 1}${isPlainObject(raw) && str(raw.title) ? ` "${str(raw.title)}"` : ''}`;
    if (!isPlainObject(raw)) {
      errors.push(`${label} is not an object.`);
      return;
    }
    const title = str(raw.title);
    if (!title) errors.push(`${label}: a story needs a "title".`);
    const tags = readTags(raw, label, errors);
    const pages: string[] = [];
    if (!Array.isArray(raw.pages) || raw.pages.length === 0) {
      errors.push(`${label}: "pages" needs at least one page of text.`);
    } else {
      raw.pages.forEach((p: any, pi: number) => {
        if (typeof p !== 'string' || !p.trim()) {
          errors.push(`${label}: page ${pi + 1} is empty or not text.`);
        } else {
          pages.push(p.trim());
        }
      });
    }
    const questions: ReadingQuestionPkg[] = [];
    if (raw.questions !== undefined) {
      if (!Array.isArray(raw.questions)) {
        errors.push(`${label}: "questions" must be an array of { question, options, correct } objects.`);
      } else {
        raw.questions.forEach((q: any, qi: number) => {
          const qLabel = `${label}, question ${qi + 1}`;
          if (!isPlainObject(q)) {
            errors.push(`${qLabel} is not an object - questions are structured data: { "question": "...", "options": ["...", "...", "..."], "correct": 1 }.`);
            return;
          }
          const question = str(q.question ?? q.q);
          if (!question) errors.push(`${qLabel}: missing "question" text.`);
          const options = Array.isArray(q.options) ? q.options.map((o: any) => str(o)) : [];
          if (options.length !== 3 || options.some((o: string) => !o)) {
            errors.push(`${qLabel}: "options" must be exactly 3 non-empty choices (found ${Array.isArray(q.options) ? q.options.length : 0}).`);
            return;
          }
          const correct = typeof q.correct === 'number' ? q.correct : NaN;
          if (correct !== 1 && correct !== 2 && correct !== 3) {
            errors.push(`${qLabel}: "correct" must be 1, 2 or 3 - the number of the right option.`);
            return;
          }
          questions.push({ question, options: options as [string, string, string], correct });
        });
      }
    }
    items.push({
      title,
      emoji: str(raw.emoji) || '📖',
      level: str(raw.level),
      description: str(raw.description),
      pages,
      questions,
      stage: tags.stage,
      stage_id: tags.stage_id,
      module: tags.module,
      lesson_id: tags.lesson_id,
      categories: tags.categories,
    });
  });
  checkDuplicateTitles(items.map((s) => s.title).filter(Boolean), 'story', errors);
  if (errors.length > 0) return { errors: errors.slice(0, MAX_ERRORS) };
  return { errors: [], items };
}

// ---------------------------------------------------------------------------
// Games package (built-in engines only - workbook games keep their
// own door in the Workbooks tab).
// ---------------------------------------------------------------------------

export function validateGamesPackage(text: string): Validation<GamePkg> {
  const { value, error } = parseJson(text);
  if (error) return { errors: [error] };
  const errors: string[] = [];
  const list = unwrapList(value, 'games', 'efc-games@1', errors);
  if (!list) return { errors: errors.slice(0, MAX_ERRORS) };
  if (list.length === 0) return { errors: ['The package contains no games.'] };

  const items: GamePkg[] = [];
  list.forEach((raw: any, idx: number) => {
    const label = `Game ${idx + 1}${isPlainObject(raw) && str(raw.title) ? ` "${str(raw.title)}"` : ''}`;
    if (!isPlainObject(raw)) {
      errors.push(`${label} is not an object.`);
      return;
    }
    const title = str(raw.title);
    if (!title) errors.push(`${label}: a game needs a "title".`);
    const engine = str(raw.engine);
    if (engine === 'workbook') {
      errors.push(`${label}: workbook games belong to the Workbooks tab - use its import door, not this one.`);
    } else if (!(GAME_ENGINES as readonly string[]).includes(engine)) {
      errors.push(`${label}: unknown engine "${engine}" (expected one of ${GAME_ENGINES.join(', ')}).`);
    }
    if (!isPlainObject(raw.data)) {
      errors.push(`${label}: "data" must be an object holding the game's content for its engine.`);
    }
    const tags = readTags(raw, label, errors);
    items.push({
      title,
      description: str(raw.description),
      engine,
      data: isPlainObject(raw.data) ? raw.data : {},
      thumbnail_url: str(raw.thumbnail_url),
      stage: tags.stage,
      stage_id: tags.stage_id,
      module: tags.module,
      lesson_id: tags.lesson_id,
      categories: tags.categories,
    });
  });
  checkDuplicateTitles(items.map((g) => g.title).filter(Boolean), 'game', errors);
  if (errors.length > 0) return { errors: errors.slice(0, MAX_ERRORS) };
  return { errors: [], items };
}

// ---------------------------------------------------------------------------
// Format help + downloadable examples (shown inside each door).
// ---------------------------------------------------------------------------

export const LESSON_FORMAT_LINES = [
  'One JSON object = ONE complete lesson, with all its slides inside.',
  '"title" (required) and where it belongs: "module_id", or "stage" + "module" numbers (stage 1-5, module 1-8).',
  '"lesson_id": include the id of an existing lesson to REPLACE that lesson (its slides are swapped wholesale); leave it out to create a new lesson in the module.',
  '"slides": array in playing order. Each slide: "slide_type" (focus_1up, grid_4up, quiz_4up, typing, speak_repeat), "prompt_text", "media_url", "audio_url", "correct_answer", "options" (the slide\'s extra data object, e.g. grid panels).',
  'After install, the Word Bank catalogue re-derives this lesson\'s words automatically (Migration 43).',
];

export const LESSON_EXAMPLE = {
  format: 'efc-lesson@1',
  title: 'Meeting the Squad',
  stage: 1,
  module: 1,
  slides: [
    {
      slide_type: 'focus_1up',
      prompt_text: '🏏 pitch',
      media_url: 'https://example.org/images/v2-w-010101-pitch.png',
      audio_url: '',
      correct_answer: 'The pitch is green.',
      options: null,
    },
    {
      slide_type: 'speak_repeat',
      prompt_text: 'Say it: the pitch is green',
      media_url: '',
      audio_url: '',
      correct_answer: 'The pitch is green.',
      options: null,
    },
  ],
};

export const SPEAKING_FORMAT_LINES = [
  'One JSON object with a "scenarios" array (a bare array also works).',
  'Each scenario: "title" (required), "partner_name" (who the app plays), "type" ("Interview" or "Small Talk"), "emoji", "description".',
  '"turns": the conversation in order - { "speaker": "other" | "learner", "text": "..." }. The partner ("other") speaks first, lines strictly alternate, and the student ("learner") has the last line.',
  'Placement: "stage" (1-5) and "module" (1-8) numbers, or "stage_id"; "lesson_id" ties it to a lesson. "categories": up to 5 category NAMES from the Speaking tree (create them in the Categories Manager first).',
  'A scenario whose title matches an existing one in the same stage is updated in place; otherwise it is created.',
];

export const SPEAKING_EXAMPLE = {
  format: 'efc-speaking@1',
  scenarios: [
    {
      title: 'At the Kit Shop',
      partner_name: 'Shopkeeper',
      type: 'Small Talk',
      emoji: '🛍️',
      description: 'Buying a new bat at the cricket shop.',
      stage: 1,
      module: 2,
      categories: [],
      turns: [
        { speaker: 'other', text: 'Hello! Can I help you?' },
        { speaker: 'learner', text: 'Yes, please. I am looking for a bat.' },
        { speaker: 'other', text: 'This one is light and strong.' },
        { speaker: 'learner', text: 'Thank you. I will take it.' },
      ],
    },
  ],
};

export const READING_FORMAT_LINES = [
  'One JSON object with a "stories" array (a bare array also works).',
  'Each story: "title" (required), "emoji", "level" (e.g. "Stage 1"), "description", and "pages": an array of page texts (short pages read best - 3 to 6 sentences each).',
  '"questions": structured data, never text with separators - { "question": "...", "options": ["...", "...", "..."], "correct": 1 } with exactly 3 options and "correct" = 1, 2 or 3.',
  'Placement: "stage" (1-5) and "module" (1-8) numbers, or "stage_id"; "lesson_id" ties it to a lesson. "categories": up to 5 category NAMES from the Smart Reading tree.',
  'A story whose title matches an existing one in the same stage is updated in place; otherwise it is created.',
];

export const READING_EXAMPLE = {
  format: 'efc-reading@1',
  stories: [
    {
      title: 'The Little Blue Cap',
      emoji: '🧢',
      level: 'Stage 1',
      description: 'Ken loses his cap on match day.',
      stage: 1,
      pages: [
        'Ken has a little blue cap. He wears it at every match.',
        'Today the wind takes the cap. It flies over the fence!',
      ],
      questions: [
        {
          question: 'What colour is Ken\'s cap?',
          options: ['Blue', 'Red', 'Green'],
          correct: 1,
        },
      ],
      categories: [],
    },
  ],
};

export const GAMES_FORMAT_LINES = [
  'One JSON object with a "games" array (a bare array also works). Built-in games only - workbook games keep their own import in the Workbooks tab.',
  'Each game: "title" (required), "description", "engine" (one of: picture_tap, mascot_says, number_catch, memory_pairs, sort_it, sentence_builder, transformer, choice_chase, scenario_cards, data_dash), "data": the game content object for that engine, "thumbnail_url".',
  'Placement: "stage" (1-5) and "module" (1-8) numbers, or "stage_id"; "lesson_id" ties it to a lesson. "categories": up to 5 category NAMES from the Games tree.',
  'A game whose title matches an existing game is updated in place; otherwise it is created.',
];

export const GAMES_EXAMPLE = {
  format: 'efc-games@1',
  games: [
    {
      title: 'Weather Tap',
      description: 'Hear the weather word and tap its picture.',
      engine: 'picture_tap',
      thumbnail_url: '',
      stage: 1,
      module: 7,
      categories: [],
      data: {
        items: [
          { word: 'sun', image: 'https://example.org/images/sun.png' },
          { word: 'rain', image: 'https://example.org/images/rain.png' },
        ],
      },
    },
  ],
};
