#!/usr/bin/env node
// Second real-data evaluation: MIR-1K (Hsu & Jang) — 1000 Chinese karaoke
// clips at 16 kHz, vocals on the right channel, human pitch labels (.pv,
// MIDI semitones, 20 ms hop, 0 = unvoiced).
//
//   node tests/eval-mir1k.js /path/to/MIR-1K [maxClips]
//
// Not vendored (1 GB). This exists to validate the vocadito-tuned constants
// on an independent dataset — different singers, language, recording chain,
// AND sample rate (16 kHz vs 44.1 kHz exercises the tracker's
// rate-independence: a 2048 window here is 128 ms, not 46 ms).

'use strict';
const path = require('path');
const fs = require('fs');
const { Track } = require(path.join(__dirname, '..', 'js', 'dsp.js'));
const { readWav, score } = require(path.join(__dirname, 'eval-real.js'));

const root = process.argv[2];
const maxClips = +(process.argv[3] || Infinity);
if (!root || !fs.existsSync(path.join(root, 'Wavfile'))) {
  console.error('usage: node tests/eval-mir1k.js /path/to/MIR-1K [maxClips]');
  process.exit(2);
}

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** .pv → {times, f0}. Frame i covers [i*20, i*20+40) ms; centre at i*0.02+0.02. */
function readPv(file) {
  const times = [], f0 = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const v = parseFloat(lines[i]);
    if (Number.isNaN(v)) continue;
    times.push(0.02 * i + 0.02);
    f0.push(v > 0 ? midiToHz(v) : 0);
  }
  return { times, f0 };
}

const files = fs.readdirSync(path.join(root, 'Wavfile')).filter((f) => f.endsWith('.wav')).sort().slice(0, maxClips);
const agg = { m: { v: 0, t: 0, o: 0, u: 0 }, d: { v: 0, t: 0, o: 0, u: 0 } };
const perClip = [];
let done = 0;

for (const f of files) {
  const id = f.replace('.wav', '');
  const pv = path.join(root, 'PitchLabel', id + '.pv');
  if (!fs.existsSync(pv)) continue;
  const { pcm, sampleRate } = readWav(path.join(root, 'Wavfile', f), { channel: 1 }); // right = vocal
  const truth = readPv(pv);
  const sm = score(Track.analyze(pcm, sampleRate, { viterbi: false }), truth);
  const sd = score(Track.analyze(pcm, sampleRate, {}), truth);
  if (!sm.voiced) continue;
  perClip.push({ id, sm, sd });
  for (const [key, s] of [['m', sm], ['d', sd]]) {
    agg[key].v += s.voiced;
    agg[key].t += s.voiced * s.rpa / 100;
    agg[key].o += s.voiced * s.octave / 100;
    agg[key].u += s.voiced * s.unv / 100;
  }
  if (++done % 100 === 0) console.error(`  ...${done}/${files.length}`);
}

const A = (k, f) => (100 * agg[k][f] / agg[k].v).toFixed(2);
console.log(`MIR-1K: ${done} clips, ${agg.m.v} voiced frames`);
console.log(`  median-5      RPA ${A('m', 't')}%   octave ${A('m', 'o')}%   unvoiced-miss ${A('m', 'u')}%`);
console.log(`  viterbi-dual  RPA ${A('d', 't')}%   octave ${A('d', 'o')}%   unvoiced-miss ${A('d', 'u')}%`);

perClip.sort((a, b) => a.sd.rpa - b.sd.rpa);
console.log('\nworst 5 clips (viterbi-dual):');
for (const t of perClip.slice(0, 5)) {
  console.log(`  ${t.id}  RPA ${t.sd.rpa.toFixed(1)}%  oct ${t.sd.octave.toFixed(1)}%  unv ${t.sd.unv.toFixed(1)}%  (median-5: ${t.sm.rpa.toFixed(1)}%)`);
}
// clips where the decoder most helps / most hurts vs baseline
perClip.sort((a, b) => (a.sd.rpa - a.sm.rpa) - (b.sd.rpa - b.sm.rpa));
console.log('biggest decoder losses vs median-5:');
for (const t of perClip.slice(0, 3)) console.log(`  ${t.id}  ${t.sm.rpa.toFixed(1)} -> ${t.sd.rpa.toFixed(1)}`);
console.log('biggest decoder wins vs median-5:');
for (const t of perClip.slice(-3)) console.log(`  ${t.id}  ${t.sm.rpa.toFixed(1)} -> ${t.sd.rpa.toFixed(1)}`);
