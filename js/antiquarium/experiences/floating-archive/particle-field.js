// Antiquarium — experiences/floating-archive/particle-field.js
//
// The room's dust field: one draw call, one THREE.Points object, split
// into two segments of the same buffer —
//
//   • a halo per star, driven every frame by that star's own
//     `coherence` and `pulse` (see lifecycle.js): tight, calm, and
//     bright around a coherent star; as it dissolves, the same
//     particles gradually acquire real outward travel — away from the
//     constellation's own spine, not just "further from the star" in an
//     arbitrary direction — while individually shrinking and dimming,
//     until they read the same as the surrounding ambient dust.
//   • ambient dust, scattered along the constellation and unrelated to
//     any one star — still static per-frame (recomputing it would cost
//     more than it would ever be seen to gain, since nothing here reacts
//     to it).
//
// STAGE 3.7 — this file now reads `star.presence`, not `star.coherence`,
// for everything below. index.js computes presence as a curved function
// of coherence that stays meaningfully above zero across most of the
// coherence range (see index.js's own note) — so a star that's lost its
// recognizable-artwork status still keeps a real particle concentration
// around it, per the brief's "low coherence ≠ zero spatial presence."
// The per-particle fade windows were also widened so a dissolving
// star's trace persists longer, and stray/ambient dust gained a slow,
// per-particle drift so the empty regions between stars read as
// populated rather than static backdrop.
//
// REFINEMENT PASS — one visual particle universe, not two populations
// ----------------------------------------------------------------------
// Previously every particle in the buffer shared one PointsMaterial, so
// a dissolving star's particles could move but never actually come to
// look like ambient dust — same fixed size, same fixed brightness,
// forever. This pass swaps in a small custom point-sprite shader with
// per-particle `size`/`brightness` attributes (still one draw call, one
// geometry, one material) specifically so a halo particle CAN shrink and
// dim as it disperses, converging on the same size/brightness range the
// ambient population already sits in — the two are visually the same
// kind of thing by construction, not something dressed up to look
// similar. Literal hand-off (this exact particle becomes that exact
// ambient one) is still not implemented — the brief explicitly doesn't
// require it ("visual continuity is the priority," not conservation).
//
// A star's own particles don't all fade together, either: each one gets
// its own seeded fade window along the star's dissolve progress
// (`haloFadeStart`/`haloFadeSpan`), so as a star dissolves most of its
// particles have already faded near-invisible well before coherence
// bottoms out, leaving a genuinely small residual few still faintly
// drifting outward at the deepest point — "a small residual population,"
// not all-or-nothing.
//
// STAGE 2 UPDATE — ambient dust now lives in the constellation, not the
// origin. The per-star halos already followed each star's own position
// and needed no change beyond this stage's coherence-driven spread; the
// *ambient* dust, previously scattered in a small ring around
// world-origin (sensible for the old bounded room), is now sampled
// along constellation.js's positionAt(t) across the entire loop, so it
// actually sits inside the space the visitor travels through instead of
// hovering, unseen, back at the origin. This only calls positionAt() —
// no constellation math is duplicated here.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { MUTED_GOLD } from "./constants.js";
import { positionAt, CONSTELLATION_LOOP_LENGTH } from "./constellation.js";
import { createSeededRandom } from "../../core/seeded-random.js";

// How far a fully-dissolved star's particles travel outward from the
// constellation's own spine, in world units — large enough that they
// leave the star's immediate neighborhood and read as part of the
// general field, small enough to stay inside the same bounded shell
// every part of the constellation already occupies (see constellation.js
// — radius/height are bounded for any `t`, so this never sends anything
// off into unbounded empty space).
const MAX_DISSOLVE_DISTANCE = 16;

const dustColor = new THREE.Color(MUTED_GOLD);

/**
 * @param {Array<{
 *   basePosition: THREE.Vector3,
 *   holder: THREE.Object3D,
 *   coherence: number,
 *   presence: number,
 *   pulse: number,
 *   constellationT: number,
 *   lifecycle: { densityScale: number },
 * }>} stars
 * @param {{ perPlateDust: number, ambientDust: number }} quality
 */
export function createParticleField(stars, quality) {
  // Held to a single draw call (no new Points objects per star — that
  // would multiply GPU/CPU overhead by the star count for a purely
  // atmospheric detail). Instead the dust budget is distributed: most
  // of it settles in a loose halo around each star's edges rather than
  // scattered uniformly through the room, so it reads as "fine
  // particles around the artwork" without costing anything extra.
  const perPlateDust = quality.perPlateDust;
  const ambientDust = quality.ambientDust;
  const haloCount = stars.length * perPlateDust;
  const dustCount = haloCount + ambientDust;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSizes = new Float32Array(dustCount);
  const dustBrightness = new Float32Array(dustCount);

  // Per-halo-particle identity, drawn once (seeded — reproducible, not
  // re-rolled every frame) and read every frame in update(): which star
  // it belongs to, its resting angle/radius/height around that star, its
  // own small orbit speed, and its own fade window along that star's
  // dissolve progress (0 = fades first, 1 = the last to go — see the
  // "residual population" note above).
  const haloStarIndex = new Int16Array(haloCount);
  const haloBaseAngle = new Float32Array(haloCount);
  const haloBaseRadius = new Float32Array(haloCount);
  const haloBaseHeight = new Float32Array(haloCount);
  const haloOrbitSpeed = new Float32Array(haloCount);
  const haloOrbitPhase = new Float32Array(haloCount);
  const haloBaseSize = new Float32Array(haloCount);
  const haloFadeStart = new Float32Array(haloCount);
  const haloFadeSpan = new Float32Array(haloCount);

  let haloIndex = 0;
  stars.forEach((star, starIndex) => {
    for (let i = 0; i < perPlateDust; i += 1) {
      // A different seed family than lifecycle.js's or
      // constellation.js's own hashes, so a halo particle's resting
      // position never correlates with its star's lifecycle timing or
      // spatial jitter.
      const rand = createSeededRandom(starIndex * 92821 + i * 131 + 7);
      haloStarIndex[haloIndex] = starIndex;
      haloBaseAngle[haloIndex] = rand() * Math.PI * 2;
      haloBaseRadius[haloIndex] = 0.75 + rand() * 0.55;
      haloBaseHeight[haloIndex] = (rand() - 0.5) * 1.1;
      haloOrbitSpeed[haloIndex] = 0.02 + rand() * 0.05;
      haloOrbitPhase[haloIndex] = rand() * Math.PI * 2;
      haloBaseSize[haloIndex] = 0.75 + rand() * 0.6;
      // Staggered across the dissolve progress (0=fully coherent →
      // 1=fully dissolved) so a star's particles thin out gradually
      // rather than all vanishing at the same instant its coherence
      // bottoms out. Widened (was 0.2–0.55/0.2–0.65) so a dissolving
      // star's trace persists across more of its decline — "the
      // disappearance should occur across space as well as time," not
      // mostly-gone the moment coherence starts falling.
      haloFadeStart[haloIndex] = 0.35 + rand() * 0.35;
      haloFadeSpan[haloIndex] = 0.3 + rand() * 0.5;
      haloIndex += 1;
    }
  });

  // Ambient dust keeps a fixed base position (below) plus a small, slow,
  // per-particle sinusoidal drift applied every frame in update() — "a
  // sparse particle stream," not a static backdrop. Sinusoidal (not a
  // one-directional wrap-and-recycle drift) so it never needs a visible
  // reset: the amplitude is modest and the period long enough that
  // within any few-minute viewing window it simply reads as gentle
  // motion, consistent with how every other cyclical value in this
  // experience is built (see lifecycle.js, constellation.js).
  const ambientBase = new Float32Array(ambientDust * 3);
  const ambientDriftAxis = new Float32Array(ambientDust * 3);
  const ambientDriftPhase = new Float32Array(ambientDust);
  const ambientDriftSpeed = new Float32Array(ambientDust);
  const ambientDriftAmplitude = new Float32Array(ambientDust);

  for (let i = 0; i < ambientDust; i += 1) {
    // Scattered across one base circuit (CONSTELLATION_LOOP_LENGTH —
    // see constellation.js's "VALIDATED PERIOD" note: this is one lap of
    // the shape, not the curve's true ~10-lap recurrence period) so the
    // visitor keeps encountering fine drifting particles between stars,
    // not just around them — but offset well off the centerline itself
    // (see constellation.js's own LATERAL_RANGE/VERTICAL_RANGE for the
    // star equivalent) so it reads as a field with depth, not a string
    // of dust strictly tracing the path. Every lap sits within the same
    // bounded radius/height envelope regardless of phase, so this single
    // lap's coverage stays representative no matter how far `t` travels.
    const t = Math.random() * CONSTELLATION_LOOP_LENGTH;
    const center = positionAt(t);
    const angle = Math.random() * Math.PI * 2;
    const spread = 3 + Math.random() * 6;
    const dustIndex = haloCount + i;
    const base = dustIndex * 3;
    ambientBase[i * 3] = center.x + Math.cos(angle) * spread;
    ambientBase[i * 3 + 1] = center.y + (Math.random() - 0.5) * 8;
    ambientBase[i * 3 + 2] = center.z + Math.sin(angle) * spread;
    dustPositions[base] = ambientBase[i * 3];
    dustPositions[base + 1] = ambientBase[i * 3 + 1];
    dustPositions[base + 2] = ambientBase[i * 3 + 2];

    // A random unit direction per particle — no shared "wind," each
    // mote drifts its own way, same "controlled randomness" the rest of
    // the field uses rather than a uniform decorative current.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    ambientDriftAxis[i * 3] = Math.sin(phi) * Math.cos(theta);
    ambientDriftAxis[i * 3 + 1] = Math.cos(phi);
    ambientDriftAxis[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
    ambientDriftPhase[i] = Math.random() * Math.PI * 2;
    ambientDriftSpeed[i] = (Math.PI * 2) / (40 + Math.random() * 60);
    ambientDriftAmplitude[i] = 1.5 + Math.random() * 3;

    // Same size/brightness range a fully-dispersed halo particle fades
    // down into — this is what makes the two populations look like one
    // continuous field rather than two different effects. Brightness
    // raised slightly (was 0.35–0.7) — the ambient field needed to
    // register as continuously-present matter, not near-invisible dust.
    dustSizes[dustIndex] = 0.5 + Math.random() * 0.6;
    dustBrightness[dustIndex] = 0.45 + Math.random() * 0.4;
  }

  const dustGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(dustPositions, 3);
  const sizeAttribute = new THREE.BufferAttribute(dustSizes, 1);
  const brightnessAttribute = new THREE.BufferAttribute(dustBrightness, 1);
  dustGeometry.setAttribute("position", positionAttribute);
  dustGeometry.setAttribute("aSize", sizeAttribute);
  dustGeometry.setAttribute("aBrightness", brightnessAttribute);

  // A small custom shader rather than THREE.PointsMaterial specifically
  // so brightness/size can vary per particle (see the file header) —
  // still exactly one draw call for the whole field.
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: dustColor },
      uOpacity: { value: 0.4 },
      uPixelRatio: { value: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aSize;
      attribute float aBrightness;
      varying float vBrightness;
      uniform float uPixelRatio;
      void main() {
        vBrightness = aBrightness;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // A simple perspective falloff (same intent as
        // THREE.PointsMaterial's sizeAttenuation) — particles farther
        // from the camera read smaller, same as everything else in the
        // scene, which is also most of how "distant dissolution" reads
        // as smaller without this file tracking camera distance itself.
        // 110.0 is a starting approximation for this scene's typical
        // viewing distances, not a value derived from the renderer's
        // actual viewport/FOV — a reasonable first pass to visually
        // re-tune once seen running, not a precise calibration.
        gl_PointSize = aSize * uPixelRatio * (110.0 / max(-mvPosition.z, 0.001));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        // A soft round dot rather than a square sprite — gl_PointCoord
        // is the unit square THREE always gives a point sprite; this
        // just masks it into a circle with a gentle falloff.
        vec2 centered = gl_PointCoord - 0.5;
        float dist = length(centered) * 2.0;
        float alpha = 1.0 - smoothstep(0.0, 1.0, dist);
        gl_FragColor = vec4(uColor, alpha * vBrightness * uOpacity);
      }
    `,
  });
  const points = new THREE.Points(dustGeometry, dustMaterial);

  // One outward-travel direction per star, computed once (not every
  // frame — a star's place on the constellation doesn't change): away
  // from the constellation's own spine, through this star's own
  // position, per the brief's "use the star's local constellation
  // frame." Only ever reads constellation.js's exported positionAt();
  // never re-derives the curve itself.
  const outwardDirections = stars.map((star) => {
    const spine = positionAt(star.constellationT ?? 0);
    const dx = star.basePosition.x - spine.x;
    const dy = star.basePosition.y - spine.y;
    const dz = star.basePosition.z - spine.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-4) {
      // A star placed exactly on the spine (vanishingly unlikely given
      // constellation.js's own jitter, but not impossible) — fall back
      // to straight up rather than a zero vector.
      return new THREE.Vector3(0, 1, 0);
    }
    return new THREE.Vector3(dx / length, dy / length, dz / length);
  });

  function update(delta, { stars: liveStars, elapsed, focused, reduceMotion, easeFactor }) {
    // Dimmed while inspecting a piece so the field behind it stays
    // quiet rather than competing for attention. Baseline raised
    // slightly (was 0.4/0.16) as part of strengthening the ambient
    // field's presence — still restrained, not a bright starfield.
    const dustOpacityTarget = focused ? 0.22 : 0.5;
    dustMaterial.uniforms.uOpacity.value +=
      (dustOpacityTarget - dustMaterial.uniforms.uOpacity.value) * easeFactor(delta);

    // Ambient dust's own slow, per-particle sinusoidal drift — cheap
    // (this loop only ever runs over the ambientDust budget, a few tens
    // of particles) and independent of any star's state, so it keeps
    // running even if `liveStars` is unavailable below.
    for (let i = 0; i < ambientDust; i += 1) {
      const driftMotion = reduceMotion ? 0.2 : 1;
      const swing =
        Math.sin(elapsed * ambientDriftSpeed[i] * driftMotion + ambientDriftPhase[i]) *
        ambientDriftAmplitude[i];
      const base = (haloCount + i) * 3;
      dustPositions[base] = ambientBase[i * 3] + ambientDriftAxis[i * 3] * swing;
      dustPositions[base + 1] = ambientBase[i * 3 + 1] + ambientDriftAxis[i * 3 + 1] * swing;
      dustPositions[base + 2] = ambientBase[i * 3 + 2] + ambientDriftAxis[i * 3 + 2] * swing;
    }
    positionAttribute.needsUpdate = true;

    if (!liveStars || elapsed === undefined) {
      return;
    }

    // prefers-reduced-motion: halos still breathe with presence (the
    // brief's "never fully static" still applies) but travel a far
    // shorter distance to get there, and orbit far more slowly. Coherence
    // (and so presence) is already compressed into a high band under
    // reduced motion (see index.js), so dissolve rarely approaches 1
    // there regardless — these just further shorten the range on the
    // occasions it does.
    const orbitDissolveRange = reduceMotion ? 0.25 : 0.9;
    const restlessRange = reduceMotion ? 0.15 : 1.2;
    const orbitScale = reduceMotion ? 0.2 : 1;
    const maxDissolveDistance = reduceMotion ? MAX_DISSOLVE_DISTANCE * 0.2 : MAX_DISSOLVE_DISTANCE;

    for (let i = 0; i < haloCount; i += 1) {
      const starIndex = haloStarIndex[i];
      const star = liveStars[starIndex];
      if (!star) {
        continue;
      }
      // presence (not raw coherence) drives everything below — see the
      // file header and index.js: a star can have near-zero coherence
      // (no longer a readable artwork) while still holding meaningful
      // presence (still a visible concentration of particles).
      const presence = star.presence ?? star.coherence ?? 1;
      const pulse = star.pulse ?? 0;
      const density = star.lifecycle?.densityScale ?? 1;
      // CONSOLIDATED VISUAL RECONSTRUCTION — "the particle field around
      // [a hovered star] should respond": a small, continuous brightness
      // lift on that star's own halo particles, riding on top of
      // presence rather than replacing it.
      const hover = star.hoverAmount ?? 0;
      // 0 = fully present, 1 = fully dispersed. Everything below is a
      // continuous function of this one number — the same formula runs
      // whether it's rising (reconstruction) or falling (fragmentation).
      const dissolve = 1 - presence;

      // Near-star orbit: tight and nearly still while coherent, looser
      // and more restless as it dissolves — but capped well short of
      // "far away," since the actual departure from the star's
      // neighborhood is the outward push below, not this term.
      const nearSpread = (1 + dissolve * orbitDissolveRange) * (0.85 + density * 0.3) * (1 + pulse * 0.05);
      const restlessness = 1 + dissolve * restlessRange;
      const angle = haloBaseAngle[i] + elapsed * haloOrbitSpeed[i] * restlessness * orbitScale;
      const radius = haloBaseRadius[i] * nearSpread;
      const bob =
        Math.sin(elapsed * haloOrbitSpeed[i] * 0.7 * orbitScale + haloOrbitPhase[i]) *
        0.3 *
        nearSpread;

      // The actual departure: eased in with dissolve² so it stays
      // negligible through most of a star's coherent life and only
      // really engages once a star is genuinely dissolving, travelling
      // outward from the constellation's own spine (not radially around
      // the star in an arbitrary plane) — "the matter that formed the
      // star continues travelling into the universe," not "the star
      // turns off."
      const outwardDistance = dissolve * dissolve * maxDissolveDistance;
      const outward = outwardDirections[starIndex];

      const center = star.holder.position;
      const base = i * 3;
      dustPositions[base] = center.x + Math.cos(angle) * radius + outward.x * outwardDistance;
      dustPositions[base + 1] =
        center.y + haloBaseHeight[i] * nearSpread + bob + outward.y * outwardDistance * 0.6;
      dustPositions[base + 2] =
        center.z + Math.sin(angle) * radius * 0.6 + outward.z * outwardDistance;

      // This particle's own fade, staggered against its siblings (see
      // haloFadeStart/haloFadeSpan above) — most of a star's particles
      // have already faded near-invisible well before dissolve reaches
      // 1, leaving only a genuinely small residual few still faintly
      // visible at the deepest point of dissolution.
      const fadeStart = haloFadeStart[i];
      const fadeEnd = Math.min(1, fadeStart + haloFadeSpan[i]);
      const remaining = 1 - smoothstepJs(fadeStart, fadeEnd, dissolve);

      dustSizes[i] = haloBaseSize[i] * (0.6 + 0.5 * remaining) * (1 + hover * 0.25);
      dustBrightness[i] = (0.45 + 0.6 * remaining) * (0.7 + 0.3 * presence) * (1 + hover * 0.5);
    }

    positionAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
    brightnessAttribute.needsUpdate = true;
  }

  function dispose() {
    dustGeometry.dispose();
    dustMaterial.dispose();
  }

  return { points, update, dispose };
}

// A plain JS smoothstep — used above on scalars, not GLSL, so it lives
// here rather than in a shader string.
function smoothstepJs(edge0, edge1, x) {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
