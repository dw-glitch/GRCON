(function (root, factory) {
  const api = factory(root, root.TriagemCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPlannedDocumentsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, Core) {
  "use strict";

  function key(value) { return Core.key(value); }
  function validCode(value) {
    return value.length >= 7 && value.length <= 255 && /\d/.test(value)
      && !/^SIGEM\s*-\s*SISTEMA\b/.test(value);
  }
  function parseWorkbook(workbook) {
    if (!workbook || !Array.isArray(workbook.SheetNames)) throw new Error("A planilha de Documentos Previstos está inválida.");
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet["!ref"]) continue;
      const rows = root.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      const headerIndex = rows.slice(0, 30).findIndex((row) => row.some((value) => Core.norm(value) === "DOCUMENTO"));
      if (headerIndex < 0) continue;
      const column = rows[headerIndex].findIndex((value) => Core.norm(value) === "DOCUMENTO");
      const codes = new Set();
      let invalid = 0;
      for (let index = headerIndex + 1; index < rows.length; index += 1) {
        const raw = String(rows[index][column] || "").trim();
        if (!raw) continue;
        const documentKey = key(raw.replace(/\u0000/g, ""));
        if (validCode(documentKey)) codes.add(documentKey);
        else invalid += 1; // Rodapés do SIGEM e linhas não documentais não são alocações.
      }
      if (!codes.size || codes.size > 100000) throw new Error("A coluna DOCUMENTO não contém uma relação válida de documentos previstos.");
      return { keys: [...codes].sort(), count: codes.size, ignored: invalid, sheetName };
    }
    throw new Error("Não foi encontrada a coluna DOCUMENTO na planilha de Documentos Previstos.");
  }

  function classifyDocument(documentCode, snapshot) {
    const cleanCode = String(documentCode || "").replace(/\u0000/g, "");
    const documentKey = key(cleanCode);
    // Reutiliza somente equivalências canônicas já controladas pelo GRCON.
    // Para ET isso inclui a mesma codificação com/sem o prefixo nt-; não há
    // fuzzy match, revisão ou consulta à LD para decidir alocação.
    const searchKeys = typeof Core.documentSearchKeys === "function"
      ? [...new Set(Core.documentSearchKeys(cleanCode).map(key).filter(Boolean))]
      : [documentKey].filter(Boolean);
    if (!snapshot || !snapshot.id || !(snapshot.keys instanceof Set)) {
      return {
        available: false,
        allocated: null,
        kind: "unavailable",
        label: "",
        status: "",
        documentKey,
        searchKeys,
        matchedKey: "",
        snapshotId: "",
        fileName: "",
        updatedAt: "",
      };
    }
    const matchedKey = searchKeys.find((candidate) => snapshot.keys.has(candidate)) || "";
    const allocated = Boolean(matchedKey);
    return {
      available: true,
      allocated,
      kind: allocated ? "allocated" : "not_allocated",
      label: allocated ? "Alocado" : "Não alocado",
      status: allocated ? "ALOCADO" : "NÃO ALOCADO",
      documentKey,
      searchKeys,
      matchedKey,
      snapshotId: snapshot.id,
      fileName: snapshot.fileName || "",
      updatedAt: snapshot.updatedAt || "",
    };
  }

  function applyToRecords(records, snapshot) {
    if (!snapshot || !snapshot.id || !(snapshot.keys instanceof Set)) return records;
    return (records || []).map((record) => {
      const classification = classifyDocument(record.documentKey || record.document || "", snapshot);
      const allocationStatus = classification.status;
      return {
        ...record,
        allocationStatus,
        allocationStatusState: Core.allocationState(allocationStatus),
        allocationStatusHeader: "Documentos Previstos · DOCUMENTO",
        allocationStatusColumn: "A",
        plannedDocumentsSnapshot: snapshot.id,
        plannedDocumentsFile: snapshot.fileName || "",
        plannedDocumentsUpdatedAt: snapshot.updatedAt || "",
        originalLdAllocationStatus: record.allocationStatus || "",
      };
    });
  }

  function applyToConsultationRow(row, documentCode, snapshot) {
    const classification = classifyDocument(documentCode, snapshot);
    if (!classification.available) {
      return {
        ...(row || {}),
        allocated: "",
        allocationKind: "unavailable",
        allocationSource: "Documentos Previstos",
        allocationUnavailable: true,
        plannedDocumentsSnapshot: "",
        plannedDocumentsFile: "",
        plannedDocumentsUpdatedAt: "",
      };
    }
    return {
      ...(row || {}),
      allocated: classification.label,
      allocationKind: classification.kind,
      allocationSource: "Documentos Previstos",
      allocationUnavailable: false,
      plannedDocumentsSnapshot: classification.snapshotId,
      plannedDocumentsFile: classification.fileName,
      plannedDocumentsUpdatedAt: classification.updatedAt,
    };
  }

  // O PostgREST pode devolver menos linhas que o limite pedido. Só uma página
  // vazia encerra a leitura; a contagem final protege contra carga parcial.
  async function collectPages(fetchPage, expectedCount, pageSize = 1000) {
    const keys = new Set();
    let after = "";
    for (;;) {
      const items = await fetchPage(after, pageSize);
      if (!Array.isArray(items)) throw new Error("Resposta inválida ao ler Documentos Previstos.");
      if (!items.length) break;
      const next = String(items[items.length - 1].document_key || "");
      if (!next || next === after) throw new Error("A paginação de Documentos Previstos não avançou.");
      for (const item of items) keys.add(item.document_key);
      if (keys.size > Number(expectedCount)) throw new Error("A base compartilhada contém mais códigos que a contagem publicada.");
      after = next;
    }
    if (keys.size !== Number(expectedCount)) {
      throw new Error(`A base compartilhada de Documentos Previstos chegou incompleta (${keys.size} de ${expectedCount}). Tente novamente.`);
    }
    return keys;
  }

  return { key, parseWorkbook, classifyDocument, applyToRecords, applyToConsultationRow, collectPages };
});
