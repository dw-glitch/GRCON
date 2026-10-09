(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconAllocationRegistryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const VERSION = "1.0.0";
  const text = value => String(value == null ? "" : value).trim();
  const key = value => Core.key(text(value));
  const norm = value => Core.norm(value).replace(/\s+/g, " ");
  const fields = {
    document: ["NOMEDOCUMENTO", "NOME DOCUMENTO", "DOCUMENTO"],
    allocation: ["ALOCACAO", "NUMERO DA ALOCACAO"],
    allocationStatus: ["STATUS DA ALOCACAO", "STATUS DE ALOCACAO"],
    fiscalComment: ["COMENTARIOS DA FISCAL 01", "COMENTARIO DA FISCAL 01", "COMENTARIOS FISCAL 01", "COMENTARIO FISCAL 01", "RESPOSTA DA FISCAL 01"],
    workflow: ["WORKFLOW"], active: ["DOCUMENTO ATIVO"], databook: ["CAMINHO DATA BOOK", "CAMINHO DATABOOK"],
    ldSheet: ["ABA"], ldVersion: ["VERSAO DA LD"], sentAt: ["DATA DO ENVIO DA ALOC"],
    fiscal1ReturnedAt: ["RETORNO DA FISCAL 01"],
    fiscal2ReturnedAt: ["RETORNO DA FISCAL 02"],
    fiscal2Comment: ["RESPOSTA DA FISCAL 02", "COMENTARIOS DA FISCAL 02", "COMENTARIO DA FISCAL 02"],
    plannedAt: ["DATA PREVISTA"], action: ["ACAO"], baselineAt: ["DATA DA LINHA BASE"],
    originalPurpose: ["PROPOSITO DE EMISSAO ORIGINAL"], critical: ["DOCUMENTO CRITICO"],
    remarks: ["OBSERVACAO", "OBSERVACOES"], signal: ["FAROL"],
  };
  function cleanRecord(value) {
    const item = {};
    for (const field of Object.keys(fields)) item[field] = ["fiscalComment", "fiscal2Comment", "remarks"].includes(field) ? String(value?.[field] ?? "") : text(value?.[field]);
    item.sourceRow = Number(value?.sourceRow) || 0;
    if (item.document.length < 7 || item.document.length > 255 || !/\d/.test(item.document)) throw new Error("Código documental inválido na Central de alocação.");
    if (Object.entries(item).some(([field, v]) => typeof v === "string" && v.length > (["fiscalComment", "fiscal2Comment", "remarks"].includes(field) ? 8192 : field === "databook" ? 2048 : field === "allocationStatus" ? 1024 : 255))) throw new Error("Campo muito extenso na Central de alocação.");
    if (!Number.isInteger(item.sourceRow) || item.sourceRow < 1 || item.sourceRow > 1048576) throw new Error("Linha de origem inválida.");
    return item;
  }
  function parseWorkbook(workbook, XLSX) {
    const name = workbook?.SheetNames?.find(name => norm(name) === "CENTRAL DE ALOCACAO");
    if (!name) throw new Error("A planilha precisa conter a aba Central de alocação.");
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: true, range: 0 });
    let header = -1, columns;
    for (let row = 0; row < Math.min(40, rows.length); row++) {
      const candidate = {};
      for (const [field, aliases] of Object.entries(fields)) {
        const matches = rows[row].map((value, column) => {
          const header = norm(value);
          // A Central identifica a responsável depois do cabeçalho, por ex.
          // "Resposta da Fiscal 01\n (Nome)". Só o comentário aceita esse
          // complemento; retorno/data e Fiscal 02 não são comentários da 01.
          const identity = ["fiscalComment", "fiscal2Comment", "fiscal1ReturnedAt", "fiscal2ReturnedAt"].includes(field) ? header.replace(/\s*\([^()]*\)\s*$/, "").trim() : header;
          return aliases.includes(identity) ? column : -1;
        }).filter(column => column >= 0);
        if (matches.length > 1) throw new Error(`Cabeçalho duplicado: ${field}. Confira a planilha antes de publicar.`);
        if (matches.length) candidate[field] = matches[0];
      }
      if (["document", "allocation", "allocationStatus"].every(field => field in candidate)) { header = row; columns = candidate; break; }
    }
    if (header < 0) throw new Error("Não foram encontrados NomeDocumento/Documento, Alocação e Status da Alocação na mesma linha de cabeçalho.");
    // Inherit only actual merged cells, never an arbitrary preceding row.
    const merged = new Map();
    for (const range of sheet["!merges"] || []) {
      if (range.s.c !== range.e.c) continue;
      for (const [field, column] of Object.entries(columns)) {
        if (field === "document" || column < range.s.c || column > range.e.c) continue;
        for (let row = Math.max(header + 1, range.s.r); row <= range.e.r; row++) merged.set(`${row}:${column}`, rows[range.s.r]?.[range.s.c] || "");
      }
    }
    const records = []; let ignored = 0;
    for (let row = header + 1; row < rows.length; row++) {
      const document = text(rows[row][columns.document]);
      if (!document) { if (rows[row].some(value => text(value))) ignored++; continue; }
      if (!/\d/.test(document) || document.length < 7) { ignored++; continue; }
      const item = { sourceRow: row + 1 };
      for (const [field, column] of Object.entries(columns)) item[field] = merged.has(`${row}:${column}`) ? merged.get(`${row}:${column}`) : rows[row][column];
      records.push(cleanRecord(item));
    }
    if (!records.length || records.length > 100000) throw new Error("A Central de alocação precisa conter entre 1 e 100.000 vínculos documentais.");
    return { records, count: records.length, metadata: { version: VERSION, sheetName: name, headerRow: header + 1, ignored } };
  }
  function buildIndex(records) {
    const byDocument = new Map(), byCanonical = new Map();
    for (const value of records || []) {
      const item = cleanRecord(value), exact = key(item.document), canonical = exact.replace(/^NT-/, "");
      for (const [map, identity] of [[byDocument, exact], [byCanonical, canonical]]) {
        if (!map.has(identity)) map.set(identity, []);
        map.get(identity).push(item);
      }
    }
    return { byDocument, byCanonical };
  }
  function lookup(document, index) {
    if (!index) return [];
    const exact = key(document);
    return index.byDocument.get(exact) || index.byCanonical.get(exact.replace(/^NT-/, "")) || [];
  }
  function fiscalCommentsForDocument(document, index) {
    const unique = new Set();
    for (const record of lookup(document, index)) {
      const comment = String(record.fiscalComment ?? "");
      if (comment.trim()) unique.add(comment);
    }
    // Todas as observações distintas são mantidas; nunca escolher uma
    // ocorrência arbitrariamente quando um documento possui várias ALOCs.
    return [...unique];
  }
  return Object.freeze({ VERSION, key, cleanRecord, parseWorkbook, buildIndex, lookup, fiscalCommentsForDocument });
});
