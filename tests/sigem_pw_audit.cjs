const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const Dashboard = require(path.join(rootDir, "sigem_pw_dashboard_core.js"));
const Audit = require(path.join(rootDir, "sigem_pw_audit_core.js"));

const et = "C1O_RNEST_U32_1.1.1.1_REP_TAG001_000";
const quality = "RL-5290.00-22313-ABC-C1O-001";
const unrelated = "RL-5290.00-99999-ABC-C1O-999";
const ld = { meta: { fileName: "LD Qualidade.xlsx", importedAt: "2026-09-14T10:00:00Z", snapshotId: "ld:quality" }, records: [{ document: quality }] };
const raw = {
  meta: { fileName: "PW.csv", importedAt: "2026-09-14T11:00:00Z", fileSize: 12345, sourceRecordCount: 5 },
  records: [
    { document: et, revision: "0", revisionComplete: "0", state: "Liberado", lastEmission: "Sim" },
    { document: et, revision: "A", revisionComplete: "A", state: "Rascunho", lastEmission: "Previsto" },
    { document: et, revision: "A", revisionComplete: "A", state: "Rascunho", lastEmission: "Previsto" },
    { document: quality, revision: "0", revisionComplete: "0", state: "Liberado", lastEmission: "Não" },
    { document: unrelated, revision: "0", revisionComplete: "0", state: "Liberado", lastEmission: "Sim" },
  ],
};

const sanitized = Dashboard.sanitizePwBase(raw, ld);
const audit = Audit.buildAudit({ ...sanitized, meta: { ...sanitized.meta, snapshotId: "pw:validated" } }, ld);
assert.equal(audit.status, "validated");
assert.deepEqual(audit.metrics.classes, { ET: 2, "N-1710": 1 });
assert.equal(audit.metrics.validRows, 4);
assert.equal(audit.metrics.validEntries, 3);
assert.equal(audit.metrics.uniqueDocuments, 2);
assert.equal(audit.metrics.emittedEntries, 2);
assert.equal(audit.metrics.notEmittedEntries, 1);
assert.equal(audit.metrics.consolidatedDuplicates, 1);
assert.equal(audit.trace.ldFileName, "LD Qualidade.xlsx");
assert.ok(audit.checks.every((check) => check.passed));

(function discardedContentIsNotExposed() {
  const serialized = JSON.stringify(audit);
  assert.ok(!serialized.includes(unrelated), "código não utilizado não pode aparecer na auditoria");
  assert.doesNotMatch(serialized, /scopeExcluded|discard|reject|fora.do.escopo/i);
  const rows = JSON.stringify(Audit.exportRows(audit));
  assert.ok(!rows.includes(unrelated));
  assert.doesNotMatch(rows, /scopeExcluded|descart|rejeit|fora.do.escopo/i);
})();

(function uiAndIntegrationContracts() {
  const app = fs.readFileSync(path.join(rootDir, "sigem_pw_audit_app.js"), "utf8");
  const bootstrap = fs.readFileSync(path.join(rootDir, "sigem_pw_dashboard_bootstrap.js"), "utf8");
  const sw = fs.readFileSync(path.join(rootDir, "sw.js"), "utf8");
  assert.match(app, /Auditoria da base ProjectWise/);
  assert.match(app, /Entradas válidas/);
  assert.match(app, /Duplicidades consolidadas/);
  assert.match(app, /Verificações de integridade/);
  assert.match(app, /Identificação da importação/);
  assert.match(app, /Exportar auditoria/);
  assert.match(app, /bookType: "xlsx"/);
  assert.doesNotMatch(app, /scopeExcluded|scopeDiscarded|Itens fora do escopo|Motivo da rejeição|código descartado/i);
  assert.match(bootstrap, /sigem_pw_audit_core\.js/);
  assert.match(bootstrap, /sigem_pw_audit_app\.js/);
  assert.match(bootstrap, /GrconSigemPwAuditUi\.activate/);
  assert.match(sw, /spw6-audit1/);
  assert.match(sw, /"sigem_pw_audit_core\.js"/);
  assert.match(sw, /"sigem_pw_audit_app\.js"/);
})();

console.log("sigem_pw_audit: OK — auditoria agregada, revisão, integridade, histórico, exportação e privacidade validados.");
