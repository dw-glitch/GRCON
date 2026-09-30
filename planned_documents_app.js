(function (root) {
  "use strict";
  const Core = root.GrconPlannedDocumentsCore;
  const $ = (selector) => root.document.querySelector(selector);
  const state = { busy: false, error: "" };

  function render() {
    const cloud = root.GrconCloud;
    const snapshot = cloud?.state?.plannedSnapshot;
    const owner = cloud?.state?.membership?.role === "owner";
    const input = $("#planned-documents-file");
    const button = $("#planned-documents-publish");
    const note = $("#planned-documents-owner-note");
    if (input) input.parentElement.hidden = !owner;
    if (button) { button.hidden = !owner; button.disabled = state.busy; }
    if (note) note.hidden = owner;
    const status = $("#planned-documents-status");
    if (!status || state.busy) return;
    status.textContent = state.error || (snapshot
      ? `${snapshot.count.toLocaleString("pt-BR")} documentos · ${snapshot.fileName} · atualizado em ${new Date(snapshot.updatedAt).toLocaleString("pt-BR")}. Fonte compartilhada em uso.`
      : "Nenhuma base compartilhada publicada. A alocação fica indisponível até existir uma versão de Documentos Previstos.");
  }

  async function publish() {
    const input = $("#planned-documents-file");
    const file = input?.files?.[0];
    if (!file || state.busy) return;
    if (!/\.(?:xlsx|xls)$/i.test(file.name)) {
      root.GrconNotify?.("Selecione uma planilha Excel (.xlsx ou .xls).", "error");
      return;
    }
    state.busy = true;
    state.error = "";
    render();
    const status = $("#planned-documents-status");
    try {
      status.textContent = "Lendo a coluna DOCUMENTO…";
      await root.GRCONModuleLoader?.ensure?.("xlsx");
      const workbook = root.XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });
      const parsed = Core.parseWorkbook(workbook);
      status.textContent = `Enviando ${parsed.count.toLocaleString("pt-BR")} códigos únicos. A base atual permanece ativa até concluir.`;
      await root.GrconCloud.publishPlannedDocuments(parsed, file.name);
      input.value = "";
      root.GrconNotify?.(`Documentos Previstos atualizados para todos: ${parsed.count.toLocaleString("pt-BR")} códigos. Consultas abertas passam a usar esta versão automaticamente.`, "success");
      root.dispatchEvent(new CustomEvent("grcon:planned-documents-published"));
    } catch (error) {
      if (error?.published) {
        input.value = "";
        state.error = `${error.message} Atualize a página para consultar a versão publicada.`;
        root.GrconNotify?.("A base foi publicada no banco. Atualize a página para carregar os documentos.", "warning");
      } else {
        state.error = `Atualização não concluída: ${error?.message || error}. A base anterior permanece em uso.`;
        root.GrconNotify?.("Não foi possível publicar Documentos Previstos; a base anterior foi mantida.", "error");
      }
      return;
    } finally {
      state.busy = false;
      render();
    }
  }

  root.GrconPlannedDocuments = Object.freeze({
    current: () => root.GrconCloud?.state?.plannedSnapshot || null,
    refresh: () => root.GrconCloud.loadPlannedDocuments(),
    classify: (documentCode) => Core.classifyDocument(documentCode, root.GrconCloud?.state?.plannedSnapshot),
    isAllocated: (documentCode) => {
      const result = Core.classifyDocument(documentCode, root.GrconCloud?.state?.plannedSnapshot);
      return result.available ? result.allocated : null;
    },
    applyRecords: (records) => Core.applyToRecords(records, root.GrconCloud?.state?.plannedSnapshot),
    applyConsultationRow: (row, documentCode) => Core.applyToConsultationRow(row, documentCode, root.GrconCloud?.state?.plannedSnapshot),
  });
  root.addEventListener("grcon:cloud-ready", render);
  root.addEventListener("grcon:planned-documents-updated", () => { state.error = ""; render(); });
  root.addEventListener("grcon:planned-documents-progress", (event) => {
    const status = $("#planned-documents-status");
    if (status) status.textContent = `Enviando ${event.detail.done.toLocaleString("pt-BR")} de ${event.detail.total.toLocaleString("pt-BR")} códigos. A base atual permanece ativa.`;
  });
  function refreshIfPossible() {
    if (!root.document.hidden && root.GrconCloud?.state?.membership && !state.busy) {
      root.GrconCloud.loadPlannedDocuments().catch((error) => console.warn("Documentos Previstos: atualização indisponível", error));
    }
  }
  root.document.addEventListener("visibilitychange", refreshIfPossible);
  // Uma sessão de Consultas pode permanecer aberta por horas. A checagem leve
  // da versão ativa impede que outro usuário continue vendo um snapshot antigo
  // depois que o proprietário publicar uma nova base.
  root.setInterval(refreshIfPossible, 60000);
  root.document.addEventListener("DOMContentLoaded", () => {
    $("#planned-documents-publish")?.addEventListener("click", publish);
    render();
  }, { once: true });
})(window);
