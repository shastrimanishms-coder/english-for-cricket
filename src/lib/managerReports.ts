import { fetchTaxonomy } from './curriculumTaxonomy';
import { supabase } from './supabase';

/**
 * Manager Reports data (Round 81, Part 2).
 *
 * One row per student in the calling manager's own organisation —
 * the same scoping the Learning Progress screen uses (organisation
 * resolved from the manager's login; students are its sub_accounts).
 *
 * Preferred source is the get_manager_reports() RPC (migration 34),
 * which checks the caller inside the database and computes every
 * aggregate in one pass. Until that migration is run the fetch falls
 * back to client-side aggregation over exactly the sources the
 * Learning Progress screen already reads (activity_logs,
 * lesson_completions, get_reading_records), with two honest limits:
 * the conversations-completed count is unavailable (point_events is
 * admin-read only, so it stays null and the UI shows "—"), and the
 * current-position lookup uses the taxonomy + completion rows.
 *
 * HONESTY RULES baked into the shape:
 *  - Times are ACTIVE seconds from activity_logs. The 'app' stream
 *    is the total; section streams overlap it and are a breakdown,
 *    never a sum.
 *  - Speaking accuracy exists only since Round 82 (migration 35):
 *    speaking_line_results stores each scored attempt's score (and
 *    our own target phrase — never the child's words), and the RPC
 *    reduces them by the first-attempt rule. Before that migration
 *    — or for a student with no recorded lines yet — the field is
 *    null and the UI shows "—". There is no history from before
 *    Round 82 and nothing here invents one.
 *  - Reading accuracy averages only the records that carry one
 *    (Read Aloud sessions); Listen sessions are excluded, not zeroed.
 */

/** One "Practice focus" entry (Round 82): something to revisit,
 * with the context a teacher or parent needs to act on it. */
export interface PracticeFocusItem {
  type: 'speaking' | 'reading' | 'lesson';
  label: string;
  detail: string;
}

export interface StudentReport {
  id: string;
  displayName: string;
  username: string;
  className: string | null;
  /** Whole-app active seconds (the 'app' stream) — the headline total. */
  totalSeconds: number;
  lessonSeconds: number;
  gameSeconds: number;
  readingSeconds: number;
  speakingSeconds: number;
  videoSeconds: number;
  /** Distinct lessons completed. */
  lessonsCompleted: number;
  /** Lessons in the whole learning path (320 today). */
  totalLessons: number;
  lessonAccuracy: number | null;
  /** Distinct stories/articles finished. */
  storiesRead: number;
  readingAccuracy: number | null;
  /** Conversations completed; null when unavailable (pre-migration-34 fallback). */
  speakingCompleted: number | null;
  /** Speaking accuracy % (first attempt per line per session);
   * null before migration 35 or when no lines are recorded yet. */
  speakingAccuracy: number | null;
  /** How many first-attempt lines the accuracy is based on. */
  speakingLinesAttempted: number;
  /** Practice-focus items; null before migration 35 (section
   * hidden), [] when the data exists but nothing is flagged. */
  practiceFocus: PracticeFocusItem[] | null;
  /** Distinct days with any recorded activity or completion. */
  studyDays: number;
  lastActiveAt: string | null;
  currentStageTitle: string | null;
  currentModuleTitle: string | null;
}

export interface GroupSummary {
  studentCount: number;
  totalSeconds: number;
  averageSecondsPerStudent: number;
  lessonSeconds: number;
  gameSeconds: number;
  readingSeconds: number;
  speakingSeconds: number;
  videoSeconds: number;
  lessonsCompleted: number;
  storiesRead: number;
  speakingCompleted: number | null;
  lessonAccuracy: number | null;
  readingAccuracy: number | null;
  /** Mean speaking accuracy across the students who have one. */
  speakingAccuracy: number | null;
  /** How many students that average covers. */
  speakingAccuracyStudents: number;
}

export interface ManagerReportsData {
  students: StudentReport[];
  group: GroupSummary;
  /** 'rpc' when migration 34 answered; 'fallback' for client aggregation. */
  source: 'rpc' | 'fallback';
}

interface StudentBasics {
  id: string;
  displayName: string;
  username: string;
  className: string | null;
}

async function fetchStudentBasics(): Promise<{ orgId: string; students: StudentBasics[] }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('manager_id', user.id)
    .single();
  if (orgError || !org) throw new Error('Organization not found');

  // class_name arrives with migration 14; fall back without it, the
  // same pattern the Learning Progress screen uses.
  let rows: any[] | null = null;
  const withClass = await supabase
    .from('sub_accounts')
    .select('id, display_name, username, class_name')
    .eq('organization_id', org.id)
    .eq('is_active', true);
  if (withClass.error && /class_name/.test(withClass.error.message)) {
    const fallback = await supabase
      .from('sub_accounts')
      .select('id, display_name, username')
      .eq('organization_id', org.id)
      .eq('is_active', true);
    if (fallback.error) throw fallback.error;
    rows = fallback.data;
  } else if (withClass.error) {
    throw withClass.error;
  } else {
    rows = withClass.data;
  }

  return {
    orgId: org.id as string,
    students: (rows || []).map((s) => ({
      id: s.id as string,
      displayName: (s.display_name as string) || 'Student',
      username: (s.username as string) || '',
      className: (s.class_name as string | null) ?? null,
    })),
  };
}

function blankReport(b: StudentBasics): StudentReport {
  return {
    id: b.id,
    displayName: b.displayName,
    username: b.username,
    className: b.className,
    totalSeconds: 0,
    lessonSeconds: 0,
    gameSeconds: 0,
    readingSeconds: 0,
    speakingSeconds: 0,
    videoSeconds: 0,
    lessonsCompleted: 0,
    totalLessons: 0,
    lessonAccuracy: null,
    storiesRead: 0,
    readingAccuracy: null,
    speakingCompleted: null,
    speakingAccuracy: null,
    speakingLinesAttempted: 0,
    practiceFocus: null,
    studyDays: 0,
    lastActiveAt: null,
    currentStageTitle: null,
    currentModuleTitle: null,
  };
}

function summarise(students: StudentReport[]): GroupSummary {
  const sum = (pick: (s: StudentReport) => number) => students.reduce((n, s) => n + pick(s), 0);
  // Group accuracies are weighted by the underlying scored work, not
  // averaged across students: recompute from each student's accuracy
  // is impossible without the raw sums, so the RPC path stores the
  // same weighting the screen shows per student — a simple mean of
  // the students who have one. (Per-student figures are exact; the
  // group line is a summary, labelled as an average.)
  const meanOf = (pick: (s: StudentReport) => number | null) => {
    const vals = students.map(pick).filter((v): v is number => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const speakingVals = students.map((s) => s.speakingCompleted);
  return {
    studentCount: students.length,
    totalSeconds: sum((s) => s.totalSeconds),
    averageSecondsPerStudent: students.length ? Math.round(sum((s) => s.totalSeconds) / students.length) : 0,
    lessonSeconds: sum((s) => s.lessonSeconds),
    gameSeconds: sum((s) => s.gameSeconds),
    readingSeconds: sum((s) => s.readingSeconds),
    speakingSeconds: sum((s) => s.speakingSeconds),
    videoSeconds: sum((s) => s.videoSeconds),
    lessonsCompleted: sum((s) => s.lessonsCompleted),
    storiesRead: sum((s) => s.storiesRead),
    speakingCompleted: speakingVals.every((v) => v !== null)
      ? speakingVals.reduce((a: number, b) => a + (b ?? 0), 0)
      : null,
    lessonAccuracy: meanOf((s) => s.lessonAccuracy),
    readingAccuracy: meanOf((s) => s.readingAccuracy),
    speakingAccuracy: meanOf((s) => s.speakingAccuracy),
    speakingAccuracyStudents: students.filter((s) => s.speakingAccuracy !== null).length,
  };
}

async function fetchViaRpc(basics: StudentBasics[]): Promise<StudentReport[] | null> {
  try {
    const { data, error } = await supabase.rpc('get_manager_reports');
    if (error || !Array.isArray(data)) return null;
    const byId = new Map<string, any>(data.map((r: any) => [r.student_id as string, r]));
    return basics.map((b) => {
      const r = byId.get(b.id);
      const report = blankReport(b);
      if (!r) return report;
      report.totalSeconds = Number(r.app_seconds) || 0;
      report.lessonSeconds = Number(r.lesson_seconds) || 0;
      report.gameSeconds = Number(r.game_seconds) || 0;
      report.readingSeconds = Number(r.reading_seconds) || 0;
      report.speakingSeconds = Number(r.speaking_seconds) || 0;
      report.videoSeconds = Number(r.video_seconds) || 0;
      report.lessonsCompleted = Number(r.lessons_completed) || 0;
      report.totalLessons = Number(r.total_lessons) || 0;
      const correct = Number(r.lesson_correct) || 0;
      const total = Number(r.lesson_total) || 0;
      report.lessonAccuracy = total > 0 ? Math.round((correct / total) * 100) : null;
      report.storiesRead = Number(r.stories_read) || 0;
      report.readingAccuracy = r.reading_accuracy != null ? Math.round(Number(r.reading_accuracy)) : null;
      report.speakingCompleted = Number(r.speaking_completed) || 0;
      // Round 82 fields exist only once migration 35 has run; with
      // migration 34's RPC they are absent and the report keeps its
      // honest "no speaking accuracy yet" state.
      if ('speaking_accuracy' in r) {
        report.speakingAccuracy = r.speaking_accuracy != null ? Math.round(Number(r.speaking_accuracy)) : null;
        report.speakingLinesAttempted = Number(r.speaking_lines_attempted) || 0;
        report.practiceFocus = Array.isArray(r.practice_focus)
          ? (r.practice_focus as PracticeFocusItem[]).filter(
              (i) => i && typeof i.label === 'string' && typeof i.detail === 'string'
            )
          : [];
      }
      report.studyDays = Number(r.study_days) || 0;
      report.lastActiveAt = (r.last_active_at as string | null) ?? null;
      report.currentStageTitle = (r.current_stage_title as string | null) ?? null;
      report.currentModuleTitle = (r.current_module_title as string | null) ?? null;
      return report;
    });
  } catch {
    return null;
  }
}

async function fetchViaFallback(basics: StudentBasics[]): Promise<StudentReport[]> {
  const reports = new Map<string, StudentReport>(basics.map((b) => [b.id, blankReport(b)]));
  const ids = basics.map((b) => b.id);
  if (ids.length === 0) return [];

  const dayKey = (iso: string) => iso.slice(0, 10); // UTC date, as get_activity_days defines it
  const daysByStudent = new Map<string, Set<string>>();
  const noteDay = (id: string, iso: string | null) => {
    if (!iso) return;
    if (!daysByStudent.has(id)) daysByStudent.set(id, new Set());
    daysByStudent.get(id)!.add(dayKey(iso));
  };
  const noteActive = (report: StudentReport, iso: string | null) => {
    if (!iso) return;
    if (!report.lastActiveAt || iso > report.lastActiveAt) report.lastActiveAt = iso;
  };

  // Activity streams (fails soft per source, like progress.tsx).
  try {
    const { data: logs, error } = await supabase
      .from('activity_logs')
      .select('student_id, activity_type, duration_seconds, created_at')
      .in('student_id', ids);
    if (error) throw error;
    for (const row of logs || []) {
      const report = reports.get(row.student_id as string);
      if (!report) continue;
      const seconds = Number(row.duration_seconds) || 0;
      switch (row.activity_type) {
        case 'app':
          report.totalSeconds += seconds;
          break;
        case 'lesson_slide':
          report.lessonSeconds += seconds;
          break;
        case 'game':
          report.gameSeconds += seconds;
          break;
        case 'reading':
          report.readingSeconds += seconds;
          break;
        case 'speaking':
          report.speakingSeconds += seconds;
          break;
        case 'video':
          report.videoSeconds += seconds;
          break;
      }
      noteDay(report.id, row.created_at as string);
      noteActive(report, row.created_at as string);
    }
  } catch (err) {
    console.log('Report activity totals unavailable:', err);
  }

  // Lesson completions + the taxonomy for position/total.
  const completedLessonIds = new Map<string, Set<string>>();
  try {
    const { data: completions, error } = await supabase
      .from('lesson_completions')
      .select('student_id, lesson_id, score_correct, score_total, completed_at')
      .eq('student_kind', 'sub_account')
      .in('student_id', ids);
    if (error) throw error;
    const correct = new Map<string, number>();
    const total = new Map<string, number>();
    for (const row of completions || []) {
      const id = row.student_id as string;
      const report = reports.get(id);
      if (!report) continue;
      if (!completedLessonIds.has(id)) completedLessonIds.set(id, new Set());
      completedLessonIds.get(id)!.add(row.lesson_id as string);
      correct.set(id, (correct.get(id) || 0) + (Number(row.score_correct) || 0));
      total.set(id, (total.get(id) || 0) + (Number(row.score_total) || 0));
      noteDay(id, row.completed_at as string);
      noteActive(report, row.completed_at as string);
    }
    for (const report of reports.values()) {
      report.lessonsCompleted = completedLessonIds.get(report.id)?.size ?? 0;
      const t = total.get(report.id) || 0;
      report.lessonAccuracy = t > 0 ? Math.round(((correct.get(report.id) || 0) / t) * 100) : null;
    }
  } catch (err) {
    console.log('Report lesson totals unavailable:', err);
  }

  try {
    const taxonomy = await fetchTaxonomy();
    const moduleById = new Map(taxonomy.modules.map((m) => [m.id, m]));
    const stageById = new Map(taxonomy.stages.map((s) => [s.id, s]));
    const lessonById = new Map(taxonomy.lessons.map((l) => [l.id, l]));
    for (const report of reports.values()) {
      report.totalLessons = taxonomy.lessons.length;
      const done = completedLessonIds.get(report.id);
      if (!done || done.size === 0) continue;
      let best: { moduleOrder: number; lessonOrder: number; moduleId: string } | null = null;
      for (const lessonId of done) {
        const lesson = lessonById.get(lessonId);
        if (!lesson) continue;
        const mod = moduleById.get(lesson.module_id);
        if (!mod) continue;
        if (!best || mod.order_index > best.moduleOrder || (mod.order_index === best.moduleOrder && lesson.order_index > best.lessonOrder)) {
          best = { moduleOrder: mod.order_index, lessonOrder: lesson.order_index, moduleId: mod.id };
        }
      }
      if (best) {
        const mod = moduleById.get(best.moduleId);
        report.currentModuleTitle = mod?.title ?? null;
        report.currentStageTitle = mod?.stage_id ? (stageById.get(mod.stage_id)?.title ?? null) : null;
      }
    }
  } catch (err) {
    console.log('Report taxonomy unavailable:', err);
  }

  // Reading records per student (client-asserted RPC, as StudentExtras uses).
  for (const report of reports.values()) {
    try {
      const { data } = await supabase.rpc('get_reading_records', {
        p_student_id: report.id,
        p_student_kind: 'sub_account',
      });
      if (Array.isArray(data)) {
        const stories = new Set<string>();
        const accuracies: number[] = [];
        for (const r of data as any[]) {
          if (r.story_id) stories.add(r.story_id as string);
          if (r.accuracy != null) accuracies.push(Number(r.accuracy));
        }
        report.storiesRead = stories.size;
        report.readingAccuracy = accuracies.length
          ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
          : null;
      }
    } catch {
      // Smart Reading not switched on yet; figures stay at zero.
    }
  }

  for (const report of reports.values()) {
    report.studyDays = daysByStudent.get(report.id)?.size ?? 0;
  }
  // speakingCompleted stays null in the fallback: point_events is
  // admin-read only, so there is no honest client-side source.
  return [...reports.values()];
}

export async function fetchManagerReports(): Promise<ManagerReportsData> {
  const { students: basics } = await fetchStudentBasics();
  const viaRpc = await fetchViaRpc(basics);
  if (viaRpc) {
    return { students: viaRpc, group: summarise(viaRpc), source: 'rpc' };
  }
  const viaFallback = await fetchViaFallback(basics);
  return { students: viaFallback, group: summarise(viaFallback), source: 'fallback' };
}

/** "2h 5m" / "45 min" / "30 sec" — for report figures. */
export function formatActiveTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)} min`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hrs`;
}

export function formatReportDate(iso: string | null): string {
  if (!iso) return 'No activity yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No activity yet';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
