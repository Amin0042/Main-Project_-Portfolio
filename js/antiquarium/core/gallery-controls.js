// Antiquarium — core/gallery-controls.js
//
// A self-contained camera rig for "stand inside a room and look around
// it" installations: drag/touch to orbit, wheel/pinch to dolly in and
// out, idle mouse position for a faint parallax drift, and a `focusOn`
// / `clearFocus` pair that glides the camera in on a single exhibit and
// back out again. Everything here only ever moves the camera that's
// handed in — it has no idea what's in the scene, so any experience
// that wants "walk around and inspect things" can reuse it as-is.
//
// Deliberately not Three.js's OrbitControls: that addon has no concept
// of a focus/dolly-to-target state, and pulling it in as a second
// module just to get drag-to-orbit (which is ~30 lines) would cost more
// over the network than it saves.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";

export function createGalleryControls(domElement, camera, options = {}) {
  const target = new THREE.Vector3(0, 0, 0);

  let radius = options.radius ?? 8.5;
  const minRadius = options.minRadius ?? 4.5;
  const maxRadius = options.maxRadius ?? 13.5;

  let theta = options.theta ?? 0.15;
  let phi = options.phi ?? Math.PI / 2 - 0.08;
  const minPhi = 0.45;
  const maxPhi = Math.PI - 0.45;

  const idleDrift = options.idleDrift ?? 0.00018;
  // A phone screen turns the same finger-width drag into a proportionally
  // larger swipe than a mouse would produce for the same intent, so
  // touch-tier callers pass a sub-1 scale (see device-tier.js) to keep
  // the orbit feeling as deliberate on a small screen as on desktop.
  const speedScale = options.speedScale ?? 1;
  const rotateSpeed = 0.0038 * speedScale;
  const zoomSpeed = 0.0016;
  const pinchSpeed = 0.018;

  let velTheta = 0;
  let velPhi = 0;
  let velRadius = 0;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;

  let pinchDistance = null;

  const parallax = new THREE.Vector2();
  const parallaxTarget = new THREE.Vector2();

  // Focus state is kept as a direction + standoff distance rather than a
  // frozen point, specifically so standoff can keep responding to
  // wheel/pinch while focused — "zoom closer" on the inspected piece,
  // not just on the gallery at large.
  let focusDirection = null;
  let focusLookAt = null;
  let focusStandoff = 2.4;
  let velFocusStandoff = 0;
  const minFocusStandoff = 1.35;
  const maxFocusStandoff = 4.4;
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
    const rect = domElement.getBoundingClientRect();
    parallaxTarget.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    parallaxTarget.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;

    if (!dragging || focusBlendGoal > 0 || pinchDistance !== null) {
      return;
    }
    // Clamped so a second finger landing mid-gesture (about to become a
    // pinch, one frame before pinchDistance is established above) can't
    // register as a huge single-frame drag delta and flick the room.
    const dx = Math.max(-60, Math.min(60, event.clientX - lastX));
    const dy = Math.max(-60, Math.min(60, event.clientY - lastY));
    lastX = event.clientX;
    lastY = event.clientY;
    moved += Math.abs(dx) + Math.abs(dy);

    velTheta -= dx * rotateSpeed;
    velPhi -= dy * rotateSpeed;
  }

  function onPointerUp(event) {
    dragging = false;
    domElement.releasePointerCapture?.(event.pointerId);
  }

  function onPointerLeave() {
    parallaxTarget.set(0, 0);
  }

  function onWheel(event) {
    event.preventDefault();
    if (focusBlendGoal > 0.5) {
      velFocusStandoff += event.deltaY * zoomSpeed * 0.7;
    } else {
      velRadius += event.deltaY * zoomSpeed;
    }
  }

  function onTouchMove(event) {
    if (event.touches.length !== 2) {
      pinchDistance = null;
      return;
    }
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    const distance = Math.hypot(dx, dy);

    if (pinchDistance !== null) {
      const delta = (pinchDistance - distance) * pinchSpeed;
      if (focusBlendGoal > 0.5) {
        velFocusStandoff += delta * 0.7;
      } else {
        velRadius += delta;
      }
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
  domElement.addEventListener("pointerleave", onPointerLeave);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("touchmove", onTouchMove, { passive: false });
  domElement.addEventListener("touchend", onTouchEnd);

  const scratchGalleryPos = new THREE.Vector3();
  const scratchFocusPos = new THREE.Vector3();
  const scratchCamPos = new THREE.Vector3();
  const scratchCamTarget = new THREE.Vector3();
  const scratchForward = new THREE.Vector3();
  const scratchRight = new THREE.Vector3();
  const scratchUp = new THREE.Vector3();

  function update(delta) {
    theta += velTheta + idleDrift * delta * 60;
    phi += velPhi;
    radius += velRadius;

    const decay = Math.pow(0.86, Math.max(delta * 60, 0.001));
    velTheta *= decay;
    velPhi *= decay;
    velRadius *= decay;

    if (focusBlendGoal > 0.5) {
      focusStandoff += velFocusStandoff;
      velFocusStandoff *= decay;
      focusStandoff = Math.min(maxFocusStandoff, Math.max(minFocusStandoff, focusStandoff));
    } else {
      velFocusStandoff = 0;
    }

    phi = Math.min(maxPhi, Math.max(minPhi, phi));
    radius = Math.min(maxRadius, Math.max(minRadius, radius));

    parallax.lerp(parallaxTarget, Math.min(1, delta * 3));
    focusBlend += (focusBlendGoal - focusBlend) * Math.min(1, delta * 3.2);

    scratchGalleryPos.setFromSphericalCoords(radius, phi, theta).add(target);

    if (focusBlend > 0.0008 && focusDirection && focusLookAt) {
      scratchFocusPos
        .copy(focusLookAt)
        .addScaledVector(focusDirection, focusStandoff);
      scratchCamPos.copy(scratchGalleryPos).lerp(scratchFocusPos, focusBlend);
      scratchCamTarget.copy(target).lerp(focusLookAt, focusBlend);
    } else {
      scratchCamPos.copy(scratchGalleryPos);
      scratchCamTarget.copy(target);
    }

    const parallaxStrength = 0.32 * (1 - focusBlend);
    scratchForward.subVectors(scratchCamTarget, scratchCamPos).normalize();
    scratchRight.crossVectors(scratchForward, camera.up).normalize();
    scratchUp.crossVectors(scratchRight, scratchForward).normalize();

    scratchCamPos.addScaledVector(scratchRight, parallax.x * parallaxStrength);
    scratchCamPos.addScaledVector(scratchUp, -parallax.y * parallaxStrength);

    camera.position.copy(scratchCamPos);
    camera.lookAt(scratchCamTarget);
  }

  function focusOn(position, lookAt, standoff = 2.4) {
    const direction = position.clone().sub(target);
    if (direction.lengthSq() < 0.0001) {
      direction.set(0, 0, 1);
    } else {
      direction.normalize();
    }
    focusDirection = direction;
    focusLookAt = lookAt ? lookAt.clone() : position.clone();
    focusStandoff = standoff;
    velFocusStandoff = 0;
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
    domElement.removeEventListener("pointerleave", onPointerLeave);
    domElement.removeEventListener("wheel", onWheel);
    domElement.removeEventListener("touchmove", onTouchMove);
    domElement.removeEventListener("touchend", onTouchEnd);
  }

  return { update, focusOn, clearFocus, isFocused, wasClick, dispose };
}
