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
    { header: "RESULTADO DA BUSCA COM/SEM NT-", key: "ntSearchResult", width: 38 },
    { header: "PESQUISADO SEM NT-", key: "searchedWithoutNt", width: 45 },
    { header: "PESQUISADO COM NT-", key: "searchedWithNt", width: 45 },
    { header: "CÓDIGO ENCONTRADO NA LD", key: "ldDocument", width: 45 },
    { header: "FORMA LOCALIZADA NA LD", key: "ldDocumentForm", width: 22 },
    { header: "PESQUISA COM/SEM NT- NA LD", key: "ntLookup", width: 68 },
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

  // Posições de coluna usadas na estilização condicional. Calculadas a
  // partir de COLUMNS (em vez de números fixos) para não quebrar se a
  // ordem das colunas mudar novamente no futuro.
  const ALLOCATED_COLUMN = COLUMNS.findIndex((column) => column.key === "allocated") + 1;
  const ALLOCATION_REASON_COLUMN = COLUMNS.findIndex((column) => column.key === "allocationReason") + 1;
  const NT_RESULT_COLUMN = COLUMNS.findIndex((column) => column.key === "ntSearchResult") + 1;
  const NT_RENAME_COLUMN = COLUMNS.findIndex((column) => column.key === "renameForEgrdt") + 1;

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
    if (!lookup.appliesToNtRule) return "NÃO SE APLICA — a regra com/sem NT- é exclusiva dos documentos ET.";
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

  function writeNtGuide(worksheet, startRow, lastColumn) {
    const guideRow = Number(startRow) || 22;
    const lines = [
      ["COMO LER A PESQUISA COM/SEM NT-", "FF153A5C", "FFFFFFFF", true],
      ["Somente documentos ET: para cada código, o GRCON pesquisa na LD a forma sem NT- e a forma com NT- no início do 7º grupo.", "FFEAF2F8", "FF234B6B", false],
      ["Quando a outra forma é encontrada, a coluna “RENOMEAÇÃO PARA ENTRAR NA EGRDT” mostra claramente DE → PARA. O arquivo final sempre usa o código exatamente como está na LD.", "FFFFF3CF", "FF7A5300", false],
      ["Documentos N-1710 não usam NT-: nesses casos o relatório mostra “NÃO SE APLICA” e pesquisa somente o código informado.", "FFF2F4F6", "FF52687B", false],
    ];
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

  function writeTable(worksheet, rows, startRow) {
    const sectionStart = Number(startRow) || 22;
    const lastColumn = columnLetter(COLUMNS.length);
    const titleRow = writeNtGuide(worksheet, sectionStart, lastColumn);
    const headerRow = titleRow + 1;
    const dataStart = headerRow + 1;

    worksheet.mergeCells(`A${titleRow}:${lastColumn}${titleRow}`);
    const title = worksheet.getCell(titleRow, 1);
    title.value = "RESUMO POR DOCUMENTO";
    title.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
    title.alignment = { vertical: "middle", horizontal: "left" };
    worksheet.getRow(titleRow).height = 24;

    COLUMNS.forEach((column, index) => {
      const cell = worksheet.getCell(headerRow, index + 1);
      cell.value = column.header;
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB7C8D6" } } };
      worksheet.getColumn(index + 1).width = column.width;
    });
    worksheet.getRow(headerRow).height = 34;

    rows.forEach((item, rowIndex) => {
      const row = worksheet.getRow(dataStart + rowIndex);
      COLUMNS.forEach((column, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        const value = item[column.key];
        cell.value = value === "" || value === null || value === undefined ? null : value;
        cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
        if (rowIndex % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
      const longestText = Math.max(...COLUMNS.map((column) => text(item[column.key]).length), 0);
      row.height = Math.min(96, Math.max(34, 20 + Math.ceil(longestText / 78) * 14));

      const decisionCell = row.getCell(1);
      const decisionColors = statusPalette(decisionCell.value);
      decisionCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: decisionColors[0] } };
      decisionCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: decisionColors[1] } };

      const ntResultCell = row.getCell(NT_RESULT_COLUMN);
      const ntResultColors = ntSearchPalette(ntResultCell.value);
      ntResultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ntResultColors[0] } };
      ntResultCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: ntResultColors[1] } };

      const allocationCell = row.getCell(ALLOCATED_COLUMN);
      const allocationColors = allocationPalette(allocationCell.value);
      allocationCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: allocationColors[0] } };
      allocationCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: allocationColors[1] } };
      if ((C && C.norm ? C.norm(allocationCell.value) : text(allocationCell.value).toUpperCase()).includes("NAO")) {
        const reasonCell = row.getCell(ALLOCATION_REASON_COLUMN);
        reasonCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7F4" } };
        reasonCell.font = { name: "Aptos", size: 9, color: { argb: "FF7A342D" } };
      }

      // O ajuste de "nt-" muda o nome do arquivo postado, então precisa saltar
      // aos olhos de quem confere o relatório, e não se perder entre as colunas.
      const ntCell = row.getCell(COLUMNS.findIndex((column) => column.key === "ntAdjustment") + 1);
      if (text(ntCell.value)) {
        ntCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CF" } };
        ntCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF7A5300" } };
      }

      const renameCell = row.getCell(NT_RENAME_COLUMN);
      if ((C && C.norm ? C.norm(renameCell.value) : text(renameCell.value).toUpperCase()).startsWith("SIM")) {
        renameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE7B3" } };
        renameCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF7A5300" } };
      }

      const includedCell = row.getCell(COLUMNS.findIndex((column) => column.key === "included") + 1);
      const included = text(includedCell.value).toUpperCase() === "SIM";
      includedCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: included ? "FFEAF7F1" : "FFFFF5DF" } };
      includedCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: included ? "FF0C7657" : "FFA56812" } };
      includedCell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const finalRow = Math.max(headerRow, dataStart + rows.length - 1);
    worksheet.autoFilter = { from: `A${headerRow}`, to: `${lastColumn}${finalRow}` };
    worksheet.views = [{ state: "frozen", ySplit: headerRow, activeCell: `A${dataStart}`, showGridLines: false, zoomScale: 80 }];
    return { titleRow, headerRow, dataStart, finalRow, lastColumn };
  }

  async function writeTableAsync(worksheet, rows, startRow) {
    if (!Large || !Large.pause || (rows || []).length <= 600) return writeTable(worksheet, rows, startRow);
    const sectionStart = Number(startRow) || 22;
    const lastColumn = columnLetter(COLUMNS.length);
    const titleRow = writeNtGuide(worksheet, sectionStart, lastColumn);
    const headerRow = titleRow + 1;
    const dataStart = headerRow + 1;

    worksheet.mergeCells(`A${titleRow}:${lastColumn}${titleRow}`);
    const title = worksheet.getCell(titleRow, 1);
    title.value = "RESUMO POR DOCUMENTO";
    title.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
    title.alignment = { vertical: "middle", horizontal: "left" };
    worksheet.getRow(titleRow).height = 24;
    COLUMNS.forEach((column, index) => {
      const cell = worksheet.getCell(headerRow, index + 1);
      cell.value = column.header;
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB7C8D6" } } };
      worksheet.getColumn(index + 1).width = column.width;
    });
    worksheet.getRow(headerRow).height = 34;

    for (let start = 0; start < rows.length; start += 300) {
      const end = Math.min(rows.length, start + 300);
      for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
        const item = rows[rowIndex];
        const row = worksheet.getRow(dataStart + rowIndex);
        COLUMNS.forEach((column, columnIndex) => {
          const cell = row.getCell(columnIndex + 1);
          const value = item[column.key];
          cell.value = value === "" || value === null || value === undefined ? null : value;
          cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
          cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
          cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
          if (rowIndex % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        });
        const longestText = Math.max(...COLUMNS.map((column) => text(item[column.key]).length), 0);
        row.height = Math.min(96, Math.max(34, 20 + Math.ceil(longestText / 78) * 14));
        const decisionCell = row.getCell(1);
        const decisionColors = statusPalette(decisionCell.value);
        decisionCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: decisionColors[0] } };
        decisionCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: decisionColors[1] } };
        const ntResultCell = row.getCell(NT_RESULT_COLUMN);
        const ntResultColors = ntSearchPalette(ntResultCell.value);
        ntResultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ntResultColors[0] } };
        ntResultCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: ntResultColors[1] } };
        const allocationCell = row.getCell(ALLOCATED_COLUMN);
        const allocationColors = allocationPalette(allocationCell.value);
        allocationCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: allocationColors[0] } };
        allocationCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: allocationColors[1] } };
        // O ajuste de "nt-" muda o nome do arquivo postado, então precisa saltar
      // aos olhos de quem confere o relatório, e não se perder entre as colunas.
      const ntCell = row.getCell(COLUMNS.findIndex((column) => column.key === "ntAdjustment") + 1);
      if (text(ntCell.value)) {
        ntCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CF" } };
        ntCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF7A5300" } };
      }


      const renameCell = row.getCell(NT_RENAME_COLUMN);
      if ((C && C.norm ? C.norm(renameCell.value) : text(renameCell.value).toUpperCase()).startsWith("SIM")) {
        renameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE7B3" } };
        renameCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF7A5300" } };
      }

      const includedCell = row.getCell(COLUMNS.findIndex((column) => column.key === "included") + 1);
        const included = text(includedCell.value).toUpperCase() === "SIM";
        includedCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: included ? "FFEAF7F1" : "FFFFF5DF" } };
        includedCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: included ? "FF0C7657" : "FFA56812" } };
        includedCell.alignment = { vertical: "middle", horizontal: "center" };
      }
      if (end < rows.length) await Large.pause();
    }
    const finalRow = Math.max(headerRow, dataStart + rows.length - 1);
    worksheet.autoFilter = { from: `A${headerRow}`, to: `${lastColumn}${finalRow}` };
    worksheet.views = [{ state: "frozen", ySplit: headerRow, activeCell: `A${dataStart}`, showGridLines: false, zoomScale: 80 }];
    return { titleRow, headerRow, dataStart, finalRow, lastColumn };
  }

  return Object.freeze({ COLUMNS, allocationReason, buildRows, buildRowsAsync, writeTable, writeTableAsync });
});
