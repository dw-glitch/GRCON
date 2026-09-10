(function (root) {
  "use strict";

  const original = root.GrconSigemPwHistoryUi;
  const core = root.GrconSigemPwHistory;
  const app = root.GrconSigemPwDashboardUi;
  if (!original || !core || !app || root.GrconSigemPwHistoryPostMerge) return;

  const runtime = {
    lastBaseToken: "",
    detailTrigger: null,
  };

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function pct(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "Não disponível"; }
  function fmtDate(value) { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date) : "Não disponível"; }
  function deltaText(value) { const number = Number(value || 0); return `${number > 0 ? "+" : number < 0 ? "−" : "±"}${fmt(Math.abs(number))}`; }

  function sourceToken(base) {
    const meta = base && base.meta || {};
    if (!base || !meta) return "empty";
    return [meta.importedAt, meta.fileName, meta.fileSize, meta.lastModified, meta.recordCount, meta.sourceRowCount, meta.version].map(text).join("|");
  }

  function currentBaseToken() {
    return `${sourceToken(app.state && app.state.sigem)}::${sourceToken(app.state && app.state.pw)}`;
  }

  async function activate() {
    const token = currentBaseToken();
    if (original.state && original.state.ready && runtime.lastBaseToken && token === runtime.lastBaseToken) {
      await original.refresh();
      return;
    }
    await original.activate();
    runtime.lastBaseToken = currentBaseToken();
  }

  async function recordCurrent(...args) {
    const result = await original.recordCurrent(...args);
    runtime.lastBaseToken = currentBaseToken();
    return result;
  }

  function selectedClass() { return text(original.state && original.state.documentClass); }

  function metricFor(snapshot) {
    if (!snapshot) return null;
    const documentClass = selectedClass();
    if (!documentClass) return snapshot.metrics || null;
    return (snapshot.metrics && snapshot.metrics.classes || []).find((item) => item.documentClass === documentClass) || {
      sigem: 0,
      pwRegistered: 0,
      pwEmitted: 0,
      matched: 0,
      postPw: 0,
      postSigem: 0,
      awaitingEmission: 0,
      aligned: 0,
      coverage: null,
      emissionRate: null,
    };
  }

  function metricDelta(previous, current) {
    if (!previous || !current) return null;
    const fields = ["sigem", "pwRegistered", "pwEmitted", "matched", "postPw", "postSigem", "awaitingEmission", "aligned"];
    const output = {};
    fields.forEach((field) => { output[field] = Number(current[field] || 0) - Number(previous[field] || 0); });
    return output;
  }

  function filterChanges(rows) {
    const documentClass = selectedClass();
    if (!documentClass) return rows || [];
    return (rows || []).filter((item) => text((item.after || item.before || {}).documentClass) === documentClass);
  }

  function transitionReason(item) {
    const before = item && item.before;
    const after = item && item.after;
    if (item && item.mode === "resolved") return `Passou de ${before && before.state || "pendente"} para alinhado.`;
    if (item && item.mode === "new-pending" && before && before.state === "aligned" && after && after.state === "post-pw" && text(before.sigemRevision) !== text(after.sigemRevision)) return "Nova revisão identificada no SIGEM ainda não refletida no PW.";
    if (item && item.mode === "new-pending") return `Passou de ${before && before.state || "sem pendência"} para ${after && after.state || "pendente"}.`;
    if (item && item.mode === "changed-revision") return `SIGEM ${before && before.sigemRevision || "—"} → ${after && after.sigemRevision || "—"}; PW ${before && before.pwRevision || "—"} → ${after && after.pwRevision || "—"}.`;
    return `${before && before.state || "—"} → ${after && after.state || "—"}`;
  }

  function changeList(title, rows, empty) {
    const values = filterChanges(rows);
    const entries = values.slice(0, 250).map((item) => {
      const row = item.after || item.before || {};
      return `<div><strong>${esc(row.document || row.key || item.key)}</strong><span>${esc(row.documentClass || "")} · ${esc(transitionReason(item))}</span></div>`;
    }).join("");
    const summary = values.length > 250 ? `<div><strong>Lista resumida</strong><span>Exibindo os primeiros 250 de ${fmt(values.length)} itens para manter a interface responsiva.</span></div>` : "";
    return `<section class="spw-history-change"><h4>${esc(title)} · ${fmt(values.length)}</h4><div class="spw-history-change-list">${values.length ? entries : `<div>${esc(empty)}</div>`}${summary}</div></section>`;
  }

  async function openSnapshot(id, trigger) {
    const snapshot = (original.state && original.state.comparisons || []).find((item) => item.id === id);
    if (!snapshot) return;
    const overlay = document.getElementById("spw-history-overlay");
    const body = document.getElementById("spw-history-detail-body");
    const title = document.getElementById("spw-history-detail-title");
    const subtitle = document.getElementById("spw-history-detail-subtitle");
    if (!overlay || !body || !title || !subtitle) return;

    runtime.detailTrigger = trigger || null;
    original.state.selectedSnapshotId = id;
    overlay.hidden = false;
    title.textContent = fmtDate(snapshot.importedAt);
    const documentClass = selectedClass();
    subtitle.textContent = `${documentClass ? `Classe: ${documentClass} · ` : ""}SIGEM: ${snapshot.sigemFileName || "—"} · PW: ${snapshot.pwFileName || "—"}`;
    body.innerHTML = `<div class="spw-history-empty"><strong>Carregando mudanças desta atualização…</strong>O detalhamento é lido somente agora.</div>`;
    document.getElementById("spw-history-close")?.focus();

    try {
      const changes = await core.loadSnapshotChanges(snapshot.id);
      const metric = metricFor(snapshot);
      const previousSnapshot = snapshot.delta && snapshot.delta.previousSnapshotId
        ? (original.state.comparisons || []).find((item) => item.id === snapshot.delta.previousSnapshotId)
        : null;
      const delta = metricDelta(metricFor(previousSnapshot), metric);
      const sourceSigem = (original.state.sourceSigem || []).find((item) => item.id === snapshot.sigemSnapshotId);
      const sourcePw = (original.state.sourcePw || []).find((item) => item.id === snapshot.pwSnapshotId);
      const scopeLabel = documentClass ? ` · filtro ${documentClass}` : "";

      body.innerHTML = `<div class="spw-history-detail-grid"><article><span>SIGEM</span><strong>${fmt(metric.sigem)}</strong></article><article><span>PW cadastrado</span><strong>${fmt(metric.pwRegistered)}</strong></article><article><span>PW emitido</span><strong>${fmt(metric.pwEmitted)}</strong></article><article><span>Postar no PW</span><strong>${fmt(metric.postPw)}</strong></article><article><span>Postar no SIGEM</span><strong>${fmt(metric.postSigem)}</strong></article><article><span>Alinhados</span><strong>${fmt(metric.aligned)}</strong></article><article><span>Cobertura</span><strong>${pct(metric.coverage)}</strong></article><article><span>Taxa de emissão PW</span><strong>${pct(metric.emissionRate)}</strong></article><article><span>Motor</span><strong>${esc(snapshot.calculationVersion)}</strong></article></div><section class="spw-history-change"><h4>Fontes e qualidade${esc(scopeLabel)}</h4><div class="spw-history-change-list"><div><strong>SIGEM · ${esc(snapshot.sigemFileName || "—")}</strong><span>${esc(fmtDate(snapshot.sigemImportedAt))} · ${fmt(sourceSigem && sourceSigem.metrics && sourceSigem.metrics.rawRecords || 0)} registros brutos · ${fmt(sourceSigem && sourceSigem.metrics && sourceSigem.metrics.outsideScope || 0)} fora do escopo · ${fmt(sourceSigem && sourceSigem.metrics && sourceSigem.metrics.invalidRecords || 0)} inválidos</span></div><div><strong>ProjectWise · ${esc(snapshot.pwFileName || "—")}</strong><span>${esc(fmtDate(snapshot.pwImportedAt))} · ${fmt(sourcePw && sourcePw.metrics && sourcePw.metrics.rawRecords || 0)} registros brutos · ${fmt(sourcePw && sourcePw.metrics && sourcePw.metrics.outsideScope || 0)} fora do escopo · ${fmt(sourcePw && sourcePw.metrics && sourcePw.metrics.invalidRecords || 0)} inválidos</span></div>${delta ? `<div><strong>Variação agregada${esc(scopeLabel)}</strong><span>SIGEM ${deltaText(delta.sigem)} · PW ${deltaText(delta.pwRegistered)} · emitidos ${deltaText(delta.pwEmitted)} · Postar PW ${deltaText(delta.postPw)} · alinhados ${deltaText(delta.aligned)}</span></div>` : ""}</div></section>${snapshot.delta ? changeList("Pendências resolvidas", changes && changes.resolved, "Nenhuma pendência passou a alinhada neste filtro.") + changeList("Novas pendências", changes && changes.newPending, "Nenhuma nova pendência identificada neste filtro.") + changeList("Passaram a ficar alinhados", changes && changes.becameAligned, "Nenhum documento mudou para alinhado neste filtro.") + changeList("Mudaram de revisão", changes && changes.changedRevision, "Nenhuma mudança de revisão neste filtro.") : `<section class="spw-history-change"><h4>Primeiro comparativo</h4><div class="spw-history-change-list"><div>Não existe ponto anterior para calcular mudanças.</div></div></section>`}`;
    } catch (error) {
      body.innerHTML = `<div class="spw-history-empty"><strong>Não foi possível carregar o detalhamento.</strong>${esc(error && error.message || error)}</div>`;
    }
  }

  function installDetailInterception() {
    document.addEventListener("click", (event) => {
      const trigger = event.target && event.target.closest ? event.target.closest("[data-spw-history-snapshot]") : null;
      if (!trigger) return;
      const host = document.getElementById("sigem-pw-dashboard-module");
      if (!host || !host.contains(trigger)) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      void openSnapshot(trigger.getAttribute("data-spw-history-snapshot"), trigger);
    }, true);

    document.addEventListener("click", (event) => {
      const close = event.target && event.target.closest ? event.target.closest("#spw-history-close") : null;
      if (!close || !runtime.detailTrigger) return;
      const trigger = runtime.detailTrigger;
      runtime.detailTrigger = null;
      setTimeout(() => trigger && typeof trigger.focus === "function" && trigger.focus(), 0);
    }, true);
  }

  root.addEventListener("grcon:conference-updated", () => { runtime.lastBaseToken = ""; });
  root.addEventListener("grcon:pw-base-updated", () => { runtime.lastBaseToken = ""; });

  installDetailInterception();
  root.GrconSigemPwHistoryUi = Object.freeze({
    activate,
    refresh: original.refresh,
    recordCurrent,
    state: original.state,
  });
  root.GrconSigemPwHistoryPostMerge = Object.freeze({
    version: "1",
    currentBaseToken,
    selectedClass,
  });
})(window);
