(function (root, factory) {
  const C = root.TriagemCore || (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(C);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LDConflictCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  const FIELD_DEFS = Object.freeze([
    { key: "revision", label: "Revisão", read: (record) => record && record.revision },
    { key: "status", label: "Status SIGEM", read: (record, kind) => kind === "history" ? record && (record.sigemStatus || record.status) : record && record.sigemStatus },
    { key: "grdt", label: "GRDT", read: (record) => record && record.grdt },
    { key: "effectiveDate", label: "Data efetiva", read: (record) => record && record.effectiveDate },
    { key: "title", label: "Título", read: (record) => record && record.title },
    { key: "allocationStatus", label: "Situação de alocação", read: (record) => record && record.allocationStatus },
    { key: "allocation", label: "Alocação", read: (record) => record && record.allocation },
    { key: "databook", label: "Caminho Databook", read: (record) => record && record.databook },
  ]);

  // Somente divergências capazes de alterar a decisão de postagem bloqueiam a análise.
  // Título, número de alocação e caminho Databook podem mudar ao longo do histórico;
  // nesses casos o GRCON usa a linha controlada mais recente e registra apenas uma observação.
  // Na linha técnica, somente uma divergência real de situação de alocação
  // pode interromper a postagem. Status SIGEM oficial vem da aba Colar SIGEM.
  // Título, GRDT, data, número de alocação e Databook são tratados como histórico
  // informativo e nunca, isoladamente, enviam o documento para Revisar.
  const TECHNICAL_BLOCKING_FIELDS = new Set(["allocationStatus"]);
  const HISTORY_BLOCKING_FIELDS = new Set(["status", "grdt", "effectiveDate"]);
  const TECHNICAL_NOTICE_FIELDS = new Set(["status", "grdt", "effectiveDate", "title", "allocation", "databook"]);

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    if (C && C.norm) return C.norm(value);
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  }

  function revision(value) {
    return C && C.normalizeRevision ? C.normalizeRevision(value) : norm(value).replace(/^(?:REV(?:ISAO)?)[ .:_-]*/i, "");
  }

  function sourceKind(record, fallback) {
    return record && record._ldSourceKind || fallback || "technical";
  }

  function recordId(record, kind) {
    const item = record || {};
    return [sourceKind(item, kind), text(item.source), text(item.sheet), Number(item.row) || 0, revision(item.revision)].join("::");
  }

  function location(record, kind) {
    const item = record || {};
    return {
      id: recordId(item, kind),
      kind: sourceKind(item, kind),
      source: text(item.source),
      sheet: text(item.sheet) || "LD",
      row: Number(item.row) || 0,
      revision: revision(item.revision),
      label: `${text(item.sheet) || "LD"}${item.row ? ` · linha ${item.row}` : ""}`,
      record: item,
    };
  }

  function decorated(records, kind) {
    return (records || []).map((record) => ({ record, kind, id: recordId(record, kind) }));
  }

  /**
   * Separa as linhas que respondem pelo documento das que já foram
   * substituídas — LD anterior aberta na mesma sessão, aba oculta da mesma LD.
   * Só as vigentes são comparadas entre si: duas LDs para o mesmo documento são
   * repetição, não conflito, e anunciar conflito ali mandava procurar na
   * planilha uma segunda linha que não existe.
   */
  function currencyScope(entries) {
    const list = entries || [];
    const partition = C && C.ldCurrencyPartition ? C.ldCurrencyPartition(list.map((entry) => entry.record)) : null;
    const sourcesOf = (items) => [...new Set(items.map((entry) => text(entry.record && entry.record.source)).filter(Boolean))];
    if (!partition || !partition.superseded.length) {
      return { current: list, superseded: [], currentSources: sourcesOf(list), supersededSources: [], hiddenSuperseded: false };
    }
    const superseded = new Set(partition.superseded);
    return {
      current: list.filter((entry) => !superseded.has(entry.record)),
      superseded: list.filter((entry) => superseded.has(entry.record)),
      currentSources: partition.currentSources,
      supersededSources: partition.supersededSources,
      hiddenSuperseded: partition.hiddenSuperseded,
    };
  }

  /** Arquivo · aba · linha, para a pessoa reabrir a LD e conferir o que foi lido. */
  function locatedLabel(record) {
    const item = record || {};
    return [text(item.source), text(item.sheet) || "LD", item.row ? `linha ${item.row}` : ""].filter(Boolean).join(" · ");
  }

  function describeDifference(difference, labels) {
    const parts = (difference.values || []).map((value) => {
      const where = (value.records || []).map((id) => labels.get(id)).filter(Boolean);
      return `“${value.value}”${where.length ? ` (${where.join("; ")})` : ""}`;
    });
    return `${difference.label}: ${parts.join(" × ")}`;
  }

  function normalizedFieldValue(definition, raw) {
    if (!raw) return "";
    if (definition.key === "revision") return revision(raw);
    if (definition.key === "allocationStatus" && C && C.allocationState) {
      const state = C.allocationState(raw);
      return state.kind === "unknown" ? `UNKNOWN:${norm(raw)}` : state.kind;
    }
    if (definition.key === "effectiveDate" && C && C.parseDate) {
      const date = C.parseDate(raw);
      if (date && !Number.isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      }
    }
    return norm(raw);
  }

  function fieldValue(entry, definition) {
    const raw = text(definition.read(entry.record, entry.kind));
    return { raw, normalized: normalizedFieldValue(definition, raw) };
  }

  function collectDifference(entries, definition, scope) {
    const values = new Map();
    entries.forEach((entry) => {
      const value = fieldValue(entry, definition);
      if (!value.raw || !value.normalized) return;
      if (!values.has(value.normalized)) values.set(value.normalized, { value: value.raw, records: [] });
      values.get(value.normalized).records.push(entry.id);
    });
    if (values.size < 2) return null;
    return {
      field: definition.key,
      label: definition.label,
      scope,
      values: [...values.values()],
    };
  }

  function addDifferences(target, seen, entries, definitions, scope) {
    definitions.forEach((definition) => {
      const difference = collectDifference(entries, definition, scope);
      if (!difference) return;
      const signature = `${scope}|${difference.field}|${difference.values.map((item) => normalizedFieldValue(definition, item.value)).sort().join("|")}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      target.push(difference);
    });
  }

  function groupByRevision(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
      const key = revision(entry.record && entry.record.revision) || "SEM REVISAO";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    return groups;
  }

  function meaningfulOperationalValue(value) {
    const normalized = norm(value);
    return Boolean(normalized) && !new Set(["0", "N/A", "NA", "-", "SEM ALOCACAO", "NAO INFORMADO"]).has(normalized);
  }

  function acceptedEvidence(record) {
    const item = record || {};
    const comment = norm(item.fiscalComment);
    const stage = norm(item.allocationStage);
    return /(?:ACEITO|APROVADO|CONCLUID|SEM COMENTARIO|^OK$)/.test(comment)
      || /(?:CONCLUID|ACEIT|APROVAD)/.test(stage);
  }

  function rejectionEvidence(record) {
    const item = record || {};
    const comment = norm(item.fiscalComment);
    const stage = norm(item.allocationStage);
    return /(?:RECUS|REJEIT|CANCELAD|NAO ALOCAR|DEVOLVID)/.test(comment)
      || /(?:RECUS|REJEIT|CANCELAD)/.test(stage);
  }

  function ldVersionRank(value) {
    const normalized = norm(value);
    if (!normalized || normalized.includes("PRIMEIRAS VERS")) return 0;
    const match = normalized.match(/^([A-Z]+)\s*0*(\d+)$/);
    if (!match) return 1;
    let prefix = 0;
    for (const letter of match[1]) prefix = prefix * 26 + letter.charCodeAt(0) - 64;
    return prefix * 100000 + Number(match[2]);
  }

  function technicalOrder(left, right) {
    const a = left && left.record || {};
    const b = right && right.record || {};
    const revisionDelta = (C && C.revisionRank ? C.revisionRank(b.revision) - C.revisionRank(a.revision) : 0);
    if (revisionDelta) return revisionDelta;
    const sourceDelta = (Number(b.sourceTimestamp) || 0) - (Number(a.sourceTimestamp) || 0);
    if (sourceDelta) return sourceDelta;
    const versionDelta = ldVersionRank(b.ldVersion) - ldVersionRank(a.ldVersion);
    if (versionDelta) return versionDelta;
    return (Number(b.row) || 0) - (Number(a.row) || 0);
  }

  function allocatedEvidenceOrder(left, right) {
    const a = left && left.record || {};
    const b = right && right.record || {};
    const numberDelta = Number(meaningfulOperationalValue(b.allocation)) - Number(meaningfulOperationalValue(a.allocation));
    if (numberDelta) return numberDelta;
    const acceptedDelta = Number(acceptedEvidence(b)) - Number(acceptedEvidence(a));
    if (acceptedDelta) return acceptedDelta;
    return technicalOrder(left, right);
  }

  function automaticAllocationResolution(entries, revisionValue) {
    // Segurança operacional: a presença de NÃO ALOCADO nunca pode ser
    // reconciliada automaticamente para ALOCADO.
    void entries;
    void revisionValue;
    return null;
  }

  function analyzeGroup(group, options) {
    const settings = options || {};
    const hint = norm(settings.hintedSheet);
    const technicalAll = decorated(group && group.records, "technical");
    const sameSheet = hint ? technicalAll.filter((entry) => C && C.sheetMatchesHint
      ? C.sheetMatchesHint(entry.record && entry.record.sheet, hint)
      : norm(entry.record && entry.record.sheet) === hint) : [];
    const technicalScoped = sameSheet.length ? sameSheet : technicalAll;
    const historyScoped = decorated(group && group.history, "history");
    // A comparação acontece só entre linhas que ainda respondem pelo documento.
    const technicalCurrency = currencyScope(technicalScoped);
    const historyCurrency = currencyScope(historyScoped);
    const technical = technicalCurrency.current;
    const history = historyCurrency.current;
    const supersededEntries = [...technicalCurrency.superseded, ...historyCurrency.superseded];
    const supersededSources = [...new Set([...technicalCurrency.supersededSources, ...historyCurrency.supersededSources])];
    const currentSources = [...new Set([...technicalCurrency.currentSources, ...historyCurrency.currentSources])];
    const hiddenSuperseded = Boolean(technicalCurrency.hiddenSuperseded || historyCurrency.hiddenSuperseded);
    const differences = [];
    const notices = [];
    const duplicateAllocations = [];
    const automaticResolutions = [];
    const seenBlocking = new Set();
    const seenNotices = new Set();

    const technicalByRevision = groupByRevision(technical);
    technicalByRevision.forEach((entries, rev) => {
      if (entries.length < 2) return;
      const allocationDefinition = FIELD_DEFS.find((field) => field.key === "allocationStatus");
      const allocationDifference = allocationDefinition ? collectDifference(entries, allocationDefinition, `linhas técnicas · revisão ${rev}`) : null;
      if (allocationDifference) {
        const automatic = automaticAllocationResolution(entries, rev);
        if (automatic) {
          const notice = {
            ...allocationDifference,
            label: "Situação de alocação reconciliada",
            automatic: true,
          };
          const signature = `automatic|${rev}|${allocationDifference.values.map((item) => norm(item.value)).sort().join("|")}`;
          if (!seenNotices.has(signature)) {
            seenNotices.add(signature);
            notices.push(notice);
          }
          const baseState = C && C.allocationState ? C.allocationState(automatic.base.record && automatic.base.record.allocationStatus).kind : "unknown";
          if (baseState === "not_allocated") {
            duplicateAllocations.push({
              ...notice,
              selected: location(automatic.selected.record, automatic.selected.kind),
              base: location(automatic.base.record, automatic.base.kind),
              explanation: automatic.explanation,
            });
          }
          automaticResolutions.push({ ...automatic, baseState });
        } else {
          addDifferences(differences, seenBlocking, entries, [allocationDefinition], `linhas técnicas · revisão ${rev}`);
        }
      }
      addDifferences(
        notices,
        seenNotices,
        entries,
        FIELD_DEFS.filter((field) => TECHNICAL_NOTICE_FIELDS.has(field.key)),
        `histórico técnico · revisão ${rev}`,
      );
    });

    const historyByRevision = groupByRevision(history);
    historyByRevision.forEach((entries, rev) => {
      if (entries.length < 2) return;
      addDifferences(
        differences,
        seenBlocking,
        entries,
        FIELD_DEFS.filter((field) => HISTORY_BLOCKING_FIELDS.has(field.key)),
        `Colar SIGEM · revisão ${rev}`,
      );
    });

    const conflictingIds = new Set();
    differences.forEach((difference) => difference.values.forEach((value) => value.records.forEach((id) => conflictingIds.add(id))));
    const allEntries = [...technical, ...history];
    const candidates = allEntries.filter((entry) => conflictingIds.has(entry.id)).map((entry) => location(entry.record, entry.kind));
    const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
    const resolutionId = text(settings.resolutionId);
    const manualSelected = resolutionId ? uniqueCandidates.find((candidate) => candidate.id === resolutionId) || null : null;
    const automatic = !differences.length && automaticResolutions.length
      ? [...automaticResolutions].sort((left, right) => {
        const rank = (C && C.revisionRank ? C.revisionRank(right.revision) - C.revisionRank(left.revision) : 0);
        if (rank) return rank;
        return technicalOrder(left.base, right.base);
      })[0]
      : null;
    const automaticSelected = automatic ? location(automatic.selected.record, automatic.selected.kind) : null;
    const selected = manualSelected || automaticSelected;
    const base = automatic ? location(automatic.base.record, automatic.base.kind) : null;
    const fieldLabels = [...new Set(differences.map((difference) => difference.label))];
    const noticeLabels = [...new Set(notices.map((difference) => difference.label))];
    // O conflito precisa dizer arquivo, aba e linha de cada valor. Antes ele
    // dava só o nome do campo, e quem abria a LD não achava a segunda linha
    // que a triagem afirmava existir.
    const differenceLabels = new Map([...technicalScoped, ...historyScoped].map((entry) => [entry.id, locatedLabel(entry.record)]));
    const summary = !differences.length
      ? "Nenhum conflito bloqueante entre as linhas controladas."
      : `Valores incompatíveis na mesma revisão. ${differences.map((difference) => describeDifference(difference, differenceLabels)).join(". ")}.`;
    const automaticSummary = automatic
      ? automatic.baseState === "not_allocated"
        ? "Alocação reconciliada automaticamente: a mesma revisão já possui uma linha ALOCADO com número/aceite. A linha posterior NÃO ALOCADO, sem número e sem evidência de recusa, foi tratada como duplicidade; os demais dados continuam vindo da linha técnica mais recente."
        : "Alocação reconciliada automaticamente: a linha técnica mais recente está ALOCADO e possui número/aceite. Um registro antigo NÃO ALOCADO foi mantido apenas como histórico e não altera a decisão atual."
      : "";
    const historicalSummary = notices.some((item) => !item.automatic)
      ? `Aviso informativo: existem valores históricos diferentes em ${noticeLabels.filter((label) => label !== "Situação de alocação reconciliada").join(", ") || "campos informativos"}. A linha controlada mais recente será usada; isso não altera a decisão nem bloqueia a postagem.`
      : "";
    const currencySummary = C && C.ldCurrencyNote
      ? C.ldCurrencyNote({ currentSources, supersededSources, hiddenSuperseded })
      : "";
    const noticeSummary = [currencySummary, automaticSummary, historicalSummary].filter(Boolean).join(" ");

    return {
      hasConflict: differences.length > 0,
      hasNotice: notices.length > 0 || Boolean(currencySummary),
      blocked: differences.length > 0 && !manualSelected,
      resolved: Boolean(manualSelected || automaticSelected),
      resolutionId: selected ? selected.id : "",
      resolutionMode: manualSelected ? "manual" : automaticSelected ? "allocation-history" : "",
      selected,
      base,
      automaticResolution: automatic ? {
        revision: automatic.revision,
        selected: automaticSelected,
        base,
        explanation: automatic.explanation,
      } : null,
      differences,
      notices,
      duplicateAllocations,
      candidates: uniqueCandidates,
      fields: fieldLabels,
      noticeFields: noticeLabels,
      summary,
      noticeSummary,
      currencySummary,
      currentSources,
      supersededSources,
      hiddenSuperseded,
      superseded: supersededEntries.map((entry) => location(entry.record, entry.kind)),
    };
  }

  function applyResolution(group, analysis) {
    if (!analysis || !analysis.selected) return group || { records: [], history: [] };
    const selected = analysis.selected;
    const records = [...(group && group.records || [])];
    const history = [...(group && group.history || [])];
    if (selected.kind === "technical") {
      if (analysis.resolutionMode === "allocation-history" && analysis.base && analysis.base.record) {
        const evidence = selected.record || {};
        const base = analysis.base.record || evidence;
        const sameRecord = recordId(evidence, "technical") === recordId(base, "technical");
        const baseState = C && C.allocationState ? C.allocationState(base.allocationStatus).kind : "unknown";
        if (sameRecord || baseState === "allocated") {
          return { ...group, records: [evidence], history, _ldConflictResolution: selected.id };
        }
        const merged = {
          ...base,
          allocationStatus: text(evidence.allocationStatus),
          allocationStatusState: C && C.allocationState ? C.allocationState(evidence.allocationStatus) : evidence.allocationStatusState,
          allocation: text(evidence.allocation) || text(base.allocation),
          allocationStage: text(evidence.allocationStage) || text(base.allocationStage),
          fiscalComment: text(evidence.fiscalComment) || text(base.fiscalComment),
          allocationStatusHeader: text(evidence.allocationStatusHeader) || text(base.allocationStatusHeader),
          allocationStatusColumn: text(evidence.allocationStatusColumn) || text(base.allocationStatusColumn),
          allocationEvidence: {
            source: text(evidence.source),
            sheet: text(evidence.sheet),
            row: Number(evidence.row) || 0,
            revision: revision(evidence.revision),
            ldVersion: text(evidence.ldVersion),
            allocationStatus: text(evidence.allocationStatus),
            allocationStatusHeader: text(evidence.allocationStatusHeader),
            allocationStatusColumn: text(evidence.allocationStatusColumn),
            allocation: text(evidence.allocation),
            allocationStage: text(evidence.allocationStage),
            fiscalComment: text(evidence.fiscalComment),
          },
          allocationDuplicate: {
            source: text(base.source),
            sheet: text(base.sheet),
            row: Number(base.row) || 0,
            revision: revision(base.revision),
            ldVersion: text(base.ldVersion),
            allocationStatus: text(base.allocationStatus),
            allocation: text(base.allocation),
            allocationStage: text(base.allocationStage),
            fiscalComment: text(base.fiscalComment),
          },
          allocationResolution: "ALOCADO_POR_EVIDENCIA_DA_MESMA_REVISAO",
        };
        return { ...group, records: [merged], history, _ldConflictResolution: selected.id };
      }
      return { ...group, records: [selected.record], history, _ldConflictResolution: selected.id };
    }
    const selectedRevision = revision(selected.record && selected.record.revision);
    return {
      ...group,
      records,
      history: [...history.filter((record) => revision(record && record.revision) !== selectedRevision), selected.record],
      _ldConflictResolution: selected.id,
    };
  }

  function evidenceText(analysis) {
    if (!analysis || !analysis.hasConflict) return "";
    const differences = analysis.differences.map((difference) => {
      const values = difference.values.map((item) => item.value).join(" × ");
      return `${difference.label}: ${values}`;
    }).join("; ");
    const sources = analysis.candidates.map((candidate) => candidate.label).join("; ");
    return `${differences}${sources ? `. Fontes: ${sources}.` : "."}`;
  }

  function noticeText(analysis) {
    if (!analysis || !analysis.hasNotice) return "";
    const fields = (analysis.notices || []).map((difference) => {
      const values = difference.values.map((item) => item.value).join(" → ");
      return `${difference.label}: ${values} (${difference.scope})`;
    }).join("; ");
    return [text(analysis.currencySummary), fields].filter(Boolean).join(" ");
  }

  function consensusValue(group, field) {
    const definition = FIELD_DEFS.find((item) => item.key === field);
    if (!definition) return "";
    const entries = [...decorated(group && group.records, "technical"), ...decorated(group && group.history, "history")];
    const values = new Map();
    entries.forEach((entry) => {
      const found = fieldValue(entry, definition);
      if (found.raw && found.normalized && !values.has(found.normalized)) values.set(found.normalized, found.raw);
    });
    return values.size === 1 ? [...values.values()][0] : "";
  }

  return Object.freeze({
    FIELD_DEFS,
    text,
    norm,
    revision,
    recordId,
    location,
    currencyScope,
    analyzeGroup,
    applyResolution,
    evidenceText,
    noticeText,
    consensusValue,
  });
});
