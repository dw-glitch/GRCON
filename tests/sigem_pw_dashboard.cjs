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

const csv = [
  "NumeroDocumentoCliente;RevisaoCompleta;Revisao;TipoDocumento;TipoDocumentoDesc;Disciplina;DisciplinaDesc;o_statename;Última emissão;datacriacao",
  "CE-5290.00-22313-856-C1O-001;0;0;CE;Certificado;QUA;Qualidade;Superado;Não;01/09/2026",
  "CE-5290.00-22313-856-C1O-001;A;A;CE;Certificado;QUA;Qualidade;Em Analise;Previsto;02/09/2026",
  "DE-5290.00-22313-999-C1O-999;0;0;DE;Desenho;PRJ;Projeto;Superado;Sim;03/09/2026",
  `${pwEt};0;0;RIR;Relatório;INS;Instrumentação;Liberado;Sim;04/09/2026`,
].join("\n");
const parsed = Core.parsePwCsv(csv, { fileName: "pw.csv", importedAt: "2026-09-13T10:00:00Z" });
assert.strictEqual(parsed.meta.recordCount, 4, "parser preserva a base; escopo LD é aplicado no modelo");

const sigem = [
  { document: "CE-5290.00-22313-856-C1O-001", revision: "0", status: "Sem Comentários", sourceRow: 10 },
  { document: "CE-5290.00-22313-856-C1O-001", revision: "A", status: "Em Análise", sourceRow: 11 },
  { document: "DE-5290.00-22313-999-C1O-999", revision: "0", status: "Sem Comentários", sourceRow: 12 },
  { document: sigemEt, revision: "0", status: "Sem Comentários", sourceRow: 13 },
  { document: "PR-5290.00-22313-122-C1O-003", revision: "0", status: "Sem Comentários", sourceRow: 14 },
];
const model = Core.createModel(sigem, parsed.records, ld.records);
const result = Core.aggregateModel(model, {});
assert.deepStrictEqual(result.summary, { sigem: 4, pwRegistered: 3, pwEmitted: 2, gapSigemToPw: 1, gapPwToEmitted: 1, pwExclusive: 0, matched: 3 });
assert.strictEqual(result.classes.find((row) => row.documentClass === "N-1710").sigem, 3);
assert.strictEqual(result.lists.toRegisterPw[0].document, "PR-5290.00-22313-122-C1O-003");
assert.strictEqual(result.lists.pwNotEmitted[0].revision, "A");
assert.ok(!result.lists.all.some((row) => row.document.includes("999-C1O-999")), "N-1710 fora da LD deve ser descartado silenciosamente");
assert.strictEqual(Core.aggregateModel(model, { documentClass: "ET" }).summary.sigem, 1);
assert.throws(() => Core.parsePwCsv("NumeroDocumentoCliente;Revisao\nABC;0"), /campo\(s\) obrigatório\(s\)/i);

const appSource = fs.readFileSync(path.join(rootDir, "sigem_pw_dashboard_app.js"), "utf8");
assert.ok(!/MutationObserver/.test(appSource));
assert.ok(!/location\.reload\s*\(/.test(appSource));
assert.ok(/Gerenciar histórico/.test(appSource));
assert.ok(/Exportar lista/.test(appSource));
assert.ok(/workers\/sigem_pw_dashboard\.worker\.js/.test(appSource));

console.log("sigem_pw_dashboard: OK");
