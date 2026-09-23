const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const Management = require(path.join(rootDir, "sigem_pw_history_management.js"));

(function previousSnapshotIsImmediateAndDeterministic() {
  const snapshots = [
    { id: "sigem:A", importedAt: "2026-09-08T10:00:00Z" },
    { id: "sigem:B", importedAt: "2026-09-09T10:00:00Z" },
    { id: "sigem:C", importedAt: "2026-09-10T10:00:00Z" },
  ];
  assert.equal(Management.previousSnapshot(snapshots, "sigem:C").id, "sigem:B");
  assert.equal(Management.previousSnapshot(snapshots, "sigem:B").id, "sigem:A");
  assert.equal(Management.previousSnapshot(snapshots, "sigem:A"), null);
})();

(function onlyDependentComparisonsAreSelectedForDeletion() {
  const comparisons = [
    { id: "C1", sigemSnapshotId: "S1", pwSnapshotId: "P1" },
    { id: "C2", sigemSnapshotId: "S2", pwSnapshotId: "P1" },
    { id: "C3", sigemSnapshotId: "S2", pwSnapshotId: "P2" },
  ];
  assert.deepEqual(Management.dependentComparisonIds(comparisons, "S1"), ["C1"]);
  assert.deepEqual(Management.dependentComparisonIds(comparisons, "P1"), ["C1", "C2"]);
  assert.deepEqual(Management.dependentComparisonIds(comparisons, "missing"), []);
})();

(function brokenDeltaReferencesAreNeutralizedInsteadOfInvented() {
  const snapshots = [
    { id: "A", delta: null },
    { id: "B", delta: { previousSnapshotId: "A", transitions: { resolved: 2 } } },
    { id: "C", delta: { previousSnapshotId: "B", transitions: { resolved: 5 } } },
    { id: "D", delta: { previousSnapshotId: "C", transitions: { resolved: 1 } } },
  ];
  const repaired = Management.repairDeltaSnapshots(snapshots.filter((item) => item.id !== "B"), new Set(["B"]));
  assert.deepEqual(repaired.map((item) => item.id), ["C"]);
  assert.equal(repaired[0].delta, null, "transição baseada em snapshot excluído não pode sobreviver");
})();

(function sourceUsesAtomicTargetedDeletionAndNeverClearsHistory() {
  const source = fs.readFileSync(path.join(rootDir, "sigem_pw_history_management.js"), "utf8");
  assert.match(source, /db\.transaction\(storeNames, "readwrite"\)/, "exclusão deve usar uma transação única no histórico");
  assert.match(source, /sourceStore\.delete\(snapshot\.id\)/);
  assert.match(source, /comparisonStore\.delete\(id\)/);
  assert.match(source, /changesStore\.delete/);
  assert.match(source, /metaStore\.delete\(payloadKey\(snapshot\.id\)\)/, "payload/fingerprint recuperável não pode ficar órfão");
  assert.doesNotMatch(source, /\.clear\s*\(/, "gerenciamento não pode limpar stores inteiras");
  assert.doesNotMatch(source, /deleteDatabase\s*\(/, "gerenciamento nunca apaga o banco inteiro");
  assert.doesNotMatch(source, /root\.confirm\s*\(/, "confirmação deve ser contextual e dentro do Dashboard");
  assert.match(source, /Remover esta atualização\?/);
  assert.match(source, /Base atual/);
  assert.match(source, /Base histórica/);
  assert.match(source, /Remover do histórico/);
})();

(function currentBasePromotionAndRollbackAreExplicit() {
  const source = fs.readFileSync(path.join(rootDir, "sigem_pw_history_management.js"), "utf8");
  assert.match(source, /previousPayload/);
  assert.match(source, /await writeActiveBase\(snapshot\.system, targetBase\)/);
  assert.match(source, /await writeActiveBase\(snapshot\.system, oldBase\)/, "falha da transação histórica deve restaurar a base ativa anterior");
  assert.match(source, /meta: null, records: \[\]/, "sem predecessor recuperável a fonte deve ficar não carregada, não zero");
  assert.match(source, /suppressedComparisonPair/, "par promovido não pode inventar um comparativo histórico que nunca existiu");
})();

(function managementListIsMetadataFirstAndPayloadIsLazy() {
  const source = fs.readFileSync(path.join(rootDir, "sigem_pw_history_management.js"), "utf8");
  assert.match(source, /listSourceSnapshots\("sigem"\)/);
  assert.match(source, /listSourceSnapshots\("pw"\)/);
  assert.match(source, /sourceRows\(sigem, "sigem"\)/);
  assert.match(source, /sourceRows\(pw, "pw"\)/);
  assert.match(source, /readMeta\(payloadKey\(previous\.id\), null\)/, "conteúdo completo só deve ser lido ao avaliar promoção");
})();

(function responsiveAuditFixesTheExactFiveCardRegressionLocally() {
  const source = fs.readFileSync(path.join(rootDir, "sigem_pw_dashboard_ui_audit.js"), "utf8");
  assert.match(source, /spw-rev-cards/);
  assert.match(source, /repeat\(auto-fit,minmax\(min\(100%,220px\),1fr\)\)/);
  assert.match(source, /@media\(max-width:1450px\).*spw-rev-cards.*repeat\(3,minmax\(0,1fr\)\)/s, "1366 px deve reorganizar os cinco cards em mais de uma linha");
  assert.match(source, /@media\(max-width:900px\).*spw-rev-cards.*repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(source, /flex-direction:column!important/);
  assert.match(source, /align-items:flex-start!important/);
  assert.match(source, /white-space:normal!important/);
  assert.match(source, /spw-rev-card:focus-visible/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /spw-action-grid/);
  assert.match(source, /spw-delta-grid/);
  assert.match(source, /spw-filter-card/);
  assert.match(source, /spw-rev-toolbar/);
  assert.match(source, /spw-history-charts/);
  assert.doesNotMatch(source, /(^|\n)\s*(?:button|article|section|table|input|select)\s*\{/m, "auditoria não pode aplicar CSS genérico fora do Dashboard");
})();

(function duplicateBasesAreSilentAndDoNotAutoRecordOnRender() {
  const bootstrap = fs.readFileSync(path.join(rootDir, "sigem_pw_dashboard_bootstrap.js"), "utf8");
  const dashboard = fs.readFileSync(path.join(rootDir, "src/react/sigem-pw/services/sigemPwDashboardAdapter.ts"), "utf8");
  assert.doesNotMatch(bootstrap, /sigem_pw_history_app\.js/,
    "a UI histórica antiga não deve registrar automaticamente durante a abertura");
  assert.doesNotMatch(bootstrap, /sigem_pw_history_runtime_fix\.js/,
    "o remendo da UI removida não deve ser carregado");
  assert.match(dashboard, /history\.recordActiveBases\(sigemBase, pwBase/);
  assert.match(dashboard, /management\.capturePayload\(system, candidate, sourceId/);
  assert.match(dashboard, /registerHistoryBeforeActivation/,
    "somente uma importação validada deve registrar o histórico antes da ativação");
})();

(function managerOpensFromMetadataWithoutFingerprintingTheActiveBase() {
  const runtime = fs.readFileSync(path.join(rootDir, "sigem_pw_history_runtime_fix.js"), "utf8");
  const managerStart = runtime.indexOf("async function renderManager()");
  const managerEnd = runtime.indexOf("async function openManager()", managerStart);
  const managerCode = runtime.slice(managerStart, managerEnd);
  assert.match(managerCode, /listSourceSnapshots\("sigem"\)/);
  assert.match(managerCode, /listSourceSnapshots\("pw"\)/);
  assert.match(managerCode, /currentSnapshotIdFromMetadata/);
  assert.doesNotMatch(managerCode, /contentFingerprint/,
    "abrir Gerenciar histórico não pode recalcular fingerprint");
  assert.match(runtime, /Base removida do histórico\./,
    "feedback de exclusão deve ser curto e transitório");
})();

(function bootstrapKeepsHistoryDataAndDefersOnlyTheUsefulAuditGuard() {
  const bootstrap = fs.readFileSync(path.join(rootDir, "sigem_pw_dashboard_bootstrap.js"), "utf8");
  const sw = fs.readFileSync(path.join(rootDir, "sw.js"), "utf8");
  assert.match(bootstrap, /sigem_pw_history_management\.js/);
  assert.match(bootstrap, /sigem_pw_dashboard_ui_audit\.js/);
  assert.doesNotMatch(bootstrap, /sigem_pw_history_runtime_fix\.js/);
  assert.doesNotMatch(bootstrap, /GrconSigemPwHistoryManagement\.activate/,
    "a tela gerencial removida não deve ser montada ao abrir o comparativo");
  assert.match(bootstrap, /GrconSigemPwUiAudit\?\.activate\?\.\(\)/);
  assert.doesNotMatch(bootstrap, /DuplicateBaseNoticeFilter/);
  assert.match(sw, /"sigem_pw_history_management\.js"/);
  assert.match(sw, /"sigem_pw_dashboard_ui_audit\.js"/);
  assert.doesNotMatch(sw, /"sigem_pw_history_runtime_fix\.js"/);
})();

console.log("sigem_pw_history_management: OK — exclusão seletiva, promoção segura, deduplicação silenciosa e UX responsiva validadas.");
