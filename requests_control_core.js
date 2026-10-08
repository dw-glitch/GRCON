(function(root, factory) {
  const resolveCore = () => root.TriagemCore || (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(resolveCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRequestsControlCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(resolveCore) {
  "use strict";
  const norm = value => String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");
  const key = value => resolveCore().key(value);
  const keys = value => [...new Set(resolveCore().documentSearchKeys(value).map(key))];
  const aliases = ["DOCUMENTO", "NOMEDOCUMENTO", "NOME DOCUMENTO", "CODIGO", "CODIGO DO DOCUMENTO", "CODIGO DOCUMENTO", "DOCUMENTO SOLICITADO", "NUMERO DO DOCUMENTO"];
  function parseWorkbook(workbook, XLSX) {
    const names = workbook.SheetNames.filter(name => /SOLICIT/i.test(norm(name)));
    if (!names.length) throw new Error("Selecione o Controle de Solicitações com a aba Solicitações.");
    const records = [];
    for (const name of names) {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true, range: 0 });
      let header = -1, column = -1;
      for (let i = 0; i < Math.min(60, matrix.length); i++) {
        const matches = matrix[i].map((v, c) => aliases.includes(norm(v)) ? c : -1).filter(c => c >= 0);
        if (matches.length > 1) throw new Error("Mais de uma coluna documental na aba " + name + ". Confira o cabeçalho.");
        if (matches.length === 1) { header = i; column = matches[0]; break; }
      }
      if (header < 0) continue;
      for (let i = header + 1; i < matrix.length; i++) {
        const document = String(matrix[i][column] ?? "").trim();
        if (!document || !/\d/.test(document) || !/[-.]/.test(document) || document.length > 255) continue;
        const data = {};
        matrix[header].forEach((label, c) => { if (String(label).trim()) data[String(label).trim() + (matrix[header].indexOf(label) !== c ? " (coluna " + (c + 1) + ")" : "")] = String(matrix[i][c] ?? ""); });
        records.push({ document, sheet: name, sourceRow: i + 1, data });
      }
    }
    if (!records.length) throw new Error("Nenhum código documental foi localizado na aba Solicitações.");
    return records;
  }
  function buildIndex(records) {
    const index = new Map();
    for (const row of records || []) for (const code of keys(row.document)) { if (!index.has(code)) index.set(code, []); index.get(code).push(row); }
    return index;
  }
  function find(index, document) { return [...new Set(keys(document).flatMap(code => index.get(code) || []))]; }
  return Object.freeze({ key, norm, parseWorkbook, buildIndex, find });
});
