const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Workbook = require("../grdt_workbook.js");

(async () => {
  const modelPath = path.join(__dirname, "..", "grdt-template.xlsx");
  const template = new Uint8Array(fs.readFileSync(modelPath));
  assert.equal(Workbook.isLegacyXls(template), true, "o template interno precisa continuar BIFF8 legado");

  const contract = Workbook.inspectTemplate(template);
  assert.equal(contract.valid, true);
  assert.deepEqual(contract.headers, [
    "DOCUMENTO", "REVISÃO", "TÍTULO", "ARQUIVO", "FORMATO",
    "DISCIPLINA", "TIPO DE DOCUMENTO", "PROPÓSITO", "CAMINHO DATABOOK",
  ]);
  assert.equal(contract.binary.format, "BIFF8");
  assert.ok(contract.binary.dataValidationRules > 0, "o modelo precisa preservar os combos/validações de dados");
  assert.equal(Workbook.MODEL_REFERENCE.sha256, "25e1dd4224661e4170b91b7d0e14402373dca707e44c558ced94d039cba08ac2");
  assert.equal(Workbook.MODEL_REFERENCE.sizeBytes, 74240);
  assert.equal(Workbook.MODEL_REFERENCE.verifiedCopies, 5);

  const sample = {
    document: "RL-5290.00-22313-91B-C1O-002",
    revision: "A",
    title: "RELATÓRIO DE TESTE",
    fileName: "RL-5290.00-22313-91B-C1O-002_0001_A.pdf",
    format: "A4",
    discipline: "CIVIL",
    documentType: "RL",
    purpose: "Para Informação",
    databook: "UHDT-D/RELATORIOS",
  };

  const audit = Workbook.auditRows([sample]);
  assert.equal(audit.valid, true);
  assert.deepEqual(audit.errors, []);

  const informational = Workbook.auditRows([{ ...sample, title: "", purpose: "", databook: "" }]);
  assert.equal(informational.valid, true, "Título/Propósito/Databook não podem virar novo bloqueio silencioso");
  assert.ok(informational.warnings.some((message) => /TÍTULO/.test(message)));
  assert.ok(informational.warnings.some((message) => /PROPÓSITO/.test(message)));
  assert.ok(informational.warnings.some((message) => /DATABOOK/.test(message)));

  const noRevision = Workbook.auditRows([{ ...sample, revision: "" }]);
  assert.equal(noRevision.valid, false);
  assert.ok(noRevision.errors.some((message) => /REVISÃO.*vazia/i.test(message)));

  const noExtension = Workbook.auditRows([{ ...sample, fileName: sample.fileName.replace(/\.pdf$/i, "") }]);
  assert.equal(noExtension.valid, false);
  assert.ok(noExtension.errors.some((message) => /ARQUIVO.*sem extensão/i.test(message)));

  const badDiscipline = Workbook.auditRows([{ ...sample, discipline: "DISCIPLINA LIVRE" }]);
  assert.equal(badDiscipline.valid, false);
  assert.ok(badDiscipline.errors.some((message) => /fora da lista oficial/i.test(message)));

  const output = await Workbook.build([sample]);
  const verified = await Workbook.verify(output, [sample]);
  assert.equal(verified.valid, true);
  assert.equal(verified.format, "BIFF8");
  assert.equal(verified.checkedRows, 1);
  assert.equal(verified.rows[0].document, sample.document);
  assert.equal(verified.rows[0].revision, sample.revision);
  assert.equal(verified.binaryContract.hasDataValidation, true);

  const inspected = await Workbook.inspect(output);
  assert.equal(inspected.valid, true);
  assert.equal(inspected.fimRow, 3);
  assert.equal(inspected.rows.length, 1);
  assert.equal(inspected.rows[0].fileName, sample.fileName);

  await assert.rejects(
    () => Workbook.build([{ ...sample, revision: "" }]),
    /REVISÃO.*vazia/i,
  );
  await assert.rejects(
    () => Workbook.build([{ ...sample, fileName: "sem-extensao" }]),
    /ARQUIVO.*sem extensão/i,
  );

  console.log("grdt_workbook_official_contract: OK — BIFF8, 9 colunas, combos, FIM e campos críticos validados sem regressão dos campos informativos.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
