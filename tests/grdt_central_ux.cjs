"use strict";
// Regressão estrutural da Central GRDT: ação principal, filtros, histórico e integridade.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = filename => fs.readFileSync(path.join(root, filename), "utf8");
const html = read("index.html");
const app = read("app.js");
const classification = require("../history_classification.js");
const sw = read("sw.js");

assert.equal((html.match(/id="export-zip"/g) || []).length, 1);
assert.equal((html.match(/id="export-egrdt"/g) || []).length, 1);
assert.match(html, /id="export-zip"[^>]*>[^<]*Baixar PDFs \+ eGRDT/);
assert.match(html, /id="export-egrdt"[^>]*>Baixar somente eGRDT/);
const downloadArea = html.slice(html.indexOf('<details class="secondary-downloads">'), html.indexOf('class="egrdt-teams-ready"'));
assert.ok(downloadArea.indexOf('id="export-zip"') > downloadArea.indexOf('</details>'), "O download principal não deve estar escondido no menu secundário.");
assert.ok(downloadArea.indexOf('id="export-egrdt"') < downloadArea.indexOf('</details>'), "A eGRDT isolada deve ficar no menu secundário.");
assert.match(app, /els\.exportZip\.addEventListener\("click", async/);
const downloadHandler = app.slice(
  app.indexOf('els.exportZip.addEventListener("click", async'),
  app.indexOf('els.exportFinalPackage.addEventListener("click", exportFinalPackage);')
);
assert.match(downloadHandler, /try\\s*\\{[\\s\\S]*?lockDownloadControls\\(true\\);[\\s\\S]*?await exportZip\\(\\);/, "Download deve executar sob tratamento de erros desde o bloqueio dos controles.");
assert.match(downloadHandler, /finally\\s*\\{[\\s\\S]*?lockDownloadControls\\(false\\);/, "Controles devem ser liberados no finally.");
assert.match(app, /centralDownloadInProgress/);
assert.match(app, /els\.exportEgrdt\.addEventListener\("click", exportEgrdt\)/);

const cols = app.match(/const RESULT_COLUMN_FILTERS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(cols, "Colunas filtráveis mapeadas");
const keys = [...cols[1].matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)];
const markup = html.match(/<table class="grcon-results-table" id="results-table">\s*<thead><tr>([\s\S]*?)<\/tr>/);
assert.ok(markup, "Cabeçalho de resultados");
const headerCount = (markup[1].match(/<th\b/g) || []).length;
assert.equal(keys.length, headerCount, "Cada coluna visual deve corresponder a exatamente um filtro.");
const macro = require("../macro5_flow_core.js");
assert.equal(macro.COLUMNS.length, headerCount, "O gerenciador de colunas deve conhecer todas as colunas reais.");
assert.deepEqual(macro.COLUMNS.map(c => c.index), Array.from({length:headerCount},(_,i)=>i+1));
assert.deepEqual(macro.COLUMNS.map(c=>c.key), keys.map(c=>c[1]), "A posição e o campo devem corresponder às opções de cada filtro.");
assert.ok(macro.defaultTriagePreferences().visibleColumns.includes("document"), "Código + histórico devem permanecer visíveis.");
assert.ok(macro.defaultTriagePreferences().visibleColumns.includes("targetRevision"), "Revisão editável deve permanecer visível.");
assert.match(app, /class="grdt-document-original"/);

assert.ok(!keys.some(pair => pair[1] === "revisionManual"), "O filtro que deslocava os demais cabeçalhos foi removido.");
assert.match(app, /function filteredResultIndices/);
assert.match(app, /function matchesQuickFilter/);
assert.match(app, /function compareTriageRows/);
assert.match(app, /function normalizedTriageSearch/);
assert.match(app, /const selectionSignature = \["included", "excluded"\]/);
assert.match(html, /id="triage-clear-all"/);
assert.match(html, /id="triage-sort"/);
assert.match(html, /id="triage-filter-result-count"/);
assert.match(app, /state\.resultVersion \+= 1/);
assert.match(app, /GrconGrdtHistoryUi\.row\(row\.document, row\.revision\)/);
assert.match(html, /src="grdt_central_history_ui\.js"/);
assert.match(html, /href="grdt-central-ux\.css"/);
assert.match(sw, /"grdt_central_history_ui\.js"/);
assert.match(sw, /"grdt-central-ux\.css"/);
assert.match(read("grdt_central_history_ui.js"), /Histórico de emissões do documento/);
assert.match(read("grdt_central_history_ui.js"), /Não confirmada neste histórico/);

const records = [
 { id: "a", workspaceId:"W1", egrdtNumber: "GRDT-1", generatedAt:"2026-10-01", files:[{ document:"DOC-001",revision:"0",purpose:"Construção"},{document:"DOC-001",revision:"0"}]},
 { id: "b", workspaceId:"W1", egrdtNumber: "GRDT-2", generatedAt:"2026-10-03", files:[{document:"DOC-001",revision:"B",purpose:"Construção"}]},
 { id: "c", workspaceId:"W2", egrdtNumber: "GRDT-OUTRA", generatedAt:"2026-10-04", files:[{document:"DOC-001",revision:"C"}]},
];
const idx = classification.buildIndex(records,{workspaceId:"W1",complete:true});
const latest = classification.classify("DOC-001","B",idx);
assert.equal(latest.latestEmission.grdt,"GRDT-2");
assert.equal(latest.latestEmission.revision,"B");
assert.equal(latest.latestEmission.purpose,"Construção");
assert.equal(latest.historicalDocumentCount,2,"A eGRDT com vários arquivos não deve duplicar emissão.");
assert.equal(latest.emissionKind,"REPOST");
assert.equal(classification.classify("DOC-001","C",idx).emissionKind,"NEW_REVISION");
assert.equal(classification.classify("DOC-001","A",idx).classificationStatus,"UNCONFIRMED");
assert.equal(classification.classify("DOC-001","A",idx).label,"Conferir histórico");
assert.equal(classification.classify("DOC-001","0",idx).emissionKind,"REPOST");
assert.equal(classification.classify("DOC-001","B",classification.buildIndex(records,{workspaceId:"W3",complete:true})).historicalDocumentCount,0);
assert.equal(classification.classify("DOC-001","C",classification.buildIndex(records,{workspaceId:"W1",complete:false})).classificationStatus,"UNCONFIRMED");
console.log("GRDT Central: download prioritário, filtros alinhados, histórico por revisão e escopo de contrato OK.");
