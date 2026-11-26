import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  flattenCategoryTree,
  MAX_CATEGORIES_PER_ITEM,
  orderCategoryIds,
  type CategoryNode,
} from '../../lib/contentCategories';

interface CategoryMultiSelectProps {
  categories: CategoryNode[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}

// Round 85: the multi-category picker used by every content
// manager's edit form. Categories show as the tree they already are
// (parent -> subcategories, indented, in display order). An item may
// belong to at most `max` categories; the first one in display order
// is its PRIMARY category (it stays in the legacy category_id column
// and leads the item's labels).
export default function CategoryMultiSelect({
  categories,
  selectedIds,
  onChange,
  max = MAX_CATEGORIES_PER_ITEM,
}: CategoryMultiSelectProps) {
  const flat = flattenCategoryTree(categories);
  const orderedSelected = orderCategoryIds(selectedIds, categories);
  const primaryId = orderedSelected.length > 0 ? orderedSelected[0] : null;
  const atCap = selectedIds.length >= max;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((c) => c !== id));
    } else if (selectedIds.length < max) {
      onChange([...selectedIds, id]);
    }
  };

  if (categories.length === 0) {
    return (
      <Text className="text-sm text-slate-400">
        No categories yet — create them under Categories first.
      </Text>
    );
  }

  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold text-slate-400">
        {selectedIds.length} selected of max {max}
        {atCap ? ' — maximum reached' : ''}
      </Text>
      {flat.map(({ cat, depth }) => {
        const checked = selectedIds.includes(cat.id);
        const disabled = !checked && atCap;
        return (
          <Pressable
            key={cat.id}
            onPress={() => toggle(cat.id)}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled }}
            className={`flex-row items-center gap-3 py-2 pr-2 rounded-lg ${disabled ? 'opacity-40' : ''}`}
            style={{ paddingLeft: 8 + depth * 22 }}
          >
            <View
              className={`w-6 h-6 rounded-md border-2 items-center justify-center ${
                checked ? 'bg-gold border-gold-dark' : 'bg-white border-slate-300'
              }`}
            >
              {checked ? <Text className="text-navy font-bold text-sm">✓</Text> : null}
            </View>
            <Text className="font-sans text-sm font-semibold text-text-primary">
              {depth > 0 ? '↳ ' : ''}
              {cat.name}
            </Text>
            {checked && cat.id === primaryId ? (
              <View className="px-2 py-0.5 rounded-full bg-navy">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-gold-light">
                  Primary
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <Text className="text-xs text-slate-400 mt-1">
        The primary category is the first ticked one in list order — it is the one older
        screens and reports use.
      </Text>
    </View>
  );
}
