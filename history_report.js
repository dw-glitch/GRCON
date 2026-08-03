(function (root, factory) {
  const History = root.GrconHistory || (typeof module === "object" && module.exports ? require("./history_core.js") : null);
  const Posting = root.GrconSigemPosting || (typeof module === "object" && module.exports ? require("./sigem_posting_core.js") : null);
  const getExcel = () => root.ExcelJS || (typeof module === "object" && module.exports ? require("./exceljs.min.js") : null);
  const api = factory(History, Posting, getExcel, root.GRCONBrandAssets || null);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconHistoryReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History, Posting, getExcel, defaultBrand) {
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
  function filterRecords(records, startDate, endDate) {
    return History && History.filterByDate ? History.filterByDate(records || [], startDate, endDate) : [...(records || [])];
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
  function egrdtRows(records) {
    return (records || []).map((record) => ({
      "DATA DA GERAÇÃO / POSTAGEM": formatDate(record.generatedAt, true),
      "EGRDT": text(record.egrdtNumber),
      "TIPO DE SAÍDA": text(record.outputType),
      "DOCUMENTOS": Number(record.documentCount || 0),
      "ARQUIVOS": Number(record.fileCount || 0),
      "REVISÕES ENVIADAS NA GRDT (DOCUMENTO · REVISÃO)": generatedRevisions(record),
      "DISCIPLINAS": extractDisciplines(record),
      "ALOCAÇÕES": (record.allocations || []).join(" · "),
      "LD UTILIZADA": text(record.ldName),
      "ORIGEM DOS DOCUMENTOS": text(record.sourceName),
      "NÚMEROS ANTERIORES": (record.numberHistory || []).join(" · "),
    }));
  }
  function revisionRelation(record, file, postingRecords) {
    if (!Posting) return { posted: "", other: "" };
    const source = postingRecords || [];
    const own = source.find((item) => item.historyId === record.id || item.id === record.id || item.egrdtNumber === record.egrdtNumber) || null;
    const sameDocument = (item) => Posting.norm(item && item.document) === Posting.norm(file && file.document);
    const posted = own && own.status === Posting.STATUSES.POSTADO
      ? [...new Set((own.files || []).filter(sameDocument).map((item) => text(item.revision)).filter(Boolean))]
      : [];
    const other = [];
    const seen = new Set();
    source
      .filter((item) => item.status === Posting.STATUSES.POSTADO && (!own || item.id !== own.id))
      .sort((a, b) => String(b.resultAt || b.updatedAt).localeCompare(String(a.resultAt || a.updatedAt)))
      .forEach((item) => (item.files || []).filter(sameDocument).forEach((entry) => {
        if (!text(entry.revision) || Posting.norm(entry.revision) === Posting.norm(file.revision)) return;
        const label = `Rev. ${text(entry.revision)} · ${text(item.postingGrdtNumber || item.egrdtNumber)}`;
        const key = Posting.norm(label);
        if (!seen.has(key)) { seen.add(key); other.push(label); }
      }));
    return {
      posted: posted.length ? posted.join(" · ") : "Não confirmada nesta GRDT",
      other: other.length ? other.join(" | ") : "Nenhuma outra revisão postada",
    };
  }
  function documentRows(records, postingRecords) {
    const postings = Array.isArray(postingRecords) ? postingRecords : Posting?.read?.() || [];
    return (records || []).flatMap((record) => (record.files || []).map((file) => {
      const relation = revisionRelation(record, file, postings);
      return {
      "DATA DA GERAÇÃO / POSTAGEM": formatDate(record.generatedAt, true),
      "EGRDT": text(record.egrdtNumber),
      "TIPO DE SAÍDA": text(record.outputType),
      "DOCUMENTO": text(file.document),
      "TÍTULO": text(file.title),
      "DISCIPLINA": text(file.discipline),
      "ARQUIVO ORIGINAL": text(file.originalName),
      "ARQUIVO POSTADO": text(file.finalName),
      "REVISÃO ENVIADA NA GRDT": grdtRevision(file),
      "FONTE DA REVISÃO ENVIADA": text(file.revisionSource) || "Histórico registrado",
      "REVISÃO DESTA GRDT POSTADA": relation.posted,
      "OUTRA REVISÃO POSTADA DO DOCUMENTO": relation.other,
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
      "VERSÃO DA LD ENVIADA": text(file.ldVersion) || "Não registrada neste histórico",
      "CAMINHO DATABOOK": text(file.databook),
      "LD UTILIZADA": text(record.ldName),
      "ORIGEM DOS DOCUMENTOS": text(record.sourceName),
      };
    }));
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
    if (/POR QUE|COMENTARIO|CAMINHO|TITULO|ORIGEM|NUMEROS ANTERIORES/.test(key)) return 42;
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
    const source = filterRecords(records || [], settings.startDate, settings.endDate);
    if (!source.length) throw new Error("Nenhuma eGRDT foi localizada no período selecionado.");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.lastModifiedBy = "GRCON";
    workbook.company = "CONSAG Engenharia";
    workbook.title = "Relação de eGRDTs por período";
    workbook.created = new Date();
    workbook.modified = new Date();

    const totals = summary(source);
    const period = periodLabel(source, settings.startDate, settings.endDate);
    const metadata = `${source.length.toLocaleString("pt-BR")} eGRDT(s) · Período: ${period} · Histórico local do GRCON · ${new Date().toLocaleString("pt-BR")}`;
    const egrdts = egrdtRows(source);
    const documents = documentRows(source);

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

    const buffer = await workbook.xlsx.writeBuffer();
    const check = new ExcelJS.Workbook();
    await check.xlsx.load(buffer);
    if (!check.getWorksheet("Resumo") || !check.getWorksheet("eGRDTs") || !check.getWorksheet("Documentos")) throw new Error("A relação por período não pôde ser validada.");
    return buffer;
  }
  function downloadName(records, options) {
    const settings = options || {};
    const bounds = History && History.periodBounds ? History.periodBounds(records || []) : { start: "", end: "" };
    const start = (text(settings.startDate) || bounds.start || "INICIO").replace(/-/g, "");
    const end = (text(settings.endDate) || bounds.end || "FIM").replace(/-/g, "");
    return `GRCON_Relacao_eGRDTs_${start}_a_${end}_${compactStamp()}.xlsx`;
  }

  return Object.freeze({ formatDate, periodLabel, filterRecords, allocationReason, revisionRelation, egrdtRows, documentRows, summary, buildWorkbook, downloadName });
});
