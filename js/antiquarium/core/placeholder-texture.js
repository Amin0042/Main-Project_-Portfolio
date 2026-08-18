// Antiquarium — core/placeholder-texture.js
//
// Generates an in-memory canvas texture standing in for an artwork whose
// image path is missing or fails to load, so a bad/placeholder path in
// the artworks data never renders as a blank or broken plane. Drawn in
// the same restrained gold-on-charcoal language as the rest of the
// installation rather than a generic gray "broken image" box.

import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";

export function createPlaceholderTexture(title) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 880;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#141416";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(198, 168, 90, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  ctx.strokeStyle = "rgba(198, 168, 90, 0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, canvas.height / 2);
  ctx.lineTo(canvas.width - 60, canvas.height / 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(198, 168, 90, 0.85)";
  ctx.textAlign = "center";
  ctx.font = "28px Georgia, serif";
  ctx.fillText("Awaiting Acquisition", canvas.width / 2, canvas.height / 2 - 24);

  if (title) {
    ctx.font = "20px Georgia, serif";
    ctx.fillStyle = "rgba(143, 122, 62, 0.8)";
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 + 20);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
