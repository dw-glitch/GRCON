const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Persistence = require("../operational_persistence_v2.js");

const rootDir = path.resolve(__dirname, "..");
const persistencePath = path.join(rootDir, "operational_persistence_v2.js");
const persistenceSource = fs.readFileSync(persistencePath, "utf8");

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function runtimeSourceFiles(dir) {
  const ignored = new Set([".git", "node_modules", "tests"]);
  const extensions = new Set([".js", ".css", ".html"]);
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) files.push(...runtimeSourceFiles(path.join(dir, entry.name)));
      continue;
    }
    if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(path.join(dir, entry.name));
  }
  return files;
}

check("mantém o banco operacional existente e a migração não destrutiva", () => {
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

check("onblocked continua aguardando sem rejeitar nem abrir superfície visual", () => {
  assert.match(persistenceSource, /request\.onblocked\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(persistenceSource, /request\.onblocked\s*=\s*\(\)\s*=>\s*reject\(/);
  assert.match(persistenceSource, /function\s+validateStorageWritable\s*\(/);
  assert.match(persistenceSource, /function\s+retry\s*\(/);
  assert.doesNotMatch(persistenceSource, /indexedDB\.deleteDatabase\s*\(/);
});

check("persistência não cria modal, overlay, botão de retry, toast nem alerta nativo", () => {
  const forbidden = [
    ["Dados locais", "preservados em modo seguro"].join(" "),
    ["O armazenamento local está", "temporariamente indisponível"].join(" "),
    ["Tentar", "novamente"].join(" "),
    ["grcon-persistence", "gate"].join("-"),
    ["grcon-persistence", "retry"].join("-"),
  ];
  forbidden.forEach((value) => assert.equal(persistenceSource.includes(value), false, `não pode existir UI residual: ${value}`));
  assert.doesNotMatch(persistenceSource, /\.createElement\s*\(/);
  assert.doesNotMatch(persistenceSource, /\bGrconNotify\b/);
  assert.doesNotMatch(persistenceSource, /\b(?:alert|confirm)\s*\(/);
});

check("recuperação automática é limitada e não cria loop infinito", () => {
  assert.match(persistenceSource, /MAX_AUTO_RECOVERY_ATTEMPTS\s*=\s*RETRY_DELAYS\.length/);
  assert.match(persistenceSource, /state\.retryAttempt\s*>=\s*MAX_AUTO_RECOVERY_ATTEMPTS/);
  assert.match(persistenceSource, /const\s+delay\s*=\s*RETRY_DELAYS\[state\.retryAttempt\]/);
  assert.doesNotMatch(persistenceSource, /Math\.min\(state\.retryAttempt,\s*RETRY_DELAYS\.length\s*-\s*1\)/);
});

check("fluxo crítico de Analisar não depende do estado da persistência", () => {
  const guard = fs.readFileSync(path.join(rootDir, "analysis_runtime_guard.js"), "utf8");
  assert.doesNotMatch(guard, /GrconOperationalPersistence|grcon:persistence|writeBlocked/);
  assert.match(guard, /ANALYZE_IDS/);
});

check("busca global de runtime não encontra mais o aviso nem sua infraestrutura visual", () => {
  const forbidden = [
    ["Dados locais", "preservados em modo seguro"].join(" "),
    ["O armazenamento local está", "temporariamente indisponível"].join(" "),
    ["grcon-persistence", "gate"].join("-"),
    ["grcon-persistence", "retry"].join("-"),
  ];
  const matches = [];
  for (const file of runtimeSourceFiles(rootDir)) {
    const source = fs.readFileSync(file, "utf8");
    forbidden.forEach((needle) => {
      if (source.includes(needle)) matches.push(`${path.relative(rootDir, file)}: ${needle}`);
    });
  }
  assert.deepEqual(matches, []);
});

check("checksum é estável por ordem e detecta mudança operacional", () => {
  const a = { id: "a", egrdtNumber: "GR-1", generatedAt: "2026-09-01", files: [{}, {}] };
  const b = { id: "b", egrdtNumber: "GR-2", generatedAt: "2026-09-02", files: [{}] };
  assert.deepEqual(Persistence.checksumRecords([a, b]), Persistence.checksumRecords([b, a]));
  assert.notEqual(Persistence.checksumRecords([a, b]).hash, Persistence.checksumRecords([{ ...a, egrdtNumber: "GR-X" }, b]).hash);
});

console.log("operational_persistence_v2: 11 cenários OK");
