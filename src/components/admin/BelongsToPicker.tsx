import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fetchTaxonomy, lessonPathLabel, type Taxonomy } from '../../lib/curriculumTaxonomy';

interface Props {
  /** The tagged lesson id, or null for "not tied to a lesson". */
  value: string | null;
  onChange: (lessonId: string | null) => void;
}

/**
 * "Belongs to" picker: ties a game / video / download / speaking scenario /
 * story to one Learning Path lesson (Stage -> Module -> Lesson). Lessons
 * tagged this way appear as recommendations when a learner finishes that
 * lesson. Optional — untagged content simply never gets recommended.
 */
export default function BelongsToPicker({ value, onChange }: Props) {
  const [tax, setTax] = useState<Taxonomy | null>(null);
  // Picker navigation: undefined = follow the current tag, otherwise the
  // admin's explicit navigation choice wins.
  const [stageOverride, setStageOverride] = useState<string | null | undefined>(undefined);
  const [moduleOverride, setModuleOverride] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const t = await fetchTaxonomy();
      setTax(t);
    })();
  }, []);

  const derivedModuleId = tax && value ? (tax.lessons.find((l) => l.id === value)?.module_id ?? null) : null;
  const derivedStageId =
    tax && derivedModuleId ? (tax.modules.find((m) => m.id === derivedModuleId)?.stage_id ?? null) : null;
  const moduleId = moduleOverride !== undefined ? moduleOverride : derivedModuleId;
  const stageId = stageOverride !== undefined ? stageOverride : derivedStageId;
  const setModuleId = (id: string | null) => setModuleOverride(id);
  const setStageId = (id: string | null) => setStageOverride(id);

  const modules = useMemo(() => {
    if (!tax) return [];
    if (!tax.hasStages) return tax.modules;
    return tax.modules.filter((m) => (stageId ? m.stage_id === stageId : !m.stage_id));
  }, [tax, stageId]);

  const lessons = useMemo(() => {
    if (!tax || !moduleId) return [];
    return tax.lessons.filter((l) => l.module_id === moduleId);
  }, [tax, moduleId]);

  if (!tax) return null;

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full border ${active ? 'border-[#0A192F] bg-[#0A192F]' : 'border-slate-200 bg-slate-50'}`;
  const chipText = (active: boolean) => `text-xs font-semibold ${active ? 'text-white' : 'text-slate-600'}`;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-text-secondary">Belongs to a lesson (optional)</Text>
        {value ? (
          <Pressable onPress={() => onChange(null)} className="px-2 py-1 bg-red-50 rounded border border-red-100">
            <Text className="text-red-600 text-xs font-semibold">Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {value ? (
        <Text className="text-xs text-emerald-700 font-semibold">✓ {lessonPathLabel(tax, value)}</Text>
      ) : (
        <Text className="text-xs text-slate-400">Tag a lesson and this appears as a recommendation when a learner finishes it.</Text>
      )}

      {tax.hasStages && tax.stages.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          <Pressable className={chip(stageId === null)} onPress={() => { setStageId(null); setModuleId(null); }}>
            <Text className={chipText(stageId === null)}>No stage</Text>
          </Pressable>
          {tax.stages.map((s) => (
            <Pressable key={s.id} className={chip(stageId === s.id)} onPress={() => { setStageId(s.id); setModuleId(null); }}>
              <Text className={chipText(stageId === s.id)}>{s.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {modules.map((m) => (
          <Pressable key={m.id} className={chip(moduleId === m.id)} onPress={() => setModuleId(m.id)}>
            <Text className={chipText(moduleId === m.id)}>{m.title}</Text>
          </Pressable>
        ))}
        {modules.length === 0 ? <Text className="text-xs text-slate-400">No modules in this stage yet.</Text> : null}
      </View>

      {moduleId ? (
        <View className="flex-row flex-wrap gap-2">
          {lessons.map((l) => (
            <Pressable key={l.id} className={chip(value === l.id)} onPress={() => onChange(l.id)}>
              <Text className={chipText(value === l.id)}>{l.title}</Text>
            </Pressable>
          ))}
          {lessons.length === 0 ? <Text className="text-xs text-slate-400">No lessons in this module yet.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
