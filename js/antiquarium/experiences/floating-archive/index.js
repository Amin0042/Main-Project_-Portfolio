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
// STAGE 3/4 added the living Memory Star: continuous coherence-driven
// formation/dissolution and an independent per-star pulse (both from
// lifecycle.js), and the circular presentation (memory-star.js).
//
// MECHANICAL CAROUSEL RECONSTRUCTION — stars sit on constellation.js's
// lemniscate (an infinity sign, flat in the XZ plane) rather than an
// endless recurring path; the camera itself no longer travels or looks
// around at all (navigation.js fixes it in place, with no up/down look
// whatsoever) — instead the whole `room` group is spun, rigidly, like a
// turntable, directly by the visitor's drag/scroll. When nothing is
// turning it, the room eases into a slow, whole-scene "breathing" scale
// (see the BREATH_* constants below) rather than sitting dead-still.
// Still not implemented: the final White Night atmosphere, and full
// artwork inspection/reveal (today's focus flow still dollies the
// camera to a circular star, not to an expanded rectangular view).
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
import { createStarfieldBackdrop } from "./starfield-backdrop.js";
import { starPlacementFor } from "./constellation.js";
import { getQualityPreset, getDeviceTier } from "../../core/device-tier.js";
import { artworks } from "./data.js";
import { FOCUS_SCALE, RECEDE_SCALE, RECEDE_OPACITY, reduceMotion } from "./constants.js";
import { pick, tr, isPersian, onLanguageChange } from "../../core/i18n.js";

// Visitor-facing words built in JavaScript, in whichever language the
// EN/پ switch is on (core/i18n.js). kave-amini-khanimani.ca's copy of
// this file defines English-only versions of these same three helpers.
const label = (english, persian) => tr(english, persian);
const titleOf = (star) => pick(star.data, "title") || star.title;
const formatNumber = (value) => (isPersian() ? Number(value).toLocaleString("fa-IR") : String(value));

export function createFloatingArchive(stage, context = {}) {
  const { scene, camera, renderer } = stage;
  const inspectorEl = context.inspectorEl || null;
  const inspectorTitleEl = context.inspectorTitleEl || null;
  const inspectorMetaEl = context.inspectorMetaEl || null;
  // This installation has no use for the longer historical/artistic note
  // (see Cartography of Memory) — only clearing it here so a description
  // left over from that installation can never survive a swap back to
  // this one; the inspector DOM is shared and outlives either mount.
  const inspectorDescriptionEl = context.inspectorDescriptionEl || null;
  const resetButtonEl = context.resetButtonEl || null;
  // main.js normally supplies this (computed once from device-tier.js);
  // the desktop preset is only a fallback for calling this factory
  // directly, e.g. from a test harness.
  const quality = context.quality || getQualityPreset("desktop");
  const disposedRef = { current: false };
  const room = new THREE.Group();
  scene.add(room);

  const atmosphereRig = createAtmosphere(room, scene);

  // ---- Night-sky backdrop ----------------------------------------------
  // Added directly to `scene` (not `room`) and re-centered on the camera
  // every frame — see starfield-backdrop.js. Deliberately outside the
  // constellation's own group so it is unaffected by anything that
  // moves or clears `room`.
  const starfield = createStarfieldBackdrop(camera, getDeviceTier());
  scene.add(starfield.points);

  // ---- Memory Stars ---------------------------------------------------
  const { starGeometry, haloGeometry, ringGeometry, revealGeometry, revealFrameGeometry } =
    createSharedGeometry();
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
      revealGeometry,
      revealFrameGeometry,
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

  // ---- Camera rig (mechanical carousel) --------------------------------
  // MECHANICAL CAROUSEL RECONSTRUCTION — navigation.js no longer moves
  // the camera through space; it spins `room` itself, rigidly, like a
  // turntable. The camera stays fixed except while inspecting a piece.
  const controls = createNavigation(renderer.domElement, camera, room, {
    speedScale: quality.rotateSpeedScale,
  });

  // ---- Hover + click/focus interaction --------------------------------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2(10, 10);
  let hoveredStar = null;
  let focusedStar = null;
  const _hoverWorldPos = new THREE.Vector3();

  // CONSOLIDATED VISUAL RECONSTRUCTION — proximity-based hover, not a
  // binary raycast hit. Each star's screen-space distance from the
  // pointer is turned into a continuous [0, 1] closeness value every
  // frame, so a star visibly wakes up (brighter halo, sharper edge, a
  // touch larger) as the cursor approaches, per the brief's "the star
  // should subtly react before direct contact" — rather than snapping
  // from fully-rested to fully-hovered the instant the pointer lands
  // exactly on its small circular hit area. The raycast pick (below,
  // pickStar()) still exists, but only decides clicks now.
  const HOVER_NDC_RADIUS = 0.17;

  function updateHoverProximity() {
    let best = null;
    let bestAmount = 0;
    stars.forEach((star) => {
      star.holder.getWorldPosition(_hoverWorldPos);
      _hoverWorldPos.project(camera);
      if (_hoverWorldPos.z > 1 || _hoverWorldPos.z < -1) {
        star.hoverAmountTarget = 0;
        return;
      }
      const dx = _hoverWorldPos.x - pointerNdc.x;
      const dy = _hoverWorldPos.y - pointerNdc.y;
      const dist = Math.hypot(dx, dy);
      const amount = Math.max(0, 1 - dist / HOVER_NDC_RADIUS);
      // Eased (not linear) so the reaction is subtle at the outer edge
      // of the influence radius and only becomes pronounced close in.
      star.hoverAmountTarget = amount * amount;
      if (star.hoverAmountTarget > bestAmount) {
        bestAmount = star.hoverAmountTarget;
        best = star;
      }
    });
    hoveredStar = bestAmount > 0.02 ? best : null;
  }

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

  let inspectedStar = null;

  function showInspector(star) {
    if (!inspectorEl) {
      return;
    }
    inspectedStar = star;
    if (inspectorTitleEl) {
      inspectorTitleEl.textContent = pick(star.data, "title") || star.title;
    }
    if (inspectorMetaEl) {
      inspectorMetaEl.textContent = pick(star.data, "medium");
    }
    if (inspectorDescriptionEl) {
      inspectorDescriptionEl.hidden = true;
      inspectorDescriptionEl.textContent = "";
    }
    inspectorEl.hidden = false;
    // Two-step so the browser registers `hidden` being removed before
    // the opacity transition starts — otherwise the fade-in never runs.
    requestAnimationFrame(() => inspectorEl.classList.add("is-visible"));
  }

  function hideInspector() {
    inspectedStar = null;
    if (!inspectorEl) {
      return;
    }
    inspectorEl.classList.remove("is-visible");
  }

  // EN/پ flipped while a label is open: rewrite it in the new language,
  // along with the journey controls and the hover card.
  const stopLanguageListener = onLanguageChange(() => {
    if (inspectedStar) {
      showInspector(inspectedStar);
    }
    updateJourney();
    if (hoverLabelStar) {
      hoverTitleEl.textContent = titleOf(hoverLabelStar);
    }
  });

  const _focusWorldPos = new THREE.Vector3();
  const _focusQuaternion = new THREE.Quaternion();
  const _focusNormal = new THREE.Vector3();

  function setFocus(star) {
    focusedStar = star;
    star.tiltYawTarget = 0;
    star.tiltPitchTarget = 0;
    // MECHANICAL CAROUSEL RECONSTRUCTION — the camera is fixed and
    // `room` (hence every star's holder) turns independently of it now,
    // so the point navigation.js dollies toward has to be this star's
    // live WORLD position, not its room-local basePosition.
    star.holder.getWorldPosition(_focusWorldPos);
    // The room's idle "breathing" scale eases back to exactly 1 once a
    // star is focused; aim at where the star will be then, not where it
    // is mid-breath, so the flight lands dead-centre.
    _focusWorldPos.divideScalar(room.scale.x || 1);
    star.basePlane.getWorldQuaternion(_focusQuaternion);
    _focusNormal.set(0, 0, 1).applyQuaternion(_focusQuaternion);
    // Frame the revealed artwork (its full rectangle, at focus scale),
    // fitting whichever of its width/height is tighter on this screen.
    const frameScale = FOCUS_SCALE * 1.35;
    const size =
      Math.max(star.revealSize.height, star.revealSize.width / Math.max(camera.aspect, 0.4)) * frameScale;
    controls.focusOn(_focusWorldPos, { normal: _focusNormal, size });
    applyFocusTargets();
    showInspector(star);
    updateJourney();
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
    setAutoplay(false);
  }

  function resetView() {
    rotateDragActive = false;
    rotateDragMoved = 0;
    lastRotateX = 0;
    lastRotateY = 0;
    clearFocus();
    controls.reset();
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

  // ---- The journey: travel the constellation, piece by piece ----------
  // Stars are numbered in data.js order, which is also their order along
  // the infinity path — so "next" is always the neighbour on the curve
  // and every step is a short, readable flight, never a jump across the
  // whole sky. Three ways in: ‹ › buttons and the arrow keys while a
  // piece is open, and "Begin the journey", a guided tour that flies
  // from piece to piece on its own, lingering on each one.
  const AUTOPLAY_DWELL = reduceMotion ? 9 : 6.5; // seconds on each piece, once revealed
  const SPOTLIGHT_DIM = 0.86; // how far the other stars fade while a piece is open
  let autoplay = false;
  let autoplayDwell = 0;

  const stageEl = renderer.domElement.parentElement;
  const stageFrameEl = (resetButtonEl && resetButtonEl.parentElement) || (stageEl && stageEl.parentElement);

  const journeyEl = document.createElement("div");
  journeyEl.className = "antiquarium-journey";
  journeyEl.dir = "ltr";
  journeyEl.innerHTML =
    '<button type="button" class="antiquarium-journey-button" data-journey="prev">&#8249;</button>' +
    '<span class="antiquarium-journey-count"></span>' +
    '<button type="button" class="antiquarium-journey-button antiquarium-journey-play" data-journey="play"></button>' +
    '<button type="button" class="antiquarium-journey-button" data-journey="next">&#8250;</button>';
  const journeyPrevEl = journeyEl.querySelector('[data-journey="prev"]');
  const journeyNextEl = journeyEl.querySelector('[data-journey="next"]');
  const journeyPlayEl = journeyEl.querySelector('[data-journey="play"]');
  const journeyCountEl = journeyEl.querySelector(".antiquarium-journey-count");
  if (inspectorEl) {
    const hintEl = inspectorEl.querySelector(".antiquarium-inspector-hint");
    inspectorEl.insertBefore(journeyEl, hintEl || null);
  }

  const beginButtonEl = document.createElement("button");
  beginButtonEl.type = "button";
  beginButtonEl.className = "antiquarium-reset-button antiquarium-journey-begin";
  stageFrameEl?.appendChild(beginButtonEl);

  // A small title card that follows the star under the pointer, so a
  // visitor can read what each star is, and learn that it opens, before
  // committing to a click.
  const hoverLabelEl = document.createElement("div");
  hoverLabelEl.className = "antiquarium-hover-label";
  hoverLabelEl.setAttribute("aria-hidden", "true");
  hoverLabelEl.innerHTML =
    '<span class="antiquarium-hover-label-title"></span><span class="antiquarium-hover-label-cta"></span>';
  const hoverTitleEl = hoverLabelEl.querySelector(".antiquarium-hover-label-title");
  const hoverCtaEl = hoverLabelEl.querySelector(".antiquarium-hover-label-cta");
  stageEl?.appendChild(hoverLabelEl);
  let hoverLabelStar = null;

  function updateJourney() {
    const index = focusedStar ? stars.indexOf(focusedStar) : -1;
    // Out of the tab order (and the accessibility tree) while the label
    // it lives in is faded out.
    journeyEl.inert = index < 0;
    journeyCountEl.textContent =
      index >= 0 ? `${formatNumber(index + 1)} / ${formatNumber(stars.length)}` : "";
    journeyPrevEl.setAttribute("aria-label", label("Previous artwork", "اثر پیشین"));
    journeyNextEl.setAttribute("aria-label", label("Next artwork", "اثر بعدی"));
    journeyPlayEl.innerHTML = autoplay ? "&#10074;&#10074;" : "&#9654;";
    journeyPlayEl.setAttribute(
      "aria-label",
      autoplay ? label("Pause the journey", "توقف سفر") : label("Play the journey", "ادامه‌ی سفر")
    );
    journeyPlayEl.setAttribute("aria-pressed", autoplay ? "true" : "false");
    beginButtonEl.textContent = autoplay
      ? label("Pause the journey", "توقف سفر")
      : label("Begin the journey", "آغاز سفر");
    beginButtonEl.setAttribute("aria-pressed", autoplay ? "true" : "false");
    hoverCtaEl.textContent = label("Click to view", "برای دیدن کلیک کنید");
  }

  function stepJourney(direction) {
    if (!stars.length) {
      return;
    }
    const current = focusedStar ? stars.indexOf(focusedStar) : -1;
    const next =
      current < 0
        ? direction > 0
          ? 0
          : stars.length - 1
        : (current + direction + stars.length) % stars.length;
    setFocus(stars[next]);
  }

  function setAutoplay(on) {
    autoplay = on;
    autoplayDwell = 0;
    if (on && !focusedStar) {
      stepJourney(1);
    }
    updateJourney();
  }

  function onJourneyClick(event) {
    const button = event.target.closest("[data-journey]");
    if (!button) {
      return;
    }
    const action = button.dataset.journey;
    if (action === "play") {
      setAutoplay(!autoplay);
      return;
    }
    // Taking the wheel by hand pauses the guided tour.
    setAutoplay(false);
    stepJourney(action === "next" ? 1 : -1);
  }

  function onBeginClick() {
    setAutoplay(!autoplay);
  }

  journeyEl.addEventListener("click", onJourneyClick);
  beginButtonEl.addEventListener("click", onBeginClick);

  const _labelPos = new THREE.Vector3();
  const _labelEdge = new THREE.Vector3();
  const _cameraUp = new THREE.Vector3();

  function updateHoverLabel() {
    const star = !focusedStar && hoveredStar && hoveredStar.hoverAmount > 0.3 ? hoveredStar : null;
    if (!star || !stageEl) {
      if (hoverLabelStar) {
        hoverLabelEl.classList.remove("is-visible");
        hoverLabelStar = null;
      }
      return;
    }
    if (star !== hoverLabelStar) {
      hoverTitleEl.textContent = titleOf(star);
      hoverLabelStar = star;
      hoverLabelEl.classList.add("is-visible");
    }
    // Pin the card just above the star's rim, wherever it is on screen.
    star.holder.getWorldPosition(_labelPos);
    _cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const radius = star.basePlane.scale.x * star.frame.scale.x * 0.5;
    _labelEdge.copy(_labelPos).addScaledVector(_cameraUp, radius);
    _labelEdge.project(camera);
    const width = stageEl.clientWidth;
    const height = stageEl.clientHeight;
    const x = (_labelEdge.x * 0.5 + 0.5) * width;
    const y = (-_labelEdge.y * 0.5 + 0.5) * height;
    // Kept wholly inside the stage: never above its top edge, never
    // past either side.
    const cardWidth = hoverLabelEl.offsetWidth;
    const cardHeight = hoverLabelEl.offsetHeight;
    const left = Math.min(Math.max(x - cardWidth / 2, 12), Math.max(12, width - cardWidth - 12));
    const top = Math.max(y - cardHeight - 8, 12);
    hoverLabelEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function updateCursor() {
    let cursor = "";
    if (pointerNdc.x <= 1 && pointerNdc.x >= -1) {
      const hit = pickStar();
      if (hit && hit !== focusedStar) {
        cursor = "pointer";
      } else if (hit && hit === focusedStar) {
        cursor = rotateDragActive ? "grabbing" : "grab";
      }
    }
    if (renderer.domElement.style.cursor !== cursor) {
      renderer.domElement.style.cursor = cursor;
    }
  }

  function onPointerLeave() {
    pointerNdc.set(10, 10);
  }

  updateJourney();

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
      if (hit !== focusedStar) {
        setAutoplay(false);
        setFocus(hit);
      }
    } else if (focusedStar) {
      clearFocus();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && focusedStar) {
      clearFocus();
      return;
    }
    // Arrow keys travel only while a piece is open, so they never
    // hijack the page for a visitor who is just scrolling past.
    if (focusedStar && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      const target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      event.preventDefault();
      setAutoplay(false);
      stepJourney(event.key === "ArrowRight" ? 1 : -1);
    }
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDownRotate);
  renderer.domElement.addEventListener("pointermove", onPointerMoveHover);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
  if (resetButtonEl) {
    resetButtonEl.addEventListener("click", resetView);
  }
  window.addEventListener("keydown", onKeyDown);

  // ---- Frame update -----------------------------------------------------
  let elapsed = 0;
  const easeFactor = (delta) => Math.min(1, delta * 6);

  // MECHANICAL CAROUSEL RECONSTRUCTION — "when the user is not moving
  // the things around I want the system to look like it's breathing."
  // The whole `room` group (every star, its particles, all of it)
  // gently, slowly scales in and out — on top of, not instead of, each
  // star's own independent pulse — but only once the visitor has
  // stopped turning the carousel (controls.isIdle()) and isn't
  // inspecting a piece; the instant they take hold of it again, the
  // breathing eases back to a dead-still 1.0 so it never fights the
  // turning gesture itself.
  let breathPhase = 0;
  const BREATH_PERIOD = 6.4;
  const BREATH_AMPLITUDE = reduceMotion ? 0.006 : 0.018;

  function update(delta) {
    elapsed += delta;
    controls.update(delta);

    const idle = !focusedStar && controls.isIdle();
    breathPhase += delta;
    const breathTarget = idle
      ? 1 + Math.sin((breathPhase / BREATH_PERIOD) * Math.PI * 2) * BREATH_AMPLITUDE
      : 1;
    room.scale.x += (breathTarget - room.scale.x) * easeFactor(delta);
    room.scale.setScalar(room.scale.x);

    if (!focusedStar) {
      updateHoverProximity();
    } else {
      stars.forEach((star) => {
        star.hoverAmountTarget = 0;
      });
    }
    updateHoverLabel();
    updateCursor();

    // The guided tour: once the camera has arrived and the piece is
    // fully revealed, linger, then fly on to the next one.
    if (autoplay && focusedStar && !controls.isFlying() && focusedStar.revealAmount > 0.95) {
      autoplayDwell += delta;
      if (autoplayDwell > AUTOPLAY_DWELL) {
        autoplayDwell = 0;
        stepJourney(1);
      }
    }

    // How open the focused piece currently is, shared by every star's
    // spotlight dimming below.
    const focusReveal = focusedStar ? focusedStar.revealAmount : 0;
    const spotlight = focusReveal * focusReveal * (3 - 2 * focusReveal);

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

      // The archive should remain clearly visible without requiring the
      // visitor to zoom in to one asset. Focus still increases emphasis,
      // but ambient stars are kept legible and bright at all viewing
      // distances rather than fading into the scene.
      const coherenceFactor = 1;
      const artworkFactor = 1;
      // The heartbeat: a small, per-star luminosity/scale ripple, same
      // "always calm while focused" treatment as coherence above.
      const pulseFactor = star.focusAmountTarget > 0.5 ? 0 : star.pulse;
      // A hovered star's heartbeat reads slightly stronger — one more
      // small, legible piece of "this object is responding to you."
      star.overlayMaterial.uniforms.uPulse.value = pulseFactor * (1 + star.hoverAmount * 0.5);

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
      star.hoverAmount += (star.hoverAmountTarget - star.hoverAmount) * t;

      const scaleTarget =
        star.scaleTarget *
        1.35 *
        (1 + pulseFactor * 0.012) *
        (1 + star.hoverAmount * 0.12);
      star.frame.scale.x += (scaleTarget - star.frame.scale.x) * t;
      star.frame.scale.setScalar(star.frame.scale.x);

      // The artwork circle should remain fully visible at every distance in
      // the room. The scene should not rely on a close camera approach to
      // reveal each piece; the image itself should read at full opacity.
      //
      // THE REVEAL (see memory-star.js) — the circle stays fully opaque
      // except on the one focused star, and only once the camera has
      // arrived: then it hands over to the whole artwork, which grows
      // out of it; leaving (or flying on) folds it back.
      star.revealTarget = focusedStar === star && !controls.isFlying() ? 1 : 0;
      star.revealAmount +=
        (star.revealTarget - star.revealAmount) * Math.min(1, delta * (reduceMotion ? 12 : 2.6));
      if (Math.abs(star.revealTarget - star.revealAmount) < 0.0005) {
        star.revealAmount = star.revealTarget;
      }
      const reveal = star.revealAmount * star.revealAmount * (3 - 2 * star.revealAmount);
      // Every other star steps back into the dark while a piece is open
      // (a spotlight, not a blackout: a faint trace of the sky remains),
      // so nothing floats in front of the artwork being looked at.
      const circleOpacity = star === focusedStar ? 1 - reveal : 1 - SPOTLIGHT_DIM * spotlight;

      star.baseMaterial.opacity = circleOpacity;
      star.baseMaterial.depthWrite = circleOpacity > 0.99;
      star.edgesMaterial.opacity += (circleOpacity - star.edgesMaterial.opacity) * t;
      star.overlayMaterial.uniforms.uOpacity.value +=
        (circleOpacity - star.overlayMaterial.uniforms.uOpacity.value) * t;
      // Fully faded means fully gone — not a near-invisible plate whose
      // rim still traces a dark circle across the revealed artwork.
      const circleVisible = circleOpacity > 0.01;
      star.basePlane.visible = circleVisible;

      const revealVisible = reveal > 0.002;
      star.revealPlane.visible = revealVisible;
      star.revealFrame.visible = revealVisible;
      if (revealVisible) {
        const grow = 0.86 + 0.14 * reveal;
        star.revealPlane.scale.set(star.revealSize.width * grow, star.revealSize.height * grow, 1);
        star.revealFrame.scale.set(
          star.revealSize.width * grow * 1.012,
          star.revealSize.height * grow + star.revealSize.width * grow * 0.012,
          1
        );
        star.revealMaterial.opacity = reveal;
        star.revealFrameMaterial.opacity = reveal * 0.9;
      }
      star.overlayMaterial.uniforms.uFocus.value +=
        (star.focusAmountTarget - star.overlayMaterial.uniforms.uFocus.value) * t;
      star.overlayMaterial.uniforms.uHover.value +=
        (star.hoverAmount - star.overlayMaterial.uniforms.uHover.value) * t;

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
    atmosphereRig.update(delta, { focused: Boolean(focusedStar), easeFactor, camera });
    starfield.update(delta, elapsed);
  }

  function dispose() {
    disposedRef.current = true;
    stopLanguageListener();
    pendingLoads.forEach((pending) => pending.cancel());

    renderer.domElement.removeEventListener("pointerdown", onPointerDownRotate);
    renderer.domElement.removeEventListener("pointermove", onPointerMoveHover);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
    renderer.domElement.style.cursor = "";
    if (resetButtonEl) {
      resetButtonEl.removeEventListener("click", resetView);
    }
    window.removeEventListener("keydown", onKeyDown);
    journeyEl.removeEventListener("click", onJourneyClick);
    beginButtonEl.removeEventListener("click", onBeginClick);
    // The inspector is shared with the other installation; take back
    // only what this one added to it and to the stage.
    journeyEl.remove();
    beginButtonEl.remove();
    hoverLabelEl.remove();
    hideInspector();
    controls.dispose();
    atmosphereRig.restore();

    starGeometry.dispose();
    haloGeometry.dispose();
    ringGeometry.dispose();
    revealGeometry.dispose();
    revealFrameGeometry.dispose();
    particleField.dispose();
    scene.remove(starfield.points);
    starfield.dispose();

    stars.forEach((star) => {
      star.baseMaterial.map?.dispose();
      star.baseMaterial.dispose();
      star.edgesMaterial.dispose();
      star.overlayMaterial.dispose();
      star.revealMaterial.map?.dispose();
      star.revealMaterial.dispose();
      star.revealFrameMaterial.dispose();
    });

    scene.remove(room);
  }

  return { update, dispose };
}

export default createFloatingArchive;
