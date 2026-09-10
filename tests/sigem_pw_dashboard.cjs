const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Core = require(path.join(__dirname, "..", "sigem_pw_dashboard_core.js"));

const sigemEt = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-PI-321530";
const pwEt = "C1O-RNEST-U32-3.1.1.1-INS-RIR-PI-321530";
assert.strictEqual(Core.documentIdentity(sigemEt).key, Core.documentIdentity(pwEt).key, "RNEST + nt- devem convergir para a mesma identidade");
assert.notStrictEqual(
  Core.documentIdentity("C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-321530").key,
  Core.documentIdentity("C1O_RNEST_U32_3.1.1.2_INS_RIR_PI-321530").key,
  "EAP diferente deve permanecer documento diferente"
);
assert.strictEqual(Core.documentClass("CE-5290.00-22313-856-C1O-001"), "CE");
assert.strictEqual(Core.documentClass(pwEt), "ET");

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
assert.strictEqual(result.classes.find((row) => row.documentClass === "MC").gapSigemToPw, 1);
assert.strictEqual(Core.aggregateModel(model, { emission: "not-emitted" }).summary.pwRegistered, 1);
assert.throws(() => Core.parsePwCsv("NumeroDocumentoCliente;Revisao\nABC;0"), /campo\(s\) obrigatório\(s\)/i);

const appSource = fs.readFileSync(path.join(__dirname, "..", "sigem_pw_dashboard_app.js"), "utf8");
assert.ok(!/MutationObserver/.test(appSource), "Dashboard não deve usar MutationObserver global");
assert.ok(!/location\.reload\s*\(/.test(appSource), "Dashboard não deve recarregar a página");
assert.ok(/workers\/sigem_pw_dashboard\.worker\.js/.test(appSource), "CSV PW deve usar Worker quando disponível");

console.log("sigem_pw_dashboard: OK");
