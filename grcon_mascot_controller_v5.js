/* GRCON — Mascote da Qualidade v5: WebM/VP9 -> H.264/MP4 -> PNG.
 * Reprodução real é a fonte de verdade; canPlayType serve apenas ao diagnóstico.
 */
(function (root) {
  "use strict";

  const VERSION = "5.0.0";
  const ENGINE = "official-video-v5-multiformat";
  const ASSET_REVISION = "20260916.3";
  const EXPECTED_SW_REVISION = "20260916.3-mascot-multiformat";
  const EXPECTED_CACHE = "grcon-v5.40.11-mascot-multiformat-v2";
  const SELECTOR = ".grcon-brand-mascot, .grcon-mascot-context";
  const SESSION_PREFIX = "grcon:mascot:greeting:v5:";
  const PREF_KEY = "grcon:mascot:animations:v5";
  const CORE = root.GRCONMascotGreetingCore;
  const records = new Map();
  const mediaFailures = Object.create(null);
  const environment = { oldServiceWorker: false, oldCaches: [], cacheNames: [], controller: "" };
  let operationActive = false;
  let currentOperationState = "idle";
  let lastIdentityKey = "";
  let authWasLocked = document.documentElement.classList.contains("grcon-cloud-pending");
  let compatPromise = null;
  let settingsObserver = null;

  const PROCESSING_STATES = new Set([
    "analyzing", "searching-files", "checking-document", "confused", "uploading",
    "generating-grdt", "checking-ld", "sigem-pw-analysis", "loading",
  ]);
  const WAVE_STATES = new Set(["welcome", "hover"]);
  const STATIC_STATES = new Set(["idle", "success", "warning", "error"]);
  const requiredStates = [
    "idle", "welcome", "hover", "analyzing", "searching-files", "checking-document",
    "confused", "success", "warning", "error", "uploading", "generating-grdt",
    "checking-ld", "sigem-pw-analysis", "loading",
  ];

  const MASCOT_ANIMATIONS = Object.freeze({
    wave: Object.freeze({
      loop: false,
      primary: `assets/mascot/video/grcon-mascot-wave-alpha.webm?v=${ASSET_REVISION}`,
      compat: "wave",
      webmType: 'video/webm; codecs="vp9"',
      mp4Type: 'video/mp4; codecs="avc1.42E01E"',
    }),
    processing: Object.freeze({
      loop: true,
      primary: `assets/mascot/video/grcon-mascot-processing-alpha.webm?v=${ASSET_REVISION}`,
      compat: "processing",
      webmType: 'video/webm; codecs="vp9"',
      mp4Type: 'video/mp4; codecs="avc1.42E01E"',
    }),
  });

  function safeStorage(storage, method, key, value) {
    try { return storage?.[method]?.(key, value); } catch (_) { return null; }
  }

  function explicitPreference() {
    const value = safeStorage(root.localStorage, "getItem", PREF_KEY);
    return value === "on" || value === "off" ? value : "system";
  }

  function systemReducedMotion() {
    try { return Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches); }
    catch (_) { return false; }
  }

  function motionPolicy() {
    const explicit = explicitPreference();
    const systemReduced = systemReducedMotion();
    const enabled = explicit === "on" || (explicit === "system" && !systemReduced);
    return { explicit, systemReduced, enabled, reason: enabled ? "ENABLED" : (explicit === "off" ? "USER_DISABLED" : "REDUCED_MOTION") };
  }

  function applyMotionPolicy() {
    const policy = motionPolicy();
    document.documentElement.dataset.grconMascotMotion = policy.enabled ? "on" : "off";
    document.documentElement.dataset.grconMascotMotionSource = policy.explicit;
    return policy;
  }

  function setPreference(value) {
    if (value === "system") safeStorage(root.localStorage, "removeItem", PREF_KEY);
    else if (value === "on" || value === "off") safeStorage(root.localStorage, "setItem", PREF_KEY, value);
    const policy = applyMotionPolicy();
    document.querySelectorAll("[data-grcon-mascot-motion-select]").forEach((select) => { select.value = explicitPreference(); });
    if (!policy.enabled) stopAll("motion-disabled");
    root.dispatchEvent(new CustomEvent("grcon:mascot-motion-changed", { detail: policy }));
    return policy;
  }

  function installStyle() {
    if (document.getElementById("grcon-mascot-video-v5-style")) return;
    const style = document.createElement("style");
    style.id = "grcon-mascot-video-v5-style";
    style.textContent = `
      ${SELECTOR}{position:relative;isolation:isolate}
      ${SELECTOR}>.grcon-mascot-video-v5,${SELECTOR}>.grcon-mascot-canvas-v5{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;opacity:0;visibility:hidden;pointer-events:none;background:transparent;border:0}
      ${SELECTOR}.is-video-active>.grcon-mascot-video-v5,${SELECTOR}.is-compat-active>.grcon-mascot-canvas-v5{opacity:1;visibility:visible}
      ${SELECTOR}.is-video-active>.grcon-mascot-sprite,${SELECTOR}.is-compat-active>.grcon-mascot-sprite{opacity:0!important;visibility:hidden!important}
      html[data-grcon-mascot-motion="off"] ${SELECTOR}>.grcon-mascot-video-v5,html[data-grcon-mascot-motion="off"] ${SELECTOR}>.grcon-mascot-canvas-v5{display:none!important}
      @media (prefers-reduced-motion:reduce){${SELECTOR},${SELECTOR} *{transition-duration:.01ms!important;animation-duration:.01ms!important}}
      .grcon-mascot-motion-setting{display:grid;gap:6px;margin-top:12px;padding:12px;border:1px solid var(--border,#d7dde7);border-radius:10px;background:var(--surface,#fff)}
      .grcon-mascot-motion-setting label{font-weight:700}.grcon-mascot-motion-setting small{opacity:.72;line-height:1.35}
      .grcon-mascot-motion-setting select{max-width:320px;padding:8px 10px;border:1px solid var(--border,#cbd3df);border-radius:8px;background:var(--surface,#fff);color:inherit}
    `;
    document.head.appendChild(style);
  }

  function injectSetting() {
    if (document.querySelector("[data-grcon-mascot-motion-setting]")) return true;
    const panel = document.getElementById("advanced-panel");
    if (!panel) return false;
    const wrap = document.createElement("div");
    wrap.className = "grcon-mascot-motion-setting";
    wrap.dataset.grconMascotMotionSetting = "true";
    wrap.innerHTML = `<label for="grcon-mascot-motion-select">Animações do mascote</label><select id="grcon-mascot-motion-select" data-grcon-mascot-motion-select><option value="system">Seguir acessibilidade do sistema</option><option value="on">Ativadas</option><option value="off">Desativadas</option></select><small>Se você escolher Ativadas ou Desativadas, essa decisão prevalece sobre a preferência automática de movimento reduzido deste dispositivo.</small>`;
    const select = wrap.querySelector("select");
    select.value = explicitPreference();
    select.addEventListener("change", () => setPreference(select.value));
    panel.appendChild(wrap);
    return true;
  }

  function ensureSettings() {
    if (injectSetting() || settingsObserver) return;
    settingsObserver = new MutationObserver(() => { if (injectSetting()) { settingsObserver.disconnect(); settingsObserver = null; } });
    settingsObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function failure(code, extra) {
    mediaFailures[code] = (mediaFailures[code] || 0) + 1;
    return { code, at: Date.now(), ...(extra || {}) };
  }

  function classifyPlayError(error) {
    if (error?.name === "NotAllowedError") return "AUTOPLAY_BLOCKED";
    if (error?.name === "NotSupportedError") return "CODEC_UNSUPPORTED";
    if (error?.name === "AbortError") return "MEDIA_ERR_ABORTED";
    return "UNKNOWN_MEDIA_ERROR";
  }

  function classifyMediaError(mediaError) {
    const code = Number(mediaError?.code || 0);
    if (code === 1) return "MEDIA_ERR_ABORTED";
    if (code === 2) return "NETWORK_BLOCKED";
    if (code === 3) return "MEDIA_DECODE_ERROR";
    if (code === 4) return "CODEC_UNSUPPORTED";
    return "UNKNOWN_MEDIA_ERROR";
  }

  async function refineSourceFailure(url, fallbackCode) {
    if (!url || url.startsWith("blob:")) return fallbackCode;
    try {
      const response = await fetch(url, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
      if (response.status === 404) return "VIDEO_NOT_FOUND";
      if (!response.ok) return "NETWORK_BLOCKED";
    } catch (_) { return "NETWORK_BLOCKED"; }
    return fallbackCode;
  }

  function ensureCompatMedia() {
    if (root.GRCONMascotCompatMedia) return Promise.resolve(root.GRCONMascotCompatMedia);
    if (compatPromise) return compatPromise;
    compatPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-grcon-mascot-compat="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(root.GRCONMascotCompatMedia), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = `grcon_mascot_compat_media.js?v=${ASSET_REVISION}`;
      script.async = false;
      script.dataset.grconMascotCompat = "true";
      script.addEventListener("load", () => root.GRCONMascotCompatMedia ? resolve(root.GRCONMascotCompatMedia) : reject(new Error("compat-api-missing")), { once: true });
      script.addEventListener("error", () => reject(new Error("compat-script-load-failed")), { once: true });
      document.head.appendChild(script);
    }).finally(() => { compatPromise = null; });
    return compatPromise;
  }

  function makeVideo() {
    const video = document.createElement("video");
    video.className = "grcon-mascot-video-v5";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.preload = "metadata";
    video.disablePictureInPicture = true;
    video.setAttribute("aria-hidden", "true");
    return video;
  }

  function makeCanvas() {
    const canvas = document.createElement("canvas");
    canvas.className = "grcon-mascot-canvas-v5";
    canvas.setAttribute("aria-hidden", "true");
    return canvas;
  }

  function hideMedia(record, reason) {
    clearTimeout(record.timeout);
    record.timeout = null;
    record.renderToken += 1;
    record.video.pause();
    record.video.removeAttribute("src");
    record.video.load();
    record.host.classList.remove("is-video-active", "is-compat-active");
    record.host.dataset.grconMascotMedia = reason || "png";
    record.format = "png";
  }

  function startChromaRenderer(record, token) {
    const video = record.video;
    const canvas = record.canvas;
    const width = video.videoWidth || 128;
    const height = video.videoHeight || 128;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas-context-unavailable");
    const renderToken = ++record.renderToken;
    const frame = () => {
      if (token !== record.token || renderToken !== record.renderToken || record.format !== "mp4") return;
      try {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(video, 0, 0, width, height);
        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (r > 150 && b > 100 && g < 145 && r - g > 55 && b - g > 30) data[i + 3] = 0;
        }
        ctx.putImageData(image, 0, 0);
      } catch (error) {
        record.lastError = failure("COMPAT_RENDER_ERROR", { message: String(error?.message || error) });
        hideMedia(record, "png-render-fallback");
        return;
      }
      if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(frame);
      else root.requestAnimationFrame(frame);
    };
    frame();
  }

  function animationForState(state) {
    if (WAVE_STATES.has(state)) return "wave";
    if (PROCESSING_STATES.has(state)) return "processing";
    return null;
  }

  function setHostState(record, state) {
    record.state = requiredStates.includes(state) ? state : "idle";
    record.host.dataset.grconMascotState = record.state;
  }

  async function attempt(record, animationName, sourceIndex, token) {
    if (token !== record.token) return;
    const animation = MASCOT_ANIMATIONS[animationName];
    let src = animation.primary;
    let format = "webm";
    if (sourceIndex === 1) {
      format = "mp4";
      try {
        const compat = await ensureCompatMedia();
        src = await compat.getUrl(animation.compat);
      } catch (error) {
        record.lastError = failure("VIDEO_NOT_FOUND", { format: "mp4", message: String(error?.message || error) });
        hideMedia(record, "png-compat-unavailable");
        return;
      }
    } else if (sourceIndex > 1) {
      hideMedia(record, "png-final-fallback");
      return;
    }
    if (token !== record.token) return;

    record.attempt = sourceIndex;
    record.format = format;
    record.host.dataset.grconMascotAttempt = format;
    const video = record.video;
    video.loop = animation.loop;
    video.preload = sourceIndex === 0 ? "auto" : "metadata";
    video.onerror = async () => {
      if (token !== record.token) return;
      const raw = classifyMediaError(video.error);
      const code = await refineSourceFailure(src, raw);
      if (token !== record.token) return;
      record.lastError = failure(code, { format, mediaCode: video.error?.code || 0 });
      if (format === "webm") attempt(record, animationName, 1, token);
      else hideMedia(record, "png-media-error");
    };
    video.onabort = () => {
      if (token !== record.token) return;
      record.lastError = failure("MEDIA_ERR_ABORTED", { format });
    };
    video.onstalled = () => { record.lastSignal = "stalled"; };
    video.onwaiting = () => { record.lastSignal = "waiting"; };
    video.onloadedmetadata = () => { record.lastSignal = "loadedmetadata"; };
    video.onloadeddata = () => { record.lastSignal = "loadeddata"; };
    video.oncanplay = () => { record.lastSignal = "canplay"; };
    video.onplaying = () => {
      if (token !== record.token) return;
      clearTimeout(record.timeout);
      record.timeout = null;
      record.lastSignal = "playing";
      record.lastError = null;
      record.host.classList.toggle("is-video-active", format === "webm");
      record.host.classList.toggle("is-compat-active", format === "mp4");
      record.host.dataset.grconMascotMedia = `${animationName}:${format}`;
      if (format === "mp4") startChromaRenderer(record, token);
    };
    video.onended = () => {
      if (token !== record.token || video.loop || operationActive) return;
      hideMedia(record, "png-ended");
      setHostState(record, "idle");
    };

    record.host.classList.remove("is-video-active", "is-compat-active");
    video.src = src;
    try { video.currentTime = 0; } catch (_) {}
    record.timeout = root.setTimeout(() => {
      if (token !== record.token || record.lastSignal === "playing") return;
      record.lastError = failure("PLAY_TIMEOUT", { format, signal: record.lastSignal || "none" });
      if (format === "webm") attempt(record, animationName, 1, token);
      else hideMedia(record, "png-timeout");
    }, 5000);

    let result;
    try { result = video.play(); }
    catch (error) {
      const code = classifyPlayError(error);
      record.lastError = failure(code, { format });
      if (code === "AUTOPLAY_BLOCKED") hideMedia(record, "png-autoplay-blocked");
      else if (format === "webm") attempt(record, animationName, 1, token);
      else hideMedia(record, "png-play-failed");
      return;
    }
    result?.catch?.((error) => {
      if (token !== record.token) return;
      const code = classifyPlayError(error);
      record.lastError = failure(code, { format });
      if (code === "AUTOPLAY_BLOCKED") hideMedia(record, "png-autoplay-blocked");
      else if (format === "webm") attempt(record, animationName, 1, token);
      else hideMedia(record, "png-play-failed");
    });
  }

  function playRecord(record, state) {
    setHostState(record, state);
    record.token += 1;
    const token = record.token;
    const policy = applyMotionPolicy();
    const animationName = animationForState(state);
    if (!policy.enabled || !animationName) {
      if (!policy.enabled) record.lastError = policy.reason === "REDUCED_MOTION" ? failure("REDUCED_MOTION") : null;
      hideMedia(record, policy.reason === "REDUCED_MOTION" ? "png-reduced-motion" : "png-static-state");
      return;
    }
    record.lastSignal = "starting";
    attempt(record, animationName, 0, token);
  }

  function initHost(host) {
    if (records.has(host)) return records.get(host);
    const video = makeVideo();
    const canvas = makeCanvas();
    host.appendChild(video);
    host.appendChild(canvas);
    const record = { host, video, canvas, state: "idle", token: 0, renderToken: 0, timeout: null, attempt: -1, format: "png", lastError: null, lastSignal: "idle" };
    records.set(host, record);
    host.dataset.grconMascotMedia = "png";
    host.addEventListener("mouseenter", () => { if (!operationActive) playRecord(record, "hover"); });
    host.addEventListener("focusin", () => { if (!operationActive) playRecord(record, "hover"); });
    return record;
  }

  function discoverHosts() {
    document.querySelectorAll(SELECTOR).forEach(initHost);
  }

  function play(state) {
    discoverHosts();
    if (operationActive && (state === "welcome" || state === "hover")) return false;
    records.forEach((record) => playRecord(record, state));
    return true;
  }

  function stopAll(reason) {
    records.forEach((record) => { record.token += 1; hideMedia(record, reason || "png-stopped"); });
  }

  function reset() {
    operationActive = false;
    currentOperationState = "idle";
    records.forEach((record) => { record.token += 1; setHostState(record, "idle"); hideMedia(record, "png-reset"); });
  }

  function handleOperation(event) {
    const detail = event?.detail || {};
    if (detail.active) {
      operationActive = true;
      currentOperationState = PROCESSING_STATES.has(detail.state) ? detail.state : "searching-files";
      play(currentOperationState);
    } else {
      operationActive = false;
      currentOperationState = "idle";
      play("idle");
    }
  }

  function handlePulse() {
    if (operationActive) return;
    play("searching-files");
    root.setTimeout(() => { if (!operationActive) play("idle"); }, 1800);
  }

  function handleNotification(event) {
    if (operationActive) return;
    const kind = String(event?.detail?.kind || "").toLowerCase();
    if (["success", "warning", "error"].includes(kind)) play(kind);
  }

  function identity() {
    try { return root.GrconCloud?.getCurrentUserIdentity?.() || null; } catch (_) { return null; }
  }

  function identityKey(value) {
    const source = value || {};
    return String(source.userId || source.id || source.email || root.GrconCloud?.state?.session?.user?.id || "anonymous").toLowerCase();
  }

  function greetingKey(value) { return `${SESSION_PREFIX}${identityKey(value)}`; }
  function greetingAlreadyPlayed(value) { return safeStorage(root.sessionStorage, "getItem", greetingKey(value)) === "1"; }
  function markGreetingPlayed(value) { safeStorage(root.sessionStorage, "setItem", greetingKey(value), "1"); }
  function clearGreetingFor(value) { safeStorage(root.sessionStorage, "removeItem", greetingKey(value)); }

  function showGreeting(text) {
    let bubble = document.getElementById("grcon-mascot-greeting-bubble");
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.id = "grcon-mascot-greeting-bubble";
      bubble.setAttribute("role", "status");
      const host = document.querySelector(".grcon-brand-mascot");
      host?.parentElement?.appendChild(bubble);
    }
    if (bubble) {
      bubble.textContent = text;
      bubble.hidden = false;
      root.setTimeout(() => { bubble.hidden = true; }, 4200);
    }
  }

  function maybeWelcome() {
    if (document.documentElement.classList.contains("grcon-cloud-pending") || operationActive) return false;
    const current = identity();
    const key = identityKey(current);
    lastIdentityKey = key;
    if (greetingAlreadyPlayed(current)) return false;
    markGreetingPlayed(current);
    showGreeting(CORE?.greeting?.(current) || "Olá!");
    play("welcome");
    return true;
  }

  function observeAuthLockState() {
    const observer = new MutationObserver(() => {
      const locked = document.documentElement.classList.contains("grcon-cloud-pending");
      if (!authWasLocked && locked && lastIdentityKey) clearGreetingFor({ userId: lastIdentityKey });
      authWasLocked = locked;
      if (!locked) maybeWelcome();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return observer;
  }

  async function refreshEnvironmentDiagnostics() {
    environment.controller = navigator.serviceWorker?.controller?.scriptURL || "";
    environment.oldServiceWorker = Boolean(root.GRCON_SW_REVISION && root.GRCON_SW_REVISION !== EXPECTED_SW_REVISION);
    try {
      const names = await caches.keys();
      environment.cacheNames = names.filter((name) => name.startsWith("grcon-"));
      environment.oldCaches = environment.cacheNames.filter((name) => name !== EXPECTED_CACHE);
    } catch (_) {}
  }

  function diagnostics() {
    const probe = document.createElement("video");
    const policy = motionPolicy();
    return {
      version: VERSION, engine: ENGINE, assetRevision: ASSET_REVISION, ready: true,
      states: [...new Set([...records.values()].map((record) => record.state))],
      instances: records.size,
      activeVideos: [...records.values()].filter((record) => !record.video.paused && record.video.currentSrc).length,
      formats: [...records.values()].map((record) => record.format),
      records: [...records.values()].map((record) => ({ state: record.state, format: record.format, attempt: record.attempt, media: record.host.dataset.grconMascotMedia, signal: record.lastSignal, lastError: record.lastError })),
      assets: { wave: MASCOT_ANIMATIONS.wave.primary, processing: MASCOT_ANIMATIONS.processing.primary, compat: "H.264/MP4 local lazy Blob" },
      reportedSupport: { webmVp9: probe.canPlayType(MASCOT_ANIMATIONS.wave.webmType), mp4H264: probe.canPlayType(MASCOT_ANIMATIONS.wave.mp4Type) },
      reducedMotion: policy.systemReduced, userPreference: policy.explicit, animationsEnabled: policy.enabled,
      appLocked: document.documentElement.classList.contains("grcon-cloud-pending"),
      greetingPlayedThisSession: greetingAlreadyPlayed(identity()), operationActive, currentOperationState,
      failures: { ...mediaFailures }, serviceWorker: { expectedRevision: EXPECTED_SW_REVISION, expectedCache: EXPECTED_CACHE, ...environment },
      userAgent: navigator.userAgent,
    };
  }

  function init() {
    installStyle();
    applyMotionPolicy();
    discoverHosts();
    ensureSettings();
    observeAuthLockState();
    refreshEnvironmentDiagnostics();
    const hostObserver = new MutationObserver(discoverHosts);
    hostObserver.observe(document.documentElement, { childList: true, subtree: true });
    root.addEventListener("grcon:processing-state", handleOperation);
    root.addEventListener("grcon:mascot-operation", handleOperation);
    root.addEventListener("grcon:processing-pulse", handlePulse);
    root.addEventListener("grcon:notification", handleNotification);
    root.addEventListener("grcon:cloud-ready", maybeWelcome);
    root.addEventListener("grcon:identity-changed", maybeWelcome);
    root.addEventListener("grcon:sw-updated", refreshEnvironmentDiagnostics);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopAll("png-hidden-tab"); else if (operationActive) play(currentOperationState); });
    root.addEventListener("pagehide", () => { stopAll("pagehide"); hostObserver.disconnect(); settingsObserver?.disconnect(); }, { once: true });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", maybeWelcome, { once: true });
    else root.setTimeout(maybeWelcome, 0);
  }

  root.GrconMascot = Object.freeze({
    version: VERSION, engine: ENGINE, play, stop: stopAll, reset, diagnostics,
    setAnimations: (enabled) => setPreference(enabled === true ? "on" : enabled === false ? "off" : "system"),
    getAnimationsPreference: explicitPreference,
  });
  init();
})(window);
