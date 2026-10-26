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
new vm.Script(source("grdt_support_panel.js"), { filename: "grdt_support_panel.js" });
console.log("Central de Apoio: identidade exata, revisões, layout, integração de triagem e syntax OK.");