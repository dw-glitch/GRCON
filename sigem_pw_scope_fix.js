(function (root, factory) {
  const base = root.GrconSigemPwDashboard || (typeof require === "function" ? require("./sigem_pw_dashboard_core.js") : null);
  const api = factory(base);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwDashboard = api;
  root.GrconSigemPwScopeFix = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Base) {
  "use strict";

  if (!Base) throw new Error("Core do Dashboard SIGEM × PW indisponível para aplicar o filtro de escopo.");

  const SCOPE_VERSION = 4;
  const SCOPE_LABEL = "GRCON N-1710 · 5290.00 / 22313 / C1O";
  const N1710_SCOPE_RE = /^(?:[IAFLED]-)?[A-Z0-9]{2,3}-5290\.00-22313-[A-Z0-9]{3}-C1O-\d{3,4}$/i;
  const VALID_CLASSES = new Set(Base.SCOPE_CLASSES || Base.DOCUMENT_CLASSES || ["ET", "N-1710"]);

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

  function metadataFor(meta, records, audit) {
    const { scopeDiscardedRecords: _discardedRecords, scopeExcludedReasons: _excludedReasons, scopeExcludedExamples: _excludedExamples, ...previous } = meta || {};
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
      scopeExcludedCount: audit.excludedCount,
      recordCount: records.length,
      uniqueDocumentCount: uniqueDocuments.size,
      emittedDocumentCount: emittedDocuments.size,
      duplicateRevisionCount,
    };
  }

  function sanitizePwBase(base, ldBaseOrRecords) {
    if (!base || !base.meta || !Array.isArray(base.records)) return { meta: null, records: [] };
    if (typeof Base.sanitizePwBase === "function") return Base.sanitizePwBase(base, ldBaseOrRecords || []);
    const audit = scopeAudit(base.records);
    return { meta: metadataFor(base.meta, audit.accepted, audit), records: audit.accepted };
  }

  function parsePwCsv(source, fileMeta) {
    return Base.parsePwCsv(source, fileMeta);
  }

  function normalizeSigemRecords(records) {
    return (records || [])
      .map((record) => normalizeRecord(record, "sigem"))
      .filter((record) => record.documentKey && VALID_CLASSES.has(record.documentClass));
  }

  function createModel(sigemRecords, pwRecords, ldRecords) {
    if (arguments.length >= 3 && typeof Base.createModel === "function") return Base.createModel(sigemRecords || [], pwRecords || [], ldRecords || []);
    const normalizedSigem = normalizeSigemRecords(sigemRecords || []);
    const pwAudit = scopeAudit(pwRecords || []);
    const normalizedPw = pwAudit.accepted;
    // O caminho legado de dois argumentos ainda é usado por integrações de
    // escopo. Ele precisa expor as duas visões do mesmo conjunto:
    // - *Entries: identidade código + revisão, usada em contagens/comparação;
    // - *All: identidade documental consolidada, usada pela análise histórica
    //   de revisões. Sem os mapas de entradas, aggregateModel() cai no fallback
    //   documental e revisões 0/A/B do mesmo código viram apenas um item.
    const sigemEntries = Base.buildEntryMap(normalizedSigem, "sigem");
    const pwEntries = Base.buildEntryMap(normalizedPw, "pw");
    return {
      normalizedSigem,
      normalizedPw,
      sigemEntries,
      pwEntries,
      sigemAll: Base.buildDocumentMap(normalizedSigem, "sigem"),
      pwAll: Base.buildDocumentMap(normalizedPw, "pw"),
      scopeAudit: pwAudit,
    };
  }

  async function loadPwBase() {
    const [pw, ld] = await Promise.all([Base.loadPwBase(), Base.loadLdBase()]);
    return pw && pw.meta ? sanitizePwBase(pw, ld) : pw;
  }
  async function savePwBase(base, ldBaseOrRecords) { return Base.savePwBase(base, ldBaseOrRecords); }
  async function loadBases() { return Base.loadBases(); }

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
    saveLdAndReprocessPw: Base.saveLdAndReprocessPw,
    loadBases,
  });
});
