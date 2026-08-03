(function () {
  "use strict";

  let loaded = false;

  async function ensureLoaded() {
    if (loaded) return;
    importScripts("exceljs.min.js", "history_core.js", "sigem_posting_core.js", "history_report.js");
    if (!self.GrconHistoryReport || typeof self.GrconHistoryReport.buildWorkbook !== "function") {
      throw new Error("Módulo de relatório do histórico indisponível no worker.");
    }
    loaded = true;
  }

  self.addEventListener("message", async (event) => {
    const payload = event && event.data || {};
    if (payload.type !== "history-report-build") return;
    try {
      await ensureLoaded();
      const records = Array.isArray(payload.records) ? payload.records : [];
      const options = payload.options || {};
      const buffer = await self.GrconHistoryReport.buildWorkbook(records, options);
      self.postMessage({ type: "history-report-result", ok: true, buffer }, [buffer]);
    } catch (error) {
      self.postMessage({
        type: "history-report-result",
        ok: false,
        error: error && error.message || "Falha ao gerar relatório no worker.",
      });
    }
  });
})();
