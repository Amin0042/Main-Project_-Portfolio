// Antiquarium — experiences/cartography-world-grid.js
//
// Turns a TopoJSON world (Natural Earth country polygons, as published by
// the world-atlas package) into the pixels of "IRAN — CARTOGRAPHY OF
// MEMORY"'s surrounding world: one regular grid in the same scene units
// as the Iran plate, one kept cell per square of land. Pure data — no
// Three.js and no DOM — so it can be run and checked outside the page.
//
// Iran is cut out here rather than hidden later: its Natural Earth polygon
// is skipped, and every cell inside iranRing (plus one cell of margin) is
// dropped, so no pixel ever exists on the plate. The ring passed in is
// the plate's own outline, not Natural Earth's, so the two edges agree.

import { createSeededRandom } from "../core/seeded-random.js";

const IRAN_ISO_NUMERIC = "364";

// The ellipse the world occupies, in scene units around the plate, and
// the share of it (squared distance) past which land starts to dissolve
// into the dark instead of ending on a hard rectangular edge.
const WORLD_CENTER = [0, -0.9];
const WORLD_RADII = [10.8, 8.8];
const DISSOLVE_FROM = 0.68;

function decodeArcs(topology) {
  const [scaleX, scaleY] = topology.transform.scale;
  const [translateX, translateY] = topology.transform.translate;
  return topology.arcs.map((arc) => {
    let lon = 0;
    let lat = 0;
    return arc.map(([deltaLon, deltaLat]) => {
      lon += deltaLon;
      lat += deltaLat;
      return [lon * scaleX + translateX, lat * scaleY + translateY];
    });
  });
}

// A negative index means "that arc, reversed" (TopoJSON stores ~index).
function ringFromArcs(indices, arcs) {
  const ring = [];
  indices.forEach((index) => {
    ring.push(...(index < 0 ? arcs[~index].slice().reverse() : arcs[index]));
  });
  return ring;
}

// Even-odd scanline fill: each ring edge records where it crosses a row's
// center line, and each row paints between pairs of crossings. Holes work
// because a polygon's rings are all counted together.
function fillRings(rings, grid, paint) {
  const crossings = new Map();
  rings.forEach((ring) => {
    ring.forEach(([ax, ay], i) => {
      const [bx, by] = ring[(i + 1) % ring.length];
      const first = Math.ceil(Math.min(ay, by) / grid.pitch - grid.rowOrigin - 0.5);
      const last = Math.ceil(Math.max(ay, by) / grid.pitch - grid.rowOrigin - 0.5) - 1;
      for (
        let row = Math.max(first, 0);
        row <= Math.min(last, grid.rows - 1);
        row += 1
      ) {
        const y = (row + grid.rowOrigin + 0.5) * grid.pitch;
        const x = ax + ((y - ay) / (by - ay)) * (bx - ax);
        if (!crossings.has(row)) {
          crossings.set(row, []);
        }
        crossings.get(row).push(x);
      }
    });
  });

  crossings.forEach((list, row) => {
    list.sort((a, b) => a - b);
    for (let i = 0; i + 1 < list.length; i += 2) {
      const from = Math.ceil(list[i] / grid.pitch - grid.colOrigin - 0.5);
      const to = Math.ceil(list[i + 1] / grid.pitch - grid.colOrigin - 0.5) - 1;
      for (
        let col = Math.max(from, 0);
        col <= Math.min(to, grid.cols - 1);
        col += 1
      ) {
        paint(row * grid.cols + col);
      }
    }
  });
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * @param {object} topology - world-atlas countries TopoJSON.
 * @param {object} options
 * @param {(lon: number, lat: number) => [number, number]} options.project
 * @param {[number, number][]} options.iranRing - plate outline, scene units.
 * @param {number} options.pitch - scene units between neighbouring pixels.
 * @returns {{count: number, x: Float32Array, y: Float32Array, tone: Float32Array}}
 *   every kept pixel's home in scene units, and a 0–1 tone that sets its
 *   size and gold (the portrait's "light", drawn from the map instead).
 */
export function buildWorldGrid(topology, { project, iranRing, pitch }) {
  const [centerX, centerY] = WORLD_CENTER;
  const [radiusX, radiusY] = WORLD_RADII;
  const colOrigin = Math.floor((centerX - radiusX) / pitch);
  const rowOrigin = Math.floor((centerY - radiusY) / pitch);
  const cols = Math.ceil((radiusX * 2) / pitch) + 1;
  const rows = Math.ceil((radiusY * 2) / pitch) + 1;
  const grid = { pitch, cols, rows, colOrigin, rowOrigin };

  // 0 is empty (sea); anything else is one country's index + 1.
  const owner = new Uint16Array(cols * rows);
  const arcs = decodeArcs(topology);
  const projectRing = (indices) =>
    ringFromArcs(indices, arcs).map(([lon, lat]) => project(lon, lat));

  topology.objects.countries.geometries.forEach((country, index) => {
    if (country.id === IRAN_ISO_NUMERIC || !country.arcs) {
      return;
    }
    const polygons =
      country.type === "MultiPolygon" ? country.arcs : [country.arcs];
    polygons.forEach((polygon) => {
      fillRings(polygon.map(projectRing), grid, (cell) => {
        owner[cell] = index + 1;
      });
    });
  });

  const iranMask = new Uint8Array(cols * rows);
  fillRings([iranRing], grid, (cell) => {
    iranMask[cell] = 1;
  });

  // Neighbouring countries read apart by a dim seam along shared borders;
  // coasts catch a little more light than inland ground, and each country
  // sits at its own steady tone with a fine grain across it.
  const countryTone = new Map();
  const toneRandom = createSeededRandom(1979);
  const grain = createSeededRandom(8);
  const xs = [];
  const ys = [];
  const tones = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = row * cols + col;
      const roll = grain();
      const speck = grain();
      if (!owner[cell]) {
        continue;
      }

      let beside = false;
      let border = false;
      let coast = false;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nearCol = col + dx;
          const nearRow = row + dy;
          if (nearCol < 0 || nearCol >= cols || nearRow < 0 || nearRow >= rows) {
            continue;
          }
          const near = nearRow * cols + nearCol;
          beside = beside || iranMask[near] === 1;
          coast = coast || owner[near] === 0;
          border =
            border || (owner[near] !== 0 && owner[near] !== owner[cell]);
        }
      }
      if (beside) {
        continue;
      }

      const x = (col + colOrigin + 0.5) * pitch;
      const y = (row + rowOrigin + 0.5) * pitch;
      const distance =
        ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
      const fade = smoothstep(DISSOLVE_FROM, 1, distance);
      if (roll < fade) {
        continue;
      }

      if (!countryTone.has(owner[cell])) {
        countryTone.set(owner[cell], 0.42 + toneRandom() * 0.3);
      }
      let tone = countryTone.get(owner[cell]) + (speck - 0.5) * 0.16;
      if (border) {
        tone *= 0.3;
      } else if (coast) {
        tone += 0.24;
      }
      xs.push(x);
      ys.push(y);
      tones.push(Math.min(1, Math.max(0, tone * (1 - fade * 0.55))));
    }
  }

  return {
    count: tones.length,
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    tone: Float32Array.from(tones),
  };
}
