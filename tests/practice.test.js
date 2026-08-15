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

/* ---------- practising past the end ---------- */
console.log('practiceAgain');
{
  const store = memStore();
  const p = Practice.create({ key: 'test', stages: STAGES, store, rng: lcg(7), now: () => 1000 });
  ok(p.practiceAgain() === false, 'no-op while the ladder is unfinished');
  // Clear every stage: minPasses/passRate are all satisfied by all-passes.
  for (let i = 0; i < 40 && !p.state().complete; i++) p.record(p.nextTrial(), true);
  ok(p.state().complete && p.nextTrial() === null, 'ladder finishes and hands out no trials');

  ok(p.practiceAgain() === true, 'practiceAgain re-opens the ladder');
  const st = p.state();
  ok(!st.complete && st.stage.id === STAGES[0].id, 'it restarts at stage 1');
  ok(st.passes === 0, 'with a fresh trial window');
  const first = p.nextTrial();
  ok(first != null && first.probe === true, 'and the first rep is a cold probe');
  ok(first.kr === false && first.concurrent === false, 'that probe is unfed on both channels');
  p.record(first, true);
  const after = p.state();
  ok(after.passes === 0 && after.stage.id === STAGES[0].id && after.retention.length === 1,
     'the probe logs to retention and leaves stage 1 untouched');
  ok(p.nextTrial().probe === false, 'the rep after it is a normal stage-1 trial');
  ok(p.state().history.length > 0, 'history survives — it is not a reset');
  ok(Practice.create({ key: 'test', stages: STAGES, store, now: () => 1000 }).state().complete === false,
     'and it is persisted across a reload');
}

/* ---------- adaptive staircase ---------- */
console.log('Practice.staircase');
{
  const s = Practice.staircase({ start: 2, step: 0.7, successRate: 0.7 });
  ok(Math.abs(s.steps.up - 0.3) < 1e-9 && Math.abs(s.steps.down - 0.7) < 1e-9,
     'step sizes solve p = down/(up+down) for p=0.7 (up 0.3, down 0.7)');

  s.record(true);
  ok(Math.abs(s.value() - 2.3) < 1e-9, 'a success raises the level by the up step');
  s.record(false);
  ok(Math.abs(s.value() - 1.6) < 1e-9, 'a failure lowers it by the larger down step');

  const clamped = Practice.staircase({ start: 2, min: 0.5, max: 5 });
  for (let i = 0; i < 50; i++) clamped.record(false);
  ok(clamped.value() === 0.5, 'floors at min — always asks for *some* lift over baseline');
  for (let i = 0; i < 200; i++) clamped.record(true);
  ok(clamped.value() === 5, 'ceils at max');

  ok(Practice.staircase({ start: 99, max: 12 }).value() === 12, 'start is clamped into range');
  const r = Practice.staircase({ start: 2 }); r.set(4.25);
  ok(r.value() === 4.25, 'set() restores a persisted level');
  r.set('nonsense'); ok(r.value() === 4.25, 'set() ignores non-numbers');

  // The convergence property this is chosen for: simulate a singer whose true
  // ability is a fixed dB lift, and confirm the level settles near it rather
  // than sitting wherever a hard-coded constant was put.
  const ABILITY = 4.0;                       // can reliably produce +4 dB
  const st = Practice.staircase({ start: 0.5, step: 0.7, successRate: 0.7 });
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const levels = [];
  for (let i = 0; i < 600; i++) {
    // pass probability falls off as the demanded level exceeds true ability
    const pPass = 1 / (1 + Math.exp((st.value() - ABILITY) / 0.6));
    st.record(rand() < pPass);
    if (i >= 300) levels.push(st.value());
  }
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  ok(Math.abs(mean - ABILITY) < 1.0,
     `converges near true ability (settled at ${mean.toFixed(2)} dB vs ${ABILITY} dB)`);
  ok(mean < ABILITY, 'settles just below ability, as a 70%-success target should');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
