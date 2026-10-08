const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = fs.existsSync(path.join(__dirname, "sigem_pw_dashboard_core.js")) ? __dirname : path.join(__dirname, "..");
const Core = require(path.join(rootDir, "sigem_pw_dashboard_core.js"));

const sigemEt = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-PI-321530";
const pwEt = "C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-321530";
assert.strictEqual(Core.documentIdentity(sigemEt).key, Core.documentIdentity(pwEt).key, "ET com/sem nt- deve convergir");
assert.notStrictEqual(Core.documentIdentity("C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-321530").key, Core.documentIdentity("C1O_RNEST_U32_3.1.1.2_INS_RIR_PI-321530").key, "EAP diferente deve permanecer separado");
assert.strictEqual(Core.documentClass("CE-5290.00-22313-856-C1O-001"), "N-1710");
assert.strictEqual(Core.documentClass("I-RL-5290.00-22313-ABC-C1O-1234"), "N-1710", "prefixo de idioma e sequencial de quatro dígitos são válidos");
assert.strictEqual(Core.documentClass("RL-5290.00-22314-ABC-C1O-001"), Core.UNCLASSIFIED, "área diferente de 22313 deve ser recusada");
assert.strictEqual(Core.documentClass("RL-5290.00-22313-ABC-XYZ-001"), Core.UNCLASSIFIED, "origem diferente de C1O deve ser recusada");
assert.strictEqual(Core.documentClass("RL-5290.00-22313-ABC-C1O-X01"), Core.UNCLASSIFIED, "sequencial N-1710 deve ser numérico");
assert.strictEqual(Core.documentClass(pwEt), "ET");
assert.strictEqual(Core.documentClass("C10_RNEST_U32_3.1.1.1_INS_RIR_PI-1"), Core.UNCLASSIFIED, "C10 não deve ser aceito como C1O");
assert.strictEqual(Core.documentClass("5900.00.0001.0100-ABC-CV-C1O-001"), Core.UNCLASSIFIED, "CV está fora do escopo desta fase");
assert.deepStrictEqual(Core.SCOPE_CLASSES, ["ET", "N-1710"]);
assert.notStrictEqual(Core.entryKey("DOC", "0"), Core.entryKey("DOC", "A"), "revisões 0 e A contam separadamente");

const ld = Core.parseLdMatrix([
  ["", "LISTA"],
  ["ITEM", "DOCUMENTO", "REVISÃO", "TÍTULO"],
  ["1", "CE-5290.00-22313-856-C1O-001", "A", "Certificado"],
  ["2", "PR-5290.00-22313-122-C1O-003", "0", "Procedimento"],
], { fileName: "LD.xlsx", importedAt: "2026-09-13T10:00:00Z" });
assert.strictEqual(ld.meta.uniqueDocumentCount, 2);

for (const header of ["DOCUMENTO \r\nN-1710 ", "DOCUMENTO N-1710"]) {
  const commissioning = Core.parseLdMatrix([
    ["ITEM", header, "REVISÃO", "TÍTULO"],
    ["1", "PR-5290.00-22313-122-C1O-003", "0", "Procedimento"],
    ["2", "PR-5290.00-22313-122-C1O-003", "A", "Procedimento"],
    ["3", "PR-5290.00-22314-122-C1O-003", "0", "Outra área"],
  ], { fileName: "LD-comissionamento.xlsx", sheetName: "N-1710" });
  assert.equal(commissioning.records.length, 1, "LD deduplica documentos e preserva o escopo");
  assert.equal(commissioning.records[0].revision, "0");
  assert.equal(commissioning.meta.headerRow, 1);
}
assert.throws(() => Core.parseLdMatrix([
  ["DOCUMENTO", "DOCUMENTO N-1710", "REVISÃO"],
]), /mais de uma coluna DOCUMENTO/);
assert.throws(() => Core.parseLdMatrix([
  ["DOCUMENTO N-2064", "REVISÃO"],
]), /cabeçalho DOCUMENTO não localizado/);

(function qualityLdWorkerUsesTheSameParserAndIgnoresAuxiliarySheets() {
  const vm = require("node:vm"), XLSX = require("../xlsx.full.min.js");
  let receive, response;
  const sandbox = {
    GrconSigemPwDashboard: Core,
    addEventListener(type, handler) { if (type === "message") receive = handler; },
    postMessage(value) { response = JSON.parse(JSON.stringify(value)); },
    importScripts(file) { if (file.endsWith("xlsx.full.min.js")) sandbox.XLSX = XLSX; },
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, "workers/sigem_pw_dashboard.worker.js"), "utf8"), sandbox);
  const matrix = [["ITEM", "DOCUMENTO \r\nN-1710", "REVISÃO"], ["1", "PR-5290.00-22313-122-C1O-003", "0"]];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), "N-1710");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["DOCUMENTO"], ["CE-5290.00-22313-856-C1O-001"]]), "Colar SIGEM");
  const meta = { fileName: "LD.xlsx", importedAt: "2026-10-08T00:00:00Z" };
  receive({ data: { type: "quality-ld", buffer: XLSX.write(book, { type: "array", bookType: "xlsx" }), meta } });
  assert.equal(response.ok, true);
  assert.deepEqual(response.parsed, Core.parseLdMatrix(matrix, { ...meta, sheetName: "N-1710" }));
  const invalid = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(invalid, XLSX.utils.aoa_to_sheet(matrix), "Outra aba");
  receive({ data: { type: "quality-ld", buffer: XLSX.write(invalid, { type: "array", bookType: "xlsx" }), meta } });
  assert.equal(response.ok, false);
  assert.match(response.error, /aba N-1710 não foi localizada/);
})();

const csv = [
  "NumeroDocumentoCliente;RevisaoCompleta;Revisao;TipoDocumento;TipoDocumentoDesc;Disciplina;DisciplinaDesc;o_statename;Última emissão;datacriacao",
  "CE-5290.00-22313-856-C1O-001;0;0;CE;Certificado;QUA;Qualidade;Superado;Não;01/09/2026",
  "CE-5290.00-22313-856-C1O-001;A;A;CE;Certificado;QUA;Qualidade;Em Analise;Previsto;02/09/2026",
  "DE-5290.00-22313-999-C1O-999;0;0;DE;Desenho;PRJ;Projeto;Superado;Sim;03/09/2026",
  `${pwEt};0;0;RIR;Relatório;INS;Instrumentação;Liberado;Sim;04/09/2026`,
].join("\n");
const parsed = Core.parsePwCsv(csv, { fileName: "pw.csv", importedAt: "2026-09-13T10:00:00Z" });
assert.strictEqual(parsed.meta.recordCount, 4, "parser preserva a base; escopo LD é aplicado no modelo");
const sanitized = Core.sanitizePwBase(parsed, { meta: { fileName: "LD.xlsx", importedAt: "2026-09-13T10:00:00Z" }, records: ld.records });
assert.strictEqual(sanitized.records.length, 3, "persistência PW aceita apenas ET e N-1710 presente na LD");
assert.strictEqual(sanitized.meta.validRevisionRecordCount, 3, "revisões 0 e A do mesmo documento contam como duas entradas");
assert.deepStrictEqual(sanitized.records.filter((row) => row.document.includes("856-C1O-001")).map((row) => row.revision), ["0", "A"], "cada revisão permanece como linha própria");
assert.ok(!sanitized.records.some((row) => row.document.includes("999-C1O-999")), "N-1710 ausente da LD não alcança a base persistível");
assert.ok(!Object.hasOwn(sanitized, "discardedRecords"), "documentos ignorados não devem ser materializados para exibição");

const sigem = [
  { document: "CE-5290.00-22313-856-C1O-001", revision: "0", status: "Sem Comentários", sourceRow: 10 },
  { document: "CE-5290.00-22313-856-C1O-001", revision: "A", status: "Em Análise", sourceRow: 11 },
  { document: "DE-5290.00-22313-999-C1O-999", revision: "0", status: "Sem Comentários", sourceRow: 12 },
  { document: sigemEt, revision: "0", status: "Sem Comentários", sourceRow: 13 },
  { document: "PR-5290.00-22313-122-C1O-003", revision: "0", status: "Sem Comentários", sourceRow: 14 },
];
const model = Core.createModel(sigem, parsed.records, ld.records);
const result = Core.aggregateModel(model, {});
assert.deepStrictEqual(result.summary, {
  sigem: 4, pwRegistered: 3, pwEmitted: 2, gapSigemToPw: 1, gapPwToEmitted: 1, pwExclusive: 0, matched: 3,
  sigemOnly: 1, bothNotEmitted: 1, bothEmitted: 2, pwOnlyNotEmitted: 0, pwOnlyEmitted: 0, classifiedTotal: 4,
});
assert.strictEqual(result.classes.find((row) => row.documentClass === "N-1710").sigem, 3);
assert.strictEqual(result.lists.toRegisterPw[0].document, "PR-5290.00-22313-122-C1O-003");
assert.strictEqual(result.lists.pwNotEmitted[0].revision, "A");
assert.ok(!result.lists.all.some((row) => row.document.includes("999-C1O-999")), "N-1710 fora da LD deve ser descartado silenciosamente");
assert.strictEqual(Core.aggregateModel(model, { documentClass: "ET" }).summary.sigem, 1);
assert.throws(() => Core.parsePwCsv("NumeroDocumentoCliente;Revisao\nABC;0"), /campo\(s\) obrigatório\(s\)/i);

(function dashboardRevisionScopesAreExplicitAndAuditable() {
  const doc = (id) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${id}`;
  const sigemRows = [
    { document: doc("300001"), revision: "0", status: "Postado" },
    { document: doc("300001"), revision: "A", status: "Postado" },
    { document: doc("300001"), revision: "B", status: "Postado" },
    { document: doc("300002"), revision: 0, status: "Postado" },
    { document: doc("300002"), revision: "A", status: "Postado" },
    { document: doc("300003"), revision: "0", status: "Postado" },
    { document: doc("300003"), revision: "0", status: "Postado", sourceRow: 99 },
  ];
  const pwRows = [
    { document: doc("300001"), revision: "0", state: "Cadastrado", lastEmission: "Previsto" },
    { document: doc("300001"), revision: "A", state: "Liberado", lastEmission: "Sim" },
    { document: doc("300002"), revision: "0", state: "Liberado", lastEmission: "Sim" },
    { document: doc("300004"), revision: "0", state: "Cadastrado", lastEmission: "Previsto" },
    { document: doc("300004"), revision: "B", state: "Liberado", lastEmission: "Sim" },
  ];
  const scopedModel = Core.createModel(sigemRows, pwRows);
  const revision0 = Core.aggregateModel(scopedModel, {}, { revisionScope: "revision0" });
  const allRevisions = Core.aggregateModel(scopedModel, {}, { revisionScope: "all" });

  assert.equal(Core.normalizeRevisionScope("revision0"), "revision0");
  assert.equal(Core.normalizeRevisionScope("anything-else"), "all");
  assert.equal(Core.revisionKey("00"), "00", "revisão 00 não pode ser convertida em 0");
  assert.equal(revision0.revisionScope, "revision0");
  assert.equal(revision0.summary.sigem, 3, "Rev. 0 deve deduplicar documento + revisão equivalentes");
  assert.equal(revision0.summary.pwRegistered, 3);
  assert.equal(revision0.summary.matched, 2);
  assert.equal(revision0.summary.sigemOnly, 1);
  assert.equal(revision0.summary.pwOnlyNotEmitted, 1);
  assert.ok(revision0.lists.all.every((row) => row.revision === "0"), "detalhamento Rev. 0 deve conter somente revisão 0");

  assert.equal(allRevisions.revisionScope, "all");
  assert.equal(allRevisions.summary.sigem, 6, "0/A/B do mesmo documento são ocorrências independentes");
  assert.equal(allRevisions.summary.pwRegistered, 5);
  assert.equal(allRevisions.lists.all.length, allRevisions.summary.classifiedTotal, "KPI deve ser reproduzível pela lista detalhada");
  assert.equal(new Set(allRevisions.lists.all.map((row) => row.key)).size, allRevisions.lists.all.length, "não pode haver duplicidade na relação");
})();

(function dashboardRevisionScopesHandleOperationalVolume() {
  const count = 20000;
  const sigemRows = Array.from({ length: count }, (_, index) => ({
    document: `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${String(500000 + index).padStart(6, "0")}`,
    revision: "0",
    status: "Postado",
  }));
  const pwRows = sigemRows.map((row) => ({ document: row.document, revision: "0", state: "Cadastrado", lastEmission: "Previsto" }));
  for (let index = 0; index < 500; index += 1) {
    sigemRows.push({ ...sigemRows[index], revision: "A" });
    pwRows.push({ ...pwRows[index], revision: "A", lastEmission: "Sim" });
  }
  const started = Date.now();
  const volumeModel = Core.createModel(sigemRows, pwRows);
  const revision0 = Core.aggregateModel(volumeModel, {}, { revisionScope: "revision0" });
  const allRevisions = Core.aggregateModel(volumeModel, {}, { revisionScope: "all" });
  assert.equal(revision0.summary.sigem, count);
  assert.equal(revision0.summary.pwRegistered, count);
  assert.equal(allRevisions.summary.sigem, count + 500);
  assert.equal(allRevisions.summary.pwRegistered, count + 500);
  assert.ok(Date.now() - started < 10000, "escopos do Dashboard devem permanecer operacionais acima de 20 mil registros");
})();

(function exclusiveOperationalSituationsAreReliable() {
  const et = (id) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${id}`;
  const sigemRows = ["000001", "000002", "000003"].map((id) => ({ document: et(id), revision: "0", status: "Postado" }));
  const pwRows = [
    { document: et("000002"), revision: "0", state: "Cadastrado", lastEmission: "Previsto" },
    { document: et("000003"), revision: "0", state: "Liberado", lastEmission: "Sim" },
    { document: et("000004"), revision: "0", state: "Cadastrado", lastEmission: "Previsto" },
    { document: et("000005"), revision: "0", state: "Liberado", lastEmission: "Não" },
  ];
  const classified = Core.aggregate(sigemRows, pwRows);
  assert.equal(classified.summary.sigemOnly, 1);
  assert.equal(classified.summary.bothNotEmitted, 1);
  assert.equal(classified.summary.bothEmitted, 1);
  assert.equal(classified.summary.pwOnlyNotEmitted, 1);
  assert.equal(classified.summary.pwOnlyEmitted, 1);
  assert.equal(classified.summary.classifiedTotal, 5);
  assert.equal(classified.lists.all.length, 5);
  assert.equal(new Set(classified.lists.all.map((row) => row.key)).size, 5, "cada código + revisão deve aparecer uma única vez");
  assert.equal(classified.lists.bothNotEmitted[0].situation, Core.COMPARISON_SITUATIONS.BOTH_NOT_EMITTED);
  assert.equal(classified.lists.bothEmitted[0].situation, Core.COMPARISON_SITUATIONS.BOTH_EMITTED);
})();

(function pwWithoutRevisionFallsBackToDocumentPresence() {
  const et = (id) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${id}`;
  const sigemRows = [
    { document: et("100001"), revision: "0", status: "Recusado" },
    { document: et("100001"), revision: "A", status: "Sem Comentários" },
    { document: et("100002"), revision: "0", status: "Em Análise" },
  ];
  const pwRows = [
    { document: et("100001"), revision: "", state: "Cadastrado", lastEmission: "Previsto" },
    { document: et("100002"), revision: "Sem revisão", state: "Liberado", lastEmission: "Sim" },
    { document: et("100003"), revision: "Não informada", state: "Cadastrado", lastEmission: "Previsto" },
  ];
  const classified = Core.aggregate(sigemRows, pwRows);
  assert.equal(classified.summary.bothNotEmitted, 1, "código presente no SIGEM não pode ficar em Só PW por falta de revisão");
  assert.equal(classified.summary.bothEmitted, 1);
  assert.equal(classified.summary.pwOnlyNotEmitted, 1, "somente o código realmente ausente permanece em Só PW");
  assert.equal(classified.summary.pwExclusive, 1);
  assert.equal(classified.summary.matched, 2);
  assert.equal(classified.summary.sigemOnly, 1, "a revisão SIGEM adicional continua como entrada própria");
  assert.equal(classified.summary.classifiedTotal, 4);
  const fallback = classified.lists.bothNotEmitted[0];
  assert.equal(fallback.document, et("100001"));
  assert.equal(fallback.revision, "Não informada no PW · SIGEM: A");
  assert.equal(fallback.sigemStatus, "Sem Comentários", "fallback usa a revisão SIGEM mais recente disponível");
  assert.equal(fallback.matchMode, "document-fallback");
  assert.equal(classified.lists.pwOnlyNotEmitted[0].revision, "Não informada no PW");
  assert.equal(classified.classes.find((row) => row.documentClass === "ET").pwExclusive, 1);
})();

const appSource = [
  fs.readFileSync(path.join(rootDir, "src/react/sigem-pw/SigemPwDashboardApp.tsx"), "utf8"),
  fs.readFileSync(path.join(rootDir, "src/react/sigem-pw/components/SigemPwHeader.tsx"), "utf8"),
  fs.readFileSync(path.join(rootDir, "src/react/sigem-pw/components/SigemPwSituationCards.tsx"), "utf8"),
  fs.readFileSync(path.join(rootDir, "src/react/sigem-pw/services/sigemPwDashboardAdapter.ts"), "utf8"),
].join("\n");
assert.ok(!/MutationObserver/.test(appSource));
assert.ok(!/location\.reload\s*\(/.test(appSource));
assert.ok(/Gerenciar histórico/.test(appSource));
assert.ok(/Exportar lista/.test(appSource));
assert.ok(/workers\/sigem_pw_dashboard\.worker\.js/.test(appSource));
assert.ok(/savePwBase\(candidate, state\.ld\)/.test(appSource), "importação PW deve sanear com a LD vigente");
assert.ok(/saveLdAndReprocessPw/.test(appSource), "troca de LD deve reprocessar a base PW ativa");
assert.ok(/SIGEM \+ PW: ainda não emitido/.test(appSource));
assert.ok(/Revisão ausente no PW é conciliada pelo código do documento/.test(appSource));

for (const fileName of ["src/react/sigem-pw/evolution/SigemPwEvolutionApp.tsx", "sigem_pw_history_app.js", "sigem_pw_history_postmerge.js", "sigem_pw_history_runtime_fix.js"]) {
  const source = fs.readFileSync(path.join(rootDir, fileName), "utf8");
  assert.ok(!/Descartados do escopo|Motivo de descarte|Motivo descarte|Fora do escopo|registros brutos/i.test(source), `${fileName} não deve expor documentos ignorados`);
}

console.log("sigem_pw_dashboard: OK");
