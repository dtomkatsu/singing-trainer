// practice.js — motor-learning practice schedules.
//
// Why this exists as its own module rather than ad-hoc logic inside a trainer:
// the strongest finding in the voice motor-learning literature is that *how you
// schedule practice and feedback* matters more than which drill you pick.
//
// Steinhauer & Eichhorn 2025 (J Voice) taught 92 adults (55–80; hypophonic,
// novice and expert vocalists) a novel voice task — twang, i.e. exactly the
// resonance skill the Ring trainer targets — crossing practice structure
// (blocked vs random) with knowledge-of-results frequency (100% vs 55%):
//
//   blocked + 100% KR  ->  best acquisition in-session, DEGRADED retention
//   random  +  55% KR  ->  worse in-session, BEST retention and transfer
//
// "100% KR paired with Blocked practice increased motor performance, but
// degraded motor learning." That is the guidance hypothesis (Salmoni, Schmidt &
// Walter 1984) measured on a voice task, and it means a trainer that shows the
// meter on every rep forever is training screen-watching, not singing.
//
// So a schedule here is a ladder: start blocked with full feedback so the
// learner can find the sensation at all, then withdraw concurrent feedback,
// then interleave targets and thin KR to 55% for the reps that actually stick.
//
// Two feedback channels are modelled separately, because the study manipulated
// only the second and conflating them would misstate it:
//   concurrent — the live meter *during* the trial
//   kr         — the result shown *after* the trial
//
// Retention is measured, not assumed: the first trial of each new session is an
// unfed probe whose result is logged separately and never counts toward stage
// progress. That number, not the in-session score, is the one that means
// something.

'use strict';

const Practice = (() => {
  const DEFAULT_PASS = 0.7;
  const SESSION_GAP_MS = 30 * 60 * 1000;      // a fresh session after 30 min idle

  /** In-memory fallback so the module runs under Node with no localStorage. */
  function memStore() {
    const m = {};
    return { get: (k, d) => (k in m ? m[k] : d), set: (k, v) => { m[k] = v; } };
  }

  /** Fisher–Yates over a copy. */
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Exactly-proportioned KR schedule: round(kr * trials) trues, shuffled.
   * Drawing each trial independently would let a 55% stage hand out nine
   * feedback-free reps in a row by luck; a fixed proportion can't.
   */
  function krPlan(trials, kr, rng) {
    const on = Math.round(kr * trials);
    const plan = [];
    for (let i = 0; i < trials; i++) plan.push(i < on);
    return shuffle(plan, rng);
  }

  /**
   * @param spec {{
   *   key: string,                  storage namespace
   *   passRate?: number,            fraction of the trial window needed to advance
   *   store?: {get,set},            defaults to in-memory
   *   now?: () => number,
   *   stages: Array<{
   *     id: string, name: string, brief?: string,
   *     structure: 'blocked'|'random',
   *     concurrent: boolean,        live meter visible during the trial
   *     kr: number,                 0..1 probability of post-trial result
   *     trials: number,
   *     targets: Array<any>,
   *     passRate?: number,
   *     minPasses?: number          alternative gate: N successes, order-free
   *   }>
   * }}
   */
  function create(spec) {
    const stages = spec.stages;
    const store = spec.store || memStore();
    const now = spec.now || (() => Date.now());
    const key = 'practice.' + spec.key;
    const rng = spec.rng || Math.random;

    const blank = {
      stage: 0, trial: 0, window: [], plan: null,
      history: [], retention: [], lastAt: 0, probePending: false, lastTarget: null,
    };
    let st = Object.assign({}, blank, store.get(key, {}));
    const save = () => store.set(key, st);

    const complete = () => st.stage >= stages.length;
    const stage = () => (complete() ? null : stages[st.stage]);

    function ensurePlan() {
      const s = stage();
      if (!s) return;
      if (!st.plan || st.plan.length !== s.trials) st.plan = krPlan(s.trials, s.kr, rng);
    }

    /**
     * Call when the view is opened. If enough time has passed since the last
     * trial and there is something learned to probe, the next trial is an
     * unfed retention check.
     */
    function beginSession() {
      if (st.stage > 0 && !complete() && now() - st.lastAt > SESSION_GAP_MS) {
        st.probePending = true;
        save();
      }
      return st.probePending;
    }

    /** Pick the target for the current trial index under the stage's structure. */
    function pickTarget(s) {
      const t = s.targets;
      if (t.length === 1) return t[0];
      if (s.structure === 'blocked') {
        // All reps of one target, then all reps of the next.
        const per = Math.max(1, Math.ceil(s.trials / t.length));
        return t[Math.min(t.length - 1, Math.floor(st.trial / per))];
      }
      // Random = high contextual interference. Avoid an immediate repeat so
      // consecutive trials actually force a switch.
      let pick = t[Math.floor(rng() * t.length)];
      if (t.length > 1 && pick === st.lastTarget) {
        pick = t[(t.indexOf(pick) + 1 + Math.floor(rng() * (t.length - 1))) % t.length];
      }
      return pick;
    }

    /** @returns null when the ladder is finished, else the next trial descriptor. */
    function nextTrial() {
      if (complete()) return null;
      ensurePlan();
      const s = stage();
      const probe = st.probePending;
      return {
        stageIndex: st.stage,
        stage: s,
        target: pickTarget(s),
        // A probe is by definition unfed on both channels.
        concurrent: probe ? false : s.concurrent,
        kr: probe ? false : st.plan[Math.min(st.plan.length - 1, st.trial)],
        probe,
        n: st.trial + 1,
        of: s.trials,
      };
    }

    /**
     * Record a completed trial. `pass` is the trainer's own criterion.
     * @returns {{probe, advanced, complete, passes, needed}}
     */
    function record(trial, pass, detail) {
      const s = stage();
      if (!s) return { probe: false, advanced: false, complete: true, passes: 0, needed: 0 };
      st.lastAt = now();
      st.lastTarget = trial.target;

      if (trial.probe) {
        // Probes measure retention of the *previous* session's learning and
        // deliberately do not move stage progress in either direction.
        st.probePending = false;
        st.retention.push({ t: st.lastAt, stage: s.id, pass: !!pass, detail: detail || null });
        st.retention = st.retention.slice(-60);
        save();
        return { probe: true, advanced: false, complete: false, passes: passCount(), needed: needed(s) };
      }

      st.trial++;
      st.window.push(!!pass);
      if (st.window.length > s.trials) st.window = st.window.slice(-s.trials);
      st.history.push({ t: st.lastAt, stage: s.id, target: String(trial.target), pass: !!pass, detail: detail || null });
      st.history = st.history.slice(-300);

      let advanced = false;
      if (met(s)) {
        st.stage++; st.trial = 0; st.window = []; st.plan = null;
        advanced = true;
      } else if (st.trial >= s.trials) {
        // Ran the stage without clearing the bar — refresh the KR schedule and
        // keep going rather than forcing a pass. The window is rolling, so the
        // next success can still clear it.
        st.trial = 0; st.plan = null;
      }
      save();
      return { probe: false, advanced, complete: complete(), passes: passCount(), needed: needed(s) };
    }

    const passCount = () => st.window.filter(Boolean).length;
    const needed = (s) => (s.minPasses != null ? s.minPasses
      : Math.ceil((s.passRate != null ? s.passRate : spec.passRate != null ? spec.passRate : DEFAULT_PASS) * s.trials));

    /** Stage cleared? Either N successes outright, or pass-rate over a full window. */
    function met(s) {
      if (s.minPasses != null) return passCount() >= s.minPasses;
      return st.window.length >= s.trials && passCount() >= needed(s);
    }

    function state() {
      const s = stage();
      return {
        stageIndex: st.stage, stage: s, complete: complete(),
        trial: st.trial, passes: passCount(), needed: s ? needed(s) : 0,
        probePending: st.probePending,
        retention: st.retention.slice(), history: st.history.slice(),
      };
    }

    /** Retention rate over the last n probes — the number that actually matters. */
    function retentionRate(n = 10) {
      const r = st.retention.slice(-n);
      if (!r.length) return null;
      return r.filter((x) => x.pass).length / r.length;
    }

    function reset() { st = Object.assign({}, blank, { history: [], retention: st.retention }); save(); }

    /**
     * Run the whole ladder again from stage 1 once it is finished.
     *
     * Finishing is a teaching milestone, not a daily quota: without this the
     * only route back into a trial is reset(), which throws away the baselines
     * and adapted levels the run produced. This keeps every measurement and
     * only rewinds the schedule.
     *
     * The first rep is a cold probe, exactly as it would be on the intended
     * next-day return — there is a full ladder's worth of learning to test, and
     * the probe is unfed and doesn't count toward stage 1, so it reads "show me
     * what stuck" before the feedback comes back on.
     *
     * Available at any point, not only at the finish: being part-way up the
     * ladder is exactly when you might want to take it from the top, and the
     * alternative — reset() — costs the measurements.
     *
     * @returns {boolean} true if a probe was armed, i.e. there was prior
     *   learning to test. A restart from a standing start has nothing to probe.
     */
    function practiceAgain() {
      const learned = complete() || st.stage > 0 || st.history.length > 0;
      st.stage = 0;
      st.trial = 0; st.window = []; st.plan = null; st.probePending = learned;
      save();
      return learned;
    }

    return { nextTrial, record, state, retentionRate, beginSession, reset, practiceAgain, stages };
  }

  /**
   * Weighted up-down staircase (Kaernbach 1991, "Simple adaptive testing with
   * the weighted up-down method") — an adaptive difficulty level that converges
   * on a chosen success rate instead of a fixed constant.
   *
   * Why the Ring trainer needs this: its target was originally "your baseline
   * +6 dB", a number lifted from Omori's *between-groups* gap between trained
   * singers and untrained people. That is the product of years of training, so
   * using it as a within-session target asked people to sound like a trained
   * singer immediately. Nothing in the literature supports a fixed
   * within-session figure, so the honest move is to stop guessing one and let
   * the target find its own level from what the singer actually produces.
   *
   * At equilibrium the expected step is zero, so with success → harder and
   * failure → easier:  p·up = (1−p)·down,  i.e.  p = down / (up + down).
   * Fixing `down = step` and `up = step·(1−p)/p` lands the level where the
   * singer succeeds `successRate` of the time.
   *
   * Note the consequence, which is a feature: because this converges on the
   * same 0.7 the stage gate requires, stages will advance for anyone who does
   * the reps. Progression is no longer the measure of skill — `value()` is.
   * How many dB above your own baseline you can hold *is* the progress number.
   */
  function staircase(spec = {}) {
    const successRate = spec.successRate != null ? spec.successRate : 0.7;
    const step = spec.step != null ? spec.step : 0.7;
    const min = spec.min != null ? spec.min : 0.5;
    const max = spec.max != null ? spec.max : 12;
    const down = step;
    const up = step * (1 - successRate) / successRate;
    let v = Math.min(max, Math.max(min, spec.start != null ? spec.start : 2));

    return {
      value: () => v,
      /** @returns the new level after a scored attempt. */
      record(pass) {
        v = Math.min(max, Math.max(min, v + (pass ? up : -down)));
        return v;
      },
      /** Restore a persisted level. */
      set(n) { if (typeof n === 'number' && isFinite(n)) v = Math.min(max, Math.max(min, n)); return v; },
      steps: { up, down, successRate },
    };
  }

  return { create, krPlan, shuffle, staircase };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Practice };
