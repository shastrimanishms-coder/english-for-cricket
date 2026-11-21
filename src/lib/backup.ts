import { Platform } from 'react-native';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Database backup (admin, web only).
//
// The free Supabase plan has no automatic backups, so this exports the
// whole database's DATA as one JSON file, downloaded to the admin's
// own computer. It runs entirely on the signed-in admin's session and
// its existing permissions - no extra credentials anywhere.
//
// What it is, honestly:
//   - every row of every content and user table listed below;
//   - voice actor PASSWORDS are stripped from the export on purpose
//     (the file is a backup, not a credential store; if a restore is
//     ever needed, actors simply get fresh passwords);
//   - it is a data export, not a pg_dump: the database STRUCTURE is
//     preserved separately by the migration files in the project
//     repository, and a restore means re-importing this data (a
//     developer task, done with Muse's help if the day ever comes);
//   - voice recordings and other media files live on the Lolipop
//     server, not in this database - copy the media folder by FTP for
//     a complete backup. This file does contain every recording's
//     record (which line, which voice, which file, its status).
//
// Tables that cannot be read (missing, or no admin read permission)
// are skipped and reported, never fatal.
// ---------------------------------------------------------------------------

export const BACKUP_TABLES: string[] = [
  'categories',
  'curriculum_stages',
  'curriculum_modules',
  'curriculum_lessons',
  'lesson_slides',
  'lesson_completions',
  'activity_logs',
  'user_profiles',
  'sub_accounts',
  'organizations',
  'badges',
  'student_badges',
  'games',
  'video_lectures',
  'videos',
  'reading_stories',
  'speaking_scenarios',
  'pages',
  'downloads',
  'assets',
  'lesson_media',
  'site_settings',
  'support_messages',
  'support_message_replies',
  'support_faqs',
  'voice_actors',
  'voices',
  'voice_lines',
  'voice_recordings',
];

export interface BackupSummary {
  tables: number;
  rows: number;
  skipped: string[];
  megabytes: string;
  filename: string;
}

export async function downloadDatabaseBackup(
  onProgress?: (table: string) => void
): Promise<BackupSummary> {
  if (Platform.OS !== 'web') {
    throw new Error(
      'Please use the web admin (englishforcricket.com/admin) to download a backup.'
    );
  }
  const tables: Record<string, Record<string, unknown>[]> = {};
  const skipped: string[] = [];
  let rows = 0;
  const PAGE = 1000;
  for (const table of BACKUP_TABLES) {
    onProgress?.(table);
    try {
      const all: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as Record<string, unknown>[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      if (table === 'voice_actors') {
        all.forEach((row) => {
          delete row.password;
        });
      }
      tables[table] = all;
      rows += all.length;
    } catch {
      skipped.push(table);
    }
  }
  const createdAt = new Date().toISOString();
  const payload = {
    app: 'english-for-cricket',
    kind: 'data-backup',
    created_at: createdAt,
    note: 'Data export from the admin dashboard. Voice actor passwords are intentionally excluded. Database structure lives in the project migration files.',
    tables,
  };
  const json = JSON.stringify(payload);
  const stamp = createdAt.slice(0, 10).replace(/-/g, '');
  const filename = `english-for-cricket-backup-${stamp}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  // Remember when the last backup was taken, so the settings card can
  // show it (and nudge when it grows older than a week).
  await supabase
    .from('site_settings')
    .upsert([{ key: 'last_backup_at', value: createdAt }]);
  return {
    tables: Object.keys(tables).length,
    rows,
    skipped,
    megabytes: (json.length / (1024 * 1024)).toFixed(1),
    filename,
  };
}
