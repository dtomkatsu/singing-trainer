#!/usr/bin/env node
// DSP tests for the singing trainer. No dependencies:  node singing/tests/dsp.test.js
// Covers the math that matters: pitch detection accuracy, vibrato extraction,
// resonance band measures, DTW alignment/transposition, note conversions, WAV
// header — plus a syntax check of every singing/*.html inline script.

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
console.log('singing/*.html inline scripts parse');
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
