// Regressões da conferência por emissão e diagnóstico operacional.
const assert = require("node:assert/strict");
const C = require("../posting_conference_core.js");

const NOW = "2026-10-08T18:00:00Z";
const code = (n) => "RL-5290.00-22313-970-C1O-" + String(n).padStart(3, "0");
const emission = (n, files, date = "2026-09-30T12:00:00Z") => ({
  id: "emission-" + n, clientRecordId: "emission-" + n, egrdtNumber: "GRDT-" + n,
  generatedAt: date,
  files: files.map(([document, revision, purpose]) => ({
    document, revision, grdtRevision: revision, sheet: "ET", discipline: "TUB",
    purpose: purpose || "Para Construção",
  })),
});
const sigem = (document, revision, status = "Em Análise") => ({
  document: C.displayDocument(document),
  documentIdentity: C.documentIdentity(document),
  searchKeys: C.documentKeys(document),
  revision: C.normalizeRevision(revision),
  status, sourceRow: 7, modifiedAt: "08/10/2026 13:00:00",
});
const run = (history, base, extras = {}) => C.reconcile(history, base, null, {
  now: NOW, waitHours: 48, baseReferenceDate: "2026-10-08", ...extras,
});
const d = [code(1), code(2), code(3), code(4)];

// A: todos os códigos/revisões encontrados; eGRDT efetivamente confirmada na base.
let result = run([emission("100", [[d[0], "A"], [d[1], "A"]])], [sigem(d[0], "A"), sigem(d[1], "A")]);
assert.equal(result.groups[0].classification, "TOTALMENTE_CONFIRMADA");
assert.equal(result.groups[0].confirmed, 2);
assert.equal(result.groups[0].riskOfDuplicateResend, false);

// B: quatro/localizados vs uma revisão ausente, todos os documentos da emissão retidos.
result = run([emission("101", [[d[0], "A"], [d[1], "A"], [d[2], "A"]])],
  [sigem(d[0], "A"), sigem(d[1], "A")]);
assert.equal(result.groups[0].classification, "PARCIALMENTE_CONFIRMADA");
assert.equal(result.groups[0].confirmed, 2);
assert.equal(result.groups[0].notFound, 1);
assert.equal(result.groups[0].rows.length, 3);
assert.equal(result.groups[0].riskOfDuplicateResend, true);
assert.equal(C.diagnoseRow(result.rows[0], { kind: "allocated" }).action, "NÃO REENVIAR");

// C: ausência em Documentos Previstos é indício, não erro confirmado.
let pending = result.rows.find((item) => item.document === C.displayDocument(d[2]));
let diagnosis = C.diagnoseRow(pending, { kind: "not_allocated", allocations: [], plannedSnapshotId: "p1" });
assert.equal(diagnosis.action, "VERIFICAR ALOCAÇÃO");
assert.equal(diagnosis.evidenceLevel, "INDÍCIO DE POSSÍVEL CAUSA");
assert.match(diagnosis.reason, /não é prova/i);

// D: revisão anterior em análise não confirma a nova revisão.
result = run([emission("102", [[d[3], "C"]])], [sigem(d[3], "B", "Em Análise")]);
diagnosis = C.diagnoseRow(result.rows[0], { kind: "allocated" });
assert.equal(result.rows[0].status, C.STATUSES.REVISION_DIVERGENT);
assert.equal(diagnosis.action, "INVESTIGAR REVISÃO");
assert.match(diagnosis.reason, /revisão B/i);
assert.ok(!diagnosis.canPreselectResend);

// E: mesma revisão em workflow implica presença documental, não nova postagem.
result = run([emission("103", [[d[0], "A"]])], [sigem(d[0], "A", "Em Workflow")]);
diagnosis = C.diagnoseRow(result.rows[0], { kind: "allocated" });
assert.equal(result.rows[0].status, C.STATUSES.CONFIRMED);
assert.equal(diagnosis.action, "NÃO REENVIAR");
assert.equal(diagnosis.statusSigem, "Em Workflow");

// F: Consulta Geral com data anterior à emissão não prova ausência.
result = run([emission("104", [[d[2], "A"]], "2026-10-07T14:00:00Z")],
  [sigem(d[0], "A")], { baseReferenceDate: "2026-10-01" });
assert.equal(result.rows[0].status, C.STATUSES.NOT_VERIFIED);
assert.equal(result.groups[0].classification, "NAO_VERIFICADA");
assert.equal(C.diagnoseRow(result.rows[0], {}).action, "AGUARDAR BASE ATUALIZADA");

// G: duas GRDTs com o mesmo documento/revisão são dois eventos, mas sem inferir
// qual GRDT originou a presença no SIGEM.
result = run([emission("105", [[d[1], "B"]]), emission("106", [[d[1], "B"]])], [sigem(d[1], "B")]);
assert.equal(result.groups.length, 2);
assert.equal(result.groups[0].total, 1);
assert.equal(result.groups[1].total, 1);
assert.equal(new Set(result.rows.map((row) => row.documentIdentity)).size, 1);

// H: múltiplas alocações nunca se reduzem à primeira.
result = run([emission("107", [[d[0], "A"]])], [sigem(d[0], "A")]);
diagnosis = C.diagnoseRow(result.rows[0], {
  kind: "allocated", allocations: ["ALOC-027", "ALOC-028"],
  references: [{ allocation: "ALOC-027" }, { allocation: "ALOC-028" }],
});
assert.deepEqual(diagnosis.allocations, ["ALOC-027", "ALOC-028"]);
assert.equal(diagnosis.action, "NÃO REENVIAR");

// I: nenhuma base válida => não verificada; nenhum candidato automático.
result = run([emission("108", [[d[0], "A"]])], []);
assert.equal(result.groups[0].classification, "NAO_VERIFICADA");
assert.equal(C.diagnoseRow(result.rows[0], {}).canPreselectResend, false);

// J: nenhum documento confirmado; não comprova não-postagem.
result = run([emission("109", [[d[0], "A"], [d[1], "A"]])], [sigem(d[2], "B")]);
assert.equal(result.groups[0].classification, "NENHUM_DOCUMENTO_CONFIRMADO");
assert.equal(result.groups[0].notFound, 2);

// Duplicata exata na mesma GRDT não altera a quantidade de eventos.
result = run([emission("110", [[d[0], "A"], [d[0], "A"], [d[1], "A"]])], [sigem(d[0], "A")]);
assert.equal(result.groups[0].total, 2);
assert.equal(result.groups[0].distinctDocuments, 2);

// Base anterior com confirmação histórica: preserve evidência antiga e atual.
const prev = run([emission("111", [[d[0], "A"]])], [sigem(d[0], "A")]);
result = C.reconcile([emission("111", [[d[0], "A"]])], [sigem(d[1], "A")], prev.state, {
  now: NOW, waitHours: 48, baseReferenceDate: "2026-10-08",
});
assert.equal(result.rows[0].historicalPreserved, true);
assert.equal(C.diagnoseRow(result.rows[0], {}).action, "NÃO REENVIAR");

// Propósito de emissão vinculado ao evento original da GRDT.
result = run([emission("112", [[d[0], "A", "Para Cancelamento"]])], [sigem(d[0], "A")]);
assert.equal(result.rows[0].purpose, "Para Cancelamento");

console.log("posting_conference_intelligent_grdt: OK");
