# Audio Clipper

A single-page web app for trimming a section out of an audio file. Load a file,
drag a selection box over the waveform, preview it, and export the selection as
WAV, MP3, or M4A.

Everything runs in the browser. Nothing is uploaded anywhere, and the app works
offline once the files are on disk.

## Features

- **Waveform view** — min/max envelope rendered to a canvas, redrawn on resize,
  with the selected range highlighted.
- **Draggable selection** — drag the box to move it, drag either edge to resize,
  or click empty waveform to start a new selection. Handles are focusable, and
  arrow keys nudge by 0.1s (hold Shift for 1s).
- **Length presets** — 15s, 45s, 3m, 5m. A preset keeps the current start point
  and clamps to the file length.
- **Preview** — plays just the selection, with a playhead over the waveform.
- **Export** — WAV (16-bit PCM), MP3 (LAME, 96–320 kbps), M4A (AAC in a real MP4
  container).

## Running it

It is a static site — no build step, no bundler, no framework.

**Simplest:** open `index.html` in a browser. Everything works from `file://`,
including all three export formats.

**With a server** (handy if you want to open it from a phone on the same
network):

```sh
npm run dev      # live-server with reload on http://localhost:5173
npm run serve    # or plain python3 -m http.server 5173
```

`npm run dev` fetches `live-server` on demand via `npx`; nothing needs to be
installed first.

## Project layout

```
index.html          markup
styles.css          styling (follows the OS light/dark preference)
app.js              all application logic, including the WAV writer and MP4 muxer
vendor/lame.min.js  lamejs — the LAME MP3 encoder, compiled to JS (LGPL)
test/smoke.mjs      headless Chromium check of the exporters
```

## Notes on the audio pipeline

**Decoding happens once.** The file is decoded to an `AudioBuffer` when it is
loaded, and that buffer stays in memory. The waveform peaks, the preview, and
every export all read from it — exporting three formats in a row re-encodes
three times but never re-decodes. Preview uses an `AudioBufferSourceNode` with
an offset and duration rather than making a copy.

**M4A is real AAC in a real MP4.** Asking `MediaRecorder` for `audio/mp4` is
unreliable: Chrome quietly falls back to WebM/Opus, so you get a `.m4a` file
that is actually a `.webm` and some players reject it. Instead the app encodes
AAC explicitly through the WebCodecs `AudioEncoder` and writes the frames into
an MP4 container itself (`buildMp4` in `app.js` — `ftyp` + `moov` with a single
AAC track + `mdat`). `MediaRecorder` is used only as a fallback on browsers that
genuinely report MP4 support, and the resulting blob's MIME type is checked
before it is handed back. If neither path is available, the M4A option is
disabled with an explanation instead of producing a mislabelled file.

One known nuance: AAC encoders add a small priming delay (about 1024 samples,
~23 ms), and the app does not currently write an edit list to trim it, so an M4A
export can start a fraction of a beat later than the WAV of the same selection.

**Encoding yields to the UI.** MP3 and AAC encoding run in chunks with a
`setTimeout(0)` between batches so the page stays responsive and the progress
bar moves. For very long clips a Web Worker would be better still.

## Tests

```sh
npm test     # needs playwright installed: npm i -D playwright
```

The smoke test loads `index.html` in headless Chromium, feeds the app a
synthetic buffer, and checks that each exporter produces the format it claims —
RIFF/WAVE headers, MP3 frame sync, and a well-formed MP4 box tree with a
self-consistent `esds` descriptor and a `stco` offset that points at the `mdat`
payload. WAV and MP3 outputs are also decoded back to confirm the duration
survives the round trip.

Headless Chromium ships without proprietary codecs, so the end-to-end AAC encode
is reported as `SKIP` there; the container checks still run against the muxer's
output. Set `CHROMIUM_PATH` to use a specific Chromium binary.

## Browser support

| | Waveform / preview | WAV | MP3 | M4A |
|---|---|---|---|---|
| Chrome, Edge | yes | yes | yes | yes (WebCodecs AAC) |
| Safari 16.4+ | yes | yes | yes | yes |
| Firefox | yes | yes | yes | option disabled — no AAC encoder |

## Licence

App code is MIT. `vendor/lame.min.js` is [lamejs](https://github.com/zhuker/lamejs),
a JS port of [LAME](https://lame.sourceforge.net/), distributed under the LGPL —
see `vendor/LAME-LICENSE.txt`.
