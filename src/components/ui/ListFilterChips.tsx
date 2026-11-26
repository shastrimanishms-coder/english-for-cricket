import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';

export interface ListFilterChip {
  key: string;
  label: string;
}

interface ListFilterChipsProps {
  chips: ListFilterChip[];
  selectedKey: string;
  onChange: (key: string) => void;
}

// Round 76: the category quick-jump bar on the learner list
// screens (Games, Speaking Practice, Smart Reading). One horizontal
// scrollable row of chips - "All", then a chip per category (from
// the Categories manager) that actually has items on the page - so
// students can jump straight to what they want instead of scrolling
// the whole shelf. Single-select; the parent owns the filter state.
// Renders nothing when there is only "All" to show. (Stage chips
// were dropped in Round 79 - the categories are named after the
// stages, so they duplicated the category names.)
//
// Round 85: when the row overflows, a chevron button appears at the
// overflowing edge (right ">" first; "<" once scrolled) with a soft
// fade behind it, so small-screen users can see there are more
// categories - Shastri's request. Works on web and native (layout,
// content-size and scroll metrics) and on desktop too when the row
// overflows. The fade uses the learner screens' canvas background.

const CANVAS = '#FAF8F4'; // tailwind `canvas` - the learner shelf background

export default function ListFilterChips({ chips, selectedKey, onChange }: ListFilterChipsProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  if (chips.length <= 1) return null;

  const maxScroll = Math.max(0, contentWidth - viewportWidth);
  const overflow = viewportWidth > 0 && maxScroll > 8;
  const showLeft = overflow && scrollX > 8;
  const showRight = overflow && scrollX < maxScroll - 8;

  const scrollByPage = (dir: 1 | -1) => {
    const target = Math.min(maxScroll, Math.max(0, scrollX + dir * viewportWidth * 0.85));
    scrollRef.current?.scrollTo({ x: target, animated: true });
    setScrollX(target);
  };

  const edgeButton = (side: 'left' | 'right') => (
    <View
      pointerEvents="box-none"
      className="absolute top-0 bottom-0 justify-center"
      style={{ [side]: 0, zIndex: 10 }}
    >
      <View
        pointerEvents="none"
        className="absolute top-0 bottom-0"
        style={{ [side]: 0, width: 44, backgroundColor: CANVAS, opacity: 0.85 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={side === 'left' ? 'Show earlier categories' : 'Show more categories'}
        testID={side === 'left' ? 'chips-scroll-left' : 'chips-scroll-right'}
        onPress={() => scrollByPage(side === 'left' ? -1 : 1)}
        className="w-8 h-8 rounded-full bg-navy border border-gold items-center justify-center shadow"
        style={{ marginHorizontal: 2 }}
      >
        <Text className="text-gold-light text-lg font-bold leading-none">
          {side === 'left' ? '‹' : '›'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View className="relative mb-6">
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}
      >
        {chips.map((chip) => {
          const selected = chip.key === selectedKey;
          return (
            <Pressable
              key={chip.key}
              onPress={() => onChange(chip.key)}
              className={`px-4 py-2 rounded-full border ${
                selected ? 'bg-navy border-gold' : 'bg-white border-inkline'
              }`}
            >
              <Text
                className={`font-sans text-sm font-bold ${
                  selected ? 'text-gold-light' : 'text-navy'
                }`}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {showLeft ? edgeButton('left') : null}
      {showRight ? edgeButton('right') : null}
    </View>
  );
}
