(function () {
  "use strict";

  const History = window.GrconHistory;
  const Posting = window.GrconSigemPosting;
  const Flow = window.GrconMacro5Flow;
  const HistoryReport = window.GrconHistoryReport;
  // A versão vem da configuração central (ou do <html data-version>) para não
  // precisar ser atualizada à mão em cada módulo. Antes ficava fixa aqui e saía
  // desatualizada nos relatórios sempre que a publicação era promovida.
  const APP_VERSION = (window.GrconConfig && window.GrconConfig.APP_VERSION)
    || document.documentElement.dataset.version
    || "5.38.2";
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => History.text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const state = { records: [], filtered: [], selectedId: "", editingId: "", exporting: false, historyReportWorker: null };
  const els = {
    tabs: [...document.querySelectorAll("[data-grcon-view]")],
    control: $("#grdt-module"), analysis: $("#analysis-history-module"), history: $("#history-module"), sigem: $("#sigem-module"), requests: $("#requests-module"), count: $("#history-tab-count"),
    search: $("#history-search"), year: $("#history-year"), type: $("#history-type"), postingStatus: $("#history-posting-status"), sort: $("#history-sort"),
    dateStart: $("#history-date-start"), dateEnd: $("#history-date-end"), periodDocumentType: $("#history-period-document-type"), periodStatus: $("#history-period-status"), exportPeriod: $("#history-export-period"),
    clear: $("#history-clear"), summary: $("#history-summary"), list: $("#history-list"), empty: $("#history-empty"), detail: $("#history-detail"), resultCount: $("#history-result-count"),
  };


  function notify(message, kind) {
    if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind || "info");
    else if (kind === "error") window.alert(message);
  }

  function validPeriod(showMessage) {
    const start = els.dateStart.value;
    const end = els.dateEnd.value;
    const invalid = Boolean(start && end && start > end);
    els.dateEnd.setCustomValidity(invalid ? "A data final deve ser igual ou posterior à data inicial." : "");
    if (invalid && showMessage) els.dateEnd.reportValidity();
    return !invalid;
  }

  function periodRecords() {
    return [...state.filtered];
  }

  function periodFamilyLabel() {
    return els.periodDocumentType?.value || "Todos";
  }

  function updatePeriodStatus() {
    if (!validPeriod(false)) { els.periodStatus.textContent = "Período inválido"; return; }
    const records = periodRecords();
    const label = HistoryReport ? HistoryReport.periodLabel(records, els.dateStart.value, els.dateEnd.value) : "Período selecionado";
    els.periodStatus.textContent = `${label} · Tipo: ${periodFamilyLabel()} · ${records.length.toLocaleString("pt-BR")} eGRDT(s)`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function buildWorkbookInWorker(records, options) {
    const webOrigin = location.protocol === "http:" || location.protocol === "https:";
    if (typeof Worker !== "function" || !webOrigin) return Promise.resolve(null);
    try {
      if (!state.historyReportWorker) {
        state.historyReportWorker = new Worker("history_report_worker.js");
      }
    } catch (error) {
      state.historyReportWorker = null;
      return Promise.reject(error);
    }
    const worker = state.historyReportWorker;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      const onMessage = (event) => {
        const payload = event.data || {};
        if (!payload || payload.type !== "history-report-result") return;
        cleanup();
        if (payload.ok) resolve(payload.buffer);
        else reject(new Error(payload.error || "Falha ao gerar relatório no worker."));
      };
      const onError = (error) => {
        cleanup();
        worker.terminate();
        if (state.historyReportWorker === worker) state.historyReportWorker = null;
        reject(error instanceof Error ? error : new Error("Falha no worker de relatório."));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ type: "history-report-build", records, options });
    });
  }

  async function exportPeriodReport() {
    const records = periodRecords();
    if (!validPeriod(true) || !records.length || !HistoryReport) return;
    state.exporting = true;
    els.exportPeriod.disabled = true;
    els.exportPeriod.textContent = "Gerando relação…";
    try {
      await window.GRCONModuleLoader?.ensure("excel");
      await window.GRCONModuleLoader?.ensure("brand");
      const options = { startDate: els.dateStart.value, endDate: els.dateEnd.value, documentFamily: els.periodDocumentType?.value || "", appVersion: APP_VERSION, brandAssets: window.GRCONBrandAssets };
      const workerBuffer = await buildWorkbookInWorker(records, options).catch(() => null);
      const buffer = workerBuffer || await HistoryReport.buildWorkbook(records, options);
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), HistoryReport.downloadName(records, options));
      notify(`${records.length} eGRDT(s) incluída(s) na relação do período · ${periodFamilyLabel()}.`, "success");
    } catch (error) {
      console.error(error);
      notify(error.message || "Não foi possível gerar a relação por período.", "error");
    } finally {
      state.exporting = false;
      els.exportPeriod.textContent = "Baixar relação do período";
      render();
    }
  }

  function formatDate(value, withTime) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }

  function parsedNumber(record) {
    return History.normalizeEgrdtNumber(record && record.egrdtNumber, new Date(record && record.generatedAt || Date.now()).getFullYear());
  }

  function activate(view) {
    const analysis = view === "analysis-history";
    const history = view === "history";
    const sigem = view === "sigem";
    els.control.hidden = view !== "control";
    if (els.analysis) els.analysis.hidden = !analysis;
    els.history.hidden = !history;
    if (els.sigem) els.sigem.hidden = !sigem;
    // A aba de e-mails também precisa entrar aqui: esta função esconde as
    // demais, e sem citá-la ela ficaria visível sobre outra aba (ou some).
    els.tabs.forEach((button) => {
      const active = button.dataset.grconView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    if (analysis) { window.GrconAnalysisHistoryUi?.render?.(); window.setTimeout(() => document.querySelector("#analysis-history-search")?.focus(), 0); }
    if (history) { render(); els.search.focus(); }
    if (sigem) { window.GrconSigemUi?.render?.(); window.setTimeout(() => document.querySelector("#sigem-search")?.focus(), 0); }
  }

  function optionHtml(value, label) {
    return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  }

  function refreshFilterOptions() {
    const previousYear = els.year.value;
    const previousType = els.type.value;
    const years = [...new Set(state.records.map((record) => parsedNumber(record)?.year).filter(Boolean))].sort((a, b) => b - a);
    const types = [...new Set(state.records.map((record) => record.outputType).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    els.year.innerHTML = '<option value="">Todos</option>' + years.map((year) => optionHtml(String(year), String(year))).join("");
    els.type.innerHTML = '<option value="">Todas</option>' + types.map((type) => optionHtml(type, type)).join("");
    els.year.value = years.map(String).includes(previousYear) ? previousYear : "";
    els.type.value = types.includes(previousType) ? previousType : "";
  }

  function sortRecords(records) {
    const mode = els.sort.value || "recent";
    return [...records].sort((a, b) => {
      if (mode === "oldest") return a.generatedAt.localeCompare(b.generatedAt);
      if (mode === "number-asc" || mode === "number-desc") {
        const first = parsedNumber(a)?.sequence || 0;
        const second = parsedNumber(b)?.sequence || 0;
        return mode === "number-asc" ? first - second : second - first;
      }
      return b.generatedAt.localeCompare(a.generatedAt);
    });
  }

  function refresh() {
    state.records = History.read();
    refreshFilterOptions();
    let filtered = History.filter(state.records, els.search.value);
    if (els.year.value) filtered = filtered.filter((record) => String(parsedNumber(record)?.year || "") === els.year.value);
    if (els.type.value) filtered = filtered.filter((record) => record.outputType === els.type.value);
    if (els.postingStatus?.value) {
      filtered = filtered.filter((record) => {
        const posting = postingRecord(record);
        return els.postingStatus.value === "AGUARDANDO" ? !posting : posting?.status === els.postingStatus.value;
      });
    }
    filtered = History.filterByDate(filtered, els.dateStart.value, els.dateEnd.value);
    // O tipo documental é um filtro de todo o Histórico, não apenas dos KPIs
    // e do Excel do período. Recortar antes de preencher state.filtered faz a
    // lista inferior exibir somente as eGRDTs que contêm N-1710, ET ou CV e
    // recalcula a contagem daquela família dentro de uma eGRDT mista.
    if (History && typeof History.filterByDocumentFamily === "function") {
      filtered = History.filterByDocumentFamily(filtered, els.periodDocumentType?.value || "");
    }
    state.filtered = sortRecords(filtered);
    if (!state.filtered.some((record) => record.id === state.selectedId)) state.selectedId = state.filtered[0] && state.filtered[0].id || "";
    if (els.count) { els.count.textContent = String(state.records.length); els.count.hidden = state.records.length === 0; }
    if (els.resultCount) els.resultCount.textContent = `${state.filtered.length.toLocaleString("pt-BR")} eGRDT(s)`;
    els.exportPeriod.disabled = state.exporting || !periodRecords().length || !validPeriod(false) || !HistoryReport;
    updatePeriodStatus();
  }

  function renderSummary() {
    const summary = History.summary(state.filtered);
    const postingRecords = state.filtered.map((record) => postingRecord(record));
    const awaiting = postingRecords.filter((record) => !record).length;
    const posted = postingRecords.filter((record) => record?.status === Posting?.STATUSES?.POSTADO).length;
    const attention = postingRecords.filter((record) => [Posting?.STATUSES?.PENDENCIA, Posting?.STATUSES?.FALHA].includes(record?.status)).length;
    els.summary.innerHTML = `<div><span>eGRDTs localizadas</span><strong>${summary.egrdts.toLocaleString("pt-BR")}</strong></div><div><span>Documentos registrados</span><strong>${summary.documents.toLocaleString("pt-BR")}</strong></div><div><span>Alocações relacionadas</span><strong>${summary.allocations.toLocaleString("pt-BR")}</strong></div><div><span>Aguardando SIGEM</span><strong>${awaiting.toLocaleString("pt-BR")}</strong></div><div><span>Postadas</span><strong>${posted.toLocaleString("pt-BR")}</strong></div><div><span>Pendências/Falhas</span><strong>${attention.toLocaleString("pt-BR")}</strong></div>`;
  }

  function postingRecord(record) {
    if (!Posting || !record) return null;
    return Posting.read().find((item) => item.historyId === record.id || item.id === record.id || item.egrdtNumber === record.egrdtNumber) || null;
  }

  function postingBadge(record) {
    const posting = postingRecord(record);
    const status = posting ? posting.status : Posting?.STATUSES?.GERADO || "GERADO";
    const label = posting ? Posting.statusLabel(status) : "Aguardando preparação";
    const tone = Flow?.postingTone?.(status) || "neutral";
    return `<span class="history-posting-status ${tone}">${escapeHtml(label)}</span>`;
  }

  function postingWorkflow(record) {
    const posting = postingRecord(record);
    const audit = posting && Posting ? Posting.audit(posting, Posting.read()) : { ready: false };
    const steps = Flow?.workflowSteps?.(posting?.status || "GERADO", Boolean(audit.ready)) || [];
    return `<nav class="posting-flow" aria-label="Fluxo da eGRDT até o SIGEM">${steps.map((step, index) => `<div class="posting-flow-step ${step.complete ? "complete" : ""} ${step.current ? "current" : ""}" data-step="${index + 1}"><strong>${escapeHtml(step.label)}</strong></div>`).join("")}</nav>`;
  }

  function revisionRelation(record, file, postings) {
    const source = postings || [];
    const own = source.find((item) => item.historyId === record.id || item.id === record.id || item.egrdtNumber === record.egrdtNumber) || null;
    const sameDocument = (item) => Posting?.norm?.(item?.document) === Posting?.norm?.(file?.document);
    const ownRevisions = own?.status === Posting?.STATUSES?.POSTADO
      ? [...new Set((own.files || []).filter(sameDocument).map((item) => Posting.text(item.revision)).filter(Boolean))]
      : [];
    const otherRows = source
      .filter((item) => item.status === Posting?.STATUSES?.POSTADO && (!own || item.id !== own.id))
      .flatMap((item) => (item.files || []).filter(sameDocument).map((entry) => ({
        revision: Posting.text(entry.revision),
        egrdt: Posting.text(item.postingGrdtNumber || item.egrdtNumber),
        at: item.resultAt || item.updatedAt,
      })))
      .filter((item) => item.revision && Posting.norm(item.revision) !== Posting.norm(file.revision))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const other = [];
    const seen = new Set();
    otherRows.forEach((item) => {
      const key = `${Posting.norm(item.revision)}|${Posting.norm(item.egrdt)}`;
      if (!seen.has(key)) { seen.add(key); other.push(item); }
    });
    return {
      generated: Posting?.text?.(file.revision) || "—",
      posted: ownRevisions.length ? ownRevisions.join(" · ") : "Não confirmada nesta GRDT",
      other: other.length ? other.map((item) => `Rev. ${item.revision} · ${item.egrdt}`).join(" | ") : "Nenhuma outra revisão postada",
    };
  }

  function renderList() {
    els.list.innerHTML = state.filtered.map((record) => {
      const allocation = record.allocations.length ? record.allocations.join(" · ") : "Sem alocação informada";
      const creator = record.createdByName || record.createdByEmail;
      const creatorLine = creator ? `<span class="history-record-user" title="Gerado por ${escapeHtml(record.createdByEmail || creator)}">${escapeHtml(creator)}</span>` : "";
      return `<button class="history-record ${record.id === state.selectedId ? "active" : ""}" data-history-id="${escapeHtml(record.id)}" type="button"><div class="history-record-main"><strong>${escapeHtml(record.egrdtNumber)}</strong><span>${formatDate(record.generatedAt, true)} · ${escapeHtml(record.outputType)}</span>${creatorLine}</div>${postingBadge(record)}<div class="history-record-counts"><span>${record.documentCount} documento(s)</span><span>${record.fileCount} arquivo(s)</span></div><small title="${escapeHtml(allocation)}">${escapeHtml(allocation)}</small></button>`;
    }).join("");
    els.empty.hidden = state.filtered.length > 0;
  }

  function historyNumberEditor(record) {
    if (state.editingId !== record.id) return "";
    const parsed = parsedNumber(record);
    const scope = window.GrconCloud?.state?.membership ? "Atualiza o histórico compartilhado. O arquivo já baixado não é renomeado." : "Altera somente o registro local do histórico. O arquivo já baixado não é renomeado.";
    return `<form class="history-number-editor" id="history-number-editor"><label for="history-number-input"><span>Novo número sequencial</span><input autocomplete="off" id="history-number-input" inputmode="numeric" maxlength="4" value="${escapeHtml(parsed ? String(parsed.sequence).padStart(4, "0") : "")}"/></label><div><small>${escapeHtml(scope)}</small><div class="history-number-editor-actions"><button class="secondary-button compact" data-history-action="cancel" type="button">Cancelar</button><button class="primary-button compact" data-history-action="save" type="submit">Salvar número</button></div></div></form>`;
  }

  function renderDetail() {
    const record = state.records.find((item) => item.id === state.selectedId);
    if (!record) {
      els.detail.innerHTML = '<div class="history-detail-empty"><strong>Selecione uma eGRDT</strong><span>Os documentos, a LD e as alocações aparecerão aqui.</span></div>';
      return;
    }
    const previousNumbers = record.numberHistory && record.numberHistory.length
      ? `<div><dt>Números anteriores</dt><dd>${record.numberHistory.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</dd></div>`
      : "";
    const postings = Posting?.read?.() || [];
    const creator = record.createdByName || record.createdByEmail;
    const creatorLine = creator ? `<p class="history-record-user">Gerado por ${escapeHtml(creator)}</p>` : "";
    const canDelete = !window.GrconCloud?.state?.membership || window.GrconCloud.canManageHistory();
    const deleteAction = canDelete ? `<button class="history-delete-button" data-history-action="delete" type="button" aria-label="Excluir esta eGRDT do histórico" title="Excluir somente esta eGRDT"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/></svg><span>Excluir</span></button>` : "";
    els.detail.innerHTML = `<header><div class="history-detail-title"><span>eGRDT REGISTRADA</span><h3>${escapeHtml(record.egrdtNumber)}</h3><p>${formatDate(record.generatedAt, true)} · ${escapeHtml(record.outputType)}</p>${creatorLine}${postingBadge(record)}</div><div class="history-detail-actions"><button class="primary-button compact" data-history-action="prepare-sigem" type="button">Preparar no SIGEM</button><button class="secondary-button compact" data-history-action="email-reply" title="Montar a resposta de e-mail com os documentos desta eGRDT" type="button">Resposta de e-mail</button><button class="secondary-button compact" data-history-action="edit" type="button">Editar número</button>${deleteAction}<div class="history-detail-numbers"><span><strong>${record.documentCount}</strong> documentos</span><span><strong>${record.fileCount}</strong> arquivos</span></div></div></header>
      ${postingWorkflow(record)}
      ${historyNumberEditor(record)}
      <dl class="history-detail-meta"><div><dt>LD utilizada</dt><dd>${escapeHtml(record.ldName || "Não informada")}</dd></div><div><dt>Origem dos documentos</dt><dd>${escapeHtml(record.sourceName || "Pasta documental")}</dd></div><div><dt>Alocação</dt><dd>${record.allocations.length ? record.allocations.map((value) => `<span>${escapeHtml(value)}</span>`).join("") : "Não informada na LD"}</dd></div>${previousNumbers}</dl>
      <div class="history-detail-table"><table><thead><tr><th>Documento</th><th>Arquivo original</th><th>Arquivo enviado</th><th>Revisão gerada na GRDT</th><th>Revisão desta GRDT postada</th><th>Outra revisão postada</th><th>Status SIGEM na geração</th><th>Alocação</th><th>Versão da LD enviada</th><th>Aba LD</th></tr></thead><tbody>${record.files.map((file) => {
        const relation = revisionRelation(record, file, postings);
        const manualNote = file.revisionManual
          ? ` <span class="history-revision-manual" title="Alterada manualmente na triagem · sugestão do sistema na época: ${escapeHtml(file.revisionSuggested || "—")}">Alterada manualmente</span>`
          : "";
        return `<tr><td>${escapeHtml(file.document || "—")}</td><td>${escapeHtml(file.originalName || "—")}</td><td>${escapeHtml(file.finalName || "—")}</td><td><strong>${escapeHtml(relation.generated)}</strong>${manualNote}</td><td>${escapeHtml(relation.posted)}</td><td>${escapeHtml(relation.other)}</td><td>${escapeHtml(file.sigemStatus || "—")}</td><td>${escapeHtml(file.allocation || "—")}</td><td>${escapeHtml(file.ldVersion || "Não registrada")}</td><td>${escapeHtml(file.sheet || "—")}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    if (state.editingId === record.id) window.setTimeout(() => $("#history-number-input")?.focus(), 0);
  }

  function render() { refresh(); renderSummary(); renderList(); renderDetail(); }
  function select(id) { state.selectedId = id; state.editingId = ""; renderList(); renderDetail(); }

  // A resposta ao e-mail de quem pediu a emissão usa a mesma relação exibida
  // aqui. O painel é montado por egrdt_email_reply_ui.js.
  function openEmailReply() {
    const record = state.records.find((item) => item.id === state.selectedId);
    if (!record) return;
    if (!window.GrconEgrdtEmailReplyUi) {
      notify("O painel da resposta de e-mail não está disponível nesta sessão.", "error");
      return;
    }
    window.GrconEgrdtEmailReplyUi.open([record]);
  }

  async function prepareForSigem() {
    const record = state.records.find((item) => item.id === state.selectedId);
    if (!record || !Posting) return;
    Posting.registerGenerated([record], { appVersion: APP_VERSION });
    await window.GRCONModuleLoader?.ensureModule?.("sigem");
    const posting = Posting.read().find((item) => item.historyId === record.id || item.id === record.id || item.egrdtNumber === record.egrdtNumber);
    if (posting) window.GrconSigemUi?.select?.(posting.id);
    window.dispatchEvent(new CustomEvent("grcon:sigem-updated", { detail: { record: posting, preparedFromHistory: true } }));
    notify("eGRDT preparada na fila de postagem SIGEM.", "success");
  }

  function saveEditedNumber() {
    const record = state.records.find((item) => item.id === state.selectedId);
    const input = $("#history-number-input");
    if (!record || !input) return;
    const result = History.updateNumber(record.id, input.value);
    if (!result.updated) {
      input.setAttribute("aria-invalid", "true");
      input.setCustomValidity(result.error || "Número inválido.");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    window.GrconEgrdtSequence?.syncFromNumber?.(result.record.egrdtNumber);
    state.selectedId = result.record.id;
    state.editingId = "";
    render();
    window.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { renamed: true, previous: result.previous, current: result.record.egrdtNumber } }));
  }

  async function deleteSelectedRecord() {
    const record = state.records.find((item) => item.id === state.selectedId);
    if (!record) return;
    const shared = Boolean(window.GrconCloud?.state?.membership?.workspace_id);
    const confirmed = window.confirm(
      `Excluir somente ${record.egrdtNumber} do histórico ${shared ? "compartilhado" : "local"}?\n\n${shared ? "A reserva desse número também será removida e ele poderá ser usado novamente. " : ""}Os arquivos já baixados e os registros da fila SIGEM não serão alterados.`,
    );
    if (!confirmed) return;
    const deleteButton = els.detail.querySelector('[data-history-action="delete"]');
    if (deleteButton) deleteButton.disabled = true;
    let cloudResult = null;
    try {
      if (shared) {
        if (!window.GrconCloud?.deleteHistoryRecord) throw new Error("Atualize o GRCON para concluir a exclusão no Supabase.");
        cloudResult = await window.GrconCloud.deleteHistoryRecord(record);
      }
    } catch (error) {
      notify(error?.message || "Não foi possível excluir a eGRDT no Supabase.", "error");
      if (deleteButton) deleteButton.disabled = false;
      return;
    }
    const result = History.deleteOne(record.id);
    if (!result.deleted) {
      notify(result.error || "Não foi possível excluir esta eGRDT.", "error");
      if (deleteButton) deleteButton.disabled = false;
      return;
    }
    state.selectedId = result.records[0] && result.records[0].id || "";
    state.editingId = "";
    render();
    window.dispatchEvent(new CustomEvent("grcon:history-updated", {
      detail: {
        deleted: true,
        recordId: record.clientRecordId || record.id,
        cloudId: record.cloudId || "",
        workspaceId: record.workspaceId || "",
        reservationIds: record.reservationIds || [],
        cloudDeleted: Boolean(cloudResult),
      },
    }));
    notify(shared
      ? `eGRDT excluída do histórico compartilhado. O número ${record.egrdtNumber} foi liberado para reutilização.`
      : "eGRDT excluída do histórico local.", "success");
  }

  els.tabs.forEach((button) => button.addEventListener("click", () => activate(button.dataset.grconView)));
  [els.search, els.year, els.type, els.postingStatus, els.sort, els.dateStart, els.dateEnd, els.periodDocumentType].filter(Boolean).forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", render));
  els.exportPeriod.addEventListener("click", exportPeriodReport);
  els.list.addEventListener("click", (event) => { const button = event.target.closest("[data-history-id]"); if (button) select(button.dataset.historyId); });
  els.detail.addEventListener("click", (event) => {
    const action = event.target.closest("[data-history-action]")?.dataset.historyAction;
    if (action === "prepare-sigem") prepareForSigem();
    if (action === "email-reply") openEmailReply();
    if (action === "edit") { state.editingId = state.selectedId; renderDetail(); }
    if (action === "delete") void deleteSelectedRecord();
    if (action === "cancel") { state.editingId = ""; renderDetail(); }
  });
  els.detail.addEventListener("submit", (event) => { if (event.target.id !== "history-number-editor") return; event.preventDefault(); saveEditedNumber(); });
  els.detail.addEventListener("input", (event) => { if (event.target.id === "history-number-input") event.target.value = String(event.target.value || "").replace(/\D/g, "").slice(0, 4); });
  els.clear.addEventListener("click", async () => {
    if (!state.records.length) return;
    const shared = Boolean(window.GrconCloud?.state?.membership?.workspace_id);
    const question = shared
      ? "Limpar todo o histórico compartilhado de eGRDTs?\n\nOs registros serão apagados também do Supabase e as numerações consumidas serão liberadas para reutilização."
      : "Limpar todo o histórico de eGRDTs salvo neste navegador?";
    if (!window.confirm(question)) return;
    if (shared) {
      const cleared = await window.GrconCloud?.clearHistory?.();
      if (cleared) { state.selectedId = ""; state.editingId = ""; render(); }
      return;
    }
    if (History.clear()) {
      state.selectedId = "";
      state.editingId = "";
      render();
      window.dispatchEvent(new CustomEvent("grcon:history-updated"));
    }
  });
  window.addEventListener("grcon:history-updated", render);
  window.addEventListener("grcon:sigem-updated", render);
  window.addEventListener("storage", (event) => { if (event.key === History.STORAGE_KEY) render(); });
  render();
  window.GrconHistoryUi = { state, render, activate, select };
})();
