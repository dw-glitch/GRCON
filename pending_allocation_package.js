(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof module === "object" && module.exports ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPendingAllocationPackage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    if (C && C.norm) return C.norm(value);
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function allocationState(value) {
    return C && C.allocationState
      ? C.allocationState(value)
      : { kind: norm(value) === "NAO ALOCADO" ? "not_allocated" : "unknown" };
  }

  function safeArchiveName(value) {
    const raw = text(value || "");
    const clean = raw
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return clean || "arquivo";
  }

  function meaningfulAllocation(value) {
    const normalized = norm(value);
    return Boolean(normalized)
      && !new Set([
        "0", "-", "N/A", "NA", "NAO INFORMADO", "SEM ALOCACAO",
        "AGUARDANDO", "PENDENTE",
      ]).has(normalized);
  }

  function rejectionEvidence(row) {
    const item = row || {};
    const record = item.record || {};
    const stage = norm(record.allocationStage || item.allocationStage);
    const fiscal = norm(record.fiscalComment || item.fiscalComment);
    const rejection = /(?:RECUS|REJEIT|CANCEL|DEVOLVID|NAO ALOCAR|SEM ACEITE)/;
    if (rejection.test(stage)) return text(record.allocationStage || item.allocationStage);
    if (rejection.test(fiscal)) return text(record.fiscalComment || item.fiscalComment);
    return "";
  }

  function classify(row) {
    const item = row || {};
    const record = item.record || {};
    const allocationStatus = text(record.allocationStatus || item.allocationStatus);
    const state = allocationState(allocationStatus);
    const blockedByAllocation = state.kind === "not_allocated"
      || item.blockCode === "not_allocated"
      || item.blockCode === "not_allocated_conflict";
    const allocation = text(record.allocation || item.allocation);
    const rejected = rejectionEvidence(item);
    const physicalPdfs = (item.files || []).filter((entry) => (
      entry && entry.file && /\.pdf$/i.test(text(entry.name || entry.finalName))
    ));

    if (!blockedByAllocation) {
      return { eligible: false, code: "not_blocked_by_allocation", reason: "O documento não está bloqueado como Não Alocado.", physicalPdfs };
    }
    if (!meaningfulAllocation(allocation)) {
      return { eligible: false, code: "allocation_number_missing", reason: "Não há número real de alocação registrado.", physicalPdfs };
    }
    if (rejected) {
      return { eligible: false, code: "allocation_rejected", reason: `A alocação possui indicação de recusa, rejeição ou cancelamento: ${rejected}.`, physicalPdfs };
    }
    if (!physicalPdfs.length) {
      return { eligible: false, code: "physical_pdf_missing", reason: "O PDF físico não foi fornecido nesta análise.", physicalPdfs };
    }

    return {
      eligible: true,
      code: "awaiting_allocation_return",
      reason: "Há número de alocação registrado, mas a confirmação permanece Não Alocado e não existe indicação de recusa ou cancelamento.",
      allocation,
      allocationStatus,
      allocationStage: text(record.allocationStage || item.allocationStage),
      fiscalComment: text(record.fiscalComment || item.fiscalComment),
      ldVersion: text(record.ldVersion || item.ldVersion),
      physicalPdfs,
    };
  }

  function collect(results) {
    const rows = [];
    const entries = [];
    (results || []).forEach((row, rowIndex) => {
      const classification = classify(row);
      if (!classification.eligible) return;
      const discipline = text((row && row.record && row.record.discipline) || (row && row.egrdt && row.egrdt.discipline));
      const result = {
        rowIndex,
        document: text(row && row.document),
        revision: text(row && row.revision),
        discipline,
        allocation: classification.allocation,
        allocationStatus: classification.allocationStatus,
        allocationStage: classification.allocationStage,
        fiscalComment: classification.fiscalComment,
        ldVersion: classification.ldVersion,
        sheet: text(row && (row.sheet || row.record && row.record.sheet)),
        ldRow: Number(row && row.record && row.record.row) || 0,
      };
      rows.push(result);
      classification.physicalPdfs.forEach((source, sourceIndex) => entries.push({
        ...result,
        sourceIndex,
        file: source.file,
        originalName: text(source.name),
        finalName: text(source.finalName || row && row.finalName || source.name),
        relativePath: text(source.relativePath || source.name),
      }));
    });
    return {
      rows,
      entries,
      documentCount: rows.length,
      pdfCount: entries.length,
    };
  }

  return Object.freeze({
    meaningfulAllocation,
    rejectionEvidence,
    classify,
    collect,
  });
});
