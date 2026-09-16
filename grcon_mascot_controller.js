/* GRCON — controlador central do Mascote da Qualidade: vídeos locais + PNG oficial. */
(function (root) {
  "use strict";

  const VERSION = "3.0.0";
  const ENGINE = "official-video-v1";
  const STYLE_ID = "grcon-mascot-video-style";
  const SELECTOR = ".grcon-brand-mascot, .grcon-mascot-context";
  const CSS_TARGET = ":is(.grcon-brand-mascot, .grcon-mascot-context)";
  const CORE = root.GRCONMascotGreetingCore;
  const ASSETS = Object.freeze({
    processing: new URL("assets/mascot/video/grcon-mascot-processing-alpha.webm", document.baseURI).href,
    wave: new URL("assets/mascot/video/grcon-mascot-wave-alpha.webm", document.baseURI).href,
  });
  const STATES = Object.freeze([
    "idle", "welcome", "hover", "analyzing", "searching-files",
    "checking-document", "confused", "success", "warning", "error",
    "uploading", "generating-grdt", "checking-ld", "sigem-pw-analysis", "loading",
  ]);
  const PROCESSING_STATES = new Set([
    "analyzing", "searching-files", "checking-document", "confused", "uploading",
    "generating-grdt", "checking-ld", "sigem-pw-analysis", "loading",
  ]);
  const records = new Map();
  const failedModes = new Set();
  const videoProbe = document.createElement("video");
  const videoSupported = Boolean(videoProbe.canPlayType?.('video/webm; codecs="vp9"'));
  let observer = null;
  let initialized = false;
  let operationActive = false;
  let operationState = "";
  let pendingOutcome = "";
  let pulseTimer = 0;
  let transientTimer = 0;
  let welcomeTimer = 0;
  let bubble = null;
  let activeBubbleHost = null;
  let pinnedBubbleHost = null;
  let welcomeShown = false;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      ${CSS_TARGET}.grcon-mascot-video-host {
        pointer-events: auto;
        overflow: visible;
        isolation: isolate;
        touch-action: manipulation;
      }
      .grcon-mascot-video {
        position: absolute;
        z-index: 2;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transform: translateZ(0);
        transition: opacity 120ms ease-out;
        filter: drop-shadow(0 5px 12px rgb(12 32 48 / 18%));
      }
      ${CSS_TARGET}.is-video-active > .grcon-mascot-video {
        opacity: 1;
        visibility: visible;
      }
      ${CSS_TARGET}.is-video-active > .grcon-mascot-sprite {
        opacity: 0;
        visibility: hidden;
      }
      html[data-theme="dark"] .grcon-mascot-video {
        filter: drop-shadow(0 6px 15px rgb(0 0 0 / 38%));
      }
      .grcon-mascot-speech {
        position: fixed;
        z-index: 340;
        inset: 0 auto auto 0;
        max-inline-size: min(14rem, calc(100vw - 1rem));
        padding: .58rem .78rem;
        color: var(--text-1, #16212b);
        background: color-mix(in srgb, var(--surface-1, #fff) 96%, var(--brand-50, #f2f9fc));
        border: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
        border-radius: var(--radius-md, 13px);
        box-shadow: var(--shadow-1, 0 8px 24px rgb(12 32 48 / 10%));
        font: 690 .86rem/1.25 var(--font-sans, Inter, "Segoe UI", Arial, sans-serif);
        overflow-wrap: anywhere;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transform: translate3d(0, 5px, 0) scale(.965);
        transition: opacity 180ms ease, transform 220ms ease, visibility 0s linear 220ms;
      }
      .grcon-mascot-speech[data-visible="true"] {
        opacity: 1;
        visibility: visible;
        transform: translate3d(0, 0, 0) scale(1);
        transition-delay: 0s;
      }
      @media (prefers-reduced-motion: reduce) {
        .grcon-mascot-video { display: none !important; }
        ${CSS_TARGET}.is-video-active > .grcon-mascot-sprite { opacity: 1; visibility: visible; }
        .grcon-mascot-speech { transition: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function reducedMotion() {
    return Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function makeVideo(host) {
    let video = host.querySelector(":scope > .grcon-mascot-video");
    if (video) return video;
    video = document.createElement("video");
    video.className = "grcon-mascot-video";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.disablePictureInPicture = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("disableRemotePlayback", "");
    video.setAttribute("aria-hidden", "true");
    host.appendChild(video);
    return video;
  }

  function safePause(video) {
    try { video.pause(); } catch (_) { /* fallback PNG continua visível */ }
  }

  function hideVideo(record, resetTime) {
    record.token += 1;
    safePause(record.video);
    if (resetTime) {
      try { record.video.currentTime = 0; } catch (_) { /* mídia ainda sem metadata */ }
    }
    record.mode = "";
    record.host.classList.remove("is-video-active");
    record.host.dataset.grconMascotMedia = "png";
  }

  function revealVideo(record, token) {
    if (token !== record.token || !record.mode || document.hidden || reducedMotion()) return;
    record.host.classList.add("is-video-active");
    record.host.dataset.grconMascotMedia = record.mode;
  }

  function handleVideoFailure(record, mode, reason) {
    failedModes.add(mode);
    hideVideo(record, false);
    record.host.dataset.grconMascotFallback = mode;
    document.documentElement.dataset.grconMascotVideo = "fallback";
    if (!record.warnedModes.has(mode)) {
      record.warnedModes.add(mode);
      console.warn(`GRCON: vídeo ${mode} do mascote indisponível (${reason}); o PNG oficial permanece ativo.`);
    }
  }

  function startPlayback(record, token) {
    if (token !== record.token || !record.mode) return;
    const result = record.video.play();
    if (result?.catch) result.catch((error) => {
      if (token === record.token) handleVideoFailure(record, record.mode, error?.message || "reprodução bloqueada");
    });
  }

  function activateVideo(record, mode, loop) {
    if (!videoSupported || reducedMotion() || failedModes.has(mode)) {
      hideVideo(record, true);
      return false;
    }
    const source = ASSETS[mode];
    const token = ++record.token;
    record.mode = mode;
    record.video.loop = Boolean(loop);
    if (record.video.src !== source) {
      record.video.src = source;
      record.video.load();
    } else {
      try { record.video.currentTime = 0; } catch (_) { /* aguarda metadata */ }
    }
    if (record.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) revealVideo(record, token);
    startPlayback(record, token);
    return true;
  }

  function normalizeState(state) {
    return STATES.includes(state) ? state : "idle";
  }

  function stateForHost(host) {
    if (operationActive) return operationState || "analyzing";
    return "idle";
  }

  function applyContextPose(state) {
    const header = root.GRCONMascot;
    if (!header?.setState) return;
    if (state === "success") header.setState("success");
    else if (state === "warning" || state === "error") header.setState("warning");
    else if (state === "idle") header.clearState?.();
  }

  function playForRecord(record, requestedState, options) {
    const state = normalizeState(requestedState);
    record.state = state;
    record.host.dataset.grconMascotState = state;
    if (state === "welcome" || state === "hover") activateVideo(record, "wave", false);
    else if (PROCESSING_STATES.has(state)) activateVideo(record, "processing", true);
    else hideVideo(record, true);
    if (!options?.skipPose) applyContextPose(state);
    return state;
  }

  function currentIdentity() {
    const cloud = root.GrconCloud;
    if (cloud && typeof cloud.getCurrentUserIdentity === "function") return cloud.getCurrentUserIdentity() || {};
    const user = cloud?.state?.session?.user;
    const profile = user && cloud?.state?.profiles?.get?.(user.id);
    const metadata = user?.user_metadata || {};
    return {
      displayName: profile?.display_name || "",
      metadataName: metadata.full_name || metadata.name || metadata.display_name || "",
    };
  }

  function greetingText() {
    return CORE?.greeting?.(currentIdentity()) || "Olá!";
  }

  function ensureBubble() {
    if (bubble?.isConnected) return bubble;
    bubble = document.getElementById("grcon-mascot-greeting-bubble") || document.createElement("div");
    bubble.id = "grcon-mascot-greeting-bubble";
    bubble.className = "grcon-mascot-speech";
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubble.setAttribute("aria-hidden", "true");
    bubble.dataset.visible = "false";
    if (!bubble.isConnected) document.body.appendChild(bubble);
    return bubble;
  }

  function positionBubble(host) {
    const target = ensureBubble();
    if (!host?.isConnected) return;
    const hostRect = host.getBoundingClientRect();
    const bubbleRect = target.getBoundingClientRect();
    const gap = 10;
    const viewportWidth = document.documentElement.clientWidth || root.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || root.innerHeight;
    let left = hostRect.right + gap;
    let top = hostRect.top + (hostRect.height - bubbleRect.height) / 2;
    if (left + bubbleRect.width > viewportWidth - 8) left = hostRect.left - bubbleRect.width - gap;
    if (left < 8) left = Math.max(8, hostRect.left + (hostRect.width - bubbleRect.width) / 2);
    top = Math.max(8, Math.min(top, viewportHeight - bubbleRect.height - 8));
    target.style.left = `${Math.round(left)}px`;
    target.style.top = `${Math.round(top)}px`;
  }

  function showGreeting(host, pinned) {
    if (!host || (operationActive && !pinned)) return;
    const target = ensureBubble();
    target.textContent = greetingText();
    activeBubbleHost = host;
    if (pinned) pinnedBubbleHost = host;
    target.setAttribute("aria-hidden", "false");
    target.dataset.visible = "true";
    positionBubble(host);
  }

  function hideGreeting(force) {
    if (pinnedBubbleHost && !force) return;
    const target = ensureBubble();
    target.dataset.visible = "false";
    target.setAttribute("aria-hidden", "true");
    activeBubbleHost = null;
    if (force) pinnedBubbleHost = null;
  }

  function enhance(host) {
    if (!host || records.has(host)) return records.get(host);
    const video = makeVideo(host);
    const record = { host, video, state: "", mode: "", token: 0, warnedModes: new Set() };
    records.set(host, record);
    host.classList.add("grcon-mascot-video-host");
    host.setAttribute("tabindex", "0");
    host.setAttribute("role", "button");
    host.setAttribute("aria-haspopup", "true");

    const onReady = () => revealVideo(record, record.token);
    const onError = () => { if (record.mode) handleVideoFailure(record, record.mode, "falha de carregamento"); };
    const onEnded = () => {
      if (record.mode !== "wave" || operationActive) return;
      hideVideo(record, true);
      record.state = stateForHost(host);
      record.host.dataset.grconMascotState = record.state;
    };
    const enter = (event) => {
      if (event.pointerType === "touch" || operationActive) return;
      playForRecord(record, "hover", { source: "pointer" });
      showGreeting(host, false);
    };
    const leave = (event) => {
      if (event.pointerType === "touch" || operationActive) return;
      hideGreeting(false);
      playForRecord(record, stateForHost(host), { source: "pointer" });
    };
    const focus = () => {
      if (!operationActive) {
        playForRecord(record, "hover", { source: "focus" });
        showGreeting(host, false);
      }
    };
    const blur = () => {
      hideGreeting(false);
      if (!operationActive) playForRecord(record, stateForHost(host), { source: "blur" });
    };
    const click = (event) => {
      event.stopPropagation();
      if (pinnedBubbleHost === host) hideGreeting(true);
      else {
        showGreeting(host, true);
        if (!operationActive) playForRecord(record, "welcome", { source: "click" });
      }
    };
    const keydown = (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); click(event); }
      else if (event.key === "Escape") hideGreeting(true);
    };
    Object.assign(record, { onReady, onError, onEnded, enter, leave, focus, blur, click, keydown });
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focus", focus);
    host.addEventListener("blur", blur);
    host.addEventListener("click", click);
    host.addEventListener("keydown", keydown);
    playForRecord(record, stateForHost(host), { source: "enhance", skipPose: true });
    return record;
  }

  function dispose(record) {
    hideVideo(record, false);
    const { host, video } = record;
    video.removeEventListener("loadeddata", record.onReady);
    video.removeEventListener("canplay", record.onReady);
    video.removeEventListener("error", record.onError);
    video.removeEventListener("ended", record.onEnded);
    host.removeEventListener("pointerenter", record.enter);
    host.removeEventListener("pointerleave", record.leave);
    host.removeEventListener("focus", record.focus);
    host.removeEventListener("blur", record.blur);
    host.removeEventListener("click", record.click);
    host.removeEventListener("keydown", record.keydown);
    records.delete(host);
  }

  function refresh(scope) {
    const source = scope?.querySelectorAll ? scope : document;
    if (source.matches?.(SELECTOR)) enhance(source);
    source.querySelectorAll(SELECTOR).forEach(enhance);
    records.forEach((record) => {
      if (!record.host.isConnected) { dispose(record); return; }
      const desired = stateForHost(record.host);
      if (record.state !== desired && record.state !== "hover" && record.state !== "welcome") {
        playForRecord(record, desired, { source: "refresh", skipPose: true });
      }
    });
  }

  function play(state, options) {
    const normalized = normalizeState(state);
    const target = options?.target || "all";
    records.forEach((record) => {
      const contextual = record.host.classList.contains("grcon-mascot-context");
      if (target === "global" && contextual) return;
      if (target === "context" && !contextual) return;
      playForRecord(record, normalized, options);
    });
    return normalized;
  }

  function stop(target) {
    records.forEach((record) => {
      const contextual = record.host.classList.contains("grcon-mascot-context");
      if (target === "global" && contextual) return;
      if (target === "context" && !contextual) return;
      hideVideo(record, true);
      record.state = "stopped";
      record.host.dataset.grconMascotState = "stopped";
    });
  }

  function mapTask(task, explicitState) {
    if (STATES.includes(explicitState)) return explicitState;
    const value = String(task || "").toLocaleLowerCase("pt-BR");
    if (/sigem|projectwise|\bpw\b/.test(value)) return "sigem-pw-analysis";
    if (/egrdt|grdt/.test(value)) return "generating-grdt";
    if (/\bld\b|document|analis|confer/.test(value)) return "searching-files";
    if (/upload|import|base/.test(value)) return "uploading";
    return "loading";
  }

  function beginOperation(detail) {
    root.clearTimeout(transientTimer);
    root.clearTimeout(pulseTimer);
    operationActive = true;
    pendingOutcome = "";
    operationState = mapTask(detail?.task, detail?.state);
    hideGreeting(true);
    records.forEach((record) => record.host.setAttribute("aria-busy", "true"));
    play(operationState, { source: "operation", hold: true });
  }

  function endOperation(detail) {
    operationActive = false;
    const outcome = detail?.outcome || pendingOutcome;
    pendingOutcome = "";
    operationState = "";
    records.forEach((record) => record.host.removeAttribute("aria-busy"));
    if (outcome === "error") play("error", { source: "operation-end" });
    else if (outcome === "warning") play("warning", { source: "operation-end" });
    else if (outcome === "success") play("success", { source: "operation-end" });
    else play("idle", { source: "operation-end" });
    if (outcome) {
      root.clearTimeout(transientTimer);
      transientTimer = root.setTimeout(() => { if (!operationActive) play("idle", { source: "outcome-end" }); }, 2300);
    }
  }

  function handleOperation(event) {
    const detail = event?.detail || {};
    if (detail.active) beginOperation(detail);
    else endOperation(detail);
  }

  function handleNotification(event) {
    const kind = event?.detail?.kind;
    if (!kind || kind === "info") return;
    const state = kind === "error" ? "error" : kind === "success" ? "success" : "warning";
    if (operationActive) pendingOutcome = state;
    else {
      play(state, { source: "notification" });
      root.clearTimeout(transientTimer);
      transientTimer = root.setTimeout(() => { if (!operationActive) play("idle", { source: "notification-end" }); }, 2300);
    }
  }

  function handlePulse(event) {
    const duration = Math.min(3000, Math.max(700, Number(event?.detail?.duration) || 1100));
    root.clearTimeout(pulseTimer);
    if (!operationActive) play(mapTask(event?.detail?.task, event?.detail?.state), { source: "pulse" });
    pulseTimer = root.setTimeout(() => { if (!operationActive) play("idle", { source: "pulse-end" }); }, duration);
  }

  function maybeWelcome() {
    if (welcomeShown || operationActive) return;
    const name = CORE?.resolveFirstName?.(currentIdentity());
    if (!name) return;
    const host = document.querySelector(".grcon-brand-mascot");
    const record = records.get(host);
    if (!host || !record) return;
    welcomeShown = true;
    showGreeting(host, false);
    playForRecord(record, "welcome", { source: "welcome" });
    root.clearTimeout(welcomeTimer);
    welcomeTimer = root.setTimeout(() => {
      if (activeBubbleHost === host && !pinnedBubbleHost) hideGreeting(false);
    }, 3200);
  }

  function resumeVisibleVideos() {
    records.forEach((record) => {
      if (!record.mode) return;
      if (document.hidden) safePause(record.video);
      else {
        revealVideo(record, record.token);
        startPlayback(record, record.token);
      }
    });
  }

  function init() {
    installStyles();
    initialized = true;
    document.documentElement.dataset.grconMascotEngine = videoSupported ? ENGINE : "official-png-static-fallback";
    document.documentElement.dataset.grconMascotVideo = videoSupported ? "ready" : "unsupported";
    if (!videoSupported) console.warn("GRCON: WebM/VP9 indisponível; o PNG oficial permanece ativo.");
    ensureBubble();
    refresh(document);
    if (document.documentElement.dataset.grconControlProcessing === "true") {
      beginOperation({ task: "Análise documental" });
    }
    maybeWelcome();
    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === "childList" || mutation.type === "attributes")) {
        root.requestAnimationFrame(() => refresh(document));
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-pose", "data-context", "hidden", "aria-hidden"],
    });
    root.addEventListener("grcon:processing-state", handleOperation);
    root.addEventListener("grcon:mascot-operation", handleOperation);
    root.addEventListener("grcon:processing-pulse", handlePulse);
    root.addEventListener("grcon:notification", handleNotification);
    root.addEventListener("grcon:cloud-ready", maybeWelcome);
    root.addEventListener("grcon:identity-changed", maybeWelcome);
    document.addEventListener("pointerdown", (event) => {
      if (pinnedBubbleHost && !pinnedBubbleHost.contains(event.target)) hideGreeting(true);
    }, true);
    document.addEventListener("visibilitychange", resumeVisibleVideos);
    root.addEventListener("resize", () => { if (activeBubbleHost) positionBubble(activeBubbleHost); }, { passive: true });
    root.addEventListener("scroll", () => { if (activeBubbleHost) positionBubble(activeBubbleHost); }, { passive: true, capture: true });
    root.addEventListener("pagehide", () => {
      observer?.disconnect();
      root.clearTimeout(pulseTimer);
      root.clearTimeout(transientTimer);
      root.clearTimeout(welcomeTimer);
      records.forEach(dispose);
    }, { once: true });
  }

  function diagnostics() {
    return Object.freeze({
      version: VERSION,
      engine: document.documentElement.dataset.grconMascotEngine || "official-png-static-fallback",
      ready: initialized,
      videoSupported,
      fallback: !videoSupported || failedModes.size > 0,
      failedModes: Array.from(failedModes),
      instances: records.size,
      activeVideos: Array.from(records.values()).filter((record) => record.host.classList.contains("is-video-active")).length,
      states: Array.from(records.values()).map((record) => record.state),
      operationActive,
      operationState,
      reducedMotion: reducedMotion(),
      source: "official-transparent-webm-with-png-fallback",
    });
  }

  root.GrconMascot = Object.freeze({
    version: VERSION,
    states: STATES,
    play,
    setState: play,
    stop,
    reset: () => play("idle", { source: "reset" }),
    refresh: () => refresh(document),
    begin: (state, task) => beginOperation({ state, task }),
    finish: (outcome) => endOperation({ outcome }),
    showGreeting: (host) => showGreeting(host || document.querySelector(SELECTOR), true),
    hideGreeting: () => hideGreeting(true),
    diagnostics,
  });
  root.GRCONMascotGreeting = Object.freeze({
    version: VERSION,
    refresh: () => refresh(document),
    open: (host) => showGreeting(host || document.querySelector(SELECTOR), true),
    close: () => hideGreeting(true),
    greetingText,
    setProcessing: (active) => handleOperation({ detail: { active, task: "Análise documental" } }),
    pulseProcessing: (duration) => handlePulse({ detail: { duration } }),
    diagnostics,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
