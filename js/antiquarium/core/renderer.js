// Antiquarium — core/renderer.js
//
// The one place scene/camera/renderer get constructed. Every experience
// module receives these three already built and sized to its container,
// so an experience never touches renderer setup or resize math itself —
// it only ever populates the scene with objects and reads the camera.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";

/**
 * @param {HTMLElement} container - element the canvas is mounted into.
 * @param {{ pixelRatioCap?: number }} options - pixelRatioCap lets a
 *   phone-tier caller ask for a lower backing-store resolution than the
 *   `2` desktop default; see core/device-tier.js for the presets that
 *   feed this in practice.
 * @returns {{
 *   scene: THREE.Scene,
 *   camera: THREE.PerspectiveCamera,
 *   renderer: THREE.WebGLRenderer,
 *   resize: () => void,
 *   dispose: () => void,
 * }}
 */
export function createStage(container, options = {}) {
  const scene = new THREE.Scene();
  // Keep the scene completely clear and un-hazed so the collection stays
  // crisp at every distance. The earlier fog was causing the distant
  // pieces to fade into a dark, blurry "fog of war" effect.
  scene.background = new THREE.Color(0x0a0a0b);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(
    42,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    100
  );
  camera.position.set(0, 0.4, 9);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  // Capped device pixel ratio: a monumental installation doesn't need
  // 3x retina supersampling to read as sophisticated, and capping this
  // is the single biggest lever for keeping the frame budget sane on
  // phones/tablets with very dense panels. The cap itself is tighter on
  // phone-tier devices (see device-tier.js) since fragment-shader and
  // fill-rate cost scales with backing-store pixel count, not CSS size.
  const pixelRatioCap = options.pixelRatioCap ?? 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  container.appendChild(renderer.domElement);

  function resize() {
    const width = container.clientWidth;
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function dispose() {
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return { scene, camera, renderer, resize, dispose };
}
