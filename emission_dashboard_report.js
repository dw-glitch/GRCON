/* Extracted from the existing dashboard exporter; same sheets and styles. */
(function(root){
"use strict";
const TREND_ARROWS={up:"↑",down:"↓",flat:"→"};
function dateLabel(key, withYear) {
    const parts = String(key || "").split("-");
    if (parts.length !== 3) return key || "—";
    return withYear ? `${parts[2]}/${parts[1]}/${parts[0]}` : `${parts[2]}/${parts[1]}`;
  }
function periodLabel(series) {
    if (!series.length) return "Nenhuma emissão no período selecionado";
    const firstItem = series[0];
    const lastItem = series[series.length - 1];
    const firstKey = firstItem.startDate || firstItem.date;
    const lastKey = lastItem.endDate || lastItem.date;
    const first = dateLabel(firstKey, true);
    const last = dateLabel(lastKey, true);
    return first === last ? first : first + " — " + last;
  }
function kpiTrend(current, previous) {
    if (previous === null || previous === undefined) return null;
    const now = Number(current || 0);
    const before = Number(previous || 0);
    if (!before && !now) return { direction: "flat", text: "sem emissões", label: "Sem emissões neste período nem no anterior" };
    if (!before) return { direction: "up", text: "novo no período", label: `Nenhuma emissão no período anterior; ${now.toLocaleString("pt-BR")} neste` };
    const delta = now - before;
    const percent = Math.round((delta / before) * 100);
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const sign = delta > 0 ? "+" : "";
    const text = delta === 0 ? "estável" : `${sign}${percent.toLocaleString("pt-BR")}%`;
    const word = delta > 0 ? "acima" : delta < 0 ? "abaixo" : "igual";
    const label = delta === 0
      ? `Igual ao período anterior (${before.toLocaleString("pt-BR")})`
      : `${Math.abs(percent).toLocaleString("pt-BR")}% ${word} do período anterior (${before.toLocaleString("pt-BR")})`;
    return { direction, text, label };
  }
function columnLetter(number) {
    let value = Math.max(1, Number(number) || 1);
    let output = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      output = String.fromCharCode(65 + remainder) + output;
      value = Math.floor((value - 1) / 26);
    }
    return output;
  }
function styleExcelHeader(row, color) {
    row.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color || "FF153A5C" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB9C7D2" } } };
    });
    row.height = 30;
  }
function styleExcelData(row, index) {
    row.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE1E8ED" } } };
      if (index % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    });
  }
async function buildWorkbook(payload,onProgress=()=>{}){
const {daily,series,documentRows,totals}=payload;const dashboardGranularity=payload.granularity,dashboardWeeks=payload.weeks;
      const workbook = new root.ExcelJS.Workbook();
      workbook.creator = "GRCON";
      workbook.lastModifiedBy = "GRCON";
      workbook.company = "CONSAG Engenharia";
      workbook.title = "Dashboard de emissões documentais";
      workbook.created = new Date();
      workbook.modified = new Date();

      const summary = workbook.addWorksheet("Dashboard", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
      summary.columns = Array.from({ length: 12 }, () => ({ width: 14 }));
      for (let row = 1; row <= 3; row += 1) for (let col = 1; col <= 12; col += 1) summary.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      summary.mergeCells("C1:L2");
      summary.getCell("C1").value = "GRCON · DASHBOARD DE EMISSÕES DOCUMENTAIS";
      summary.getCell("C1").font = { name: "Aptos Display", size: 19, bold: true, color: { argb: "FFFFFFFF" } };
      summary.getCell("C1").alignment = { vertical: "middle" };
      summary.mergeCells("A4:L4");
      summary.getCell("A4").value = `${totals.documents.toLocaleString("pt-BR")} documento(s) · Período: ${periodLabel(series)} · Agrupamento: ${dashboardGranularity === "week" ? "Semanal (" + dashboardWeeks + " semana(s))" : "Diário"} · Fonte: Histórico de eGRDTs do GRCON · ${new Date().toLocaleString("pt-BR")}`;
      summary.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
      summary.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };

      // O Excel repete a mesma comparação da tela: um indicador sem referência
      // não diz se o número é bom ou ruim, e quem recebe o relatório não tem o
      // período anterior à mão.
      const exportPreviousTotals = payload.previousTotals;

      const cards = [
        ["DOCUMENTOS", totals.documents, "FF24689A", "documents"], ["ET", totals.ET, "FF0B7895", "ET"], ["N-1710", totals["N-1710"], "FF6D4AC7", "N-1710"],
        ["CV", totals.CV, "FFB16A16", "CV"], ["eGRDTs", totals.egrdts, "FF53697B", "egrdts"], ["DIAS", totals.days, "FF0C7657", "days"],
      ];
      cards.forEach(([label, value, color, key], index) => {
        const start = index * 2 + 1;
        summary.mergeCells(6, start, 8, start + 1);
        const cell = summary.getCell(6, start);
        cell.value = { richText: [
          { font: { name: "Aptos", size: 8, bold: true, color: { argb: "FF6F7E8C" } }, text: `${label}\n` },
          { font: { name: "Aptos Display", size: 20, bold: true, color: { argb: color } }, text: Number(value || 0).toLocaleString("pt-BR") },
          ...(() => {
            const trend = exportPreviousTotals ? kpiTrend(value, exportPreviousTotals[key]) : null;
            if (!trend) return [];
            const tone = trend.direction === "up" ? "FF116B47" : trend.direction === "down" ? "FF9C332C" : "FF6F7E8C";
            return [{ font: { name: "Aptos", size: 8, bold: true, color: { argb: tone } }, text: `\n${TREND_ARROWS[trend.direction]} ${trend.text}` }];
          })(),
        ] };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
        cell.border = { left: { style: "medium", color: { argb: color } }, top: { style: "thin", color: { argb: "FFDCE4EA" } }, right: { style: "thin", color: { argb: "FFDCE4EA" } }, bottom: { style: "thin", color: { argb: "FFDCE4EA" } } };
      });

      const imageBase64 = payload.imageBase64;
      if (imageBase64) {
        const imageId = workbook.addImage({ base64: imageBase64, extension: "png" });
        summary.addImage(imageId, { tl: { col: .2, row: 9.4 }, ext: { width: 1160, height: 480 } });
        for (let row = 10; row <= 33; row += 1) summary.getRow(row).height = 20;
      }
      summary.mergeCells("A35:L36");
      summary.getCell("A35").value = payload.insight;
      summary.getCell("A35").alignment = { vertical: "middle", wrapText: true };
      summary.getCell("A35").font = { name: "Aptos", size: 10, color: { argb: "FF3D5568" } };
      summary.getCell("A35").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F6F9" } };
      summary.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: .2, right: .2, top: .35, bottom: .35, header: .2, footer: .2 } };
      summary.headerFooter.oddFooter = "&LGRCON&C&P de &N&R&D";
      if (root.GrconRequestsReport?.attachBrandLogo) await root.GrconRequestsReport.attachBrandLogo(workbook, summary, root.GRCONBrandAssets, (url,options)=>root.fetch(new URL(url,new URL("../",root.location.href)),options));

      const dailySheet = workbook.addWorksheet("Emissões diárias", { views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false }] });
      const dailyHeaders = ["DATA", "ET", "N-1710", "CV", "TOTAL DE DOCUMENTOS", "eGRDTs COM EMISSÃO"];
      for (let r = 1; r <= 3; r += 1) for (let c = 1; c <= dailyHeaders.length; c += 1) dailySheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      dailySheet.mergeCells("C1:F2"); dailySheet.getCell("C1").value = "GRCON · EMISSÕES DIÁRIAS"; dailySheet.getCell("C1").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
      dailySheet.mergeCells("A4:F4"); dailySheet.getCell("A4").value = `Período: ${periodLabel(daily)} · dados idênticos aos usados no gráfico do Dashboard`; dailySheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } }; dailySheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
      dailyHeaders.forEach((header, index) => dailySheet.getCell(6, index + 1).value = header); styleExcelHeader(dailySheet.getRow(6));
      daily.forEach((day, index) => {
        const row = dailySheet.getRow(index + 7);
        row.values = [dateLabel(day.date, true), day.ET, day["N-1710"], day.CV, day.total, day.egrdts];
        styleExcelData(row, index);
      });
      dailySheet.columns = [{ width: 15 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 23 }, { width: 21 }];
      dailySheet.autoFilter = { from: "A6", to: `F${daily.length + 6}` };
      if (root.GrconRequestsReport?.attachBrandLogo) await root.GrconRequestsReport.attachBrandLogo(workbook, dailySheet, root.GRCONBrandAssets, (url,options)=>root.fetch(new URL(url,new URL("../",root.location.href)),options));


      let weeklySheet = null;
      if (dashboardGranularity === "week") {
        weeklySheet = workbook.addWorksheet("Emissões semanais", { views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false }] });
        const weeklyHeaders = ["INÍCIO DA SEMANA", "FIM CONSIDERADO", "ET", "N-1710", "CV", "TOTAL DE DOCUMENTOS", "eGRDTs COM EMISSÃO"];
        for (let r = 1; r <= 3; r += 1) for (let c = 1; c <= weeklyHeaders.length; c += 1) weeklySheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
        weeklySheet.mergeCells("C1:G2"); weeklySheet.getCell("C1").value = "GRCON · EMISSÕES SEMANAIS"; weeklySheet.getCell("C1").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
        weeklySheet.mergeCells("A4:G4"); weeklySheet.getCell("A4").value = "Semanas de segunda a domingo · " + dashboardWeeks + " semana(s) · dados agregados dos mesmos registros do Dashboard";
        weeklySheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } }; weeklySheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
        weeklyHeaders.forEach((header, index) => weeklySheet.getCell(6, index + 1).value = header); styleExcelHeader(weeklySheet.getRow(6));
        series.forEach((week, index) => {
          const row = weeklySheet.getRow(index + 7);
          row.values = [dateLabel(week.startDate, true), dateLabel(week.endDate, true), week.ET, week["N-1710"], week.CV, week.total, week.egrdts];
          styleExcelData(row, index);
        });
        weeklySheet.columns = [{ width: 19 }, { width: 19 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 23 }, { width: 21 }];
        weeklySheet.autoFilter = { from: "A6", to: "G" + (series.length + 6) };
        if (root.GrconRequestsReport?.attachBrandLogo) await root.GrconRequestsReport.attachBrandLogo(workbook, weeklySheet, root.GRCONBrandAssets, (url,options)=>root.fetch(new URL(url,new URL("../",root.location.href)),options));
      }

      const docsSheet = workbook.addWorksheet("Documentos emitidos", { views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false, zoomScale: 80 }] });
      const docHeaders = ["DATA", "eGRDT", "FAMÍLIA", "DOCUMENTO", "REVISÃO", "TÍTULO", "DISCIPLINA", "CAMINHO DATABOOK", "QTD. ARQUIVOS", "ARQUIVOS DA EMISSÃO"];
      for (let r = 1; r <= 3; r += 1) for (let c = 1; c <= docHeaders.length; c += 1) docsSheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      docsSheet.mergeCells(`C1:${columnLetter(docHeaders.length)}2`); docsSheet.getCell("C1").value = "GRCON · DOCUMENTOS EMITIDOS"; docsSheet.getCell("C1").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
      docsSheet.mergeCells(`A4:${columnLetter(docHeaders.length)}4`); docsSheet.getCell("A4").value = "Rastreabilidade documento a documento das emissões consideradas no Dashboard."; docsSheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
      docHeaders.forEach((header, index) => docsSheet.getCell(6, index + 1).value = header); styleExcelHeader(docsSheet.getRow(6));
      documentRows.forEach((item, index) => {
        if(index%500===0)onProgress({message:"Montando documentos emitidos",done:index,total:documentRows.length});
        const row = docsSheet.getRow(index + 7);
        row.values = [dateLabel(item.date, true), item.egrdt, item.family, item.document, item.revision, item.title, item.discipline, item.databook, item.fileCount, item.files];
        styleExcelData(row, index);
      });
      docsSheet.columns = [{ width: 14 }, { width: 36 }, { width: 12 }, { width: 44 }, { width: 12 }, { width: 44 }, { width: 20 }, { width: 42 }, { width: 14 }, { width: 55 }];
      docsSheet.autoFilter = { from: "A6", to: `${columnLetter(docHeaders.length)}${documentRows.length + 6}` };
      if (root.GrconRequestsReport?.attachBrandLogo) await root.GrconRequestsReport.attachBrandLogo(workbook, docsSheet, root.GRCONBrandAssets, (url,options)=>root.fetch(new URL(url,new URL("../",root.location.href)),options));

      onProgress({message:"Preparando arquivo Excel…"});
      const buffer = await workbook.xlsx.writeBuffer();
      const validation = new root.ExcelJS.Workbook();
      await validation.xlsx.load(buffer);
      if (!validation.getWorksheet("Dashboard") || !validation.getWorksheet("Emissões diárias") || !validation.getWorksheet("Documentos emitidos") || (dashboardGranularity === "week" && !validation.getWorksheet("Emissões semanais"))) throw new Error("A planilha do Dashboard não pôde ser validada.");

return buffer;
}
root.GrconEmissionDashboardReport=Object.freeze({buildWorkbook});
})(typeof self!=="undefined"?self:globalThis);
