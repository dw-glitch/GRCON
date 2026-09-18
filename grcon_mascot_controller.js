/* GRCON — ponto de entrada compatível do Mascote da Qualidade.
 * A implementação ativa foi movida para grcon_mascot_controller_v4.js para
 * invalidar de forma determinística bundles/cache antigos sem duplicar lógica.
 */
(function (root) {
  "use strict";

  if (root.GrconMascot?.version?.startsWith?.("4.")) return;
  if (document.querySelector('script[data-grcon-mascot-controller="v4"]')) return;

  const script = document.createElement("script");
  script.src = "grcon_mascot_controller_v4.js?v=4.2.0-20260918.4";
  script.async = false;
  script.dataset.grconMascotController = "v4";
  script.addEventListener("error", () => {
    document.documentElement.dataset.grconMascotEngine = "official-png-static-fallback";
    document.documentElement.dataset.grconMascotVideo = "controller-load-failed";
    console.warn("GRCON: controlador v4 do mascote não carregou; PNG oficial mantido.");
  }, { once: true });
  document.head.appendChild(script);
})(window);
