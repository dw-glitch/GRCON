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
  let bubble = null;
  let activeMascot = null;
  let pinnedMascot = null;
  let observer = null;

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
      .grcon-mascot-greeting .grcon-mascot-sprite {
        flex: 0 0 auto;
        transform: translate3d(0, 0, 0) rotate(0deg);
        transform-origin: 52% 82%;
        transition: transform 620ms cubic-bezier(.18, .89, .32, 1.14);
      }
      .grcon-mascot-greeting::before {
        transform: scale(1);
        opacity: .72;
        transition:
          transform 580ms cubic-bezier(.16, 1, .3, 1),
          opacity 360ms ease-out;
      }
      .grcon-mascot-greeting.is-greeting-active .grcon-mascot-motion {
        transform: translate3d(0, -4px, 0) scale(1.008);
        filter: saturate(1.025);
        will-change: transform;
      }
      .grcon-mascot-greeting.is-greeting-active .grcon-mascot-sprite {
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
        .grcon-mascot-greeting .grcon-mascot-sprite,
        .grcon-mascot-greeting::before {
          transform: none !important;
          filter: none !important;
          transition-duration: 80ms !important;
          transition-delay: 0ms !important;
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
    target.textContent = greetingText();
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
    const sprite = mascot.querySelector(".grcon-mascot-sprite");
    if (sprite && !sprite.parentElement.classList.contains("grcon-mascot-motion")) {
      const motion = document.createElement("span");
      motion.className = "grcon-mascot-motion";
      sprite.parentElement.insertBefore(motion, sprite);
      motion.appendChild(sprite);
    }
    const originalLabel = mascot.getAttribute("aria-label") || "Mascote da Qualidade do GRCON";
    mascot.dataset.mascotLabel = originalLabel;
    mascot.removeAttribute("aria-hidden");
    mascot.setAttribute("role", "button");
    mascot.setAttribute("tabindex", "0");
    mascot.setAttribute("aria-controls", BUBBLE_ID);
    mascot.setAttribute("aria-expanded", "false");
    mascot.setAttribute("aria-label", originalLabel);
    mascot.setAttribute("title", "Cumprimentar");

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
    updateGreeting();
  }

  function init() {
    installStyles();
    ensureBubble();
    refresh(document);
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) refresh(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("pointerdown", (event) => {
      if (pinnedMascot && !pinnedMascot.contains(event.target)) hideGreeting(pinnedMascot, { force: true });
    }, true);
    root.addEventListener("resize", () => {
      if (activeMascot) positionBubble(activeMascot);
    }, { passive: true });
    root.addEventListener("scroll", () => {
      if (activeMascot) positionBubble(activeMascot);
    }, { passive: true, capture: true });
    root.addEventListener("grcon:cloud-ready", updateGreeting);
    root.addEventListener("grcon:identity-changed", updateGreeting);
  }

  root.GRCONMascotGreeting = Object.freeze({
    version: "1.0.0",
    refresh,
    open: (mascot) => showGreeting(mascot || document.querySelector(SELECTOR)),
    close: () => hideGreeting(activeMascot, { force: true }),
    greetingText,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
