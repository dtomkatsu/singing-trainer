# Singing Trainer

Evidence-based pitch and tone training that runs entirely in the browser — built for iPhone
Safari, hosted as static files on GitHub Pages, no accounts, no uploads, no build step.

**▶ Live:** https://dtomkatsu.github.io/singing-trainer/

## What it does

| Page | What happens |
|---|---|
| **Voice report** | Sing one sustained "ahh"; get measured on pitch steadiness, micro-stability, breathiness (HNR), vibrato (rate/extent), and resonance (singing power ratio + singer's-formant band energy) — then a ranked list of *your* weaknesses, each mapped to the exercise with the best evidence for fixing it. |
| **Live tuner** | Real-time note + cents needle, scrolling pitch trace, and a spectrum view with the 2.4–3.4 kHz "ring" band highlighted so you can watch resonance appear as you adjust. |
| **Ring trainer** | A four-stage twang ladder that actually trains resonance instead of describing it. Every take can be replayed plain or **“with ring”** — the same audio through a +10 dB peak at 2.9 kHz, i.e. your own voice with the resonance you’re hunting (measured ≈ +6.7 dB SPR; playback-only, since altered live feedback perturbs the voice). The target is an *adaptive* level above your own per-vowel baseline — a weighted up-down staircase that converges wherever you succeed ~70% of the time, so how many dB you can hold is the progress number rather than whether you passed. Stage 1 is a continuous hunt with the meter live; the meter is withdrawn at stage 3 and knowledge-of-results thinned to 55% at stage 4, because that is the schedule that produced retention rather than a good in-session score. |
| **Exercises** | Note matching, **blind** matching (trace hidden until after — the mode that makes gains stick), sirens, and interval leaps. Calibrates to your comfortable range first. |
| **Compare** | Load a reference melody — record it yourself or import an isolated-vocal file — sing it back, and see both contours DTW-aligned with a transposition-tolerant score. |
| **Warm-up** | Guided straw-phonation (SOVT) routine with a before/after spectral measurement so you can watch it work. |
| **Styles** | Style-specific guidance and drills — how to sound more R&B (runs, bends, late vibrato), and how targets differ by genre. Includes a **breathiness dial**: two takes, airy then closed, measuring how much fold-closure range you actually command via H1–H2 — reported as a contrast only, because absolute H1–H2 is too individually variable to threshold. |

## The science

Every design choice traces to the literature — see **[RESEARCH.md](RESEARCH.md)** (citations,
thresholds, caveats) and **[STYLE-GUIDE.md](STYLE-GUIDE.md)** (genre acoustics). The short version:

- Real-time visual pitch feedback demonstrably accelerates pitch accuracy (Welch 1989; Wilson 2008;
  Berglin 2022) — but constant feedback breeds dependency, so blind trials are built in.
- Most "bad singers" have intact ears and a trainable voice-motor mapping problem (Hutchins &
  Peretz 2012); gains typically show within 4–8 short sessions.
- Resonance is measurable: the singer's-formant band (Sundberg) and singing power ratio (Omori 1996)
  drive the ring meter and report.
- Straw phonation is the best-evidenced tone exercise (Titze 2006) and its effect is immediately
  measurable — the warm-up page proves it to you.
- Short daily sessions, audiation before singing, and listening back to recordings all carry
  meta-analytic support (d ≈ 0.5 each).

## Architecture

Plain HTML + vanilla JS, no dependencies, no build:

```
index.html            the whole app: one page, eight modes
                       (home / tuner / report / ring / drills / compare / warm-up / styles),
                       hash-routed with animated transitions; the mic is granted
                       once and stays live across modes
tuner.html ...         redirect stubs so old deep links keep working
style.css
js/dsp.js              McLeod pitch detection + Viterbi decode, FFT, voice metrics, DTW, WAV
js/mic.js              iOS-safe mic capture, PCM recorder, tone player
js/ui.js               canvas helpers, localStorage
js/practice.js         motor-learning practice schedules: blocked→random structure,
                       KR fading, retention probes (see RESEARCH.md §8)
tests/dsp.test.js      node tests/dsp.test.js
tests/practice.test.js node tests/practice.test.js
tests/eval-pitch.js    synthetic pitch-accuracy harness
tests/eval-real.js     vocadito (real annotated singing) harness
tests/eval-mir1k.js    MIR-1K harness
```

Engineering notes (the iOS-specific reasoning is in RESEARCH.md §12): pitch detection is a
hand-rolled McLeod Pitch Method (NSDF + parabolic interpolation, 2048-sample windows) polled from
an `AnalyserNode` at display rate; recording taps raw Float32 PCM through an `AudioWorklet`
(ScriptProcessor fallback) so analysis runs on exactly what was recorded; the AudioContext is
created inside the mic-permission gesture, resumed on visibility/tap after iOS interruptions, and
holds a screen wake lock during sessions.

## Tests

```bash
node tests/dsp.test.js && node tests/practice.test.js
```

Synthesized-signal tests: pitch accuracy within 10¢ across 82–880 Hz, octave-error resistance,
vibrato rate/extent extraction, HNR separation of clean vs noisy tone, SPR separation of ringy vs
dull spectra (including that SPR is invariant to a constant gain, and that the live and offline
paths return the identical number), DTW transposition detection, plus a syntax check of every
page's inline script.

The practice-schedule tests assert the properties that make the schedule an intervention rather
than decoration: KR really is withheld at the stated proportion, random stages really do avoid
back-to-back repeats, and retention probes really are unfed and really don't move stage progress.

## Privacy

The microphone feeds a signal analyzer running on the page. Audio never leaves the device;
recordings live in memory (and the last comparison reference in the browser's IndexedDB).
