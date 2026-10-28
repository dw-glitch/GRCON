"use strict";
const assert = require("node:assert/strict");
const Core = require("../sigem_pw_dashboard_core.js");
const Scope = require("../sigem_pw_scope_fix.js");
const Evolution = require("../sigem_pw_evolution_core.js");
const Audit = require("../sigem_pw_audit_core.js");
const Readiness = require("../sigem_pw_readiness_core.js");

const code = (n, origin = "C1O") => `PR-5290.00-22313-955-${origin}-${n}`;
const rows = [
  ["NumeroDocumentoCliente", "o_statename", "Sigla da Empresa", "Empresa (não utilizar)", "Revisao", "Última emissão"],
  [code("121"), "Liberado", "ABC", "CSG", "0", "Sim"],
  [code("122", "C2O"), "Previsto", " csg ", "XYZ", "0", "Previsto"],
  [code("123"), "Liberado", "qtm", "ABC", "A", "Não"],
  [code("123"), "Liberado", "qtm", "ABC", "A", "Não"],
  [code("124"), "Liberado", "", "QTM", "0", "Sim"],
  [code("125", "C2O"), "Previsto", "CSG / QTM", "ABC", "B", "Previsto"],
  [code("126"), "Liberado", "CSC", "CSG", "0", "Sim"],
];
const csv = rows.map((row) => row.join(";")).join("\n");
const parsed = Core.parsePwCsv(csv, { fileName: "pw.csv" });
assert.equal(parsed.meta.companyColumn, "C");
assert.equal(parsed.meta.columns.company, "Sigla da Empresa");
assert.equal(parsed.records[0].company, "ABC", "valor vem da coluna C, jamais da D");
assert.equal(parsed.records[1].company, "csg");
assert.equal(Core.PW_COMPANY_COLUMN_INDEX, 2);
assert.equal(Core.isPwCompanyInScope({ company: "CSG / QTM" }), true);
assert.equal(Core.isPwCompanyInScope({ company: "CSC" }), false);
assert.equal(Core.isPwCompanyInScope({ company: "CSGOLD" }), false);
assert.equal(Core.isPwCompanyInScope({ company: "qtm" }), true);
assert.equal(Core.isPwCompanyInScope({ document: "C1O", company: "" }), false);
assert.equal(Scope.scopeAudit(parsed.records).excludedCount, 3);

const clean = Core.sanitizePwBase(parsed, []);
assert.equal(clean.records.length, 4);
assert.equal(clean.meta.scopeAcceptedRecordCount, 4);
assert.equal(clean.meta.scopeExcludedCount, 3);
assert.deepEqual(clean.meta.scopeExcludedReasons, { empresa_divergente: 2, sigla_ausente: 1 });
assert.deepEqual(clean.meta.scopeCompanyCounts, { CSG: 1, QTM: 2, MULTIPLAS: 1 });
assert.equal(clean.meta.companyColumn, "C");
assert.equal(clean.meta.scopeCompanyColumnMissing, false);
assert.equal(clean.meta.uniqueDocumentCount, 3);
assert.equal(clean.meta.duplicateRevisionCount, 1);
assert.equal(clean.sourceRecords.length, parsed.records.length, "preservar os registros da consulta para auditoria");
assert.ok(clean.records.some((row) => row.document === code("122", "C2O")), "sem C1O pode pertencer a CSG");

const sigem = [
  { document: code("122", "C2O"), revision: "0", status: "Postado" },
  { document: code("123"), revision: "A", status: "Postado" },
  { document: code("999"), revision: "0", status: "Postado" },
];
const model = Core.createModel(sigem, parsed.records, []);
assert.equal(model.comparisonScope.rule, "PW: CSG/QTM");
assert.equal(model.comparisonScope.pwOutOfScope, 3);
const result = Core.aggregateModel(model, {}, { revisionScope: "all" });
assert.equal(result.summary.pwRegistered, 3);
assert.equal(result.summary.pwEmitted, 1);
assert.equal(result.summary.gapPwToEmitted, 2);
assert.equal(result.summary.bothNotEmitted, 1, "Previsto = cadastrado e não emitido");
assert.equal(result.summary.bothEmitted, 1);
assert.equal(result.summary.sigemOnly, 1);
assert.equal(result.summary.pwExclusive, 1);
assert.equal(result.quality.pwDuplicateGroups, 1);
assert.equal(result.lists.pwDuplicates.length, 2);
assert.ok(result.lists.pwDuplicates.every((row) => row.pwCompany.toUpperCase() === "QTM"));

const universe = Evolution.buildLdUniverse([], []);
const historical = Evolution.buildSnapshot("pw", clean, universe);
assert.equal(historical.audit.scopeDiscardedRecords, 3);
assert.equal(historical.records.length, 3, "repetição técnica exata é consolidada na evolução");
assert.equal(historical.duplicates.length, 1);
assert.equal(Audit.buildAudit(clean, { meta: null, records: [] }).status, "validated");
const readiness = Readiness.assess({
  sigem: { meta: { recordCount: sigem.length }, records: sigem },
  pw: clean, ld: { meta: null, records: [] },
}, result);
assert.equal(readiness.ready, true, JSON.stringify(readiness.failedChecks));

assert.throws(() => Core.parsePwCsv("NumeroDocumentoCliente;Revisao;Status\nDOC;0;Sim"), /coluna C|sigla/i);
assert.throws(() => Core.parsePwCsv("NumeroDocumentoCliente;Revisao\nDOC;0"), /coluna C|sigla/i);
const profile = { mappingProfile: { columns: { company: "Empresa (não utilizar)" } } };
assert.equal(Core.parsePwCsv(csv, profile).records[0].company, "ABC", "perfil não pode deslocar o filtro da coluna C");
console.log("SIGEM × PW: sigla da empresa exclusivamente da coluna C, CSG/QTM, cadastro, emissão, duplicatas, evolução, auditoria e validação OK");
