// Plain-English role names for the admin screens (Round 38). The raw
// database values stay 'super_admin' / 'content_manager' / 'manager' /
// 'individual_learner'; these labels exist so it is always obvious what
// a role means before anyone is upgraded to it. Shastri's wording: the
// top role is the "App Manager".
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'App Manager',
  content_manager: 'Content Manager',
  manager: 'School / Club Manager',
  individual_learner: 'Individual Learner',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
}

// One-line explanations shown under the role picker in Users &
// Organizations while a role is selected.
export const ROLE_NOTES: Record<string, string> = {
  super_admin:
    'App Manager: full control of the whole app, all settings and all users. The account email must end with @englishforcricket.com.',
  content_manager:
    'Content Managers sign in at the normal login page and see only the content sections (Learning Path, Games, Downloads, Speaking Practice, Smart Reading). Their account email must end with @englishforcricket.com.',
  manager:
    'School / Club Manager: a school, club or parent account that manages its own students (PIN accounts and printed login slips). It is NOT an app administrator - it cannot open this admin dashboard or change the site.',
  individual_learner:
    'Individual Learner: a normal student account that learns on its own.',
};
