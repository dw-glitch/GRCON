const assert = require("node:assert/strict");
const Core = require("../core.js");
globalThis.TriagemCore = Core;
const History = require("../history_core.js");
const Classification = require("../grdt_history_classification.js");

function record(id, egrdtNumber, generatedAt, document, revision, extraFiles = []) {
  return History.cleanRecord({
    id,
    egrdtNumber,
    generatedAt,
    files: [
      { document, revision, grdtRevision: revision, finalName: `${document}_0001_${revision}.pdf` },
      ...extraFiles,
    ],
  });
}

const doc = "RL-5290.00-22313-856-C1O-001";

let result = Classification.classifyRows([{ document: doc, revision: "0" }], []);
assert.equal(result.rows[0].emissionKind, "FIRST_POSTING");
assert.equal(result.summary.firstPosting, 1);

const historyA = [
  record("h1", "0130870-C1O-PGV-G-1001-2026 - eGRDT", "2026-09-01T10:00:00Z", doc, "A"),
];
result = Classification.classifyRows([{ document: doc, revision: "B" }], historyA);
assert.equal(result.rows[0].emissionKind, "NEW_REVISION");
assert.equal(result.rows[0].historyClassification.previousRevision, "A");
assert.equal(result.rows[0].historyClassification.previousGrdt, historyA[0].egrdtNumber);

result = Classification.classifyRows([{ document: doc, revision: "A" }], historyA);
assert.equal(result.rows[0].emissionKind, "REPOST");
assert.equal(result.rows[0].historyClassification.occurrenceCount, 1);
assert.equal(result.rows[0].historyClassification.repostCount, 0);

const historyRepeated = [
  historyA[0],
  record("h2", "0130870-C1O-PGV-G-1010-2026 - eGRDT", "2026-09-10T10:00:00Z", doc, "A"),
  record(
    "h3",
    "0130870-C1O-PGV-G-1011-2026 - eGRDT",
    "2026-09-11T10:00:00Z",
    doc,
    "A",
    [{ document: doc, revision: "A", grdtRevision: "A", finalName: `${doc}_0001_A.docx` }],
  ),
];
result = Classification.classifyRows([{ document: doc, revision: "A" }], historyRepeated);
assert.equal(result.rows[0].emissionKind, "REPOST");
assert.equal(result.rows[0].historyClassification.occurrenceCount, 3, "dois formatos na mesma eGRDT contam como uma ocorrência");
assert.equal(result.rows[0].historyClassification.repostCount, 2);
assert.equal(result.rows[0].historyClassification.firstEmission.historyId, "h1");
assert.equal(result.rows[0].historyClassification.lastEmission.historyId, "h3");

const historyC = [
  record("hc", "0130870-C1O-PGV-G-1200-2026 - eGRDT", "2026-09-20T10:00:00Z", doc, "C"),
];
result = Classification.classifyRows([{ document: doc, revision: "B" }], historyC);
assert.equal(result.rows[0].emissionKind, "NEW_REVISION");
assert.match(result.rows[0].historyClassification.warnings.join(" "), /revisão posterior/i);

const etWithout = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019";
const etWith = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-SPE-AST-320019";
result = Classification.classifyRows(
  [{ document: etWithout, revision: "0" }],
  [record("het", "0130870-C1O-PGV-G-1300-2026 - eGRDT", "2026-09-21T10:00:00Z", etWith, "0")],
);
assert.equal(result.rows[0].emissionKind, "REPOST", "normalização canônica precisa respeitar a equivalência com/sem nt-");

const volumeHistory = Array.from({ length: 3000 }, (_, index) => {
  const code = `RL-5290.00-22313-VOL-C1O-${String(index + 1).padStart(4, "0")}`;
  return record(`v-${index}`, `0130870-C1O-PGV-G-${String((index % 9000) + 1).padStart(4, "0")}-2026 - eGRDT`, "2026-09-01T10:00:00Z", code, "0");
});
const volumeRows = volumeHistory.map((item) => ({ document: item.files[0].document, revision: "0" }));
const started = Date.now();
const volumeResult = Classification.classifyRows(volumeRows, volumeHistory);
const elapsed = Date.now() - started;
assert.equal(volumeResult.summary.repost, 3000);
assert.ok(elapsed < 3000, `classificação de 3.000 documentos demorou ${elapsed}ms`);

console.log("OK — classificação canônica do Histórico cobre primeira postagem, nova revisão, repostagem, regressão e volume.");
