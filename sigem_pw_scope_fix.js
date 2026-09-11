(function (root, factory) {
  const base = root.GrconSigemPwDashboard || (typeof require === "function" ? require("./sigem_pw_dashboard_core.js") : null);
  const api = factory(base);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwDashboard = api;
  root.GrconSigemPwScopeFix = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Base) {
  "use strict";

  if (!Base) throw new Error("Core do Dashboard SIGEM × PW indisponível para aplicar o filtro de escopo.");

  const SCOPE_VERSION = 3;
  const SCOPE_LABEL = "GRCON N-1710 · 5290.00 / 22313 / C1O";
  const N1710_SCOPE_RE = /^(?:[IAFLED]-)?[A-Z0-9]{2,3}-5290\.00-22313-[A-Z0-9]{3}-C1O-\d{3,4}$/i;
  const VALID_CLASSES = new Set(Base.DOCUMENT_CLASSES || ["ET", "N-1710", "CV"]);

  function text(value) { return Base.text ? Base.text(value) : String(value == null ? "" : value).trim(); }
  function norm(value) { return Base.norm ? Base.norm(value) : text(value).toUpperCase(); }
  function canonical(value) { return Base.canonicalDocumentCode ? Base.canonicalDocumentCode(value) : norm(value); }

  function n1710ScopeInfo(value) {
    const code = canonical(value);
    if (!code) return { eligible: false, code, reason: "codigo_vazio" };
    if (N1710_SCOPE_RE.test(code)) return { eligible: true, code, reason: "estrutura_grcon" };

    const groups = code.split("-");
    const hasLanguage = groups.length > 0 && /^[IAFLED]$/i.test(groups[0]);
    const offset = hasLanguage ? 1 : 0;
    const category = norm(groups[offset]);
    const installation = norm(groups[offset + 1]);
    const area = norm(groups[offset + 2]);
    const documentGroup = norm(groups[offset + 3]);
    const origin = norm(groups[offset + 4]);
    const sequence = norm(groups[offset + 5]);
    const n1710Like = code.includes("5290.00") || area === "22313" || origin === "C1O";

    if (!n1710Like) return { eligible: false, code, reason: "fora_das_familias_grcon" };
    if (!/^[A-Z0-9]{2,3}$/.test(category)) return { eligible: false, code, reason: "tipo_documental_fora_da_estrutura" };
    if (installation !== "5290.00") return { eligible: false, code, reason: "instalacao_diferente_5290_00" };
    if (area !== "22313") return { eligible: false, code, reason: "area_sistema_diferente_22313" };
    if (!/^[A-Z0-9]{3}$/.test(documentGroup)) return { eligible: false, code, reason: "grupo_documental_invalido" };
    if (origin !== "C1O") return { eligible: false, code, reason: "origem_diferente_c1o" };
    if (!/^\d{3,4}$/.test(sequence)) return { eligible: false, code, reason: "sequencial_invalido" };
    return { eligible: false, code, reason: "estrutura_n1710_invalida" };
  }

  function documentClass(value) {
    const identity = Base.documentIdentity(value);
    const info = identity.info;
    const code = identity.canonical;
    if ((info && info.family === "ET") || code.includes("_RNEST_")) return "ET";
    if ((info && info.family === "CV") || /^5900(?:\.\d+){3}-[A-Z0-9]{3}-CV-[A-Z0-9]+-\d{3,4}$/i.test(code)) return "CV";
    if (n1710ScopeInfo(code).eligible) return "N-1710";
    return Base.UNCLASSIFIED || "Não classificado";
  }

  function normalizeRecord(record, kind) {
    const item = record || {};
    const identity = Base.documentIdentity(item.document);
    const cls = documentClass(item.document);
    const emissionFlag = norm(item.lastEmission);
    return {
      ...item,
      documentKey: identity.key,
      canonicalDocument: identity.canonical,
      documentClass: cls,
      ...(kind === "pw" ? {
        emissionFlag,
        emittedEvidence: [Base.EMISSION_FLAGS.CURRENT, Base.EMISSION_FLAGS.HISTORICAL].includes(emissionFlag),
      } : {}),
    };
  }

  function rejectedRecord(record, reason) {
    const item = normalizeRecord(record, "pw");
    return {
      document: text(item.document),
      revision: text(item.revisionComplete || item.revision),
      documentType: text(item.documentType),
      documentTypeDesc: text(item.documentTypeDesc),
      discipline: text(item.discipline),
      disciplineDesc: text(item.disciplineDesc),
      state: text(item.state),
      lastEmission: text(item.lastEmission),
      fileName: text(item.fileName),
      category: text(item.category),
      sentGrd: text(item.sentGrd),
      sentDate: text(item.sentDate),
      incomingGrd: text(item.incomingGrd),
      incomingDate: text(item.incomingDate),
      createdAt: text(item.createdAt),
      stateChangedAt: text(item.stateChangedAt),
      emissionSequence: text(item.emissionSequence),
      sourceRow: Number(item.sourceRow) || 0,
      reason: text(reason) || "fora_do_escopo_grcon",
    };
  }

  function scopeAudit(records) {
    const accepted = [];
    const rejected = [];
    const reasons = {};
    (records || []).forEach((record) => {
      const normalized = normalizeRecord(record, "pw");
      if (normalized.documentKey && VALID_CLASSES.has(normalized.documentClass)) {
        accepted.push(normalized);
        return;
      }
      const scope = n1710ScopeInfo(record && record.document);
      const reason = scope.reason || "fora_do_escopo_grcon";
      reasons[reason] = (reasons[reason] || 0) + 1;
      rejected.push(rejectedRecord(record, reason));
    });
    return { accepted, rejected, reasons, excludedCount: Math.max(0, (records || []).length - accepted.length) };
  }

  function metadataFor(meta, records, audit, priorDiscarded) {
    const previous = meta || {};
    const priorExcluded = Number(previous.scopeExcludedCount) || 0;
    const alreadyScoped = Number(previous.scopeVersion) >= 2;
    const excludedCount = audit.excludedCount || (alreadyScoped ? priorExcluded : 0);
    const reasons = audit.excludedCount ? audit.reasons : (previous.scopeExcludedReasons || {});
    const priorFull = Array.isArray(previous.scopeDiscardedRecords) ? previous.scopeDiscardedRecords : (Array.isArray(priorDiscarded) ? priorDiscarded : []);
    const discardedRecords = audit.excludedCount ? audit.rejected : priorFull;
    const examples = discardedRecords.slice(0, 20);
    const previousInvalid = Number(previous.baseInvalidCount);
    const baseInvalidCount = Number.isFinite(previousInvalid)
      ? previousInvalid
      : Math.max(0, (Number(previous.invalidCount) || 0) - (alreadyScoped ? priorExcluded : 0));
    const uniqueDocuments = new Set(records.map((record) => record.documentKey).filter(Boolean));
    const emittedDocuments = new Set(records.filter((record) => record.emittedEvidence).map((record) => record.documentKey).filter(Boolean));
    const revisionSeen = new Set();
    let duplicateRevisionCount = 0;
    records.forEach((record) => {
      const key = `${record.documentKey}::${norm(record.revisionComplete || record.revision)}`;
      if (revisionSeen.has(key)) duplicateRevisionCount += 1;
      else revisionSeen.add(key);
    });
    return {
      ...previous,
      version: Math.max(Number(previous.version) || 0, SCOPE_VERSION),
      scopeVersion: SCOPE_VERSION,
      scopeLabel: SCOPE_LABEL,
      scopeRule: "[tipo variável]-5290.00-22313-[3 caracteres]-C1O-[sequencial 3/4 dígitos]",
      scopeAcceptedRecordCount: records.length,
      scopeExcludedCount: excludedCount,
      scopeExcludedReasons: reasons,
      scopeExcludedExamples: examples,
      scopeDiscardedRecords: discardedRecords,
      baseInvalidCount,
      invalidCount: baseInvalidCount + excludedCount,
      recordCount: records.length,
      uniqueDocumentCount: uniqueDocuments.size,
      emittedDocumentCount: emittedDocuments.size,
      duplicateRevisionCount,
    };
  }

  function sanitizePwBase(base) {
    if (!base || !base.meta || !Array.isArray(base.records)) return { meta: null, records: [] };
    const audit = scopeAudit(base.records);
    const priorDiscarded = Array.isArray(base.discardedRecords) ? base.discardedRecords : [];
    const meta = metadataFor(base.meta, audit.accepted, audit, priorDiscarded);
    return { meta, records: audit.accepted, discardedRecords: meta.scopeDiscardedRecords || [] };
  }

  function parsePwCsv(source, fileMeta) {
    const parsed = Base.parsePwCsv(source, fileMeta);
    const sanitized = sanitizePwBase({ meta: parsed.meta, records: parsed.records });
    return {
      ...parsed,
      records: sanitized.records,
      discardedRecords: sanitized.discardedRecords,
      meta: sanitized.meta,
      scopeAudit: sanitized.meta && {
        excludedCount: sanitized.meta.scopeExcludedCount,
        reasons: sanitized.meta.scopeExcludedReasons,
        examples: sanitized.meta.scopeExcludedExamples,
      },
    };
  }

  function normalizeSigemRecords(records) {
    return (records || [])
      .map((record) => normalizeRecord(record, "sigem"))
      .filter((record) => record.documentKey && VALID_CLASSES.has(record.documentClass));
  }

  function createModel(sigemRecords, pwRecords) {
    const normalizedSigem = normalizeSigemRecords(sigemRecords || []);
    const pwAudit = scopeAudit(pwRecords || []);
    const normalizedPw = pwAudit.accepted;
    return {
      normalizedSigem,
      normalizedPw,
      sigemAll: Base.buildDocumentMap(normalizedSigem, "sigem"),
      pwAll: Base.buildDocumentMap(normalizedPw, "pw"),
      scopeAudit: pwAudit,
    };
  }

  async function loadPwBase() { return sanitizePwBase(await Base.loadPwBase()); }
  async function savePwBase(base) { return Base.savePwBase(sanitizePwBase(base)); }
  async function loadBases() {
    const [sigem, pw] = await Promise.all([Base.loadSigemBase(), loadPwBase()]);
    return { sigem, pw };
  }

  return Object.freeze({
    ...Base,
    PW_BASE_VERSION: Math.max(Number(Base.PW_BASE_VERSION) || 0, SCOPE_VERSION),
    SCOPE_VERSION,
    SCOPE_LABEL,
    N1710_SCOPE_RE,
    n1710ScopeInfo,
    documentClass,
    scopeAudit,
    sanitizePwBase,
    parsePwCsv,
    normalizeSigemRecords,
    createModel,
    loadPwBase,
    savePwBase,
    loadBases,
  });
});
