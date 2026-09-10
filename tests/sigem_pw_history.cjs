const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const rootDir = path.resolve(__dirname, "..");
const Dashboard = require(path.join(rootDir, "sigem_pw_dashboard_core.js"));
const Revision = require(path.join(rootDir, "sigem_pw_revision_core.js"));
const History = require(path.join(rootDir, "sigem_pw_history_core.js"));

function et(tag, revision, status, extra = {}) {
  const document = `ABC_RNEST_U32_1.1.1.1_REP_${tag}_000`;
  return { document, revision, status, sourceRow: Number(extra.sourceRow || 1), ...extra };
}
function pw(tag, revision, state, lastEmission, extra = {}) {
  const document = `ABC_RNEST_U32_1.1.1.1_REP_${tag}_000`;
  return { document, revision, revisionComplete: revision, state, lastEmission, sourceRow: Number(extra.sourceRow || 1), ...extra };
}
function sigemBase(records, fileName = "Consulta Geral.xlsx", importedAt = "2026-09-10T08:30:00.000Z") {
  return { meta: { fileName, importedAt, recordCount: records.length, sourceRowCount: records.length }, records };
}
function pwBase(records, fileName = "PW.csv", importedAt = "2026-09-10T08:35:00.000Z") {
  return { meta: { fileName, importedAt, recordCount: records.length, sourceRowCount: records.length }, records };
}

(function fingerprintsUseContent() {
  const recordsA = [et("TAG001", "A", "Em análise"), et("TAG002", "0", "Aprovado")];
  const recordsB = [...recordsA].reverse();
  assert.equal(History.contentFingerprint("sigem", recordsA), History.contentFingerprint("sigem", recordsB), "ordem e nome de arquivo não devem inflar o histórico");
  const changed = [et("TAG001", "B", "Em análise"), et("TAG002", "0", "Aprovado")];
  assert.notEqual(History.contentFingerprint("sigem", recordsA), History.contentFingerprint("sigem", changed), "mudança relevante de conteúdo deve criar novo fingerprint");
})();

(function sourceSnapshotUsesCanonicalScope() {
  const sigem = sigemBase([et("TAG001", "A", "Em análise"), { document: "codigo-fora-do-escopo", revision: "A", status: "X" }]);
  const model = Dashboard.createModel(sigem.records, []);
  const built = History.buildSourceSnapshot("sigem", sigem, model, { recordedAt: "2026-09-10T09:00:00.000Z" });
  assert.equal(built.snapshot.metrics.comparableDocuments, 1, "fora do escopo não pode inflar total histórico comparável");
  assert.equal(built.snapshot.metrics.classes.ET, 1);
  assert.equal(built.documents.length, 1, "working set deve guardar somente documentos mínimos comparáveis");
  assert.equal(built.snapshot.calculationVersion, History.CALCULATION_VERSION);
})();

(function comparisonUsesExistingRevisionEngine() {
  const sigemRecords = [
    et("ALIGNED", "A", "Aprovado"),
    et("PREVIOUS", "B", "Aprovado"),
    et("MISSING", "A", "Aprovado"),
    et("WAITING", "A", "Aprovado"),
  ];
  const pwRecords = [
    pw("ALIGNED", "A", "Approved", "Sim"),
    pw("PREVIOUS", "A", "Approved", "Sim"),
    pw("WAITING", "A", "Draft", "Previsto"),
    pw("PWONLY", "A", "Approved", "Sim"),
  ];
  const model = Dashboard.createModel(sigemRecords, pwRecords);
  const revision = Revision.analyze(model);
  const sigemSnapshot = History.buildSourceSnapshot("sigem", sigemBase(sigemRecords), model).snapshot;
  const pwSnapshot = History.buildSourceSnapshot("pw", pwBase(pwRecords), model).snapshot;
  const comparison = History.buildComparisonSnapshot(sigemSnapshot, pwSnapshot, model, revision, { recordedAt: "2026-09-10T10:00:00.000Z" });
  const m = comparison.snapshot.metrics;
  assert.equal(m.sigem, 4);
  assert.equal(m.pwRegistered, 4);
  assert.equal(m.matched, 3);
  assert.equal(m.exclusiveSigem, 1);
  assert.equal(m.exclusivePw, 1);
  assert.equal(m.aligned, 1, "mesma revisão emitida deve estar alinhada");
  assert.equal(m.postPw, 2, "revisão anterior + não localizado devem compor Postar no PW");
  assert.equal(m.awaitingEmission, 1, "revisão correta cadastrada sem emissão deve ficar separada");
  assert.equal(m.postSigem, 1, "exclusivo PW deve compor Postar no SIGEM");
  assert.equal(m.pwPrevious, 1);
  assert.equal(m.notFoundPw, 1);
  assert.equal(m.correctRegisteredNotEmitted, 1);
})();

(function identityTransitionsDetectResolvedAndNewPending() {
  const previous = [
    { key: "A", document: "A", documentClass: "ET", state: "post-pw", sigemRevision: "B", pwRevision: "A" },
    { key: "B", document: "B", documentClass: "ET", state: "aligned", sigemRevision: "A", pwRevision: "A" },
  ];
  const current = [
    { key: "A", document: "A", documentClass: "ET", state: "aligned", sigemRevision: "B", pwRevision: "B" },
    { key: "B", document: "B", documentClass: "ET", state: "post-pw", sigemRevision: "B", pwRevision: "A" },
  ];
  const delta = History.compareComparisonDocuments(previous, current);
  assert.equal(delta.resolved, 1, "pendência deve ser resolvida por transição documental, não por subtração de total");
  assert.equal(delta.newPending, 1, "nova revisão que quebra alinhamento deve aparecer como nova pendência");
  assert.equal(delta.becameAligned, 1);
  assert.equal(delta.changedRevision, 2);
  const details = History.transitionDetails(previous, current, delta);
  assert.equal(details.resolved[0].before.state, "post-pw");
  assert.equal(details.resolved[0].after.state, "aligned");
  assert.equal(details.newPending[0].before.state, "aligned");
  assert.equal(details.newPending[0].after.state, "post-pw");
})();

(function sourceTransitionsAreLinearAndAuditable() {
  const before = [
    { key: "A", revision: "A", status: "X" },
    { key: "B", revision: "A", status: "X" },
  ];
  const after = [
    { key: "A", revision: "B", status: "Y" },
    { key: "C", revision: "A", status: "X" },
  ];
  const result = History.compareSourceDocuments(before, after);
  assert.deepEqual({ entered: result.entered, exited: result.exited, remained: result.remained, changedRevision: result.changedRevision, changedStatus: result.changedStatus }, { entered: 1, exited: 1, remained: 1, changedRevision: 1, changedStatus: 1 });
  const details = History.sourceChangeDetails(before, after, result);
  assert.equal(details.entered[0].after.key, "C");
  assert.equal(details.exited[0].before.key, "B");
})();

(function hundredSnapshotsAndLargeDeltaStayResponsive() {
  const size = 20000;
  const previous = Array.from({ length: size }, (_, index) => ({ key: `DOC-${index}`, state: index % 5 ? "aligned" : "post-pw", sigemRevision: "A", pwRevision: index % 5 ? "A" : "0" }));
  const current = previous.map((row, index) => ({ ...row, state: index % 10 === 0 ? "aligned" : row.state, pwRevision: index % 10 === 0 ? "A" : row.pwRevision }));
  const start = performance.now();
  const result = History.compareComparisonDocuments(previous, current);
  const durationMs = performance.now() - start;
  assert.ok(durationMs < 1500, `comparação O(n) de ${size} documentos demorou ${durationMs.toFixed(1)} ms`);
  assert.ok(result.resolved > 0);
  const snapshots = Array.from({ length: 100 }, (_, index) => ({ id: `S${index}`, importedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(), metrics: { sigem: 15000 + index, pwRegistered: 14000 + index, pwEmitted: 11000 + index } }));
  assert.equal(snapshots.length, 100, "cenário de meses de uso deve suportar ao menos 100 pontos agregados");
  console.log(`sigem_pw_history perf: 20k docs=${durationMs.toFixed(1)}ms snapshots=${snapshots.length}`);
})();

(function storageAndUiContractsStaySafe() {
  const coreSource = fs.readFileSync(path.join(rootDir, "sigem_pw_history_core.js"), "utf8");
  const appSource = fs.readFileSync(path.join(rootDir, "sigem_pw_history_app.js"), "utf8");
  const bootstrap = fs.readFileSync(path.join(rootDir, "sigem_pw_dashboard_bootstrap.js"), "utf8");
  const storageBootstrap = fs.readFileSync(path.join(rootDir, "grcon_bootstrap_head.js"), "utf8");
  const sw = fs.readFileSync(path.join(rootDir, "sw.js"), "utf8");
  assert.match(coreSource, /DB_NAME = "grcon-sigem-pw-history"/);
  assert.match(coreSource, /createObjectStore\(STORES\.sourceSnapshots, \{ keyPath: "id" \}\)/);
  assert.match(coreSource, /createObjectStore\(STORES\.comparisonSnapshots, \{ keyPath: "id" \}\)/);
  assert.match(coreSource, /createObjectStore\(STORES\.workingSets, \{ keyPath: "key" \}\)/);
  assert.match(coreSource, /createObjectStore\(STORES\.snapshotChanges, \{ keyPath: "snapshotId" \}\)/);
  assert.doesNotMatch(coreSource, /snapshotDocuments/, "histórico não deve acumular um registro por documento por snapshot");
  assert.doesNotMatch(coreSource, /localStorage/, "histórico grande não pode usar localStorage");
  assert.doesNotMatch(coreSource, /\.put\(\s*value\s*,\s*key\s*\)/, "stores inline não podem usar put(value, key)");
  assert.match(appSource, /Visão geral/);
  assert.match(appSource, /Pendências/);
  assert.match(appSource, /Revisões/);
  assert.match(appSource, /Evolução/);
  assert.match(appSource, /Últimos 7 dias/);
  assert.match(appSource, /Últimos 90 dias/);
  assert.match(appSource, /Ainda não há atualizações suficientes/);
  assert.match(appSource, /É necessário ter uma base válida do SIGEM e uma do PW/);
  assert.match(appSource, /loadSnapshotChanges\(snapshot\.id\)/, "detalhes auditáveis devem ser lazy");
  assert.match(appSource, /O gráfico funciona mesmo enquanto somente uma das bases possui histórico/);
  assert.match(appSource, /Esta base já foi registrada anteriormente/);
  assert.match(appSource, /bookType: "xlsx"/, "exportação deve gerar Excel real");
  assert.doesNotMatch(appSource, /location\.reload\s*\(/);
  assert.match(bootstrap, /sigem_pw_history_core\.js/);
  assert.match(bootstrap, /sigem_pw_history_app\.js/);
  assert.match(storageBootstrap, /operational_persistence_v2\.js/);
  assert.match(sw, /grcon-v5\.40\.10-spw5-storage-v2/);
  assert.match(sw, /"operational_persistence_v2\.js"/);
  assert.match(sw, /"sigem_pw_history_core\.js"/);
  assert.match(sw, /"sigem_pw_history_app\.js"/);
})();

console.log("sigem_pw_history: OK — snapshots, compactação, deduplicação, deltas documentais, escopo e UX validados.");
