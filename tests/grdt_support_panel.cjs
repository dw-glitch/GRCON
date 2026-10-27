"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = name => fs.readFileSync(path.join(root, name), "utf8");
const Core = require("../grdt_support_core.js");
const doc = n => "PR-5290.00-22313-955-C1O-" + n;

assert.deepEqual(Core.parseCodes(doc("121") + "\n" + doc("122") + ";" + doc("121")),
  [doc("121"), doc("122")], "códigos e duplicatas sem dividir hífens");
const base = [
  { document: doc("121"), revision: "A", status: "Em análise", title: "A" },
  { document: doc("122"), revision: "A", status: "Não postado", title: "B" },
  { document: doc("122"), revision: "B", status: "Em workflow", title: "B" },
  { document: "P-101-A", revision: "0", status: "Previsto", title: "TAG" }
];
assert.deepEqual(Core.search(base, doc("122")).rows.map(x => x.revision), ["A", "B"]);
assert.deepEqual(Core.search(base, doc("121")).rows.map(x => x.document), [doc("121")]);
assert.equal(Core.search(base, "P-101").total, 0, "não retirar sufixo de TAG");
assert.equal(Core.search(base, doc("12")).total, 0, "não aceitar prefixo ou correspondência aproximada");
assert.equal(Core.search(base, doc("122") + "\n" + doc("123")).missing[0], doc("123"));
assert.equal(Core.search(base, doc("122"), 1).total, 2, "limite visual não oculta a contagem real");
assert.equal(Core.summarize(["revisar", "bloqueado", "nao_localizado", "descartar", "pronto"]).attention, 4);


assert.equal(Core.diagnose([{document: doc("122"),revision:"B",fileRevision:"A",selected:true}]).selectedRisks,1,
  "revisão diferente selecionada exige alerta sem alterar seleção");
assert.equal(Core.diagnose([{document: doc("121"),revision:"A",allocationAlert:"not_allocated"}]).issues[0].kind,"allocation",
  "não alocado é distinto de não localizado");
assert.equal(Core.diagnose([{document: doc("121"),revision:"A",group:"nao_localizado"}]).issues[0].kind,"missing");
assert.equal(Core.diagnose([{document: doc("122"),revision:"B",manual:true,selected:true}]).manualSelected,1);
assert.equal(Core.search(base, doc("121") + ";" + doc("122"), 200).total, 3,
  "consulta em lote considera revisões por identidade exata");
assert.match(app, /revealSupportRow:/, "navegação exata para a tabela original");
const supportUi = source("grdt_support_panel.js");
assert.match(supportUi, /el\.searchArea\.hidden = false/, "consulta permanece acessível na conferência");
assert.match(supportUi, /diagnostics\.selectedRisks/, "pré-conferência informa riscos da seleção");
assert.match(supportUi, /api\.revealSupportRow\(issue\.document, issue\.revision\)/,
  "navegação pontual preserva identidade e revisão");

const html = source("index.html"), app = source("app.js"), sw = source("sw.js");
assert.doesNotMatch(html, /Conferir pacote eGRDT \(\.xls\)/);
for (const id of ["grdt-support-panel", "grdt-support-search", "grdt-support-attention", "grdt-support-detail"]) {
  assert.match(html, new RegExp('id="' + id + '"'), "painel nativo presente: " + id);
}
for (const file of ["grdt_support_core.js", "grdt_support_panel.js", "grdt-support-panel.css"]) {
  assert.ok(html.includes(file), "recurso carregado no HTML: " + file);
  assert.ok(sw.includes('"' + file + '"'), "recurso no Service Worker: " + file);
}
assert.match(app, /GrconGrdtSupportCore\.summarize\(state\.results\.map\(decisionGroupKey\)\)/,
  "resumo provém da classificação oficial da triagem");
assert.match(app, /grcon:grdt-support-summary/);
assert.match(source("grdt_support_panel.js"), /data-filter=/, "filtros usam a tabela original");
assert.doesNotMatch(source("grdt_support_panel.js"), /innerHTML|eval\(/, "nenhum HTML com dados não confiáveis");
const ui = source("grdt_support_panel.js");
for (const [, id] of ui.matchAll(/\bbyId\("([^"]+)"\)/g)) {
  assert.ok(html.includes('id="' + id + '"'), "UI consulta ID inexistente: " + id);
}
assert.match(app, /preparationSnapshot: \(\) => \(\{/, "prévia da preparação exposta");
assert.match(app, /grcon:grdt-support-reset/, "reset intencional limpa preparação");
assert.match(ui, /PREPARATION_PREFIX/, "persistência de preparação isolada");
assert.match(ui, /PREPARATION_TTL/, "rascunhos possuem prazo máximo");
assert.match(ui, /root\.localStorage\.removeItem\(key\)/, "limpeza após reset");
assert.match(ui, /prepareRelationDraft\(candidate\)/, "retomada exige reconferência pelo operador");
assert.doesNotMatch(ui, /manualForceInclude\.add\(|state\.selected\.add\(/, "não reautorizar seleção antiga");
new vm.Script(source("grdt_support_panel.js"), { filename: "grdt_support_panel.js" });
console.log("Central de Apoio: identidade exata, revisões, layout, integração de triagem e syntax OK.");