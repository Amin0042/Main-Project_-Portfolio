// Antiquarium — core/drag-orbit.js
//
// A deliberately minimal replacement for Three.js's OrbitControls: this
// installation only ever needs "drag to slowly turn the room," never
// zoom/pan/inertial-fling camera rigs. Writing the ~40 lines this needs
// keeps the experience from pulling in the addons/ module tree over the
// network just to get a drag gesture, and keeps the interaction feeling
// like turning a heavy pedestal rather than piloting a camera.
//
// Rotates a target Object3D (typically a group holding the exhibit)
// around Y based on horizontal pointer drag, and very gently around X
// based on vertical drag, clamped so the installation can never be
// flipped upside down.

export function createDragOrbit(domElement, target, options = {}) {
  const dragSpeed = options.dragSpeed ?? 0.0045;
  const maxTilt = options.maxTilt ?? 0.35;
  const damping = options.damping ?? 0.06;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let velocityX = 0;
  let tiltX = 0;
  let targetTiltX = 0;
  let autoSpin = options.autoSpin ?? 0.0006;

  function pointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    domElement.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    if (!dragging) {
      return;
    }
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    velocityX += dx * dragSpeed;
    targetTiltX = Math.max(
      -maxTilt,
      Math.min(maxTilt, targetTiltX + dy * dragSpeed * 0.5)
    );
  }

  function pointerUp(event) {
    dragging = false;
    domElement.releasePointerCapture?.(event.pointerId);
  }

  domElement.addEventListener("pointerdown", pointerDown);
  domElement.addEventListener("pointermove", pointerMove);
  domElement.addEventListener("pointerup", pointerUp);
  domElement.addEventListener("pointerleave", pointerUp);
  domElement.addEventListener("pointercancel", pointerUp);

  function update(delta) {
    // Idle auto-rotation, gently overridden by drag velocity — the
    // installation should always feel faintly alive even before a
    // visitor touches it, then answer directly to their hand.
    target.rotation.y += autoSpin + velocityX;
    velocityX *= 1 - damping * 10 * delta * 6;
    tiltX += (targetTiltX - tiltX) * Math.min(1, damping * 10 * delta * 6);
    target.rotation.x = tiltX;
  }

  function setAutoSpin(value) {
    autoSpin = value;
  }

  function dispose() {
    domElement.removeEventListener("pointerdown", pointerDown);
    domElement.removeEventListener("pointermove", pointerMove);
    domElement.removeEventListener("pointerup", pointerUp);
    domElement.removeEventListener("pointerleave", pointerUp);
    domElement.removeEventListener("pointercancel", pointerUp);
  }

  return { update, setAutoSpin, dispose };
}
