/**
 * Content types for storage uploads, derived from the file EXTENSION.
 *
 * The extension must win over the picker's reported mimeType: some
 * browsers/OSes report misleading types (a .html game picked on Linux
 * can come back as "text/plain"), and Supabase Storage serves the file
 * with whatever type the upload declared - a game stored as text/plain
 * displays as raw text in the player instead of running. The picker's
 * mimeType is only a fallback for extensions we do not know.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  zip: 'application/zip',
  json: 'application/json',
  txt: 'text/plain',
};

export function contentTypeForFileName(
  fileName: string,
  fallbackMimeType?: string | null
): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return (
    CONTENT_TYPE_BY_EXTENSION[ext] ||
    fallbackMimeType ||
    'application/octet-stream'
  );
}
