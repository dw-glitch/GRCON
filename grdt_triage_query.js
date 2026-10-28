/* Projeção operacional da triagem. Sem acesso ao banco ou alteração dos documentos. */
(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconGrdtTriageQuery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const norm = Core.norm;
  function origin(row) {
    return row.fileOrigin || (String(row.listSource || "").includes("Cofre") ? "Cofre" :
      row.files?.length ? "Pasta local" : "Relação sem arquivo físico");
  }
  function extensions(row) {
    return [...new Set((row.files?.length ? row.files : [{ name: row.name || row.virtualFileName || "" }])
      .map(file => String(file.name || "").match(/\.([^.\\/]+)$/)?.[1]?.toUpperCase()).filter(Boolean))];
  }
  function historyKind(result, status) {
    if (result?.latestEmission) return "issued";
    return status?.complete ? "never" : "unconfirmed";
  }
  function matches(row, filters, result, status) {
    if (filters.origin && norm(origin(row)) !== filters.origin) return false;
    if (filters.extension && !extensions(row).includes(filters.extension)) return false;
    const found = filters.revision ? Core.normalizeRevision(row.record?.revision) : "", selected = filters.revision ? Core.normalizeRevision(row.revision) : "";
    if (filters.revision === "changed" && (!found || !selected || found === selected)) return false;
    if (filters.revision === "divergent" && !row.revisionFormatWarning && !row.documentRevisionWarning &&
        !(found && selected && found !== selected)) return false;
    const history = filters.history;
    if (["issued", "never", "unconfirmed"].includes(history) && historyKind(result, status) !== history) return false;
    if (history === "new-revision" && result?.emissionKind !== "NEW_REVISION") return false;
    if (history === "repost" && result?.emissionKind !== "REPOST") return false;
    const known = filters.allocation && Boolean(String(row.record?.allocation || "").trim() || row.allocationFinding?.allocation);
    if (filters.allocation === "known" && !known) return false;
    if (filters.allocation === "unknown" && known) return false;
    return true;
  }
  function searchText(row, ldCode, historyNumbers) {
    return norm([row.record?.title, row.record?.allocation, row.name, ...(row.files || []).map(file => file.name),
      row.document, ldCode, row.revision, row.status, row.sheet, row.reason, row.allocationStatus,
      row.fiscalComment, row.grdt, row.record?.grdt, origin(row), ...extensions(row), historyNumbers].filter(Boolean).join(" "));
  }
  // Status do SIGEM e classificação de emissão são dimensões distintas:
  // READY/repostagem nunca transforma uma análise aberta em seleção automática.
  const automaticStatusKinds = new Set(["not_posted", "advance", "issued"]);
  // Precedência documental: uma não alocação na LD/base de alocação jamais
  // desaparece por causa do status SIGEM, mesmo durante uma análise aberta.
  function allocationAlert(row) {
    if (!row) return "";
    if (row.blockCode === "not_allocated_conflict" || row.allocationFinding?.kind === "conflict")
      return "conflict";
    if (row.blockCode === "not_allocated" || row.allocationFinding?.kind === "not_allocated")
      return "not_allocated";
    const source = row.allocationStatus || row.record?.allocationStatus || "";
    return Core.allocationState(source).kind === "not_allocated" ? "not_allocated" : "";
  }
  function unresolvedStatus(row) {
    if (!row) return false;
    const status=String(row.status || row.sigemStatus || row.statusOperational || '').trim();
    return row.documentLookup?.matched === false || row.blockCode === 'document_identity_mismatch'
      || Core.statusKind(status) === 'unknown';
  }
  function selectionPolicy(row) {
    const status = String(row && (row.status || row.sigemStatus || row.statusOperational) || "").trim();
    const kind = Core.statusKind(status);
    const allocation = allocationAlert(row);
    const unresolved = unresolvedStatus(row);
    const previousAnalysis = Boolean(row?.blockingRevision);
    const autoAllowed = automaticStatusKinds.has(kind) && !allocation && !unresolved && !previousAnalysis;
    return {
      status, kind, allocation, autoAllowed, unresolved, previousAnalysis,
      manualOnly: !autoAllowed,
      autoEligible: Boolean(row && row.decision === Core.READY && !row.hardBlock && autoAllowed),
      label: allocation === "not_allocated" ? "Não Alocado"
        : allocation === "conflict" ? "Conflito de alocação"
        : unresolved ? (/NAO (?:LOCALIZAD|ENCONTRAD)|NAO CONSTA/.test(norm(status)) || row?.documentLookup?.matched === false ? 'Não localizado' : 'Status não identificado')
        : previousAnalysis ? `Revisão ${row.blockingRevision} em análise — não incluir automaticamente`
        : kind === "analysis" ? "Em análise"
        : kind === "unknown" ? "Verificar status" : "Conferir status SIGEM",
    };
  }
  function manualStatusApprovalValid(row) {
    const policy = selectionPolicy(row);
    if (!policy.manualOnly) return true;
    const approval = row && row.manualSigemSelection;
    return Boolean(approval
      && approval.kind === policy.kind
      && approval.revision === Core.normalizeRevision(row.revision)
      && (approval.blockingRevision || "") === (row.blockingRevision || "")
      && approval.statusKey === Core.normalizeSigemStatus(policy.status).key);
  }
  function selectionAuthorized(row, index, selectedIndices, manualIndices) {
    if (!row || !selectedIndices || !selectedIndices.has(index)) return false;
    const policy = selectionPolicy(row);
    return !policy.manualOnly || Boolean(manualIndices && manualIndices.has(index) && manualStatusApprovalValid(row));
  }
  return Object.freeze({ origin, extensions, historyKind, matches, searchText,
    allocationAlert, unresolvedStatus, selectionPolicy, manualStatusApprovalValid, selectionAuthorized });
});
