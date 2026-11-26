import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import {
  fetchVoicePrefs,
  resolveVoicesForTexts,
  setActiveVoiceMap,
  voiceUrlForText,
} from '../../lib/lessonVoices';
import type { VoiceCategory } from '../../lib/voiceStudio';
import { scoreMessage, scoreSpeech } from '../../lib/speechScoring';
import { cancelSpeechCue, playDing, playRecordedLine, speakWithCallback } from '../../lib/speechCue';
import { getStudentIdentity } from '../../lib/studentIdentity';
import { speechErrorMessage, useSpeechCheck } from '../../lib/useSpeechCheck';

// ============================================================================
// Workbook game (Round 83) — the playable twin of the printed Learning
// Path Workbook. One game = ONE lesson's workbook, presented page by
// page to look like the printed book: white paper page, navy lesson
// header band with gold kicker, green activity titles, gold accents,
// and the same three pages in the same order —
//   Page 1 "Words and Say":   word cards (tap to hear) + Say it!
//   Page 2 "Write":           Match, then Letters and sounds (phonics)
//                             or Look and write (word building)
//   Page 3 "Speak and Play":  Circle the correct sentence, Copy the
//                             pattern, Read with a partner, star box
//
// Speech checks here are practice only: the score is shown to the
// child and NOTHING is stored (Round 82's speaking_line_results belong
// to Speaking Practice alone — the privacy boundary Shastri set).
// Points/stars/completion flow through the game screen's existing
// systems (extra award + activity logger), exactly like other games.
// ============================================================================

const NAVY = '#1B2A4A';
const GOLD = '#D4AF37';
const GOLD_DARK = '#B8860B';
const GREEN = '#2E7D32';
const INK = '#1C2733';
const SLATE = '#54687C';
const LINE = '#E3E9F0';
const CREAM = '#FDF6E0';

interface WbWord { word: string; example: string; emoji?: string; image: string }
interface WbPhonics { letter: string; sound: string; word: string; emoji?: string; image: string }
interface WbCircle { question: string; options: string[]; answer: number }
interface WbPattern { model: string; say: string; modelImage: string; sayImage: string }
interface WbLine { who: string; line: string; learner: boolean }
type WbActivity =
  | { type: 'word_cards'; heading: string; words: WbWord[] }
  | { type: 'say_it'; heading: string; phrases: string[] }
  | { type: 'match'; heading: string; pairs: WbWord[] }
  | { type: 'phonics'; heading: string; cards: WbPhonics[] }
  | { type: 'word_build'; heading: string; words: WbWord[] }
  | { type: 'circle'; heading: string; items: WbCircle[] }
  | { type: 'pattern'; heading: string; pairs: WbPattern[] }
  | { type: 'dialogue'; heading: string; lines: WbLine[] };
interface WbPage { kind: string; title: string; activities: WbActivity[] }
export interface WorkbookData {
  version: number;
  stage: number;
  module: number;
  lesson: number;
  stageName: string;
  moduleTitle: string;
  lessonTitle: string;
  goal: string;
  scene: string;
  pages: WbPage[];
}

type SayFn = (text: string, onDone?: () => void) => void;
type CheckFn = (firstTryCorrect: boolean) => void;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Picture that hides itself when its file is missing (some workbook
 *  pictures exist only as print assets); the emoji stands in. */
function WbImage({ uri, emoji, height, width }: { uri?: string; emoji?: string; height: number; width?: number }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={{ height, width, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: height * 0.55 }}>{emoji || '🏏'}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ height, width, borderRadius: 10 }}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

function Tick({ done }: { done: boolean }) {
  return (
    <View
      style={{
        width: 24, height: 24, borderRadius: 7, borderWidth: 2.2,
        borderColor: done ? GREEN : '#9DB4C8', backgroundColor: done ? GREEN : '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
    </View>
  );
}

function ActBlock({ title, ins, children }: { title: string; ins?: string; children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 2, borderColor: LINE, borderRadius: 14, padding: 14, marginTop: 12 }}>
      <Text style={{ fontWeight: '800', color: GREEN, letterSpacing: 0.6, fontSize: 13, textTransform: 'uppercase' }}>{title}</Text>
      {ins ? <Text style={{ fontSize: 14, color: SLATE, marginTop: 2, marginBottom: 6 }}>{ins}</Text> : null}
      {children}
    </View>
  );
}

function ListenButton({ onPress, small }: { onPress: () => void; small?: boolean }) {
  const size = small ? 34 : 40;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Listen"
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: NAVY,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name="volume-high" size={small ? 17 : 20} color={GOLD} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Listen-and-repeat row with the app's speech check (feedback only —
// nothing is stored). Used by Say it!, partner dialogue learner lines
// and one-word patterns. Where the device cannot check speech, the
// child ticks the box themselves, exactly like the printed page.
// ---------------------------------------------------------------------------
function SpeakRow({
  text,
  say,
  onCheck,
  who,
}: {
  text: string;
  say: SayFn;
  onCheck: CheckFn;
  who?: string;
}) {
  const [passed, setPassed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const attemptsRef = useRef(0);
  const checkedRef = useRef(false);

  const finish = useCallback(
    (firstTry: boolean) => {
      setPassed(true);
      if (!checkedRef.current) {
        checkedRef.current = true;
        onCheck(firstTry);
      }
    },
    [onCheck]
  );

  const speech = useSpeechCheck({
    onFinal: (transcript) => {
      const score = scoreSpeech(text, transcript);
      if (score.passed) {
        playDing();
        setFeedback(scoreMessage(score.accuracy));
        finish(attemptsRef.current === 0);
      } else {
        attemptsRef.current += 1;
        setFeedback(`${scoreMessage(score.accuracy)} Try again!`);
      }
    },
    onError: (error) => {
      setFeedback(speechErrorMessage(error));
    },
  });

  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF2F6' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Tick done={passed} />
        <View style={{ flex: 1 }}>
          {who ? (
            <Text style={{ fontSize: 11, fontWeight: '800', color: GOLD_DARK, textTransform: 'uppercase', letterSpacing: 0.5 }}>{who}</Text>
          ) : null}
          <Text style={{ fontSize: 16, fontWeight: '700', color: NAVY }}>{text}</Text>
        </View>
        <ListenButton small onPress={() => say(text)} />
        {speech.supported === false ? (
          <Pressable
            onPress={() => finish(true)}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 2, borderColor: '#9DB4C8' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: SLATE }}>{passed ? 'Said it ✓' : 'I said it'}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { void speech.start(); }}
            accessibilityLabel="Speak"
            disabled={passed || speech.listening}
            style={{
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: passed ? GREEN : speech.listening ? '#C0392B' : GOLD,
              alignItems: 'center', justifyContent: 'center', opacity: passed ? 0.85 : 1,
            }}
          >
            <Ionicons name={passed ? 'checkmark' : 'mic'} size={17} color={passed ? '#FFFFFF' : NAVY} />
          </Pressable>
        )}
      </View>
      {speech.listening ? (
        <Text style={{ fontSize: 13, color: SLATE, marginTop: 4 }}>Listening… {speech.interim}</Text>
      ) : feedback && !passed ? (
        <Text style={{ fontSize: 13, color: SLATE, marginTop: 4 }}>{feedback}</Text>
      ) : feedback && passed ? (
        <Text style={{ fontSize: 13, color: GREEN, fontWeight: '700', marginTop: 4 }}>{feedback}</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page 1 — word cards
// ---------------------------------------------------------------------------
function WordCards({ words, say }: { words: WbWord[]; say: SayFn }) {
  const [heard, setHeard] = useState<Set<number>>(new Set());
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
      {words.map((w, i) => (
        <Pressable
          key={i}
          onPress={() => {
            setHeard((prev) => new Set(prev).add(i));
            say(w.word, () => say(w.example));
          }}
          style={{
            width: '31%', flexGrow: 1, borderWidth: 2, borderColor: heard.has(i) ? GOLD : LINE,
            borderRadius: 12, padding: 8, alignItems: 'center', backgroundColor: '#FFFFFF',
          }}
        >
          <WbImage uri={w.image} emoji={w.emoji} height={84} width={110} />
          <Text style={{ fontWeight: '800', fontSize: 17, color: NAVY, textAlign: 'center' }}>{w.word}</Text>
          <Text style={{ fontSize: 11.5, color: SLATE, textAlign: 'center' }}>{w.example}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page 2 — Match: tap a picture, then tap its word
// ---------------------------------------------------------------------------
function MatchGame({ pairs, onCheck }: { pairs: WbWord[]; onCheck: CheckFn }) {
  const wordOrder = useMemo(() => shuffle(pairs.map((_, i) => i)), [pairs]);
  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrongPic, setWrongPic] = useState<number | null>(null);
  const [wrongWord, setWrongWord] = useState<number | null>(null);
  const spoiledRef = useRef<Set<number>>(new Set());

  const tapWord = (pairIdx: number) => {
    if (selected === null || matched.has(pairIdx)) return;
    if (pairIdx === selected) {
      playDing();
      onCheck(!spoiledRef.current.has(pairIdx));
      setMatched((prev) => new Set(prev).add(pairIdx));
      setSelected(null);
    } else {
      spoiledRef.current.add(selected);
      setWrongPic(selected);
      setWrongWord(pairIdx);
      setTimeout(() => { setWrongPic(null); setWrongWord(null); }, 500);
    }
  };

  return (
    <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
      <View style={{ flex: 1, gap: 8 }}>
        {pairs.map((p, i) => (
          <Pressable
            key={i}
            disabled={matched.has(i)}
            onPress={() => setSelected(i)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderRadius: 10,
              padding: 6, borderColor: matched.has(i) ? GREEN : wrongPic === i ? '#C0392B' : selected === i ? GOLD : LINE,
              backgroundColor: matched.has(i) ? '#E3EFE3' : '#FFFFFF',
            }}
          >
            <Text style={{ fontWeight: '800', color: GOLD_DARK, width: 18, textAlign: 'center' }}>{i + 1}</Text>
            <WbImage uri={p.image} emoji={p.emoji} height={46} width={64} />
            {matched.has(i) ? <Ionicons name="checkmark-circle" size={20} color={GREEN} /> : null}
          </Pressable>
        ))}
      </View>
      <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
        {wordOrder.map((pairIdx) => (
          <Pressable
            key={pairIdx}
            disabled={matched.has(pairIdx)}
            onPress={() => tapWord(pairIdx)}
            style={{
              borderWidth: 2, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 12,
              borderColor: matched.has(pairIdx) ? GREEN : wrongWord === pairIdx ? '#C0392B' : LINE,
              backgroundColor: matched.has(pairIdx) ? '#E3EFE3' : '#FFFFFF',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: NAVY, textAlign: 'center' }}>{pairs[pairIdx].word}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page 2 — Letters and sounds: hear the word, tap its card
// ---------------------------------------------------------------------------
function PhonicsGame({ cards, say, onCheck }: { cards: WbPhonics[]; say: SayFn; onCheck: CheckFn }) {
  const order = useMemo(() => shuffle(cards.map((_, i) => i)), [cards]);
  const [round, setRound] = useState(0);
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number | null>(null);
  const firstTryRef = useRef(true);
  const target = order[round];

  useEffect(() => {
    if (target !== undefined) {
      firstTryRef.current = true;
      const t = setTimeout(() => say(cards[target].word), 400);
      return () => clearTimeout(t);
    }
  }, [round, target, cards, say]);

  if (target === undefined) {
    return <Text style={{ fontSize: 15, color: GREEN, fontWeight: '700', marginTop: 6 }}>All the sounds done! ✓</Text>;
  }
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <ListenButton onPress={() => say(cards[target].word)} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: NAVY, flex: 1 }}>
          Listen and tap the right card. ({round + 1} of {cards.length})
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {cards.map((c, i) => (
          <Pressable
            key={i}
            disabled={doneSet.has(i)}
            onPress={() => {
              if (i === target) {
                playDing();
                onCheck(firstTryRef.current);
                setDoneSet((prev) => new Set(prev).add(i));
                setRound((r) => r + 1);
              } else {
                firstTryRef.current = false;
                setWrong(i);
                setTimeout(() => setWrong(null), 500);
              }
            }}
            style={{
              width: '31%', flexGrow: 1, borderWidth: 2, borderRadius: 12, padding: 8, alignItems: 'center',
              borderColor: doneSet.has(i) ? GREEN : wrong === i ? '#C0392B' : LINE,
              backgroundColor: doneSet.has(i) ? '#E3EFE3' : '#FFFFFF',
            }}
          >
            <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 30, color: NAVY }}>{c.letter}</Text>
            <WbImage uri={c.image} emoji={c.emoji} height={52} width={76} />
            <Text style={{ fontWeight: '800', fontSize: 15, color: NAVY }}>{c.word}</Text>
            <Text style={{ fontSize: 12, color: SLATE }}>sound: {c.sound}</Text>
            {doneSet.has(i) ? <Ionicons name="checkmark-circle" size={18} color={GREEN} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page 2 — Look and write, as word building with letter tiles
// ---------------------------------------------------------------------------
function WordBuild({ words, onCheck }: { words: WbWord[]; onCheck: CheckFn }) {
  const [idx, setIdx] = useState(0);
  if (idx >= words.length) {
    return <Text style={{ fontSize: 15, color: GREEN, fontWeight: '700', marginTop: 6 }}>All the words built! ✓</Text>;
  }
  return (
    <WordAttempt
      key={idx}
      current={words[idx]}
      idx={idx}
      total={words.length}
      onCheck={onCheck}
      onDone={() => setIdx((i) => i + 1)}
    />
  );
}

function WordAttempt({
  current,
  idx,
  total,
  onCheck,
  onDone,
}: {
  current: WbWord;
  idx: number;
  total: number;
  onCheck: CheckFn;
  onDone: () => void;
}) {
  const tiles = useMemo(
    () => shuffle(current.word.split('').map((ch, i) => ({ ch, id: i }))),
    [current]
  );
  const [placed, setPlaced] = useState<number[]>([]); // tile ids, in order
  const [flash, setFlash] = useState<number | null>(null);
  const firstTryRef = useRef(true);
  const target = current.word;
  const tapTile = (tile: { ch: string; id: number }) => {
    if (placed.includes(tile.id)) return;
    const expected = target[placed.length];
    if (tile.ch === expected) {
      const next = [...placed, tile.id];
      setPlaced(next);
      if (next.length === target.length) {
        playDing();
        onCheck(firstTryRef.current);
        setTimeout(onDone, 700);
      }
    } else {
      firstTryRef.current = false;
      setFlash(tile.id);
      setTimeout(() => setFlash(null), 450);
    }
  };

  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <WbImage uri={current.image} emoji={current.emoji} height={64} width={88} />
        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', flex: 1 }}>
          {target.split('').map((_, i) => (
            <View
              key={i}
              style={{
                width: 30, height: 38, borderBottomWidth: 3, borderBottomColor: '#C9D4DF',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 22, fontWeight: '800', color: NAVY }}>
                {i < placed.length ? target[i] : ''}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.id}
            disabled={placed.includes(tile.id)}
            onPress={() => tapTile(tile)}
            style={{
              width: 44, height: 48, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
              borderColor: flash === tile.id ? '#C0392B' : LINE,
              backgroundColor: placed.includes(tile.id) ? '#EEF2F6' : '#FFFFFF',
              opacity: placed.includes(tile.id) ? 0.35 : 1,
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: '800', color: NAVY }}>{tile.ch}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => { firstTryRef.current = false; setPlaced([]); }}
          style={{ paddingHorizontal: 12, height: 48, borderRadius: 10, borderWidth: 2, borderColor: LINE, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: SLATE }}>Clear</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12.5, color: SLATE, marginTop: 8 }}>Word {idx + 1} of {total} — tap the letters in order.</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page 3 — Circle the correct sentence
// ---------------------------------------------------------------------------
function CircleGame({ items, onCheck }: { items: WbCircle[]; onCheck: CheckFn }) {
  const shuffled = useMemo(
    () => items.map((it) => ({ ...it, display: shuffle(it.options.map((text, i) => ({ text, correct: i === it.answer }))) })),
    [items]
  );
  const [solved, setSolved] = useState<Set<number>>(new Set());
  const [wrongPick, setWrongPick] = useState<string | null>(null);
  const spoiledRef = useRef<Set<number>>(new Set());

  return (
    <View style={{ marginTop: 4 }}>
      {shuffled.map((it, qi) => (
        <View key={qi} style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '700', color: INK, marginBottom: 6 }}>{it.question}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {it.display.map((opt, oi) => {
              const isSolved = solved.has(qi);
              const key = `${qi}:${oi}`;
              return (
                <Pressable
                  key={oi}
                  disabled={isSolved}
                  onPress={() => {
                    if (opt.correct) {
                      playDing();
                      onCheck(!spoiledRef.current.has(qi));
                      setSolved((prev) => new Set(prev).add(qi));
                    } else {
                      spoiledRef.current.add(qi);
                      setWrongPick(key);
                      setTimeout(() => setWrongPick(null), 500);
                    }
                  }}
                  style={{
                    borderWidth: 2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
                    borderColor: isSolved && opt.correct ? GREEN : wrongPick === key ? '#C0392B' : LINE,
                    backgroundColor: isSolved && opt.correct ? '#E3EFE3' : '#FFFFFF',
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: NAVY }}>{opt.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page 3 — Copy the pattern: build the pair sentence from word tiles
// (a one-word pair becomes listen-and-repeat instead)
// ---------------------------------------------------------------------------
function PatternPair({ pair, say, onCheck }: { pair: WbPattern; say: SayFn; onCheck: CheckFn }) {
  const words = useMemo(() => pair.say.trim().split(/\s+/), [pair.say]);
  const tiles = useMemo(() => shuffle(words.map((w, i) => ({ w, id: i }))), [words]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [built, setBuilt] = useState(false);
  const firstTryRef = useRef(true);

  if (words.length < 2) {
    return (
      <View style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <WbImage uri={pair.modelImage} height={44} width={60} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: NAVY, flex: 1 }}>{pair.model}</Text>
          <ListenButton small onPress={() => say(pair.model)} />
        </View>
        <SpeakRow text={pair.say} say={say} onCheck={onCheck} />
      </View>
    );
  }

  const tapTile = (tile: { w: string; id: number }) => {
    if (built || placed.includes(tile.id)) return;
    if (tile.w === words[placed.length]) {
      const next = [...placed, tile.id];
      setPlaced(next);
      if (next.length === words.length) {
        playDing();
        onCheck(firstTryRef.current);
        setBuilt(true);
      }
    } else {
      firstTryRef.current = false;
      setFlash(tile.id);
      setTimeout(() => setFlash(null), 450);
    }
  };

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <WbImage uri={pair.modelImage} height={44} width={60} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: NAVY, flex: 1 }}>{pair.model}</Text>
        <ListenButton small onPress={() => say(pair.model)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 }}>
        <WbImage uri={pair.sayImage} height={44} width={60} />
        <View style={{ flex: 1 }}>
          <View style={{ minHeight: 40, borderBottomWidth: 2, borderBottomColor: '#C9D4DF', flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 4 }}>
            {placed.map((id) => (
              <Text key={id} style={{ fontSize: 16.5, fontWeight: '700', color: built ? GREEN : NAVY }}>
                {tiles.find((t) => t.id === id)?.w}
              </Text>
            ))}
            {!built && placed.length === 0 ? <Text style={{ fontSize: 15, color: '#9DB4C8' }}>Build the sentence…</Text> : null}
          </View>
          {!built ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {tiles.map((tile) => (
                <Pressable
                  key={tile.id}
                  disabled={placed.includes(tile.id)}
                  onPress={() => tapTile(tile)}
                  style={{
                    borderWidth: 2, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
                    borderColor: flash === tile.id ? '#C0392B' : LINE,
                    backgroundColor: placed.includes(tile.id) ? '#EEF2F6' : '#FFFFFF',
                    opacity: placed.includes(tile.id) ? 0.35 : 1,
                  }}
                >
                  <Text style={{ fontSize: 15.5, fontWeight: '700', color: NAVY }}>{tile.w}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => { firstTryRef.current = false; setPlaced([]); }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 2, borderColor: LINE }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: SLATE }}>Clear</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={{ fontSize: 13.5, color: GREEN, fontWeight: '700', marginTop: 6 }}>Well built! ✓</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page 3 — Read with a partner
// ---------------------------------------------------------------------------
function DialogueGame({ lines, say, onCheck }: { lines: WbLine[]; say: SayFn; onCheck: CheckFn }) {
  const [heard, setHeard] = useState<Set<number>>(new Set());
  return (
    <View style={{ marginTop: 4 }}>
      {lines.map((ln, i) =>
        ln.learner ? (
          <SpeakRow key={i} text={ln.line} who={ln.who} say={say} onCheck={onCheck} />
        ) : (
          <View key={i} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF2F6' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Tick done={heard.has(i)} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: GOLD_DARK, textTransform: 'uppercase', letterSpacing: 0.5 }}>{ln.who}</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: INK }}>{ln.line}</Text>
              </View>
              <ListenButton
                small
                onPress={() => {
                  setHeard((prev) => new Set(prev).add(i));
                  say(ln.line);
                }}
              />
            </View>
          </View>
        )
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The flow: three pages + the star-box finish, inside one paper page
// ---------------------------------------------------------------------------
function WorkbookFlow({ data, onComplete }: { data: WorkbookData; onComplete?: () => void }) {
  const [page, setPage] = useState(0);
  const [score, setScore] = useState(0);
  const [checks, setChecks] = useState(0);
  const [finished, setFinished] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const completedRef = useRef(false);

  const say = useCallback<SayFn>((text, onDone) => {
    try {
      stopRef.current?.();
    } catch { /* nothing playing */ }
    stopRef.current = null;
    const url = voiceUrlForText(text);
    if (url) {
      stopRef.current = playRecordedLine(url, () => onDone?.());
    } else {
      speakWithCallback(text, onDone);
    }
  }, []);

  // Resolve this lesson's lines to approved recordings, the same way
  // the lesson player does (module parity picks the model voices).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const identity = await getStudentIdentity();
      const prefs = identity ? await fetchVoicePrefs(identity) : {};
      const texts: string[] = [data.goal];
      for (const p of data.pages) {
        for (const a of p.activities) {
          if (a.type === 'word_cards' || a.type === 'word_build') {
            a.words.forEach((w) => texts.push(w.word, w.example));
          } else if (a.type === 'match') {
            a.pairs.forEach((w) => texts.push(w.word, w.example));
          } else if (a.type === 'say_it') texts.push(...a.phrases);
          else if (a.type === 'phonics') a.cards.forEach((c) => texts.push(c.word));
          else if (a.type === 'circle') a.items.forEach((it) => texts.push(it.question, ...it.options));
          else if (a.type === 'pattern') a.pairs.forEach((pr) => texts.push(pr.model, pr.say));
          else if (a.type === 'dialogue') a.lines.forEach((ln) => texts.push(ln.line));
        }
      }
      const preferred: VoiceCategory[] = data.module % 2 === 1 ? ['M1', 'B1'] : ['F1', 'G1'];
      const map = await resolveVoicesForTexts(texts, prefs, preferred);
      if (!cancelled) setActiveVoiceMap(map);
    })();
    return () => {
      cancelled = true;
      setActiveVoiceMap(null);
      try {
        stopRef.current?.();
      } catch { /* nothing playing */ }
      cancelSpeechCue();
    };
  }, [data]);

  const onCheck = useCallback<CheckFn>((firstTryCorrect) => {
    setChecks((c) => c + 1);
    if (firstTryCorrect) setScore((s) => s + 1);
  }, []);

  const totalChecks = useMemo(() => {
    let n = 0;
    for (const p of data.pages) {
      for (const a of p.activities) {
        if (a.type === 'say_it') n += a.phrases.length;
        else if (a.type === 'match') n += a.pairs.length;
        else if (a.type === 'phonics') n += a.cards.length;
        else if (a.type === 'word_build') n += a.words.length;
        else if (a.type === 'circle') n += a.items.length;
        else if (a.type === 'pattern') n += a.pairs.length;
        else if (a.type === 'dialogue') n += a.lines.filter((ln) => ln.learner).length;
      }
    }
    return n;
  }, [data]);

  const finish = () => {
    setFinished(true);
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  };

  const current = data.pages[page];
  const ratio = totalChecks > 0 ? score / totalChecks : 0;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0;

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
      {finished ? (
        <View style={{ alignItems: 'center', paddingVertical: 28 }}>
          <View style={{ borderWidth: 2.5, borderColor: GOLD, backgroundColor: CREAM, borderRadius: 16, paddingVertical: 22, paddingHorizontal: 28, alignItems: 'center', width: '100%' }}>
            <Text style={{ fontSize: 34, letterSpacing: 6 }}>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</Text>
            <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 24, color: NAVY, marginTop: 8, textAlign: 'center' }}>
              Well done! You finished Lesson {data.lesson}.
            </Text>
            <Text style={{ fontSize: 15, color: SLATE, marginTop: 6, textAlign: 'center' }}>
              You scored {score} of {totalChecks} first tries.
            </Text>
          </View>
          <Text style={{ fontSize: 13.5, color: SLATE, marginTop: 16, textAlign: 'center' }}>
            Play it again any time — practice makes it stick!
          </Text>
        </View>
      ) : (
        <>
          {page === 0 ? (
            <View style={{ backgroundColor: NAVY, borderRadius: 14, padding: 16 }}>
              <Text style={{ color: GOLD, fontWeight: '800', letterSpacing: 1.4, fontSize: 11, textTransform: 'uppercase' }}>
                Lesson {data.lesson} of 8 · Stage {data.stage} · Module {data.module}
              </Text>
              <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 25, color: '#FFFFFF', lineHeight: 30, marginVertical: 4 }}>
                {data.lessonTitle}
              </Text>
              <Text style={{ color: '#CFD9E4', fontSize: 14 }}>{data.goal}</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ backgroundColor: NAVY, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ color: GOLD, fontWeight: '800', fontSize: 12.5 }}>Lesson {data.lesson} · {current.title}</Text>
              </View>
              <Text style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 19, color: NAVY, flex: 1 }} numberOfLines={1}>
                {data.lessonTitle}
              </Text>
            </View>
          )}

          {page === 0 ? (
            <>
              <View style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF', alignItems: 'center' }}>
                <WbImage uri={data.scene} height={190} width={340} />
              </View>
              <View style={{ backgroundColor: CREAM, borderWidth: 2, borderColor: GOLD, borderRadius: 12, padding: 12, marginTop: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#8A6D00' }}>
                  Tip: a touch pen is lovely for these pages — fingers work too.
                </Text>
              </View>
            </>
          ) : null}

          {current.activities.map((a, ai) => (
            <ActBlock
              key={ai}
              title={a.heading}
              ins={
                a.type === 'word_cards'
                  ? 'Tap a card to hear the word.'
                  : a.type === 'say_it'
                    ? 'Say each sentence out loud. Tap the microphone when you are ready.'
                    : a.type === 'match'
                      ? 'Tap a picture, then tap its word.'
                      : a.type === 'phonics'
                        ? 'Say the letter, say the sound — then listen and tap.'
                        : a.type === 'word_build'
                          ? 'Look at the picture. Build the word with the letters.'
                          : a.type === 'circle'
                            ? 'Tap the correct sentence.'
                            : a.type === 'pattern'
                              ? 'Read the dark sentence. Then build the new one.'
                              : 'Take turns. Listen, then say your lines.'
              }
            >
              {a.type === 'word_cards' ? <WordCards words={a.words} say={say} /> : null}
              {a.type === 'say_it' ? (
                <View>
                  {a.phrases.map((p, i) => (
                    <SpeakRow key={i} text={p} say={say} onCheck={onCheck} />
                  ))}
                </View>
              ) : null}
              {a.type === 'match' ? <MatchGame pairs={a.pairs} onCheck={onCheck} /> : null}
              {a.type === 'phonics' ? <PhonicsGame cards={a.cards} say={say} onCheck={onCheck} /> : null}
              {a.type === 'word_build' ? <WordBuild words={a.words} onCheck={onCheck} /> : null}
              {a.type === 'circle' ? <CircleGame items={a.items} onCheck={onCheck} /> : null}
              {a.type === 'pattern' ? (
                <View>
                  {a.pairs.map((pr, i) => (
                    <PatternPair key={i} pair={pr} say={say} onCheck={onCheck} />
                  ))}
                </View>
              ) : null}
              {a.type === 'dialogue' ? <DialogueGame lines={a.lines} say={say} onCheck={onCheck} /> : null}
            </ActBlock>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, borderTopWidth: 1, borderTopColor: '#EEF2F6', paddingTop: 12 }}>
            <Text style={{ fontSize: 12, color: '#8FA1B3', fontWeight: '700', flex: 1 }}>
              Lesson {data.lesson} · Page {page + 1} of 3 — {current.title}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {page > 0 ? (
                <Pressable
                  onPress={() => setPage((p) => p - 1)}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 2, borderColor: LINE }}
                >
                  <Text style={{ fontWeight: '800', color: SLATE }}>‹ Back</Text>
                </Pressable>
              ) : null}
              {page < 2 ? (
                <Pressable
                  onPress={() => setPage((p) => p + 1)}
                  style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: GOLD, borderBottomWidth: 3, borderBottomColor: GOLD_DARK }}
                >
                  <Text style={{ fontWeight: '800', color: NAVY }}>Next page ›</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={finish}
                  style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: GOLD, borderBottomWidth: 3, borderBottomColor: GOLD_DARK }}
                >
                  <Text style={{ fontWeight: '800', color: NAVY }}>Finish ★</Text>
                </Pressable>
              )}
            </View>
          </View>
          <Text style={{ fontSize: 12, color: '#8FA1B3', fontWeight: '700', marginTop: 6 }}>
            Checks so far: {checks} · First-try score: {score}
          </Text>
        </>
      )}
    </View>
  );
}

export default function WorkbookGame({
  data,
  onComplete,
}: {
  data: any;
  title?: string;
  onComplete?: () => void;
}) {
  const [playKey, setPlayKey] = useState(0);
  const valid =
    data && Array.isArray(data.pages) && data.pages.length === 3 && typeof data.lessonTitle === 'string';
  if (!valid) {
    return (
      <Text className="text-center font-sans text-slate-500 py-10">
        This workbook game has no pages yet.
      </Text>
    );
  }
  const wb = data as WorkbookData;
  return (
    <View>
      <WorkbookFlow key={playKey} data={wb} onComplete={onComplete} />
      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <Pressable
          onPress={() => setPlayKey((k) => k + 1)}
          style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, borderWidth: 2, borderColor: LINE, backgroundColor: '#FFFFFF' }}
        >
          <Text style={{ fontWeight: '800', color: SLATE }}>↻ Start the workbook again</Text>
        </Pressable>
      </View>
    </View>
  );
}
