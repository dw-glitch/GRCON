const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Core = require(path.join(__dirname, "..", "sigem_pw_dashboard_core.js"));
const Rev = require(path.join(__dirname, "..", "sigem_pw_revision_core.js"));

(async () => {

const et = (tag, eap = "3.1.1.1") => `C1O_RNEST_U32_${eap}_INS_RIR_${tag}`;
const pwEt = (tag, eap = "3.1.1.1") => `C1O-RNEST-U32-${eap}-INS-RIR-${tag}`;
const sigemRows = [];
const pwRows = [];
const addSigem = (doc, revision, status, sourceRow) => sigemRows.push({ document: doc, revision, status, sourceRow });
const addPw = (doc, revision, state, lastEmission, sourceRow) => pwRows.push({ document: doc, revision, revisionComplete: revision, state, lastEmission, sourceRow, emittedEvidence: ["SIM", "NAO"].includes(Core.norm(lastEmission)) });

// 1. Mesma revisão emitida.
addSigem(et("PI-000001"), "B", "Em Workflow", 1);
addPw(pwEt("PI-000001"), "A", "Superado", "Não", 1);
addPw(pwEt("PI-000001"), "B", "Liberado para Construcao", "Sim", 2);

// 2. PW uma revisão atrás.
addSigem(et("PI-000002"), "B", "Conforme Construído", 2);
addPw(pwEt("PI-000002"), "A", "Liberado para Construcao", "Sim", 3);

// 3. PW duas revisões atrás.
addSigem(et("PI-000003"), "C", "Sem Comentários", 3);
addPw(pwEt("PI-000003"), "A", "Liberado para Construcao", "Sim", 4);

// 4. Não existe PW.
addSigem(et("PI-000004"), "B", "Em Análise", 4);

// 5. Revisão correta cadastrada, não emitida; A foi emitida.
addSigem(et("PI-000005"), "B", "Em Workflow", 5);
addPw(pwEt("PI-000005"), "A", "Superado", "Não", 5);
addPw(pwEt("PI-000005"), "B", "Cadastrado", "Previsto", 6);

// 6. Várias revisões preservadas.
addSigem(et("PI-000006"), "0", "Recusado", 6);
addSigem(et("PI-000006"), "A", "Com Comentários", 7);
addSigem(et("PI-000006"), "B", "Em Workflow", 8);
addPw(pwEt("PI-000006"), "0", "Superado", "Não", 7);
addPw(pwEt("PI-000006"), "A", "Liberado para Construcao", "Sim", 8);

// 7. Revisão 0 válida.
addSigem(et("PI-000007"), "A", "Em Workflow", 9);
addPw(pwEt("PI-000007"), "0", "Liberado para Construcao", "Sim", 9);

// 8. EAP diferente não pode casar.
addSigem(et("PI-000008", "3.1.1.1"), "B", "Em Workflow", 10);
addPw(pwEt("PI-000008", "3.1.1.2"), "A", "Liberado para Construcao", "Sim", 10);

// 9. Status deve ser da revisão selecionada.
addSigem("CE-5290.00-22313-856-C1O-101", "B", "Em Workflow", 11);
addPw("CE-5290.00-22313-856-C1O-101", "A", "Superado", "Não", 11);
addPw("CE-5290.00-22313-856-C1O-101", "B", "Em Analise Engenharia", "Sim", 12);

// PW posterior: divergência real adicional.
addSigem("DE-5290.00-22313-856-C1O-102", "A", "Sem Comentários", 12);
addPw("DE-5290.00-22313-856-C1O-102", "B", "Cadastrado", "Previsto", 13);

const model = Core.createModel(sigemRows, pwRows);
const analysis = Rev.analyze(model);
const byDoc = new Map(analysis.rows.map((row) => [row.document, row]));
const get = (tag) => analysis.rows.find((row) => row.document.includes(tag));

assert.strictEqual(get("PI-000001").situation, Rev.SITUATIONS.UPDATED);
assert.strictEqual(get("PI-000002").situation, Rev.SITUATIONS.PREVIOUS);
assert.strictEqual(get("PI-000002").pwRevision, "A");
assert.strictEqual(get("PI-000003").situation, Rev.SITUATIONS.PREVIOUS);
assert.strictEqual(get("PI-000004").situation, Rev.SITUATIONS.NOT_FOUND);
assert.strictEqual(get("PI-000005").situation, Rev.SITUATIONS.AWAITING_EMISSION);
assert.strictEqual(get("PI-000005").pwRevision, "B");
assert.strictEqual(get("PI-000005").lastEmittedPwRevision, "A");
assert.deepStrictEqual(Rev.historyForRows(get("PI-000006").sigemRows, "sigem").map((r) => r.revision), ["B", "A", "0"]);
assert.deepStrictEqual(Rev.historyForRows(get("PI-000006").pwRows, "pw").map((r) => r.revision), ["A", "0"]);
assert.strictEqual(get("PI-000006").situation, Rev.SITUATIONS.PREVIOUS);
assert.strictEqual(get("PI-000007").pwRevision, "0", "revisão 0 não pode virar ausência");
assert.strictEqual(get("PI-000007").situation, Rev.SITUATIONS.PREVIOUS);
assert.strictEqual(get("PI-000008").situation, Rev.SITUATIONS.NOT_FOUND, "EAP diferente deve ser outro documento");
assert.strictEqual(byDoc.get("CE-5290.00-22313-856-C1O-101").sigemStatus, "Em Workflow");
assert.strictEqual(byDoc.get("CE-5290.00-22313-856-C1O-101").pwStatus, "Em Analise Engenharia");
assert.strictEqual(byDoc.get("DE-5290.00-22313-856-C1O-102").situation, Rev.SITUATIONS.PW_AHEAD);
assert.strictEqual(analysis.counts.updated + analysis.counts.previous + analysis.counts.notFound + analysis.counts.awaitingEmission + analysis.counts.pwAhead + analysis.counts.review, analysis.rows.length);
assert.ok(analysis.metrics.algorithm.startsWith("O("));

const attention = Rev.filterRows(analysis.rows, { situation: "attention" });
assert.ok(attention.every((row) => row.situation !== Rev.SITUATIONS.UPDATED));
assert.strictEqual(Rev.filterRows(analysis.rows, { documentList: et("PI-000005") }).length, 1);
assert.strictEqual(Rev.filterRows(analysis.rows, { pwRevision: "0" }).some((row) => row.document.includes("PI-000007")), true);

// Carga: 15.000 documentos, 30.000+ revisões sem loop SIGEM×PW cruzado.
const bigSigem = [];
const bigPw = [];
for (let i = 0; i < 15000; i += 1) {
  const suffix = String(i).padStart(6, "0");
  const s = et(`PI-${suffix}`);
  const p = pwEt(`PI-${suffix}`);
  bigSigem.push({ document: s, revision: "A", status: "Em Workflow", sourceRow: i * 2 + 1 });
  bigSigem.push({ document: s, revision: "B", status: "Sem Comentários", sourceRow: i * 2 + 2 });
  bigPw.push({ document: p, revision: "A", state: "Superado", lastEmission: "Não", sourceRow: i * 2 + 1 });
  bigPw.push({ document: p, revision: i % 3 === 0 ? "B" : "A", state: i % 3 === 0 ? "Cadastrado" : "Superado", lastEmission: i % 3 === 0 ? "Previsto" : "Não", sourceRow: i * 2 + 2 });
}
const loadStart = performance.now();
const bigModel = Core.createModel(bigSigem, bigPw);
const modelMs = performance.now() - loadStart;
const revisionStart = performance.now();
const bigAnalysis = Rev.analyze(bigModel);
const revisionMs = performance.now() - revisionStart;
assert.strictEqual(bigAnalysis.rows.length, 15000);
assert.ok(revisionMs < 5000, `análise linear demorou ${revisionMs.toFixed(1)}ms`);
const asyncStart = performance.now();
const asyncAnalysis = await Rev.analyzeAsync(bigModel, { chunkSize: 350 });
const asyncMs = performance.now() - asyncStart;
assert.deepStrictEqual(asyncAnalysis.counts, bigAnalysis.counts);
assert.ok(asyncAnalysis.metrics.maxChunkMs < 100, `chunk principal longo: ${asyncAnalysis.metrics.maxChunkMs.toFixed(1)}ms`);
console.log(`perf synthetic: model=${modelMs.toFixed(1)}ms revision=${revisionMs.toFixed(1)}ms async=${asyncMs.toFixed(1)}ms maxChunk=${asyncAnalysis.metrics.maxChunkMs.toFixed(1)}ms docs=${bigAnalysis.rows.length}`);

const ui = fs.readFileSync(path.join(__dirname, "..", "sigem_pw_revision_section.js"), "utf8");
assert.ok(/PAGE_SIZE\s*=\s*100/.test(ui), "tabela deve paginar");
assert.ok(/setTimeout\([^]*180\)/.test(ui), "pesquisa deve usar debounce curto");
assert.ok(!/MutationObserver/.test(ui));
assert.ok(!/setInterval/.test(ui));
assert.ok(/Situação das Revisões/.test(ui));
assert.ok(/PW em revisão anterior/.test(ui));
assert.ok(/Não localizados no PW/.test(ui));
assert.ok(/Aguardando emissão no PW/.test(ui));
assert.ok(/Última emissão PW/.test(ui));
assert.ok(/Pesquisar uma lista de documentos/.test(ui));
assert.ok(/Por quê\?/.test(ui));

const bootstrap = fs.readFileSync(path.join(__dirname, "..", "sigem_pw_dashboard_bootstrap.js"), "utf8");
assert.ok(/sigem_pw_revision_core\.js/.test(bootstrap));
assert.ok(/sigem_pw_revision_section\.js/.test(bootstrap));
assert.ok(/state\?\.ready/.test(bootstrap), "retorno ao Dashboard não deve recriar o shell e duplicar listeners");

console.log("sigem_pw_revision_analysis: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
