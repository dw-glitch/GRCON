/* GRCON — projeções puras da Central de Apoio. Não classificam nem autorizam GRDT. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconGrdtSupportCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function key(value) {
    return String(value == null ? "" : value).replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLocaleUpperCase("pt-BR");
  }
  function parseCodes(input) {
    const unique = new Set(), codes = [];
    // Não dividir por '-' ou '_': são partes integrantes do código.
    String(input || "").split(/[\r\n;\t]+/).forEach(function (raw) {
      const code = String(raw).trim().replace(/^["']|["']$/g, "").trim();
      if (!code || unique.has(key(code))) return;
      unique.add(key(code)); codes.push(code);
    });
    return codes;
  }
  function search(records, input, maxShown) {
    const codes = parseCodes(input).slice(0, 100);
    const sought = new Set(codes.map(key));
    const found = new Set(), seen = new Set(), rows = [];
    const limit = Math.max(1, Math.min(40, Number(maxShown) || 12));
    // Não usar edit-distance, startsWith ou fuzzy matching para associar documentos.
    (records || []).forEach(function (row) {
      if (!row || !sought.has(key(row.document))) return;
      const identity = key(row.document);
      found.add(identity);
      const revKey = identity + "\u0000" + key(row.revision);
      const statusKey = key(row.status);
      const distinct = revKey + "\u0000" + statusKey + "\u0000" + key(row.title);
      if (seen.has(distinct)) return;
      seen.add(distinct);
      if (rows.length < limit) rows.push({
        document: String(row.document || ""), revision: String(row.revision || ""),
        title: String(row.title || ""), status: String(row.status || ""),
        sourceRow: row.sourceRow == null ? "" : String(row.sourceRow)
      });
    });
    return {
      codes: codes, rows: rows, total: seen.size,
      missing: codes.filter(function (code) { return !found.has(key(code)); }),
      truncatedInput: parseCodes(input).length > 100
    };
  }
  const GROUPS = Object.freeze({
    revisar: "Conferir", bloqueado: "Não incluir",
    nao_localizado: "Não localizado", descartar: "Em análise"
  });
  function summarize(groups) {
    const counts = { revisar: 0, bloqueado: 0, nao_localizado: 0, descartar: 0 };
    (groups || []).forEach(function (group) {
      if (Object.prototype.hasOwnProperty.call(counts, group)) counts[group] += 1;
    });
    return { counts: counts, attention: Object.values(counts).reduce(function (a, b) { return a + b; }, 0) };
  }
  return Object.freeze({ key: key, parseCodes: parseCodes, search: search, GROUPS: GROUPS, summarize: summarize });
});