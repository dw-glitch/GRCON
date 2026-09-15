const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const Dashboard = require("../sigem_pw_dashboard_core.js");
const uiAuditSource = fs.readFileSync(path.join(rootDir, "sigem_pw_dashboard_ui_audit.js"), "utf8");
const evolutionSource = fs.readFileSync(path.join(rootDir, "sigem_pw_evolution_app.js"), "utf8");

function ms(started) {
  return Number(process.hrtime.bigint() - started) / 1e6;
}

function mb(bytes) {
  return Number(bytes || 0) / 1024 / 1024;
}

async function activationGuardRegression() {
  const modelA = { id: "A" };
  const modelB = { id: "B" };
  const calls = { audit: 0, revision: 0, history: 0, management: 0, evolution: 0 };

  global.GrconSigemPwDashboardUi = { state: { model: modelA } };
  global.GrconSigemPwAuditUi = {
    state: { ready: false },
    async activate() { calls.audit += 1; this.state.ready = true; },
  };
  global.GrconSigemPwRevisionUi = {
    state: { analysis: null },
    async activate() { calls.revision += 1; this.state.analysis = {}; },
  };
  global.GrconSigemPwHistoryUi = {
    state: { ready: false },
    async activate() { calls.history += 1; this.state.ready = true; },
  };
  global.GrconSigemPwHistoryManagement = {
    state: { open: false },
    async activate() { calls.management += 1; },
  };
  global.GrconSigemPwEvolutionUi = {
    state: { ready: false },
    async activate() { calls.evolution += 1; this.state.ready = true; },
  };

  delete require.cache[require.resolve("../sigem_pw_dashboard_ui_audit.js")];
  const Stability = require("../sigem_pw_dashboard_ui_audit.js");
  Stability.installActivationGuards();

  for (const name of [
    "GrconSigemPwAuditUi",
    "GrconSigemPwRevisionUi",
    "GrconSigemPwHistoryUi",
    "GrconSigemPwHistoryManagement",
    "GrconSigemPwEvolutionUi",
  ]) await global[name].activate();

  for (const name of [
    "GrconSigemPwAuditUi",
    "GrconSigemPwRevisionUi",
    "GrconSigemPwHistoryUi",
    "GrconSigemPwHistoryManagement",
    "GrconSigemPwEvolutionUi",
  ]) await global[name].activate();

  assert.deepEqual(calls, { audit: 1, revision: 1, history: 1, management: 1, evolution: 1 }, "reabrir o Dashboard com o mesmo modelo não pode refazer os cinco submódulos");

  global.GrconSigemPwDashboardUi.state.model = modelB;
  await global.GrconSigemPwRevisionUi.activate();
  assert.equal(calls.revision, 2, "um novo modelo deve invalidar corretamente o cache de ativação");

  global.GrconSigemPwHistoryManagement.state.open = true;
  await global.GrconSigemPwHistoryManagement.activate();
  assert.equal(calls.management, 2, "o gerenciador aberto deve continuar atualizando mesmo sem troca do modelo");

  const metrics = Stability.performanceSnapshot();
  assert.ok(metrics.activationSkips.GrconSigemPwRevisionUi >= 1);
  assert.ok(metrics.activationSkips.GrconSigemPwHistoryUi >= 1);
}

function sourceRegression() {
  assert.match(uiAuditSource, /GRCON_DEBUG_UI\s*!==\s*true/, "auditoria contínua deve permanecer desativada fora do modo debug");
  assert.match(uiAuditSource, /DEBOUNCED_INPUT_IDS/, "filtros de texto precisam passar pelo debounce de estabilidade");
  assert.match(uiAuditSource, /spw-query/, "pesquisa principal deve estar coberta pelo debounce");
  assert.match(uiAuditSource, /spw-evo-filter-query/, "pesquisa da evolução deve estar coberta pelo debounce");
  assert.match(uiAuditSource, /data-evo-list/, "troca de listas da evolução deve estar coberta pela política de scroll");
  assert.match(uiAuditSource, /suppressedAutoScrolls/, "a supressão de scroll automático deve ser mensurável");
  assert.match(uiAuditSource, /content-visibility:auto/, "seções inferiores devem poder ser adiadas pelo navegador quando fora da viewport");
  assert.match(uiAuditSource, /#spw-progress\[hidden\]/, "o espaço do indicador de processamento deve permanecer reservado para evitar layout shift");
  assert.match(evolutionSource, /scrollIntoView\(\{behavior:\"smooth\",block:\"nearest\"\}\)/, "o teste deve continuar cobrindo a origem histórica da rolagem para que a guarda não seja removida sem migrar a chamada");
}

function stressCore(volume) {
  const sigem = new Array(volume);
  const pw = new Array(volume);
  for (let index = 0; index < volume; index += 1) {
    const eap3 = Math.floor(index / 1000);
    const eap4 = index % 1000;
    const sigemCode = `C1O_RNEST_U32_3.1.${eap3}.${eap4}_INS_RIR_nt-PI-${index}`;
    const pwCode = `C1O-RNEST-U32-3.1.${eap3}.${eap4}-INS-RIR-PI-${index}`;
    sigem[index] = { document: sigemCode, revision: "0", status: "Em Análise", sourceRow: index + 2 };
    pw[index] = {
      document: pwCode,
      revision: "0",
      revisionComplete: "0",
      documentType: "RIR",
      state: "Liberado",
      lastEmission: "SIM",
      sourceRow: index + 2,
    };
  }

  const heapBefore = process.memoryUsage().heapUsed;
  const modelStarted = process.hrtime.bigint();
  const model = Dashboard.createModel(sigem, pw, []);
  const modelMs = ms(modelStarted);
  const aggregateStarted = process.hrtime.bigint();
  const result = Dashboard.aggregateModel(model, { documentClass: "ET" });
  const aggregateMs = ms(aggregateStarted);
  const heapAfter = process.memoryUsage().heapUsed;

  assert.equal(result.summary.sigem, volume, "SIGEM deve manter exatamente a quantidade sintética de entradas");
  assert.equal(result.summary.pwRegistered, volume, "PW deve manter exatamente a quantidade sintética de entradas");
  assert.equal(result.summary.pwEmitted, volume, "todas as entradas PW sintéticas devem permanecer emitidas");
  assert.equal(result.summary.matched, volume, "as identidades com/sem nt- devem permanecer conciliadas");
  assert.equal(result.summary.gapSigemToPw, 0);
  assert.equal(result.summary.gapPwToEmitted, 0);
  assert.equal(result.summary.pwExclusive, 0);

  return {
    volume,
    modelMs,
    aggregateMs,
    heapDeltaMb: mb(heapAfter - heapBefore),
  };
}

(async () => {
  sourceRegression();
  await activationGuardRegression();

  const volumes = [1000, 5000, 10000, 25000, 50000];
  const results = volumes.map(stressCore);
  const largest = results.at(-1);
  assert.ok(largest.modelMs < 30000, `50 mil registros não podem consumir mais de 30 s só na criação do modelo (${largest.modelMs.toFixed(1)} ms)`);
  assert.ok(largest.aggregateMs < 15000, `50 mil registros não podem consumir mais de 15 s só na agregação (${largest.aggregateMs.toFixed(1)} ms)`);

  console.log("sigem_pw_performance_stability: OK");
  for (const result of results) {
    console.log(`  ${String(result.volume).padStart(5)} registros | modelo ${result.modelMs.toFixed(1)} ms | agregação ${result.aggregateMs.toFixed(1)} ms | Δheap ${result.heapDeltaMb.toFixed(1)} MB`);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
