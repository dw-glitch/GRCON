/* GRCON — mascote vetorial articulado e contínuo (Rive Canvas Lite). */
(function (root) {
  "use strict";

  const SELECTOR = ".grcon-brand-mascot, .grcon-mascot-context";
  const STATE_MACHINE = "Mascot State";
  const INPUT_NAME = "mode";
  const RIV_URL = new URL("assets/mascot/rive/build/grcon-mascot.riv", document.baseURI).href;
  const WASM_URL = new URL("vendor/rive/rive.wasm", document.baseURI).href;
  const WASM_FALLBACK_URL = new URL("vendor/rive/rive_fallback.wasm", document.baseURI).href;
  const STYLE_ID = "grcon-mascot-rive-style";
  const records = new Set();
  const byMascot = new WeakMap();
  const reducedQuery = root.matchMedia?.("(prefers-reduced-motion: reduce)");
  let mutationObserver = null;
  let intersectionObserver = null;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .grcon-mascot-rive-canvas {
        position: absolute;
        z-index: 2;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        opacity: 0;
        pointer-events: none;
        contain: strict;
        transform: translateZ(0);
        transition: opacity 180ms ease-out;
      }
      .grcon-mascot-greeting[data-grcon-rive-ready="true"] .grcon-mascot-rive-canvas {
        opacity: 1;
      }
      .grcon-mascot-greeting[data-grcon-rive-ready="true"]
        .grcon-mascot-pose-motion > .grcon-mascot-sprite:not(.grcon-mascot-processing-orb),
      .grcon-mascot-greeting[data-grcon-rive-ready="true"] .grcon-mascot-generated-layer {
        opacity: 0 !important;
        visibility: hidden;
        animation: none !important;
      }
      .grcon-mascot-greeting[data-grcon-rive-ready="true"] .grcon-mascot-motion,
      .grcon-mascot-greeting[data-grcon-rive-ready="true"] .grcon-mascot-sprite {
        transform: none;
        filter: none;
      }
      .grcon-mascot-greeting[data-grcon-rive-ready="true"].is-processing
        .grcon-mascot-motion::after {
        z-index: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .grcon-mascot-rive-canvas { transition-duration: 80ms; }
      }
    `;
    document.head.appendChild(style);
  }

  function desiredMode(mascot) {
    if (reducedQuery?.matches) return 0;
    if (mascot.classList.contains("is-processing")) return 3;
    if (mascot.classList.contains("is-greeting-active")) return 1;
    const pose = String(mascot.dataset.pose || "").toLowerCase();
    if (pose === "success") return 4;
    if (["analysis", "pending", "search", "import"].includes(pose)) return 2;
    return 0;
  }

  function resize(record) {
    if (!record?.ready || !record.player || !record.canvas.isConnected) return;
    const rect = record.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(3, Math.max(1, Number(root.devicePixelRatio) || 1));
    record.player.resizeDrawingSurfaceToCanvas(ratio);
  }

  function sync(record) {
    if (!record?.ready || !record.input) return;
    const mode = desiredMode(record.mascot);
    if (record.lastMode === mode) return;
    record.lastMode = mode;
    record.input.value = mode;
  }

  function fail(record, error) {
    if (!record || record.failed) return;
    record.failed = true;
    record.mascot.removeAttribute("data-grcon-rive-pending");
    record.mascot.removeAttribute("data-grcon-rive-ready");
    record.canvas.remove();
    record.resizeObserver?.disconnect();
    record.player?.cleanup?.();
    records.delete(record);
    byMascot.delete(record.mascot);
    if (root.console?.warn) console.warn("GRCON: animação vetorial indisponível; mantendo asset HD.", error || "");
  }

  function prepareMascot(mascot) {
    if (!mascot || byMascot.has(mascot) || mascot.dataset.grconRivePending === "true") return;
    const runtime = root.rive;
    const host = mascot.querySelector(".grcon-mascot-pose-motion")
      || mascot.querySelector(".grcon-mascot-motion")
      || mascot;
    if (!runtime?.Rive || !host) return;

    mascot.dataset.grconRivePending = "true";
    const canvas = document.createElement("canvas");
    canvas.className = "grcon-mascot-rive-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = 1;
    canvas.height = 1;
    host.appendChild(canvas);

    const record = {
      mascot,
      canvas,
      player: null,
      input: null,
      resizeObserver: null,
      ready: false,
      failed: false,
      visible: true,
      lastMode: null,
    };
    records.add(record);
    byMascot.set(mascot, record);

    try {
      record.player = new runtime.Rive({
        src: RIV_URL,
        canvas,
        artboard: "GRCON Mascot",
        stateMachine: STATE_MACHINE,
        autoplay: !reducedQuery?.matches,
        enableRiveAssetCDN: false,
        shouldDisableRiveListeners: true,
        layout: new runtime.Layout({ fit: runtime.Fit.Contain, alignment: runtime.Alignment.Center }),
        onLoad: function () {
          const inputs = record.player.stateMachineInputs(STATE_MACHINE) || [];
          record.input = inputs.find((input) => input.name === INPUT_NAME) || null;
          if (!record.input) {
            fail(record, `entrada ${INPUT_NAME} não encontrada`);
            return;
          }
          record.ready = true;
          mascot.removeAttribute("data-grcon-rive-pending");
          mascot.dataset.grconRiveReady = "true";
          document.documentElement.dataset.grconMascotEngine = "rive-vector-v1";
          sync(record);
          resize(record);
          if (reducedQuery?.matches) record.player.pause();
        },
        onLoadError: function (event) {
          fail(record, event?.data || event);
        },
      });
      record.resizeObserver = new ResizeObserver(() => resize(record));
      record.resizeObserver.observe(host);
      intersectionObserver?.observe(mascot);
    } catch (error) {
      fail(record, error);
    }
  }

  function refresh(scope) {
    const source = scope?.querySelectorAll ? scope : document;
    if (source.matches?.(SELECTOR)) prepareMascot(source);
    source.querySelectorAll(SELECTOR).forEach(prepareMascot);
    records.forEach((record) => {
      if (!record.mascot.isConnected) {
        intersectionObserver?.unobserve(record.mascot);
        record.resizeObserver?.disconnect();
        record.player?.cleanup?.();
        records.delete(record);
        return;
      }
      sync(record);
    });
  }

  function handleReducedMotion() {
    records.forEach((record) => {
      record.lastMode = null;
      sync(record);
      if (!record.ready) return;
      if (reducedQuery?.matches) {
        record.player.play();
        root.setTimeout(() => record.player?.pause(), 90);
      } else if (record.visible && !document.hidden) {
        record.player.play();
      }
    });
  }

  function init() {
    installStyles();
    if (!root.rive?.Rive || !root.ResizeObserver) return;
    root.rive.RuntimeLoader.setWasmUrl(WASM_URL);
    root.rive.RuntimeLoader.setWasmFallbackUrl(WASM_FALLBACK_URL);
    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const record = byMascot.get(entry.target);
        if (!record?.ready || reducedQuery?.matches) return;
        record.visible = entry.isIntersecting;
        if (entry.isIntersecting && !document.hidden) record.player.play();
        else record.player.pause();
      });
    }, { rootMargin: "80px" });
    refresh(document);
    mutationObserver = new MutationObserver((mutations) => {
      let mustSync = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) refresh(node);
          });
          mustSync = mustSync || mutation.removedNodes.length > 0;
        } else {
          mustSync = true;
        }
      });
      if (mustSync) refresh(document);
    });
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-pose"],
    });
    reducedQuery?.addEventListener?.("change", handleReducedMotion);
    document.addEventListener("visibilitychange", () => {
      records.forEach((record) => {
        if (!record.ready || reducedQuery?.matches) return;
        if (document.hidden || !record.visible) record.player.pause();
        else record.player.play();
      });
    });
  }

  function diagnostics() {
    return Object.freeze({
      version: "1.0.0",
      engine: document.documentElement.dataset.grconMascotEngine || "png-fallback",
      instances: records.size,
      ready: Array.from(records).filter((record) => record.ready).length,
      modes: Array.from(records).map((record) => record.lastMode),
      reducedMotion: Boolean(reducedQuery?.matches),
    });
  }

  root.GRCONMascotRive = Object.freeze({ version: "1.0.0", refresh, diagnostics });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
