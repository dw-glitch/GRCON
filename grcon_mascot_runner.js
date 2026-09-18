/* GRCON — corrida comemorativa do Mascote da Qualidade.
 * Isolada do controlador principal para não alterar os estados operacionais
 * (aceno/processamento) nem bloquear a interface durante a travessia.
 */
(function (root) {
  "use strict";

  const VERSION = "1.1.0";
  const ASSET_REVISION = "20260917.1";
  const STYLE_ID = "grcon-mascot-runner-style";
  const OVERLAY_ID = "grcon-mascot-runner";
  const SESSION_KEY = "grcon:mascot:runner:last-run";
  const COOLDOWN_MS = 90_000;
  const RUN_DURATION_MS = 5_040;
  const DEBUG = new URLSearchParams(root.location.search).get("grconMascotDebug") === "1";
  const source = new URL("assets/mascot/video/grcon-mascot-running-alpha.webm", `${root.location.origin}/`);
  source.searchParams.set("v", ASSET_REVISION);

  let operationActive = false;
  let pendingSuccess = false;
  let running = false;
  let runTimer = 0;
  let cleanupTimer = 0;
  let lastRunAt = readLastRun();

  function log(event, detail) {
    if (DEBUG) console.debug("GRCON Mascot Runner:", event, detail || "");
  }

  function readLastRun() {
    try { return Number(root.sessionStorage.getItem(SESSION_KEY)) || 0; }
    catch (_) { return 0; }
  }

  function rememberRun(time) {
    lastRunAt = time;
    try { root.sessionStorage.setItem(SESSION_KEY, String(time)); }
    catch (_) { /* o controle em memória ainda evita repetições */ }
  }

  function reducedMotion() {
    return Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function appLocked() {
    return document.documentElement.classList.contains("grcon-cloud-pending");
  }

  function canRun(options) {
    if (suppressed || running || document.hidden || reducedMotion()) return false;
    if (!options?.force && (appLocked() || Date.now() - lastRunAt < COOLDOWN_MS)) return false;
    const probe = document.createElement("video");
    return probe.canPlayType('video/webm; codecs="vp9"') !== "";
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;z-index:320;inset:0;overflow:hidden;pointer-events:none;contain:layout style paint;visibility:hidden}
      #${OVERLAY_ID}[data-running="true"]{visibility:visible}
      #${OVERLAY_ID} .grcon-mascot-runner-track{position:absolute;left:0;bottom:max(.4rem,env(safe-area-inset-bottom));inline-size:clamp(180px,22vw,240px);block-size:clamp(180px,22vw,240px);transform:translate3d(-110%,0,0);will-change:transform}
      #${OVERLAY_ID}[data-running="true"] .grcon-mascot-runner-track{animation:grcon-mascot-run-across ${RUN_DURATION_MS}ms linear both}
      #${OVERLAY_ID} video{display:block;inline-size:100%;block-size:100%;object-fit:contain;filter:drop-shadow(0 9px 10px rgb(7 35 56 / 24%));transform:translateZ(0)}
      html[data-theme="dark"] #${OVERLAY_ID} video{filter:drop-shadow(0 10px 13px rgb(0 0 0 / 46%))}
      @keyframes grcon-mascot-run-across{from{transform:translate3d(-110%,0,0)}to{transform:translate3d(calc(100vw + 10%),0,0)}}
      @media (max-width:640px){#${OVERLAY_ID} .grcon-mascot-runner-track{inline-size:170px;block-size:170px}}
      @media (prefers-reduced-motion:reduce){#${OVERLAY_ID}{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");
    overlay.dataset.running = "false";
    const track = document.createElement("div");
    track.className = "grcon-mascot-runner-track";
    const video = document.createElement("video");
    video.className = "grcon-mascot-runner-video";
    video.src = source.href;
    video.type = 'video/webm; codecs="vp9"';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = false;
    video.disablePictureInPicture = true;
    track.appendChild(video);
    overlay.appendChild(track);
    document.body.appendChild(overlay);
    return overlay;
  }

  function finishRun(reason) {
    root.clearTimeout(cleanupTimer);
    const overlay = document.getElementById(OVERLAY_ID);
    const video = overlay?.querySelector("video");
    if (video) {
      try { video.pause(); } catch (_) { /* sem ação */ }
      try { video.currentTime = 0; } catch (_) { /* mídia ainda não pronta */ }
    }
    if (overlay) overlay.dataset.running = "false";
    running = false;
    document.documentElement.dataset.grconMascotRunner = reason || "ready";
    log("finish", { reason: reason || "ended" });
  }

  async function run(options) {
    const config = options || {};
    if (!canRun(config)) {
      log("skip", { running, hidden: document.hidden, reducedMotion: reducedMotion(), locked: appLocked() });
      return false;
    }
    installStyles();
    const overlay = ensureOverlay();
    const track = overlay.querySelector(".grcon-mascot-runner-track");
    const video = overlay.querySelector("video");
    running = true;
    rememberRun(Date.now());
    document.documentElement.dataset.grconMascotRunner = "starting";
    overlay.dataset.running = "false";
    void track.offsetWidth;
    try {
      video.currentTime = 0;
      await video.play();
      overlay.dataset.running = "true";
      document.documentElement.dataset.grconMascotRunner = "running";
      cleanupTimer = root.setTimeout(() => finishRun("complete"), RUN_DURATION_MS + 300);
      log("start", { source: config.source || "api" });
      return true;
    } catch (error) {
      finishRun("media-error");
      console.warn("GRCON: vídeo de corrida do mascote indisponível; a interface foi mantida.", error);
      return false;
    }
  }

  function setSuppressed(value) {
    suppressed = Boolean(value);
    if (suppressed) {
      root.clearTimeout(runTimer);
      finishRun("suppressed");
    }
    log("suppressed", { value: suppressed });
    return suppressed;
  }

  function scheduleRun(sourceName) {
    root.clearTimeout(runTimer);
    if (suppressed) return;
    runTimer = root.setTimeout(() => { void run({ source: sourceName }); }, 380);
  }

  function handleOperation(event) {
    const active = Boolean(event?.detail?.active);
    if (active) {
      operationActive = true;
      pendingSuccess = false;
      return;
    }
    const completedSuccessfully = operationActive && pendingSuccess;
    operationActive = false;
    pendingSuccess = false;
    if (completedSuccessfully) scheduleRun("successful-operation");
  }

  function handleNotification(event) {
    if (operationActive && event?.detail?.kind === "success") pendingSuccess = true;
  }

  function diagnostics() {
    return Object.freeze({
      version: VERSION,
      assetRevision: ASSET_REVISION,
      source: source.href,
      running,
      operationActive,
      pendingSuccess,
      reducedMotion: reducedMotion(),
      appLocked: appLocked(),
      cooldownRemainingMs: Math.max(0, COOLDOWN_MS - (Date.now() - lastRunAt)),
    });
  }

  function init() {
    installStyles();
    ensureOverlay();
    document.documentElement.dataset.grconMascotRunner = reducedMotion() ? "reduced-motion" : "ready";
    root.addEventListener("grcon:processing-state", handleOperation);
    root.addEventListener("grcon:mascot-operation", handleOperation);
    root.addEventListener("grcon:notification", handleNotification);
    root.addEventListener("grcon:mascot-run", (event) => { void run(event?.detail || {}); });
    document.addEventListener("visibilitychange", () => { if (document.hidden && running) finishRun("hidden"); });
    root.addEventListener("pagehide", () => {
      root.clearTimeout(runTimer);
      finishRun("pagehide");
    }, { once: true });
    if (new URLSearchParams(root.location.search).get("grconMascotRun") === "1") {
      root.setTimeout(() => { void run({ force: true, source: "preview-query" }); }, 700);
    }
  }

  root.GrconMascotRunner = Object.freeze({ version: VERSION, run, setSuppressed, diagnostics });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
