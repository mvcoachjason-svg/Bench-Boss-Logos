/*
 * Audio Clipper — trim a section out of an audio file, entirely client-side.
 *
 * The file is decoded exactly once into an AudioBuffer that is kept in memory;
 * the waveform, the preview and every export read from that same buffer, so
 * nothing is ever re-decoded.
 */
(function () {
  'use strict';

  var PRESETS = [
    { label: '15s', seconds: 15 },
    { label: '45s', seconds: 45 },
    { label: '3m', seconds: 180 },
    { label: '5m', seconds: 300 }
  ];

  var DEFAULT_SELECTION = 45;   // seconds, clamped to the file length
  var MIN_SELECTION = 0.1;      // seconds
  var PEAK_RESOLUTION = 4000;   // buckets computed once per file

  // ---------------------------------------------------------------- state

  var state = {
    fileName: '',
    audioBuffer: null,   // decoded once, reused everywhere
    peaks: null,         // { min: Float32Array, max: Float32Array }
    selStart: 0,
    selEnd: 0,
    activePreset: null,
    audioCtx: null,
    source: null,        // currently playing AudioBufferSourceNode
    playAnchor: 0,       // audioCtx.currentTime when playback started
    playOffset: 0,       // selection offset playback started from
    rafId: 0,
    exporting: false
  };

  var el = {};

  // ---------------------------------------------------------------- helpers

  function $(id) { return document.getElementById(id); }

  function clamp(value, lo, hi) {
    return value < lo ? lo : (value > hi ? hi : value);
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var mins = Math.floor(seconds / 60);
    var secs = seconds - mins * 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs.toFixed(1);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function setStatus(message, kind) {
    el.status.textContent = message || '';
    el.status.className = 'status' + (kind ? ' is-' + kind : '');
  }

  function setProgress(fraction) {
    if (fraction === null) {
      el.progress.hidden = true;
      el.progressBar.style.width = '0';
      return;
    }
    el.progress.hidden = false;
    el.progressBar.style.width = (clamp(fraction, 0, 1) * 100).toFixed(1) + '%';
  }

  function getAudioContext() {
    if (!state.audioCtx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      state.audioCtx = new Ctor();
    }
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
    return state.audioCtx;
  }

  // Yield to the browser so long encodes don't lock the UI thread solid.
  function nextFrame() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  // ---------------------------------------------------------------- loading

  function handleFile(file) {
    if (!file) return;
    stopPlayback();
    setStatus('Decoding ' + file.name + '…');
    setProgress(null);

    var reader = new FileReader();
    reader.onerror = function () {
      setStatus('Could not read that file.', 'error');
    };
    reader.onload = function () {
      var ctx = getAudioContext();
      // decodeAudioData detaches the ArrayBuffer, so this is the only decode.
      ctx.decodeAudioData(
        reader.result,
        function (buffer) { onDecoded(file.name, buffer); },
        function () {
          setStatus('That file could not be decoded — the browser does not ' +
                    'support its format.', 'error');
        }
      );
    };
    reader.readAsArrayBuffer(file);
  }

  function onDecoded(fileName, buffer) {
    state.fileName = fileName;
    state.audioBuffer = buffer;
    state.peaks = computePeaks(buffer, PEAK_RESOLUTION);
    state.selStart = 0;
    state.selEnd = Math.min(DEFAULT_SELECTION, buffer.duration);
    state.activePreset = buffer.duration >= DEFAULT_SELECTION ? DEFAULT_SELECTION : null;

    el.dropzone.hidden = true;
    el.editor.hidden = false;
    el.selection.hidden = false;
    el.fileName.textContent = fileName;
    el.fileInfo.textContent = [
      formatTime(buffer.duration),
      buffer.numberOfChannels === 1 ? 'mono' : buffer.numberOfChannels + ' ch',
      Math.round(buffer.sampleRate / 1000 * 10) / 10 + ' kHz'
    ].join(' · ');

    resizeCanvas();
    renderAll();
    setStatus('Ready. Drag the selection box, or pick a preset length.');
  }

  /** Min/max envelope, computed once per file and reused on every redraw. */
  function computePeaks(buffer, buckets) {
    var length = buffer.length;
    var channels = buffer.numberOfChannels;
    var perBucket = Math.max(1, Math.floor(length / buckets));
    var count = Math.ceil(length / perBucket);
    var mins = new Float32Array(count);
    var maxs = new Float32Array(count);
    var data = [];
    for (var c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

    for (var b = 0; b < count; b++) {
      var from = b * perBucket;
      var to = Math.min(from + perBucket, length);
      var lo = 0;
      var hi = 0;
      for (var i = from; i < to; i++) {
        for (var ch = 0; ch < channels; ch++) {
          var v = data[ch][i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      mins[b] = lo;
      maxs[b] = hi;
    }
    return { min: mins, max: maxs };
  }

  // ---------------------------------------------------------------- drawing

  function resizeCanvas() {
    var rect = el.waveform.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    el.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    el.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function drawWaveform() {
    var ctx = el.canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var width = el.canvas.width;
    var height = el.canvas.height;
    ctx.clearRect(0, 0, width, height);
    if (!state.peaks) return;

    var styles = getComputedStyle(document.documentElement);
    var baseColor = styles.getPropertyValue('--wave').trim() || '#47536a';
    var selColor = styles.getPropertyValue('--wave-sel').trim() || '#7fc2ff';

    var peaks = state.peaks;
    var count = peaks.min.length;
    var mid = height / 2;
    var duration = state.audioBuffer.duration;
    var selFrom = (state.selStart / duration) * width;
    var selTo = (state.selEnd / duration) * width;
    var step = Math.max(1, Math.round(dpr)); // one column per device pixel

    for (var x = 0; x < width; x += step) {
      var from = Math.floor((x / width) * count);
      var to = Math.max(from + 1, Math.floor(((x + step) / width) * count));
      var lo = 0;
      var hi = 0;
      for (var i = from; i < to && i < count; i++) {
        if (peaks.min[i] < lo) lo = peaks.min[i];
        if (peaks.max[i] > hi) hi = peaks.max[i];
      }
      var top = mid - hi * mid * 0.94;
      var bottom = mid - lo * mid * 0.94;
      if (bottom - top < 1) bottom = top + 1;
      ctx.fillStyle = (x + step / 2 >= selFrom && x + step / 2 <= selTo) ? selColor : baseColor;
      ctx.fillRect(x, top, step, bottom - top);
    }
  }

  function renderSelection() {
    if (!state.audioBuffer) return;
    var duration = state.audioBuffer.duration;
    var left = (state.selStart / duration) * 100;
    var right = (state.selEnd / duration) * 100;
    el.selection.style.left = left + '%';
    el.selection.style.width = Math.max(0, right - left) + '%';
  }

  function renderReadout() {
    el.outStart.textContent = formatTime(state.selStart);
    el.outEnd.textContent = formatTime(state.selEnd);
    el.outLength.textContent = formatTime(state.selEnd - state.selStart);

    var length = state.selEnd - state.selStart;
    var duration = state.audioBuffer ? state.audioBuffer.duration : 0;
    Array.prototype.forEach.call(el.presets.children, function (btn) {
      var seconds = Number(btn.dataset.seconds);
      // A preset longer than the file still counts as active once it is clamped.
      var matches = Math.abs(length - Math.min(seconds, duration)) < 0.05;
      btn.classList.toggle('is-active', state.activePreset === seconds && matches);
    });
  }

  function renderRuler() {
    if (!state.audioBuffer) return;
    var duration = state.audioBuffer.duration;
    var ticks = el.waveform.clientWidth < 520 ? 3 : 5;
    var html = '';
    for (var i = 0; i <= ticks; i++) {
      var t = (duration * i) / ticks;
      html += '<span style="left:' + ((i / ticks) * 100) + '%">' + formatTime(t) + '</span>';
    }
    el.ruler.innerHTML = html;
  }

  function renderAll() {
    drawWaveform();
    renderSelection();
    renderReadout();
    renderRuler();
  }

  // ---------------------------------------------------------------- selection

  function setSelection(start, end, options) {
    var duration = state.audioBuffer.duration;
    var length = end - start;
    if (length < MIN_SELECTION) length = MIN_SELECTION;
    if (length > duration) length = duration;

    start = clamp(start, 0, duration - length);
    state.selStart = start;
    state.selEnd = clamp(start + length, start + MIN_SELECTION, duration);

    if (!options || !options.keepPreset) state.activePreset = null;
    drawWaveform();
    renderSelection();
    renderReadout();
  }

  function applyPreset(seconds) {
    var duration = state.audioBuffer.duration;
    var length = Math.min(seconds, duration);
    var start = clamp(state.selStart, 0, duration - length);
    state.activePreset = seconds;
    setSelection(start, start + length, { keepPreset: true });
    setStatus(length < seconds
      ? 'File is shorter than ' + seconds + 's — selected the whole thing.'
      : 'Selection set to ' + formatTime(length) + '. Drag it to move it.');
  }

  function timeFromClientX(clientX) {
    var rect = el.waveform.getBoundingClientRect();
    var ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return ratio * state.audioBuffer.duration;
  }

  function initSelectionDragging() {
    var drag = null;

    function onPointerDown(event) {
      if (!state.audioBuffer) return;
      var edge = event.target.dataset ? event.target.dataset.edge : null;
      var onSelection = event.target === el.selection || edge;

      if (edge) {
        drag = { mode: edge };
      } else if (onSelection) {
        drag = {
          mode: 'move',
          grabOffset: timeFromClientX(event.clientX) - state.selStart,
          length: state.selEnd - state.selStart
        };
        el.selection.classList.add('is-dragging');
      } else {
        // Click on empty waveform: start a fresh selection from that point.
        var t = timeFromClientX(event.clientX);
        drag = { mode: 'new', anchor: t };
        setSelection(t, t + MIN_SELECTION);
      }

      event.target.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    function onPointerMove(event) {
      if (!drag) return;
      var t = timeFromClientX(event.clientX);
      if (drag.mode === 'move') {
        setSelection(t - drag.grabOffset, t - drag.grabOffset + drag.length,
                     { keepPreset: true });
      } else if (drag.mode === 'start') {
        setSelection(Math.min(t, state.selEnd - MIN_SELECTION), state.selEnd);
      } else if (drag.mode === 'end') {
        setSelection(state.selStart, Math.max(t, state.selStart + MIN_SELECTION));
      } else if (drag.mode === 'new') {
        setSelection(Math.min(drag.anchor, t), Math.max(drag.anchor, t));
      }
    }

    function onPointerUp(event) {
      if (!drag) return;
      drag = null;
      el.selection.classList.remove('is-dragging');
      if (event.target.hasPointerCapture && event.target.hasPointerCapture(event.pointerId)) {
        event.target.releasePointerCapture(event.pointerId);
      }
    }

    el.waveform.addEventListener('pointerdown', onPointerDown);
    el.waveform.addEventListener('pointermove', onPointerMove);
    el.waveform.addEventListener('pointerup', onPointerUp);
    el.waveform.addEventListener('pointercancel', onPointerUp);

    // Keyboard nudging on the handles: arrows 0.1s, shift+arrows 1s.
    Array.prototype.forEach.call(el.selection.querySelectorAll('.handle'), function (handle) {
      handle.addEventListener('keydown', function (event) {
        var delta = event.key === 'ArrowLeft' ? -1 : (event.key === 'ArrowRight' ? 1 : 0);
        if (!delta) return;
        delta *= event.shiftKey ? 1 : 0.1;
        if (handle.dataset.edge === 'start') {
          setSelection(state.selStart + delta, state.selEnd);
        } else {
          setSelection(state.selStart, state.selEnd + delta);
        }
        event.preventDefault();
      });
    });
  }

  // ---------------------------------------------------------------- preview

  function stopPlayback() {
    if (state.source) {
      state.source.onended = null;
      try { state.source.stop(); } catch (e) { /* already stopped */ }
      state.source = null;
    }
    cancelAnimationFrame(state.rafId);
    el.playhead.hidden = true;
    el.play.textContent = 'Play selection';
    el.stop.disabled = true;
  }

  function playSelection() {
    if (!state.audioBuffer) return;
    stopPlayback();

    var ctx = getAudioContext();
    var duration = state.selEnd - state.selStart;
    var source = ctx.createBufferSource();
    source.buffer = state.audioBuffer;          // no re-decode: same buffer
    source.connect(ctx.destination);
    source.start(0, state.selStart, duration);
    source.onended = function () { stopPlayback(); };

    state.source = source;
    state.playAnchor = ctx.currentTime;
    state.playOffset = state.selStart;
    el.play.textContent = 'Stop';
    el.stop.disabled = false;
    el.playhead.hidden = false;
    tickPlayhead();
  }

  function tickPlayhead() {
    if (!state.source) return;
    var elapsed = state.audioCtx.currentTime - state.playAnchor;
    var position = state.playOffset + elapsed;
    var ratio = clamp(position / state.audioBuffer.duration, 0, 1);
    el.playhead.style.left = (ratio * 100) + '%';
    state.rafId = requestAnimationFrame(tickPlayhead);
  }

  // ---------------------------------------------------------------- slicing

  /** Copy the selected range out of the decoded buffer. No decoding involved. */
  function sliceSelection() {
    var buffer = state.audioBuffer;
    var rate = buffer.sampleRate;
    var from = Math.floor(state.selStart * rate);
    var to = Math.min(buffer.length, Math.ceil(state.selEnd * rate));
    var length = Math.max(1, to - from);
    var channels = [];
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      channels.push(buffer.getChannelData(c).subarray(from, from + length));
    }
    return { channels: channels, sampleRate: rate, length: length };
  }

  function toInt16(channels, length) {
    var out = [];
    for (var c = 0; c < channels.length; c++) {
      var src = channels[c];
      var dst = new Int16Array(length);
      for (var i = 0; i < length; i++) {
        var s = clamp(src[i], -1, 1);
        dst[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      out.push(dst);
    }
    return out;
  }

  // ---------------------------------------------------------------- WAV

  function encodeWav(clip) {
    var channels = toInt16(clip.channels, clip.length);
    var numChannels = channels.length;
    var dataBytes = clip.length * numChannels * 2;
    var buffer = new ArrayBuffer(44 + dataBytes);
    var view = new DataView(buffer);

    function writeString(offset, text) {
      for (var i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);              // PCM chunk size
    view.setUint16(20, 1, true);               // format: PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, clip.sampleRate, true);
    view.setUint32(28, clip.sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true);              // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataBytes, true);

    var offset = 44;
    for (var i = 0; i < clip.length; i++) {
      for (var c = 0; c < numChannels; c++) {
        view.setInt16(offset, channels[c][i], true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // ---------------------------------------------------------------- MP3

  async function encodeMp3(clip, bitrate, onProgress) {
    if (typeof lamejs === 'undefined') {
      throw new Error('MP3 encoder failed to load (vendor/lame.min.js).');
    }
    var channels = toInt16(clip.channels, clip.length);
    var numChannels = Math.min(2, channels.length);
    var encoder = new lamejs.Mp3Encoder(numChannels, clip.sampleRate, bitrate);
    var blockSize = 1152;
    var parts = [];
    var left = channels[0];
    var right = numChannels > 1 ? channels[1] : null;

    for (var i = 0; i < clip.length; i += blockSize) {
      var size = Math.min(blockSize, clip.length - i);
      var chunk = right
        ? encoder.encodeBuffer(left.subarray(i, i + size), right.subarray(i, i + size))
        : encoder.encodeBuffer(left.subarray(i, i + size));
      if (chunk.length > 0) parts.push(new Int8Array(chunk));
      if (i % (blockSize * 200) === 0) {
        onProgress(i / clip.length);
        await nextFrame();
      }
    }
    var tail = encoder.flush();
    if (tail.length > 0) parts.push(new Int8Array(tail));
    onProgress(1);
    return new Blob(parts, { type: 'audio/mpeg' });
  }

  // ---------------------------------------------------------------- M4A (AAC)

  /*
   * The old version handed the clip to MediaRecorder and asked for audio/mp4.
   * Chrome silently falls back to WebM/Opus there, so you got a .m4a file that
   * was really a .webm. The fix is to encode AAC explicitly with WebCodecs and
   * wrap the frames in a real MP4 container (buildMp4 below). Safari, which
   * lacks AAC in WebCodecs on older versions but records native MP4, falls back
   * to MediaRecorder — and only when it genuinely reports MP4 support. If
   * neither path is available the option is disabled up front rather than
   * producing a mislabelled file.
   */

  function aacSupport() {
    if (window.AudioEncoder && window.AudioData && window.EncodedAudioChunk) {
      return 'webcodecs';
    }
    if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2') ||
          MediaRecorder.isTypeSupported('audio/mp4')) {
        return 'mediarecorder';
      }
    }
    return null;
  }

  async function canEncodeAac(sampleRate, numberOfChannels, bitrate) {
    if (!window.AudioEncoder || !AudioEncoder.isConfigSupported) return false;
    try {
      var result = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        sampleRate: sampleRate,
        numberOfChannels: numberOfChannels,
        bitrate: bitrate
      });
      return !!(result && result.supported);
    } catch (e) {
      return false;
    }
  }

  async function encodeM4a(clip, bitrate, onProgress) {
    var numChannels = Math.min(2, clip.channels.length);
    var supported = await canEncodeAac(clip.sampleRate, numChannels, bitrate);
    if (supported) {
      return encodeAacWebCodecs(clip, numChannels, bitrate, onProgress);
    }
    if (aacSupport() === 'mediarecorder') {
      return encodeAacMediaRecorder(clip, onProgress);
    }
    throw new Error('This browser cannot encode AAC. Export as MP3 or WAV instead.');
  }

  function encodeAacWebCodecs(clip, numChannels, bitrate, onProgress) {
    return new Promise(function (resolve, reject) {
      var frames = [];
      var description = null;
      var frameSize = 1024;

      var encoder = new AudioEncoder({
        output: function (chunk, metadata) {
          if (metadata && metadata.decoderConfig && metadata.decoderConfig.description) {
            var d = metadata.decoderConfig.description;
            description = (d instanceof ArrayBuffer)
              ? new Uint8Array(d.slice(0))
              : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
          }
          var bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          frames.push(bytes);
        },
        error: function (err) { reject(err); }
      });

      encoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: clip.sampleRate,
        numberOfChannels: numChannels,
        bitrate: bitrate
      });

      // AudioData wants interleaved f32 when the format says so; planar keeps
      // the channel data exactly as the AudioBuffer stores it.
      var planar = new Float32Array(clip.length * numChannels);
      for (var c = 0; c < numChannels; c++) {
        planar.set(clip.channels[c].subarray(0, clip.length), c * clip.length);
      }

      var offset = 0;
      function pump() {
        var deadline = performance.now() + 12;
        while (offset < clip.length) {
          var size = Math.min(frameSize * 32, clip.length - offset);
          var slice = new Float32Array(size * numChannels);
          for (var ch = 0; ch < numChannels; ch++) {
            slice.set(planar.subarray(ch * clip.length + offset,
                                      ch * clip.length + offset + size), ch * size);
          }
          encoder.encode(new AudioData({
            format: 'f32-planar',
            sampleRate: clip.sampleRate,
            numberOfFrames: size,
            numberOfChannels: numChannels,
            timestamp: Math.round((offset / clip.sampleRate) * 1e6),
            data: slice
          }));
          offset += size;
          if (performance.now() > deadline) break;
        }
        onProgress(offset / clip.length);
        if (offset < clip.length) {
          setTimeout(pump, 0);
        } else {
          encoder.flush().then(function () {
            encoder.close();
            if (!frames.length) {
              reject(new Error('AAC encoder produced no output.'));
              return;
            }
            onProgress(1);
            resolve(new Blob(
              [buildMp4(frames, description, clip.sampleRate, numChannels, frameSize, bitrate)],
              { type: 'audio/mp4' }
            ));
          }).catch(reject);
        }
      }
      pump();
    });
  }

  /** Realtime fallback: only used where the browser really does record MP4. */
  function encodeAacMediaRecorder(clip, onProgress) {
    return new Promise(function (resolve, reject) {
      var ctx = getAudioContext();
      var buffer = ctx.createBuffer(clip.channels.length, clip.length, clip.sampleRate);
      for (var c = 0; c < clip.channels.length; c++) {
        buffer.copyToChannel(clip.channels[c].subarray(0, clip.length), c);
      }
      var destination = ctx.createMediaStreamDestination();
      var source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);

      var mimeType = MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')
        ? 'audio/mp4;codecs=mp4a.40.2'
        : 'audio/mp4';
      var recorder = new MediaRecorder(destination.stream, { mimeType: mimeType });
      var parts = [];
      var duration = clip.length / clip.sampleRate;
      var startedAt = performance.now();
      var timer = setInterval(function () {
        onProgress(clamp((performance.now() - startedAt) / 1000 / duration, 0, 0.99));
      }, 100);

      recorder.ondataavailable = function (event) {
        if (event.data && event.data.size) parts.push(event.data);
      };
      recorder.onerror = function (event) {
        clearInterval(timer);
        reject(event.error || new Error('Recording failed.'));
      };
      recorder.onstop = function () {
        clearInterval(timer);
        var blob = new Blob(parts, { type: 'audio/mp4' });
        // Belt and braces: refuse to hand back a WebM wearing an .m4a name.
        if (parts.length && parts[0].type && parts[0].type.indexOf('mp4') === -1) {
          reject(new Error('This browser recorded ' + parts[0].type +
                           ' instead of MP4. Export as MP3 or WAV instead.'));
          return;
        }
        onProgress(1);
        resolve(blob);
      };

      source.onended = function () { recorder.stop(); };
      recorder.start();
      source.start();
    });
  }

  // ---------------------------------------------------------------- MP4 muxer

  /*
   * Minimal audio-only MP4 writer: ftyp + moov (one AAC track) + mdat. Enough
   * for players and for AudioContext.decodeAudioData to read the result back.
   */
  function buildMp4(frames, asc, sampleRate, numChannels, frameSize, bitrate) {
    var totalSamples = frames.length * frameSize;

    function box(type, payloads) {
      var length = 8;
      var i;
      for (i = 0; i < payloads.length; i++) length += payloads[i].length;
      var out = new Uint8Array(length);
      var view = new DataView(out.buffer);
      view.setUint32(0, length);
      for (i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
      var offset = 8;
      for (i = 0; i < payloads.length; i++) {
        out.set(payloads[i], offset);
        offset += payloads[i].length;
      }
      return out;
    }

    function bytes(values) { return new Uint8Array(values); }

    function u32(value) {
      return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255,
                             (value >>> 8) & 255, value & 255]);
    }

    function u16(value) {
      return new Uint8Array([(value >>> 8) & 255, value & 255]);
    }

    function concat(list) {
      var length = 0;
      var i;
      for (i = 0; i < list.length; i++) length += list[i].length;
      var out = new Uint8Array(length);
      var offset = 0;
      for (i = 0; i < list.length; i++) {
        out.set(list[i], offset);
        offset += list[i].length;
      }
      return out;
    }

    var MATRIX = concat([
      u32(0x00010000), u32(0), u32(0),
      u32(0), u32(0x00010000), u32(0),
      u32(0), u32(0), u32(0x40000000)
    ]);

    // AudioSpecificConfig: the encoder normally supplies it; derive it if not.
    if (!asc || !asc.length) {
      var rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050,
                   16000, 12000, 11025, 8000, 7350];
      var rateIndex = rates.indexOf(sampleRate);
      if (rateIndex < 0) rateIndex = 4;
      asc = new Uint8Array([
        (2 << 3) | (rateIndex >> 1),
        ((rateIndex & 1) << 7) | (numChannels << 3)
      ]);
    }

    var esds = box('esds', [
      u32(0),                                                   // version + flags
      bytes([0x03, 23 + asc.length, 0x00, 0x01, 0x00]),         // ES_Descriptor
      bytes([0x04, 15 + asc.length, 0x40, 0x15]),               // DecoderConfig (AAC)
      bytes([0, 0, 0]),                                         // bufferSizeDB
      u32(bitrate), u32(bitrate),                               // max / avg bitrate
      bytes([0x05, asc.length]), asc,                           // DecoderSpecificInfo
      bytes([0x06, 0x01, 0x02])                                 // SLConfigDescriptor
    ]);

    var mp4a = box('mp4a', [
      bytes([0, 0, 0, 0, 0, 0]), u16(1),        // reserved + data_reference_index
      u32(0), u32(0),                           // version/revision/vendor
      u16(numChannels), u16(16),                // channel count, sample size
      u16(0), u16(0),                           // pre_defined, reserved
      u32(sampleRate << 16 >>> 0),              // 16.16 fixed-point sample rate
      esds
    ]);

    var stsz = box('stsz', [u32(0), u32(0), u32(frames.length)].concat(
      frames.map(function (frame) { return u32(frame.length); })
    ));

    function moovWith(chunkOffset) {
      var stbl = box('stbl', [
        box('stsd', [u32(0), u32(1), mp4a]),
        box('stts', [u32(0), u32(1), u32(frames.length), u32(frameSize)]),
        box('stsc', [u32(0), u32(1), u32(1), u32(frames.length), u32(1)]),
        stsz,
        box('stco', [u32(0), u32(1), u32(chunkOffset)])
      ]);

      var minf = box('minf', [
        box('smhd', [u32(0), u32(0)]),
        box('dinf', [box('dref', [u32(0), u32(1), box('url ', [u32(1)])])]),
        stbl
      ]);

      var mdia = box('mdia', [
        box('mdhd', [u32(0), u32(0), u32(0), u32(sampleRate), u32(totalSamples),
                     u16(0x55c4), u16(0)]),
        box('hdlr', [u32(0), u32(0), bytes([0x73, 0x6f, 0x75, 0x6e]),
                     u32(0), u32(0), u32(0),
                     bytes([0x53, 0x6f, 0x75, 0x6e, 0x64, 0x00])]),
        minf
      ]);

      var trak = box('trak', [
        box('tkhd', [
          bytes([0, 0, 0, 3]),                  // version 0, flags: enabled + in movie
          u32(0), u32(0), u32(1), u32(0),       // times, track_ID, reserved
          u32(Math.round((totalSamples / sampleRate) * 1000)),
          u32(0), u32(0),                       // reserved
          u16(0), u16(1),                       // layer, alternate_group
          u16(0x0100), u16(0),                  // volume, reserved
          MATRIX, u32(0), u32(0)                // matrix, width, height
        ]),
        mdia
      ]);

      return box('moov', [
        box('mvhd', [
          u32(0), u32(0), u32(0), u32(1000),
          u32(Math.round((totalSamples / sampleRate) * 1000)),
          u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0),
          MATRIX,
          u32(0), u32(0), u32(0), u32(0), u32(0), u32(0),  // pre_defined
          u32(2)                                           // next_track_ID
        ]),
        trak
      ]);
    }

    var ftyp = box('ftyp', [
      bytes([0x69, 0x73, 0x6f, 0x6d]), u32(0x200),
      bytes([0x69, 0x73, 0x6f, 0x6d]), bytes([0x69, 0x73, 0x6f, 0x32]),
      bytes([0x6d, 0x70, 0x34, 0x31])
    ]);

    // stco needs the absolute offset of the sample data, which depends on the
    // size of moov itself — so measure once, then rebuild with the real value.
    var moovSize = moovWith(0).length;
    var moov = moovWith(ftyp.length + moovSize + 8);
    var mdat = box('mdat', frames);

    return concat([ftyp, moov, mdat]);
  }

  // ---------------------------------------------------------------- export

  function baseName(name) {
    return (name || 'clip').replace(/\.[^.]+$/, '') || 'clip';
  }

  function download(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  async function exportClip() {
    if (!state.audioBuffer || state.exporting) return;
    var format = el.format.value;
    var bitrate = Number(el.bitrate.value) * 1000;

    state.exporting = true;
    el.export.disabled = true;
    setStatus('Encoding ' + format.toUpperCase() + '…');
    setProgress(0);

    try {
      var clip = sliceSelection();   // straight out of the cached AudioBuffer
      var blob;
      if (format === 'wav') {
        blob = encodeWav(clip);
        setProgress(1);
      } else if (format === 'mp3') {
        blob = await encodeMp3(clip, Number(el.bitrate.value), setProgress);
      } else {
        blob = await encodeM4a(clip, bitrate, setProgress);
      }

      var extension = format === 'wav' ? 'wav' : (format === 'mp3' ? 'mp3' : 'm4a');
      var name = baseName(state.fileName) + '-clip-' +
                 Math.round(state.selEnd - state.selStart) + 's.' + extension;
      download(blob, name);
      setStatus('Saved ' + name + ' (' + formatBytes(blob.size) + ').', 'success');
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error), 'error');
    } finally {
      state.exporting = false;
      el.export.disabled = false;
      setTimeout(function () { setProgress(null); }, 600);
    }
  }

  // ---------------------------------------------------------------- format UI

  async function refreshFormatNote() {
    var format = el.format.value;
    el.bitrateField.classList.toggle('is-hidden', format === 'wav');
    el.formatNote.classList.remove('is-warning');

    if (format === 'wav') {
      el.formatNote.textContent = 'Uncompressed 16-bit PCM. Largest file, no quality loss.';
      el.export.disabled = false;
      return;
    }
    if (format === 'mp3') {
      el.formatNote.textContent = 'Encoded locally with LAME. Works in every browser.';
      el.export.disabled = false;
      return;
    }

    var rate = state.audioBuffer ? state.audioBuffer.sampleRate : 44100;
    var channels = state.audioBuffer ? Math.min(2, state.audioBuffer.numberOfChannels) : 2;
    var webcodecs = await canEncodeAac(rate, channels, Number(el.bitrate.value) * 1000);

    if (webcodecs) {
      el.formatNote.textContent = 'Real AAC in an MP4 container, via WebCodecs.';
      el.export.disabled = false;
    } else if (aacSupport() === 'mediarecorder') {
      el.formatNote.textContent = 'AAC via MediaRecorder — encodes in real time, ' +
                                  'so a long clip takes as long as it plays.';
      el.export.disabled = false;
    } else {
      el.formatNote.textContent = 'This browser cannot encode AAC. Choose MP3 or WAV.';
      el.formatNote.classList.add('is-warning');
      el.export.disabled = true;
    }
  }

  // ---------------------------------------------------------------- init

  function buildPresets() {
    PRESETS.forEach(function (preset) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-preset';
      button.textContent = preset.label;
      button.dataset.seconds = String(preset.seconds);
      button.addEventListener('click', function () { applyPreset(preset.seconds); });
      el.presets.appendChild(button);
    });
  }

  function initDropzone() {
    el.dropzone.addEventListener('click', function () { el.fileInput.click(); });
    el.dropzone.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.fileInput.click();
      }
    });
    el.fileInput.addEventListener('change', function () {
      handleFile(el.fileInput.files[0]);
      el.fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (type) {
      el.dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        el.dropzone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      el.dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        el.dropzone.classList.remove('is-dragging');
      });
    });
    el.dropzone.addEventListener('drop', function (event) {
      var files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length) handleFile(files[0]);
    });
  }

  function init() {
    el = {
      dropzone: $('dropzone'),
      fileInput: $('file-input'),
      editor: $('editor'),
      fileName: $('file-name'),
      fileInfo: $('file-info'),
      changeFile: $('change-file'),
      waveform: $('waveform'),
      canvas: $('wave-canvas'),
      selection: $('selection'),
      playhead: $('playhead'),
      ruler: $('ruler'),
      outStart: $('out-start'),
      outEnd: $('out-end'),
      outLength: $('out-length'),
      presets: $('presets'),
      play: $('play'),
      stop: $('stop'),
      format: $('format'),
      bitrate: $('bitrate'),
      bitrateField: $('bitrate-field'),
      export: $('export'),
      formatNote: $('format-note'),
      status: $('status'),
      progress: $('progress'),
      progressBar: $('progress-bar')
    };

    buildPresets();
    initDropzone();
    initSelectionDragging();

    el.changeFile.addEventListener('click', function () { el.fileInput.click(); });
    el.play.addEventListener('click', function () {
      if (state.source) stopPlayback(); else playSelection();
    });
    el.stop.addEventListener('click', stopPlayback);
    el.export.addEventListener('click', exportClip);
    el.format.addEventListener('change', refreshFormatNote);
    el.bitrate.addEventListener('change', refreshFormatNote);

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!state.audioBuffer) return;
        resizeCanvas();
        renderAll();
      }, 80);
    });

    refreshFormatNote();

    // Exposed so the smoke test in test/ can drive the app without a real file.
    window.AudioClipper = {
      state: state,
      loadBuffer: onDecoded,
      setSelection: setSelection,
      sliceSelection: sliceSelection,
      encodeWav: encodeWav,
      encodeMp3: encodeMp3,
      encodeM4a: encodeM4a,
      buildMp4: buildMp4,
      canEncodeAac: canEncodeAac
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
