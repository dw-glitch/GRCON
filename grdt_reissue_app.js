(function (root) {
  "use strict";

  const Core = root.GrconGrdtReissueCore;
  const History = root.GrconHistory;
  if (!Core || !History || !root.document) return;

  const state = { rows: [], missingDocuments: [], busy: false };
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
    ["grdt-reissue-find", "grdt-reissue-generate"].forEach((id) => { const button = $(`#${id}`); if (button) button.disabled = state.busy || (id.endsWith("generate") && !Core.validateRows(state.rows).valid); });
    const generate = $("#grdt-reissue-generate");
    if (generate) generate.textContent = state.busy ? "Gerando eGRDT…" : "Gerar nova eGRDT";
  }
  function fieldInput(row, index, field, width) {
    const missing = row.missing.includes(field);
    const list = OPTION_LISTS[field] ? ` list="${OPTION_LISTS[field]}"` : "";
    return `<input ${missing ? 'aria-invalid="true"' : ""}${list} data-field="${field}" data-row="${index}" style="min-width:${width || "8rem"}" value="${esc(row.item[field])}"/>`;
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
  function render() {
    const host = $("#grdt-reissue-results");
    const validation = Core.validateRows(state.rows);
    const sourceCount = new Set(state.rows.map((row) => row.sourceEgrdt)).size;
    const groupCount = validation.valid ? Core.groupRows(state.rows, 48).length : 0;
    $("#grdt-reissue-count-docs").textContent = String(new Set(state.rows.map((row) => Core.norm(row.item.document))).size);
    $("#grdt-reissue-count-rows").textContent = String(state.rows.length);
    $("#grdt-reissue-count-sources").textContent = String(sourceCount);
    $("#grdt-reissue-count-batches").textContent = String(groupCount);
    const alert = $("#grdt-reissue-alert");
    const notices = [];
    if (state.missingDocuments.length) notices.push(`Sem eGRDT anterior: ${state.missingDocuments.join("; ")}.`);
    if (validation.incomplete.length) notices.push(`${validation.incomplete.length} linha(s) antiga(s) precisam ter os campos destacados completados ou corrigidos antes da geração.`);
    alert.textContent = notices.join(" ");
    alert.hidden = !notices.length;
    if (!state.rows.length) {
      host.innerHTML = '<div class="history-empty"><strong>Nenhum documento consultado</strong><span>Cole os códigos acima para localizar a última eGRDT gerada pelo GRCON.</span></div>';
      setBusy(false);
      return;
    }
    host.innerHTML = `<table class="grdt-reissue-table"><thead><tr><th>Origem localizada</th><th>Documento</th><th>Revisão</th><th>Título</th><th>Arquivo</th><th>Formato</th><th>Disciplina</th><th>Tipo de documento</th><th>Propósito</th><th>Caminho Databook</th><th>Situação</th></tr></thead><tbody>${state.rows.map((row, index) => `<tr class="${row.errors.length ? "is-incomplete" : ""}">
      <td><span class="grdt-reissue-source"><strong>${esc(row.sourceEgrdt)}</strong><small>${esc(fmtDate(row.sourceGeneratedAt))}</small></span></td>
      <td><strong>${esc(row.item.document)}</strong></td>
      <td>${fieldInput(row, index, "revision")}</td>
      <td>${fieldInput(row, index, "title", "16rem")}</td>
      <td>${fieldInput(row, index, "fileName", "18rem")}</td>
      <td>${fieldInput(row, index, "format")}</td>
      <td>${fieldInput(row, index, "discipline")}</td>
      <td>${fieldInput(row, index, "documentType")}</td>
      <td>${fieldInput(row, index, "purpose", "12rem")}</td>
      <td>${fieldInput(row, index, "databook", "18rem")}</td>
      <td>${row.errors.length ? `<span class="grdt-reissue-missing" title="${esc(row.errors.join(" · "))}">Revisar ${row.errors.length}</span>` : '<span class="grdt-reissue-ready">Pronto</span>'}</td>
    </tr>`).join("")}</tbody></table>`;
    setBusy(false);
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
  function recordForGenerated(group, official, verification, generatedAt) {
    const sourceNumbers = [...new Set(group.rows.map((row) => row.sourceEgrdt).filter(Boolean))];
    const sourceRecords = History.read().filter((record) => group.rows.some((row) => row.sourceRecordId === record.id));
    const ldNames = [...new Set(sourceRecords.map((record) => record.ldName).filter(Boolean))];
    const files = group.rows.map((row, index) => {
      const previous = row.sourceFile || {};
      const reopened = verification?.rows?.[index] || row.item;
      return {
        ...previous,
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
      };
    });
    return History.cleanRecord({
      id: `${official.baseName}|${generatedAt}|Repostagem de eGRDT`,
      egrdtNumber: official.baseName,
      generatedAt,
      outputType: "Repostagem de eGRDT",
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
      const groups = Core.groupRows(state.rows, 48);
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
    render();
    root.GRCONMascot?.refresh?.();
  }
  function init() {
    ensureOptionLists();
    $("#grdt-reissue-find")?.addEventListener("click", findLatest);
    $("#grdt-reissue-generate")?.addEventListener("click", () => void generate());
    $("#grdt-reissue-results")?.addEventListener("change", (event) => {
      const input = event.target.closest("[data-row][data-field]");
      if (!input) return;
      const index = Number(input.dataset.row);
      if (!Number.isInteger(index) || !state.rows[index]) return;
      state.rows[index] = Core.updateRow(state.rows[index], input.dataset.field, input.value);
      render();
    });
    render();
  }

  root.GrconGrdtReissueUi = Object.freeze({ activate, state, findLatest, generate, confirmSharedHistory });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})(window);
