(function (root) {
  "use strict";

  const Core = root.GrconGrdtReissueCore;
  const History = root.GrconHistory;
  if (!Core || !History || !root.document) return;

  const BATCH_MODE_KEY = "grcon.egrdt.batch-mode.v1";
  const state = {
    rows: [],
    missingDocuments: [],
    busy: false,
    batchMode: "discipline",
    historyById: new Map(),
  };
  const OPTION_LISTS = Object.freeze({
    format: "grdt-reissue-formats",
    discipline: "grdt-reissue-disciplines",
    documentType: "grdt-reissue-document-types",
    purpose: "grdt-reissue-purposes",
  });
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
  const doc = root.document;
  const $ = (selector, scope) => (scope || doc).querySelector(selector);
  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function fmtDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR"); }
  function notify(message, kind) { if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info"); else if (kind === "error") root.alert(message); }
  function normalizeBatchMode(value) {
    return root.GrconEmission?.normalizeBatchMode?.(value) || (value === "limit-only" ? "limit-only" : "discipline");
  }
  function readBatchMode() {
    const shared = root.GrconEgrdtBatchPlan?.getMode?.();
    if (shared) return normalizeBatchMode(shared);
    try { return normalizeBatchMode(root.localStorage?.getItem(BATCH_MODE_KEY)); }
    catch (_) { return "discipline"; }
  }
  function currentBatchMode() { return normalizeBatchMode(state.batchMode); }
  function batchModeHelp(mode) {
    return normalizeBatchMode(mode) === "limit-only"
      ? "Mantém a ordem informada e cria uma nova eGRDT somente ao atingir 48 documentos; disciplinas diferentes podem ficar juntas."
      : "Cria eGRDTs separadas por disciplina, sempre respeitando o máximo de 48 documentos por eGRDT.";
  }
  function applyBatchMode(value) {
    const mode = normalizeBatchMode(value);
    state.batchMode = mode;
    if (root.GrconEgrdtBatchPlan?.setMode) root.GrconEgrdtBatchPlan.setMode(mode);
    else {
      try { root.localStorage?.setItem(BATCH_MODE_KEY, mode); } catch (_) { /* preferência disponível somente nesta sessão */ }
    }
    const select = $("#grdt-reissue-batch-mode");
    if (select && select.value !== mode) select.value = mode;
    const help = $("#grdt-reissue-batch-mode-help");
    if (help) help.textContent = batchModeHelp(mode);
    renderSummary();
    return mode;
  }
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
  function setBusy(busy) {
    state.busy = Boolean(busy);
    ["grdt-reissue-find", "grdt-reissue-generate"].forEach((id) => {
      const button = `#${id}` && $(`#${id}`);
      if (button) button.disabled = state.busy || (id.endsWith("generate") && !Core.validateRows(state.rows).valid);
    });
    const mode = $("#grdt-reissue-batch-mode");
    if (mode) mode.disabled = state.busy;
    const generate = $("#grdt-reissue-generate");
    if (generate) generate.textContent = state.busy ? "Gerando eGRDT…" : "Gerar nova eGRDT";
  }
  function fieldMessages(row, field) {
    return Array.isArray(row?.fieldErrors?.[field]) ? row.fieldErrors[field] : [];
  }
  function fieldInput(row, index, field) {
    const messages = fieldMessages(row, field);
    const invalid = messages.length > 0;
    const list = OPTION_LISTS[field] ? ` list="${OPTION_LISTS[field]}"` : "";
    const errorId = `grdt-reissue-error-${index}-${field}`;
    const label = FIELD_LABELS[field] || field;
    return `<span class="grdt-reissue-field"><input aria-label="${esc(label)} de ${esc(row.item.document)}" aria-invalid="${invalid ? "true" : "false"}" aria-describedby="${errorId}"${list} data-field="${field}" data-row="${index}" value="${esc(row.item[field])}"/><small class="grdt-reissue-field-error" id="${errorId}"${invalid ? "" : " hidden"}>${esc(messages.join(" · "))}</small></span>`;
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
  function statusMarkup(row) {
    return row.errors.length
      ? `<span class="grdt-reissue-missing" title="${esc(row.errors.join(" · "))}">Revisar ${row.errors.length}</span>`
      : '<span class="grdt-reissue-ready">Pronto</span>';
  }
  function rowMarkup(row, index) {
    return `<tr data-reissue-row="${index}" class="${row.errors.length ? "is-incomplete" : ""}">
      <td data-label="Origem localizada"><span class="grdt-reissue-source"><strong>${esc(row.sourceEgrdt)}</strong><small>${esc(fmtDate(row.sourceGeneratedAt))}</small></span></td>
      <td data-label="Documento"><strong>${esc(row.item.document)}</strong></td>
      <td data-label="Revisão">${fieldInput(row, index, "revision")}</td>
      <td data-label="Título">${fieldInput(row, index, "title")}</td>
      <td data-label="Arquivo">${fieldInput(row, index, "fileName")}</td>
      <td data-label="Formato">${fieldInput(row, index, "format")}</td>
      <td data-label="Disciplina">${fieldInput(row, index, "discipline")}</td>
      <td data-label="Tipo de documento">${fieldInput(row, index, "documentType")}</td>
      <td data-label="Propósito">${fieldInput(row, index, "purpose")}</td>
      <td data-label="Caminho Databook">${fieldInput(row, index, "databook")}</td>
      <td data-label="Situação" data-reissue-status>${statusMarkup(row)}</td>
    </tr>`;
  }
  function renderSummary() {
    const validation = Core.validateRows(state.rows);
    const sourceCount = new Set(state.rows.map((row) => row.sourceEgrdt)).size;
    const groupCount = validation.valid ? Core.groupRows(state.rows, 48, currentBatchMode()).length : 0;
    const docs = $("#grdt-reissue-count-docs");
    const rows = $("#grdt-reissue-count-rows");
    const sources = $("#grdt-reissue-count-sources");
    const batches = $("#grdt-reissue-count-batches");
    if (docs) docs.textContent = String(new Set(state.rows.map((row) => Core.norm(row.item.document))).size);
    if (rows) rows.textContent = String(state.rows.length);
    if (sources) sources.textContent = String(sourceCount);
    if (batches) batches.textContent = String(groupCount);
    const alert = $("#grdt-reissue-alert");
    const notices = [];
    if (state.missingDocuments.length) notices.push(`Sem eGRDT anterior: ${state.missingDocuments.join("; ")}.`);
    if (validation.incomplete.length) notices.push(`${validation.incomplete.length} linha(s) precisam ter os campos destacados completados ou corrigidos antes da geração.`);
    if (alert) {
      alert.textContent = notices.join(" ");
      alert.hidden = !notices.length;
    }
    setBusy(state.busy);
  }
  function renderTable() {
    const host = $("#grdt-reissue-results");
    if (!host) return;
    if (!state.rows.length) {
      host.innerHTML = '<div class="history-empty"><strong>Nenhum documento consultado</strong><span>Cole os códigos acima para localizar a última eGRDT gerada pelo GRCON.</span></div>';
      return;
    }
    host.innerHTML = `<table class="grdt-reissue-table" aria-label="Dados recuperados para repostagem"><thead><tr><th>Origem localizada</th><th>Documento</th><th>Revisão</th><th>Título</th><th>Arquivo</th><th>Formato</th><th>Disciplina</th><th>Tipo de documento</th><th>Propósito</th><th>Caminho Databook</th><th>Situação</th></tr></thead><tbody>${state.rows.map(rowMarkup).join("")}</tbody></table>`;
  }
  function render() {
    const select = $("#grdt-reissue-batch-mode");
    state.batchMode = readBatchMode();
    if (select) select.value = currentBatchMode();
    const help = $("#grdt-reissue-batch-mode-help");
    if (help) help.textContent = batchModeHelp(currentBatchMode());
    renderSummary();
    renderTable();
    setBusy(false);
  }
  function updateRowView(index) {
    const row = state.rows[index];
    const rowElement = $([`[data-reissue-row="${index}"]`].join(""));
    if (!row || !rowElement) {
      render();
      return;
    }
    rowElement.classList.toggle("is-incomplete", row.errors.length > 0);
    Object.keys(FIELD_LABELS).forEach((field) => {
      const input = $([`[data-row="${index}"][data-field="${field}"]`].join(""), rowElement);
      if (!input) return;
      if (input.value !== text(row.item[field])) input.value = text(row.item[field]);
      const messages = fieldMessages(row, field);
      input.setAttribute("aria-invalid", messages.length ? "true" : "false");
      const error = $("#" + `grdt-reissue-error-${index}-${field}`, rowElement);
      if (error) {
        error.textContent = messages.join(" · ");
        error.hidden = !messages.length;
      }
    });
    const status = $("[data-reissue-status]", rowElement);
    if (status) status.innerHTML = statusMarkup(row);
    renderSummary();
  }
  function findLatest() {
    const documents = Core.parseDocuments($("#grdt-reissue-documents")?.value || "");
    if (!documents.length) {
      notify("Informe ao menos um código de documento.", "warning");
      return;
    }
    const history = History.read();
    state.historyById = new Map(history.map((record) => [record.id, record]));
    const result = Core.rowsForDocuments(documents, history);
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
  function recordForGenerated(group, official, verification, generatedAt) {
    const sourceNumbers = [...new Set(group.rows.map((row) => row.sourceEgrdt).filter(Boolean))];
    const sourceRecords = group.rows.map((row) => state.historyById.get(row.sourceRecordId)).filter(Boolean);
    const ldNames = [...new Set(sourceRecords.map((record) => record.ldName).filter(Boolean))];
    const files = group.rows.map((row, index) => {
      const previous = row.sourceFile || {};
      const reopened = verification?.rows?.[index] || row.item;
      const sentRevision = reopened.revision || row.item.revision;
      const suggestedRevision = previous.grdtRevision || previous.revision || row.item.revision;
      return {
        ...previous,
        document: row.item.document,
        title: row.item.title,
        originalName: previous.originalName || previous.finalName || row.item.fileName,
        finalName: row.item.fileName,
        revision: sentRevision,
        grdtRevision: sentRevision,
        revisionSource: "Arquivo eGRDT de repostagem reaberto e verificado",
        revisionSuggested: suggestedRevision,
        revisionManual: Core.norm(sentRevision) !== Core.norm(suggestedRevision),
        format: row.item.format,
        discipline: row.item.discipline,
        documentType: row.item.documentType,
        purpose: row.item.purpose,
        databook: row.item.databook,
        virtual: true,
      };
    });
    return History.cleanRecord({
      id: `${official.baseName}|${generatedAt}|Repostagem de eGRDT`,
      egrdtNumber: official.baseName,
      generatedAt,
      outputType: "Repostagem de eGRDT",
      batchMode: currentBatchMode(),
      ldName: ldNames.join(" · ") || "Histórico GRCON",
      sourceName: `Última eGRDT por documento: ${sourceNumbers.join(" · ")}`,
      reissueSources: sourceNumbers,
      reservationRequestId: text(official.requestId),
      reservationIds: [text(official.reservationId)].filter(Boolean),
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
    const validation = Core.validateRows(state.rows);
    if (!validation.valid) {
      notify("Complete todos os campos destacados antes de gerar a repostagem.", "warning");
      return;
    }
    setBusy(true);
    const operation = root.GrconMascot?.begin?.({ state: "analyzing", message: "Gerando repostagem de eGRDT…", source: "grdt-reissue" });
    try {
      const groups = Core.groupRows(state.rows, 48, currentBatchMode());
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
      const records = generated.map((entry) => recordForGenerated(entry.group, entry.official, entry.verification, generatedAt));
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
      root.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { records, outputType: "Repostagem de eGRDT", batchMode: currentBatchMode() } }));
      root.dispatchEvent(new CustomEvent("grcon:egrdt-generated", { detail: { records, outputType: "Repostagem de eGRDT", batchMode: currentBatchMode(), historySaved: true } }));
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
    state.batchMode = readBatchMode();
    render();
    root.GRCONMascot?.refresh?.();
  }
  function init() {
    ensureOptionLists();
    state.batchMode = readBatchMode();
    $("#grdt-reissue-find")?.addEventListener("click", findLatest);
    $("#grdt-reissue-generate")?.addEventListener("click", () => void generate());
    $("#grdt-reissue-batch-mode")?.addEventListener("change", (event) => {
      applyBatchMode(event.target.value);
      notify(batchModeHelp(state.batchMode), "success");
    });
    $("#grdt-reissue-results")?.addEventListener("change", (event) => {
      const input = event.target.closest("[data-row][data-field]");
      if (!input) return;
      const index = Number(input.dataset.row);
      if (!Number.isInteger(index) || !state.rows[index]) return;
      state.rows[index] = Core.updateRow(state.rows[index], input.dataset.field, input.value);
      updateRowView(index);
    });
    render();
  }

  root.GrconGrdtReissueUi = Object.freeze({
    activate, state, findLatest, generate, confirmSharedHistory, applyBatchMode, currentBatchMode, updateRowView,
  });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})(window);
