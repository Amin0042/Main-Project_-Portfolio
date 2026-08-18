// Antiquarium — main.js
//
// Page entry point (loaded only by pages/antiquarium.html, as
// type="module", so nothing here ever runs on the rest of the site).
// This file owns the things a *page* is responsible for — wiring up the
// experience selector, deciding whether WebGL/motion is even possible,
// starting and stopping the render loop — and hands everything about
// the 3D content itself off to core/ and experiences/.
//
// Kept deliberately thin: no Three.js import here at all. That import
// only happens inside core/renderer.js and each experience module, and
// only once we already know WebGL is available — so a visitor without
// WebGL, or on the rest of the site entirely, never pays for it.

import { isWebglAvailable, isLikelySoftwareRenderer } from "./core/webgl-support.js";
import { createLoop } from "./core/loop.js";
import { getDeviceTier, getQualityPreset } from "./core/device-tier.js";
import { experiences, getDefaultExperience } from "./experiences/registry.js";

// A rolling watchdog for the case WebGL reports as available and isn't
// software-rendered, yet the specific scene still can't hold a usable
// frame rate on this particular device — the one performance problem a
// one-time capability check can't catch. Sampling only starts after a
// warm-up window so shader compilation / first-texture-upload stalls
// (real, but one-time) never get mistaken for a sustained problem.
const WATCHDOG_WARMUP_MS = 1800;
const WATCHDOG_MIN_SAMPLES = 40;
const WATCHDOG_MIN_FPS = 12;

function initAntiquarium() {
  const stageEl = document.querySelector("[data-antiquarium-stage]");
  const fallbackEl = document.querySelector("[data-antiquarium-fallback]");
  const selectorEl = document.querySelector("[data-antiquarium-selector]");
  const captionEl = document.querySelector("[data-antiquarium-caption]");
  // Optional — an experience only gets these if it asks for them via its
  // second factory argument. Not every future installation will need an
  // inspector label, so this stays undefined rather than required.
  const inspectorEl = document.querySelector("[data-antiquarium-inspector]");
  const inspectorTitleEl = document.querySelector("[data-antiquarium-inspector-title]");
  const inspectorMetaEl = document.querySelector("[data-antiquarium-inspector-meta]");

  if (!stageEl || !selectorEl) {
    return;
  }

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // WebGL missing entirely, or present but only as a software rasterizer
  // (some browsers report one as if it were real) — either way this
  // scene has no usable GPU path here, so skip straight to the static
  // fallback rather than loading Three.js and every artwork texture only
  // to render at an unusable frame rate.
  if (!isWebglAvailable() || isLikelySoftwareRenderer()) {
    showFallback();
    renderSelector({ interactiveDisabled: true });
    return;
  }

  const deviceTier = getDeviceTier();
  const quality = getQualityPreset(deviceTier);

  let stage = null;
  let currentExperience = null;
  let loop = null;
  let resizeObserver = null;
  let watchdogSamples = [];
  let watchdogStartTime = null;
  let watchdogSettled = false;

  function showFallback() {
    stageEl.hidden = true;
    if (fallbackEl) {
      fallbackEl.hidden = false;
    }
  }

  async function mountExperience(entry) {
    if (!entry || entry.status !== "active") {
      return;
    }

    // Tear down whatever is currently mounted before building the next
    // one — the page only ever keeps one experience's GPU resources
    // alive at a time.
    if (currentExperience) {
      currentExperience.dispose();
      currentExperience = null;
    }
    loop?.stop();

    if (!stage) {
      const { createStage } = await import("./core/renderer.js");
      stage = createStage(stageEl, { pixelRatioCap: quality.pixelRatioCap });

      resizeObserver = new ResizeObserver(() => stage.resize());
      resizeObserver.observe(stageEl);
    }

    const module = await entry.load();
    const factory = module.createFloatingArchive || module.default;
    currentExperience = factory(stage, {
      inspectorEl,
      inspectorTitleEl,
      inspectorMetaEl,
      quality,
    });

    if (captionEl) {
      captionEl.textContent = entry.tagline || "";
    }

    if (!loop) {
      loop = createLoop(
        (delta) => {
          currentExperience?.update(delta);
          stage.renderer.render(stage.scene, stage.camera);
          feedWatchdog(delta);
        },
        { targetFps: quality.targetFps }
      );
    }

    if (reduceMotion) {
      // One static frame instead of a running loop — the installation
      // is still visible and composed, it simply never animates.
      currentExperience.update(0);
      stage.renderer.render(stage.scene, stage.camera);
    } else if (documentIsVisible()) {
      loop.start();
    }
  }

  function documentIsVisible() {
    return document.visibilityState === "visible";
  }

  function feedWatchdog(delta) {
    if (watchdogSettled || reduceMotion) {
      return;
    }
    const now = performance.now();
    if (watchdogStartTime === null) {
      watchdogStartTime = now;
    }
    if (now - watchdogStartTime < WATCHDOG_WARMUP_MS) {
      return;
    }
    watchdogSamples.push(delta);
    if (watchdogSamples.length < WATCHDOG_MIN_SAMPLES) {
      return;
    }
    // One verdict, right after the sample window fills — not a
    // continuously re-armed check, so a brief stutter (a tab regaining
    // focus, a garbage-collection pause) can't itself trigger a
    // fallback the device didn't actually need.
    watchdogSettled = true;
    const averageDelta =
      watchdogSamples.reduce((total, sample) => total + sample, 0) / watchdogSamples.length;
    const averageFps = 1 / Math.max(averageDelta, 0.0001);
    if (averageFps < WATCHDOG_MIN_FPS) {
      degradeToFallback();
    }
  }

  function degradeToFallback() {
    loop?.stop();
    currentExperience?.dispose();
    currentExperience = null;
    stage?.dispose();
    stage = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    showFallback();
    renderSelector({ interactiveDisabled: true });
  }

  // Pause rendering whenever the tab isn't visible — this is the page's
  // half of "don't continuously render when the page isn't active"; the
  // other half is simply that no other page ever imports this module.
  document.addEventListener("visibilitychange", () => {
    if (!loop || reduceMotion) {
      return;
    }
    if (documentIsVisible()) {
      loop.start();
    } else {
      loop.stop();
    }
  });

  window.addEventListener("pagehide", () => {
    loop?.stop();
    currentExperience?.dispose();
    stage?.dispose();
    resizeObserver?.disconnect();
  });

  function renderSelector({ interactiveDisabled = false } = {}) {
    selectorEl.innerHTML = "";

    experiences.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "antiquarium-selector-item";
      button.dataset.experienceId = entry.id;

      const isActive = entry.status === "active";
      if (!isActive) {
        button.classList.add("is-reserved");
        button.disabled = true;
      }
      if (interactiveDisabled) {
        button.disabled = true;
      }

      const title = document.createElement("span");
      title.className = "antiquarium-selector-title";
      title.textContent = entry.title;
      button.appendChild(title);

      const status = document.createElement("span");
      status.className = "antiquarium-selector-status";
      status.textContent = isActive ? "Open" : "In Development";
      button.appendChild(status);

      button.addEventListener("click", () => {
        if (button.disabled) {
          return;
        }
        selectorEl
          .querySelectorAll(".antiquarium-selector-item")
          .forEach((el) => el.classList.remove("is-current"));
        button.classList.add("is-current");
        mountExperience(entry);
      });

      selectorEl.appendChild(button);
    });
  }

  renderSelector();

  const initial = getDefaultExperience();
  if (initial) {
    const initialButton = selectorEl.querySelector(
      `[data-experience-id="${initial.id}"]`
    );
    initialButton?.classList.add("is-current");
    mountExperience(initial);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAntiquarium);
} else {
  initAntiquarium();
}
