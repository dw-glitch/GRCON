const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const History = require("../history_core.js");
const Reissue = require("../grdt_reissue_core.js");

const document = "RL-5290.00-22313-91B-C1O-002";
const completeFile = {
  document,
  revision: "B",
  grdtRevision: "B",
  title: "RELATÓRIO DE CONSTRUÇÃO",
  originalName: `${document}_0001_B.pdf`,
  finalName: `${document}_0001_B.pdf`,
  format: "A4",
  discipline: "DINÂMICOS",
  documentType: "RL",
  purpose: "Para Construção",
  databook: "R:\\Databook\\Dinamicos",
};
const records = [
  History.cleanRecord({
    id: "old",
    egrdtNumber: "0130870-C1O-PGV-G-1000-2026 - eGRDT",
    generatedAt: "2026-09-20T10:00:00.000Z",
    files: [{ ...completeFile, revision: "A", grdtRevision: "A", purpose: "APROVAÇÃO" }],
  }),
  History.cleanRecord({
    id: "new",
    egrdtNumber: "0130870-C1O-PGV-G-1010-2026 - eGRDT",
    generatedAt: "2026-09-24T10:00:00.000Z",
    files: [completeFile],
  }),
];

assert.deepEqual(Reissue.parseDocuments(`${document}\n${document}; NT-${document}`), [document]);
const latest = Reissue.latestMatch(document, records);
assert.equal(latest.record.id, "new");
assert.equal(latest.files[0].purpose, "Para Construção");

const result = Reissue.rowsForDocuments([document, "INEXISTENTE-001"], records);
assert.equal(result.rows.length, 1);
assert.deepEqual(result.missingDocuments, ["INEXISTENTE-001"]);
assert.equal(result.rows[0].item.purpose, "Para Construção");
assert.equal(result.rows[0].item.documentType, "RL");
assert.equal(Reissue.validateRows(result.rows).valid, true);

const legacy = Reissue.rowsForDocuments([document], [History.cleanRecord({
  id: "legacy",
  egrdtNumber: "0130870-C1O-PGV-G-0900-2026 - eGRDT",
  generatedAt: "2026-09-01T10:00:00.000Z",
  files: [{ document, revision: "0", finalName: `${document}_0001_0.pdf`, discipline: "DINÂMICOS", title: "LEGADO", databook: "R:\\DB" }],
})]);
assert.deepEqual(legacy.rows[0].missing.sort(), ["documentType", "format", "purpose"].sort());
assert.equal(Reissue.validateRows(legacy.rows).valid, false);
const completed = Reissue.updateRow(Reissue.updateRow(Reissue.updateRow(legacy.rows[0], "purpose", "Para Cancelamento"), "documentType", "RL"), "format", "A4");
assert.equal(Reissue.validateRows([completed]).valid, true);
assert.equal(Reissue.validateRows([Reissue.updateRow(completed, "purpose", "CANCELAMENTO")]).valid, false);

const many = Array.from({ length: 49 }, (_, index) => ({ ...result.rows[0], id: String(index), item: { ...result.rows[0].item } }));
const groups = Reissue.groupRows(many, 48);
assert.equal(groups.length, 2);
assert.equal(groups[0].items.length, 48);
assert.equal(groups[1].items.length, 1);

assert.equal(records[1].files[0].purpose, "Para Construção");
const pendingRecord = { id: "reissue-1", clientRecordId: "reissue-1", syncState: "pending", cloudId: "" };
assert.equal(Reissue.sharedPersistenceStatus([pendingRecord], [pendingRecord]).synced, false);
const cloudRecord = { ...pendingRecord, syncState: "synced", cloudId: "7dbf552e-661a-485d-b0fa-2b381ef68042" };
assert.deepEqual(Reissue.sharedPersistenceStatus([pendingRecord], [cloudRecord]), { expected: 1, found: 1, synced: true });
const cloudRoundTrip = History.cleanRecord(JSON.parse(JSON.stringify(History.cleanRecord({
  id: "reissue-cloud",
  egrdtNumber: "0130870-C1O-PGV-G-1011-2026 - eGRDT",
  generatedAt: "2026-09-25T10:00:00.000Z",
  outputType: "Repostagem de eGRDT",
  reissueSources: [records[1].egrdtNumber],
  files: [completeFile],
}))));
assert.equal(cloudRoundTrip.outputType, "Repostagem de eGRDT");
assert.equal(cloudRoundTrip.reissueSources[0], records[1].egrdtNumber);
assert.equal(cloudRoundTrip.files[0].purpose, "Para Construção");
const appSource = fs.readFileSync(path.join(__dirname, "..", "grdt_reissue_app.js"), "utf8");
assert.match(appSource, /await saved\.persistence/, "repostagem precisa aguardar persistência durável");
assert.match(appSource, /await root\.GrconCloud\.pull\(\)/);
assert.match(appSource, /Histórico compartilhado/);
console.log("OK — repostagem localiza a última emissão, preserva propósito, divide lotes e confirma o histórico compartilhado.");
