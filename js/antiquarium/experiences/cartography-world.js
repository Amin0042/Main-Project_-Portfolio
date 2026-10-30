// Antiquarium — experiences/cartography-world.js
//
// The world around Iran in "IRAN — CARTOGRAPHY OF MEMORY": the region's
// countries rebuilt as gold pixels, with the same push and spring-back as
// the About page's Digital portrait (initializeDigitalPortrait() in
// main.js). Iran itself is untouched: nothing in this file reads or
// changes the plate, its grid has a hole where the plate sits, the
// cursor does nothing while it's over Iran, and a pixel pushed toward the
// border stops there instead of crossing it.
//
// Exports `createPixelWorld(options)`, returning { update(delta), dispose() }.
// The country polygons load from the CDN that already serves Three.js; if
// that fails, the world simply doesn't appear and Iran stands as before.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { buildWorldGrid } from "./cartography-world-grid.js";

const WORLD_DATA_URL = "https://unpkg.com/world-atlas@2.0.2/countries-50m.json";

// Just under the plate's top face, so its coastline stays on top.
const WORLD_HEIGHT = 0.02;

// The portrait's constants in scene units, per 60Hz step. Its spring and
// damping carry over as they are; the push scales with the pixel pitch.
const RADIUS = 1.1;
const PUSH_PER_PITCH = 0.64;
const SPRING = 0.07;
const DAMPING = 0.8;
const HEAT_RATE = 0.16;
const MAX_STEPS = 3;

const VERTEX_SHADER = `
  attribute float aTone;
  attribute float aHeat;
  uniform float uPitch;
  uniform float uScale;
  varying float vLevel;

  void main() {
    // At rest a pixel stays in the ramp's dim bronze; heat lifts it to
    // the portrait's full gold and warm white.
    vLevel = clamp(aTone * 0.2 + aHeat * 0.95, 0.0, 1.0);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float size = uPitch * (0.14 + 0.4 * aTone) * (1.0 + aHeat * 0.9);
    gl_PointSize = max(1.0, size * uScale / -viewPosition.z);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

// The portrait's ramp: dark bronze, brand gold, hot gold, warm white.
const FRAGMENT_SHADER = `
  uniform float uReveal;
  varying float vLevel;

  void main() {
    vec3 color;
    if (vLevel < 0.25) {
      color = mix(vec3(0.275, 0.204, 0.086), vec3(0.667, 0.529, 0.243), vLevel * 4.0);
    } else if (vLevel < 0.5) {
      color = mix(vec3(0.667, 0.529, 0.243), vec3(0.91, 0.753, 0.412), (vLevel - 0.25) * 4.0);
    } else if (vLevel < 0.75) {
      color = mix(vec3(0.91, 0.753, 0.412), vec3(1.0, 0.886, 0.627), (vLevel - 0.5) * 4.0);
    } else {
      color = mix(vec3(1.0, 0.886, 0.627), vec3(1.0, 0.973, 0.894), (vLevel - 0.75) * 4.0);
    }
    gl_FragColor = vec4(color, uReveal);
  }
`;

export function createPixelWorld({
  room,
  camera,
  renderer,
  project,
  iranRing,
  pitch,
  reduceMotion,
  onReady,
}) {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WORLD_HEIGHT);
  const groundHit = new THREE.Vector3();
  const bufferSize = new THREE.Vector2();
  const push = pitch * PUSH_PER_PITCH;

  const iranMinX = Math.min(...iranRing.map(([x]) => x));
  const iranMaxX = Math.max(...iranRing.map(([x]) => x));
  const iranMinY = Math.min(...iranRing.map(([, y]) => y));
  const iranMaxY = Math.max(...iranRing.map(([, y]) => y));

  function insideIran(x, y) {
    if (x < iranMinX || x > iranMaxX || y < iranMinY || y > iranMaxY) {
      return false;
    }
    let inside = false;
    for (let i = 0, j = iranRing.length - 1; i < iranRing.length; j = i, i += 1) {
      const [ax, ay] = iranRing[i];
      const [bx, by] = iranRing[j];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
        inside = !inside;
      }
    }
    return inside;
  }

  let field = null;
  let geometry = null;
  let points = null;
  let reveal = reduceMotion ? 1 : 0;
  let moving = false;
  let disposed = false;
  // Latest pointer in normalized device coordinates, or null when it's away.
  let pointerNdc = null;
  let tapTimer = 0;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPitch: { value: pitch },
      uScale: { value: 1 },
      uReveal: { value: reveal },
    },
  });

  function buildField(topology) {
    const grid = buildWorldGrid(topology, { project, iranRing, pitch });
    const positions = new Float32Array(grid.count * 3);
    for (let n = 0; n < grid.count; n += 1) {
      positions[n * 3] = grid.x[n];
      positions[n * 3 + 1] = WORLD_HEIGHT;
      // Same z flip as the plate's coastline (see buildContourLoop).
      positions[n * 3 + 2] = -grid.y[n];
    }

    geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const heatAttribute = new THREE.BufferAttribute(new Float32Array(grid.count), 1);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    heatAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("aHeat", heatAttribute);
    geometry.setAttribute("aTone", new THREE.BufferAttribute(grid.tone, 1));

    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    room.add(points);

    field = {
      count: grid.count,
      hx: grid.x,
      hy: grid.y,
      x: Float32Array.from(grid.x),
      y: Float32Array.from(grid.y),
      vx: new Float32Array(grid.count),
      vy: new Float32Array(grid.count),
      heat: heatAttribute.array,
      positions,
      positionAttribute,
      heatAttribute,
    };
  }

  fetch(WORLD_DATA_URL)
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((topology) => {
      if (!disposed) {
        buildField(topology);
        update(0);
        onReady();
      }
    })
    .catch(() => {
      // No world this visit; the plate doesn't depend on it.
    });

  // Where the cursor's ray meets the map, unless that's on Iran: the
  // cursor has no effect there at all.
  function pointerOnMap() {
    if (!pointerNdc) {
      return null;
    }
    raycaster.setFromCamera(pointerNdc, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) {
      return null;
    }
    const x = groundHit.x;
    const y = -groundHit.z;
    return insideIran(x, y) ? null : { x, y };
  }

  // Springs every pixel toward home, adds the cursor's push, and reports
  // whether anything is still visibly moving.
  function step(pointer) {
    const { hx, hy, x, y, vx, vy, heat } = field;
    const reach = RADIUS * RADIUS;
    let active = false;

    for (let n = 0; n < field.count; n += 1) {
      let ax = (hx[n] - x[n]) * SPRING;
      let ay = (hy[n] - y[n]) * SPRING;
      let heatTarget = 0;

      if (pointer) {
        const dx = x[n] - pointer.x;
        const dy = y[n] - pointer.y;
        const distance2 = dx * dx + dy * dy;

        if (distance2 < reach && distance2 > 0.0001) {
          const distance = Math.sqrt(distance2);
          const closeness = 1 - distance / RADIUS;
          ax += (dx / distance) * closeness * push;
          ay += (dy / distance) * closeness * push;
          heatTarget = closeness;
        }
      }

      vx[n] = (vx[n] + ax) * DAMPING;
      vy[n] = (vy[n] + ay) * DAMPING;
      const nextX = x[n] + vx[n];
      const nextY = y[n] + vy[n];

      if (
        (Math.abs(vx[n]) > 0.0002 || Math.abs(vy[n]) > 0.0002) &&
        insideIran(nextX, nextY)
      ) {
        vx[n] = 0;
        vy[n] = 0;
      } else {
        x[n] = nextX;
        y[n] = nextY;
      }
      heat[n] += (heatTarget - heat[n]) * HEAT_RATE;

      if (
        !active &&
        (Math.abs(vx[n]) > 0.0004 ||
          Math.abs(vy[n]) > 0.0004 ||
          Math.abs(hx[n] - x[n]) > 0.001 ||
          Math.abs(hy[n] - y[n]) > 0.001 ||
          heat[n] > 0.004)
      ) {
        active = true;
      }
    }

    return active;
  }

  function writePositions() {
    const { x, y, positions } = field;
    for (let n = 0; n < field.count; n += 1) {
      positions[n * 3] = x[n];
      positions[n * 3 + 2] = -y[n];
    }
    field.positionAttribute.needsUpdate = true;
    field.heatAttribute.needsUpdate = true;
  }

  function update(delta) {
    if (!field) {
      return;
    }

    renderer.getDrawingBufferSize(bufferSize);
    material.uniforms.uScale.value =
      bufferSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

    if (reveal < 1) {
      reveal = Math.min(1, reveal + delta / 1.6);
      material.uniforms.uReveal.value = reveal;
    }

    if (reduceMotion) {
      return;
    }

    const pointer = pointerOnMap();
    if (!pointer && !moving) {
      return;
    }

    // Fixed steps, so phones capped at 30fps feel the same as desktops.
    const steps = Math.min(MAX_STEPS, Math.max(1, Math.round(delta * 60)));
    for (let i = 0; i < steps; i += 1) {
      moving = step(pointer);
    }
    writePositions();
  }

  function toNdc(event) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function onPointerMove(event) {
    if (event.pointerType === "mouse") {
      pointerNdc = toNdc(event);
    }
  }

  function onPointerLeave(event) {
    if (event.pointerType === "mouse") {
      pointerNdc = null;
    }
  }

  // Touch has no hover: a tap pushes the pixels aside for a moment.
  function onPointerDown(event) {
    pointerNdc = toNdc(event);
    if (event.pointerType !== "mouse") {
      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => {
        pointerNdc = null;
      }, 320);
    }
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);

  function dispose() {
    disposed = true;
    window.clearTimeout(tapTimer);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("pointerdown", onPointerDown);
    if (points) {
      room.remove(points);
      geometry.dispose();
    }
    material.dispose();
  }

  return { update, dispose };
}
