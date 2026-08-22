// Antiquarium — experiences/floating-archive/atmosphere.js
//
// Everything about how the room is lit and what sits behind it.
// Extracted from the old monolithic experience module so lighting has
// its own boundary, separate from star and particle-field code.
//
// STAGE 3.7 — preliminary White-Night base.
// ----------------------------------------------------------------------
// This is deliberately NOT the final atmosphere (no clouds, no moon, no
// sky shader, no bloom — those are a later, dedicated stage). Its only
// job right now is to stop the constellation from being evaluated
// against literal black: `core/renderer.js` hard-codes scene.background/
// fog to a near-black 0x0a0a0b shared by every experience on this page,
// which made a sparse particle field read as "empty" regardless of how
// much was actually there. This module now overrides that per-scene —
// a very subtle deep-midnight-blue background, a faint blue-gray
// hemisphere light for restrained ambient depth — and, critically,
// restores the renderer's original background/fog on dispose(), since
// `stage` (and its `scene`) is created once in main.js and reused across
// every experience: without restoring, switching to Cartography or a
// future installation after visiting the Floating Archive would leave
// them lit by this module's override instead of their own.
//
// The two point lights below (`key`/`rim`) are unchanged from before —
// still tuned as sparse picture-lights. They'll need a further pass once
// the *final* atmosphere lands (a lighter sky may call for re-balancing
// them so the room doesn't just get uniformly brighter) — noted, not
// done here.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { GOLD, MUTED_GOLD } from "./constants.js";

// Deliberately close to the renderer's own near-black (0x0a0a0b) — just
// enough blue lift to read as "midnight," not a lighter sky. See the
// header note: the final White Night pass owns the real atmosphere.
const MIDNIGHT_BLUE = 0x0d1220;

/**
 * @param {THREE.Group} room - lights are added directly to the room group
 *   (not the scene) so they get torn down for free when index.js removes
 *   the room on dispose.
 * @param {THREE.Scene} scene - needed only to temporarily override
 *   background/fog and restore them again on dispose.
 */
export function createAtmosphere(room, scene) {
  // Sparse, directional picture-lights rather than a flat, evenly-lit
  // "product render" — the room should feel like a handful of exhibits
  // caught in their own pools of light, not a fully-illuminated hall.
  const key = new THREE.PointLight(GOLD, 12, 22, 2);
  key.position.set(4, 5, 6);
  room.add(key);

  const rim = new THREE.PointLight(MUTED_GOLD, 5, 26, 2);
  rim.position.set(-6, -3, -4);
  room.add(rim);

  const ambient = new THREE.AmbientLight(0x1a1a1d, 1.2);
  room.add(ambient);

  // A faint sky/ground light rather than a second point light — this is
  // what gives "extremely restrained blue-gray ambient illumination" and
  // a hint of "faint distant luminance" without being a directional
  // source anything could cast a visible shadow-side away from. Kept
  // deliberately dim; it's a foundation, not the final sky.
  const hemisphere = new THREE.HemisphereLight(0x2a3550, 0x0a0a0d, 0.35);
  room.add(hemisphere);

  // ---- Preliminary background/fog override (see header note) --------
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  scene.background = new THREE.Color(MIDNIGHT_BLUE);
  // Slightly less dense and slightly bluer than the renderer's default
  // fog — enough that distant particles still read as "in atmosphere"
  // rather than "faded to nothing," without visibly softening the whole
  // scene (that's the final atmosphere stage's job, not this one's).
  scene.fog = new THREE.FogExp2(MIDNIGHT_BLUE, 0.032);

  function update(delta, { focused, easeFactor }) {
    // A faint spotlight brightening on the piece being inspected —
    // still one sparse key light, just leaned into slightly rather than
    // a second light being switched on.
    const keyIntensityTarget = focused ? 15 : 12;
    key.intensity += (keyIntensityTarget - key.intensity) * easeFactor(delta);
  }

  function restore() {
    scene.background = previousBackground;
    scene.fog = previousFog;
  }

  return { key, rim, ambient, hemisphere, update, restore };
}
