(function () {
  "use strict";

  let loaded = false;

  async function ensureLoaded() {
    if (loaded) return;
    importScripts("exceljs.min.js", "grcon_utils.js", "grcon_contracts.js", "discipline_resolver.js", "core.js", "history_core.js", "posting_conference_core.js", "sigem_posting_core.js", "egrdt_teams_trace_core.js", "history_report.js");
    if (!self.GrconHistoryReport || typeof self.GrconHistoryReport.buildWorkbook !== "function") {
      throw new Error("Módulo de relatório do histórico indisponível no worker.");
    }
    loaded = true;
  }

  self.addEventListener("message", async (event) => {
    const payload = event && event.data || {};
    if (payload.type !== "history-report-build") return;
    try {
      self.postMessage({ type: "history-report-progress", requestId: payload.requestId, message: "Preparando relatório do histórico…" });
      await ensureLoaded();
      const records = Array.isArray(payload.records) ? payload.records : [];
      const options = payload.options || {};
      self.postMessage({ type: "history-report-progress", requestId: payload.requestId, message: "Montando e compactando planilha…" });
      const buffer = await self.GrconHistoryReport.buildWorkbook(records, options);
      self.postMessage({ type: "history-report-result", requestId: payload.requestId, ok: true, buffer }, [buffer]);
    } catch (error) {
      self.postMessage({
        type: "history-report-result", requestId: payload.requestId,
        ok: false,
        error: error && error.message || "Falha ao gerar relatório no worker.",
      });
    }
  });
})();
