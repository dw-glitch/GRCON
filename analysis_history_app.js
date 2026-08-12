(function () {
  "use strict";

  const Core = window.GrconAnalysisHistory;
  const Report = window.GrconAnalysisHistoryReport;
  const Flow = window.GrconMacro5Flow;
  const History = window.GrconHistory;
  const APP_VERSION = "5.32.4";
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => Core.text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const state = { sessions: [], rows: [], total: 0, counts: {}, page: 1, pageSize: 200, loading: false, exporting: false, token: 0, selectedId: "", savedFilters: [] };
  const els = {
    module: $("#analysis-history-module"), search: $("#analysis-history-search"), status: $("#analysis-history-status"),
    start: $("#analysis-history-start"), end: $("#analysis-history-end"), session: $("#analysis-history-session"),
    export: $("#analysis-history-export"), clear: $("#analysis-history-clear"), deleteSession: $("#analysis-history-delete-session"),
    backup: $("#analysis-history-backup"), restore: $("#analysis-history-restore"), restoreInput: $("#analysis-history-restore-input"), quick: [...document.querySelectorAll("[data-analysis-quick]")],
    summary: $("#analysis-history-summary"), body: $("#analysis-history-body"), empty: $("#analysis-history-empty"),
    resultCount: $("#analysis-history-result-count"), pageStatus: $("#analysis-history-page-status"), previous: $("#analysis-history-previous"), next: $("#analysis-history-next"),
    storage: $("#analysis-history-storage"), tabCount: $("#analysis-history-tab-count"), sidebarCount: $("#ops-analysis-history-count"),
    savedFilter: $("#analysis-history-saved-filter"), saveFilter: $("#analysis-history-save-filter"), deleteFilter: $("#analysis-history-delete-filter"),
    detail: $("#analysis-history-detail"), detailBody: $("#analysis-history-detail-body"), detailTitle: $("#analysis-history-detail-title"), detailClose: $("#analysis-history-detail-close"), detailOverlay: $("#analysis-history-detail-overlay"),
    unifiedSearchText: $("#unified-search-text"), unifiedSearchBtn: $("#unified-search-btn"), unifiedSearchClear: $("#unified-search-clear"),
    unifiedSearchResults: $("#unified-search-results"), unifiedHistoryCount: $("#unified-history-count"), unifiedAnalysisCount: $("#unified-analysis-count"),
    unifiedSearchDetail: $("#unified-search-detail"),
  };

  function notify(message, kind) {
    if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind || "info");
    else if (kind === "error") window.alert(message);
  }
  function formatDate(value, withTime = true) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }
  function filters() {
    return {
      query: els.search.value,
      status: els.status.value || "ALL",
      startDate: els.start.value,
      endDate: els.end.value,
      sessionId: els.session.value,
    };
  }
  function validPeriod(show) {
    const invalid = Boolean(els.start.value && els.end.value && els.start.value > els.end.value);
    els.end.setCustomValidity(invalid ? "A data final deve ser igual ou posterior à data inicial." : "");
    if (invalid && show) els.end.reportValidity();
    return !invalid;
  }
  function statusClass(value) {
    const key = Core.statusKey(value);
    return key === "READY" ? "ready" : key === "BLOCKED" ? "blocked" : key === "DISCARD" ? "discard" : "review";
  }
  function sigemClass(value) {
    const normalized = Core.norm(value);
    if (normalized.includes("NAO POSTADO")) return "not-posted";
    if (normalized.includes("COM COMENTARIO") || normalized.includes("RECUS")) return "attention";
    if (normalized.includes("SEM COMENTARIO") || normalized.includes("EMITIDO") || normalized.includes("POSTADO")) return "posted";
    return "neutral";
  }
  function dateParts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
    return {
      date: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date),
      time: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date),
    };
  }
  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function renderSavedFilters() {
    if (!els.savedFilter || !Flow) return;
    const current = els.savedFilter.value;
    state.savedFilters = Flow.readSavedAnalysisFilters();
    els.savedFilter.innerHTML = '<option value="">Selecionar filtro</option>' + state.savedFilters.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
    if (state.savedFilters.some((item) => item.id === current)) els.savedFilter.value = current;
    if (els.deleteFilter) els.deleteFilter.disabled = !els.savedFilter.value;
  }

  function applyFilterValues(value) {
    const wanted = Flow?.normalizeAnalysisFilter?.(value) || value || {};
    els.search.value = wanted.query || "";
    els.status.value = wanted.status || "ALL";
    els.start.value = wanted.startDate || "";
    els.end.value = wanted.endDate || "";
    els.session.value = wanted.sessionId || "";
    state.page = 1;
  }

  function currentFilterLabel() {
    const selected = state.savedFilters.find((item) => item.id === els.savedFilter?.value);
    return selected ? selected.name : "";
  }

  function matchingSessions() {
    const wanted = filters();
    return state.sessions.filter((session) => {
      if (wanted.sessionId && session.id !== wanted.sessionId) return false;
      if (wanted.startDate && session.dateKey < wanted.startDate) return false;
      if (wanted.endDate && session.dateKey > wanted.endDate) return false;
      return true;
    });
  }
  function renderSessionOptions() {
    const current = els.session.value;
    els.session.innerHTML = '<option value="">Todas as análises</option>' + state.sessions.map((session) => `<option value="${escapeHtml(session.id)}">${escapeHtml(formatDate(session.analyzedAt, true))} · ${Number(session.total).toLocaleString("pt-BR")} docs · ${escapeHtml(session.ldName || "LD")}</option>`).join("");
    if (state.sessions.some((item) => item.id === current)) els.session.value = current;
  }
  function renderSummary(summary) {
    const counts = summary.counts || {};
    els.summary.innerHTML = [
      ["Análises", summary.sessions || 0, "neutral"],
      ["Documentos", summary.total || 0, "neutral"],
      ["Incluir", counts.READY || 0, "ready"],
      ["Não incluir", counts.BLOCKED || 0, "blocked"],
      ["Aguardar", counts.DISCARD || 0, "discard"],
      ["Conferir", counts.REVIEW || 0, "review"],
    ].map(([label, value, tone]) => `<div class="${tone}"><span>${label}</span><strong>${Number(value).toLocaleString("pt-BR")}</strong></div>`).join("");
  }

  async function unifiedSearch() {
    const raw = els.unifiedSearchText.value;
    const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (!lines.length) return;
    const terms = lines.map((l) => Core.norm(l));
    let historyCount = 0;
    let analysisCount = 0;
    let historyMatches = [];
    let analysisMatches = [];
    if (History) {
      const allHistory = History.read();
      historyMatches = allHistory.filter((record) => {
        const haystack = Core.norm([
          record.egrdtNumber, ...(record.numberHistory || []), record.outputType, record.ldName, record.sourceName,
          ...(record.allocations || []),
          ...(record.files || []).flatMap((file) => [file.document, file.originalName, file.finalName, file.allocation, file.revision, file.sigemStatus]),
        ].join(" "));
        return terms.some((term) => haystack.includes(term));
      });
      historyCount = historyMatches.length;
    }
    if (Core) {
      try {
        const allDocs = await Core.allDocuments({ all: true });
        analysisMatches = allDocs.filter((doc) => {
          const haystack = Core.norm([
            doc.document, doc.title, doc.statusDelivered, doc.reasonCode, doc.reason,
            doc.sigemStatus, doc.allocation, doc.allocationStatus, doc.ldVersion, doc.databook,
            doc.grdt, doc.originalFiles, doc.finalFiles,
          ].join(" | "));
          return terms.some((term) => haystack.includes(term));
        });
        analysisCount = analysisMatches.length;
      } catch (_) {
        console.debug("[AnalysisHistoryApp] context:", _);
      }
    }
    renderUnifiedResults(historyCount, analysisCount, historyMatches, analysisMatches);
  }

  function renderUnifiedResults(historyCount, analysisCount, historyMatches, analysisMatches) {
    els.unifiedHistoryCount.textContent = String(historyCount);
    els.unifiedAnalysisCount.textContent = String(analysisCount);
    els.unifiedSearchResults.hidden = false;
    els.unifiedSearchDetail.hidden = false;
    const hasHistory = historyMatches.length > 0;
    const hasAnalysis = analysisMatches.length > 0;
    els.unifiedSearchDetail.innerHTML = historyMatches.length || analysisMatches.length
      ? `<details open><summary>Detalhes (${historyCount} eGRDTs · ${analysisCount} análises)</summary>
        ${hasHistory ? `<div class="unified-search-detail-list">${historyMatches.map((r) => `<div class="unified-search-detail-item"><strong title="${escapeHtml(r.egrdtNumber)}">${escapeHtml(r.egrdtNumber)}</strong><small>${escapeHtml(r.outputType)} · ${r.documentCount} docs</small></div>`).join("")}</div>` : ""}
        ${hasAnalysis ? `<div class="unified-search-detail-list">${analysisMatches.map((r) => `<div class="unified-search-detail-item"><strong title="${escapeHtml(r.document || "")}">${escapeHtml(r.document || "—")}</strong><small>${escapeHtml(r.statusDelivered || "")} · ${escapeHtml(r.allocationStatus || "")}</small></div>`).join("")}</div>` : ""}
        </details>`
      : '<p class="unified-search-empty">Nenhum documento encontrado para os termos pesquisados.</p>';
  }
  function renderRows() {
    els.body.innerHTML = state.rows.map((item) => {
      const analyzed = dateParts(item.analyzedAt);
      return `<tr data-analysis-id="${escapeHtml(item.id)}" tabindex="0" aria-label="Abrir detalhes de ${escapeHtml(item.document || "documento")}">
      <td class="analysis-cell-date" data-label="Analisado em"><strong>${escapeHtml(analyzed.date)}</strong>${analyzed.time ? `<small>${escapeHtml(analyzed.time)}</small>` : ""}</td>
      <td class="analysis-cell-document" data-label="Documento"><strong title="${escapeHtml(item.document || "")}">${escapeHtml(item.document || "—")}</strong>${item.title ? `<small title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</small>` : ""}</td>
      <td class="analysis-cell-revision" data-label="Revisão atual"><strong>${escapeHtml(item.currentRevision || "—")}</strong></td>
      <td class="analysis-cell-revision" data-label="Próxima revisão"><strong>${escapeHtml(item.targetRevision || "—")}</strong>${item.targetRevisionStatus ? `<small>${escapeHtml(item.targetRevisionStatus)}</small>` : ""}</td>
      <td class="analysis-cell-result" data-label="Resultado GRCON"><span class="analysis-status-chip ${statusClass(item.statusDelivered)}">${escapeHtml(item.statusDelivered || "—")}</span></td>
      <td class="analysis-cell-sigem" data-label="SIGEM"><span class="analysis-sigem-chip ${sigemClass(item.sigemStatus)}">${escapeHtml(item.sigemStatus || "—")}</span></td>
      <td class="analysis-cell-allocation" data-label="Alocação"><strong>${escapeHtml(item.allocationStatus || "—")}</strong>${item.allocation ? `<small title="${escapeHtml(item.allocation)}">${escapeHtml(item.allocation)}</small>` : ""}</td>
      <td class="analysis-cell-ld" data-label="LD"><strong>${escapeHtml(item.ldVersion || "—")}</strong>${item.sheet || item.ldRow ? `<small>${escapeHtml([item.sheet, item.ldRow ? `linha ${item.ldRow}` : ""].filter(Boolean).join(" · "))}</small>` : ""}</td>
      <td class="analysis-cell-reason" data-label="Motivo" title="${escapeHtml(item.reason || "")}"><strong>${escapeHtml(item.reasonCode || "—")}</strong>${item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ""}</td>
    </tr>`;
    }).join("");
    els.empty.hidden = state.rows.length > 0;
    const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page > pages) state.page = pages;
    els.pageStatus.textContent = state.total ? `Página ${state.page} de ${pages} · ${state.total.toLocaleString("pt-BR")} documento(s)` : "Nenhum documento";
    els.previous.disabled = state.page <= 1;
    els.next.disabled = state.page >= pages;
    els.resultCount.textContent = `${state.total.toLocaleString("pt-BR")} documento(s)`;
  }
  function closeDetail() {
    if (!els.detail) return;
    els.detail.hidden = true;
    els.detail.setAttribute("aria-hidden", "true");
    if (els.detailOverlay) els.detailOverlay.hidden = true;
    state.selectedId = "";
  }

  function detailField(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`;
  }

  async function openDetail(item) {
    if (!item || !els.detail || !els.detailBody) return;
    state.selectedId = item.id;
    els.detail.hidden = false;
    els.detail.setAttribute("aria-hidden", "false");
    if (els.detailOverlay) els.detailOverlay.hidden = false;
    if (els.detailTitle) els.detailTitle.textContent = item.document || "Documento analisado";
    els.detailBody.innerHTML = '<div class="analysis-detail-card"><strong>Carregando comparação…</strong></div>';
    try {
      const candidates = await Core.allDocuments({ query: item.document });
      const exact = candidates.filter((entry) => Core.norm(entry.document) === Core.norm(item.document));
      const timeline = Flow?.analysisTimeline?.(exact) || exact;
      const historyRecords = History?.read?.() || [];
      const related = Flow?.relatedEgrdt?.(item, historyRecords) || null;
      const currentIndex = timeline.findIndex((entry) => entry.id === item.id);
      const previous = currentIndex > 0 ? timeline[currentIndex - 1] : null;
      const changes = previous ? [
        Core.norm(previous.statusDelivered) !== Core.norm(item.statusDelivered) ? `Resultado GRCON: ${previous.statusDelivered || "—"} → ${item.statusDelivered || "—"}` : "",
        Core.norm(previous.sigemStatus) !== Core.norm(item.sigemStatus) ? `SIGEM: ${previous.sigemStatus || "—"} → ${item.sigemStatus || "—"}` : "",
        Core.norm(previous.targetRevision) !== Core.norm(item.targetRevision) ? `Próxima revisão: ${previous.targetRevision || "—"} → ${item.targetRevision || "—"}` : "",
      ].filter(Boolean) : [];
      els.detailBody.innerHTML = `
        <section class="analysis-detail-card"><h4>Decisão desta análise</h4><dl class="analysis-detail-grid">
          ${detailField("Analisado em", formatDate(item.analyzedAt, true))}
          ${detailField("Resultado GRCON", item.statusDelivered)}
          ${detailField("Revisão atual", item.currentRevision)}
          ${detailField("Próxima revisão", item.targetRevision)}
          ${detailField("Status da revisão", item.targetRevisionStatus)}
          ${detailField("SIGEM", item.sigemStatus)}
          ${detailField("Situação da postagem", item.postingStatus)}
          ${detailField("Alocação", [item.allocationStatus, item.allocation].filter(Boolean).join(" · "))}
          ${detailField("LD utilizada", [item.ldVersion, item.sheet, item.ldRow ? `linha ${item.ldRow}` : ""].filter(Boolean).join(" · "))}
          ${detailField("Caminho Databook", item.databook)}
        </dl></section>
        <section class="analysis-detail-card"><h4>Evidência e motivo</h4><dl class="analysis-detail-grid">
          ${detailField("Código do motivo", item.reasonCode)}
          ${detailField("Explicação", item.reason)}
          ${detailField("Comentário da Fiscal", item.fiscalComment)}
          ${detailField("Origem da entrada", item.inputSource)}
          ${detailField("Arquivos originais", item.originalFiles)}
          ${detailField("Arquivos finais", item.finalFiles)}
        </dl>${changes.length ? `<p><strong>Mudanças desde a análise anterior:</strong><br>${changes.map(escapeHtml).join("<br>")}</p>` : '<p>Nenhuma mudança material em relação à análise anterior localizada.</p>'}</section>
        <section class="analysis-detail-card"><h4>Linha do tempo deste documento</h4>${timeline.length ? `<ol class="analysis-timeline">${[...timeline].reverse().map((entry) => `<li><strong>${escapeHtml(formatDate(entry.analyzedAt, true))} · ${escapeHtml(entry.statusDelivered || "—")}</strong><span>Rev. ${escapeHtml(entry.currentRevision || "—")} → ${escapeHtml(entry.targetRevision || "—")} · SIGEM: ${escapeHtml(entry.sigemStatus || "—")}</span>${entry.changes?.length ? `<small>${entry.changes.map(escapeHtml).join(" · ")}</small>` : `<small>${escapeHtml(entry.reason || "Primeiro registro localizado")}</small>`}</li>`).join("")}</ol>` : '<p>Nenhuma análise anterior localizada.</p>'}</section>
        <section class="analysis-detail-card"><h4>eGRDT relacionada</h4>${related ? `<p><strong>${escapeHtml(related.egrdtNumber)}</strong><br>${escapeHtml(formatDate(related.generatedAt, true))} · ${related.documentCount} documento(s)</p><div class="analysis-detail-actions"><button class="primary-button" data-analysis-detail-action="open-egrdt" data-history-id="${escapeHtml(related.id)}" type="button">Abrir eGRDT no histórico</button><button class="secondary-button" data-analysis-detail-action="prepare-sigem" data-history-id="${escapeHtml(related.id)}" type="button">Preparar no SIGEM</button></div>` : '<p>Este documento ainda não possui uma eGRDT relacionada no histórico local.</p>'}</section>`;
      els.detailClose?.focus();
    } catch (error) {
      els.detailBody.innerHTML = `<div class="analysis-detail-card"><strong>Não foi possível abrir a comparação.</strong><p>${escapeHtml(error.message || "Erro desconhecido")}</p></div>`;
    }
  }

  async function openRelatedHistory(id, prepareSigem) {
    await window.GRCONModuleLoader?.ensureModule?.("history");
    window.GrconHistoryUi?.select?.(id);
    if (prepareSigem) {
      const record = History?.read?.().find((entry) => entry.id === id);
      if (record && window.GrconSigemPosting) {
        window.GrconSigemPosting.registerGenerated([record], { appVersion: APP_VERSION });
        await window.GRCONModuleLoader?.ensureModule?.("sigem");
        const posting = window.GrconSigemPosting.read().find((entry) => entry.historyId === id || entry.id === id);
        if (posting) window.GrconSigemUi?.select?.(posting.id);
      }
    }
    closeDetail();
  }

  async function renderStorage() {
    const estimate = await Core.storageEstimate();
    els.storage.textContent = estimate && estimate.quota ? `Armazenamento local usado pelo navegador: ${formatBytes(estimate.usage)} de ${formatBytes(estimate.quota)} disponíveis.` : "O histórico fica no armazenamento local deste navegador.";
  }
  async function render() {
    if (!Core || !els.module) return;
    const token = ++state.token;
    state.loading = true;
    els.body.innerHTML = '<tr><td colspan="9" class="analysis-history-loading">Carregando histórico…</td></tr>';
    try {
      state.sessions = await Core.listSessions();
      if (token !== state.token) return;
      renderSessionOptions();
      renderSavedFilters();
      const wanted = filters();
      const result = await Core.queryDocuments(wanted, { offset: (state.page - 1) * state.pageSize, limit: state.pageSize });
      const summary = { total: result.total, counts: result.counts, sessions: result.sessionIds.length, latest: result.latest };
      if (token !== state.token) return;
      state.rows = result.rows; state.total = result.total; state.counts = result.counts;
      renderSummary(summary); renderRows(); renderStorage();
      const count = state.sessions.length;
      [els.tabCount, els.sidebarCount].forEach((element) => { if (!element) return; element.textContent = String(count); element.hidden = count === 0; });
      els.export.disabled = !state.total || state.exporting || !validPeriod(false) || !Report;
      els.export.textContent = state.exporting ? "Gerando relatório…" : (wanted.startDate || wanted.endDate ? "Baixar relatório do período" : "Baixar relatório Excel");
      els.deleteSession.disabled = !els.session.value;
    } catch (error) {
      console.error(error);
      els.body.innerHTML = `<tr><td colspan="9" class="analysis-history-loading error">${escapeHtml(error.message || "Não foi possível abrir o histórico.")}</td></tr>`;
      notify(error.message || "Não foi possível abrir o histórico de análises.", "error");
    } finally { state.loading = false; }
  }
  async function exportReport() {
    if (!validPeriod(true) || !Report) return;
    state.exporting = true; els.export.disabled = true; els.export.textContent = "Gerando relatório…";
    try {
      const wanted = filters();
      const documents = await Core.allDocuments(wanted);
      const sessionIds = new Set(documents.map((item) => item.sessionId));
      const sessions = state.sessions.filter((session) => sessionIds.has(session.id));
      await window.GRCONModuleLoader?.ensure("excel");
      await window.GRCONModuleLoader?.ensure("brand");
      const options = { ...wanted, appVersion: APP_VERSION, brandAssets: window.GRCONBrandAssets };
      const buffer = await Report.buildWorkbook(documents, sessions, options);
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), Report.downloadName(documents, options));
      notify(`${documents.length.toLocaleString("pt-BR")} documento(s) incluído(s) no relatório.`, "success");
    } catch (error) {
      console.error(error); notify(error.message || "Não foi possível gerar o relatório do histórico.", "error");
    } finally { state.exporting = false; els.export.textContent = "Baixar relatório Excel"; render(); }
  }
  function scheduleRender(resetPage = true) {
    if (resetPage) state.page = 1;
    window.clearTimeout(scheduleRender.timer);
    scheduleRender.timer = window.setTimeout(render, 300);
  }


  function isoLocal(date) { const d = new Date(date); const pad = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function applyQuickFilter(kind) {
    const today = new Date();
    if (kind === "today") { els.start.value = isoLocal(today); els.end.value = isoLocal(today); els.status.value = "ALL"; }
    if (kind === "7days") { const start = new Date(today); start.setDate(start.getDate() - 6); els.start.value = isoLocal(start); els.end.value = isoLocal(today); els.status.value = "ALL"; }
    if (kind === "pending") { els.status.value = "REVIEW"; els.start.value = ""; els.end.value = ""; }
    if (kind === "included") { els.status.value = "READY"; els.start.value = ""; els.end.value = ""; }
    state.page = 1; render();
  }
  async function backupHistory() {
    try { const data = await Core.exportBackup(); const stamp = new Date().toISOString().replace(/[:.]/g, "-"); downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `GRCON_Backup_Historico_Analises_${stamp}.json`); notify("Backup do histórico gerado.", "success"); }
    catch (error) { notify(error.message || "Não foi possível gerar o backup.", "error"); }
  }
  async function restoreHistory(file) {
    if (!file) return;
    try { const data = JSON.parse(await file.text()); if (!window.confirm("Restaurar este backup substituindo o histórico atual deste navegador?")) return; const result = await Core.importBackup(data, { replace: true }); state.page = 1; await render(); window.dispatchEvent(new CustomEvent("grcon:analysis-history-updated")); notify(`${result.documents.toLocaleString("pt-BR")} documento(s) restaurado(s).`, "success"); }
    catch (error) { notify(error.message || "Não foi possível restaurar o backup.", "error"); }
    finally { if (els.restoreInput) els.restoreInput.value = ""; }
  }

  els.body.addEventListener("click", (event) => {
    const row = event.target.closest("[data-analysis-id]");
    if (!row) return;
    const item = state.rows.find((entry) => entry.id === row.dataset.analysisId);
    if (item) openDetail(item);
  });
  els.body.addEventListener("keydown", (event) => {
    if (!(["Enter", " "].includes(event.key))) return;
    const row = event.target.closest("[data-analysis-id]");
    if (!row) return;
    event.preventDefault();
    const item = state.rows.find((entry) => entry.id === row.dataset.analysisId);
    if (item) openDetail(item);
  });
  els.detailClose?.addEventListener("click", closeDetail);
  els.detailOverlay?.addEventListener("click", closeDetail);
  els.detailBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-analysis-detail-action]");
    if (!button) return;
    openRelatedHistory(button.dataset.historyId, button.dataset.analysisDetailAction === "prepare-sigem");
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && els.detail && !els.detail.hidden) closeDetail(); });
  els.savedFilter?.addEventListener("change", () => {
    const selected = state.savedFilters.find((item) => item.id === els.savedFilter.value);
    if (selected) { applyFilterValues(selected.filter); render(); }
    if (els.deleteFilter) els.deleteFilter.disabled = !selected;
  });
  els.saveFilter?.addEventListener("click", () => {
    if (!Flow) return;
    const name = window.prompt("Nome para este conjunto de filtros:", currentFilterLabel() || "Meu filtro");
    if (!name) return;
    const result = Flow.saveAnalysisFilter(name, filters());
    if (!result.saved) { notify(result.error, "error"); return; }
    renderSavedFilters();
    els.savedFilter.value = result.item.id;
    if (els.deleteFilter) els.deleteFilter.disabled = false;
    notify("Filtro salvo neste navegador.", "success");
  });
  els.deleteFilter?.addEventListener("click", () => {
    if (!Flow || !els.savedFilter.value) return;
    const selected = state.savedFilters.find((item) => item.id === els.savedFilter.value);
    if (!selected || !window.confirm(`Excluir o filtro salvo “${selected.name}”?`)) return;
    Flow.deleteAnalysisFilter(selected.id);
    renderSavedFilters();
    notify("Filtro salvo excluído.", "success");
  });

  [els.search].forEach((element) => element.addEventListener("input", () => scheduleRender(true)));
  [els.status, els.start, els.end, els.session].forEach((element) => element.addEventListener("change", () => scheduleRender(true)));
  els.previous.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; render(); } });
  els.next.addEventListener("click", () => { state.page += 1; render(); });
  els.export.addEventListener("click", exportReport);
  els.quick.forEach((button) => button.addEventListener("click", () => applyQuickFilter(button.dataset.analysisQuick)));
  els.backup?.addEventListener("click", backupHistory);
  els.restore?.addEventListener("click", () => els.restoreInput?.click());
  els.restoreInput?.addEventListener("change", () => restoreHistory(els.restoreInput.files?.[0]));
  els.clear.addEventListener("click", async () => {
    if (!state.sessions.length || !window.confirm("Apagar todo o histórico de análises salvo neste navegador? Esta ação não pode ser desfeita.")) return;
    await Core.clearAll(); state.page = 1; await render(); window.dispatchEvent(new CustomEvent("grcon:analysis-history-updated")); notify("Histórico de análises apagado.", "success");
  });
  els.deleteSession.addEventListener("click", async () => {
    const id = els.session.value;
    const session = state.sessions.find((item) => item.id === id);
    if (!session || !window.confirm(`Excluir a análise de ${formatDate(session.analyzedAt, true)} com ${session.total} documento(s)?`)) return;
    await Core.deleteSession(id); els.session.value = ""; state.page = 1; await render(); window.dispatchEvent(new CustomEvent("grcon:analysis-history-updated")); notify("Análise excluída do histórico.", "success");
  });
  els.unifiedSearchBtn?.addEventListener("click", unifiedSearch);
  els.unifiedSearchClear?.addEventListener("click", () => {
    els.unifiedSearchText.value = "";
    els.unifiedSearchResults.hidden = true;
    els.unifiedSearchDetail.hidden = true;
    els.unifiedHistoryCount.textContent = "0";
    els.unifiedAnalysisCount.textContent = "0";
  });
  els.unifiedSearchText?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      unifiedSearch();
    }
  });
  window.addEventListener("grcon:analysis-history-updated", () => render());
  window.GrconAnalysisHistoryUi = { state, render, openDetail };
  renderSavedFilters();
  render();
})();
