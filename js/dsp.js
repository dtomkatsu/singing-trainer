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

  // Normalized Square Difference Function. Autocorrelation runs through the
  // FFT (O(n log n) vs O(n·maxLag) naive) — this is what makes offline
  // analysis of a 30 s take tolerable on a phone. The m'(lag) normalizer
  // comes from prefix sums of x².
  function nsdf(buf, sampleRate, out) {
    const n = buf.length;
    const maxLag = Math.min(n - 1, Math.floor(sampleRate / FMIN));
    const r = Fft.acf(buf);
    // prefix sums of squares: sq[k] = sum_{i<k} buf[i]^2
    let total = 0;
    const sq = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { total += buf[i] * buf[i]; sq[i + 1] = total; }
    for (let lag = 0; lag < maxLag; lag++) {
      // m'(lag) = sum_{i=0}^{n-lag-1} x[i]^2 + x[i+lag]^2
      const m = (sq[n - lag] - sq[0]) + (sq[n] - sq[lag]);
      out[lag] = m > 1e-12 ? (2 * r[lag]) / m : 0;
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

  /** Local maxima of the NSDF (lag indices), plus the tallest value found. */
  function peaksOf(minLag, maxLag) {
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
    return { peaks, best };
  }

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
    const { peaks, best } = peaksOf(minLag, maxLag);
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

  /**
   * Same NSDF pass as detect(), but returns up to `maxCand` peaks instead of
   * committing to one. This is the information MPM's "first peak above
   * 0.9·max" rule throws away, and it is what resolves octave ambiguity once
   * a decoder can look across frames — see Track.viterbi.
   *
   * Candidates are kept in **ascending lag order** (highest f0 first), not
   * ranked by clarity. That ordering is MPM's octave rule, preserved rather
   * than discarded, and it is load-bearing: the NSDF of a periodic signal
   * peaks at every multiple of the period, so at 784 Hz there are ~13
   * sub-harmonic peaks inside the 60 Hz search floor, all sitting at clarity
   * ≈1.0 on a clean tone. Sorting those by clarity hands the choice to
   * floating-point noise — measured, that read 784 Hz as 87 Hz (f0/9) and
   * 392 Hz as 196 Hz. Taking the shortest plausible lags instead puts the
   * true f0 first and leaves the decoder to choose among real alternatives.
   *
   * @returns {cands: [{f0, clarity}] in ascending-lag order, rms}
   */
  function candidates(buf, sampleRate, maxCand = 5) {
    const n = buf.length;
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    if (rms < 0.005) return { cands: [], rms };

    const maxLag = nsdf(buf, sampleRate, scratch);
    const minLag = Math.max(2, Math.floor(sampleRate / FMAX));
    const { peaks, best } = peaksOf(minLag, maxLag);
    if (!peaks.length || best < 0.3) return { cands: [], rms };  // matches detect()

    // Generous inclusion floor: anything plausibly the period. The decoder,
    // not this filter, is meant to make the final call.
    const floor = 0.7 * best;
    const cands = [];
    for (const p of peaks) {                     // peaksOf yields ascending lag
      if (scratch[p] < floor) continue;
      const { x, y } = parabolic(scratch, p);
      const f0 = sampleRate / x;
      if (f0 < FMIN || f0 > FMAX) continue;
      cands.push({ f0, clarity: Math.min(1, Math.max(0, y)) });
      if (cands.length >= maxCand) break;
    }
    return { cands, rms };
  }

  return { detect, candidates, FMIN, FMAX };
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

  /** In-place complex FFT (n = power of 2). invert=true for inverse (unscaled). */
  function transform(re, im, invert) {
    const n = re.length;
    const { rev, cos, sin } = tables(n);
    for (let i = 0; i < n; i++) {
      const r = rev[i];
      if (r > i) {
        let t = re[i]; re[i] = re[r]; re[r] = t;
        t = im[i]; im[i] = im[r]; im[r] = t;
      }
    }
    const sgn = invert ? -1 : 1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const l = i + j, r = i + j + half;
          const c = cos[k], s = sgn * sin[k];
          const tre = re[r] * c - im[r] * s;
          const tim = re[r] * s + im[r] * c;
          re[r] = re[l] - tre; im[r] = im[l] - tim;
          re[l] += tre; im[l] += tim;
        }
      }
    }
  }

  /** Magnitude spectrum of a windowed real frame (length must be power of 2). */
  function magnitude(frame) {
    const n = frame.length;
    const re = Float32Array.from(frame), im = new Float32Array(n);
    transform(re, im, false);
    const mag = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]) / n;
    return mag;
  }

  /** Autocorrelation of a real frame via FFT (returns lags 0..n-1). */
  const acfScratch = {};
  function acf(frame) {
    const n = frame.length;
    let N = 1; while (N < 2 * n) N <<= 1;
    const s = acfScratch[N] || (acfScratch[N] = { re: new Float32Array(N), im: new Float32Array(N) });
    const { re, im } = s;
    re.fill(0); im.fill(0);
    re.set(frame);
    transform(re, im, false);
    for (let i = 0; i < N; i++) {
      re[i] = re[i] * re[i] + im[i] * im[i];
      im[i] = 0;
    }
    transform(re, im, true);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = re[i] / N;
    return out;
  }

  return { magnitude, hann, transform, acf };
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
   * @param {object} [opts] window (2048), hop (512), viterbi (true)
   * @returns {times, f0, cents (vs A440 midi grid, NaN unvoiced), clarity, rms, hopSec}
   */
  function analyze(pcm, sampleRate, opts = {}) {
    const win = opts.window || 2048;
    const hop = opts.hop || 512;
    const useViterbi = opts.viterbi !== false;
    const nFrames = Math.max(0, Math.floor((pcm.length - win) / hop) + 1);
    const times = new Float32Array(nFrames);
    const rms = new Float32Array(nFrames);
    const frame = new Float32Array(win);

    let f0, clarity;
    if (useViterbi) {
      const lattice = new Array(nFrames);
      for (let k = 0; k < nFrames; k++) {
        frame.set(pcm.subarray(k * hop, k * hop + win));
        const r = Pitch.candidates(frame, sampleRate);
        times[k] = (k * hop + win / 2) / sampleRate;
        rms[k] = r.rms;
        lattice[k] = r.cands;
      }
      const decoded = viterbi(lattice, opts);
      f0 = decoded.f0; clarity = decoded.clarity;
    } else {
      f0 = new Float32Array(nFrames);
      clarity = new Float32Array(nFrames);
      for (let k = 0; k < nFrames; k++) {
        frame.set(pcm.subarray(k * hop, k * hop + win));
        const r = Pitch.detect(frame, sampleRate);
        times[k] = (k * hop + win / 2) / sampleRate;
        f0[k] = r.f0; clarity[k] = r.clarity; rms[k] = r.rms;
      }
      f0 = medianSmooth(f0, 5);   // legacy path: blip rejection without a decoder
    }

    const cents = new Float32Array(nFrames);
    for (let k = 0; k < nFrames; k++) {
      cents[k] = f0[k] > 0 ? 100 * (Notes.hzToMidi(f0[k])) : NaN;
    }
    return { times, f0, cents, clarity, rms, hopSec: hop / sampleRate };
  }

  /**
   * Viterbi-decode a per-frame candidate lattice into one continuous track.
   *
   * This is what pYIN adds on top of YIN (Mauch & Dixon 2014), and it is the
   * highest-value upgrade available to an autocorrelation tracker: per-frame
   * accuracy on a clean sustained vowel is already near ceiling, but
   * *cross-frame* decisions — octave jumps, voiced/unvoiced boundaries — are
   * where a frame-independent detector fails. The median filter this replaces
   * could only reject a blip shorter than half its window, and was blind to
   * how confident each frame actually was.
   *
   * States per frame: the K pitch candidates, plus one unvoiced state.
   *   emission   = WEIGHT · (1 − clarity), so confident frames are cheap
   *   transition = LAMBDA · semitone distance, capped at an octave
   *
   * Emission is linear in aperiodicity rather than −log(clarity) on purpose.
   * The log form is the textbook likelihood, but it diverges as clarity → 0
   * while staying-unvoiced costs nothing per frame, so on a noisy take the
   * cheapest global path is to declare the whole thing unvoiced. Measured:
   * that cost 11 points of raw pitch accuracy at 0 dB SNR versus the median
   * filter it replaced. Bounding emission to [0, WEIGHT] and pricing the
   * unvoiced state at the same clarity threshold the legacy detector used
   * (0.3) keeps the voicing decision where it was and leaves Viterbi to do
   * the job it is actually good at: choosing *among* pitch candidates.
   *
   * The cap is the point. A real melodic leap (interval drills jump around)
   * pays the transition once and then stays cheap; a spurious octave blip
   * pays it twice — out and back — so the continuous path wins. That
   * asymmetry, not raw distance, is what actually kills octave errors, and
   * it is why this beats any amount of median filtering.
   */
  function viterbi(lattice, opts = {}) {
    const LAMBDA   = opts.lambda        != null ? opts.lambda        : 0.22; // cost / semitone
    const WEIGHT   = opts.clarityWeight != null ? opts.clarityWeight : 5.0;  // emission scale
    const VTHRESH  = opts.voicedClarity != null ? opts.voicedClarity : 0.3;  // legacy detect() cutoff
    const SWITCH   = opts.switchCost    != null ? opts.switchCost    : 0.6;  // voiced <-> unvoiced
    const SUBHARM  = opts.subharmCost   != null ? opts.subharmCost   : 3.0;  // octave-ghost penalty
    const UNVOICED = WEIGHT * (1 - VTHRESH);
    const n = lattice.length;
    const f0 = new Float32Array(n), clarity = new Float32Array(n);
    if (!n) return { f0, clarity };

    const ptrs = new Array(n);
    let prev = null;
    for (let t = 0; t < n; t++) {
      const cands = lattice[t], K = cands.length;
      const cur = new Float64Array(K + 1), ptr = new Int16Array(K + 1);

      for (let j = 0; j <= K; j++) {
        // --- emission ---
        let e;
        if (j === K) {
          e = UNVOICED;
        } else {
          e = WEIGHT * (1 - cands[j].clarity);
          // Sub-harmonic guard — MPM's "first peak above 0.9·max" rule, as a
          // cost. This is load-bearing, not defensive: the NSDF of a periodic
          // signal is ~1.0 at *every* multiple of the period, so f0, f0/2 and
          // f0/3 arrive with identical clarity and the emission term cannot
          // tell them apart. Without this the decoder happily locks onto f0/3
          // on a clean sustained tone (measured: 220 Hz read as 73.3 Hz).
          // Continuity does not save you either — the ghost is just as smooth
          // over time as the fundamental.
          for (let k = 0; k < K; k++) {
            if (k === j) continue;
            const ratio = cands[k].f0 / cands[j].f0;
            const m = Math.round(ratio);
            if (m >= 2 && Math.abs(ratio - m) < 0.03 * m &&
                cands[k].clarity >= 0.8 * cands[j].clarity) { e += SUBHARM; break; }
          }
        }
        // --- transition ---
        if (!prev) { cur[j] = e; ptr[j] = -1; continue; }
        const pc = lattice[t - 1], PK = pc.length;
        let bestC = Infinity, bestI = 0;
        for (let i = 0; i <= PK; i++) {
          let tr;
          if (i < PK && j < K) {
            const semis = Math.abs(12 * Math.log2(cands[j].f0 / pc[i].f0));
            tr = LAMBDA * Math.min(semis, 12);
          } else if (i === PK && j === K) tr = 0;
          else tr = SWITCH;
          const c = prev[i] + tr;
          if (c < bestC) { bestC = c; bestI = i; }
        }
        cur[j] = bestC + e; ptr[j] = bestI;
      }
      ptrs[t] = ptr; prev = cur;
    }

    // Backtrack from the cheapest terminal state.
    let bi = 0;
    for (let i = 1; i < prev.length; i++) if (prev[i] < prev[bi]) bi = i;
    for (let t = n - 1; t >= 0; t--) {
      const cands = lattice[t];
      if (bi < cands.length) { f0[t] = cands[bi].f0; clarity[t] = cands[bi].clarity; }
      else { f0[t] = -1; clarity[t] = 0; }
      const back = ptrs[t][bi];
      if (back < 0) break;
      bi = back;
    }
    return { f0, clarity };
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

  return { analyze, viterbi, medianSmooth };
})();

/* ------------------------------------------------------------------ *
 * Metrics: everything the Voice Report needs, from pcm + track.
 * Threshold rationale lives in RESEARCH.md.
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

  /**
   * CPPS — smoothed cepstral peak prominence, in dB.
   *
   * Why this exists next to hnr(): that estimate is derived from the pitch
   * detector's own NSDF peak, so the measurement and the thing it measures
   * share a failure mode — a frame where tracking struggles reports "breathy"
   * whether or not the voice was. CPPS never consults f0. It asks a separate
   * question of the cepstrum: how far does the dominant periodicity stand
   * above the surrounding noise floor? That independence is why the clinical
   * literature settled on it (Hillenbrand & Houde 1996; Heman-Ackah 2003) as
   * the most robust acoustic correlate of breathiness.
   *
   * Deliberately does NOT gate on track.f0 > 0 — filtering by the pitch
   * tracker's voicing decision would reintroduce exactly the coupling this
   * is here to remove. track is used only for frame timing.
   *
   * Absolute values are implementation-dependent (log-spectrum convention,
   * smoothing widths, and regression band all shift them), so the bands in
   * report.html are calibrated against this implementation, not lifted from
   * a clinical paper. Relative ordering is what transfers.
   *
   * @returns {cppsDb, quefrencyHz, frames} — quefrencyHz is the cepstral peak
   *   read back as a frequency. Diagnostic only: it agrees with f0 across most
   *   of the range, but a high voice has few harmonics below 5 kHz, so at high
   *   f0 *and* low SNR the rahmonic is weak enough that a sub-rahmonic can win
   *   (measured: 784 Hz breathy resolving to 197 Hz). Do not use it as a pitch
   *   estimate — and note the fix for it would be to narrow the search using
   *   the tracked f0, which is exactly the coupling this function exists to
   *   avoid.
   */
  function cpps(pcm, sampleRate, track, start, end, opts = {}) {
    // 4096, not the tracker's 2048. A 2048 window at 48 kHz is 23.4 Hz per bin,
    // so an 82 Hz voice has its harmonics only 3.5 bins apart — too smeared to
    // give a clean rahmonic, and the peak lands anywhere. Doubling the window
    // took a clean 82.4 Hz tone from 15.3 dB (with the peak misplaced at
    // 787 Hz) to 23.2 dB with the quefrency correct.
    const win = opts.window || 4096;
    const hann = Fft.hann(win);
    const hop = Math.round(track.hopSec * sampleRate);
    const acc = new Float64Array(win);
    const re = new Float32Array(win), im = new Float32Array(win);
    const cre = new Float32Array(win), cim = new Float32Array(win);
    let used = 0;

    for (let k = start; k < end; k++) {
      const off = k * hop;
      if (off + win > pcm.length) break;
      for (let i = 0; i < win; i++) { re[i] = pcm[off + i] * hann[i]; im[i] = 0; }
      Fft.transform(re, im, false);
      // Real cepstrum: FFT of the log power spectrum. |X|² of a real signal
      // is symmetric, so the result is real & symmetric too.
      for (let i = 0; i < win; i++) {
        cre[i] = Math.log(re[i] * re[i] + im[i] * im[i] + 1e-20); cim[i] = 0;
      }
      Fft.transform(cre, cim, false);
      for (let i = 0; i < win; i++) acc[i] += Math.hypot(cre[i], cim[i]) / win;
      used++;
    }
    if (!used) return null;

    // Smooth across time (the averaging above) then across quefrency — the
    // two passes that make it CPP*S* rather than raw CPP.
    const sm = opts.smoothBins || 5;
    const db = new Float64Array(win);
    for (let i = 0; i < win; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - sm); j <= Math.min(win - 1, i + sm); j++) { s += acc[j] / used; c++; }
      db[i] = 20 * Math.log10(s / c + 1e-20);
    }

    // Search band. fMax is 800, not the tracker's 1200: below ~1.2 ms quefrency
    // the cepstrum is dominated by the spectral envelope (formant structure)
    // rather than by the rahmonic, and that lobe will out-peak a real f0.
    const qLo = Math.max(2, Math.floor(sampleRate / (opts.fMax || 800)));
    const qHi = Math.min(win >> 1, Math.ceil(sampleRate / (opts.fMin || 60)));
    if (qHi <= qLo + 4) return null;

    // Regression line over the search band = the noise floor the peak stands on.
    let sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
    for (let q = qLo; q <= qHi; q++) { sx += q; sy += db[q]; sxx += q * q; sxy += q * db[q]; cnt++; }
    const slope = (cnt * sxy - sx * sy) / (cnt * sxx - sx * sx);
    const icept = (sy - slope * sx) / cnt;

    // Maximise the *residual* above that line, not the raw cepstrum. The line
    // slopes down with quefrency, so taking the raw max biases the answer
    // toward short quefrencies: a clean 110 Hz tone reported its peak at the
    // 1000 Hz band edge and a falsely low prominence.
    let peakQ = qLo, peakRes = -Infinity;
    for (let q = qLo; q <= qHi; q++) {
      const res = db[q] - (slope * q + icept);
      if (res > peakRes) { peakRes = res; peakQ = q; }
    }

    return { cppsDb: peakRes, quefrencyHz: sampleRate / peakQ, frames: used };
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

  return { longestVoicedRun, stability, jitterLike, shimmerLike, hnr, cpps, vibrato, resonance };
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
    // Cap resolution so the DP matrix stays small on phones: 900² ≈ 6 MB.
    const MAXN = opts.maxN || 900;
    const sa = Math.max(1, Math.ceil(a.length / MAXN));
    const sb = Math.max(1, Math.ceil(b.length / MAXN));
    const A = prep(decimate(a, sa), octave), B = prep(decimate(b, sb), octave);
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
    // Backtrack (path indices mapped back to undecimated frames).
    const path = [];
    let i = n, j = m;
    if (D[at(n, m)] >= INF) return { path: [], meanAbsCents: null, withinPct: null, shift };
    while (i > 0 && j > 0) {
      path.push([(i - 1) * sa, (j - 1) * sb]);
      const d = D[at(i - 1, j - 1)], u = D[at(i - 1, j)], l = D[at(i, j - 1)];
      if (d <= u && d <= l) { i--; j--; } else if (u <= l) i--; else j--;
    }
    path.reverse();

    // Score over voiced-voiced pairs only (decimated coordinates).
    let sum = 0, cnt = 0, within = 0;
    for (const [pi, pj] of path) {
      const x = A[pi / sa], yRaw = B[pj / sb];
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

  function decimate(arr, stride) {
    if (stride <= 1) return arr;
    const out = new Float32Array(Math.ceil(arr.length / stride));
    for (let i = 0, j = 0; i < arr.length; i += stride, j++) out[j] = arr[i];
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
