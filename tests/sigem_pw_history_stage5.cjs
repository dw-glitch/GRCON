const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(rootDir, name), "utf8");
const dashboardApp = read("src/react/sigem-pw/services/sigemPwDashboardAdapter.ts");
const historyApp = read("sigem_pw_history_app.js");
const evolutionApp = read("sigem_pw_evolution_app.js");
const management = read("sigem_pw_history_management.js");
const historyCore = read("sigem_pw_history_core.js");

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `função ${name} deve existir`);
  return source.slice(start, end);
}

(function dailyEvolutionAndLongTermHistoryAreIndependent() {
  assert.match(evolutionApp, /const SECTION_ID = "spw-evolution-section"/);
  assert.match(historyApp, /const SECTION_ID = "spw-history-section"/);
  assert.match(historyApp, /data-spw-jump="spw-evolution-section">Entradas diárias/);
  assert.match(historyApp, /data-spw-jump="\$\{SECTION_ID\}">Histórico/);
  assert.match(evolutionApp, /history\.insertAdjacentElement\("beforebegin", section\)/,
    "evolução diária deve ser criada sem substituir a visão histórica");
})();

(function validatedCandidateIsRecordedBeforeActivation() {
  const sigem = functionBody(dashboardApp, "importSigem", "parsePwFile");
  const pw = functionBody(dashboardApp, "importPw", "importLd");
  const ld = functionBody(dashboardApp, "importLd", "clearPreStage7BasesOnce");
  assert.ok(sigem.indexOf("registerHistoryBeforeActivation") < sigem.indexOf("Core().saveSigemBase"));
  assert.ok(pw.indexOf("registerHistoryBeforeActivation") < pw.indexOf("Core().savePwBase"));
  assert.ok(ld.indexOf("registerHistoryBeforeActivation") < ld.indexOf("Core().saveLdAndReprocessPw"));
  assert.match(dashboardApp, /não pôde ser registrada no histórico e não foi ativada/,
    "falha histórica deve preservar a base vigente");
})();

(function fullPayloadIsCapturedForFutureEvolution() {
  assert.match(management, /async function capturePayload\(system, base, snapshotId, context\)/);
  assert.match(management, /O snapshot precisa ser registrado antes da captura/);
  assert.match(management, /records: clone\(base\.records\)/);
  assert.match(management, /capturePayload,/);
  const helper = functionBody(dashboardApp, "registerHistoryBeforeActivation", "importSigem");
  assert.ok(helper.indexOf("history.recordActiveBases") < helper.indexOf("management.capturePayload"),
    "snapshot agregado deve existir antes do payload bruto");
})();

(function historicalTotalsUseDocumentPlusRevision() {
  assert.match(historyCore, /CALCULATION_VERSION = "sigem-pw-history-2"/);
  assert.match(historyCore, /revisionEntries: entryTotal/);
  assert.match(historyCore, /emittedRevisionEntries/);
  assert.match(historyApp, /revisionEntries \?\? snapshot\.metrics\.comparableDocuments/,
    "histórico antigo deve continuar legível por fallback");
})();

console.log("sigem_pw_history_stage5: OK — histórico separado, snapshots pré-ativação, payloads e contagem por revisão validados.");
