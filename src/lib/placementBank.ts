import { fetchTaxonomy } from './curriculumTaxonomy';
import type { StudentIdentity } from './studentIdentity';
import { supabase } from './supabase';

/**
 * "Find Your Start" — the placement test.
 *
 * Five bands matching the five stages of the Learning Path. Each band
 * has four items (listening-tap, two quizzes, one speaking line). The
 * learner climbs while they score 3+/4 in a band and stops at the
 * first band below that; the recommendation is that band's stage,
 * module 1. Nothing is ever locked — it is a signpost, not a gate.
 */

export type PlacementItem =
  | { type: 'listen'; band: number; say: string; options: string[]; answer: string }
  | { type: 'quiz'; band: number; prompt: string; options: string[]; answer: string }
  | { type: 'speak'; band: number; line: string };

export const PLACEMENT_BANDS: PlacementItem[][] = [
  // Band 1 — Stage 1: The Foundation
  [
    { type: 'listen', band: 1, say: 'ball', options: ['⚪ ball', '🏏 bat', '🟩 pitch', '👥 team'], answer: '⚪ ball' },
    { type: 'quiz', band: 1, prompt: 'Hello! My ___ is Ken.', options: ['name', 'bat', 'team', 'pitch'], answer: 'name' },
    { type: 'quiz', band: 1, prompt: 'I ___ a batter.', options: ['am', 'is', 'are', 'be'], answer: 'am' },
    { type: 'speak', band: 1, line: 'Hello! I am happy.' },
  ],
  // Band 2 — Stage 2: The Rookie
  [
    {
      type: 'listen', band: 2, say: 'He is running.',
      options: ['He runs.', 'He is running.', 'He run.', 'He ran away.'], answer: 'He is running.',
    },
    { type: 'quiz', band: 2, prompt: 'Yesterday, we ___ a match.', options: ['play', 'played', 'playing', 'plays'], answer: 'played' },
    { type: 'quiz', band: 2, prompt: 'She ___ to school every day.', options: ['go', 'goes', 'going', 'gone'], answer: 'goes' },
    { type: 'speak', band: 2, line: 'Tomorrow, we are going to play cricket.' },
  ],
  // Band 3 — Stage 3: The Player
  [
    {
      type: 'listen', band: 3, say: 'If it rains, we will stay inside.',
      options: ['If it rains, we will stay inside.', 'If it rained, we stay inside.', 'When it rains, we stayed inside.', 'If it rains, we stayed inside.'],
      answer: 'If it rains, we will stay inside.',
    },
    { type: 'quiz', band: 3, prompt: 'I have ___ cricket for three years.', options: ['play', 'playing', 'played', 'plays'], answer: 'played' },
    { type: 'quiz', band: 3, prompt: 'The match ___ by our team.', options: ['won', 'was won', 'is win', 'win'], answer: 'was won' },
    { type: 'speak', band: 3, line: 'I have never played on this pitch before.' },
  ],
  // Band 4 — Stage 4: The Strategist
  [
    { type: 'quiz', band: 4, prompt: 'The captain said that they ___ ready.', options: ['are', 'were', 'is', 'be'], answer: 'were' },
    { type: 'quiz', band: 4, prompt: 'If I ___ the captain, I would bowl first.', options: ['am', 'was', 'were', 'be'], answer: 'were' },
    {
      type: 'listen', band: 4, say: 'The trophy was presented by the umpire.',
      options: ['The umpire presented the trophy.', 'The trophy was presented by the umpire.', 'The trophy is presenting by the umpire.', 'The umpire was presented the trophy.'],
      answer: 'The trophy was presented by the umpire.',
    },
    { type: 'speak', band: 4, line: 'He told me that the match had been cancelled.' },
  ],
  // Band 5 — Stage 5: The Captain
  [
    { type: 'quiz', band: 5, prompt: 'Hardly ___ the match begun when the rain came.', options: ['has', 'had', 'have', 'was'], answer: 'had' },
    { type: 'quiz', band: 5, prompt: 'The committee insisted that the rule ___ changed.', options: ['is', 'was', 'be', 'been'], answer: 'be' },
    {
      type: 'listen', band: 5, say: 'Were it not for the rain, we would have won.',
      options: ['Were it not for the rain, we would have won.', 'If it was not for the rain, we win.', 'Were it not for the rain, we will win.', 'Not for the rain, we would have won.'],
      answer: 'Were it not for the rain, we would have won.',
    },
    { type: 'speak', band: 5, line: 'Not only did we win the match, but we also broke the record.' },
  ],
];

export interface PlacementResult {
  /** Recommended stage number, 1..5. */
  stage: number;
  /** First module of that stage, when stages exist in the taxonomy. */
  moduleId: string | null;
  moduleTitle: string | null;
  stageTitle: string | null;
}

/** The first band scoring below 3/4 sets the stage; a clean sweep means Stage 5. */
export function stageForBandScores(bandScores: number[]): number {
  for (let i = 0; i < bandScores.length; i++) {
    if (bandScores[i] < 3) return i + 1;
  }
  return Math.min(5, bandScores.length);
}

export async function resolvePlacement(stage: number): Promise<PlacementResult> {
  const tax = await fetchTaxonomy();
  const stageRow = tax.stages[stage - 1] || null;
  const firstModule = stageRow
    ? tax.modules.find((m) => m.stage_id === stageRow.id) || null
    : tax.modules[0] || null;
  return {
    stage,
    moduleId: firstModule?.id ?? null,
    moduleTitle: firstModule?.title ?? null,
    stageTitle: stageRow?.title ?? null,
  };
}

export async function savePlacement(identity: StudentIdentity, result: PlacementResult): Promise<void> {
  try {
    await supabase.rpc('set_placement', {
      p_student_id: identity.studentId,
      p_student_kind: identity.studentKind,
      p_stage: result.stage,
      p_module_id: result.moduleId,
    });
  } catch {
    // Migration 21 not run yet: the on-screen result still stands.
  }
}
