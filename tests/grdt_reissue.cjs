const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const History = require("../history_core.js");
const Reissue = require("../grdt_reissue_core.js");
const Emission = require("../emission.js");

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


const mixedEntries = Array.from({ length: 97 }, (_, index) => ({
  rowIndex: index,
  document: `DOC-${String(index + 1).padStart(3, "0")}`,
  item: {
    document: `DOC-${String(index + 1).padStart(3, "0")}`,
    discipline: index % 2 ? "CIVIL" : "DINÂMICOS",
  },
}));
const limitOnly = Emission.splitPlan({ entries: mixedEntries }, 48, "limit-only");
assert.deepEqual(limitOnly.map((group) => group.entries.length), [48, 48, 1]);
assert.deepEqual(limitOnly.flatMap((group) => group.entries.map((entry) => entry.document)), mixedEntries.map((entry) => entry.document));
assert.ok(limitOnly[0].disciplines.length > 1, "modo sem disciplina precisa aceitar disciplinas mistas");
assert.ok(limitOnly.every((group) => group.entries.length <= 48));
assert.deepEqual(Emission.splitPlan({ entries: mixedEntries }, 999, "limit-only").map((group) => group.entries.length), [97], "o limite configurado pelo usuário não pode ser reduzido silenciosamente para 48");
assert.deepEqual(Emission.splitPlan({ entries: mixedEntries }, 72, "limit-only").map((group) => group.entries.length), [72, 25]);

const disciplineMode = Emission.splitPlan({ entries: mixedEntries.slice(0, 6) }, 48, "discipline");
assert.deepEqual(disciplineMode.map((group) => group.discipline), ["CIVIL", "DINÂMICOS"]);
assert.ok(disciplineMode.every((group) => new Set(group.items.map((item) => item.discipline)).size === 1));

const sharedRows = mixedEntries.map((entry, index) => ({
  id: `mixed-${index}`,
  sourceEgrdt: "ORIGEM",
  item: { ...completeFile, document: entry.document, discipline: entry.item.discipline },
  sourceFile: { ...completeFile, document: entry.document, discipline: entry.item.discipline },
  missing: [],
  fieldErrors: {},
  errors: [],
}));
const reissueLimitOnly = Reissue.groupRows(sharedRows, 48, "limit-only");
assert.deepEqual(reissueLimitOnly.map((group) => group.rows.length), [48, 48, 1]);
assert.deepEqual(reissueLimitOnly.flatMap((group) => group.rows.map((row) => row.item.document)), mixedEntries.map((entry) => entry.document), "repostagem usa o mesmo motor e preserva a ordem");

const changedRevision = Reissue.updateRow(result.rows[0], "revision", "c");
assert.equal(changedRevision.item.revision, "C");
assert.match(changedRevision.item.fileName, /_C\.pdf$/i);
assert.equal(changedRevision.fieldErrors.fileName, undefined);
const staleFile = Reissue.updateRow(changedRevision, "fileName", completeFile.finalName);
assert.ok(staleFile.fieldErrors.fileName?.some((message) => /incompatível com a revisão C/i.test(message)));
assert.equal(Reissue.validateRows([staleFile]).valid, false);
const invalidPurpose = Reissue.updateRow(result.rows[0], "purpose", "CANCELAMENTO");
assert.ok(invalidPurpose.fieldErrors.purpose?.some((message) => /PROPÓSITO fora da lista oficial/i.test(message)));

const volumeRecords = Array.from({ length: 240 }, (_, index) => {
  const code = `RL-5290.00-22313-VOL-C1O-${String(index + 1).padStart(3, "0")}`;
  return History.cleanRecord({
    id: `volume-${index}`,
    egrdtNumber: `0130870-C1O-PGV-G-${String(2000 + index).padStart(4, "0")}-2026 - eGRDT`,
    generatedAt: new Date(Date.UTC(2026, 8, 1, 10, index % 60, 0)).toISOString(),
    files: [{ ...completeFile, document: code, originalName: `${code}_0001_0.pdf`, finalName: `${code}_0001_0.pdf`, revision: "0", grdtRevision: "0" }],
  });
});
const volumeDocuments = volumeRecords.map((record) => record.files[0].document);
const volumeStarted = Date.now();
const volumeResult = Reissue.rowsForDocuments(volumeDocuments, volumeRecords);
const volumeElapsed = Date.now() - volumeStarted;
assert.equal(volumeResult.rows.length, 240);
assert.equal(volumeResult.missingDocuments.length, 0);
assert.ok(volumeElapsed < 2500, `indexação de 240 documentos demorou ${volumeElapsed}ms`);

const batchModeRoundTrip = History.cleanRecord({
  id: "batch-mode-history",
  egrdtNumber: "0130870-C1O-PGV-G-3000-2026 - eGRDT",
  generatedAt: "2026-09-26T12:00:00.000Z",
  outputType: "Repostagem de eGRDT",
  batchMode: "limit-only",
  batchLimit: 72,
  files: [completeFile],
});
assert.equal(batchModeRoundTrip.batchMode, "limit-only");
assert.equal(batchModeRoundTrip.batchLimit, 72);

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
console.log("OK — repostagem usa loteamento compartilhado, valida revisão/arquivo, escala a 240 documentos e confirma o histórico compartilhado.");
