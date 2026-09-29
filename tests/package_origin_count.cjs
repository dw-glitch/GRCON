"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../core.js");
const Emission = require("../emission.js");

// Exercita a consolidação real usada pelo Worker e pelo fluxo legado.
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("  function mergePackageResults(");
const end = source.indexOf('  // A "Revisão do documento"', start);
assert.ok(start >= 0 && end > start);
const state = { ignoredFiles: [] };
const merge = Function("C", "E", "state", "extensionOf", `${source.slice(start, end)}\nreturn mergePackageResults;`)(
  Core, Emission, state, (name) => String(name).split(".").pop().toLowerCase(),
);

const document = "RL-5290.00-22313-970-C1O-00001";
const names = [`${document}_A.pdf`, `${document}_A - COPIA.pdf`, `${document}_A.xlsx`];
const rows = names.map((name, index) => ({
  id: `arquivo-${index + 1}`, documentKey: document, document, revision: "A",
  sheet: "LD_001", decision: Core.READY, name, file: { name }, record: {},
}));
const [result] = merge(rows);
assert.equal(result.files.length, 2, "PDF e nativo distintos seguem para a GRDT");
assert.equal(result.duplicateFiles.length, 1, "cópia descartada deve constar na origem");
assert.equal(result.files.length + result.duplicateFiles.length, rows.length);
assert.match(result.duplicateFileWarning, /1 arquivo\(s\) duplicado\(s\)/);
assert.match(result.packageWarning, /duplicado/);
assert.equal(state.ignoredFiles.length, 1);
assert.equal(state.ignoredFiles[0].name, names[1]);

console.log("package_origin_count: N-1710 contabiliza cópia ignorada sem bloquear a análise");
