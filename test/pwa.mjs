/*
 * PWA check: serves the project over http://localhost (a secure context, which
 * file:// is not), then verifies the manifest, the service worker registration,
 * the precached shell, and that the app still loads with the network cut off.
 *
 *   node test/pwa.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json'
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox']
});
const context = await browser.newContext();
const page = await context.newPage();
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

await page.goto(origin + '/', { waitUntil: 'load' });

// ---- manifest ----
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return null;
  return (await fetch(link.href)).json();
});
check('manifest is linked and parses', !!manifest, manifest ? manifest.name : 'missing');
check('manifest is installable (name, start_url, display, 192+512 icons)',
  !!manifest && !!manifest.name && !!manifest.start_url && manifest.display === 'standalone' &&
  manifest.icons.some((i) => i.sizes === '192x192') &&
  manifest.icons.some((i) => i.sizes === '512x512'),
  manifest ? `display=${manifest.display}, ${manifest.icons.length} icons` : '—');
check('manifest declares a maskable icon',
  !!manifest && manifest.icons.some((i) => (i.purpose || '').includes('maskable')),
  'required for round/squircle home-screen icons');

// every icon the manifest names must actually exist
const iconStatuses = [];
for (const icon of manifest ? manifest.icons : []) {
  const response = await page.request.get(origin + '/' + icon.src);
  iconStatuses.push(`${icon.src}:${response.status()}`);
}
const appleIcon = await page.request.get(origin + '/icons/apple-touch-icon.png');
check('all declared icons are served',
  iconStatuses.every((s) => s.endsWith(':200')) && appleIcon.status() === 200,
  iconStatuses.length + ' manifest icons + apple-touch-icon');

// ---- service worker ----
const swReady = await page.evaluate(() =>
  navigator.serviceWorker.ready.then((r) => !!r.active).catch(() => false));
check('service worker activates', swReady, 'navigator.serviceWorker.ready resolved');

// Regression: the first activation calls clients.claim(), which fires
// controllerchange. The page must not treat that as an update and reload.
await page.waitForTimeout(700);
const navType = await page.evaluate(() =>
  (performance.getEntriesByType('navigation')[0] || {}).type);
check('first load does not reload itself', navType === 'navigate',
  'navigation type after activation: ' + navType);

const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const cache = await caches.open(names[0]);
  return { name: names[0], urls: (await cache.keys()).map((r) => new URL(r.url).pathname) };
});
const needed = ['/index.html', '/styles.css', '/app.js', '/vendor/lame.min.js',
                '/manifest.webmanifest'];
const missing = needed.filter((p) => !cached.urls.includes(p));
check('app shell is precached', missing.length === 0,
  missing.length ? 'missing ' + missing.join(', ') : cached.urls.length + ' entries in ' + cached.name);

// ---- offline ----
await context.setOffline(true);
const offlinePage = await context.newPage();
let offlineOk = true;
let offlineDetail = '';
try {
  await offlinePage.goto(origin + '/', { waitUntil: 'load' });
  offlineDetail = await offlinePage.evaluate(() => {
    const styled = getComputedStyle(document.querySelector('.dropzone')).borderStyle;
    return [
      'title=' + document.title,
      'css=' + styled,
      'app=' + (window.AudioClipper ? 'loaded' : 'MISSING'),
      'lamejs=' + (typeof lamejs !== 'undefined' ? 'loaded' : 'MISSING')
    ].join(' ');
  });
  offlineOk = offlineDetail.includes('app=loaded') && offlineDetail.includes('lamejs=loaded') &&
              offlineDetail.includes('css=dashed');
} catch (error) {
  offlineOk = false;
  offlineDetail = String(error.message).split('\n')[0];
}
check('loads with the network offline', offlineOk, offlineDetail);

// exports must still work offline — the encoders are all local
let offlineExport = 'skipped';
if (offlineOk) {
  offlineExport = await offlinePage.evaluate(async () => {
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(1, 44100, 44100);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.4;
    window.AudioClipper.loadBuffer('tone.wav', buf);
    window.AudioClipper.setSelection(0, 1);
    const clip = window.AudioClipper.sliceSelection();
    const wav = window.AudioClipper.encodeWav(clip);
    const mp3 = await window.AudioClipper.encodeMp3(clip, 128, () => {});
    return `wav=${wav.size}B mp3=${mp3.size}B`;
  }).catch((e) => 'failed: ' + e.message);
}
check('WAV and MP3 export while offline', offlineExport.startsWith('wav='), offlineExport);

await context.setOffline(false);
await browser.close();
server.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  —  ' + c.detail : ''}`);
}
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
