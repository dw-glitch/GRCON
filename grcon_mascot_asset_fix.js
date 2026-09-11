/* GRCON — corrige a entrega do sprite do mascote usando arquivo PNG físico. */
(function (root) {
  "use strict";

  const STYLE_ID = "grcon-mascot-asset-fix-style";
  const SPRITE_URL = new URL("assets/mascot/grcon-mascot-sprite.png?v=3.1.1", document.baseURI).href;
  const FALLBACK_URL = new URL("grcon-mascot.png?v=3.1.1", document.baseURI).href;

  function setBackground(url, fallback) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = fallback
      ? `.grcon-mascot-sprite{background-image:url("${url}")!important;background-size:contain!important;background-position:center!important;background-repeat:no-repeat!important}`
      : `.grcon-mascot-sprite{background-image:url("${url}")!important;background-size:400% 400%!important;background-repeat:no-repeat!important}`;

    document.documentElement.dataset.grconMascotAsset = fallback ? "fallback-file-v1" : "sprite-file-v1";
    if (root.GRCONMascot && typeof root.GRCONMascot.refresh === "function") root.GRCONMascot.refresh();
  }

  function load() {
    const image = new Image();
    image.decoding = "async";
    image.onload = function () { setBackground(SPRITE_URL, false); };
    image.onerror = function () {
      console.warn("GRCON: sprite físico do mascote não pôde ser carregado; usando imagem padrão.");
      const fallback = new Image();
      fallback.decoding = "async";
      fallback.onload = function () { setBackground(FALLBACK_URL, true); };
      fallback.onerror = function () { console.warn("GRCON: imagem de fallback do mascote também não pôde ser carregada."); };
      fallback.src = FALLBACK_URL;
    };
    image.src = SPRITE_URL;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
})(window);
