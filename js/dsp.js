// dsp.js — self-contained signal processing for the singing trainer.
// No dependencies, no build step. Everything operates on Float32Array PCM.
//
// Contents:
//   Pitch     — McLeod Pitch Method (NSDF + parabolic interpolation)
//   Fft       — radix-2 real FFT for offline spectral analysis
//   Notes     — Hz <-> MIDI <-> note-name <-> cents helpers
//   Track     — turn a recording into an f0/clarity/rms track
//   Metrics   — jitter, shimmer, HNR, vibrato, resonance ratios, stability
//   Dtw       — pitch-contour alignment for voice comparison
//   Wav       — Float32 -> 16-bit WAV encode (for saving/playback)

'use strict';

/* ------------------------------------------------------------------ *
 * Pitch: McLeod Pitch Method.
 * Chosen over plain autocorrelation for far fewer octave errors on
 * voice, and over YIN for a cleaner "clarity" (voicing) measure.
 * Window 2048 @ 48 kHz reaches ~70 Hz; we allow 60–1200 Hz.
 * ------------------------------------------------------------------ */
const Pitch = (() => {
  const FMIN = 60, FMAX = 1200;

  // Normalized Square Difference Function via time-domain autocorrelation.
  // O(n*maxLag) — fine for n=2048 at analysis frame rates, even on a phone.
  function nsdf(buf, sampleRate, out) {
    const n = buf.length;
    const maxLag = Math.min(n - 1, Math.floor(sampleRate / FMIN));
    for (let lag = 0; lag < maxLag; lag++) {
      let acf = 0, m = 0;
      for (let i = 0; i < n - lag; i++) {
        acf += buf[i] * buf[i + lag];
        m += buf[i] * buf[i] + buf[i + lag] * buf[i + lag];
      }
      out[lag] = m > 0 ? (2 * acf) / m : 0;
    }
    return maxLag;
  }

  function parabolic(arr, i) {
    const a = arr[i - 1], b = arr[i], c = arr[i + 1];
    const den = a - 2 * b + c;
    if (den === 0) return { x: i, y: b };
    const dx = 0.5 * (a - c) / den;
    return { x: i + dx, y: b - 0.25 * (a - c) * dx };
  }

  const scratch = new Float32Array(4096);

  /**
   * Detect pitch in a mono frame.
   * @returns {f0, clarity, rms} — f0 = -1 when unvoiced/silent.
   */
  function detect(buf, sampleRate) {
    const n = buf.length;
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    if (rms < 0.005) return { f0: -1, clarity: 0, rms };

    const maxLag = nsdf(buf, sampleRate, scratch);
    const minLag = Math.max(2, Math.floor(sampleRate / FMAX));

    // Collect all local maxima after the first negative-going zero crossing.
    let i = minLag;
    while (i < maxLag && scratch[i] > 0) i++;         // skip the lag-0 lobe
    const peaks = [];
    let best = 0;
    while (i < maxLag - 1) {
      if (scratch[i] > scratch[i - 1] && scratch[i] >= scratch[i + 1]) {
        peaks.push(i);
        if (scratch[i] > best) best = scratch[i];
      }
      i++;
    }
    if (!peaks.length || best < 0.3) return { f0: -1, clarity: best, rms };

    // First peak above k*highest — the MPM rule that kills octave errors.
    const thresh = 0.9 * best;
    let chosen = peaks[0];
    for (const p of peaks) { if (scratch[p] >= thresh) { chosen = p; break; } }

    const { x, y } = parabolic(scratch, chosen);
    const f0 = sampleRate / x;
    if (f0 < FMIN || f0 > FMAX) return { f0: -1, clarity: y, rms };
    return { f0, clarity: Math.min(1, y), rms };
  }

  return { detect, FMIN, FMAX };
})();

/* ------------------------------------------------------------------ *
 * Fft: iterative radix-2, real input. Returns magnitude spectrum.
 * Used for offline analysis of recordings (AnalyserNode covers live).
 * ------------------------------------------------------------------ */
const Fft = (() => {
  const cache = {};
  function tables(n) {
    if (cache[n]) return cache[n];
    const rev = new Uint32Array(n);
    let bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos(-2 * Math.PI * i / n);
      sin[i] = Math.sin(-2 * Math.PI * i / n);
    }
    return (cache[n] = { rev, cos, sin });
  }

  function hann(n) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    return w;
  }

  /** Magnitude spectrum of a windowed real frame (length must be power of 2). */
  function magnitude(frame) {
    const n = frame.length;
    const { rev, cos, sin } = tables(n);
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 0; i < n; i++) re[rev[i]] = frame[i];
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const l = i + j, r = i + j + half;
          const tre = re[r] * cos[k] - im[r] * sin[k];
          const tim = re[r] * sin[k] + im[r] * cos[k];
          re[r] = re[l] - tre; im[r] = im[l] - tim;
          re[l] += tre; im[l] += tim;
        }
      }
    }
    const mag = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]) / n;
    return mag;
  }

  return { magnitude, hann };
})();

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */
const Notes = (() => {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const centsBetween = (hz, refHz) => 1200 * Math.log2(hz / refHz);
  function name(midi) {
    const m = Math.round(midi);
    return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }
  /** Nearest note + signed cents error for a frequency. */
  function nearest(hz) {
    const midi = hzToMidi(hz);
    const m = Math.round(midi);
    return { midi: m, name: name(m), cents: (midi - m) * 100 };
  }
  return { hzToMidi, midiToHz, centsBetween, name, nearest, NAMES };
})();

/* ------------------------------------------------------------------ *
 * Track: offline f0/clarity/rms track over a whole recording.
 * ------------------------------------------------------------------ */
const Track = (() => {
  /**
   * @param {Float32Array} pcm  mono samples
   * @param {number} sampleRate
   * @param {object} [opts] window (2048), hop (512)
   * @returns {times, f0, cents (vs A440 midi grid, NaN unvoiced), clarity, rms, hopSec}
   */
  function analyze(pcm, sampleRate, opts = {}) {
    const win = opts.window || 2048;
    const hop = opts.hop || 512;
    const nFrames = Math.max(0, Math.floor((pcm.length - win) / hop) + 1);
    const times = new Float32Array(nFrames);
    const f0 = new Float32Array(nFrames);
    const clarity = new Float32Array(nFrames);
    const rms = new Float32Array(nFrames);
    const frame = new Float32Array(win);
    for (let k = 0; k < nFrames; k++) {
      frame.set(pcm.subarray(k * hop, k * hop + win));
      const r = Pitch.detect(frame, sampleRate);
      times[k] = (k * hop + win / 2) / sampleRate;
      f0[k] = r.f0; clarity[k] = r.clarity; rms[k] = r.rms;
    }
    // Median-of-5 filter on voiced runs to kill single-frame octave blips.
    const f0s = medianSmooth(f0, 5);
    const cents = new Float32Array(nFrames);
    for (let k = 0; k < nFrames; k++) {
      cents[k] = f0s[k] > 0 ? 100 * (Notes.hzToMidi(f0s[k])) : NaN;
    }
    return { times, f0: f0s, cents, clarity, rms, hopSec: hop / sampleRate };
  }

  function medianSmooth(arr, k) {
    const half = k >> 1, out = new Float32Array(arr.length), buf = [];
    for (let i = 0; i < arr.length; i++) {
      buf.length = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
        if (arr[j] > 0) buf.push(arr[j]);
      }
      if (arr[i] <= 0 || !buf.length) { out[i] = arr[i]; continue; }
      buf.sort((a, b) => a - b);
      out[i] = buf[buf.length >> 1];
    }
    return out;
  }

  return { analyze, medianSmooth };
})();

/* ------------------------------------------------------------------ *
 * Metrics: everything the Voice Report needs, from pcm + track.
 * Threshold rationale lives in singing/RESEARCH.md.
 * ------------------------------------------------------------------ */
const Metrics = (() => {

  /** Longest contiguous voiced run (frame indices [start, end)). */
  function longestVoicedRun(track, minClarity = 0.6) {
    let best = [0, 0], cur = -1;
    for (let i = 0; i <= track.f0.length; i++) {
      const v = i < track.f0.length && track.f0[i] > 0 && track.clarity[i] >= minClarity;
      if (v && cur < 0) cur = i;
      if (!v && cur >= 0) {
        if (i - cur > best[1] - best[0]) best = [cur, i];
        cur = -1;
      }
    }
    return best;
  }

  /**
   * Pitch stability on a sustained note, vibrato-aware:
   * slow drift = deviation of the 250 ms moving average from its own mean;
   * the vibrato band is measured separately, not punished.
   */
  function stability(track, start, end) {
    const cents = track.cents.subarray(start, end);
    const n = cents.length;
    if (n < 8) return null;
    const smWin = Math.max(1, Math.round(0.25 / track.hopSec));
    const slow = movingAvg(cents, smWin);
    const mean = avg(slow);
    let drift = 0;
    for (let i = 0; i < n; i++) drift += (slow[i] - mean) ** 2;
    drift = Math.sqrt(drift / n);                       // cents SD of slow component
    return { meanCents: mean, driftCentsSD: drift, meanHz: Notes.midiToHz(mean / 100) };
  }

  /** Cycle-to-cycle f0 perturbation approximation from the frame track (%). */
  function jitterLike(track, start, end) {
    let sum = 0, cnt = 0;
    for (let i = start + 1; i < end; i++) {
      const a = track.f0[i - 1], b = track.f0[i];
      if (a > 0 && b > 0) { sum += Math.abs(b - a) / ((a + b) / 2); cnt++; }
    }
    return cnt ? (100 * sum) / cnt : null;
  }

  /** Frame-to-frame amplitude perturbation (%), shimmer-like. */
  function shimmerLike(track, start, end) {
    let sum = 0, cnt = 0;
    for (let i = start + 1; i < end; i++) {
      const a = track.rms[i - 1], b = track.rms[i];
      if (a > 1e-6 && b > 1e-6) { sum += Math.abs(b - a) / ((a + b) / 2); cnt++; }
    }
    return cnt ? (100 * sum) / cnt : null;
  }

  /**
   * HNR estimate (dB) from NSDF clarity: r ≈ normalized ACF peak at the
   * pitch period, HNR ≈ 10·log10(r / (1−r)) (Boersma 1993's relation).
   * Clamped to [0, 40] — frame-based, so treat as an estimate, not Praat.
   */
  function hnr(track, start, end) {
    const vals = [];
    for (let i = start; i < end; i++) {
      const r = Math.min(0.9999, Math.max(1e-4, track.clarity[i]));
      if (track.f0[i] > 0) vals.push(10 * Math.log10(r / (1 - r)));
    }
    if (!vals.length) return null;
    return Math.max(0, Math.min(40, avg(vals)));
  }

  /**
   * Vibrato from the cents contour: detrend with 250 ms moving average,
   * autocorrelate the residual, look for a peak in the 3–9 Hz band.
   * Returns rate (Hz), extent (± cents), and regularity (0–1).
   */
  function vibrato(track, start, end) {
    const cents = track.cents.subarray(start, end);
    const n = cents.length, dt = track.hopSec;
    if (n * dt < 1.0) return null;                       // need ≥1 s
    const smWin = Math.max(1, Math.round(0.25 / dt));
    const slow = movingAvg(cents, smWin);
    const resid = new Float32Array(n);
    for (let i = 0; i < n; i++) resid[i] = cents[i] - slow[i];

    const minLag = Math.max(2, Math.round(1 / (9 * dt)));
    const maxLag = Math.min(n - 2, Math.round(1 / (3 * dt)));
    if (maxLag <= minLag) return null;
    let e0 = 0;
    for (let i = 0; i < n; i++) e0 += resid[i] * resid[i];
    if (e0 < 1e-6) return null;
    let bestLag = -1, bestR = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < n - lag; i++) r += resid[i] * resid[i + lag];
      r /= e0;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    const extent = rmsOf(resid) * Math.SQRT2;          // sine RMS -> amplitude
    // "Present" needs both a periodic 3-9 Hz component and a perceptible
    // extent (±15¢ is the detectability floor used in the literature).
    if (bestLag < 0 || bestR < 0.25 || extent < 15) {
      return { present: false, rateHz: 0, extentCents: extent, regularity: bestR };
    }
    return { present: true, rateHz: 1 / (bestLag * dt), extentCents: extent, regularity: bestR };
  }

  /**
   * Resonance measures from averaged spectrum over voiced frames:
   *  - SPR (singing power ratio, Omori 1996): peak dB in 2–4 kHz minus
   *    peak dB in 0–2 kHz. Closer to 0 = more ring; very negative = dull.
   *  - ER3k: energy 2.4–3.4 kHz (singer's-formant region) as dB vs total.
   *  - tilt: dB/octave regression over 0.3–5 kHz band energies.
   */
  function resonance(pcm, sampleRate, track, start, end) {
    const win = 2048, hopFrames = Math.max(1, Math.floor((end - start) / 40));
    const hann = Fft.hann(win);
    const acc = new Float64Array(win / 2);
    let used = 0;
    const hop = Math.round(track.hopSec * sampleRate);
    for (let k = start; k < end; k += hopFrames) {
      if (track.f0[k] <= 0) continue;
      const off = k * hop;
      if (off + win > pcm.length) break;
      const frame = new Float32Array(win);
      for (let i = 0; i < win; i++) frame[i] = pcm[off + i] * hann[i];
      const mag = Fft.magnitude(frame);
      for (let i = 0; i < mag.length; i++) acc[i] += mag[i] * mag[i];
      used++;
    }
    if (!used) return null;
    const binHz = sampleRate / win;
    const db = new Float32Array(acc.length);
    for (let i = 0; i < acc.length; i++) db[i] = 10 * Math.log10(acc[i] / used + 1e-20);

    const peakIn = (lo, hi) => {
      let p = -Infinity;
      for (let i = Math.ceil(lo / binHz); i <= Math.min(db.length - 1, Math.floor(hi / binHz)); i++) {
        if (db[i] > p) p = db[i];
      }
      return p;
    };
    const energyIn = (lo, hi) => {
      let e = 0;
      for (let i = Math.ceil(lo / binHz); i <= Math.min(acc.length - 1, Math.floor(hi / binHz)); i++) e += acc[i] / used;
      return e;
    };

    const spr = peakIn(2000, 4000) - peakIn(50, 2000);
    const er3k = 10 * Math.log10((energyIn(2400, 3400) + 1e-20) / (energyIn(50, 5000) + 1e-20));

    // Spectral tilt: octave-band energies 300..4800, linear fit dB vs octave#.
    const bands = [];
    for (let f = 300; f < 4800; f *= 2) bands.push(10 * Math.log10(energyIn(f, f * 2) + 1e-20));
    let tilt = 0;
    if (bands.length >= 2) {
      const xs = bands.map((_, i) => i), mx = avg(xs), my = avg(bands);
      let num = 0, den = 0;
      for (let i = 0; i < bands.length; i++) { num += (xs[i] - mx) * (bands[i] - my); den += (xs[i] - mx) ** 2; }
      tilt = num / den;                                  // dB per octave
    }
    return { sprDb: spr, er3kDb: er3k, tiltDbOct: tilt, spectrumDb: db, binHz };
  }

  const avg = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
  const rmsOf = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length); };
  function movingAvg(arr, w) {
    const out = new Float32Array(arr.length);
    let sum = 0, q = [];
    for (let i = 0; i < arr.length; i++) {
      const v = isNaN(arr[i]) ? (q.length ? sum / q.length : 0) : arr[i];
      q.push(v); sum += v;
      if (q.length > w) sum -= q.shift();
      out[i] = sum / q.length;
    }
    // centre it (cheap symmetric second pass, reversed)
    let sum2 = 0; const q2 = [];
    for (let i = arr.length - 1; i >= 0; i--) {
      q2.push(out[i]); sum2 += out[i];
      if (q2.length > w) sum2 -= q2.shift();
      out[i] = sum2 / q2.length;
    }
    return out;
  }

  return { longestVoicedRun, stability, jitterLike, shimmerLike, hnr, vibrato, resonance };
})();

/* ------------------------------------------------------------------ *
 * Dtw: align two cents contours (NaN = unvoiced) and score similarity.
 * Octave-tolerant option folds both contours into one octave first.
 * ------------------------------------------------------------------ */
const Dtw = (() => {
  /**
   * @param {Float32Array} a cents contour (reference)
   * @param {Float32Array} b cents contour (attempt)
   * @returns {path: [ [ia,ib], ... ], meanAbsCents, withinPct}
   */
  function align(a, b, opts = {}) {
    const octave = !!opts.octaveInvariant;
    const A = prep(a, octave), B = prep(b, octave);
    // Key-shift tolerance: allow a global transposition between the two
    // takes (people sing in a comfortable key). Estimate via median diff.
    let shift = 0;
    if (opts.allowTranspose !== false) {
      const diffs = [];
      const n = Math.min(A.length, B.length);
      for (let i = 0; i < n; i++) {
        const ai = A[Math.floor(i * A.length / n)], bi = B[Math.floor(i * B.length / n)];
        if (!isNaN(ai) && !isNaN(bi)) diffs.push(ai - bi);
      }
      if (diffs.length) {
        diffs.sort((x, y) => x - y);
        shift = diffs[diffs.length >> 1];
        if (opts.snapSemitone !== false) shift = Math.round(shift / 100) * 100;
      }
    }

    const n = A.length, m = B.length;
    const GAP = 150;                                    // cost of matching voiced<->unvoiced
    const cost = (i, j) => {
      const x = A[i], y = isNaN(B[j]) ? NaN : B[j] + shift;
      if (isNaN(x) && isNaN(y)) return 0;
      if (isNaN(x) || isNaN(y)) return GAP;
      let d = Math.abs(x - y);
      if (octave) d = Math.min(d, Math.abs(d - 1200), Math.abs(1200 - d));
      return Math.min(d, 600);                          // cap gross errors
    };

    // Full DP with Sakoe-Chiba band (20% of length) to bound memory/time.
    const band = Math.max(20, Math.round(0.2 * Math.max(n, m)));
    const INF = 1e15;
    const D = new Float64Array((n + 1) * (m + 1)).fill(INF);
    const at = (i, j) => i * (m + 1) + j;
    D[0] = 0;
    for (let i = 1; i <= n; i++) {
      const jc = Math.round(i * m / n);
      const j0 = Math.max(1, jc - band), j1 = Math.min(m, jc + band);
      for (let j = j0; j <= j1; j++) {
        const c = cost(i - 1, j - 1);
        D[at(i, j)] = c + Math.min(D[at(i - 1, j - 1)], D[at(i - 1, j)], D[at(i, j - 1)]);
      }
    }
    // Backtrack.
    const path = [];
    let i = n, j = m;
    if (D[at(n, m)] >= INF) return { path: [], meanAbsCents: null, withinPct: null, shift };
    while (i > 0 && j > 0) {
      path.push([i - 1, j - 1]);
      const d = D[at(i - 1, j - 1)], u = D[at(i - 1, j)], l = D[at(i, j - 1)];
      if (d <= u && d <= l) { i--; j--; } else if (u <= l) i--; else j--;
    }
    path.reverse();

    // Score over voiced-voiced pairs only.
    let sum = 0, cnt = 0, within = 0;
    for (const [pi, pj] of path) {
      const x = A[pi], yRaw = B[pj];
      if (isNaN(x) || isNaN(yRaw)) continue;
      let d = Math.abs(x - (yRaw + shift));
      if (octave) d = Math.min(d, Math.abs(d - 1200));
      sum += Math.min(d, 600); cnt++;
      if (d <= 50) within++;
    }
    return {
      path,
      shift,
      meanAbsCents: cnt ? sum / cnt : null,
      withinPct: cnt ? (100 * within) / cnt : null,
      voicedPairs: cnt,
    };
  }

  function prep(arr, octave) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = isNaN(arr[i]) ? NaN : (octave ? ((arr[i] % 1200) + 1200) % 1200 : arr[i]);
    }
    return out;
  }

  return { align };
})();

/* ------------------------------------------------------------------ *
 * Wav
 * ------------------------------------------------------------------ */
const Wav = (() => {
  /** Encode mono Float32 PCM to a 16-bit WAV Blob. */
  function encode(pcm, sampleRate) {
    const len = pcm.length;
    const buf = new ArrayBuffer(44 + len * 2);
    const v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); ws(8, 'WAVE');
    ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, len * 2, true);
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }
  return { encode };
})();

// Expose for both classic <script> use and the Node test runner.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Pitch, Fft, Notes, Track, Metrics, Dtw, Wav };
}
