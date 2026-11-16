import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * True once the lesson_id "Belongs to" column exists on the given content
 * table (migration 17). Until then, managers hide the lesson picker and
 * never write the column, so saves keep working pre-migration.
 */
export function useLessonTagging(table: string): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    (async () => {
      const { error } = await supabase.from(table).select('lesson_id').limit(1);
      setAvailable(!error);
    })();
  }, [table]);
  return available;
}
