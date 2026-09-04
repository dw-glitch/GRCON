(function (root, factory) {
  "use strict";
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const Requests = root.GrconRequestsCore || safeRequire("./requests_core.js");
  const Report = root.GrconRequestsReport || safeRequire("./requests_report.js");
  const Triagem = root.TriagemCore || safeRequire("./core.js");
  const api = factory(Requests, Report, Triagem);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRequestsTaxonomy = api;
  if (Requests && Report && Triagem) api.install(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Requests, Report, Triagem) {
  "use strict";

  const INTERNAL_TAXONOMY_HEADER = "TAXONOMIA INTERNA";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function normalizeHeader(value, triagem) {
    const motor = triagem || Triagem;
    const normalized = motor && typeof motor.norm === "function"
      ? motor.norm(value)
      : text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return normalized.replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function internalTaxonomyFromRecord(record, triagem) {
    const columns = Array.isArray(record && record.ldColumns) ? record.ldColumns : [];
    const values = columns
      .filter((entry) => normalizeHeader(entry && entry.header, triagem) === INTERNAL_TAXONOMY_HEADER)
      .map((entry) => text(entry && entry.value));
    if (!values.length) return "";
    const unique = [...new Set(values)];
    // Cabeçalho duplicado com valores conflitantes é uma ambiguidade da própria
    // LD. Não escolhemos uma coluna arbitrariamente.
    return unique.length === 1 ? unique[0] : "";
  }

  function selectedLdRecord(result, index, triagem) {
    const chosen = result && result.chosen;
    const motor = triagem || Triagem;
    if (!chosen || !index || !index.byDocument || !motor || typeof motor.key !== "function") return null;
    const documentKey = motor.key(result.ldDocument || chosen.document);
    const group = index.byDocument.get(documentKey);
    const records = group && Array.isArray(group.records) ? group.records : [];
    const sameRow = records.filter((record) => (
      text(record && record.source) === text(chosen.ld)
      && text(record && record.sheet) === text(chosen.sheet)
      && Number(record && record.row) === Number(chosen.row)
    ));
    // O motor já escolheu uma ocorrência. Aqui apenas voltamos à mesma linha
    // física pelo identificador de origem/aba/linha; não há novo matching.
    return sameRow.length === 1 ? sameRow[0] : null;
  }

  function enrichLookupResult(result, index, triagem) {
    if (!result || typeof result !== "object") return result;
    const record = selectedLdRecord(result, index, triagem);
    return {
      ...result,
      internalTaxonomy: record ? internalTaxonomyFromRecord(record, triagem) : "",
      internalTaxonomySource: record ? {
        source: text(record.source),
        sheet: text(record.sheet),
        row: Number(record.row) || 0,
      } : null,
    };
  }

  function wrapRequestsCore(original, triagem) {
    if (!original) return original;
    const motor = triagem || Triagem;
    const lookupDocument = (document, index, options) => enrichLookupResult(
      original.lookupDocument(document, index, options), index, motor,
    );
    const lookupDocuments = (documents, index, options) => (documents || []).map((item) => {
      const document = typeof item === "string" ? item : text(item && item.document);
      const requestedTitle = typeof item === "string" ? "" : text(item && item.requestedTitle);
      return lookupDocument(document, index, { ...(options || {}), requestedTitle });
    });
    const consultationRow = (result) => ({
      ...original.consultationRow(result),
      internalTaxonomy: text(result && result.internalTaxonomy),
    });
    return Object.freeze({ ...original, lookupDocument, lookupDocuments, consultationRow });
  }

  function headerKey(value) {
    return text(value)
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function slug(value) {
    const base = headerKey(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return base || `modelo-${Date.now()}`;
  }

  function wrapReport(original) {
    if (!original) return original;
    const existing = Array.isArray(original.COLUMNS) ? original.COLUMNS : [];
    const columns = [];
    let inserted = false;
    existing.forEach((column) => {
      columns.push({ ...column });
      if (column.key === "title") {
        columns.push({ header: "TAXONOMIA INTERNA", key: "internalTaxonomy", width: 34 });
        inserted = true;
      }
    });
    if (!inserted) columns.push({ header: "TAXONOMIA INTERNA", key: "internalTaxonomy", width: 34 });
    const COLUMNS = Object.freeze(columns.map((column) => Object.freeze(column)));
    const TEMPLATE_BASES = Object.freeze({
      consulta: Object.freeze({ label: "Consulta de documentos", columns: COLUMNS, title: "GRCON · CONSULTA DE DOCUMENTOS" }),
    });
    const baseOf = (name) => TEMPLATE_BASES[text(name)] || TEMPLATE_BASES.consulta;
    const exportFieldCatalog = (base) => baseOf(base).columns.map((column) => ({ key: column.key, header: column.header, width: column.width }));
    const normalizeExportTemplate = (input) => {
      const raw = input || {};
      const base = TEMPLATE_BASES[text(raw.base)] ? text(raw.base) : "consulta";
      const known = new Map(exportFieldCatalog(base).map((field) => [field.key, field]));
      const templateColumns = (Array.isArray(raw.columns) ? raw.columns : [])
        .map((column) => {
          const key = known.has(text(column && column.key)) ? text(column.key) : "";
          const standard = known.get(key);
          return {
            key,
            header: text(column && column.header) || (standard ? standard.header : ""),
            width: Number(column && column.width) || (standard ? standard.width : 24),
          };
        })
        .filter((column) => column.key || column.header);
      const name = text(raw.name) || "Modelo sem nome";
      return {
        id: text(raw.id) || slug(name),
        name,
        base,
        builtIn: Boolean(raw.builtIn),
        scope: text(raw.scope) || "local",
        columns: templateColumns.length ? templateColumns : exportFieldCatalog(base),
      };
    };
    const BUILTIN_EXPORT_TEMPLATES = Object.freeze(Object.keys(TEMPLATE_BASES).map((base) => Object.freeze(normalizeExportTemplate({
      id: `padrao-${base}`,
      name: `${baseOf(base).label} (padrão do GRCON)`,
      base,
      builtIn: true,
      scope: "embutido",
      columns: exportFieldCatalog(base),
    }))));
    const importExportTemplate = (name, headers, base) => {
      const catalog = exportFieldCatalog(base);
      const byLabel = new Map(catalog.map((field) => [headerKey(field.header), field]));
      const used = new Set();
      const unmatched = [];
      const templateColumns = (Array.isArray(headers) ? headers : [])
        .map((header) => text(header)).filter(Boolean)
        .map((header) => {
          const field = byLabel.get(headerKey(header));
          if (!field || used.has(field.key)) {
            unmatched.push(header);
            return { key: "", header, width: 24 };
          }
          used.add(field.key);
          return { key: field.key, header, width: field.width };
        });
      return { template: normalizeExportTemplate({ name, base, columns: templateColumns, scope: "local" }), unmatched, matched: used.size };
    };
    const applyExportTemplate = (template, rows) => {
      const model = normalizeExportTemplate(template);
      return {
        headers: model.columns.map((column) => column.header),
        rows: (rows || []).map((row) => model.columns.map((column) => {
          if (!column.key) return "";
          const value = row ? row[column.key] : "";
          return value === null || value === undefined ? "" : value;
        })),
      };
    };
    const previewExportTemplate = (template, rows, limit) => {
      const total = (rows || []).length;
      const cut = Math.max(1, Number(limit) || 5);
      const result = applyExportTemplate(template, (rows || []).slice(0, cut));
      return { headers: result.headers, rows: result.rows, total, hidden: Math.max(0, total - result.rows.length) };
    };
    const writeConsultationSheet = (worksheet, rows, options) => original.writeConsultationSheet(worksheet, rows, {
      ...(options || {}),
      columns: options && Array.isArray(options.columns) && options.columns.length ? options.columns : COLUMNS,
    });
    return Object.freeze({
      ...original,
      COLUMNS,
      TEMPLATE_BASES,
      BUILTIN_EXPORT_TEMPLATES,
      exportFieldCatalog,
      normalizeExportTemplate,
      importExportTemplate,
      applyExportTemplate,
      previewExportTemplate,
      writeConsultationSheet,
    });
  }

  function install(target) {
    const host = target || (typeof globalThis !== "undefined" ? globalThis : {});
    const currentRequests = host.GrconRequestsCore || Requests;
    const currentReport = host.GrconRequestsReport || Report;
    if (currentRequests) host.GrconRequestsCore = wrapRequestsCore(currentRequests, host.TriagemCore || Triagem);
    if (currentReport) host.GrconRequestsReport = wrapReport(currentReport);
    return { requestsCore: host.GrconRequestsCore, report: host.GrconRequestsReport };
  }

  return Object.freeze({
    INTERNAL_TAXONOMY_HEADER,
    normalizeHeader,
    internalTaxonomyFromRecord,
    selectedLdRecord,
    enrichLookupResult,
    wrapRequestsCore,
    wrapReport,
    install,
  });
});
