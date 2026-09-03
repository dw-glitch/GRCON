const assert = require("node:assert/strict");
const Backup = require("../grcon_backup.js");

function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function sample() {
  const payload = {
    schema: Backup.BACKUP_SCHEMA,
    backupVersion: Backup.BACKUP_VERSION,
    grconVersion: "5.40.0",
    exportedAt: "2026-09-03T12:00:00.000Z",
    reason: "test",
    data: {
      history: [{ id: "h1", egrdtNumber: "GR-1" }, { id: "h2", egrdtNumber: "GR-2" }],
      postings: [{ id: "p1", egrdtNumber: "GR-1" }],
      conference: { base: { records: [{ id: "c1" }] }, state: { items: { x: {}, y: {} } }, audit: [], preferences: { waitHours: 48 } },
      analysisHistory: { schema: "grcon.analysis.history.backup.v1", sessions: [{ id: "s1" }], documents: [{ id: "d1" }, { id: "d2" }] },
      preferences: {
        "quality-theme-grcon": "dark",
        "grcon.cloud.auth.v1": "NAO PODE ENTRAR",
      },
    },
  };
  payload.integrity = Backup.integrityFor(payload);
  return payload;
}

check("backup válido passa integridade e versão", () => {
  const payload = sample();
  assert.deepEqual(Backup.validateBackup(payload), { valid: true, errors: [] });
});

check("alteração posterior invalida hash do backup", () => {
  const payload = sample();
  payload.data.history[0].egrdtNumber = "ALTERADO";
  const validation = Backup.validateBackup(payload);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => /integridade/i.test(error)));
});

check("backup de outra versão é rejeitado", () => {
  const payload = sample();
  payload.backupVersion = 99;
  payload.integrity = Backup.integrityFor(payload);
  const validation = Backup.validateBackup(payload);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => /versão/i.test(error)));
});

check("resumo conta categorias sem inventar dados", () => {
  const summary = Backup.summarizeBackup(sample());
  assert.equal(summary.history, 2);
  assert.equal(summary.postings, 1);
  assert.equal(summary.conferenceRecords, 1);
  assert.equal(summary.conferenceConfirmations, 2);
  assert.equal(summary.analysisSessions, 1);
  assert.equal(summary.analysisDocuments, 2);
});

check("preferências sensíveis nunca entram na allowlist", () => {
  const safe = Backup.safePreferences(sample().data.preferences);
  assert.equal(safe["quality-theme-grcon"], "dark");
  assert.equal(safe["grcon.cloud.auth.v1"], undefined);
  assert.ok(!Backup.SAFE_LOCAL_KEYS.includes("grcon.cloud.auth.v1"));
});

check("nome do arquivo usa extensão e timestamp controlados", () => {
  assert.equal(Backup.backupFileName(new Date(2026, 8, 3, 12, 7)), "GRCON_Backup_20260903_1207.grconbackup");
});

check("estrutura incompatível é rejeitada antes de restauração", () => {
  const payload = sample();
  payload.data.history = {};
  payload.integrity = Backup.integrityFor(payload);
  const validation = Backup.validateBackup(payload);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => /Histórico/i.test(error)));
});

console.log("grcon_backup: 7 cenários OK");
