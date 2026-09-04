const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Projection = require("../posting_conference_history_projection.js");

const Conference = {
  norm(value) { return String(value || "").trim().toUpperCase(); },
  normalizeRevision(value) { return String(value || "").trim().toUpperCase().replace(/^REV\.?\s*/, ""); },
  documentIdentity(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/_NT-/g, "_")
      .replace(/_NT(?=[A-Z0-9-])/g, "_");
  },
};
const History = {
  generatedRevision(file) { return file && (file.grdtRevision || file.revision) || ""; },
};

const record = {
  id: "history-1",
  clientRecordId: "stable-1",
  egrdtNumber: "0130870-C1O-PGV-G-0001-2026 - eGRDT",
};

const rows = [
  {
    key: "stable-1|ABC-001|A",
    historyId: "stable-1",
    historyRecordId: "history-1",
    egrdtNumber: record.egrdtNumber,
    document: "ABC-001",
    documentIdentity: "ABC-001",
    revisionSent: "A",
    status: "CONFIRMADO",
    conferenceLabel: "Postado",
    sigemStatus: "Em Workflow",
    currentEvidence: true,
  },
  {
    key: "stable-1|ABC-002|A",
    historyId: "stable-1",
    historyRecordId: "history-1",
    egrdtNumber: record.egrdtNumber,
    document: "ABC-002",
    documentIdentity: "ABC-002",
    revisionSent: "A",
    status: "CONFIRMADO",
    conferenceLabel: "Postado",
    sigemStatus: "Conforme Construído",
    currentEvidence: true,
  },
  {
    key: "stable-1|ABC-003|A",
    historyId: "stable-1",
    historyRecordId: "history-1",
    egrdtNumber: record.egrdtNumber,
    document: "ABC-003",
    documentIdentity: "ABC-003",
    revisionSent: "A",
    status: "REVISAO_DIFERENTE",
    conferenceLabel: "Revisão divergente",
    sigemStatus: "Em Workflow",
    currentEvidence: false,
  },
];

let index = Projection.build(rows, { importedAt: "2026-09-04T10:00:00Z", fileName: "Consulta Geral.xlsx" }, Conference);
assert.equal(index.baseLoaded, true);
assert.equal(Projection.rowsForRecord(index, record, Conference).length, 3);

let row = Projection.rowForFile(index, record, { document: "ABC-001", grdtRevision: "A" }, Conference, History);
assert.ok(row);
assert.equal(Projection.sigemStatus(row), "Em Workflow");

row = Projection.rowForFile(index, record, { document: "ABC-003", grdtRevision: "A" }, Conference, History);
assert.ok(row);
assert.equal(Projection.sigemStatus(row), "", "status de revisão divergente não pode ser tratado como status da revisão enviada");

let summary = Projection.statusSummary(index, record, Conference);
assert.equal(summary.label, "2 valores");
assert.deepEqual(summary.values, ["Em Workflow", "Conforme Construído"]);

index = Projection.build([rows[0]], { importedAt: "2026-09-04T10:00:00Z" }, Conference);
summary = Projection.statusSummary(index, record, Conference);
assert.equal(summary.label, "Em Workflow");

index = Projection.build([{ ...rows[0], sigemStatus: "", currentEvidence: true }], { importedAt: "2026-09-04T10:00:00Z" }, Conference);
assert.equal(Projection.statusSummary(index, record, Conference).label, "—", "STATUS vazio mantém Postado, mas mostra travessão no Status SIGEM");

index = Projection.build([], null, Conference);
summary = Projection.statusSummary(index, record, Conference);
assert.equal(summary.label, "—");
assert.equal(summary.baseLoaded, false);

// Revisão manual: o arquivo passa a usar A e deve casar somente com a linha A.
const manualRows = [
  { ...rows[0], key: "stable-1|ABC-001|0", revisionSent: "0", sigemStatus: "Status antigo" },
  { ...rows[0], key: "stable-1|ABC-001|A", revisionSent: "A", sigemStatus: "Em Workflow" },
];
index = Projection.build(manualRows, { importedAt: "2026-09-04T10:00:00Z" }, Conference);
row = Projection.rowForFile(index, record, { document: "ABC-001", grdtRevision: "A", revision: "A" }, Conference, History);
assert.equal(row.revisionSent, "A");
assert.equal(Projection.sigemStatus(row), "Em Workflow");

// ET: a projeção usa a mesma identidade central; não inventa um matching novo.
const etRecord = { ...record, id: "h-et", clientRecordId: "s-et", egrdtNumber: "ET-1" };
const etRows = [{
  historyId: "s-et", historyRecordId: "h-et", egrdtNumber: "ET-1",
  document: "C1O_RNEST_U32_3.1.1.1_TUB_RIR_NT-SPE-001",
  documentIdentity: Conference.documentIdentity("C1O_RNEST_U32_3.1.1.1_TUB_RIR_NT-SPE-001"),
  revisionSent: "A", sigemStatus: "Em Workflow", currentEvidence: true,
}];
index = Projection.build(etRows, { importedAt: "2026-09-04T10:00:00Z" }, Conference);
row = Projection.rowForFile(index, etRecord, { document: "C1O_RNEST_U32_3.1.1.1_TUB_RIR_SPE-001", grdtRevision: "A" }, Conference, History);
assert.ok(row, "a projeção deve reutilizar a identidade fornecida pelo motor central");

const rootDir = path.resolve(__dirname, "..");
const bootstrap = fs.readFileSync(path.join(rootDir, "posting_conference_bootstrap.js"), "utf8");
assert.match(bootstrap, /posting_conference_history_projection\.js/);
assert.match(bootstrap, /posting_conference_refinement\.js/);
assert.match(bootstrap, /rowForFile\(historyProjection/);
assert.match(bootstrap, /data-pc-history-sigem/);
assert.match(bootstrap, /Status SIGEM atual/);
assert.match(bootstrap, /grcon:conference-updated/);
assert.doesNotMatch(bootstrap, /consultaGeral\.find|baseRecords\.find/);
assert.match(bootstrap, /mutationOnlyConferenceDecorations/);
assert.match(bootstrap, /data-pc-history-sigem-cell/);

console.log("history_sigem_status: cenários de projeção e estabilidade OK");
