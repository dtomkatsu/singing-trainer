#!/usr/bin/env node
// DSP tests for the singing trainer. No dependencies:  node tests/dsp.test.js
// Covers the math that matters: pitch detection accuracy, vibrato extraction,
// resonance band measures, DTW alignment/transposition, note conversions, WAV
// header — plus a syntax check of every *.html inline script.

'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const { Pitch, Fft, Notes, Track, Metrics, Dtw, Wav } = require(path.join(__dirname, '..', 'js', 'dsp.js'));

let failures = 0, checks = 0;
function ok(cond, label) {
  checks++;
  if (!cond) { failures++; console.error('  FAIL  ' + label); }
  else console.log('  ok    ' + label);
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---------- synthesis helpers ---------- */
const SR = 48000;
function sine(hz, secs, amp = 0.3) {
  const n = Math.round(secs * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * hz * i / SR);
  return out;
}
/** Voice-ish tone: fundamental + harmonics with given relative amps. */
function harmonicTone(hz, secs, harmAmps, amp = 0.25) {
  const n = Math.round(secs * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let h = 0; h < harmAmps.length; h++) s += harmAmps[h] * Math.sin(2 * Math.PI * hz * (h + 1) * i / SR);
    out[i] = amp * s;
  }
  return out;
}
function vibratoTone(hz, secs, rateHz, extentCents, amp = 0.3) {
  const n = Math.round(secs * SR), out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = hz * Math.pow(2, (extentCents * Math.sin(2 * Math.PI * rateHz * i / SR)) / 1200);
    phase += 2 * Math.PI * f / SR;
    out[i] = amp * Math.sin(phase);
  }
  return out;
}

/* ---------- Pitch ---------- */
console.log('Pitch.detect');
for (const hz of [82.4, 130.8, 220, 440, 880]) {
  const buf = sine(hz, 2048 / SR + 0.01).subarray(0, 2048);
  const r = Pitch.detect(buf, SR);
  const cents = Math.abs(1200 * Math.log2(r.f0 / hz));
  ok(r.f0 > 0 && cents < 10, `${hz} Hz detected within 10¢ (got ${r.f0.toFixed(2)} Hz)`);
}
{
  const buf = new Float32Array(2048);            // silence
  ok(Pitch.detect(buf, SR).f0 === -1, 'silence -> unvoiced');
  const noise = new Float32Array(2048).map(() => (Math.random() - 0.5) * 0.4);
  const rn = Pitch.detect(noise, SR);
  ok(rn.f0 === -1 || rn.clarity < 0.6, 'white noise -> unvoiced or low clarity');
  // Harmonic-rich tone must not octave-jump: strong 2nd harmonic
  const rich = harmonicTone(196, 2048 / SR + 0.01, [1, 0.9, 0.5, 0.3]).subarray(0, 2048);
  const rr = Pitch.detect(rich, SR);
  ok(approx(rr.f0, 196, 4), `harmonic-rich 196 Hz stays on fundamental (got ${rr.f0.toFixed(1)})`);
}

/* ---------- Notes ---------- */
console.log('Notes');
ok(Notes.name(69) === 'A4', 'midi 69 = A4');
ok(Notes.name(60) === 'C4', 'midi 60 = C4');
ok(approx(Notes.midiToHz(69), 440, 0.001), 'A4 = 440 Hz');
ok(Notes.nearest(446).name === 'A4' && approx(Notes.nearest(446).cents, 23.4, 1), 'nearest note + cents');

/* ---------- Track + vibrato ---------- */
console.log('Track / Metrics.vibrato');
{
  const pcm = vibratoTone(220, 3, 6, 80);
  const track = Track.analyze(pcm, SR);
  const [s, e] = Metrics.longestVoicedRun(track);
  ok((e - s) * track.hopSec > 2.5, 'vibrato tone mostly voiced');
  const v = Metrics.vibrato(track, s, e);
  ok(v && v.present, 'vibrato detected');
  ok(v && approx(v.rateHz, 6, 0.8), `rate ≈6 Hz (got ${v && v.rateHz.toFixed(2)})`);
  ok(v && approx(v.extentCents, 80, 25), `extent ≈80¢ (got ${v && v.extentCents.toFixed(0)})`);
  const stab = Metrics.stability(track, s, e);
  ok(stab && stab.driftCentsSD < 15, `vibrato not counted as drift (drift SD ${stab && stab.driftCentsSD.toFixed(1)}¢)`);
}
{
  const pcm = sine(220, 3);
  const track = Track.analyze(pcm, SR);
  const [s, e] = Metrics.longestVoicedRun(track);
  const v = Metrics.vibrato(track, s, e);
  ok(v && !v.present, 'steady tone -> no vibrato');
  const stab = Metrics.stability(track, s, e);
  ok(stab && stab.driftCentsSD < 5, 'steady tone -> tiny drift');
  const hnr = Metrics.hnr(track, s, e);
  ok(hnr > 15, `pure tone HNR high (got ${hnr && hnr.toFixed(1)} dB)`);
}
{
  // Breathy tone: sine + noise -> lower HNR than pure
  const pure = sine(220, 2), noisy = sine(220, 2);
  for (let i = 0; i < noisy.length; i++) noisy[i] += (Math.random() - 0.5) * 0.25;
  const tp = Track.analyze(pure, SR), tn = Track.analyze(noisy, SR);
  const [ps, pe] = Metrics.longestVoicedRun(tp), [ns, ne] = Metrics.longestVoicedRun(tn);
  const hp = Metrics.hnr(tp, ps, pe), hn = Metrics.hnr(tn, ns, ne);
  ok(hp - hn > 5, `noise lowers HNR (${hp.toFixed(1)} vs ${hn.toFixed(1)} dB)`);
}

/* ---------- CPPS ---------- */
console.log('Metrics.cpps');
{
  const H = [1, 0.5, 0.33, 0.25, 0.18, 0.12];
  const clean = harmonicTone(196, 3, H);
  const breathy = harmonicTone(196, 3, H);
  for (let i = 0; i < breathy.length; i++) breathy[i] = 0.75 * breathy[i] + 0.05 * (Math.random() * 2 - 1);
  const tc = Track.analyze(clean, SR), tb = Track.analyze(breathy, SR);
  const [cs, ce] = Metrics.longestVoicedRun(tc), [bs, be] = Metrics.longestVoicedRun(tb);
  const cc = Metrics.cpps(clean, SR, tc, cs, ce), cb = Metrics.cpps(breathy, SR, tb, bs, be);
  ok(cc && cb && cc.cppsDb - cb.cppsDb > 1.5,
    `CPPS separates clean from breathy (${cc && cc.cppsDb.toFixed(1)} vs ${cb && cb.cppsDb.toFixed(1)} dB)`);
  // The cepstral peak is an f0 estimate reached without ever consulting the
  // pitch tracker. If it agrees, the measure really is independent of it —
  // which is the whole reason CPPS is here alongside hnr().
  ok(cc && Math.abs(1200 * Math.log2(cc.quefrencyHz / 196)) < 60,
    `CPPS quefrency recovers f0 independently (${cc && cc.quefrencyHz.toFixed(1)} Hz vs 196)`);
}

/* ---------- Viterbi decoding ---------- */
console.log('Track viterbi decode');
{
  // Regression guard. The NSDF is ~1.0 at *every* multiple of the period, so
  // f0, f0/2 and f0/3 arrive with identical clarity; a decoder that ranks on
  // clarity alone locks onto a sub-harmonic even on a perfectly clean tone.
  // This caught exactly that (220 Hz was read as 73.3 Hz).
  // High pitches are the hard direction: at 784 Hz roughly 13 sub-harmonic
  // peaks fit inside the 60 Hz search floor, all at clarity ~1.0 on a clean
  // tone. Ranking candidates by clarity let float noise pick among them and
  // read 784 Hz as 87 Hz; they are kept in ascending-lag order instead.
  for (const hz of [110, 196, 330, 392, 523, 784]) {
    const t = Track.analyze(harmonicTone(hz, 1.5, [1, 0.5, 0.33, 0.25]), SR);
    const [s, e] = Metrics.longestVoicedRun(t);
    const vals = Array.from(t.f0.subarray(s, e)).filter((v) => v > 0).sort((a, b) => a - b);
    const med = vals[vals.length >> 1];
    ok(vals.length && Math.abs(1200 * Math.log2(med / hz)) < 50,
      `holds the fundamental at ${hz} Hz (got ${med ? med.toFixed(1) : 'none'})`);
  }
  // Real melodic leaps must survive: over-smoothing would score well on
  // sustained notes and quietly ruin the interval drills.
  const leap = new Float32Array(SR * 2);
  leap.set(harmonicTone(220, 1, [1, 0.5, 0.33]), 0);
  leap.set(harmonicTone(440, 1, [1, 0.5, 0.33]), SR);
  const tl = Track.analyze(leap, SR);
  const early = tl.f0[Math.floor(0.5 / tl.hopSec)], late = tl.f0[Math.floor(1.5 / tl.hopSec)];
  ok(early > 0 && late > 0 &&
     Math.abs(1200 * Math.log2(early / 220)) < 50 && Math.abs(1200 * Math.log2(late / 440)) < 50,
    `octave leap preserved (${early.toFixed(0)} -> ${late.toFixed(0)} Hz)`);
  // Fast run (12 notes/sec): the dual-window lattice exists for this. Guard
  // the win — a 2048-only lattice sits ~89% here, dual-window ~95%.
  {
    const run = new Float32Array(3 * SR);
    let ph = 0;
    for (let i = 0; i < run.length; i++) {
      const f = 261.6 * Math.pow(2, [0, 2, 4, 5, 4, 2, 0, 2][Math.floor(i / SR * 12) % 8] / 12);
      ph += 2 * Math.PI * f / SR;
      run[i] = 0.25 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.33 * Math.sin(3 * ph));
    }
    const t = Track.analyze(run, SR);
    let good = 0, tot = 0;
    for (let k = 0; k < t.f0.length; k++) {
      const truth = 261.6 * Math.pow(2, [0, 2, 4, 5, 4, 2, 0, 2][Math.floor(t.times[k] * 12) % 8] / 12);
      tot++;
      if (t.f0[k] > 0 && Math.abs(1200 * Math.log2(t.f0[k] / truth)) <= 50) good++;
    }
    ok(100 * good / tot >= 92, `fast run tracked (${(100 * good / tot).toFixed(1)}% frames within 50¢)`);
  }
}

/* ---------- Resonance ---------- */
console.log('Metrics.resonance');
{
  // "Dull": harmonics fall off fast. "Ringy": boosted harmonics near 3 kHz (h13-h16 of 220).
  const dullAmps = Array.from({ length: 20 }, (_, h) => 1 / Math.pow(h + 1, 2.5));
  const ringAmps = dullAmps.slice();
  for (let h = 11; h <= 15; h++) ringAmps[h] = 0.5;   // ~2.6-3.5 kHz at 220 Hz f0
  const dull = harmonicTone(220, 2.5, dullAmps), ring = harmonicTone(220, 2.5, ringAmps);
  const td = Track.analyze(dull, SR), tr = Track.analyze(ring, SR);
  const [ds, de] = Metrics.longestVoicedRun(td), [rs, re] = Metrics.longestVoicedRun(tr);
  const rd = Metrics.resonance(dull, SR, td, ds, de), rr = Metrics.resonance(ring, SR, tr, rs, re);
  ok(rr.sprDb - rd.sprDb > 10, `SPR separates ring from dull (${rr.sprDb.toFixed(1)} vs ${rd.sprDb.toFixed(1)} dB)`);
  ok(rr.er3kDb > rd.er3kDb, `singer's-formant band energy higher for ring`);
}

/* ---------- SPR (shared by the offline report and the live Ring meter) ---------- */
console.log('Metrics.sprFromDb');
{
  const binHz = 23.4375;                                  // 48k / 2048
  const mk = (fill) => { const d = new Float32Array(256); d.fill(-90); fill(d); return d; };
  const at = (hz) => Math.round(hz / binHz);

  const dull = mk((d) => { d[at(220)] = -20; d[at(3000)] = -55; });
  const ringy = mk((d) => { d[at(220)] = -20; d[at(3000)] = -26; });
  ok(approx(Metrics.sprFromDb(dull, binHz), -35, 1.5), 'SPR = 2-4k peak minus 0-2k peak (dull)');
  ok(Metrics.sprFromDb(ringy, binHz) - Metrics.sprFromDb(dull, binHz) > 25, 'SPR rises when 3 kHz energy rises');

  // The property the whole trainer rests on: a constant gain ahead of the
  // measurement cancels, because SPR is a difference of two dB peaks.
  const gained = Float32Array.from(dull, (v) => v + 17);
  ok(approx(Metrics.sprFromDb(gained, binHz), Metrics.sprFromDb(dull, binHz), 1e-4),
     'SPR is invariant to a constant gain (survives iOS AGC)');

  ok(Metrics.sprFromDb(mk(() => {}), binHz, { floorDb: -85 }) === null, 'silent frame gates to null');

  // Live and offline paths must agree, or "baseline + 6 dB" means nothing.
  const amps = Array.from({ length: 20 }, (_, h) => 1 / Math.pow(h + 1, 2.5));
  for (let h = 11; h <= 15; h++) amps[h] = 0.5;
  const tone = harmonicTone(220, 2.5, amps);
  const t = Track.analyze(tone, SR);
  const [s, e] = Metrics.longestVoicedRun(t);
  const off = Metrics.resonance(tone, SR, t, s, e);
  ok(approx(Metrics.sprFromDb(off.spectrumDb, off.binHz), off.sprDb, 1e-6),
     'resonance().sprDb is exactly sprFromDb() on the same spectrum');
}

/* ---------- H1-H2 (glottal closure / source measure) ---------- */
console.log('Metrics.h1h2');
{
  // The two acoustic extremes of the closure axis. Breathy = a near-sinusoidal
  // glottal wave, energy piled into the fundamental. Pressed = an abrupt wave,
  // energy spread up the series. Amplitudes are the harmonic *series*, so
  // harmAmps[0] is H1 and harmAmps[1] is H2.
  const breathy = harmonicTone(150, 2.5, [1.0, 0.10, 0.04, 0.02, 0.01]);
  const pressed = harmonicTone(150, 2.5, [1.0, 0.95, 0.70, 0.55, 0.40]);

  const measure = (pcm) => {
    const t = Track.analyze(pcm, SR);
    const [s, e] = Metrics.longestVoicedRun(t);
    return Metrics.h1h2(pcm, SR, t, s, e);
  };
  const b = measure(breathy), p = measure(pressed);
  ok(b && p, 'returns a reading for both phonation types');
  // Synthesized H1/H2 ratios are 1.0/0.10 (=20 dB) and 1.0/0.95 (=0.45 dB).
  ok(approx(b.h1h2Db, 20, 2.5), `breathy source ≈ +20 dB (got ${b.h1h2Db.toFixed(1)})`);
  ok(approx(p.h1h2Db, 0.45, 2.5), `pressed source ≈ 0 dB (got ${p.h1h2Db.toFixed(1)})`);
  ok(b.h1h2Db - p.h1h2Db > 12, 'H1-H2 separates breathy from pressed by a wide margin');

  // The measure must refuse high voices rather than report a corrupted number:
  // above ~300 Hz, H2 collides with F1 on /a/ and the value stops meaning
  // anything. Same discipline as the singer's-formant caveat for sopranos.
  const high = harmonicTone(420, 2.0, [1.0, 0.5, 0.25]);
  const th = Track.analyze(high, SR);
  const [hs, he] = Metrics.longestVoicedRun(th);
  ok(Metrics.h1h2(high, SR, th, hs, he) === null, 'refuses f0 above the F1-clearance gate');
  ok(Metrics.h1h2(high, SR, th, hs, he, { maxF0: 600 }) !== null, 'gate is configurable for testing');

  // A constant gain must cancel — the contrast framing depends on it, and so
  // does surviving iOS auto-gain.
  const louder = Float32Array.from(breathy, (v) => v * 3.2);
  const l = measure(louder);
  ok(approx(l.h1h2Db, b.h1h2Db, 0.5), 'invariant to overall level');
}

/* ---------- Ring trainer: live frames must be gated on voicing, not just a dB floor ---------- */
console.log('room noise vs a floor-only SPR gate');
{
  // Regression test for a real bug: the Ring trainer's live capture loop
  // originally accepted any spectrum frame whose low-band peak cleared
  // floorDb (-85 dB), with no check that a voice was actually present. That
  // floor sits only 15 dB above the AnalyserNode's default -100 dB noise
  // floor, so ordinary room tone clears it — a "silent" baseline take was
  // quietly measuring the room. The fix gates each live frame on
  // Pitch.detect() first (f0 > 0 && clarity > 0.5), same as the tuner and
  // drills. This test pins both halves down: the old floor alone would have
  // let this signal through, and the voicing gate correctly rejects it.
  const binHz = 23.4375;
  const spec = new Float32Array(256).fill(-90);
  // A plausible room-tone spectrum: broad low-frequency energy (HVAC/traffic
  // rumble), nothing resembling a voice's harmonic comb.
  for (let i = 1; i < 60; i++) spec[i] = -55 - i * 0.3 + (i % 7) * 2;
  ok(Metrics.sprFromDb(spec, binHz, { floorDb: -85 }) !== null,
     'a floor-only gate lets a room-noise spectrum through (this was the bug)');

  const noise = new Float32Array(2048).map((_, i) => {
    // Deterministic broadband "noise": a few dozen unrelated, non-harmonic
    // partials rather than Math.random(), so the test is reproducible.
    let s = 0;
    for (let k = 1; k <= 40; k++) s += Math.sin(2 * Math.PI * (131 * k * 1.0173) * i / SR + k);
    return 0.02 * s / 40;
  });
  const r = Pitch.detect(noise, SR);
  ok(r.f0 <= 0 || r.clarity <= 0.5, 'the same class of signal fails the voicing gate the live loop now applies');
}

/* ---------- DTW ---------- */
console.log('Dtw.align');
{
  // Melody in cents (midi*100), with unvoiced gaps
  const mel = [];
  for (const m of [60, 62, 64, 65, 67]) for (let i = 0; i < 20; i++) mel.push(m * 100);
  const a = new Float32Array(mel);
  const same = Dtw.align(a, new Float32Array(mel), {});
  ok(same.meanAbsCents !== null && same.meanAbsCents < 1, 'identical contours -> ~0 error');
  // transposed down 3 semitones
  const trans = new Float32Array(mel.map((v) => v - 300));
  const rt = Dtw.align(a, trans, {});
  ok(rt.shift === 300 && rt.meanAbsCents < 1, `transposition detected & forgiven (shift ${rt.shift}¢)`);
  // time-stretched (sung slower) still aligns
  const slow = [];
  for (const v of mel) { slow.push(v, v); }
  const rs2 = Dtw.align(a, new Float32Array(slow), {});
  ok(rs2.meanAbsCents !== null && rs2.meanAbsCents < 5, 'time-stretched attempt aligns');
  // genuinely wrong notes score badly
  const wrong = new Float32Array(mel.map((v, i) => v + (i % 40 < 20 ? 350 : -250)));
  const rw = Dtw.align(a, wrong, { allowTranspose: false });
  ok(rw.meanAbsCents > 120, `wrong notes -> big error (${rw.meanAbsCents && rw.meanAbsCents.toFixed(0)}¢)`);
}

/* ---------- Wav ---------- */
console.log('Wav.encode');
{
  const pcm = sine(440, 0.1);
  // Node has Blob since v18
  const blob = Wav.encode(pcm, SR);
  ok(blob.size === 44 + pcm.length * 2, 'WAV size = header + 16-bit samples');
}

/* ---------- Syntax-check singing pages ---------- */
console.log('*.html inline scripts parse');
{
  const dir = path.join(__dirname, '..');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const tmp = path.join(require('os').tmpdir(), 'sing-check-' + f + '.js');
    // Pages share globals from dsp/mic/ui; wrap in a block to avoid cross-file const clashes.
    fs.writeFileSync(tmp, scripts.map((s) => '{' + s + '}').join('\n'));
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
      ok(true, f);
    } catch (e) {
      ok(false, f + ' — ' + String(e.stderr).split('\n')[0]);
    } finally { fs.unlinkSync(tmp); }
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
