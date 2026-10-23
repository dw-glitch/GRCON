"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const C = require("../core.js");
const E = require("../emission.js");
const H = require("../history_core.js");
const Guard = require("../grcon_output_guard.js");
const Workbook = require("../grdt_workbook.js");
const Q = require("../grdt_triage_query.js");

const code = "C1O_RNEST_U32_6.21.1.1_CVL_MTAND_AND-OUT-26";
function rowFor(extensions, extra = {}) {
  const record = { document: code, revision: "0", sheet: "ET", title: "PLANO DE TRABALHO",
    discipline: "PLANEJAMENTO", format: "A4", documentType: "RL", purpose: "Para Informação" };
  const files = extensions.map(ext => ({ name: `${code}.${ext}`, finalName: `${code}.${ext}`, file: { name: `${code}.${ext}`, size: 1 } }));
  return { document: code, revision: "0", sheet: "ET", status: "Não Postado", decision: C.READY,
    record, files, finalName: files[0].finalName, egrdt: C.buildEgrdtData(code, "0", files[0].finalName, record, "ET", "A4"), ...extra };
}
const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
const state = { results: [], selected: new Set(), manualForceInclude: new Set() };
const context = vm.createContext({ C, E, TriageQuery: Q, state, Date, Set,
  rowOutputSources: row => row.files || [], resultIndex: row => state.results.indexOf(row),
  showToast() {}, auditManualGrdtChange() {}, window: {} });
vm.runInContext(app.slice(app.indexOf("  function manualAllocationOverrideAllowed("),
  app.indexOf("  function refreshPendingAllocationBundle(")), context);
const postingSource = fs.readFileSync(require.resolve("../sigem_posting_app.js"), "utf8");
const posting = vm.createContext({ Emission: E, text: v => String(v || "").trim(), norm: C.norm });
vm.runInContext(postingSource.slice(postingSource.indexOf("  function groupByDocumentRevision("),
  postingSource.indexOf("  function baselineAudit(")), posting);

(async () => {
for (const extensions of [["pdf"], ["docx"], ["docx", "pdf", "txt"], ["xlsx", "pdf"], ["dwg"]]) {
  const row = rowFor(extensions);
  state.results = [row]; state.selected.clear(); state.manualForceInclude.clear();
  assert.equal(context.rowCanAutoInclude(row), false, "conjunto fora da regra requer seleção manual");
  assert.ok(E.createPlan([row], [0]).errors.length, "seleção automática não libera a exceção");
  assert.equal(context.setRowSelected(0, true), true);
  assert.deepEqual([...context.guardedSelectedIndices()], [0]);
  const plan = E.createPlan([row], context.guardedSelectedIndices(), { manualForceIndices: state.manualForceInclude });
  assert.deepEqual(plan.errors, [], plan.errors.join("\n"));
  assert.equal(plan.entries.length, extensions.length, "preserva cada arquivo físico da seleção manual");
  assert.ok(plan.entries.every(entry => entry.manualCompositionOverride));
  assert.ok(plan.warnings.some(message => /exceção de composição/.test(message)));
  assert.deepEqual(E.consistencyErrors(plan), []);
  const workbook = await Workbook.build(plan.items);
  assert.ok(workbook.byteLength > 0, "gera workbook oficial para o conjunto manual");
  await Workbook.verify(workbook, plan.items);
  const saved = H.recordFromGenerated({ official: { baseName: "QA-MANUAL" }, group: plan }, [row], { generatedAt: "2026-10-23T17:00:00Z" });
  const restored = H.cleanRecord(JSON.parse(JSON.stringify(saved)));
  assert.ok(restored.files.every(file => file.manualCompositionOverride), "histórico preserva a exceção");
  const items = plan.entries.map(entry => ({ document: entry.document, revision: entry.revision, fileName: entry.finalName }));
  assert.deepEqual(Array.from(posting.compositionErrors(restored, items)), [], "etapa SIGEM não reintroduz o bloqueio já autorizado");
  assert.ok(posting.compositionErrors({ files: restored.files.map(file => ({ ...file, manualCompositionOverride: false })) }, items).length);
  assert.ok(posting.compositionErrors(restored, [...items, { document: code, revision: "0", fileName: `${code}.zip` }]).length, "a autorização não se transfere a arquivo novo");
  context.setRowSelected(0, false);
  assert.equal(state.manualForceInclude.size, 0, "desmarcar revoga a exceção");
}
assert.deepEqual(E.createPlan([rowFor(["docx", "pdf"])], [0]).errors, [], "par habitual continua automático");
assert.equal(context.rowCanAutoInclude(rowFor(["docx", "pdf"])), true);
for (const blockCode of ["not_allocated", "discipline_confirmation", "invalid_file", "ld_conflict"]) {
  const row = rowFor(["docx", "pdf"], { hardBlock: true, blockCode, reason: "Conferir regra operacional" });
  assert.equal(context.rowCanAutoInclude(row), false);
  assert.equal(context.rowCanBeSelected(row), true);
  assert.ok(E.createPlan([row], [0]).errors.length);
  const plan = E.createPlan([row], [0], { manualForceIndices: [0] });
  assert.deepEqual(plan.errors, []);
  assert.ok(plan.entries.every(entry => entry.manualRuleOverride));
  assert.ok(plan.warnings.length);
  assert.equal(Guard.validateRows([row]).valid, false);
  const guard = Guard.validateRows([row], { manualForceRows: new Set([row]) });
  assert.equal(guard.valid, true); assert.ok(guard.warnings.length);
  assert.equal(row.hardBlock, true, "preserva a condição de origem");
}
console.log("OK — inclusão manual: Planejamento com arquivos livres, triagem, workbook, histórico, SIGEM e revogação.");
})().catch(error => { console.error(error); process.exitCode = 1; });
