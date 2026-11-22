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
export default function BuiltinGame({ engine, data, title }: { engine: string; data: any; title: string }) {
  return (
    <View>
      <Text className="font-display text-2xl font-semibold text-navy mb-4">{title}</Text>
      {engine === 'memory_pairs' ? (
        <MemoryPairs data={data} />
      ) : engine === 'sort_it' ? (
        <SortIt data={data} />
      ) : (
        <TapGame engine={engine} data={data} />
      )}
    </View>
  );
}
