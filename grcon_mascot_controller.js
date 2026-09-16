/* GRCON — ponto de entrada compatível do Mascote da Qualidade.
 * A implementação ativa v5 usa WebM/VP9, H.264/MP4 local sob demanda e PNG.
 */
(function (root) {
  "use strict";

  if (root.GrconMascot?.version?.startsWith?.("5.")) return;
  if (document.querySelector('script[data-grcon-mascot-controller="v5"]')) return;

  const script = document.createElement("script");
  script.src = "grcon_mascot_controller_v5.js?v=5.0.0-20260916.4";
  script.async = false;
  script.dataset.grconMascotController = "v5";
  script.addEventListener("error", () => {
    document.documentElement.dataset.grconMascotEngine = "official-png-static-fallback";
    document.documentElement.dataset.grconMascotVideo = "controller-load-failed";
    console.warn("GRCON: controlador v5 do mascote não carregou; PNG oficial mantido.");
  }, { once: true });
  document.head.appendChild(script);
})(window);
