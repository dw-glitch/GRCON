/* GRCON — Mascote da Qualidade v4: vídeos locais versionados, saudação por sessão e prioridade operacional. */
(function (root) {
  "use strict";

  const VERSION = "4.3.0";
  const ENGINE = "official-video-v4";
  const ASSET_REVISION = "20260921.1";
  const STYLE_ID = "grcon-mascot-video-v4-style";
  const SELECTOR = ".grcon-brand-mascot";
  const CSS_TARGET = ".grcon-brand-mascot";
  const SESSION_PREFIX = "grcon:mascot:greeting:v4:";
  const CORE = root.GRCONMascotGreetingCore;
  const DEBUG = new URLSearchParams(root.location.search).get("grconMascotDebug") === "1"
    || root.sessionStorage?.getItem("grcon:mascot:debug") === "1";

  const absoluteAsset = (path) => {
    const url = new URL(path.replace(/^\/+/, ""), `${root.location.origin}/`);
    url.searchParams.set("v", ASSET_REVISION);
    return url.href;
  };

  const MASCOT_ANIMATIONS = Object.freeze({
    greeting: Object.freeze({
      mode: "wave",
      url: absoluteAsset("assets/mascot/video/grcon-mascot-wave-alpha.webm"),
      type: 'video/webm; codecs="vp9"',
      loop: false,
    }),
    analysing: Object.freeze({
      mode: "processing",
      url: absoluteAsset("assets/mascot/video/grcon-mascot-processing-alpha.webm"),
      type: 'video/webm; codecs="vp9"',
      loop: true,
    }),
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
  const preloaders = new Map();
  const diagnosticsLog = [];
  let observer = null;
  let htmlObserver = null;
  let initialized = false;
  let operationActive = false;
  let operationState = "";
  let pendingOutcome = "";
  let transientTimer = 0;
  let pulseTimer = 0;
  let greetingTimer = 0;
  let bubble = null;
  let activeBubbleHost = null;
  let pinnedBubbleHost = null;
  let lastUserId = "";
  let welcomeShown = false;
  let wasAppLocked = document.documentElement.classList.contains("grcon-cloud-pending");

  function log(event, detail) {
    const entry = { time: new Date().toISOString(), event, ...(detail || {}) };
    diagnosticsLog.push(entry);
    if (diagnosticsLog.length > 40) diagnosticsLog.shift();
    if (DEBUG) console.debug("GRCON Mascot:", event, detail || "");
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      ${CSS_TARGET}.grcon-mascot-video-host{pointer-events:auto;overflow:visible;isolation:isolate;touch-action:manipulation}
      .grcon-mascot-video{position:absolute;z-index:2;inset:0;width:100%;height:100%;display:block;object-fit:contain;pointer-events:none;opacity:0;visibility:hidden;transform:translateZ(0);transition:opacity 120ms ease-out;filter:drop-shadow(0 5px 12px rgb(12 32 48 / 18%))}
      ${CSS_TARGET}.is-video-active>.grcon-mascot-video{opacity:1;visibility:visible}
      ${CSS_TARGET}.is-video-active>.grcon-mascot-sprite{opacity:0;visibility:hidden}
      html[data-theme="dark"] .grcon-mascot-video{filter:drop-shadow(0 6px 15px rgb(0 0 0 / 38%))}
      .grcon-mascot-speech{position:fixed;z-index:340;inset:0 auto auto 0;max-inline-size:min(14rem,calc(100vw - 1rem));padding:.58rem .78rem;color:var(--text-1,#16212b);background:color-mix(in srgb,var(--surface-1,#fff) 96%,var(--brand-50,#f2f9fc));border:1px solid color-mix(in srgb,var(--brand-700,#0c648f) 22%,var(--border-1,#d8e1e7));border-radius:var(--radius-md,13px);box-shadow:var(--shadow-1,0 8px 24px rgb(12 32 48 / 10%));font:690 .86rem/1.25 var(--font-sans,Inter,"Segoe UI",Arial,sans-serif);overflow-wrap:anywhere;pointer-events:none;opacity:0;visibility:hidden;transform:translate3d(0,5px,0) scale(.965);transition:opacity 180ms ease,transform 220ms ease,visibility 0s linear 220ms}
      .grcon-mascot-speech[data-visible="true"]{opacity:1;visibility:visible;transform:translate3d(0,0,0) scale(1);transition-delay:0s}
      @media (prefers-reduced-motion:reduce){.grcon-mascot-video{display:none!important}${CSS_TARGET}.is-video-active>.grcon-mascot-sprite{opacity:1;visibility:visible}.grcon-mascot-speech{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function reducedMotion() {
    return Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function currentIdentity() {
    const cloud = root.GrconCloud;
    if (cloud && typeof cloud.getCurrentUserIdentity === "function") {
      const identity = cloud.getCurrentUserIdentity() || {};
      const user = cloud?.state?.session?.user;
      return { ...identity, userId: identity.userId || user?.id || "", email: identity.email || user?.email || "" };
    }
    const user = cloud?.state?.session?.user;
    const profile = user && cloud?.state?.profiles?.get?.(user.id);
    const metadata = user?.user_metadata || {};
    return {
      userId: user?.id || "",
      email: user?.email || "",
      displayName: profile?.display_name || "",
      metadataName: metadata.full_name || metadata.name || metadata.display_name || "",
    };
  }

  function resolveFirstName(identity) {
    if (CORE?.resolveFirstName) return CORE.resolveFirstName(identity);
    const raw = identity?.displayName || identity?.profileName || identity?.metadataName || identity?.fullName || identity?.name || "";
    return String(raw).trim().split(/\s+/)[0] || "";
  }

  function greetingText() {
    const identity = currentIdentity();
    if (CORE?.greeting) return CORE.greeting(identity);
    const name = resolveFirstName(identity);
    return name ? `Olá, ${name}!` : "Olá!";
  }

  function sessionKey(userId) {
    return userId ? `${SESSION_PREFIX}${userId}` : "";
  }

  function greetingAlreadyPlayed(userId) {
    const key = sessionKey(userId);
    if (!key) return false;
    try { return root.sessionStorage.getItem(key) === ASSET_REVISION; } catch (_) { return welcomeShown; }
  }

  function markGreetingPlayed(userId) {
    const key = sessionKey(userId);
    welcomeShown = true;
    if (!key) return;
    try { root.sessionStorage.setItem(key, ASSET_REVISION); } catch (_) { /* memória da página continua protegendo contra repetição */ }
  }

  function clearGreetingFor(userId) {
    const key = sessionKey(userId);
    if (key) {
      try { root.sessionStorage.removeItem(key); } catch (_) { /* sem storage: usa memória */ }
    }
    welcomeShown = false;
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
    if (!host || operationActive) return;
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

  function makeVideo(host) {
    let video = host.querySelector(":scope > .grcon-mascot-video");
    if (video) return video;
    video = document.createElement("video");
    video.className = "grcon-mascot-video";
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "auto");
    video.setAttribute("disableRemotePlayback", "");
    video.setAttribute("aria-hidden", "true");
    host.appendChild(video);
    return video;
  }

  function safePause(video) {
    try { video.pause(); } catch (_) { /* PNG continua visível */ }
  }

  function clearLoadTimer(record) {
    if (record.loadTimer) root.clearTimeout(record.loadTimer);
    record.loadTimer = 0;
  }

  function hideVideo(record, resetTime) {
    clearLoadTimer(record);
    record.token += 1;
    safePause(record.video);
    if (resetTime) {
      try { record.video.currentTime = 0; } catch (_) { /* metadata ainda indisponível */ }
    }
    record.mode = "";
    record.host.classList.remove("is-video-active");
    record.host.dataset.grconMascotMedia = "png";
  }

  function revealVideo(record, token) {
    if (token !== record.token || !record.mode || document.hidden || reducedMotion()) return;
    clearLoadTimer(record);
    record.host.classList.add("is-video-active");
    record.host.dataset.grconMascotMedia = record.mode;
    document.documentElement.dataset.grconMascotVideo = "playing";
  }

  function mediaFailure(record, mode, reason) {
    if (!mode) return;
    record.failures[mode] = (record.failures[mode] || 0) + 1;
    record.lastError = reason || "falha de mídia";
    hideVideo(record, false);
    record.host.dataset.grconMascotFallback = mode;
    document.documentElement.dataset.grconMascotVideo = "fallback";
    log("media-fallback", { mode, reason: record.lastError, url: MASCOT_ANIMATIONS[mode === "wave" ? "greeting" : "analysing"].url });
    if (!record.warnedModes.has(mode)) {
      record.warnedModes.add(mode);
      console.warn(`GRCON: vídeo ${mode} do mascote indisponível (${record.lastError}); PNG oficial mantido.`);
    }
  }

  function startPlayback(record, token) {
    if (token !== record.token || !record.mode) return;
    let result;
    try { result = record.video.play(); }
    catch (error) { mediaFailure(record, record.mode, error?.message || "play() falhou"); return; }
    if (result?.catch) result.catch((error) => {
      if (token === record.token) mediaFailure(record, record.mode, error?.message || "play() rejeitado");
    });
  }

  function animationForState(state) {
    if (state === "welcome" || state === "hover") return MASCOT_ANIMATIONS.greeting;
    if (PROCESSING_STATES.has(state)) return MASCOT_ANIMATIONS.analysing;
    return null;
  }

  function activateVideo(record, state) {
    const animation = animationForState(state);
    if (!animation || reducedMotion()) {
      hideVideo(record, true);
      return false;
    }
    const token = ++record.token;
    record.mode = animation.mode;
    record.video.loop = animation.loop;
    record.video.dataset.grconAssetRevision = ASSET_REVISION;
    if (record.video.src !== animation.url) {
      record.video.src = animation.url;
      record.video.load();
    } else {
      try { record.video.currentTime = 0; } catch (_) { /* aguarda metadata */ }
    }
    record.loadTimer = root.setTimeout(() => {
      if (token === record.token && record.mode) mediaFailure(record, record.mode, "timeout aguardando frame reproduzível");
    }, 9000);
    if (record.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) revealVideo(record, token);
    startPlayback(record, token);
    log("play-request", { state, mode: animation.mode, url: animation.url, loop: animation.loop });
    return true;
  }

  function preload(mode) {
    const animation = mode === "wave" ? MASCOT_ANIMATIONS.greeting : MASCOT_ANIMATIONS.analysing;
    if (!animation || reducedMotion() || preloaders.has(mode)) return;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = animation.url;
    preloaders.set(mode, video);
    try { video.load(); } catch (_) { /* o player visível fará nova tentativa */ }
    log("preload", { mode, url: animation.url });
  }

  function normalizeState(state) {
    return STATES.includes(state) ? state : "idle";
  }

  function stateForHost() {
    return operationActive ? (operationState || "analyzing") : "idle";
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
    if (operationActive && (state === "welcome" || state === "hover")) return record.state;
    record.state = state;
    record.host.dataset.grconMascotState = state;
    if (animationForState(state)) activateVideo(record, state);
    else hideVideo(record, true);
    if (!options?.skipPose) applyContextPose(state);
    return state;
  }

  function enhance(host) {
    if (!host || records.has(host)) return records.get(host);
    const video = makeVideo(host);
    const record = { host, video, state: "", mode: "", token: 0, loadTimer: 0, warnedModes: new Set(), failures: {}, lastError: "" };
    records.set(host, record);
    host.classList.add("grcon-mascot-video-host");
    host.setAttribute("tabindex", "0");
    host.setAttribute("role", "button");
    host.setAttribute("aria-haspopup", "true");

    const onReady = () => revealVideo(record, record.token);
    const onError = () => {
      const mediaError = record.video.error;
      mediaFailure(record, record.mode, mediaError ? `MediaError ${mediaError.code}` : "falha de carregamento");
    };
    const onAbort = () => { if (record.mode && !operationActive) log("media-abort", { mode: record.mode }); };
    const onWaiting = () => { if (record.mode) log("media-waiting", { mode: record.mode, readyState: record.video.readyState }); };
    const onStalled = () => { if (record.mode) log("media-stalled", { mode: record.mode, networkState: record.video.networkState }); };
    const onEnded = () => {
      if (record.mode !== "wave" || operationActive) return;
      hideVideo(record, true);
      record.state = "idle";
      record.host.dataset.grconMascotState = "idle";
    };
    const enter = (event) => {
      if (event.pointerType === "touch" || operationActive) return;
      playForRecord(record, "hover", { source: "pointer" });
      showGreeting(host, false);
    };
    const leave = (event) => {
      if (event.pointerType === "touch" || operationActive) return;
      hideGreeting(false);
      playForRecord(record, "idle", { source: "pointer" });
    };
    const focus = () => {
      if (!operationActive) {
        playForRecord(record, "hover", { source: "focus" });
        showGreeting(host, false);
      }
    };
    const blur = () => {
      hideGreeting(false);
      if (!operationActive) playForRecord(record, "idle", { source: "blur" });
    };
    const click = (event) => {
      event.stopPropagation();
      if (operationActive) return;
      if (pinnedBubbleHost === host) hideGreeting(true);
      else {
        showGreeting(host, true);
        playForRecord(record, "welcome", { source: "click" });
      }
    };
    const keydown = (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); click(event); }
      else if (event.key === "Escape") hideGreeting(true);
    };

    Object.assign(record, { onReady, onError, onAbort, onWaiting, onStalled, onEnded, enter, leave, focus, blur, click, keydown });
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("canplaythrough", onReady);
    video.addEventListener("error", onError);
    video.addEventListener("abort", onAbort);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("ended", onEnded);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focus", focus);
    host.addEventListener("blur", blur);
    host.addEventListener("click", click);
    host.addEventListener("keydown", keydown);
    playForRecord(record, stateForHost(), { source: "enhance", skipPose: true });
    return record;
  }

  function dispose(record) {
    hideVideo(record, false);
    const { host, video } = record;
    video.removeEventListener("loadeddata", record.onReady);
    video.removeEventListener("canplay", record.onReady);
    video.removeEventListener("canplaythrough", record.onReady);
    video.removeEventListener("error", record.onError);
    video.removeEventListener("abort", record.onAbort);
    video.removeEventListener("waiting", record.onWaiting);
    video.removeEventListener("stalled", record.onStalled);
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
      const desired = stateForHost();
      if (record.state !== desired && record.state !== "hover" && record.state !== "welcome") {
        playForRecord(record, desired, { source: "refresh", skipPose: true });
      }
    });
  }

  function play(state, options) {
    const normalized = normalizeState(state);
    records.forEach((record) => playForRecord(record, normalized, options));
    return normalized;
  }

  function stop() {
    records.forEach((record) => {
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
    root.clearTimeout(greetingTimer);
    operationActive = true;
    pendingOutcome = "";
    operationState = mapTask(detail?.task, detail?.state);
    hideGreeting(true);
    records.forEach((record) => record.host.setAttribute("aria-busy", "true"));
    play(operationState, { source: "operation", hold: true });
    log("operation-begin", { state: operationState, task: detail?.task || "" });
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
    log("operation-end", { outcome: outcome || "idle" });
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
    if (operationActive) return;
    if (document.documentElement.classList.contains("grcon-cloud-pending")) {
      log("greeting-skip", { reason: "authenticated-interface-locked" });
      return;
    }
    const identity = currentIdentity();
    const userId = identity.userId || identity.email || "";
    if (!userId) return;
    lastUserId = userId;
    if (welcomeShown || greetingAlreadyPlayed(userId)) {
      welcomeShown = true;
      log("greeting-skip", { reason: "already-played-this-session" });
      return;
    }
    const host = document.querySelector(".grcon-brand-mascot");
    const record = records.get(host);
    if (!host || !record) return;
    markGreetingPlayed(userId);
    showGreeting(host, false);
    playForRecord(record, "welcome", { source: "login-greeting" });
    root.clearTimeout(greetingTimer);
    greetingTimer = root.setTimeout(() => {
      if (activeBubbleHost === host && !pinnedBubbleHost) hideGreeting(false);
    }, 3200);
    log("greeting-play", { name: resolveFirstName(identity) || "", media: reducedMotion() ? "reduced-motion-static" : "wave" });
  }

  function observeAuthLockState() {
    htmlObserver = new MutationObserver(() => {
      const locked = document.documentElement.classList.contains("grcon-cloud-pending");
      if (locked && !wasAppLocked) {
        clearGreetingFor(lastUserId);
        lastUserId = "";
        hideGreeting(true);
        play("idle", { source: "signed-out" });
        log("session-reset", { reason: "app-locked-after-active-session" });
      }
      wasAppLocked = locked;
    });
    htmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
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

  function diagnostics() {
    const identity = currentIdentity();
    return Object.freeze({
      version: VERSION,
      assetRevision: ASSET_REVISION,
      engine: document.documentElement.dataset.grconMascotEngine || ENGINE,
      ready: initialized,
      reducedMotion: reducedMotion(),
      operationActive,
      operationState,
      appLocked: document.documentElement.classList.contains("grcon-cloud-pending"),
      greetingPlayedThisSession: Boolean((identity.userId || identity.email) && greetingAlreadyPlayed(identity.userId || identity.email)),
      instances: records.size,
      activeVideos: Array.from(records.values()).filter((record) => record.host.classList.contains("is-video-active")).length,
      states: Array.from(records.values()).map((record) => record.state),
      assets: {
        wave: MASCOT_ANIMATIONS.greeting.url,
        processing: MASCOT_ANIMATIONS.analysing.url,
      },
      records: Array.from(records.values()).map((record) => ({
        state: record.state,
        mode: record.mode,
        media: record.host.dataset.grconMascotMedia || "png",
        failures: { ...record.failures },
        lastError: record.lastError,
      })),
      recentEvents: diagnosticsLog.slice(-12),
      debug: DEBUG,
      source: "same-origin-versioned-webm-with-png-fallback",
    });
  }

  function init() {
    if (initialized) return;
    installStyles();
    initialized = true;
    document.documentElement.dataset.grconMascotEngine = ENGINE;
    document.documentElement.dataset.grconMascotVideo = reducedMotion() ? "reduced-motion" : "ready";
    ensureBubble();
    refresh(document);
    preload("wave");
    const preloadProcessing = () => preload("processing");
    if (root.requestIdleCallback) root.requestIdleCallback(preloadProcessing, { timeout: 2500 });
    else root.setTimeout(preloadProcessing, 900);
    if (document.documentElement.dataset.grconControlProcessing === "true") beginOperation({ task: "Análise documental" });
    maybeWelcome();

    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === "childList" || mutation.type === "attributes")) {
        root.requestAnimationFrame(() => refresh(document));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-pose", "data-context", "hidden", "aria-hidden"] });
    observeAuthLockState();

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
      htmlObserver?.disconnect();
      root.clearTimeout(pulseTimer);
      root.clearTimeout(transientTimer);
      root.clearTimeout(greetingTimer);
      records.forEach(dispose);
      preloaders.forEach((video) => { safePause(video); video.removeAttribute("src"); });
      preloaders.clear();
    }, { once: true });

    log("init", { version: VERSION, assetRevision: ASSET_REVISION });
  }

  root.GrconMascot = Object.freeze({
    version: VERSION,
    states: STATES,
    animations: MASCOT_ANIMATIONS,
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
