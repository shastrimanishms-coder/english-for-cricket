import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { cancelSpeechCue, playDing, speakWithCallback } from '../../lib/speechCue';

// ============================================================================
// Built-in games (Round 39). A game row with an `engine` and a `data`
// jsonb plays right here in the app — no uploaded HTML file needed.
// Uploaded games (engine null) still play through the WebView as before.
//
// Data shapes:
//   picture_tap  { items: [{ word, image }] }
//     Hear the word, tap its picture (4 choices).
//   mascot_says  { items: [{ text, image }] }
//     Hear the command ("Run!"), tap the matching action picture.
//   number_catch { items: [{ value, word }] }
//     Hear the number word, tap the digit tile.
//   memory_pairs { items: [{ word, image }] }
//     Flip cards: match each picture to its word (first 6 items).
//   sort_it      { mode: "order", prompt?, items: string[] }
//                  Tap the tiles in the right order.
//                { mode: "groups", groups: [{ label, words: string[] }] }
//                  Each word card goes into its labelled bucket.
//   sentence_builder (Round 75)
//                { items: [{ sentence, prompt? }] }
//                  Tap the shuffled word tiles to build the sentence.
//   transformer  { items: [{ instruction, before, options, answer, note? }] }
//                  Pick the correctly changed sentence from the options.
//                { items: [{ instruction, before, answer, extraWords?, note? }] }
//                  …or build it from tiles when `answer` is a string.
//   choice_chase { timePerQuestion?, items: [{ question, options, answer, image? }] }
//                  Timed multiple-choice race along a progress track.
//   scenario_cards
//                { items: [{ situation, image?, question?, options, answer, explanation }] }
//                  Pick the best response; an explanation follows each pick.
//   data_dash    { display: { heading?, columns?, rows?, lines? },
//                  timePerQuestion?, questions: [{ question, options, answer }] }
//                  Read the scorecard/table, then answer against a gentle timer.
// ============================================================================

interface TapItem { word?: string; text?: string; image?: string; value?: number }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function speak(text: string) {
  speakWithCallback(text, () => {});
}

function Stars({ score, total }: { score: number; total: number }) {
  const ratio = total > 0 ? score / total : 0;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0;
  return (
    <Text className="text-4xl mb-2">{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</Text>
  );
}

function EndScreen({ score, total, onReplay }: { score: number; total: number; onReplay: () => void }) {
  return (
    <View className="items-center py-10">
      <Text className="text-6xl mb-3">🏆</Text>
      <Text className="font-display text-3xl font-semibold text-navy mb-1">Well played!</Text>
      <Stars score={score} total={total} />
      <Text className="font-sans text-lg text-slate-500 mb-8">You scored {score} of {total}</Text>
      <Pressable onPress={onReplay} className="px-8 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center">
        <Text className="font-sans text-navy font-bold">Play again</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tap games: picture_tap / mascot_says (image choices), number_catch (digits)
// ---------------------------------------------------------------------------
function TapGame({ engine, data }: { engine: string; data: any }) {
  const items: TapItem[] = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data]);
  const rounds = useMemo(() => shuffle(items).slice(0, 10), [items]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrongFirst, setWrongFirst] = useState(false);
  const current = rounds[idx];

  const options = useMemo(() => {
    if (!current) return [];
    const others = shuffle(items.filter((i) => i !== current)).slice(0, 3);
    return shuffle([current, ...others]);
  }, [current, items]);

  const promptOf = useCallback(
    (item: TapItem) => (engine === 'number_catch' ? item.word || String(item.value) : engine === 'mascot_says' ? item.text || '' : item.word || ''),
    [engine],
  );

  useEffect(() => {
    if (current) {
      const t = setTimeout(() => speak(promptOf(current)), 350);
      return () => clearTimeout(t);
    }
  }, [current, promptOf]);

  useEffect(() => () => cancelSpeechCue(), []);

  if (items.length === 0) return <Text className="text-center font-sans text-slate-500 py-10">This game has no questions yet.</Text>;
  if (!current) return <EndScreen score={score} total={rounds.length} onReplay={() => { setIdx(0); setScore(0); setPicked(null); }} />;

  const choose = (opt: TapItem, optIdx: number) => {
    if (picked !== null && options[picked] === current) return;
    if (opt === current) {
      playDing();
      if (!wrongFirst) setScore((s) => s + 1);
      setPicked(optIdx);
      setTimeout(() => { setPicked(null); setWrongFirst(false); setIdx((i) => i + 1); }, 800);
    } else {
      setWrongFirst(true);
      setPicked(optIdx);
      setTimeout(() => setPicked(null), 450);
    }
  };

  return (
    <View>
      <View className="flex-row justify-between items-center mb-4">
        <Text className="font-sans font-bold text-slate-500">Question {Math.min(idx + 1, rounds.length)} of {rounds.length}</Text>
        <Text className="font-sans font-bold text-gold-dark">Score {score}</Text>
      </View>
      <Pressable onPress={() => speak(promptOf(current))} className="bg-navy rounded-3xl py-6 px-4 items-center mb-5">
        <Text className="text-4xl mb-1">🔊</Text>
        <Text className="font-sans text-white font-bold">{engine === 'number_catch' ? 'Tap the number you hear' : engine === 'mascot_says' ? 'Do what the mascot says!' : 'Tap the picture you hear'}</Text>
        <Text className="font-sans text-slate-300 text-sm">Tap to hear it again</Text>
      </Pressable>
      <View className="flex-row flex-wrap justify-between">
        {options.map((opt, i) => {
          const isPicked = picked === i;
          const isRight = isPicked && opt === current;
          return (
            <Pressable
              key={i}
              onPress={() => choose(opt, i)}
              className={`w-[48%] rounded-3xl border-2 mb-4 overflow-hidden ${isPicked ? (isRight ? 'border-pitch bg-green-50' : 'border-red-300 bg-red-50') : 'border-inkline bg-white'}`}
            >
              {engine === 'number_catch' ? (
                <View className="h-32 items-center justify-center">
                  <Text className="font-display text-6xl font-semibold text-navy">{opt.value}</Text>
                </View>
              ) : (
                <Image source={{ uri: opt.image }} style={{ width: '100%', height: 128, backgroundColor: '#FFFFFF' }} resizeMode="contain" />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Memory pairs
// ---------------------------------------------------------------------------
function MemoryPairs({ data }: { data: any }) {
  const items: TapItem[] = useMemo(
    () => shuffle((Array.isArray(data?.items) ? data.items : []) as TapItem[]).slice(0, 6),
    [data],
  );
  interface Card { key: string; item: TapItem; kind: 'image' | 'word'; }
  const cards = useMemo<Card[]>(
    () => shuffle(items.flatMap((item, i) => [
      { key: `i${i}`, item, kind: 'image' as const },
      { key: `w${i}`, item, kind: 'word' as const },
    ])),
    [items],
  );
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const busy = useRef(false);

  const flip = (card: Card) => {
    if (busy.current || open.includes(card.key) || matched.includes(card.item.word || '')) return;
    if (card.kind === 'word') speak(card.item.word || '');
    const next = [...open, card.key];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next.map((k) => cards.find((c) => c.key === k)!);
      if (a.item === b.item) {
        playDing();
        setMatched((m) => [...m, a.item.word || '']);
        setOpen([]);
      } else {
        busy.current = true;
        setTimeout(() => { setOpen([]); busy.current = false; }, 900);
      }
    }
  };

  if (items.length === 0) return <Text className="text-center font-sans text-slate-500 py-10">This game has no cards yet.</Text>;
  if (matched.length === items.length) {
    return <EndScreen score={Math.max(1, items.length * 2 - Math.max(0, moves - items.length))} total={items.length * 2} onReplay={() => { setMatched([]); setOpen([]); setMoves(0); }} />;
  }

  return (
    <View>
      <Text className="font-sans font-bold text-slate-500 mb-4">Pairs found: {matched.length} of {items.length} · Moves: {moves}</Text>
      <View className="flex-row flex-wrap justify-between">
        {cards.map((card) => {
          const faceUp = open.includes(card.key) || matched.includes(card.item.word || '');
          return (
            <Pressable key={card.key} onPress={() => flip(card)} className={`w-[31%] h-28 rounded-2xl border-2 mb-3 overflow-hidden items-center justify-center ${faceUp ? 'border-gold bg-white' : 'border-navy bg-navy'}`}>
              {faceUp ? (
                card.kind === 'image' ? (
                  <Image source={{ uri: card.item.image }} style={{ width: '100%', height: '100%', backgroundColor: '#FFFFFF' }} resizeMode="contain" />
                ) : (
                  <Text className="font-display text-lg font-semibold text-navy px-1 text-center">{card.item.word}</Text>
                )
              ) : (
                <Text className="text-3xl">🃏</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sort it: order mode and groups mode
// ---------------------------------------------------------------------------
function SortIt({ data }: { data: any }) {
  const mode = data?.mode === 'groups' ? 'groups' : 'order';
  if (mode === 'order') return <SortOrder data={data} />;
  return <SortGroups data={data} />;
}

function SortOrder({ data }: { data: any }) {
  const sequence: string[] = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data]);
  const tiles = useMemo(() => shuffle(sequence.map((word, i) => ({ word, pos: i }))), [sequence]);
  const [placed, setPlaced] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);

  if (sequence.length === 0) return <Text className="text-center font-sans text-slate-500 py-10">This game has nothing to sort yet.</Text>;
  if (placed.length === sequence.length) {
    return <EndScreen score={Math.max(1, sequence.length - mistakes)} total={sequence.length} onReplay={() => { setPlaced([]); setMistakes(0); }} />;
  }

  const tap = (tile: { word: string; pos: number }) => {
    if (tile.pos === placed.length) {
      playDing();
      speak(tile.word);
      setPlaced((p) => [...p, tile.word]);
    } else {
      setMistakes((m) => m + 1);
      setWrong(tile.word);
      setTimeout(() => setWrong(null), 450);
    }
  };

  return (
    <View>
      <Text className="font-display text-xl font-semibold text-navy mb-1">{data?.prompt || 'Put them in order'}</Text>
      <Text className="font-sans text-slate-500 mb-4">Tap the tiles in the right order.</Text>
      <View className="flex-row flex-wrap gap-2 mb-6 min-h-[52px] bg-white border border-inkline rounded-2xl p-2">
        {placed.map((w) => (
          <View key={w} className="bg-pitch rounded-full px-4 py-2"><Text className="font-sans font-bold text-white">{w}</Text></View>
        ))}
        {placed.length === 0 ? <Text className="font-sans text-slate-400 px-2 py-2">Your order appears here…</Text> : null}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {tiles.filter((t) => !placed.includes(t.word)).map((tile) => (
          <Pressable key={tile.word} onPress={() => tap(tile)} className={`rounded-full px-4 py-2.5 border-2 ${wrong === tile.word ? 'bg-red-50 border-red-300' : 'bg-gold border-gold-dark'}`}>
            <Text className="font-sans font-bold text-navy">{tile.word}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SortGroups({ data }: { data: any }) {
  const groups: { label: string; words: string[] }[] = useMemo(() => (Array.isArray(data?.groups) ? data.groups : []), [data]);
  const deck = useMemo(() => shuffle(groups.flatMap((g) => g.words.map((word) => ({ word, label: g.label })))), [groups]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const current = deck[idx];

  useEffect(() => () => cancelSpeechCue(), []);
  if (!current) return <EndScreen score={score} total={deck.length} onReplay={() => { setIdx(0); setScore(0); }} />;

  const choose = (label: string) => {
    if (label === current.label) {
      playDing();
      setScore((s) => s + 1);
      setFlash(null);
      setIdx((i) => i + 1);
    } else {
      setFlash(label);
      setTimeout(() => setFlash(null), 450);
    }
  };

  return (
    <View>
      <Text className="font-sans font-bold text-slate-500 mb-4">Card {idx + 1} of {deck.length} · Score {score}</Text>
      <Pressable onPress={() => speak(current.word)} className="bg-navy rounded-3xl py-8 items-center mb-6">
        <Text className="font-display text-3xl font-semibold text-white">{current.word}</Text>
        <Text className="font-sans text-slate-300 text-sm mt-1">Tap to hear the word</Text>
      </Pressable>
      <View className="gap-3">
        {groups.map((g) => (
          <Pressable key={g.label} onPress={() => choose(g.label)} className={`rounded-full py-4 items-center border-2 ${flash === g.label ? 'bg-red-50 border-red-300' : 'bg-gold border-gold-dark'}`}>
            <Text className="font-sans font-bold text-navy text-base">{g.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers for the Round 75 engines
// ---------------------------------------------------------------------------
interface QuizItem {
  question?: string;
  options?: string[];
  answer?: number;
  image?: string;
}

function validQuizItems(raw: any): QuizItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (q) =>
      q &&
      typeof q.question === 'string' &&
      q.question.trim() &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      Number.isInteger(q.answer) &&
      q.answer >= 0 &&
      q.answer < q.options.length,
  );
}

function clampSeconds(value: any, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(120, Math.max(5, value)) : fallback;
}

// Gentle per-question countdown for one question (the caller remounts it
// per question via key). `running` false pauses it (feedback time);
// onTimeout fires once, on the tick that crosses zero while running.
function useCountdown(seconds: number, running: boolean, onTimeout: () => void) {
  const [left, setLeft] = useState(seconds);
  const prevLeft = useRef(seconds);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => Math.max(0, Math.round((l - 0.1) * 10) / 10)), 100);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (running && prevLeft.current > 0 && left <= 0) onTimeout();
    prevLeft.current = left;
    // onTimeout is the caller's latest closure; left/running are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, running]);
  return left;
}

function TimerBar({ left, total }: { left: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  return (
    <View className="mb-4">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="font-sans font-bold text-slate-500">⏱ Time left</Text>
        <Text className={`font-sans font-bold ${left <= 3 ? 'text-red-500' : 'text-gold-dark'}`}>{Math.ceil(left)}s</Text>
      </View>
      <View className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <View className={`h-full rounded-full ${left <= 3 ? 'bg-red-400' : 'bg-gold'}`} style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

function ScoreHeader({ label, idx, total, score }: { label: string; idx: number; total: number; score: number }) {
  return (
    <View className="flex-row justify-between items-center mb-4">
      <Text className="font-sans font-bold text-slate-500">{label} {Math.min(idx + 1, total)} of {total}</Text>
      <Text className="font-sans font-bold text-gold-dark">Score {score}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sentence builder: tap shuffled word tiles to build the target sentence
// ---------------------------------------------------------------------------
interface SentenceItem { sentence?: string; text?: string; prompt?: string }

function SentenceRound({ item, onDone }: { item: SentenceItem; onDone: (clean: boolean) => void }) {
  const target = useMemo(() => (item.sentence || item.text || '').trim().split(/\s+/), [item]);
  const tiles = useMemo(() => shuffle(target.map((word, pos) => ({ word, pos }))), [target]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [wrongPos, setWrongPos] = useState<number | null>(null);
  const [clean, setClean] = useState(true);

  const tap = (tile: { word: string; pos: number }) => {
    if (placed.includes(tile.pos)) return;
    if (tile.pos === placed.length) {
      playDing();
      const next = [...placed, tile.pos];
      setPlaced(next);
      if (next.length === target.length) {
        speak(target.join(' '));
        setTimeout(() => onDone(clean), 1100);
      }
    } else {
      setClean(false);
      setWrongPos(tile.pos);
      setTimeout(() => setWrongPos(null), 450);
    }
  };

  return (
    <View>
      <Text className="font-display text-xl font-semibold text-navy mb-1">Build the sentence</Text>
      {item.prompt ? <Text className="font-sans text-slate-500 mb-3">{item.prompt}</Text> : null}
      <Pressable onPress={() => speak(target.join(' '))} className="bg-navy rounded-full px-5 py-3 self-start flex-row items-center mb-5">
        <Text className="font-sans text-white font-bold">🔊 Hear the sentence</Text>
      </Pressable>
      <View className="flex-row flex-wrap gap-2 mb-6 min-h-[52px] bg-white border border-inkline rounded-2xl p-2">
        {placed.map((pos) => (
          <View key={pos} className="bg-pitch rounded-full px-4 py-2"><Text className="font-sans font-bold text-white">{target[pos]}</Text></View>
        ))}
        {placed.length === 0 ? <Text className="font-sans text-slate-400 px-2 py-2">Your sentence appears here…</Text> : null}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {tiles.filter((t) => !placed.includes(t.pos)).map((tile) => (
          <Pressable key={tile.pos} onPress={() => tap(tile)} className={`rounded-full px-4 py-2.5 border-2 ${wrongPos === tile.pos ? 'bg-red-50 border-red-300' : 'bg-gold border-gold-dark'}`}>
            <Text className="font-sans font-bold text-navy">{tile.word}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SentenceBuilder({ data }: { data: any }) {
  const items: SentenceItem[] = useMemo(
    () =>
      (Array.isArray(data?.items) ? data.items : []).filter(
        (i: SentenceItem) => typeof (i?.sentence || i?.text) === 'string' && (i.sentence || i.text || '').trim().length > 0,
      ),
    [data],
  );
  const rounds = useMemo(() => items.slice(0, 10), [items]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => () => cancelSpeechCue(), []);

  if (items.length === 0) return <Text className="text-center font-sans text-slate-500 py-10">This game has no sentences yet.</Text>;
  if (idx >= rounds.length) {
    return <EndScreen score={score} total={rounds.length} onReplay={() => { setIdx(0); setScore(0); }} />;
  }

  return (
    <View>
      <ScoreHeader label="Sentence" idx={idx} total={rounds.length} score={score} />
      <SentenceRound
        key={idx}
        item={rounds[idx]}
        onDone={(clean) => {
          if (clean) setScore((s) => s + 1);
          setIdx((i) => i + 1);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Transformer: change the sentence as instructed (options or word tiles)
// ---------------------------------------------------------------------------
interface TransformItem {
  instruction?: string;
  before?: string;
  options?: string[];
  answer?: number | string;
  extraWords?: string[];
  note?: string;
}

function TransformRound({ item, onDone }: { item: TransformItem; onDone: (clean: boolean) => void }) {
  const [done, setDone] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [clean, setClean] = useState(true);
  const [placed, setPlaced] = useState<number[]>([]);
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  const tilesMode = !Array.isArray(item.options);
  const options = useMemo(
    () =>
      Array.isArray(item.options)
        ? shuffle(item.options.map((text, i) => ({ text, correct: i === item.answer })))
        : [],
    [item],
  );
  const target = useMemo(
    () => (tilesMode && typeof item.answer === 'string' ? item.answer.trim().split(/\s+/) : []),
    [item, tilesMode],
  );
  const tiles = useMemo(() => {
    if (!tilesMode) return [];
    const answerTiles = target.map((word, pos) => ({ key: `a${pos}`, word, pos }));
    const extras = (Array.isArray(item.extraWords) ? item.extraWords : []).map((word: string, i: number) => ({ key: `x${i}`, word, pos: -1 }));
    return shuffle([...answerTiles, ...extras]);
  }, [item, target, tilesMode]);

  const finishItem = () => {
    setDone(true);
    speak(typeof item.answer === 'string' ? item.answer : item.options?.[item.answer as number] || '');
    setTimeout(() => onDone(clean), item.note ? 2600 : 1200);
  };

  const chooseOption = (opt: { text: string; correct: boolean }, optIdx: number) => {
    if (done) return;
    if (opt.correct) {
      playDing();
      setPicked(optIdx);
      finishItem();
    } else {
      setClean(false);
      setPicked(optIdx);
      setTimeout(() => setPicked(null), 450);
    }
  };

  const tapTile = (tile: { key: string; word: string; pos: number }) => {
    if (done || (tile.pos >= 0 && placed.includes(tile.pos))) return;
    if (tile.pos === placed.length) {
      playDing();
      const next = [...placed, tile.pos];
      setPlaced(next);
      if (next.length === target.length) finishItem();
    } else {
      setClean(false);
      setWrongKey(tile.key);
      setTimeout(() => setWrongKey(null), 450);
    }
  };

  return (
    <View>
      <View className="self-start bg-gold rounded-full px-4 py-2 mb-4">
        <Text className="font-sans font-bold text-navy">{item.instruction || 'Change the sentence'}</Text>
      </View>
      <Pressable onPress={() => speak(item.before || '')} className="bg-navy rounded-3xl py-6 px-4 items-center mb-5">
        <Text className="font-display text-2xl font-semibold text-white text-center">{item.before}</Text>
        <Text className="font-sans text-slate-300 text-sm mt-1">Tap to hear the sentence</Text>
      </Pressable>

      {tilesMode ? (
        <>
          <View className="flex-row flex-wrap gap-2 mb-6 min-h-[52px] bg-white border border-inkline rounded-2xl p-2">
            {placed.map((pos) => (
              <View key={pos} className="bg-pitch rounded-full px-4 py-2"><Text className="font-sans font-bold text-white">{target[pos]}</Text></View>
            ))}
            {placed.length === 0 ? <Text className="font-sans text-slate-400 px-2 py-2">Your new sentence appears here…</Text> : null}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {tiles.filter((t) => t.pos < 0 || !placed.includes(t.pos)).map((tile) => (
              <Pressable key={tile.key} onPress={() => tapTile(tile)} className={`rounded-full px-4 py-2.5 border-2 ${wrongKey === tile.key ? 'bg-red-50 border-red-300' : 'bg-gold border-gold-dark'}`}>
                <Text className="font-sans font-bold text-navy">{tile.word}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View className="gap-3">
          {options.map((opt, i) => {
            const isPicked = picked === i;
            const showRight = done && opt.correct;
            return (
              <Pressable
                key={i}
                onPress={() => chooseOption(opt, i)}
                className={`rounded-2xl py-4 px-4 border-2 ${showRight ? 'border-pitch bg-green-50' : isPicked ? 'border-red-300 bg-red-50' : 'border-inkline bg-white'}`}
              >
                <Text className="font-sans font-bold text-navy text-base">{opt.text}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {done && item.note ? (
        <View className="mt-5 bg-gold/20 border border-gold rounded-2xl p-4">
          <Text className="font-sans text-navy">💡 {item.note}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Transformer({ data }: { data: any }) {
  const items: TransformItem[] = useMemo(
    () =>
      (Array.isArray(data?.items) ? data.items : []).filter((i: TransformItem) => {
        if (!i || typeof i.before !== 'string' || !i.before.trim()) return false;
        if (Array.isArray(i.options)) {
          return i.options.length >= 2 && Number.isInteger(i.answer) && (i.answer as number) >= 0 && (i.answer as number) < i.options.length;
        }
        return typeof i.answer === 'string' && i.answer.trim().length > 0;
      }),
    [data],
  );
  const rounds = useMemo(() => items.slice(0, 10), [items]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => () => cancelSpeechCue(), []);

  if (items.length === 0) return <Text className="text-center font-sans text-slate-500 py-10">This game has no questions yet.</Text>;
  if (idx >= rounds.length) {
    return <EndScreen score={score} total={rounds.length} onReplay={() => { setIdx(0); setScore(0); }} />;
  }

  return (
    <View>
      <ScoreHeader label="Sentence" idx={idx} total={rounds.length} score={score} />
      <TransformRound
        key={idx}
        item={rounds[idx]}
        onDone={(clean) => {
          if (clean) setScore((s) => s + 1);
          setIdx((i) => i + 1);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Choice chase: timed multiple-choice race along a progress track
// ---------------------------------------------------------------------------
function ChaseQuestion({ item, per, onAnswer }: { item: QuizItem; per: number; onAnswer: (correct: boolean) => void }) {
  const options = useMemo(
    () => shuffle(item.options!.map((text, i) => ({ text, correct: i === item.answer }))),
    [item],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const busy = picked !== null || timedOut;

  const handleTimeout = useCallback(() => {
    setTimedOut(true);
    setTimeout(() => onAnswer(false), 1000);
  }, [onAnswer]);
  const left = useCountdown(per, !busy, handleTimeout);

  useEffect(() => {
    const t = setTimeout(() => speak(item.question || ''), 350);
    return () => clearTimeout(t);
  }, [item]);

  const choose = (opt: { text: string; correct: boolean }, optIdx: number) => {
    if (busy) return;
    setPicked(optIdx);
    if (opt.correct) playDing();
    setTimeout(() => onAnswer(opt.correct), 1000);
  };

  return (
    <View>
      <TimerBar left={left} total={per} />
      <Pressable onPress={() => speak(item.question || '')} className="bg-navy rounded-3xl py-6 px-4 items-center mb-5">
        <Text className="font-display text-2xl font-semibold text-white text-center">{item.question}</Text>
        <Text className="font-sans text-slate-300 text-sm mt-1">Tap to hear the question again</Text>
      </Pressable>
      {item.image ? (
        <Image source={{ uri: item.image }} style={{ width: '100%', height: 160, backgroundColor: '#FFFFFF' }} resizeMode="contain" className="rounded-2xl mb-5" />
      ) : null}
      {timedOut ? <Text className="font-sans font-bold text-red-500 mb-3">⏰ Time up! The right answer is shown in green.</Text> : null}
      <View className="gap-3">
        {options.map((opt, i) => {
          const isPicked = picked === i;
          const showRight = busy && opt.correct;
          return (
            <Pressable
              key={i}
              onPress={() => choose(opt, i)}
              className={`rounded-2xl py-4 px-4 border-2 ${showRight ? 'border-pitch bg-green-50' : isPicked ? 'border-red-300 bg-red-50' : 'border-inkline bg-white'}`}
            >
              <Text className="font-sans font-bold text-navy text-base">{opt.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ChoiceChase({ data }: { data: any }) {
  const items = useMemo(() => validQuizItems(data?.items).slice(0, 12), [data]);
  const per = clampSeconds(data?.timePerQuestion, 10);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);

  const onAnswer = useCallback((correct: boolean) => {
    if (correct) setScore((s) => s + 1);
    setResults((r) => [...r, correct]);
    setIdx((i) => i + 1);
  }, []);

  useEffect(() => () => cancelSpeechCue(), []);

  if (items.length === 0) return <Text className="text-center font-sans text-slate-500 py-10">This game has no questions yet.</Text>;
  if (idx >= items.length) {
    return <EndScreen score={score} total={items.length} onReplay={() => { setIdx(0); setScore(0); setResults([]); }} />;
  }

  return (
    <View>
      <ScoreHeader label="Step" idx={idx} total={items.length} score={score} />
      <View className="flex-row items-center gap-1 mb-1">
        <Text className="text-xl mr-1">🏃</Text>
        {items.map((_, i) => (
          <View
            key={i}
            className={`flex-1 h-3 rounded-full ${i < results.length ? (results[i] ? 'bg-pitch' : 'bg-red-300') : i === idx ? 'bg-gold' : 'bg-slate-200'}`}
          />
        ))}
        <Text className="text-xl ml-1">🏆</Text>
      </View>
      <Text className="font-sans text-slate-500 mb-4">Answer quickly and correctly to race to the trophy!</Text>
      <ChaseQuestion key={idx} item={items[idx]} per={per} onAnswer={onAnswer} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Scenario cards: pick the best response; an explanation follows each pick
// ---------------------------------------------------------------------------
interface ScenarioItem extends QuizItem {
  situation?: string;
  explanation?: string;
}

function ScenarioCards({ data }: { data: any }) {
  const items: ScenarioItem[] = useMemo(
    () =>
      (Array.isArray(data?.items) ? data.items : []).filter(
        (q: ScenarioItem) =>
          q &&
          typeof q.situation === 'string' &&
          q.situation.trim() &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          Number.isInteger(q.answer) &&
          q.answer! >= 0 &&
          q.answer! < q.options.length,
      ),
    [data],
  );
  const rounds = useMemo(() => items.slice(0, 10), [items]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const current = rounds[idx];
  const options = useMemo(
    () => (current ? shuffle(current.options!.map((text, i) => ({ text, correct: i === current.answer }))) : []),
    [current],
  );

  useEffect(() => () => cancelSpeechCue(), []);

  if (items.length === 0) return <Text className="text-center font-sans text-slate-500 py-10">This game has no scenarios yet.</Text>;
  if (!current) {
    return <EndScreen score={score} total={rounds.length} onReplay={() => { setIdx(0); setScore(0); setPicked(null); }} />;
  }

  const choose = (opt: { text: string; correct: boolean }, optIdx: number) => {
    if (picked !== null) return;
    setPicked(optIdx);
    if (opt.correct) {
      playDing();
      setScore((s) => s + 1);
    }
  };

  return (
    <View>
      <ScoreHeader label="Scenario" idx={idx} total={rounds.length} score={score} />
      <Pressable onPress={() => speak(current.situation || '')} className="bg-navy rounded-3xl py-6 px-5 mb-5">
        <Text className="text-3xl mb-2">🎴</Text>
        <Text className="font-sans text-white text-lg leading-6">{current.situation}</Text>
        <Text className="font-sans text-slate-300 text-sm mt-2">Tap to hear the situation</Text>
      </Pressable>
      {current.image ? (
        <Image source={{ uri: current.image }} style={{ width: '100%', height: 160, backgroundColor: '#FFFFFF' }} resizeMode="contain" className="rounded-2xl mb-5" />
      ) : null}
      <Text className="font-display text-xl font-semibold text-navy mb-3">{current.question || 'What is the best thing to do?'}</Text>
      <View className="gap-3">
        {options.map((opt, i) => {
          const isPicked = picked === i;
          const showRight = picked !== null && opt.correct;
          return (
            <Pressable
              key={i}
              onPress={() => choose(opt, i)}
              className={`rounded-2xl py-4 px-4 border-2 ${showRight ? 'border-pitch bg-green-50' : isPicked ? 'border-red-300 bg-red-50' : 'border-inkline bg-white'}`}
            >
              <Text className="font-sans font-bold text-navy text-base">{opt.text}</Text>
            </Pressable>
          );
        })}
      </View>
      {picked !== null ? (
        <View className="mt-5">
          {current.explanation ? (
            <View className="bg-gold/20 border border-gold rounded-2xl p-4 mb-4">
              <Text className="font-sans font-bold text-navy mb-1">{options[picked]?.correct ? '✅ Well chosen!' : '💡 Good try — here is the best choice:'}</Text>
              <Text className="font-sans text-navy">{current.explanation}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => { setPicked(null); setIdx((i) => i + 1); }}
            className="px-8 py-4 bg-gold border-b-4 border-gold-dark rounded-full items-center"
          >
            <Text className="font-sans text-navy font-bold">{idx + 1 >= rounds.length ? 'See my score' : 'Next scenario'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Data dash: read a scorecard/table, then answer against a gentle timer
// ---------------------------------------------------------------------------
function DashQuestion({ item, per, onDone }: { item: QuizItem; per: number; onDone: (scored: boolean) => void }) {
  const options = useMemo(
    () => shuffle(item.options!.map((text, i) => ({ text, correct: i === item.answer }))),
    [item],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [wrongFirst, setWrongFirst] = useState(false);
  const locked = timedOut || (picked !== null && options[picked]?.correct);

  const handleTimeout = useCallback(() => {
    setTimedOut(true);
    setTimeout(() => onDone(false), 1600);
  }, [onDone]);
  const left = useCountdown(per, !locked, handleTimeout);

  const choose = (opt: { text: string; correct: boolean }, optIdx: number) => {
    if (locked) return;
    if (opt.correct) {
      playDing();
      setPicked(optIdx);
      setTimeout(() => onDone(!wrongFirst), 900);
    } else {
      setWrongFirst(true);
      setPicked(optIdx);
      setTimeout(() => setPicked(null), 450);
    }
  };

  return (
    <View>
      <TimerBar left={left} total={per} />
      <Text className="font-display text-2xl font-semibold text-navy mb-4">{item.question}</Text>
      {timedOut ? <Text className="font-sans font-bold text-red-500 mb-3">⏰ Time up! The right answer is shown in green.</Text> : null}
      <View className="gap-3">
        {options.map((opt, i) => {
          const isPicked = picked === i;
          const showRight = locked && opt.correct;
          return (
            <Pressable
              key={i}
              onPress={() => choose(opt, i)}
              className={`rounded-2xl py-4 px-4 border-2 ${showRight ? 'border-pitch bg-green-50' : isPicked ? 'border-red-300 bg-red-50' : 'border-inkline bg-white'}`}
            >
              <Text className="font-sans font-bold text-navy text-base">{opt.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DataDash({ data }: { data: any }) {
  const display = data?.display && typeof data.display === 'object' ? data.display : null;
  const questions = useMemo(() => validQuizItems(data?.questions).slice(0, 10), [data]);
  const per = clampSeconds(data?.timePerQuestion, 30);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);

  const onDone = useCallback((scored: boolean) => {
    if (scored) setScore((s) => s + 1);
    setIdx((i) => i + 1);
  }, []);

  useEffect(() => () => cancelSpeechCue(), []);

  if (questions.length === 0) return <Text className="text-center font-sans text-slate-500 py-10">This game has no questions yet.</Text>;
  if (idx >= questions.length) {
    return <EndScreen score={score} total={questions.length} onReplay={() => { setIdx(0); setScore(0); }} />;
  }

  const columns: string[] = Array.isArray(display?.columns) ? display.columns : [];
  const rows: any[][] = Array.isArray(display?.rows) ? display.rows : [];
  const lines: string[] = Array.isArray(display?.lines) ? display.lines : [];

  return (
    <View>
      <ScoreHeader label="Question" idx={idx} total={questions.length} score={score} />
      {display ? (
        <View className="bg-white border-2 border-navy rounded-3xl p-4 mb-5">
          <Text className="font-display text-xl font-semibold text-navy mb-3">🏏 {display.heading || 'Match data'}</Text>
          {columns.length > 0 ? (
            <View className="flex-row bg-navy rounded-lg px-2 py-2 mb-1">
              {columns.map((c: string, i: number) => (
                <Text key={i} className="flex-1 font-sans font-bold text-white text-sm">{String(c)}</Text>
              ))}
            </View>
          ) : null}
          {rows.map((row, ri) => (
            <View key={ri} className={`flex-row px-2 py-2 rounded-lg ${ri % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
              {(Array.isArray(row) ? row : [row]).map((cell, ci) => (
                <Text key={ci} className={`flex-1 font-sans text-navy text-sm ${ci === 0 ? 'font-bold' : ''}`}>{String(cell)}</Text>
              ))}
            </View>
          ))}
          {lines.map((line, li) => (
            <Text key={li} className="font-sans text-navy text-sm py-1">{String(line)}</Text>
          ))}
        </View>
      ) : null}
      <DashQuestion key={idx} item={questions[idx]} per={per} onDone={onDone} />
    </View>
  );
}


// ---------------------------------------------------------------------------
export default function BuiltinGame({ engine, data, title }: { engine: string; data: any; title: string }) {
  return (
    <View>
      <Text className="font-display text-2xl font-semibold text-navy mb-4">{title}</Text>
      {engine === 'memory_pairs' ? (
        <MemoryPairs data={data} />
      ) : engine === 'sort_it' ? (
        <SortIt data={data} />
      ) : engine === 'sentence_builder' ? (
        <SentenceBuilder data={data} />
      ) : engine === 'transformer' ? (
        <Transformer data={data} />
      ) : engine === 'choice_chase' ? (
        <ChoiceChase data={data} />
      ) : engine === 'scenario_cards' ? (
        <ScenarioCards data={data} />
      ) : engine === 'data_dash' ? (
        <DataDash data={data} />
      ) : (
        <TapGame engine={engine} data={data} />
      )}
    </View>
  );
}
