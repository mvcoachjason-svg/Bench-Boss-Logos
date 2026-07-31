/*
 * Headless smoke test for the exporters.
 *
 * Loads index.html in Chromium, hands the app a synthetic AudioBuffer, then
 * exports each format and checks the bytes actually are what the extension
 * claims — in particular that M4A is a real MP4 and not WebM in disguise.
 *
 *   npm test        (requires playwright: npx playwright@latest ...)
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox']
});
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('  [page error]', msg.text());
});
await page.goto('file://' + join(root, 'index.html'));

const results = await page.evaluate(async () => {
  const out = [];
  const ctx = new AudioContext();
  const rate = 44100;
  const seconds = 6;
  const buffer = ctx.createBuffer(2, rate * seconds, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin((2 * Math.PI * (c ? 660 : 440) * i) / rate) * 0.5;
    }
  }

  const app = window.AudioClipper;
  app.loadBuffer('tone.wav', buffer);
  app.setSelection(1, 4);

  const sel = { start: app.state.selStart, end: app.state.selEnd };
  out.push({ name: 'selection', ok: Math.abs(sel.end - sel.start - 3) < 0.001, detail: JSON.stringify(sel) });

  // preset button
  document.querySelector('[data-seconds="15"]').click();
  out.push({
    name: 'preset 15s clamps to file length',
    ok: Math.abs(app.state.selEnd - app.state.selStart - 6) < 0.01,
    detail: (app.state.selEnd - app.state.selStart).toFixed(2) + 's of a 6s file'
  });

  app.setSelection(1, 4);
  const clip = app.sliceSelection();
  out.push({
    name: 'slice length',
    ok: Math.abs(clip.length - 3 * rate) <= 1,
    detail: clip.length + ' frames'
  });

  const head = async (blob, n = 16) =>
    Array.from(new Uint8Array(await blob.slice(0, n).arrayBuffer()));

  // WAV
  const wav = app.encodeWav(clip);
  const wavHead = await head(wav);
  const tag = (bytes, from, len) =>
    String.fromCharCode(...bytes.slice(from, from + len));
  out.push({
    name: 'WAV is RIFF/WAVE',
    ok: tag(wavHead, 0, 4) === 'RIFF' && tag(wavHead, 8, 4) === 'WAVE',
    detail: tag(wavHead, 0, 4) + '/' + tag(wavHead, 8, 4) + ' ' + wav.size + ' bytes'
  });
  const decodedWav = await ctx.decodeAudioData(await wav.arrayBuffer());
  out.push({
    name: 'WAV decodes back to 3s stereo',
    ok: Math.abs(decodedWav.duration - 3) < 0.01 && decodedWav.numberOfChannels === 2,
    detail: decodedWav.duration.toFixed(3) + 's, ' + decodedWav.numberOfChannels + 'ch'
  });

  // MP3
  const mp3 = await app.encodeMp3(clip, 192, () => {});
  const mp3Head = await head(mp3);
  out.push({
    name: 'MP3 starts with a frame sync',
    ok: mp3Head[0] === 0xff && (mp3Head[1] & 0xe0) === 0xe0,
    detail: mp3Head.slice(0, 3).map((b) => b.toString(16)).join(' ') + ', ' + mp3.size + ' bytes'
  });
  const decodedMp3 = await ctx.decodeAudioData(await mp3.arrayBuffer());
  out.push({
    name: 'MP3 decodes back to ~3s',
    ok: Math.abs(decodedMp3.duration - 3) < 0.15,
    detail: decodedMp3.duration.toFixed(3) + 's'
  });

  // M4A container: built from synthetic frames so the muxer is checked even on
  // browsers (like headless Chromium) that ship no AAC encoder.
  const asc = new Uint8Array([0x12, 0x10]); // AAC-LC, 44.1 kHz, stereo
  const frames = [];
  for (let i = 0; i < 12; i++) frames.push(new Uint8Array(200 + i).fill(i + 1));
  const muxed = app.buildMp4(frames, asc, rate, 2, 1024, 192000);
  out.push({
    name: 'muxer emits bytes',
    ok: muxed.length > 0,
    detail: muxed.length + ' bytes from ' + frames.length + ' frames'
  });
  out.push({ name: '__mp4bytes', ok: true, detail: '', bytes: Array.from(muxed) });

  // M4A end to end (needs an AAC encoder in this browser)
  try {
    const m4a = await app.encodeM4a(clip, 192000, () => {});
    const m4aHead = await head(m4a, 32);
    const brand = tag(m4aHead, 4, 4);
    out.push({
      name: 'M4A is a real MP4 (ftyp box, not WebM)',
      ok: brand === 'ftyp' && m4aHead[0] !== 0x1a,
      detail: 'box=' + brand + ' major=' + tag(m4aHead, 8, 4) + ', ' + m4a.size + ' bytes'
    });
    const decodedM4a = await ctx.decodeAudioData(await m4a.arrayBuffer());
    out.push({
      name: 'M4A decodes back to ~3s',
      ok: Math.abs(decodedM4a.duration - 3) < 0.2,
      detail: decodedM4a.duration.toFixed(3) + 's, ' + decodedM4a.numberOfChannels + 'ch'
    });
  } catch (error) {
    const hasEncoder = await app.canEncodeAac(rate, 2, 192000);
    out.push({
      name: 'M4A end-to-end export',
      ok: !hasEncoder,          // no AAC encoder here is a skip, not a failure
      skipped: !hasEncoder,
      detail: String((error && error.message) || error)
    });
  }

  return out;
});

// ---- container checks, run in node against the muxer's raw output ----------

function parseBoxes(bytes, start, end) {
  const boxes = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  while (offset + 8 <= end) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (size < 8 || offset + size > end) {
      throw new Error(`bad box ${type} size ${size} at ${offset}`);
    }
    boxes.push({ type, start: offset, size });
    offset += size;
  }
  if (offset !== end) throw new Error(`boxes do not fill ${start}..${end}`);
  return boxes;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf']);

function walk(bytes, start, end, path, found) {
  for (const box of parseBoxes(bytes, start, end)) {
    found.set(path + '/' + box.type, box);
    if (CONTAINERS.has(box.type)) {
      walk(bytes, box.start + 8, box.start + box.size, path + '/' + box.type, found);
    }
    if (box.type === 'stsd') {
      walk(bytes, box.start + 16, box.start + box.size, path + '/stsd', found);
    }
    if (box.type === 'mp4a') {
      walk(bytes, box.start + 36, box.start + box.size, path + '/mp4a', found);
    }
  }
}

const mp4Entry = results.find((r) => r.name === '__mp4bytes');
const containerChecks = [];
if (mp4Entry) {
  const bytes = Uint8Array.from(mp4Entry.bytes);
  const view = new DataView(bytes.buffer);
  try {
    const found = new Map();
    walk(bytes, 0, bytes.length, '', found);

    const need = ['/ftyp', '/moov', '/moov/mvhd', '/moov/trak/tkhd',
                  '/moov/trak/mdia/mdhd', '/moov/trak/mdia/hdlr',
                  '/moov/trak/mdia/minf/stbl/stsd/mp4a/esds',
                  '/moov/trak/mdia/minf/stbl/stts',
                  '/moov/trak/mdia/minf/stbl/stsc',
                  '/moov/trak/mdia/minf/stbl/stsz',
                  '/moov/trak/mdia/minf/stbl/stco', '/mdat'];
    const missing = need.filter((p) => !found.has(p));
    containerChecks.push({
      name: 'MP4 box tree is well formed and complete',
      ok: missing.length === 0,
      detail: missing.length ? 'missing ' + missing.join(', ') : need.length + ' boxes present'
    });

    const stco = found.get('/moov/trak/mdia/minf/stbl/stco');
    const mdat = found.get('/mdat');
    const chunkOffset = view.getUint32(stco.start + 16);
    containerChecks.push({
      name: 'stco points at the mdat payload',
      ok: chunkOffset === mdat.start + 8,
      detail: 'stco=' + chunkOffset + ' mdat payload=' + (mdat.start + 8)
    });

    const stsz = found.get('/moov/trak/mdia/minf/stbl/stsz');
    const sampleCount = view.getUint32(stsz.start + 16);
    let sizeSum = 0;
    for (let i = 0; i < sampleCount; i++) sizeSum += view.getUint32(stsz.start + 20 + i * 4);
    containerChecks.push({
      name: 'stsz sample sizes total the mdat payload',
      ok: sampleCount === 12 && sizeSum === mdat.size - 8,
      detail: sampleCount + ' samples, ' + sizeSum + ' bytes vs mdat ' + (mdat.size - 8)
    });

    // esds descriptor lengths must cover exactly what follows them.
    const esds = found.get('/moov/trak/mdia/minf/stbl/stsd/mp4a/esds');
    const body = bytes.slice(esds.start + 12, esds.start + esds.size);
    const esOk = body[0] === 0x03 && body[1] === body.length - 2;
    const dcdAt = 5;
    const dcdOk = body[dcdAt] === 0x04 && body[dcdAt + 1] === body.length - dcdAt - 5;
    const slAt = body.length - 3;
    const slOk = body[slAt] === 0x06 && body[slAt + 1] === 0x01;
    containerChecks.push({
      name: 'esds descriptor lengths are self-consistent',
      ok: esOk && dcdOk && slOk,
      detail: `ES=${body[1]} (want ${body.length - 2}), DCD=${body[dcdAt + 1]} ` +
              `(want ${body.length - dcdAt - 5}), SL tag ${slOk ? 'ok' : 'bad'}`
    });
  } catch (error) {
    containerChecks.push({ name: 'MP4 box tree parses', ok: false, detail: String(error.message) });
  }
}

let failed = 0;
for (const r of results.concat(containerChecks)) {
  if (r.name === '__mp4bytes') continue;
  if (!r.ok) failed++;
  const label = r.skipped ? 'SKIP' : (r.ok ? 'PASS' : 'FAIL');
  console.log(`${label}  ${r.name}${r.detail ? '  —  ' + r.detail : ''}`);
}
await browser.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
