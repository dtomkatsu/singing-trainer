# PITCH-TRACKING.md — what the tracker is, what was tried, what got shipped

Written August 2026. This is the engineering companion to RESEARCH.md §4 and §12:
why the pitch tracker is built the way it is, what a neural replacement would
actually cost, and what measuring instead of guessing changed.

---

## 1. What is running now

| Stage | Implementation |
|---|---|
| Pitch (live) | McLeod Pitch Method — NSDF via FFT autocorrelation, parabolic interpolation, 2048-sample window @ device rate. Frame-independent, because the live path must be causal. |
| Pitch (offline) | Same NSDF, but each frame emits its **top 5 candidates**, and a **Viterbi decode** picks the path. |
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

### 3b. CPPS (`Metrics.cpps`)

HNR is derived from the pitch detector's own NSDF peak, so the measurement and
the thing it measures **share a failure mode**: a frame where tracking struggles
reports "breathy" whether or not the voice was. CPPS is read off the cepstrum
and never consults f0. It deliberately does not gate on `track.f0 > 0`, since
filtering by the tracker's voicing decision would reintroduce the coupling.

Measured against synthesized voice with increasing additive breath noise:

| breath fraction | CPPS dB | HNR dB | cepstral f0 (true 196 Hz) |
|---|---|---|---|
| 0.00 | 13.03 | 40.0 | 195.9 |
| 0.05 | 11.09 | 26.1 | 195.9 |
| 0.12 | 10.31 | 17.8 | 196.7 |
| 0.25 | 8.67 | 10.1 | 196.7 |
| 0.40 | 6.97 | 4.2 | 195.1 |

The cepstral peak recovers f0 to within a few cents *even at breath = 0.40 where
HNR has collapsed to 4.2 dB* — which is the independence claim, demonstrated.

Report bands (`good ≥ 11`, `okay ≥ 8`) are calibrated on **this implementation**.
CPPS absolute values shift with log-spectrum convention, smoothing widths and
regression band, so clinical thresholds do not port. Provisional until checked
against real takes.

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
                           viterbi     98.6%    0.0%    1.4%
SNR ~0 dB                  median-5    76.3%    0.0%   23.7%
                           viterbi     79.1%    3.6%   20.9%
fading sustain             median-5    94.9%    0.0%    5.1%
                           viterbi     95.4%    0.0%    4.6%
fast melisma 12 n/s        median-5    89.6%    0.0%   10.4%
                           viterbi     89.6%    0.0%   10.4%
breath interruptions       median-5   100.0%    0.0%    0.0%
                           viterbi    100.0%    0.0%    0.0%
interval leaps             median-5   100.0%    0.0%    0.0%
                           viterbi    100.0%    0.0%    0.0%
mean RPA   median-5 94.0%   →   viterbi 94.7%
```

**+0.7 points, not a transformation.** Honest reading:

- The gain is real but modest, concentrated in the jittery and low-SNR cases.
- It introduces a 3.6% octave-error rate at 0 dB SNR that the median filter did
  not have. 0 dB is absurd for a close mic, but it is a real regression.
- **Melisma is unchanged (89.6% both).** That ceiling is the 42.7 ms window, not
  the decoder — no amount of decoding fixes 12 notes/sec against that window.
  If the R&B drills need better, the fix is a shorter window plus a
  higher-resolution f0 method, not a smarter path search.
- Cost is +1% wall clock, so the trade is cheap even at this size of win.

The original scope called Viterbi "the highest-value upgrade available." That
was an overstatement, and only building the eval harness first exposed it.

### Two bugs the harness caught in itself

Worth recording, because both produced confident, wrong conclusions:

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

---

## 5. If the tracker needs to get better

In rough order of value per unit of effort:

1. **Shorten the analysis window for the melisma path.** The 89.6% ceiling is
   the clearest measured deficiency in the app, and it is a windowing problem.
2. **Get real ground truth.** Every number here is synthetic. Synthetic tones
   have cleaner NSDF structure than real voice, which probably *understates*
   the Viterbi benefit and definitely understates absolute error rates. A few
   labelled real takes would be worth more than any further tuning.
3. **Only then consider a neural tracker**, and only for Compare-mode imported
   audio — see §2 for why it cannot serve the live or report paths.

## Running the tools

```bash
node tests/dsp.test.js      # correctness — 41 checks
node tests/eval-pitch.js    # accuracy — RPA / octave / gross, both decoders
```
