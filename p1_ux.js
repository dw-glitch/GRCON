// @ts-check
(function () {
  "use strict";

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const numberFrom = (selector) => Number(String($(selector)?.textContent || "0").replace(/\D/g, "")) || 0;
  const isVisible = (element) => Boolean(element && !element.hidden && element.offsetParent !== null);
  const text = (selector) => String($(selector)?.textContent || "").trim();
  const Audit = window.CorporateOutputAudit;
  const escapeHtml = (value) => { const U = window.GrconUtils; return U && U.escapeHtml ? U.escapeHtml(value) : String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); };

  const state = {
    bypass: new Set(),
    confirmAction: null,
    dirty: false,
    collapsedOnce: false,
    auditBlocked: false,
    sequencePreview: null,
    sequenceEdited: false,
  };

  const els = {
    context: $("#p1-grdt-context"),
    contextLd: $("#p1-context-ld"),
    contextSource: $("#p1-context-source"),
    contextSummary: $("#p1-context-summary"),
    changeSources: $("#p1-change-sources"),
    controlPanel: $("#grdt-module .control-panel"),
    results: $("#results-section"),
    tableCard: $("#results-section .table-card"),
    columnsToggle: $("#p1-columns-toggle"),
    shownCount: $("#p1-shown-count"),
    overlay: $("#p1-confirm-overlay"),
    dialog: $("#p1-confirm-dialog"),
    title: $("#p1-confirm-title"),
    message: $("#p1-confirm-message"),
    facts: $("#p1-confirm-facts"),
    cancel: $("#p1-confirm-cancel"),
    confirm: $("#p1-confirm-ok"),
    sequenceField: $("#p1-sequence-confirm-field"),
    sequenceCheck: $("#p1-sequence-confirm"),
    batchSummary: $("#p1-batch-sequence-summary"),
    batchList: $("#p1-batch-sequence-list"),
    sequenceWarning: $("#p1-sequence-warning"),
    audit: $("#p1-output-audit"),
    auditSummary: $("#p1-output-audit-summary"),
    auditState: $("#p1-output-audit-state"),
    auditList: $("#p1-output-audit-list"),
    auditMore: $("#p1-output-audit-more"),
    conferenceNumber: $("#v6-conference-number"),
    conferenceSummary: $("#v6-conference-summary"),
    conferenceBody: $("#v6-conference-body"),
    conferenceEmpty: $("#v6-conference-empty"),
    conferenceFilters: $$('[data-v6-conference-filter]'),
  };

  let conferenceRows = [];
  let conferenceFilter = "all";

  function renderConferenceRows() {
    if (!els.conferenceBody) return;
    const rows = conferenceRows.filter((row) => {
      if (conferenceFilter === "all") return true;
      if (conferenceFilter === "included") return row.included;
      if (conferenceFilter === "excluded") return !row.included;
      if (conferenceFilter === "alerts") return Boolean(row.alerts && row.alerts !== "Nenhum alerta");
      return true;
    });
    const previewLimit = 500;
    const previewRows = rows.slice(0, previewLimit);
    els.conferenceBody.innerHTML = previewRows.map((row) => `<tr class="${row.included ? "included" : "excluded"}">
      <td><span class="v6-output-state ${row.included ? "included" : "excluded"}">${row.included ? "Incluído" : "Excluído"}</span></td>
      <td title="${escapeHtml(row.document)}">${escapeHtml(row.document || "—")}</td>
      <td title="${escapeHtml(row.originalName)}">${escapeHtml(row.originalName || "—")}</td>
      <td title="${escapeHtml(row.finalName)}">${escapeHtml(row.finalName || "—")}</td>
      <td>${escapeHtml(row.revision || "—")}</td>
      <td>${escapeHtml(row.sigemStatus || "—")}</td>
      <td title="${escapeHtml(row.databook)}">${escapeHtml(row.databook || "—")}</td>
      <td>${escapeHtml(row.decision || "—")}</td>
      <td class="v6-alert-cell ${row.alerts && row.alerts !== "Nenhum alerta" ? "has-alert" : ""}">${escapeHtml(row.alerts || "Nenhum alerta")}</td>
    </tr>`).join("");
    if (els.conferenceEmpty) els.conferenceEmpty.hidden = previewRows.length > 0;
    if (els.auditMore) els.auditMore.textContent = rows.length > previewLimit
      ? `${previewRows.length.toLocaleString("pt-BR")} de ${rows.length.toLocaleString("pt-BR")} arquivo(s) exibido(s) nesta prévia · ${conferenceRows.length.toLocaleString("pt-BR")} conferido(s).`
      : `${rows.length.toLocaleString("pt-BR")} de ${conferenceRows.length.toLocaleString("pt-BR")} arquivo(s) exibido(s).`;
  }

  function defaultMeta(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || /selecionar|nenhum|excel ou texto|aguardando/.test(normalized);
  }

  function sourceState() {
    const ld = text("#ld-meta");
    const folder = text("#pdf-meta");
    const list = text("#list-meta");
    const hasLd = !defaultMeta(ld);
    const hasFolder = !defaultMeta(folder);
    const hasList = !defaultMeta(list);
    return {
      ld,
      folder,
      list,
      hasLd,
      hasSource: hasFolder || hasList,
      sourceLabel: hasFolder ? folder : hasList ? list : "Nenhum documento adicionado",
    };
  }


  function updateContext() {
    if (!els.context) return;
    const source = sourceState();
    const hasResults = Boolean(els.results && !els.results.hidden);
    els.context.hidden = !source.hasLd;
    if (els.contextLd) els.contextLd.textContent = source.hasLd ? source.ld : "Nenhuma LD selecionada";
    if (els.contextSource) els.contextSource.textContent = source.sourceLabel;
    if (els.contextSummary) {
      els.contextSummary.textContent = hasResults
        ? `${numberFrom("#count-total")} analisados · ${numberFrom("#count-ready")} prontos · ${numberFrom("#count-review") + numberFrom("#count-blocked")} para conferir`
        : source.hasSource ? "Pronto para analisar" : "Adicione os documentos";
    }
    if (hasResults && !state.collapsedOnce) {
      state.collapsedOnce = true;
      els.controlPanel?.classList.add("p1-collapsed");
      if (els.changeSources) els.changeSources.textContent = "Alterar arquivos";
    }
  }

  function updateVisibleCount() {
    if (!els.shownCount) return;
    const filtered = Number(els.shownCount.dataset.filteredTotal || 0);
    const first = Number(els.shownCount.dataset.first || 0);
    const last = Number(els.shownCount.dataset.last || 0);
    if (filtered) {
      els.shownCount.textContent = `Exibindo ${first.toLocaleString("pt-BR")}–${last.toLocaleString("pt-BR")} de ${filtered.toLocaleString("pt-BR")}`;
      return;
    }
    const shown = $$("#results-body > tr.result-row").length;
    const total = numberFrom("#count-total");
    els.shownCount.textContent = total ? `Exibindo ${shown.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}` : "Nenhum resultado";
  }

  function updateDirtyState() {
    const hasResults = Boolean(els.results && !els.results.hidden);
    const selected = numberFrom("#selected-count");
    state.dirty = hasResults && selected > 0;
  }

  function updateAll() {
    updateContext();
    updateVisibleCount();
    updateDirtyState();
  }

  function renderOutputAudit(raw) {
    if (!els.audit || !Audit || !raw) {
      if (els.audit) els.audit.hidden = true;
      state.auditBlocked = false;
      return null;
    }
    const audit = Audit.analyze(raw);
    const preview = audit.items.slice(0, 12);
    els.audit.hidden = false;
    els.auditSummary.textContent = audit.summary;
    els.auditState.textContent = audit.valid ? "Entradas e saídas conferidas" : audit.issues.join(" ");
    els.auditState.classList.toggle("error", !audit.valid);
    if (els.conferenceNumber) els.conferenceNumber.textContent = audit.officialNumber || "Número ainda não definido";
    if (els.conferenceSummary) els.conferenceSummary.innerHTML = `<div><span>Incluídos</span><strong>${audit.includedCount}</strong></div><div><span>Excluídos</span><strong>${audit.excludedCount}</strong></div><div><span>Total conferido</span><strong>${audit.detailRows.length}</strong></div>`;
    conferenceRows = audit.detailRows;
    conferenceFilter = "all";
    els.conferenceFilters.forEach((button) => { button.classList.toggle("active", button.dataset.v6ConferenceFilter === "all"); button.setAttribute("aria-pressed", String(button.dataset.v6ConferenceFilter === "all")); });
    renderConferenceRows();
    if (els.auditList) {
      els.auditList.innerHTML = preview.map((item) => `<div class="p1-output-audit-item"><div><strong title="${escapeHtml(item.primary)}">${escapeHtml(item.primary || "—")}</strong><span>${escapeHtml(item.meta)}</span></div><b aria-hidden="true">→</b><div><strong title="${escapeHtml(item.secondary)}">${escapeHtml(item.secondary || "—")}</strong></div></div>`).join("");
    }
    state.auditBlocked = !audit.valid;
    return audit;
  }

  function batchSequenceInputs() {
    return $$(".p1-batch-sequence-input", els.batchList);
  }

  function batchSequenceValues() {
    return batchSequenceInputs().map((input) => String(input.value || "").trim());
  }

  function renderBatchSequenceEditor(plan) {
    if (!els.batchList || !plan) return;
    if (els.batchSummary) {
      els.batchSummary.textContent = plan.valid
        ? `${plan.totalItems} documento(s) · ${plan.count} eGRDT${plan.count === 1 ? "" : "s"}`
        : "Não foi possível preparar os lotes";
    }
    if (!plan.valid) {
      els.batchList.innerHTML = `<div class="p1-batch-sequence-error">${escapeHtml((plan.errors || []).join(" ") || "Revise os documentos selecionados.")}</div>`;
      return;
    }
    els.batchList.innerHTML = plan.groups.map((group) => {
      const name = group.suggested && group.suggested.baseName || "—";
      const value = group.suggested && group.suggested.sequenceText || "";
      const range = group.firstDocument === group.lastDocument
        ? group.firstDocument
        : `${group.firstDocument} → ${group.lastDocument}`;
      return `<article class="p1-batch-sequence-card" data-batch-index="${group.index}">
        <header><div><span>Lote ${group.number}</span><strong>${group.itemCount} documento${group.itemCount === 1 ? "" : "s"}</strong></div><small>Máximo de ${plan.limit}</small></header>
        <div class="p1-batch-sequence-fields">
          <label><span>Número sequencial</span><input id="p1-batch-sequence-${group.index}" name="p1-batch-sequence-${group.index}" autocomplete="off" class="p1-batch-sequence-input" data-batch-index="${group.index}" inputmode="numeric" maxlength="4" pattern="[0-9]{1,4}" type="text" value="${escapeHtml(value)}"/></label>
          <div><span>Nome final da eGRDT</span><strong data-batch-name>${escapeHtml(name)}</strong></div>
        </div>
        <p title="${escapeHtml(range)}">${escapeHtml(range)}</p>
        <small data-batch-warning></small>
      </article>`;
    }).join("");
  }

  function validateSequenceEditor(options) {
    const plan = state.sequencePreview;
    if (!plan || !els.batchList) return null;
    const values = batchSequenceValues();
    const checked = plan.valid ? window.GrconEgrdtBatchPlan?.validate?.(values, plan.count) : null;
    const valid = Boolean(plan.valid && checked && checked.valid);
    batchSequenceInputs().forEach((input, index) => {
      const item = checked && checked.items && checked.items[index];
      const card = input.closest(".p1-batch-sequence-card");
      const name = card && card.querySelector("[data-batch-name]");
      const warning = card && card.querySelector("[data-batch-warning]");
      const itemValid = Boolean(item && item.valid) && !(checked && checked.error && checked.error.includes(`lotes ${index + 1}`));
      input.setAttribute("aria-invalid", String(!itemValid));
      if (name) name.textContent = item && item.valid ? item.baseName : "Número inválido";
      if (warning) {
        warning.textContent = item && item.valid
          ? [item.duplicate ? "Número já encontrado no histórico local." : "", item.warning || ""].filter(Boolean).join(" ")
          : item && item.error || "Informe um número entre 0001 e 9999.";
      }
    });
    const general = [
      !plan.valid ? (plan.errors || []).join(" ") : "",
      checked && checked.error || "",
      (plan.warnings || []).join(" "),
      valid ? checked.warning || "" : "",
    ].filter(Boolean).join(" ");
    if (els.sequenceWarning) els.sequenceWarning.textContent = general;
    if (!valid && els.sequenceCheck) els.sequenceCheck.checked = false;
    if (options && options.resetConfirmation && els.sequenceCheck) els.sequenceCheck.checked = false;
    if (els.sequenceCheck) els.sequenceCheck.disabled = !valid;
    if (els.confirm) els.confirm.disabled = !valid || !els.sequenceCheck?.checked || state.auditBlocked;
    if (els.conferenceNumber) {
      if (!valid) els.conferenceNumber.textContent = "Numeração ainda não confirmada";
      else if (checked.items.length === 1) els.conferenceNumber.textContent = checked.items[0].baseName;
      else els.conferenceNumber.textContent = `${checked.items.length} eGRDTs · ${checked.items.map((item) => item.sequenceText).join(", ")}`;
    }
    let includedIndex = 0;
    conferenceRows.forEach((row) => {
      if (!row.included) return;
      const batchIndex = Math.floor(includedIndex / Number(plan.limit || 48));
      row.egrdtNumber = valid && checked.items[batchIndex] ? checked.items[batchIndex].baseName : "Numeração pendente";
      includedIndex += 1;
    });
    renderConferenceRows();
    return checked;
  }

  function openConfirm(config) {
    if (!els.overlay || !els.dialog) {
      if (typeof config.onConfirm === "function") config.onConfirm();
      return;
    }
    els.title.textContent = config.title;
    els.message.textContent = config.message;
    els.confirm.textContent = config.confirmLabel || "Confirmar";
    const auditSource = typeof config.audit === "function" ? config.audit() : config.audit;
    renderOutputAudit(auditSource);
    const batchPlan = config.requireSequenceConfirmation
      ? window.GrconEgrdtBatchPlan?.preview?.(config.batchMode || "all")
      : null;
    state.sequencePreview = batchPlan;
    state.sequenceEdited = false;
    const facts = [...(config.facts || [])];
    if (batchPlan && batchPlan.valid) {
      facts.push(`${batchPlan.totalItems} documento(s) serão distribuídos em ${batchPlan.count} eGRDT${batchPlan.count === 1 ? "" : "s"} de até ${batchPlan.limit}.`);
      if (batchPlan.count > 1) facts.push("Cada eGRDT será criada em uma pasta separada com seus próprios PDFs.");
    }
    els.facts.innerHTML = facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("");
    if (els.sequenceField) els.sequenceField.hidden = !batchPlan;
    if (batchPlan) renderBatchSequenceEditor(batchPlan);
    if (els.sequenceCheck) {
      els.sequenceCheck.checked = false;
      els.sequenceCheck.disabled = !batchPlan || !batchPlan.valid;
    }
    if (els.sequenceWarning) els.sequenceWarning.textContent = batchPlan && !batchPlan.valid ? (batchPlan.errors || []).join(" ") : "";
    els.confirm.disabled = Boolean(batchPlan) || state.auditBlocked;
    if (batchPlan) validateSequenceEditor({ resetConfirmation: true });
    state.confirmAction = config.onConfirm;
    els.overlay.hidden = false;
    els.dialog.hidden = false;
    document.body.classList.add("p1-modal-open");
    window.setTimeout(() => (batchPlan ? batchSequenceInputs()[0] : els.confirm)?.focus(), 0);
  }

  function closeConfirm() {
    if (els.overlay) els.overlay.hidden = true;
    if (els.dialog) els.dialog.hidden = true;
    if (els.sequenceField) els.sequenceField.hidden = true;
    if (els.sequenceCheck) els.sequenceCheck.checked = false;
    if (els.batchList) els.batchList.innerHTML = "";
    if (els.batchSummary) els.batchSummary.textContent = "—";
    if (els.confirm) els.confirm.disabled = false;
    if (els.audit) els.audit.hidden = true;
    state.auditBlocked = false;
    state.sequencePreview = null;
    state.sequenceEdited = false;
    document.body.classList.remove("p1-modal-open");
    state.confirmAction = null;
  }

  function protectButton(id, buildConfig) {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener("click", (event) => {
      if (state.bypass.has(id)) {
        state.bypass.delete(id);
        return;
      }
      if (button.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const config = buildConfig();
      openConfirm({
        ...config,
        onConfirm: () => {
          closeConfirm();
          state.bypass.add(id);
          if (["export-egrdt", "export-zip", "export-final-package"].includes(id)) state.dirty = false;
          button.click();
        },
      });
    }, true);
  }

  function selectedFacts() {
    const selected = numberFrom("#selected-count");
    return [
      `${selected} documento(s) selecionado(s)`,
      `${numberFrom("#count-ready")} documento(s) prontos na triagem`,
      `${numberFrom("#count-review")} documento(s) em Conferir podem seguir quando selecionados`,
      `${numberFrom("#count-blocked")} documento(s) em Não incluir permanecem bloqueados`,
      "Os arquivos originais não serão alterados.",
    ];
  }

  function installConfirmations() {
    protectButton("export-egrdt", () => ({
      title: "Confirmar a eGRDT final",
      message: "Revise este resumo antes de gerar o arquivo que será usado na postagem.",
      facts: selectedFacts(),
      confirmLabel: "Baixar eGRDT final",
      requireSequenceConfirmation: true,
      batchMode: "all",
      audit: () => window.GrconOutputPreview?.(),
    }));
    protectButton("export-report", () => ({
      title: "Baixar relatório da triagem?",
      message: "O relatório explica o resultado da análise e a origem de cada decisão.",
      facts: [`${numberFrom("#count-total")} documento(s) analisado(s)`, "Nenhum PDF ou LD será alterado."],
      confirmLabel: "Baixar relatório",
    }));
    protectButton("export-pending-allocation-pdfs", () => {
      const preview = window.GrconPendingAllocationUi?.preview?.() || {};
      return {
        title: "Baixar PDFs aguardando retorno?",
        message:
          "Estes PDFs serão separados para uso futuro. Eles continuarão bloqueados e nenhuma eGRDT será criada.",
        facts: [
          `${preview.documentCount || 0} documento(s) aguardando retorno`,
          `${preview.pdfCount || 0} PDF(s) no pacote`,
          "Atualize a LD para ALOCADO e analise novamente antes de gerar a eGRDT.",
        ],
        confirmLabel: "Baixar somente os PDFs",
      };
    });
    protectButton("export-zip", () => ({
      title: "Baixar PDFs e eGRDT?",
      message: "O pacote conterá somente os documentos selecionados e a eGRDT correspondente.",
      facts: selectedFacts(),
      confirmLabel: "Baixar PDFs + eGRDT",
      requireSequenceConfirmation: true,
      batchMode: "physical",
      audit: () => window.GrconOutputPreview?.(),
    }));
    protectButton("export-final-package", () => ({
      title: "Confirmar pacote completo",
      message: "Confira a quantidade de documentos antes de criar o pacote final.",
      facts: selectedFacts(),
      confirmLabel: "Baixar pacote completo",
      requireSequenceConfirmation: true,
      batchMode: "physical",
      audit: () => window.GrconOutputPreview?.(),
    }));
  }

  function installControls() {
    els.conferenceFilters.forEach((button) => button.addEventListener("click", () => {
      conferenceFilter = button.dataset.v6ConferenceFilter || "all";
      els.conferenceFilters.forEach((candidate) => { const active = candidate === button; candidate.classList.toggle("active", active); candidate.setAttribute("aria-pressed", String(active)); });
      renderConferenceRows();
    }));
    els.changeSources?.addEventListener("click", () => {
      const collapsed = els.controlPanel?.classList.toggle("p1-collapsed");
      els.changeSources.textContent = collapsed ? "Alterar arquivos" : "Ocultar arquivos";
      if (!collapsed) $("#ld-input")?.focus();
    });
    els.columnsToggle?.addEventListener("click", () => {
      const compact = els.tableCard?.classList.toggle("p1-essential-columns");
      els.columnsToggle.setAttribute("aria-pressed", String(Boolean(compact)));
      els.columnsToggle.textContent = compact ? "Mostrar todas as colunas" : "Mostrar somente o essencial";
    });
    els.cancel?.addEventListener("click", closeConfirm);
    els.overlay?.addEventListener("click", closeConfirm);
    els.batchList?.addEventListener("input", (event) => {
      const input = event.target.closest(".p1-batch-sequence-input");
      if (!input) return;
      state.sequenceEdited = true;
      input.value = String(input.value || "").replace(/\D/g, "").slice(0, 4);
      validateSequenceEditor({ resetConfirmation: true });
    });
    els.sequenceCheck?.addEventListener("change", () => {
      validateSequenceEditor();
    });
    els.confirm?.addEventListener("click", () => {
      if (els.sequenceField && !els.sequenceField.hidden && !els.sequenceCheck?.checked) return;
      if (state.sequencePreview) {
        const checked = validateSequenceEditor();
        if (!checked || !checked.valid) { batchSequenceInputs().find((input) => input.getAttribute("aria-invalid") === "true")?.focus(); return; }
        try { window.GrconEgrdtBatchPlan?.setNumbers?.(batchSequenceValues(), state.sequencePreview.count); }
        catch (error) { if (els.sequenceWarning) els.sequenceWarning.textContent = error.message || "Numeração inválida."; return; }
      }
      const action = state.confirmAction;
      if (typeof action === "function") action();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && els.dialog && !els.dialog.hidden) closeConfirm();
    });
    document.addEventListener("change", (event) => {
      if (event.target.matches("#ld-input,#pdf-input,#list-input,#select-all-ready,.row-select")) { scheduleUpdate(0); scheduleUpdate(350); }
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest("#analyze,#batch-egrdt,[data-filter],#reset")) { scheduleUpdate(0); scheduleUpdate(350); }
    });
    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
    window.addEventListener("storage", (event) => {
      if (!state.sequencePreview || !event.key || !event.key.startsWith("grcon.egrdt.sequence.v4.")) return;
      validateSequenceEditor({ resetConfirmation: true });
      if (els.sequenceWarning) {
        els.sequenceWarning.textContent = `Outra aba atualizou a sequência conhecida. Os números digitados foram mantidos, mas precisam ser confirmados novamente. ${window.GrconEgrdtSequence?.preview?.().collisionWarning || "Confira a fonte oficial."}`;
      }
    });
  }

  let updateTimer = 0;
  function scheduleUpdate(delay) {
    window.clearTimeout(updateTimer);
    updateTimer = window.setTimeout(updateAll, Number(delay) || 0);
  }

  function installStateEvents() {
    window.addEventListener("grcon:ui-update", () => scheduleUpdate(0));
    document.addEventListener("grcon:analysis-complete", () => scheduleUpdate(0));
  }

  function init() {
    if (els.tableCard) els.tableCard.classList.add("p1-essential-columns");
    if (els.columnsToggle) {
      els.columnsToggle.setAttribute("aria-pressed", "true");
      els.columnsToggle.textContent = "Mostrar todas as colunas";
    }
    installControls();
    installConfirmations();
    installStateEvents();
    updateAll();
    document.documentElement.dataset.p1Ux = "enabled";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
