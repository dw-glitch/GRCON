/* GRCON — Mascot Runtime v5: uma única instância contextual, assets Higgsfield locais e bridge legado/React. */
(function (root) {
  "use strict";

  const VERSION = "5.1.0";
  const ENGINE = "official-sprite-contextual-v5";
  const ASSET_REVISION = "20260925.1";
  const OVERLAY_ID = "grcon-context-mascot";
  const BUBBLE_ID = "grcon-mascot-context-bubble";
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
    ["control", "#grdt-module", ".ops-page-heading", "default"],
    ["requests", "#requests-module", ".ops-page-heading,.requests-heading", "search"],
    ["grdt-reissue", "#grdt-reissue-module", ".grdt-reissue-heading", "egrdt"],
    ["pdf-tools", "#pdf-tools-module", ".pdf-merge-heading,header", "report"],
    ["cover-document", "#cover-document-module", ".cover-document-heading,header", "check"],
    ["analysis-history", "#analysis-history-module", ".analysis-history-heading,header", "dashboard"],
    ["history", "#history-module", ".history-heading,header", "history"],
    ["sigem", "#sigem-module", ".sigem-heading", "pending"],
    ["conference", "#posting-conference-module", ".pc-heading,header", "check"],
    ["sigem-pw", "#sigem-pw-dashboard-module", ".spw-page-heading,header", "sigem-pw"],
    ["additional-tools", "#additional-tools-module", ".additional-tools-heading", "quality"],
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
    hello: Object.freeze({ url: asset("assets/mascot/video/grcon-mascot-hello-alpha.webm"), loop: false }),
    analyzing: Object.freeze({ url: asset("assets/mascot/video/grcon-mascot-analyzing-alpha.webm"), loop: true }),
    warning: Object.freeze({ url: asset("assets/mascot/video/grcon-mascot-warning-alpha.webm"), loop: false }),
    success: Object.freeze({ url: asset("assets/mascot/video/grcon-mascot-success-alpha.webm"), loop: false }),
    running: Object.freeze({ url: asset("assets/mascot/video/grcon-mascot-run-alpha.webm"), loop: true }),
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
  let pointerFrame = 0;
  let pendingPointer = null;
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
      "#" + OVERLAY_ID + "{--cursor-x:0px;--cursor-y:0px;position:relative;z-index:3;display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:clamp(5.5rem,6.5vw,6.25rem);height:clamp(5.5rem,6.5vw,6.25rem);margin-inline-start:auto;align-self:center;transition:opacity 160ms ease;pointer-events:none;user-select:none;contain:layout style;isolation:isolate;opacity:1;background:transparent;border:0;box-shadow:none;overflow:visible}",
      "#" + OVERLAY_ID + "[data-state='hidden']{opacity:0;visibility:hidden}",
      "#" + OVERLAY_ID + " .grcon-mascot-stage{position:absolute;inset:0;transform:translate3d(var(--cursor-x),var(--cursor-y),0) rotate(var(--cursor-tilt,0deg));transition:transform 120ms ease-out;pointer-events:none;background:transparent;border:0;box-shadow:none;overflow:visible}",
      "#" + OVERLAY_ID + "::before,#" + OVERLAY_ID + "::after,#" + OVERLAY_ID + " .grcon-mascot-stage::before,#" + OVERLAY_ID + " .grcon-mascot-stage::after{content:none!important;display:none!important}",
      "#" + OVERLAY_ID + " video,#" + OVERLAY_ID + " .grcon-mascot-sprite{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;background-color:transparent;border:0;box-shadow:none}",
      "#" + OVERLAY_ID + " video{object-fit:contain;background:transparent!important;filter:drop-shadow(0 7px 14px rgb(12 32 48 / 19%));opacity:0;transition:opacity 120ms ease}",
      "#" + OVERLAY_ID + "[data-media='video'] video{opacity:1}",
      "#" + OVERLAY_ID + " .grcon-mascot-sprite{background-image:url('grcon-mascot-sprite.png?v=4.0.0-hd');background-repeat:no-repeat;background-size:400% 400%;background-position:calc(var(--mx,0)*33.333333%) calc(var(--my,0)*33.333333%);filter:drop-shadow(0 6px 12px rgb(12 32 48 / 16%));opacity:1}",
      "#" + OVERLAY_ID + "[data-media='video'] .grcon-mascot-sprite{opacity:0}",
      "#" + OVERLAY_ID + "[data-media='png'] .grcon-mascot-sprite{transform-origin:50% 82%}",
      "#" + OVERLAY_ID + "[data-media='png'][data-state='idle'] .grcon-mascot-sprite{animation:grcon-mascot-fallback-idle 3.2s ease-in-out infinite}",
      "#" + OVERLAY_ID + "[data-media='png'][data-state='hello'] .grcon-mascot-sprite{animation:grcon-mascot-fallback-hello .9s ease-in-out 2}",
      "#" + OVERLAY_ID + "[data-media='png'][data-state='analyzing'] .grcon-mascot-sprite{animation:grcon-mascot-fallback-analyzing 1.15s ease-in-out infinite}",
      "#" + OVERLAY_ID + "[data-media='png'][data-state='warning'] .grcon-mascot-sprite{animation:grcon-mascot-fallback-warning .42s ease-in-out 3}",
      "#" + OVERLAY_ID + "[data-media='png'][data-state='success'] .grcon-mascot-sprite{animation:grcon-mascot-fallback-success .72s cubic-bezier(.2,.9,.2,1) 1}",
      "#" + OVERLAY_ID + "[data-media='png'][data-state='running'] .grcon-mascot-sprite{animation:grcon-mascot-fallback-running .62s ease-in-out infinite}",
      "@keyframes grcon-mascot-fallback-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}",
      "@keyframes grcon-mascot-fallback-hello{0%,100%{transform:rotate(0deg)}35%{transform:rotate(-3deg)}70%{transform:rotate(3deg)}}",
      "@keyframes grcon-mascot-fallback-analyzing{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-2px) rotate(-1.5deg)}}",
      "@keyframes grcon-mascot-fallback-warning{0%,100%{transform:translateX(0)}35%{transform:translateX(-2px) rotate(-1.5deg)}70%{transform:translateX(2px) rotate(1.5deg)}}",
      "@keyframes grcon-mascot-fallback-success{0%{transform:scale(.96) translateY(2px)}55%{transform:scale(1.035) translateY(-3px)}100%{transform:scale(1) translateY(0)}}",
      "@keyframes grcon-mascot-fallback-running{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-3px) rotate(1deg)}}",
      "#" + OVERLAY_ID + "[data-state='running'][data-media='video']{width:clamp(8rem,11vw,10rem);height:clamp(4.5rem,6.2vw,5.65rem)}",
      ".grcon-mascot-heading{display:flex!important;align-items:center!important;flex-wrap:wrap!important;overflow:visible!important;column-gap:clamp(.7rem,1.5vw,1.25rem)!important}",
      "#" + BUBBLE_ID + "{position:fixed;z-index:246;max-width:min(250px,calc(100vw - 24px));padding:.55rem .72rem;border:1px solid color-mix(in srgb,var(--brand-700,#0c648f) 20%,var(--border-1,#d8e1e7));border-radius:12px;background:color-mix(in srgb,var(--surface-1,#fff) 97%,var(--brand-50,#f2f9fc));box-shadow:0 8px 24px rgb(12 32 48 / 12%);color:var(--text-1,#16212b);font:650 .84rem/1.3 Inter,'Segoe UI',Arial,sans-serif;pointer-events:none;opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity 150ms ease,transform 180ms ease;overflow-wrap:anywhere}",
      "#" + BUBBLE_ID + "[data-visible='true']{opacity:1;visibility:visible;transform:translateY(0)}",
      ".grcon-mascot-setting-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem .85rem;border:1px solid var(--border-1,#d8e1e7);border-radius:12px;background:var(--surface-1,#fff)}",
      ".grcon-mascot-setting-row span{display:grid;gap:.16rem}.grcon-mascot-setting-row strong{font-size:.9rem}.grcon-mascot-setting-row small{color:var(--text-2,#5f6e78)}",
      ".grcon-mascot-setting-row input{inline-size:1.15rem;block-size:1.15rem}",
      "html[data-theme='dark'] #" + OVERLAY_ID + " video{filter:drop-shadow(0 8px 15px rgb(0 0 0 / 42%))}",
      "@media(max-width:900px){#" + OVERLAY_ID + "{width:5.5rem;height:5.5rem}}",
      "@media(max-width:700px){#" + OVERLAY_ID + "{width:4.75rem;height:4.75rem;margin-inline-start:0}#" + OVERLAY_ID + "[data-state='running'][data-media='video']{width:6.4rem;height:3.6rem}}",
      "@media(prefers-reduced-motion:reduce){#" + OVERLAY_ID + "{transition:none!important;animation:none!important}#" + OVERLAY_ID + " video{display:none!important}#" + OVERLAY_ID + " .grcon-mascot-stage{transition:none!important;transform:none!important}#" + OVERLAY_ID + " .grcon-mascot-sprite{animation:none!important;transform:none!important}#" + BUBBLE_ID + "{transition:none!important}}",
    ].join("\n");
    document.head.appendChild(style);
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
    if (!overlay.isConnected) document.body.appendChild(overlay);

    bubble = document.getElementById(BUBBLE_ID) || document.createElement("div");
    bubble.id = BUBBLE_ID;
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubble.dataset.visible = "false";
    if (!bubble.isConnected) document.body.appendChild(bubble);

    video.addEventListener("loadeddata", revealVideo);
    video.addEventListener("canplay", revealVideo);
    video.addEventListener("error", handleMediaError);
    video.addEventListener("ended", handleEnded);
    return overlay;
  }

  function activeContext() {
    for (const [name, selector, headingSelector, pose] of CONTEXTS) {
      const node = document.querySelector(selector);
      if (node && !node.hidden && node.getAttribute("aria-hidden") !== "true") return { name, node, headingSelector, pose };
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
    const heading = next.node?.querySelector?.(next.headingSelector || "header") || next.node?.querySelector?.("header") || null;
    if (heading) {
      heading.classList.add("grcon-mascot-heading");
      if (overlay.parentElement !== heading) heading.appendChild(overlay);
    }
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

  function positionDefault() {
    if (!overlay || currentState === "running") return;
    positionBubble();
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
    if (!bubble || bubble.dataset.visible !== "true" || !overlay) return;
    const host = overlay.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();
    const vp = viewport();
    const gap = 8;
    let left = host.left - box.width - gap;
    let top = host.top + Math.max(0, (host.height - box.height) / 2);
    if (left < 8) left = host.right + gap;
    if (left + box.width > vp.width - 8) left = Math.max(8, vp.width - box.width - 8);
    top = Math.max(8, Math.min(top, vp.height - box.height - 8));
    bubble.style.left = Math.round(left) + "px";
    bubble.style.top = Math.round(top) + "px";
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

  function useFallback(reason) {
    mediaToken += 1;
    try { video.pause(); } catch (_) {}
    overlay.dataset.media = "png";
    overlay.dataset.mediaFallback = reason || "fallback";
    mediaFailureCount += reason ? 1 : 0;
    log("fallback", { reason: reason || "static" });
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
      if (transparentEdgeRatio == null) return;
      transparencyChecks.set(src, transparentEdgeRatio);
    }
    if (transparentEdgeRatio < 0.72) {
      if (overlay.dataset.mediaFallback !== "opaque-video-background") {
        log("video-rejected-opaque-background", { state: currentState, transparentEdgeRatio });
        useFallback("opaque-video-background");
      }
      return;
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
    if (!animationsEnabled() || reducedMotion()) {
      clearVideoSource();
      return;
    }
    if (state === "idle" || state === "hidden") {
      clearVideoSource();
      return;
    }
    const item = ASSETS[state];
    if (!item) {
      useFallback("asset-missing");
      return;
    }
    const token = ++mediaToken;
    video.loop = Boolean(item.loop);
    video.preload = state === "running" ? "metadata" : "auto";
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
      clearVideoSource();
      hideBubble();
      return next;
    }

    if (next === "running" && (isMobile() || reducedMotion())) {
      currentState = "analyzing";
      overlay.dataset.state = "analyzing";
      document.documentElement.dataset.grconMascotState = "analyzing";
    }

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
    root.clearTimeout(transientTimer);
    transientTimer = root.setTimeout(() => {
      currentTarget = null;
      hideBubble();
      applyState("idle", { force: true, source: "success-complete" });
    }, Math.max(1500, Number(config.duration) || 3100));
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
      }, Math.max(2200, Number(config.duration) || 4300));
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
    root.clearTimeout(transientTimer);
    transientTimer = root.setTimeout(() => {
      hideBubble();
      applyState("idle", { force: true, source: "hello-complete" });
    }, 4200);
    return true;
  }

  function preload(state) {
    if (!animationsEnabled() || reducedMotion() || detachedPreloaders.has(state) || !ASSETS[state]) return;
    const probe = document.createElement("video");
    probe.muted = true;
    probe.preload = "auto";
    probe.src = ASSETS[state].url;
    detachedPreloaders.set(state, probe);
    try { probe.load(); } catch (_) {}
  }

  function scheduleLazyPreload() {
    if (!animationsEnabled() || reducedMotion()) return;
    preload("hello");
    const loadLater = () => ["analyzing", "warning", "success"].forEach(preload);
    if (typeof root.requestIdleCallback === "function") root.requestIdleCallback(loadLater, { timeout: 3500 });
    else root.setTimeout(loadLater, 1800);
  }

  function setEnabled(enabled) {
    try { root.localStorage.setItem(PREF_KEY, enabled ? "on" : "off"); } catch (_) {}
    const input = document.getElementById(SETTINGS_ID);
    if (input) input.checked = Boolean(enabled);
    if (!enabled) {
      detachedPreloaders.clear();
      clearVideoSource();
      overlay.dataset.media = "png";
    } else {
      scheduleLazyPreload();
      playAsset(currentState === "hidden" ? "idle" : currentState);
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

  function handlePointer(event) {
    if (currentState !== "idle" || isMobile() || reducedMotion() || !animationsEnabled()) return;
    pendingPointer = { x: event.clientX, y: event.clientY };
    if (pointerFrame) return;
    pointerFrame = root.requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!pendingPointer || !overlay) return;
      const rect = overlay.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(-4, Math.min(4, (pendingPointer.x - cx) / 160));
      const dy = Math.max(-3, Math.min(3, (pendingPointer.y - cy) / 190));
      overlay.style.setProperty("--cursor-x", dx.toFixed(2) + "px");
      overlay.style.setProperty("--cursor-y", dy.toFixed(2) + "px");
      overlay.style.setProperty("--cursor-tilt", (dx * 0.22).toFixed(2) + "deg");
    });
  }

  function handleEnded() {
    if (currentState === "hello") {
      hideBubble();
      applyState("idle", { force: true, source: "hello-ended" });
    } else if (currentState === "success" && !operations.size) {
      hideBubble();
      applyState("idle", { force: true, source: "success-ended" });
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
    root.addEventListener("pointermove", handlePointer, { passive: true });
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
      } else if (currentState !== "hidden") {
        playAsset(currentState);
      }
    });
    root.addEventListener("pagehide", () => {
      root.clearTimeout(transientTimer);
      root.clearTimeout(warningTimer);
      root.clearTimeout(longOperationTimer);
      if (positionFrame) root.cancelAnimationFrame(positionFrame);
      if (pointerFrame) root.cancelAnimationFrame(pointerFrame);
      operations.clear();
      authObserver?.disconnect();
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
