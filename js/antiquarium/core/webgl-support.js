// Antiquarium — core/webgl-support.js
//
// One job: answer "can this browser actually render WebGL right now?"
// without throwing. Kept separate from renderer.js so main.js can check
// this *before* it ever imports Three.js — on a machine/browser without
// WebGL there is no reason to pull down the (much heavier) three.module.js
// bundle at all.

export function isWebglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return Boolean(context);
  } catch (error) {
    return false;
  }
}

// A second, narrower question than "is WebGL available": is it backed by
// an actual GPU? Some browsers report WebGL as present while quietly
// falling back to a software rasterizer (SwiftShader, llvmpipe, Mesa's
// offscreen renderer) — technically not unavailable, but guaranteed to
// render this scene at an unusable frame rate. Catching that here, before
// any Three.js module or texture is ever fetched, is far cheaper than
// discovering it three seconds into a stuttering render loop.
export function isLikelySoftwareRenderer() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) {
      return false;
    }
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererName = info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const name = String(rendererName || "").toLowerCase();
    return ["swiftshader", "llvmpipe", "software", "mesa offscreen", "basic render"].some(
      (marker) => name.includes(marker)
    );
  } catch (error) {
    return false;
  }
}
