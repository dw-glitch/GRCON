/* GRCON — compatibilidade: sucesso contextual delegado ao Mascot Runtime único. */
(function (root) {
  "use strict";
  const VERSION = "5.0.0";
  async function play(options) {
    const config = options || {};
    root.GrconMascot?.success?.({
      target: config.anchor || config.target,
      message: config.message || "Operação concluída.",
      duration: config.duration,
      source: "legacy-success-pilot",
    });
    return Boolean(root.GrconMascot);
  }
  function hide() { root.GrconMascot?.idle?.({ source: "legacy-success-hide" }); }
  function diagnostics() {
    const runtime = root.GrconMascot?.diagnostics?.() || {};
    return Object.freeze({ version: VERSION, delegated: true, state: runtime.state || "hidden" });
  }
  root.GrconMascotSuccessPilot = Object.freeze({ version: VERSION, play, hide, diagnostics });
})(window);
