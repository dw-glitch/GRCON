/* SIGEM × PW — Evolução.
   Prepara snapshots fora da thread principal. O mesmo motor versionado é usado
   no browser e no worker para não criar uma segunda regra de negócio. */
importScripts("../sigem_pw_dashboard_core.js", "../sigem_pw_evolution_core.js");

self.addEventListener("message", (event) => {
  const payload = event.data || {};
  if (payload.type !== "evolution-snapshot") return;
  try {
    const Evolution = self.GrconSigemPwEvolution;
    if (!Evolution || typeof Evolution.buildSnapshot !== "function") {
      throw new Error("Motor de Evolução indisponível no worker.");
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
      type: "evolution-snapshot",
      requestId: payload.requestId,
      error: error && error.message ? error.message : "Falha ao preparar snapshot da Evolução.",
    });
  }
});
