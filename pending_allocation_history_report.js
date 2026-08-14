(function (root, factory) {
  const History = root.GrconPendingAllocationHistory || (typeof module === "object" && module.exports ? require("./pending_allocation_history_core.js") : null);
  const getExcel = () => root.ExcelJS || (typeof module === "object" && module.exports ? require("./exceljs.min.js") : null);
  const api = factory(History, getExcel, root.GRCONBrandAssets || null);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPendingAllocationHistoryReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (History, getExcel, defaultBrand) {
  "use strict";

  function text(value) { return History ? History.text(value) : String(value == null ? "" : value).trim(); }
  function norm(value) { return History ? History.norm(value) : text(value).toUpperCase(); }
  function pad(value, size = 2) { return String(value).padStart(size, "0"); }
  
  function compactStamp(date = new Date()) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
  
  function formatDate(value, withTime = true) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", withTime
      ? { dateStyle: "short", timeStyle: "short" }
      : { dateStyle: "short" }).format(date);
  }

  function periodLabel(snapshots, startDate, endDate) {
    const bounds = History && History.periodBounds ? History.periodBounds(snapshots) : { start: "", end: "" };
    const start = text(startDate) || bounds.start;
    const end = text(endDate) || bounds.end;
    if (!start && !end) return "Todo o histórico disponível";
    const display = (value) => {
      const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : value || "—";
    };
    return `${display(start)} a ${display(end)}`;
  }

  function filterSnapshots(snapshots, startDate, endDate) {
    return History && History.filterByDate ? History.filterByDate(snapshots || [], startDate, endDate) : [...(snapshots || [])];
  }

  function snapshotRows(snapshots) {
    return (snapshots || []).map((snapshot) => ({
      "DATA DA ANÁLISE": formatDate(snapshot.analyzedAt, true),
      "DOCUMENTOS": Number(snapshot.documentCount || 0),
      "PDFs": Number(snapshot.pdfCount || 0),
      "ALOCAÇÕES": (snapshot.allocations || []).join(" · "),
      "DISCIPLINAS": (snapshot.disciplines || []).join(" · "),
      "LD UTILIZADA": text(snapshot.ldName),
      "VERSÃO DA LD": text(snapshot.ldVersion),
      "ORIGEM DOS DOCUMENTOS": text(snapshot.sourceName),
    }));
  }

  function documentRows(snapshots) {
    return (snapshots || []).flatMap((snapshot) => (snapshot.documents || []).map((doc) => ({
      "DATA DA ANÁLISE": formatDate(snapshot.analyzedAt, true),
      "DOCUMENTO": text(doc.document),
      "REVISÃO": text(doc.revision),
      "DISCIPLINA": text(doc.discipline),
      "ALOCAÇÃO": text(doc.allocation),
      "ETAPA DA ALOCAÇÃO": text(doc.allocationStage),
      "CONFIRMAÇÃO": text(doc.allocationStatus),
      "COMENTÁRIO DA FISCAL": text(doc.fiscalComment),
      "VERSÃO DA LD": text(doc.ldVersion),
      "ABA LD": text(doc.sheet),
      "LINHA LD": Number(doc.ldRow) || "",
      "ARQUIVO ORIGINAL": text(doc.originalName),
      "ARQUIVO FINAL": text(doc.finalName),
      "PDFs": Number(doc.pdfCount) || 0,
      "LD UTILIZADA": text(snapshot.ldName),
      "ORIGEM DOS DOCUMENTOS": text(snapshot.sourceName),
    })));
  }

  function summary(snapshots) {
    const source = snapshots || [];
    return History && History.summary ? History.summary(source) : {
      snapshots: source.length,
      totalDocuments: 0,
      totalPdfs: 0,
      allocations: 0,
      disciplines: 0,
      first: "",
      last: "",
    };
  }

  async function buildWorkbook(snapshots, options) {
    const opts = options || {};
    const brand = opts.brand || defaultBrand || {};
    const ExcelJS = getExcel();
    if (!ExcelJS) throw new Error("ExcelJS não está disponível.");

    const source = filterSnapshots(snapshots, opts.startDate, opts.endDate);
    const stats = summary(source);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.lastPrinted = new Date();
    workbook.properties.date1904 = false;

    // Aba Resumo
    const summarySheet = workbook.addWorksheet("Resumo", {
      properties: { defaultRowHeight: 20 },
      views: [{ showGridLines: false, zoomScale: 85 }]
    });

    summarySheet.mergeCells("A1:H2");
    summarySheet.getCell("A1").value = "GRCON · HISTÓRICO DE ALOCAÇÕES AGUARDANDO RETORNO";
    summarySheet.getCell("A1").font = { name: "Aptos Display", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
    summarySheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C5282" } };
    summarySheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };

    const metadataText = [
      `Período: ${periodLabel(source, opts.startDate, opts.endDate)}`,
      `Gerado em: ${formatDate(new Date(), true)}`,
      `GRCON versão ${opts.appVersion || "5.32.10"}`,
    ].join(" · ");

    summarySheet.mergeCells("A3:H3");
    summarySheet.getCell("A3").value = metadataText;
    summarySheet.getCell("A3").font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
    summarySheet.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
    summarySheet.getCell("A3").alignment = { vertical: "middle" };

    // Cards de resumo
    const cards = [
      ["ANÁLISES", stats.snapshots, "FF2C5282"],
      ["DOCUMENTOS", stats.totalDocuments, "FFA56812"],
      ["PDFs", stats.totalPdfs, "FF0C7657"],
      ["ALOCAÇÕES", stats.allocations, "FF6B46C1"],
    ];

    cards.forEach(([label, count, color], index) => {
      const start = index * 2 + 1;
      summarySheet.mergeCells(5, start, 7, start + 1);
      const cell = summarySheet.getCell(5, start);
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
        bottom: { style: "thin", color: { argb: "FFDCE4EA" } }
      };
    });

    // Tabela de análises
    const snapshotData = snapshotRows(source);
    if (snapshotData.length) {
      const startRow = 10;
      summarySheet.mergeCells(`A${startRow}:H${startRow}`);
      summarySheet.getCell(`A${startRow}`).value = "HISTÓRICO DE ANÁLISES COM ALOCAÇÕES PENDENTES";
      summarySheet.getCell(`A${startRow}`).font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      summarySheet.getCell(`A${startRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };

      const headers = Object.keys(snapshotData[0]);
      const headerRow = summarySheet.getRow(startRow + 1);
      headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        cell.border = { bottom: { style: "thin", color: { argb: "FFB7C8D6" } } };
      });
      headerRow.height = 30;

      snapshotData.forEach((row, rowIndex) => {
        const dataRow = summarySheet.getRow(startRow + 2 + rowIndex);
        headers.forEach((header, colIndex) => {
          const cell = dataRow.getCell(colIndex + 1);
          cell.value = row[header];
          cell.font = { name: "Aptos", size: 9.5, color: { argb: "FF263E52" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowIndex % 2 ? "FFF7F9FB" : "FFFFFFFF" } };
          cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
        });
        dataRow.height = 28;
      });

      summarySheet.columns = [
        { width: 22 }, // Data
        { width: 14 }, // Documentos
        { width: 10 }, // PDFs
        { width: 30 }, // Alocações
        { width: 30 }, // Disciplinas
        { width: 35 }, // LD
        { width: 18 }, // Versão LD
        { width: 30 }, // Origem
      ];
    }

    // Aba Documentos
    const documentSheet = workbook.addWorksheet("Documentos", {
      properties: { defaultRowHeight: 20 },
      views: [{ showGridLines: false, zoomScale: 80 }]
    });

    const documentData = documentRows(source);
    if (documentData.length) {
      const headers = Object.keys(documentData[0]);
      const headerRow = documentSheet.getRow(1);
      headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24689A" } };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        cell.border = { bottom: { style: "thin", color: { argb: "FFB7C8D6" } } };
      });
      headerRow.height = 34;

      documentData.forEach((row, rowIndex) => {
        const dataRow = documentSheet.getRow(2 + rowIndex);
        headers.forEach((header, colIndex) => {
          const cell = dataRow.getCell(colIndex + 1);
          cell.value = row[header];
          cell.font = { name: "Aptos", size: 9.5, color: { argb: "FF263E52" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowIndex % 2 ? "FFF7F9FB" : "FFFFFFFF" } };
          cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
        });
        dataRow.height = 28;
      });

      documentSheet.columns = [
        { width: 22 }, // Data
        { width: 30 }, // Documento
        { width: 12 }, // Revisão
        { width: 22 }, // Disciplina
        { width: 24 }, // Alocação
        { width: 20 }, // Etapa
        { width: 24 }, // Confirmação
        { width: 40 }, // Comentário Fiscal
        { width: 18 }, // Versão LD
        { width: 15 }, // Aba LD
        { width: 12 }, // Linha LD
        { width: 40 }, // Arquivo Original
        { width: 40 }, // Arquivo Final
        { width: 10 }, // PDFs
        { width: 35 }, // LD
        { width: 30 }, // Origem
      ];
    }

    return workbook;
  }

  async function downloadReport(snapshots, options) {
    const opts = options || {};
    const workbook = await buildWorkbook(snapshots, opts);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const name = downloadName(opts);
    
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function downloadName(options) {
    const opts = options || {};
    const timestamp = compactStamp();
    return `GRCON_Historico_Alocacoes_Pendentes_${timestamp}.xlsx`;
  }

  return Object.freeze({
    formatDate,
    periodLabel,
    filterSnapshots,
    snapshotRows,
    documentRows,
    summary,
    buildWorkbook,
    downloadReport,
    downloadName,
  });
});
