"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Emission = require("../emission.js");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "..", "workers", "export.worker.js"), "utf8");
const start = worker.indexOf("function summaryText(generated,limit){");
const end = worker.indexOf("\nasync function buildManifest", start);
assert.ok(start >= 0 && end > start);
const summaryText = Function(`${worker.slice(start, end)}\nreturn summaryText;`)();
assert.match(app, /egrdtBatchMode\.addEventListener\("change", changeEgrdtBatchMode\)/);
assert.match(app, /batchMode: group\.batchMode,/);
assert.match(app, /currentEgrdtBatchMode\(\) === "limit-only"\s*\? Math\.ceil\(selectedItemCount \/ currentEgrdtBatchLimit\(\)\)/);

for (const count of [2, 48, 49, 96, 97, 110]) {
  const entries = Array.from({ length: count }, (_, index) => ({
    document: `DOC-${index}`, item: { discipline: index % 2 ? "CIVIL" : "MECÂNICA" },
  }));
  const groups = Emission.splitPlan({ entries }, 48, "limit-only");
  assert.equal(groups.length, Math.ceil(count / 48));
  assert.deepEqual(groups.flatMap((group) => group.entries.map((entry) => entry.document)), entries.map((entry) => entry.document));
  const generated = groups.map((group, index) => ({ group, official: { baseName: `GRDT-${index + 1}` }, fileName: `GRDT-${index + 1}.xls` }));
  const summary = summaryText(generated, 48);
  assert.match(summary, /sem separação por disciplina/);
  assert.match(summary, /Disciplinas: CIVIL · MECÂNICA|Disciplinas: MECÂNICA · CIVIL/);
  assert.doesNotMatch(summary, /Divisão da disciplina:/);
}

const discipline = Emission.splitPlan({ entries: [
  { document: "A", item: { discipline: "CIVIL" } },
  { document: "B", item: { discipline: "MECÂNICA" } },
] }, 48, "discipline");
assert.equal(discipline.length, 2);
assert.match(summaryText(discipline.map((group, index) => ({ group, official: { baseName: String(index) }, fileName: `${index}.xls` })), 48), /Separação aplicada por disciplina/);

console.log("batch_mode_output: modo misto, contagem e resumo do ZIP coerentes para 2 a 110 documentos");
