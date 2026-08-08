#!/usr/bin/env node
// Ground-truth evaluation harness for the pitch tracker:  node tests/eval-pitch.js
//
// dsp.test.js asserts correctness on a handful of cases. This measures
// *accuracy* against synthesized signals with known f0, using the standard MIR
// metrics, so a decoder change can be judged rather than guessed at:
//
//   RPA@50¢   raw pitch accuracy — % voiced frames within a quarter tone
//   octave    % frames off by ~±1200¢ (the failure mode that matters here)
//   gross     % frames >50¢ off for any reason
//
// Cases 1-5 are octave-error and noise bait. Case 6 is the guard rail: a
// decoder that smooths away real melodic leaps would score well everywhere
// else and be useless for the interval drills.

'use strict';
const path = require('path');
const { Track, Notes } = require(path.join(__dirname, '..', 'js', 'dsp.js'));

const SR = 48000;

// Deterministic RNG so runs are comparable and CI can't flake. mulberry32 —
// a plain LCG here would exceed 2^53 on the multiply, lose the low bits, and
// emit *periodic* "noise", which a pitch tracker cheerfully locks onto.
let seed = 12345;
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Render a tone. `jitter` perturbs the period cycle-to-cycle (the real thing
 * that degrades the NSDF peak at the true lag), `ampFn` shapes the envelope,
 * `noise` is additive.
 */
function render({ f0, secs, harm, noise = 0, jitter = 0, ampFn = null, amp = 0.25 }) {
  const n = Math.round(secs * SR), out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0(t) * (1 + jitter * (rnd() * 2 - 1));
    phase += 2 * Math.PI * f / SR;
    let s = 0;
    for (let h = 0; h < harm.length; h++) s += harm[h] * Math.sin(phase * (h + 1));
    const env = ampFn ? ampFn(t) : 1;
    out[i] = amp * env * s + noise * (rnd() * 2 - 1);
  }
  return out;
}

const VOICE = [1, 0.5, 0.33, 0.25, 0.18, 0.12];
// A high voice has few harmonics below 5 kHz; a fixed-length harmonic list
// would make a 784 Hz tone unrealistically rich. See PITCH-TRACKING.md §4.
const HIGH = [1, 0.45, 0.22, 0.10, 0.05];
const steps = (list) => (t) => { for (const [end, f] of list) if (t < end) return f; return list[list.length - 1][1]; };

// Every case below is a documented failure mode of autocorrelation trackers.
// The clean control is kept so a regression there is obvious.
const CASES = [
  { name: 'steady 220 Hz (control)', secs: 3, f0: () => 220, harm: VOICE },

  // Jitter degrades the NSDF peak at the true lag faster than the one at 2x,
  // which is the actual mechanism behind octave-down errors.
  { name: 'jitter 3% + noise',    secs: 3, f0: () => 220, harm: VOICE, jitter: 0.03, noise: 0.22 },

  // SNR ~0 dB — well past where a phone mic in a real room gives up.
  { name: 'SNR ~0 dB',            secs: 3, f0: () => 196, harm: VOICE, noise: 0.42 },

  // Breath support fading on a long sustain: the app's flagship task, and the
  // exact region where it measures "drift".
  { name: 'fading sustain',       secs: 4, f0: () => 220, harm: VOICE, noise: 0.10,
    ampFn: (t) => Math.max(0.10, 1 - 0.85 * (t / 4)) },

  // R&B melisma: 12 notes/sec against a 42.7 ms window.
  { name: 'fast melisma 12 n/s',  secs: 3, harm: VOICE,
    f0: (t) => 261.6 * Math.pow(2, [0, 2, 4, 5, 4, 2, 0, 2][Math.floor(t * 12) % 8] / 12) },

  // Consonants / breath catches: short unvoiced bursts mid-phrase.
  { name: 'breath interruptions', secs: 4, f0: () => 246.9, harm: VOICE, noise: 0.06,
    ampFn: (t) => (Math.floor(t * 2) % 2 === 1 && (t * 2) % 1 < 0.22 ? 0.04 : 1),
    // The gaps are genuinely unvoiced — scoring them as pitch errors would
    // measure voice-activity detection, not pitch accuracy.
    voiced: (t) => !(Math.floor(t * 2) % 2 === 1 && (t * 2) % 1 < 0.28) },

  // Guard rail: a decoder that smooths away real leaps must score badly here.
  { name: 'interval leaps',       secs: 4, f0: steps([[0.8, 220], [1.6, 330], [2.4, 440], [3.2, 277.18], [4, 220]]), harm: VOICE,
    transitions: [0.8, 1.6, 2.4, 3.2] },

  // High voices. The NSDF search runs to lag 800 (60 Hz), so at 784 Hz there
  // are ~13 sub-harmonic peaks inside the range, all near clarity 1.0 on a
  // clean tone. Whichever one wins is then decided by numerical noise. These
  // cases were missing and the decoder was silently octave-erroring here.
  { name: 'soprano 784 Hz',       secs: 3, f0: () => 784, harm: HIGH },
  { name: 'soprano 659 Hz + noise', secs: 3, f0: () => 659, harm: HIGH, noise: 0.06 },
  { name: 'alto 392 Hz',          secs: 3, f0: () => 392, harm: HIGH },
];

function score(track, f0Fn, transitions, voicedFn) {
  let inTune = 0, octave = 0, gross = 0, total = 0;
  for (let k = 0; k < track.f0.length; k++) {
    const t = track.times[k];
    // Skip frames whose 2048-sample window straddles a note change — no
    // tracker can be right there, and including them just adds noise.
    if (transitions && transitions.some((x) => Math.abs(t - x) < 0.03)) continue;
    if (voicedFn && !voicedFn(t)) continue;
    const truth = f0Fn(t);
    total++;
    if (track.f0[k] <= 0) { gross++; continue; }
    const err = Math.abs(1200 * Math.log2(track.f0[k] / truth));
    if (err <= 50) inTune++;
    else { gross++; if (Math.abs(err - 1200) <= 50) octave++; }
  }
  return { rpa: 100 * inTune / total, octave: 100 * octave / total, gross: 100 * gross / total };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
/** Score every case with one decoder config. Used by the tuning sweep too. */
function runAll(opts) {
  return CASES.map((c) => {
    seed = 12345;                     // identical noise for every config
    return score(Track.analyze(render(c), SR, opts), c.f0, c.transitions, c.voiced);
  });
}

if (require.main === module) {
  const pct = (v) => (v.toFixed(1) + '%').padStart(6);
  console.log('case                        decoder    RPA@50¢  octave   gross');
  console.log('─'.repeat(66));
  const med = runAll({ viterbi: false }), vit = runAll({});
  CASES.forEach((c, i) => {
    console.log(`${c.name.padEnd(26)} ${'median-5'.padEnd(10)} ${pct(med[i].rpa)}  ${pct(med[i].octave)}  ${pct(med[i].gross)}`);
    console.log(`${''.padEnd(26)} ${'viterbi'.padEnd(10)} ${pct(vit[i].rpa)}  ${pct(vit[i].octave)}  ${pct(vit[i].gross)}`);
  });
  console.log('─'.repeat(66));
  console.log(`mean RPA   median-5 ${mean(med.map((s) => s.rpa)).toFixed(1)}%   →   viterbi ${mean(vit.map((s) => s.rpa)).toFixed(1)}%`);
}

module.exports = { CASES, render, score, runAll, mean, SR };
