/* Progresso do download, separado da tabela e das métricas da análise. */
(function (root) {
  "use strict";
  let started = null, stageStarted = 0, stageName = "", active = false, cancelled = false, lastPaint = 0, ended = 0, timer = null, stages = [], expectedContext = "";
  const host = () => document.getElementById("grdt-download-progress");
  const now = () => performance.now();
  function stageDone() {
    if (stageName) stages.push({ stage: stageName, durationMs: Math.round(now() - stageStarted) });
  }
  function paint(message, fraction) {
    const node = host(); if (!node) return;
    node.hidden = false;
    const label = node.querySelector("[data-download-message]");
    if (label.textContent !== message) label.textContent = message;
    node.querySelector("[data-download-cancel]").hidden = !active;
    const bar = node.querySelector("progress");
    if (Number.isFinite(fraction)) bar.value = Math.max(0, Math.min(100, fraction * 100));
    else if (active) bar.removeAttribute("value");
    else bar.value = 0;
    bar.setAttribute("aria-label", message);
  }
  function start(message) {
    if (!active) { started = now(); ended = 0; stages = []; stageName = ""; }
    active = true; cancelled = false; expectedContext = context(); if (host()) host().dataset.state = "preparing";
    if (!timer) timer = setInterval(() => {
      const node = host(); if (node) node.querySelector("[data-download-elapsed]").textContent = `${Math.floor((now()-started)/1000)} s`;
    }, 1000);
    phase(message || "Preparando arquivos…");
  }
  function phase(message, fraction) {
    if (!active && Number.isFinite(fraction)) return;
    if (Number.isFinite(fraction) && fraction < 1 && now()-lastPaint < 150 && stageName === message) return;
    lastPaint = now();
    if (stageName !== message) { stageDone(); stageName = message; stageStarted = now(); }
    paint(message, fraction);
  }
  async function measure(message, work) {
    phase(message);
    return await work();
  }
  function finish(message, failed = false) {
    stageDone(); stageName = ""; active = false; ended = now();
    clearInterval(timer); timer = null;
    paint(message || "Download preparado. Confira a entrega no navegador.", failed ? undefined : 1);
    if (host()) host().dataset.state = failed ? "error" : "ready";
  }
  function waitForPreview() { if (host()) host().dataset.state = "preview"; stageDone(); stageName = ""; active = false; clearInterval(timer); timer = null; paint("Revise os lotes e confirme a numeração para baixar."); }
  const context = () => `${root.GrconCloud?.state?.membership?.workspace_id || ""}:${root.GrconCloud?.state?.session?.user?.id || ""}`;
  root.addEventListener("grcon:cloud-state", () => {
    if (active && expectedContext !== context()) {
      cancelled = true; document.getElementById("cancel-processing")?.click();
      finish("Contrato ou sessão alterado. Analise novamente.", true);
    }
  });
  document.addEventListener("click", event => {
    if (event.target.closest("[data-download-cancel]")) { cancelled = true; document.getElementById("cancel-processing")?.click(); }
  });
  root.GrconGrdtDownloadProgress = Object.freeze({ start, phase, measure, finish, waitForPreview,
    metrics: () => ({ active, cancelled, elapsedMs: started !== null ? Math.round((ended || now())-started) : 0, stages: [...stages] }) });
})(window);
