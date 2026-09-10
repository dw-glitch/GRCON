const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Core = require(path.join(__dirname, "..", "sigem_pw_dashboard_core.js"));

function createFakeIndexedDb(keyPath) {
  const data = new Map();
  const store = {
    keyPath,
    get(key) {
      const request = {};
      queueMicrotask(() => {
        request.result = data.get(key);
        if (typeof request.onsuccess === "function") request.onsuccess();
      });
      return request;
    },
    put(value, key) {
      if (keyPath !== null && keyPath !== undefined && arguments.length > 1) {
        const error = new Error("The object store uses in-line keys and the key parameter was provided.");
        error.name = "DataError";
        throw error;
      }
      let resolvedKey = key;
      if (keyPath !== null && keyPath !== undefined) {
        if (keyPath !== "key") throw new Error(`Unsupported fake keyPath: ${keyPath}`);
        resolvedKey = value && value.key;
      }
      if (resolvedKey === undefined || resolvedKey === null || resolvedKey === "") {
        const error = new Error("A key could not be derived for this object store.");
        error.name = "DataError";
        throw error;
      }
      data.set(resolvedKey, value);
      return {};
    },
  };
  const db = {
    objectStoreNames: { contains: (name) => name === "kv" },
    createObjectStore() { throw new Error("createObjectStore should not be called for an existing fake DB"); },
    transaction() {
      const tx = {
        error: null,
        objectStore: () => store,
        abort() {
          this.error = this.error || new Error("aborted");
          queueMicrotask(() => { if (typeof this.onabort === "function") this.onabort(); });
        },
      };
      queueMicrotask(() => { if (!tx.error && typeof tx.oncomplete === "function") tx.oncomplete(); });
      return tx;
    },
    close() {},
  };
  return {
    data,
    indexedDB: {
      open() {
        const request = { result: db, error: null };
        queueMicrotask(() => { if (typeof request.onsuccess === "function") request.onsuccess(); });
        return request;
      },
    },
  };
}

(async () => {
  const sigemEt = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-PI-321530";
  const pwEt = "C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-321530";
  assert.strictEqual(Core.documentIdentity(sigemEt).key, Core.documentIdentity(pwEt).key, "RNEST + nt- devem convergir para a mesma identidade");
  assert.notStrictEqual(
    Core.documentIdentity("C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-321530").key,
    Core.documentIdentity("C1O_RNEST_U32_3.1.1.2_INS_RIR_PI-321530").key,
    "EAP diferente deve permanecer documento diferente"
  );
  assert.strictEqual(Core.documentClass("CE-5290.00-22313-856-C1O-001"), "N-1710");
  assert.strictEqual(Core.documentClass(pwEt), "ET");
  assert.deepStrictEqual(Core.DOCUMENT_CLASSES, ["ET", "N-1710", "CV"]);

  const csv = [
    "NumeroDocumentoCliente;RevisaoCompleta;Revisao;TipoDocumento;TipoDocumentoDesc;Disciplina;DisciplinaDesc;o_statename;Última emissão;NumeroGRDEntrada;NumeroGRDEnvioCliente",
    "CE-5290.00-22313-856-C1O-001;0;0;CE;Certificado;DOC;Documentação;Superado;Não;GRD-001;",
    "CE-5290.00-22313-856-C1O-001;A;A;CE;Certificado;DOC;Documentação;Liberado para Construcao;Sim;GRD-002;",
    "DE-5290.00-22313-856-C1O-002;0;0;DE;Desenho;PRJ;Projeto;;;Previsto;;",
    "PR-5290.00-22313-856-C1O-003;0;0;PR;Procedimento;QUA;Qualidade;Superado;Não;GRD-003;",
    ";0;0;PR;Procedimento;QUA;Qualidade;;Previsto;;",
  ].join("\n");
  const parsed = Core.parsePwCsv(csv, { fileName: "pw.csv", importedAt: "2026-09-10T12:00:00Z" });
  assert.strictEqual(parsed.meta.sourceRowCount, 5);
  assert.strictEqual(parsed.meta.recordCount, 4);
  assert.strictEqual(parsed.meta.invalidCount, 1);
  assert.strictEqual(parsed.meta.uniqueDocumentCount, 3);
  assert.strictEqual(parsed.meta.emittedDocumentCount, 2, "Sim e Não são evidências de emissão; Previsto não é");

  const sigem = [
    { document: "CE-5290.00-22313-856-C1O-001", revision: "A", status: "Sem Comentários", sourceRow: 10 },
    { document: "DE-5290.00-22313-856-C1O-002", revision: "0", status: "Em Análise", sourceRow: 11 },
    { document: "MC-5290.00-22313-856-C1O-999", revision: "0", status: "Não Postado", sourceRow: 12 },
  ];
  const model = Core.createModel(sigem, parsed.records);
  const result = Core.aggregateModel(model, {});
  assert.deepStrictEqual(result.summary, {
    sigem: 3,
    pwRegistered: 3,
    pwEmitted: 2,
    gapSigemToPw: 1,
    gapPwToEmitted: 1,
    pwExclusive: 1,
    matched: 2,
  });
  assert.ok(result.summary.pwEmitted <= result.summary.pwRegistered);
  assert.deepStrictEqual(result.classes.map((row) => row.documentClass), ["N-1710"]);
  assert.strictEqual(result.classes.find((row) => row.documentClass === "N-1710").gapSigemToPw, 1);
  assert.strictEqual(Core.aggregateModel(model, { emission: "not-emitted" }).summary.pwRegistered, 1);
  assert.throws(() => Core.parsePwCsv("NumeroDocumentoCliente;Revisao\nABC;0"), /campo\(s\) obrigatório\(s\)/i);

  const inline = createFakeIndexedDb("key");
  global.indexedDB = inline.indexedDB;
  const sigemBase = { meta: { fileName: "consulta.xlsx" }, records: [{ document: "SIGEM-1" }] };
  const pwBaseV1 = { meta: { fileName: "pw-1.csv" }, records: [{ document: "PW-1" }] };
  const pwBaseV2 = { meta: { fileName: "pw-2.csv" }, records: [{ document: "PW-2" }] };
  await Core.kvSet(Core.SIGEM_BASE_KEY, sigemBase);
  await Core.savePwBase(pwBaseV1);
  await Core.savePwBase(pwBaseV2);
  assert.deepStrictEqual(await Core.loadSigemBase(), sigemBase, "SIGEM deve permanecer intacto ao substituir PW");
  assert.deepStrictEqual(await Core.loadPwBase(), pwBaseV2, "PW deve persistir e ser substituído atomicamente");
  assert.deepStrictEqual(inline.data.get(Core.PW_BASE_KEY), { key: Core.PW_BASE_KEY, value: pwBaseV2 }, "store inline deve persistir { key, value }");

  const outline = createFakeIndexedDb(null);
  global.indexedDB = outline.indexedDB;
  await Core.kvSet(Core.SIGEM_BASE_KEY, sigemBase);
  await Core.savePwBase(pwBaseV1);
  assert.deepStrictEqual(await Core.loadSigemBase(), sigemBase);
  assert.deepStrictEqual(await Core.loadPwBase(), pwBaseV1);
  assert.deepStrictEqual(outline.data.get(Core.PW_BASE_KEY), pwBaseV1, "store out-of-line antiga deve continuar legível");

  const incompatible = createFakeIndexedDb("id");
  global.indexedDB = incompatible.indexedDB;
  await assert.rejects(() => Core.savePwBase(pwBaseV1), /base anterior foi preservada/i, "erro de persistência deve ser amigável na interface");

  delete global.indexedDB;

  const appSource = fs.readFileSync(path.join(__dirname, "..", "sigem_pw_dashboard_app.js"), "utf8");
  assert.ok(!/MutationObserver/.test(appSource), "Dashboard não deve usar MutationObserver global");
  assert.ok(!/location\.reload\s*\(/.test(appSource), "Dashboard não deve recarregar a página");
  assert.ok(/workers\/sigem_pw_dashboard\.worker\.js/.test(appSource), "CSV PW deve usar Worker quando disponível");

  console.log("sigem_pw_dashboard: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
