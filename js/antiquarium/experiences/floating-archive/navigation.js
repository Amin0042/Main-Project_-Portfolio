// Antiquarium — experiences/floating-archive/navigation.js
//
// This file now uses Three.js's official OrbitControls for the general
// room navigation model, while leaving the existing click-to-focus flow
// intact: the visitor can orbit around the archive, click a work to focus
// it, and reset to the original camera view from the stage button.

//
// CINEMATIC CAMERA FLIGHTS — focusing a star (and Reset) no longer
// teleports the camera. Both start a "flight": the look-at point glides
// in a straight line while the camera itself swings around it in
// spherical coordinates (radius, polar, azimuth), so it arcs around the
// constellation instead of cutting through it. On the way it pulls back
// a little and rises a little, then settles in, all on one ease-in-out
// curve — the move of a crane shot, not a cut. While a flight runs, the
// visitor's own orbit/zoom input is paused so the two never fight; any
// new click simply starts a fresh flight from wherever the camera is.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js";
import { reduceMotion } from "./constants.js";

const IDLE_AFTER = 0.9;

// Flight timing (seconds): longer journeys take longer, within limits.
const FLIGHT_MIN_DURATION = 1.6;
const FLIGHT_MAX_DURATION = 2.8;
// How far the camera pulls back mid-flight (fraction of its radius),
// and how much it rises (radians off its polar angle) — both peak at
// the flight's midpoint and are zero at either end.
const FLIGHT_PULLBACK = 0.22;
const FLIGHT_RISE = 0.16;
// Framing for a focused artwork: the camera stands far enough back for
// the circle to fill about this fraction of the screen's height.
const FOCUS_FILL = 0.58;
// How far above centre the focused artwork sits, as a fraction of the
// screen's height — clears the title/controls along the bottom.
const FOCUS_RAISE = 0.1;
const FOCUS_MIN_DISTANCE = 7;
const FOCUS_MAX_DISTANCE = 22;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

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

  // ---- Flights --------------------------------------------------------
  let flight = null;
  const _offset = new THREE.Vector3();
  const _spherical = new THREE.Spherical();

  function startFlight(toPosition, toTarget) {
    const fromTarget = controls.target.clone();
    const from = new THREE.Spherical().setFromVector3(_offset.copy(camera.position).sub(fromTarget));
    const to = new THREE.Spherical().setFromVector3(_offset.copy(toPosition).sub(toTarget));
    // Swing the short way around, never the long way.
    let turn = to.theta - from.theta;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    to.theta = from.theta + turn;

    if (reduceMotion) {
      flight = null;
      controls.target.copy(toTarget);
      camera.position.copy(toPosition);
      controls.update();
      return;
    }

    const journey =
      fromTarget.distanceTo(toTarget) +
      Math.abs(turn) * (from.radius + to.radius) * 0.5 +
      Math.abs(to.radius - from.radius);
    flight = {
      fromTarget,
      toTarget: toTarget.clone(),
      from,
      to,
      elapsed: 0,
      duration: Math.min(
        FLIGHT_MAX_DURATION,
        Math.max(FLIGHT_MIN_DURATION, FLIGHT_MIN_DURATION + journey * 0.018)
      ),
    };
    controls.enabled = false;
  }

  function stepFlight(delta) {
    flight.elapsed += delta;
    const progress = Math.min(1, flight.elapsed / flight.duration);
    const eased = easeInOutCubic(progress);
    const arc = Math.sin(Math.PI * progress);

    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
    _spherical.radius = Math.min(
      controls.maxDistance,
      THREE.MathUtils.lerp(flight.from.radius, flight.to.radius, eased) * (1 + FLIGHT_PULLBACK * arc)
    );
    _spherical.phi = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(flight.from.phi, flight.to.phi, eased) - FLIGHT_RISE * arc,
      0.05,
      Math.PI - 0.05
    );
    _spherical.theta = THREE.MathUtils.lerp(flight.from.theta, flight.to.theta, eased);
    camera.position.setFromSpherical(_spherical).add(controls.target);
    camera.lookAt(controls.target);
    idleTimer = 0;

    if (progress >= 1) {
      flight = null;
      controls.enabled = true;
    }
  }

  function update(delta) {
    if (flight) {
      stepFlight(delta);
    } else {
      controls.enabled = true;
    }
    controls.update();
    idleTimer += delta;
  }

  /**
   * @param {THREE.Vector3} worldPosition - the star's live world position.
   * @param {{ normal?: THREE.Vector3, size?: number }} [framing] - the
   *   artwork's facing direction and on-screen diameter, so the camera
   *   lands square-on to the piece at a distance that frames it fully.
   */
  function focusOn(worldPosition, framing = {}) {
    focusPoint = worldPosition.clone();
    focusBlendGoal = 1;
    idleTimer = 0;

    const currentDirection = camera.position.clone().sub(worldPosition);
    let direction;
    if (framing.normal && framing.normal.lengthSq() > 0) {
      // Face the artwork dead square-on (a level camera, so the frame
      // stays a true rectangle, never a keystoned trapezoid), and always
      // from its FRONT: a plate seen from behind shows its image
      // mirrored, so when the camera starts behind a piece the flight
      // swings all the way round to the front rather than settling there.
      direction = framing.normal.clone();
      direction.y = 0;
      if (direction.lengthSq() < 1e-6) {
        direction.set(0, 0, 1);
      }
      direction.normalize();
    } else {
      direction =
        currentDirection.lengthSq() > 1 ? currentDirection.clone().normalize() : new THREE.Vector3(0, 0, 1);
    }

    let radius;
    if (framing.size) {
      const viewHeightPerUnit = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      radius = framing.size / (viewHeightPerUnit * FOCUS_FILL);
    } else {
      radius = currentDirection.length() || 12;
    }
    radius = THREE.MathUtils.clamp(radius, FOCUS_MIN_DISTANCE, Math.min(FOCUS_MAX_DISTANCE, controls.maxDistance));

    // Lift the artwork above the wall-label along the bottom of the
    // stage by sliding the whole shot (camera and look-at together)
    // down — a pure translation, so the piece stays square-on.
    const viewHeight = 2 * radius * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const lookAt = worldPosition.clone();
    lookAt.y -= viewHeight * FOCUS_RAISE;

    startFlight(lookAt.clone().add(direction.multiplyScalar(radius)), lookAt);
  }

  function clearFocus() {
    focusBlendGoal = 0;
    focusPoint = null;
    controls.enabled = flight === null;
  }

  // Where the camera actually rests: REST_POSITION's direction from the
  // look-at point, at the distance OrbitControls allows (it clamps
  // anything further than maxDistance on its next update).
  function restPosition() {
    const direction = REST_POSITION.clone().sub(REST_LOOK_AT);
    const distance = THREE.MathUtils.clamp(direction.length(), controls.minDistance, controls.maxDistance);
    return REST_LOOK_AT.clone().add(direction.normalize().multiplyScalar(distance));
  }

  function reset() {
    focusBlend = 0;
    focusBlendGoal = 0;
    focusPoint = null;
    moved = 0;
    idleTimer = IDLE_AFTER;
    startFlight(restPosition(), REST_LOOK_AT);
  }

  function isFocused() {
    return focusBlendGoal > 0.5;
  }

  function isFlying() {
    return flight !== null;
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
  return { update, focusOn, clearFocus, reset, isFocused, isFlying, wasClick, isIdle, dispose };
}
