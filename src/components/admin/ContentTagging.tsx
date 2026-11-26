import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { fetchTaxonomy, type Taxonomy } from '../../lib/curriculumTaxonomy';
import type { CategoryNode } from '../../lib/contentCategories';
import AdminDropdown from './AdminDropdown';
import CategoryMultiSelect from './CategoryMultiSelect';

interface Props {
  categories: CategoryNode[];
  /** Single-select category (unused when categoryIds is provided). */
  categoryId?: string;
  onCategoryId?: (id: string) => void;
  /**
   * Round 85: when provided, the Category field becomes a
   * multi-select (up to 5 categories, tree order) driven by these
   * props instead of the single dropdown.
   */
  categoryIds?: string[];
  onCategoryIds?: (ids: string[]) => void;
  categoryLabel?: string;
  stageId: string | null;
  onStageId: (id: string | null) => void;
  moduleId: string | null;
  onModuleId: (id: string | null) => void;
  lessonId: string | null;
  onLessonId: (id: string | null) => void;
}

/**
 * Cascading tagging controls (Round 42): Category, then Stage, then
 * Module (only that stage's modules), then Lesson (only that module's
 * lessons) — all dropdowns, replacing the chip rows that hid options.
 * Picking a lesson also fills in its module and stage, so the three
 * tags never disagree. Used by the Games, Speaking and Reading
 * managers; the parent owns the values and saves them.
 */
export default function ContentTagging({
  categories,
  categoryId,
  onCategoryId,
  categoryIds,
  onCategoryIds,
  categoryLabel = 'Category',
  stageId,
  onStageId,
  moduleId,
  onModuleId,
  lessonId,
  onLessonId,
}: Props) {
  const [tax, setTax] = useState<Taxonomy | null>(null);

  useEffect(() => {
    (async () => {
      setTax(await fetchTaxonomy());
    })();
  }, []);

  // If only a lesson is tagged (older rows), derive its module/stage
  // so the dropdowns show where the item already belongs.
  const derivedModuleId = useMemo(() => {
    if (!tax || !lessonId) return null;
    return tax.lessons.find((l) => l.id === lessonId)?.module_id ?? null;
  }, [tax, lessonId]);
  const effModuleId = moduleId ?? derivedModuleId;
  const derivedStageId = useMemo(() => {
    if (!tax || !effModuleId) return null;
    return tax.modules.find((m) => m.id === effModuleId)?.stage_id ?? null;
  }, [tax, effModuleId]);
  const effStageId = stageId ?? derivedStageId;

  const moduleOptions = useMemo(() => {
    if (!tax) return [];
    const list = effStageId ? tax.modules.filter((m) => m.stage_id === effStageId) : tax.modules;
    return list.map((m) => ({ id: m.id, label: m.title }));
  }, [tax, effStageId]);

  const lessonOptions = useMemo(() => {
    if (!tax || !effModuleId) return [];
    return tax.lessons
      .filter((l) => l.module_id === effModuleId)
      .map((l) => ({ id: l.id, label: l.title }));
  }, [tax, effModuleId]);

  const pickStage = (id: string) => {
    onStageId(id || null);
    onModuleId(null);
    onLessonId(null);
  };
  const pickModule = (id: string) => {
    onModuleId(id || null);
    onLessonId(null);
  };
  const pickLesson = (id: string) => {
    onLessonId(id || null);
    if (id && tax) {
      const les = tax.lessons.find((l) => l.id === id);
      if (les) {
        onModuleId(les.module_id);
        const mod = tax.modules.find((m) => m.id === les.module_id);
        if (mod?.stage_id) onStageId(mod.stage_id);
      }
    }
  };

  const multiCategory = categoryIds !== undefined && onCategoryIds !== undefined;

  return (
    <View className="gap-4">
      {multiCategory ? (
        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">
            {categoryLabel} (up to 5)
          </Text>
          <CategoryMultiSelect
            categories={categories}
            selectedIds={categoryIds}
            onChange={onCategoryIds}
          />
        </View>
      ) : null}
      <View className="flex-col md:flex-row gap-4">
        {multiCategory ? null : (
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">{categoryLabel}</Text>
            <AdminDropdown
              value={categoryId || ''}
              onChange={(id) => onCategoryId?.(id)}
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              placeholder="No category"
              noneLabel="No category"
            />
          </View>
        )}
        <View className="flex-1">
          <Text className="text-sm font-semibold text-text-secondary mb-2">Stage</Text>
          <AdminDropdown
            value={effStageId || ''}
            onChange={pickStage}
            options={(tax?.stages || []).map((s) => ({ id: s.id, label: s.title }))}
            placeholder="No stage"
            noneLabel="No stage"
          />
        </View>
      </View>
      <View className="flex-col md:flex-row gap-4">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-text-secondary mb-2">Module</Text>
          <AdminDropdown
            value={effModuleId || ''}
            onChange={pickModule}
            options={moduleOptions}
            placeholder={effStageId ? 'No module' : 'Choose a stage first'}
            noneLabel="No module"
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-text-secondary mb-2">Lesson (optional)</Text>
          <AdminDropdown
            value={lessonId || ''}
            onChange={pickLesson}
            options={lessonOptions}
            placeholder={effModuleId ? 'Not tied to a lesson' : 'Choose a module first'}
            noneLabel="Not tied to a lesson"
          />
        </View>
      </View>
      <Text className="text-xs text-slate-400">
        Stage and module file this item in the library. A lesson tag also makes it a recommendation when a learner finishes that lesson.
      </Text>
    </View>
  );
}
