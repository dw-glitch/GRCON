/* Worker isolado: lê o CSV PW fora da thread de interface. A identidade final
   é recalculada no módulo principal com TriagemCore/GrconUtils antes de persistir. */
importScripts("../sigem_pw_dashboard_core.js");

self.addEventListener("message", (event) => {
  try {
    const payload = event.data || {};
    const source = new TextDecoder("utf-8").decode(new Uint8Array(payload.buffer || new ArrayBuffer(0)));
    const parsed = self.GrconSigemPwDashboard.parsePwCsv(source, payload.meta || {});
    self.postMessage({ ok: true, parsed });
  } catch (error) {
    self.postMessage({ ok: false, error: error && error.message ? error.message : "Falha ao processar a base ProjectWise." });
  }
});
