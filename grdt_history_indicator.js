// GRCON — Indicador de histórico de eGRDT por documento
// Módulo: GrconGrdtHistoryIndicator
// Versão: 5.32.11
// Descrição: Exibe badge informativo na tabela de triagem quando um documento
//             já foi incluído em uma eGRDT gerada anteriormente (histórico local).
//             Não bloqueia a geração de novas eGRDTs.

(function (root, factory) {
  root.GrconGrdtHistoryIndicator = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Índice: normalizedDocumentKey -> [{ egrdtNumber, generatedAt }]
  let _index = new Map();
  let _built = false;

  // ─── Utilitários ───────────────────────────────────────────────────────────

  function norm(value) {
    if (!value) return "";
    return String(value)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—]/g, "-")
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  function escHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateBR(isoString) {
    if (!isoString) return "";
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return "";
      var day = String(d.getDate()).padStart(2, "0");
      var mon = String(d.getMonth() + 1).padStart(2, "0");
      var year = d.getFullYear();
      return day + "/" + mon + "/" + year;
    } catch (_) {
      console.debug("[HistoryIndicator] context:", _);
      return "";
    }
  }

  // ─── Construção do índice ───────────────────────────────────────────────────

  function buildIndex() {
    _index = new Map();
    var History = window.GrconHistory;
    if (!History || typeof History.read !== "function") {
      _built = true;
      return;
    }
    var records = History.read() || [];
    records.forEach(function (record) {
      var egrdtNumber = String(record.egrdtNumber || "").trim();
      if (!egrdtNumber) return;
      var files = Array.isArray(record.files) ? record.files : [];
      files.forEach(function (file) {
        var key = norm(file.document);
        if (!key) return;
        if (!_index.has(key)) _index.set(key, []);
        _index.get(key).push({
          egrdtNumber: egrdtNumber,
          generatedAt: record.generatedAt || "",
          outputType: record.outputType || "eGRDT final",
        });
      });
    });
    _built = true;
  }

  // ─── API pública ────────────────────────────────────────────────────────────

  function refresh() {
    buildIndex();
  }

  // Retorna a lista bruta de eGRDTs anteriores para um documento
  // (mesmo índice usado pelo badge da tabela de triagem), ordenada da
  // mais recente para a mais antiga.
  function getEntries(documentName) {
    if (!_built) buildIndex();
    var key = norm(documentName);
    if (!key) return [];
    var entries = _index.get(key);
    if (!entries || entries.length === 0) return [];
    return entries.slice().sort(function (a, b) {
      return (b.generatedAt || "").localeCompare(a.generatedAt || "");
    });
  }

  function getBadgeHtml(document) {
    if (!_built) buildIndex();
    var key = norm(document);
    if (!key) return "";
    var entries = _index.get(key);
    if (!entries || entries.length === 0) return "";

    var sorted = entries.slice().sort(function (a, b) {
      return (b.generatedAt || "").localeCompare(a.generatedAt || "");
    });

    var count = sorted.length;
    var mostRecent = sorted[0];
    var dateStr = formatDateBR(mostRecent.generatedAt);

    var tooltipLines = sorted.map(function (e) {
      var d = formatDateBR(e.generatedAt);
      return e.egrdtNumber + (d ? " (" + d + ")" : "");
    });
    var tooltip = "Emitido anteriormente em:\n" + tooltipLines.join("\n");

    var svgIcon = '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 2h10v12H3zM5 5h6M5 8h6M5 11h3"/></svg>';

    if (count === 1) {
      return (
        '<span class="grdt-history-badge grdt-history-badge--single" ' +
        'title="' + escHtml(tooltip) + '" ' +
        'aria-label="Ja emitido na ' + escHtml(mostRecent.egrdtNumber) + '">' +
        svgIcon +
        " " + escHtml(mostRecent.egrdtNumber) +
        (dateStr ? '<span class="grdt-history-badge__date"> · ' + escHtml(dateStr) + "</span>" : "") +
        "</span>"
      );
    }

    return (
      '<span class="grdt-history-badge grdt-history-badge--multiple" ' +
      'title="' + escHtml(tooltip) + '" ' +
      'aria-label="Ja emitido em ' + count + ' eGRDTs anteriores">' +
      svgIcon +
      " <strong>" + count + "</strong> eGRDTs anteriores" +
      "</span>"
    );
  }

  // ─── Inicialização ──────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(buildIndex, 250);
    });
  } else {
    setTimeout(buildIndex, 250);
  }

  return Object.freeze({
    refresh: refresh,
    getBadgeHtml: getBadgeHtml,
    getEntries: getEntries,
  });
});
