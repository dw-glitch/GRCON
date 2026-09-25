/* GRCON — corrida horizontal do mascote em faixa estrutural fora do workspace. */
(function (root) {
  "use strict";

  const VERSION = "6.0.0";
  const ASSET_REVISION = "20260917.1";
  const STYLE_ID = "grcon-mascot-runner-style";
  const STRIP_ID = "grcon-mascot-activity-strip";
  const INNER_CLASS = "grcon-mascot-activity-inner";
  const TRACK_CLASS = "grcon-mascot-runner-track";
  const RUN_DURATION_MS = 5_040;
  const source = new URL("assets/mascot/video/grcon-mascot-running-alpha.webm", root.location.origin + "/");
  source.searchParams.set("v", ASSET_REVISION);

  let strip = null;
  let track = null;
  let video = null;
  let running = false;

  function reducedMotion() {
    return Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + STRIP_ID + "[hidden]{display:none!important}",
      "#" + STRIP_ID + "{position:relative;z-index:20;width:100%;height:clamp(82px,7.8vw,108px);overflow:hidden;pointer-events:none;user-select:none;background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--border-1,#d8e1e7) 74%,transparent);box-shadow:none;contain:layout style paint}",
      "#" + STRIP_ID + " ." + INNER_CLASS + "{position:relative;width:min(100%,var(--content-max,1920px));height:100%;margin-inline:auto;overflow:hidden;pointer-events:none}",
      "#" + STRIP_ID + " ." + TRACK_CLASS + "{position:absolute;left:0;bottom:0;width:clamp(150px,16vw,220px);height:100%;transform:translate3d(-120%,0,0);will-change:transform;pointer-events:none}",
      "#" + STRIP_ID + "[data-active='true'] ." + TRACK_CLASS + "{animation:grcon-mascot-strip-run " + RUN_DURATION_MS + "ms linear infinite}",
      "#" + STRIP_ID + " video{display:block;width:100%;height:100%;object-fit:contain;background:transparent!important;border:0;box-shadow:none;filter:drop-shadow(0 6px 10px rgb(7 35 56 / 20%));pointer-events:none}",
      "html[data-theme='dark'] #" + STRIP_ID + " video{filter:drop-shadow(0 7px 12px rgb(0 0 0 / 42%))}",
      "@keyframes grcon-mascot-strip-run{from{transform:translate3d(-120%,0,0)}to{transform:translate3d(calc(100vw + 20%),0,0)}}",
      "@media(max-width:700px){#" + STRIP_ID + "{height:68px}#" + STRIP_ID + " ." + TRACK_CLASS + "{width:126px}}",
      "@media(max-width:390px){#" + STRIP_ID + "{height:62px}#" + STRIP_ID + " ." + TRACK_CLASS + "{width:116px}}",
      "@media(prefers-reduced-motion:reduce){#" + STRIP_ID + "{display:none!important}#" + STRIP_ID + " ." + TRACK_CLASS + "{animation:none!important}}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function ensureStrip() {
    if (strip?.isConnected && track?.isConnected && video?.isConnected) return strip;
    installStyles();
    strip = document.getElementById(STRIP_ID) || document.createElement("section");
    strip.id = STRIP_ID;
    strip.className = "grcon-mascot-activity-strip";
    strip.setAttribute("aria-hidden", "true");
    strip.dataset.active = "false";
    strip.hidden = true;

    let inner = strip.querySelector("." + INNER_CLASS);
    if (!inner) {
      inner = document.createElement("div");
      inner.className = INNER_CLASS;
      strip.appendChild(inner);
    }

    track = inner.querySelector("." + TRACK_CLASS);
    if (!track) {
      track = document.createElement("div");
      track.className = TRACK_CLASS;
      inner.appendChild(track);
    }

    video = track.querySelector("video");
    if (!video) {
      video = document.createElement("video");
      video.className = "grcon-mascot-runner-video";
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.loop = true;
      video.disablePictureInPicture = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("disableRemotePlayback", "");
      video.setAttribute("aria-hidden", "true");
      track.appendChild(video);
    }
    if (video.getAttribute("src") !== source.href) video.src = source.href;

    const shell = document.querySelector(".app-shell");
    const topbar = document.querySelector(".topbar");
    if (!strip.isConnected) {
      if (shell?.parentNode) shell.parentNode.insertBefore(strip, shell);
      else if (topbar?.parentNode) topbar.parentNode.insertBefore(strip, topbar.nextSibling);
      else document.body.prepend(strip);
    } else if (shell?.parentNode && strip.nextElementSibling !== shell) {
      shell.parentNode.insertBefore(strip, shell);
    }
    return strip;
  }

  function resetTrack() {
    if (!track) return;
    track.style.animation = "none";
    void track.offsetWidth;
    track.style.removeProperty("animation");
  }

  function stop(reason) {
    ensureStrip();
    try { video.pause(); } catch (_) {}
    try { video.currentTime = 0; } catch (_) {}
    strip.dataset.active = "false";
    strip.dataset.reason = reason || "stopped";
    strip.hidden = true;
    running = false;
    document.documentElement.dataset.grconMascotRunner = reason || "ready";
    return true;
  }

  async function run(options) {
    const config = options || {};
    ensureStrip();
    if (reducedMotion() || document.hidden) {
      stop(reducedMotion() ? "reduced-motion" : "hidden");
      return false;
    }
    if (running) return true;

    running = true;
    strip.hidden = false;
    strip.dataset.active = "true";
    delete strip.dataset.reason;
    document.documentElement.dataset.grconMascotRunner = "starting";
    resetTrack();
    try {
      video.currentTime = 0;
      const playResult = video.play();
      if (playResult?.then) await playResult;
      document.documentElement.dataset.grconMascotRunner = "running";
      return true;
    } catch (error) {
      stop("media-error");
      console.warn("GRCON: vídeo original de corrida do mascote indisponível; a faixa foi encerrada sem bloquear a interface.", error);
      return false;
    }
  }

  function diagnostics() {
    const shell = document.querySelector(".app-shell");
    const stripRect = strip?.getBoundingClientRect?.();
    const shellRect = shell?.getBoundingClientRect?.();
    return Object.freeze({
      version: VERSION,
      assetRevision: ASSET_REVISION,
      source: source.href,
      running,
      active: strip?.dataset.active === "true",
      stripAttached: Boolean(strip?.isConnected),
      outsideWorkspace: Boolean(stripRect && shellRect && stripRect.bottom <= shellRect.top + 1),
      reducedMotion: reducedMotion(),
    });
  }

  function init() {
    ensureStrip();
    document.documentElement.dataset.grconMascotRunner = reducedMotion() ? "reduced-motion" : "ready";
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && running) stop("hidden");
    });
    root.addEventListener("pagehide", () => stop("pagehide"), { once: true });
  }

  root.GrconMascotRunner = Object.freeze({ version: VERSION, run, stop, diagnostics });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
