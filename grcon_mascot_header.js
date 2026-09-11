/* GRCON — Mascote da Qualidade no cabeçalho. */
(function () {
  "use strict";
  const DATA = "data:image/png;base64,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";
  const STYLE = "grcon-mascot-header-style";
  const NODE = "grcon-brand-mascot";

  function styles() {
    if (document.getElementById(STYLE)) return;
    const el = document.createElement("style");
    el.id = STYLE;
    el.textContent = `
      .grcon-brand-mascot{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:clamp(2.5rem,3.8vw,3.2rem);height:clamp(2.5rem,3.8vw,3.2rem);margin-inline:-.18rem -.05rem;pointer-events:none;user-select:none}
      .grcon-brand-mascot img{display:block;width:100%;height:100%;max-width:none;object-fit:contain;filter:drop-shadow(0 3px 7px rgb(12 32 48 / 14%))}
      html[data-theme="dark"] .grcon-brand-mascot img{filter:drop-shadow(0 4px 10px rgb(0 0 0 / 28%))}
      @media(max-width:1100px){.grcon-brand-mascot{width:2.7rem;height:2.7rem}}
      @media(max-width:720px){.brand{gap:.62rem}.grcon-brand-mascot{width:2.3rem;height:2.3rem;margin-inline:-.2rem -.1rem}}
      @media(max-width:430px){.grcon-brand-mascot{width:2rem;height:2rem}}
      @media(prefers-reduced-motion:no-preference){.grcon-brand-mascot{animation:grcon-mascot-enter 220ms ease-out both}}
      @keyframes grcon-mascot-enter{from{opacity:0;transform:translateY(2px) scale(.96)}to{opacity:1;transform:none}}
    `;
    document.head.appendChild(el);
  }

  function install() {
    const brand = document.querySelector(".topbar .brand");
    const logo = brand && brand.querySelector(".grcon-brand-mark");
    if (!brand || !logo || document.getElementById(NODE)) return;
    styles();
    const wrap = document.createElement("span");
    wrap.id = NODE;
    wrap.className = "grcon-brand-mascot";
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", "Mascote da Qualidade do GRCON");
    wrap.title = "Mascote da Qualidade do GRCON";
    const img = document.createElement("img");
    img.src = DATA; img.alt = ""; img.setAttribute("aria-hidden", "true"); img.decoding = "async"; img.draggable = false;
    wrap.appendChild(img);
    logo.insertAdjacentElement("afterend", wrap);
    document.documentElement.dataset.grconMascot = "header-v1";
  }

  window.GRCONMascot = Object.freeze({version:"1.0.0",defaultPngDataUri:DATA,installHeader:install});
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, {once:true});
  else install();
})();
