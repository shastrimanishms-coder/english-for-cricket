import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

export interface DropdownOption {
  id: string;
  label: string;
}

interface Props {
  /** '' means "none selected". */
  value: string;
  options: DropdownOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  noneLabel?: string;
  disabled?: boolean;
}

/**
 * A simple expanding dropdown for admin forms (Round 42). Chip rows hid
 * options off-screen once lists grew; this always shows every option in
 * a scrollable list. Expands inline so nothing is ever clipped.
 */
export default function AdminDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  noneLabel = 'None',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);

  return (
    <View className="relative">
      <Pressable
        disabled={disabled}
        onPress={() => setOpen((v) => !v)}
        className={`w-full bg-canvas px-4 py-3 rounded-xl border flex-row items-center justify-between ${
          disabled ? 'border-inkline opacity-50' : 'border-inkline'
        }`}
      >
        <Text className={`font-sans text-sm ${current ? 'text-text-primary font-semibold' : 'text-slate-400'}`} numberOfLines={1}>
          {current ? current.label : placeholder}
        </Text>
        <Text className="text-slate-400 text-xs ml-2">{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && !disabled ? (
        <View className="mt-1 bg-white border border-inkline rounded-xl overflow-hidden shadow-sm">
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
            <Pressable
              onPress={() => {
                onChange('');
                setOpen(false);
              }}
              className="px-4 py-2.5 border-b border-inkline"
            >
              <Text className={`text-sm ${value === '' ? 'font-bold text-navy' : 'text-slate-500'}`}>{noneLabel}</Text>
            </Pressable>
            {options.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`px-4 py-2.5 border-b border-inkline ${o.id === value ? 'bg-navy/5' : ''}`}
              >
                <Text className={`text-sm ${o.id === value ? 'font-bold text-navy' : 'text-text-primary'}`}>{o.label}</Text>
              </Pressable>
            ))}
            {options.length === 0 ? (
              <Text className="px-4 py-2.5 text-sm text-slate-400">No options yet.</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
