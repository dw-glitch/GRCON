(function (root, factory) {
  const api = factory(root.GrconPostingConference);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Conference) {
  "use strict";

  const BLUE = "155C8A";
  const DARK = "16324A";
  const LIGHT = "EAF2F7";
  const BORDER = "D5DEE5";
  const WHITE = "FFFFFF";
  const TEXT = "253746";

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

  function applyStatusStyle(cell, status) {
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
    cell.font = { bold: true, color: { argb: style.font }, size: 9 };
  }

  async function buildWorkbook(rows, options) {
    if (!root.ExcelJS) throw new Error("ExcelJS não está disponível para gerar o relatório.");
    const source = rows || [];
    const summary = Conference?.summarize ? Conference.summarize(source) : {};
    const workbook = new root.ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Relatório de Conferência de Postagem";
    workbook.title = "Relatório de Conferência de Postagem";

    const sheet = workbook.addWorksheet("RESUMO", { views: [{ state: "frozen", ySplit: 10, xSplit: 2 }] });
    sheet.properties.defaultRowHeight = 18;
    sheet.mergeCells("A1:K1");
    const title = sheet.getCell("A1");
    title.value = "RELATÓRIO DE CONFERÊNCIA DE POSTAGEM";
    title.font = { name: "Arial", size: 16, bold: true, color: { argb: WHITE } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    title.alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(1).height = 28;

    sheet.mergeCells("A2:K2");
    const subtitle = sheet.getCell("A2");
    subtitle.value = `Histórico de eGRDTs × Consulta Geral SIGEM${options?.baseFileName ? ` · Base: ${options.baseFileName}` : ""}`;
    subtitle.font = { name: "Arial", size: 9, italic: true, color: { argb: TEXT } };
    subtitle.alignment = { vertical: "middle", horizontal: "left" };

    const kpis = [
      ["Total enviado", summary.total || 0],
      ["Confirmado", summary.confirmed || 0],
      ["Aguardando", summary.awaiting || 0],
      ["Rev. divergente", summary.divergent || 0],
      ["Não encontrado", summary.notFound || 0],
      ["Requer análise", summary.review || 0],
      ["% confirmado", `${Number(summary.percentConfirmed || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`],
    ];
    kpis.forEach(([label, value], index) => {
      const startCol = index + 1;
      const labelCell = sheet.getCell(4, startCol);
      const valueCell = sheet.getCell(5, startCol);
      labelCell.value = label;
      valueCell.value = value;
      labelCell.font = { name: "Arial", size: 8, bold: true, color: { argb: "5B6770" } };
      valueCell.font = { name: "Arial", size: 13, bold: true, color: { argb: DARK } };
      labelCell.fill = valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
      labelCell.border = valueCell.border = borderStyle();
      labelCell.alignment = valueCell.alignment = { horizontal: "center", vertical: "middle" };
    });

    sheet.mergeCells("A7:K7");
    const scope = sheet.getCell("A7");
    scope.value = `${text(options?.scopeLabel) || "Todos os documentos"} · Base atualizada em ${fmtDate(options?.baseImportedAt, true) || "—"} · Relatório gerado em ${fmtDate(new Date().toISOString(), true)}`;
    scope.font = { name: "Arial", size: 8, color: { argb: "5B6770" } };

    const headers = [
      "Código", "Tipo", "Disciplina", "eGRDT", "Data eGRDT", "Revisão enviada",
      "Revisão encontrada", "Status da conferência", "Data da confirmação", "Última conferência", "Observação",
    ];
    const headerRow = sheet.getRow(10);
    headerRow.values = headers;
    headerRow.height = 26;
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
        row.statusLabel || Conference?.statusLabel?.(row.status) || row.status,
        fmtDate(row.firstConfirmedAt, true),
        fmtDate(row.lastCheckedAt, true),
        row.note,
      ];
      excelRow.font = { name: "Arial", size: 9, color: { argb: TEXT } };
      excelRow.alignment = { vertical: "top", wrapText: true };
      excelRow.eachCell((cell) => { cell.border = borderStyle(); });
      if (index % 2 === 1) {
        excelRow.eachCell((cell, colNumber) => {
          if (colNumber !== 8) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFB" } };
        });
      }
      applyStatusStyle(excelRow.getCell(8), row.status);
    });

    const lastRow = Math.max(10, 10 + source.length);
    sheet.autoFilter = { from: { row: 10, column: 1 }, to: { row: lastRow, column: 11 } };
    sheet.columns = [
      { width: 34 }, { width: 13 }, { width: 18 }, { width: 34 }, { width: 13 }, { width: 15 },
      { width: 20 }, { width: 22 }, { width: 20 }, { width: 20 }, { width: 58 },
    ];
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    sheet.pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    sheet.headerFooter.oddFooter = "&LGRCON&CRelatório de Conferência de Postagem&R&P / &N";

    return workbook.xlsx.writeBuffer();
  }

  return Object.freeze({ buildWorkbook, downloadName });
});
