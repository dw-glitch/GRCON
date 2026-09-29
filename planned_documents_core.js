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

  function applyToRecords(records, snapshot) {
    if (!snapshot || !snapshot.id || !(snapshot.keys instanceof Set)) return records;
    return (records || []).map((record) => {
      const allocated = snapshot.keys.has(key(String(record.documentKey || record.document || "").replace(/\u0000/g, "")));
      const allocationStatus = allocated ? "ALOCADO" : "NÃO ALOCADO";
      return {
        ...record,
        allocationStatus,
        allocationStatusState: Core.allocationState(allocationStatus),
        allocationStatusHeader: "Documentos Previstos · DOCUMENTO",
        allocationStatusColumn: "A",
        plannedDocumentsSnapshot: snapshot.id,
        plannedDocumentsFile: snapshot.fileName || "",
        originalLdAllocationStatus: record.allocationStatus || "",
      };
    });
  }

  return { key, parseWorkbook, applyToRecords };
});
