/* GRCON — Mascote da Qualidade no cabeçalho. */
(function () {
  "use strict";

  const STYLE_ID = "grcon-mascot-header-style";
  const NODE_ID = "grcon-brand-mascot";
  const ASSET = "assets/mascot/grcon-mascot-default.png";

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .grcon-brand-mascot{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:clamp(2.5rem,3.8vw,3.2rem);height:clamp(2.5rem,3.8vw,3.2rem);margin-inline:-.18rem -.05rem;pointer-events:none;user-select:none}
      .grcon-brand-mascot img{display:block;width:100%;height:100%;max-width:none;object-fit:contain;filter:drop-shadow(0 3px 7px rgb(12 32 48 / 14%))}
      html[data-theme="dark"] .grcon-brand-mascot img{filter:drop-shadow(0 4px 10px rgb(0 0 0 / 28%))}
      @media(max-width:1100px){.grcon-brand-mascot{width:2.7rem;height:2.7rem}}
      @media(max-width:720px){.brand{gap:.62rem}.grcon-brand-mascot{width:2.3rem;height:2.3rem;margin-inline:-.2rem -.1rem}}
      @media(max-width:430px){.grcon-brand-mascot{width:2rem;height:2rem}}
      @media(prefers-reduced-motion:no-preference){.grcon-brand-mascot{animation:grcon-mascot-enter 220ms ease-out both}}
      @keyframes grcon-mascot-enter{from{opacity:0;transform:translateY(2px) scale(.96)}to{opacity:1;transform:none}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    const brand = document.querySelector(".topbar .brand");
    const logo = brand && brand.querySelector(".grcon-brand-mark");
    if (!brand || !logo || document.getElementById(NODE_ID)) return;

    installStyles();

    const wrap = document.createElement("span");
    wrap.id = NODE_ID;
    wrap.className = "grcon-brand-mascot";
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", "Mascote da Qualidade do GRCON");
    wrap.title = "Mascote da Qualidade do GRCON";

    const img = document.createElement("img");
    img.src = ASSET;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    img.draggable = false;
    img.addEventListener("error", () => {
      console.warn("GRCON: o asset do mascote não pôde ser carregado.", ASSET);
      wrap.remove();
      document.documentElement.dataset.grconMascot = "asset-error";
    }, { once: true });
    img.addEventListener("load", () => {
      document.documentElement.dataset.grconMascot = "header-v2";
    }, { once: true });

    wrap.appendChild(img);
    logo.insertAdjacentElement("afterend", wrap);
  }

  window.GRCONMascot = Object.freeze({version:"2.0.0",asset:ASSET,installHeader:install});
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, {once:true});
  else install();
})();
