"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const before = JSON.parse(fs.readFileSync(path.join(root, "artifacts/historico-egrdts-baseline/metrics.json"), "utf8")).metrics;
const after = JSON.parse(fs.readFileSync(path.join(root, "artifacts/historico-egrdts-browser/metrics.json"), "utf8")).metrics;
const keys = ["openModuleMs", "searchMs", "filterMs", "selectMs", "detailRenderMs", "loadMoreMs"];
const comparison = {};

for (const key of keys) {
  const oldValue = Number(before[key]) || 0;
  const newValue = Number(after[key]) || 0;
  const ratio = oldValue > 0 ? newValue / oldValue : null;
  comparison[key] = { before: oldValue, after: newValue, ratio };
  const ceiling = Math.max(oldValue * 3, oldValue + 500);
  if (oldValue > 0 && newValue > ceiling) {
    throw new Error(`${key}: regressão grande (${oldValue} ms → ${newValue} ms; limite ${Math.round(ceiling)} ms).`);
  }
}

if (Number(after.renderedRecords) > 400) {
  throw new Error(`renderedRecords inesperado após Mostrar mais: ${after.renderedRecords}`);
}
if (Number(after.postingReadsPerRefresh) > 1) {
  throw new Error(`Posting.read excedeu uma leitura no ciclo: ${after.postingReadsPerRefresh}`);
}

fs.writeFileSync(
  path.join(root, "artifacts/historico-egrdts-browser/performance-comparison.json"),
  JSON.stringify({ before, after, comparison }, null, 2),
);
console.log("historico-egrdts-performance: PASS", comparison);
