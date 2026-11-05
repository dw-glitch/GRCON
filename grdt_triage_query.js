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
    // Revisão fora de sequência: INVIOLÁVEL. Existe uma revisão anterior do mesmo
    // documento ainda não concluída no SIGEM; esta só entra depois dela.
    const sequence = row && row.revisionSequenceBlock ? row.revisionSequenceBlock : null;
    const autoAllowed = automaticStatusKinds.has(kind) && !allocation && !unresolved && !previousAnalysis && !sequence;
    return {
      status, kind, allocation, autoAllowed, unresolved, previousAnalysis,
      sequenceBlocked: Boolean(sequence),
      manualOnly: !autoAllowed,
      autoEligible: Boolean(row && row.decision === Core.READY && !row.hardBlock && autoAllowed),
      label: sequence ? `Aguarda a revisão ${sequence.revision}`
        : allocation === "not_allocated" ? "Não Alocado"
        : allocation === "conflict" ? "Conflito de alocação"
        : unresolved ? (/NAO (?:LOCALIZAD|ENCONTRAD)|NAO CONSTA/.test(norm(status)) || row?.documentLookup?.matched === false ? 'Não localizado' : 'Status não identificado')
        : previousAnalysis ? `Revisão ${row.blockingRevision} em análise`
        : kind === "analysis" ? "Em análise"
        : kind === "unknown" ? "Verificar status" : "Conferir status SIGEM",
    };
  }
  /**
   * Por que a linha está nesta situação (Bloqueado, Excluído, Não incluir, Conferir…).
   * Função pura: lê só o que a triagem já calculou e devolve { code, short, detail } ou null quando
   * a linha entra normalmente. A ordem é a mesma de decisionGroupKey/selectionPolicy: a primeira
   * causa que se aplica é a que manda.
   * contexto: { included, manual, compositionErrors }
   */
  function situationReason(row, context) {
    if (!row) return null;
    const ctx = context || {};
    const policy = selectionPolicy(row);
    const status = policy.status || "não informado";
    const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
    let found = null;
    if (row.revisionSequenceBlock) {
      found = { code: "sequence", short: `Aguarda a revisão ${row.revisionSequenceBlock.revision}`,
        detail: text(row.revisionSequenceBlock.message) || `A revisão ${row.revisionSequenceBlock.revision} ainda não foi concluída no SIGEM; esta só entra depois, em sequência.` };
    } else if (policy.allocation === "not_allocated") {
      found = { code: "not_allocated", short: "Não alocado na LD",
        detail: "A LD / base de alocação marca este documento como Não Alocado: não entra automaticamente na GRDT." };
    } else if (policy.allocation === "conflict") {
      found = { code: "allocation_conflict", short: "Conflito de alocação",
        detail: "A LD tem duas respostas de alocação para este documento. Confira e decida antes de incluir." };
    } else if (policy.unresolved) {
      const notFound = row.documentLookup && row.documentLookup.matched === false;
      found = { code: "status_unresolved", short: row.hardBlock && text(row.status) ? text(row.status) : policy.label,
        detail: row.hardBlock && text(row.reason) ? text(row.reason)
          : row.blockCode === "document_identity_mismatch" ? "O arquivo não corresponde ao código do documento."
          : notFound ? "O documento não foi localizado na Consulta Geral do SIGEM / LD, então não há status para decidir."
          : `O status SIGEM “${status}” não foi reconhecido pelo GRCON.` };
    } else if (policy.previousAnalysis) {
      found = { code: "previous_in_analysis", short: `Revisão ${row.blockingRevision} em análise`,
        detail: `A revisão ${row.blockingRevision} ainda está em análise no SIGEM; a revisão ${row.revision || "atual"} só deve ser enviada depois da conclusão.` };
    } else if (policy.kind === "analysis") {
      found = { code: "in_analysis", short: "Em análise no SIGEM",
        detail: "O documento está em análise no SIGEM; novo envio só em exceção operacional confirmada." };
    } else if (row.hardBlock) {
      found = { code: "triage_block", short: text(row.status) || "Alerta da triagem",
        detail: text(row.reason) || "A triagem encontrou um impedimento para incluir este documento." };
    } else if (row.decision === Core.DISCARD) {
      found = { code: "triage_discard", short: "Não será enviado novamente",
        detail: text(row.reason) || "A triagem indicou que não há o que enviar nesta revisão." };
    } else if (policy.manualOnly) {
      found = { code: "manual_only", short: `Status SIGEM: ${status}`,
        detail: `O status SIGEM “${status}” não permite inclusão automática. Marque o documento apenas para exceção operacional.` };
    } else if (ctx.compositionErrors && ctx.compositionErrors.length) {
      found = { code: "composition", short: "Arquivos fora da regra",
        detail: text(ctx.compositionErrors.join(" ")) };
    } else if (!ctx.included) {
      found = { code: "not_selected", short: "Não marcado para a GRDT",
        detail: "Nada impede a inclusão: o documento está desmarcado. Marque a caixa para incluí-lo." };
    }
    if (!found) return null;
    // Entrada manual: o impedimento continua valendo e precisa aparecer.
    if (ctx.included && ctx.manual) found = { ...found, short: `${found.short} · incluído manualmente` };
    // Sem impedimento e já incluído: não há o que explicar.
    if (ctx.included && !ctx.manual && found.code === "manual_only") return null;
    return found;
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
    // Nenhuma autorização manual libera uma revisão fora de sequência.
    if (policy.sequenceBlocked) return false;
    return !policy.manualOnly || Boolean(manualIndices && manualIndices.has(index) && manualStatusApprovalValid(row));
  }
  return Object.freeze({ origin, extensions, historyKind, matches, searchText,
    allocationAlert, unresolvedStatus, selectionPolicy, situationReason, manualStatusApprovalValid, selectionAuthorized });
});
