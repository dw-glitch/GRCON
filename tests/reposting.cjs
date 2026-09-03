const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Core = require("../core.js");
globalThis.TriagemCore = Core;
const History = require("../history_core.js");
globalThis.GrconHistory = History;
const Revision = require("../grcon_revision_control.js");
const Reposting = require("../grcon_reposting_core.js");
const Conference = require("../posting_conference_core.js");

function record(files) {
  return History.cleanRecord({
    id: "hist-1",
    clientRecordId: "stable-hist-1",
    egrdtNumber: "0130870-C1O-PGV-G-0042-2026 - eGRDT",
    generatedAt: "2026-09-03T12:00:00Z",
    outputType: "eGRDT final",
    files,
  });
}

// Fonte de verdade: a revisão operacional corrigida substitui revision e
// grdtRevision, mas não toca nos demais documentos do mesmo Histórico.
let original = record([
  { document: "MC-5290.00-22313-970-C1O-009", revision: "0", grdtRevision: "0", finalName: "MC-5290.00-22313-970-C1O-009_0001_0.pdf", originalName: "MC-5290.00-22313-970-C1O-009_0001_0.pdf" },
  { document: "DE-5290.00-22313-142-C1O-076", revision: "A", grdtRevision: "A", finalName: "DE-5290.00-22313-142-C1O-076_0001_A.pdf", originalName: "DE-5290.00-22313-142-C1O-076_0001_A.pdf" },
]);
let changed = Revision.applyRevision(original, { fileIndex: 0, document: "MC-5290.00-22313-970-C1O-009" }, "A", { at: "2026-09-03T14:32:00Z" });
assert.equal(changed.updated, true);
assert.equal(changed.record.files[0].revision, "A");
assert.equal(changed.record.files[0].grdtRevision, "A");
assert.equal(changed.record.files[0].revisionSource, "Alteração manual pós-eGRDT no Histórico");
assert.equal(changed.record.files[1].revision, "A");
assert.equal(changed.previousRevision, "0");
changed = Revision.applyRevision(changed.record, { fileIndex: 0, document: "MC-5290.00-22313-970-C1O-009" }, "B", { at: "2026-09-03T14:40:00Z" });
assert.equal(changed.updated, true);
assert.equal(changed.previousRevision, "A");
assert.equal(changed.newRevision, "B");
assert.equal(Revision.validRevision("0"), true);
assert.equal(Revision.validRevision("A"), true);
assert.equal(Revision.validRevision("I"), false);

// A Conferência passa a usar a revisão B do registro corrigido, sem qualquer
// conhecimento especial da UI de edição.
const baseB = [{ document: "MC-5290.00-22313-970-C1O-009", revision: "B", searchKeys: Core.documentSearchKeys("MC-5290.00-22313-970-C1O-009"), documentIdentity: Conference.documentIdentity("MC-5290.00-22313-970-C1O-009") }];
let conference = Conference.reconcile([changed.record], baseB, null, { now: "2026-09-03T15:00:00Z" });
const correctedRow = conference.rows.find((row) => row.document.includes("MC-5290"));
assert.equal(correctedRow.revisionSent, "B");
assert.equal(correctedRow.status, Conference.STATUSES.CONFIRMED);

// Localização exata com múltiplos formatos: cada formato esperado precisa ter
// exatamente a quantidade correspondente na eGRDT.
const target = {
  id: "target-1", document: "MC-5290.00-22313-970-C1O-009", revision: "B",
  egrdtNumber: original.egrdtNumber, expectedByExtension: { pdf: 1, xlsx: 1 },
};
const entries = [
  { id: "1", rootId: "r", name: "MC-5290.00-22313-970-C1O-009_0001_B.pdf", relativePath: "x/MC-5290.00-22313-970-C1O-009_0001_B.pdf", extension: "pdf", size: 100 },
  { id: "2", rootId: "r", name: "MC-5290.00-22313-970-C1O-009_0001_B.xlsx", relativePath: "x/MC-5290.00-22313-970-C1O-009_0001_B.xlsx", extension: "xlsx", size: 200 },
];
let result = Reposting.classifyTarget(target, entries);
assert.equal(result.state, Reposting.STATES.FOUND);
assert.equal(result.selected.length, 2);
assert.equal(Reposting.summarize([result]).filesFound, 2);

// Ausente.
result = Reposting.classifyTarget(target, [{ id: "x", rootId: "r", name: "OUTRO-DOCUMENTO_0001_B.pdf", relativePath: "x/outro.pdf", extension: "pdf" }]);
assert.equal(result.state, Reposting.STATES.NOT_FOUND);

// Documento correto, revisão diferente: nunca usar silenciosamente.
result = Reposting.classifyTarget({ ...target, expectedByExtension: { pdf: 1 } }, [{ id: "3", rootId: "r", name: "MC-5290.00-22313-970-C1O-009_0001_A.pdf", relativePath: "x/a.pdf", extension: "pdf" }]);
assert.equal(result.state, Reposting.STATES.DIFFERENT_REVISION);
assert.deepEqual(result.revisionsFound, ["A"]);
assert.equal(result.selected.length, 0);

// Ambiguidade: dois PDFs da mesma revisão quando apenas um é esperado.
result = Reposting.classifyTarget({ ...target, expectedByExtension: { pdf: 1 } }, [
  { id: "4", rootId: "r", name: "MC-5290.00-22313-970-C1O-009_0001_B.pdf", relativePath: "x/a/MC-5290.00-22313-970-C1O-009_0001_B.pdf", extension: "pdf" },
  { id: "5", rootId: "r", name: "MC-5290.00-22313-970-C1O-009_0001_B.pdf", relativePath: "x/b/MC-5290.00-22313-970-C1O-009_0001_B.pdf", extension: "pdf" },
]);
assert.equal(result.state, Reposting.STATES.AMBIGUOUS);
assert.equal(result.selected.length, 0);

// Não confundir código por substring.
assert.equal(Reposting.matchesDocument("ABC-0010_0001_A.pdf", "ABC-001"), false);
assert.equal(Reposting.matchesDocument("ABC-001_0001_A.pdf", "ABC-001"), true);

// ET continua aceitando a identidade com e sem nt- pela fonte central.
const etWithout = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019";
const etWith = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-SPE-AST-320019";
assert.equal(Reposting.matchesDocument(`${etWith}_0001_A.pdf`, etWithout), true);

// A camada documental pós-eGRDT precisa tratar todos os arquivos do mesmo
// documento/revisão em uma única alteração auditável.
const documentPatch = fs.readFileSync(path.join(__dirname, "..", "grcon_revision_control_document.js"), "utf8");
assert.match(documentPatch, /affectedIndexes\.forEach/);
assert.match(documentPatch, /file\.revision = newRevision/);
assert.match(documentPatch, /file\.grdtRevision = newRevision/);
assert.match(documentPatch, /affectedFiles:/);
assert.match(documentPatch, /syncState = "pending"/);

// A UI deve manter explícita a separação entre preparar arquivos e comprovar a
// postagem pelo SIGEM/Consulta Geral.
const appSource = fs.readFileSync(path.join(__dirname, "..", "grcon_reposting_app.js"), "utf8");
assert.match(appSource, /Arquivos preparados ≠ documento postado/);
assert.match(appSource, /Consulta Geral continua sendo a evidência final/);
assert.match(appSource, /data-repost-grdt/);
assert.match(appSource, /Selecionar filtrados/);
assert.match(appSource, /PERMISSION_REQUIRED/);

console.log("reposting: revisão operacional + localização segura + lote OK");
