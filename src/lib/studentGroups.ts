// Grouping students by their class / group / team name
// (sub_accounts.class_name, migration 14). Shared by the manager
// Students screen, the manager Progress screen and the admin Users &
// Organizations tree so all three organise students the same way:
// groups A-Z, students without a class last under their own heading.

export const NO_CLASS_LABEL = 'No class / group yet';

export interface ClassGroup<T> {
  label: string;
  students: T[];
}

export function groupStudentsByClass<
  T extends { class_name?: string | null; display_name?: string | null },
>(students: T[]): ClassGroup<T>[] {
  const byLabel = new Map<string, T[]>();
  for (const student of students) {
    const label = (student.class_name || '').trim() || NO_CLASS_LABEL;
    const list = byLabel.get(label) || [];
    list.push(student);
    byLabel.set(label, list);
  }

  const labels = [...byLabel.keys()].sort((a, b) => {
    if (a === NO_CLASS_LABEL) return 1;
    if (b === NO_CLASS_LABEL) return -1;
    return a.localeCompare(b);
  });

  return labels.map((label) => ({
    label,
    students: (byLabel.get(label) || [])
      .slice()
      .sort((x, y) => (x.display_name || '').localeCompare(y.display_name || '')),
  }));
}

/** Distinct class names already in use (for tap-to-reuse chips). */
export function distinctClassNames(
  students: { class_name?: string | null }[]
): string[] {
  const names = new Set<string>();
  for (const s of students) {
    const name = (s.class_name || '').trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
