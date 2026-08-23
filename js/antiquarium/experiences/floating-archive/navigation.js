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
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.enableRotate = true;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.9;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 26;
  controls.maxPolarAngle = Math.PI;
  controls.minPolarAngle = 0;
  controls.target.set(0, 1.5, 0);

  const REST_POSITION = new THREE.Vector3(0, 10, 58);
  const REST_LOOK_AT = new THREE.Vector3(0, 1.5, 0);
  camera.position.copy(REST_POSITION);
  camera.up.set(0, 1, 0);
  controls.update();

  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  let focusPoint = null;
  let focusStandoff = 8;
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

  function update(delta) {
    controls.enabled = true;
    controls.update();
    idleTimer += delta;
  }

  function focusOn(worldPosition) {
    focusPoint = worldPosition.clone();
    focusBlendGoal = 1;
    idleTimer = 0;

    const currentDirection = camera.position.clone().sub(worldPosition);
    const orbitRadius = currentDirection.lengthSq() > 1 ? Math.max(8, Math.min(18, currentDirection.length())) : 12;
    const direction = currentDirection.lengthSq() > 1 ? currentDirection.normalize() : new THREE.Vector3(0, 0, -1);

    camera.position.copy(worldPosition).add(direction.multiplyScalar(orbitRadius));
    controls.target.copy(worldPosition);
    controls.update();
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
