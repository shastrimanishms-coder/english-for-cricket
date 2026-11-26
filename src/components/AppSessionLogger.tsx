import { useActivityLogger } from '../lib/useActivityLogger';

/**
 * The whole-app activity stream (Round 81): mounted once in the root
 * layout, it records activity_type 'app' for whoever is learning on
 * this device, so reports have a TOTAL active-time figure that also
 * covers screens with no section logger of their own (dashboard,
 * profile, journey, menus). Section streams ('lesson_slide', 'game',
 * 'reading', 'speaking', 'video') are logged separately by their own
 * screens and OVERLAP this total on purpose: the 'app' stream is the
 * headline total, the sections are the breakdown — never add them
 * together. Renders nothing.
 */
export default function AppSessionLogger() {
  useActivityLogger({ activityType: 'app', targetId: 'app' });
  return null;
}
