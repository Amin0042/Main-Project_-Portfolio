// Antiquarium — core/geo-projection.js
//
// Flattens [longitude, latitude] degree pairs onto a flat 2D plane
// centered on a reference point, for turning real geographic data into
// scene coordinates. This is a plain equirectangular projection with a
// cosine-latitude correction on the east-west axis (so a degree of
// longitude shrinks toward the poles the way it actually does) — not a
// cartographically precise projection (no Albers/Lambert/conic
// correction for area or angle), because at the scale of a single
// country the distortion that introduces is imperceptible, and this
// installation's goal is a beautiful, legible artifact rather than a
// GIS-grade map. Generic and Iran-agnostic — any experience projecting
// real-world coordinates onto a scene can reuse it as-is.

/**
 * @param {number} centerLon - reference longitude, degrees, maps to x=0.
 * @param {number} centerLat - reference latitude, degrees, maps to y=0.
 * @param {number} scale - scene units per degree at the reference latitude.
 * @returns {(lon: number, lat: number) => [number, number]}
 */
export function createProjector(centerLon, centerLat, scale = 1) {
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  return function project(lon, lat) {
    const x = (lon - centerLon) * cosLat * scale;
    const y = (lat - centerLat) * scale;
    return [x, y];
  };
}
