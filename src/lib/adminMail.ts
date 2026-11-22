// Admin email sending (Round 40).
//
// The app has no mail server, so account emails (inactivity reminders,
// deletion notices) go through a small key-protected script on the
// site's own hosting - mail-send.php, which ships inside the app zip
// next to voice-storage.php and sends from noreply@englishforcricket.com.
// The key below matches the one in that script; it is an endpoint key
// for a send-only form, not an account credential.

const MAIL_ENDPOINT = 'https://englishforcricket.com/mail-send.php';
const MAIL_KEY = 'ba1b7f2e091132f4394e346d0fe5a17bfe7ac2ffe01b8c79';

export async function sendAdminEmail(
  to: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const form = new FormData();
    form.append('key', MAIL_KEY);
    form.append('action', 'send');
    form.append('to', to);
    form.append('subject', subject);
    form.append('body', body);
    const res = await fetch(MAIL_ENDPOINT, { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) return { ok: true };
    return { ok: false, error: data?.error || `Mail service answered ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Could not reach the mail service' };
  }
}

const SIGN_OFF = '\n\nEnglish for Cricket\nby the Kansai Youth Cricket Organization (KYCO)\nPermanently free. No advertisements.\nhttps://englishforcricket.com';

export function individualReminderEmail(level: number, days: number): { subject: string; body: string } {
  if (level >= 4) {
    return {
      subject: 'Final reminder: your English for Cricket account will be marked for deletion',
      body:
        `It has been ${days} days since you last signed in to English for Cricket.\n\n` +
        'This is the final reminder. In the next few days your account will be marked for deletion, and 90 days after that it will be permanently deleted, together with your learning progress.\n\n' +
        'If you would like to keep your account, simply sign in once and it returns to normal:\nhttps://englishforcricket.com/login' +
        SIGN_OFF,
    };
  }
  if (level === 3) {
    return {
      subject: 'Three weeks away from English for Cricket',
      body:
        `It has been ${days} days since you last signed in to English for Cricket.\n\n` +
        'Your lessons, stars and progress are all still waiting for you. One short lesson is enough to keep your streak of learning alive.\n\n' +
        'Please note: accounts that stay inactive are marked for deletion at 30 days, and permanently deleted 90 days after that. Signing in once is all it takes to keep your account.\n\n' +
        'Sign in here:\nhttps://englishforcricket.com/login' +
        SIGN_OFF,
    };
  }
  if (level === 2) {
    return {
      subject: 'Two weeks away — your English for Cricket progress is waiting',
      body:
        `It has been ${days} days since you last signed in to English for Cricket.\n\n` +
        'Your progress is saved exactly where you left it. Why not try one short lesson today?\n\n' +
        'Sign in here:\nhttps://englishforcricket.com/login' +
        SIGN_OFF,
    };
  }
  return {
    subject: 'We have missed you at English for Cricket',
    body:
      `It has been ${days} days since you last signed in to English for Cricket.\n\n` +
      'Your lessons and stars are waiting for you whenever you are ready. Even a few minutes of practice keeps your English growing.\n\n' +
      'Sign in here:\nhttps://englishforcricket.com/login' +
      SIGN_OFF,
  };
}

export function individualMarkedEmail(): { subject: string; body: string } {
  return {
    subject: 'Your English for Cricket account has been marked for deletion',
    body:
      'Your English for Cricket account has been inactive for more than 30 days, so it has now been marked for deletion.\n\n' +
      'It will be permanently deleted in 90 days. If you sign in before then, the mark is removed and your account returns to normal with all your progress.\n\n' +
      'Sign in here:\nhttps://englishforcricket.com/login' +
      SIGN_OFF,
  };
}

export function managerReminderEmail(
  students: { name: string; days: number; level: number }[],
): { subject: string; body: string } {
  const lines = students
    .map((s) => `- ${s.name}: inactive for ${s.days} days${s.level >= 4 ? ' (final reminder — will be marked for deletion at 30 days)' : ''}`)
    .join('\n');
  return {
    subject: 'Inactive student accounts at English for Cricket',
    body:
      'Some student accounts in your school or club have been inactive for a while:\n\n' +
      lines +
      '\n\nStudent accounts do not have email addresses of their own, so this reminder comes to you. Please encourage these students to sign in and practise — signing in once is all it takes.\n\n' +
      'Accounts inactive for 30 days are marked for deletion, and permanently deleted 90 days after that.\n\n' +
      'Thank you for supporting your learners.' +
      SIGN_OFF,
  };
}

export function managerMarkedEmail(names: string[]): { subject: string; body: string } {
  return {
    subject: 'Student accounts marked for deletion at English for Cricket',
    body:
      'The following student accounts in your school or club have been inactive for more than 30 days and have been marked for deletion:\n\n' +
      names.map((n) => `- ${n}`).join('\n') +
      '\n\nThey will be permanently deleted in 90 days. If a student signs in before then, the mark is removed and the account returns to normal.' +
      SIGN_OFF,
  };
}
