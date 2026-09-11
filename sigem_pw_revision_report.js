(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const getExcel = () => root.ExcelJS || safeRequire("./exceljs.min.js");
  const Revision = root.GrconSigemPwRevision || safeRequire("./sigem_pw_revision_core.js");
  const api = factory(getExcel, Revision, root.GRCONBrandAssets || null);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwRevisionReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (getExcel, Revision, defaultBrand) {
  "use strict";

  const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const SITUATION_FILTER_LABELS = Object.freeze({
    attention: "Precisam de atenção",
    all: "Todos",
    other: "Outras divergências",
    updated: "Atualizado",
    "pw-previous": "PW em revisão anterior",
    "pw-not-found": "Não localizado no PW",
    "pw-awaiting-emission": "Aguardando emissão no PW",
    "pw-ahead": "PW em revisão posterior",
    review: "Requer análise",
  });

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function pad(value, size = 2) { return String(value).padStart(size, "0"); }
  function stamp(date = new Date()) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
  function formatDateTime(date = new Date()) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(date);
  }
  function stripDiacritics(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function safeFilePart(value, fallback = "Lista_Filtrada") {
    const clean = stripDiacritics(value)
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return clean || fallback;
  }
  function columnLetter(number) {
    let n = Number(number) || 1;
    let result = "";
    while (n > 0) { n -= 1; result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26); }
    return result;
  }
  function yieldTask() {
    if (typeof requestAnimationFrame === "function") return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    if (typeof setImmediate === "function") return new Promise((resolve) => setImmediate(resolve));
    return Promise.resolve();
  }
  function situationLabel(value) {
    return Revision?.LABELS?.[value] || SITUATION_FILTER_LABELS[value] || text(value) || "—";
  }
  function historyText(rows, kind) {
    const items = Revision?.historyForRows ? Revision.historyForRows(rows, kind) : [];
    if (!items.length) return "—";
    return items.map((item) => {
      const status = text(item.status) || "sem status";
      const emitted = kind === "pw" ? ` · ${item.emitted ? "emitida" : "não emitida"}` : "";
      return `Rev. ${text(item.revision) || "—"} · ${status}${emitted}`;
    }).join(" | ");
  }
  function emittedPwHistoryText(rows) {
    const items = Revision?.historyForRows ? Revision.historyForRows(rows, "pw") : [];
    const emitted = items.filter((item) => item.emitted);
    return emitted.length ? emitted.map((item) => `Rev. ${text(item.revision) || "—"} · ${text(item.status) || "sem status"}`).join(" | ") : "—";
  }
  function exportRow(row) {
    const sigemRevision = text(row?.sigemRevision) || "—";
    const pwRevision = text(row?.pwRevision) || "—";
    return {
      "DOCUMENTO": text(row?.document),
      "CLASSE": text(row?.documentClass) || "—",
      "CÓDIGO SIGEM": text(row?.sigemCode) || text(row?.document),
      "REVISÃO SIGEM": sigemRevision,
      "STATUS SIGEM": text(row?.sigemStatus) || "—",
      "CÓDIGO PW": text(row?.pwCode) || "—",
      "REVISÃO PW": pwRevision,
      "STATUS PW": text(row?.pwStatus) || "—",
      "ÚLTIMA EMISSÃO PW": text(row?.lastEmittedPwRevision) || "—",
      "STATUS ÚLTIMA EMISSÃO PW": text(row?.lastEmittedPwStatus) || "—",
      "SITUAÇÃO": situationLabel(row?.situation),
      "COMPARAÇÃO DE REVISÕES": `${sigemRevision} → ${pwRevision}`,
      "MOTIVO / DIAGNÓSTICO": text(row?.reason) || "—",
      "EAP": text(row?.eap) || "—",
      "TIPO DOCUMENTAL": text(row?.documentType) || "—",
      "REVISÕES SIGEM ENCONTRADAS": historyText(row?.sigemRows, "sigem"),
      "REVISÕES PW ENCONTRADAS": historyText(row?.pwRows, "pw"),
      "REVISÕES PW EMITIDAS": emittedPwHistoryText(row?.pwRows),
    };
  }
  function exportRows(rows) { return (Array.isArray(rows) ? rows : []).map(exportRow); }

  function normalizedDocumentList(value) {
    return text(value).split(/[\r\n,;|\t]+/).map((item) => text(item)).filter(Boolean);
  }
  function filterEntries(filters, count, date = new Date()) {
    const f = filters || {};
    const list = normalizedDocumentList(f.documentList);
    return [
      ["Data/hora da exportação", formatDateTime(date)],
      ["Situação", SITUATION_FILTER_LABELS[f.situation] || situationLabel(f.situation) || "Todos"],
      ["Classe", text(f.documentClass) || "Todas"],
      ["Rev. SIGEM", text(f.sigemRevision) || "Todas"],
      ["Rev. PW", text(f.pwRevision) || "Todas"],
      ["Status SIGEM", text(f.sigemStatus) || "Todos"],
      ["Status PW", text(f.pwStatus) || "Todos"],
      ["Pesquisa textual", text(f.search) || "—"],
      ["Lista de documentos", list.length ? `${list.length} código(s) informado(s); relação completa abaixo` : "Não utilizada"],
      ["Códigos informados na lista", list.length],
      ["Registros exportados", Number(count) || 0],
      ["Escopo da exportação", "Resultado filtrado completo, independente da página atual da tabela"],
    ];
  }

  function widthFor(header) {
    const key = stripDiacritics(header).toUpperCase();
    if (/MOTIVO|DIAGNOSTICO|REVISOES .* ENCONTRADAS|REVISOES PW EMITIDAS/.test(key)) return 48;
    if (/DOCUMENTO|CODIGO/.test(key)) return 34;
    if (/STATUS|SITUACAO|COMPARACAO/.test(key)) return 24;
    if (/REVISAO|EMISSAO|TIPO|CLASSE|EAP/.test(key)) return 18;
    return 16;
  }
  function styleHeader(row) {
    row.height = 34;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FF9FB4C4" } } };
    });
  }
  function styleDataRow(row, index) {
    row.height = 30;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF7F9FB" : "FFFFFFFF" } };
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
    });
  }
  function markTextColumns(sheet, headers) {
    headers.forEach((header, index) => {
      const key = stripDiacritics(header).toUpperCase();
      if (/DOCUMENTO|CODIGO|REVISAO|EAP|TIPO|STATUS|SITUACAO|COMPARACAO/.test(key)) sheet.getColumn(index + 1).numFmt = "@";
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
      const id = workbook.addImage(imageConfig);
      worksheet.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 170, height: 48 } });
    } catch (_) { /* identidade visual é opcional; dados nunca dependem da logo */ }
  }

  async function buildWorkbook(rows, filters, options) {
    const ExcelJS = getExcel();
    if (!ExcelJS || !ExcelJS.Workbook) throw new Error("Biblioteca ExcelJS indisponível.");
    const source = Array.isArray(rows) ? rows : [];
    if (!source.length) throw new Error("Nenhum documento disponível para exportação.");
    const settings = options || {};
    const createdAt = settings.createdAt instanceof Date ? settings.createdAt : new Date();
    const data = exportRows(source);
    const headers = Object.keys(data[0]);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.lastModifiedBy = "GRCON";
    workbook.company = "CONSAG Engenharia";
    workbook.title = "GRCON · SIGEM × ProjectWise · Lista filtrada de revisões";
    workbook.subject = "Resultado filtrado do Dashboard SIGEM × ProjectWise";
    workbook.created = createdAt;
    workbook.modified = createdAt;

    const list = workbook.addWorksheet("Lista Filtrada", {
      properties: { defaultRowHeight: 20 },
      views: [{ state: "frozen", ySplit: 1, showGridLines: false, zoomScale: 85 }],
    });
    list.columns = headers.map((header) => ({ header, width: widthFor(header) }));
    styleHeader(list.getRow(1));
    markTextColumns(list, headers);
    for (let index = 0; index < data.length; index += 1) {
      const item = data[index];
      const row = list.addRow(headers.map((header) => item[header] === "" ? null : item[header]));
      styleDataRow(row, index);
      if (index > 0 && index % 750 === 0) await yieldTask();
    }
    const lastColumn = columnLetter(headers.length);
    list.autoFilter = { from: "A1", to: `${lastColumn}${data.length + 1}` };
    list.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .2, right: .2, top: .35, bottom: .35, header: .2, footer: .2 }, printTitlesRow: "1:1" };
    list.headerFooter.oddFooter = "&LGRCON · SIGEM × PW&C&P de &N&R&D";

    const applied = workbook.addWorksheet("Filtros Aplicados", { properties: { defaultRowHeight: 22 }, views: [{ showGridLines: false, zoomScale: 90 }] });
    applied.columns = [{ width: 22 }, { width: 30 }, { width: 42 }, { width: 42 }];
    applied.mergeCells("C1:D2");
    applied.getCell("C1").value = "GRCON · SIGEM × PROJECTWISE · FILTROS APLICADOS";
    applied.getCell("C1").font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    applied.getCell("C1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
    applied.getCell("C1").alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    applied.getRow(1).height = 31;
    applied.getRow(2).height = 31;
    applied.getCell("A4").value = "Campo";
    applied.getCell("B4").value = "Valor";
    styleHeader(applied.getRow(4));
    filterEntries(filters, source.length, createdAt).forEach(([label, value], index) => {
      const row = applied.addRow([label, value]);
      row.getCell(1).font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF53697B" } };
      row.getCell(2).font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      row.getCell(2).alignment = { vertical: "top", horizontal: "left", wrapText: true };
      if (index % 2) {
        row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
      }
    });
    const listedDocuments = normalizedDocumentList(filters && filters.documentList);
    listedDocuments.forEach((code, index) => {
      const row = applied.addRow([`Documento da lista ${index + 1}`, code]);
      row.getCell(1).font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF53697B" } };
      row.getCell(2).font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      row.getCell(2).numFmt = "@";
    });
    applied.autoFilter = { from: "A4", to: `B${applied.rowCount}` };
    applied.getColumn(2).numFmt = "@";
    await addLogo(workbook, applied, settings.brandAssets);

    const buffer = await workbook.xlsx.writeBuffer();
    if (settings.validate !== false) {
      const check = new ExcelJS.Workbook();
      await check.xlsx.load(buffer);
      const listCheck = check.getWorksheet("Lista Filtrada");
      const filterCheck = check.getWorksheet("Filtros Aplicados");
      if (!listCheck || !filterCheck) throw new Error("O Excel gerado não contém as abas obrigatórias.");
      if (listCheck.rowCount !== source.length + 1) throw new Error(`Quantidade divergente no Excel: esperado ${source.length}, encontrado ${Math.max(0, listCheck.rowCount - 1)}.`);
      if (text(listCheck.getCell(2, 1).value) !== text(source[0].document)) throw new Error("Falha ao validar a primeira linha exportada.");
    }
    return buffer;
  }

  function downloadName(filters, date = new Date()) {
    const situation = SITUATION_FILTER_LABELS[filters?.situation] || situationLabel(filters?.situation) || "Lista Filtrada";
    const segment = filters?.situation === "all" ? "Lista_Filtrada" : safeFilePart(situation);
    return `GRCON_SIGEM_PW_${segment}_${stamp(date)}.xlsx`;
  }

  return Object.freeze({
    MIME_XLSX,
    SITUATION_FILTER_LABELS,
    text,
    stamp,
    situationLabel,
    exportRow,
    exportRows,
    filterEntries,
    buildWorkbook,
    downloadName,
  });
});
