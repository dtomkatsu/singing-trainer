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
  formant cluster — present as "brightness/ring," not right/wrong. The pitch dependence is why the
  Ring trainer pins **one note for the whole ladder**: its transfer stage originally drew a random
  note per trial while each vowel's baseline had been captured at whichever note it first appeared
  on, so transfer trials were partly scoring which pitch came up. Contextual interference (§8) comes
  from switching *targets*, and five vowels already supply that, so the random pitch bought nothing
  and cost the measurement. The note is stored rather than recomputed, so recalibrating your range
  on the Drills page can't silently invalidate baselines already taken.
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

- The singer's-formant region is **vowel-dependent** (Feng & Howard 2023, on vallecular volume
  changing with tongue position) — so a resonance target earned on one vowel does not transfer as a
  number to another. Any ladder that walks across vowels has to re-baseline each one or it is
  measuring the vowel, not the singer. **[moderate]**
- Twang mechanism is now imaged, not just theorised: **oropharyngeal and aryepiglottic narrowing**
  (Jelinger et al. 2024, MRI; Perta et al. 2021 pilot MRI), with perceived twang rising as
  pharyngeal area narrows and the tract shortens (Titze et al. 2003). Sundberg & Thalén 2010
  established that listeners identify it reliably and that it is a *filter* effect, largely
  independent of the voice source. **[moderate–strong]**
- Real-time singer's-formant feedback is not new: **Rossiter & Howard 1996** (*J Voice*) built
  ALBERT, a display driven partly by energy in that band, for professional voice development.

**In the app:** the tuner's purple band and ring meter, and the report's SPR/singer's-formant rows,
are direct implementations of this literature, with Omori's bands as thresholds. The **Ring
trainer** turns them into a task: a twang ladder that re-baselines per vowel and runs the vowels
ring-easy to ring-hard (/ŋa/ → /i/ → /æ/ → /a/ → /u/). SPR is the signal it trains against
specifically because it is a difference between two dB peaks in one frame, so it is unchanged by
the iOS gain the app can't switch off — see §12.

**Correction (Aug 2026): there is no defensible fixed dB target, and the trainer no longer uses
one.** It originally asked for *baseline +6 dB*, justified here as "the low end of Omori's 5–10 dB
singer/non-singer gap." That was a category error on this file's part: Omori's figure is a
**between-groups** difference between trained singers and untrained people — an outcome of years of
training — and it was applied as a **within-session** target, so the ladder effectively asked
people to sound like a trained singer on demand. It was also incoherent across stages, because the
stored baseline is a median while stage 1 scored the 90th percentile and stages 3–4 the median: at
a realistic 2 dB frame-to-frame spread the true ask jumped from +3.4 dB to +6.0 dB between stage 1
and stage 2 for no pedagogical reason, and the jump was *larger* for less steady voices. Searching
for a within-subject twang effect size to rescue the constant turned up no reported figure.

The target is now adaptive per vowel: a **weighted up-down staircase** (Kaernbach 1991) with
`p = down/(up+down)`, tuned to converge where the singer succeeds ~70% of the time — the same rate
the stage gate requires. It opens at +2 dB and moves on every scored attempt (retention probes
excluded, since a probe must not move the level it measures). One consequence is deliberate:
stages now advance for anyone who does the reps, so *progression is no longer the measure of
skill*. **The staircase level itself is** — how many dB above your own baseline you can reliably
hold is the number the app reports and the number that should climb.

## 4b. Glottal closure: H1–H2, and why it ships without thresholds

§4 is all *filter* — how the vocal tract colours the sound. **H1–H2** (amplitude of the first
harmonic minus the second, dB) reads the *source*: how abruptly the folds snap shut. Gentle, leaky
closure gives a rounded glottal wave with its energy piled into the fundamental (large positive
H1–H2, heard as breathy); firm closure gives an abrupt wave spreading energy up the series (near
zero or negative, heard as pressed or belted). Two singers can share an SPR with entirely different
closure underneath, which is the gap it fills. The belt literature already relies on this axis —
Bourne & Garnier report H2 ~30 dB over the fundamental in belt vs ~10 dB in classical.

**No good/okay/work-on-it banding, deliberately.** The measure carries large individual variability,
sex and age effects, f0 dependence (strongest below ~175 Hz), vowel-height dependence, and only
~69% sensitivity for vocal hyperfunction. Absolute thresholds are not defensible, and asserting some
anyway would repeat the §4 mistake of turning a population statistic into a personal verdict. The
app therefore uses it **only for within-subject contrast**, where every one of those confounds
cancels. **[moderate as a relative measure · weak as an absolute one]**

Two confounds are handled by *gating the task* rather than correcting the maths:

- **Formants.** H1–H2 is corrupted when F1 sits near H2. The proper fix is the Iseli–Alwan
  H1\*–H2\* correction, which needs formant frequencies and bandwidths — i.e. LPC tracking the app
  doesn't have. Instead the task fixes the vowel to /a/ (F1 ≈ 700–800 Hz, clear of H2) and
  `Metrics.h1h2` refuses any frame above **300 Hz f0**, where that clearance is gone. Reporting
  nothing beats reporting a corrupted number — the same call as the soprano singer's-formant caveat.
- **Low-frequency rolloff.** H1 is the lowest thing in the signal, so any mic or OS high-pass biases
  the measure toward "pressed". A constant rolloff cancels in a contrast; it would not cancel in an
  absolute reading. Another reason the app never shows one.

**In the app:** the Styles page's **Breathiness dial** takes two /a/ takes on one note — airy, then
closed — and reports only the gap between them, which is the R&B contrast skill of §2.5 of
STYLE-GUIDE.md made measurable. Rather than threshold the result, it cross-checks against **CPPS**,
which is derived from the cepstrum without consulting f0 and so fails differently: agreement between
two independent measures is worth more than a cut-off on either. It also flags when SPR moved a lot
between takes, which means brightness changed rather than closure.

## 4c. Twang preview — hearing your own voice with the ring added

The app can replay any take through a single peaking EQ (+10 dB at 2.9 kHz, Q 1.1, spanning
Sundberg's 2.4–3.4 kHz band) — *your* voice with the singer's-formant resonance added. Measured
against the app's own SPR meter via offline rendering: **+6.7 dB effective SPR boost** on a dull
voice-like tone (the nominal +10 dB lands fully only on harmonics near the peak centre), which sits
inside Omori's 5–10 dB singer/non-singer gap. An identical gain pad on both playback paths keeps
the A/B a timbre comparison, not a loudness one.

Why it should help, and how much to trust that:

- People match pitch best against **their own voice's timbre** (§3, Hutchins et al. 2014;
  Pfordresher & Mantell 2014) — a ringed version of *your own take* is a better-matched target
  stimulus than any external reference. **[strong for own-timbre matching]**
- Self-listening via playback improves self-assessment (§8). The A/B makes the *specific
  difference to aim for* audible, not just the take. **[moderate]**
- **But the combined claim — that hearing a filtered version of yourself accelerates learning the
  underlying vocal adjustment — has not been tested anywhere. [E]**, extrapolation. It ships as a
  listening aid next to the Ring trainer's measurement loop, not as a replacement for it.

**Playback only, never live monitoring:** altered real-time auditory feedback measurably perturbs
phonation (Leydon 2003; Lester-Smith et al. 2023/24 — the same evidence that keeps reference tones
out of vibrato trials), and browser/Bluetooth latency would add its own artefacts. You hear the
target on the recording, then go make it acoustically with the meter.

**Earpiece routing, and why the fix is a release/reacquire rather than a session-type override.**
Once getUserMedia is live, iOS puts the page's audio session in `play-and-record` mode, which routes
*all* of that context's output — plain playback included, not just the twang preview — to the
earpiece instead of the speaker. The obvious fix, temporarily setting `navigator.audioSession.type`
to `playback` for the few seconds of a review, is not safe: the Audio Session spec states plainly
that setting `type` to anything but `play-and-record`/`auto` ends any active MediaStreamTrack, which
would trade quiet playback for broken mic capture. `Mic.pauseForPlayback()` instead drops out of the
session entirely — stop the mic, play back on a context with no input attached, reacquire via the
normal `start()` path once playback ends — and falls back to the app's own "Enable microphone" gate
if reacquire fails, rather than leaving the page looking live while it silently isn't.

**UNVERIFIED on real iOS hardware.** This dev environment cannot reproduce an iPhone's
earpiece/speaker routing decision, so the *routing outcome* is a plausible reading of the platform's
rules, not a confirmed fix. What tests here confirmed instead is the mechanism around it: six
consecutive teardown → reacquire cycles each measured exactly one `getUserMedia` call and a live mic
afterward; the concurrent-recording guard correctly refuses to interrupt a take in progress; and the
failure path (a forced reacquire rejection) correctly falls back to the "Enable microphone" gate with
buttons re-enabled rather than left stuck. One real bug surfaced by that testing and fixed before
shipping: `teardown()`'s `ctx.close()` wasn't awaited, so a closed context's own queued `statechange`
event could fire after `ctx` had already been reassigned — its listener closed over the mutable
variable rather than the instance, and threw on the now-null or now-different value. Fixed by pinning
each listener to the specific context instance it belongs to, and by awaiting `close()` properly.

## 4d. Surveyed but not built — the resonance-training roadmap

Scoped while answering "what cutting-edge tech could help with R&B resonance" (Aug 2026). §4c's
twang preview is what came out of it; everything else here is documented so the reasoning isn't
re-derived from scratch next time it comes up, and so a future "why doesn't this app just do X"
has an answer on record.

**Real-time formant/resonance-tuning feedback has direct supporting evidence, with the familiar
retention catch.** Jeanneteau, Hanna, Almeida, Smith & Wolfe 2022 (*Logoped Phoniatr Vocol*, PMID
33121295): 6 of 8 sopranos learned to shift their second vocal-tract resonance (R2) across several
semitones relative to f0, tracking a real-time visual display, inside a **single one-hour session**.
But once the display was removed, only 2 of 8 spontaneously kept using the tuning; a third gained it
only after extensive further practice. That is the guidance hypothesis (§2) measured on resonance
itself, not just pitch or twang — reinforcing, not just paralleling, the practice-schedule design
already built for the Ring trainer (`js/practice.js`). **[moderate]** Their measurement method
(broadband excitation at the lips) is hardware the app doesn't have; a browser equivalent would mean
**LPC formant tracking**, which is also what H1–H2's Iseli–Alwan correction needs (§4b) and what
would let the app verify belt/legit registration directly via F1:2f₀ rather than infer it from
H1–H2. Real, substantial DSP work, and fragile at high f0 where harmonics undersample the spectral
envelope — the single biggest thing on this list, deferred rather than rejected.

**Neural singing-voice conversion (SVC) could manufacture a better training stimulus than any
external reference, if it ran offline.** The SVCC 2025 challenge benchmarked 33 systems; current
zero-shot models (S²Voice, the 2025 winner; HQ-SVC; REF-VC, 4-step fast inference) convert timbre
while **preserving the singer's own pitch**, and VibE-SVC controls vibrato style independently of
the rest. Why it matters here specifically: §3's own-voice-timbre-matching evidence (Hutchins et al.
2014; Pfordresher & Mantell 2014) says people match best against *their own voice* — an SVC-converted
"R&B-styled you" would be a better-matched Compare-mode reference than any other singer's track,
exactly the argument §4c already makes for the twang preview, at a scale a single EQ peak can't
reach. None of this runs in a static no-build browser page; it would follow the existing Demucs
stem-separation precedent from §9 — an offline step outside the app, importing the result as a
Compare reference. **Untested as pedagogy: no study has looked at SVC-converted self-references as
training stimuli. [E]**, extrapolation from the own-timbre-matching finding, not a finding itself.

**Neural pitch trackers (CREPE, FCPE) were re-checked and still don't clear the bar.** Already
evaluated once in PITCH-TRACKING.md §2 with hard numbers (CREPE-tiny: 60–110 s to analyze a 30 s
Compare take on iPhone WASM, plus it breaks the HNR/clarity pipeline and worsens time resolution on
exactly the fast-vibrato/melisma material that needs it most). The newer crop (FCPE and others,
claiming real-time factors near 0.006) doesn't change that verdict — the blockers are GitHub Pages
having no `SharedArrayBuffer` and the no-build-step architecture, not raw model speed. See
PITCH-TRACKING.md's Aug 2026 addendum.

**Three directions ruled out, with reasons worth keeping on record:**

- **Nasality/nasalance.** Clinically measured with an oral/nasal mic split (a nasometer). A single
  phone mic inferring nasal antiformants from spectral shape alone is fragile and vowel-dependent
  enough not to trust as a number — which is why the app coaches this behaviourally (pinch the nose;
  if the sound barely changes, the brightness is twang, not nasal leakage) rather than pretending to
  meter it.
- **True cycle-accurate jitter/shimmer.** Needs glottal closure instant (GCI) detection (e.g.
  SEDREAMS/YAGA-class algorithms) — a real DSP undertaking, and one that would need EGG-validated
  data to trust, which the app has no way to collect. The existing frame-to-frame proxies are
  already labelled as proxies, not clinical numbers (§10); chasing "real" jitter without validation
  data risks manufacturing false precision rather than fixing anything.
- **Absolute loudness/dynamics.** Already ruled out elsewhere (§12) — iOS won't allow AGC to be
  fully disabled — and nothing in this pass changed that.

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
  (Mürbe et al. 2007, longitudinal over 3 years of conservatory study); it emerges from ease,
  not force. Pop/R&B uses later-onset, narrower, often irregular vibrato (genre study,
  *J. Voice* 2025) — straight tone is a valid stylistic choice.
- **Correction (Aug 2026): rate, not extent, is the controllable parameter.** This section
  previously claimed the opposite. The intervention studies go the other way:
  - Dromey, Carter & Hopkin 2003 (*J Voice* 17(2):168–78) — singers asked to match faster and
    slower rate stimuli **could do so on demand**. Notably, slower rates came with *lower intensity
    and less steady vibrato*, so training downward is training toward a wobble. **[moderate]**
  - Moorcroft & Kenny 2015 (*J Voice* 29(2):182–90) — breathing imagery ("the breath directed up
    and down as far from the larynx as possible") produced significantly more moderate and regular
    rates, while "**vibrato extent was not responsive to any intervention**." **[moderate]**
- Vibrato is **sustained by an auditory feedback loop** (Leydon, Bauer & Larson 2003, *JASA*
  114(3):1575–81; Lester-Smith et al. 2023/2024 on masked and delayed feedback). Design
  consequence: a continuously audible reference tone under the singer perturbs the very thing being
  measured, so a rate target must be shown visually or sounded before the trial, not during it.
- **What has no evidence:** deliberate *induction* of vibrato in singers who lack it — pulsed or
  trilled exercises, metronome-paced pitch pulsation, jaw or laryngeal manipulation. A PubMed
  search returns nothing on it. These are studio tradition, and the app now labels them as such
  rather than voicing them like Titze or Omori. **[pedagogy only]**

**In the app:** report measures rate/extent/regularity from the detrended F0 contour (3–9 Hz band).
Coaching frames vibrato as emergent; where the pulse method is mentioned it is flagged as
unevidenced and pinned to 5–6 pulses/sec rather than the 4/sec it used to suggest — which sat
*below* the app's own 4.5–7.5 Hz "good" band and, per Dromey, trains toward instability.

## 8. Practice structure

- **Distributed beats massed**: spacing meta-analysis d = 0.54; plus vocal-load limits argue for
  10–20 min daily sessions. **[moderate]**
- **Mental practice** ≈ d 0.5 vs none (Driskell et al. 1994); auditory imagery predicts accuracy —
  audiation is a first-class exercise step. **[moderate]**
- **Self-listening**: you can't hear yourself accurately while singing (bone conduction); playback
  improves self-assessment (Silveira & Gavin 2016, *Psychology of Music*; "Are You Your Own Best
  Judge?" *J. Voice* 2021). Every recording in the app has a play-back button — use it. **[moderate]**
- **How you schedule practice and feedback outweighs which drill you pick.** Steinhauer & Eichhorn
  2025 (*J Voice*) taught 92 adults aged 55–80 — hypophonic patients, novice vocalists and expert
  vocalists — a novel voice task (**twang**), crossing practice structure (blocked vs random) with
  knowledge-of-results frequency (100% vs 55%), and measured acquisition, retention *and* transfer:

  | | acquisition (in-session) | retention & transfer |
  |---|---|---|
  | blocked + 100% KR | best | **degraded** |
  | random + 55% KR | worse | **best** |

  In their words, "100% KR paired with Blocked practice increased motor performance, but degraded
  motor learning." This is the guidance hypothesis (§2) measured directly on a *voice* task rather
  than inferred from limb studies, and on the exact skill the Ring trainer teaches. **[moderate]**

**In the app:** the Ring trainer runs on a shared schedule engine (`js/practice.js`) implementing
that ladder — stages 1–2 blocked with the live meter and a result every rep so the sensation can be
found at all, stage 3 with the live meter withdrawn, stage 4 interleaving vowels and pitches with
KR thinned to 55%. Two feedback channels are modelled separately because the study manipulated only
the second: *concurrent* (the meter during the note) and *KR* (the result after it). KR is
distributed as an exactly-proportioned shuffled schedule, not a per-trial coin flip, so a 55% stage
can't hand out nine unfed reps in a row by luck. The first trial of each new session is an unfed
**retention probe** that is logged separately and never counts toward stage progress — the app
reports that number, because in-session score is the one the literature says will mislead you.

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
| Breathiness (CPPS) | cepstral peak prominence over a regression baseline | ≥14 dB | ≥9 dB | <9 dB | Hillenbrand & Houde 1996; bands calibrated on *this* implementation, and f0-dependent — see PITCH-TRACKING.md |
| Clarity (HNR est.) | 10·log10(r/(1−r)), r = NSDF peak | ≥18 dB | ≥12 dB | <12 dB | Boersma 1993; clinical bands |
| Ring (SPR) | peak dB 2–4 kHz − peak dB 0–2 kHz | ≥ −15 dB | ≥ −25 dB | < −25 dB | Omori 1996; Watts 2006 |
| Singer's-formant energy | dB share of 2.4–3.4 kHz vs 50 Hz–5 kHz | ≥ −16 dB | ≥ −22 dB | < −22 dB | Sundberg band; app-calibrated |
| Vibrato | rate/extent/regularity of 3–9 Hz band of detrended contour | 4.5–7.5 Hz, ≤150 ¢ | other | — | Prame; college-major norms |

Caveats owned in the UI: iOS applies gain control that can't be fully disabled, so absolute-level
metrics are avoided; the HNR and jitter values are frame-based estimates, not Praat-equivalent
clinical measures; SPR is vowel/pitch-dependent, so the report asks for the same task every time
(sustained /a/, comfortable pitch, medium-loud).

**Noise rejection.** The offline report's `resonance()` only accumulates spectrum frames the pitch
tracker already scored as voiced (`track.f0[k] > 0`, which passed both an RMS floor and an NSDF
clarity threshold — §1's pitch detector, not a separate check), so ambient noise is excluded before
SPR is ever computed. The Ring trainer's live meter originally skipped that: it gated a frame on
nothing but a −85 dB low-band-peak floor, 15 dB above the AnalyserNode's default −100 dB noise
floor — clearable by ordinary room tone. Measured against simulated room noise through the real
capture pipeline (Aug 2026): the floor-only gate passed 20/20 frames and read a *silent room* at
−7.6 to −9.3 dB SPR, inside Omori's "strong ring" band. Fixed by gating each live frame on
`Mic.livePitch()` (f0 > 0, clarity > 0.5) before its spectrum counts — the same test the tuner and
drills already use, and the property `tests/dsp.test.js`'s "white noise → unvoiced or low clarity"
locks in. Same fix against a real sung tone: 15/15 frames passed, unchanged SPR.

## 11. Style-specific singing (R&B, pop, classical…)

See **[STYLE-GUIDE.md](STYLE-GUIDE.md)** for the style research: what acoustically defines R&B
(melisma/runs, bends, late-onset vibrato, intentional breathiness, mix/belt registration), how it
differs from classical resonance strategy, and the drill progressions the Styles page implements.

## 12. iOS/browser engineering notes (why the app is built this way)

- **AnalyserNode polling** at display rate drives the live views; a hand-rolled **McLeod Pitch
  Method** (NSDF + parabolic interpolation, 2048-sample window ≥ 2 periods of 60 Hz) does pitch.
  MPM/YIN-class detectors are the standard choice for monophonic voice; sub-10 ¢ accurate on clean
  vocals. Offline analysis adds a **Viterbi decode** over a **dual-window candidate
  lattice** (2048 + co-centred 1024; short-window candidates admitted only when at least as clear as
  the long window's best) — pYIN's contribution over YIN (Mauch & Dixon 2014) plus a fix for
  note-boundary smearing on fast runs — replacing the median-of-5 filter. Validated on real annotated
  singing (vocadito, 40 tracks / 93k voiced frames): 96.90% raw pitch accuracy vs the median
  baseline's 96.48%, with octave errors nearly halved (0.52% vs 0.90%); on synthetic stress cases
  +20 points at 0 dB SNR and +5–8 on 12-notes/sec melisma, at ~57× realtime; the live path stays frame-independent because it has to be causal.
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
- **Reference-tone loudness, measured rather than guessed.** Reported as barely audible; the
  triangle-wave player was running at gain 0.25, which renders at **−16.8 dBFS RMS** (measured via
  `OfflineAudioContext`). Raised to 0.9 → **−5.7 dBFS, +11 dB**, with no clipping (peak 0.896 on a
  single oscillator). Kept the triangle waveform rather than switching to something louder-sounding
  like a sawtooth, since §3's matching evidence specifically wants a harmonic-rich, voice-like tone —
  the fix was loudness, not timbre. This is also the first place the **earpiece-routing** issue
  showed up: once the mic is live, iOS routes this same context's output to the earpiece regardless
  of gain, which is a platform routing decision no amount of `TONE_GAIN` fixes — full investigation
  and the eventual release/reacquire fix are in §4c.

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
Prame 1994/1997 · *J. Voice* vibrato-genre study 2025 · Dromey, Carter & Hopkin 2003 ·
Moorcroft & Kenny 2015 · Mürbe et al. 2007 · Nix et al. 2016 · Leydon, Bauer & Larson 2003 ·
Lester-Smith et al. 2023/2024 · Steinhauer & Eichhorn 2025 · Salmoni, Schmidt & Walter 1984 ·
Sundberg & Thalén 2010 · Titze, Story et al. 2003 · Jelinger et al. 2024 · Perta et al. 2021 ·
Feng & Howard 2023 · Rossiter & Howard 1996 · Kaernbach 1991 ·
Jeanneteau, Hanna, Almeida, Smith & Wolfe 2022 (resonance-tuning feedback) ·
SVCC 2025 challenge (S²Voice, HQ-SVC, REF-VC, VibE-SVC) · Driskell, Copper & Moran 1994 ·
Silveira & Gavin 2016 · Boersma 1993 · de Cheveigné & Kawahara 2002 (YIN) · Mauch & Dixon 2014 (pYIN) ·
Kim et al. 2018 (CREPE) · Tsai & Lee 2012 · Salamon & Gómez 2012 · 30-year singing-assessment survey
(arXiv 2601.12153, 2026).
