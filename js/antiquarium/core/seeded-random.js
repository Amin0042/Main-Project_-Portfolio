// Antiquarium — core/seeded-random.js
//
// A tiny deterministic pseudo-random generator (mulberry32), shared by
// any module that needs "reproducible randomness" per integer seed
// rather than `Math.random()`'s unrepeatable stream — e.g. giving every
// Memory Star its own lifecycle timing that stays the same across a
// session's re-renders instead of re-shuffling on every frame or reload.

/**
 * @param {number} seed - any integer; the same seed always produces the
 *   same sequence of values from the returned generator.
 * @returns {() => number} a function that returns the next value in
 *   [0, 1) each time it's called.
 */
export function createSeededRandom(seed) {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
