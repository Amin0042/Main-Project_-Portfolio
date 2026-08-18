// Antiquarium — core/device-tier.js
//
// One-time, cheap classification of the visiting device into a quality
// tier, plus the numeric preset that tier maps to. Everything an
// experience or the stage might want to scale back on mobile — pixel
// ratio, texture size, particle count, frame rate — is a plain number
// here, in one place, rather than scattered device checks through the
// rendering code.
//
// Tiering is by pointer type first, viewport width second: a narrow
// desktop browser window is still "desktop" (mouse-precision input, a
// real GPU), while any touch device is a phone or tablet by width. This
// matches how these devices actually differ for our purposes — input
// precision and GPU/thermal headroom — rather than just pixel count.

const PRESETS = {
  "small-phone": {
    pixelRatioCap: 1.5,
    textureMaxDim: 768,
    perPlateDust: 8,
    ambientDust: 8,
    targetFps: 30,
    rotateSpeedScale: 0.85,
  },
  phone: {
    pixelRatioCap: 1.75,
    textureMaxDim: 1024,
    perPlateDust: 12,
    ambientDust: 14,
    targetFps: 30,
    rotateSpeedScale: 0.9,
  },
  tablet: {
    pixelRatioCap: 2,
    textureMaxDim: 1536,
    perPlateDust: 18,
    ambientDust: 20,
    targetFps: null,
    rotateSpeedScale: 1,
  },
  desktop: {
    pixelRatioCap: 2,
    textureMaxDim: 2048,
    perPlateDust: 22,
    ambientDust: 24,
    targetFps: null,
    rotateSpeedScale: 1,
  },
};

export function getDeviceTier() {
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  if (!coarsePointer) {
    return "desktop";
  }

  const width = window.innerWidth;
  if (width < 420) {
    return "small-phone";
  }
  if (width < 700) {
    return "phone";
  }
  return "tablet";
}

export function getQualityPreset(tier) {
  return PRESETS[tier] || PRESETS.desktop;
}
