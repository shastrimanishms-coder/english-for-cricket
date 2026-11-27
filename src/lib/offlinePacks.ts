import { fetchVoicePrefs, resolveVoicesForTexts } from './lessonVoices';
import { getStudentIdentity } from './studentIdentity';
import { IDB_STORES, idbClear, idbDelete, idbGet, idbGetAll, idbPut } from './idb';
import { supabase } from './supabase';
import type { VoiceCategory } from './voiceStudio';

/**
 * Offline lesson packs (Round 93, Phase 1).
 *
 * A pack is ONE curriculum module: its lesson rows and slide rows
 * (stored in IndexedDB), every picture and slide-audio file the
 * slides reference, and the recorded voice file for every line the
 * module can speak — resolved at download time through the very
 * same resolver the lesson player uses online, with the student's
 * own voice preferences and the module's model/"you" categories,
 * so the offline lesson sounds exactly like the online one. Files
 * live in the Cache Storage bucket the service worker serves
 * cache-first (efc-pack-assets-v1), keyed by their original URLs,
 * so the player's image and audio elements need no changes at all:
 * online or offline, they ask for the same address.
 *
 * A pack only "exists" once its record lands in IndexedDB, which
 * happens after every file is stored — a interrupted download
 * leaves stray cached files (harmless, overwritten on retry) but
 * never a half pack the player would trust.
 *
 * Packs contain curriculum content only. Nothing about the student
 * is stored in a pack beyond the consequence of their voice picks
 * (which recordings were fetched).
 */

export const PACK_CACHE_NAME = 'efc-pack-assets-v1';

export interface PackLesson {
  id: string;
  title: string;
  module_id: string | null;
  order_index: number;
}

/** A lesson_slides row, stored whole — the player casts it to its Slide type. */
export type PackSlide = Record<string, unknown> & {
  id: string;
  lesson_id: string;
  order_index: number;
};

export interface PackRecord {
  moduleId: string;
  moduleTitle: string;
  moduleOrderIndex: number;
  downloadedAt: number;
  /** dataBytes + the real stored byte size of every file. */
  sizeBytes: number;
  dataBytes: number;
  fileCount: number;
  lessons: PackLesson[];
  slides: PackSlide[];
  /** Cleaned line text -> recording URL (the player's voice map). */
  audioIndex: Record<string, string>;
  assetUrls: string[];
}

export interface PackInventory {
  moduleId: string;
  moduleTitle: string;
  moduleOrderIndex: number;
  lessons: PackLesson[];
  slides: PackSlide[];
  audioIndex: Record<string, string>;
  assets: { url: string; size: number | null }[];
  /** Sum of known file sizes + dataBytes; `unknownCount` files are excluded. */
  sizeBytes: number;
  dataBytes: number;
  unknownCount: number;
}

export interface PackDownloadProgress {
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
}

export interface ModuleSummary {
  id: string;
  title: string;
  orderIndex: number;
  stageId: string | null;
}

function packsSupported(): boolean {
  return typeof indexedDB !== 'undefined' && typeof caches !== 'undefined';
}

export function offlinePacksSupported(): boolean {
  return packsSupported();
}

/** The 40 modules, in path order. Online only — throws on failure. */
export async function listModules(): Promise<ModuleSummary[]> {
  const { data, error } = await supabase
    .from('curriculum_modules')
    .select('id, title, order_index, stage_id')
    .order('order_index', { ascending: true });
  if (error) throw error;
  return (data || []).map((m) => ({
    id: m.id as string,
    title: m.title as string,
    orderIndex: (m.order_index as number) ?? 0,
    stageId: (m.stage_id as string | null) ?? null,
  }));
}

function collectAssetUrls(slides: PackSlide[], audioIndex: Record<string, string>): string[] {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && /^https?:\/\//.test(value)) urls.add(value);
  };
  for (const slide of slides) {
    add(slide.media_url);
    add(slide.audio_url);
    const options = slide.options as { panels?: Record<string, unknown>[] } | null;
    for (const panel of options?.panels || []) {
      add(panel.media_url);
      add(panel.audio_url);
    }
  }
  for (const url of Object.values(audioIndex)) add(url);
  return [...urls];
}

function collectSpokenTexts(slides: PackSlide[]): (string | null)[] {
  const texts: (string | null)[] = [];
  for (const slide of slides) {
    texts.push((slide.correct_answer as string | null) ?? null);
    texts.push((slide.prompt_text as string | null) ?? null);
    const options = slide.options as { panels?: { text?: string }[] } | null;
    for (const panel of options?.panels || []) texts.push(panel.text ?? null);
  }
  return texts;
}

async function sizeOf(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const len = res.headers.get('content-length');
    if (res.ok && len && !Number.isNaN(parseInt(len, 10))) return parseInt(len, 10);
  } catch {
    // Fall through to the ranged probe.
  }
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    const range = res.headers.get('content-range');
    if (range) {
      const total = parseInt(range.split('/')[1] ?? '', 10);
      if (!Number.isNaN(total)) return total;
    }
    const len = res.headers.get('content-length');
    if (res.ok && len && !Number.isNaN(parseInt(len, 10))) return parseInt(len, 10);
  } catch {
    // Size unknown — the file still downloads; only the estimate misses it.
  }
  return null;
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Fetch everything a pack for this module contains and measure it
 * honestly: the real byte size of every file (HEAD, with a ranged
 * probe behind it) plus the stored data size. This is what the
 * student sees BEFORE choosing to download.
 */
export async function buildPackInventory(moduleId: string): Promise<PackInventory> {
  const { data: moduleRow, error: moduleError } = await supabase
    .from('curriculum_modules')
    .select('id, title, order_index')
    .eq('id', moduleId)
    .single();
  if (moduleError || !moduleRow) throw moduleError || new Error('Module not found.');

  const { data: lessonRows, error: lessonError } = await supabase
    .from('curriculum_lessons')
    .select('id, title, module_id, order_index')
    .eq('module_id', moduleId)
    .order('order_index', { ascending: true });
  if (lessonError) throw lessonError;
  const lessons = (lessonRows || []) as PackLesson[];

  const { data: slideRows, error: slideError } = await supabase
    .from('lesson_slides')
    .select('*')
    .in('lesson_id', lessons.map((l) => l.id))
    .order('order_index', { ascending: true });
  if (slideError) throw slideError;
  const slides = (slideRows || []) as PackSlide[];

  // The module's recorded voices, resolved exactly as the player
  // resolves them: the student's chosen voices first, the module's
  // parity categories preferred, the resolver's own fallback across
  // voices and categories behind that — so every line that has a
  // recording anywhere gets its file into the pack.
  const identity = await getStudentIdentity();
  const prefs = identity ? await fetchVoicePrefs(identity) : {};
  const moduleNo = (moduleRow.order_index as number) % 100;
  const preferred: VoiceCategory[] = moduleNo % 2 === 1 ? ['M1', 'B1'] : ['F1', 'G1'];
  const audioMap = await resolveVoicesForTexts(collectSpokenTexts(slides), prefs, preferred);
  const audioIndex: Record<string, string> = Object.fromEntries(audioMap);

  const assetUrls = collectAssetUrls(slides, audioIndex);
  const sizes = await mapPool(assetUrls, 8, (url) => sizeOf(url));
  const assets = assetUrls.map((url, i) => ({ url, size: sizes[i] }));

  const dataBytes = new Blob([
    JSON.stringify({ lessons, slides, audioIndex }),
  ]).size;
  const knownBytes = assets.reduce((sum, a) => sum + (a.size ?? 0), 0);

  return {
    moduleId,
    moduleTitle: moduleRow.title as string,
    moduleOrderIndex: moduleRow.order_index as number,
    lessons,
    slides,
    audioIndex,
    assets,
    sizeBytes: knownBytes + dataBytes,
    dataBytes,
    unknownCount: assets.filter((a) => a.size === null).length,
  };
}

/** A previously measured inventory, cached so revisits are instant. */
export async function getCachedInventory(moduleId: string): Promise<PackInventory | null> {
  const row = await idbGet<{ moduleId: string; inventory: PackInventory }>(
    IDB_STORES.packMeta,
    moduleId
  );
  return row?.inventory ?? null;
}

export async function cacheInventory(inventory: PackInventory): Promise<void> {
  await idbPut(IDB_STORES.packMeta, {
    moduleId: inventory.moduleId,
    inventory,
  });
}

/**
 * Download a module pack: every file into the pack cache (progress
 * reported as files land), then the pack record into IndexedDB.
 * Throws on the first failed file — no record is written, so the
 * module simply shows as not downloaded and can be retried.
 */
export async function downloadPack(
  moduleId: string,
  onProgress?: (progress: PackDownloadProgress) => void
): Promise<PackRecord> {
  if (!packsSupported()) throw new Error('Offline packs are not available in this browser.');
  const inventory = await buildPackInventory(moduleId);

  try {
    await navigator.storage?.persist?.();
  } catch {
    // Persistence is a nicety; the pack works without the promise.
  }

  const cache = await caches.open(PACK_CACHE_NAME);
  const bytesTotal = inventory.sizeBytes;
  let filesDone = 0;
  let bytesDone = inventory.dataBytes;
  onProgress?.({ filesDone, filesTotal: inventory.assets.length, bytesDone, bytesTotal });

  let storedBytes = 0;
  await mapPool(inventory.assets, 6, async (asset) => {
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`A file could not be downloaded (${response.status}).`);
    await cache.put(asset.url, response.clone());
    // Measure what actually landed (HEAD estimates can drift).
    try {
      const blob = await response.blob();
      storedBytes += blob.size;
    } catch {
      storedBytes += asset.size ?? 0;
    }
    filesDone += 1;
    bytesDone = inventory.dataBytes + storedBytes;
    onProgress?.({
      filesDone,
      filesTotal: inventory.assets.length,
      bytesDone,
      bytesTotal,
    });
  });

  const record: PackRecord = {
    moduleId: inventory.moduleId,
    moduleTitle: inventory.moduleTitle,
    moduleOrderIndex: inventory.moduleOrderIndex,
    downloadedAt: Date.now(),
    sizeBytes: inventory.dataBytes + storedBytes,
    dataBytes: inventory.dataBytes,
    fileCount: inventory.assets.length,
    lessons: inventory.lessons,
    slides: inventory.slides,
    audioIndex: inventory.audioIndex,
    assetUrls: inventory.assets.map((a) => a.url),
  };
  await idbPut(IDB_STORES.packs, record);
  return record;
}

export async function getPackRecord(moduleId: string): Promise<PackRecord | null> {
  if (typeof indexedDB === 'undefined') return null;
  const record = await idbGet<PackRecord>(IDB_STORES.packs, moduleId);
  return record ?? null;
}

export async function listPackRecords(): Promise<PackRecord[]> {
  if (typeof indexedDB === 'undefined') return [];
  const records = await idbGetAll<PackRecord>(IDB_STORES.packs);
  return records.sort((a, b) => a.moduleOrderIndex - b.moduleOrderIndex);
}

/** The pack (if any) that contains this lesson, with the lesson's own data. */
export async function getPackForLesson(
  lessonId: string
): Promise<{
  record: PackRecord;
  lesson: PackLesson;
  slides: PackSlide[];
} | null> {
  const records = await listPackRecords();
  for (const record of records) {
    const lesson = record.lessons.find((l) => l.id === lessonId);
    if (!lesson) continue;
    const slides = record.slides
      .filter((s) => s.lesson_id === lessonId)
      .sort((a, b) => a.order_index - b.order_index);
    return { record, lesson, slides };
  }
  return null;
}

/** The pack's voice map (cleaned text -> recording URL) for a module. */
export async function getPackAudioMap(moduleId: string): Promise<Map<string, string> | null> {
  const record = await getPackRecord(moduleId);
  if (!record) return null;
  return new Map(Object.entries(record.audioIndex));
}

/**
 * Remove a pack: its record, and every cached file no other pack
 * still references (pictures can be shared between modules).
 */
export async function deletePack(moduleId: string): Promise<void> {
  const record = await getPackRecord(moduleId);
  await idbDelete(IDB_STORES.packs, moduleId);
  if (!record || typeof caches === 'undefined') return;
  const remaining = await listPackRecords();
  const stillUsed = new Set(remaining.flatMap((r) => r.assetUrls));
  const cache = await caches.open(PACK_CACHE_NAME);
  for (const url of record.assetUrls) {
    if (!stillUsed.has(url)) {
      try {
        await cache.delete(url);
      } catch {
        // A file that will not delete is a file that stays cached;
        // the pack itself is already gone from the player's view.
      }
    }
  }
}

/** Remove every pack and cached pack file (account deletion). */
export async function clearAllPacks(): Promise<void> {
  await idbClear(IDB_STORES.packs);
  await idbClear(IDB_STORES.packMeta);
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(PACK_CACHE_NAME);
    } catch {
      // Nothing more can be done locally.
    }
  }
}

/** Human-readable byte size for the UI. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
