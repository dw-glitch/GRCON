(function (root, factory) {
  const api = factory(root, root.GrconPostingConference);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, Conference) {
  "use strict";
  const text = value => Conference?.text ? Conference.text(value) : String(value ?? "").trim();
  const statusText = row => row.conferenceLabel || row.statusLabel || Conference?.statusLabel?.(row.status) || row.status || "";
  function eventList(row) {
    return (row.sends || []).map(send => [
      send.egrdtNumber || "eGRDT não informada",
      send.generatedAt ? new Date(send.generatedAt).toLocaleDateString("pt-BR") : "data não informada",
      "Rev. " + (send.revisionSent || "—"), statusText(send) || "Não verificado",
    ].join(" — ")).join("\n");
  }
  function downloadName(options) {
    const now = new Date();
    const stamp = String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
    return ("Relatorio_Conferencia_Postagem_" + (text(options?.scopeLabel) || "Pendencias") + "_" + stamp)
      .replace(/[\\/:*?"<>|]+/g, "-") + ".xlsx";
  }
  async function buildWorkbook(rows, options) {
    if (root.document && typeof Worker === "function") {
      try {
        await root.GRCONModuleLoader?.ensure("performance");
        if (root.GrconPerformance?.supported) return await root.GrconPerformance.buildSpreadsheet("conference", { rows, options });
      } catch (error) { console.warn("[GRCON] Exportação da Conferência em modo compatível", error); }
    }
    if (!root.ExcelJS) throw new Error("ExcelJS não está disponível para gerar o relatório.");
    // Uma linha por documento/revisão da emissão. O contexto vem da GRDT completa,
    // nunca da seleção filtrada que será escrita na planilha.
    const events = (rows || []).flatMap(row => Array.isArray(row.sends) && row.sends.length ? row.sends : [row]);
    const source = options?.pending ? events.filter(row => row.status !== "CONFIRMADO") : events;
    const groups = new Map((options?.groups || []).map(group => [group.historyId || group.egrdtNumber, group]));
    const workbook = new root.ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.created = new Date();
    workbook.title = "Conferência de documentos pendentes";
    const sheet = workbook.addWorksheet(options?.pending ? "Detalhamento" : "RESUMO", {
      views: [{ state: "frozen", ySplit: 10, xSplit: 1, showGridLines: false }],
    });
    const headers = ["Código", "Revisão enviada", "eGRDT", "Pendência do documento",
      "Revisão encontrada", "Status SIGEM", "Pendência da GRDT", "Detalhamento da pendência", "PROPÓSITO DE EMISSÃO"];
    sheet.columns = [34, 12, 27, 27, 12, 24, 32, 46, 26].map(width => ({ width }));
    sheet.mergeCells("A1:I2");
    sheet.getCell("A1").value = "CONFERÊNCIA — DOCUMENTOS PENDENTES";
    sheet.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFF" } };
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "16324A" } };
    sheet.getCell("A1").alignment = { vertical: "middle" };
    sheet.mergeCells("A4:I4");
    sheet.getCell("A4").value = source.length + " documento(s)/revisão(ões) · " +
      new Set(source.map(row => row.historyId || row.egrdtNumber).filter(Boolean)).size + " GRDT(s)";
    sheet.mergeCells("A6:I6");
    sheet.getCell("A6").value = "Pendente = revisão enviada sem confirmação na base consultada. Não comprova falha de postagem.";
    sheet.mergeCells("A7:I7");
    sheet.getCell("A7").value = "A abrangência considera todos os documentos da GRDT, inclusive os confirmados e os ocultos pelos filtros.";
    sheet.mergeCells("A8:I8");
    sheet.getCell("A8").value = "Base: " + (text(options?.baseFileName) || "não informada") +
      (options?.baseImportedAt ? " · Atualizada em " + new Date(options.baseImportedAt).toLocaleString("pt-BR") : "");
    [4, 6, 7, 8].forEach(index => {
      sheet.getRow(index).font = { name: "Arial", size: 10, color: { argb: "53606A" } };
      sheet.getRow(index).alignment = { wrapText: true, vertical: "middle" };
      sheet.getRow(index).height = index === 6 || index === 7 ? 26 : 20;
    });
    const header = sheet.getRow(10);
    header.values = headers;
    header.height = 30;
    header.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "16324A" } };
    header.alignment = { wrapText: true, vertical: "middle" };
    source.forEach((row, index) => {
      const scope = Conference?.pendingScope?.(groups.get(row.historyId || row.egrdtNumber)) ||
        { label: "GRDT a verificar", detail: "Não foi possível conferir a GRDT completa." };
      const excelRow = sheet.getRow(index + 11);
      excelRow.values = [row.document, row.revisionSent || row.currentRevision || "—", row.egrdtNumber || "Não identificada",
        statusText(row) + (row.historicalPreserved ? " — já confirmado anteriormente; não reenviar" : ""),
        row.revisionFound || "—", row.sigemStatus || "Não informado", scope.label, scope.detail,
        text(row.purpose) || "Não identificado"];
      excelRow.height = row.historicalPreserved ? 58 : 42;
      excelRow.font = { name: "Arial", size: 10, color: { argb: "253746" } };
      excelRow.alignment = { wrapText: true, vertical: "middle" };
      excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "F3F6F8" : "FFFFFF" } };
      excelRow.getCell(1).font = { name: "Arial", size: 10, bold: true, color: { argb: "16324A" } };
      excelRow.getCell(7).font = { name: "Arial", size: 10, bold: true, color: { argb: "16324A" } };
    });
    sheet.autoFilter = { from: { row: 10, column: 1 }, to: { row: Math.max(10, 10 + source.length), column: headers.length } };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "10:10" };
    return workbook.xlsx.writeBuffer();
  }
  return Object.freeze({ buildWorkbook, downloadName, eventList });
});
