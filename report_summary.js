(function (root, factory) {
  const C = root.TriagemCore || (typeof module === "object" && module.exports ? require("./core.js") : null);
  const Contracts = root.GrconContracts || (typeof module === "object" && module.exports ? require("./grcon_contracts.js") : null);
  const api = factory(C, Contracts);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconReportSummary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C, Contracts) {
  "use strict";

  const Large = typeof globalThis !== "undefined" ? globalThis.GrconLargeInput : null;
  const COLUMNS = Object.freeze([
    { header: "SITUAÇÃO GRCON", key: "decision", width: 24 },
    { header: "CÓDIGO INFORMADO / PDF", key: "requestedDocument", width: 42 },
    { header: "DOCUMENTO USADO PELO GRCON", key: "document", width: 42 },
    { header: "CÓDIGO DA LD", key: "ldCode", width: 45 },
    { header: "BUSCA NO APÊNDICE", key: "apendiceSearch", width: 34 },
    { header: "Tagueado sim ou não?", key: "tagged", width: 26 },
    { header: "CÓDIGO SUGERIDO PELO APÊNDICE (nt-)", key: "apendiceSuggestion", width: 52 },
    { header: "RESULTADO DA BUSCA COM/SEM nt- E TAG", key: "ntSearchResult", width: 42 },
    { header: "PESQUISADO SEM nt-", key: "searchedWithoutNt", width: 45 },
    { header: "PESQUISADO COM nt-", key: "searchedWithNt", width: 45 },
    { header: "CÓDIGO ENCONTRADO NA LD", key: "ldDocument", width: 45 },
    { header: "FORMA LOCALIZADA NA LD", key: "ldDocumentForm", width: 22 },
    { header: "PESQUISA COM/SEM nt- E TAG NA LD", key: "ntLookup", width: 76 },
    { header: "RENOMEAÇÃO PARA ENTRAR NA EGRDT", key: "renameForEgrdt", width: 72 },
    { header: "TÍTULO (INFORMATIVO)", key: "title", width: 48 },
    { header: "ALOCADO?", key: "allocated", width: 23 },
    { header: "CONFIRMAÇÃO DE DOCUMENTOS PREVISTOS", key: "allocationStatus", width: 28 },
    { header: "POR QUE ESTÁ / NÃO ESTÁ ALOCADO?", key: "allocationReason", width: 68 },
    { header: "ALOCAÇÃO", key: "allocation", width: 27 },
    { header: "ETAPA DA ALOCAÇÃO", key: "allocationStage", width: 22 },
    { header: "COMENTÁRIO DA FISCAL", key: "fiscalComment", width: 52 },
    { header: "ARQUIVO DA LD", key: "ldFile", width: 38 },
    { header: "ABA LD", key: "sheet", width: 13 },
    { header: "LINHA LD", key: "line", width: 11 },
    { header: "VERSÃO DA LD ENVIADA", key: "ldVersion", width: 22 },
    { header: "REVISÃO NA LD", key: "ldRevision", width: 15 },
    { header: "REVISÃO PARA POSTAR", key: "targetRevision", width: 19 },
    { header: "REVISÃO SUGERIDA PELO SISTEMA", key: "revisionSuggested", width: 22 },
    { header: "REVISÃO ALTERADA MANUALMENTE", key: "revisionManual", width: 22 },
    { header: "NÚMERO DA GRDT NA LD", key: "grdt", width: 31 },
    { header: "DATA EFETIVA DE EMISSÃO DA GRDT", key: "effectiveDate", width: 22 },
    { header: "SITUAÇÃO DE POSTAGEM", key: "postingStatus", width: 29 },
    { header: "EVIDÊNCIA DE POSTAGEM", key: "postingEvidence", width: 58 },
    { header: "STATUS DA REVISÃO PARA POSTAR", key: "postingRevisionStatus", width: 26 },
    { header: "INCLUÍDO NA EGRDT?", key: "included", width: 22 },
    { header: "CAMINHO DATABOOK", key: "databook", width: 46 },
    { header: "OBSERVAÇÃO PRINCIPAL", key: "observation", width: 62 },
    { header: "GRDT(S) ANTERIOR(ES) NO HISTÓRICO", key: "previousEgrdt", width: 34 },
    { header: "STATUS SIGEM", key: "sigemStatus", width: 22 },
    { header: "ARQUIVO ORIGINAL", key: "originalFile", width: 38 },
    { header: "ARQUIVO FINAL", key: "finalFile", width: 38 },
    { header: "AJUSTE DE CÓDIGO (nt-)", key: "ntAdjustment", width: 88 },
  ]);

  // Colunas de decisão que aparecem primeiro na aba Resumo. A partir da 5.32.6
  // a mesma aba também recebe todas as evidências antes separadas na Auditoria
  // detalhada, evitando duas relações com os mesmos documentos.
  const EXECUTIVE_COLUMNS = Object.freeze([
    { header: "SITUAÇÃO", key: "decision", width: 24 },
    { header: "DOCUMENTO INFORMADO", key: "requestedDocument", width: 44 },
    { header: "ALOCADO?", key: "allocated", width: 22 },
    // O número da alocação decide para qual pacote o documento vai.
    { header: "ALOCAÇÃO", key: "allocation", width: 24 },
    // Comentário da fiscal já presente na LD; sem comentário, mostra o status
    // que o próprio GRCON apurou. Nunca grava vínculo externo no .xlsx.
    { header: "STATUS INTERNO", key: "internalStatus", width: 46 },
    { header: "SERÁ RENOMEADO?", key: "renameForEgrdt", width: 58 },
    { header: "ARQUIVO QUE SERÁ POSTADO", key: "finalFile", width: 44 },
    { header: "ENTRA NA EGRDT?", key: "included", width: 20 },
    { header: "O QUE FAZER", key: "executiveAction", width: 76 },
  ]);

  const SUMMARY_PRIORITY_COLUMNS = Object.freeze([
    { header: "SITUAÇÃO", key: "decision", width: 24 },
    { header: "DOCUMENTO INFORMADO", key: "requestedDocument", width: 44 },
    { header: "ENTRA NA EGRDT?", key: "included", width: 20 },
    { header: "O QUE FAZER", key: "executiveAction", width: 76 },
    { header: "ALOCADO?", key: "allocated", width: 22 },
    { header: "ALOCAÇÃO", key: "allocation", width: 24 },
    { header: "STATUS INTERNO", key: "internalStatus", width: 46 },
    { header: "SERÁ RENOMEADO?", key: "renameForEgrdt", width: 58 },
    { header: "ARQUIVO QUE SERÁ POSTADO", key: "finalFile", width: 44 },
  ]);
  const summaryPriorityKeys = new Set(SUMMARY_PRIORITY_COLUMNS.map((column) => column.key));
  const SUMMARY_COLUMNS = Object.freeze([
    ...SUMMARY_PRIORITY_COLUMNS,
    ...COLUMNS.filter((column) => !summaryPriorityKeys.has(column.key)),
  ]);

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  /** Grafia literal da linha técnica da LD, sem normalização de caixa. */
  function exactLdDocument(row) {
    const recordDocument = text(row && row.record && row.record.document);
    if (recordDocument) return recordDocument;
    const lookupDocument = text(row && row.documentLookup && row.documentLookup.ldDocument);
    if (lookupDocument) return lookupDocument;
    return text(row && row.document);
  }

  // ---------------------------------------------------------------------------
  // Central de alocação
  //
  // A central é uma planilha que vive numa pasta de rede: o GRCON roda no
  // navegador e não alcança esse caminho. O cadastro continua servindo como
  // referência da origem, mas o relatório não grava fórmulas nem conexões
  // externas. Isso evita o reparo do .xlsx e o aviso de fonte não confiável do
  // Excel. O STATUS INTERNO fica com o comentário presente na LD ou, quando
  // ele não existe, com a situação apurada pelo próprio GRCON.
  // ---------------------------------------------------------------------------
  const ALLOCATION_CENTER_LAST_ROW = 20000;

  function normalizeAllocationCenter(raw) {
    const config = raw || {};
    const fullPath = text(config.path);
    const sheet = text(config.sheet);
    const keyColumn = text(config.keyColumn).toUpperCase().replace(/[^A-Z]/g, "");
    const commentColumn = text(config.commentColumn).toUpperCase().replace(/[^A-Z]/g, "");
    if (!fullPath || !sheet || !keyColumn || !commentColumn) return null;
    const separator = fullPath.lastIndexOf("\\") >= fullPath.lastIndexOf("/") ? "\\" : "/";
    const cut = fullPath.lastIndexOf(separator);
    const fileName = cut >= 0 ? fullPath.slice(cut + 1) : fullPath;
    const directory = cut >= 0 ? fullPath.slice(0, cut + 1) : "";
    if (!fileName) return null;
    const lastRow = Math.max(2, Math.min(1048576, Math.trunc(Number(config.lastRow)) || ALLOCATION_CENTER_LAST_ROW));
    return { path: fullPath, directory, fileName, sheet, keyColumn, commentColumn, lastRow };
  }

  /** Comentário da fiscal na LD ou situação apurada pelo próprio GRCON. */
  function internalStatusText(item) {
    const normalize = (value) => (C && C.norm ? C.norm(value) : text(value).toUpperCase());
    const fiscalComment = text(item && item.fiscalComment);
    if (fiscalComment) return fiscalComment;
    const lookup = normalize(item && item.ntSearchResult);
    if (lookup.includes("NAO LOCALIZADO") || lookup.includes("NEM SEM")) return "Não consta na LD";
    const ldDocument = text(item && item.ldDocument);
    if (normalize(item && item.renameForEgrdt).startsWith("SIM") && ldDocument) return `Código que consta ${ldDocument}`;
    if (normalize(item && item.included).includes("EM ANALISE")) return "Em análise";
    const sigem = text(item && item.sigemStatus);
    const sigemNormalized = normalize(sigem);
    if (!sigem || sigemNormalized === "NAO POSTADO") return "Não postado no SIGEM";
    if (sigemNormalized === "EM ANALISE") return "Em análise";
    return sigem;
  }

  function formatDateBR(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
    const raw = text(value);
    let match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (match) return `${String(match[1]).padStart(2, "0")}/${String(match[2]).padStart(2, "0")}/${match[3]}`;
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      const date = new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000);
      if (!Number.isNaN(date.getTime())) return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
    }
    return raw;
  }

  function ldColumnValue(record, aliases) {
    const columns = Array.isArray(record && record.ldColumns) ? record.ldColumns : [];
    const wanted = (aliases || []).map((item) => C && C.norm ? C.norm(item) : text(item).toUpperCase());
    for (const column of columns) {
      const normalized = C && C.norm ? C.norm(column && column.header) : text(column && column.header).toUpperCase();
      if (wanted.includes(normalized)) return column && column.value;
    }
    return "";
  }

  function grdtValue(row, record) {
    return text(
      record && record.grdt
      || row && row.grdt
      || row && row.postingEvidence && row.postingEvidence.grdt
      || ldColumnValue(record, ["GRDT", "EGRDT", "NÚMERO DA GRDT", "NÚMERO DA EGRDT"])
    );
  }

  function effectiveDateValue(row, record) {
    return formatDateBR(
      record && record.effectiveDate
      || row && row.effectiveDate
      || row && row.postingEvidence && row.postingEvidence.effectiveDate
      || ldColumnValue(record, ["DATA EFETIVA DE EMISSÃO", "DATA EFETIVA EMISSÃO", "DATA EFETIVA DE EMISSÃO DA GRDT", "DATA EFETIVA DA GRDT"])
    );
  }

  function decisionLabel(row) {
    if (row && row.manuallyIncluded && row.selectedForEgrdt) return "Incluído manualmente — LD: Não Alocado";
    if (row && row.hardBlock) return "Não será incluído";
    if (row && row.decision === (C && C.READY || "pronto")) return "Será incluído na eGRDT";
    if (row && row.decision === (C && C.DISCARD || "descartar")) return "Não será enviado novamente";
    return "Precisa de conferência";
  }

  function decisionObservation(row) {
    if (Contracts && Contracts.enrichDecision) {
      const message = Contracts.enrichDecision(row || {}).userMessage || {};
      const summary = [message.title, message.explanation, message.nextAction].filter(Boolean).join(" ");
      if (summary) return summary;
    }
    if (C && C.simpleReason) return C.simpleReason(row || {});
    return text(row && row.reason);
  }

  /**
   * Cruzamento com o Apêndice 3, calculado na triagem e transportado na linha.
   * A base é embutida no aplicativo, então toda análise traz o cruzamento; se
   * ainda assim faltar, a coluna diz isso — nunca sai "NÃO" por falta de fonte.
   */
  function apendiceValue(row) {
    const info = row && row.apendice || null;
    if (!info) {
      return {
        available: false,
        ldCode: exactLdDocument(row) || "Não localizado",
        search: "Apêndice indisponível",
        tagged: "Não apurado — Apêndice indisponível",
        suggestion: "",
      };
    }
    return {
      available: info.available !== false,
      ldCode: text(info.ldCode) || exactLdDocument(row) || "Não localizado",
      search: text(info.search) || "Apêndice indisponível",
      tagged: text(info.tagged) || "Não apurado — Apêndice indisponível",
      suggestion: text(info.suggestion),
    };
  }

  /** Linha técnica com o status já consolidado pela triagem. */
  function allocationRecordOf(row) {
    const record = row && row.record || {};
    return { ...record, allocationStatus: text(record.allocationStatus) || text(row && row.allocationStatus) };
  }

  function allocationFindingOf(row) {
    const finding = row && row.allocationFinding;
    if (finding && finding.kind) return finding;
    const record = allocationRecordOf(row);
    if (!text(record.document) && !text(record.sheet)) return null;
    return C && C.allocationEvidenceState ? C.allocationEvidenceState(record) : null;
  }

  function allocationLabel(row) {
    const record = allocationRecordOf(row);
    const raw = text(record.allocationStatus);
    const allocationNumber = text(record.allocation);
    const state = allocationFindingOf(row);
    if (state) {
      if (state.kind === "allocated") {
        return state.evidence === "number"
          ? `SIM — alocação evidenciada pelo número ${state.allocationNumber || allocationNumber}`
          : "SIM — Alocado";
      }
      if (state.kind === "not_allocated") {
        // A ALOC enviada e ainda sem retorno é o caso que mais confunde: a LD
        // mostra o número preenchido e o relatório dizia apenas "Não alocado".
        return state.awaitingReturn || (allocationNumber && C && C.allocationNumberInfo && C.allocationNumberInfo(allocationNumber).valid)
          ? `NÃO — aguardando retorno da ALOC ${state.allocationNumber || allocationNumber}`
          : "NÃO — Não alocado";
      }
      // A LD com duas respostas não é "não informado": é conflito, e o relatório
      // precisa dizer isso em vez de escolher um dos lados.
      if (state.kind === "conflict") return "CONFLITO — a LD registra ALOCADO e NÃO ALOCADO";
      if (state.kind === "unknown") return `REVISAR — ${state.label}`;
      // Sem coluna na aba e coluna vazia são fatos diferentes e não podem sair
      // com a mesma frase: um diz que a LD não rastreia, o outro que a LD
      // rastreia e não informou.
      if (state.kind === "not_tracked") return "NÃO APURADO — a LD não rastreia alocação nesta aba";
      return "NÃO INFORMADO — campo de confirmação vazio na LD";
    }
    if (raw) return raw;
    return allocationNumber ? "SIM — alocação informada" : "Não informado";
  }


  function allocationReason(row) {
    const record = row && row.record || {};
    const allocationEvidence = record.allocationEvidence || null;
    const evidenceRecord = allocationEvidence || record;
    const raw = text(record.allocationStatus || row && row.allocationStatus);
    const state = allocationFindingOf(row)
      || (C && C.allocationState ? C.allocationState(raw) : { kind: raw ? "unknown" : "empty", label: raw || "Não informado" });
    const allocation = text(evidenceRecord.allocation || record.allocation);
    const stage = text(evidenceRecord.allocationStage || record.allocationStage);
    const meaningfulStage = stage && !/^(?:0|N\/A|NA|-)$/.test(C && C.norm ? C.norm(stage) : stage.toUpperCase());
    const fiscal = text(evidenceRecord.fiscalComment || record.fiscalComment || row && row.fiscalComment);
    const sigem = text(record.sigemStatus || row && row.status);
    const ldVersion = text(record.ldVersion);
    const source = text(evidenceRecord.source || record.source);
    const evidenceRow = Number(evidenceRecord.row) || 0;
    const evidenceColumn = text(evidenceRecord.allocationStatusColumn || record.allocationStatusColumn);
    const location = [source, evidenceRecord.sheet ? `aba ${evidenceRecord.sheet}` : "", evidenceColumn ? `célula ${evidenceColumn}${evidenceRow || ""}` : evidenceRow ? `linha ${evidenceRow}` : ""].filter(Boolean).join(" · ");
    const field = text(evidenceRecord.allocationStatusHeader || record.allocationStatusHeader) || "Confirmação de DOCUMENTOS PREVISTOS";
    const versionEvidence = ldVersion
      ? `Versão da LD enviada da linha técnica atual: ${ldVersion}${record.ldVersionColumn ? ` (coluna ${record.ldVersionColumn})` : ""}.`
      : record.ldVersionSource === "VERSÃO DA LD ENVIADA"
        ? "A coluna “VERSÃO DA LD ENVIADA” está vazia na linha técnica atual."
        : "A coluna “VERSÃO DA LD ENVIADA” não foi localizada nesta aba.";
    const fiscalNormalized = C && C.norm ? C.norm(fiscal) : fiscal.toUpperCase();
    const fiscalIsGeneric = !fiscal || /^(OK|ACEITO SEM COMENTARIOS?|SEM COMENTARIOS?)$/.test(fiscalNormalized);

    if (state.kind === "allocated" && state.evidence === "number") {
      return [
        `Alocação evidenciada pelo número ${state.allocationNumber || allocation}, registrado na LD sem preenchimento do campo “${field}”.`,
        `Ter número de ALOC é evidência de alocação; o campo de confirmação vazio não a desfaz.`,
        meaningfulStage ? `Etapa registrada: ${stage}.` : "",
        fiscal ? `Comentário da Fiscal: ${fiscal}.` : "",
        location ? `Evidência: ${location}.` : "",
        versionEvidence,
      ].filter(Boolean).join(" ");
    }
    if (state.kind === "allocated") {
      const parts = allocationEvidence
        ? [
          `Alocação preservada por evidência da mesma revisão no campo “${field}”${allocation ? `; número ${allocation}` : ""}.`,
          `Evidência da alocação: ${location || "linha histórica da LD"}${allocationEvidence.ldVersion ? ` · versão enviada ${allocationEvidence.ldVersion}` : ""}.`,
          `A linha técnica mais recente${record.sheet ? ` da aba ${record.sheet}` : ""}${record.row ? `, linha ${record.row}` : ""}${record.ldVersion ? `, versão ${record.ldVersion}` : ""} estava duplicada como “${text(record.allocationDuplicate && record.allocationDuplicate.allocationStatus) || "NÃO ALOCADO"}” sem evidência operacional para desfazer a alocação já concluída.`,
          versionEvidence,
        ]
        : [
          `Alocação confirmada pelo campo “${field}”${allocation ? `; número ${allocation}` : ""}.`,
          versionEvidence,
        ];
      if (meaningfulStage) parts.push(`Etapa registrada: ${stage}.`);
      if (fiscal) parts.push(`Comentário da Fiscal: ${fiscal}.`);
      if (!allocationEvidence && location) parts.push(`Evidência: ${location}.`);
      return parts.join(" ");
    }
    if (state.kind === "not_allocated") {
      const parts = [];
      if (!fiscalIsGeneric) parts.push(`Motivo registrado pela Fiscal: ${fiscal}.`);
      else if (fiscal) parts.push(`A Fiscal registrou “${fiscal}”, mas esse texto não explica a não alocação.`);
      else parts.push("A LD não contém comentário da Fiscal explicando a não alocação nesta linha.");
      if (allocation) parts.push(`Existe o número de alocação ${allocation}, porém a confirmação permanece “${raw || "NÃO ALOCADO"}”.`);
      else parts.push("Nenhum número de alocação foi registrado nessa linha.");
      if (meaningfulStage) parts.push(`Etapa da alocação: ${stage}.`);
      else parts.push("A etapa da alocação não traz uma fase operacional válida nesta linha.");
      if (sigem) parts.push(`Status SIGEM: ${sigem}.`);
      parts.push(versionEvidence);
      parts.push(`Evidência lida no campo “${field}”${raw ? `, valor “${raw}”` : ""}${location ? `, em ${location}` : ""}.`);
      return parts.join(" ");
    }
    if (state.kind === "unknown") {
      return `A alocação não pôde ser comprovada porque o valor “${raw || state.label}” do campo “${field}” não foi reconhecido${location ? ` (${location})` : ""}. ${versionEvidence}`;
    }
    if (state.kind === "conflict") {
      return [
        "A LD registra ALOCADO em uma linha e NÃO ALOCADO em outra para este mesmo documento.",
        state.source ? `Linhas em conflito: ${state.source}.` : "",
        state.allocationNumber ? `A linha alocada traz a alocação ${state.allocationNumber}.` : "",
        "O GRCON não escolhe entre as duas e não afirma nenhuma delas; confirme na LD qual vale antes de postar.",
        fiscal ? `Comentário da Fiscal: ${fiscal}.` : "",
        versionEvidence,
      ].filter(Boolean).join(" ");
    }
    if (state.kind === "not_tracked") {
      return `A alocação não foi verificada: a aba ${text(record.sheet) || "técnica"} da LD não possui coluna de confirmação de alocação${location ? ` (${location})` : ""}. Não há registro a favor nem contra a alocação deste documento${allocation ? `, e a coluna ALOCAÇÃO traz “${allocation}”` : ""}. ${versionEvidence}`;
    }
    if (state.kind === "blank") {
      return `A LD rastreia a alocação nesta aba, mas o campo “${field}” está vazio nesta linha${location ? ` (${location})` : ""}${allocation ? `, e o valor “${allocation}” da coluna ALOCAÇÃO não é um número de ALOC` : ""}. ${versionEvidence}`;
    }
    return `A alocação não pôde ser comprovada porque o campo “${field}” está vazio ou não foi localizado${location ? ` (${location})` : ""}${allocation ? `, embora exista o número ${allocation}` : ""}. ${versionEvidence}`;
  }

  // Reúne todos os comentários da fiscal encontrados para o documento: o da
  // linha técnica atual e os de cada revisão anterior conhecida na linha do
  // tempo, sem repetir textos iguais.
  /**
   * Explicação da coluna "AJUSTE DE CÓDIGO (nt-)". Escrita para ser lida por
   * quem abre o relatório sem acompanhar a análise: diz o que foi entregue, o
   * que a LD tem, com que nome o arquivo vai para a eGRDT e por quê.
   */
  function ntAdjustmentText(row) {
    const info = row && row.ntRename;
    if (!info) return "";
    const semNt = /informado com nt-/.test(text(info.direcao));
    return [
      "SIM — o código foi encontrado na LD escrito de outra forma.",
      `Você informou: ${text(info.enviado)}.`,
      `Na LD o documento está como: ${text(info.naLd)}.`,
      info.finalName ? `Vai para a eGRDT como: ${text(info.finalName)}.` : "",
      semNt
        ? "O “nt-” foi retirado porque a LD não o tem."
        : "O “nt-” foi acrescentado porque a LD o tem.",
      "O arquivo é renomeado para a grafia da LD: é assim que o documento está alocado, e o SIGEM só aceita a postagem com esse nome.",
    ].filter(Boolean).join(" ");
  }

  function renameForEgrdtText(row) {
    const lookup = row && row.documentLookup || {};
    const info = row && (row.ntRename || row.ldRename);
    if (info) {
      return [
        "SIM — RENOMEADO PARA SEGUIR A LD.",
        `De: ${text(info.enviado)}.`,
        `Para: ${text(info.naLd)}.`,
        text(info.finalName || row && row.finalName) ? `Nome final no pacote/eGRDT: ${text(info.finalName || row && row.finalName)}.` : "",
      ].filter(Boolean).join(" ");
    }
    if (!lookup.matched) return "—";
    if (!lookup.appliesToNtRule) return "NÃO — o código informado já é o da LD.";
    return "NÃO — o código informado já é o da LD.";
  }

  function allFiscalComments(row) {
    const record = row && row.record || {};
    const values = [text(record.fiscalComment || row && row.fiscalComment)];
    const revisions = (row && row.timeline && row.timeline.revisions) || [];
    revisions.forEach((item) => values.push(text(item && item.fiscalComment)));
    return [...new Set(values.filter(Boolean))].join(" | ");
  }

  function buildRows(results, options) {
    const settings = options || {};
    return (results || []).map((row) => {
      const record = row && row.record || {};
      const exactDocument = exactLdDocument(row);
      const locatedDocument = text(record.document || row && row.documentLookup && row.documentLookup.ldDocument);
      const manuallyIncluded = Boolean(row && row.manuallyIncluded && row.selectedForEgrdt);
      const ready = row && !row.hardBlock && row.decision === (C && C.READY || "pronto");
      const notice = row && row.ldConflict && row.ldConflict.hasNotice && row.ldConflict.noticeSummary
        ? ` ${row.ldConflict.noticeSummary}`
        : "";
      const included = manuallyIncluded
        ? "SIM — MANUAL (LD NÃO ALOCADO)"
        : ready
        ? "SIM"
        : row && row.hardBlock
          ? "NÃO — BLOQUEADO"
          : row && row.decision === (C && C.DISCARD || "descartar")
            ? "NÃO — EM ANÁLISE"
            : "PENDENTE";
      return {
        decision: decisionLabel(row),
        requestedDocument: text(row && row.documentLookup && row.documentLookup.inputDocument || row && row.name),
        document: exactDocument,
        ldCode: apendiceValue(row).ldCode,
        apendiceSearch: apendiceValue(row).search,
        tagged: apendiceValue(row).tagged,
        apendiceSuggestion: apendiceValue(row).suggestion || (apendiceValue(row).available === false ? "Não apurado — Apêndice indisponível" : "—"),
        ntSearchResult: text(row && row.documentLookup && row.documentLookup.resultLabel) || "PESQUISA NÃO REGISTRADA",
        searchedWithoutNt: text(row && row.documentLookup && row.documentLookup.searchedWithoutNt) || "Não se aplica",
        searchedWithNt: text(row && row.documentLookup && row.documentLookup.searchedWithNt) || "Não se aplica",
        ldDocument: locatedDocument || "Não localizado",
        ldDocumentForm: text(row && row.documentLookup && row.documentLookup.ldForm) || "Não localizado",
        ntLookup: text(row && row.documentLookup && row.documentLookup.message),
        renameForEgrdt: renameForEgrdtText(row),
        previousEgrdt: typeof settings.historyLookup === "function" ? text(settings.historyLookup(row && row.document)) : "",
        title: text(row && row.egrdt && row.egrdt.title || record.title),
        allocated: allocationLabel(row),
        allocationStatus: text(record.allocationStatus),
        allocationReason: allocationReason(row),
        allocation: text(record.allocation),
        allocationStage: text(record.allocationStage),
        fiscalComment: allFiscalComments(row),
        ldFile: text(record.source || settings.ldFileName),
        sheet: text(record.sheet || row && row.sheet),
        line: Number(record.row) || "",
        ldVersion: text(record.ldVersion) || (record.ldVersionSource === "VERSÃO DA LD ENVIADA" ? "Não informada na linha" : "Coluna não localizada"),
        ldRevision: text(record.revision),
        targetRevision: text(row && row.revision),
        revisionSuggested: text(row && row.revisionSuggested) || text(row && row.revision),
        revisionManual: row && row.revisionManual ? "SIM" : "NÃO",
        grdt: grdtValue(row, record),
        effectiveDate: effectiveDateValue(row, record),
        postingStatus: text(row && row.postingStatus || row && row.postingEvidence && row.postingEvidence.status) || "Sem evidência de postagem na LD",
        postingEvidence: text(row && row.postingEvidence && row.postingEvidence.explanation),
        postingRevisionStatus: text(row && row.status),
        included,
        databook: text(record.databook),
        observation: `${manuallyIncluded ? "INCLUSÃO MANUAL: o operador selecionou este documento para a GRDT mesmo com a LD registrando Não Alocado. O status original da LD foi preservado. " : ""}${decisionObservation(row)}${notice}`.trim(),
        sigemStatus: text(record.sigemStatus),
        originalFile: Array.isArray(row && row.files) && row.files.length
          ? row.files.map((item) => text(item && item.name)).filter(Boolean).join(" | ")
          : text(row && row.name),
        finalFile: Array.isArray(row && row.files) && row.files.length
          ? row.files.map((item) => text(item && item.finalName)).filter(Boolean).join(" | ")
          : text(row && row.finalName),
        ntAdjustment: ntAdjustmentText(row),
      };
    });
  }

  async function buildRowsAsync(results, options) {
    if (!Large || !Large.mapInChunks) return buildRows(results, options);
    const settings = options || {};
    return Large.mapInChunks(results || [], (row) => buildRows([row], settings)[0], { chunkSize: 300 });
  }

  function columnLetter(number) {
    let n = Number(number) || 1;
    let result = "";
    while (n > 0) {
      n -= 1;
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26);
    }
    return result;
  }

  function statusPalette(value) {
    const normalized = C && C.norm ? C.norm(value) : text(value).toUpperCase();
    if (normalized.includes("SERA INCLUIDO")) return ["FFEAF7F1", "FF0C7657"];
    if (normalized.includes("NAO SERA INCLUIDO")) return ["FFFFF0ED", "FFA64035"];
    if (normalized.includes("PRECISA")) return ["FFFFF5DF", "FFA56812"];
    return ["FFEDF1F4", "FF596C7D"];
  }

  function allocationPalette(value) {
    const normalized = C && C.norm ? C.norm(value) : text(value).toUpperCase();
    if (normalized.includes("NAO") && normalized.includes("ALOCADO")) return ["FFFFF0ED", "FFA64035"];
    if (normalized.startsWith("SIM") || (normalized.includes("ALOCADO") && !normalized.includes("NAO"))) return ["FFEAF7F1", "FF0C7657"];
    return ["FFFFF5DF", "FFA56812"];
  }

  function ntSearchPalette(value) {
    const normalized = C && C.norm ? C.norm(value) : text(value).toUpperCase();
    if (normalized.includes("OUTRA FORMA")) return ["FFFFE7B3", "FF7A5300"];
    if (normalized.includes("NAO LOCALIZADO") || normalized.includes("NEM SEM")) return ["FFFFE5E1", "FF9B3028"];
    if (normalized.includes("MESMA FORMA")) return ["FFEAF7F1", "FF0C7657"];
    if (normalized.includes("MAIS DE UMA")) return ["FFFFF5DF", "FFA56812"];
    return ["FFEDF1F4", "FF596C7D"];
  }

  function writeGuide(worksheet, startRow, lastColumn, lines) {
    const guideRow = Number(startRow) || 22;
    lines.forEach(([value, fill, color, bold], offset) => {
      const rowNumber = guideRow + offset;
      worksheet.mergeCells(`A${rowNumber}:${lastColumn}${rowNumber}`);
      const cell = worksheet.getCell(rowNumber, 1);
      cell.value = value;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.font = { name: "Aptos", size: bold ? 10 : 9, bold, color: { argb: color } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      worksheet.getRow(rowNumber).height = bold ? 24 : 32;
    });
    return guideRow + lines.length + 1;
  }

  function writeNtGuide(worksheet, startRow, lastColumn) {
    return writeGuide(worksheet, startRow, lastColumn, [
      ["COMO LER A PESQUISA COM/SEM nt- E TAG", "FF153A5C", "FFFFFFFF", true],
      ["Somente documentos ET: o GRCON pesquisa o código completo, a forma sem nt-, a forma com nt- e, se necessário, a combinação tipo documental (Grupo 6) + TAG.", "FFEAF2F8", "FF234B6B", false],
      ["O tipo informado é obrigatório: REP só localiza REP, RUFF só localiza RUFF e a mesma regra vale para todos os tipos da norma. TAG igual em outro tipo não é aceito.", "FFF2F4F6", "FF52687B", false],
      ["Quando tipo + TAG identificam uma única linha, os demais grupos do código são corrigidos pela forma oficial da LD e a renomeação para a eGRDT fica registrada neste RESUMO.", "FFEAF2F8", "FF234B6B", false],
      ["Quando a outra forma é encontrada, a coluna “RENOMEAÇÃO PARA ENTRAR NA EGRDT” mostra claramente DE → PARA. O arquivo final sempre usa o código exatamente como está na LD.", "FFFFF3CF", "FF7A5300", false],
      ["Documentos N-1710 não usam nt- nem a regra de TAG dos relatórios ET: nesses casos o relatório mostra “NÃO SE APLICA” e pesquisa somente o código informado.", "FFF2F4F6", "FF52687B", false],
    ]);
  }

  function writeExecutiveGuide(worksheet, startRow, lastColumn) {
    return writeGuide(worksheet, startRow, lastColumn, [
      ["COMO LER A RELAÇÃO ABAIXO", "FF153A5C", "FFFFFFFF", true],
      ["Cada linha é um documento. As primeiras colunas respondem se ele entra na eGRDT, o que precisa ser feito, sua alocação e o arquivo final.", "FFEAF2F8", "FF234B6B", false],
      ["Continue para a direita para consultar todas as evidências: buscas com/sem nt- e TAG, código da LD, revisão, postagem, origem, linha, Databook e histórico.", "FFF2F4F6", "FF52687B", false],
      ["Use os filtros do cabeçalho para separar prontos, bloqueados, não localizados e documentos que exigem conferência. Amarelo destaca renomeação; vermelho indica impedimento.", "FFFFF3CF", "FF7A5300", false],
      ["Documentos Não Alocados ficam desmarcados por padrão, mas podem ser incluídos manualmente. Quando isso ocorrer, o Resumo mantém o status da LD e identifica claramente a decisão do operador.", "FFFFF3CF", "FF7A5300", false],
      ["“STATUS INTERNO” mostra o comentário da fiscal registrado na LD; quando não há comentário, mostra a situação apurada pelo GRCON. O relatório não cria vínculos externos e pode ser aberto com segurança.", "FFEEF6F1", "FF14614A", false],
    ]);
  }

  /**
   * Perguntas que a gerência faz ao abrir o relatório, já respondidas com os
   * números desta análise. Sem jargão e sem detalhe de funcionamento do
   * aplicativo: só o que decide a ação.
   */
  function executiveBriefing(rows) {
    const lista = rows || [];
    const total = lista.length;
    const pct = (n) => (total ? ` (${Math.round((n / total) * 100)}% do total)` : "");
    const conta = (fn) => lista.filter(fn).length;
    const incluido = (item) => text(item.included).toUpperCase().startsWith("SIM");
    const bloqueado = (item) => text(item.included).toUpperCase().includes("BLOQUEADO");
    const emAnalise = (item) => text(item.included).toUpperCase().includes("EM ANÁLISE");
    const pendente = (item) => text(item.included).toUpperCase() === "PENDENTE";
    const naoAlocado = (item) => {
      const valor = text(item.allocated).toUpperCase();
      return valor.includes("NÃO") && valor.includes("ALOCADO");
    };
    const semLd = (item) => text(item.ntSearchResult).toUpperCase().includes("NÃO LOCALIZADO")
      || text(item.ntSearchResult).toUpperCase().includes("NAO LOCALIZADO");
    const renomeado = (item) => text(item.renameForEgrdt).toUpperCase().startsWith("SIM");

    const entram = conta(incluido);
    const naoAlocadosIncluidosManualmente = conta((item) => incluido(item) && naoAlocado(item));
    const naoAlocadosPendentes = conta((item) => !incluido(item) && naoAlocado(item));
    const naoEntram = total - entram;
    const perguntas = [
      ["Quantos documentos foram analisados?", `${total.toLocaleString("pt-BR")} documento(s).`],
      ["Quantos serão postados nesta eGRDT?", entram
        ? `${entram.toLocaleString("pt-BR")}${pct(entram)}.`
        : "Nenhum. Nenhum documento reuniu as condições para ser postado."],
      ["Quantos ficaram de fora?", naoEntram
        ? `${naoEntram.toLocaleString("pt-BR")}${pct(naoEntram)}. Os motivos estão detalhados no quadro ao lado.`
        : "Nenhum. Todos os documentos analisados serão postados."],
      ["Algum arquivo precisou ser renomeado?", conta(renomeado)
        ? `Sim, ${conta(renomeado).toLocaleString("pt-BR")} arquivo(s). O nome passa a ser o código exatamente como está na LD, que é a forma aceita na postagem.`
        : "Não. Todos os códigos informados já coincidiam com a LD."],
      ["O que depende de outra pessoa?", naoAlocadosPendentes || naoAlocadosIncluidosManualmente
        ? `${naoAlocadosPendentes.toLocaleString("pt-BR")} documento(s) permanecem fora aguardando alocação.${naoAlocadosIncluidosManualmente ? ` ${naoAlocadosIncluidosManualmente.toLocaleString("pt-BR")} foram incluído(s) manualmente apesar do status Não Alocado.` : ""}`
        : "Nada. Nenhum documento está travado por alocação."],
    ];

    const motivos = [
      ["Não estão alocados na LD", conta((item) => !incluido(item) && naoAlocado(item)), "Regularizar a alocação na LD."],
      ["Não constam na LD", conta((item) => !incluido(item) && !naoAlocado(item) && semLd(item)), "Conferir o código informado e a versão da LD."],
      ["Aguardam retorno da análise", conta((item) => !incluido(item) && !naoAlocado(item) && !semLd(item) && emAnalise(item)), "Aguardar o retorno; o documento não é reenviado."],
      ["Bloqueados por outra pendência", conta((item) => !incluido(item) && !naoAlocado(item) && !semLd(item) && !emAnalise(item) && bloqueado(item)), "Ver “O QUE FAZER” na relação abaixo."],
      ["Precisam de conferência manual", conta((item) => !incluido(item) && !naoAlocado(item) && !semLd(item) && !emAnalise(item) && !bloqueado(item) && pendente(item)), "Conferir caso a caso na relação abaixo."],
    ].filter(([, quantidade]) => quantidade > 0);

    return { total, entram, naoEntram, renomeados: conta(renomeado), perguntas, motivos };
  }

  function executiveRows(rows) {
    return (rows || []).map((item) => {
      const included = text(item.included).toUpperCase();
      const allocated = text(item.allocated).toUpperCase();
      const lookup = text(item.ntSearchResult).toUpperCase();
      // Texto escrito para quem decide, não para quem opera o aplicativo:
      // o que acontece com o documento e de quem depende resolver.
      let executiveAction = text(item.observation);
      if (included.startsWith("SIM") && allocated.includes("NÃO") && allocated.includes("ALOCADO")) {
        executiveAction = "Será postado por decisão manual do operador, embora a LD permaneça registrada como Não Alocado. Regularize a alocação para manter a rastreabilidade documental.";
      } else if (allocated.includes("NÃO") && allocated.includes("ALOCADO")) {
        const comentario = text(item.fiscalComment);
        executiveAction = `Não será postado: o documento não está alocado na LD.${comentario ? ` Comentário da Fiscal: ${comentario}` : ""} Regularize a alocação na LD para liberar a postagem.`;
      } else if (included.startsWith("SIM")) {
        executiveAction = text(item.renameForEgrdt).toUpperCase().startsWith("SIM")
          ? "Será postado. O arquivo entra com o código exatamente como está na LD, que é a forma aceita na postagem."
          : "Será postado. Não há pendências neste documento.";
      } else if (lookup.includes("NÃO LOCALIZADO") || lookup.includes("NAO LOCALIZADO")) {
        executiveAction = "Não será postado: este código não consta na LD. Confira o código informado e se a LD em uso é a versão mais recente.";
      }
      return {
        ...item,
        internalStatus: internalStatusText(item),
        executiveAction,
        ldEvidence: [item.ldFile, item.sheet ? `aba ${item.sheet}` : "", item.line ? `linha ${item.line}` : ""]
          .filter(Boolean).join(" · ") || "Não localizado na LD",
      };
    });
  }

  function prepareTable(worksheet, rows, startRow, columns, options) {
    const settings = options || {};
    const sectionStart = Number(startRow) || 22;
    const lastColumn = columnLetter(columns.length);
    const guideLastColumn = settings.executive
      ? columnLetter(Math.min(columns.length, SUMMARY_PRIORITY_COLUMNS.length))
      : lastColumn;
    const titleRow = settings.executive
      ? writeExecutiveGuide(worksheet, sectionStart, guideLastColumn)
      : writeNtGuide(worksheet, sectionStart, lastColumn);
    const headerRow = titleRow + 1;
    const dataStart = headerRow + 1;

    worksheet.mergeCells(`A${titleRow}:${guideLastColumn}${titleRow}`);
    const title = worksheet.getCell(titleRow, 1);
    title.value = settings.title || "AUDITORIA DETALHADA POR DOCUMENTO";
    title.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
    title.alignment = { vertical: "middle", horizontal: "left" };
    worksheet.getRow(titleRow).height = 24;

    columns.forEach((column, index) => {
      const cell = worksheet.getCell(headerRow, index + 1);
      cell.value = column.header;
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB7C8D6" } } };
      worksheet.getColumn(index + 1).width = column.width;
    });
    worksheet.getRow(headerRow).height = 34;
    return {
      titleRow, headerRow, dataStart, lastColumn, columns, rows,
      executive: Boolean(settings.executive),
    };
  }

  function styleBaseRow(row, item, rowIndex, columns) {
      columns.forEach((column, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        const value = item[column.key];
        cell.value = value === "" || value === null || value === undefined ? null : value;
        cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
        if (rowIndex % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
      const longestText = Math.max(...columns.map((column) => text(item[column.key]).length), 0);
      row.height = Math.min(96, Math.max(34, 20 + Math.ceil(longestText / 78) * 14));
  }

  function styleDecisionCell(row) {
      const decisionCell = row.getCell(1);
      const decisionColors = statusPalette(decisionCell.value);
      decisionCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: decisionColors[0] } };
      decisionCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: decisionColors[1] } };
  }

  function styleSearchCell(row, columns) {
      const ntResultColumn = columns.findIndex((column) => column.key === "ntSearchResult") + 1;
      if (!ntResultColumn) return;
      const ntResultCell = row.getCell(ntResultColumn);
      const ntResultColors = ntSearchPalette(ntResultCell.value);
      ntResultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ntResultColors[0] } };
      ntResultCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: ntResultColors[1] } };
  }

  function styleAllocationCell(row, columns) {
      const allocatedColumn = columns.findIndex((column) => column.key === "allocated") + 1;
      if (!allocatedColumn) return;
      const allocationCell = row.getCell(allocatedColumn);
      const allocationColors = allocationPalette(allocationCell.value);
      allocationCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: allocationColors[0] } };
      allocationCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: allocationColors[1] } };
      if ((C && C.norm ? C.norm(allocationCell.value) : text(allocationCell.value).toUpperCase()).includes("NAO")) {
        const reasonColumn = columns.findIndex((column) => ["allocationReason", "executiveAction"].includes(column.key)) + 1;
        if (reasonColumn) {
          const reasonCell = row.getCell(reasonColumn);
          reasonCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7F4" } };
          reasonCell.font = { name: "Aptos", size: 9, color: { argb: "FF7A342D" } };
        }
      }
  }

  function styleRenameCells(row, columns) {
      const adjustmentColumn = columns.findIndex((column) => column.key === "ntAdjustment") + 1;
      if (adjustmentColumn && text(row.getCell(adjustmentColumn).value)) {
        const ntCell = row.getCell(adjustmentColumn);
        ntCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CF" } };
        ntCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF7A5300" } };
      }

      const renameColumn = columns.findIndex((column) => column.key === "renameForEgrdt") + 1;
      if (renameColumn) {
        const renameCell = row.getCell(renameColumn);
        if (!(C && C.norm ? C.norm(renameCell.value) : text(renameCell.value).toUpperCase()).startsWith("SIM")) return;
        renameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE7B3" } };
        renameCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF7A5300" } };
      }
  }

  function styleIncludedCell(row, columns) {
      const includedColumn = columns.findIndex((column) => column.key === "included") + 1;
      if (!includedColumn) return;
      const includedCell = row.getCell(includedColumn);
      const included = text(includedCell.value).toUpperCase() === "SIM";
      includedCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: included ? "FFEAF7F1" : "FFFFF5DF" } };
      includedCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: included ? "FF0C7657" : "FFA56812" } };
      includedCell.alignment = { vertical: "middle", horizontal: "center" };
  }

  /** Mantém STATUS INTERNO como texto seguro, sem fórmula ou vínculo externo. */
  function styleInternalStatusCell(row, columns) {
    const internalColumn = columns.findIndex((column) => column.key === "internalStatus") + 1;
    if (!internalColumn) return;
    const cell = row.getCell(internalColumn);
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF3C5468" } };
    cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  }

  function styleTableRow(row, item, rowIndex, layout) {
    const columns = layout.columns;
    styleBaseRow(row, item, rowIndex, columns);
    styleDecisionCell(row);
    styleSearchCell(row, columns);
    styleAllocationCell(row, columns);
    styleInternalStatusCell(row, columns);
    styleRenameCells(row, columns);
    styleIncludedCell(row, columns);
  }

  function finishTable(worksheet, layout, rowCount) {
    const finalRow = Math.max(layout.headerRow, layout.dataStart + rowCount - 1);
    worksheet.autoFilter = { from: `A${layout.headerRow}`, to: `${layout.lastColumn}${finalRow}` };
    // O Resumo abre no painel gerencial. Como a relação completa é larga,
    // somente as duas primeiras colunas ficam fixas durante a rolagem lateral;
    // congelar todas as linhas do painel tiraria espaço útil da tabela.
    worksheet.views = layout.executive
      ? [{ state: "frozen", xSplit: 2, showGridLines: false, zoomScale: 80, activeCell: "C1" }]
      : [{ state: "frozen", ySplit: layout.headerRow, activeCell: `A${layout.dataStart}`, showGridLines: false, zoomScale: 80 }];
    return { ...layout, finalRow };
  }

  function writeRows(worksheet, rows, layout) {
    rows.forEach((item, rowIndex) => {
      const row = worksheet.getRow(layout.dataStart + rowIndex);
      styleTableRow(row, item, rowIndex, layout);
    });
    return finishTable(worksheet, layout, rows.length);
  }

  async function writeRowsAsync(worksheet, rows, layout) {
    for (let start = 0; start < rows.length; start += 300) {
      const end = Math.min(rows.length, start + 300);
      for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
        const item = rows[rowIndex];
        const row = worksheet.getRow(layout.dataStart + rowIndex);
        styleTableRow(row, item, rowIndex, layout);
      }
      if (end < rows.length) await Large.pause();
    }
    return finishTable(worksheet, layout, rows.length);
  }

  function writeTable(worksheet, rows, startRow) {
    const source = rows || [];
    return writeRows(worksheet, source, prepareTable(worksheet, source, startRow, COLUMNS, { title: "AUDITORIA DETALHADA POR DOCUMENTO" }));
  }

  async function writeTableAsync(worksheet, rows, startRow) {
    const source = rows || [];
    const layout = prepareTable(worksheet, source, startRow, COLUMNS, { title: "AUDITORIA DETALHADA POR DOCUMENTO" });
    if (!Large || !Large.pause || source.length <= 600) return writeRows(worksheet, source, layout);
    return writeRowsAsync(worksheet, source, layout);
  }

  function executiveTableSettings(options) {
    return {
      executive: true,
      title: "DOCUMENTOS ANALISADOS — DECISÃO E EVIDÊNCIAS COMPLETAS",
    };
  }

  function writeExecutiveTable(worksheet, rows, startRow, options) {
    const source = executiveRows(rows);
    return writeRows(worksheet, source, prepareTable(worksheet, source, startRow, SUMMARY_COLUMNS, executiveTableSettings(options)));
  }

  async function writeExecutiveTableAsync(worksheet, rows, startRow, options) {
    const source = executiveRows(rows);
    const layout = prepareTable(worksheet, source, startRow, SUMMARY_COLUMNS, executiveTableSettings(options));
    if (!Large || !Large.pause || source.length <= 600) return writeRows(worksheet, source, layout);
    return writeRowsAsync(worksheet, source, layout);
  }

  /**
   * Monta a aba Resumo inteira: faixa de título, cartões, o bloco de perguntas
   * respondidas, os motivos de quem ficou de fora, a origem da análise e a
   * relação dos documentos.
   *
   * Fica aqui, e não em quem chama, porque o relatório é gerado por dois
   * caminhos — o Worker dedicado, que é o normal, e o construtor de reserva de
   * quando o navegador não tem Worker. Enquanto o desenho estava duplicado, uma
   * melhoria feita em um caminho não chegava a quem usa o outro.
   */
  async function writeExecutiveSummarySheet(worksheet, rows, options) {
    const settings = options || {};
    const briefing = executiveBriefing(rows);
    const columnCount = SUMMARY_COLUMNS.length;
    // O painel ocupa apenas as nove colunas prioritárias. A relação detalhada
    // continua para a direita, sem esticar os cartões e os blocos gerenciais.
    const dashboardColumnCount = SUMMARY_PRIORITY_COLUMNS.length;
    const dashboardLastColumn = columnLetter(dashboardColumnCount);
    worksheet.columns = SUMMARY_COLUMNS.map((column) => ({ width: column.width }));

    for (let row = 1; row <= 3; row += 1) {
      for (let col = 1; col <= dashboardColumnCount; col += 1) {
        worksheet.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      }
    }
    worksheet.mergeCells(`C1:${dashboardLastColumn}2`);
    const titulo = worksheet.getCell("C1");
    titulo.value = "GRCON · RELATÓRIO DE TRIAGEM DOCUMENTAL";
    titulo.font = { name: "Aptos Display", size: 19, bold: true, color: { argb: "FFFFFFFF" } };
    titulo.alignment = { vertical: "middle", horizontal: "left" };

    worksheet.mergeCells(`A4:${dashboardLastColumn}4`);
    const meta = worksheet.getCell("A4");
    meta.value = text(settings.metadata);
    meta.font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
    meta.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
    meta.alignment = { vertical: "middle" };

    // Os três primeiros cartões fecham a conta; o quarto é outra dimensão,
    // para não induzir a somar coisas diferentes.
    const cards = [
      ["DOCUMENTOS ANALISADOS", briefing.total, "FF2E5878"],
      ["SERÃO POSTADOS", briefing.entram, "FF0C7657"],
      ["NÃO SERÃO POSTADOS", briefing.naoEntram, "FFA64035"],
      ["ARQUIVOS RENOMEADOS", briefing.renomeados, "FFA56812"],
    ];
    const larguraCartao = Math.max(1, Math.floor(dashboardColumnCount / cards.length));
    cards.forEach(([label, count, color], index) => {
      const inicio = index * larguraCartao + 1;
      const fim = index === cards.length - 1 ? dashboardColumnCount : inicio + larguraCartao - 1;
      worksheet.mergeCells(6, inicio, 8, fim);
      const cell = worksheet.getCell(6, inicio);
      cell.value = { richText: [
        { font: { name: "Aptos", size: 9, bold: true, color: { argb: "FF6F7E8C" } }, text: `${label}\n` },
        { font: { name: "Aptos Display", size: 22, bold: true, color: { argb: color } }, text: Number(count || 0).toLocaleString("pt-BR") },
      ] };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
      cell.border = {
        left: { style: "medium", color: { argb: color } },
        top: { style: "thin", color: { argb: "FFDCE4EA" } },
        right: { style: "thin", color: { argb: "FFDCE4EA" } },
        bottom: { style: "thin", color: { argb: "FFDCE4EA" } },
      };
    });

    const meio = Math.max(1, Math.floor(dashboardColumnCount / 2));
    const colunaMeio = columnLetter(meio);
    const colunaDireita = columnLetter(meio + 1);
    const faixa = (row, texto, de, ate) => {
      worksheet.mergeCells(`${de}${row}:${ate}${row}`);
      const cell = worksheet.getCell(`${de}${row}`);
      cell.value = texto;
      cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
      cell.alignment = { vertical: "middle" };
      worksheet.getRow(row).height = 22;
    };

    faixa(10, "O QUE ESTE RELATÓRIO RESPONDE", "A", colunaMeio);
    briefing.perguntas.forEach(([pergunta, resposta], index) => {
      const row = 11 + index;
      worksheet.mergeCells(`A${row}:${colunaMeio}${row}`);
      const cell = worksheet.getCell(`A${row}`);
      cell.value = { richText: [
        { font: { name: "Aptos", size: 9, bold: true, color: { argb: "FF153A5C" } }, text: `${pergunta}  ` },
        { font: { name: "Aptos", size: 9, color: { argb: "FF31465A" } }, text: resposta },
      ] };
      cell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF8FAFC" : "FFFFFFFF" } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
      worksheet.getRow(row).height = 30;
    });

    faixa(10, "POR QUE ALGUNS NÃO SERÃO POSTADOS", colunaDireita, dashboardLastColumn);
    const motivos = briefing.motivos.length
      ? briefing.motivos
      : [["Nenhum documento ficou de fora", 0, "Todos os documentos analisados serão postados."]];
    motivos.slice(0, Math.max(briefing.perguntas.length, 1)).forEach(([motivo, quantidade, acao], index) => {
      const row = 11 + index;
      worksheet.mergeCells(`${colunaDireita}${row}:${dashboardLastColumn}${row}`);
      const cell = worksheet.getCell(`${colunaDireita}${row}`);
      cell.value = { richText: [
        { font: { name: "Aptos Display", size: 12, bold: true, color: { argb: quantidade ? "FFA64035" : "FF0C7657" } }, text: quantidade ? `${quantidade.toLocaleString("pt-BR")}  ` : "" },
        { font: { name: "Aptos", size: 9, bold: true, color: { argb: "FF153A5C" } }, text: `${motivo}. ` },
        { font: { name: "Aptos", size: 9, color: { argb: "FF31465A" } }, text: acao },
      ] };
      cell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF8FAFC" : "FFFFFFFF" } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
    });

    const linhasBloco = Math.max(briefing.perguntas.length, motivos.length);
    const origemRow = 12 + linhasBloco;
    faixa(origemRow, "DE ONDE VEIO ESTA ANÁLISE", "A", dashboardLastColumn);
    const central = normalizeAllocationCenter(settings.allocationCenter);
    const origem = [
      ["Lista de documentos (LD)", text(settings.ldName) || "Não informado"],
      ["Versão da LD enviada", text(settings.ldVersion) || "Não informada"],
      ["Documentos conferidos a partir de", text(settings.relationLabel) || "Pasta documental"],
      ["Referência da central de alocação", central
        ? `${central.path} · aba ${central.sheet} · cadastro informativo, sem conexão externa no relatório`
        : "Não cadastrada — STATUS INTERNO usa a LD e a situação apurada pelo GRCON"],
    ];
    origem.forEach(([label, value], index) => {
      const row = origemRow + 1 + index;
      worksheet.mergeCells(`A${row}:D${row}`);
      worksheet.mergeCells(`E${row}:${dashboardLastColumn}${row}`);
      worksheet.getCell(`A${row}`).value = label;
      worksheet.getCell(`E${row}`).value = value;
      worksheet.getCell(`A${row}`).font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF53697B" } };
      worksheet.getCell(`E${row}`).font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      worksheet.getCell(`A${row}`).alignment = { vertical: "middle", indent: 1 };
      worksheet.getCell(`E${row}`).alignment = { vertical: "middle", wrapText: true };
      if (index % 2) {
        for (let col = 1; col <= dashboardColumnCount; col += 1) {
          worksheet.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
      }
    });

    const tableStart = origemRow + origem.length + 2;
    const layout = await writeExecutiveTableAsync(worksheet, rows, tableStart, { allocationCenter: settings.allocationCenter });
    worksheet.pageSetup = {
      orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: .2, right: .2, top: .4, bottom: .4, header: .2, footer: .2 },
      printTitlesRow: layout ? `${layout.headerRow}:${layout.headerRow}` : undefined,
    };
    worksheet.headerFooter.oddFooter = "&LGRCON&C&P de &N&R&D";
    return layout;
  }

  return Object.freeze({
    COLUMNS,
    EXECUTIVE_COLUMNS,
    SUMMARY_COLUMNS,
    allocationReason,
    buildRows,
    buildRowsAsync,
    executiveBriefing,
    executiveRows,
    internalStatusText,
    normalizeAllocationCenter,
    writeTable,
    writeTableAsync,
    writeExecutiveTable,
    writeExecutiveTableAsync,
    writeExecutiveSummarySheet,
  });
});
