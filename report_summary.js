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
    { header: "RESULTADO DA BUSCA COM/SEM nt-", key: "ntSearchResult", width: 38 },
    { header: "PESQUISADO SEM nt-", key: "searchedWithoutNt", width: 45 },
    { header: "PESQUISADO COM nt-", key: "searchedWithNt", width: 45 },
    { header: "CÓDIGO ENCONTRADO NA LD", key: "ldDocument", width: 45 },
    { header: "FORMA LOCALIZADA NA LD", key: "ldDocumentForm", width: 22 },
    { header: "PESQUISA COM/SEM nt- NA LD", key: "ntLookup", width: 68 },
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

  // A primeira aba do relatório precisa permitir uma decisão rápida mesmo
  // quando a relação contém milhares de documentos. A auditoria completa
  // continua disponível em COLUMNS, mas o Resumo usa somente as evidências que
  // determinam a ação do operador.
  const EXECUTIVE_COLUMNS = Object.freeze([
    { header: "SITUAÇÃO GRCON", key: "decision", width: 24 },
    { header: "CÓDIGO INFORMADO / PDF", key: "requestedDocument", width: 42 },
    { header: "PESQUISADO SEM nt-", key: "searchedWithoutNt", width: 43 },
    { header: "PESQUISADO COM nt-", key: "searchedWithNt", width: 43 },
    { header: "CÓDIGO ENCONTRADO NA LD", key: "ldDocument", width: 43 },
    { header: "RESULTADO DA BUSCA COM/SEM nt-", key: "ntSearchResult", width: 38 },
    { header: "ALOCADO?", key: "allocated", width: 23 },
    // O número da alocação decide para qual pacote o documento vai, então
    // precisa estar à vista no Resumo, e não só na auditoria detalhada.
    { header: "ALOCAÇÃO", key: "allocation", width: 27 },
    { header: "RENOMEAÇÃO DE → PARA", key: "renameForEgrdt", width: 66 },
    { header: "ARQUIVO FINAL", key: "finalFile", width: 42 },
    { header: "INCLUÍDO NA EGRDT?", key: "included", width: 22 },
    { header: "MOTIVO / AÇÃO NECESSÁRIA", key: "executiveAction", width: 72 },
    { header: "EVIDÊNCIA NA LD", key: "ldEvidence", width: 48 },
  ]);

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
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

  function allocationLabel(row) {
    const record = row && row.record || {};
    const raw = text(record.allocationStatus || row && row.allocationStatus);
    const allocationNumber = text(record.allocation);
    if (C && C.allocationState) {
      const state = C.allocationState(raw);
      if (state.kind === "allocated") return "SIM — Alocado";
      if (state.kind === "not_allocated") return "NÃO — Não alocado";
      if (state.kind === "unknown") return `REVISAR — ${state.label}`;
      if (allocationNumber) return "SIM — alocação informada";
      return "Não informado";
    }
    if (raw) return raw;
    return allocationNumber ? "SIM — alocação informada" : "Não informado";
  }


  function allocationReason(row) {
    const record = row && row.record || {};
    const allocationEvidence = record.allocationEvidence || null;
    const evidenceRecord = allocationEvidence || record;
    const raw = text(record.allocationStatus || row && row.allocationStatus);
    const state = C && C.allocationState ? C.allocationState(raw) : { kind: raw ? "unknown" : "empty", label: raw || "Não informado" };
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
    const info = row && row.ntRename;
    if (info) {
      return [
        "SIM — RENOMEADO PARA SEGUIR A LD.",
        `De: ${text(info.enviado)}.`,
        `Para: ${text(info.naLd)}.`,
        text(info.finalName || row && row.finalName) ? `Nome final no pacote/eGRDT: ${text(info.finalName || row && row.finalName)}.` : "",
      ].filter(Boolean).join(" ");
    }
    if (!lookup.appliesToNtRule) return "NÃO SE APLICA — a regra com/sem nt- é exclusiva dos documentos ET.";
    if (!lookup.matched) return "NÃO — não foi possível renomear porque o documento não foi localizado na LD em nenhuma das duas formas.";
    return `NÃO — o código informado já coincide com a forma da LD${text(row && row.finalName) ? `; nome final: ${text(row.finalName)}` : ""}.`;
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
      const ready = row && !row.hardBlock && row.decision === (C && C.READY || "pronto");
      const notice = row && row.ldConflict && row.ldConflict.hasNotice && row.ldConflict.noticeSummary
        ? ` ${row.ldConflict.noticeSummary}`
        : "";
      const included = ready
        ? "SIM"
        : row && row.hardBlock
          ? "NÃO — BLOQUEADO"
          : row && row.decision === (C && C.DISCARD || "descartar")
            ? "NÃO — EM ANÁLISE"
            : "PENDENTE";
      return {
        decision: decisionLabel(row),
        requestedDocument: text(row && row.documentLookup && row.documentLookup.inputDocument || row && row.name),
        document: text(row && row.document),
        ntSearchResult: text(row && row.documentLookup && row.documentLookup.resultLabel) || "PESQUISA NÃO REGISTRADA",
        searchedWithoutNt: text(row && row.documentLookup && row.documentLookup.searchedWithoutNt) || "Não se aplica",
        searchedWithNt: text(row && row.documentLookup && row.documentLookup.searchedWithNt) || "Não se aplica",
        ldDocument: text(row && row.documentLookup && row.documentLookup.ldDocument) || "Não localizado",
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
        grdt: grdtValue(row, record),
        effectiveDate: effectiveDateValue(row, record),
        postingStatus: text(row && row.postingStatus || row && row.postingEvidence && row.postingEvidence.status) || "Sem evidência de postagem na LD",
        postingEvidence: text(row && row.postingEvidence && row.postingEvidence.explanation),
        postingRevisionStatus: text(row && row.status),
        included,
        databook: text(record.databook),
        observation: `${decisionObservation(row)}${notice}`.trim(),
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
      ["COMO LER A PESQUISA COM/SEM nt-", "FF153A5C", "FFFFFFFF", true],
      ["Somente documentos ET: para cada código, o GRCON pesquisa na LD a forma sem nt- e a forma com nt- no início do 7º grupo.", "FFEAF2F8", "FF234B6B", false],
      ["Quando a outra forma é encontrada, a coluna “RENOMEAÇÃO PARA ENTRAR NA EGRDT” mostra claramente DE → PARA. O arquivo final sempre usa o código exatamente como está na LD.", "FFFFF3CF", "FF7A5300", false],
      ["Documentos N-1710 não usam nt-: nesses casos o relatório mostra “NÃO SE APLICA” e pesquisa somente o código informado.", "FFF2F4F6", "FF52687B", false],
    ]);
  }

  function writeExecutiveGuide(worksheet, startRow, lastColumn) {
    return writeGuide(worksheet, startRow, lastColumn, [
      ["LEITURA RÁPIDA DO RESULTADO", "FF153A5C", "FFFFFFFF", true],
      ["Use esta aba para decidir o que entra na eGRDT. A aba “Auditoria detalhada” preserva todas as colunas técnicas e evidências da LD.", "FFEAF2F8", "FF234B6B", false],
      ["Amarelo indica que o código ET foi localizado na outra forma e será renomeado exatamente como está na LD. Vermelho indica bloqueio ou ausência nas duas formas.", "FFFFF3CF", "FF7A5300", false],
    ]);
  }

  function executiveRows(rows) {
    return (rows || []).map((item) => {
      const included = text(item.included).toUpperCase();
      const allocated = text(item.allocated).toUpperCase();
      const lookup = text(item.ntSearchResult).toUpperCase();
      let executiveAction = text(item.observation);
      if (allocated.includes("NÃO") && allocated.includes("ALOCADO")) {
        executiveAction = "NÃO INCLUIR NA EGRDT. A forma encontrada na LD está marcada como não alocada. Regularize a alocação e analise novamente. Consulte a aba “Auditoria detalhada” para a célula, o comentário da Fiscal e as demais evidências.";
      } else if (included === "SIM") {
        executiveAction = text(item.renameForEgrdt).toUpperCase().startsWith("SIM")
          ? "INCLUIR NA EGRDT. O documento está alocado e foi encontrado na outra forma; use o arquivo final renomeado exatamente como está na LD."
          : "INCLUIR NA EGRDT. O documento está alocado e o código informado já coincide com a forma da LD.";
      } else if (lookup.includes("NÃO LOCALIZADO") || lookup.includes("NAO LOCALIZADO")) {
        executiveAction = "NÃO LOCALIZADO NA LD. O GRCON pesquisou as formas sem nt- e com nt-. Confira o código e a versão da LD antes de analisar novamente.";
      }
      return {
        ...item,
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
    const titleRow = settings.executive
      ? writeExecutiveGuide(worksheet, sectionStart, lastColumn)
      : writeNtGuide(worksheet, sectionStart, lastColumn);
    const headerRow = titleRow + 1;
    const dataStart = headerRow + 1;

    worksheet.mergeCells(`A${titleRow}:${lastColumn}${titleRow}`);
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
    return { titleRow, headerRow, dataStart, lastColumn, columns, rows };
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

  function styleTableRow(row, item, rowIndex, columns) {
    styleBaseRow(row, item, rowIndex, columns);
    styleDecisionCell(row);
    styleSearchCell(row, columns);
    styleAllocationCell(row, columns);
    styleRenameCells(row, columns);
    styleIncludedCell(row, columns);
  }

  function finishTable(worksheet, layout, rowCount) {
    const finalRow = Math.max(layout.headerRow, layout.dataStart + rowCount - 1);
    worksheet.autoFilter = { from: `A${layout.headerRow}`, to: `${layout.lastColumn}${finalRow}` };
    worksheet.views = [{ state: "frozen", ySplit: layout.headerRow, activeCell: `A${layout.dataStart}`, showGridLines: false, zoomScale: 80 }];
    return { ...layout, finalRow };
  }

  function writeRows(worksheet, rows, layout) {
    rows.forEach((item, rowIndex) => {
      const row = worksheet.getRow(layout.dataStart + rowIndex);
      styleTableRow(row, item, rowIndex, layout.columns);
    });
    return finishTable(worksheet, layout, rows.length);
  }

  async function writeRowsAsync(worksheet, rows, layout) {
    for (let start = 0; start < rows.length; start += 300) {
      const end = Math.min(rows.length, start + 300);
      for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
        const item = rows[rowIndex];
        const row = worksheet.getRow(layout.dataStart + rowIndex);
        styleTableRow(row, item, rowIndex, layout.columns);
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

  function writeExecutiveTable(worksheet, rows, startRow) {
    const source = executiveRows(rows);
    return writeRows(worksheet, source, prepareTable(worksheet, source, startRow, EXECUTIVE_COLUMNS, { executive: true, title: "RESUMO EXECUTIVO POR DOCUMENTO" }));
  }

  async function writeExecutiveTableAsync(worksheet, rows, startRow) {
    const source = executiveRows(rows);
    const layout = prepareTable(worksheet, source, startRow, EXECUTIVE_COLUMNS, { executive: true, title: "RESUMO EXECUTIVO POR DOCUMENTO" });
    if (!Large || !Large.pause || source.length <= 600) return writeRows(worksheet, source, layout);
    return writeRowsAsync(worksheet, source, layout);
  }

  return Object.freeze({
    COLUMNS,
    EXECUTIVE_COLUMNS,
    allocationReason,
    buildRows,
    buildRowsAsync,
    executiveRows,
    writeTable,
    writeTableAsync,
    writeExecutiveTable,
    writeExecutiveTableAsync,
  });
});
