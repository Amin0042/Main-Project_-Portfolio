// Antiquarium — experiences/floating-archive/index.js
//
// "THE FLOATING ARCHIVE" — orchestrator. Composes:
//   • data.js            — the artwork manifest
//   • memory-star.js      — one Memory Star per artwork
//   • particle-field.js   — the ambient dust
//   • atmosphere.js       — lighting
//   • navigation.js       — the camera rig
// and owns everything that has to see all of them at once: hover/click
// picking, the focus/inspector flow, and the per-frame update/dispose
// contract main.js expects from every experience.
//
// STAGE 2 wired the constellation/navigation architecture in: stars now
// sit along constellation.js's endless, recurring path instead of a
// bounded room, and the camera travels/looks around it via
// navigation.js instead of orbiting a fixed center.
//
// STAGE 3/4 added the living Memory Star: continuous coherence-driven
// formation/dissolution and an independent per-star pulse (both from
// lifecycle.js), and the circular presentation (memory-star.js). Still
// not implemented: the White Night atmosphere, and full artwork
// inspection/reveal (today's focus flow still dollies the camera to a
// circular star, not to an expanded rectangular view).
//
// Exports a single factory, `createFloatingArchive(stage, context)`,
// returning { update(delta), dispose() } — the shape every experience
// module is expected to implement so main.js can drive any of them
// identically.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { createNavigation } from "./navigation.js";
import { createAtmosphere } from "./atmosphere.js";
import { createParticleField } from "./particle-field.js";
import { createMemoryStar, createSharedGeometry } from "./memory-star.js";
import { starPlacementFor } from "./constellation.js";
import { getQualityPreset } from "../../core/device-tier.js";
import { artworks } from "./data.js";
import {
  HOVER_SCALE,
  FOCUS_SCALE,
  RECEDE_SCALE,
  RECEDE_OPACITY,
  reduceMotion,
} from "./constants.js";

export function createFloatingArchive(stage, context = {}) {
  const { scene, camera, renderer } = stage;
  const inspectorEl = context.inspectorEl || null;
  const inspectorTitleEl = context.inspectorTitleEl || null;
  const inspectorMetaEl = context.inspectorMetaEl || null;
  // main.js normally supplies this (computed once from device-tier.js);
  // the desktop preset is only a fallback for calling this factory
  // directly, e.g. from a test harness.
  const quality = context.quality || getQualityPreset("desktop");
  const disposedRef = { current: false };
  const room = new THREE.Group();
  scene.add(room);

  const atmosphereRig = createAtmosphere(room, scene);

  // ---- Memory Stars ---------------------------------------------------
  const { starGeometry, haloGeometry, ringGeometry } = createSharedGeometry();
  const stars = [];
  const basePlanes = [];
  const pendingLoads = [];

  artworks.forEach((data, index) => {
    // Where this star sits is entirely constellation.js's decision now
    // (see the architecture note at the top of data.js) — index.js only
    // asks for a placement and hands it through.
    const placement = starPlacementFor(index, artworks.length);
    const { star, pendingLoad } = createMemoryStar(data, index, artworks.length, placement, {
      starGeometry,
      haloGeometry,
      ringGeometry,
      quality,
      disposedRef,
    });
    room.add(star.holder);
    stars.push(star);
    basePlanes.push(star.basePlane);
    if (pendingLoad) {
      pendingLoads.push(pendingLoad);
    }
  });

  // ---- Ambient particle field ------------------------------------------
  const particleField = createParticleField(stars, quality);
  room.add(particleField.points);

  // ---- Camera rig -----------------------------------------------------
  const controls = createNavigation(renderer.domElement, camera, {
    idleDrift: reduceMotion ? 0 : undefined, // undefined → navigation.js's own tuned default
    speedScale: quality.rotateSpeedScale,
  });

  // ---- Hover + click/focus interaction --------------------------------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2(10, 10);
  let hoveredStar = null;
  let focusedStar = null;

  function pointerToNdc(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickStar() {
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(basePlanes, false);
    if (!hits.length) {
      return null;
    }
    return stars.find((star) => star.basePlane === hits[0].object) || null;
  }

  function showInspector(star) {
    if (!inspectorEl) {
      return;
    }
    if (inspectorTitleEl) {
      inspectorTitleEl.textContent = star.title;
    }
    if (inspectorMetaEl) {
      inspectorMetaEl.textContent = star.medium || "";
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

  function setFocus(star) {
    focusedStar = star;
    star.tiltYawTarget = 0;
    star.tiltPitchTarget = 0;
    controls.focusOn(star.basePosition, star.basePosition);
    applyFocusTargets();
    showInspector(star);
  }

  function clearFocus() {
    if (focusedStar) {
      focusedStar.tiltYawTarget = 0;
      focusedStar.tiltPitchTarget = 0;
    }
    focusedStar = null;
    controls.clearFocus();
    applyFocusTargets();
    hideInspector();
  }

  function applyFocusTargets() {
    stars.forEach((star) => {
      if (focusedStar === star) {
        star.scaleTarget = FOCUS_SCALE;
        star.opacityTarget = 1;
        star.edgeOpacityTarget = 0.85;
        star.overlayOpacityTarget = 0.6;
        star.focusAmountTarget = 1;
      } else if (focusedStar) {
        star.scaleTarget = RECEDE_SCALE;
        star.opacityTarget = RECEDE_OPACITY;
        star.edgeOpacityTarget = 0.2;
        star.overlayOpacityTarget = 0.3;
        star.focusAmountTarget = 0;
      } else {
        star.scaleTarget = 1;
        star.opacityTarget = 1;
        star.edgeOpacityTarget = 0.6;
        star.overlayOpacityTarget = 1;
        star.focusAmountTarget = 0;
      }
    });
  }

  // ---- Rotate the inspected artwork -----------------------------------
  // Once a star is focused, the whole canvas becomes "turn this piece
  // in your hands" rather than "orbit the room" (navigation.js already
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
    if (!focusedStar) {
      return;
    }
    rotateDragActive = true;
    rotateDragMoved = 0;
    lastRotateX = event.clientX;
    lastRotateY = event.clientY;
  }

  function onPointerMoveHover(event) {
    pointerToNdc(event);

    if (!rotateDragActive || !focusedStar) {
      return;
    }
    const dx = event.clientX - lastRotateX;
    const dy = event.clientY - lastRotateY;
    lastRotateX = event.clientX;
    lastRotateY = event.clientY;
    rotateDragMoved += Math.abs(dx) + Math.abs(dy);

    focusedStar.tiltYawTarget = Math.max(
      -MAX_TILT_YAW,
      Math.min(MAX_TILT_YAW, focusedStar.tiltYawTarget + dx * 0.0032)
    );
    focusedStar.tiltPitchTarget = Math.max(
      -MAX_TILT_PITCH,
      Math.min(MAX_TILT_PITCH, focusedStar.tiltPitchTarget + dy * 0.0028)
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
    const hit = pickStar();

    if (hit) {
      setFocus(hit);
    } else if (focusedStar) {
      clearFocus();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && focusedStar) {
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

    if (!focusedStar) {
      const hit = pickStar();
      if (hit !== hoveredStar) {
        hoveredStar = hit;
        stars.forEach((star) => {
          star.scaleTarget = star === hoveredStar ? HOVER_SCALE : 1;
        });
      }
    }

    stars.forEach((star) => {
      // STAGE 3/4 — continuous lifecycle. A pure function of elapsed
      // time (see lifecycle.js), not a state machine: no branch anywhere
      // here ever decides "now dissolve" — coherence and pulse simply
      // keep drifting, and everything below reads their current values.
      const rawCoherence = star.lifecycle.sampleCoherence(elapsed);
      const rawPulse = star.lifecycle.samplePulse(elapsed);
      // prefers-reduced-motion: compress coherence into a narrow, high
      // band (the artwork stays recognizable and close to still) and
      // cut the heartbeat down to a faint trace — "significantly reduce
      // particle movement, reduce pulse amplitude, retain recognizable
      // artwork," without freezing the lifecycle outright (per the
      // Stage 2/3 rule that the universe never goes fully static).
      star.coherence = reduceMotion ? 0.78 + 0.22 * rawCoherence : rawCoherence;
      star.pulse = reduceMotion ? rawPulse * 0.12 : rawPulse;
      // STAGE 3.7 — coherence (recognizable artwork) and presence
      // (surrounding particle visibility) are now different numbers, on
      // purpose. A star at low coherence still has meaningful presence
      // — it just isn't a readable artwork any more, only a
      // concentration of particles. particle-field.js reads this
      // instead of raw coherence for everything about the halo (spread,
      // outward travel, per-particle fade); memory-star's own material
      // keeps reading raw coherence below, because the recognizable
      // artwork genuinely should approach zero opacity at zero
      // coherence — only the universe around it should not.
      star.presence = Math.pow(Math.max(star.coherence, 0.0001), 0.4);

      // Inspecting a piece always shows it clearly regardless of where
      // its own lifecycle happens to be — the visitor's attention, not
      // the star's dissolution, takes precedence while focused. Ambient
      // (unfocused) stars follow their coherence untouched.
      const coherenceFactor = star.focusAmountTarget > 0.5 ? 1 : star.coherence;
      // A gentler curve than coherence itself for the ARTWORK's own
      // opacity/edge/halo-shader targets below — coherence's logistic
      // reshape is tuned for *whether a star is recognizable*, which is
      // deliberately a fairly binary question; the artwork's own fade
      // uses a softer exponent so "partial, incomplete artwork" is an
      // actual visible phase on the way down/up, not a blink.
      const artworkFactor = Math.pow(Math.max(coherenceFactor, 0), 0.6);
      // The heartbeat: a small, per-star luminosity/scale ripple, same
      // "always calm while focused" treatment as coherence above.
      const pulseFactor = star.focusAmountTarget > 0.5 ? 0 : star.pulse;
      star.overlayMaterial.uniforms.uPulse.value = pulseFactor;

      if (!reduceMotion) {
        star.holder.position.set(
          star.basePosition.x + Math.sin(elapsed * star.floatSpeedX + star.floatPhase) * 0.055,
          star.basePosition.y +
            Math.sin(elapsed * star.floatSpeedY + star.floatPhase * 1.3) * 0.07,
          star.basePosition.z +
            Math.cos(elapsed * star.floatSpeedZ + star.floatPhase * 0.7) * 0.045
        );
        star.overlayMaterial.uniforms.uTime.value = elapsed;
      }

      // Coherence (via artworkFactor) is folded in as part of each
      // property's *target*, not as a post-multiply on the already-eased
      // material value — the latter would compound what's meant to be a
      // one-time scale onto itself every frame (each frame re-
      // multiplying an already-shrunk value), silently driving opacity
      // toward zero far faster than the coherence curve itself ever
      // intends. Easing toward (target × artworkFactor) converges
      // cleanly to exactly that product instead.
      //
      // REFINEMENT — no artificial floor on any of these three targets
      // any more (Stage 3 kept the texture at ≥50% opacity, the edge at
      // ≥30%, the halo shader at ≥35%, precisely so a star could never
      // fully vanish; that guarantee has moved to lifecycle.js's
      // reachable-zero coherence + particle-field.js's residual-
      // population particles instead). At coherence 0 these three now
      // genuinely reach 0 — the circular image and its rim/halo actually
      // stop being visible — which is what makes "no longer visually
      // recognizable as a coherent star" true rather than aspirational.
      // (Scale below stays on the un-softened coherenceFactor — see the
      // comment on scaleTarget.)
      const t = easeFactor(delta);
      // "Microscopic scale" — the pulse's own contribution is
      // deliberately tiny (≤1.2%) next to coherence's (7%), so it reads
      // as a heartbeat riding on the star's state, not a second
      // formation/dissolution cycle. Scale itself is deliberately NOT
      // driven all the way to 0 with coherence — a shape shrinking to a
      // point reads as "the object is being deleted," which is exactly
      // the theatrical effect the brief rules out; a dissolved star's
      // disappearance is carried by opacity and its particles, not by
      // the geometry collapsing.
      const scaleTarget =
        star.scaleTarget * (0.93 + 0.07 * coherenceFactor) * (1 + pulseFactor * 0.012);
      star.frame.scale.x += (scaleTarget - star.frame.scale.x) * t;
      star.frame.scale.setScalar(star.frame.scale.x);

      const opacityTarget = star.opacityTarget * artworkFactor * (1 + pulseFactor * 0.04);
      star.baseMaterial.opacity += (opacityTarget - star.baseMaterial.opacity) * t;

      if (!reduceMotion) {
        // A barely-there ripple in the artwork's own opacity — present
        // enough to feel like a projected image rather than a flat
        // texture, restrained enough that it never reads as flicker or
        // hurts legibility. Narrow range (±1%), so unlike the coherence
        // factor above, applying it as a direct multiply here settles
        // at an imperceptibly different equilibrium rather than a
        // meaningfully wrong one.
        star.baseMaterial.opacity *=
          0.99 + 0.01 * Math.sin(elapsed * 0.3 + star.floatPhase * 1.6);
      }

      const edgeOpacityTarget = star.edgeOpacityTarget * artworkFactor;
      star.edgesMaterial.opacity += (edgeOpacityTarget - star.edgesMaterial.opacity) * t;

      const overlayOpacityTarget = star.overlayOpacityTarget * artworkFactor;
      star.overlayMaterial.uniforms.uOpacity.value +=
        (overlayOpacityTarget - star.overlayMaterial.uniforms.uOpacity.value) * t;
      star.overlayMaterial.uniforms.uFocus.value +=
        (star.focusAmountTarget - star.overlayMaterial.uniforms.uFocus.value) * t;

      // The visitor's own rotate-drag on the focused star, and its
      // gentle return to neutral once inspection ends.
      star.tilt.rotation.y += (star.tiltYawTarget - star.tilt.rotation.y) * t;
      star.tilt.rotation.x += (star.tiltPitchTarget - star.tilt.rotation.x) * t;
    });

    particleField.update(delta, {
      stars,
      elapsed,
      reduceMotion,
      focused: Boolean(focusedStar),
      easeFactor,
    });
    atmosphereRig.update(delta, { focused: Boolean(focusedStar), easeFactor });
  }

  function dispose() {
    disposedRef.current = true;
    pendingLoads.forEach((pending) => pending.cancel());

    renderer.domElement.removeEventListener("pointerdown", onPointerDownRotate);
    renderer.domElement.removeEventListener("pointermove", onPointerMoveHover);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    hideInspector();
    controls.dispose();
    atmosphereRig.restore();

    starGeometry.dispose();
    haloGeometry.dispose();
    ringGeometry.dispose();
    particleField.dispose();

    stars.forEach((star) => {
      star.baseMaterial.map?.dispose();
      star.baseMaterial.dispose();
      star.edgesMaterial.dispose();
      star.overlayMaterial.dispose();
    });

    scene.remove(room);
  }

  return { update, dispose };
}

export default createFloatingArchive;
