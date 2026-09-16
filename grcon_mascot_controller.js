/* GRCON — controlador central do Mascote da Qualidade: PNG oficial + GSAP local. */
(function (root) {
  "use strict";

  const VERSION = "2.0.0";
  const ENGINE = "official-png-gsap-v2";
  const STYLE_ID = "grcon-mascot-gsap-style";
  const SELECTOR = ".grcon-brand-mascot, .grcon-mascot-context";
  const CSS_TARGET = ":is(.grcon-brand-mascot, .grcon-mascot-context)";
  const CORE = root.GRCONMascotGreetingCore;
  const gsap = root.gsap;
  const ASSETS = Object.freeze({
    body: new URL("assets/mascot/layers/grcon-mascot-body.png", document.baseURI).href,
    head: new URL("assets/mascot/layers/grcon-mascot-head.png", document.baseURI).href,
    arm: new URL("assets/mascot/layers/grcon-mascot-right-arm.png", document.baseURI).href,
  });
  const STATES = Object.freeze([
    "idle", "welcome", "hover", "analyzing", "searching-files",
    "checking-document", "confused", "success", "warning", "error",
    "uploading", "generating-grdt", "checking-ld", "sigem-pw-analysis", "loading",
  ]);
  const POSE_STATES = Object.freeze({
    default: "idle", quality: "idle", analysis: "analyzing", search: "searching-files",
    check: "checking-document", history: "checking-document", dashboard: "checking-document",
    "sigem-pw": "sigem-pw-analysis", egrdt: "generating-grdt", import: "uploading",
    report: "checking-document", warning: "warning", success: "success",
    pending: "loading", empty: "idle",
  });
  const TRANSIENT_STATES = new Set(["welcome", "success", "warning", "error"]);

  const records = new Map();
  let observer = null;
  let assetsReady = false;
  let assetsFailed = false;
  let operationActive = false;
  let operationState = "";
  let pendingOutcome = "";
  let pulseCall = null;
  let bubble = null;
  let activeBubbleHost = null;
  let pinnedBubbleHost = null;
  let welcomeShown = false;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      ${CSS_TARGET}.grcon-mascot-gsap {
        pointer-events: auto;
        overflow: visible;
        isolation: isolate;
        touch-action: manipulation;
      }
      .grcon-mascot-stage {
        position: absolute;
        z-index: 2;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        contain: layout paint style;
        transform: translateZ(0);
      }
      .grcon-mascot-gsap.is-gsap-ready .grcon-mascot-stage {
        opacity: 1;
        visibility: visible;
      }
      .grcon-mascot-gsap.is-gsap-ready > .grcon-mascot-sprite {
        opacity: 0;
        visibility: hidden;
      }
      .grcon-mascot-layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
        backface-visibility: hidden;
        transform: translateZ(0);
        pointer-events: none;
      }
      .grcon-mascot-body { z-index: 1; background-image: url("${ASSETS.body}"); transform-origin: 50% 82%; }
      .grcon-mascot-head { z-index: 3; background-image: url("${ASSETS.head}"); transform-origin: 50% 39%; }
      .grcon-mascot-arm { z-index: 7; background-image: url("${ASSETS.arm}"); transform-origin: 65.9% 41.1%; }
      .grcon-mascot-folder {
        position: absolute;
        z-index: 5;
        left: 9%;
        bottom: 5%;
        width: 43%;
        height: 31%;
        border: 1px solid rgb(12 92 133 / 52%);
        border-radius: 7% 10% 10% 8%;
        background: linear-gradient(155deg, #47b5df 0 18%, #1684b9 19% 100%);
        box-shadow: 0 4px 9px rgb(10 54 78 / 22%);
        opacity: 0;
        transform-origin: 18% 90%;
        pointer-events: none;
      }
      .grcon-mascot-folder::before {
        content: "";
        position: absolute;
        left: 7%;
        top: -20%;
        width: 44%;
        height: 28%;
        border: inherit;
        border-bottom: 0;
        border-radius: 18% 22% 0 0;
        background: #42acd5;
      }
      .grcon-mascot-paper {
        position: absolute;
        z-index: 4;
        width: 25%;
        aspect-ratio: .76;
        border: 1px solid rgb(15 98 142 / 48%);
        border-radius: 6% 12% 6% 6%;
        background:
          linear-gradient(rgb(31 139 190 / 70%), rgb(31 139 190 / 70%)) 22% 34% / 57% 5% no-repeat,
          linear-gradient(rgb(72 157 196 / 48%), rgb(72 157 196 / 48%)) 22% 50% / 45% 4% no-repeat,
          linear-gradient(rgb(72 157 196 / 38%), rgb(72 157 196 / 38%)) 22% 65% / 55% 4% no-repeat,
          linear-gradient(145deg, #fff 0 74%, #dcecf4 75% 100%);
        box-shadow: 0 3px 7px rgb(12 54 77 / 18%);
        color: #0b628f;
        font: 800 clamp(5px, .48em, 8px)/1 system-ui, sans-serif;
        text-align: center;
        padding-top: 12%;
        opacity: 0;
        transform-origin: 50% 82%;
        pointer-events: none;
      }
      .grcon-mascot-paper::after {
        content: "";
        position: absolute;
        inset: 0 0 auto auto;
        width: 27%;
        aspect-ratio: 1;
        border: 0 solid rgb(15 98 142 / 25%);
        border-width: 0 0 1px 1px;
        background: #d8eaf3;
        transform: translate(22%, -22%) rotate(45deg);
      }
      .grcon-mascot-paper-a { left: -6%; top: 31%; }
      .grcon-mascot-paper-b { right: -7%; top: 45%; }
      .grcon-mascot-paper-c { left: 18%; bottom: -8%; }
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
      }
      .grcon-mascot-speech[data-visible="true"] { visibility: visible; }
      @media (prefers-reduced-motion: reduce) {
        .grcon-mascot-stage, .grcon-mascot-layer, .grcon-mascot-folder, .grcon-mascot-paper {
          will-change: auto !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function reducedMotion() {
    return Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function preloadAssets() {
    return Promise.all(Object.values(ASSETS).map((source) => new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = resolve;
      image.onerror = () => reject(new Error(source.split("/").pop()));
      image.src = source;
    }))).then(() => {
      assetsReady = true;
      document.documentElement.dataset.grconMascotLayers = "ready";
      refresh(document);
    }).catch((error) => {
      assetsFailed = true;
      document.documentElement.dataset.grconMascotLayers = "fallback";
      console.warn(`GRCON: camadas do mascote indisponíveis (${error.message}); o PNG oficial permanece ativo.`);
    });
  }

  function makeStage(host) {
    let stage = host.querySelector(":scope > .grcon-mascot-stage");
    if (stage) return stage;
    stage = document.createElement("span");
    stage.className = "grcon-mascot-stage";
    stage.setAttribute("aria-hidden", "true");
    stage.innerHTML = [
      '<span class="grcon-mascot-layer grcon-mascot-body"></span>',
      '<span class="grcon-mascot-layer grcon-mascot-head"></span>',
      '<span class="grcon-mascot-paper grcon-mascot-paper-a">PDF</span>',
      '<span class="grcon-mascot-paper grcon-mascot-paper-b">LD</span>',
      '<span class="grcon-mascot-paper grcon-mascot-paper-c">DWG</span>',
      '<span class="grcon-mascot-folder"></span>',
      '<span class="grcon-mascot-layer grcon-mascot-arm"></span>',
    ].join("");
    host.appendChild(stage);
    return stage;
  }

  function parts(record) {
    const stage = record.stage;
    return {
      stage,
      body: stage.querySelector(".grcon-mascot-body"),
      head: stage.querySelector(".grcon-mascot-head"),
      arm: stage.querySelector(".grcon-mascot-arm"),
      folder: stage.querySelector(".grcon-mascot-folder"),
      paperA: stage.querySelector(".grcon-mascot-paper-a"),
      paperB: stage.querySelector(".grcon-mascot-paper-b"),
      paperC: stage.querySelector(".grcon-mascot-paper-c"),
    };
  }

  function resetVisual(record) {
    const p = parts(record);
    gsap.set([p.stage, p.body, p.head, p.arm], {
      x: 0, y: 0, rotation: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1,
    });
    gsap.set([p.folder, p.paperA, p.paperB, p.paperC], {
      x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 0,
    });
    p.paperA.textContent = "PDF";
    p.paperB.textContent = "LD";
    p.paperC.textContent = "DWG";
  }

  function killMotion(record) {
    record.timeline?.kill();
    record.ambient?.kill();
    record.microTimeline?.kill();
    record.microCall?.kill();
    record.returnCall?.kill();
    record.context?.revert();
    record.timeline = null;
    record.ambient = null;
    record.microTimeline = null;
    record.microCall = null;
    record.returnCall = null;
    record.context = null;
  }

  function scheduleIdleVariation(record) {
    record.microCall?.kill();
    const delay = gsap.utils.random(3.4, 6.8, .1);
    record.microCall = gsap.delayedCall(delay, () => {
      if (record.state !== "idle" || document.hidden) return scheduleIdleVariation(record);
      const p = parts(record);
      const variant = Math.floor(gsap.utils.random(0, 3));
      const timeline = gsap.timeline({
        defaults: { ease: "sine.inOut" },
        onComplete: () => scheduleIdleVariation(record),
      });
      if (variant === 0) {
        timeline.to(p.head, { rotation: -2.2, x: -.5, duration: .65 })
          .to(p.head, { rotation: 0, x: 0, duration: .9 });
      } else if (variant === 1) {
        timeline.to(p.head, { rotation: 1.8, y: -.6, duration: .72 })
          .to(p.head, { rotation: -.4, y: 0, duration: .62 })
          .to(p.head, { rotation: 0, duration: .48 });
      } else {
        timeline.to(p.stage, { x: .7, rotation: .35, duration: .8 })
          .to(p.stage, { x: 0, rotation: 0, duration: 1.05 });
      }
      record.microTimeline = timeline;
    });
  }

  function idleTimeline(record) {
    const p = parts(record);
    record.ambient = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut" } })
      .to(p.body, { y: -1.1, scaleX: 1.003, scaleY: .997, duration: 2.35 }, 0)
      .to(p.head, { y: -.65, duration: 2.55 }, .18)
      .to(p.arm, { y: -.45, rotation: -.35, duration: 2.45 }, .28);
    scheduleIdleVariation(record);
    return record.ambient;
  }

  function welcomeTimeline(record) {
    const p = parts(record);
    return gsap.timeline({ defaults: { ease: "power2.inOut" } })
      .to(p.body, { x: -1, rotation: -.8, duration: .36 }, 0)
      .to(p.head, { x: -.5, rotation: -2.2, duration: .42 }, .07)
      .to(p.arm, { x: -1, y: -1, rotation: -55, duration: .52, ease: "back.out(1.35)" }, .16)
      .to(p.arm, { rotation: -45, duration: .22, yoyo: true, repeat: 3, ease: "sine.inOut" }, .7)
      .to(p.arm, { x: 0, y: 0, rotation: 0, duration: .6, ease: "power3.inOut" }, 1.58)
      .to([p.body, p.head], { x: 0, y: 0, rotation: 0, duration: .62 }, 1.54);
  }

  function hoverTimeline(record) {
    const p = parts(record);
    return gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut" } })
      .to(p.body, { y: -1, scaleY: .997, duration: 1.8 }, 0)
      .to(p.head, { y: -.7, rotation: 1.1, duration: 2.05 }, .08)
      .to(p.arm, { rotation: -2.2, duration: 1.9 }, .18);
  }

  function searchingTimeline(record) {
    const p = parts(record);
    gsap.set(p.folder, { autoAlpha: 1, x: -2, y: 3, rotation: -4, scale: .92 });
    return gsap.timeline({ repeat: -1, defaults: { ease: "power2.inOut" } })
      .to(p.folder, { x: 0, y: 0, rotation: 0, scale: 1, duration: .55, ease: "back.out(1.2)" }, 0)
      .to(p.head, { x: -1, rotation: -4, duration: .56 }, .08)
      .to(p.body, { x: -.7, rotation: -.55, duration: .62 }, .12)
      .fromTo(p.paperA,
        { autoAlpha: 0, x: -8, y: 10, rotation: -20, scale: .82 },
        { autoAlpha: 1, x: 2, y: -3, rotation: -11, scale: 1, duration: .62, ease: "back.out(1.25)" }, .46)
      .to(p.head, { x: 1, rotation: 4.2, duration: .72, ease: "sine.inOut" }, .82)
      .to(p.paperA, { x: 11, y: -10, rotation: 7, autoAlpha: 0, duration: .58 }, 1.4)
      .fromTo(p.paperB,
        { autoAlpha: 0, x: 9, y: 9, rotation: 20, scale: .84 },
        { autoAlpha: 1, x: -2, y: -4, rotation: 10, scale: 1, duration: .66, ease: "back.out(1.2)" }, 1.32)
      .to(p.head, { x: -1, y: .5, rotation: -3.2, duration: .64 }, 1.68)
      .to(p.paperB, { x: -11, y: -10, rotation: -6, autoAlpha: 0, duration: .58 }, 2.22)
      .fromTo(p.paperC,
        { autoAlpha: 0, x: -5, y: 10, rotation: -7, scale: .82 },
        { autoAlpha: 1, x: 2, y: -4, rotation: 7, scale: 1, duration: .62, ease: "back.out(1.2)" }, 2.12)
      .to(p.head, { x: .5, y: .8, rotation: 2.8, duration: .58 }, 2.42)
      .to(p.arm, { x: -1, y: -1, rotation: 118, duration: .72, ease: "back.out(1.1)" }, 2.68)
      .to(p.arm, { x: -2, y: -2, rotation: 106, duration: .18, yoyo: true, repeat: 5, ease: "sine.inOut" }, 3.4)
      .to(p.head, { x: -.5, rotation: -2, duration: .72, ease: "sine.inOut" }, 3.24)
      .to(p.paperC, { x: 10, y: -11, rotation: 14, autoAlpha: 0, duration: .62 }, 3.78)
      .to(p.arm, { x: 0, y: 0, rotation: 0, duration: .72, ease: "power3.inOut" }, 4.38)
      .to(p.folder, { x: -1, y: 2, rotation: -3, scale: .95, duration: .62 }, 4.54)
      .to([p.head, p.body], { x: 0, y: 0, rotation: 0, duration: .76, ease: "sine.inOut" }, 4.62)
      .to(p.folder, { x: -2, y: 3, rotation: -4, scale: .92, duration: .58 }, 5.24)
      .to({}, { duration: .16 });
  }

  function checkingTimeline(record) {
    const p = parts(record);
    p.paperA.textContent = "OK?";
    gsap.set(p.paperA, { autoAlpha: 1, x: 14, y: 5, rotation: 7, scale: 1.08 });
    return gsap.timeline({ repeat: -1, defaults: { ease: "sine.inOut" } })
      .to(p.head, { x: 1, y: .5, rotation: 3.2, duration: .8 }, 0)
      .to(p.arm, { rotation: -14, x: -1, duration: .72 }, .14)
      .to(p.paperA, { y: 1, rotation: 4, duration: .9 }, .08)
      .to(p.head, { x: -1, rotation: -2.4, duration: .82 }, .86)
      .to(p.paperA, { y: 6, rotation: 8, duration: .82 }, .98)
      .to(p.arm, { rotation: -5, x: 0, duration: .68 }, 1.12)
      .to([p.head, p.arm, p.paperA], { x: 0, y: 0, rotation: 0, duration: .74 }, 1.82)
      .to({}, { duration: .22 });
  }

  function confusedTimeline(record) {
    const p = parts(record);
    return gsap.timeline({ repeat: -1, repeatDelay: .35, defaults: { ease: "power2.inOut" } })
      .to(p.head, { x: -1, rotation: -5, duration: .55 }, 0)
      .to(p.head, { x: 1, rotation: 4, duration: .62 }, .62)
      .to(p.arm, { x: -1, y: -1, rotation: 118, duration: .7, ease: "back.out(1.15)" }, .76)
      .to(p.arm, { x: -2, y: -2, rotation: 106, duration: .18, yoyo: true, repeat: 4 }, 1.46)
      .to(p.arm, { x: 0, y: 0, rotation: 0, duration: .7 }, 2.35)
      .to(p.head, { x: 0, rotation: 0, duration: .7 }, 2.42);
  }

  function compareTimeline(record) {
    const p = parts(record);
    p.paperA.textContent = "SIGEM";
    p.paperB.textContent = "PW";
    gsap.set(p.paperA, { autoAlpha: 1, x: 2, y: -2, rotation: -10 });
    gsap.set(p.paperB, { autoAlpha: 1, x: -2, y: -2, rotation: 10 });
    return gsap.timeline({ repeat: -1, defaults: { ease: "sine.inOut" } })
      .to(p.head, { x: -1, rotation: -3.5, duration: .72 }, 0)
      .to(p.paperA, { y: -5, rotation: -7, duration: .76 }, .08)
      .to(p.head, { x: 1, rotation: 3.7, duration: .76 }, .78)
      .to(p.paperB, { y: -5, rotation: 7, duration: .76 }, .84)
      .to(p.arm, { rotation: -18, x: -1, duration: .62 }, 1.22)
      .to([p.paperA, p.paperB], { x: 0, y: -3, rotation: 0, duration: .84 }, 1.5)
      .to(p.head, { x: 0, rotation: 0, duration: .72 }, 1.68)
      .to(p.arm, { rotation: 0, x: 0, duration: .7 }, 2.04)
      .to([p.paperA, p.paperB], { y: -2, duration: .7 }, 2.22)
      .to({}, { duration: .18 });
  }

  function successTimeline(record) {
    const p = parts(record);
    return gsap.timeline({ defaults: { ease: "power2.out" } })
      .to(p.stage, { y: -4, scale: 1.035, duration: .34, ease: "back.out(1.55)" }, 0)
      .to(p.head, { rotation: -2.5, duration: .36 }, .05)
      .to(p.arm, { rotation: -42, x: -1, y: -1, duration: .48, ease: "back.out(1.35)" }, .12)
      .to(p.stage, { y: 0, scale: 1, duration: .52, ease: "bounce.out" }, .42)
      .to(p.arm, { rotation: -35, duration: .24, yoyo: true, repeat: 1 }, .68)
      .to([p.arm, p.head], { x: 0, y: 0, rotation: 0, duration: .62, ease: "power3.inOut" }, 1.28);
  }

  function warningTimeline(record, errorState) {
    const p = parts(record);
    return gsap.timeline({ repeat: errorState ? 1 : 0, yoyo: errorState, defaults: { ease: "power2.inOut" } })
      .to(p.head, { x: -1, rotation: -4.5, duration: .42 }, 0)
      .to(p.body, { rotation: -.8, duration: .45 }, .05)
      .to(p.arm, { rotation: -22, duration: .5 }, .12)
      .to(p.head, { x: 1, rotation: 3.5, duration: .52 }, .52)
      .to([p.head, p.body, p.arm], { x: 0, rotation: 0, duration: .66 }, 1.08);
  }

  function workingTimeline(record, state) {
    if (state === "sigem-pw-analysis") return compareTimeline(record);
    if (state === "searching-files" || state === "checking-ld" || state === "analyzing") return searchingTimeline(record);
    if (state === "confused") return confusedTimeline(record);
    if (state === "checking-document" || state === "generating-grdt" || state === "uploading" || state === "loading") return checkingTimeline(record);
    return idleTimeline(record);
  }

  function normalizeState(state) {
    return STATES.includes(state) ? state : "idle";
  }

  function playForRecord(record, requestedState, options) {
    const state = normalizeState(requestedState);
    if (!assetsReady || assetsFailed || !gsap) return false;
    if (record.state === state && record.timeline?.isActive()) return true;
    killMotion(record);
    record.state = state;
    record.host.dataset.grconMascotState = state;
    record.context = gsap.context(() => {
      resetVisual(record);
      if (reducedMotion()) {
        const p = parts(record);
        if (["searching-files", "checking-ld", "analyzing", "loading"].includes(state)) {
          gsap.set(p.folder, { autoAlpha: .9, rotation: -2 });
          gsap.set(p.paperA, { autoAlpha: .92, x: 2, y: -2, rotation: -8 });
        }
        record.timeline = gsap.timeline().to(record.stage, { y: -1, duration: .35 }).to(record.stage, { y: 0, duration: .45 });
        return;
      }
      if (state === "idle") record.timeline = idleTimeline(record);
      else if (state === "welcome") record.timeline = welcomeTimeline(record);
      else if (state === "hover") record.timeline = hoverTimeline(record);
      else if (state === "success") record.timeline = successTimeline(record);
      else if (state === "warning") record.timeline = warningTimeline(record, false);
      else if (state === "error") record.timeline = warningTimeline(record, true);
      else record.timeline = workingTimeline(record, state);
    }, record.host);
    if (["welcome", "success", "warning", "error"].includes(state) && !options?.hold) {
      const delay = state === "welcome" ? 2.45 : state === "success" ? 2.35 : 3.1;
      record.returnCall = gsap.delayedCall(delay, () => {
        if (record.state === state && !operationActive) playForRecord(record, "idle", { source: "return" });
      });
    }
    if (document.hidden) record.timeline?.pause();
    return true;
  }

  function stateForHost(host) {
    if (operationActive) return operationState || "analyzing";
    if (host.classList.contains("grcon-mascot-context")) return POSE_STATES[host.dataset.pose] || "idle";
    return "idle";
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
    gsap?.fromTo(target, { autoAlpha: 0, y: 5, scale: .965 }, { autoAlpha: 1, y: 0, scale: 1, duration: .32, ease: "power2.out", overwrite: true });
  }

  function hideGreeting(force) {
    if (pinnedBubbleHost && !force) return;
    const target = ensureBubble();
    gsap?.to(target, {
      autoAlpha: 0, y: 4, scale: .975, duration: .22, ease: "power1.in", overwrite: true,
      onComplete: () => { target.dataset.visible = "false"; target.setAttribute("aria-hidden", "true"); },
    });
    activeBubbleHost = null;
    if (force) pinnedBubbleHost = null;
  }

  function onPointerMove(record, event) {
    if (record.state !== "hover" || reducedMotion()) return;
    const bounds = record.host.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1));
    const p = parts(record);
    gsap.to(p.head, { x: x * 1.4, y: y * .7, rotation: x * 2.2, duration: .42, ease: "power2.out", overwrite: "auto" });
  }

  function enhance(host) {
    if (!host || records.has(host)) return records.get(host);
    const stage = makeStage(host);
    const record = { host, stage, state: "", timeline: null, ambient: null, context: null };
    records.set(host, record);
    host.classList.add("grcon-mascot-gsap");
    host.setAttribute("tabindex", "0");
    host.setAttribute("role", "button");
    host.setAttribute("aria-haspopup", "true");
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
    const move = (event) => onPointerMove(record, event);
    const focus = () => { if (!operationActive) { playForRecord(record, "hover"); showGreeting(host, false); } };
    const blur = () => { hideGreeting(false); if (!operationActive) playForRecord(record, stateForHost(host)); };
    const click = (event) => {
      event.stopPropagation();
      if (pinnedBubbleHost === host) hideGreeting(true);
      else showGreeting(host, true);
    };
    const keydown = (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); click(event); }
      else if (event.key === "Escape") hideGreeting(true);
    };
    Object.assign(record, { enter, leave, move, focus, blur, click, keydown });
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("focus", focus);
    host.addEventListener("blur", blur);
    host.addEventListener("click", click);
    host.addEventListener("keydown", keydown);
    if (assetsReady) {
      host.classList.add("is-gsap-ready");
      playForRecord(record, stateForHost(host), { source: "enhance" });
    }
    return record;
  }

  function dispose(record) {
    killMotion(record);
    const host = record.host;
    host.removeEventListener("pointerenter", record.enter);
    host.removeEventListener("pointerleave", record.leave);
    host.removeEventListener("pointermove", record.move);
    host.removeEventListener("focus", record.focus);
    host.removeEventListener("blur", record.blur);
    host.removeEventListener("click", record.click);
    host.removeEventListener("keydown", record.keydown);
    records.delete(host);
  }

  function refresh(scope) {
    if (!gsap || assetsFailed) return;
    const source = scope?.querySelectorAll ? scope : document;
    if (source.matches?.(SELECTOR)) enhance(source);
    source.querySelectorAll(SELECTOR).forEach(enhance);
    records.forEach((record) => {
      if (!record.host.isConnected) { dispose(record); return; }
      if (assetsReady) {
        record.host.classList.add("is-gsap-ready");
        const desired = stateForHost(record.host);
        if (record.state !== desired && record.state !== "hover" && !TRANSIENT_STATES.has(record.state)) {
          playForRecord(record, desired, { source: "refresh" });
        }
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
      killMotion(record);
      resetVisual(record);
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
    else play(state, { source: "notification" });
  }

  function handlePulse(event) {
    const duration = Math.min(3000, Math.max(700, Number(event?.detail?.duration) || 1100));
    pulseCall?.kill();
    if (!operationActive) play(mapTask(event?.detail?.task, event?.detail?.state), { source: "pulse" });
    pulseCall = gsap.delayedCall(duration / 1000, () => { if (!operationActive) play("idle", { source: "pulse-end" }); });
  }

  function maybeWelcome() {
    if (welcomeShown || operationActive || !assetsReady) return;
    const name = CORE?.resolveFirstName?.(currentIdentity());
    if (!name) return;
    const host = document.querySelector(".grcon-brand-mascot");
    if (!host) return;
    welcomeShown = true;
    showGreeting(host, false);
    playForRecord(records.get(host), "welcome", { source: "welcome" });
    gsap.delayedCall(3.2, () => { if (activeBubbleHost === host && !pinnedBubbleHost) hideGreeting(false); });
  }

  function init() {
    installStyles();
    document.documentElement.dataset.grconMascotEngine = gsap ? ENGINE : "official-png-static-fallback";
    if (!gsap) {
      assetsFailed = true;
      console.warn("GRCON: GSAP local indisponível; o PNG oficial permanece ativo.");
      return;
    }
    ensureBubble();
    refresh(document);
    void preloadAssets().then(maybeWelcome);
    observer = new MutationObserver((mutations) => {
      let needsRefresh = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length) needsRefresh = true;
        if (mutation.type === "attributes") needsRefresh = true;
      });
      if (needsRefresh) root.requestAnimationFrame(() => refresh(document));
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
    document.addEventListener("visibilitychange", () => {
      records.forEach((record) => {
        if (document.hidden) { record.timeline?.pause(); record.ambient?.pause(); }
        else { record.timeline?.resume(); record.ambient?.resume(); }
      });
    });
    root.addEventListener("resize", () => { if (activeBubbleHost) positionBubble(activeBubbleHost); }, { passive: true });
    root.addEventListener("scroll", () => { if (activeBubbleHost) positionBubble(activeBubbleHost); }, { passive: true, capture: true });
    root.addEventListener("pagehide", () => {
      observer?.disconnect();
      pulseCall?.kill();
      records.forEach(dispose);
    }, { once: true });
  }

  function diagnostics() {
    return Object.freeze({
      version: VERSION,
      engine: document.documentElement.dataset.grconMascotEngine || "official-png-static-fallback",
      gsap: Boolean(gsap),
      ready: assetsReady,
      fallback: assetsFailed || !gsap,
      instances: records.size,
      timelines: Array.from(records.values()).filter((record) => record.timeline).length,
      states: Array.from(records.values()).map((record) => record.state),
      operationActive,
      operationState,
      reducedMotion: reducedMotion(),
      source: "official-png-raster-layers",
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
