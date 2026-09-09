(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.TriagemCore || safeRequire("./core.js"), root.GrconProjectWiseInventory || safeRequire("./projectwise_inventory_core.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconProjectWiseReconciliation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, Inventory) {
  "use strict";

  const STATUSES = Object.freeze({
    SAME_REVISION: "MESMA_REVISAO",
    PW_OLDER: "REVISAO_PROJECTWISE_DESATUALIZADA",
    PW_NEWER: "PROJECTWISE_COM_REVISAO_SUPERIOR",
    NOT_FOUND: "NAO_ENCONTRADO_PROJECTWISE",
    POSSIBLE_DUPLICATE: "POSSIVEL_DUPLICIDADE",
    DOUBTFUL: "ASSOCIACAO_DUVIDOSA",
    INVALID_CODE: "CODIFICACAO_IRREGULAR",
  });

  const ACTIONS = Object.freeze({
    NONE: "NENHUMA",
    NEW_DOCUMENT: "NOVA_POSTAGEM",
    NEW_REVISION: "NOVA_REVISAO",
    MANUAL_REVIEW: "VALIDACAO_HUMANA",
  });

  function text(value) { return String(value == null ? "" : value).trim(); }
  function norm(value) {
    if (Inventory?.norm) return Inventory.norm(value);
    if (Core?.key) return Core.key(value);
    return text(value).toUpperCase().replace(/\s+/g, "");
  }
  function normalizeRevision(value) {
    if (Core?.normalizeRevision) return Core.normalizeRevision(value);
    return text(value).toUpperCase().replace(/^REV(?:ISAO|ISÃO)?\.?\s*/, "").replace(/\s+/g, "");
  }
  function revisionRank(value) {
    if (Core?.revisionRank) return Core.revisionRank(value);
    const rev = normalizeRevision(value);
    if (rev === "0") return 0;
    if (/^\d+$/.test(rev)) return Number(rev);
    if (/^[A-Z]+$/.test(rev)) {
      let rank = 0;
      for (const c of rev) rank = rank * 26 + c.charCodeAt(0) - 64;
      return rank * 1000;
    }
    return -1;
  }
  function identity(document) {
    if (Core?.parseDocumentIdentity) {
      try { return Core.parseDocumentIdentity(document); } catch (_) { /* fallback */ }
    }
    return { family: "", eap: "", eapApplicable: false, eapValid: true, documentType: "", tagComparable: "" };
  }
  function searchKeys(document) {
    if (Core?.documentSearchKeys) {
      try { return [...new Set(Core.documentSearchKeys(document).map(norm).filter(Boolean))]; } catch (_) { /* fallback */ }
    }
    const k = norm(document);
    return k ? [k] : [];
  }
  function validateSigem(record) {
    const parsed = identity(record.document);
    const family = text(parsed.family || record.family);
    if (parsed.eapApplicable !== false && parsed.eapValid === false) {
      return { valid: false, parsed, reason: `Código com EAP irregular. A EAP deve conter quatro grupos numéricos completos; encontrado: ${text(parsed.eap) || "não identificado"}.` };
    }
    if (Core?.validateDocumentCode) {
      try {
        const result = Core.validateDocumentCode(record.document, family || undefined);
        if (result && result.valid === false) return { valid: false, parsed, reason: (result.errors || []).join(" ") || "Codificação documental inválida." };
      } catch (_) { /* regra EAP acima continua protegida */ }
    }
    return { valid: true, parsed, reason: "" };
  }

  function recordIdentity(record) {
    const source = text(record.sigemCode) || text(record.document);
    const parsed = identity(source);
    return {
      parsed,
      eap: text(record.eap) || text(parsed.eap),
      type: text(record.documentType) || text(parsed.documentType),
      tag: text(record.tagComparable) || text(parsed.tagComparable) || norm(record.tag),
    };
  }

  function pushMap(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  function buildPwIndex(records) {
    const index = { exact: new Map(), mapped: new Map(), composite: new Map(), all: Array.isArray(records) ? records : [] };
    index.all.forEach((record) => {
      [record.document].filter(Boolean).forEach((code) => searchKeys(code).forEach((key) => pushMap(index.exact, key, record)));
      if (record.sigemCode) searchKeys(record.sigemCode).forEach((key) => pushMap(index.mapped, key, record));
      const ri = recordIdentity(record);
      if (ri.eap && ri.type && ri.tag) pushMap(index.composite, `${norm(ri.eap)}::${norm(ri.type)}::${norm(ri.tag)}`, record);
    });
    return index;
  }

  function isCompatible(sigem, candidate) {
    const s = recordIdentity(sigem);
    const p = recordIdentity(candidate);
    if (s.parsed?.eapApplicable !== false && s.eap && p.eap && norm(s.eap) !== norm(p.eap)) {
      return { ok: false, reason: `Mesmo TAG/candidato localizado em outro EAP (${p.eap}); SIGEM usa ${s.eap}.` };
    }
    if (s.type && p.type && norm(s.type) !== norm(p.type)) {
      return { ok: false, reason: `Tipo documental divergente: SIGEM ${s.type} × ProjectWise ${p.type}.` };
    }
    if (s.tag && p.tag && norm(s.tag) !== norm(p.tag)) {
      return { ok: false, reason: `TAG divergente: SIGEM ${text(sigem.tag) || s.tag} × ProjectWise ${text(candidate.tag) || p.tag}.` };
    }
    return { ok: true, reason: "" };
  }

  function findCandidates(sigem, index) {
    const collected = [];
    const keys = searchKeys(sigem.document);
    keys.forEach((key) => {
      (index.mapped.get(key) || []).forEach((r) => collected.push({ record: r, source: "MAPEAMENTO_EXPLICITO" }));
      (index.exact.get(key) || []).forEach((r) => collected.push({ record: r, source: "CODIGO" }));
    });
    const s = recordIdentity(sigem);
    if (s.eap && s.type && s.tag) {
      const composite = `${norm(s.eap)}::${norm(s.type)}::${norm(s.tag)}`;
      (index.composite.get(composite) || []).forEach((r) => collected.push({ record: r, source: "EAP_TIPO_TAG" }));
    }

    const dedupe = new Map();
    const rejected = [];
    collected.forEach((entry) => {
      const compatible = isCompatible(sigem, entry.record);
      if (!compatible.ok) { rejected.push({ ...entry, reason: compatible.reason }); return; }
      const key = text(entry.record.inventoryId) || `${text(entry.record.id)}|${entry.record.sourceRow}`;
      const previous = dedupe.get(key);
      if (!previous || entry.source === "MAPEAMENTO_EXPLICITO") dedupe.set(key, entry);
    });
    return { candidates: [...dedupe.values()], rejected };
  }

  function entityKey(record) {
    if (text(record.id)) return `ID:${text(record.id)}`;
    return `PATH:${norm(record.folderPath)}|DOC:${norm(record.document)}`;
  }

  function latestCandidate(entries) {
    return [...entries].sort((a, b) => {
      const rank = revisionRank(b.record.revision) - revisionRank(a.record.revision);
      if (rank) return rank;
      return text(b.record.updatedAt).localeCompare(text(a.record.updatedAt));
    })[0] || null;
  }

  function baseRow(sigem) {
    const valid = validateSigem(sigem);
    const parsed = valid.parsed || {};
    return {
      sigemDocument: text(sigem.document),
      sigemRevision: normalizeRevision(sigem.revision),
      sigemStatus: text(sigem.status),
      title: text(sigem.title),
      discipline: text(sigem.discipline),
      area: text(sigem.area),
      eap: text(sigem.eap) || text(parsed.eap),
      tag: text(sigem.tag) || text(parsed.tag || parsed.tagRaw || parsed.tagComparable),
      documentType: text(sigem.documentType) || text(parsed.documentType),
      family: text(sigem.family) || text(parsed.family),
      sourceRow: sigem.sourceRow || 0,
      fileName: text(sigem.fileName),
      requestedDestination: text(sigem.destination),
      codeValid: valid.valid,
      codeIssue: valid.reason,
    };
  }

  function reconcileOne(sigem, index, options) {
    const row = baseRow(sigem);
    const liveWriteEnabled = options?.liveWriteEnabled === true;
    if (!row.codeValid) {
      return {
        ...row, status: STATUSES.INVALID_CODE, action: ACTIONS.MANUAL_REVIEW, confidence: "BLOQUEADA",
        reason: row.codeIssue, pwDocument: "", pwRevision: "", pwId: "", pwPath: "", candidateCount: 0,
        automationEligible: false, automaticReady: false, blockers: ["CODIFICACAO_IRREGULAR"],
      };
    }
    const found = findCandidates(sigem, index);
    if (!found.candidates.length) {
      const blockers = [];
      if (!row.fileName) blockers.push("AGUARDANDO_ARQUIVO");
      if (!row.requestedDestination) blockers.push("DESTINO_NAO_DETERMINADO");
      if (!liveWriteEnabled) blockers.push("INTEGRACAO_PROJECTWISE_NAO_AUTORIZADA");
      return {
        ...row, status: STATUSES.NOT_FOUND, action: ACTIONS.NEW_DOCUMENT, confidence: "ALTA",
        reason: found.rejected.length ? `Nenhum candidato compatível. ${found.rejected[0].reason}` : "Documento não localizado no inventário ProjectWise.",
        pwDocument: "", pwRevision: "", pwId: "", pwPath: "", candidateCount: 0,
        automationEligible: true, automaticReady: blockers.length === 0, blockers,
      };
    }

    const entityGroups = new Map();
    found.candidates.forEach((entry) => pushMap(entityGroups, entityKey(entry.record), entry));
    if (entityGroups.size > 1) {
      const sample = found.candidates.slice(0, 3).map((e) => `${text(e.record.document)} @ ${text(e.record.folderPath) || "pasta não informada"}`).join("; ");
      return {
        ...row, status: STATUSES.POSSIBLE_DUPLICATE, action: ACTIONS.MANUAL_REVIEW, confidence: "BLOQUEADA",
        reason: `Foram encontrados ${entityGroups.size} registros físicos/documentais distintos no ProjectWise: ${sample}.`,
        pwDocument: "", pwRevision: "", pwId: "", pwPath: "", candidateCount: found.candidates.length,
        automationEligible: false, automaticReady: false, blockers: ["POSSIVEL_DUPLICIDADE"],
      };
    }

    const selected = latestCandidate(found.candidates);
    const pw = selected.record;
    const sigemRev = normalizeRevision(row.sigemRevision);
    const pwRev = normalizeRevision(pw.revision);
    const common = {
      ...row,
      pwDocument: text(pw.document),
      pwRevision: pwRev,
      pwId: text(pw.id),
      pwPath: text(pw.folderPath),
      pwFileName: text(pw.fileName),
      pwTitle: text(pw.title),
      pwTaxonomy: text(pw.taxonomy),
      pwDiscipline: text(pw.discipline),
      pwArea: text(pw.area),
      pwState: text(pw.state),
      matchSource: selected.source,
      candidateCount: found.candidates.length,
    };

    if (!sigemRev || !pwRev) {
      return {
        ...common, status: STATUSES.DOUBTFUL, action: ACTIONS.MANUAL_REVIEW, confidence: "MEDIA",
        reason: `Não foi possível comparar revisão com segurança (SIGEM: ${sigemRev || "vazia"}; ProjectWise: ${pwRev || "vazia"}).`,
        automationEligible: false, automaticReady: false, blockers: ["REVISAO_NAO_DETERMINADA"],
      };
    }
    if (sigemRev === pwRev) {
      return {
        ...common, status: STATUSES.SAME_REVISION, action: ACTIONS.NONE, confidence: "ALTA",
        reason: "Documento localizado no ProjectWise com a mesma revisão do SIGEM.",
        automationEligible: false, automaticReady: false, blockers: [],
      };
    }
    const sRank = revisionRank(sigemRev);
    const pRank = revisionRank(pwRev);
    if (sRank >= 0 && pRank >= 0 && pRank < sRank) {
      const blockers = [];
      if (!row.fileName) blockers.push("AGUARDANDO_ARQUIVO");
      if (!pw.folderPath) blockers.push("DESTINO_NAO_DETERMINADO");
      if (!liveWriteEnabled) blockers.push("INTEGRACAO_PROJECTWISE_NAO_AUTORIZADA");
      return {
        ...common, status: STATUSES.PW_OLDER, action: ACTIONS.NEW_REVISION, confidence: "ALTA",
        reason: `ProjectWise possui revisão ${pwRev}; SIGEM possui revisão ${sigemRev}. Preparar nova revisão, sem substituir silenciosamente a existente.`,
        automationEligible: true, automaticReady: blockers.length === 0, blockers,
      };
    }
    if (sRank >= 0 && pRank >= 0 && pRank > sRank) {
      return {
        ...common, status: STATUSES.PW_NEWER, action: ACTIONS.MANUAL_REVIEW, confidence: "BLOQUEADA",
        reason: `ProjectWise possui revisão ${pwRev}, superior à revisão ${sigemRev} da Consulta Geral. Bloqueado para evitar regressão.`,
        automationEligible: false, automaticReady: false, blockers: ["PROJECTWISE_REVISAO_SUPERIOR"],
      };
    }
    return {
      ...common, status: STATUSES.DOUBTFUL, action: ACTIONS.MANUAL_REVIEW, confidence: "MEDIA",
      reason: `Revisões não puderam ser ordenadas com segurança: SIGEM ${sigemRev} × ProjectWise ${pwRev}.`,
      automationEligible: false, automaticReady: false, blockers: ["ORDEM_REVISAO_INDETERMINADA"],
    };
  }

  function summarize(rows) {
    const total = rows.length;
    const count = (status) => rows.filter((r) => r.status === status).length;
    const found = rows.filter((r) => ![STATUSES.NOT_FOUND, STATUSES.INVALID_CODE].includes(r.status)).length;
    const pwOlder = count(STATUSES.PW_OLDER);
    const pwNewer = count(STATUSES.PW_NEWER);
    return {
      totalSigem: total,
      foundProjectWise: found,
      notFound: count(STATUSES.NOT_FOUND),
      sameRevision: count(STATUSES.SAME_REVISION),
      revisionDifferent: pwOlder + pwNewer,
      pwOlder, pwNewer,
      duplicates: count(STATUSES.POSSIBLE_DUPLICATE),
      doubtful: count(STATUSES.DOUBTFUL),
      invalidCode: count(STATUSES.INVALID_CODE),
      eligibleIdentity: rows.filter((r) => r.automationEligible).length,
      automaticReady: rows.filter((r) => r.automaticReady).length,
      manualValidation: rows.filter((r) => r.action === ACTIONS.MANUAL_REVIEW).length,
      reconciliationRate: total ? Math.round((count(STATUSES.SAME_REVISION) / total) * 10000) / 100 : 0,
    };
  }

  function reconcile(sigemRecords, pwRecords, options) {
    const index = buildPwIndex(pwRecords);
    const rows = (sigemRecords || []).map((record) => reconcileOne(record, index, options));
    return {
      rows, summary: summarize(rows), generatedAt: new Date().toISOString(),
      mode: options?.liveWriteEnabled ? "LIVE_CAPABLE" : "READ_ONLY",
      writeEnabled: options?.liveWriteEnabled === true,
    };
  }

  function dryRun(rows) {
    return (rows || []).filter((row) => [ACTIONS.NEW_DOCUMENT, ACTIONS.NEW_REVISION].includes(row.action)).map((row, index) => ({
      sequence: index + 1,
      document: row.sigemDocument,
      revision: row.sigemRevision,
      operation: row.action,
      file: row.fileName || "",
      destination: row.pwPath || row.requestedDestination || "",
      projectWiseId: row.pwId || "",
      metadata: {
        title: row.title || "", discipline: row.discipline || "", area: row.area || "", eap: row.eap || "",
        tag: row.tag || "", documentType: row.documentType || "",
      },
      executable: row.automaticReady === true,
      blockers: [...(row.blockers || [])],
      note: row.automaticReady ? "Apto pelos controles atuais." : `Simulação apenas: ${(row.blockers || []).join(", ") || "escrita não habilitada"}.`,
    }));
  }

  function filterRows(rows, filters) {
    const f = filters || {};
    const query = norm(f.query);
    const codes = new Set((f.codes || []).map(norm).filter(Boolean));
    return (rows || []).filter((row) => {
      if (f.status && row.status !== f.status) return false;
      if (f.discipline && norm(row.discipline) !== norm(f.discipline)) return false;
      if (f.documentType && norm(row.documentType) !== norm(f.documentType)) return false;
      if (codes.size && !codes.has(norm(row.sigemDocument))) return false;
      if (query) {
        const hay = norm([row.sigemDocument, row.pwDocument, row.title, row.eap, row.tag, row.discipline, row.pwPath, row.reason].join(" "));
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  return Object.freeze({
    STATUSES, ACTIONS, normalizeRevision, revisionRank, buildPwIndex, findCandidates, reconcileOne, reconcile, summarize, dryRun, filterRows,
  });
});