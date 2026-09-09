(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconProjectWiseReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  function text(v) { return String(v == null ? "" : v); }
  function isoDate(value) {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString("pt-BR");
  }
  function safeName(value) {
    return text(value).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 110) || "Conferencia_SIGEM_ProjectWise";
  }
  function styleHeader(row) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155C8A" } };
    row.alignment = { vertical: "middle", wrapText: true };
    row.height = 28;
  }
  function borders(cell) {
    cell.border = {
      top: { style: "thin", color: { argb: "FFD9E1E7" } },
      left: { style: "thin", color: { argb: "FFD9E1E7" } },
      bottom: { style: "thin", color: { argb: "FFD9E1E7" } },
      right: { style: "thin", color: { argb: "FFD9E1E7" } },
    };
  }
  function addSummary(workbook, result, sourceMeta) {
    const ws = workbook.addWorksheet("Resumo");
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.mergeCells("A1:D1");
    ws.getCell("A1").value = "GRCON — Conferência SIGEM × ProjectWise";
    ws.getCell("A1").font = { bold: true, size: 16 };
    ws.getCell("A2").value = "Modo";
    ws.getCell("B2").value = result.writeEnabled ? "Integração autorizada" : "Somente leitura / Dry Run";
    ws.getCell("C2").value = "Gerado em";
    ws.getCell("D2").value = isoDate(result.generatedAt);
    const summary = result.summary || {};
    const rows = [
      ["Indicador", "Quantidade", "Indicador", "Quantidade"],
      ["Total SIGEM", summary.totalSigem || 0, "Encontrados no ProjectWise", summary.foundProjectWise || 0],
      ["Não encontrados", summary.notFound || 0, "Mesma revisão", summary.sameRevision || 0],
      ["Revisão divergente", summary.revisionDifferent || 0, "PW com revisão anterior", summary.pwOlder || 0],
      ["PW com revisão superior", summary.pwNewer || 0, "Possível duplicidade", summary.duplicates || 0],
      ["Associação duvidosa", summary.doubtful || 0, "Codificação irregular", summary.invalidCode || 0],
      ["Aptos pela identidade", summary.eligibleIdentity || 0, "Aptos automáticos agora", summary.automaticReady || 0],
      ["Validação humana", summary.manualValidation || 0, "Taxa de conciliação", `${summary.reconciliationRate || 0}%`],
    ];
    ws.addRows(rows);
    styleHeader(ws.getRow(4));
    for (let r = 4; r <= 11; r += 1) for (let c = 1; c <= 4; c += 1) borders(ws.getCell(r, c));
    ws.getColumn(1).width = 30; ws.getColumn(2).width = 18; ws.getColumn(3).width = 31; ws.getColumn(4).width = 20;
    const metaRow = 13;
    ws.getCell(metaRow, 1).value = "Fontes";
    ws.getCell(metaRow, 1).font = { bold: true };
    ws.getCell(metaRow + 1, 1).value = "Consulta Geral SIGEM";
    ws.getCell(metaRow + 1, 2).value = sourceMeta?.sigem?.fileName || "";
    ws.getCell(metaRow + 2, 1).value = "Inventário ProjectWise";
    ws.getCell(metaRow + 2, 2).value = sourceMeta?.projectwise?.fileName || "";
  }
  function addRows(workbook, result) {
    const ws = workbook.addWorksheet("Conciliação");
    const headers = [
      "Código","Revisão SIGEM","Revisão PW","Status SIGEM","Status PW/Conciliação","Título","TAG","EAP",
      "Disciplina","Tipo","Código PW","ID PW","Caminho ProjectWise","Arquivo PW","Taxonomia","Ação","Confiança",
      "Apto pela identidade","Apto automático","Bloqueios","Motivo","Data da análise"
    ];
    ws.addRow(headers); styleHeader(ws.getRow(1));
    (result.rows || []).forEach((r) => ws.addRow([
      r.sigemDocument, r.sigemRevision, r.pwRevision, r.sigemStatus, r.status, r.title, r.tag, r.eap,
      r.discipline, r.documentType, r.pwDocument, r.pwId, r.pwPath, r.pwFileName, r.pwTaxonomy, r.action, r.confidence,
      r.automationEligible ? "SIM" : "NÃO", r.automaticReady ? "SIM" : "NÃO", (r.blockers || []).join("; "), r.reason, isoDate(result.generatedAt)
    ]));
    ws.autoFilter = { from: "A1", to: `V${Math.max(1, ws.rowCount)}` };
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
    const widths = [34,14,14,22,34,44,18,16,20,18,30,24,48,34,26,20,14,18,18,40,70,22];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.eachRow((row, number) => {
      if (number > 1) row.alignment = { vertical: "top", wrapText: true };
      row.eachCell(borders);
    });
  }
  function addDryRun(workbook, dryRun) {
    const ws = workbook.addWorksheet("Dry Run");
    const headers = ["#","Documento","Revisão","Operação","Arquivo","Destino ProjectWise","ID PW","Título","Disciplina","Área","EAP","TAG","Tipo","Executável","Bloqueios","Observação"];
    ws.addRow(headers); styleHeader(ws.getRow(1));
    (dryRun || []).forEach((d) => ws.addRow([
      d.sequence, d.document, d.revision, d.operation, d.file, d.destination, d.projectWiseId,
      d.metadata?.title || "", d.metadata?.discipline || "", d.metadata?.area || "", d.metadata?.eap || "",
      d.metadata?.tag || "", d.metadata?.documentType || "", d.executable ? "SIM" : "NÃO",
      (d.blockers || []).join("; "), d.note
    ]));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: `P${Math.max(1, ws.rowCount)}` };
    [7,34,14,20,34,48,24,44,20,18,16,18,18,14,42,70].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.eachRow((row, number) => { if (number > 1) row.alignment = { vertical: "top", wrapText: true }; row.eachCell(borders); });
  }
  async function build(result, options) {
    if (!root.ExcelJS) throw new Error("ExcelJS não está disponível.");
    const workbook = new root.ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.created = new Date();
    addSummary(workbook, result, options?.sourceMeta);
    addRows(workbook, result);
    addDryRun(workbook, options?.dryRun || []);
    return workbook.xlsx.writeBuffer();
  }
  async function download(result, options) {
    const buffer = await build(result, options);
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName(options?.fileName)}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.xlsx`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return Object.freeze({ build, download });
});