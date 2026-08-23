// Antiquarium — experiences/floating-archive/atmosphere.js
//
// Everything about how the room is lit and what sits behind it.
// Extracted from the old monolithic experience module so lighting has
// its own boundary, separate from star and particle-field code.
//
// PAGE-MATCHED BACKGROUND — the void behind the constellation is no
// longer a distinct "sky" color/gradient of its own; it now reads the
// page's own background (--secondary-black-colour, the same variable
// body {} itself is painted with — see css/style.css) live off the DOM
// and uses that exact color, in both the site's dark and light modes,
// so the archive has no background of its own at all: it's the page.
// A MutationObserver watches document.body's class attribute (that's
// how main.js's theme toggle switches modes — no custom event is
// fired) and re-reads the variable the instant the visitor flips
// modes, live, without needing a reload.
//
// Restores the renderer's original background/fog on dispose(), since
// `stage` (and its `scene`) is created once in main.js and reused across
// every experience — without restoring, switching to Cartography or a
// future installation after visiting the Floating Archive would leave
// them lit by this module's override instead of their own.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { GOLD, MUTED_GOLD } from "./constants.js";

// Reads the page's own background color straight off the CSS variable
// body {} itself uses — never hard-coded here, so light/dark and any
// future palette change are inherited automatically rather than
// re-typed in two places.
function readPageBackgroundColor() {
  const value = getComputedStyle(document.body)
    .getPropertyValue("--secondary-black-colour")
    .trim();
  return new THREE.Color(value || "#1a1a1d");
}

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

  const ambient = new THREE.AmbientLight(0x1e2438, 1.4);
  room.add(ambient);

  // A faint sky/ground light — "extremely restrained blue-gray ambient
  // illumination" carrying a hint of distant pre-dawn luminance, without
  // being a directional source anything casts a visible shadow-side
  // away from. Raised from the 3.7 preliminary pass (0.35 → 0.48) now
  // that this is the working atmosphere, not a placeholder.
  const hemisphere = new THREE.HemisphereLight(0x3a4a70, 0x0e1018, 0.48);
  room.add(hemisphere);

  // ---- Background override (see header note) ------------------------
  const previousBackground = scene.background;
  const previousFog = scene.fog;

  function applyPageBackground() {
    const color = readPageBackgroundColor();
    scene.background = color;
    scene.fog = null;
  }
  applyPageBackground();

  // Re-applies the instant the visitor flips light/dark — main.js's
  // theme toggle only ever adds/removes a class on <body>, no custom
  // event fires, so a class-attribute observer is the reliable way to
  // catch it live rather than polling every frame.
  const themeObserver = new MutationObserver(applyPageBackground);
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  function update(delta, { focused, easeFactor }) {
    // A faint spotlight brightening on the piece being inspected —
    // still one sparse key light, just leaned into slightly rather than
    // a second light being switched on.
    const keyIntensityTarget = focused ? 15 : 12;
    key.intensity += (keyIntensityTarget - key.intensity) * easeFactor(delta);
  }

  function restore() {
    themeObserver.disconnect();
    scene.background = previousBackground;
    scene.fog = previousFog;
  }

  return { key, rim, ambient, hemisphere, update, restore };
}
