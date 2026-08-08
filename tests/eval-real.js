#!/usr/bin/env node
// Real-data evaluation against vocadito (Bittner et al. 2021, CC-BY-4.0):
// 40 solo-vocal excerpts with human-verified f0 annotations on a 5.8 ms grid.
//
//   node tests/eval-real.js /path/to/vocadito-data
//
// The dataset is NOT vendored into this repo (56 MB of audio). Fetch it from
// Zenodo record 5578807 and point this script at the unzipped directory
// (the one containing Audio/ and Annotations/F0/).
//
// Why this exists: every number in eval-pitch.js is synthesized, and synthetic
// tones have cleaner NSDF structure than real voices. This is the check that
// the synthetic conclusions survive contact with real singing.
//
// Scoring is mir_eval-style raw pitch accuracy: over annotation frames where
// the truth is voiced, the estimate must be within 50 cents; an unvoiced
// estimate at a voiced truth frame counts as a miss. Octave = wrong by
// 1200±50 cents specifically.

'use strict';
const path = require('path');
const fs = require('fs');
const { Track } = require(path.join(__dirname, '..', 'js', 'dsp.js'));

const isMain = require.main === module;
const root = process.argv[2];
if (isMain && (!root || !fs.existsSync(path.join(root, 'Audio')))) {
  console.error('usage: node tests/eval-real.js /path/to/vocadito-data  (dir containing Audio/ and Annotations/F0/)');
  process.exit(2);
}

/** Minimal WAV reader: 16-bit PCM, walks chunks properly. Returns mono
 *  (channel average), or a single channel via opts.channel (0-based) —
 *  MIR-1K keeps accompaniment left / vocals right, so averaging would mix
 *  music into the "clean vocal" evaluation. */
function readWav(file, opts = {}) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file: ' + file);
  }
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(off + 8), ch: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = { start: off + 8, size };
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('missing fmt/data chunk: ' + file);
  if (fmt.tag !== 1 || fmt.bits !== 16) throw new Error(`unsupported encoding (tag ${fmt.tag}, ${fmt.bits} bit): ` + file);
  const nSamp = Math.floor(data.size / 2 / fmt.ch);
  const pcm = new Float32Array(nSamp);
  const ch = opts.channel;
  for (let i = 0; i < nSamp; i++) {
    if (ch != null) {
      pcm[i] = b.readInt16LE(data.start + (i * fmt.ch + ch) * 2) / 32768;
    } else {
      let s = 0;
      for (let c = 0; c < fmt.ch; c++) s += b.readInt16LE(data.start + (i * fmt.ch + c) * 2);
      pcm[i] = s / fmt.ch / 32768;
    }
  }
  return { pcm, sampleRate: fmt.rate };
}

function readF0(file) {
  const times = [], f0 = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const [t, f] = line.split(',');
    if (t === undefined || f === undefined || t === '') continue;
    times.push(+t); f0.push(+f);
  }
  return { times, f0 };
}

function score(track, truth) {
  let voiced = 0, inTune = 0, octave = 0, unvoicedMiss = 0;
  for (let i = 0; i < truth.times.length; i++) {
    if (truth.f0[i] <= 0) continue;
    // nearest analysis frame to this annotation timestamp
    const k = Math.round((truth.times[i] - track.times[0]) / track.hopSec);
    if (k < 0 || k >= track.f0.length) continue;
    voiced++;
    if (track.f0[k] <= 0) { unvoicedMiss++; continue; }
    const err = Math.abs(1200 * Math.log2(track.f0[k] / truth.f0[i]));
    if (err <= 50) inTune++;
    else if (Math.abs(err - 1200) <= 50) octave++;
  }
  return { voiced, rpa: 100 * inTune / voiced, octave: 100 * octave / voiced, unv: 100 * unvoicedMiss / voiced };
}

module.exports = { readWav, readF0, score };
if (!isMain) return;

const files = fs.readdirSync(path.join(root, 'Audio')).filter((f) => f.endsWith('.wav')).sort();
const agg = { m: { v: 0, t: 0, o: 0, u: 0 }, d: { v: 0, t: 0, o: 0, u: 0 } };
const perTrack = [];

console.log('track            frames   median-5              viterbi-dual');
console.log('                 (voiced)  RPA    oct    unv     RPA    oct    unv');
for (const f of files) {
  const id = f.replace('.wav', '');
  const f0file = path.join(root, 'Annotations', 'F0', id + '_f0.csv');
  if (!fs.existsSync(f0file)) { console.log(`${id}  — no f0 annotation, skipped`); continue; }
  const { pcm, sampleRate } = readWav(path.join(root, 'Audio', f));
  const truth = readF0(f0file);
  const sm = score(Track.analyze(pcm, sampleRate, { viterbi: false }), truth);
  const sd = score(Track.analyze(pcm, sampleRate, {}), truth);
  perTrack.push({ id, sm, sd });
  for (const [key, s] of [['m', sm], ['d', sd]]) {
    agg[key].v += s.voiced;
    agg[key].t += s.voiced * s.rpa / 100;
    agg[key].o += s.voiced * s.octave / 100;
    agg[key].u += s.voiced * s.unv / 100;
  }
  const p = (x) => x.toFixed(1).padStart(5);
  console.log(`${id.padEnd(16)} ${String(sm.voiced).padStart(6)}  ${p(sm.rpa)}% ${p(sm.octave)}% ${p(sm.unv)}%  ${p(sd.rpa)}% ${p(sd.octave)}% ${p(sd.unv)}%`);
}

const A = (k, f) => (100 * agg[k][f] / agg[k].v).toFixed(2);
console.log('─'.repeat(72));
console.log(`ALL (${agg.m.v} voiced frames)`);
console.log(`  median-5      RPA ${A('m', 't')}%   octave ${A('m', 'o')}%   unvoiced-miss ${A('m', 'u')}%`);
console.log(`  viterbi-dual  RPA ${A('d', 't')}%   octave ${A('d', 'o')}%   unvoiced-miss ${A('d', 'u')}%`);

// worst tracks for the dual decoder — where to look next
perTrack.sort((a, b) => a.sd.rpa - b.sd.rpa);
console.log('\nworst 5 tracks (viterbi-dual):');
for (const t of perTrack.slice(0, 5)) {
  console.log(`  ${t.id}  RPA ${t.sd.rpa.toFixed(1)}%  oct ${t.sd.octave.toFixed(1)}%  unv ${t.sd.unv.toFixed(1)}%  (median-5: ${t.sm.rpa.toFixed(1)}%)`);
}
