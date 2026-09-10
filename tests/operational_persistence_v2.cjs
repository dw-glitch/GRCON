const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Persistence = require("../operational_persistence_v2.js");

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

check("mantém o banco operacional existente e sobe migração não destrutiva", () => {
  assert.equal(Persistence.DB_NAME, "grcon.operational.v2");
  assert.equal(Persistence.DB_VERSION, 2);
  assert.equal(Persistence.HISTORY_STORE, "history");
  assert.equal(Persistence.POSTING_STORE, "postings");
  assert.equal(Persistence.META_STORE, "meta");
  assert.equal(Persistence.QUARANTINE_STORE, "quarantine");
});

check("schema canônico mantém keyPaths inline coerentes", () => {
  assert.equal(Persistence.EXPECTED_SCHEMA.history.keyPath, "id");
  assert.equal(Persistence.EXPECTED_SCHEMA.postings.keyPath, "id");
  assert.equal(Persistence.EXPECTED_SCHEMA.meta.keyPath, "key");
  assert.equal(Persistence.EXPECTED_SCHEMA.quarantine.keyPath, "id");
});

check("merge por id é idempotente e preserva registros existentes", () => {
  const current = [{ id: "a", egrdtNumber: "A" }, { id: "b", egrdtNumber: "B" }];
  const incoming = [{ id: "b", egrdtNumber: "B2" }, { id: "c", egrdtNumber: "C" }];
  const once = Persistence.mergeById(current, incoming);
  const twice = Persistence.mergeById(once, incoming);
  assert.equal(once.length, 3);
  assert.equal(twice.length, 3);
  assert.equal(once.find((item) => item.id === "b").egrdtNumber, "B2");
  assert.ok(once.some((item) => item.id === "a"));
});

check("payload corrompido é preservado para quarentena, não tratado como lista vazia", () => {
  const raw = '[{"id":"x"}';
  const result = Persistence.safeParsePayload(raw, "Histórico");
  assert.equal(result.ok, false);
  assert.equal(result.raw, raw);
  assert.match(result.reason, /não pôde ser interpretado/i);
});

check("classifica falhas transitórias sem confundir quota e schema", () => {
  assert.equal(Persistence.isTransientStorageError({ name: "AbortError", message: "aborted" }), true);
  assert.equal(Persistence.isTransientStorageError({ name: "UnknownError", message: "temporary" }), true);
  assert.equal(Persistence.isTransientStorageError({ name: "QuotaExceededError", message: "quota" }), false);
  assert.equal(Persistence.isTransientStorageError({ name: "SchemaError", message: "keyPath" }), false);
});

check("código não transforma onblocked em rejeição imediata e possui retry real", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "operational_persistence_v2.js"), "utf8");
  assert.match(source, /request\.onblocked\s*=\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(source, /request\.onblocked\s*=\s*\(\)\s*=>\s*reject\(/);
  assert.match(source, /function\s+validateStorageWritable\s*\(/);
  assert.match(source, /function\s+retry\s*\(/);
  assert.doesNotMatch(source, /indexedDB\.deleteDatabase\s*\(/);
});

check("checksum é estável por ordem e detecta mudança operacional", () => {
  const a = { id: "a", egrdtNumber: "GR-1", generatedAt: "2026-09-01", files: [{}, {}] };
  const b = { id: "b", egrdtNumber: "GR-2", generatedAt: "2026-09-02", files: [{}] };
  assert.deepEqual(Persistence.checksumRecords([a, b]), Persistence.checksumRecords([b, a]));
  assert.notEqual(Persistence.checksumRecords([a, b]).hash, Persistence.checksumRecords([{ ...a, egrdtNumber: "GR-X" }, b]).hash);
});

console.log("operational_persistence_v2: 7 cenários OK");
