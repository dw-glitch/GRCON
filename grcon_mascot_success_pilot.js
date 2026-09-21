/* GRCON — piloto de microinteração de sucesso do Mascote da Qualidade.
 * Camada visual independente, ancorada a um componente real da interface.
 */
(function (root) {
  "use strict";

  const VERSION = "1.0.0";
  const ASSET_REVISION = "20260921.1";
  const OVERLAY_ID = "grcon-mascot-success-pilot";
  const STYLE_ID = "grcon-mascot-success-pilot-style";
  const VIDEO_PATH = "assets/mascot/video/grcon-mascot-success-pilot-alpha.webm";
  const DEFAULT_ANCHOR = "#egrdt-teams-ready";
  let active = false;
  let hideTimer = 0;
  let overlay = null;
  let video = null;
  let fallback = null;
  let anchor = null;

  function reducedMotion() {
    return Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function assetUrl(path) {
    const url = new URL(path.replace(/^\/+/, ""), root.location.origin + "/");
    url.searchParams.set("v", ASSET_REVISION);
    return url.href;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;z-index:245;display:none;pointer-events:none;contain:layout paint style;isolation:isolate;width:clamp(128px,14vw,210px);aspect-ratio:400/420;transform:translate3d(0,0,0);will-change:transform,opacity}
      #${OVERLAY_ID}[data-visible="true"]{display:block}
      #${OVERLAY_ID} video,#${OVERLAY_ID} img{display:block;width:100%;height:100%;object-fit:contain;background:transparent!important;pointer-events:none}
      #${OVERLAY_ID} video{filter:drop-shadow(0 6px 14px rgb(12 32 48 / 18%))}
      #${OVERLAY_ID} img{display:none;filter:drop-shadow(0 5px 12px rgb(12 32 48 / 16%))}
      #${OVERLAY_ID}[data-fallback="true"] video{display:none}
      #${OVERLAY_ID}[data-fallback="true"] img{display:block}
      @media (max-width:700px){#${OVERLAY_ID}{width:clamp(84px,28vw,120px)}}
      @media (prefers-reduced-motion:reduce){#${OVERLAY_ID}{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    installStyles();
    overlay = document.getElementById(OVERLAY_ID) || document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.dataset.visible = "false";
    overlay.dataset.fallback = "false";
    overlay.setAttribute("aria-hidden", "true");

    video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "none";
    video.disablePictureInPicture = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("disableRemotePlayback", "");
    video.setAttribute("aria-hidden", "true");

    fallback = document.createElement("img");
    fallback.src = "grcon-mascot-sprite.png?v=4.0.0-hd";
    fallback.alt = "";
    fallback.setAttribute("aria-hidden", "true");

    overlay.replaceChildren(video, fallback);
    if (!overlay.isConnected) document.body.appendChild(overlay);

    video.addEventListener("ended", () => hide("ended"));
    video.addEventListener("error", () => showFallback());
    return overlay;
  }

  function resolveAnchor(input) {
    if (input instanceof Element) return input;
    if (typeof input === "string" && input) return document.querySelector(input);
    const preferred = document.querySelector(DEFAULT_ANCHOR);
    if (preferred && !preferred.hidden) return preferred;
    return document.querySelector('[data-grcon-success-anchor="true"]');
  }

  function place() {
    if (!active || !anchor?.isConnected || !overlay) return;
    const rect = anchor.getBoundingClientRect();
    const box = overlay.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || root.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || root.innerHeight;
    const gap = viewportWidth <= 700 ? 6 : 10;

    let left = rect.right + gap;
    let top = rect.top + Math.max(0, rect.height - box.height);

    if (left + box.width > viewportWidth - 8) left = rect.left - box.width - gap;
    if (left < 8) left = Math.max(8, viewportWidth - box.width - 8);

    top = Math.max(8, Math.min(top, viewportHeight - box.height - 8));
    overlay.style.left = Math.round(left) + "px";
    overlay.style.top = Math.round(top) + "px";
  }

  function showFallback() {
    if (!overlay) return;
    overlay.dataset.fallback = "true";
    root.clearTimeout(hideTimer);
    hideTimer = root.setTimeout(() => hide("fallback-timeout"), 1600);
  }

  function hide(reason) {
    root.clearTimeout(hideTimer);
    if (video) {
      try { video.pause(); } catch (_) {}
      try { video.currentTime = 0; } catch (_) {}
      video.removeAttribute("src");
      try { video.load(); } catch (_) {}
    }
    active = false;
    anchor = null;
    if (overlay) {
      overlay.dataset.visible = "false";
      overlay.dataset.fallback = "false";
      overlay.dataset.reason = reason || "hidden";
    }
  }

  async function play(options) {
    const config = options || {};
    if (reducedMotion() && !config.force) return false;
    const target = resolveAnchor(config.anchor);
    if (!target || target.hidden || !target.isConnected) return false;

    ensureOverlay();
    anchor = target;
    active = true;
    overlay.dataset.visible = "true";
    overlay.dataset.fallback = "false";
    overlay.dataset.reason = "playing";
    place();

    video.src = assetUrl(VIDEO_PATH);
    video.preload = "auto";
    video.load();
    try {
      video.currentTime = 0;
      await video.play();
      place();
      root.clearTimeout(hideTimer);
      hideTimer = root.setTimeout(() => hide("safety-timeout"), 5200);
      return true;
    } catch (_) {
      showFallback();
      return false;
    }
  }

  function diagnostics() {
    return Object.freeze({
      version: VERSION,
      assetRevision: ASSET_REVISION,
      active,
      reducedMotion: reducedMotion(),
      anchor: anchor?.id || anchor?.className || "",
      source: video?.currentSrc || video?.src || assetUrl(VIDEO_PATH),
      visible: overlay?.dataset.visible === "true",
      fallback: overlay?.dataset.fallback === "true",
    });
  }

  function init() {
    installStyles();
    root.addEventListener("resize", place, { passive: true });
    root.addEventListener("scroll", place, { passive: true, capture: true });
    root.addEventListener("grcon:egrdt-teams-notified", () => {
      root.setTimeout(() => { void play({ anchor: DEFAULT_ANCHOR }); }, 100);
    });
    root.addEventListener("pagehide", () => hide("pagehide"), { once: true });
  }

  root.GrconMascotSuccessPilot = Object.freeze({ version: VERSION, play, hide, diagnostics });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
