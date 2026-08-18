// Antiquarium — experiences/floating-archive.js
//
// "THE FLOATING ARCHIVE" — an immersive room built entirely from the
// `artworks` list in floating-archive-data.js. This file never hard-codes
// an individual piece; it only knows how to turn one data entry into a
// holographic plate, and how a room full of them should behave (orbit,
// zoom, parallax, hover, focus-on-click, subtle independent drift).
//
// Exports a single factory, `createFloatingArchive(stage)`, returning
// { update(delta), dispose() } — the shape every experience module is
// expected to implement so main.js can drive any of them identically.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { createGalleryControls } from "../core/gallery-controls.js";
import { createPlaceholderTexture } from "../core/placeholder-texture.js";
import { loadFittedTexture } from "../core/texture-utils.js";
import { getQualityPreset } from "../core/device-tier.js";
import { artworks } from "./floating-archive-data.js";

const GOLD = 0xc6a85a;
const MUTED_GOLD = 0x8f7a3e;

const PLATE_BASE_WIDTH = 1.9;
const HOVER_SCALE = 1.045;
const FOCUS_SCALE = 1.2;
const RECEDE_SCALE = 0.88;
const RECEDE_OPACITY = 0.42;

const reduceMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createFloatingArchive(stage, context = {}) {
  const { scene, camera, renderer } = stage;
  const inspectorEl = context.inspectorEl || null;
  const inspectorTitleEl = context.inspectorTitleEl || null;
  const inspectorMetaEl = context.inspectorMetaEl || null;
  // main.js normally supplies this (computed once from device-tier.js);
  // the desktop preset is only a fallback for calling this factory
  // directly, e.g. from a test harness.
  const quality = context.quality || getQualityPreset("desktop");
  let disposed = false;
  const room = new THREE.Group();
  scene.add(room);

  // ---- Lighting -----------------------------------------------------
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

  // ---- Shared geometry --------------------------------------------------
  // Every plate is built from the same unit square; per-artwork size
  // comes entirely from scale, applied at three different levels (see
  // buildPlate below) so aspect-ratio correction, data-driven scale, and
  // hover/focus animation never fight over the same transform.
  const unitGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const unitEdges = new THREE.EdgesGeometry(unitGeometry);

  const overlayMaterial = () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        // 0 at rest, eased toward 1 while this plate is the focused one —
        // the one thing that changes on selection: a touch more waver
        // and a touch more edge presence, nothing structural.
        uFocus: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uFocus;
        void main() {
          vUv = uv;
          vec3 displaced = position;
          // Extremely subtle holographic waver — a few thousandths of a
          // unit at rest, felt more than seen, and only on this glow
          // layer so the artwork image underneath stays perfectly
          // crisp. Selecting the plate nudges the amplitude up slightly
          // rather than introducing a different effect.
          float amplitude = mix(0.0035, 0.011, uFocus);
          displaced.z += sin(uTime * 0.8 + uv.y * 12.0) * amplitude;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uOpacity;
        uniform float uFocus;

        void main() {
          float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          float edgeInner = 1.0 - smoothstep(0.0, 0.045, edgeDist);
          float edgeOuter = 1.0 - smoothstep(0.0, 0.06, edgeDist);

          // Stand-in for chromatic separation, kept entirely inside the
          // gold/charcoal palette: the outer ring reads slightly warmer,
          // the inner ring slightly more muted, so the edge fringes
          // instead of using an actual RGB split (which would read as a
          // generic sci-fi hologram, not an artifact reconstructed from
          // light).
          vec3 warmGold = vec3(0.776, 0.659, 0.353);
          vec3 mutedGold = vec3(0.561, 0.478, 0.243);
          vec3 edgeColor = mix(mutedGold, warmGold, edgeInner);

          // A slow, gentle breathing of the edge's own intensity —
          // never fading to nothing, never flaring bright.
          float breathing = 0.82 + 0.18 * sin(uTime * 0.4);

          float scan = pow(sin(vUv.y * 220.0 + uTime * 0.55) * 0.5 + 0.5, 6.0);

          float alpha =
            (edgeInner * 0.3 + edgeOuter * 0.09) * breathing +
            scan * 0.045 +
            edgeOuter * 0.07 * uFocus;

          gl_FragColor = vec4(edgeColor, alpha * uOpacity);
        }
      `,
    });

  const plates = [];
  const basePlanes = [];
  const pendingLoads = [];

  artworks.forEach((data, index) => {
    const holder = new THREE.Group();
    const basePosition = new THREE.Vector3(...(data.position || [0, 0, 0]));
    holder.position.copy(basePosition);
    holder.rotation.set(...(data.rotation || [0, 0, 0]));
    room.add(holder);

    // tilt sits between holder (data position/rotation + floating drift)
    // and frame (hover/focus scale) purely so the visitor's own drag-to-
    // rotate gesture during inspection has a transform of its own to
    // animate, without disturbing the artwork's curated base orientation.
    const tilt = new THREE.Group();
    holder.add(tilt);

    const frame = new THREE.Group();
    tilt.add(frame);

    const baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
    });
    const basePlane = new THREE.Mesh(unitGeometry, baseMaterial);
    frame.add(basePlane);

    const edges = new THREE.LineSegments(
      unitEdges,
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.6 })
    );
    basePlane.add(edges);

    const overlay = new THREE.Mesh(unitGeometry, overlayMaterial());
    overlay.position.z = 0.002;
    basePlane.add(overlay);

    const scaleMultiplier = data.scale ?? 1;
    basePlane.scale.set(PLATE_BASE_WIDTH * scaleMultiplier, PLATE_BASE_WIDTH * scaleMultiplier, 1);

    const applyTexture = (texture) => {
      // A load can resolve after this experience has already been torn
      // down (fast navigation away, or a mid-load experience switch) —
      // without this guard the texture would still get uploaded to the
      // GPU and then orphaned, since dispose() already finished and will
      // never see it.
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      const image = texture.image;
      const aspect = image && image.width ? image.width / image.height : 0.72;
      basePlane.scale.set(
        PLATE_BASE_WIDTH * scaleMultiplier,
        (PLATE_BASE_WIDTH / aspect) * scaleMultiplier,
        1
      );
      baseMaterial.map = texture;
      baseMaterial.needsUpdate = true;
    };

    if (data.image) {
      // Capped to the current device tier's textureMaxDim (see
      // device-tier.js) — artwork exported or photographed far larger
      // than any plate displays it otherwise costs GPU memory and upload
      // time for resolution nothing on screen can show.
      pendingLoads.push(
        loadFittedTexture(data.image, {
          maxDim: quality.textureMaxDim,
          onLoad: applyTexture,
          onError: () => applyTexture(createPlaceholderTexture(data.title)),
        })
      );
    } else {
      applyTexture(createPlaceholderTexture(data.title));
    }

    const plate = {
      title: data.title || "Untitled",
      medium: data.medium || "",
      holder,
      tilt,
      frame,
      basePlane,
      baseMaterial,
      edgesMaterial: edges.material,
      overlayMaterial: overlay.material,
      basePosition,
      floatPhase: (index / Math.max(artworks.length, 1)) * Math.PI * 2,
      floatSpeedX: 0.11 + (index % 3) * 0.015,
      floatSpeedY: 0.14 + (index % 4) * 0.017,
      floatSpeedZ: 0.09 + (index % 2) * 0.02,
      scaleTarget: 1,
      opacityTarget: 1,
      edgeOpacityTarget: 0.6,
      overlayOpacityTarget: 1,
      focusAmountTarget: 0,
      tiltYawTarget: 0,
      tiltPitchTarget: 0,
    };

    plates.push(plate);
    basePlanes.push(basePlane);
  });

  // ---- Restrained particle field -------------------------------------
  // Held to the same single draw call as before (no new Points objects
  // per plate — that would multiply GPU/CPU overhead by six for a
  // purely atmospheric detail). Instead the existing dust budget is
  // redistributed: most of it now settles in a loose halo around each
  // plate's edges rather than scattered uniformly through the room, so
  // it reads as "fine particles around the artwork" without costing
  // anything extra.
  const perPlateDust = quality.perPlateDust;
  const ambientDust = quality.ambientDust;
  const dustCount = plates.length * perPlateDust + ambientDust;
  const dustPositions = new Float32Array(dustCount * 3);
  let dustIndex = 0;

  plates.forEach((plate) => {
    for (let i = 0; i < perPlateDust; i += 1) {
      const haloRadius = 0.75 + Math.random() * 0.55;
      const angle = Math.random() * Math.PI * 2;
      dustPositions[dustIndex * 3] =
        plate.basePosition.x + Math.cos(angle) * haloRadius;
      dustPositions[dustIndex * 3 + 1] =
        plate.basePosition.y + (Math.random() - 0.5) * 1.1;
      dustPositions[dustIndex * 3 + 2] =
        plate.basePosition.z + Math.sin(angle) * haloRadius * 0.6;
      dustIndex += 1;
    }
  });

  for (let i = 0; i < ambientDust; i += 1) {
    const radius = 4 + Math.random() * 5;
    const angle = Math.random() * Math.PI * 2;
    dustPositions[dustIndex * 3] = Math.cos(angle) * radius;
    dustPositions[dustIndex * 3 + 1] = (Math.random() - 0.5) * 6;
    dustPositions[dustIndex * 3 + 2] = Math.sin(angle) * radius;
    dustIndex += 1;
  }

  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: MUTED_GOLD,
      size: 0.018,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
    })
  );
  room.add(dust);

  // ---- Camera rig -----------------------------------------------------
  const controls = createGalleryControls(renderer.domElement, camera, {
    idleDrift: reduceMotion ? 0 : 0.00018,
    speedScale: quality.rotateSpeedScale,
  });

  // ---- Hover + click/focus interaction --------------------------------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2(10, 10);
  let hoveredPlate = null;
  let focusedPlate = null;

  function pointerToNdc(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickPlate() {
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(basePlanes, false);
    if (!hits.length) {
      return null;
    }
    return plates.find((plate) => plate.basePlane === hits[0].object) || null;
  }

  function showInspector(plate) {
    if (!inspectorEl) {
      return;
    }
    if (inspectorTitleEl) {
      inspectorTitleEl.textContent = plate.title;
    }
    if (inspectorMetaEl) {
      inspectorMetaEl.textContent = plate.medium || "";
    }
    inspectorEl.hidden = false;
    // Two-step so the browser registers `hidden` being removed before
    // the opacity transition starts — otherwise the fade-in never runs.
    requestAnimationFrame(() => inspectorEl.classList.add("is-visible"));
  }

  function hideInspector() {
    if (!inspectorEl) {
      return;
    }
    inspectorEl.classList.remove("is-visible");
  }

  function setFocus(plate) {
    focusedPlate = plate;
    plate.tiltYawTarget = 0;
    plate.tiltPitchTarget = 0;
    controls.focusOn(plate.basePosition, plate.basePosition);
    applyFocusTargets();
    showInspector(plate);
  }

  function clearFocus() {
    if (focusedPlate) {
      focusedPlate.tiltYawTarget = 0;
      focusedPlate.tiltPitchTarget = 0;
    }
    focusedPlate = null;
    controls.clearFocus();
    applyFocusTargets();
    hideInspector();
  }

  function applyFocusTargets() {
    plates.forEach((plate) => {
      if (focusedPlate === plate) {
        plate.scaleTarget = FOCUS_SCALE;
        plate.opacityTarget = 1;
        plate.edgeOpacityTarget = 0.85;
        plate.overlayOpacityTarget = 0.6;
        plate.focusAmountTarget = 1;
      } else if (focusedPlate) {
        plate.scaleTarget = RECEDE_SCALE;
        plate.opacityTarget = RECEDE_OPACITY;
        plate.edgeOpacityTarget = 0.2;
        plate.overlayOpacityTarget = 0.3;
        plate.focusAmountTarget = 0;
      } else {
        plate.scaleTarget = 1;
        plate.opacityTarget = 1;
        plate.edgeOpacityTarget = 0.6;
        plate.overlayOpacityTarget = 1;
        plate.focusAmountTarget = 0;
      }
    });
  }

  // ---- Rotate the inspected artwork -----------------------------------
  // Once a plate is focused, the whole canvas becomes "turn this piece
  // in your hands" rather than "orbit the room" (gallery_controls already
  // suspends its own camera-orbit drag whenever focused, so the two
  // never fight over the same gesture). Kept as a small clamped tilt —
  // enough to read a piece's surface at an angle, not a free spin.
  const MAX_TILT_YAW = 0.5;
  const MAX_TILT_PITCH = 0.32;
  let rotateDragActive = false;
  let rotateDragMoved = 0;
  let lastRotateX = 0;
  let lastRotateY = 0;

  function onPointerDownRotate(event) {
    if (!focusedPlate) {
      return;
    }
    rotateDragActive = true;
    rotateDragMoved = 0;
    lastRotateX = event.clientX;
    lastRotateY = event.clientY;
  }

  function onPointerMoveHover(event) {
    pointerToNdc(event);

    if (!rotateDragActive || !focusedPlate) {
      return;
    }
    const dx = event.clientX - lastRotateX;
    const dy = event.clientY - lastRotateY;
    lastRotateX = event.clientX;
    lastRotateY = event.clientY;
    rotateDragMoved += Math.abs(dx) + Math.abs(dy);

    focusedPlate.tiltYawTarget = Math.max(
      -MAX_TILT_YAW,
      Math.min(MAX_TILT_YAW, focusedPlate.tiltYawTarget + dx * 0.0032)
    );
    focusedPlate.tiltPitchTarget = Math.max(
      -MAX_TILT_PITCH,
      Math.min(MAX_TILT_PITCH, focusedPlate.tiltPitchTarget + dy * 0.0028)
    );
  }

  function onPointerUp(event) {
    const wasRotateGesture = rotateDragActive && rotateDragMoved > 4;
    rotateDragActive = false;

    if (wasRotateGesture) {
      return;
    }
    if (!controls.wasClick()) {
      return;
    }
    pointerToNdc(event);
    const hit = pickPlate();

    if (hit) {
      setFocus(hit);
    } else if (focusedPlate) {
      clearFocus();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && focusedPlate) {
      clearFocus();
    }
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDownRotate);
  renderer.domElement.addEventListener("pointermove", onPointerMoveHover);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);

  // ---- Frame update -----------------------------------------------------
  let elapsed = 0;
  const easeFactor = (delta) => Math.min(1, delta * 6);

  function update(delta) {
    elapsed += delta;
    controls.update(delta);

    if (!focusedPlate) {
      const hit = pickPlate();
      if (hit !== hoveredPlate) {
        hoveredPlate = hit;
        plates.forEach((plate) => {
          plate.scaleTarget = plate === hoveredPlate ? HOVER_SCALE : 1;
        });
      }
    }

    plates.forEach((plate) => {
      if (!reduceMotion) {
        plate.holder.position.set(
          plate.basePosition.x + Math.sin(elapsed * plate.floatSpeedX + plate.floatPhase) * 0.055,
          plate.basePosition.y +
            Math.sin(elapsed * plate.floatSpeedY + plate.floatPhase * 1.3) * 0.07,
          plate.basePosition.z +
            Math.cos(elapsed * plate.floatSpeedZ + plate.floatPhase * 0.7) * 0.045
        );
        plate.overlayMaterial.uniforms.uTime.value = elapsed;
      }

      const t = easeFactor(delta);
      const currentScale = plate.frame.scale.x + (plate.scaleTarget - plate.frame.scale.x) * t;
      plate.frame.scale.setScalar(currentScale);

      plate.baseMaterial.opacity +=
        (plate.opacityTarget - plate.baseMaterial.opacity) * t;

      if (!reduceMotion) {
        // A barely-there ripple in the artwork's own opacity — present
        // enough to feel like a projected image rather than a flat
        // texture, restrained enough that it never reads as flicker or
        // hurts legibility.
        plate.baseMaterial.opacity *=
          0.99 + 0.01 * Math.sin(elapsed * 0.3 + plate.floatPhase * 1.6);
      }

      plate.edgesMaterial.opacity +=
        (plate.edgeOpacityTarget - plate.edgesMaterial.opacity) * t;
      plate.overlayMaterial.uniforms.uOpacity.value +=
        (plate.overlayOpacityTarget - plate.overlayMaterial.uniforms.uOpacity.value) * t;
      plate.overlayMaterial.uniforms.uFocus.value +=
        (plate.focusAmountTarget - plate.overlayMaterial.uniforms.uFocus.value) * t;

      // The visitor's own rotate-drag on the focused plate, and its
      // gentle return to neutral once inspection ends.
      plate.tilt.rotation.y += (plate.tiltYawTarget - plate.tilt.rotation.y) * t;
      plate.tilt.rotation.x += (plate.tiltPitchTarget - plate.tilt.rotation.x) * t;
    });

    // Slow enough that it reads as ambient settling dust, not a
    // spinning "energy field." Dimmed further while inspecting a piece
    // so the room behind it stays quiet rather than competing for
    // attention.
    dust.rotation.y += reduceMotion ? 0 : delta * 0.005;
    const dustOpacityTarget = focusedPlate ? 0.16 : 0.4;
    dust.material.opacity += (dustOpacityTarget - dust.material.opacity) * easeFactor(delta);

    // A faint spotlight brightening on the piece being inspected —
    // still one sparse key light, just leaned into slightly rather than
    // a second light being switched on.
    const keyIntensityTarget = focusedPlate ? 15 : 12;
    key.intensity += (keyIntensityTarget - key.intensity) * easeFactor(delta);
  }

  function dispose() {
    disposed = true;
    pendingLoads.forEach((pending) => pending.cancel());

    renderer.domElement.removeEventListener("pointerdown", onPointerDownRotate);
    renderer.domElement.removeEventListener("pointermove", onPointerMoveHover);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    hideInspector();
    controls.dispose();

    unitGeometry.dispose();
    unitEdges.dispose();
    dustGeometry.dispose();
    dust.material.dispose();

    plates.forEach((plate) => {
      plate.baseMaterial.map?.dispose();
      plate.baseMaterial.dispose();
      plate.edgesMaterial.dispose();
      plate.overlayMaterial.dispose();
    });

    scene.remove(room);
  }

  return { update, dispose };
}
