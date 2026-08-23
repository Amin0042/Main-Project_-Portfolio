// Antiquarium — experiences/cartography-of-memory.js
//
// "IRAN — CARTOGRAPHY OF MEMORY" — a second, independent installation.
// It shares Antiquarium's reusable core (camera rig, render loop, device
// tiering, the page's inspector label) with THE FLOATING ARCHIVE, but
// builds an entirely separate scene from entirely separate data — this
// file never touches, imports the contents of, or depends on
// floating-archive.js in any way.
//
// Exports a single factory, `createCartographyOfMemory(stage, context)`,
// returning { update(delta), dispose() } — the same shape main.js already
// drives every experience through.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { createGalleryControls } from "../core/gallery-controls.js";
import { createProjector } from "../core/geo-projection.js";
import { getQualityPreset } from "../core/device-tier.js";
import { iranBoundary, mapCenter, locations } from "./cartography-data.js";

const GOLD = 0xc6a85a;
const MUTED_GOLD = 0x8f7a3e;

// Scene units per degree of longitude at the map's reference latitude —
// chosen so Iran's ~19°-wide extent fills a room-scale plate a few
// units across, the same order of magnitude as THE FLOATING ARCHIVE's
// gallery. Purely a display-scale choice; changing it does not change
// which real coordinates are being drawn.
const DEGREES_TO_UNITS = 0.42;
const MAP_THICKNESS = 0.09;
const MARKER_STANDOFF = 1.9;

const reduceMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createCartographyOfMemory(stage, context = {}) {
  const { scene, camera, renderer } = stage;
  const inspectorEl = context.inspectorEl || null;
  const inspectorTitleEl = context.inspectorTitleEl || null;
  const inspectorMetaEl = context.inspectorMetaEl || null;
  const resetButtonEl = context.resetButtonEl || null;
  const quality = context.quality || getQualityPreset("desktop");

  const room = new THREE.Group();
  scene.add(room);

  const project = createProjector(mapCenter[0], mapCenter[1], DEGREES_TO_UNITS);

  // ---- Lighting ---------------------------------------------------------
  const key = new THREE.PointLight(GOLD, 10, 24, 2);
  key.position.set(5, 7, 3);
  room.add(key);

  const rim = new THREE.PointLight(MUTED_GOLD, 4, 26, 2);
  rim.position.set(-6, 3, -5);
  room.add(rim);

  const ambient = new THREE.AmbientLight(0x1a1a1d, 1.3);
  room.add(ambient);

  // ---- The landmass -------------------------------------------------
  // Built directly from iranBoundary via core/geo-projection.js — no
  // hand-drawn shape anywhere in this file. The ring's closing duplicate
  // point is dropped; THREE.Shape closes it implicitly.
  const ringPoints = iranBoundary
    .slice(0, -1)
    .map(([lon, lat]) => project(lon, lat));

  const shape = new THREE.Shape();
  ringPoints.forEach(([x, y], i) => {
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  });

  const landGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: MAP_THICKNESS,
    bevelEnabled: false,
  });
  const landMaterial = new THREE.MeshStandardMaterial({
    color: 0x141416,
    roughness: 0.92,
    metalness: 0.1,
    emissive: new THREE.Color(0x1a1508),
    emissiveIntensity: 0.4,
  });
  const land = new THREE.Mesh(landGeometry, landMaterial);
  // ExtrudeGeometry extrudes the flat shape along +Z; rotating -90° about
  // X lays it flat with that extrusion becoming thickness pointing up.
  land.rotation.x = -Math.PI / 2;
  room.add(land);

  // ---- Coastline + stylized contour lines ----------------------------
  // The coastline itself is the real boundary, glowing at the map's true
  // edge. The two inset rings above it are a stylistic depth cue only —
  // evenly-scaled copies, not actual elevation data — standing in for
  // "elevation/depth" without pretending to be a terrain model this
  // first version was explicitly asked not to build.
  function buildContourLoop(scaleFactor, height, color, opacity) {
    const positions = new Float32Array((ringPoints.length + 1) * 3);
    ringPoints.forEach(([x, y], i) => {
      positions[i * 3] = x * scaleFactor;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = -y * scaleFactor;
    });
    const [firstX, firstY] = ringPoints[0];
    positions[ringPoints.length * 3] = firstX * scaleFactor;
    positions[ringPoints.length * 3 + 1] = height;
    positions[ringPoints.length * 3 + 2] = -firstY * scaleFactor;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    });
    const line = new THREE.Line(geometry, material);
    room.add(line);
    return { line, geometry, material };
  }

  const coastline = buildContourLoop(1, MAP_THICKNESS + 0.01, GOLD, 0.8);
  const contourA = buildContourLoop(0.93, MAP_THICKNESS + 0.16, MUTED_GOLD, 0.32);
  const contourB = buildContourLoop(0.84, MAP_THICKNESS + 0.3, MUTED_GOLD, 0.16);
  const contours = [coastline, contourA, contourB];

  // ---- Location markers -------------------------------------------------
  // Each marker is a small solid core plus a soft additive halo (two
  // cheap meshes, no custom shader) sitting just above the land surface
  // at that location's real projected position.
  const markerGeometry = new THREE.SphereGeometry(0.045, 12, 8);
  const haloGeometry = new THREE.SphereGeometry(0.1, 12, 8);
  const markers = [];
  const markerMeshes = [];

  locations.forEach((placeData, index) => {
    const [lon, lat] = placeData.coordinates;
    const [x, y] = project(lon, lat);
    // Note the sign flip on the z axis: buildContourLoop above negates
    // `y` for the same reason — the shape was authored in longitude/
    // latitude order (x, y), and rotating the land mesh -90° about X
    // maps shape-space +y to world -z, so marker positions have to
    // follow the same flip to land on the coastline they belong to.
    const worldPos = new THREE.Vector3(x, MAP_THICKNESS + 0.06, -y);

    const group = new THREE.Group();
    group.position.copy(worldPos);
    room.add(group);

    const core = new THREE.Mesh(
      markerGeometry,
      new THREE.MeshBasicMaterial({ color: GOLD })
    );
    group.add(core);

    const halo = new THREE.Mesh(
      haloGeometry,
      new THREE.MeshBasicMaterial({
        color: GOLD,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(halo);

    const marker = {
      data: placeData,
      group,
      core,
      halo,
      basePosition: worldPos,
      bobPhase: (index / Math.max(locations.length, 1)) * Math.PI * 2,
      scaleTarget: 1,
      haloOpacityTarget: 0.28,
    };
    markers.push(marker);
    markerMeshes.push(core);
  });

  // ---- Atmospheric particles --------------------------------------------
  const dustCount = quality.ambientDust;
  const dustPositions = new Float32Array(dustCount * 3);
  const halfWidth = Math.max(...ringPoints.map(([x]) => Math.abs(x))) * 1.3;
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = (Math.random() - 0.5) * halfWidth * 2;
    dustPositions[i * 3 + 1] = Math.random() * 2.4;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * halfWidth * 2;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: MUTED_GOLD,
      size: 0.016,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
    })
  );
  room.add(dust);

  // ---- Camera rig ---------------------------------------------------
  // A wider, higher-angle default than THE FLOATING ARCHIVE's gallery
  // orbit — this is a map meant to be looked down onto, not a room of
  // plates meant to be stood among. Same reusable controls module,
  // different framing, passed in entirely through its existing options.
  const controls = createGalleryControls(renderer.domElement, camera, {
    idleDrift: reduceMotion ? 0 : 0.00014,
    speedScale: quality.rotateSpeedScale,
    // Was radius: 11 — noticeably further back than the archive's own
    // default framing, leaving more empty dark space around the map
    // plate than around the constellation. Pulled in toward the (already
    // author-calibrated) minRadius so the map fills its frame to a
    // similar degree by default; still zoomable out to the same 20.
    radius: 9,
    minRadius: 5,
    maxRadius: 20,
    phi: 1.0,
    theta: 0.35,
  });

  // ---- Hover + select interaction ----------------------------------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2(10, 10);
  let hoveredMarker = null;
  let selectedMarker = null;

  function pointerToNdc(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickMarker() {
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(markerMeshes, false);
    if (!hits.length) {
      return null;
    }
    return markers.find((marker) => marker.core === hits[0].object) || null;
  }

  function showInspector(marker) {
    if (!inspectorEl) {
      return;
    }
    if (inspectorTitleEl) {
      inspectorTitleEl.textContent = marker.data.name;
    }
    if (inspectorMetaEl) {
      const parts = [marker.data.date, marker.data.description].filter(Boolean);
      inspectorMetaEl.textContent = parts.join(" — ");
    }
    inspectorEl.hidden = false;
    requestAnimationFrame(() => inspectorEl.classList.add("is-visible"));
  }

  function hideInspector() {
    if (!inspectorEl) {
      return;
    }
    inspectorEl.classList.remove("is-visible");
  }

  function selectMarker(marker) {
    selectedMarker = marker;
    controls.focusOn(marker.basePosition, marker.basePosition, MARKER_STANDOFF);
    applySelectionTargets();
    showInspector(marker);
  }

  function clearSelection() {
    selectedMarker = null;
    controls.clearFocus();
    applySelectionTargets();
    hideInspector();
  }

  function applySelectionTargets() {
    markers.forEach((marker) => {
      if (selectedMarker === marker) {
        marker.scaleTarget = 1.6;
        marker.haloOpacityTarget = 0.5;
      } else if (selectedMarker) {
        marker.scaleTarget = 0.85;
        marker.haloOpacityTarget = 0.12;
      } else {
        marker.scaleTarget = 1;
        marker.haloOpacityTarget = 0.28;
      }
    });
  }

  function onPointerMove(event) {
    pointerToNdc(event);
  }

  function onPointerUp(event) {
    if (!controls.wasClick()) {
      return;
    }
    pointerToNdc(event);
    const hit = pickMarker();

    if (hit) {
      selectMarker(hit);
    } else if (selectedMarker) {
      clearSelection();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && selectedMarker) {
      clearSelection();
    }
  }

  // Same "Reset view" contract as THE FLOATING ARCHIVE (navigation.js's
  // reset()): clear whatever's selected/inspected and snap the camera
  // back to its original framing. Previously never wired up here at
  // all, so the shared button silently did nothing on this installation.
  function resetView() {
    clearSelection();
    controls.reset();
  }

  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  if (resetButtonEl) {
    resetButtonEl.addEventListener("click", resetView);
  }
  window.addEventListener("keydown", onKeyDown);

  // ---- Frame update -----------------------------------------------------
  let elapsed = 0;
  const easeFactor = (delta) => Math.min(1, delta * 6);

  function update(delta) {
    elapsed += delta;
    controls.update(delta);

    if (!selectedMarker) {
      const hit = pickMarker();
      if (hit !== hoveredMarker) {
        hoveredMarker = hit;
        markers.forEach((marker) => {
          marker.scaleTarget = marker === hoveredMarker ? 1.3 : 1;
        });
      }
    }

    const t = easeFactor(delta);
    markers.forEach((marker) => {
      if (!reduceMotion) {
        marker.group.position.y =
          marker.basePosition.y + Math.sin(elapsed * 0.5 + marker.bobPhase) * 0.02;
      }
      const currentScale = marker.core.scale.x + (marker.scaleTarget - marker.core.scale.x) * t;
      marker.core.scale.setScalar(currentScale);
      marker.halo.scale.setScalar(currentScale);
      marker.halo.material.opacity +=
        (marker.haloOpacityTarget - marker.halo.material.opacity) * t;
    });

    if (!reduceMotion) {
      // A slow shimmer across the coastline and its contour rings —
      // gentle enough to read as "held up to the light," not a scanning
      // radar sweep.
      const shimmer = 0.85 + 0.15 * Math.sin(elapsed * 0.35);
      coastline.material.opacity = 0.8 * shimmer;
      contourA.material.opacity = 0.32 * shimmer;
      contourB.material.opacity = 0.16 * shimmer;
      dust.rotation.y += delta * 0.004;
    }
  }

  function dispose() {
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    if (resetButtonEl) {
      resetButtonEl.removeEventListener("click", resetView);
    }
    window.removeEventListener("keydown", onKeyDown);
    hideInspector();
    controls.dispose();

    landGeometry.dispose();
    landMaterial.dispose();
    markerGeometry.dispose();
    haloGeometry.dispose();
    dustGeometry.dispose();
    dust.material.dispose();

    contours.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });

    markers.forEach((marker) => {
      marker.core.material.dispose();
      marker.halo.material.dispose();
    });

    scene.remove(room);
  }

  return { update, dispose };
}

export default createCartographyOfMemory;
