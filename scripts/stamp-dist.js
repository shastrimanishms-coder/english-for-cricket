/* Round 93: stamp the service worker in an exported dist folder.
 *
 * The worker (public/sw.js) ships with placeholders. This script:
 *   1. walks the dist for the app shell — every .html page, the
 *      _expo bundles, bundled assets, the PWA manifest and icons;
 *   2. hashes that inventory into a shell version;
 *   3. rewrites sw.js with the version and the precache list.
 *
 * Because the version is a hash of the shell files themselves, any
 * new build — even one changed file — produces a new version, the
 * browser installs the new worker, and activation deletes the old
 * shell cache. Re-running on an already-stamped dist re-stamps it
 * (the cache-bust rig relies on that).
 *
 * Usage: node scripts/stamp-dist.js <distDir>
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = process.argv[2];
if (!distDir || !fs.existsSync(path.join(distDir, 'sw.js'))) {
  console.error('usage: node scripts/stamp-dist.js <distDir-with-sw.js>');
  process.exit(1);
}

const INCLUDE_DIRS = ['_expo', 'assets', 'icons'];
const INCLUDE_ROOT_FILES = new Set([
  'manifest.webmanifest',
  'favicon.ico',
  'favicon.png',
]);

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
}

const all = [];
walk(distDir, distDir, all);

const shellFiles = all
  .filter((rel) => {
    if (rel === 'sw.js') return false;
    if (rel.endsWith('.html')) return true;
    const top = rel.split('/')[0];
    if (INCLUDE_DIRS.includes(top)) return true;
    if (!rel.includes('/') && INCLUDE_ROOT_FILES.has(rel)) return true;
    return false;
  })
  .sort();

const hash = crypto.createHash('sha1');
let totalBytes = 0;
for (const rel of shellFiles) {
  const size = fs.statSync(path.join(distDir, rel)).size;
  totalBytes += size;
  hash.update(`${rel}:${size}\n`);
}
const version = hash.digest('hex').slice(0, 12);
const precache = ['/', ...shellFiles.map((rel) => '/' + rel)];

const swPath = path.join(distDir, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
if (!/const SHELL_VERSION = '[^']*';/.test(sw) || !/const PRECACHE = \[[\s\S]*?\];/.test(sw)) {
  console.error('sw.js does not carry the expected placeholders — refusing to stamp.');
  process.exit(1);
}
sw = sw.replace(/const SHELL_VERSION = '[^']*';/, `const SHELL_VERSION = '${version}';`);
sw = sw.replace(
  /const PRECACHE = \[[\s\S]*?\];/,
  `const PRECACHE = ${JSON.stringify(precache)};`
);
fs.writeFileSync(swPath, sw);

console.log(
  `stamped sw.js: version ${version}, ${precache.length} precache entries, ${(totalBytes / 1048576).toFixed(2)} MB of shell`
);
