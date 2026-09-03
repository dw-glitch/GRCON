(function (root, factory) {
  const api = factory(root, root.GrconPostingConference);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, Conference) {
  "use strict";

  const BLUE = "155C8A";
  const DARK = "16324A";
  const LIGHT = "EAF2F7";
  const BORDER = "D5DEE5";
  const WHITE = "FFFFFF";
  const TEXT = "253746";
  const MUTED = "5B6770";
  const SIGEM_FILL = "F3F6F8";

  function text(value) { return Conference?.text ? Conference.text(value) : String(value ?? "").trim(); }
  function fmtDate(value, withTime) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }

  function safeName(value) {
    return text(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Conferencia_Postagem";
  }

  function downloadName(options) {
    const now = new Date();
    const stamp = `${String(now.getFullYear())}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const suffix = text(options && options.scopeLabel);
    return `${safeName(`Relatorio_Conferencia_Postagem${suffix ? `_${suffix}` : ""}_${stamp}`)}.xlsx`;
  }

  function borderStyle() {
    return {
      top: { style: "thin", color: { argb: BORDER } },
      left: { style: "thin", color: { argb: BORDER } },
      bottom: { style: "thin", color: { argb: BORDER } },
      right: { style: "thin", color: { argb: BORDER } },
    };
  }

  function applyConferenceStyle(cell, status) {
    const styles = {
      CONFIRMADO: { fill: "E4F3EA", font: "216E43" },
      AGUARDANDO: { fill: "FFF6D8", font: "775D00" },
      REVISAO_DIVERGENTE: { fill: "FFE9D5", font: "8A4B08" },
      NAO_ENCONTRADO: { fill: "FCE8E8", font: "8F2D2D" },
      REQUER_ANALISE: { fill: "EFE9FA", font: "5A3B84" },
      NAO_VERIFICADO: { fill: "EEF1F4", font: "53606A" },
    };
    const style = styles[status] || styles.NAO_VERIFICADO;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
    cell.font = { name: "Arial", bold: true, color: { argb: style.font }, size: 9 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }

  function applySigemStyle(cell) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SIGEM_FILL } };
    cell.font = { name: "Arial", size: 9, color: { argb: TEXT } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  }

  function sigemValue(value) {
    if (value === null || value === undefined) return "—";
    const raw = String(value);
    return raw.trim() ? raw : "—";
  }

  async function addLogo(workbook, sheet) {
    try {
      const brand = root.GRCONBrandAssets || {};
      let imageConfig = null;
      if (brand.reportLogoBase64) imageConfig = { base64: brand.reportLogoBase64, extension: "png" };
      else if (typeof fetch === "function") {
        const response = await fetch(brand.reportLogoFile || "grcon-logo-report.png", { cache: "no-store" });
        if (response.ok) imageConfig = { buffer: await response.arrayBuffer(), extension: "png" };
      }
      if (!imageConfig) return false;
      const imageId = workbook.addImage(imageConfig);
      sheet.addImage(imageId, { tl: { col: 0.18, row: 0.28 }, ext: { width: 132, height: 42 } });
      return true;
    } catch (error) {
      console.debug("[PostingConferenceReport] logo:", error);
      return false;
    }
  }

  function dataRowHeight(row) {
    const noteLength = String(row?.note || "").length;
    if (noteLength > 220) return 54;
    if (noteLength > 120) return 44;
    if (noteLength > 60) return 36;
    return 28;
  }

  async function buildWorkbook(rows, options) {
    if (!root.ExcelJS) throw new Error("ExcelJS não está disponível para gerar o relatório.");
    const source = rows || [];
    const summary = Conference?.summarize ? Conference.summarize(source) : {};
    const workbook = new root.ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Relatório de Conferência — Consulta Geral × Histórico";
    workbook.title = "Relatório de Conferência — Consulta Geral × Histórico";

    const sheet = workbook.addWorksheet("RESUMO", { views: [{ state: "frozen", ySplit: 10, xSplit: 2 }] });
    sheet.properties.defaultRowHeight = 18;

    sheet.mergeCells("A1:C3");
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
    sheet.mergeCells("D1:L2");
    const title = sheet.getCell("D1");
    title.value = "RELATÓRIO DE CONFERÊNCIA — CONSULTA GERAL × HISTÓRICO";
    title.font = { name: "Arial", size: 15, bold: true, color: { argb: DARK } };
    title.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

    sheet.mergeCells("D3:L3");
    const subtitle = sheet.getCell("D3");
    subtitle.value = `Histórico de eGRDTs × Consulta Geral SIGEM${options?.baseFileName ? ` · Base: ${options.baseFileName}` : ""}`;
    subtitle.font = { name: "Arial", size: 9, color: { argb: MUTED } };
    subtitle.alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(1).height = 24;
    sheet.getRow(2).height = 22;
    sheet.getRow(3).height = 18;

    for (let col = 1; col <= 12; col += 1) {
      sheet.getCell(4, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    }
    sheet.getRow(4).height = 5;
    await addLogo(workbook, sheet);

    const kpis = [
      ["Total enviado", summary.total || 0],
      ["Postado", summary.confirmed || 0],
      ["Não postado ainda", summary.awaiting || 0],
      ["Rev. divergente", summary.divergent || 0],
      ["Não encontrado", summary.notFound || 0],
      ["Requer análise", summary.review || 0],
      ["% postado", `${Number(summary.percentConfirmed || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`],
    ];
    kpis.forEach(([label, value], index) => {
      const startCol = index + 1;
      const labelCell = sheet.getCell(5, startCol);
      const valueCell = sheet.getCell(6, startCol);
      labelCell.value = label;
      valueCell.value = value;
      labelCell.font = { name: "Arial", size: 8, bold: true, color: { argb: MUTED } };
      valueCell.font = { name: "Arial", size: 13, bold: true, color: { argb: DARK } };
      labelCell.fill = valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
      labelCell.border = valueCell.border = borderStyle();
      labelCell.alignment = valueCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    sheet.getRow(5).height = 20;
    sheet.getRow(6).height = 24;

    sheet.mergeCells("A8:L8");
    const scope = sheet.getCell("A8");
    scope.value = `${text(options?.scopeLabel) || "Todos os documentos"} · Base atualizada em ${fmtDate(options?.baseImportedAt, true) || "—"} · Relatório gerado em ${fmtDate(new Date().toISOString(), true)}`;
    scope.font = { name: "Arial", size: 8, color: { argb: MUTED } };
    scope.alignment = { vertical: "middle", horizontal: "left" };

    const headers = [
      "Código", "Tipo", "Disciplina", "eGRDT", "Data eGRDT", "Revisão enviada",
      "Revisão encontrada", "Conferência", "Status SIGEM", "Data da confirmação", "Última conferência", "Observação",
    ];
    const headerRow = sheet.getRow(10);
    headerRow.values = headers;
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = borderStyle();
    });

    source.forEach((row, index) => {
      const excelRow = sheet.getRow(11 + index);
      excelRow.values = [
        row.document,
        row.documentFamily || row.sheet,
        row.discipline,
        row.egrdtNumber,
        fmtDate(row.generatedAt, false),
        row.revisionSent,
        row.revisionFound,
        row.conferenceLabel || row.statusLabel || Conference?.statusLabel?.(row.status) || row.status,
        sigemValue(row.sigemStatus),
        fmtDate(row.firstConfirmedAt, true),
        fmtDate(row.lastCheckedAt, true),
        row.note,
      ];
      excelRow.height = dataRowHeight(row);
      excelRow.font = { name: "Arial", size: 9, color: { argb: TEXT } };
      excelRow.alignment = { vertical: "top", wrapText: true };
      excelRow.eachCell((cell) => { cell.border = borderStyle(); });
      if (index % 2 === 1) {
        excelRow.eachCell((cell, colNumber) => {
          if (colNumber !== 8 && colNumber !== 9) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFB" } };
        });
      }
      applyConferenceStyle(excelRow.getCell(8), row.status);
      applySigemStyle(excelRow.getCell(9));
      excelRow.getCell(1).font = { name: "Arial", size: 9, bold: true, color: { argb: DARK } };
      [5, 6, 7, 10, 11].forEach((col) => { excelRow.getCell(col).alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
    });

    const lastRow = Math.max(10, 10 + source.length);
    sheet.autoFilter = { from: { row: 10, column: 1 }, to: { row: lastRow, column: 12 } };
    sheet.columns = [
      { width: 34 }, { width: 13 }, { width: 18 }, { width: 31 }, { width: 13 }, { width: 15 },
      { width: 19 }, { width: 20 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 48 },
    ];
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    sheet.pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    sheet.headerFooter.oddFooter = "&LGRCON&CRelatório de Conferência — Consulta Geral × Histórico&R&P / &N";

    return workbook.xlsx.writeBuffer();
  }

  return Object.freeze({ buildWorkbook, downloadName });
});
