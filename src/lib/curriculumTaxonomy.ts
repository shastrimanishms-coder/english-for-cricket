import { supabase } from './supabase';

export interface Stage {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
}

export interface TaxModule {
  id: string;
  title: string;
  order_index: number;
  stage_id?: string | null;
}

export interface TaxLesson {
  id: string;
  module_id: string;
  title: string;
  order_index: number;
}

export interface Taxonomy {
  stages: Stage[];
  modules: TaxModule[];
  lessons: TaxLesson[];
  /** True when the stages migration (17) has been applied. */
  hasStages: boolean;
}

/**
 * Loads the Stage -> Module -> Lesson tree. Fail-soft: before migration 17
 * runs, the stage_id select fails and we retry without it, returning
 * hasStages=false and an empty stage list.
 */
export async function fetchTaxonomy(): Promise<Taxonomy> {
  const [stagesRes, modulesRes, lessonsRes] = await Promise.all([
    supabase.from('curriculum_stages').select('id, title, description, order_index').order('order_index'),
    supabase.from('curriculum_modules').select('id, title, order_index, stage_id').order('order_index'),
    supabase.from('curriculum_lessons').select('id, module_id, title, order_index').order('order_index'),
  ]);

  let modules = (modulesRes.data || []) as TaxModule[];
  let hasStages = !modulesRes.error && !stagesRes.error;
  if (modulesRes.error) {
    const retry = await supabase.from('curriculum_modules').select('id, title, order_index').order('order_index');
    modules = (retry.data || []) as TaxModule[];
    hasStages = false;
  }

  return {
    stages: hasStages ? ((stagesRes.data || []) as Stage[]) : [],
    modules,
    lessons: (lessonsRes.data || []) as TaxLesson[],
    hasStages,
  };
}

/**
 * Stage display names keyed by stage id — the same titles as the
 * curriculum_stages rows, kept as a fail-soft fallback so the
 * learner filter chips can render names before (or without) the
 * fetch below. Round 78: student filter chips show the stage NAME
 * only ("The Foundation"), never "Stage N".
 */
export const STAGE_NAME_FALLBACKS: Record<string, string> = {
  'd3352863-2ae5-4404-b39d-9ade3dac2cbd': 'The Foundation',
  '0880276e-8c46-4aba-a96d-c7aa0a30c632': 'The Rookie',
  '6fb44af7-815c-4157-adc5-cf67ad89617c': 'The Player',
  '99de5623-0254-4d9a-b355-2febe00efcf5': 'The Strategist',
  '1d102515-cffd-4df0-b530-99c67ca1a6f1': 'The Captain',
};

/**
 * Live stage id -> title map from curriculum_stages, merged over
 * the fallbacks so a renamed stage in the dashboard wins. Never
 * throws.
 */
export async function fetchStageNameMap(): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase.from('curriculum_stages').select('id, title');
    if (error || !data) return { ...STAGE_NAME_FALLBACKS };
    const map = { ...STAGE_NAME_FALLBACKS };
    for (const row of data as { id: string; title: string }[]) {
      if (row?.id && row?.title) map[row.id] = row.title;
    }
    return map;
  } catch {
    return { ...STAGE_NAME_FALLBACKS };
  }
}

/** Human label for a lesson id inside the taxonomy, e.g. "Stage 1 · Welcome to the Pitch · First Day". */
export function lessonPathLabel(tax: Taxonomy, lessonId: string | null | undefined): string | null {
  if (!lessonId) return null;
  const lesson = tax.lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  const mod = tax.modules.find((m) => m.id === lesson.module_id);
  const stage = mod?.stage_id ? tax.stages.find((s) => s.id === mod.stage_id) : null;
  return [stage?.title, mod?.title, lesson.title].filter(Boolean).join(' · ');
}
