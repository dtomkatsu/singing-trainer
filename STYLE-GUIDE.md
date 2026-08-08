# STYLE-GUIDE.md — singing style acoustics, with an R&B deep dive

Companion to [RESEARCH.md](RESEARCH.md). Confidence flags: **[M]** published measurement ·
**[C]** pedagogical consensus · **[E]** practical estimate (tunable default, not ground truth).

The core insight from the genre literature: **the same acoustic event flips sign between
styles.** A scoop, a breathy verse, a fry onset, a delayed vibrato, an audible register flip —
each is an *error* in classical scoring and a *virtue* in R&B. Style guidance means re-weighting
what the analyzer already measures, not adding new sensors.

---

## 1. Style profiles at a glance

| Style | Signature acoustics | The app's targets |
|---|---|---|
| **R&B / soul** | Pentatonic/blues runs; scoops & bends as core devices; late or minimal vibrato; breathiness as intimacy; fry onsets; falsetto flips as ornament; speech-like formants + twang, **no** classical singer's formant | Runs 4→8 notes/s in-grid; scoop 100–300¢ landing stable; vibrato onset >40–60% of note; verse-vs-chorus breathiness contrast |
| **Pop** | Speech-like vowels; light/terminal vibrato; fry & aspirate onsets common; shorter rhythm-first runs; pervasive shallow scooping | Note centers ±25–50¢; scoops ≤200¢; vibrato extent <±50¢ |
| **Rock** | Bright energy 2–4 kHz via twang; intentional distortion/growl on top of a stable clean tone; wide/irregular vibrato tolerated | Ring band high; roughness only if controlled (stable pitch underneath) |
| **Jazz** | Vibrato blooms at note-ends, higher variability; back-phrasing (behind the beat, realign at phrase end); intimate low-level timbres | Long vibrato delay; onset-lag consistency vs the beat |
| **Musical theatre** | Bimodal: "legit" ≈ classical vs belt (F1:2f₀ coupling — H2 ~30 dB over the fundamental in belt vs ~10 dB classical **[M]**); delayed vibrato on final sustains | H2-dominant spectrum in belt passages; terminal vibrato bloom |
| **Classical** | Continuous vibrato ~5–6.5 Hz, ±50–100¢, present from onset; singer's formant 2.8–3.4 kHz; modified "tall" vowels; no scoops/fry | Vibrato present ≥80% of sustains; SPR high; scoop depth ≈ 0 |

Sources: *J. Voice* 2025 "Does Vibrato Define Genre?"; Bourne & Garnier belt acoustics;
Sundberg singer's-formant work; CVT mode studies (Curbing = the restrained R&B-friendly mode);
J-POP singing-technique corpus (scooping = the most ubiquitous ornament, >29 per singer) **[M]**.

## 2. What makes it sound R&B

1. **Runs (melisma) on the pentatonic.** The gospel→soul→R&B lineage riffs on minor
   (0 3 5 7 10 semitones) and major (0 2 4 7 9) pentatonic sets, mostly **descending**, landing
   on a chord tone **[C]**. Speed anchors: trained singers execute fast passages at ~6 notes/s
   (Sundberg **[M]**); elite runs reach 8–10+. In fast passages pitch perception is categorical —
   per-note accuracy of ±50¢ is enough, but the **final anchor note** should land ±25¢ **[M]**.
2. **Scoops and bends are vocabulary, not sloppiness — when controlled.** The perceptual
   boundary: ~150¢ over ~50 ms reads as a normal onset; **100–300¢ over 80–250 ms landing
   stable** reads as an intentional scoop **[M/E]**. A slow undershoot that never stabilizes is
   just flat singing. The drill is control: chosen depth, chosen duration, stable landing.
3. **Blue notes are real targets**: measured clusters at ~319¢ (neutral third) and ~1038¢
   (neutral seventh) above the tonic — bending between minor and major versions **[M]**. The
   zones 250–420¢ and 950–1080¢ are stylistic space, not error.
4. **Vibrato arrives late or not at all.** Straight tone through most of the note, bloom in the
   final 30–50% **[C/E]** — the measurable opposite of classical onset-to-release vibrato.
5. **Breathiness is a dial, not a defect.** Verses intimate and airy (lower HNR), chorus closed
   and present — coach the **contrast** (≈3–6 dB HNR between sections **[E]**), and only worry
   when breathy + strained together.
6. **Fry onsets and falsetto flips** are ornaments: fry into the note at phrase starts; a
   deliberate audible chest→falsetto break ("cry break") that lands on a stable note is a
   feature — an unintended crack that wobbles afterward is not. Post-flip stability is the
   difference the analyzer checks.
7. **Back-phrasing**: start the phrase late (50 ms to a full beat), catch up so the phrase-end
   lands with the downbeat **[C]**.
8. **Tone: mix + twang, not opera ring.** R&B brightness comes from speech-like vowels with
   twang (2–4 kHz boost, H2-dominant), not the classical formant cluster — so don't chase the
   classical SPR target in R&B mode; chase *contrast control* instead.

## 3. Training runs: the consensus method (and the evidence around it)

- **Ear first**: audiate the run before singing it — discrimination training transfers to
  production accuracy in this direction for note *sequences* **[M]**.
- **Slow first, fragment, then chain**: split the run into 3-note cells, loop each, join them.
- **Tempo ladder**: +3–5 bpm per clean pass. Non-professionals are least accurate on **fast,
  descending, staccato** patterns **[M]** — which is exactly what R&B runs are, so that's what
  gets drilled.
- **All keys**, staying inside the comfortable range (range-appropriate training transfers
  better **[M]**).

The Styles page implements this: pattern picker (walk-down, up-down loop, turn figures),
notes-per-second ladder 2→8, per-note grid scoring, and a tight-anchor rule on the last note.

## 4. Style-aware interpretation of the Voice Report

| Report metric | Classical read | R&B read |
|---|---|---|
| Breathiness (HNR low) | Work on closure | Legitimate color — check you can also produce a clear tone on demand |
| No vibrato | Develop it | Fine; drill *delayed* vibrato for sustained endings |
| Wide continuous vibrato | Good (±50–100¢) | Often too operatic; keep ≤ ±80¢, arrive late |
| Ring (SPR) low | Priority fix | Optional; twang brightness for belted choruses only |
| Scoopy onsets | Clean them | Keep them — but land them (stable within ~250 ms) |

## 5. Sources (abridged)

Bourne & Garnier (belt F1:2f₀, H2 dominance) · Sundberg 1974/2001 (singer's formant; ~6 notes/s
fast passages) · *J. Voice* 2025 vibrato-genre study · Prame 1994/97 (vibrato norms) ·
Cutting, *Empirical Musicology Review* (blue-note clusters 319/583/1038¢) · JEP:HPP 2018 ("Do
scoops matter?") · J-POP technique corpus (arXiv 2210.17367) · CVT studies (Curbing/Overdrive/
Edge, *J. Voice*) · Estill/EVT exploratory CCM study · Lombard & Steinhauer 2007 (twang) ·
2024 MRI twang study · fry-in-pop studies (*J. Voice* 2018) · "Yodel species" falsetto-flip
typology · *J. Voice* 2016 (fast/descending/staccato = hardest) · micromelody discrimination
training (PMC) · Pfordresher & Greenspon 2025 (range-appropriate training) · SOVT dosage study
(benefits peak ~3–5 min) · Tsai & Lee 2012 (score fusion vs human raters).

**Honest caveat:** quantified R&B-specific measurements are thin in the literature; several
targets above are extrapolations (**[E]**) from adjacent genres and physiology. They ship as
defaults, and your own reference recordings in Compare mode are the better calibration.
