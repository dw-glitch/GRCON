/* GRCON — dança silenciosa com alfa real, somente após inatividade. */
(function (root) {
  "use strict";
  if (root.GrconMascotIdleDance) return;

  const IDLE_MS = 120_000;
  const ID = "grcon-mascot-idle-dance";
  const PREF_KEY = "grcon:mascot:animations";
  const SOURCE = "assets/mascot/video/grcon-mascot-dance-alpha.webm?v=20261016.1";
  const motion = root.matchMedia?.("(prefers-reduced-motion: reduce)");
  let timer = 0;
  let lastActivity = Date.now();
  let host = null;
  let video = null;
  let active = false;
  let token = 0;
  let suspended = false;
  let failed = false;

  function eligible() {
    const runtime = root.GrconMascot?.diagnostics?.();
    return !suspended && !failed && !document.hidden && !motion?.matches &&
      !document.documentElement.classList.contains("grcon-cloud-pending") &&
      root.GrconMascot?.isEnabled?.() === true && runtime?.ready === true &&
      runtime.state === "idle" && runtime.activeOperations === 0 &&
      !document.querySelector('dialog[open], [aria-modal="true"]:not([hidden]):not([aria-hidden="true"])');
  }

  function hide() {
    token++;
    active = false;
    if (host) host.hidden = true;
    if (video) { try { video.pause(); } catch (_) {} }
    delete document.documentElement.dataset.grconMascotIdleDance;
  }

  function ensureVideo() {
    if (host) return;
    const style = document.createElement("style");
    style.textContent = [
      "#" + ID + "[hidden]{display:none!important}",
      "#" + ID + "{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));width:clamp(140px,15vw,190px);height:clamp(140px,15vw,190px);z-index:310;pointer-events:none;user-select:none;background:transparent;border:0;box-shadow:none}",
      "#" + ID + " video{display:block;width:100%;height:100%;object-fit:contain;background:transparent;pointer-events:none}",
      "html[data-grcon-mascot-idle-dance='active'] #grcon-context-mascot{visibility:hidden!important}",
      "@media(prefers-reduced-motion:reduce){#" + ID + "{display:none!important}}",
    ].join("\n");
    document.head.appendChild(style);
    host = document.createElement("div");
    host.id = ID;
    host.hidden = true;
    host.setAttribute("aria-hidden", "true");
    video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "none";
    video.disablePictureInPicture = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("disableRemotePlayback", "");
    video.addEventListener("error", () => { failed = true; hide(); });
    host.appendChild(video);
    document.body.appendChild(host);
  }

  function schedule() {
    root.clearTimeout(timer);
    timer = 0;
    if (suspended || document.hidden || failed) return;
    const remaining = IDLE_MS - (Date.now() - lastActivity);
    timer = root.setTimeout(check, remaining > 0 ? remaining : 5_000);
  }

  async function check() {
    timer = 0;
    if (Date.now() - lastActivity < IDLE_MS || !eligible()) { schedule(); return; }
    ensureVideo();
    const currentToken = ++token;
    try {
      if (!video.getAttribute("src")) video.src = SOURCE;
      video.currentTime = 0;
      await video.play();
      if (currentToken !== token || !eligible()) return;
      active = true;
      host.hidden = false;
      document.documentElement.dataset.grconMascotIdleDance = "active";
    } catch (_) {
      if (currentToken === token) { failed = true; hide(); }
    }
  }

  function activity() {
    lastActivity = Date.now();
    if (active || (video && !video.paused)) hide();
    else token++;
    // Keep one deadline; mouse movement never allocates a timer for every event.
    if (!timer) schedule();
  }

  function reset() {
    hide();
    lastActivity = Date.now();
    schedule();
  }

  function init() {
    for (const event of ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "touchstart", "focusin"]) {
      root.addEventListener(event, activity, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", reset);
    root.addEventListener("blur", () => { suspended = true; reset(); });
    root.addEventListener("focus", () => { suspended = false; reset(); });
    root.addEventListener("storage", (event) => { if (event.key === PREF_KEY || event.key === null) reset(); });
    root.addEventListener("grcon:identity-changed", reset);
    motion?.addEventListener?.("change", reset);
    new MutationObserver(reset).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-grcon-mascot-state", "data-grcon-mascot-animations"],
    });
    new MutationObserver(() => {
      if (active && !eligible()) reset();
    }).observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["open", "hidden", "aria-hidden", "aria-modal"] });
    root.addEventListener("pagehide", () => { suspended = true; reset(); });
    root.addEventListener("pageshow", () => { suspended = false; reset(); });
    schedule();
  }

  root.GrconMascotIdleDance = Object.freeze({
    diagnostics: () => ({ active, failed, idleMs: IDLE_MS, idleForMs: Date.now() - lastActivity, loaded: Boolean(video?.getAttribute("src")) }),
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
