// Antiquarium — experiences/floating-archive/constellation.js
//
// STAGE 2 — the spatial/navigation architecture. This is now the single
// source of truth for "where is anything in the Floating Archive" — a
// broad, curved, recurring field rather than a bounded room. Every other
// module reads position from here; nothing else re-derives the curve.
//
// THE SHAPE
// ----------------------------------------------------------------------
// `t` is travel distance — any real number, forward or backward,
// unbounded. `positionAt(t)` maps it to a world-space point along a
// centerline built entirely from sums of sine/cosine of `t` — it is
// already periodic, with no modulo, no wraparound branch, no "teleport
// back to the start." Travelling forward indefinitely simply keeps
// evaluating the same smooth function further out.
//
// VALIDATED PERIOD — the frequencies below (1×, 1.7×, 1.3×, 0.6×, 0.5×)
// are all rational multiples of a common 0.1 unit, so the curve is
// exactly periodic (not merely quasi-periodic) — but its fundamental
// period is 20π in `a` (10 full turns of the base 1× circle), i.e.
// `20π × LOOP_RADIUS ≈ 1885` units of `t`, exactly 10× `LOOP_LENGTH`.
// `LOOP_LENGTH` is only the length of one base circuit — position,
// tangent, and everything derived from them (frame, star headings) has
// been verified (analytically and numerically) to match to floating-
// point precision at that true period, forward and backward, with no
// jump anywhere along the way — there simply is no special "recurrence
// point" in the code for a discontinuity to occur at.
//
// The centerline is deliberately not a flat circle: radius, height, and
// lateral bow each vary with `t` at different, non-integer-related
// frequencies and phases (1×, 1.7×, 1.3×, 0.6× the base loop, offset by
// arbitrary phases). A visitor can trace the whole loop and never see a
// single obviously-round shape — the recurrence should only become
// apparent after a long, deliberate exploration, per the brief.
//
// This is an ARTISTIC use of periodic/recurrent structure — a metaphor
// for recurrence and apparent infinity — not a physics or quantum-
// mechanics simulation of any kind.
//
// STARS ARE NOT ON THE CENTERLINE
// ----------------------------------------------------------------------
// The centerline is a spine, not a corridor: `starPlacementFor` displaces
// each star away from it, using the local right/up frame at that star's
// `t` (see `frameAt`), so stars sit ahead, beside, above, below and
// slightly behind one another in a real volume around the path rather
// than strung like beads along a single line.
//
// Placement uses a small deterministic pseudo-random hash (seeded by
// index, not `Math.random()`) so the same star always ends up in the
// same place across a session's re-renders — "controlled randomness,"
// not chaos.

const LOOP_RADIUS = 30;
const LOOP_LENGTH = Math.PI * 2 * LOOP_RADIUS; // ≈ 188 — the length of ONE
// base circuit (t is in the same rough units as world space, so travel-
// speed constants elsewhere read as "world units per second"). This is
// NOT the curve's true recurrence period — see the "VALIDATED PERIOD"
// note above; the exact pattern only repeats every 10× this distance.

const RADIUS_WOBBLE = 9; // how much the loop's radius breathes in/out
const HEIGHT_AMPLITUDE = 10; // vertical wander over the course of the loop
const LATERAL_BOW = 7; // additional in-plane bow, out of phase with radius

// Central-difference epsilon for the tangent estimate in forwardAt().
const TANGENT_EPSILON = 0.35;

// ---- deterministic pseudo-random (mulberry32) -------------------------
// A tiny seeded generator so star placement is reproducible rather than
// re-shuffling on every reload, without pulling in a dependency for it.
function hashRandom(seed) {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The centerline itself — a broad, gently-curved recurring spine.
 * @param {number} t
 * @returns {{ x: number, y: number, z: number }}
 */
export function positionAt(t) {
  const a = (t / LOOP_LENGTH) * Math.PI * 2;

  const radius =
    LOOP_RADIUS +
    Math.sin(a * 1.7 + 1.1) * RADIUS_WOBBLE * 0.6 +
    Math.cos(a * 0.6 + 2.4) * RADIUS_WOBBLE * 0.4;

  const bow = Math.sin(a * 1.3 + 0.7) * LATERAL_BOW;

  const x = Math.cos(a) * radius + Math.cos(a * 1.3 + 2.0) * (LATERAL_BOW * 0.3);
  const z = Math.sin(a) * radius + bow * 0.4;
  const y =
    Math.sin(a * 1.3 + 0.7) * HEIGHT_AMPLITUDE * 0.6 +
    Math.cos(a * 0.5 + 1.6) * HEIGHT_AMPLITUDE * 0.4;

  return { x, y, z };
}

/**
 * Normalized tangent direction of the centerline at `t`, via a small
 * central difference — used to orient stars (and, later, anything else)
 * "along" the constellation rather than at a fixed world direction.
 * @param {number} t
 * @returns {{ x: number, y: number, z: number }}
 */
export function forwardAt(t) {
  const before = positionAt(t - TANGENT_EPSILON);
  const after = positionAt(t + TANGENT_EPSILON);
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const dz = after.z - before.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / length, y: dy / length, z: dz / length };
}

/**
 * The stable local right/up frame at `t`, built from the tangent and a
 * fixed world "up" (never the tangent's own up) — this is what keeps
 * the constellation's local displacement free of any roll/banking: the
 * frame only ever yaws and pitches with the path's direction, never
 * rotates around it.
 * @param {number} t
 */
function frameAt(t) {
  const forward = forwardAt(t);
  const worldUp = { x: 0, y: 1, z: 0 };

  // right = forward × worldUp
  let rx = forward.y * worldUp.z - forward.z * worldUp.y;
  let ry = forward.z * worldUp.x - forward.x * worldUp.z;
  let rz = forward.x * worldUp.y - forward.y * worldUp.x;
  let rLen = Math.hypot(rx, ry, rz);
  if (rLen < 1e-5) {
    // Tangent momentarily parallel to world-up — practically never
    // happens on this shape, but fall back to world-right rather than
    // producing a degenerate (0,0,0) frame.
    rx = 1;
    ry = 0;
    rz = 0;
    rLen = 1;
  }
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;

  // up = right × forward
  const ux = ry * forward.z - rz * forward.y;
  const uy = rz * forward.x - rx * forward.z;
  const uz = rx * forward.y - ry * forward.x;

  return {
    forward,
    right: { x: rx, y: ry, z: rz },
    up: { x: ux, y: uy, z: uz },
  };
}

// Tuning for how far a star can sit off the centerline. Kept well inside
// the centerline's own radius wobble so stars from adjacent parts of the
// loop never overlap in world space (see the note in index.js).
const LATERAL_RANGE = 5.5;
const VERTICAL_RANGE = 3.6;
const DEPTH_JITTER = 4.5; // extra spread along the tangent itself

/**
 * Where one Memory Star sits: a point `t` along the centerline, plus an
 * irregular-but-controlled displacement off it. Deterministic per
 * (index, totalCount) — the same star always lands in the same place.
 *
 * @param {number} index
 * @param {number} totalCount
 * @returns {{ t: number, position: { x: number, y: number, z: number }, headingY: number }}
 */
export function starPlacementFor(index, totalCount) {
  const rand = hashRandom(index * 7919 + 17);
  const count = Math.max(totalCount, 1);

  // Evenly spread around the whole loop, then perturbed — irregular
  // spacing rather than a uniform ring of beads, per the brief, while
  // still guaranteeing no two stars crowd the same stretch of path.
  const slot = LOOP_LENGTH / count;
  const jitter = (rand() - 0.5) * slot * 0.55;
  const t = index * slot + jitter;

  const { position: center, right, up, forward } = (() => {
    const p = positionAt(t);
    const frame = frameAt(t);
    return { position: p, right: frame.right, up: frame.up, forward: frame.forward };
  })();

  const lateral = (rand() - 0.5) * 2 * LATERAL_RANGE;
  const vertical = (rand() - 0.5) * 2 * VERTICAL_RANGE;
  const depth = (rand() - 0.5) * 2 * DEPTH_JITTER;

  const position = {
    x: center.x + right.x * lateral + up.x * vertical + forward.x * depth,
    y: center.y + right.y * lateral + up.y * vertical + forward.y * depth,
    z: center.z + right.z * lateral + up.z * vertical + forward.z * depth,
  };

  // Face roughly back along the direction a visitor would be arriving
  // from, so the artwork reads front-on rather than edge-on to the
  // dominant direction of travel. Yaw only (matches the flat rotation
  // the previous hand-authored data used) — no pitch/roll, so stars
  // never look tilted at odd angles regardless of where on the loop
  // they sit.
  const headingY = Math.atan2(forward.x, forward.z) + Math.PI;

  return { t, position, headingY };
}

export const CONSTELLATION_LOOP_LENGTH = LOOP_LENGTH;
export const CONSTELLATION_RADIUS = LOOP_RADIUS;
