/* GRCON — entrega o sprite HD do Mascote da Qualidade. */
(function (root) {
  "use strict";

  const STYLE_ID = "grcon-mascot-asset-fix-style";
  const MIN_HD_SIDE = 1024;
  const SPRITE_URL = new URL("grcon-mascot-sprite.png?v=4.0.0-hd", document.baseURI).href;

  function setBackground(url) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `.grcon-mascot-sprite{background-image:url("${url}")!important;background-size:400% 400%!important;background-repeat:no-repeat!important;image-rendering:auto!important;backface-visibility:hidden}`;

    document.documentElement.dataset.grconMascotAsset = "sprite-hd-file-v1";
    if (root.GRCONMascot && typeof root.GRCONMascot.refresh === "function") root.GRCONMascot.refresh();
  }

  function load() {
    const image = new Image();
    image.decoding = "async";
    image.onload = function () {
      if (image.naturalWidth < MIN_HD_SIDE || image.naturalHeight < MIN_HD_SIDE) {
        console.warn(`GRCON: sprite do mascote recusado por baixa resolução (${image.naturalWidth}×${image.naturalHeight}).`);
        document.documentElement.dataset.grconMascotAsset = "sprite-low-resolution-rejected";
        return;
      }
      setBackground(SPRITE_URL);
    };
    image.onerror = function () {
      console.warn("GRCON: sprite HD do mascote não pôde ser carregado.");
      document.documentElement.dataset.grconMascotAsset = "sprite-hd-unavailable";
    };
    image.src = SPRITE_URL;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
})(window);
