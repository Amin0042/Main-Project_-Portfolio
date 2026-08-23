// Antiquarium — experiences/floating-archive/navigation.js
//
// This file now uses Three.js's official OrbitControls for the general
// room navigation model, while leaving the existing click-to-focus flow
// intact: the visitor can orbit around the archive, click a work to focus
// it, and reset to the original camera view from the stage button.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js";

const IDLE_AFTER = 0.9;

export function createNavigation(domElement, camera, room, options = {}) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.9;
  controls.dampingFactor = 0.08;
  controls.minDistance = 18;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minPolarAngle = Math.PI * 0.2;
  controls.target.set(0, 1.5, 0);

  const REST_POSITION = new THREE.Vector3(0, 10, 46);
  const REST_LOOK_AT = new THREE.Vector3(0, 1.5, 0);
  camera.position.copy(REST_POSITION);
  camera.up.set(0, 1, 0);
  controls.update();

  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  let focusPoint = null;
  let focusStandoff = 2.4;
  let focusBlend = 0;
  let focusBlendGoal = 0;
  let idleTimer = IDLE_AFTER;

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
    if (!dragging) {
      return;
    }
    const dx = Math.abs(event.clientX - lastX);
    const dy = Math.abs(event.clientY - lastY);
    moved += dx + dy;
    lastX = event.clientX;
    lastY = event.clientY;
    idleTimer = 0;
  }

  function onPointerUp(event) {
    dragging = false;
    domElement.releasePointerCapture?.(event.pointerId);
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerup", onPointerUp);
  domElement.addEventListener("pointercancel", onPointerUp);

  const scratchTarget = new THREE.Vector3();
  const scratchLookAt = new THREE.Vector3();
  const scratchFocusDir = new THREE.Vector3();
  const scratchFocusPos = new THREE.Vector3();

  function update(delta) {
    if (focusBlendGoal <= 0) {
      controls.enabled = true;
      controls.update();
      idleTimer += delta;
    } else {
      controls.enabled = false;
      focusBlend += (focusBlendGoal - focusBlend) * Math.min(1, delta * 3.2);

      scratchTarget.copy(camera.position);
      scratchLookAt.copy(controls.target);

      if (focusPoint) {
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
      controls.target.copy(scratchLookAt);
      camera.lookAt(scratchLookAt);
    }
  }

  function focusOn(worldPosition) {
    focusPoint = worldPosition.clone();
    focusStandoff = 2.4;
    focusBlendGoal = 1;
    idleTimer = 0;
  }

  function clearFocus() {
    focusBlendGoal = 0;
    focusPoint = null;
    controls.enabled = true;
  }

  function reset() {
    focusBlend = 0;
    focusBlendGoal = 0;
    focusPoint = null;
    moved = 0;
    idleTimer = IDLE_AFTER;
    controls.enabled = true;
    controls.target.copy(REST_LOOK_AT);
    camera.position.copy(REST_POSITION);
    controls.update();
    controls.saveState();
  }

  function isFocused() {
    return focusBlendGoal > 0.5;
  }

  function wasClick() {
    return moved < 8;
  }

  function isIdle() {
    return idleTimer > IDLE_AFTER;
  }

  function dispose() {
    controls.dispose();
    domElement.removeEventListener("pointerdown", onPointerDown);
    domElement.removeEventListener("pointermove", onPointerMove);
    domElement.removeEventListener("pointerup", onPointerUp);
    domElement.removeEventListener("pointercancel", onPointerUp);
  }

  controls.saveState();
  return { update, focusOn, clearFocus, reset, isFocused, wasClick, isIdle, dispose };
}
