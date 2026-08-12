# PITCH-TRACKING.md — what the tracker is, what was tried, what got shipped

Written August 2026. This is the engineering companion to RESEARCH.md §4 and §12:
why the pitch tracker is built the way it is, what a neural replacement would
actually cost, and what measuring instead of guessing changed.

---

## 1. What is running now

| Stage | Implementation |
|---|---|
| Pitch (live) | McLeod Pitch Method — NSDF via FFT autocorrelation, parabolic interpolation, 2048-sample window @ device rate. Frame-independent, because the live path must be causal. |
| Pitch (offline) | Same NSDF, but each frame emits candidates from **two co-centred windows** (2048 + 1024), and a **Viterbi decode** picks the path. |
| Breathiness | **CPPS** (primary) + autocorrelation HNR (second opinion). |
| Resonance | SPR, singer's-formant band energy, spectral tilt — FFT band measures. |
| Comparison | DTW with Sakoe-Chiba band, median-offset key estimation. |

Measured baseline (Apple M4, `node`):

```
Pitch.detect, one 2048-frame     0.13 ms   → 0.76% of a 60 fps budget
Track.analyze, 30 s take         360 ms    → 84x realtime
  + Viterbi decode               364 ms    → +1%
```

---

## 2. CREPE-tiny: evaluated, rejected

CREPE (Kim et al. 2018) is the strongest published monophonic pitch tracker and
is already cited in RESEARCH.md's bibliography. The question was whether the
`tiny` variant could run in a phone browser.

Derived from the real weights (`torchcrepe/model.py` + `tiny.pth`). The param
count below is confirmed by the checkpoint being exactly 1,962,363 bytes, and
the layer trace by the declared `in_features = 256`:

| | CREPE-tiny | current MPM |
|---|---|---|
| Weights | 487K params · **1.87 MB** fp32 (~0.5 MB int8) | 0 |
| Arithmetic / frame | **36.8M MACs (~74 MFLOP)** | ~0.5 MFLOP |
| Analysis window | 1024 @ 16 kHz = **64 ms** | 2048 @ 48 kHz = **42.7 ms** |
| Output | 360 bins over 6 octaves = **20 ¢/bin** | continuous |

**~150× the arithmetic per frame.** At a realistic 2–4 GFLOP/s for
single-threaded WASM SIMD on a recent iPhone that is 20–40 ms per frame:

- **Live tuner @ 60 fps** — impossible; feasible only at ~20 Hz updates, which
  is the place precision matters least (it is a visual trace).
- **Voice Report / Compare offline** — a 30 s take is 2809 frames →
  **60–110 seconds**. That is the flagship feature, and it is where CREPE is
  unaffordable.

The cost lands where the value isn't.

### Three things that would break

1. **HNR dies.** `Metrics.hnr()` computes `10·log10(r/(1−r))` where `r` is the
   NSDF peak. CREPE emits a 360-bin softmax; its confidence is classifier
   confidence, **not** a harmonicity ratio, and substituting it into Boersma's
   formula is meaningless. `clarity` is also the voicing gate at six call sites.
   So the entire NSDF path stays anyway — CREPE is *purely additive* cost.
2. **Time resolution gets worse.** 64 ms window vs 42.7 ms. That is a downgrade
   for vibrato extent (5–7 Hz ⇒ 143–200 ms period) and for the melisma drills in
   `styles.html` — exactly the fast-movement cases.
3. **20-cent quantization.** The report grades pitch drift at **≤15 ¢**. Without
   correctly implementing local-centroid decoding around the argmax, CREPE
   cannot resolve the metric it is meant to improve.

### Two deployment blockers

- **GitHub Pages cannot set COOP/COEP headers** ⇒ no `SharedArrayBuffer` ⇒ no
  multi-threaded WASM. Single-thread only, unless hosting moves or a
  `coi-serviceworker` shim ships.
- **It breaks the stated architecture.** The README promises "static files on
  GitHub Pages, no build step." This needs PyTorch→ONNX→quantize conversion, a
  vendored multi-MB runtime, and a bundler. That is a values decision, not just
  a technical one.

### Where it would still earn a place

Narrow, and none of it is the main flow: imported reference stems in Compare
mode (hard input, offline, progress bar tolerable), very breathy or quiet
singing, and voices near the 60/1200 Hz edges. Note that the app's primary task
— sustained /a/, comfortable pitch, medium-loud, close mic — is the *best* case
for autocorrelation and therefore the smallest possible gap.

**Addendum, Aug 2026:** surveyed the newer crop (FCPE and others from the 2025
SVC literature, claiming real-time factors as low as 0.0062) while scoping
whether "cutting-edge tech" had anything to offer resonance training. None of
it changes the verdict above — the blockers are the deployment constraints
(no SharedArrayBuffer on GitHub Pages, no-build-step architecture) and the
HNR/time-resolution/quantization regressions, not raw model speed, and a
faster model doesn't touch any of those. See RESEARCH.md §4d for the fuller
survey (formant feedback, neural voice conversion) this came out of.

---

## 3. What shipped instead

### 3a. Viterbi decoding (`Track.viterbi`)

pYIN's contribution over YIN (Mauch & Dixon 2014). Each frame emits its top 5
NSDF peaks instead of one; a Viterbi pass picks the cheapest path.

```
emission   = WEIGHT · (1 − clarity)          bounded, so noisy frames stay affordable
transition = LAMBDA · semitones, capped at 12
unvoiced   = WEIGHT · (1 − 0.3)              the legacy detect() clarity cutoff, priced
```

The transition cap is the mechanism. A real melodic leap pays it once and then
stays cheap; a spurious octave blip pays it twice — out and back — so the
continuous path wins. That asymmetry, not raw distance, is what kills octave
errors.

### 3a-ii. The dual-window lattice

Profiling the melisma case frame-by-frame showed **every error within 10 ms of
a note boundary** (72.7% error at 0–5 ms from the boundary, 0.0% beyond 10 ms):
the 42.7 ms window straddles two notes and averages them. A shorter window
halves the contaminated zone — but measured globally, a 1024 window collapses
on low pitch + noise (82.4 Hz at moderate noise: 91% → 48% RPA), because a
583-sample period barely fits it. The window trade-off is pitch-dependent, so
no single window wins.

Resolution: each frame contributes candidates from **both** the 2048 window and
a co-centred 1024 window, and the decoder picks per frame. Short-window
candidates are gated — admitted only when their clarity is at least equal to
the long window's best (`shortGate: 1.0`), which is exactly the situation at a
transition, where the long window is smeared and the short one is not.
Ungated, junk short-window peaks cost ~1 point at 0 dB SNR; the gate recovers
it at zero cost to any melisma case (measured across gate 0–1.1; 1.1 starts
sacrificing melisma for noise robustness).

### 3b. CPPS (`Metrics.cpps`)

HNR is derived from the pitch detector's own NSDF peak, so the measurement and
the thing it measures **share a failure mode**: a frame where tracking struggles
reports "breathy" whether or not the voice was. CPPS is read off the cepstrum
and never consults f0. It deliberately does not gate on `track.f0 > 0`, since
filtering by the tracker's voicing decision would reintroduce the coupling.

The cepstral peak doubles as an f0 estimate reached without the tracker, and it
stays within a few cents of truth *even where HNR has collapsed to 4.2 dB* —
which is the independence claim, demonstrated rather than asserted.

CPPS dB across the vocal range and increasing breath noise (window 4096):

| f0 | clean | .02 | .04 | .06 | .10 |
|---|---|---|---|---|---|
| 82.4 | 23.2 | 17.9 | 15.3 | 13.5 | 10.9 |
| 110 | 23.5 | 17.6 | 15.3 | 13.7 | 11.4 |
| 146.8 | 22.3 | 16.6 | 14.5 | 13.2 | 11.0 |
| 196 | 21.1 | 15.5 | 13.7 | 12.2 | 10.2 |
| 261.6 | 20.0 | 13.9 | 12.2 | 10.9 | 9.2 |
| 392 | 18.6 | 11.5 | 9.8 | 8.7 | 7.4 |
| 523 | 18.4 | 9.5 | 8.2 | 7.4 | 6.0 |

Monotonic in breathiness at every pitch, which is what the metric is for.

Report bands (`good ≥ 14`, `okay ≥ 9`) are calibrated on **this
implementation** — CPPS absolute values shift with log-spectrum convention,
smoothing widths and regression band, so clinical thresholds do not port.

**Known limitations**, both left uncorrected on purpose:

1. **Residual f0 dependence.** Read across any row above: at equal breathiness a
   523 Hz voice scores ~8 dB below an 82 Hz one, so high voices get flagged more
   readily than they deserve. Same shape of caveat SPR already carries
   (RESEARCH.md §4: sopranos above ~C5 show no meaningful singer's formant).
   Fitting it away would mean fitting entirely to synthetic voice.
2. **At high f0 *and* low SNR the cepstral peak can land on a sub-rahmonic** —
   measured, 523 Hz breathy resolved its quefrency to 261 Hz and 784 Hz to
   197 Hz. A high voice has few harmonics below 5 kHz, so the rahmonic is
   intrinsically weak and noise can let a sub-rahmonic win. The prominence
   number stays directionally right (both cases read 4.8–7.3 dB, correctly
   "breathy"), but it is measuring the wrong peak. The obvious fix — narrow the
   quefrency search using the tracked f0 — is refused deliberately: that would
   reintroduce the dependence on the pitch tracker that is the entire reason
   CPPS exists alongside HNR. `quefrencyHz` is therefore diagnostic output, not
   a pitch estimate to rely on.

---

## 4. What measuring changed

`tests/eval-pitch.js` scores both decoders against synthesized signals with
known f0, using raw pitch accuracy at the 50 ¢ (quarter-tone) criterion. Every
case is a documented failure mode of autocorrelation trackers; the last is a
guard rail, since a decoder that smooths away real leaps would score well
everywhere else and be useless for the interval drills.

```
case                        decoder    RPA@50¢  octave   gross
steady 220 Hz (control)    median-5   100.0%    0.0%    0.0%
                           viterbi    100.0%    0.0%    0.0%
jitter 3% + noise          median-5    97.1%    0.0%    2.9%
                           viterbi    100.0%    0.0%    0.0%
SNR ~0 dB                  median-5    76.3%    0.0%   23.7%
                           viterbi     96.4%    0.0%    3.6%
fading sustain             median-5    94.9%    0.0%    5.1%
                           viterbi     98.9%    0.0%    1.1%
fast melisma 12 n/s        median-5    89.6%    0.0%   10.4%
                           viterbi     94.6%    0.0%    5.4%
melisma low root 110       median-5    88.1%    0.0%   11.9%
                           viterbi     95.7%    0.0%    4.3%
melisma + noise            median-5    88.5%    0.0%   11.5%
                           viterbi     95.0%    0.0%    5.0%
breath interruptions       median-5   100.0%    0.0%    0.0%
                           viterbi    100.0%    0.0%    0.0%
interval leaps             median-5   100.0%    0.0%    0.0%
                           viterbi    100.0%    0.0%    0.0%
soprano 784 Hz             median-5   100.0%    0.0%    0.0%
                           viterbi    100.0%    0.0%    0.0%
soprano 659 Hz + noise     median-5   100.0%    0.0%    0.0%
                           viterbi    100.0%    0.0%    0.0%
alto 392 Hz                median-5   100.0%    0.0%    0.0%
                           viterbi    100.0%    0.0%    0.0%
mean RPA   median-5 94.5%   →   viterbi 98.4%
```

**+3.9 points overall, +20.1 at 0 dB SNR, +5–8 on every melisma variant, zero
octave errors.** Cost: 345 → 524 ms on a 30 s take (+52% over the median
baseline, still 57× realtime — the second NSDF pass on the 1024 window is most
of it). Reading:

- The clean control and all sustained cases were already at ceiling and stay
  there; the wins concentrate in noisy, unstable, and fast material.
- **The melisma ceiling broke.** An earlier revision of this document called it
  "the clearest measured deficiency in the app" and correctly attributed it to
  the window, not the decoder — the fix was to stop choosing one window
  (§3a-ii). Residual melisma error (~5%) sits inside ±5 ms of note boundaries,
  where the label itself is ambiguous: a window centred 3 ms from a transition
  genuinely contains both notes, and "which note is it" has no single right
  answer at that instant.

An earlier revision of this document reported **+0.7 points** and recommended
shipping the decoder only tentatively. That number was real but it was measuring
a broken lattice: candidates were being ranked by clarity, which at high f0 is a
coin flip between the fundamental and a dozen sub-harmonics. Fixing the ordering
moved the same decoder from +0.7 to +2.6. The conclusion had been drawn from a
correct measurement of the wrong thing.

### Five bugs found while building this

Worth recording, because each produced a confident and wrong conclusion, and
most were in the *measuring apparatus* rather than the code under test:

1. **The RNG was broken.** `seed * 1103515245` exceeds 2^53, so the LCG lost its
   low bits and emitted *periodic* "noise" — which a pitch tracker cheerfully
   locks onto. First run showed Viterbi at 43.5% vs median's 98.9%. That gap was
   entirely an artifact. Now mulberry32.
2. **The parameter sweep passed the wrong key.** It set `subharm`; the code
   reads `subharmCost`. The sweep therefore never varied the sub-harmonic
   penalty and "proved" it had no effect, on the strength of which the guard was
   deleted. It is in fact load-bearing: the NSDF of a periodic signal is ~1.0 at
   *every* multiple of the period, so f0, f0/2 and f0/3 arrive with identical
   clarity and the emission term cannot separate them. Without the guard the
   decoder read a clean 220 Hz tone as **73.3 Hz** (f0/3). There is now a
   regression test.
3. **CPP was taking the raw cepstral maximum**, then subtracting the regression
   line. The line slopes downward with quefrency, so the raw max is biased
   toward short quefrencies — the spectral-envelope lobe. A clean 110 Hz tone
   put its "peak" at the 1000 Hz band edge and reported a falsely low
   prominence. The definition is the maximum of the *residual* above the line.
   Only surfaced because the browser check happened to try a second pitch;
   196 Hz alone had looked perfect.
4. **The synthetic voice had a fixed 6 harmonics.** That makes an 82 Hz tone
   stop at 494 Hz — nothing like a real bass, which has 60 harmonics inside the
   same band. It produced an apparent 7.5→16.9 dB "f0 dependence" in CPPS that
   was almost entirely an artifact of the test signal. Generating harmonics up
   to a fixed 5 kHz ceiling (so harmonic *count* scales inversely with f0, as in
   a real voice) collapsed most of it. The lesson generalises: a synthesis
   shortcut that is invisible at one test frequency becomes the dominant effect
   at another.
5. **The candidate lattice was ranked by clarity.** The NSDF peaks at every
   multiple of the period, so at 784 Hz about 13 sub-harmonics sit inside the
   60 Hz search floor, all at clarity ≈1.0 on a clean tone — and sorting those
   by clarity hands the decision to floating-point noise. 784 Hz decoded as
   87 Hz (f0/9), 392 Hz as 196 Hz. Keeping candidates in ascending-lag order
   preserves MPM's octave rule instead of discarding it, and took the mean from
   94.7% to 98.4%. **The eval set had no case above 440 Hz**, so this was
   invisible until a browser spot-check happened to try 392 and 523 Hz. Every
   whole-number-of-points improvement in this document came after that gap was
   closed.

---

## 5. Real ground truth: vocadito

The former top item here — "every number is synthetic; get real ground truth" —
is done. Evaluation runs against **vocadito** (Bittner et al. 2021, Zenodo
5578807, CC-BY-4.0): 40 solo-vocal excerpts, human-verified f0 on a 5.8 ms
grid, 92,954 voiced frames. `tests/eval-real.js` (the dataset itself is not
vendored — fetch from Zenodo and pass the directory).

**The synthetic conclusions did not survive contact with real voices.** First
real run: median-5 96.48%, the decoder **96.17%** with *double* the octave
errors (1.83% vs 0.90%) — the synthetic +3.9 was a real-world −0.3.

Diagnosis: errors were overwhelmingly octave-**up** (1502 up vs 198 down).
Real modal voices frequently carry **H2 stronger than H1**, so the NSDF's
half-period peak rivals the true-period peak — and the sub-harmonic guard then
penalized the *true fundamental* as if it were the down-ghost of the octave-up
peak. Clean synthetic recipes (H2 = 0.5×H1) can never trigger this, which is
why nothing synthetic ever caught it. Ablation also showed the dual window was
innocent (it *helps* on real voices, +0.5); the decoder's cost model was the
problem.

Two additions fixed it, tuned on a 20-track train split and judged on the
20-track held-out split:

- **Up-ghost guard** (`upGhostCost: 3.0`): the mirror of the sub-harmonic
  guard — penalize a candidate when a comparably-clear candidate sits at an
  integer *fraction* of its frequency. Deliberately **not** confidence-gated:
  gating it to murky frames erased the real-data win, because H2-dominant
  ghosts live on *confident* frames.
- **MPM anchor** (`anchorCost: 0.4`, gated at frame clarity ≥ 0.65): candidates
  other than the one `detect()` would have picked pay a small premium, but only
  on confident frames. This is what protects clean tones from the up-ghost
  guard (on a clean tone every NSDF peak ties at ~1.0, and the guard alone read
  sopranos an octave down) — and the gate is what keeps 0 dB SNR frames free of
  anchoring-to-garbage, which had cost 23 points.

| | RPA | octave | unvoiced-miss |
|---|---|---|---|
| median-5 (all 40 tracks) | 96.48% | 0.90% | 0.68% |
| decoder, pre-tune | 96.17% | 1.83% | 0.70% |
| **decoder, final** | **96.90%** | **0.52%** | 1.60% |
| — train split | 97.45 vs median 96.74 | 0.25 | |
| — held-out split | 96.29 vs median 96.20 | 0.82 vs 1.50 | |

Synthetic suite after retune: mean 97.5% (was 98.4 pre-retune, median baseline
94.5) — the jitter case gave back 8 points and fading 2, the price of the
up-ghost guard firing on near-ties in synthetic jitter. All melisma wins,
soprano cases, and the 0 dB SNR win are intact. Cost: 530 ms on a 30 s take.

**Independent validation — MIR-1K** (`tests/eval-mir1k.js`; Hsu & Jang, 1000
Chinese karaoke clips, 16 kHz, vocals right-channel, human pitch labels,
280,317 voiced frames — different singers, language, recording chain, and
sample rate than either the synthetic suite or vocadito):

| | RPA | octave | unvoiced-miss |
|---|---|---|---|
| median-5 | 87.33% | 0.27% | 0.76% |
| **decoder, final** | **92.27%** | **0.17%** | 1.35% |

**+4.9 points with octave errors down**, and no constant was touched after
vocadito — this is the vocadito-tuned configuration evaluated blind. The gap
between the two datasets is informative: vocadito is clean solo singing where
per-frame MPM is near ceiling (+0.4 available), MIR-1K is amateur karaoke
where cross-frame decoding has real work to do (+4.9). The decoder pays off
exactly where the synthetic stress cases predicted: hard material. The 16 kHz
sample rate also exercised rate-independence — a 2048 window there is 128 ms,
and nothing broke.

**The unvoiced-miss regression, diagnosed and fixed.** The documented guess
("sub-harmonic penalty + low clarity") was half right. Frame-level inspection
of the failures found two distinct mechanisms:

1. **Ghost penalties leaked into the voicing decision.** On breathy modal
   frames every voiced candidate catches some penalty — the true f0 as "ghost"
   of its own strong sub-harmonics (a frame was measured muting a clarity-0.91
   true candidate because its *third* sub-harmonic ran 0.97), the actual
   ghosts from the down-guard — so the whole voiced field priced above
   UNVOICED. The guards exist to rank voiced candidates, not to decide
   voicing. Fix: collect the penalties separately and subtract the per-frame
   minimum. Relative order among voiced candidates is untouched; the
   voiced-vs-unvoiced comparison sees clarity alone.
2. **The absolute RMS silence gate assumed a sensibly-driven mic.** Offline
   analysis now computes a first-pass RMS profile and gates at 5% of the
   take's p90, clamped to [5e-4, 0.005]; the live path is unchanged. Honest
   accounting: this is *robustness hardening without a measured winner* — the
   clip that motivated it (84.5% empty lattice) turned out on closer
   inspection to fail the clarity floor, not the RMS gate (median RMS 0.12,
   whispery vocal with NSDF best < 0.3 on 86.5% of frames — a detector-level
   limit shared by the baseline, which scores 14.7% there). All measured
   gains below belong to fix #1.

Neither fix added a tuning knob. After both:

| | RPA | octave | unvoiced-miss |
|---|---|---|---|
| vocadito: median-5 | 96.48% | 0.90% | 0.68% |
| vocadito: decoder | **98.04%** | 0.74% | **0.20%** |
| MIR-1K: median-5 | 87.33% | 0.27% | 0.76% |
| MIR-1K: decoder | **92.69%** | 0.22% | 0.79% |

vocadito_34 itself: 73.3% → 83.2% (unvoiced-miss 16.1% → 0.6%; its residual
error is now octave confusion on H2-dominant frames, no longer muting).
Synthetic suite rose to 98.0% mean — the normalization also freed the jitter
case from penalty-tie distortion. Cost: 547 ms on a 30 s take.

## 6. If the tracker needs to get better

1. ~~More real data before more tuning~~ — done: MIR-1K validated the
   constants blind (+4.9 over baseline on 280k frames, octave errors down).
2. ~~The breathy-voice unvoiced-miss class~~ — fixed by penalty
   normalization (vocadito unvoiced-miss 1.60% → 0.20%, below the median
   baseline; MIR-1K 1.35% → 0.79%, at baseline). The remaining hard residue
   is different: **whispery, near-aperiodic vocals** whose NSDF never clears
   the 0.3 clarity floor (MIR-1K geniusturtle clips, 19–66% RPA). That is a
   per-frame detector limit the baseline shares — a decoder cannot voice a
   frame the detector never proposes candidates for. This is also the one
   place a neural tracker (§2) has a genuine edge, and it remains not worth
   150× the arithmetic for a handful of pathological recordings.
3. **Only then consider a neural tracker**, and only for Compare-mode imported
   audio — see §2 for why it cannot serve the live or report paths.

(Melisma shipped as the dual-window lattice, §3a-ii. The remaining ~5% melisma
error is boundary-frame label ambiguity, not a windowing problem a tracker can
fix.)

## Running the tools

```bash
node tests/dsp.test.js      # correctness — 41 checks
node tests/eval-pitch.js    # accuracy — RPA / octave / gross, both decoders
```
