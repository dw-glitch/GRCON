(function (root, factory) {
  const History = root.GrconHistory || (typeof module === "object" && module.exports ? require("./history_core.js") : null);
  const getExcel = () => root.ExcelJS || (typeof module === "object" && module.exports ? require("./exceljs.min.js") : null);
  const api = factory(History, getExcel, root.GRCONBrandAssets || null);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconHistoryReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History, getExcel, defaultBrand) {
  "use strict";

  const _U = (typeof globalThis !== "undefined" ? globalThis : this).GrconUtils || {};
  function text(value) { return _U.text ? _U.text(value) : (History ? History.text(value) : String(value == null ? "" : value).trim()); }
  function norm(value) { return _U.norm ? _U.norm(value) : (History ? History.norm(value) : text(value).toUpperCase()); }
  function pad(value, size = 2) { return _U.pad ? _U.pad(value, size) : String(value).padStart(size, "0"); }
  function compactStamp(date = new Date()) { return _U.compactStamp ? _U.compactStamp(date) : `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`; }
  function formatDate(value, withTime = true) {
    if (_U.formatDate) return _U.formatDate(value, withTime);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }
  function formatDateOnlyBR(value) {
    if (_U.formatDateOnlyBR) return _U.formatDateOnlyBR(value);
    if (value instanceof Date && !Number.isNaN(value.getTime())) return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
    const raw = text(value);
    let match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (match) return `${pad(match[1])}/${pad(match[2])}/${match[3]}`;
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      const date = new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000);
      if (!Number.isNaN(date.getTime())) return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
    }
    return raw || "—";
  }
  function periodLabel(records, startDate, endDate) {
    const bounds = History && History.periodBounds ? History.periodBounds(records) : { start: "", end: "" };
    const start = text(startDate) || bounds.start;
    const end = text(endDate) || bounds.end;
    if (!start && !end) return "Todo o histórico disponível";
    const display = (value) => {
      const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : value || "—";
    };
    return `${display(start)} a ${display(end)}`;
  }
  function filterRecords(records, startDate, endDate, documentFamily) {
    const dated = History && History.filterByDate ? History.filterByDate(records || [], startDate, endDate) : [...(records || [])];
    return History && History.filterByDocumentFamily ? History.filterByDocumentFamily(dated, documentFamily) : dated;
  }
  function familyLabel(value) {
    const family = History && History.normalizedHistoryFamily ? History.normalizedHistoryFamily(value) : text(value);
    return family || "Todos";
  }
  function fileFamily(file) {
    return History && History.documentFamily ? History.documentFamily(file) : "";
  }
  function recordFamily(record) {
    const families = History && History.recordFamilies ? History.recordFamilies(record) : [];
    return families.length ? families.join(" · ") : "Não identificado";
  }
  function allocationReason(file) {
    const status = text(file && file.allocationStatus);
    const allocation = text(file && file.allocation);
    const stage = text(file && file.allocationStage);
    const fiscal = text(file && file.fiscalComment);
    const normalized = norm(status);
    if (normalized.includes("NAO ALOCADO")) {
      const reason = fiscal && !/^(OK|ACEITO SEM COMENTARIOS?|SEM COMENTARIOS?)$/.test(norm(fiscal))
        ? `Motivo registrado pela Fiscal: ${fiscal}.`
        : "A linha do histórico não registra um motivo operacional conclusivo para a não alocação.";
      const number = allocation ? ` Existe o número ${allocation}, mas a confirmação permanece “${status}”.` : " Nenhum número de alocação foi registrado.";
      const phase = stage && !/^(0|N\/A|NA|-)$/.test(norm(stage)) ? ` Etapa: ${stage}.` : "";
      return `${reason}${number}${phase}`.trim();
    }
    if (normalized.includes("ALOCADO") && !normalized.includes("NAO")) {
      return `Alocação confirmada${allocation ? ` pelo número ${allocation}` : ""}${stage && !/^(0|N\/A|NA|-)$/.test(norm(stage)) ? `, etapa ${stage}` : ""}.`;
    }
    if (allocation) return `Número de alocação informado: ${allocation}; confirmação não registrada no histórico.`;
    return "Situação de alocação não registrada no histórico local desta emissão.";
  }
  function uniqueAllocations(records) {
    return new Set((records || []).flatMap((record) => record.allocations || []).map(norm).filter(Boolean)).size;
  }
  function extractDisciplines(record) {
    const disciplines = new Set();
    (record.files || []).forEach((file) => {
      const discipline = text(file.discipline);
      if (discipline) disciplines.add(discipline);
    });
    return [...disciplines].sort().join(" · ");
  }
  function grdtRevision(file) {
    return text(file && file.grdtRevision) || text(file && file.revision) || text(History && History.generatedRevision && History.generatedRevision(file));
  }
  function generatedRevisions(record) {
    const items = (record && record.files || []).map((file) => {
      const revision = grdtRevision(file);
      if (!revision) return "";
      return `${text(file.document) || "Documento"} · Rev. ${revision}`;
    }).filter(Boolean);
    return [...new Set(items)].join(" | ");
  }
  function generatedPurposes(record) {
    const items = (record && record.files || []).map((file) => text(file && file.purpose)).filter(Boolean);
    return [...new Set(items)].join(" · ") || "Não registrado";
  }
  const Trace = globalThis.GrconTeamsTraceCore || (typeof module === "object" && module.exports ? require("./egrdt_teams_trace_core.js") : null);
  function egrdtRows(records, traceOptions = {}) {
    const attempts = Trace?.index(traceOptions.teamsAttempts || globalThis.GrconTeamsTrace?.snapshot?.() || []);
    return (records || []).map((record) => ({
      "DATA DA GERAÇÃO / POSTAGEM": formatDate(record.generatedAt, true),
      "EGRDT": text(record.egrdtNumber),
      "TIPO DE SAÍDA": text(record.outputType),
      "FAMÍLIA DOCUMENTAL": recordFamily(record),
      "DOCUMENTOS": Number(record.documentCount || 0),
      "ARQUIVOS": Number(record.fileCount || 0),
      "REVISÕES ENVIADAS NA GRDT (DOCUMENTO · REVISÃO)": generatedRevisions(record),
      "PROPÓSITO(S) DA GRDT": generatedPurposes(record),
      "DISCIPLINAS": extractDisciplines(record),
      "ALOCAÇÕES": (record.allocations || []).join(" · "),
      "LD UTILIZADA": text(record.ldName),
      "ORIGEM DOS DOCUMENTOS": text(record.sourceName),
      "NÚMEROS ANTERIORES": (record.numberHistory || []).join(" · "),
      ...(Trace?.columns(Trace.attemptsFor(record, attempts, traceOptions.workspaceId)[0], null, traceOptions.teamsSigemEvidence?.[record.id], {status:traceOptions.teamsTraceStatus,lastSuccessfulSync:traceOptions.teamsLastSuccessfulSync}) || {}),
    }));
  }
  function documentRows(records, traceOptions = {}) {
    const attempts = Trace?.index(traceOptions.teamsAttempts || globalThis.GrconTeamsTrace?.snapshot?.() || []);
    return (records || []).flatMap((record) => (record.files || []).map((file) => {
      return {
      "DATA DA GERAÇÃO / POSTAGEM": formatDate(record.generatedAt, true),
      "EGRDT": text(record.egrdtNumber),
      "TIPO DE SAÍDA": text(record.outputType),
      "PROPÓSITO": text(file.purpose) || "Não registrado",
      "FAMÍLIA DOCUMENTAL": fileFamily(file) || "Não identificado",
      "DOCUMENTO": text(file.document),
      "TÍTULO": text(file.title),
      "DISCIPLINA": text(file.discipline),
      "ARQUIVO ORIGINAL": text(file.originalName),
      "ARQUIVO POSTADO": text(file.finalName),
      "REVISÃO ENVIADA NA GRDT": grdtRevision(file),
      "FONTE DA REVISÃO ENVIADA": text(file.revisionSource) || "Histórico registrado",
      "DATA EFETIVA DE EMISSÃO": formatDateOnlyBR(file.effectiveDate),
      "GRDT ANTERIOR NA LD": text(file.grdt),
      "STATUS SIGEM": text(file.sigemStatus),
      "CONFIRMAÇÃO DE DOCUMENTOS PREVISTOS": text(file.allocationStatus),
      "POR QUE ESTÁ / NÃO ESTÁ ALOCADO?": allocationReason(file),
      "ALOCAÇÃO": text(file.allocation),
      "ETAPA DA ALOCAÇÃO": text(file.allocationStage),
      "COMENTÁRIO DA FISCAL": text(file.fiscalComment),
      "ABA LD": text(file.sheet),
      "LINHA LD": Number(file.ldRow) || "",
      "VERSÃO DA LD ENVIADA": text(file.ldPrazo),
      "CAMINHO DATABOOK": text(file.databook),
      "VERSÃO DA VALIDAÇÃO NORMATIVA": text(file.normativeValidation?.normativeValidationVersion) || "Não registrada",
      "NORMAS APLICADAS": (file.normativeValidation?.normsApplied || []).map(item => `${item.norm} ${item.part || "body"} Rev. ${item.revision}`).join(" · "),
      "ALERTAS NORMATIVOS": (file.normativeValidation?.warnings || []).map(item => item.message).join(" · "),
      "BLOQUEIOS NORMATIVOS": (file.normativeValidation?.blocks || []).map(item => item.message).join(" · "),
      "LD UTILIZADA": text(record.ldName),
      "ORIGEM DOS DOCUMENTOS": text(record.sourceName),
      "CLASSIFICAÇÃO DA EMISSÃO": text(file.historyClassification?.label) || "Não registrada",
      "TIPO DE EMISSÃO": text(file.historyClassification?.emissionKind),
      "GRDT ANTERIOR NO HISTÓRICO": text(file.historyClassification?.previousGrdt),
      "REVISÃO ANTERIOR NO HISTÓRICO": text(file.historyClassification?.previousRevision),
      "DATA ANTERIOR NO HISTÓRICO": text(file.historyClassification?.previousGeneratedAt),
      "REPOSTAGENS ANTERIORES": file.historyClassification?.repostCount ?? "",
      "ALERTAS HISTÓRICOS": (file.historyClassification?.warnings || []).join(" · "),
      "STATUS NA CENTRAL DE ALOCAÇÃO": (file.sharedAllocationContext?.references || []).map(item => `${item.allocation}: ${item.allocationStatus}`).join(" · "),
      "BASE CENTRAL DE ALOCAÇÃO": text(file.sharedAllocationContext?.centralFileName),
      "ORIGEM DO ARQUIVO UTILIZADO": file.fileProvenance?.source === "cofre" ? "Cofre" : file.fileProvenance?.source === "local" ? "Pasta local" : "Não registrada",
      "NOME DO ARQUIVO UTILIZADO": text(file.fileProvenance?.fileName),
      "REVISÃO DO ARQUIVO UTILIZADO": text(file.fileProvenance?.revision),
      "FORMATO DO ARQUIVO UTILIZADO": text(file.fileProvenance?.format),
      "TAMANHO DO ARQUIVO (BYTES)": file.fileProvenance?.sizeBytes ?? "",
      "ID DO ARQUIVO NO COFRE": text(file.fileProvenance?.vaultFileId),
      "SEQUÊNCIA DO CATÁLOGO COFRE": file.fileProvenance?.catalogSequence || "",
      "VERSÃO DO ARQUIVO NO COFRE": file.fileProvenance?.fileVersion || "",
      "SHA-256 DO ARQUIVO UTILIZADO": text(file.fileProvenance?.sha256),
      "INCLUSÃO NO COFRE": text(file.fileProvenance?.createdAt),
      "VERIFICAÇÃO NO COFRE": text(file.fileProvenance?.verifiedAt),
      ...(Trace?.columns(Trace.attemptsFor(record, attempts, traceOptions.workspaceId)[0], file, traceOptions.teamsSigemEvidence?.[record.id], {status:traceOptions.teamsTraceStatus,lastSuccessfulSync:traceOptions.teamsLastSuccessfulSync}) || {}),
      "LASTMODIFIED DO ARQUIVO LOCAL": file.fileProvenance?.lastModified || "",
      };
    }));
  }
  // Contrato operacional único: Colar GRCON v2. Preservar as seis colunas,
  // seus tipos e as linhas iniciais utilizadas pelo Controle de Solicitações.
  const COLAR_GRCON_HEADERS_V2 = Object.freeze([
    "DATA DA GERAÇÃO / POSTAGEM",
    "EGRDT",
    "DOCUMENTO",
    "REVISÃO ENVIADA NA GRDT",
    "VERSÃO DA LD ENVIADA",
    "ALOCAÇÃO",
  ]);

  // O Excel não conserva fuso horário em células de data. Converter o instante
  // armazenado no histórico para a hora civil local que o GRCON já mostra no
  // relatório detalhado, mas manter um valor numérico de data/hora no Excel.
  function pasteExcelDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(Date.UTC(
      date.getFullYear(), date.getMonth(), date.getDate(),
      date.getHours(), date.getMinutes(), date.getSeconds()
    ));
  }

  // Alocação capturada na emissão, sem reinterpretar a Central atual.
  function colarGrconRowsV2(records) {
    return (records || []).flatMap(record => (record.files || []).map(file => [
      pasteExcelDate(record.generatedAt), text(record.egrdtNumber),
      text(file.document), grdtRevision(file), text(file.ldPrazo), pasteAllocation(file.allocation),
    ]));
  }

  function pasteAllocation(value) {
    const allocation = text(value);
    return /^(?:#N\/A|N\/A|NA|0|—|-|NÃO ALOCADO|NÃO IDENTIFICADO)$/i.test(allocation) ? "" : allocation;
  }

  function addColarGrconSheetV2(workbook, records) {
    const sheet = workbook.addWorksheet("Colar GRCON v2", {
      properties: { defaultRowHeight: 16 },
      views: [{ state: "frozen", ySplit: 2, activeCell: "A3", showGridLines: false, zoomScale: 85 }],
    });
    sheet.columns = [24, 42, 49, 28, 31, 33].map(width => ({ width }));
    sheet.getCell("A1").value = "COLAR GRCON";
    sheet.getRow(1).height = 29.25;
    sheet.getRow(2).height = 29.25;
    const titleFont = { name: "Aptos Narrow", size: 22, bold: true, color: { argb: "FF0E2841" } };
    sheet.getCell("A1").font = titleFont;
    sheet.getCell("C1").font = titleFont;
    const rows = colarGrconRowsV2(records);
    const dates = rows.map(row => row[0]).filter(value => value instanceof Date);
    if (dates.length) {
      sheet.getCell("C1").value = new Date(dates.reduce((latest, date) => Math.max(latest, date.getTime()), 0));
      sheet.getCell("C1").numFmt = "dd/mm/yyyy";
    }
    COLAR_GRCON_HEADERS_V2.forEach((header, index) => {
      const cell = sheet.getCell(2, index + 1);
      cell.value = header;
      cell.font = { name: "Aptos Narrow", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    });
    rows.forEach((values, index) => {
      const row = sheet.getRow(index + 3);
      row.height = 16;
      values.forEach((value, column) => {
        const cell = row.getCell(column + 1);
        cell.value = value === "" ? null : value;
        cell.font = { name: "Aptos Narrow", size: 11, color: { argb: "FF000000" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAEAEAE" } };
        cell.alignment = { vertical: "top", wrapText: true };
      });
      row.getCell(1).numFmt = "dd/mm/yyyy hh:mm:ss";
    });
    sheet.autoFilter = { from: "A2", to: `F${Math.max(3, rows.length + 2)}` };
    return sheet;
  }


  // V3 complements the immutable V2 contract. It does not alter the legacy
  // paste layout (A:F), which existing operational spreadsheets still expect.
  const COLAR_GRCON_HEADERS_V3 = Object.freeze([
    ...COLAR_GRCON_HEADERS_V2,
    "STATUS DA CONFERÊNCIA",
    "POSTADO NO SIGEM?",
    "REVISÃO VERIFICADA NO SIGEM",
    "DATA DE REFERÊNCIA DA CONSULTA GERAL",
    "SNAPSHOT DA CONSULTA GERAL",
  ]);

  function conferenceRowKey(conference, record, document, revision) {
    return [
      text(record && record.egrdtNumber),
      text(record && record.generatedAt),
      conference.documentIdentity(document),
      conference.normalizeRevision(revision),
    ].join("|");
  }

  // Use the same reconciliation engine as the Conferência, not a second status
  // calculator. No history event or GRDT generation constitutes proof of posting.
  async function colarGrconRowsV3(records, options) {
    const settings = options || {};
    const root = typeof globalThis === "undefined" ? {} : globalThis;
    const conference = settings.conferenceCore || root.GrconPostingConference;
    const source = (records || []);
    const fallback = (status = "NÃO VERIFICADO") => source.flatMap(record =>
      (record.files || []).map(file => [
        pasteExcelDate(record.generatedAt), text(record.egrdtNumber),
        text(file.document), grdtRevision(file), text(file.ldPrazo),
        pasteAllocation(file.allocation), status, "INDETERMINADO", "", "", "",
      ]));
    if (!conference || typeof conference.reconcile !== "function")
      return fallback();

    let base = settings.conferenceBase || null;
    let stale = Boolean(settings.conferenceBaseStale);
    if (!base) {
      const query = root.GrconSharedSigemQuery;
      base = query?.current?.() || null;
      stale = Boolean(base && query?.state?.stale);
      if (!base && typeof conference.loadBase === "function") {
        try { base = await conference.loadBase(); }
        catch (_) { return fallback(); }
      }
    }
    if (!base || !Array.isArray(base.records) || !base.records.length)
      return fallback();
    if (stale) return fallback("NÃO VERIFICADO — BASE DESATUALIZADA");

    const meta = base.meta || {};
    const evaluated = conference.reconcile(source, base.records, null, {
      baseReferenceDate: text(meta.referenceDate),
      waitHours: conference.readPreferences?.().waitHours || conference.DEFAULT_WAIT_HOURS,
      now: settings.now || new Date().toISOString(),
    });
    const byEvent = new Map();
    for (const row of evaluated.rows || []) {
      byEvent.set(conferenceRowKey(conference, row, row.document, row.revisionSent), row);
    }
    const labels = {
      CONFIRMADO: "POSTADO",
      AGUARDANDO: "AGUARDANDO CONFIRMAÇÃO",
      REVISAO_DIVERGENTE: "REVISÃO DIVERGENTE",
      NAO_ENCONTRADO: "NÃO LOCALIZADO",
      REQUER_ANALISE: "REQUER ANÁLISE",
      NAO_VERIFICADO: "NÃO VERIFICADO",
    };
    return source.flatMap(record => (record.files || []).map(file => {
      const rev = grdtRevision(file);
      const match = byEvent.get(conferenceRowKey(conference, record, file.document, rev));
      const confirmed = Boolean(match && match.status === conference.STATUSES.CONFIRMED
        && match.currentEvidence && !match.ambiguity);
      return [
        pasteExcelDate(record.generatedAt), text(record.egrdtNumber), text(file.document),
        rev, text(file.ldPrazo), pasteAllocation(file.allocation),
        text(match && labels[match.status]) || "NÃO VERIFICADO",
        confirmed ? "SIM" : "INDETERMINADO",
        match ? text(match.revisionFound) : "",
        text(meta.referenceDate),
        text(meta.snapshotId),
      ];
    }));
  }

  function addColarGrconSheetV3(workbook, rows) {
    const sheet = workbook.addWorksheet("Colar GRCON v3", {
      properties: { defaultRowHeight: 16 },
      views: [{ state: "frozen", ySplit: 2, activeCell: "A3", showGridLines: false, zoomScale: 85 }],
    });
    sheet.columns = [24,42,49,28,31,33,31,22,27,28,37].map(width => ({width}));
    sheet.getCell("A1").value = "COLAR GRCON V3 — CONFERÊNCIA SIGEM";
    sheet.getRow(1).height = 29.25;
    sheet.getRow(2).height = 31;
    const dates = rows.map(row => row[0]).filter(date => date instanceof Date);
    if (dates.length) {
      sheet.getCell("C1").value = new Date(Math.max(...dates.map(date => date.getTime())));
      sheet.getCell("C1").numFmt = "dd/mm/yyyy";
    }
    sheet.getCell("A1").font = {name:"Aptos Narrow",size:17,bold:true,color:{argb:"FF0E2841"}};
    COLAR_GRCON_HEADERS_V3.forEach((header, i) => {
      const cell = sheet.getCell(2, i + 1);
      cell.value = header;
      cell.font = {name:"Aptos Narrow",size:10,bold:true,color:{argb:"FFFFFFFF"}};
      cell.fill = {type:"pattern",pattern:"solid",fgColor:{argb:i >= 6 ? "FF186A76" : "FF1F4E78"}};
      cell.alignment = {horizontal:"left",vertical:"middle",wrapText:true};
    });
    for (let i = 0; i < rows.length; i++) {
      const row = sheet.getRow(i + 3);
      row.values = [null, ...rows[i].map(v => v === "" ? null : v)];
      row.height = 16;
      row.getCell(1).numFmt = "dd/mm/yyyy hh:mm:ss";
      row.getCell(10).numFmt = "@";
      for (let j = 1; j <= COLAR_GRCON_HEADERS_V3.length; j++) {
        const cell = row.getCell(j);
        cell.font = {name:"Aptos Narrow",size:10,color:{argb:"FF172B3B"}};
        cell.fill = {type:"pattern",pattern:"solid",fgColor:{argb:i % 2 ? "FFF1F5F8" : "FFFFFFFF"}};
      }
    }
    sheet.autoFilter = {from:"A2",to:"K" + Math.max(3, rows.length + 2)};
    return sheet;
  }

  function summary(records) {
    const source = records || [];
    return {
      egrdts: source.length,
      documents: source.reduce((total, record) => total + Number(record.documentCount || 0), 0),
      files: source.reduce((total, record) => total + Number(record.fileCount || 0), 0),
      allocations: uniqueAllocations(source),
      first: source.length ? [...source].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))[0].generatedAt : "",
      last: source.length ? [...source].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0].generatedAt : "",
    };
  }
  function columnLetter(number) {
    let n = Number(number) || 1;
    let result = "";
    while (n > 0) { n -= 1; result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26); }
    return result;
  }
  function widthFor(header) {
    const key = norm(header);
    if (/POR QUE|COMENTARIO|CAMINHO|TITULO|ORIGEM|NUMEROS ANTERIORES|PROPOSITO/.test(key)) return 42;
    if (/DOCUMENTO|ARQUIVO|EGRDT|ALOCACAO|LD UTILIZADA/.test(key)) return 30;
    if (/DATA|VERSAO|STATUS|CONFIRMACAO|ETAPA|REVISAO/.test(key)) return 22;
    return 16;
  }
  function styleHeader(row, color = "FF24689A") {
    row.height = 34;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB7C8D6" } } };
    });
  }
  function styleData(row, index) {
    row.height = 34;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF7F9FB" : "FFFFFFFF" } };
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
    });
  }
  async function addLogo(workbook, worksheet, brandAssets) {
    const brand = brandAssets || defaultBrand || {};
    try {
      let imageConfig = null;
      if (brand.reportLogoBase64) imageConfig = { base64: brand.reportLogoBase64, extension: "png" };
      else if (typeof fetch === "function" && brand.reportLogoFile) {
        const response = await fetch(brand.reportLogoFile, { cache: "no-store" });
        if (response.ok) imageConfig = { buffer: await response.arrayBuffer(), extension: "png" };
      }
      if (!imageConfig) return;
      const image = workbook.addImage(imageConfig);
      worksheet.addImage(image, { tl: { col: .12, row: .28 }, ext: { width: 188, height: 52 } });
    } catch (_) { console.debug("[HistoryReport] context:", _); /* relatório continua sem a imagem */ }
  }
  async function addDataSheet(workbook, name, title, rows, metadata, brandAssets) {
    const headers = rows.length ? Object.keys(rows[0]) : ["INFORMAÇÃO"];
    const sheet = workbook.addWorksheet(name, { properties: { defaultRowHeight: 20 }, views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false, zoomScale: 80 }] });
    const last = columnLetter(headers.length);
    for (let row = 1; row <= 3; row += 1) for (let col = 1; col <= headers.length; col += 1) sheet.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
    const titleStart = headers.length > 2 ? "C1" : "A1";
    sheet.mergeCells(`${titleStart}:${last}2`);
    sheet.getCell(titleStart).value = `GRCON · ${title}`;
    sheet.getCell(titleStart).font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell(titleStart).alignment = { vertical: "middle" };
    sheet.mergeCells(`A4:${last}4`);
    sheet.getCell("A4").value = metadata;
    sheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF536679" } };
    sheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
    headers.forEach((header, index) => { sheet.getCell(6, index + 1).value = header; sheet.getColumn(index + 1).width = widthFor(header); });
    styleHeader(sheet.getRow(6));
    rows.forEach((item, index) => {
      const row = sheet.getRow(index + 7);
      headers.forEach((header, column) => { const value = item[header]; row.getCell(column + 1).value = value === "" || value == null ? null : value; });
      styleData(row, index);
    });
    if (rows.length) sheet.autoFilter = { from: "A6", to: `${last}${rows.length + 6}` };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .2, right: .2, top: .4, bottom: .4, header: .2, footer: .2 }, printTitlesRow: "6:6" };
    sheet.headerFooter.oddFooter = "&LGRCON&C&P de &N&R&D";
    await addLogo(workbook, sheet, brandAssets);
    return sheet;
  }
  async function buildWorkbook(records, options) {
    const ExcelJS = getExcel();
    if (!ExcelJS || !ExcelJS.Workbook) throw new Error("Biblioteca ExcelJS indisponível.");
    const settings = options || {};
    const source = filterRecords(records || [], settings.startDate, settings.endDate, settings.documentFamily);
    if (!source.length) throw new Error(`Nenhuma eGRDT da família ${familyLabel(settings.documentFamily)} foi localizada no período selecionado.`);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.lastModifiedBy = "GRCON";
    workbook.company = "CONSAG Engenharia";
    workbook.title = "Relação de eGRDTs por período";
    workbook.created = new Date();
    workbook.modified = new Date();

    const totals = summary(source);
    const period = periodLabel(source, settings.startDate, settings.endDate);
    const selectedFamily = familyLabel(settings.documentFamily);
    const teamsNote = settings.teamsTraceStatus && settings.teamsTraceStatus !== "fresh"
      ? ` · Teams: ${settings.teamsTraceStatus === "stale" ? "dados não atualizados" : "indisponível"}${settings.teamsLastSuccessfulSync ? " (última sincronização: " + formatDate(settings.teamsLastSuccessfulSync, true) + ")" : ""}`
      : "";
    const metadata = `${source.length.toLocaleString("pt-BR")} eGRDT(s) · Período: ${period} · Tipo: ${selectedFamily} · Histórico local do GRCON · ${new Date().toLocaleString("pt-BR")}${teamsNote}`;
    const egrdts = egrdtRows(source, settings);
    const documents = documentRows(source, settings);

    const sheet = workbook.addWorksheet("Resumo", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
    const columns = 12;
    const last = columnLetter(columns);
    sheet.columns = Array.from({ length: columns }, () => ({ width: 15 }));
    for (let row = 1; row <= 3; row += 1) for (let col = 1; col <= columns; col += 1) sheet.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
    sheet.mergeCells(`C1:${last}2`);
    sheet.getCell("C1").value = "GRCON · RELAÇÃO DE eGRDTs POR PERÍODO";
    sheet.getCell("C1").font = { name: "Aptos Display", size: 19, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell("C1").alignment = { vertical: "middle" };
    sheet.mergeCells(`A4:${last}4`);
    sheet.getCell("A4").value = metadata;
    sheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
    sheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };

    const cards = [
      ["eGRDTs", totals.egrdts, "FF24689A"],
      ["DOCUMENTOS", totals.documents, "FF0C7657"],
      ["ARQUIVOS", totals.files, "FF66798B"],
      ["ALOCAÇÕES", totals.allocations, "FFA56812"],
    ];
    cards.forEach(([label, value, color], index) => {
      const start = index * 3 + 1;
      sheet.mergeCells(6, start, 8, start + 2);
      const cell = sheet.getCell(6, start);
      cell.value = { richText: [
        { font: { name: "Aptos", size: 9, bold: true, color: { argb: "FF6F7E8C" } }, text: `${label}\n` },
        { font: { name: "Aptos Display", size: 22, bold: true, color: { argb: color } }, text: Number(value || 0).toLocaleString("pt-BR") },
      ] };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
      cell.border = { left: { style: "medium", color: { argb: color } }, top: { style: "thin", color: { argb: "FFDCE4EA" } }, right: { style: "thin", color: { argb: "FFDCE4EA" } }, bottom: { style: "thin", color: { argb: "FFDCE4EA" } } };
    });

    sheet.mergeCells(`A10:${last}10`);
    sheet.getCell("A10").value = "DADOS DO PERÍODO";
    sheet.getCell("A10").font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell("A10").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
    const details = [
      ["Período selecionado", period],
      ["Tipo de documento", selectedFamily],
      ["Primeiro registro", formatDate(totals.first, true)],
      ["Último registro", formatDate(totals.last, true)],
      ["Versão do aplicativo", text(settings.appVersion) || "GRCON"],
      ["Origem dos dados", "Histórico local de eGRDTs geradas pelo GRCON neste navegador"],
      ["Critério de data", "Data em que a eGRDT foi gerada e registrada no histórico do GRCON"],
      ["Observação", "A relação não confirma sozinha que o upload foi concluído no SIGEM; ela registra as saídas geradas pelo GRCON."],
    ];
    details.forEach(([label, value], index) => {
      const row = 11 + index;
      sheet.mergeCells(`A${row}:D${row}`);
      sheet.mergeCells(`E${row}:${last}${row}`);
      sheet.getCell(`A${row}`).value = label;
      sheet.getCell(`E${row}`).value = value;
      sheet.getCell(`A${row}`).font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF53697B" } };
      sheet.getCell(`E${row}`).font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      sheet.getCell(`E${row}`).alignment = { vertical: "middle", wrapText: true };
      if (index % 2) for (let col = 1; col <= columns; col += 1) sheet.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    });

    const startRow = 20;
    const headers = Object.keys(egrdts[0]);
    sheet.mergeCells(`A${startRow}:${last}${startRow}`);
    sheet.getCell(`A${startRow}`).value = "RESUMO POR eGRDT";
    sheet.getCell(`A${startRow}`).font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell(`A${startRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
    headers.forEach((header, index) => { sheet.getCell(startRow + 1, index + 1).value = header; sheet.getColumn(index + 1).width = widthFor(header); });
    styleHeader(sheet.getRow(startRow + 1), "FF153A5C");
    egrdts.forEach((item, index) => {
      const row = sheet.getRow(startRow + 2 + index);
      headers.forEach((header, column) => { row.getCell(column + 1).value = item[header] === "" ? null : item[header]; });
      styleData(row, index);
    });
    const summaryLast = columnLetter(headers.length);
    sheet.autoFilter = { from: `A${startRow + 1}`, to: `${summaryLast}${startRow + 1 + egrdts.length}` };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .2, right: .2, top: .4, bottom: .4, header: .2, footer: .2 }, printTitlesRow: `${startRow + 1}:${startRow + 1}` };
    sheet.headerFooter.oddFooter = "&LGRCON&C&P de &N&R&D";
    await addLogo(workbook, sheet, settings.brandAssets);

    await addDataSheet(workbook, "eGRDTs", "eGRDTs GERADAS / POSTADAS", egrdts, metadata, settings.brandAssets);
    await addDataSheet(workbook, "Documentos", "DOCUMENTOS POR eGRDT", documents, metadata, settings.brandAssets);
    addColarGrconSheetV2(workbook, source);
    addColarGrconSheetV3(workbook, await colarGrconRowsV3(source, settings));

    const buffer = await workbook.xlsx.writeBuffer();
    const check = new ExcelJS.Workbook();
    await check.xlsx.load(buffer);
    if (!check.getWorksheet("Resumo") || !check.getWorksheet("eGRDTs") || !check.getWorksheet("Documentos")) throw new Error("A relação por período não pôde ser validada.");
    const pasteV2 = check.getWorksheet("Colar GRCON v2");
    if (!pasteV2 || COLAR_GRCON_HEADERS_V2.some((header, i) => pasteV2.getCell(2, i + 1).value !== header)
      || pasteV2.columnCount !== 6) throw new Error("Contrato fixo v2 da aba Colar GRCON inválido.");
    const pasteV3 = check.getWorksheet("Colar GRCON v3");
    if (!pasteV3 || COLAR_GRCON_HEADERS_V3.some((header, i) => pasteV3.getCell(2, i + 1).value !== header))
      throw new Error("Contrato de conferência v3 inválido.");
    return buffer;
  }
  function downloadName(records, options) {
    const settings = options || {};
    const bounds = History && History.periodBounds ? History.periodBounds(records || []) : { start: "", end: "" };
    const start = (text(settings.startDate) || bounds.start || "INICIO").replace(/-/g, "");
    const end = (text(settings.endDate) || bounds.end || "FIM").replace(/-/g, "");
    const family = familyLabel(settings.documentFamily).replace(/[^A-Z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "TODOS";
    return `GRCON_Relacao_eGRDTs_${family}_${start}_a_${end}_${compactStamp()}.xlsx`;
  }

  // Auditoria separada: jamais misturar os tombstones com os documentos ativos
  // nos relatórios regulares. Inclui apenas as eGRDTs que passaram pelos filtros.
  async function buildRemovedAuditWorkbook(records) {
    const ExcelJS = getExcel();
    if (!ExcelJS?.Workbook) throw new Error("O gerador de Excel não está disponível.");
    const rows = (records || []).flatMap((record) => (record.removedFiles || []).map((entry) => ({
      egrdt: record.egrdtNumber,
      sentAt: formatDate(record.generatedAt, true),
      document: text(entry.file?.document),
      revision: text(entry.file?.grdtRevision || entry.file?.revision) || "0",
      purpose: text(entry.file?.purpose),
      allocation: text(entry.file?.allocation),
      originalFile: text(entry.file?.originalName),
      sentFile: text(entry.file?.finalName),
      removedAt: formatDate(entry.removedAt, true),
      removedBy: text(entry.removedBy),
      reason: text(entry.reason),
      removalId: text(entry.id),
    })));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GRCON";
    const sheet = workbook.addWorksheet("Documentos removidos", { views: [{ state: "frozen", ySplit: 2 }] });
    sheet.addRow(["GRCON — AUDITORIA DE DOCUMENTOS REMOVIDOS DO HISTÓRICO"]);
    sheet.mergeCells(1, 1, 1, 12);
    sheet.getRow(1).height = 29;
    sheet.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 15 };
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF163B63" } };
    const headers = ["eGRDT", "Data enviada", "Documento", "Revisão", "Propósito", "Alocação",
      "Arquivo original", "Arquivo enviado", "Removido em", "Removido por (ID)", "Motivo", "ID da remoção"];
    sheet.addRow(headers);
    const headerRow = sheet.getRow(2);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF285580" } };
    sheet.columns = [17,20,48,12,20,24,38,38,22,38,50,39].map((width) => ({ width }));
    for (const row of rows) {
      sheet.addRow([row.egrdt, row.sentAt, row.document, row.revision, row.purpose,
        row.allocation, row.originalFile, row.sentFile, row.removedAt, row.removedBy, row.reason, row.removalId]);
    }
    sheet.autoFilter = { from: "A2", to: "L" + Math.max(2, sheet.rowCount) };
    const result = await workbook.xlsx.writeBuffer();
    return result;
  }

  function removedAuditDownloadName() {
    return `GRCON_Auditoria_Documentos_Removidos_${compactStamp()}.xlsx`;
  }

  return Object.freeze({ COLAR_GRCON_HEADERS_V2, COLAR_GRCON_HEADERS_V3, colarGrconRowsV2, colarGrconRowsV3, formatDate, periodLabel, filterRecords, familyLabel, allocationReason, egrdtRows, documentRows, summary, buildWorkbook, downloadName, buildRemovedAuditWorkbook, removedAuditDownloadName });
});
