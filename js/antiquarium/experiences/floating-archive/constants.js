// Antiquarium — experiences/floating-archive/constants.js
//
// Shared palette + sizing constants for every Floating Archive module.
// Kept in one file so a future creative-direction pass (e.g. tuning the
// White Night atmosphere) only ever touches numbers here, not scattered
// hex literals through memory-star.js / atmosphere.js / particle-field.js.

// January8th identity — restrained use only (edges, halos, accents).
// See atmosphere.js for how sparingly these should actually appear once
// the White Night pass lands; this file only holds the values.
export const GOLD = 0xc6a85a;
export const MUTED_GOLD = 0x8f7a3e;

// STAGE 3 (Memory Star) — the base diameter of a Memory Star's circular
// core, before any per-artwork `scale` multiplier. Every star is a
// perfect circle now (see memory-star.js) — no aspect-ratio stretching
// — so a single diameter, not a width/height pair, fully describes size.
//
// FINAL VISUAL RECONSTRUCTION — raised substantially (1.9 → 2.5): the
// brief is explicit that stars were "generally too small and vague" and
// that a visitor should immediately recognize artwork content without
// needing to approach. This is the base every star's hierarchy
// multiplier (see memory-star.js's hierarchyScaleFor) and per-artwork
// `scale` still multiply on top of.
export const STAR_DIAMETER = 2.5;

export const FOCUS_SCALE = 1.2;
export const RECEDE_SCALE = 0.88;
export const RECEDE_OPACITY = 0.42;

export const reduceMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
