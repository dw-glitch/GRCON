"use strict";
// O Worker devolve o modelo sem os quatro mapas (derivados de normalizedSigem/
// normalizedPw) e a thread principal os reconstrói sob demanda. O resultado
// precisa ser idêntico ao do modelo completo.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Dashboard = require("../sigem_pw_dashboard_core.js");

const sigem = [], pw = [], ld = [];
for (let i = 0; i < 300; i += 1) {
  const code = `RL-5290.00-22313-${String(i % 7).padStart(3, "0")}-C1O-${String(i).padStart(3, "0")}`;
  ld.push({ document: code, revision: "0", sourceRow: i + 2 });
  sigem.push({ document: code, revision: i % 3 ? "0" : "A", status: i % 2 ? "Postado" : "Em Análise", sourceRow: i + 2 });
  if (i % 5) pw.push({ document: code, revision: i % 3 ? "0" : "A", revisionComplete: i % 3 ? "0" : "A", state: "Liberado", lastEmission: "SIM", company: "CSG", sourceRow: i + 2 });
}
const settings = { requireN1710Ld: true, requireDocumentReference: true, ldAvailable: true, sigemAvailable: true, pwAvailable: true };
const full = Dashboard.createModel(sigem, pw, ld, settings);

// Como o Worker envia: sem os mapas, atravessando a clonagem estruturada.
const light = { ...full };
["sigemEntries", "pwEntries", "sigemAll", "pwAll"].forEach((name) => delete light[name]);
const received = structuredClone(light);
assert.equal(received.sigemAll, undefined);
Dashboard.hydrateModel(received);

["sigemEntries", "pwEntries", "sigemAll", "pwAll"].forEach((name) => {
  assert.ok(received[name] instanceof Map, `${name} volta como Map`);
  assert.equal(received[name].size, full[name].size, `${name}: mesmo tamanho`);
  assert.equal(received[name], received[name], `${name}: construído uma vez só`);
});
for (const scope of ["all", "revision0"]) {
  for (const filters of [{}, { documentClass: "N-1710" }, { documentClass: "ET" }]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(Dashboard.aggregateModel(received, filters, { revisionScope: scope }))),
      JSON.parse(JSON.stringify(Dashboard.aggregateModel(full, filters, { revisionScope: scope }))),
      `aggregateModel idêntico (${scope}, ${JSON.stringify(filters)})`,
    );
  }
}
// Um modelo completo não é alterado.
const before = full.sigemAll;
Dashboard.hydrateModel(full);
assert.equal(full.sigemAll, before);

// O Worker só corta os mapas quando o chamador pede, e o adaptador pede.
assert.match(fs.readFileSync(require("node:path").join(__dirname, "..", "workers/sigem_pw_dashboard.worker.js"), "utf8"), /payload\.lightModel/);
assert.match(fs.readFileSync(require("node:path").join(__dirname, "..", "src/react/sigem-pw/services/sigemPwDashboardAdapter.ts"), "utf8"), /lightModel: true/);
console.log("sigem_pw_light_model: OK");
