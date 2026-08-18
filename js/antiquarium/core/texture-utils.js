// Antiquarium — core/texture-utils.js
//
// Loads an image and hands back a Three.js texture capped to `maxDim` on
// its longest side. THREE.TextureLoader alone always uploads a source
// image at its full decoded resolution — fine for a handful of images on
// desktop, wasteful (and on some phones, enough to exhaust GPU memory and
// force a context loss) for artwork photographed or exported far larger
// than any plate in this room ever displays it. The one-time canvas
// downsample here costs a bit of main-thread time at load; the texture
// upload and every subsequent frame's sampling cost is smaller for it.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";

/**
 * @param {string} url
 * @param {{ maxDim?: number, onLoad?: (texture: THREE.Texture) => void, onError?: () => void }} options
 * @returns {{ cancel: () => void }} — call to ignore a load that resolves after its caller is gone.
 */
export function loadFittedTexture(url, options = {}) {
  const maxDim = options.maxDim ?? 2048;
  const image = new Image();
  let cancelled = false;

  image.onload = () => {
    if (cancelled) {
      return;
    }

    let source = image;
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);

    if (longestSide > maxDim && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const scale = maxDim / longestSide;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      source = canvas;
    }

    const texture = new THREE.Texture(source);
    texture.needsUpdate = true;
    options.onLoad?.(texture);
  };

  image.onerror = () => {
    if (!cancelled) {
      options.onError?.();
    }
  };

  image.src = url;

  return {
    cancel() {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    },
  };
}
