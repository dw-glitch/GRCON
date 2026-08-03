(function (root, factory) {
  const Core = root.GrconAnalysisHistory || (typeof module === "object" && module.exports ? require("./analysis_history_core.js") : null);
  const getExcel = () => root.ExcelJS || (typeof module === "object" && module.exports ? require("./exceljs.min.js") : null);
  const api = factory(Core, getExcel, root.GRCONBrandAssets || null);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconAnalysisHistoryReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, getExcel, defaultBrand) {
  "use strict";

  function text(value) { return Core ? Core.text(value) : String(value == null ? "" : value).trim(); }
  function norm(value) { return Core ? Core.norm(value) : text(value).toUpperCase(); }
  function pad(value, size = 2) { return String(value).padStart(size, "0"); }
  function stamp(date = new Date()) { return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`; }
  function formatDate(value, withTime = true) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return text(value) || "—";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }
  function dateLabel(value) {
    const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : text(value) || "—";
  }
  function periodLabel(options, documents) {
    const settings = options || {};
    const dates = [...new Set((documents || []).map((item) => item.dateKey).filter(Boolean))].sort();
    const start = settings.startDate || dates[0] || "";
    const end = settings.endDate || dates[dates.length - 1] || "";
    return start || end ? `${dateLabel(start)} a ${dateLabel(end)}` : "Todo o histórico disponível";
  }
  function statusText(key) {
    if (key === "READY") return "Será incluído na eGRDT";
    if (key === "BLOCKED") return "Não será incluído";
    if (key === "DISCARD") return "Não será enviado novamente";
    if (key === "REVIEW") return "Precisa de conferência";
    return "Não informado";
  }
  function columnLetter(number) {
    let n = Number(number) || 1, result = "";
    while (n > 0) { n -= 1; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); }
    return result;
  }
  function widthFor(header) {
    const key = norm(header);
    if (/MOTIVO|TITULO|CAMINHO|COMENTARIO|ARQUIVOS|ORIGEM/.test(key)) return 44;
    if (/DOCUMENTO|GRDT|ALOCACAO|LD UTILIZADA/.test(key)) return 31;
    if (/DATA|STATUS|REVISAO|SITUACAO|VERSAO|ABA/.test(key)) return 22;
    return 17;
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
  function styleData(row, index, statusColumn) {
    row.height = 34;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF7F9FB" : "FFFFFFFF" } };
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
    });
    if (statusColumn) {
      const cell = row.getCell(statusColumn);
      const key = Core.statusKey(cell.value);
      const palette = key === "READY" ? ["FFEAF7F1", "FF0C7657"]
        : key === "BLOCKED" ? ["FFFFEDE9", "FFA64035"]
          : key === "DISCARD" ? ["FFEDF1F4", "FF596C7D"]
            : ["FFFFF5DF", "FFA56812"];
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette[0] } };
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: palette[1] } };
    }
  }
  async function addLogo(workbook, worksheet, brandAssets) {
    const brand = brandAssets || defaultBrand || {};
    try {
      let config = null;
      if (brand.reportLogoBase64) config = { base64: brand.reportLogoBase64, extension: "png" };
      else if (typeof fetch === "function" && brand.reportLogoFile) {
        const response = await fetch(brand.reportLogoFile, { cache: "no-store" });
        if (response.ok) config = { buffer: await response.arrayBuffer(), extension: "png" };
      }
      if (!config) return;
      const image = workbook.addImage(config);
      worksheet.addImage(image, { tl: { col: .12, row: .28 }, ext: { width: 188, height: 52 } });
    } catch (_) { console.debug("[AnalysisHistoryReport] context:", _); /* relatório segue sem logo */ }
  }
  async function dataSheet(workbook, name, title, rows, metadata, brandAssets, statusHeader) {
    const headers = rows.length ? Object.keys(rows[0]) : ["INFORMAÇÃO"];
    const sheet = workbook.addWorksheet(name, { properties: { defaultRowHeight: 20 }, views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false, zoomScale: 80 }] });
    const last = columnLetter(headers.length);
    for (let r = 1; r <= 3; r += 1) for (let c = 1; c <= headers.length; c += 1) sheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
    const titleStart = headers.length > 2 ? "C1" : "A1";
    sheet.mergeCells(`${titleStart}:${last}2`);
    sheet.getCell(titleStart).value = `GRCON · ${title}`;
    sheet.getCell(titleStart).font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.mergeCells(`A4:${last}4`);
    sheet.getCell("A4").value = `${rows.length.toLocaleString("pt-BR")} registro(s) · ${metadata}`;
    sheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF536679" } };
    sheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
    headers.forEach((header, index) => { sheet.getCell(6, index + 1).value = header; sheet.getColumn(index + 1).width = widthFor(header); });
    styleHeader(sheet.getRow(6));
    const statusColumn = statusHeader ? headers.indexOf(statusHeader) + 1 : 0;
    rows.forEach((item, index) => {
      const row = sheet.getRow(index + 7);
      headers.forEach((header, column) => { row.getCell(column + 1).value = item[header] === "" ? null : item[header]; });
      styleData(row, index, statusColumn);
    });
    if (rows.length) sheet.autoFilter = { from: "A6", to: `${last}${rows.length + 6}` };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .2, right: .2, top: .4, bottom: .4, header: .2, footer: .2 }, printTitlesRow: "6:6" };
    sheet.headerFooter.oddFooter = "&LGRCON&C&P de &N&R&D";
    await addLogo(workbook, sheet, brandAssets);
    return sheet;
  }
  function sessionRows(sessions) {
    return (sessions || []).map((session) => ({
      "DATA DA ANÁLISE": formatDate(session.analyzedAt, true),
      "DOCUMENTOS ANALISADOS": Number(session.total) || 0,
      "SERÁ INCLUÍDO NA EGRDT": Number(session.counts && session.counts.ready) || 0,
      "NÃO SERÁ INCLUÍDO": Number(session.counts && session.counts.blocked) || 0,
      "NÃO SERÁ ENVIADO NOVAMENTE": Number(session.counts && session.counts.discard) || 0,
      "PRECISA DE CONFERÊNCIA": Number(session.counts && session.counts.review) || 0,
      "LD UTILIZADA": text(session.ldName),
      "TIPO DE ENTRADA": text(session.inputType),
      "ORIGEM DOS DOCUMENTOS": text(session.sourceName || session.relationLabel),
      "VERSÃO DO GRCON": text(session.appVersion),
      "VERSÃO DO MOTOR": text(session.engineVersion),
    }));
  }
  function documentRows(documents) {
    return (documents || []).map((item) => ({
      "DATA DA ANÁLISE": formatDate(item.analyzedAt, true),
      "DOCUMENTO": text(item.document),
      "TÍTULO": text(item.title),
      "ARQUIVOS ORIGINAIS": text(item.originalFiles),
      "ARQUIVOS FINAIS": text(item.finalFiles),
      "SITUAÇÃO ENTREGUE PELO GRCON": text(item.statusDelivered),
      "CÓDIGO DO MOTIVO": text(item.reasonCode),
      "MOTIVO GRCON": text(item.reason),
      "REVISÃO NA LD": text(item.currentRevision),
      "REVISÃO PARA POSTAR": text(item.targetRevision),
      "STATUS DA REVISÃO": text(item.targetRevisionStatus),
      "STATUS SIGEM": text(item.sigemStatus),
      "INCLUÍDO NA EGRDT?": text(item.includedInEgrdt),
      "CONFIRMAÇÃO DE DOCUMENTOS PREVISTOS": text(item.allocationStatus),
      "ALOCAÇÃO": text(item.allocation),
      "ETAPA DA ALOCAÇÃO": text(item.allocationStage),
      "COMENTÁRIO DA FISCAL": text(item.fiscalComment),
      "NÚMERO DA GRDT NA LD": text(item.grdt),
      "DATA EFETIVA DE EMISSÃO": text(item.effectiveDate),
      "SITUAÇÃO DE POSTAGEM": text(item.postingStatus),
      "CAMINHO DATABOOK": text(item.databook),
      "VERSÃO DA LD ENVIADA": text(item.ldVersion),
      "ABA LD": text(item.sheet),
      "LINHA LD": Number(item.ldRow) || "",
      "ORIGEM NA ENTRADA": text(item.inputSource),
      "ALERTA DO PACOTE": text(item.packageWarning),
    }));
  }
  function statusDateRows(documents) {
    const map = new Map();
    (documents || []).forEach((item) => {
      const key = `${item.dateKey}|${item.statusKey}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, total]) => {
      const [dateKey, statusKey] = key.split("|");
      return { "DATA": dateLabel(dateKey), "SITUAÇÃO ENTREGUE PELO GRCON": statusText(statusKey), "DOCUMENTOS": total };
    });
  }
  async function buildWorkbook(documents, sessions, options) {
    const ExcelJS = getExcel();
    if (!ExcelJS) throw new Error("Biblioteca Excel indisponível.");
    const settings = options || {};
    const docs = documents || [];
    const relatedSessions = sessions || [];
    const counts = docs.reduce((acc, item) => { acc[item.statusKey] = (acc[item.statusKey] || 0) + 1; return acc; }, { READY: 0, BLOCKED: 0, DISCARD: 0, REVIEW: 0 });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.company = "CONSAG Engenharia";
    workbook.title = "Histórico de análises do GRCON";
    workbook.created = new Date();
    const columns = 15;
    const last = columnLetter(columns);
    const sheet = workbook.addWorksheet("Resumo", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
    sheet.columns = Array.from({ length: columns }, () => ({ width: 16 }));
    for (let r = 1; r <= 3; r += 1) for (let c = 1; c <= columns; c += 1) sheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
    sheet.mergeCells(`C1:${last}2`);
    sheet.getCell("C1").value = "GRCON · HISTÓRICO DE ANÁLISES DOCUMENTAIS";
    sheet.getCell("C1").font = { name: "Aptos Display", size: 19, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.mergeCells(`A4:${last}4`);
    sheet.getCell("A4").value = `${periodLabel(settings, docs)} · relatório gerado em ${formatDate(new Date(), true)}`;
    sheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF536679" } };
    sheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
    const cards = [
      ["ANÁLISES", relatedSessions.length, "FF2E5878"],
      ["DOCUMENTOS", docs.length, "FF24689A"],
      ["INCLUIR", counts.READY || 0, "FF0C7657"],
      ["NÃO INCLUIR", counts.BLOCKED || 0, "FFA64035"],
      ["CONFERIR", counts.REVIEW || 0, "FFA56812"],
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
    sheet.getCell("A10").value = "CRITÉRIOS DO RELATÓRIO";
    sheet.getCell("A10").font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell("A10").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
    const details = [
      ["Período selecionado", periodLabel(settings, docs)],
      ["Situação filtrada", settings.status && settings.status !== "ALL" ? statusText(settings.status) : "Todas"],
      ["Busca textual", text(settings.query) || "Sem filtro textual"],
      ["Versão do aplicativo", text(settings.appVersion) || "GRCON"],
      ["Origem dos dados", "Histórico local de todas as análises concluídas neste navegador"],
      ["Critério de data", "Data e hora em que o GRCON concluiu e registrou a análise"],
      ["Limitação", "Análises realizadas antes da implantação deste módulo não podem ser recuperadas automaticamente."],
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
      if (index % 2) for (let c = 1; c <= columns; c += 1) sheet.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    });
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .2, right: .2, top: .4, bottom: .4, header: .2, footer: .2 } };
    sheet.headerFooter.oddFooter = "&LGRCON&C&P de &N&R&D";
    await addLogo(workbook, sheet, settings.brandAssets);

    const metadata = `${periodLabel(settings, docs)} · ${text(settings.appVersion) || "GRCON"}`;
    await dataSheet(workbook, "Análises", "ANÁLISES EXECUTADAS", sessionRows(relatedSessions), metadata, settings.brandAssets, "");
    await dataSheet(workbook, "Documentos", "DOCUMENTOS ANALISADOS", documentRows(docs), metadata, settings.brandAssets, "SITUAÇÃO ENTREGUE PELO GRCON");
    await dataSheet(workbook, "Status por data", "STATUS ENTREGUES POR DATA", statusDateRows(docs), metadata, settings.brandAssets, "SITUAÇÃO ENTREGUE PELO GRCON");

    const buffer = await workbook.xlsx.writeBuffer();
    const validation = new ExcelJS.Workbook();
    await validation.xlsx.load(buffer);
    for (const name of ["Resumo", "Análises", "Documentos", "Status por data"]) if (!validation.getWorksheet(name)) throw new Error(`A aba ${name} não foi validada.`);
    return buffer;
  }
  function downloadName(documents, options) {
    const settings = options || {};
    const dates = [...new Set((documents || []).map((item) => item.dateKey).filter(Boolean))].sort();
    const start = (settings.startDate || dates[0] || "INICIO").replace(/-/g, "");
    const end = (settings.endDate || dates[dates.length - 1] || "FIM").replace(/-/g, "");
    return `GRCON_Historico_Analises_${start}_a_${end}_${stamp()}.xlsx`;
  }

  return Object.freeze({ formatDate, periodLabel, sessionRows, documentRows, statusDateRows, buildWorkbook, downloadName });
});
