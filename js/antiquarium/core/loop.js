// Antiquarium — core/loop.js
//
// A small requestAnimationFrame controller that experiences and main.js
// share instead of each hand-rolling their own RAF bookkeeping. Nothing
// here knows about Three.js — it just calls a tick callback with elapsed
// time, and can be started/stopped from outside (tab hidden, page not
// active, reduced motion, disposal).

export function createLoop(onTick, options = {}) {
  // Optional frame-rate ceiling: still ticks requestAnimationFrame every
  // vsync (so start/stop stay simple and responsive), but skips actually
  // calling onTick/rendering until enough real time has passed. Delta is
  // measured from the last tick that *ran*, so motion speed stays
  // correct — this only thins out how often it's sampled, the way
  // capping to 30fps on a phone saves real GPU/battery without changing
  // how fast anything appears to move.
  const targetFps = options.targetFps ?? null;
  const minInterval = targetFps ? 1000 / targetFps : 0;

  let frameId = null;
  let running = false;
  let lastTime = performance.now();
  let lastTickTime = performance.now();

  function frame(now) {
    if (!running) {
      return;
    }
    if (minInterval && now - lastTickTime < minInterval) {
      frameId = window.requestAnimationFrame(frame);
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    lastTickTime = now;
    onTick(delta, now);
    frameId = window.requestAnimationFrame(frame);
  }

  function start() {
    if (running) {
      return;
    }
    running = true;
    lastTime = performance.now();
    lastTickTime = lastTime;
    frameId = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  return {
    start,
    stop,
    get isRunning() {
      return running;
    },
  };
}
