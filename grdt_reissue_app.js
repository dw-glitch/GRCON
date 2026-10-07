(function (root) {
  "use strict";

  const Core = root.GrconGrdtReissueCore;
  const History = root.GrconHistory;
  if (!Core || !History || !root.document) return;

  const BATCH_MODE_KEY = "grcon.egrdt.batch-mode.v1";
  const BATCH_LIMIT_KEY = "grcon.egrdt.batch-limit.v1";
  const DEFAULT_BATCH_LIMIT = 48;
  const FIELD_LABELS = Object.freeze({
    revision: "Revisão",
    title: "Título",
    fileName: "Arquivo",
    format: "Formato",
    discipline: "Disciplina",
    documentType: "Tipo de documento",
    purpose: "Propósito",
    databook: "Caminho Databook",
  });
  const OPTION_LISTS = Object.freeze({
    format: "grdt-reissue-formats",
    discipline: "grdt-reissue-disciplines",
    documentType: "grdt-reissue-document-types",
    purpose: "grdt-reissue-purposes",
  });
  const doc = root.document;
  const $ = (selector, scope) => (scope || doc).querySelector(selector);
  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmtDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR"); }
  function notify(message, kind) { if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info"); else if (kind === "error") root.alert(message); }
  function initialBatchMode() {
    const shared = root.GrconEgrdtBatchPlan?.getMode?.();
    if (shared) return Core.normalizeBatchMode(shared);
    try { return Core.normalizeBatchMode(root.localStorage?.getItem(BATCH_MODE_KEY)); }
    catch (_) { console.debug("[GRDT Reissue] batch mode storage unavailable:", _); return "discipline"; }
  }
  function normalizeBatchLimit(value) {
    const parsed = Math.trunc(Number(value));
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_BATCH_LIMIT;
  }
  function initialBatchLimit() {
    const shared = root.GrconEgrdtBatchPlan?.getLimit?.();
    if (shared) return normalizeBatchLimit(shared);
    try { return normalizeBatchLimit(root.localStorage?.getItem(BATCH_LIMIT_KEY)); }
    catch (_) { console.debug("[GRDT Reissue] batch limit storage unavailable:", _); return DEFAULT_BATCH_LIMIT; }
  }
  const state = { rows: [], missingDocuments: [], busy: false, batchMode: initialBatchMode(), batchLimit: initialBatchLimit() };

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = name;
    doc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function appVersion() { return root.GrconConfig?.APP_VERSION || doc.documentElement.dataset.version || "GRCON"; }
  function batchModeLabel(mode) { return Core.normalizeBatchMode(mode) === "limit-only" ? "Somente por limite" : "Separar por disciplina"; }
  function setBatchMode(value) {
    const mode = Core.normalizeBatchMode(value);
    state.batchMode = mode;
    try { root.localStorage?.setItem(BATCH_MODE_KEY, mode); } catch (_) { console.debug("[GRDT Reissue] batch mode local only:", _); }
    try { root.GrconEgrdtBatchPlan?.setMode?.(mode); } catch (_) { console.debug("[GRDT Reissue] shared batch mode unavailable:", _); }
    renderSummary();
    return mode;
  }
  function setBatchLimit(value, options) {
    const parsed = Math.trunc(Number(value));
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      if (!options?.silent) notify("Informe uma quantidade inteira maior ou igual a 1.", "error");
      const input = $("#grdt-reissue-batch-limit");
      if (input) input.value = String(state.batchLimit);
      return false;
    }
    state.batchLimit = parsed;
    try { root.localStorage?.setItem(BATCH_LIMIT_KEY, String(parsed)); } catch (_) { console.debug("[GRDT Reissue] batch limit local only:", _); }
    try { root.GrconEgrdtBatchPlan?.setLimit?.(parsed); } catch (_) { console.debug("[GRDT Reissue] shared batch limit unavailable:", _); }
    renderSummary();
    if (!options?.silent) notify(`${batchModeLabel(state.batchMode)}: eGRDTs de até ${parsed} documento${parsed === 1 ? "" : "s"}.`, "success");
    return parsed;
  }
  function setBusy(busy) {
    state.busy = Boolean(busy);
    ["grdt-reissue-find", "grdt-reissue-generate"].forEach((id) => {
      const button = $("#" + id);
      if (button) button.disabled = state.busy || (id.endsWith("generate") && !Core.validateRows(state.rows).valid);
    });
    const generate = $("#grdt-reissue-generate");
    if (generate) generate.textContent = state.busy ? "Gerando eGRDT…" : "Gerar nova eGRDT";
  }
  function fieldErrorMessages(row, field) {
    return row && row.fieldErrors && Array.isArray(row.fieldErrors[field]) ? row.fieldErrors[field] : [];
  }
  function fieldInput(row, index, field, width) {
    const errors = fieldErrorMessages(row, field);
    const errorId = `grdt-reissue-error-${index}-${field}`;
    const list = OPTION_LISTS[field] ? ` list="${OPTION_LISTS[field]}"` : "";
    const invalid = errors.length ? ' aria-invalid="true"' : ' aria-invalid="false"';
    const describedBy = errors.length ? ` aria-describedby="${errorId}"` : "";
    const documentLabel = text(row?.item?.document) || `linha ${index + 1}`;
    return `<div class="grdt-reissue-field" data-field-wrap="${field}">
      <input${invalid}${describedBy}${list} aria-label="${esc(FIELD_LABELS[field] || field)} — ${esc(documentLabel)}" data-field="${field}" data-row="${index}" style="min-width:${width || "8rem"}" value="${esc(row.item[field])}"/>
      <small id="${errorId}" class="grdt-reissue-field-error"${errors.length ? "" : " hidden"}>${esc(errors.join(" · "))}</small>
    </div>`;
  }
  function ensureOptionLists() {
    const options = root.TriagemCore?.EGRDT_OPTIONS || {};
    const values = {
      format: options.formats || [],
      discipline: options.disciplines || [],
      documentType: options.documentTypes || [],
      purpose: options.purposes || [],
    };
    Object.entries(OPTION_LISTS).forEach(([field, id]) => {
      if (doc.getElementById(id)) return;
      const list = doc.createElement("datalist");
      list.id = id;
      list.innerHTML = values[field].map((value) => `<option value="${esc(value)}"></option>`).join("");
      doc.body.appendChild(list);
    });
  }
  function safeGroups() {
    const validation = Core.validateRows(state.rows);
    if (!validation.valid) return [];
    try { return Core.groupRows(state.rows, state.batchLimit, state.batchMode); }
    catch (error) { console.warn("GRCON: não foi possível calcular os lotes da repostagem", error); return []; }
  }
  function renderSummary() {
    const validation = Core.validateRows(state.rows);
    const groups = validation.valid ? safeGroups() : [];
    const sourceCount = new Set(state.rows.map((row) => row.sourceEgrdt).filter(Boolean)).size;
    const mode = Core.normalizeBatchMode(state.batchMode);
    const modeSelect = $("#grdt-reissue-batch-mode");
    if (modeSelect && doc.activeElement !== modeSelect) modeSelect.value = mode;
    const limitInput = $("#grdt-reissue-batch-limit");
    if (limitInput && doc.activeElement !== limitInput) limitInput.value = String(state.batchLimit);
    const modeStatus = $("#grdt-reissue-batch-mode-status");
    if (modeStatus) {
      modeStatus.textContent = mode === "limit-only"
        ? `A ordem atual será preservada; as novas eGRDTs serão divididas somente em blocos de até ${state.batchLimit} documento${state.batchLimit === 1 ? "" : "s"}, mesmo com disciplinas diferentes.`
        : `Cada disciplina terá sua própria eGRDT, usando lotes de até ${state.batchLimit} documento${state.batchLimit === 1 ? "" : "s"}.`;
    }
    const docs = $("#grdt-reissue-count-docs");
    const rows = $("#grdt-reissue-count-rows");
    const sources = $("#grdt-reissue-count-sources");
    const batches = $("#grdt-reissue-count-batches");
    if (docs) docs.textContent = String(new Set(state.rows.map((row) => Core.norm(row.item.document))).size);
    if (rows) rows.textContent = String(state.rows.length);
    if (sources) sources.textContent = String(sourceCount);
    if (batches) batches.textContent = String(groups.length);
    const alert = $("#grdt-reissue-alert");
    if (alert) {
      const notices = [];
      if (state.missingDocuments.length) notices.push(`Sem eGRDT anterior: ${state.missingDocuments.join("; ")}.`);
      const normativeWarnings = state.rows.filter(row => root.GrconDocumentaryCompliance?.auditRow(row, row.item).warnings.length).length;
      if (normativeWarnings) notices.push(`${normativeWarnings} documento(s) têm alertas de conformidade; confira os detalhes na coluna Situação.`);
      if (validation.incomplete.length) notices.push(`${validation.incomplete.length} linha(s) precisam ter os campos destacados completados ou corrigidos antes da geração.`);
      alert.textContent = notices.join(" ");
      alert.hidden = !notices.length;
    }
    setBusy(state.busy);
  }
  function sigemStatus(row) {
    const sourceRevision = root.TriagemCore?.normalizeRevision(row.sourceFile?.grdtRevision || row.sourceFile?.revision);
    const targetRevision = root.TriagemCore?.normalizeRevision(row.item.revision);
    const legacy = sourceRevision === targetRevision ? row.sourceFile?.sigemStatus || "—" : "—";
    return root.GrconSharedSigemQuery?.resolveSigemStatus(row.item.document, row.item.revision, legacy) || { status: legacy, source: "legacy-fallback" };
  }
  function rowStatusHtml(row) {
    const operational = row.errors.length
      ? `<span class="grdt-reissue-missing" title="${esc(row.errors.join(" · "))}">Revisar ${row.errors.length}</span>`
      : '<span class="grdt-reissue-ready">Pronto</span>';
    const audit = root.GrconDocumentaryCompliance?.auditRow(row, row.item);
    const findings = [...(audit?.warnings || []), ...(audit?.information || [])];
    if (!findings.length) return operational;
    return `${operational}<details class="grdt-reissue-compliance"><summary>Conformidade: ${audit.warnings.length} alerta(s) · ${audit.information.length} informação(ões)</summary><ul>${findings.map(finding => `<li>${esc(finding.message)}<small>${esc(finding.ruleId)} · ${esc(finding.norm)} · ${esc(finding.source?.label)} Rev. ${esc(finding.revision)} § ${esc(finding.section)}</small></li>`).join('')}</ul></details>`;
  }
  function render() {
    const host = $("#grdt-reissue-results");
    renderSummary();
    if (!host) return;
    if (!state.rows.length) {
      host.innerHTML = '<div class="history-empty"><strong>Nenhum documento consultado</strong><span>Cole os códigos acima para localizar a última eGRDT gerada pelo GRCON.</span></div>';
      setBusy(false);
      return;
    }
    host.innerHTML = `<table class="grdt-reissue-table"><thead><tr><th>Origem localizada</th><th>Documento</th><th>Revisão</th><th>Título</th><th>Arquivo</th><th>Formato</th><th>Disciplina</th><th>Tipo de documento</th><th>Propósito</th><th>Caminho Databook</th><th>Situação</th></tr></thead><tbody>${state.rows.map((row, index) => `<tr data-reissue-row="${index}" class="${row.errors.length ? "is-incomplete" : ""}">
      <td data-label="Origem localizada"><span class="grdt-reissue-source"><strong>${esc(row.sourceEgrdt)}</strong><small>${esc(fmtDate(row.sourceGeneratedAt))}</small></span></td>
      <td data-label="Documento"><strong>${esc(row.item.document)}</strong></td>
      <td data-label="Revisão">${fieldInput(row, index, "revision")}</td>
      <td data-label="Título">${fieldInput(row, index, "title", "16rem")}</td>
      <td data-label="Arquivo">${fieldInput(row, index, "fileName", "18rem")}</td>
      <td data-label="Formato">${fieldInput(row, index, "format")}</td>
      <td data-label="Disciplina">${fieldInput(row, index, "discipline")}</td>
      <td data-label="Tipo de documento">${fieldInput(row, index, "documentType")}</td>
      <td data-label="Propósito">${fieldInput(row, index, "purpose", "12rem")}</td>
      <td data-label="Caminho Databook">${fieldInput(row, index, "databook", "18rem")}</td>
      <td data-label="Situação" data-row-status>${rowStatusHtml(row)}<small title="${esc(root.GrconSharedSigemQuery?.sourceLabel(sigemStatus(row).source) || "LD / Colar SIGEM")}">Status SIGEM: ${esc(sigemStatus(row).status)}</small></td>
    </tr>`).join("")}</tbody></table>`;
    setBusy(false);
  }
  function syncFieldDom(rowElement, row, index, field) {
    const input = rowElement?.querySelector(`[data-row="${index}"][data-field="${field}"]`);
    if (!input) return;
    if (input.value !== text(row.item[field])) input.value = text(row.item[field]);
    const errors = fieldErrorMessages(row, field);
    const error = rowElement.querySelector(`#grdt-reissue-error-${index}-${field}`);
    input.setAttribute("aria-invalid", errors.length ? "true" : "false");
    if (errors.length) {
      input.setAttribute("aria-describedby", `grdt-reissue-error-${index}-${field}`);
      if (error) { error.textContent = errors.join(" · "); error.hidden = false; }
    } else {
      input.removeAttribute("aria-describedby");
      if (error) { error.textContent = ""; error.hidden = true; }
    }
  }
  function updateEditedRow(input) {
    const index = Number(input?.dataset?.row);
    const field = input?.dataset?.field;
    if (!Number.isInteger(index) || !state.rows[index] || !FIELD_LABELS[field]) return;
    const rowElement = input.closest("[data-reissue-row]");
    const next = Core.updateRow(state.rows[index], field, input.value);
    state.rows[index] = next;
    Object.keys(FIELD_LABELS).forEach((name) => syncFieldDom(rowElement, next, index, name));
    if (rowElement) {
      rowElement.classList.toggle("is-incomplete", next.errors.length > 0);
      const status = rowElement.querySelector("[data-row-status]");
      if (status) status.innerHTML = `${rowStatusHtml(next)}<small title="${esc(root.GrconSharedSigemQuery?.sourceLabel(sigemStatus(next).source) || "LD / Colar SIGEM")}">Status SIGEM: ${esc(sigemStatus(next).status)}</small>`;
    }
    renderSummary();
  }
  function findLatest() {
    const documents = Core.parseDocuments($("#grdt-reissue-documents")?.value || "");
    if (!documents.length) {
      notify("Informe ao menos um código de documento.", "warning");
      return;
    }
    const result = Core.rowsForDocuments(documents, History.read());
    state.rows = result.rows;
    state.missingDocuments = result.missingDocuments;
    render();
    if (!state.rows.length) notify("Nenhum dos documentos foi localizado no Histórico de eGRDTs.", "warning");
    else notify(`${state.rows.length} linha(s) recuperada(s) da última eGRDT de cada documento.`, "success");
  }
  async function reserveNumbers(count) {
    const sequence = root.GrconEgrdtSequence;
    const preview = sequence?.previewMany?.(count) || [];
    const year = Number(preview[0]?.year) || new Date().getFullYear();
    if (root.GrconCloud?.state?.membership && typeof root.GrconCloud.reserveEgrdtSequences === "function") {
      return root.GrconCloud.reserveEgrdtSequences(year, count, null);
    }
    if (preview.length !== count) throw new Error("A numeração automática das eGRDTs não está disponível.");
    return preview;
  }
  function recordForGenerated(group, official, verification, generatedAt, historySnapshot) {
    const sourceNumbers = [...new Set(group.rows.map((row) => row.sourceEgrdt).filter(Boolean))];
    const sourceIds = new Set(group.rows.map((row) => row.sourceRecordId));
    const sourceRecords = (historySnapshot || []).filter((record) => sourceIds.has(record.id));
    const ldNames = [...new Set(sourceRecords.map((record) => record.ldName).filter(Boolean))];
    const files = group.rows.map((row, index) => {
      const previous = row.sourceFile || {};
      const reopened = verification?.rows?.[index] || row.item;
      return {
        ...previous,
        sigemStatus: sigemStatus(row).status,
        sigemStatusSource: sigemStatus(row).source,
        sigemStatusSnapshotId: sigemStatus(row).snapshotId || "",
        document: row.item.document,
        title: row.item.title,
        originalName: previous.originalName || previous.finalName || row.item.fileName,
        finalName: row.item.fileName,
        revision: reopened.revision || row.item.revision,
        grdtRevision: reopened.revision || row.item.revision,
        revisionSource: "Arquivo eGRDT de repostagem reaberto e verificado",
        revisionSuggested: row.item.revision,
        revisionManual: false,
        format: row.item.format,
        discipline: row.item.discipline,
        documentType: row.item.documentType,
        purpose: row.item.purpose,
        databook: row.item.databook,
        virtual: true,
        normativeValidation: group.entries[index]?.normativeValidation || null,
      };
    });
    return History.cleanRecord({
      id: `${official.baseName}|${generatedAt}|Repostagem de eGRDT`,
      egrdtNumber: official.baseName,
      generatedAt,
      outputType: "Repostagem de eGRDT",
      batchMode: Core.normalizeBatchMode(state.batchMode),
      batchLimit: state.batchLimit,
      ldName: ldNames.join(" · ") || "Histórico GRCON",
      sourceName: `Última eGRDT por documento: ${sourceNumbers.join(" · ")}`,
      reissueSources: sourceNumbers,
      reservationRequestId: text(official.requestId),
      reservationIds: [text(official.reservationId)].filter(Boolean),
      normativeValidation: root.GrconDocumentaryCompliance?.combine(files.map(file => file.normativeValidation)) || null,
      files,
    });
  }
  async function confirmSharedHistory(records) {
    if (!root.GrconCloud?.state?.membership) return { shared: false, synced: true, error: "" };
    if (!root.GrconCloud.state.online) return { shared: true, synced: false, error: "O GRCON está offline; a sincronização ficará pendente." };
    if (typeof root.GrconCloud.pull !== "function") return { shared: true, synced: false, error: "A confirmação do histórico compartilhado não está disponível." };
    try {
      await root.GrconCloud.pull();
      const synced = Core.sharedPersistenceStatus(records, History.read()).synced;
      return { shared: true, synced, error: synced ? "" : "O banco ainda não confirmou todos os registros gerados." };
    } catch (error) {
      return { shared: true, synced: false, error: error?.message || "Falha ao confirmar o histórico compartilhado." };
    }
  }
  async function generate() {
    await root.GrconSharedSigemQuery?.refresh();
    const validation = Core.validateRows(state.rows);
    if (!validation.valid) {
      notify("Complete todos os campos destacados antes de gerar a repostagem.", "warning");
      return;
    }
    setBusy(true);
    const operation = root.GrconMascot?.begin?.({ state: "analyzing", message: "Gerando repostagem de eGRDT…", source: "grdt-reissue" });
    try {
      const groups = Core.groupRows(state.rows, state.batchLimit, state.batchMode);
      const officialNumbers = await reserveNumbers(groups.length);
      const generatedAt = new Date().toISOString();
      const generated = [];
      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        const official = officialNumbers[index];
        const data = await root.GrdtWorkbook.build(group.items, root.TriagemCore?.EGRDT_OPTIONS);
        const verification = await root.GrdtWorkbook.verify(data, group.items);
        generated.push({ group, official, data, verification, fileName: `${official.baseName}.xls` });
      }
      if (generated.length === 1) {
        download(new Blob([generated[0].data], { type: root.GrdtWorkbook.MIME || "application/vnd.ms-excel" }), generated[0].fileName);
      } else {
        const zip = new root.JSZip();
        generated.forEach((entry) => zip.folder(entry.official.baseName).file(entry.fileName, entry.data));
        download(await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 4 } }), `GRCON_Repostagem_eGRDT_${generatedAt.replace(/\D/g, "").slice(0, 14)}.zip`);
      }
      const historySnapshot = History.read();
      const records = generated.map((entry) => recordForGenerated(entry.group, entry.official, entry.verification, generatedAt, historySnapshot));
      const saved = History.saveMany(records);
      if (!saved.saved) throw new Error(saved.error || "A eGRDT foi criada, mas não pôde ser registrada no Histórico.");
      if (saved.persistence && typeof saved.persistence.then === "function") {
        try {
          await saved.persistence;
        } catch (error) {
          throw new Error(error?.message || "A eGRDT foi criada, mas a persistência durável do Histórico falhou.");
        }
      }
      if (root.GrconSigemPosting?.registerGenerated) {
        root.GrconSigemPosting.registerGenerated(records, { packageName: generated.length === 1 ? generated[0].fileName : "GRCON_Repostagem_eGRDT.zip", appVersion: appVersion() });
      }
      officialNumbers.forEach((official) => root.GrconEgrdtSequence?.syncFromNumber?.(official.baseName));
      if (root.GrconCloud?.completeEgrdtReservationRequest) root.GrconCloud.completeEgrdtReservationRequest(generated);
      root.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { records, outputType: "Repostagem de eGRDT" } }));
      root.dispatchEvent(new CustomEvent("grcon:egrdt-generated", { detail: { records, outputType: "Repostagem de eGRDT", historySaved: true } }));
      const cloud = await confirmSharedHistory(records);
      if (cloud.shared && cloud.synced) {
        operation?.success?.({ message: `${generated.length} eGRDT(s) de repostagem gerada(s) e sincronizada(s).` });
        notify(`${generated.length} eGRDT(s) de repostagem gerada(s), verificadas no banco e exibidas no Histórico compartilhado.`, "success");
      } else if (cloud.shared) {
        operation?.warning?.({ message: "Repostagem gerada; sincronização com o banco ainda pendente." });
        notify(`${generated.length} eGRDT(s) gerada(s) e salva(s) localmente. Sincronização com o banco pendente: ${cloud.error}`, "warning");
      } else {
        operation?.success?.({ message: `${generated.length} eGRDT(s) de repostagem registrada(s) no Histórico local.` });
        notify(`${generated.length} eGRDT(s) de repostagem gerada(s), persistida(s) e registrada(s) no Histórico local.`, "success");
      }
    } catch (error) {
      console.error(error);
      operation?.warning?.({ message: error?.message || "Falha ao gerar a repostagem." });
      notify(error?.message || "Não foi possível gerar a repostagem de eGRDT.", "error");
    } finally {
      setBusy(false);
    }
  }
  function activate() {
    void root.GrconSharedSigemQuery?.refresh();
    state.batchMode = initialBatchMode();
    state.batchLimit = initialBatchLimit();
    renderSummary();
    root.GRCONMascot?.refresh?.();
  }
  root.addEventListener("grcon:shared-sigem-updated", () => { if (!state.busy) render(); });
  function init() {
    ensureOptionLists();
    const modeSelect = $("#grdt-reissue-batch-mode");
    if (modeSelect) {
      modeSelect.value = state.batchMode;
      modeSelect.addEventListener("change", () => setBatchMode(modeSelect.value));
    }
    const limitInput = $("#grdt-reissue-batch-limit");
    if (limitInput) {
      limitInput.value = String(state.batchLimit);
      limitInput.addEventListener("change", () => setBatchLimit(limitInput.value));
      limitInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); setBatchLimit(limitInput.value); }
      });
    }
    $("#grdt-reissue-find")?.addEventListener("click", findLatest);
    $("#grdt-reissue-generate")?.addEventListener("click", () => void generate());
    const reissueResults = $("#grdt-reissue-results");
    reissueResults?.addEventListener("input", (event) => {
      const input = event.target.closest('[data-row][data-field="revision"]');
      if (input) updateEditedRow(input);
    });
    reissueResults?.addEventListener("change", (event) => {
      const input = event.target.closest("[data-row][data-field]");
      if (input && input.dataset.field !== "revision") updateEditedRow(input);
    });
    render();
  }

  root.GrconGrdtReissueUi = Object.freeze({
    activate, state, findLatest, generate, confirmSharedHistory, setBatchMode, setBatchLimit, updateEditedRow,
  });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})(window);
