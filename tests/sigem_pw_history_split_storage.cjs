"use strict";
/**
 * SIGEM × PW — armazenamento do histórico de bases em índice + partes.
 *
 * Reproduz o defeito encontrado na medição com 30 mil documentos: o histórico era
 * UM valor IndexedDB com todas as versões; a 2ª importação grande excedia o limite
 * de serialização do navegador ("The serialized keys and/or value are too large") e
 * a importação falhava. O shim abaixo impõe um limite por valor para provar o
 * comportamento antes (formato legado) e depois (índice + partes).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const v8 = require("node:v8");
const vm = require("node:vm");

const MAX_VALUE_BYTES = 6 * 1024 * 1024; // limite de teste (o do Chromium é ~128 MB)
const stores = new Map();
function installIndexedDb() {
  const make = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  global.indexedDB = {
    open(name) {
      const request = {};
      queueMicrotask(() => {
        const data = make(name);
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore() {},
          close() {},
          transaction(_store, mode) {
            const tx = {};
            const pending = [];
            tx.objectStore = () => ({
              get(key) {
                const req = {};
                pending.push(() => { req.result = data.has(key) ? structuredClone(data.get(key)) : undefined; req.onsuccess && req.onsuccess(); });
                return req;
              },
              put(value, key) {
                if (v8.serialize(value).length > MAX_VALUE_BYTES) {
                  const error = new Error("The serialized keys and/or value are too large");
                  pending.push(() => { tx.error = error; tx.onabort && tx.onabort(); });
                  return;
                }
                pending.push(() => data.set(key, structuredClone(value)));
              },
              delete(key) { pending.push(() => data.delete(key)); },
            });
            queueMicrotask(() => setTimeout(() => {
              for (const step of pending) { step(); if (tx.error) return; }
              tx.oncomplete && tx.oncomplete();
            }, 0));
            return tx;
          },
        };
        request.result = db;
        request.onupgradeneeded && request.onupgradeneeded();
        request.onsuccess && request.onsuccess();
      });
      return request;
    },
  };
}
installIndexedDb();
global.GrconUtils = require("../grcon_utils.js");
const Core = require("../sigem_pw_dashboard_core.js");

const filler = "x".repeat(260);
function bigBase(kind, seed, rows) {
  const records = Array.from({ length: rows }, (_, i) => ({ document: `DOC-${seed}-${i}`, revision: "0", note: filler }));
  return {
    meta: { kind, fileName: `${kind}-${seed}.csv`, importedAt: new Date(2026, 0, seed).toISOString(), lastModified: seed, fileSize: rows },
    records,
    ...(kind === "pw" ? { sourceRecords: records.map((row) => ({ ...row, raw: 1 })) } : {}),
  };
}

(async () => {
  // 1. Três versões grandes cabem, mesmo que juntas excedam o limite de UM valor.
  const a = bigBase("pw", 1, 9000), b = bigBase("pw", 2, 9000), c = bigBase("sigem", 3, 9000);
  await Core.saveBase("pw", a);
  await Core.saveBase("pw", b);
  await Core.saveBase("sigem", c);
  const together = v8.serialize({ snapshots: [a, b, c] }).length;
  assert.ok(together > MAX_VALUE_BYTES, "o conjunto precisa exceder o limite de um único valor");

  // 2. Índice leve: sem registros, com contagens.
  const index = await Core.loadHistoryIndex();
  assert.equal(index.snapshots.length, 3);
  for (const entry of index.snapshots) {
    assert.equal(entry.indexOnly, true);
    assert.equal(entry.records.length, 0);
    assert.equal(entry.recordCount, 9000);
  }
  assert.equal(index.snapshots.find((e) => e.meta.kind === "pw").sourceRecordCount, 9000);
  assert.ok(v8.serialize(index).length < 20000, "o índice não pode carregar registros");

  // 3. Leitura completa (compatibilidade com backup/evolução) é idêntica à gravada.
  const full = await Core.loadHistory();
  assert.equal(full.snapshots.length, 3);
  const restoredA = full.snapshots.find((e) => e.meta.fileName === "pw-1.csv");
  assert.deepEqual(restoredA.records, a.records);
  assert.deepEqual(restoredA.sourceRecords, a.sourceRecords);
  const viaKv = await Core.kvGet(Core.HISTORY_KEY, null);
  assert.equal(viaKv.snapshots.length, 3, "kvGet(HISTORY_KEY) continua devolvendo o histórico completo");
  assert.equal(viaKv.snapshots[0].records.length, 9000);
  const single = await Core.loadHistorySnapshot(restoredA.meta.snapshotId);
  assert.deepEqual(single.records, a.records);

  // 4. Alterar a data NÃO regrava payloads (só o índice).
  const data = stores.get("grcon-posting-conference");
  const payloadKeys = () => [...data.keys()].filter((key) => key.includes("::p::")).sort();
  const before = payloadKeys();
  const pwId = restoredA.meta.snapshotId;
  await Core.updateSnapshotDate("pw", pwId, "2026-02-01T10:00:00.000Z");
  assert.deepEqual(payloadKeys(), before);
  assert.equal((await Core.loadHistoryIndex()).snapshots.find((e) => e.meta.snapshotId === pwId).meta.importedAt, "2026-02-01T10:00:00.000Z");

  // 5. Excluir remove os payloads e promove a substituta com registros completos.
  await Core.kvSet(Core.PW_BASE_KEY, await Core.loadHistorySnapshot(pwId));
  await Core.deleteSnapshot(pwId);
  assert.ok(payloadKeys().length < before.length, "payloads da versão excluída devem ser removidos");
  assert.ok(payloadKeys().every((key) => !key.includes(pwId)));
  const active = await Core.loadPwBase();
  assert.equal(active.meta.fileName, "pw-2.csv");
  assert.equal(active.records.length, 9000, "a base ativa substituta precisa dos registros, não só do índice");

  // 6. Reversão: restaurar o índice anterior remove a versão recém-gravada.
  const previous = await Core.loadHistoryIndex();
  await Core.saveBase("pw", bigBase("pw", 4, 9000));
  assert.equal((await Core.loadHistoryIndex()).snapshots.length, previous.snapshots.length + 1);
  await Core.kvSetMany([[Core.HISTORY_KEY, previous]]);
  const rolled = await Core.loadHistoryIndex();
  assert.deepEqual(rolled.snapshots.map((e) => e.meta.snapshotId).sort(), previous.snapshots.map((e) => e.meta.snapshotId).sort());
  assert.equal((await Core.loadHistory()).snapshots.length, previous.snapshots.length);

  // 7. Formato antigo (valor único) é lido e convertido sem perda.
  stores.get("grcon-posting-conference").clear();
  const legacy = bigBase("sigem", 9, 500);
  const legacyId = "legacy-1";
  data.set(Core.HISTORY_KEY, { version: 3, snapshots: [{ meta: { ...legacy.meta, snapshotId: legacyId }, records: legacy.records }], deletedIds: ["x"] });
  const migrated = await Core.loadHistoryIndex();
  assert.equal(migrated.snapshots.length, 1);
  assert.equal(migrated.snapshots[0].recordCount, 500);
  assert.deepEqual(migrated.deletedIds, ["x"]);
  assert.deepEqual((await Core.loadHistorySnapshot(legacyId)).records, legacy.records);
  assert.equal(data.get(Core.HISTORY_KEY).storage, "split-v1");

  // 8. O formato antigo falharia no mesmo cenário (prova do defeito).
  stores.get("grcon-posting-conference").clear();
  await assert.rejects(
    () => Core.kvSetMany([[`legacy-blob`, { snapshots: [a, b, c] }]]),
    /serialized keys and\/or value are too large|cancelada/,
  );

  // 9. Memoização de identidade documental: mesmo resultado, mesmo objeto.
  const first = Core.documentIdentity("C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-000123");
  const second = Core.documentIdentity("C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-000123");
  assert.equal(first, second);
  assert.equal(Core.documentIdentity("c1o-rnest-u32-3.1.1.1-ins-rir-pi-000123").key, first.key, "hífens/caixa equivalentes seguem a mesma chave");
  assert.equal(Core.canonicalDocumentCode(" x ").length, 1);
  assert.equal(Core.documentIdentity("").key, "");

  // 10. Worker: só calcula o que foi pedido; sem pedido, mantém o conjunto completo.
  let receive, response;
  const sandbox = { GrconSigemPwDashboard: Core, importScripts() {}, addEventListener(_t, fn) { receive = fn; }, postMessage(r) { response = r; } };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync("workers/sigem_pw_dashboard.worker.js", "utf8"), sandbox);
  const et = (i) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${String(i).padStart(6, "0")}`;
  const sig = [{ document: et(1), revision: "0", status: "Postado" }];
  const pw = [{ document: et(1), revision: "0", state: "Liberado", lastEmission: "Sim", company: "CSG" }];
  receive({ data: { type: "model", sigemRecords: sig, pwRecords: pw, ldRecords: [], generation: 1, aggregateKeys: ["all:all", "revision0:ET"] } });
  assert.deepEqual(Object.keys(response.aggregates).sort(), ["all", "all:all", "revision0:ET"].sort());
  receive({ data: { type: "model", sigemRecords: sig, pwRecords: pw, ldRecords: [], generation: 2 } });
  assert.equal(Object.keys(response.aggregates).length, 12, "sem aggregateKeys mantém todos os agregados (chamadores antigos)");
  assert.equal(typeof response.computeMs, "number");

  // 11. Contratos do adapter: sem auto-disparo e sem rebuild duplicado.
  const adapter = fs.readFileSync("src/react/sigem-pw/services/sigemPwDashboardAdapter.ts", "utf8");
  assert.match(adapter, /startsWith\("sigem-pw-dashboard"\)/, "eventos emitidos pelo próprio módulo não reiniciam a leitura das bases");
  assert.match(adapter, /!ownSigemImport/, "eventos da própria gravação da Consulta Geral são ignorados");
  assert.match(adapter, /lastModelSources = modelSourcesKey\(\)/, "fontes do modelo registradas ao reconstruir");
  assert.match(adapter, /loadHistoryIndex\(\)/, "o estado guarda só o índice do histórico");
  assert.doesNotMatch(adapter, /location\.reload|location\.href\s*=/, "importar bases jamais recarrega a página");
  assert.match(adapter, /Etapa 5 de|stage\(5, TOTAL/, "progresso por etapas reais na importação PW");
  assert.match(adapter, /Falha na etapa de/, "falha informa a etapa");
  assert.match(adapter, /GrconSigemPwPerf/, "tempos por etapa expostos para diagnóstico");

  console.log("sigem_pw_history_split_storage: índice+partes, compatibilidade, reversão, migração, memoização, worker sob demanda e contratos do adapter OK");
})().catch((error) => { console.error(error); process.exit(1); });
