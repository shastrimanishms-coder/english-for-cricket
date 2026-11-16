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

/** Human label for a lesson id inside the taxonomy, e.g. "Stage 1 · Welcome to the Pitch · First Day". */
export function lessonPathLabel(tax: Taxonomy, lessonId: string | null | undefined): string | null {
  if (!lessonId) return null;
  const lesson = tax.lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  const mod = tax.modules.find((m) => m.id === lesson.module_id);
  const stage = mod?.stage_id ? tax.stages.find((s) => s.id === mod.stage_id) : null;
  return [stage?.title, mod?.title, lesson.title].filter(Boolean).join(' · ');
}
