/* GRCON — entrypoint estável do Mascot Runtime v5. */
(function (root) {
  "use strict";
  if (root.GrconMascot?.version === "5.2.0") return;
  if (document.querySelector('script[data-grcon-mascot-runtime="v5"]')) return;

  const script = document.createElement("script");
  script.src = "grcon_mascot_controller_v4.js?v=5.2.0-20260925.2";
  script.async = false;
  script.dataset.grconMascotRuntime = "v5";
  script.addEventListener("error", () => {
    document.documentElement.dataset.grconMascotEngine = "official-png-static-fallback";
    console.warn("GRCON: Mascot Runtime indisponível; o restante da aplicação continua funcional.");
  }, { once: true });
  document.head.appendChild(script);
})(window);
