// Antiquarium — experiences/floating-archive/starfield-backdrop.js
//
// CONSOLIDATED VISUAL RECONSTRUCTION — the actual night sky behind
// everything else. Memory Stars and the ambient dust field are both
// deliberately sparse (the brief is explicit that neither should be a
// dense starfield) — which is correct for THEM, but left the space
// between and beyond them reading as empty black rather than "an
// infinite dark sky." This module is the missing layer: a large,
// static shell of small fixed background points, centered on the
// camera every frame (so it always surrounds the visitor, at every
// point along the endless constellation, the way a real sky always
// surrounds you no matter where you walk) and each one twinkling on
// its own slow, independent phase.
//
// This is pure backdrop, not part of the constellation's own spatial
// system: it never reacts to lifecycle, hover, or focus, costs one
// static buffer (no per-frame CPU writes — the twinkle runs entirely
// in the fragment shader off a single uTime uniform) and one draw
// call, and is placed far enough out that it never visually competes
// with an actual Memory Star in the foreground.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";

// Kept well inside core/renderer.js's shared camera far-clip plane
// (100 world units) — anything farther out would simply never render.
// Still comfortably beyond the lemniscate's own extent (constellation.js's
// LOOP_A/LOOP_B are 26/15) and this experience's fixed camera distance.
const SHELL_RADIUS = 88;

// Modest, tier-scaled counts — this is background texture for an
// otherwise-dark sky, not a second particle system to budget seriously
// against; even the desktop count costs a fraction of a millisecond.
const COUNTS = {
  "small-phone": 420,
  phone: 560,
  tablet: 720,
  desktop: 900,
};

/**
 * @param {THREE.Camera} camera - the backdrop re-centers on this every
 *   frame so it always reads as "the whole sky," never a bounded shell
 *   the visitor could travel far enough to reach the edge of.
 * @param {{ ambientDust?: number }} quality - only used to key into
 *   COUNTS by rough device tier; falls back to desktop's count.
 * @param {string} [tierName]
 */
export function createStarfieldBackdrop(camera, tierName) {
  const count = COUNTS[tierName] || COUNTS.desktop;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const brightness = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    // Uniform distribution over a sphere shell (not a cube-then-normalize,
    // which clusters toward corners) via the standard spherical sampling
    // trick, at a fixed radius — a shell, not a filled volume, since
    // these are meant to read as infinitely distant, not scattered
    // through the navigable space.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const r = SHELL_RADIUS * (0.92 + Math.random() * 0.08);
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.cos(phi) * r;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;

    // A natural hierarchy of star sizes/brightness — most faint, a few
    // notably brighter — same "some prominent, most quiet" composition
    // principle the brief asks for among the Memory Stars themselves,
    // echoed here at the backdrop scale.
    const prominence = Math.random();
    sizes[i] = prominence > 0.92 ? 2.4 + Math.random() * 1.6 : 0.9 + Math.random() * 1.1;
    brightness[i] = prominence > 0.92 ? 0.75 + Math.random() * 0.25 : 0.25 + Math.random() * 0.35;
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.15 + Math.random() * 0.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aBrightness;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      void main() {
        // Slow, gentle, never-synchronized twinkle — each star's own
        // phase/speed, same "controlled randomness, no two alike"
        // principle used everywhere else in this experience.
        vTwinkle = aBrightness * (0.7 + 0.3 * sin(uTime * aSpeed + aPhase));
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vTwinkle;
      void main() {
        vec2 centered = gl_PointCoord - 0.5;
        float dist = length(centered) * 2.0;
        float alpha = 1.0 - smoothstep(0.0, 1.0, dist);
        // FINAL VISUAL RECONSTRUCTION — strictly cool/neutral, never
        // warm-gold: the brief requires an unmistakable hierarchy
        // between these (tiny, faint, cool, non-interactive) and the
        // warm, interactive Memory Stars. A slightly cooler blue-white
        // on the brightest points, a quieter blue-gray on the rest.
        vec3 color = mix(vec3(0.62, 0.68, 0.82), vec3(0.85, 0.90, 0.98), step(0.8, vTwinkle));
        gl_FragColor = vec4(color, alpha * vTwinkle);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -10;

  function update(delta, elapsed) {
    material.uniforms.uTime.value = elapsed;
    // Re-center on the camera every frame — the sky, not a piece of
    // scenery the visitor could ever fly far enough to leave behind.
    points.position.copy(camera.position);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { points, update, dispose };
}
