/* GRCON — Mascot Runtime v5: uma única instância contextual, assets Higgsfield locais e bridge legado/React. */
(function (root) {
  "use strict";

  const VERSION = "5.2.0";
  const ENGINE = "official-hybrid-media-v5";
  const ASSET_REVISION = "20260925.2";
  const OVERLAY_ID = "grcon-context-mascot";
  const BUBBLE_ID = "grcon-mascot-context-bubble";
  const HEADER_SLOT_ID = "grcon-mascot-header-slot";
  const STYLE_ID = "grcon-mascot-runtime-v5-style";
  const SETTINGS_ID = "grcon-mascot-animation-setting";
  const PREF_KEY = "grcon:mascot:animations";
  const SESSION_PREFIX = "grcon:mascot:hello:v5:";
  const PRIORITY = Object.freeze({ hidden: 0, idle: 1, hello: 2, success: 3, running: 4, analyzing: 5, warning: 6 });
  const STATES = Object.freeze(["hidden", "hello", "idle", "analyzing", "warning", "success", "running"]);
  const ALIASES = Object.freeze({
    welcome: "hello",
    hover: "idle",
    "searching-files": "analyzing",
    "checking-document": "analyzing",
    confused: "warning",
    error: "warning",
    uploading: "analyzing",
    "generating-grdt": "analyzing",
    "checking-ld": "analyzing",
    "sigem-pw-analysis": "running",
    loading: "analyzing",
    run: "running",
  });
  const CONTEXTS = Object.freeze([
    ["control", "#grdt-module", "default"],
    ["requests", "#requests-module", "search"],
    ["pdf-tools", "#pdf-tools-module", "report"],
    ["cover-document", "#cover-document-module", "check"],
    ["analysis-history", "#analysis-history-module", "dashboard"],
    ["history", "#history-module", "history"],
    ["sigem", "#sigem-module", "pending"],
    ["conference", "#posting-conference-module", "check"],
    ["sigem-pw", "#sigem-pw-dashboard-module", "sigem-pw"],
    ["additional-tools", "#additional-tools-module", "quality"],
  ]);
  const POSES = Object.freeze({
    default: [0, 0], analysis: [1, 0], search: [2, 0], check: [3, 0],
    history: [0, 1], dashboard: [1, 1], "sigem-pw": [2, 1], egrdt: [3, 1],
    import: [0, 2], report: [1, 2], warning: [2, 2], success: [3, 2],
    pending: [0, 3], empty: [1, 3], quality: [2, 3],
  });

  function asset(path) {
    const url = new URL(path.replace(/^\/+/, ""), root.location.origin + "/");
    url.searchParams.set("v", ASSET_REVISION);
    return url.href;
  }

  const ASSETS = Object.freeze({
    idle: Object.freeze({ type: "image", url: asset("grcon-mascot-sprite.png"), pose: "default", loop: false }),
    hello: Object.freeze({ type: "video", url: asset("assets/mascot/video/grcon-mascot-hello-alpha.webm"), loop: false }),
    analyzing: Object.freeze({ type: "video", url: asset("assets/mascot/video/grcon-mascot-analyzing-alpha.webm"), loop: true }),
    warning: Object.freeze({ type: "video", url: asset("assets/mascot/video/grcon-mascot-warning-alpha.webm"), loop: false }),
    success: Object.freeze({ type: "video", url: asset("assets/mascot/video/grcon-mascot-success-alpha.webm"), loop: false }),
    running: Object.freeze({ type: "video", url: asset("assets/mascot/video/grcon-mascot-running-alpha.webm"), loop: true, presentation: "activity-strip" }),
  });

  const logEntries = [];
  const operations = new Map();
  const detachedPreloaders = new Map();
  const transparencyChecks = new Map();
  let sequence = 0;
  let currentState = "hidden";
  let currentTarget = null;
  let currentMessage = "";
  let currentContext = "";
  let contextGeneration = 0;
  let transientTimer = 0;
  let warningTimer = 0;
  let longOperationTimer = 0;
  let positionFrame = 0;
  let warningUntil = 0;
  let pendingSuccess = false;
  let legacyOperation = null;
  let observer = null;
  let authObserver = null;
  let wasAppLocked = null;
  let lastHelloStorageKey = "";
  let overlay = null;
  let video = null;
  let fallback = null;
  let bubble = null;
  let initialized = false;
  let mediaToken = 0;
  let mediaFailureCount = 0;

  function log(event, detail) {
    logEntries.push({ time: new Date().toISOString(), event, ...(detail || {}) });
    if (logEntries.length > 60) logEntries.shift();
  }

  function reducedMotion() {
    return Boolean(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function animationsEnabled() {
    try { return root.localStorage.getItem(PREF_KEY) !== "off"; }
    catch (_) { return true; }
  }

  function isMobile() {
    const width = root.visualViewport?.width || root.innerWidth || document.documentElement.clientWidth || 0;
    return width <= 700;
  }

  function appLocked() {
    return document.documentElement.classList.contains("grcon-cloud-pending");
  }

  function normalizeState(value) {
    const raw = String(value || "idle");
    const mapped = ALIASES[raw] || raw;
    return STATES.includes(mapped) ? mapped : "idle";
  }

  function currentIdentity() {
    const cloud = root.GrconCloud;
    if (cloud && typeof cloud.getCurrentUserIdentity === "function") {
      const identity = cloud.getCurrentUserIdentity() || {};
      return {
        userId: identity.userId || cloud.state?.session?.user?.id || "",
        displayName: identity.displayName || identity.profileName || identity.metadataName || identity.fullName || identity.name || "",
      };
    }
    const user = cloud?.state?.session?.user;
    return { userId: user?.id || "", displayName: user?.user_metadata?.full_name || user?.user_metadata?.name || "" };
  }

  function greetingMessage() {
    const identity = currentIdentity();
    const firstName = String(identity.displayName || "").trim().split(/\s+/)[0];
    return firstName ? "Olá, " + firstName + "!" : "Olá!";
  }

  function helloKey() {
    const id = currentIdentity().userId || "session";
    return SESSION_PREFIX + id;
  }

  function helloPlayed() {
    const key = helloKey();
    if (key !== SESSION_PREFIX + "session") lastHelloStorageKey = key;
    try { return root.sessionStorage.getItem(key) === ASSET_REVISION; }
    catch (_) { return false; }
  }

  function markHelloPlayed() {
    const key = helloKey();
    lastHelloStorageKey = key;
    try { root.sessionStorage.setItem(key, ASSET_REVISION); }
    catch (_) { /* memória de sessão indisponível não pode quebrar o GRCON */ }
  }

  function clearHelloMarker() {
    const key = lastHelloStorageKey || helloKey();
    try { root.sessionStorage.removeItem(key); }
    catch (_) {}
    lastHelloStorageKey = "";
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + HEADER_SLOT_ID + "{display:flex;align-items:center;justify-content:flex-end;gap:.55rem;min-width:0;flex:0 0 auto;pointer-events:none;isolation:isolate}",
      "#" + OVERLAY_ID + "{position:relative;z-index:1;left:auto;top:auto;width:clamp(64px,5vw,76px);height:clamp(64px,5vw,76px);transform:none;transition:opacity 160ms ease;pointer-events:none;user-select:none;contain:layout style;isolation:isolate;opacity:1;background:transparent;border:0;box-shadow:none;overflow:visible;flex:0 0 auto}",
      "#" + OVERLAY_ID + "[data-state='hidden'],#" + OVERLAY_ID + "[data-state='running']{opacity:0;visibility:hidden}",
      "#" + OVERLAY_ID + " .grcon-mascot-stage{position:absolute;inset:0;transform:none;pointer-events:none;background:transparent;border:0;box-shadow:none;overflow:visible}",
      "#" + OVERLAY_ID + "::before,#" + OVERLAY_ID + "::after,#" + OVERLAY_ID + " .grcon-mascot-stage::before,#" + OVERLAY_ID + " .grcon-mascot-stage::after{content:none!important;display:none!important}",
      "#" + OVERLAY_ID + " video,#" + OVERLAY_ID + " .grcon-mascot-sprite{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;background-color:transparent;border:0;box-shadow:none;transition:opacity 120ms ease}",
      "#" + OVERLAY_ID + " video{object-fit:contain;background:transparent!important;filter:drop-shadow(0 5px 10px rgb(12 32 48 / 18%));opacity:0}",
      "#" + OVERLAY_ID + "[data-media='video'] video{opacity:1}",
      "#" + OVERLAY_ID + " .grcon-mascot-sprite{background-image:url('grcon-mascot-sprite.png?v=4.0.0-hd');background-repeat:no-repeat;background-size:400% 400%;background-position:calc(var(--mx,0)*33.333333%) calc(var(--my,0)*33.333333%);filter:drop-shadow(0 5px 10px rgb(12 32 48 / 15%));opacity:1;transform:none;animation:none!important}",
      "#" + OVERLAY_ID + "[data-media='video'] .grcon-mascot-sprite{opacity:0}",
      "#" + BUBBLE_ID + "{position:relative;z-index:1;max-width:min(230px,28vw);padding:.48rem .62rem;border:1px solid color-mix(in srgb,var(--brand-700,#0c648f) 20%,var(--border-1,#d8e1e7));border-radius:10px;background:color-mix(in srgb,var(--surface-1,#fff) 97%,var(--brand-50,#f2f9fc));box-shadow:0 5px 16px rgb(12 32 48 / 10%);color:var(--text-1,#16212b);font:650 .78rem/1.25 Inter,'Segoe UI',Arial,sans-serif;pointer-events:none;opacity:0;visibility:hidden;transform:translateY(2px);transition:opacity 150ms ease,transform 180ms ease;overflow-wrap:anywhere}",
      "#" + BUBBLE_ID + "[data-visible='true']{opacity:1;visibility:visible;transform:translateY(0)}",
      ".grcon-mascot-setting-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem .85rem;border:1px solid var(--border-1,#d8e1e7);border-radius:12px;background:var(--surface-1,#fff)}",
      ".grcon-mascot-setting-row span{display:grid;gap:.16rem}.grcon-mascot-setting-row strong{font-size:.9rem}.grcon-mascot-setting-row small{color:var(--text-2,#5f6e78)}",
      ".grcon-mascot-setting-row input{inline-size:1.15rem;block-size:1.15rem}",
      "html[data-theme='dark'] #" + OVERLAY_ID + " video{filter:drop-shadow(0 6px 12px rgb(0 0 0 / 40%))}",
      "@media(max-width:900px){#" + HEADER_SLOT_ID + "{order:3;flex:1 1 100%;justify-content:flex-start;min-height:58px}#" + OVERLAY_ID + "{width:58px;height:58px}#" + BUBBLE_ID + "{max-width:min(260px,calc(100vw - 96px))}}",
      "@media(max-width:700px){#" + HEADER_SLOT_ID + "{min-height:52px}#" + OVERLAY_ID + "{width:52px;height:52px}#" + BUBBLE_ID + "{font-size:.74rem}}",
      "@media(prefers-reduced-motion:reduce){#" + OVERLAY_ID + "{transition:none!important}#" + OVERLAY_ID + " video{display:none!important}#" + OVERLAY_ID + " .grcon-mascot-stage{transition:none!important;transform:none!important}#" + OVERLAY_ID + " .grcon-mascot-sprite{animation:none!important;transform:none!important}#" + BUBBLE_ID + "{transition:none!important}}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function ensureHeaderSlot() {
    let slot = document.getElementById(HEADER_SLOT_ID);
    if (slot) return slot;
    const topbar = document.querySelector(".topbar");
    slot = document.createElement("div");
    slot.id = HEADER_SLOT_ID;
    slot.className = "grcon-mascot-header-slot";
    slot.dataset.grconMascotShell = "header";
    const runtimeStatus = topbar?.querySelector(".runtime-status");
    if (topbar) topbar.insertBefore(slot, runtimeStatus || null);
    else document.body.prepend(slot);
    return slot;
  }

  function ensureDom() {
    if (overlay?.isConnected) return overlay;
    installStyles();
    overlay = document.getElementById(OVERLAY_ID) || document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "grcon-mascot-context grcon-mascot-runtime";
    overlay.dataset.state = "hidden";
    overlay.dataset.media = "png";
    overlay.dataset.context = "none";
    overlay.dataset.pose = "default";
    overlay.setAttribute("aria-hidden", "true");

    const stage = document.createElement("div");
    stage.className = "grcon-mascot-stage";
    fallback = document.createElement("span");
    fallback.className = "grcon-mascot-sprite";
    fallback.setAttribute("aria-hidden", "true");
    video = document.createElement("video");
    video.className = "grcon-mascot-video";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "none";
    video.disablePictureInPicture = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("disableRemotePlayback", "");
    video.setAttribute("aria-hidden", "true");
    stage.append(fallback, video);
    overlay.replaceChildren(stage);
    const headerSlot = ensureHeaderSlot();
    if (!overlay.isConnected || overlay.parentElement !== headerSlot) headerSlot.appendChild(overlay);

    bubble = document.getElementById(BUBBLE_ID) || document.createElement("div");
    bubble.id = BUBBLE_ID;
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubble.dataset.visible = "false";
    if (!bubble.isConnected || bubble.parentElement !== headerSlot) headerSlot.appendChild(bubble);

    video.addEventListener("loadeddata", revealVideo);
    video.addEventListener("canplay", revealVideo);
    video.addEventListener("error", handleMediaError);
    video.addEventListener("ended", handleEnded);
    return overlay;
  }

  function activeContext() {
    for (const [name, selector, pose] of CONTEXTS) {
      const node = document.querySelector(selector);
      if (node && !node.hidden && node.getAttribute("aria-hidden") !== "true") return { name, node, pose };
    }
    return { name: "none", node: null, pose: "default" };
  }

  function setFallbackPose(pose) {
    const resolved = POSES[pose] ? pose : "default";
    const [x, y] = POSES[resolved];
    if (overlay) {
      overlay.dataset.pose = resolved;
      overlay.style.setProperty("--mx", String(x));
      overlay.style.setProperty("--my", String(y));
    }
  }

  function refreshContext(forcedPose) {
    ensureDom();
    const next = activeContext();
    if (next.name !== currentContext) {
      currentContext = next.name;
      contextGeneration += 1;
      log("context", { context: currentContext, generation: contextGeneration });
    }
    overlay.dataset.context = next.name;
    const statePose = currentState === "warning" ? "warning" : currentState === "success" ? "success" : "";
    setFallbackPose(statePose || forcedPose || next.pose);
    if (!currentTarget && currentState !== "running") positionDefault();
    return next;
  }

  function viewport() {
    return {
      width: root.visualViewport?.width || root.innerWidth || document.documentElement.clientWidth || 1,
      height: root.visualViewport?.height || root.innerHeight || document.documentElement.clientHeight || 1,
    };
  }

  function mascotSize() {
    const rect = ensureDom().getBoundingClientRect();
    return { width: rect.width || 170, height: rect.height || 170 };
  }

  function setPosition() {
    if (!overlay) return;
    overlay.style.removeProperty("--mascot-x");
    overlay.style.removeProperty("--mascot-y");
    positionBubble();
  }

  function rectsIntersect(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function visibleAvoidanceRects() {
    return [];
  }

  function positionDefault() {
    setPosition();
  }

  function resolveTarget(input) {
    if (input instanceof Element) return input.isConnected ? input : null;
    if (typeof input === "string" && input) {
      try { return document.querySelector(input); }
      catch (_) { return null; }
    }
    return null;
  }

  function positionNearTarget() {
    if (currentTarget && !currentTarget.isConnected) currentTarget = null;
    positionDefault();
  }

  function schedulePosition() {
    if (positionFrame) return;
    positionFrame = root.requestAnimationFrame(() => {
      positionFrame = 0;
      if (currentTarget) positionNearTarget();
      else positionDefault();
      refreshContext();
    });
  }

  function handleViewportResize() {
    if (!overlay) return;
    overlay.style.transition = "none";
    if (positionFrame) root.cancelAnimationFrame(positionFrame);
    positionFrame = root.requestAnimationFrame(() => {
      positionFrame = 0;
      if (currentTarget) positionNearTarget();
      else positionDefault();
      positionBubble();
      root.requestAnimationFrame(() => {
        overlay?.style.removeProperty("transition");
        if (currentTarget) positionNearTarget();
        else positionDefault();
        positionBubble();
      });
    });
  }

  function positionBubble() {
    if (!bubble) return;
    bubble.style.removeProperty("left");
    bubble.style.removeProperty("top");
  }

  function showBubble(message) {
    ensureDom();
    currentMessage = String(message || "").trim();
    if (!currentMessage) {
      hideBubble();
      return;
    }
    bubble.textContent = currentMessage;
    bubble.dataset.visible = "true";
    positionBubble();
  }

  function hideBubble() {
    currentMessage = "";
    if (bubble) bubble.dataset.visible = "false";
  }

  function scheduleStaticTransientReturn(state, source) {
    if ((state !== "hello" && state !== "success") || operations.size) return;
    root.clearTimeout(transientTimer);
    transientTimer = root.setTimeout(() => {
      transientTimer = 0;
      if (operations.size || Date.now() < warningUntil || currentState !== state) return;
      hideBubble();
      applyState("idle", { force: true, source: source || "static-transient-complete" });
    }, state === "hello" ? 1600 : 1400);
  }

  function useFallback(reason) {
    mediaToken += 1;
    try { video.pause(); } catch (_) {}
    try { video.currentTime = 0; } catch (_) {}
    overlay.dataset.media = "png";
    overlay.dataset.mediaFallback = reason || "fallback";
    mediaFailureCount += reason ? 1 : 0;
    log("fallback", { reason: reason || "static" });
    scheduleStaticTransientReturn(currentState, "fallback-" + currentState);
  }

  function measureTransparentEdgeRatio() {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const edge = 6;
      let transparent = 0;
      let total = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const corner = (x < edge || x >= canvas.width - edge) && (y < edge || y >= canvas.height - edge);
          if (!corner) continue;
          total += 1;
          if (pixels[((y * canvas.width + x) * 4) + 3] <= 24) transparent += 1;
        }
      }
      return total ? transparent / total : null;
    } catch (error) {
      log("transparency-probe-error", { message: error?.message || String(error) });
      return null;
    }
  }

  function revealVideo() {
    if (!animationsEnabled() || reducedMotion() || !video?.currentSrc) return;
    const src = video.currentSrc;
    let transparentEdgeRatio = transparencyChecks.get(src);
    if (transparentEdgeRatio == null) {
      transparentEdgeRatio = measureTransparentEdgeRatio();
      if (transparentEdgeRatio != null) transparencyChecks.set(src, transparentEdgeRatio);
    }
    if (transparentEdgeRatio != null && transparentEdgeRatio < 0.72) {
      log("video-transparency-warning", { state: currentState, transparentEdgeRatio });
    }
    overlay.dataset.media = "video";
    delete overlay.dataset.mediaFallback;
  }

  function handleMediaError() {
    const error = video?.error;
    useFallback(error ? "MediaError " + error.code : "media-error");
  }

  function clearVideoSource() {
    mediaToken += 1;
    try { video.pause(); } catch (_) {}
    video.removeAttribute("src");
    try { video.load(); } catch (_) {}
    overlay.dataset.media = "png";
  }

  function playAsset(state) {
    ensureDom();
    const item = ASSETS[state];

    if (!item || item.type !== "video" || state === "running") {
      clearVideoSource();
      delete overlay.dataset.mediaFallback;
      scheduleStaticTransientReturn(state, "static-" + state);
      return;
    }

    if (!animationsEnabled() || reducedMotion()) {
      clearVideoSource();
      delete overlay.dataset.mediaFallback;
      scheduleStaticTransientReturn(state, reducedMotion() ? "reduced-motion-" + state : "animations-disabled-" + state);
      return;
    }

    const token = ++mediaToken;
    video.loop = Boolean(item.loop);
    video.preload = state === "hello" || state === "analyzing" ? "auto" : "metadata";
    if (video.src !== item.url) {
      video.src = item.url;
      try { video.load(); } catch (_) {}
    } else {
      try { video.currentTime = 0; } catch (_) {}
    }
    let playResult;
    try { playResult = video.play(); }
    catch (error) {
      if (token === mediaToken) useFallback(error?.message || "play-error");
      return;
    }
    if (playResult?.catch) playResult.catch((error) => {
      if (token === mediaToken) useFallback(error?.message || "play-rejected");
    });
  }

  function statePose() {
    if (currentState === "warning") return "warning";
    if (currentState === "success") return "success";
    return activeContext().pose;
  }

  function applyState(nextInput, options) {
    const config = options || {};
    const next = normalizeState(nextInput);
    ensureDom();
    if (!config.force && Date.now() < warningUntil && PRIORITY[next] < PRIORITY.warning) return currentState;
    if (!config.force && PRIORITY[next] < PRIORITY[currentState] && currentState === "warning") return currentState;

    root.clearTimeout(transientTimer);
    transientTimer = 0;
    currentState = next;
    overlay.dataset.state = next;
    document.documentElement.dataset.grconMascotState = next;
    setFallbackPose(statePose());

    if (next === "hidden") {
      root.GrconMascotRunner?.stop?.("hidden");
      clearVideoSource();
      hideBubble();
      return next;
    }

    if (next === "running") {
      if (reducedMotion() || !animationsEnabled()) {
        root.GrconMascotRunner?.stop?.("reduced-or-disabled");
        currentState = "analyzing";
        overlay.dataset.state = "analyzing";
        document.documentElement.dataset.grconMascotState = "analyzing";
        playAsset("analyzing");
        if (config.message) showBubble(config.message);
        positionDefault();
        log("state", { state: currentState, source: config.source || "api", context: currentContext, runningFallback: true });
        return currentState;
      }
      clearVideoSource();
      hideBubble();
      positionDefault();
      const runner = root.GrconMascotRunner;
      if (runner?.run) {
        Promise.resolve(runner.run({ source: config.source || "api", hold: Boolean(operations.size) })).then((started) => {
          if (!started && currentState === "running") applyState("analyzing", { force: true, message: config.message, source: "runner-unavailable" });
        }).catch(() => {
          if (currentState === "running") applyState("analyzing", { force: true, message: config.message, source: "runner-error" });
        });
      } else {
        root.setTimeout(() => {
          if (currentState === "running" && !root.GrconMascotRunner?.run) applyState("analyzing", { force: true, message: config.message, source: "runner-not-loaded" });
        }, 120);
      }
      log("state", { state: currentState, source: config.source || "api", context: currentContext, runner: "activity-strip" });
      return currentState;
    }

    root.GrconMascotRunner?.stop?.("state-" + next);
    playAsset(currentState);
    if (config.message) showBubble(config.message);
    else if (currentState === "idle") hideBubble();

    if (currentTarget) positionNearTarget();
    else positionDefault();

    log("state", { state: currentState, source: config.source || "api", context: currentContext });
    return currentState;
  }

  function nextOperationalState() {
    let latest = null;
    operations.forEach((op) => {
      if (op.cancelled || op.generation !== contextGeneration) return;
      if (!latest || op.sequence > latest.sequence) latest = op;
    });
    return latest ? latest.state : "idle";
  }

  function returnFromTransient() {
    if (pendingSuccess && !operations.size) {
      pendingSuccess = false;
      success({ source: "queued-success" });
      return;
    }
    applyState(nextOperationalState(), { force: true, source: "transient-return" });
  }

  function warning(options) {
    const config = typeof options === "string" ? { message: options } : (options || {});
    const duration = Math.max(1500, Number(config.duration) || 3600);
    currentTarget = resolveTarget(config.target);
    warningUntil = Date.now() + duration;
    applyState("warning", { force: true, message: config.message || "Confira esta informação.", source: config.source || "warning" });
    root.clearTimeout(warningTimer);
    warningTimer = root.setTimeout(() => {
      warningTimer = 0;
      warningUntil = 0;
      currentTarget = null;
      hideBubble();
      returnFromTransient();
    }, duration);
    return "warning";
  }

  function success(options) {
    const config = options || {};
    if (Date.now() < warningUntil) {
      pendingSuccess = true;
      return "warning";
    }
    pendingSuccess = false;
    currentTarget = resolveTarget(config.target);
    applyState("success", { force: true, message: config.message || "Operação concluída.", source: config.source || "success" });
    return "success";
  }

  function idle(options) {
    warningUntil = 0;
    root.clearTimeout(warningTimer);
    warningTimer = 0;
    currentTarget = null;
    hideBubble();
    return applyState("idle", { force: true, source: options?.source || "idle" });
  }

  function hide() {
    currentTarget = null;
    hideBubble();
    return applyState("hidden", { force: true, source: "hide" });
  }

  function run(options) {
    const config = options || {};
    const value = applyState("running", { force: true, message: config.message || "Processando…", source: config.source || "run" });
    if (!operations.size) {
      root.clearTimeout(transientTimer);
      transientTimer = root.setTimeout(() => {
        hideBubble();
        applyState("idle", { force: true, source: "run-complete" });
      }, Math.max(5200, Number(config.duration) || 5400));
    }
    return Promise.resolve(value !== "hidden");
  }

  function show(stateOrOptions, maybeOptions) {
    const config = typeof stateOrOptions === "object" ? stateOrOptions : { ...(maybeOptions || {}), state: stateOrOptions };
    const state = normalizeState(config.state);
    currentTarget = resolveTarget(config.target);
    if (state === "warning") return warning(config);
    if (state === "success") return success(config);
    if (state === "running") { void run(config); return "running"; }
    return applyState(state, { force: Boolean(config.force), message: config.message, source: config.source || "show" });
  }

  function begin(options) {
    const config = options || {};
    const id = "mascot-op-" + (++sequence);
    const initial = normalizeState(config.state || "analyzing");
    const op = {
      id,
      sequence,
      generation: contextGeneration,
      context: currentContext,
      state: initial === "running" ? "running" : "analyzing",
      cancelled: false,
    };
    operations.set(id, op);
    currentTarget = resolveTarget(config.target);
    if (Date.now() < warningUntil && currentState === "warning") {
      log("operation-begin-queued-during-warning", { id, state: op.state });
    } else {
      applyState(op.state, { force: true, message: config.message || "", source: "operation-begin" });
    }

    const valid = () => operations.has(id) && !op.cancelled && op.generation === contextGeneration;
    const finish = (outcome, detail) => {
      if (!operations.has(id)) return false;
      operations.delete(id);
      if (!valid() && op.generation !== contextGeneration) {
        log("stale-operation", { id, from: op.context, to: currentContext });
        if (!operations.size) applyState("idle", { force: true, source: "stale-operation" });
        return false;
      }
      if (outcome === "success") {
        if (operations.size) applyState(nextOperationalState(), { force: true, source: "operation-peer-active" });
        else success({ ...(detail || {}), source: "operation-success" });
      } else if (outcome === "warning") {
        warning({ ...(detail || {}), source: "operation-warning" });
      } else {
        applyState(nextOperationalState(), { force: true, source: "operation-end" });
      }
      return true;
    };

    return Object.freeze({
      id,
      success: (detail) => finish("success", detail),
      warning: (detail) => finish("warning", detail),
      cancel: () => { op.cancelled = true; return finish("cancel"); },
      end: () => finish("end"),
      running: (message) => {
        if (!valid()) return false;
        op.state = "running";
        if (!(Date.now() < warningUntil && currentState === "warning")) {
          applyState("running", { force: true, message: message || config.message || "", source: "operation-running" });
        }
        return true;
      },
      analyzing: (message) => {
        if (!valid()) return false;
        op.state = "analyzing";
        if (!(Date.now() < warningUntil && currentState === "warning")) {
          applyState("analyzing", { force: true, message: message || config.message || "", source: "operation-analyzing" });
        }
        return true;
      },
    });
  }

  function inferWarningTarget(message) {
    const value = String(message || "").toLocaleLowerCase("pt-BR");
    if (/revis[aã]o/.test(value)) return "#drawer-revision";
    if (/databook/.test(value)) return "#drawer-databook";
    if (/t[ií]tulo/.test(value)) return "#drawer-title";
    if (/taxonomia/.test(value)) return "#cover-taxonomy";
    return null;
  }

  function shouldRunLong(detail) {
    const text = [detail?.state, detail?.task, detail?.context].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return /sigem-pw|projectwise|\bpw\b|worker|combinar pdf|importa|base grande|muitos documentos/.test(text);
  }

  function beginLegacy(detail) {
    if (legacyOperation) legacyOperation.cancel();
    const running = normalizeState(detail?.state) === "running" || shouldRunLong(detail);
    legacyOperation = begin({
      state: running ? "analyzing" : normalizeState(detail?.state || "analyzing"),
      message: detail?.task || detail?.message || "",
    });
    root.clearTimeout(longOperationTimer);
    if (running) {
      longOperationTimer = root.setTimeout(() => {
        legacyOperation?.running(detail?.task || "Processando dados…");
      }, 1800);
    }
  }

  function endLegacy(successful) {
    root.clearTimeout(longOperationTimer);
    longOperationTimer = 0;
    const op = legacyOperation;
    legacyOperation = null;
    if (!op) {
      if (successful) success({ source: "legacy-notification" });
      else if (Date.now() >= warningUntil) idle({ source: "legacy-end" });
      return;
    }
    if (Date.now() < warningUntil) {
      operations.delete(op.id);
      if (successful) pendingSuccess = true;
      return;
    }
    if (successful) {
      pendingSuccess = false;
      op.success();
    } else op.end();
  }

  function handleOperationEvent(event) {
    const detail = event?.detail || {};
    if (detail.active) beginLegacy(detail);
    else endLegacy(Boolean(detail.success) || pendingSuccess);
  }

  function handlePulse(event) {
    const duration = Math.min(3000, Math.max(700, Number(event?.detail?.duration) || 1100));
    if (operations.size || Date.now() < warningUntil) {
      log("processing-pulse-skip", { operations: operations.size, warning: Date.now() < warningUntil });
      return;
    }
    currentTarget = null;
    hideBubble();
    applyState("analyzing", { force: true, source: "processing-pulse" });
    root.clearTimeout(transientTimer);
    transientTimer = root.setTimeout(() => {
      transientTimer = 0;
      if (operations.size || Date.now() < warningUntil) return;
      hideBubble();
      applyState("idle", { force: true, source: "processing-pulse-end" });
    }, duration);
  }

  function handleNotification(event) {
    const detail = event?.detail || {};
    const kind = String(detail.kind || "").toLowerCase();
    if (kind === "success") {
      if (legacyOperation || operations.size) pendingSuccess = true;
      else success({ message: detail.message || "Operação concluída.", source: "notification" });
      return;
    }
    if (kind === "warn" || kind === "warning" || kind === "error") {
      const target = detail.target || inferWarningTarget(detail.message);
      warning({ target, message: detail.message || "Confira esta informação.", source: "notification" });
    }
  }

  function maybeHello() {
    if (appLocked() || helloPlayed() || operations.size || Date.now() < warningUntil) return false;
    markHelloPlayed();
    currentTarget = null;
    applyState("hello", { force: true, message: greetingMessage(), source: "session-hello" });
    return true;
  }

  function preload(state) {
    const item = ASSETS[state];
    if (!animationsEnabled() || reducedMotion() || detachedPreloaders.has(state) || !item || item.type !== "video" || state === "running") return;
    const probe = document.createElement("video");
    probe.muted = true;
    probe.preload = state === "hello" ? "auto" : "metadata";
    probe.src = item.url;
    detachedPreloaders.set(state, probe);
    try { probe.load(); } catch (_) {}
  }

  function scheduleLazyPreload() {
    if (!animationsEnabled() || reducedMotion()) return;
    preload("hello");
    const loadLater = () => preload("analyzing");
    if (typeof root.requestIdleCallback === "function") root.requestIdleCallback(loadLater, { timeout: 3500 });
    else root.setTimeout(loadLater, 1800);
  }

  function setEnabled(enabled) {
    try { root.localStorage.setItem(PREF_KEY, enabled ? "on" : "off"); } catch (_) {}
    const input = document.getElementById(SETTINGS_ID);
    if (input) input.checked = Boolean(enabled);
    if (!enabled) {
      detachedPreloaders.clear();
      root.GrconMascotRunner?.stop?.("disabled");
      clearVideoSource();
      overlay.dataset.media = "png";
    } else {
      scheduleLazyPreload();
      if (currentState === "running") void root.GrconMascotRunner?.run?.({ source: "enabled", hold: Boolean(operations.size) });
      else playAsset(currentState === "hidden" ? "idle" : currentState);
    }
    document.documentElement.dataset.grconMascotAnimations = enabled ? "on" : "off";
    return Boolean(enabled);
  }

  function installSettingsControl() {
    if (document.getElementById(SETTINGS_ID)) return;
    const container = document.querySelector("#macro6-productivity .settings-group-body");
    if (!container) return;
    const label = document.createElement("label");
    label.className = "grcon-mascot-setting-row";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = "Animações do mascote";
    const small = document.createElement("small");
    small.textContent = "Ative ou desative apenas as animações visuais; as validações do GRCON continuam funcionando.";
    copy.append(strong, small);
    const input = document.createElement("input");
    input.id = SETTINGS_ID;
    input.type = "checkbox";
    input.checked = animationsEnabled();
    input.setAttribute("aria-label", "Animações do mascote");
    input.addEventListener("change", () => setEnabled(input.checked));
    label.append(copy, input);
    container.prepend(label);
  }

  function handleEnded() {
    if (currentState === "hello") {
      hideBubble();
      applyState("idle", { force: true, source: "hello-ended" });
    } else if (currentState === "success" && !operations.size) {
      currentTarget = null;
      hideBubble();
      applyState("idle", { force: true, source: "success-ended" });
    } else if (currentState === "warning") {
      clearVideoSource();
      log("warning-video-ended", { state: currentState });
    }
  }

  function diagnostics() {
    return Object.freeze({
      version: VERSION,
      engine: ENGINE,
      assetRevision: ASSET_REVISION,
      state: currentState,
      states: [currentState],
      context: currentContext,
      contextGeneration,
      instances: overlay?.isConnected ? 1 : 0,
      activeVideos: overlay?.dataset.media === "video" && !video?.paused ? 1 : 0,
      animationsEnabled: animationsEnabled(),
      reducedMotion: reducedMotion(),
      greetingPlayedThisSession: helloPlayed(),
      appLocked: appLocked(),
      media: overlay?.dataset.media || "png",
      mediaFailureCount,
      mediaFallback: overlay?.dataset.mediaFallback || "",
      transparencyChecks: Object.fromEntries(Array.from(transparencyChecks.entries()).map(([url, ratio]) => [new URL(url).pathname, ratio])),
      activeOperations: operations.size,
      targetConnected: Boolean(currentTarget?.isConnected),
      assets: Object.fromEntries(Object.entries(ASSETS).map(([key, value]) => [key, value.url])),
      log: logEntries.slice(-20),
      ready: initialized,
    });
  }

  function initObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver((entries) => {
      if (!entries.some((entry) => entry.type === "childList" || ["hidden", "aria-hidden", "class", "open"].includes(entry.attributeName))) return;
      refreshContext();
      installSettingsControl();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "class", "open"] });
  }

  function initAuthObserver() {
    if (authObserver) return;
    wasAppLocked = appLocked();
    authObserver = new MutationObserver(() => {
      const locked = appLocked();
      if (locked === wasAppLocked) return;
      if (locked) {
        clearHelloMarker();
        root.clearTimeout(transientTimer);
        transientTimer = 0;
        root.clearTimeout(warningTimer);
        warningTimer = 0;
        warningUntil = 0;
        pendingSuccess = false;
        hideBubble();
        if (!operations.size) applyState("idle", { force: true, source: "signed-out" });
        log("session-reset", { reason: "app-locked-after-active-session" });
      } else {
        root.setTimeout(maybeHello, 0);
      }
      wasAppLocked = locked;
    });
    authObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    ensureDom();
    refreshContext();
    installSettingsControl();
    initObserver();
    initAuthObserver();
    document.documentElement.dataset.grconMascotRuntime = ENGINE;
    document.documentElement.dataset.grconMascotAnimations = animationsEnabled() ? "on" : "off";
    root.addEventListener("resize", handleViewportResize, { passive: true });
    root.addEventListener("scroll", schedulePosition, { passive: true, capture: true });
    root.addEventListener("grcon:processing-state", handleOperationEvent);
    root.addEventListener("grcon:mascot-operation", handleOperationEvent);
    root.addEventListener("grcon:processing-pulse", handlePulse);
    root.addEventListener("grcon:notification", handleNotification);
    root.addEventListener("grcon:mascot-warning", (event) => warning(event?.detail || {}));
    root.addEventListener("grcon:mascot-success", (event) => success(event?.detail || {}));
    root.addEventListener("grcon:mascot-run", (event) => { void run(event?.detail || {}); });
    root.addEventListener("grcon:mascot-context-refresh", (event) => refreshContext(event?.detail?.pose));
    root.addEventListener("grcon:cloud-ready", maybeHello);
    root.addEventListener("grcon:identity-changed", maybeHello);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        try { video?.pause(); } catch (_) {}
      } else if (currentState === "running") {
        void root.GrconMascotRunner?.run?.({ source: "visibility-resume", hold: Boolean(operations.size) });
      } else if (currentState !== "hidden") {
        playAsset(currentState);
      }
    });
    root.addEventListener("pagehide", () => {
      root.clearTimeout(transientTimer);
      root.clearTimeout(warningTimer);
      root.clearTimeout(longOperationTimer);
      if (positionFrame) root.cancelAnimationFrame(positionFrame);
      operations.clear();
      authObserver?.disconnect();
      root.GrconMascotRunner?.stop?.("pagehide");
      try { video?.pause(); } catch (_) {}
    }, { once: true });
    scheduleLazyPreload();
    applyState("idle", { force: true, source: "init" });
    if (!appLocked()) root.setTimeout(maybeHello, 180);
  }

  const api = Object.freeze({
    version: VERSION,
    engine: ENGINE,
    states: STATES,
    assets: ASSETS,
    show,
    play: show,
    warning,
    success,
    run,
    idle,
    hide,
    stop: hide,
    reset: idle,
    begin,
    setEnabled,
    isEnabled: animationsEnabled,
    refresh: refreshContext,
    diagnostics,
  });

  root.GrconMascot = api;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
