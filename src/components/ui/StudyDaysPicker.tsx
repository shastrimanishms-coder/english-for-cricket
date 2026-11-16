import { Pressable, Text, View } from 'react-native';

// Study-days picker: the student chooses the weekdays they plan to
// study (at least MIN_STUDY_DAYS). Only chosen days count toward
// their streak and streak badges; other days are free practice that
// neither extends nor breaks the streak. Days are stored as weekday
// numbers matching Date.getUTCDay() (0 = Sunday .. 6 = Saturday),
// the same basis the streak maths in lib/badgeAwards uses.
//
// Shared by the learner's own profile and the manager's student
// form, so both places behave identically.

export const MIN_STUDY_DAYS = 3;

// Monday-first display order, as schools think of the week.
const DAY_ORDER: { day: number; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

export function isValidStudyDays(days: number[] | null | undefined): boolean {
  return Array.isArray(days) && days.length >= MIN_STUDY_DAYS && days.length <= 7;
}

export default function StudyDaysPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  const toggle = (day: number) => {
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : [...value, day].sort((a, b) => a - b)
    );
  };

  return (
    <View>
      <View className="flex-row flex-wrap gap-2">
        {DAY_ORDER.map(({ day, label }) => {
          const selected = value.includes(day);
          return (
            <Pressable
              key={day}
              onPress={() => toggle(day)}
              className={`px-4 py-2.5 rounded-full border ${
                selected ? 'bg-[#0A192F] border-[#0A192F]' : 'bg-white border-slate-300'
              }`}
            >
              <Text className={`font-bold text-sm ${selected ? 'text-white' : 'text-slate-600'}`}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className={`text-sm mt-3 ${value.length >= MIN_STUDY_DAYS ? 'text-emerald-600' : 'text-slate-500'}`}>
        {value.length >= MIN_STUDY_DAYS
          ? `✅ ${value.length} study days chosen. Only these days count for your streak — you can still practise on any other day too.`
          : `Choose at least ${MIN_STUDY_DAYS} days (${value.length} chosen so far).`}
      </Text>
    </View>
  );
}
