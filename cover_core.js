(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconCoverCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROJECT_DEFAULTS = Object.freeze({
    client: "REFINO, GÁS E ENERGIA",
    program: "REFINARIA DO NORDESTE - ABREU E LIMA - RNEST",
    area: "UNIDADE DE HIDROTRATAMENTO DE DIESEL (U32)",
    managementUnit: "SRGE/SI-IV/RNEST-T2",
    classification: "INTERNA",
    companyName: "CONSÓRCIO CONSAG UHDT-D",
    technicalResponsible: "RODRIGO MASSAMORI DELPOIO NAKAZONE",
    contractNumber: "5900.0130870.25.2",
    professionalRegistration: "2609413947",
    executor: "KAIQUE CAETANO",
    checker: "LEANDRO CALDEIRA",
    approver: "LUCIANA SCIARRA",
  });

  const CATEGORY_LABELS = Object.freeze({
    PR: "PROCEDIMENTO",
    MD: "MEMORIAL DESCRITIVO",
    DE: "DESENHO",
    FD: "FOLHA DE DADOS",
  });

  const INTERNAL_CODE_HEADERS = [
    "COD DOCUMENTO INTERNO", "CODIGO DOCUMENTO INTERNO", "NUMERO INTERNO DO DOCUMENTO",
    "NUMERO INTERNO CONTRATADA", "CODIGO INTERNO",
  ];
  const TAXONOMY_HEADERS = ["TAXONOMIA INTERNA", "TAXONOMIA"];
  const EAP_HEADERS = ["EAP"];
  const CATEGORY_HEADERS = ["CATEGORIA DO DOCUMENTO", "CATEGORIA DOCUMENTO", "TIPO DOCUMENTAL", "TIPO DE DOCUMENTO"];

  function text(value) { return value == null ? "" : String(value).trim(); }
  function norm(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(value) { return norm(value).split(" ").filter(Boolean); }
  function headerValue(record, aliases) {
    const wanted = new Set((aliases || []).map(norm));
    const values = (Array.isArray(record && record.ldColumns) ? record.ldColumns : [])
      .filter((entry) => wanted.has(norm(entry && entry.header)))
      .map((entry) => text(entry && entry.value)).filter(Boolean);
    return [...new Set(values)].length === 1 ? values[0] : "";
  }
  function categoryCodeFromDocument(document) {
    const match = text(document).toUpperCase().match(/^(?:[A-Z]-)?([A-Z0-9]{2,3})-/);
    return match ? match[1] : "";
  }
  function categoryLabel(record) {
    const explicit = headerValue(record, CATEGORY_HEADERS) || text(record && record.documentType);
    if (explicit && !/^[A-Z0-9]{2,3}$/.test(explicit.toUpperCase())) return explicit.toUpperCase();
    const code = (explicit || categoryCodeFromDocument(record && record.document)).toUpperCase();
    return CATEGORY_LABELS[code] || code;
  }
  function recordIdentity(record, triagem) {
    try {
      return triagem && typeof triagem.parseDocumentIdentity === "function"
        ? (triagem.parseDocumentIdentity(record && record.document) || {}) : {};
    } catch (_) { return {}; }
  }
  function prepareLdRecord(record, triagem) {
    const identity = recordIdentity(record, triagem);
    return {
      id: [text(record && record.source), text(record && record.sheet), Number(record && record.row) || 0].join("::"),
      document: text(record && record.document),
      title: text(record && record.title),
      revision: text(record && record.revision),
      source: text(record && record.source),
      sheet: text(record && record.sheet),
      row: Number(record && record.row) || 0,
      discipline: text(record && record.discipline),
      documentType: text(record && record.documentType),
      tag: text(record && record.tag) || text(identity.tag),
      eap: headerValue(record, EAP_HEADERS) || text(identity.eap),
      family: text(identity.family) || text(record && record.sheet),
      category: categoryLabel(record),
      categoryCode: text(identity.category) || categoryCodeFromDocument(record && record.document),
      taxonomy: headerValue(record, TAXONOMY_HEADERS),
      internalDocumentCode: headerValue(record, INTERNAL_CODE_HEADERS),
      raw: record,
    };
  }
  function scoreTitle(title, query) {
    const a = norm(title), b = norm(query);
    if (!a || !b) return 0;
    if (a === b) return 1000;
    if (a.startsWith(b)) return 900 - Math.min(100, a.length - b.length);
    if (a.includes(b)) return 800 - Math.min(150, a.length - b.length);
    const at = tokens(a), bt = tokens(b);
    const matches = bt.filter((token) => at.some((candidate) => candidate === token || candidate.startsWith(token) || token.startsWith(candidate))).length;
    if (matches === bt.length) return 700 + matches;
    const ratio = bt.length ? matches / bt.length : 0;
    return ratio >= .6 ? Math.round(500 * ratio) : 0;
  }
  function searchByTitle(records, query, limit) {
    const q = text(query);
    if (q.length < 2) return [];
    return (records || []).map((record) => ({ record, score: scoreTitle(record.title, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title, "pt-BR"))
      .slice(0, Math.max(1, Number(limit) || 20));
  }
  function validRevision(value) {
    const rev = text(value).toUpperCase().replace(/^REV\.?\s*/, "");
    return rev === "0" || /^[A-HJ-NP-Z]{1,3}(?:\d+)?$/.test(rev);
  }
  function normalizeRevision(value) { return text(value).toUpperCase().replace(/^REV\.?\s*/, ""); }
  function n1710Structure(value) {
    const code = text(value).toUpperCase();
    const match = code.match(/^(?:([A-Z])-)?([A-Z0-9]{2,3})-([A-Z0-9]{4}\.[A-Z0-9]{2})-([A-Z0-9]{4,5})-([A-Z0-9]{3})-([A-Z0-9]{3})-([A-Z0-9]{3,4})$/);
    return match ? { valid: true, language: match[1] || "", category: match[2], installation: match[3], area: match[4], serviceClass: match[5], origin: match[6], sequence: match[7] } : { valid: false };
  }
  function coverDataFromRecord(record, overrides) {
    const o = overrides || {};
    const revision = normalizeRevision(o.revision !== undefined ? o.revision : record && record.revision);
    return {
      ...PROJECT_DEFAULTS,
      documentCategory: text(o.documentCategory !== undefined ? o.documentCategory : record && record.category) || categoryCodeFromDocument(record && record.document),
      documentNumber: text(o.documentNumber !== undefined ? o.documentNumber : record && record.document),
      title: text(o.title !== undefined ? o.title : record && record.title),
      internalDocumentCode: text(o.internalDocumentCode !== undefined ? o.internalDocumentCode : record && record.internalDocumentCode),
      taxonomy: text(o.taxonomy !== undefined ? o.taxonomy : record && record.taxonomy),
      revision,
      revisionDescription: text(o.revisionDescription) || (revision === "0" ? "EMISSÃO ORIGINAL" : ""),
      revisionDate: text(o.revisionDate) || new Date().toLocaleDateString("pt-BR"),
      executor: text(o.executor) || PROJECT_DEFAULTS.executor,
      checker: text(o.checker) || PROJECT_DEFAULTS.checker,
      approver: text(o.approver) || PROJECT_DEFAULTS.approver,
      eap: text(record && record.eap),
      discipline: text(record && record.discipline),
      tag: text(record && record.tag),
      family: text(record && record.family),
      source: text(record && record.source),
      sheet: text(record && record.sheet),
      row: Number(record && record.row) || 0,
    };
  }
  function validateCoverData(data, options) {
    const settings = options || {}, errors = [], warnings = [], info = [];
    if (!text(data && data.title)) errors.push("Título obrigatório.");
    if (!text(data && data.documentNumber)) errors.push("Código/número do documento obrigatório.");
    if (!validRevision(data && data.revision)) errors.push("Revisão inválida conforme a sequência adotada pela N-2064.");
    if (!text(data && data.revisionDate)) errors.push("Data da emissão/revisão obrigatória.");
    if (!text(data && data.documentCategory)) warnings.push("Categoria documental não identificada; confira antes de gerar.");
    if (!text(data && data.taxonomy)) warnings.push("Taxonomia não informada na linha selecionada da LD.");
    if (!text(data && data.internalDocumentCode)) warnings.push("Código interno da contratada não informado na LD/template.");
    if (settings.requireSource && !settings.hasSource) errors.push("Anexe o documento de origem.");
    if (settings.selectedRecord && text(data && data.title) !== text(settings.selectedRecord.title)) warnings.push("Título alterado manualmente em relação à LD.");
    if (settings.selectedRecord && text(data && data.documentNumber) !== text(settings.selectedRecord.document)) warnings.push("Código alterado manualmente em relação à LD.");
    const structure = n1710Structure(data && data.documentNumber);
    if (text(data && data.family).toUpperCase().includes("1710") && !structure.valid) warnings.push("O código não segue a estrutura básica reconhecida da N-1710; a LD foi preservada e requer conferência.");
    info.push("LD permanece a fonte da verdade; validações normativas não substituem silenciosamente seus valores.");
    return { errors, warnings, info, valid: errors.length === 0 };
  }
  function safeName(value) {
    return text(value).replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim();
  }
  function outputFileName(data, extension) {
    const ext = text(extension).replace(/^\./, "").toLowerCase() || "pdf";
    const title = safeName(data && data.title).slice(0, 90);
    const code = safeName(data && data.documentNumber) || "DOCUMENTO";
    const rev = safeName(normalizeRevision(data && data.revision) || "SEM_REV");
    return safeName(`${code} - ${title || "SEM TITULO"} - REV ${rev}`).slice(0, 180) + "." + ext;
  }

  return Object.freeze({
    PROJECT_DEFAULTS, CATEGORY_LABELS, text, norm, headerValue, categoryCodeFromDocument,
    prepareLdRecord, searchByTitle, validRevision, normalizeRevision, n1710Structure,
    coverDataFromRecord, validateCoverData, outputFileName,
  });
});