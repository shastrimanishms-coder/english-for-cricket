/* Round 93: package an exported dist/ into a deliverable zip.
 *
 * Steps: stamp the service worker (scripts/stamp-dist.js), copy
 * the Lolipop PHP endpoints into dist/, verify the server files
 * are the exact known builds, then zip the dist CONTENTS at the
 * archive root (the layout every round has shipped).
 *
 * Usage: node scripts/make-dist.js <outputZipPath>
 * Expects: a fresh `npx expo export` in ./dist and the PHP sources
 * in ~/workspace/your_files/lolipop-media/.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const outZip = process.argv[2];
if (!outZip) {
  console.error('usage: node scripts/make-dist.js <outputZipPath>');
  process.exit(1);
}

const PHP_SOURCES = path.join(
  process.env.HOME,
  'workspace/your_files/lolipop-media'
);
const EXPECTED = {
  '.htaccess': 1117,
  'voice-storage.php': 4029,
  'mail-send.php': 2718,
  'image-storage.php': 4013,
};

execFileSync('node', [path.join(__dirname, 'stamp-dist.js'), distDir], {
  stdio: 'inherit',
});

for (const name of ['voice-storage.php', 'mail-send.php', 'image-storage.php']) {
  const src = path.join(PHP_SOURCES, name);
  if (!fs.existsSync(src)) {
    console.error(`missing PHP source: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(distDir, name));
}

let ok = true;
for (const [name, size] of Object.entries(EXPECTED)) {
  const file = path.join(distDir, name);
  const actual = fs.existsSync(file) ? fs.statSync(file).size : -1;
  if (actual !== size) {
    console.error(`VERIFY FAIL ${name}: expected ${size} bytes, found ${actual}`);
    ok = false;
  }
}
for (const name of ['sw.js', 'manifest.webmanifest', 'index.html']) {
  if (!fs.existsSync(path.join(distDir, name))) {
    console.error(`VERIFY FAIL ${name}: missing from dist`);
    ok = false;
  }
}
const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
if (!/\.css/.test(indexHtml) || !/_expo\/static\/js/.test(indexHtml)) {
  console.error('VERIFY FAIL index.html: stylesheet or bundle reference missing');
  ok = false;
}
if (!ok) process.exit(1);

fs.rmSync(outZip, { force: true });
execFileSync('zip', ['-rq', outZip, '.'], { cwd: distDir, stdio: 'inherit' });
const bytes = fs.statSync(outZip).size;
console.log(`packaged ${outZip}: ${bytes} bytes`);
