(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconMacro5Flow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TRIAGE_PREFERENCES_KEY = "grcon.triage.preferences.v2";
  const ANALYSIS_FILTERS_KEY = "grcon.analysis.saved-filters.v1";

  const COLUMNS = Object.freeze([
    { key: "situation", label: "Situação", index: 1, essential: true, locked: true },
    { key: "originalFile", label: "Arquivo original", index: 2, essential: true },
    { key: "document", label: "Documento", index: 3, essential: true, locked: true },
    { key: "sheet", label: "Aba LD", index: 4, essential: true },
    { key: "ldRevision", label: "Revisão encontrada", index: 5, essential: true },
    { key: "targetRevision", label: "Revisão do documento", index: 6, essential: true },
    { key: "title", label: "Título", index: 7, essential: true },
    { key: "effectiveDate", label: "Data efetiva", index: 8, essential: false },
    { key: "grdt", label: "GRDT", index: 9, essential: false },
    { key: "technicalStatus", label: "Status técnico", index: 10, essential: false },
    { key: "sigemStatus", label: "Status SIGEM", index: 11, essential: true },
    { key: "targetStatus", label: "Status da revisão", index: 12, essential: false },
    { key: "postingStatus", label: "Situação de postagem", index: 13, essential: false },
    { key: "fiscalComment", label: "Comentário da Fiscal", index: 14, essential: false },
    { key: "allocation", label: "Alocação", index: 15, essential: false },
    { key: "allocationStage", label: "Etapa da alocação", index: 16, essential: false },
    { key: "allocationStatus", label: "Confirmação da alocação", index: 17, essential: true },
    { key: "databook", label: "Caminho Databook", index: 18, essential: true },
    { key: "finalFile", label: "Arquivo final", index: 19, essential: true },
  ]);

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase(); }
  function storageOf(storage) { return storage || (typeof localStorage !== "undefined" ? localStorage : null); }

  function defaultTriagePreferences() {
    return {
      density: "comfortable",
      groupByStatus: false,
      visibleColumns: COLUMNS.filter((column) => column.essential).map((column) => column.key),
    };
  }

  function normalizeTriagePreferences(value) {
    const source = value || {};
    const allowed = new Set(COLUMNS.map((column) => column.key));
    const visible = Array.isArray(source.visibleColumns)
      ? source.visibleColumns.map(text).filter((key) => allowed.has(key))
      : defaultTriagePreferences().visibleColumns;
    COLUMNS.filter((column) => column.locked).forEach((column) => {
      if (!visible.includes(column.key)) visible.push(column.key);
    });
    return {
      density: source.density === "compact" ? "compact" : "comfortable",
      groupByStatus: Boolean(source.groupByStatus),
      visibleColumns: [...new Set(visible)],
    };
  }

  function readTriagePreferences(storage) {
    const target = storageOf(storage);
    if (!target) return defaultTriagePreferences();
    try { return normalizeTriagePreferences(JSON.parse(target.getItem(TRIAGE_PREFERENCES_KEY) || "{}")); }
    catch (_) { console.debug("[Macro5Flow] context:", _); return defaultTriagePreferences(); }
  }

  function saveTriagePreferences(preferences, storage) {
    const target = storageOf(storage);
    const normalized = normalizeTriagePreferences(preferences);
    if (!target) return normalized;
    try { target.setItem(TRIAGE_PREFERENCES_KEY, JSON.stringify(normalized)); } catch (_) { console.debug("[Macro5Flow] context:", _); /* armazenamento indisponível */ }
    return normalized;
  }

  function normalizeAnalysisFilter(filter) {
    const source = filter || {};
    return {
      query: text(source.query),
      status: text(source.status) || "ALL",
      startDate: text(source.startDate),
      endDate: text(source.endDate),
      sessionId: text(source.sessionId),
    };
  }

  function readSavedAnalysisFilters(storage) {
    const target = storageOf(storage);
    if (!target) return [];
    try {
      const parsed = JSON.parse(target.getItem(ANALYSIS_FILTERS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map((item) => ({ id: text(item.id), name: text(item.name), filter: normalizeAnalysisFilter(item.filter) })).filter((item) => item.id && item.name) : [];
    } catch (_) { console.debug("[Macro5Flow] context:", _); return []; }
  }

  function saveAnalysisFilter(name, filter, storage) {
    const target = storageOf(storage);
    const cleanName = text(name).slice(0, 80);
    if (!cleanName) return { saved: false, error: "Informe um nome para o filtro." };
    const records = readSavedAnalysisFilters(target);
    const existing = records.find((item) => norm(item.name) === norm(cleanName));
    const item = { id: existing ? existing.id : `filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, filter: normalizeAnalysisFilter(filter) };
    const next = existing ? records.map((record) => record.id === existing.id ? item : record) : [...records, item];
    try { target?.setItem(ANALYSIS_FILTERS_KEY, JSON.stringify(next)); return { saved: true, item, records: next }; }
    catch (error) { return { saved: false, error: error && error.message || "Não foi possível salvar o filtro." }; }
  }

  function deleteAnalysisFilter(id, storage) {
    const target = storageOf(storage);
    const next = readSavedAnalysisFilters(target).filter((item) => item.id !== text(id));
    try { target?.setItem(ANALYSIS_FILTERS_KEY, JSON.stringify(next)); return { deleted: true, records: next }; }
    catch (error) { return { deleted: false, records: next, error: error && error.message || "Não foi possível excluir o filtro." }; }
  }

  function postingTone(status) {
    return ({
      GERADO: "neutral",
      VALIDADO: "info",
      PRONTO: "warning",
      POSTADO: "success",
      PENDENCIA: "warning",
      FALHA: "danger",
      CANCELADO: "neutral",
    })[text(status)] || "neutral";
  }

  function workflowSteps(status, auditReady) {
    const current = text(status) || "GERADO";
    const reached = new Set(["GERADO"]);
    if (auditReady || ["VALIDADO", "PRONTO", "POSTADO", "PENDENCIA", "FALHA", "CANCELADO"].includes(current)) reached.add("VALIDADO");
    if (["PRONTO", "POSTADO", "PENDENCIA", "FALHA"].includes(current)) reached.add("PRONTO");
    if (["POSTADO", "PENDENCIA", "FALHA", "CANCELADO"].includes(current)) reached.add("RESULTADO");
    const finalLabel = ({ POSTADO: "Postado", PENDENCIA: "Com pendência", FALHA: "Falha", CANCELADO: "Cancelado" })[current] || "Registrar retorno";
    return [
      { key: "GERADO", label: "eGRDT gerada", complete: true, current: current === "GERADO" },
      { key: "VALIDADO", label: "Pacote conferido", complete: reached.has("VALIDADO"), current: current === "VALIDADO" },
      { key: "PRONTO", label: "Pronto para SIGEM", complete: reached.has("PRONTO"), current: current === "PRONTO" },
      { key: "RESULTADO", label: finalLabel, complete: reached.has("RESULTADO"), current: ["POSTADO", "PENDENCIA", "FALHA", "CANCELADO"].includes(current), tone: postingTone(current) },
    ];
  }

  function analysisTimeline(records) {
    const source = [...(records || [])].sort((left, right) => text(left.analyzedAt).localeCompare(text(right.analyzedAt)));
    return source.map((item, index) => {
      const previous = source[index - 1];
      const changed = [];
      if (previous && norm(previous.statusDelivered) !== norm(item.statusDelivered)) changed.push(`Resultado: ${previous.statusDelivered || "—"} → ${item.statusDelivered || "—"}`);
      if (previous && norm(previous.sigemStatus) !== norm(item.sigemStatus)) changed.push(`SIGEM: ${previous.sigemStatus || "—"} → ${item.sigemStatus || "—"}`);
      if (previous && norm(previous.currentRevision) !== norm(item.currentRevision)) changed.push(`Revisão atual: ${previous.currentRevision || "—"} → ${item.currentRevision || "—"}`);
      if (previous && norm(previous.targetRevision) !== norm(item.targetRevision)) changed.push(`Próxima revisão: ${previous.targetRevision || "—"} → ${item.targetRevision || "—"}`);
      return { ...item, changes: changed, first: index === 0 };
    });
  }

  function relatedEgrdt(documentRecord, historyRecords) {
    const wanted = norm(documentRecord && documentRecord.document);
    if (!wanted) return null;
    const matches = (historyRecords || []).filter((record) => (record.files || []).some((file) => norm(file.document) === wanted));
    return matches.sort((left, right) => text(right.generatedAt).localeCompare(text(left.generatedAt)))[0] || null;
  }

  return Object.freeze({
    TRIAGE_PREFERENCES_KEY,
    ANALYSIS_FILTERS_KEY,
    COLUMNS,
    text,
    norm,
    defaultTriagePreferences,
    normalizeTriagePreferences,
    readTriagePreferences,
    saveTriagePreferences,
    normalizeAnalysisFilter,
    readSavedAnalysisFilters,
    saveAnalysisFilter,
    deleteAnalysisFilter,
    postingTone,
    workflowSteps,
    analysisTimeline,
    relatedEgrdt,
  });
});
