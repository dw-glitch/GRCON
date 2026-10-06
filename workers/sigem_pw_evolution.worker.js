/* SIGEM × PW — Evolução.
   Prepara snapshots fora da thread principal. O mesmo motor versionado é usado
   no browser e no worker para não criar uma segunda regra de negócio. */
importScripts("../grcon_contracts.js", "../discipline_resolver.js", "../core.js",
  "../grcon_utils.js", "../sigem_pw_dashboard_core.js", "../sigem_pw_scope_fix.js",
  "../sigem_pw_evolution_core.js");

self.addEventListener("message", (event) => {
  const payload = event.data || {};
  if (!["evolution-snapshot", "evolution-timeline"].includes(payload.type)) return;
  try {
    const Evolution = self.GrconSigemPwEvolution;
    if (!Evolution || typeof Evolution.buildSnapshot !== "function") {
      throw new Error("Motor de Evolução indisponível no worker.");
    }
    if (payload.type === "evolution-timeline") {
      self.postMessage({ ok: true, type: payload.type, requestId: payload.requestId,
        timeline: Evolution.buildDailyTimeline(payload.sigem, payload.pw) });
      return;
    }
    const snapshot = Evolution.buildSnapshot(
      payload.system,
      payload.base,
      payload.universe,
      payload.options || {},
    );
    self.postMessage({
      ok: true,
      type: "evolution-snapshot",
      requestId: payload.requestId,
      snapshot,
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      type: payload.type,
      requestId: payload.requestId,
      error: error && error.message ? error.message : "Falha ao preparar snapshot da Evolução.",
    });
  }
});
