(function (root) {
  "use strict";
  const scripts = [
    "grcon_revision_control.js",
    "grcon_revision_control_document.js",
    "grcon_reposting_core.js",
    "grcon_reposting_storage.js",
    "grcon_reposting_search.js",
    "grcon_reposting_report.js",
    "grcon_reposting_app.js",
  ];
  function ensureStyle() {
    if (document.querySelector('link[href$="grcon-reposting.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "grcon-reposting.css";
    document.head.appendChild(link);
  }
  function load(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((node) => String(node.getAttribute("src") || "").split(/[?#]/)[0].endsWith(src));
      if (existing) { resolve(); return; }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.grconOperationalFlow = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
      document.head.appendChild(script);
    });
  }
  async function init() {
    ensureStyle();
    try {
      for (const src of scripts) await load(src);
    } catch (error) {
      console.error("GRCON: fluxo operacional de repostagem indisponível", error);
      if (typeof root.GrconNotify === "function") root.GrconNotify("A Central de Repostagem não pôde ser carregada. As demais funções do GRCON continuam disponíveis.", "error");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void init(), { once: true }); else void init();
})(window);
