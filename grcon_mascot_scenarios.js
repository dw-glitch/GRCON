/* GRCON — cenários contextuais do Mascote da Qualidade.
 * Uma única camada de orquestração compartilha player/fallback/diagnóstico,
 * enquanto cada cena mantém âncora, escala, gatilho e prioridade próprios.
 */
(function (root) {
  "use strict";

  const VERSION = "1.0.0";
  const ASSET_REVISION = "20260918.3";
  const STYLE_ID = "grcon-mascot-scenarios-style";
  const IDLE_DELAY_MS = 80_000;
  const IDLE_COOLDOWN_MS = 150_000;
  const LOAD_TIMEOUT_MS = 9_000;
  const PRIORITY = Object.freeze({ idle: 100, operation: 200, completion: 300, explicit: 400 });
  const SESSION_TEAMS_KEY = "grcon:mascot:teams-ready:v1";
  const stageRecords = new Map();
  const diagnosticsLog = [];
  const pendingTeamsReady = [];
  const prepared = new Set();
  let active = null;
  let operation = { active: false, kind: "", task: "", source: "" };
  let operationDelayTimer = 0;
  let idleTimer = 0;
  let idleCooldownUntil = 0;
  let lastIdleKey = "";
  let initialized = false;

  function asset(path) {
    const url = new URL(path.replace(/^\/+/, ""), `${root.location.origin}/`);
    url.searchParams.set("v", ASSET_REVISION);
    return url.href;
  }

  const SCENARIOS = Object.freeze({
    importBases: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-import-bases.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-import-bases-poster.webp"),
      type: "video/mp4",
      variant: "wide-stage",
      width: 0.68,
      mobileWidth: 0.92,
      maxWidth: 880,
      framed: true,
      loop: false,
      anchor: "sigem-pw",
    }),
    longProcessing: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-long-processing.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-long-processing-poster.webp"),
      type: "video/mp4",
      variant: "medium-stage",
      width: 0.38,
      mobileWidth: 0.82,
      maxWidth: 560,
      framed: true,
      loop: true,
      anchor: "sigem-pw",
    }),
    sleepy: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-sleep.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-sleep-poster.webp"),
      type: "video/mp4",
      variant: "idle-stage",
      width: 0.18,
      mobileWidth: 0.50,
      maxWidth: 300,
      framed: true,
      loop: false,
      anchor: "idle",
    }),
    curious: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-curious.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-curious-poster.webp"),
      type: "video/mp4",
      variant: "idle-stage",
      width: 0.14,
      mobileWidth: 0.46,
      maxWidth: 240,
      framed: true,
      loop: false,
      anchor: "idle",
    }),
    grdtStamp: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-grdt-stamp.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-grdt-stamp-poster.webp"),
      type: "video/mp4",
      variant: "event-stage",
      width: 0.32,
      mobileWidth: 0.80,
      maxWidth: 460,
      framed: true,
      loop: false,
      anchor: "grdt-success",
    }),
    teamsSend: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-teams-send.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-teams-send-poster.webp"),
      type: "video/mp4",
      variant: "event-stage",
      width: 0.34,
      mobileWidth: 0.82,
      maxWidth: 500,
      framed: true,
      loop: false,
      anchor: "teams-dialog",
    }),
    grdtToTeams: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-grdt-to-teams.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-grdt-to-teams-poster.webp"),
      type: "video/mp4",
      variant: "event-stage",
      width: 0.26,
      mobileWidth: 0.76,
      maxWidth: 400,
      framed: true,
      loop: false,
      anchor: "teams-ready",
    }),
    paperwork: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-paperwork.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-paperwork-poster.webp"),
      type: "video/mp4",
      variant: "wide-stage",
      width: 0.78,
      mobileWidth: 0.92,
      maxWidth: 960,
      framed: true,
      loop: false,
      anchor: "triage",
    }),
    reviewCoffee: Object.freeze({
      asset: asset("assets/mascot/video/grcon-mascot-review-coffee.mp4"),
      poster: asset("assets/mascot/poster/grcon-mascot-review-coffee-poster.webp"),
      type: "video/mp4",
      variant: "medium-stage",
      width: 0.40,
      mobileWidth: 0.82,
      maxWidth: 560,
      framed: true,
      loop: false,
      anchor: "review",
    }),
  });

  function log(event, detail) {
    diagnosticsLog.push({ time: new Date().toISOString(), event, ...(detail || {}) });
    if (diagnosticsLog.length > 60) diagnosticsLog.shift();
  }

  function reducedMotion() {
    return Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function workspace() {
    return document.querySelector("main.workspace");
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".grcon-mascot-scene[hidden]{display:none!important}",
      ".grcon-mascot-scene{--grcon-scene-width:60%;--grcon-scene-max:560px;display:flex;justify-content:center;align-items:center;min-width:0;margin:12px auto 16px;pointer-events:none;position:relative;z-index:1}",
      ".grcon-mascot-scene-frame{position:relative;width:min(var(--grcon-scene-width),var(--grcon-scene-max));max-width:100%;overflow:hidden;border:1px solid color-mix(in srgb,var(--border,#d8e1e7) 82%,transparent);border-radius:var(--radius-lg,16px);background:color-mix(in srgb,var(--surface,#fff) 96%,var(--brand-50,#eef7fb));box-shadow:0 7px 20px rgb(20 46 64 / 7%);isolation:isolate}",
      ".grcon-mascot-scene[data-framed=\"false\"] .grcon-mascot-scene-frame{border:0;background:transparent;box-shadow:none}",
      ".grcon-mascot-scene-video,.grcon-mascot-scene-poster{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none}",
      ".grcon-mascot-scene-poster{position:relative;z-index:1;opacity:1;transition:opacity 150ms ease}",
      ".grcon-mascot-scene-video{position:absolute;inset:0;z-index:2;opacity:0;visibility:hidden;transition:opacity 150ms ease;background:transparent}",
      ".grcon-mascot-scene[data-status=\"playing\"] .grcon-mascot-scene-video{opacity:1;visibility:visible}",
      ".grcon-mascot-scene[data-status=\"playing\"] .grcon-mascot-scene-poster{opacity:0}",
      ".grcon-mascot-scene--wide-stage{margin-block:14px 18px}",
      ".grcon-mascot-scene--wide-stage .grcon-mascot-scene-frame{aspect-ratio:48/19;max-height:34vh}",
      ".grcon-mascot-scene--medium-stage{justify-content:flex-end;margin-block:10px 14px}",
      ".grcon-mascot-scene--medium-stage .grcon-mascot-scene-frame{aspect-ratio:16/9}",
      ".grcon-mascot-scene--event-stage{justify-content:center;margin-block:10px 14px}",
      ".grcon-mascot-scene--event-stage .grcon-mascot-scene-frame{aspect-ratio:16/9}",
      ".grcon-mascot-scene--idle-stage{position:fixed;margin:0;z-index:185;justify-content:flex-end;align-items:flex-end;transition:opacity 160ms ease;opacity:.97}",
      ".grcon-mascot-scene--idle-stage .grcon-mascot-scene-frame{aspect-ratio:16/9;box-shadow:0 6px 18px rgb(20 46 64 / 8%)}",
      "html[data-theme=\"dark\"] .grcon-mascot-scene-frame{background:color-mix(in srgb,var(--surface,#17232c) 96%,#0b2836);box-shadow:0 8px 24px rgb(0 0 0 / 24%)}",
      "@media(max-width:720px){.grcon-mascot-scene{margin-block:9px 13px}.grcon-mascot-scene--wide-stage .grcon-mascot-scene-frame{max-height:30vh}.grcon-mascot-scene--medium-stage,.grcon-mascot-scene--event-stage{justify-content:center}}",
      "@media(prefers-reduced-motion:reduce){.grcon-mascot-scene-video{display:none!important}.grcon-mascot-scene-poster{opacity:1!important;transition:none}.grcon-mascot-scene{transition:none}}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function sceneWidth(config) {
    const work = workspace();
    const workWidth = work?.getBoundingClientRect().width || document.documentElement.clientWidth || root.innerWidth || 1200;
    const mobile = workWidth <= 720;
    const fraction = mobile ? config.mobileWidth : config.width;
    return Math.max(120, Math.min(config.maxWidth, Math.round(workWidth * fraction)));
  }

  function positionIdleStage(record) {
    const work = workspace();
    if (!work || !record?.stage) return false;
    const workRect = work.getBoundingClientRect();
    const width = sceneWidth(record.config);
    const height = Math.round(width * 9 / 16);
    const gap = 16;
    const left = Math.max(workRect.left + gap, workRect.right - width - gap);
    const top = Math.max(workRect.top + gap, Math.min(workRect.bottom - height - gap, (root.innerHeight || 800) - height - gap));
    record.stage.style.left = `${Math.round(left)}px`;
    record.stage.style.top = `${Math.round(top)}px`;
    record.stage.style.width = `${width}px`;
    record.stage.style.height = `${height}px`;
    return !wouldObscureImportantContent({ left, top, right: left + width, bottom: top + height });
  }

  function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function wouldObscureImportantContent(candidate) {
    const selectors = ["dialog[open]", "input:focus", "textarea:focus", "[contenteditable=\"true\"]:focus", ".table-card", ".spw-table-wrap", ".pc-table-wrap"];
    return selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((node) => {
      if (!(node instanceof HTMLElement) || node.hidden) return false;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const overlap = {
        left: Math.max(candidate.left, rect.left), top: Math.max(candidate.top, rect.top),
        right: Math.min(candidate.right, rect.right), bottom: Math.min(candidate.bottom, rect.bottom),
      };
      if (overlap.right <= overlap.left || overlap.bottom <= overlap.top) return false;
      const overlapArea = (overlap.right - overlap.left) * (overlap.bottom - overlap.top);
      const candidateArea = Math.max(1, (candidate.right - candidate.left) * (candidate.bottom - candidate.top));
      return overlapArea / candidateArea > 0.28;
    }));
  }

  function resolveAnchor(config) {
    if (config.anchor === "triage") {
      const module = document.getElementById("grdt-module");
      const results = document.getElementById("results-section");
      return module ? { parent: module, before: results || null } : null;
    }
    if (config.anchor === "sigem-pw") {
      const module = document.getElementById("sigem-pw-dashboard-module");
      const results = document.getElementById("spw-system-grid");
      return module ? { parent: module, before: results || null } : null;
    }
    if (config.anchor === "review") {
      const module = document.getElementById("posting-conference-module");
      const next = module?.querySelector(".pc-kpis") || null;
      return module ? { parent: module, before: next } : null;
    }
    if (config.anchor === "grdt-success") {
      const module = document.getElementById("grdt-module");
      const teams = document.getElementById("egrdt-teams-ready");
      return module ? { parent: module, before: teams || document.getElementById("results-section") || null } : null;
    }
    if (config.anchor === "teams-ready") {
      const panel = document.getElementById("egrdt-teams-ready");
      const list = document.getElementById("egrdt-teams-ready-list");
      return panel ? { parent: panel, before: list || null } : null;
    }
    if (config.anchor === "teams-dialog") {
      const form = document.querySelector("#egrdt-teams-dialog form");
      const check = form?.querySelector(".egrdt-teams-folder-check") || null;
      return form ? { parent: form, before: check } : null;
    }
    if (config.anchor === "idle") return { parent: document.body, before: null };
    return null;
  }

  function ensureStage(key) {
    if (stageRecords.has(key)) return stageRecords.get(key);
    const config = SCENARIOS[key];
    if (!config) return null;
    const stage = document.createElement("div");
    stage.className = `grcon-mascot-scene grcon-mascot-scene--${config.variant}`;
    stage.dataset.scene = key;
    stage.dataset.status = "poster";
    stage.dataset.framed = String(config.framed !== false);
    stage.hidden = true;
    stage.setAttribute("aria-hidden", "true");
    stage.style.setProperty("--grcon-scene-max", `${config.maxWidth}px`);

    const frame = document.createElement("div");
    frame.className = "grcon-mascot-scene-frame";
    const poster = document.createElement("img");
    poster.className = "grcon-mascot-scene-poster";
    poster.alt = "";
    poster.decoding = "async";
    poster.loading = "lazy";
    poster.setAttribute("aria-hidden", "true");
    poster.src = config.poster;
    const video = document.createElement("video");
    video.className = "grcon-mascot-scene-video";
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = "none";
    video.disablePictureInPicture = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "none");
    video.setAttribute("disableRemotePlayback", "");
    video.setAttribute("aria-hidden", "true");
    frame.append(poster, video);
    stage.appendChild(frame);

    const record = {
      key, config, stage, frame, poster, video,
      token: 0, loadTimer: 0, staticTimer: 0, failures: 0, lastError: "", status: "poster", prepared: false, posterFallback: false,
    };
    stageRecords.set(key, record);

    poster.addEventListener("error", () => {
      if (record.posterFallback) {
        record.stage.dataset.posterFallback = "unavailable";
        log("poster-fallback-failed", { key, src: poster.src });
        return;
      }
      record.posterFallback = true;
      record.stage.dataset.posterFallback = "official-sprite";
      poster.src = asset("grcon-mascot-sprite.png");
      log("poster-fallback", { key, fallback: "official-sprite" });
    });
    video.addEventListener("loadeddata", () => mediaReady(record));
    video.addEventListener("canplay", () => mediaReady(record));
    video.addEventListener("canplaythrough", () => mediaReady(record));
    video.addEventListener("error", () => mediaFailure(record, video.error ? `MediaError ${video.error.code}` : "media-error"));
    video.addEventListener("abort", () => { if (active?.key === key && record.status === "loading") log("media-abort", { key }); });
    video.addEventListener("waiting", () => { if (active?.key === key) log("media-waiting", { key, readyState: video.readyState }); });
    video.addEventListener("stalled", () => { if (active?.key === key) log("media-stalled", { key, networkState: video.networkState }); });
    video.addEventListener("ended", () => handleEnded(key));
    return record;
  }

  function placeStage(record) {
    const location = resolveAnchor(record.config);
    if (!location?.parent) return false;
    if (record.stage.parentNode !== location.parent || (location.before && record.stage.nextSibling !== location.before)) {
      location.parent.insertBefore(record.stage, location.before);
    }
    const width = sceneWidth(record.config);
    record.stage.style.setProperty("--grcon-scene-width", `${width}px`);
    if (record.config.variant === "idle-stage") return positionIdleStage(record);
    record.stage.style.removeProperty("left");
    record.stage.style.removeProperty("top");
    record.stage.style.removeProperty("width");
    record.stage.style.removeProperty("height");
    return true;
  }

  function clearLoadTimer(record) {
    if (record.loadTimer) root.clearTimeout(record.loadTimer);
    record.loadTimer = 0;
  }

  function clearStaticTimer(record) {
    if (record.staticTimer) root.clearTimeout(record.staticTimer);
    record.staticTimer = 0;
  }

  function scheduleReducedMotionLifecycle(record) {
    clearStaticTimer(record);
    if (!reducedMotion()) return;
    const durations = { grdtStamp: 1600, grdtToTeams: 1600, sleepy: 2200, curious: 1800 };
    const duration = durations[record.key];
    if (!duration) return;
    record.staticTimer = root.setTimeout(() => {
      record.staticTimer = 0;
      if (active?.key === record.key) handleEnded(record.key);
    }, duration);
  }

  function prepare(key, preload) {
    const record = ensureStage(key);
    if (!record || reducedMotion()) return record;
    if (!record.prepared) {
      record.video.preload = preload || "metadata";
      record.video.setAttribute("preload", record.video.preload);
      record.video.src = record.config.asset;
      record.prepared = true;
      record.video.load();
      prepared.add(key);
      log("prepare", { key, preload: record.video.preload, asset: record.config.asset });
    } else if (preload === "auto" && record.video.preload !== "auto") {
      record.video.preload = "auto";
      record.video.setAttribute("preload", "auto");
      try { record.video.load(); } catch (_) { /* tentativa de play cuidará do fallback */ }
    }
    return record;
  }

  function mediaReady(record) {
    if (!record || record.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (active?.key !== record.key || reducedMotion()) return;
    clearLoadTimer(record);
    record.status = "playing";
    record.stage.dataset.status = "playing";
    log("media-ready", { key: record.key, readyState: record.video.readyState });
  }

  function mediaFailure(record, reason) {
    if (!record) return;
    clearLoadTimer(record);
    record.failures += 1;
    record.lastError = String(reason || "media-failure");
    record.status = "fallback";
    record.stage.dataset.status = "fallback";
    try { record.video.pause(); } catch (_) { /* poster permanece */ }
    log("media-fallback", { key: record.key, reason: record.lastError, failures: record.failures });
  }

  function playRecord(record) {
    if (!record) return;
    record.token += 1;
    const token = record.token;
    record.video.loop = Boolean(record.config.loop);
    if (reducedMotion()) {
      record.status = "poster";
      record.stage.dataset.status = "poster";
      return;
    }
    prepare(record.key, "auto");
    record.status = "loading";
    record.stage.dataset.status = "loading";
    try { record.video.currentTime = 0; } catch (_) { /* metadata ainda chegando */ }
    record.loadTimer = root.setTimeout(() => {
      if (active?.key === record.key && token === record.token && record.status === "loading") mediaFailure(record, "load-timeout");
    }, LOAD_TIMEOUT_MS);
    if (record.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) mediaReady(record);
    let result;
    try { result = record.video.play(); }
    catch (error) { mediaFailure(record, error?.message || "play-throw"); return; }
    if (result?.catch) result.catch((error) => {
      if (active?.key === record.key && token === record.token) mediaFailure(record, error?.message || "play-rejected");
    });
  }

  function suppressHeader(value) {
    const next = Boolean(value);
    if (root.GrconMascot?.setGlobalPlaybackSuppressed) root.GrconMascot.setGlobalPlaybackSuppressed(next);
    else if (next) root.GrconMascot?.stop?.("global");
    else root.GrconMascot?.reset?.();
    root.GrconMascotRunner?.setSuppressed?.(next);
  }

  function hideKey(key, reason) {
    const record = stageRecords.get(key);
    if (!record) return;
    clearLoadTimer(record);
    clearStaticTimer(record);
    record.token += 1;
    try { record.video.pause(); } catch (_) { /* poster permanece disponível */ }
    record.stage.dataset.status = record.status === "fallback" ? "fallback" : "poster";
    record.status = record.stage.dataset.status;
    record.stage.hidden = true;
    if (active?.key === key) active = null;
    log("hide", { key, reason: reason || "hide" });
  }

  function hideActive(reason) {
    if (!active) return;
    const wasContextual = active.priority >= PRIORITY.operation;
    const key = active.key;
    hideKey(key, reason);
    if (wasContextual) suppressHeader(false);
  }

  function show(key, options) {
    const config = SCENARIOS[key];
    if (!config) return false;
    const priority = Number(options?.priority) || PRIORITY.operation;
    if (active && active.key !== key && active.priority > priority && !options?.force) {
      log("skip-priority", { requested: key, current: active.key, requestedPriority: priority, currentPriority: active.priority });
      return false;
    }
    if (active && active.key !== key) hideActive("replaced");
    const record = ensureStage(key);
    if (!record || !placeStage(record)) {
      log("skip-anchor", { key, anchor: config.anchor });
      return false;
    }
    record.stage.hidden = false;
    active = { key, priority, source: options?.source || "", startedAt: Date.now(), persistent: Boolean(options?.persistent) };
    if (priority >= PRIORITY.operation) suppressHeader(true);
    playRecord(record);
    scheduleReducedMotionLifecycle(record);
    log("show", { key, priority, source: active.source, reducedMotion: reducedMotion() });
    return true;
  }

  function handleEnded(key) {
    if (active?.key !== key) return;
    const record = stageRecords.get(key);
    if (!record) return;
    if (key === "importBases" && operation.active && operation.kind === "sigem-pw-import") {
      show("longProcessing", { priority: PRIORITY.operation, source: "import-continues", persistent: true });
      return;
    }
    if (key === "longProcessing" && operation.active) return;
    if ((key === "paperwork" || key === "reviewCoffee" || key === "teamsSend") && operation.active) {
      record.status = "poster";
      record.stage.dataset.status = "poster";
      return;
    }
    if (key === "grdtStamp") {
      hideActive("grdt-stamp-ended");
      root.setTimeout(playPendingTeamsReady, 180);
      return;
    }
    if (key === "grdtToTeams") {
      hideActive("teams-ready-ended");
      return;
    }
    if (key === "sleepy" || key === "curious") {
      idleCooldownUntil = Date.now() + IDLE_COOLDOWN_MS;
      lastIdleKey = key;
      hideActive("idle-ended");
      scheduleIdle();
      return;
    }
    if (!active?.persistent) hideActive("ended");
  }

  function classifyOperation(detail, eventType) {
    const state = String(detail?.state || "").toLocaleLowerCase("pt-BR");
    const task = String(detail?.task || "").toLocaleLowerCase("pt-BR");
    const context = String(detail?.context || "").toLocaleLowerCase("pt-BR");
    if (eventType === "grcon:processing-state" && context === "control" && /analis|confer/.test(task)) return "triage";
    if (state === "sigem-pw-analysis" && /(consulta geral|projectwise|base pw|ld da qualidade|indexando|validando|universo n-1710)/.test(task)) return "sigem-pw-import";
    if (state === "sigem-pw-analysis") return "sigem-pw-long";
    if (state === "checking-document" || /conferindo documentos|conferência|revis/.test(task)) return "review";
    return "";
  }

  function beginOperation(detail, eventType) {
    root.clearTimeout(operationDelayTimer);
    const kind = classifyOperation(detail, eventType);
    operation = { active: true, kind, task: String(detail?.task || ""), source: eventType };
    resetIdleTimer();
    if (kind === "triage") {
      show("paperwork", { priority: PRIORITY.operation, source: eventType, persistent: true });
    } else if (kind === "sigem-pw-import") {
      show("importBases", { priority: PRIORITY.operation, source: eventType, persistent: true });
    } else if (kind === "sigem-pw-long") {
      operationDelayTimer = root.setTimeout(() => {
        if (operation.active && operation.kind === kind) show("longProcessing", { priority: PRIORITY.operation, source: "delayed-sigem-pw", persistent: true });
      }, 1500);
    } else if (kind === "review") {
      operationDelayTimer = root.setTimeout(() => {
        if (operation.active && operation.kind === kind) show("reviewCoffee", { priority: PRIORITY.operation, source: "delayed-review", persistent: true });
      }, 1100);
    }
    log("operation-begin", { kind, task: operation.task, eventType });
  }

  function endOperation(detail, eventType) {
    root.clearTimeout(operationDelayTimer);
    operationDelayTimer = 0;
    const previous = operation;
    operation = { active: false, kind: "", task: "", source: "" };
    if (active && active.priority === PRIORITY.operation) hideActive(`operation-end:${eventType}`);
    log("operation-end", { kind: previous.kind, task: previous.task, outcome: detail?.outcome || "" });
    resetIdleTimer();
  }

  function handleOperationEvent(event) {
    const detail = event?.detail || {};
    if (detail.active) beginOperation(detail, event.type);
    else endOperation(detail, event.type);
  }

  function recordKey(record) {
    return String(record?.id || record?.clientRecordId || record?.egrdtNumber || "").trim();
  }

  function readTeamsPlayed() {
    try {
      const values = JSON.parse(root.sessionStorage?.getItem(SESSION_TEAMS_KEY) || "[]");
      return new Set(Array.isArray(values) ? values.map(String) : []);
    } catch (_) { return new Set(); }
  }

  function markTeamsPlayed(key) {
    if (!key) return;
    const values = readTeamsPlayed();
    values.add(key);
    try { root.sessionStorage?.setItem(SESSION_TEAMS_KEY, JSON.stringify(Array.from(values).slice(-100))); } catch (_) { /* sessão sem storage */ }
  }

  function handleEgrdtGenerated(event) {
    const records = Array.isArray(event?.detail?.records) ? event.detail.records.filter(Boolean) : [];
    records.forEach((record) => {
      const key = recordKey(record);
      if (key && !readTeamsPlayed().has(key)) pendingTeamsReady.push({ key, record });
    });
    show("grdtStamp", { priority: PRIORITY.completion, source: "grcon:egrdt-generated" });
    resetIdleTimer();
  }

  function playPendingTeamsReady() {
    if (!pendingTeamsReady.length || operation.active || active) return;
    let next = pendingTeamsReady.shift();
    while (next && readTeamsPlayed().has(next.key)) next = pendingTeamsReady.shift();
    if (!next) return;
    const panel = document.getElementById("egrdt-teams-ready");
    if (!panel || panel.hidden) {
      pendingTeamsReady.unshift(next);
      return;
    }
    markTeamsPlayed(next.key);
    show("grdtToTeams", { priority: PRIORITY.completion, source: "teams-ready-panel" });
  }

  function handleTeamsSend(event) {
    const detail = event?.detail || {};
    if (detail.active) {
      operation = { active: true, kind: "teams-send", task: "Enviando ao grupo", source: event.type };
      show("teamsSend", { priority: PRIORITY.explicit, source: event.type, persistent: true, force: true });
      return;
    }
    operation = { active: false, kind: "", task: "", source: "" };
    if (detail.outcome === "error") {
      hideKey("teamsSend", "teams-send-error");
      suppressHeader(false);
      active = null;
    } else if (active?.key === "teamsSend") {
      root.setTimeout(() => {
        if (active?.key === "teamsSend") hideActive("teams-send-success");
      }, 850);
    }
    resetIdleTimer();
  }

  function idleAllowed() {
    if (operation.active || active || document.hidden || Date.now() < idleCooldownUntil) return false;
    if (document.querySelector("dialog[open]")) return false;
    const focused = document.activeElement;
    if (focused && (focused.matches?.("input,textarea,select") || focused.isContentEditable)) return false;
    return true;
  }

  function waitingForInput() {
    const control = document.getElementById("grdt-module");
    const requests = document.getElementById("requests-module");
    if (control && !control.hidden && document.getElementById("results-section")?.hidden) return true;
    if (requests && !requests.hidden) {
      const table = requests.querySelector("table tbody");
      return !table || table.children.length === 0;
    }
    return false;
  }

  function playIdle() {
    idleTimer = 0;
    if (!idleAllowed()) { scheduleIdle(); return; }
    let key = waitingForInput() ? "curious" : "sleepy";
    if (key === lastIdleKey) key = key === "curious" ? "sleepy" : "curious";
    if (!show(key, { priority: PRIORITY.idle, source: "idle-timer" })) scheduleIdle();
  }

  function scheduleIdle() {
    root.clearTimeout(idleTimer);
    const delay = Math.max(IDLE_DELAY_MS, idleCooldownUntil - Date.now());
    idleTimer = root.setTimeout(playIdle, delay);
  }

  function resetIdleTimer() {
    if (active && active.priority === PRIORITY.idle) hideActive("user-activity");
    scheduleIdle();
  }

  function handleNavigationPreparation(event) {
    const target = event.target?.closest?.("[data-grcon-view],[data-spw-open],[data-pc-open]");
    if (!target) return;
    if (target.matches("[data-spw-open]")) {
      prepare("importBases", "metadata");
      prepare("longProcessing", "metadata");
    } else if (target.matches("[data-pc-open]")) {
      prepare("reviewCoffee", "metadata");
    } else if (target.dataset.grconView === "control") {
      prepare("paperwork", "metadata");
    }
  }

  function handleVisibility() {
    stageRecords.forEach((record) => {
      if (document.hidden) {
        try { record.video.pause(); } catch (_) { /* sem efeito funcional */ }
      } else if (active?.key === record.key && record.status === "playing" && !reducedMotion()) {
        const result = record.video.play();
        if (result?.catch) result.catch(() => mediaFailure(record, "resume-rejected"));
      }
    });
    if (!document.hidden) resetIdleTimer();
  }

  function diagnostics() {
    return Object.freeze({
      version: VERSION,
      assetRevision: ASSET_REVISION,
      ready: initialized,
      reducedMotion: reducedMotion(),
      active: active ? { ...active } : null,
      operation: { ...operation },
      prepared: Array.from(prepared),
      assets: Object.fromEntries(Object.entries(SCENARIOS).map(([key, config]) => [key, { asset: config.asset, poster: config.poster, variant: config.variant }])),
      stages: Array.from(stageRecords.values()).map((record) => ({
        key: record.key,
        status: record.status,
        hidden: record.stage.hidden,
        readyState: record.video.readyState,
        paused: record.video.paused,
        failures: record.failures,
        lastError: record.lastError,
        posterFallback: record.posterFallback,
        preload: record.video.preload,
        src: record.video.currentSrc || record.video.src || "",
      })),
      recentEvents: diagnosticsLog.slice(-18),
    });
  }

  function init() {
    if (initialized) return;
    installStyles();
    initialized = true;
    document.documentElement.dataset.grconMascotScenarios = "ready";
    ["pointerdown", "keydown", "input", "wheel", "touchstart"].forEach((name) => document.addEventListener(name, resetIdleTimer, { passive: true, capture: true }));
    document.addEventListener("click", handleNavigationPreparation, true);
    document.addEventListener("visibilitychange", handleVisibility);
    root.addEventListener("resize", () => {
      if (active) {
        const record = stageRecords.get(active.key);
        if (record) placeStage(record);
      }
    }, { passive: true });
    root.addEventListener("grcon:processing-state", handleOperationEvent);
    root.addEventListener("grcon:mascot-operation", handleOperationEvent);
    root.addEventListener("grcon:egrdt-generated", handleEgrdtGenerated);
    root.addEventListener("grcon:egrdt-teams-send", handleTeamsSend);
    root.addEventListener("grcon:egrdt-teams-notified", () => {
      if (active?.key === "teamsSend") root.setTimeout(() => { if (active?.key === "teamsSend") hideActive("teams-notified"); }, 650);
    });
    root.addEventListener("pagehide", () => {
      root.clearTimeout(idleTimer);
      root.clearTimeout(operationDelayTimer);
      stageRecords.forEach((record) => {
        clearLoadTimer(record);
        clearStaticTimer(record);
        try { record.video.pause(); } catch (_) { /* encerramento */ }
        record.video.removeAttribute("src");
      });
    }, { once: true });
    scheduleIdle();
    log("init", { version: VERSION, assetRevision: ASSET_REVISION });
  }

  root.GrconMascotScenarios = Object.freeze({
    version: VERSION,
    scenarios: SCENARIOS,
    prepare: (key) => prepare(key, "metadata"),
    play: (key, options) => show(key, options || {}),
    stop: (reason) => hideActive(reason || "api-stop"),
    diagnostics,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);