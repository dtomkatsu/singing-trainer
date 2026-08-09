#!/usr/bin/env node
// Practice-schedule tests:  node tests/practice.test.js
//
// The schedule is the intervention (Steinhauer & Eichhorn 2025), so the
// properties asserted here are the ones that make it that intervention:
// KR really is withheld at the stated rate, random stages really do interleave,
// retention probes really are unfed and really don't count toward progress.

'use strict';
const path = require('path');
const { Practice } = require(path.join(__dirname, '..', 'js', 'practice.js'));

let failures = 0, checks = 0;
function ok(cond, label) {
  checks++;
  if (!cond) { failures++; console.error('  FAIL  ' + label); }
  else console.log('  ok    ' + label);
}

/** Deterministic RNG so the shuffles are reproducible. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function memStore() {
  const m = {};
  return { get: (k, d) => (k in m ? m[k] : d), set: (k, v) => { m[k] = v; }, _m: m };
}

const STAGES = [
  { id: 'find', name: 'Find it', structure: 'blocked', concurrent: true, kr: 1.0, trials: 6, targets: ['nya'], minPasses: 2 },
  { id: 'hold', name: 'Hold it', structure: 'blocked', concurrent: true, kr: 1.0, trials: 4, targets: ['nya'], passRate: 0.75 },
  { id: 'xfer', name: 'Transfer', structure: 'random', concurrent: false, kr: 0.55, trials: 10, targets: ['a', 'b', 'c'], passRate: 0.7 },
];
const mk = (over = {}) => Practice.create(Object.assign(
  { key: 'test', stages: STAGES, store: memStore(), rng: lcg(7), now: () => 1000 }, over));

/* ---------- KR schedule ---------- */
console.log('Practice.krPlan');
{
  const plan = Practice.krPlan(10, 0.55, lcg(3));
  ok(plan.length === 10, 'plan has one entry per trial');
  ok(plan.filter(Boolean).length === 6, 'exactly round(0.55*10)=6 fed trials (not a per-trial coin flip)');
  const all = Practice.krPlan(6, 1.0, lcg(3));
  ok(all.every(Boolean), '100% KR feeds every trial');
}

/* ---------- stage gating ---------- */
console.log('stage advancement');
{
  const p = mk();
  let t = p.nextTrial();
  ok(t.stage.id === 'find' && t.concurrent === true && t.kr === true, 'stage 1 gives both feedback channels');
  ok(t.n === 1 && t.of === 6, 'trial counter starts at 1/6');

  // minPasses: two successes clear it regardless of how many misses precede.
  p.record(p.nextTrial(), false);
  p.record(p.nextTrial(), false);
  p.record(p.nextTrial(), true);
  ok(p.state().stage.id === 'find', 'one success does not clear a minPasses=2 stage');
  const r = p.record(p.nextTrial(), true);
  ok(r.advanced && p.state().stage.id === 'hold', 'second success clears stage 1');
}

console.log('pass-rate gating');
{
  const p = mk();
  p.record(p.nextTrial(), true); p.record(p.nextTrial(), true);   // clear stage 1
  ok(p.state().stage.id === 'hold', 'on stage 2');
  // Needs 3 of a 4-trial window.
  for (let i = 0; i < 3; i++) p.record(p.nextTrial(), true);
  ok(p.state().stage.id === 'hold', 'partial window does not advance');
  const r = p.record(p.nextTrial(), true);
  ok(r.advanced && p.state().stage.id === 'xfer', 'full window at pass rate advances');
}

console.log('failing a stage re-runs it rather than passing you through');
{
  const p = mk();
  p.record(p.nextTrial(), true); p.record(p.nextTrial(), true);
  for (let i = 0; i < 4; i++) p.record(p.nextTrial(), false);
  ok(p.state().stage.id === 'hold', 'stage 2 not cleared by 0/4');
  ok(p.state().trial === 0, 'trial counter recycled for another pass at it');
}

/* ---------- transfer stage properties ---------- */
console.log('random stage interleaves and thins KR');
{
  const p = mk();
  p.record(p.nextTrial(), true); p.record(p.nextTrial(), true);
  for (let i = 0; i < 4; i++) p.record(p.nextTrial(), true);
  ok(p.state().stage.id === 'xfer', 'reached transfer');

  const seen = [], krs = [];
  let repeats = 0, prev = null;
  for (let i = 0; i < 10; i++) {
    const t = p.nextTrial();
    ok(t.concurrent === false || i > 0, 'transfer never shows the live meter');
    if (prev !== null && t.target === prev) repeats++;
    prev = t.target;
    seen.push(t.target); krs.push(t.kr);
    p.record(t, true);
  }
  ok(new Set(seen).size === 3, 'all three targets appear');
  ok(repeats === 0, 'no target repeats back-to-back (real contextual interference)');
  ok(krs.filter(Boolean).length === 6, 'KR delivered on 6/10 reps (~55%)');
}

/* ---------- retention probes ---------- */
console.log('retention probes');
{
  const store = memStore();
  let clock = 1000;
  const p = Practice.create({ key: 'test', stages: STAGES, store, rng: lcg(7), now: () => clock });
  p.record(p.nextTrial(), true); p.record(p.nextTrial(), true);
  ok(p.state().stage.id === 'hold', 'progressed before the break');

  ok(p.beginSession() === false, 'no probe without a real time gap');
  clock += 60 * 60 * 1000;                               // an hour later
  ok(p.beginSession() === true, 'a fresh session arms a probe');

  const t = p.nextTrial();
  ok(t.probe === true && t.concurrent === false && t.kr === false, 'the probe is unfed on both channels');

  const before = p.state().passes;
  p.record(t, false);
  ok(p.state().passes === before, 'a failed probe does not dent stage progress');
  ok(p.state().trial === 0, 'a probe does not consume a stage trial');
  ok(p.retentionRate() === 0, 'failed probe logged as 0% retention');

  clock += 60 * 60 * 1000; p.beginSession();
  p.record(p.nextTrial(), true);
  ok(p.retentionRate() === 0.5, 'retention rate averages over probes only');
  ok(p.state().stage.id === 'hold', 'probes never advance a stage');
}

/* ---------- persistence ---------- */
console.log('persistence across reloads');
{
  const store = memStore();
  const a = Practice.create({ key: 'test', stages: STAGES, store, rng: lcg(7), now: () => 1000 });
  a.record(a.nextTrial(), true); a.record(a.nextTrial(), true);
  const b = Practice.create({ key: 'test', stages: STAGES, store, rng: lcg(7), now: () => 1000 });
  ok(b.state().stage.id === 'hold', 'a reload resumes on the same stage');
  b.reset();
  ok(b.state().stage.id === 'find', 'reset returns to stage 1');
  ok(Practice.create({ key: 'test', stages: STAGES, store, now: () => 1000 }).state().stage.id === 'find',
     'reset is persisted, not just in-memory');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
