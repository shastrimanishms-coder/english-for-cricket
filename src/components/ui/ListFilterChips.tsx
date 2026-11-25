import { Pressable, ScrollView, Text } from 'react-native';

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
export default function ListFilterChips({ chips, selectedKey, onChange }: ListFilterChipsProps) {
  if (chips.length <= 1) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-6"
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
  );
}
