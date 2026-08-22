// Antiquarium — experiences/floating-archive/navigation.js
//
// STAGE 2 — true spatial travel through the constellation, replacing the
// previous fixed-center orbit. Two gestures, kept deliberately
// independent of each other:
//
//   • travel (scroll wheel / touch pinch) advances or retreats a single
//     scalar `t` — "how far into the constellation the visitor has
//     gone" — read entirely from constellation.js's positionAt(t).
//   • look (pointer drag) yaws/pitches the camera's own view direction,
//     with no tie to the path's own tangent at all.
//
// Decoupling them is what produces "I am changing my orientation while
// moving through space" rather than "the camera is riding rails and I'm
// only allowed to glance sideways" — the visitor's view and the
// visitor's position advance from two independent inputs.
//
// All spatial math is delegated to constellation.js (positionAt);
// nothing here re-derives the curve.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { positionAt } from "./constellation.js";

// Small offset used only to seed the initial facing direction from the
// path's own tangent at t=0 (see "initial orientation" below).
const TANGENT_PROBE = 0.35;

export function createNavigation(domElement, camera, options = {}) {
  // ---- travel state -----------------------------------------------------
  let t = options.startT ?? 0;
  let velT = 0;
  const speedScale = options.speedScale ?? 1;
  // A phone screen turns the same finger-width pinch into a proportionally
  // larger gesture than the same intent on desktop, so touch-tier callers
  // pass a sub-1 speedScale (see device-tier.js) to keep travel feeling as
  // deliberate on a small screen as on desktop — mirrors the previous
  // gallery-controls.js convention.
  const travelWheelScale = 0.0038 * speedScale;
  const travelPinchScale = 0.05 * speedScale;
  const travelDecay = 0.94; // slower decay than look-rotation → travel
  // glides rather than snapping to a stop, reinforcing "drifting" over
  // "flying."
  const maxTravelSpeed = options.maxTravelSpeed ?? 1.3;
  // A tiny constant forward creep even with no input at all — the
  // constellation is never perfectly static underfoot, matching the
  // ambient idle drift the previous orbit camera had on its own theta.
  // In world-units-per-second, same as velT/maxTravelSpeed above.
  const idleDrift = options.idleDrift ?? 0.045;

  // ---- look state ---------------------------------------------------
  let yaw = 0;
  let pitch = -0.06;
  let velYaw = 0;
  let velPitch = 0;
  const rotateSpeed = 0.0026 * speedScale;
  const lookDecay = 0.86;
  const minPitch = -1.3; // ≈ -74.5°
  const maxPitch = 1.3; // ≈ 74.5° — clamped well short of the poles so
  // the camera can never flip upside down or lose its horizon.

  // ---- initial orientation --------------------------------------------
  // Face along the path's own starting direction rather than an
  // arbitrary world axis, so the visitor opens on "looking into the
  // constellation" instead of possibly facing empty space.
  {
    const ahead = positionAt(TANGENT_PROBE);
    const behind = positionAt(-TANGENT_PROBE);
    const dx = ahead.x - behind.x;
    const dz = ahead.z - behind.z;
    if (Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5) {
      yaw = Math.atan2(dx, dz);
    }
  }

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;
  let pinchDistance = null;

  // ---- focus (dolly onto one Memory Star to inspect it) -----------------
  // Kept from the previous camera rig's contract so index.js's existing
  // click-to-inspect flow needs no changes: focus temporarily overrides
  // where the camera looks/stands without touching `t` — the visitor's
  // place in the constellation doesn't move just because they paused to
  // look closely at one star.
  let focusPoint = null;
  let focusStandoff = 2.4;
  let focusBlend = 0;
  let focusBlendGoal = 0;

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    dragging = true;
    moved = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    domElement.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    // While a star is focused, index.js's own pointer handling takes
    // over drag (tilting the inspected piece) — the look-around drag
    // must stand down for that same gesture, exactly as the previous
    // gallery-controls.js suspended orbit while focused.
    if (!dragging || pinchDistance !== null || focusBlendGoal > 0) {
      return;
    }
    // Clamped so a second finger landing mid-gesture (about to become a
    // pinch, one frame before pinchDistance is established below) can't
    // register as a huge single-frame drag delta and flick the view.
    const dx = Math.max(-60, Math.min(60, event.clientX - lastX));
    const dy = Math.max(-60, Math.min(60, event.clientY - lastY));
    lastX = event.clientX;
    lastY = event.clientY;
    moved += Math.abs(dx) + Math.abs(dy);

    velYaw -= dx * rotateSpeed;
    velPitch -= dy * rotateSpeed;
  }

  function onPointerUp(event) {
    dragging = false;
    domElement.releasePointerCapture?.(event.pointerId);
  }

  function onWheel(event) {
    event.preventDefault();
    // Travel stands down while a star is focused — the visitor's place
    // in the constellation must stay put while they're inspecting a
    // piece, so clearing focus never teleports them somewhere new.
    if (focusBlendGoal > 0) {
      return;
    }
    // Scrolling "down the page" reads as travelling deeper into the
    // constellation; scrolling back up retreats toward where the
    // visitor came from.
    velT += event.deltaY * travelWheelScale;
  }

  function onTouchMove(event) {
    if (event.touches.length !== 2) {
      pinchDistance = null;
      return;
    }
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    const distance = Math.hypot(dx, dy);

    if (pinchDistance !== null && focusBlendGoal <= 0) {
      // Pinching inward (fingers coming together) advances travel —
      // the mobile equivalent of scrolling forward; spreading apart
      // retreats. (Suspended while focused, same reasoning as onWheel.)
      const delta = pinchDistance - distance;
      velT += delta * travelPinchScale;
    }
    pinchDistance = distance;
    event.preventDefault();
  }

  function onTouchEnd(event) {
    if (event.touches.length < 2) {
      pinchDistance = null;
    }
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerup", onPointerUp);
  domElement.addEventListener("pointercancel", onPointerUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("touchmove", onTouchMove, { passive: false });
  domElement.addEventListener("touchend", onTouchEnd);

  const worldUp = new THREE.Vector3(0, 1, 0);
  const scratchPos = new THREE.Vector3();
  const scratchForward = new THREE.Vector3();
  const scratchLookTarget = new THREE.Vector3();
  const scratchFocusDir = new THREE.Vector3();
  const scratchFocusPos = new THREE.Vector3();

  function update(delta) {
    // --- travel: smooth acceleration/deceleration, capped speed --------
    // velT is expressed in world units per second; wheel/pinch events
    // add an impulse to it, each frame decays it back toward zero, and
    // it's integrated into `t` by real elapsed time — so travel speed
    // stays consistent regardless of frame rate, and never exceeds
    // maxTravelSpeed. idleDrift is separate: a constant ambient creep
    // applied directly to `t`, not subject to decay, so the
    // constellation is never perfectly static even with no input.
    const decayFactor = Math.pow(travelDecay, Math.max(delta * 60, 0.001));
    velT *= decayFactor;
    velT = Math.max(-maxTravelSpeed, Math.min(maxTravelSpeed, velT));
    t += velT * delta + idleDrift * delta;

    // --- look: independent yaw/pitch, same inertia treatment -----------
    yaw += velYaw;
    pitch += velPitch;
    pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    const lookDecayFactor = Math.pow(lookDecay, Math.max(delta * 60, 0.001));
    velYaw *= lookDecayFactor;
    velPitch *= lookDecayFactor;

    focusBlend += (focusBlendGoal - focusBlend) * Math.min(1, delta * 3.2);

    const galleryPos = positionAt(t);
    scratchPos.set(galleryPos.x, galleryPos.y, galleryPos.z);

    const cosPitch = Math.cos(pitch);
    scratchForward
      .set(Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch)
      .normalize();

    if (focusBlend > 0.0008 && focusPoint) {
      scratchFocusDir.subVectors(focusPoint, scratchPos);
      if (scratchFocusDir.lengthSq() < 1e-6) {
        scratchFocusDir.copy(scratchForward);
      } else {
        scratchFocusDir.normalize();
      }
      scratchFocusPos.copy(focusPoint).addScaledVector(scratchFocusDir, -focusStandoff);

      camera.position.copy(scratchPos).lerp(scratchFocusPos, focusBlend);
      scratchLookTarget
        .copy(scratchPos)
        .addScaledVector(scratchForward, 12)
        .lerp(focusPoint, focusBlend);
    } else {
      camera.position.copy(scratchPos);
      scratchLookTarget.copy(scratchPos).addScaledVector(scratchForward, 12);
    }

    // Horizon is always level: `up` is fixed to world-up, never derived
    // from the path or the look direction, so the camera can yaw/pitch
    // freely but never bank/roll.
    camera.up.copy(worldUp);
    camera.lookAt(scratchLookTarget);
  }

  function focusOn(position, lookAt) {
    focusPoint = (lookAt || position).clone();
    focusStandoff = 2.4;
    focusBlendGoal = 1;
  }

  function clearFocus() {
    focusBlendGoal = 0;
  }

  function isFocused() {
    return focusBlendGoal > 0.5;
  }

  function wasClick() {
    return moved < 6;
  }

  function dispose() {
    domElement.removeEventListener("pointerdown", onPointerDown);
    domElement.removeEventListener("pointermove", onPointerMove);
    domElement.removeEventListener("pointerup", onPointerUp);
    domElement.removeEventListener("pointercancel", onPointerUp);
    domElement.removeEventListener("wheel", onWheel);
    domElement.removeEventListener("touchmove", onTouchMove);
    domElement.removeEventListener("touchend", onTouchEnd);
  }

  return { update, focusOn, clearFocus, isFocused, wasClick, dispose };
}
