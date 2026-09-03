const assert = require("node:assert/strict");
const Persistence = require("../operational_persistence.js");

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

check("merge por id é idempotente e preserva registros antigos", () => {
  const current = [
    { id: "a", egrdtNumber: "A", generatedAt: "2026-09-01T10:00:00Z" },
    { id: "b", egrdtNumber: "B", generatedAt: "2026-09-02T10:00:00Z" },
  ];
  const incoming = [
    { id: "b", egrdtNumber: "B2", generatedAt: "2026-09-02T10:00:00Z" },
    { id: "c", egrdtNumber: "C", generatedAt: "2026-09-03T10:00:00Z" },
  ];
  const once = Persistence.mergeById(current, incoming);
  const twice = Persistence.mergeById(once, incoming);
  assert.equal(once.length, 3);
  assert.equal(twice.length, 3);
  assert.equal(once.find((item) => item.id === "b").egrdtNumber, "B2");
  assert.ok(once.some((item) => item.id === "a"));
});

check("checksum independe da ordem e detecta mudança relevante", () => {
  const a = { id: "a", egrdtNumber: "GR-1", generatedAt: "2026-09-01", files: [{}, {}] };
  const b = { id: "b", egrdtNumber: "GR-2", generatedAt: "2026-09-02", files: [{}] };
  assert.deepEqual(Persistence.checksumRecords([a, b]), Persistence.checksumRecords([b, a]));
  assert.notEqual(Persistence.checksumRecords([a, b]).hash, Persistence.checksumRecords([{ ...a, egrdtNumber: "GR-X" }, b]).hash);
});

check("payload legado válido é reconhecido sem alteração", () => {
  const raw = JSON.stringify([{ id: "x" }]);
  const result = Persistence.safeParsePayload(raw, "Histórico");
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 1);
  assert.equal(result.raw, raw);
});

check("payload legado corrompido não vira lista vazia silenciosa", () => {
  const raw = '[{"id":"x"}';
  const result = Persistence.safeParsePayload(raw, "Histórico");
  assert.equal(result.ok, false);
  assert.equal(result.raw, raw);
  assert.match(result.reason, /não pôde ser interpretado/i);
});

check("payload legado com tipo inesperado é rejeitado para quarentena", () => {
  const result = Persistence.safeParsePayload('{"id":"x"}', "SIGEM");
  assert.equal(result.ok, false);
  assert.match(result.reason, /formato de lista/i);
});

check("módulo declara stores separados para Histórico, SIGEM e quarentena", () => {
  assert.equal(Persistence.HISTORY_STORE, "history");
  assert.equal(Persistence.POSTING_STORE, "postings");
  assert.equal(Persistence.QUARANTINE_STORE, "quarantine");
  assert.ok(Persistence.DB_VERSION >= 1);
});

console.log("operational_persistence: 6 cenários OK");
