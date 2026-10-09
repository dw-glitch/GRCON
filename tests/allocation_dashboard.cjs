const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("../xlsx.full.min.js");
const Registry = require("../allocation_registry_core.js");
const Model = require("../allocation_dashboard_core.js");

const header = [
  "ABA", "VERSÃO \nDA LD", "DATA DO ENVIO\n DA ALOC", "Retorno da Fiscal 01\n (Renata)",
  "Resposta da Fiscal 01\n (Renata)", "Retorno da Fiscal 02\n (Nani)", "STATUS DA ALOCAÇÃO",
  "ALOCAÇÃO", "FAROL", "NomeDocumento", "Data Prevista", "Workflow", "Documento Ativo",
  "Ação", "Data da Linha Base", "Propósito de Emissão Original", "Documento Crítico", "Observação"
];
const row = (document, alloc, status, response = "", sent = "13/08/2026") =>
  ["ET_LD_004", "E26", sent, "14/08/2026", response, "", status, alloc, "1", document,
   "20/08/2026", "UHDT", "SIM", "INCLUSÃO", "", "PARA CONSTRUÇÃO", "NÃO", "Observação"];
const book = XLSX.utils.book_new();
const rows = [[],[],[],[],[],[],header,
 row("DOC-000001", "A-01", "CONCLUÍDA", "Aceito"),
 row("DOC-000002", "A-01", "FISCAL 01 - RECUSADO", "Corrigir identificação"),
 row("DOC-000003", "A-02", "FISCAL 02 - AGUARDANDO RETORNO"),
 row("DOC-000003", "A-02", "FISCAL 02 - AGUARDANDO RETORNO"),
 row("DOC-000004", "A-03", "PENDENTE ENVIO DE LD"),
 row("DOC-000001", "A-04", "CONCLUIDA")
];
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Central de alocação");
const parsed = Registry.parseWorkbook(book, XLSX);
assert.equal(parsed.count, 6);
assert.equal(parsed.records[0].fiscal1ReturnedAt, "14/08/2026");
assert.equal(parsed.records[0].fiscalComment, "Aceito");
assert.equal(parsed.records[0].action, "INCLUSÃO");
assert.equal(parsed.records[0].originalPurpose, "PARA CONSTRUÇÃO");
assert.equal(parsed.records[0].remarks, "Observação");
assert.equal(parsed.records[0].plannedAt, "20/08/2026");
assert.equal(parsed.records[0].ldSheet, "ET_LD_004");
const prepared = Model.prepare(parsed.records);
assert.equal(prepared.rows.length, 5);
assert.equal(prepared.duplicateLinks, 1);
const dashboard = Model.aggregate(prepared.rows);
assert.equal(dashboard.groups.length, 4);
assert.equal(dashboard.documents, 4);
assert.equal(dashboard.byStatus.completed, 2);
assert.equal(dashboard.byStatus.fiscal1Rejected, 1);
assert.equal(dashboard.byStatus.fiscal2Waiting, 1);
assert.equal(dashboard.byStatus.ldPending, 1);
assert.equal(dashboard.groups.find(g => g.allocation === "A-01").situation, "Parcialmente concluída");
assert.equal(dashboard.completeAllocations, 1);
assert.equal(Model.filter(prepared.rows, {status:"fiscal1Rejected"}).length, 1);
assert.equal(Model.filter(prepared.rows, {stage:"fiscal2"}).length, 1);
assert.equal(Model.filter(prepared.rows, {sheet:"LD_004",action:"inclusão"}).length, 5);
assert.equal(Model.filter(prepared.rows, {search:"DOC-000001"}).length, 2);
assert.equal(Model.filter(prepared.rows, {from:"2026-08-14"}).length, 0);
assert.equal(Model.dateKey("46247.125"), "2026-08-13");
const exported = Model.exportData(dashboard, {contract:"UHDT-D"});
assert.equal(exported.documents.length, 6, "one heading plus five distinct links");
assert.equal(exported.allocations.length, 5);
assert.equal(exported.documents[1][9], "Aceito");
assert.equal(exported.summary[1][1], "UHDT-D");

const html = fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const loader = fs.readFileSync(path.join(__dirname,"../grcon_module_loader.js"),"utf8");
const sw = fs.readFileSync(path.join(__dirname,"../sw.js"),"utf8");
const app = fs.readFileSync(path.join(__dirname,"../allocation_dashboard_app.js"),"utf8");
const migration = fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261009150000_allocation_dashboard_fields.sql"),"utf8");
assert.match(html, /class="additional-tool-card" data-grcon-view="allocation-dashboard"/);
assert.match(html, /id="allocation-dashboard-module"/);
assert.match(loader, /"allocation-dashboard": \["allocation_dashboard_core\.js", "allocation_dashboard_app\.js"\]/);
assert.match(loader, /GrconAllocationDashboardUi\?\.activate/);
assert.match(sw, /"allocation-dashboard\.css"/);
assert.match(sw, /"allocation_dashboard_app\.js"/);
assert.match(app, /readSnapshot/);
assert.match(app, /allItems:complete\.items/);
assert.match(migration, /fiscal2ReturnedAt/);
assert.match(migration, /fiscal2Comment/);
console.log("allocation_dashboard: parser, fiscais, agrupamento, duplicidades, filtros, Excel e rota OK");
