/* GRCON — uma única instância Rive raster do mascote oficial, com fallback PNG permanente. */
(function (root) {
  "use strict";

  const VERSION = "2.0.0";
  const HOST_SELECTOR = ".grcon-brand-mascot";
  const STATE_MACHINE = "GRCON Mascot State";
  const INPUT_NAME = "state";
  const RIV_URL = new URL("assets/mascot/rive/build/grcon-mascot.riv", document.baseURI).href;
  const WASM_URL = new URL("vendor/rive/rive.wasm", document.baseURI).href;
  const WASM_FALLBACK_URL = new URL("vendor/rive/rive_fallback.wasm", document.baseURI).href;
  const STYLE_ID = "grcon-mascot-rive-style";
  const ACTIVATION_TIMEOUT_MS = 7000;
  const MAX_FRAME_CHECKS = 30;
  const STATES = Object.freeze({
    idle: 0,
    hover: 1,
    hello: 2,
    processing: 3,
    analyzing: 4,
    success: 5,
    warning: 6,
  });
  const ANALYZING_POSES = new Set(["analysis", "search", "check", "history", "dashboard", "sigem-pw", "import", "report"]);

  const reducedMotion = root.matchMedia?.("(prefers-reduced-motion: reduce)");
  let record = null;
  let mutationObserver = null;
  let syncFrame = 0;
  let explicitState = "";
  let disabled = false;
  let failureReason = "";
  let failureReported = false;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .grcon-brand-mascot .grcon-mascot-pose-motion { position: relative; }
      .grcon-brand-mascot .grcon-mascot-rive-canvas {
        position: absolute;
        z-index: 3;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        opacity: 0;
        pointer-events: none;
        contain: strict;
        transition: opacity 120ms ease-out;
      }
      .grcon-brand-mascot[data-grcon-rive-ready="true"] .grcon-mascot-rive-canvas { opacity: 1; }
      .grcon-brand-mascot[data-grcon-rive-ready="true"]
        .grcon-mascot-pose-motion > .grcon-mascot-sprite:not(.grcon-mascot-processing-orb),
      .grcon-brand-mascot[data-grcon-rive-ready="true"] .grcon-mascot-generated-layer {
        opacity: 0 !important;
        visibility: hidden;
        animation: none !important;
      }
      .grcon-brand-mascot[data-grcon-rive-ready="true"] .grcon-mascot-motion,
      .grcon-brand-mascot[data-grcon-rive-ready="true"] .grcon-mascot-pose-motion {
        animation: none !important;
        transform: none !important;
        filter: none !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .grcon-brand-mascot .grcon-mascot-rive-canvas { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function contextualState() {
    const contextual = document.querySelector(".grcon-mascot-context");
    if (!contextual) return "idle";
    if (contextual.classList.contains("is-processing") || contextual.getAttribute("aria-busy") === "true") return "processing";
    const pose = String(contextual.dataset.pose || "").toLowerCase();
    if (pose === "success") return "success";
    if (pose === "warning") return "warning";
    if (ANALYZING_POSES.has(pose)) return "analyzing";
    return "idle";
  }

  function desiredState() {
    if (explicitState && Object.hasOwn(STATES, explicitState)) return explicitState;
    const contextState = contextualState();
    if (contextState !== "idle") return contextState;
    if (record?.hovered) return "hover";
    if (record?.host.classList.contains("is-greeting-active")) return "hello";
    return "idle";
  }

  function syncState() {
    syncFrame = 0;
    if (!record?.input || record.failed) return;
    const state = desiredState();
    if (record.state === state) return;
    record.state = state;
    record.input.value = STATES[state];
  }

  function scheduleSync() {
    if (syncFrame) return;
    syncFrame = root.requestAnimationFrame(syncState);
  }

  function canvasHasVisibleFrame(canvas) {
    try {
      const sample = document.createElement("canvas");
      sample.width = 64;
      sample.height = 64;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) return false;
      context.clearRect(0, 0, 64, 64);
      context.drawImage(canvas, 0, 0, 64, 64);
      const pixels = context.getImageData(0, 0, 64, 64).data;
      let visible = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 24) visible += 1;
        if (visible > 24) return true;
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  function resize() {
    if (!record?.loaded || !record.player || !record.canvas.isConnected) return;
    const bounds = record.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(2, Math.max(1, Number(root.devicePixelRatio) || 1));
    record.player.resizeDrawingSurfaceToCanvas(ratio);
    scheduleFrameCheck();
  }

  function activate() {
    if (!record || record.failed || record.ready || !record.loaded || !record.canvas.isConnected) return;
    if (!canvasHasVisibleFrame(record.canvas)) {
      record.frameChecks += 1;
      if (record.frameChecks < MAX_FRAME_CHECKS) scheduleFrameCheck();
      return;
    }
    record.ready = true;
    root.clearTimeout(record.activationTimer);
    record.activationTimer = 0;
    record.host.removeAttribute("data-grcon-rive-pending");
    record.host.dataset.grconRiveReady = "true";
    document.documentElement.dataset.grconMascotEngine = "official-rive-raster-v1";
  }

  function scheduleFrameCheck() {
    if (!record || record.frameCheckScheduled || record.ready || record.failed) return;
    record.frameCheckScheduled = true;
    root.requestAnimationFrame(() => {
      root.requestAnimationFrame(() => {
        if (!record) return;
        record.frameCheckScheduled = false;
        activate();
      });
    });
  }

  function cleanupRecord() {
    if (!record) return;
    const current = record;
    record = null;
    root.clearTimeout(current.activationTimer);
    current.resizeObserver?.disconnect();
    current.intersectionObserver?.disconnect();
    current.host.removeEventListener("pointerenter", current.onPointerEnter);
    current.host.removeEventListener("pointerleave", current.onPointerLeave);
    current.host.removeAttribute("data-grcon-rive-pending");
    current.host.removeAttribute("data-grcon-rive-ready");
    current.player?.cleanup?.();
    current.canvas.remove();
  }

  function fail(reason) {
    if (disabled) return;
    disabled = true;
    failureReason = String(reason?.message || reason?.data || reason || "runtime indisponível");
    cleanupRecord();
    document.documentElement.dataset.grconMascotEngine = "official-png-fallback-v1";
    if (!failureReported && root.console?.warn) {
      failureReported = true;
      console.warn("GRCON: Rive indisponível; o PNG oficial permanece ativo.", failureReason);
    }
  }

  function create(host) {
    if (disabled || record || !host || reducedMotion?.matches) return;
    const runtime = root.rive;
    const container = host.querySelector(".grcon-mascot-pose-motion") || host.querySelector(".grcon-mascot-motion") || host;
    if (!runtime?.Rive || !runtime?.RuntimeLoader || !container) return;

    const canvas = document.createElement("canvas");
    canvas.className = "grcon-mascot-rive-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = 1;
    canvas.height = 1;
    container.appendChild(canvas);
    host.dataset.grconRivePending = "true";

    const current = {
      host,
      canvas,
      player: null,
      input: null,
      resizeObserver: null,
      intersectionObserver: null,
      activationTimer: 0,
      frameChecks: 0,
      frameCheckScheduled: false,
      state: "",
      loaded: false,
      ready: false,
      failed: false,
      hovered: false,
      visible: true,
      onPointerEnter: null,
      onPointerLeave: null,
    };
    record = current;

    current.onPointerEnter = (event) => {
      if (event.pointerType === "touch") return;
      current.hovered = true;
      scheduleSync();
    };
    current.onPointerLeave = (event) => {
      if (event.pointerType === "touch") return;
      current.hovered = false;
      scheduleSync();
    };
    host.addEventListener("pointerenter", current.onPointerEnter);
    host.addEventListener("pointerleave", current.onPointerLeave);

    try {
      runtime.RuntimeLoader.setWasmUrl(WASM_URL);
      runtime.RuntimeLoader.setWasmFallbackUrl?.(WASM_FALLBACK_URL);
      current.player = new runtime.Rive({
        src: RIV_URL,
        canvas,
        artboard: "GRCON Mascot",
        stateMachine: STATE_MACHINE,
        autoplay: true,
        enableRiveAssetCDN: false,
        shouldDisableRiveListeners: true,
        layout: new runtime.Layout({ fit: runtime.Fit.Contain, alignment: runtime.Alignment.Center }),
        onLoad: function () {
          if (record !== current || current.failed) return;
          const inputs = current.player.stateMachineInputs(STATE_MACHINE) || [];
          current.input = inputs.find((input) => input.name === INPUT_NAME) || null;
          if (!current.input) {
            fail(`entrada ${INPUT_NAME} não encontrada`);
            return;
          }
          current.loaded = true;
          syncState();
          resize();
          scheduleFrameCheck();
        },
        onLoadError: function (event) {
          fail(event?.data || event || "falha ao carregar o arquivo .riv");
        },
      });
    } catch (error) {
      fail(error);
      return;
    }

    current.activationTimer = root.setTimeout(() => {
      if (!current.ready) fail("tempo limite antes do primeiro frame visível");
    }, ACTIVATION_TIMEOUT_MS);
    current.resizeObserver = new ResizeObserver(resize);
    current.resizeObserver.observe(container);
    if (root.IntersectionObserver) {
      current.intersectionObserver = new IntersectionObserver((entries) => {
        const visible = Boolean(entries[0]?.isIntersecting);
        current.visible = visible;
        if (!current.ready) return;
        if (visible && !document.hidden) current.player.play();
        else current.player.pause();
      }, { rootMargin: "80px" });
      current.intersectionObserver.observe(host);
    }
  }

  function refresh() {
    if (disabled) return;
    if (record && !record.host.isConnected) cleanupRecord();
    if (!record) create(document.querySelector(HOST_SELECTOR));
    scheduleSync();
  }

  function setState(name) {
    const normalized = name == null ? "" : String(name).toLowerCase();
    if (normalized && !Object.hasOwn(STATES, normalized)) throw new Error(`Estado Rive desconhecido: ${name}`);
    explicitState = normalized;
    scheduleSync();
  }

  function handleReducedMotion() {
    if (reducedMotion?.matches) cleanupRecord();
    else refresh();
  }

  function init() {
    installStyles();
    document.documentElement.dataset.grconMascotEngine = "official-png-fallback-v1";
    if (!root.rive?.Rive || !root.ResizeObserver || !root.requestAnimationFrame) return;
    refresh();
    mutationObserver = new MutationObserver(refresh);
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-pose", "aria-busy", "data-grcon-control-processing"],
    });
    reducedMotion?.addEventListener?.("change", handleReducedMotion);
    document.addEventListener("visibilitychange", () => {
      if (!record?.ready) return;
      if (document.hidden || !record.visible) record.player.pause();
      else record.player.play();
    });
    root.addEventListener("grcon:processing-state", scheduleSync);
    root.addEventListener("grcon:processing-pulse", scheduleSync);
    root.addEventListener("pagehide", cleanupRecord, { once: true });
    root.addEventListener("unhandledrejection", (event) => {
      const reason = String(event?.reason?.message || event?.reason || "");
      if (!/webassembly|wasm|rive|canvaskit/i.test(reason)) return;
      event.preventDefault();
      fail(event.reason);
    });
  }

  function diagnostics() {
    return Object.freeze({
      version: VERSION,
      engine: document.documentElement.dataset.grconMascotEngine || "official-png-fallback-v1",
      disabled,
      failureReason,
      instances: record ? 1 : 0,
      ready: Boolean(record?.ready),
      state: record?.state || desiredState(),
      reducedMotion: Boolean(reducedMotion?.matches),
      source: "grcon-mascot-sprite.png#default",
    });
  }

  root.GrconMascot = Object.freeze({
    version: VERSION,
    states: STATES,
    setState,
    clearState: () => setState(""),
    refresh,
    diagnostics,
  });
  root.GRCONMascotRive = root.GrconMascot;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
