/* English for Cricket — service worker (Round 93, offline Phase 1).
 *
 * Hand-written and dependency-free. Two caches matter:
 *
 *   efc-shell-<version>   The app shell (HTML + bundles + icons),
 *                         precached on install. <version> is stamped
 *                         at packaging time by scripts/stamp-dist.js
 *                         from a hash of the shell files themselves,
 *                         so every new build installs a fresh shell
 *                         and activation deletes the previous one —
 *                         a student can never be stranded on a stale
 *                         build, and an unstamped dev copy uses the
 *                         literal placeholder as its version.
 *
 *   efc-pack-assets-v1    Downloaded lesson-pack files (pictures
 *                         and voice recordings), written by the app
 *                         itself (src/lib/offlinePacks.ts), keyed by
 *                         their original URLs, and served cache-first
 *                         for ANY origin. This cache is deliberately
 *                         NOT versioned with the shell: packs survive
 *                         app updates.
 *
 * Rules this worker lives by:
 *   - Only GET requests are handled; everything else goes straight
 *     to the network untouched.
 *   - API calls are never intercepted and never cached: any path
 *     under /rest/v1/, /auth/v1/, /realtime/v1/ or /functions/v1/
 *     (the Supabase data paths, on whatever host) passes through,
 *     so no authenticated or per-student response is ever stored
 *     and offline API calls fail exactly as they would without a
 *     worker — the app's own queue handles the consequences.
 *     Public storage files (/storage/...) are NOT API calls: a
 *     downloaded pack's pictures live there, and the pack cache
 *     below must be able to serve them.
 *   - Navigations are network-first, so an online student always
 *     gets the current build; the cached shell is only the offline
 *     fallback.
 *   - Same-origin static files are cache-first (their names are
 *     fingerprinted per build, so a cache hit is never stale).
 */
const SHELL_VERSION = '__EFC_SHELL_VERSION__';
const SHELL_CACHE = 'efc-shell-' + SHELL_VERSION;
const PACK_CACHE = 'efc-pack-assets-v1';
const PRECACHE = [/*__EFC_PRECACHE__*/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('efc-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/* Media elements ask for audio in byte ranges; a cached file is a
 * whole file, so answer with the requested slice and a 206, the
 * way a real file server would. Anything unparseable gets the
 * whole file, which players also accept. */
async function rangeAware(response, request) {
  const range = request.headers.get('range');
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return response;
  try {
    const blob = await response.clone().blob();
    const total = blob.size;
    let start = match[1] === '' ? 0 : parseInt(match[1], 10);
    let end = match[2] === '' ? total - 1 : parseInt(match[2], 10);
    if (match[1] === '' && match[2] !== '') {
      // Suffix range: the last N bytes.
      start = Math.max(0, total - parseInt(match[2], 10));
      end = total - 1;
    }
    if (start >= total) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': 'bytes */' + total },
      });
    }
    end = Math.min(end, total - 1);
    const slice = blob.slice(start, end + 1);
    return new Response(slice, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': blob.type || response.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Length': String(slice.size),
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err) {
    return response;
  }
}

/* The Supabase data paths. Requests under these are API calls —
 * data, auth, realtime — and are never intercepted: they reach
 * the network (or fail offline) exactly as they would with no
 * worker installed. Public storage files live under /storage/
 * and are deliberately NOT in this list: a pack's pictures are
 * storage files, and the pack cache must be able to serve them. */
const API_PATH = /^\/(rest|auth|realtime|functions)\/v1\//;

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (API_PATH.test(url.pathname)) return;

  event.respondWith(
    (async () => {
      // 1. Pack files first, whatever origin they live on: if the
      //    student downloaded this picture or recording, serve the
      //    device's copy — online or offline, it is the same bytes.
      const packCache = await caches.open(PACK_CACHE);
      const packed = await packCache.match(request.url);
      if (packed) return rangeAware(packed, request);

      // 2. Page navigations: network first (fresh build wins), the
      //    cached shell only when the network cannot answer.
      if (request.mode === 'navigate') {
        try {
          return await fetch(request);
        } catch (err) {
          const shell = await caches.open(SHELL_CACHE);
          const exact = await shell.match(request.url);
          if (exact) return exact;
          const home = await shell.match('/index.html');
          if (home) return home;
          throw err;
        }
      }

      // 3. Same-origin files: the precached shell covers the app;
      //    anything else same-origin goes to the network and is
      //    not stored (content images manage themselves).
      if (url.origin === self.location.origin) {
        const shell = await caches.open(SHELL_CACHE);
        const hit = await shell.match(request.url);
        if (hit) return rangeAware(hit, request);
        return fetch(request);
      }

      // 4. Any other cross-origin file (a storage picture that is
      //    not in a downloaded pack, and the like): straight to
      //    the network, never cached here. The pack cache above
      //    is the only cross-origin store, and the app fills it
      //    deliberately, file by file.
      return fetch(request);
    })()
  );
});
