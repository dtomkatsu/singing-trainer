# RESEARCH.md — the evidence base behind the Singing Trainer

Compiled August 2026 from peer-reviewed voice-science, music-psychology, and MIR literature.
Every design decision in the app traces back to a finding here. Evidence flags:
**[strong]** replicated / systematic review · **[moderate]** decent controlled studies · **[weak]** pilot or theory-only.

---

## 1. What "in tune" means, and how accurate people actually are

- Pitch error is measured in **cents** (100 ¢ = 1 semitone). Research uses ±50 ¢ (quarter tone)
  as the standard "correct note" criterion; a note >50 ¢ off rounds to the wrong semitone
  (Pfordresher & Brown 2007, *Music Perception*).
- Listeners are more forgiving of voices than instruments (the "vocal generosity effect"):
  ~50 ¢ of deviation needed before non-musicians reliably call a sung tone out of tune, vs ~30 ¢
  for synthetic tones (Hutchins, Roquet & Peretz 2012, *Music Perception*). **[strong]**
- Trained singers hold sustained tones within ~10–20 ¢; untrained-but-accurate singers 20–50 ¢;
  true poor-pitch singers err by 100+ ¢ and compress intervals (Amir et al. 2003 *JASA*;
  Pfordresher et al. 2010 *JASA* — *imprecision* is near-universal, gross *inaccuracy* is not).
- ~60% of adults believe they can't sing; lab testing shows only ~10–15% are truly inaccurate
  at the semitone criterion (Pfordresher & Demorest 2021, *J. Research in Music Education*). **[strong]**

**In the app:** graded scale everywhere — 🎯 ≤25 ¢, ✓ ≤50 ¢, ✗ >50 ¢ — and copy that tells you
the base rate, because miscalibrated self-assessment is the most common finding in this literature.

## 2. Real-time visual feedback works (with one big caveat)

- **SINGAD** (Welch, Howard & Rush 1989, *Psychology of Music*): children given a real-time F0
  trace improved pitch accuracy more than controls; adding a displayed **target** was additive. **[moderate–strong]**
- Wilson, Lee, Callaghan & Thorpe 2008 (*J. Interdisciplinary Music Studies*, 56 adults, Sing&See
  software): traditional + real-time visual feedback beat traditional-only; simpler displays suited
  novices. **[moderate]**
- Berglin, Pfordresher & Demorest 2022 (*Psychology of Music*): in adult poor-pitch singers, **only
  the visual-feedback group improved significantly**. Singing is learnable at any age. **[moderate]**
- Paney 2015 (*Music Education Research*): 10 minutes of a karaoke-game pitch display produced
  measurable immediate gains in non-musicians. **[weak–moderate]**
- **The caveat — guidance hypothesis** (Salmoni, Schmidt & Walter 1984, *Psych Bulletin*): concurrent
  feedback inflates performance *while present* and can suppress retention when removed. No singing
  study shows long-term retention from constant feedback alone.

**In the app:** every trainer has a target line (knowledge of results), and the exercise page has a
first-class **Blind match** mode — sing without the trace, see it after. Train singing, not screen-watching.

## 3. Why people sing off-pitch (it's almost never "tone-deafness")

- True congenital amusia: ~1.5–4% of the population. Most off-pitch singing happens with intact
  perception: Hutchins & Peretz 2012 (*JEP: General*) — poor singers matched pitch fine with a
  hand slider but not with the voice. The bottleneck is the **auditory→vocal-motor mapping**. **[strong]**
- Perceptual ear training alone does **not** transfer to production (Zarate, Delhommeau, Wood &
  Zatorre 2010, *PLOS ONE*: discrimination improved to near-musician level; singing accuracy didn't). **[strong]**
- People match their **own voice's timbre** best, then other voices, then complex tones, then piano
  (Hutchins, Larrouy-Maestri & Peretz 2014; Pfordresher & Mantell 2014, *Cognitive Psychology*).
- Training in a **comfortable pitch range** transfers better (Pfordresher & Greenspon 2025,
  *Musicae Scientiae*). Remediation gains typically arrive within **4–8 short sessions**.
- Auditory **imagery** ability predicts singing accuracy (Greenspon & Pfordresher 2019) — hence
  the "hear it in your head first" step baked into every match trial.

**In the app:** targets use a harmonic-rich (voice-like) tone, placed inside your calibrated range;
exercises follow the evidence ladder sirens → sustained matches → intervals; every trial has an
audiation pause.

## 4. Resonance: the singer's formant and how tone is measured

- Trained (esp. classical male) voices cluster vocal-tract resonances F3–F5 into one peak near
  **2.4–3.2 kHz** — the **singer's formant** (Sundberg 1974 *JASA*; 2001 *J. Voice*) — worth
  10–20 dB extra in the band where ears are most sensitive and orchestras are quiet. **[strong]**
- **Singing Power Ratio (SPR)** — Omori et al. 1996, *J. Voice* 10(3):228–235: strongest spectral
  peak in 2–4 kHz minus strongest in 0–2 kHz (dB). Correlates with perceptual "ring"; singers vs
  non-singers differ by ~5–10 dB. Bands: **> −15 dB strong ring · −15 to −25 moderate · < −25 weak**.
  A 2025 *Frontiers in Psychology* study found SPR + perceived vibrato jointly explain overall
  quality ratings in opera. **[strong measurement basis]**
- Caveats: SPR depends on vowel, pitch and loudness (compare like with like); sopranos above ~C5
  don't show a meaningful singer's formant (Weiss et al. 2001); pop/R&B does not require a classical
  formant cluster — present as "brightness/ring," not right/wrong.
- **Twang** (epilaryngeal narrowing) measurably boosts 2–4 kHz and output level (Lombard &
  Steinhauer 2007, *J. Voice*; MRI confirmation 2024) — the fastest trainable route to ring. **[moderate]**
- Breathiness metrics: **HNR** (harmonics-to-noise ratio, Boersma 1993: `10·log10(r/(1−r))` from the
  normalized autocorrelation peak) — >20 dB clear, 12–20 some noise, <12 distinctly breathy.
  **CPP/CPPS** is the more robust clinical measure. The app now computes both: CPPS is the primary
  breathiness number and HNR is shown as a second opinion. The reason is structural — HNR is derived
  from the pitch detector's own NSDF peak, so the measurement shares a failure mode with the thing it
  measures, while CPPS is read off the cepstrum without ever consulting f0. CPPS absolute values are
  algorithm-dependent, so the bands in §10 are calibrated against this implementation rather than
  lifted from a clinical paper. See PITCH-TRACKING.md.

**In the app:** the tuner's purple band and ring meter, and the report's SPR/singer's-formant rows,
are direct implementations of this literature, with Omori's bands as thresholds.

## 5. SOVT (straw phonation, lip trills) — best-evidenced tone exercise

- Mechanism (Titze 2006, *JSLHR*): a semi-occluded vocal tract raises intraoral pressure and
  inertive reactance → lower phonation threshold pressure, gentler vocal-fold collision, better
  source-filter matching ("vocal economy"). **[strong theory + lab confirmation]**
- Guzman et al. 2013 (*J. Voice*, CT imaging): straw phonation produces epilaryngeal narrowing and
  pharyngeal widening **persisting after the exercise**, with increased formant clustering. **[moderate]**
- 2021 systematic review/meta-analysis (*J. Voice*, 8 RCTs, dysphonia populations): SOVT beats
  controls on F0-related measures; evidence quality rated low — but it's still the best-evidenced
  tone intervention available. Effects are measurable **immediately**, which is why the warm-up page
  has a before/after test.

## 6. Breath support

- Descriptive science is solid (classical singers initiate at higher lung volumes with more abdominal
  contribution — Watson & Hixon 1985; Salomoni et al. 2016 *PLOS ONE*) but successful singers vary
  widely: **there is no single validated "correct" breathing pattern**. **[strong descriptive]**
- Respiratory *strength* training shows weak/equivocal voice benefits (Desjardins & Bonilha 2020
  systematic review, *J. Voice*). **[weak]**

**In the app:** no "diaphragm strengthening" claims. Breath is trained through phonatory tasks the
mic can actually score: sustained-note steadiness and phrase length.

## 7. Vibrato

- Classical norms: **rate 5–7 Hz** (Prame 1994/97 *JASA*: mean ≈ 6 Hz), **extent ±34–123 ¢**
  (typically ±50–100 ¢); regularity distinguishes vibrato from wobble. <4.5 Hz reads as a wobble,
  >7.5–8 Hz as a bleat. **[strong]**
- Trainable over months, indirectly: rates converge toward ~5.2–5.8 Hz across years of training
  (*J. Voice* 2010); **extent is more voluntarily controllable than rate**; it emerges from ease,
  not force. Pop/R&B uses later-onset, narrower, often irregular vibrato (genre study,
  *J. Voice* 2025) — straight tone is a valid stylistic choice.

**In the app:** report measures rate/extent/regularity from the detrended F0 contour (3–9 Hz band);
coaching frames vibrato as emergent, with optional 4-pulses-per-second guided pulsing.

## 8. Practice structure

- **Distributed beats massed**: spacing meta-analysis d = 0.54; plus vocal-load limits argue for
  10–20 min daily sessions. **[moderate]**
- **Mental practice** ≈ d 0.5 vs none (Driskell et al. 1994); auditory imagery predicts accuracy —
  audiation is a first-class exercise step. **[moderate]**
- **Self-listening**: you can't hear yourself accurately while singing (bone conduction); playback
  improves self-assessment (Silveira & Gavin 2016, *Psychology of Music*; "Are You Your Own Best
  Judge?" *J. Voice* 2021). Every recording in the app has a play-back button — use it. **[moderate]**

## 9. Comparing your voice to a reference (karaoke-scoring science)

- Tsai & Lee 2012 (*IEEE TASLP*): pitch (DTW-aligned) + volume + rhythm scoring correlated
  **r = 0.82** with human judges; **pitch dominates**. Interval/relative-pitch scoring matches human
  evaluation similarly well (|r| ≈ 0.76–0.89) and handles users singing in a different key.
- Commercial systems (SingStar/UltraStar) compare **octave-invariantly** with ~±1 semitone tolerance —
  people sing in whatever octave fits their voice.
- Melody extraction from a **full polyphonic mix** in a browser is unreliable; the practical paths
  are (a) sing/hum the reference yourself, (b) use an isolated vocal stem (e.g., produced offline
  with Demucs), or (c) treat full mixes as playback-only.

**In the app:** Compare mode DTW-aligns the two cents contours (Sakoe-Chiba band), estimates the
transposition by median difference, snaps it to semitones, doesn't penalize key choice, and scores
70% time-within-±50¢ + 30% mean-error — the weighting the human-correlation literature supports.

## 10. Metric thresholds used in the Voice Report

| Metric | How computed | Good | Okay | Work on it | Source |
|---|---|---|---|---|---|
| Pitch drift (sustained) | SD of 250 ms-smoothed cents contour | ≤15 ¢ | ≤30 ¢ | >30 ¢ | poor-pitch literature; Praat practice |
| F0 perturbation | frame-to-frame Δf0 (jitter *proxy*) | ≤1.0% | ≤2.5% | >2.5% | Praat local jitter norm 1.04% (true jitter needs cycle marks) |
| Amplitude flutter | frame-to-frame ΔRMS (shimmer proxy) | ≤6% | ≤12% | >12% | Praat shimmer norm 3.8% is for *speech*; singing + vibrato AM runs higher |
| Breathiness (CPPS) | cepstral peak prominence over a regression baseline | ≥11 dB | ≥8 dB | <8 dB | Hillenbrand & Houde 1996; bands calibrated on *this* implementation |
| Clarity (HNR est.) | 10·log10(r/(1−r)), r = NSDF peak | ≥18 dB | ≥12 dB | <12 dB | Boersma 1993; clinical bands |
| Ring (SPR) | peak dB 2–4 kHz − peak dB 0–2 kHz | ≥ −15 dB | ≥ −25 dB | < −25 dB | Omori 1996; Watts 2006 |
| Singer's-formant energy | dB share of 2.4–3.4 kHz vs 50 Hz–5 kHz | ≥ −16 dB | ≥ −22 dB | < −22 dB | Sundberg band; app-calibrated |
| Vibrato | rate/extent/regularity of 3–9 Hz band of detrended contour | 4.5–7.5 Hz, ≤150 ¢ | other | — | Prame; college-major norms |

Caveats owned in the UI: iOS applies gain control that can't be fully disabled, so absolute-level
metrics are avoided; the HNR and jitter values are frame-based estimates, not Praat-equivalent
clinical measures; SPR is vowel/pitch-dependent, so the report asks for the same task every time
(sustained /a/, comfortable pitch, medium-loud).

## 11. Style-specific singing (R&B, pop, classical…)

See **[STYLE-GUIDE.md](STYLE-GUIDE.md)** for the style research: what acoustically defines R&B
(melisma/runs, bends, late-onset vibrato, intentional breathiness, mix/belt registration), how it
differs from classical resonance strategy, and the drill progressions the Styles page implements.

## 12. iOS/browser engineering notes (why the app is built this way)

- **AnalyserNode polling** at display rate drives the live views; a hand-rolled **McLeod Pitch
  Method** (NSDF + parabolic interpolation, 2048-sample window ≥ 2 periods of 60 Hz) does pitch.
  MPM/YIN-class detectors are the standard choice for monophonic voice; sub-10 ¢ accurate on clean
  vocals. Offline analysis adds a **Viterbi decode** over the per-frame candidate lattice — pYIN's
  contribution over YIN (Mauch & Dixon 2014) — replacing the median-of-5 filter. Measured at +0.7
  points of raw pitch accuracy on the synthetic eval set (`tests/eval-pitch.js`), concentrated in the
  jittery and low-SNR cases; the live path stays frame-independent because it has to be causal.
  Full write-up, including why CREPE-tiny was evaluated and rejected, in PITCH-TRACKING.md.
- Mic requested with `echoCancellation/noiseSuppression/autoGainControl: false` (iOS honors these
  only partially — the app therefore never scores absolute loudness).
- AudioContext is created after mic grant inside the user gesture; the WebKit-only `"interrupted"`
  state (calls, screen lock) is handled by resuming on visibility change and the next tap; a screen
  **wake lock** is requested so the display doesn't sleep mid-exercise.
- Recording captures raw Float32 PCM via AudioWorklet (ScriptProcessor fallback), so analysis runs
  on exactly what was recorded; WAV encoding is available for export.
- Reference audio import: Safari decodes m4a/mp3/wav (no ogg). The last reference persists in
  IndexedDB; note Safari evicts site storage after 7 days of no use unless the app is added to the
  home screen.

---

### Key sources

Welch, Howard & Rush 1989 · Wilson et al. 2008 · Berglin, Pfordresher & Demorest 2022 ·
Paney 2015 · Hoppe, Sadakata & Desain 2006 · MDPI *Applied Sciences* 12:10781 (2022 RTVF review) ·
Pfordresher & Brown 2007 · Pfordresher et al. 2010 · Pfordresher & Demorest 2021 ·
Hutchins & Peretz 2012 · Hutchins, Roquet & Peretz 2012 · Hutchins et al. 2014 ·
Pfordresher & Mantell 2014 · Zarate et al. 2010 · Dalla Bella et al. 2007/2011/2013 ·
Sundberg 1974/2001 · Weiss, Brown & Morris 2001 · Omori et al. 1996 · Watts et al. 2006 ·
Lombard & Steinhauer 2007 · Titze 2006 · Guzman et al. 2013 · SOVT systematic review *J. Voice* 2021 ·
Meerschman et al. 2017/2019 · Watson & Hixon 1985 · Salomoni et al. 2016 · Desjardins & Bonilha 2020 ·
Prame 1994/1997 · *J. Voice* vibrato-genre study 2025 · Driskell, Copper & Moran 1994 ·
Silveira & Gavin 2016 · Boersma 1993 · de Cheveigné & Kawahara 2002 (YIN) · Mauch & Dixon 2014 (pYIN) ·
Kim et al. 2018 (CREPE) · Tsai & Lee 2012 · Salamon & Gómez 2012 · 30-year singing-assessment survey
(arXiv 2601.12153, 2026).
