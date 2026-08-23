// Antiquarium — experiences/floating-archive/navigation.js
//
// MECHANICAL CAROUSEL RECONSTRUCTION — this file no longer flies a
// camera through space. The camera now stands still at a fixed vantage
// point, in a fixed orientation, for the entire visit (the brief is
// explicit: "the user cannot look up and down") — what moves instead is
// the `room` group itself (every Memory Star, its particle halo, all of
// it), rotated rigidly around world-Y like a real turntable. Dragging
// or scrolling spins that turntable directly; there is no separate
// "look" gesture and no travel-through-depth gesture — one input, one
// mechanism, exactly the "defined carousel mechanic" asked for.
//
// Still handles the one exception to "the camera never moves": focus.
// Selecting a Memory Star still dollies the camera in for inspection
// (the brief keeps this — "preserve the existing click/focus
// behavior") and pauses the turntable while focused, so the inspected
// piece doesn't drift away mid-look; clearing focus resumes it.
//
// FOCUS_STANDOFF, MAX_ANGULAR_SPEED etc. are plain tuning constants;
// nothing here re-derives constellation.js's own shape.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";

const MAX_ANGULAR_SPEED = 1.1; // radians/second, whatever the input impulse
const DRAG_DECAY = 0.9;
const IDLE_AFTER = 0.9; // seconds of no rotational input before "idle"

export function createNavigation(domElement, camera, room, options = {}) {
  const dragScale = 0.006 * (options.speedScale ?? 1);
  const wheelScale = 0.0016 * (options.speedScale ?? 1);

  // ---- turntable state --------------------------------------------------
  let angle = options.startAngle ?? 0;
  let velAngle = 0;
  room.rotation.y = angle;

  let dragging = false;
  let lastX = 0;
  let moved = 0;

  // ---- focus (dolly in on one Memory Star to inspect it) ----------------
  // Kept from the previous camera rig's contract so index.js's existing
  // click-to-inspect flow needs no changes: focus temporarily overrides
  // where the camera stands without touching the turntable's angle —
  // the visitor's place on the carousel doesn't change just because
  // they paused to look closely at one star.
  let focusPoint = null;
  let focusStandoff = 2.4;
  let focusBlend = 0;
  let focusBlendGoal = 0;

  // ---- idle detection (drives the "breathing" the brief asks the
  // system show whenever the visitor isn't actively turning it) --------
  let idleTimer = IDLE_AFTER;

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    dragging = true;
    moved = 0;
    lastX = event.clientX;
    domElement.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    // While a star is focused, index.js's own pointer handling takes
    // over drag (tilting the inspected piece) — the turntable must
    // stand down for that same gesture.
    if (!dragging || focusBlendGoal > 0) {
      return;
    }
    const dx = Math.max(-60, Math.min(60, event.clientX - lastX));
    lastX = event.clientX;
    moved += Math.abs(dx);

    velAngle -= dx * dragScale;
    idleTimer = 0;
  }

  function onPointerUp(event) {
    dragging = false;
    domElement.releasePointerCapture?.(event.pointerId);
  }

  function onWheel(event) {
    event.preventDefault();
    if (focusBlendGoal > 0) {
      return;
    }
    velAngle += event.deltaY * wheelScale;
    idleTimer = 0;
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerup", onPointerUp);
  domElement.addEventListener("pointercancel", onPointerUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });

  // ---- fixed camera pose --------------------------------------------
  // No look gesture at all: the camera sits still, level, at a fixed
  // elevation and distance from the turntable's center — an outside
  // observer watching the carousel turn, never a pilot flying through
  // it. Only focus (below) ever moves it, and only temporarily.
  const REST_POSITION = new THREE.Vector3(0, 10, 46);
  const REST_LOOK_AT = new THREE.Vector3(0, 1.5, 0);
  camera.position.copy(REST_POSITION);
  camera.up.set(0, 1, 0);
  camera.lookAt(REST_LOOK_AT);

  const scratchTarget = new THREE.Vector3();
  const scratchLookAt = new THREE.Vector3();
  const scratchFocusDir = new THREE.Vector3();
  const scratchFocusPos = new THREE.Vector3();

  function update(delta) {
    if (focusBlendGoal <= 0) {
      const decayFactor = Math.pow(DRAG_DECAY, Math.max(delta * 60, 0.001));
      velAngle *= decayFactor;
      velAngle = Math.max(-MAX_ANGULAR_SPEED, Math.min(MAX_ANGULAR_SPEED, velAngle));
      angle += velAngle * delta;
      room.rotation.y = angle;
      idleTimer += delta;
    }

    focusBlend += (focusBlendGoal - focusBlend) * Math.min(1, delta * 3.2);

    scratchTarget.copy(REST_POSITION);
    scratchLookAt.copy(REST_LOOK_AT);

    if (focusBlend > 0.0008 && focusPoint) {
      scratchFocusDir.subVectors(focusPoint, REST_POSITION);
      if (scratchFocusDir.lengthSq() < 1e-6) {
        scratchFocusDir.set(0, 0, -1);
      } else {
        scratchFocusDir.normalize();
      }
      scratchFocusPos.copy(focusPoint).addScaledVector(scratchFocusDir, -focusStandoff);

      scratchTarget.lerp(scratchFocusPos, focusBlend);
      scratchLookAt.lerp(focusPoint, focusBlend);
    }

    camera.position.copy(scratchTarget);
    camera.up.set(0, 1, 0);
    camera.lookAt(scratchLookAt);
  }

  /** @param {THREE.Vector3} worldPosition - the star's live WORLD position
   *   (not room-local) — the room keeps turning independently, so the
   *   caller must resolve this via Object3D.getWorldPosition first. */
  function focusOn(worldPosition) {
    focusPoint = worldPosition.clone();
    focusStandoff = 2.4;
    focusBlendGoal = 1;
    // A mechanical carousel stops decisively when you reach for a
    // piece — no residual spin still bleeding off underneath the
    // inspection.
    velAngle = 0;
  }

  function clearFocus() {
    focusBlendGoal = 0;
    focusPoint = null;
  }

  function reset() {
    velAngle = 0;
    angle = options.startAngle ?? 0;
    room.rotation.y = angle;
    idleTimer = IDLE_AFTER;
    clearFocus();
  }

  function isFocused() {
    return focusBlendGoal > 0.5;
  }

  function wasClick() {
    return moved < 6;
  }

  // True once the turntable has had no rotational input for a beat —
  // index.js uses this to ease the whole room into its idle "breathing"
  // state, and back out the instant the visitor takes hold of it again.
  function isIdle() {
    return idleTimer > IDLE_AFTER;
  }

  function dispose() {
    domElement.removeEventListener("pointerdown", onPointerDown);
    domElement.removeEventListener("pointermove", onPointerMove);
    domElement.removeEventListener("pointerup", onPointerUp);
    domElement.removeEventListener("pointercancel", onPointerUp);
    domElement.removeEventListener("wheel", onWheel);
  }

  return { update, focusOn, clearFocus, reset, isFocused, wasClick, isIdle, dispose };
}
