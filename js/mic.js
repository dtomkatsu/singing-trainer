// mic.js — microphone capture tuned for iOS Safari.
//
// iOS rules honored here:
//  - AudioContext must be created/resumed inside a user gesture.
//  - Voice-call DSP (echo cancellation, noise suppression, AGC) mangles
//    singing analysis, so we request it off; iOS may still apply AGC, so
//    level-based metrics are presented as relative, never absolute.
//  - The context gets interrupted by calls/screen lock; we resume on
//    visibilitychange and on the next tap.
//  - PCM recording uses an AudioWorklet (iOS 14.5+) with a
//    ScriptProcessorNode fallback, collecting Float32 chunks so analysis
//    runs on exactly what was recorded — no lossy re-decode.

'use strict';

const Mic = (() => {
  let ctx = null, stream = null, source = null, analyser = null;
  let workletReady = false;
  let recNode = null, recChunks = null, recording = false;
  let liveBuf = null, needResume = false, lock = null;

  async function wakeLock() {
    try { lock = await navigator.wakeLock?.request('screen'); } catch (_) {}
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { resume(); if (!lock || lock.released) wakeLock(); }
  });
  // resume() outside a gesture can silently no-op on iOS — retry on any tap.
  document.addEventListener('pointerdown', () => { if (needResume) { needResume = false; resume(); } });

  const WORKLET_URL = (() => {
    // Inline worklet via Blob so everything ships as static files with no
    // extra request path issues under the site's service worker.
    const code = `
      class PcmTap extends AudioWorkletProcessor {
        constructor() { super(); this.on = false;
          this.port.onmessage = (e) => { this.on = e.data === 'start' ? true : e.data === 'stop' ? false : this.on; };
        }
        process(inputs) {
          const ch = inputs[0] && inputs[0][0];
          if (this.on && ch) this.port.postMessage(new Float32Array(ch));
          return true;
        }
      }
      registerProcessor('pcm-tap', PcmTap);`;
    return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  })();

  async function start() {
    if (ctx && stream && stream.getAudioTracks().some((t) => t.readyState === 'live')) {
      await resume(); return info();
    }
    // Grab the mic first, then create the context: once the mic engages,
    // iOS switches to its play-and-record route and a context created
    // beforehand can end up on a mismatched sample rate.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    stream.getAudioTracks().forEach((t) => { t.onended = () => { stream = null; }; });
    if (ctx) { try { await ctx.close(); } catch (_) {} }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    await resume();
    // iOS puts the context in a non-standard "interrupted" state after
    // calls / screen lock; resume() only works from a user gesture, so
    // also retry on the next tap anywhere.
    ctx.addEventListener('statechange', () => { if (ctx.state !== 'running') needResume = true; });
    await wakeLock();
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    liveBuf = new Float32Array(analyser.fftSize);

    if (ctx.audioWorklet) {
      try {
        await ctx.audioWorklet.addModule(WORKLET_URL);
        recNode = new AudioWorkletNode(ctx, 'pcm-tap');
        recNode.port.onmessage = (e) => { if (recording && recChunks) recChunks.push(e.data); };
        source.connect(recNode);
        // Worklet needs a destination path on some WebKit builds; keep silent.
        const mute = ctx.createGain(); mute.gain.value = 0;
        recNode.connect(mute).connect(ctx.destination);
        workletReady = true;
      } catch (_) { workletReady = false; }
    }
    if (!workletReady) {
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => {
        if (recording && recChunks) recChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      const mute = ctx.createGain(); mute.gain.value = 0;
      source.connect(sp); sp.connect(mute).connect(ctx.destination);
      recNode = sp;
    }
    return info();
  }

  async function resume() {
    if (ctx && ctx.state !== 'running') { try { await ctx.resume(); } catch (_) {} }
  }

  function info() {
    return { sampleRate: ctx ? ctx.sampleRate : 0, running: !!ctx && ctx.state === 'running' };
  }

  /** Latest time-domain frame + detected pitch. Call from rAF. */
  function livePitch() {
    if (!analyser) return null;
    analyser.getFloatTimeDomainData(liveBuf);
    return Pitch.detect(liveBuf, ctx.sampleRate);
  }

  /** Byte frequency data for the live spectrum view. */
  function liveSpectrum(arr) {
    if (!analyser) return 0;
    analyser.getByteFrequencyData(arr);
    return ctx.sampleRate / 2 / arr.length;              // Hz per bin
  }

  /**
   * Frequency data in real dB, for measurements rather than drawing.
   *
   * getByteFrequencyData rescales into 0–255 between the analyser's min/max
   * decibels, which is fine for a bar chart but destroys the units — you
   * cannot subtract two of those numbers and call the result dB. SPR is
   * defined as a difference of dB peaks, so the Ring trainer needs the float
   * form. The analyser's windowing and smoothing are constant offsets that
   * cancel in that subtraction.
   *
   * @param arr Float32Array of length binCount()
   * @returns Hz per bin, or 0 if the mic isn't up
   */
  function liveSpectrumDb(arr) {
    if (!analyser) return 0;
    analyser.getFloatFrequencyData(arr);
    return ctx.sampleRate / 2 / arr.length;
  }

  /** Bins in a live spectrum frame — allocate your array to this. */
  function binCount() { return analyser ? analyser.frequencyBinCount : 0; }

  function beginRecording() {
    recChunks = [];
    recording = true;
    if (workletReady) recNode.port.postMessage('start');
  }

  /** @returns {pcm: Float32Array, sampleRate} */
  function endRecording() {
    recording = false;
    if (workletReady) recNode.port.postMessage('stop');
    const chunks = recChunks || []; recChunks = null;
    let n = 0; for (const c of chunks) n += c.length;
    const pcm = new Float32Array(n);
    let off = 0; for (const c of chunks) { pcm.set(c, off); off += c.length; }
    return { pcm, sampleRate: ctx ? ctx.sampleRate : 48000 };
  }

  function isRecording() { return recording; }
  function context() { return ctx; }

  /** Play a Float32 buffer (e.g., a take) through the context. */
  function playPcm(pcm, sampleRate, onended) {
    if (!ctx || !pcm.length) return null;
    const buf = ctx.createBuffer(1, pcm.length, sampleRate);
    buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    if (onended) src.onended = onended;
    src.start();
    return src;
  }

  /**
   * Reference-tone player (triangle with soft attack/release).
   *
   * Level matters more than it looks. This ran at gain 0.25 (−16.8 dBFS RMS
   * measured) and was reported as barely audible; 0.9 renders at −5.7 dBFS,
   * +11 dB, without clipping (single oscillator, peak 0.896). The waveform
   * stays triangle on purpose — RESEARCH.md §3 rests on people matching pitch
   * better against harmonic-rich, voice-like tones than pure sines, so the fix
   * is loudness, not timbre.
   *
   * On iOS this can still sound quiet no matter what we do here: once
   * getUserMedia is live the OS moves to a play-and-record audio session,
   * which routes output to the earpiece rather than the speaker. That is a
   * platform decision, not a page one — navigator.audioSession is Safari-only
   * and experimental, and forcing 'playback' risks dropping mic capture. Wired
   * headphones sidestep it entirely, which the setup notes already advise.
   */
  const TONE_GAIN = 0.9;
  let toneOsc = null, toneGain = null;
  function toneOn(hz) {
    if (!ctx) return;
    toneOff();
    toneOsc = ctx.createOscillator();
    toneGain = ctx.createGain();
    toneOsc.type = 'triangle';                          // harmonics help matching
    toneOsc.frequency.value = hz;
    toneGain.gain.setValueAtTime(0, ctx.currentTime);
    toneGain.gain.linearRampToValueAtTime(TONE_GAIN, ctx.currentTime + 0.04);
    toneOsc.connect(toneGain).connect(ctx.destination);
    toneOsc.start();
  }
  function toneSet(hz) { if (toneOsc) toneOsc.frequency.setTargetAtTime(hz, ctx.currentTime, 0.02); }
  function toneOff() {
    if (!toneOsc) return;
    const o = toneOsc, g = toneGain;
    toneOsc = null; toneGain = null;
    try {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      o.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }

  return {
    start, resume, info, livePitch, liveSpectrum, liveSpectrumDb, binCount,
    beginRecording, endRecording, isRecording, playPcm, context,
    toneOn, toneSet, toneOff,
  };
})();
