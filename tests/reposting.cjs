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
const RepostingStorage = require("../grcon_reposting_storage.js");

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

// Pasta escolhida só para a sessão: a referência física do arquivo precisa
// atravessar a classificação. Sem ela, Gerar ZIP / Baixar arquivos / Copiar
// para pasta terminavam em erro porque não existe raiz autorizada para reabrir
// o arquivo depois.
const sessionFile = { name: "MC-5290.00-22313-970-C1O-009_0001_B.pdf", size: 100 };
const sessionEntries = [{
  id: "snapshot-abc|0|pasta/MC-5290.00-22313-970-C1O-009_0001_B.pdf",
  rootId: "snapshot-abc",
  rootLabel: "Pasta desta sessão",
  generation: "session",
  name: sessionFile.name,
  relativePath: `pasta/${sessionFile.name}`,
  extension: "pdf",
  size: 100,
  __fileRef: sessionFile,
}];
const sessionResult = Reposting.classifyTarget({ ...target, expectedByExtension: { pdf: 1 } }, sessionEntries);
assert.equal(sessionResult.state, Reposting.STATES.FOUND);
assert.equal(sessionResult.selected.length, 1);
assert.equal(sessionResult.selected[0].__fileRef, sessionFile);
assert.equal(sessionResult.selected[0].generation, "session");
assert.equal(sessionResult.candidates[0].__fileRef, sessionFile);

// O índice persistente continua sem referência física: nada de File vazando
// para dentro do lote gravado.
assert.equal(Object.prototype.hasOwnProperty.call(Reposting.classifyTarget(target, entries).selected[0], "__fileRef"), false);

// Sem a referência, o erro precisa pedir a pasta de novo em vez de culpar uma
// autorização que nunca existiu.
assert.equal(RepostingStorage.isSessionEntry({ generation: "session" }), true);
assert.equal(RepostingStorage.isSessionEntry({ rootId: "snapshot-abc" }), true);
assert.equal(RepostingStorage.isSessionEntry({ rootId: "root-arquivos-rir" }), false);
async function sessionEntryResolution() {
  await assert.rejects(
    () => RepostingStorage.resolveEntry({ rootId: "snapshot-abc", generation: "session", name: sessionFile.name, relativePath: `pasta/${sessionFile.name}` }),
    (error) => error.code === "SESSION_ENTRY_LOST" && /Selecione a pasta novamente/.test(error.message),
  );
  assert.equal(await RepostingStorage.resolveEntry({ rootId: "snapshot-abc", generation: "session", __fileRef: sessionFile }), sessionFile);
}

// Entrega do lote: nome livre dentro do ZIP, pasta por eGRDT sem descartar o
// arquivo compartilhado por duas eGRDTs e intervalo entre downloads.
assert.match(appSource, /uniqueZipPath\(paths, `\$\{folder\}\$\{file\.name\}`\)/);
assert.match(appSource, /const signature = `\$\{organize \? item\.egrdtNumber : ""\}\|/);
assert.match(appSource, /duplicateAcrossEgrdts: organize/);
assert.match(appSource, /await pause\(220\)/);
assert.match(appSource, /Nenhum arquivo pôde ser lido para o ZIP/);

// Busca sobre índice vazio não é evidência de ausência. O resumo precisa
// separar “não verificado” de “não encontrado”, e a tela precisa dizer por quê.
const uncheckedSummary = Reposting.summarize([
  { state: Reposting.STATES.UNCHECKED, target, selected: [] },
  { state: Reposting.STATES.UNCHECKED, target, selected: [] },
  { state: Reposting.STATES.FOUND, target, selected: [{}] },
]);
assert.equal(uncheckedSummary.unchecked, 2);
assert.equal(uncheckedSummary.notFound, 0);
assert.equal(uncheckedSummary.ready, false);
assert.equal(Reposting.stateLabel(Reposting.STATES.UNCHECKED), "Não verificado");

assert.match(appSource, /if \(!available\.entries\.length\)/);
assert.match(appSource, /Busca não realizada/);
assert.match(appSource, /pendingRoots/);
assert.match(appSource, /Clique em “Atualizar índice”/);
assert.match(appSource, /Nenhum local de arquivos foi configurado/);
// Autorizar a pasta passa a indexar na sequência, senão a busca fica sem fonte.
assert.match(appSource, /Indexando os arquivos…`, "success"\); await indexRootAction\(item\.id\)/);

sessionEntryResolution().then(() => {
  console.log("reposting: revisão operacional + localização segura + lote OK");
}, (error) => { console.error(error); process.exitCode = 1; });
