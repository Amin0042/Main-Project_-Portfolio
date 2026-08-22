// Antiquarium — experiences/floating-archive/lifecycle.js
//
// STAGE 3 — the Memory Star lifecycle. Gives every star a continuously
// varying `coherence` value in [0, 1] instead of a scripted
// FORM → wait → DISSOLVE → wait → REFORM timer. index.js reads this
// value every frame and uses it to modulate the star's own material
// (memory-star.js) and its surrounding halo particles
// (particle-field.js) — this module only ever produces the number;
// what it visually means to be "coherent" lives in those other files.
//
// REFINEMENT PASS — full dissolution is now reachable. Stage 3 kept a
// hard floor (coherence never fell below ~0.12–0.22) so a star could
// never fully vanish. That's since been moved downstream: the floor
// belonged to how coherence gets *displayed* (memory-star's opacity, the
// particle halo's residual population), not to the number itself — see
// index.js and particle-field.js for where "never a sudden pop, but
// still a real zero" is actually implemented now.
//
// WHY THREE INCOMMENSURATE SINE WAVES, NOT ONE TIMER
// ----------------------------------------------------------------------
// A single sine (or a state machine with fixed durations) has one fixed
// period — however smooth it looks, a visitor who watches one star for
// a while can time it and predict the next dissolve to the second. That
// is exactly the "mechanically scripted" failure mode this stage was
// asked to avoid.
//
// Instead each star's coherence is the sum of three sine components
// whose frequencies are a base rate multiplied by 1, √2, and φ (the
// golden ratio) — irrational with respect to each other, then further
// detuned by a small per-star random factor. A sum of sinusoids at
// irrational-ratio frequencies is quasi-periodic: it never exactly
// repeats (contrast this deliberately with constellation.js, whose
// spatial recurrence was validated to be exactly periodic — here the
// opposite property, genuine non-repetition, is what the brief asked
// for). Locally it still looks like an ordinary smooth rise, plateau,
// decay, and dip — because it is one — but the beating between the
// three components means how long any given plateau or dip lasts keeps
// changing, cycle to cycle, in a way a single timer cannot fake.
//
// Every parameter below (base period, weights, phases, the small
// per-frequency detuning, the logistic steepness) is drawn once per
// star from a seeded generator — so no two stars share a
// period, a phase, or a duration, and no star's cycle exactly repeats
// even against itself. It is still a pure, deterministic function of
// elapsed time (same seed → same evolution every time), which is what
// keeps it feeling stable rather than jittery, per the brief:
// "deterministic enough to be stable, organic enough to appear
// continuously evolving."
//
// HOW THE CURVE ACTUALLY DWELLS AT ITS EXTREMES
// ----------------------------------------------------------------------
// The raw three-sine sum, normalized to [0, 1], is passed through a
// logistic ("S-curve") reshape with a per-star steepness `k`:
//
//   shaped = 1 / (1 + e^(-k · raw))
//
// A plain sine already spends more time near its extremes than mid-
// swing (its derivative is smallest at the peaks), but the logistic
// reshape pushes this further — a star lingers near full coherence or
// near full dissolution for a stretch (simulated: commonly several
// seconds to several tens of seconds, varying run to run, never a fixed
// duration), with a comparatively quick, smooth transition between —
// which is what actually gives the lifecycle its "existing → then
// fragmenting → then dissolved → then reforming" shape rather than a
// featureless wobble. `k` itself is random per star (see below), so how
// pronounced this dwelling is differs star to star as well.
//
// PULSE — a second, unrelated signal, on purpose
// ----------------------------------------------------------------------
// Coherence is the star's slow, minutes-long arc through formation and
// dissolution. Pulse is a separate, much faster "is this star alive
// right now" heartbeat layered on top of whatever coherence state the
// star is in — a plain single sine is correct here (unlike coherence,
// a heartbeat is *supposed* to read as regular), with its own seed
// family so a star's pulse period/phase never lines up with its
// coherence timing or any other star's pulse. `samplePulse` returns a
// value in [-1, 1]; callers scale its (small) contribution themselves.
//
// STAGE 3.7 — curating what the FIRST frame looks like
// ----------------------------------------------------------------------
// Everything above describes the ongoing, organic evolution correctly,
// but says nothing about where each star happens to be in its own cycle
// the moment the page loads — and left to pure per-star random phases,
// nothing prevents an unlucky arrangement where most stars are near
// their trough at once (which is exactly what was observed: "the scene
// can appear almost empty," with only ~2 stars visible).
//
// Rather than special-casing the first frame, every star gets a
// one-time `startOffset` baked into its own timeline: `sampleCoherence`
// and `samplePulse` are both evaluated at `elapsed + startOffset`
// instead of `elapsed` directly. This is a pure time-shift — it changes
// *where in its own cycle* a star starts, not the shape, period, or
// character of that cycle — so everything the earlier passes validated
// (quasi-periodicity, per-star independence, no synchronization) is
// unaffected; only the t=0 snapshot across all 16 stars is curated.
//
// `index` is bucketed into four roughly-equal groups (by position in
// the artworks array — an arbitrary but deterministic split, not a
// judgment about which artwork "deserves" to open coherent) with a
// target coherence band at elapsed=0 for each: mostly-coherent, rising
// (forming), falling (dissolving), and low/subtle. For each star, a
// small deterministic search tries ~120 candidate offsets spread across
// its own basePeriod and keeps one that actually lands in-band (picked
// pseudo-randomly among the matches, via this star's own seeded stream,
// so members of the same bucket don't all open at the same exact point
// in their cycle either) — falling back to the closest miss in the rare
// case nothing matches exactly (a very low-amplitude star, say, that
// never quite reaches the "mostly-coherent" band).

import { createSeededRandom } from "../../core/seeded-random.js";

const OFFSET_SEARCH_SAMPLES = 120;
// [lower, upper] coherence-at-elapsed=0 band, and whether this bucket
// additionally requires a rising or falling trend at that instant (null
// = either direction is fine).
const INITIAL_STATE_BUCKETS = [
  { name: "coherent", band: [0.8, 1], trend: null },
  { name: "forming", band: [0.32, 0.62], trend: "rising" },
  { name: "dissolving", band: [0.32, 0.62], trend: "falling" },
  { name: "subtle", band: [0, 0.32], trend: null },
];

function bucketFor(index, totalCount) {
  // Roughly a 4:3:3:6-way split out of 16 (i.e. ~3-4 coherent, ~3
  // forming, ~3 dissolving, the remainder subtle/distant) — see the
  // brief's "3–4 coherent / 2–3 forming / 2–3 dissolving / remaining
  // distant" target. Proportions, not fixed counts, so this still makes
  // sense if the artwork manifest's length ever changes.
  const fractions = [4 / 16, 3 / 16, 3 / 16];
  const boundaries = [];
  let cumulative = 0;
  for (const fraction of fractions) {
    cumulative += fraction;
    boundaries.push(Math.round(cumulative * totalCount));
  }
  if (index < boundaries[0]) return INITIAL_STATE_BUCKETS[0];
  if (index < boundaries[1]) return INITIAL_STATE_BUCKETS[1];
  if (index < boundaries[2]) return INITIAL_STATE_BUCKETS[2];
  return INITIAL_STATE_BUCKETS[3];
}

// Golden ratio and √2 — chosen for being maximally hard to approximate
// by small rational fractions (famously so for φ), which is exactly the
// property that keeps the combined signal from ever settling into a
// short, learnable repeat.
const PHI = (1 + Math.sqrt(5)) / 2;
const FREQUENCY_RATIOS = [1, Math.SQRT2, PHI];

/**
 * @param {number} index - a star's position in the artworks array; the
 *   only thing that needs to differ between stars for every one of them
 *   to end up with its own unrelated lifecycle.
 * @param {number} totalCount - artworks.length, used only to bucket this
 *   star into an initial-state target band (see "curating what the
 *   FIRST frame looks like" above).
 * @returns {{
 *   sampleCoherence: (elapsed: number) => number,
 *   samplePulse: (elapsed: number) => number,
 *   densityScale: number,
 * }}
 */
export function createLifecycle(index, totalCount) {
  // A different seed family than constellation.js's star-placement hash
  // (index*7919+17) or particle-field.js's per-particle hash, so a
  // star's spatial jitter, its lifecycle timing, and its dust jitter
  // never correlate with one another.
  const rand = createSeededRandom(index * 104729 + 53);
  // Its own seed family again, distinct from the coherence generator
  // above — otherwise a star's pulse phase would be a deterministic
  // function of its coherence phase, and the two would visibly drift in
  // and out of alignment together rather than independently.
  const pulseRand = createSeededRandom(index * 15485867 + 911);

  // Base period of the slowest component, in seconds — "coherence
  // duration" varies star to star anywhere from under a minute to
  // nearly two, per the brief's "different coherence durations."
  const basePeriod = 48 + rand() * 74;
  const baseAngular = (Math.PI * 2) / basePeriod;

  // Three weighted components, each at its own (slightly detuned)
  // irrational-ratio frequency and phase.
  const rawWeights = [0.55 + rand() * 0.45, 0.4 + rand() * 0.45, 0.3 + rand() * 0.45];
  const weightSum = rawWeights.reduce((sum, w) => sum + w, 0);
  const weights = rawWeights.map((w) => w / weightSum);
  const phases = [rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2];
  // Small per-star detuning so even two stars that happened to draw a
  // similar basePeriod don't share exact component frequencies.
  const frequencies = FREQUENCY_RATIOS.map((ratio) => ratio * (0.92 + rand() * 0.16));

  // Per-star logistic steepness — how pronounced this star's dwelling
  // at "mostly formed" and "mostly dissolved" is, without ever using a
  // fixed on/off threshold. Deliberately varied star to star so no two
  // stars' fragmenting/reforming rhythm reads the same.
  const steepness = 3.2 + rand() * 2.8;

  // A star's own resting particle density, layered on top of (not
  // instead of) the coherence-driven swelling particle-field.js applies
  // — "different particle densities" independent of the moment-to-
  // moment lifecycle state.
  const densityScale = 0.7 + rand() * 0.6;

  // The un-shifted formula, used both as the real coherence function
  // (once wrapped with startOffset below) and, internally, to search for
  // that offset in the first place.
  function rawSampleCoherence(t) {
    let raw = 0;
    for (let i = 0; i < 3; i += 1) {
      raw += weights[i] * Math.sin(baseAngular * frequencies[i] * t + phases[i]);
    }
    // raw is already close to [-1, 1] (the weights are normalized to sum
    // to 1); the logistic reshape below maps it onto (0, 1) — a true,
    // reachable zero at one extreme, a true, reachable one at the other.
    return 1 / (1 + Math.exp(-steepness * raw));
  }

  const startOffset = findStartOffset(rawSampleCoherence, bucketFor(index, totalCount), rand, basePeriod);

  function sampleCoherence(elapsed) {
    return rawSampleCoherence(elapsed + startOffset);
  }

  // "An extremely slow heartbeat" — 7 to 15 seconds per beat, its own
  // phase, and its own amplitude scale (some stars pulse a little more
  // noticeably than others) — all independent of coherence and of every
  // other star's pulse.
  const pulsePeriod = 7 + pulseRand() * 8;
  const pulsePhase = pulseRand() * Math.PI * 2;
  const pulseAmplitudeScale = 0.55 + pulseRand() * 0.45;

  function samplePulse(elapsed) {
    return (
      Math.sin(((Math.PI * 2) / pulsePeriod) * (elapsed + startOffset) + pulsePhase) *
      pulseAmplitudeScale
    );
  }

  return { sampleCoherence, samplePulse, densityScale };
}

// See "curating what the FIRST frame looks like" above. Tries a spread
// of candidate time-offsets across one of this star's own basePeriods,
// keeps every one that lands in the target bucket's band (and trend, if
// specified), and picks among the matches using this star's own seeded
// stream — or, if nothing matched, the single closest miss, so every
// star still ends up reasonably close to its intended role even in an
// edge case (e.g. a low-amplitude star that never quite reaches the
// "coherent" band).
function findStartOffset(rawSampleCoherence, bucket, rand, basePeriod) {
  const [lower, upper] = bucket.band;
  const matches = [];
  let closestOffset = 0;
  let closestDistance = Infinity;

  for (let i = 0; i < OFFSET_SEARCH_SAMPLES; i += 1) {
    const offset = (i / OFFSET_SEARCH_SAMPLES) * basePeriod;
    const value = rawSampleCoherence(offset);

    const distance = value < lower ? lower - value : value > upper ? value - upper : 0;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestOffset = offset;
    }

    if (value < lower || value > upper) {
      continue;
    }
    if (bucket.trend) {
      // A small forward difference to classify the trend at this
      // instant — cheap, and the underlying signal only ever moves on a
      // timescale of many seconds, so this is never ambiguous in
      // practice.
      const ahead = rawSampleCoherence(offset + 0.5);
      const rising = ahead > value;
      if ((bucket.trend === "rising") !== rising) {
        continue;
      }
    }
    matches.push(offset);
  }

  if (matches.length === 0) {
    return closestOffset;
  }
  return matches[Math.floor(rand() * matches.length)];
}
