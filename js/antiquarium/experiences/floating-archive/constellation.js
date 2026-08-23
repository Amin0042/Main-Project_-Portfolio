// Antiquarium — experiences/floating-archive/constellation.js
//
// MECHANICAL CAROUSEL RECONSTRUCTION — the spine is now a lemniscate of
// Gerono: a literal infinity sign, laid out flat in the XZ (horizontal,
// "turntable") plane —
//
//   x = A · cos(t)
//   z = B · sin(t) · cos(t)
//
// `t` is simply the curve's own angle parameter, θ ∈ [0, 2π) — the
// shape is exactly periodic at 2π, with no separate arc-length-to-
// world-units conversion needed (the previous endless/recurring travel
// model, and the arc-length flavored `t` it used, are gone).
//
// WHERE THE "CAROUSEL" ACTUALLY LIVES
// ----------------------------------------------------------------------
// A star's position on this shape is still fixed once, here, at
// creation (starPlacementFor) — this file has no concept of the visitor
// turning anything. The turning itself is navigation.js's job now: it
// spins the `room` group (which holds every Memory Star placed by this
// file) rigidly around world-Y, like a real turntable — the camera
// stays still and the whole arrangement is what moves, driven directly
// by the visitor's drag/scroll. This file only ever answers "where does
// star N sit on the infinity sign," never "what's currently in front of
// the visitor."
//
// STARS ARE NOT ON THE SPINE ITSELF
// ----------------------------------------------------------------------
// Same principle as before: `starPlacementFor` displaces each star
// off the spine using the local right/up frame at that star's `t` (see
// `frameAt`), so stars sit beside, above, below and slightly ahead/
// behind one another rather than strung like beads along the curve
// itself. Displacement ranges are deliberately smaller than the old
// free-floating constellation's — this is a precise, mechanical
// arrangement, not a drifting spatial cloud.

const LOOP_A = 26; // half-width of the infinity sign, in world units
const LOOP_B = 15; // depth of each lobe

// Central-difference epsilon for the tangent estimate in forwardAt() —
// t is now a plain angle in [0, 2π), so this only needs to be small
// relative to that range, not to an arc-length unit.
const TANGENT_EPSILON = 0.01;

// ---- deterministic pseudo-random (mulberry32) -------------------------
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
 * The spine itself — a lemniscate of Gerono, flat in the XZ plane.
 * @param {number} t
 * @returns {{ x: number, y: number, z: number }}
 */
export function positionAt(t) {
  const x = LOOP_A * Math.cos(t);
  const z = LOOP_B * Math.sin(t) * Math.cos(t);
  return { x, y: 0, z };
}

/**
 * Normalized tangent direction of the spine at `t`, via a small central
 * difference — used to orient stars "along" the shape.
 * @param {number} t
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
 * fixed world "up" — keeps a star's local displacement free of any
 * roll/banking: it only ever yaws/pitches with the shape's direction,
 * never rotates around it.
 * @param {number} t
 */
function frameAt(t) {
  const forward = forwardAt(t);
  const worldUp = { x: 0, y: 1, z: 0 };

  let rx = forward.y * worldUp.z - forward.z * worldUp.y;
  let ry = forward.z * worldUp.x - forward.x * worldUp.z;
  let rz = forward.x * worldUp.y - forward.y * worldUp.x;
  let rLen = Math.hypot(rx, ry, rz);
  if (rLen < 1e-5) {
    rx = 1;
    ry = 0;
    rz = 0;
    rLen = 1;
  }
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;

  const ux = ry * forward.z - rz * forward.y;
  const uy = rz * forward.x - rx * forward.z;
  const uz = rx * forward.y - ry * forward.x;

  return {
    forward,
    right: { x: rx, y: ry, z: rz },
    up: { x: ux, y: uy, z: uz },
  };
}

// Deliberately smaller than the old free-floating constellation's —
// "mechanical" reads as a precise, legible arrangement, not a chaotic
// scatter; the shape itself (not per-star randomness) is now what
// carries the composition's visual interest.
const LATERAL_RANGE = 2.2;
const VERTICAL_RANGE = 3.4;
const DEPTH_JITTER = 1.6;

/**
 * Where one Memory Star sits: a point `t` along the spine, plus a
 * small, controlled displacement off it. Deterministic per
 * (index, totalCount) — the same star always lands in the same place.
 *
 * @param {number} index
 * @param {number} totalCount
 * @returns {{ t: number, position: { x: number, y: number, z: number }, headingY: number }}
 */
export function starPlacementFor(index, totalCount) {
  const rand = hashRandom(index * 7919 + 17);
  const count = Math.max(totalCount, 1);

  const slot = (Math.PI * 2) / count;
  const jitter = (rand() - 0.5) * slot * 0.4;
  const t = index * slot + jitter;

  const center = positionAt(t);
  const { right, up, forward } = frameAt(t);

  const lateral = (rand() - 0.5) * 2 * LATERAL_RANGE;
  const vertical = (rand() - 0.5) * 2 * VERTICAL_RANGE;
  const depth = (rand() - 0.5) * 2 * DEPTH_JITTER;

  const position = {
    x: center.x + right.x * lateral + up.x * vertical + forward.x * depth,
    y: center.y + right.y * lateral + up.y * vertical + forward.y * depth,
    z: center.z + right.z * lateral + up.z * vertical + forward.z * depth,
  };

  const headingY = Math.atan2(forward.x, forward.z) + Math.PI;

  return { t, position, headingY };
}

export const CONSTELLATION_LOOP_LENGTH = Math.PI * 2;
export const CONSTELLATION_RADIUS = LOOP_A;
