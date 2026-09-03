(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRepostingReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function stateLabel(value) { return root.GrconRepostingCore?.stateLabel?.(value) || text(value) || "Não verificado"; }
  function fmtDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR"); }
  async function logo(workbook) {
    const source = root.GRCONBrandAssets?.reportLogoFile || root.GrconBrandAssets?.reportLogoFile || "grcon-logo-report.png";
    try {
      const response = await fetch(source);
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      return workbook.addImage({ buffer, extension: source.toLowerCase().endsWith(".jpg") || source.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png" });
    } catch (_) { return null; }
  }
  async function buildWorkbook(batch) {
    if (!root.ExcelJS) throw new Error("ExcelJS indisponível para gerar o relatório do lote.");
    const workbook = new root.ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Lote de Repostagem", { views: [{ state: "frozen", ySplit: 6 }] });
    sheet.properties.defaultRowHeight = 17;
    sheet.mergeCells("A1:H1");
    sheet.getCell("A1").value = "LOTE DE REPOSTAGEM — GRCON";
    sheet.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173B57" } };
    sheet.getCell("A1").alignment = { vertical: "middle" };
    sheet.getRow(1).height = 34;
    const imageId = await logo(workbook);
    if (imageId !== null) sheet.addImage(imageId, { tl: { col: 7.05, row: 0.1 }, ext: { width: 82, height: 30 } });
    sheet.mergeCells("A2:H2");
    sheet.getCell("A2").value = `Gerado em ${fmtDate(batch?.createdAt || Date.now())} · preparação de arquivos, sem confirmação automática de postagem no SIGEM`;
    sheet.getCell("A2").font = { name: "Arial", size: 9, italic: true, color: { argb: "FF506273" } };
    const summary = batch?.summary || {};
    sheet.mergeCells("A3:B3"); sheet.getCell("A3").value = `Documentos: ${summary.documents || 0}`;
    sheet.mergeCells("C3:D3"); sheet.getCell("C3").value = `Arquivos encontrados: ${summary.filesFound || 0}`;
    sheet.mergeCells("E3:F3"); sheet.getCell("E3").value = `Ausentes: ${summary.notFound || 0}`;
    sheet.mergeCells("G3:H3"); sheet.getCell("G3").value = `Ambíguos: ${summary.ambiguous || 0}`;
    ["A3","C3","E3","G3"].forEach((cell) => { sheet.getCell(cell).font = { name: "Arial", size: 10, bold: true }; sheet.getCell(cell).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } }; });
    const headers = ["eGRDT", "Documento", "Revisão válida", "Conferência", "Status SIGEM", "Arquivo encontrado", "Pasta relativa", "Situação"];
    const headerRow = sheet.getRow(6);
    headers.forEach((header, index) => { const cell = headerRow.getCell(index + 1); cell.value = header; cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF214D6B" } }; cell.alignment = { vertical: "middle", horizontal: index >= 2 ? "center" : "left" }; });
    headerRow.height = 24;
    const rows = [];
    (batch?.results || []).forEach((result) => {
      const files = result.selected?.length ? result.selected : [null];
      files.forEach((entry) => rows.push([
        result.target?.egrdtNumber || "—", result.target?.document || "—", result.target?.revision || "—", result.target?.conferenceLabel || result.target?.conferenceStatus || "—", result.target?.sigemStatus || "—", entry?.name || "—", entry?.relativePath || "—", stateLabel(result.state),
      ]));
    });
    rows.forEach((values, rowIndex) => {
      const row = sheet.getRow(7 + rowIndex);
      values.forEach((value, colIndex) => { const cell = row.getCell(colIndex + 1); cell.value = text(value); cell.font = { name: "Arial", size: 9 }; cell.alignment = { vertical: "top", wrapText: true, horizontal: [2,3,7].includes(colIndex) ? "center" : "left" }; cell.border = { bottom: { style: "hair", color: { argb: "FFD7E0E6" } } }; if (rowIndex % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FA" } }; });
      row.height = 23;
    });
    sheet.columns = [{ width: 31 }, { width: 39 }, { width: 15 }, { width: 22 }, { width: 24 }, { width: 45 }, { width: 55 }, { width: 20 }];
    sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + rows.length, column: 8 } };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
    return workbook.xlsx.writeBuffer();
  }
  function downloadName(batch) {
    const date = new Date(batch?.createdAt || Date.now());
    const pad = (v) => String(v).padStart(2, "0");
    return `GRCON_Lote_Repostagem_${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.xlsx`;
  }
  return Object.freeze({ buildWorkbook, downloadName });
});
