// Antiquarium — experiences/floating-archive/memory-star.js
//
// Builds one Memory Star from one artworks.js entry: the object hierarchy
// (holder → tilt → frame → basePlane[+ring,+halo]), its texture load, and
// the per-instance animation state index.js's update loop drives every
// frame (float phase/speed, scale/opacity/focus targets, lifecycle).
//
// STAGE 4 (Memory Star) — the circular presentation.
// ----------------------------------------------------------------------
// Every star is now a perfect circle, regardless of the source image's
// own aspect ratio: `basePlane` is a CircleGeometry, and instead of
// stretching a rectangular plane to fit (the old approach, which would
// distort a landscape or portrait piece into a circle), the texture
// itself is center-cropped via `repeat`/`offset` — the longer axis of
// the source image is trimmed symmetrically from both sides so a
// square region reproduces without stretching, then that square maps
// onto the circle. Nothing about the source texture is discarded or
// re-encoded — this is a *display* crop, not a re-export — which is
// what keeps the door open for a future stage to reveal the same
// texture uncropped, in a rectangle, on selection (see "INTERACTION
// PREPARATION" below).
//
// A star's circular "core" (the image) and its "halo" (the soft glow
// bleeding past the rim) are deliberately two different, differently-
// sized circles sharing one center — see `HALO_RADIUS_SCALE` — so the
// halo has geometry to render into beyond the artwork's own edge
// without the image itself needing to be any bigger than its crop.
//
// STAGE 2 — where a star sits is not this file's decision. A star's
// position and heading come entirely from constellation.js's
// starPlacementFor(), passed in as `placement`.
//
// STAGE 3 — formation/dissolution/pulse are continuous lifecycle
// signals (lifecycle.js), not a scripted timer. Every star gets its own
// `lifecycle` and `coherence`/`pulse` fields index.js recomputes every
// frame from it; how those visually manifest (opacity, edge presence,
// scale, the surrounding particle halo) is index.js's and
// particle-field.js's decision — this file only attaches the lifecycle
// and exposes the slots.
//
// INTERACTION PREPARATION (not implemented here)
// ----------------------------------------------------------------------
// A later stage is expected to add "select a star → reveal the full
// rectangular artwork." This file deliberately keeps what that needs
// within easy reach without building it: `star.textureAspect` (the
// source image's true aspect ratio) and `star.baseMaterial.map` (the
// same, uncropped texture — only its UV transform is cropped) are both
// already on the star object. The circular crop is therefore a *display
// state*, not a destructive transformation — the next stage's job is
// swapping presentation, not re-fetching anything.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { GOLD, STAR_DIAMETER } from "./constants.js";
import { createPlaceholderTexture } from "../../core/placeholder-texture.js";
import { loadFittedTexture } from "../../core/texture-utils.js";
import { createLifecycle } from "./lifecycle.js";

const CIRCLE_SEGMENTS = 56;
// How much larger the halo circle is than the artwork circle it
// surrounds — 1.0 would mean no halo at all (the two coincide); kept
// modest so the glow reads as "restrained," per the brief's explicit
// warning against thick borders and excessive glow.
const HALO_RADIUS_SCALE = 1.32;
// Where the artwork's own rim falls in the halo mesh's normalized
// (0 at center, 1 at its own outer edge) distance space — the shader
// below draws its hairline boundary and its outward glow relative to
// this, not to the halo mesh's own edge.
const CORE_EDGE_RATIO = 1 / HALO_RADIUS_SCALE;

// Shared across every star so geometry/material creation isn't repeated
// per-instance — callers (index.js) own disposing these once, after all
// stars are gone.
export function createSharedGeometry() {
  const starGeometry = new THREE.CircleGeometry(0.5, CIRCLE_SEGMENTS);
  const haloGeometry = new THREE.CircleGeometry(0.5 * HALO_RADIUS_SCALE, CIRCLE_SEGMENTS);

  // A hairline ring tracing the artwork's own circular edge — deliberately
  // a plain LineLoop, not an EdgesGeometry-derived shape (which, on a
  // circle's triangle fan, would include every radial spoke as well as
  // the rim). "Very subtle circular boundary," not a card outline.
  const ringPositions = new Float32Array(CIRCLE_SEGMENTS * 3);
  for (let i = 0; i < CIRCLE_SEGMENTS; i += 1) {
    const theta = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    ringPositions[i * 3] = Math.cos(theta) * 0.5;
    ringPositions[i * 3 + 1] = Math.sin(theta) * 0.5;
    ringPositions[i * 3 + 2] = 0;
  }
  const ringGeometry = new THREE.BufferGeometry();
  ringGeometry.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));

  return { starGeometry, haloGeometry, ringGeometry };
}

function createOverlayMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      // 0 at rest, eased toward 1 while this star is the focused one —
      // the one thing that changes on selection: a touch more waver
      // and a touch more edge presence, nothing structural.
      uFocus: { value: 0 },
      // This star's own heartbeat, in [-1, 1] — see lifecycle.js. Feeds
      // only a small luminosity variation; never restructures the shape.
      uPulse: { value: 0 },
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
        // Extremely subtle waver, radiating from the circle's own
        // center rather than along a square's uv.y — a few thousandths
        // of a unit at rest, felt more than seen, and only on this glow
        // layer so the artwork image underneath stays perfectly crisp.
        float amplitude = mix(0.0035, 0.011, uFocus);
        float radial = length(uv - 0.5);
        displaced.z += sin(uTime * 0.8 + radial * 24.0) * amplitude;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uFocus;
      uniform float uPulse;

      void main() {
        // Normalized radial distance across THIS mesh (the halo circle,
        // which is larger than the artwork it surrounds) — 0 at center,
        // 1 at the halo's own outer rim. The artwork's rim itself sits
        // at CORE_EDGE_RATIO, not at 1.
        float dist = length(vUv - 0.5) * 2.0;
        float coreEdge = ${CORE_EDGE_RATIO.toFixed(5)};

        // A hairline right at the artwork's own edge — the "very subtle
        // circular boundary," not a drawn border.
        float boundary = 1.0 - smoothstep(0.0, 0.014, abs(dist - coreEdge));

        // A soft halo bleeding outward from that edge, fading to
        // nothing well before this mesh's own boundary — restrained,
        // never a glowing disc, never a hard ring.
        float halo =
          smoothstep(coreEdge, coreEdge + 0.06, dist) *
          (1.0 - smoothstep(coreEdge, 1.0, dist));

        // Stand-in for chromatic separation, kept entirely inside the
        // gold/charcoal palette: the boundary reads slightly warmer,
        // the halo slightly more muted — an artifact reconstructed from
        // light, not an RGB-split sci-fi hologram.
        vec3 warmGold = vec3(0.776, 0.659, 0.353);
        vec3 mutedGold = vec3(0.561, 0.478, 0.243);
        vec3 color = mix(mutedGold, warmGold, boundary);

        // A slow, gentle breathing of the edge's own intensity, plus
        // this star's own independent pulse — both small, neither ever
        // fading the boundary to nothing or flaring it bright.
        float breathing = 0.82 + 0.18 * sin(uTime * 0.4) + uPulse * 0.05;

        float alpha = (boundary * 0.34 + halo * 0.16) * breathing + boundary * 0.1 * uFocus;

        gl_FragColor = vec4(color, alpha * uOpacity);
      }
    `,
  });
}

/**
 * @param {object} data - one entry from data.js's `artworks` array.
 * @param {number} index - the entry's position in that array, used only
 *   to de-synchronize float phase/speed between stars.
 * @param {number} totalCount - artworks.length, for phase spacing.
 * @param {{ t: number, position: { x: number, y: number, z: number }, headingY: number }} placement -
 *   from constellation.js's starPlacementFor(index, totalCount) — the
 *   constellation is now the sole source of spatial placement; a star
 *   never positions itself from data.js's own (unused, legacy) fields.
 * @param {{ starGeometry: THREE.BufferGeometry, haloGeometry: THREE.BufferGeometry, ringGeometry: THREE.BufferGeometry, quality: object, disposedRef: { current: boolean } }} shared
 * @returns the star's runtime object, plus `pendingLoad` (cancel handle).
 */
export function createMemoryStar(data, index, totalCount, placement, shared) {
  const { starGeometry, haloGeometry, ringGeometry, quality, disposedRef } = shared;

  const holder = new THREE.Group();
  const basePosition = new THREE.Vector3(
    placement.position.x,
    placement.position.y,
    placement.position.z
  );
  holder.position.copy(basePosition);
  // Yaw only, from the constellation's local heading at this star's `t`
  // — no pitch/roll, so every star reads flat-on regardless of where on
  // the loop it sits (matches the flat rotation the previous hand-
  // authored data.js positions used).
  holder.rotation.set(0, placement.headingY, 0);

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
  const basePlane = new THREE.Mesh(starGeometry, baseMaterial);
  frame.add(basePlane);

  // The hairline rim and the soft outward halo both sit at the exact
  // same scale as basePlane (frame.scale is what actually sizes a star
  // on screen — see below), so they always track the artwork circle's
  // own edge exactly, at any per-artwork `scale` or coherence-driven
  // micro-scale.
  const edges = new THREE.LineLoop(
    ringGeometry,
    new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.6 })
  );
  edges.position.z = 0.001;
  basePlane.add(edges);

  const overlay = new THREE.Mesh(haloGeometry, createOverlayMaterial());
  overlay.position.z = 0.002;
  basePlane.add(overlay);

  const scaleMultiplier = data.scale ?? 1;
  // Uniform scale only — a circle stays a circle. The old rectangular
  // plate stretched non-uniformly to match each image's own aspect
  // ratio; a circle instead gets its center-crop from the texture's
  // repeat/offset (see applyTexture below), never from distorting the
  // mesh itself.
  basePlane.scale.set(STAR_DIAMETER * scaleMultiplier, STAR_DIAMETER * scaleMultiplier, 1);

  const lifecycle = createLifecycle(index, totalCount);

  // Declared before applyTexture/pendingLoad below (rather than after,
  // where the rest of this file's history would put it) because the
  // placeholder-texture path calls applyTexture synchronously, and
  // applyTexture needs `star` to already exist to record the image's
  // aspect ratio onto it.
  const star = {
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
    // Where along the constellation this star sits (constellation.js's
    // own `t` parameter) — kept so particle-field.js can look up
    // positionAt(constellationT) and derive "which direction is outward
    // from the constellation's spine, from this star's point of view"
    // for dissolving particles, without this file (or particle-field.js)
    // ever duplicating constellation.js's own placement math.
    constellationT: placement.t,
    // The source image's true aspect ratio — kept for a future "reveal
    // the full rectangular artwork" stage; unused by anything in this
    // one (see the "INTERACTION PREPARATION" note above). applyTexture
    // overwrites this the moment either the real image or its
    // placeholder loads, which for the placeholder case is
    // synchronously, later in this same function.
    textureAspect: 0.72,
    floatPhase: (index / Math.max(totalCount, 1)) * Math.PI * 2,
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
    // Continuous formation/dissolution + heartbeat (lifecycle.js). Both
    // start at harmless neutral values before the first frame ever
    // samples them; index.js overwrites both every frame after that.
    lifecycle,
    coherence: 1,
    pulse: 0,
  };

  const applyTexture = (texture) => {
    // A load can resolve after this experience has already been torn
    // down (fast navigation away, or a mid-load experience switch) —
    // without this guard the texture would still get uploaded to the
    // GPU and then orphaned, since dispose() already finished and will
    // never see it.
    if (disposedRef.current) {
      texture.dispose();
      return;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    const image = texture.image;
    const aspect = image && image.width ? image.width / image.height : 0.72;
    star.textureAspect = aspect;

    // Intelligent center crop: trim the longer axis symmetrically so a
    // square region of the source reproduces with no stretching, then
    // that square maps onto the circle. Landscape work loses its left/
    // right margins; portrait work loses top/bottom; square art is
    // untouched. THREE re-applies `repeat`/`offset` through the
    // texture's own UV transform automatically — no shader needed.
    if (aspect > 1) {
      texture.repeat.set(1 / aspect, 1);
      texture.offset.set((1 - 1 / aspect) / 2, 0);
    } else {
      texture.repeat.set(1, aspect);
      texture.offset.set(0, (1 - aspect) / 2);
    }

    baseMaterial.map = texture;
    baseMaterial.needsUpdate = true;
  };

  let pendingLoad = null;
  if (data.image) {
    // Capped to the current device tier's textureMaxDim (see
    // device-tier.js) — artwork exported or photographed far larger
    // than any plate displays it otherwise costs GPU memory and upload
    // time for resolution nothing on screen can show.
    pendingLoad = loadFittedTexture(data.image, {
      maxDim: quality.textureMaxDim,
      onLoad: applyTexture,
      onError: () => applyTexture(createPlaceholderTexture(data.title)),
    });
  } else {
    applyTexture(createPlaceholderTexture(data.title));
  }

  return { star, pendingLoad };
}
