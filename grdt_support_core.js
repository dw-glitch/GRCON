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

  // Um único índice por snapshot da Consulta Geral. Evita percorrer milhares
  // de registros a cada tecla sem persistir cópias entre contratos.
  const recordIndexes = new WeakMap();
  function recordsIndex(records) {
    if (!Array.isArray(records)) return new Map();
    let index = recordIndexes.get(records);
    if (index) return index;
    index = new Map();
    records.forEach(function (row) {
      if (!row || !row.document) return;
      const code = key(row.document);
      if (!index.has(code)) index.set(code, []);
      index.get(code).push(row);
    });
    recordIndexes.set(records, index);
    return index;
  }
  function rowsFor(records, code) {
    return (recordsIndex(records).get(key(code)) || []).slice();
  }
  function search(records, input, maxShown) {
    const parsed = parseCodes(input);
    const codes = parsed.slice(0, 250);
    const found = new Set(), seen = new Set(), rows = [];
    const limit = Math.max(1, Math.min(2000, Number(maxShown) || 40));
    const index = recordsIndex(records);
    for (const code of codes) {
      const identity = key(code);
      for (const row of index.get(identity) || []) {
        found.add(identity);
        const distinct = identity + "\u0000" + key(row.revision) +
          "\u0000" + key(row.status) + "\u0000" + key(row.title);
        if (seen.has(distinct)) continue;
        seen.add(distinct);
        if (rows.length < limit) rows.push({
          document: String(row.document || ""), revision: String(row.revision || ""),
          title: String(row.title || ""), status: String(row.status || ""),
          sourceRow: row.sourceRow == null ? "" : String(row.sourceRow)
        });
      }
    }
    return { codes: codes, rows: rows, total: seen.size,
      missing: codes.filter(function (code) { return !found.has(key(code)); }),
      truncatedInput: parsed.length > codes.length };
  }
  // Somente explica dados já decididos pela triagem; NÃO muda elegibilidade.
  function diagnose(rows) {
    const counters = Object.create(null), issues = [];
    let selected = 0, selectedRisks = 0, manualSelected = 0, total = 0;
    const maxIssues = 200;
    (rows || []).forEach(function (row) {
      if (!row) return;
      if (row.selected) selected += 1;
      if (row.manual) manualSelected += 1;
      let kind = "", title = "", reason = "", action = "";
      const document = String(row.document || ""), revision = String(row.revision || "");
      if (row.fileRevision && revision && key(row.fileRevision) !== key(revision)) {
        kind = "revision"; title = "Revisão do arquivo divergente";
        reason = "Arquivo: rev. " + row.fileRevision + " · GRDT: rev. " + revision + ". Confira antes de gerar.";
        action = "Conferir revisões";
      } else if (row.revisionWarning) {
        kind = "revision"; title = "Identificação da revisão a conferir";
        reason = String(row.revisionWarning); action = "Ver evidências";
      } else if (row.allocationAlert === "not_allocated") {
        kind = "allocation"; title = "Documento não alocado";
        reason = "Não alocado na fonte oficial da triagem; situação: Não incluir." +
          (row.blockingRevision ? " A revisão " + row.blockingRevision + " também permanece em análise." : "") +
          " Inclusão manual continua possível.";
        action = "Verificar alocação";
      } else if (row.allocationAlert === "conflict") {
        kind = "conflict"; title = "Conflito de alocação";
        reason = "A origem possui evidências contraditórias de alocação. Exige conferência.";
        action = "Conferir alocação";
      } else if (row.blockingRevision) {
        kind = "analysis"; title = "Revisão anterior em análise";
        reason = "Rev. " + row.blockingRevision + " permanece em análise; atual rev. " + (revision || "não informada") + ".";
        action = "Conferir situação";
      } else if (row.selected && row.manual) {
        kind = "manual"; title = "Inclusão manual excepcional";
        reason = "Seleção manual mantida. Confira as evidências antes de gerar.";
        action = "Conferir seleção";
      } else if (row.group === "nao_localizado") {
        kind = "missing"; title = "Situação não localizada";
        reason = "Sem identificação suficiente na fonte consultada; não equivale a Não alocado.";
        action = "Conferir origem";
      } else if (row.group === "revisar") {
        kind = "review"; title = "Documento para conferência";
        reason = row.reason ? String(row.reason).slice(0, 260) : "Verifique a evidência da triagem antes de selecionar.";
        action = "Ver evidências";
      }
      if (row.selected && kind) selectedRisks += 1;
      if (!kind) return;
      total += 1; counters[kind] = (counters[kind] || 0) + 1;
      issues.push({
        document: document, revision: revision, kind: kind, title: title,
        reason: reason, action: action, selected: Boolean(row.selected),
        index: Number.isSafeInteger(row.index) ? row.index : -1
      });
    });
    const priority = { revision: 0, manual: 1, analysis: 2, conflict: 3, allocation: 4, missing: 5, review: 6 };
    issues.sort(function (a,b) { return (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9) ||
      Number(b.selected) - Number(a.selected); });
    return { counters: counters, issues: issues.slice(0, maxIssues), total: total, selected: selected,
      selectedRisks: selectedRisks, manualSelected: manualSelected,
      limited: total > maxIssues };
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
  return Object.freeze({ key: key, parseCodes: parseCodes, search: search, rowsFor: rowsFor, diagnose: diagnose, GROUPS: GROUPS, summarize: summarize });
});