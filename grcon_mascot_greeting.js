/* GRCON — interação natural e acessível do Mascote da Qualidade. */
(function (root) {
  "use strict";

  const Core = root.GRCONMascotGreetingCore;
  if (!Core) {
    console.warn("GRCON: núcleo da saudação do mascote indisponível.");
    return;
  }

  const STYLE_ID = "grcon-mascot-greeting-style";
  const BUBBLE_ID = "grcon-mascot-greeting-bubble";
  const SELECTOR = ".grcon-brand-mascot, .grcon-mascot-context";
  const EDGE_GAP = 8;
  const MASCOT_GAP = 12;
  const GENERATED_ASSETS = Object.freeze({
    run: new URL("assets/mascot/animated/grcon-mascot-run-sprite.png", document.baseURI).href,
    wave: new URL("assets/mascot/animated/grcon-mascot-wave.png", document.baseURI).href,
    analyze: new URL("assets/mascot/animated/grcon-mascot-analyze.png", document.baseURI).href,
    success: new URL("assets/mascot/animated/grcon-mascot-success.png", document.baseURI).href,
  });
  let bubble = null;
  let activeMascot = null;
  let pinnedMascot = null;
  let observer = null;
  let explicitControlProcessing = false;
  let processingHoldUntil = 0;
  let processingHoldTimer = 0;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .grcon-mascot-greeting {
        cursor: pointer;
        overflow: visible;
        pointer-events: auto;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }
      .grcon-mascot-greeting:focus-visible {
        border-radius: 42%;
        outline: none;
        box-shadow: var(--focus, 0 0 0 3px rgb(20 121 166 / 23%));
      }
      .grcon-mascot-greeting .grcon-mascot-motion {
        width: 100%;
        height: 100%;
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
        transform: translate3d(0, 0, 0) scale(1);
        transform-origin: 52% 88%;
        transition:
          transform 540ms cubic-bezier(.16, 1, .3, 1),
          filter 440ms ease-out;
      }
      .grcon-mascot-greeting .grcon-mascot-pose-motion {
        width: 100%;
        height: 100%;
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
        transform: translate3d(0, 0, 0);
        transform-origin: 52% 86%;
      }
      .grcon-mascot-greeting .grcon-mascot-sprite {
        position: relative;
        z-index: 1;
        flex: 0 0 auto;
        transform: translate3d(0, 0, 0) rotate(0deg);
        transform-origin: 52% 82%;
        transition:
          transform 620ms cubic-bezier(.18, .89, .32, 1.14),
          opacity 160ms ease-out;
      }
      .grcon-mascot-generated-layer {
        position: absolute;
        z-index: 2;
        inset: 0;
        width: 100%;
        height: 100%;
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
        filter: drop-shadow(0 5px 12px rgb(12 32 48 / 18%));
        opacity: 0;
        pointer-events: none;
        transform: translateZ(0);
        transition: opacity 160ms ease-out;
      }
      .grcon-mascot-generated-run {
        background-image: url("${GENERATED_ASSETS.run}");
        background-position: 0 0;
        background-size: 800% 100%;
      }
      .grcon-mascot-generated-wave {
        background-image: url("${GENERATED_ASSETS.wave}");
      }
      .grcon-mascot-generated-analyze {
        background-image: url("${GENERATED_ASSETS.analyze}");
      }
      .grcon-mascot-generated-success {
        background-image: url("${GENERATED_ASSETS.success}");
      }
      html[data-theme="dark"] .grcon-mascot-generated-layer {
        filter: drop-shadow(0 6px 15px rgb(0 0 0 / 38%));
      }
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting.is-processing
        .grcon-mascot-pose-motion > .grcon-mascot-sprite:not(.grcon-mascot-processing-orb),
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting.is-greeting-active:not(.is-processing)
        .grcon-mascot-pose-motion > .grcon-mascot-sprite:not(.grcon-mascot-processing-orb),
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting[data-pose="analysis"]:not(.is-processing):not(.is-greeting-active)
        .grcon-mascot-pose-motion > .grcon-mascot-sprite:not(.grcon-mascot-processing-orb),
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting[data-pose="success"]:not(.is-processing):not(.is-greeting-active)
        .grcon-mascot-pose-motion > .grcon-mascot-sprite:not(.grcon-mascot-processing-orb) {
        opacity: 0;
      }
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting.is-processing .grcon-mascot-generated-run {
        opacity: 1;
        animation: grcon-mascot-frame-run 720ms step-end infinite;
        will-change: background-position;
      }
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting.is-greeting-active:not(.is-processing) .grcon-mascot-generated-wave,
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting[data-pose="analysis"]:not(.is-processing):not(.is-greeting-active)
        .grcon-mascot-generated-analyze,
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting[data-pose="success"]:not(.is-processing):not(.is-greeting-active)
        .grcon-mascot-generated-success {
        opacity: 1;
      }
      .grcon-mascot-greeting::before {
        transform: scale(1);
        opacity: .72;
        transition:
          transform 580ms cubic-bezier(.16, 1, .3, 1),
          opacity 360ms ease-out;
      }
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting.is-greeting-active .grcon-mascot-motion {
        transform: translate3d(0, -4px, 0) scale(1.008);
        filter: saturate(1.025);
        will-change: transform;
      }
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-greeting.is-greeting-active
        .grcon-mascot-sprite:not(.grcon-mascot-processing-orb) {
        transform: translate3d(1px, 0, 0) rotate(1.6deg);
        will-change: transform;
      }
      .grcon-mascot-greeting.is-greeting-active::before {
        transform: translate3d(0, 1px, 0) scale(.96);
        opacity: .58;
      }
      .grcon-mascot-greeting:not(.is-greeting-active) .grcon-mascot-motion {
        transition-duration: 500ms, 420ms;
        transition-timing-function: cubic-bezier(.4, 0, .2, 1), ease-in-out;
      }
      .grcon-mascot-greeting:not(.is-greeting-active) .grcon-mascot-sprite {
        transition-duration: 540ms;
        transition-timing-function: cubic-bezier(.4, 0, .2, 1);
      }
      /* As poses sem quadros próprios permanecem estáticas. Isso evita repetir
         o antigo efeito de deslocar a imagem inteira para simular movimento. */
      /* Indicador independente: o centro fica ancorado em 80%/43% e somente
         o anel gira no próprio eixo. Nenhuma cópia da sprite orbita o mascote. */
      .grcon-mascot-processing-orb {
        position: absolute;
        z-index: 3;
        left: 68%;
        top: 31%;
        width: 24%;
        height: 24%;
        border-radius: 50%;
        background:
          radial-gradient(circle at 50% 8%, #178de0 0 7%, transparent 8%),
          radial-gradient(circle at 80% 20%, rgb(23 141 224 / 88%) 0 7%, transparent 8%),
          radial-gradient(circle at 92% 50%, rgb(23 141 224 / 76%) 0 7%, transparent 8%),
          radial-gradient(circle at 80% 80%, rgb(23 141 224 / 64%) 0 7%, transparent 8%),
          radial-gradient(circle at 50% 92%, rgb(23 141 224 / 52%) 0 7%, transparent 8%),
          radial-gradient(circle at 20% 80%, rgb(23 141 224 / 40%) 0 7%, transparent 8%),
          radial-gradient(circle at 8% 50%, rgb(23 141 224 / 30%) 0 7%, transparent 8%),
          radial-gradient(circle at 20% 20%, rgb(23 141 224 / 20%) 0 7%, transparent 8%);
        opacity: 0;
        pointer-events: none;
        transform: translateZ(0) rotate(0deg);
        transform-origin: 50% 50%;
        filter: drop-shadow(0 1px 2px rgb(10 82 125 / 24%));
      }
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-context.is-processing .grcon-mascot-processing-orb {
        opacity: 1;
        animation: grcon-mascot-orb-spin 820ms linear infinite;
        will-change: transform;
      }
      html[data-grcon-mascot-asset="sprite-hd-file-v1"]
        .grcon-mascot-context.is-processing .grcon-mascot-motion::after {
        content: "";
        position: absolute;
        z-index: 0;
        left: 2%;
        top: 38%;
        width: 20%;
        height: 25%;
        background:
          linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-600, #1479a6) 68%, transparent) 35% 58%, transparent 82%) 0 10% / 100% 2px no-repeat,
          linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-700, #0c648f) 50%, transparent) 30% 55%, transparent 80%) 0 52% / 84% 2px no-repeat,
          linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-800, #0a527d) 42%, transparent) 28% 52%, transparent 78%) 0 92% / 68% 2px no-repeat;
        opacity: .55;
        pointer-events: none;
        animation: grcon-mascot-speed-lines 620ms ease-in-out infinite;
      }
      @keyframes grcon-mascot-reduced-acknowledge {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
        42% { transform: translate3d(0, -2px, 0) rotate(.55deg); }
      }
      @keyframes grcon-mascot-speed-lines {
        0%, 100% { opacity: .25; transform: translate3d(4px, 1px, 0) scaleX(.82); }
        38% { opacity: .68; transform: translate3d(-3px, -1px, 0) scaleX(1.14); }
        72% { opacity: .42; transform: translate3d(1px, 0, 0) scaleX(.96); }
      }
      @keyframes grcon-mascot-orb-spin {
        from { transform: translateZ(0) rotate(0deg); }
        to { transform: translateZ(0) rotate(360deg); }
      }
      @keyframes grcon-mascot-frame-run {
        0%, 12.49% { background-position: 0 0; }
        12.5%, 24.99% { background-position: 14.285714% 0; }
        25%, 37.49% { background-position: 28.571429% 0; }
        37.5%, 49.99% { background-position: 42.857143% 0; }
        50%, 62.49% { background-position: 57.142857% 0; }
        62.5%, 74.99% { background-position: 71.428571% 0; }
        75%, 87.49% { background-position: 85.714286% 0; }
        87.5%, 100% { background-position: 100% 0; }
      }
      .grcon-mascot-speech {
        position: fixed;
        z-index: 340;
        inset: 0 auto auto 0;
        max-inline-size: min(14rem, calc(100vw - 1rem));
        margin: 0;
        padding: .58rem .78rem;
        color: var(--text-1, #16212b);
        background: color-mix(in srgb, var(--surface-1, #fff) 96%, var(--brand-50, #f2f9fc));
        border: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
        border-radius: var(--radius-md, 13px);
        box-shadow: var(--shadow-1, 0 8px 24px rgb(12 32 48 / 10%));
        font-family: var(--font-sans, Inter, "Segoe UI", Arial, sans-serif);
        font-size: .86rem;
        font-weight: 690;
        line-height: 1.25;
        overflow-wrap: anywhere;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transform: translate3d(0, 5px, 0) scale(.965);
        transform-origin: var(--bubble-origin, 0 50%);
        transition:
          opacity 280ms ease-out 70ms,
          transform 360ms cubic-bezier(.16, 1, .3, 1) 55ms,
          visibility 0s linear 430ms;
      }
      .grcon-mascot-speech[data-visible="true"] {
        opacity: 1;
        visibility: visible;
        transform: translate3d(0, 0, 0) scale(1);
        transition-delay: 70ms, 55ms, 0s;
      }
      .grcon-mascot-speech::after {
        content: "";
        position: absolute;
        width: .62rem;
        height: .62rem;
        background: inherit;
        transform: rotate(45deg);
      }
      .grcon-mascot-speech[data-placement="right"] {
        --bubble-origin: 0 50%;
      }
      .grcon-mascot-speech[data-placement="right"]::after {
        left: -.36rem;
        top: var(--arrow-y, 50%);
        margin-top: -.31rem;
        border-left: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
        border-bottom: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
      }
      .grcon-mascot-speech[data-placement="left"] {
        --bubble-origin: 100% 50%;
      }
      .grcon-mascot-speech[data-placement="left"]::after {
        right: -.36rem;
        top: var(--arrow-y, 50%);
        margin-top: -.31rem;
        border-top: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
        border-right: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
      }
      .grcon-mascot-speech[data-placement="top"] {
        --bubble-origin: 50% 100%;
      }
      .grcon-mascot-speech[data-placement="top"]::after {
        bottom: -.36rem;
        left: var(--arrow-x, 50%);
        margin-left: -.31rem;
        border-right: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
        border-bottom: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
      }
      .grcon-mascot-speech[data-placement="bottom"] {
        --bubble-origin: 50% 0;
      }
      .grcon-mascot-speech[data-placement="bottom"]::after {
        top: -.36rem;
        left: var(--arrow-x, 50%);
        margin-left: -.31rem;
        border-left: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
        border-top: 1px solid color-mix(in srgb, var(--brand-700, #0c648f) 22%, var(--border-1, #d8e1e7));
      }
      @media (prefers-reduced-motion: reduce) {
        .grcon-mascot-greeting .grcon-mascot-motion,
        .grcon-mascot-greeting .grcon-mascot-sprite:not(.grcon-mascot-processing-orb),
        .grcon-mascot-greeting::before {
          transform: none !important;
          filter: none !important;
          transition-duration: 80ms !important;
          transition-delay: 0ms !important;
        }
        .grcon-mascot-greeting .grcon-mascot-pose-motion {
          animation: none !important;
          transition-duration: 80ms !important;
        }
        .grcon-mascot-greeting .grcon-mascot-generated-layer {
          animation: none !important;
          transition-duration: 80ms !important;
        }
        .grcon-mascot-context.is-processing .grcon-mascot-motion,
        .grcon-mascot-context.is-processing .grcon-mascot-motion::after {
          animation: none !important;
          transform: none !important;
        }
        html[data-grcon-mascot-asset="sprite-hd-file-v1"]
          .grcon-mascot-context.is-processing .grcon-mascot-pose-motion {
          animation: grcon-mascot-reduced-acknowledge 680ms ease-out 1 both !important;
        }
        html[data-grcon-mascot-asset="sprite-hd-file-v1"]
          .grcon-mascot-context.is-processing .grcon-mascot-processing-orb {
          animation-duration: 2400ms !important;
          animation-timing-function: ease-in-out !important;
        }
        .grcon-mascot-context.is-processing .grcon-mascot-motion::after {
          display: none;
        }
        .grcon-mascot-context.is-processing .grcon-mascot-processing-orb {
          opacity: .82;
        }
        .grcon-mascot-speech,
        .grcon-mascot-speech[data-visible="true"] {
          transform: none;
          transition: opacity 120ms ease-out, visibility 0s linear 120ms;
        }
        .grcon-mascot-speech[data-visible="true"] {
          transition-delay: 0s;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function elementVisible(element) {
    return Boolean(element)
      && !element.hidden
      && element.getAttribute("aria-hidden") !== "true"
      && !element.closest('[hidden], [aria-hidden="true"]')
      && element.offsetParent !== null;
  }

  function processingActive() {
    const selectors = [
      "#progress",
      "#requests-progress",
      "#pdf-merge-progress",
      "#pc-progress",
      "#spw-progress",
      '[data-grcon-processing="true"]',
    ].join(", ");
    return Array.from(document.querySelectorAll(selectors)).some(elementVisible);
  }

  function durableProcessingState() {
    const rootElement = document.documentElement;
    return {
      active: rootElement.dataset.grconControlProcessing === "true",
      until: Number(rootElement.dataset.grconControlProcessingUntil) || 0,
    };
  }

  function controlSignalActive() {
    const durable = durableProcessingState();
    return explicitControlProcessing
      || durable.active
      || Date.now() < Math.max(processingHoldUntil, durable.until);
  }

  function syncProcessingState() {
    const fallbackBusy = processingActive();
    document.querySelectorAll(SELECTOR).forEach((mascot) => {
      const contextual = mascot.classList.contains("grcon-mascot-context");
      const processingPose = mascot.dataset.pose === "pending" || mascot.dataset.pose === "analysis";
      const signaledControl = mascot.dataset.context === "control" && controlSignalActive();
      // O evento do Controle de GRDT inicia a corrida imediatamente, sem depender
      // da ordem entre a exibição do progresso e a troca assíncrona da pose.
      const shouldAnimate = contextual && (signaledControl || (fallbackBusy && processingPose));
      if (mascot.classList.contains("is-processing") !== shouldAnimate) {
        mascot.classList.toggle("is-processing", shouldAnimate);
      }
      if (shouldAnimate && mascot.getAttribute("aria-busy") !== "true") {
        mascot.setAttribute("aria-busy", "true");
      } else if (!shouldAnimate && mascot.hasAttribute("aria-busy")) {
        mascot.removeAttribute("aria-busy");
      }
    });
  }

  function scheduleProcessingHoldEnd() {
    root.clearTimeout(processingHoldTimer);
    const remaining = processingHoldUntil - Date.now();
    if (remaining <= 0) {
      processingHoldUntil = 0;
      syncProcessingState();
      return;
    }
    processingHoldTimer = root.setTimeout(() => {
      processingHoldUntil = 0;
      syncProcessingState();
    }, remaining + 20);
  }

  function handleProcessingState(event) {
    const detail = event?.detail || {};
    if (detail.context && detail.context !== "control") return;
    explicitControlProcessing = Boolean(detail.active);
    if (explicitControlProcessing) {
      processingHoldUntil = Math.max(processingHoldUntil, Date.now() + 1100);
      root.clearTimeout(processingHoldTimer);
    } else {
      scheduleProcessingHoldEnd();
    }
    syncProcessingState();
  }

  function handleProcessingPulse(event) {
    const detail = event?.detail || {};
    if (detail.context && detail.context !== "control") return;
    const requested = Number(detail.duration) || 1100;
    const duration = Math.min(2400, Math.max(700, requested));
    processingHoldUntil = Math.max(processingHoldUntil, Date.now() + duration);
    scheduleProcessingHoldEnd();
    syncProcessingState();
  }

  function currentIdentity() {
    const cloud = root.GrconCloud;
    if (cloud && typeof cloud.getCurrentUserIdentity === "function") {
      return cloud.getCurrentUserIdentity() || {};
    }
    const user = cloud?.state?.session?.user;
    const profile = user && cloud?.state?.profiles?.get?.(user.id);
    const metadata = user?.user_metadata || {};
    return {
      displayName: profile?.display_name || "",
      metadataName: metadata.full_name || metadata.name || metadata.display_name || "",
    };
  }

  function greetingText() {
    return Core.greeting(currentIdentity());
  }

  function ensureBubble() {
    if (bubble && document.contains(bubble)) return bubble;
    bubble = document.getElementById(BUBBLE_ID);
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.id = BUBBLE_ID;
      bubble.className = "grcon-mascot-speech";
      bubble.setAttribute("role", "status");
      bubble.setAttribute("aria-live", "polite");
      bubble.setAttribute("aria-atomic", "true");
      bubble.setAttribute("aria-hidden", "true");
      bubble.dataset.visible = "false";
      bubble.dataset.placement = "right";
      document.body.appendChild(bubble);
    }
    return bubble;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  }

  function positionBubble(mascot) {
    const target = ensureBubble();
    if (!mascot || !document.contains(mascot)) return;
    const mascotRect = mascot.getBoundingClientRect();
    const bubbleRect = target.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || root.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || root.innerHeight;
    const width = bubbleRect.width;
    const height = bubbleRect.height;
    const roomRight = viewportWidth - mascotRect.right;
    const roomLeft = mascotRect.left;
    const roomAbove = mascotRect.top;
    const roomBelow = viewportHeight - mascotRect.bottom;
    let placement = "right";
    let left = mascotRect.right + MASCOT_GAP;
    let top = mascotRect.top + (mascotRect.height - height) / 2;

    if (roomRight < width + MASCOT_GAP && roomLeft >= width + MASCOT_GAP) {
      placement = "left";
      left = mascotRect.left - width - MASCOT_GAP;
    } else if (roomRight < width + MASCOT_GAP) {
      placement = roomAbove >= height + MASCOT_GAP || roomAbove >= roomBelow ? "top" : "bottom";
      left = mascotRect.left + (mascotRect.width - width) / 2;
      top = placement === "top"
        ? mascotRect.top - height - MASCOT_GAP
        : mascotRect.bottom + MASCOT_GAP;
    }

    left = clamp(left, EDGE_GAP, viewportWidth - width - EDGE_GAP);
    top = clamp(top, EDGE_GAP, viewportHeight - height - EDGE_GAP);
    target.dataset.placement = placement;
    target.style.left = `${Math.round(left)}px`;
    target.style.top = `${Math.round(top)}px`;

    if (placement === "top" || placement === "bottom") {
      const arrowX = clamp(mascotRect.left + mascotRect.width / 2 - left, 14, width - 14);
      target.style.setProperty("--arrow-x", `${Math.round(arrowX)}px`);
    } else {
      const arrowY = clamp(mascotRect.top + mascotRect.height / 2 - top, 14, height - 14);
      target.style.setProperty("--arrow-y", `${Math.round(arrowY)}px`);
    }
  }

  function updateGreeting() {
    const target = ensureBubble();
    const nextText = greetingText();
    if (target.textContent !== nextText) target.textContent = nextText;
    if (activeMascot) {
      positionBubble(activeMascot);
      }
  }

  function showGreeting(mascot, options) {
    if (!mascot) return;
    if (pinnedMascot && pinnedMascot !== mascot && !options?.pinned) return;
    if (activeMascot && activeMascot !== mascot) hideGreeting(activeMascot, { force: Boolean(options?.pinned) });
    activeMascot = mascot;
    if (options?.pinned) pinnedMascot = mascot;
    updateGreeting();
    positionBubble(mascot);
    mascot.classList.add("is-greeting-active");
    mascot.setAttribute("aria-expanded", "true");
    const target = ensureBubble();
    target.setAttribute("aria-hidden", "false");
    root.requestAnimationFrame(() => {
      if (activeMascot === mascot) target.dataset.visible = "true";
    });
  }

  function hideGreeting(mascot, options) {
    if (mascot && activeMascot && mascot !== activeMascot) return;
    if (!options?.force && pinnedMascot && pinnedMascot === activeMascot) return;
    const previous = activeMascot;
    if (previous) {
      previous.classList.remove("is-greeting-active");
      previous.setAttribute("aria-expanded", "false");
    }
    const target = ensureBubble();
    target.dataset.visible = "false";
    target.setAttribute("aria-hidden", "true");
    activeMascot = null;
    if (options?.force || pinnedMascot === previous) pinnedMascot = null;
  }

  function togglePinned(mascot) {
    if (pinnedMascot === mascot && activeMascot === mascot) {
      hideGreeting(mascot, { force: true });
      return;
    }
    if (pinnedMascot && pinnedMascot !== mascot) hideGreeting(pinnedMascot, { force: true });
    showGreeting(mascot, { pinned: true });
  }

  function enhanceMascot(mascot) {
    if (!mascot || mascot.dataset.grconGreetingReady === "true") return;
    mascot.dataset.grconGreetingReady = "true";
    mascot.classList.add("grcon-mascot-greeting");
    const sprite = mascot.querySelector(".grcon-mascot-sprite:not(.grcon-mascot-processing-orb)");
    let motion = mascot.querySelector(".grcon-mascot-motion");
    if (sprite && !motion) {
      motion = document.createElement("span");
      motion.className = "grcon-mascot-motion";
      sprite.parentElement.insertBefore(motion, sprite);
      motion.appendChild(sprite);
    }
    let poseMotion = motion && motion.querySelector(".grcon-mascot-pose-motion");
    if (sprite && motion && !poseMotion) {
      poseMotion = document.createElement("span");
      poseMotion.className = "grcon-mascot-pose-motion";
      motion.insertBefore(poseMotion, sprite);
      poseMotion.appendChild(sprite);
    }
    if (poseMotion) {
      ["run", "wave", "analyze", "success"].forEach((name) => {
        if (poseMotion.querySelector(`.grcon-mascot-generated-${name}`)) return;
        const layer = document.createElement("span");
        layer.className = `grcon-mascot-generated-layer grcon-mascot-generated-${name}`;
        layer.setAttribute("aria-hidden", "true");
        poseMotion.appendChild(layer);
      });
    }
    const originalLabel = mascot.getAttribute("aria-label") || "Mascote da Qualidade do GRCON";
    mascot.dataset.mascotLabel = originalLabel;
    mascot.removeAttribute("aria-hidden");
    mascot.setAttribute("role", "button");
    mascot.setAttribute("tabindex", "0");
    mascot.setAttribute("aria-controls", BUBBLE_ID);
    mascot.setAttribute("aria-expanded", "false");
    mascot.setAttribute("aria-label", originalLabel);
    mascot.removeAttribute("title");
    if (mascot.classList.contains("grcon-mascot-context") && !mascot.querySelector(".grcon-mascot-processing-orb")) {
      const processingOrb = document.createElement("span");
      processingOrb.className = "grcon-mascot-processing-orb";
      processingOrb.setAttribute("aria-hidden", "true");
      const poseMotion = mascot.querySelector(".grcon-mascot-pose-motion");
      const motion = mascot.querySelector(".grcon-mascot-motion");
      (poseMotion || motion || mascot).appendChild(processingOrb);
    }

    mascot.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") showGreeting(mascot);
    });
    mascot.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch") hideGreeting(mascot);
    });
    mascot.addEventListener("focus", () => showGreeting(mascot));
    mascot.addEventListener("blur", () => hideGreeting(mascot));
    mascot.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePinned(mascot);
    });
    mascot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        togglePinned(mascot);
      } else if (event.key === "Escape") {
        event.preventDefault();
        hideGreeting(mascot, { force: true });
      }
    });
  }

  function refresh(scope) {
    const source = scope?.querySelectorAll ? scope : document;
    if (source.matches?.(SELECTOR)) enhanceMascot(source);
    source.querySelectorAll(SELECTOR).forEach(enhanceMascot);
    syncProcessingState();
    updateGreeting();
  }

  function init() {
    installStyles();
    Object.values(GENERATED_ASSETS).forEach((source) => {
      const image = new Image();
      image.decoding = "async";
      image.src = source;
    });
    ensureBubble();
    const durable = durableProcessingState();
    processingHoldUntil = Math.max(processingHoldUntil, durable.until);
    refresh(document);
    if (!durable.active && processingHoldUntil > Date.now()) scheduleProcessingHoldEnd();
    observer = new MutationObserver((mutations) => {
      let processingMayHaveChanged = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) refresh(node);
          });
        } else {
          processingMayHaveChanged = true;
        }
      }
      if (processingMayHaveChanged) syncProcessingState();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-pose",
        "aria-busy",
        "hidden",
        "aria-hidden",
        "data-grcon-control-processing",
        "data-grcon-control-processing-until",
        "data-grcon-mascot-asset",
      ],
    });

    document.addEventListener("pointerdown", (event) => {
      if (pinnedMascot && !pinnedMascot.contains(event.target)) hideGreeting(pinnedMascot, { force: true });
    }, true);
    root.addEventListener("resize", () => {
      if (activeMascot) positionBubble(activeMascot);
    }, { passive: true });
    root.addEventListener("scroll", () => {
      if (activeMascot) positionBubble(activeMascot);
    }, { passive: true, capture: true });
    root.addEventListener("grcon:processing-state", handleProcessingState);
    root.addEventListener("grcon:processing-pulse", handleProcessingPulse);
    root.addEventListener("grcon:cloud-ready", updateGreeting);
    root.addEventListener("grcon:identity-changed", updateGreeting);
  }

  function diagnostics() {
    const mascot = document.getElementById("grcon-context-mascot") || document.querySelector(SELECTOR);
    const motion = mascot?.querySelector(".grcon-mascot-motion");
    const poseMotion = mascot?.querySelector(".grcon-mascot-pose-motion");
    const orb = mascot?.querySelector(".grcon-mascot-processing-orb");
    const animationName = (element) => element ? root.getComputedStyle(element).animationName : "none";
    return Object.freeze({
      version: "1.1.0",
      hdAsset: document.documentElement.dataset.grconMascotAsset || "",
      hdReady: document.documentElement.dataset.grconMascotAsset === "sprite-hd-file-v1",
      reducedMotion: Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
      pose: mascot?.dataset.pose || "",
      context: mascot?.dataset.context || "",
      processingSignal: controlSignalActive(),
      processingClass: Boolean(mascot?.classList.contains("is-processing")),
      motionAnimation: animationName(motion),
      poseAnimation: animationName(poseMotion),
      orbAnimation: animationName(orb),
    });
  }

  root.GRCONMascotGreeting = Object.freeze({
    version: "1.1.0",
    refresh,
    open: (mascot) => showGreeting(mascot || document.querySelector(SELECTOR)),
    close: () => hideGreeting(activeMascot, { force: true }),
    greetingText,
    setProcessing: (active) => handleProcessingState({ detail: { active, context: "control" } }),
    pulseProcessing: (duration) => handleProcessingPulse({ detail: { duration, context: "control" } }),
    diagnostics,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
