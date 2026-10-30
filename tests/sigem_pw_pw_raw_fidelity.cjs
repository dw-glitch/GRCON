"use strict";
const assert = require("node:assert/strict");
const Core = require("../sigem_pw_dashboard_core.js");

function q(value) {
  const s = String(value ?? "");
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csv(rows) { return rows.map(row => row.map(q).join(";")).join("\r\n"); }

const columns = Array.from({ length: 70 }, (_, index) => "Atributo PW " + String(index + 1).padStart(2, "0"));
columns[0] = "NumeroDocumentoCliente";
columns[1] = "o_statename";
columns[2] = "Sigla da Empresa";
columns[3] = "Revisao";
columns[4] = "Última emissão";
columns[42] = "Atributo repetido";
columns[43] = "Atributo repetido"; // Não sobrescrever cabeçalhos repetidos!
columns[69] = "";
const document = "IS-5290.00-22313-955-C1O-321";
const row1 = Array.from({ length: 70 }, (_, i) => "valor " + i);
row1[0] = document;
row1[1] = "Previsto";
row1[2] = "CSG";
row1[3] = "0";
row1[4] = "Previsto";
row1[42] = "primeiro";
row1[43] = "segundo";
row1[60] = "Texto com ponto; e aspas \"preservadas\"\ne quebra";
row1[69] = "  espaços significativos  ";
const row2 = [...row1];
row2[0] = document;
row2[2] = "QTM";
row2[3] = "A";
row2[4] = "Sim";
row2[42] = "";
row2[43] = "outro";
const row3 = [...row1];
row3[0] = "PR-5290.00-22313-955-C1O-322";
row3[2] = "ABC";
row3[3] = "B";
const invalid = [...row1];
invalid[0] = ""; // Linha inválida não pode alterar os indicadores oficiais.
const parsed = Core.parsePwCsv(csv([columns, row1, row2, row3, invalid]), {fileName: "PW_70.csv"});
assert.equal(parsed.meta.pwRawHeaders.length, 70);
assert.deepEqual(parsed.meta.pwRawHeaders, columns);
assert.equal(parsed.meta.pwRawColumnCount, 70);
assert.equal(parsed.meta.pwRawValidRowCount, 3);
assert.equal(parsed.meta.pwRawInvalidRowCount, 1);
assert.equal(parsed.meta.sourceRowCount, 4);
assert.deepEqual(parsed.records.map(r => r.sourceRow), [2, 3, 4]);
assert.equal(parsed.sourceRecords.length, 4, "a origem deve incluir cada linha preenchida");
assert.equal(parsed.sourceRecords[3].pwRawInvalid, true);
assert.deepEqual(parsed.sourceRecords[3].pwRawCells, invalid);

assert.deepEqual(parsed.records[0].pwRawCells, row1);
assert.deepEqual(parsed.records[1].pwRawCells, row2);
assert.equal(parsed.records[0].pwRawCells[42], "primeiro");
assert.equal(parsed.records[0].pwRawCells[43], "segundo");
assert.equal(parsed.records[0].pwRawCells[60], row1[60]);
assert.equal(parsed.records[0].pwRawCells[69], row1[69]);
assert.equal(parsed.records[0].company, "CSG", "empresa estritamente da coluna C");

const base = Core.sanitizePwBase(parsed, []);
assert.equal(base.records.length, 2, "somente CSG/QTM no modelo");
assert.equal(base.sourceRecords.length, 4, "preservar também linhas inválidas, sem contaminar indicadores");
assert.equal(base.meta.scopeExcludedCount, 1);
assert.equal(base.sourceRecords[3].pwRawInvalid, true);
assert.equal(base.meta.pwRawInvalidRowCount, 1);
assert.equal(base.meta.scopeAcceptedRecordCount, 2);
assert.deepEqual(base.sourceRecords[2].pwRawCells, row3);
assert.equal(base.records[0].pwRawCells, undefined, "modelo leve, sem replicar todas as colunas");
assert.deepEqual(base.meta.pwRawHeaders, columns, "cabeçalhos persistem no metadado");
const next = Core.sanitizePwBase(structuredClone(base), []);
assert.deepEqual(next.sourceRecords.map(r => r.pwRawCells), [row1,row2,row3,invalid], "reprocessar LD não elimina os atributos brutos nem linhas inválidas");
assert.deepEqual(next.meta.pwRawHeaders, columns);
const rehydrated = JSON.parse(JSON.stringify(next));
assert.deepEqual(rehydrated.sourceRecords[0].pwRawCells, row1);
assert.deepEqual(rehydrated.meta.pwRawHeaders, columns);

const more = Array.from({ length: 73 }, (_, i) => "v" + i);
more[0] = document; more[2] = "CSG";
const wider = Core.parsePwCsv(csv([columns, more]), {fileName: "PW_73.csv"});
assert.equal(wider.meta.pwRawColumnCount, 73);
assert.equal(wider.records[0].pwRawCells.length, 73, "células após último cabeçalho nunca truncadas");
assert.equal(wider.meta.pwRawHeaders.length, 70);


const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const ts = require("typescript");
const source = readFileSync(join(__dirname, "../src/react/sigem-pw/services/sigemPwRawPw.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
}}).outputText;
const output = { exports: {} };
new Function("exports", "module", "require", compiled)(output.exports, output, require);
const { getPwOriginalMatrix } = output.exports;
const matrix = getPwOriginalMatrix(base);
assert.deepEqual(matrix.headers, columns);
assert.deepEqual(matrix.rows, [row1, row2, row3, invalid]);
assert.deepEqual(matrix.sourceRows, [2, 3, 4, 5]);
assert.equal(matrix.excludedInvalidRows, 1);
const widerMatrix = getPwOriginalMatrix(Core.sanitizePwBase(wider, []));
assert.equal(widerMatrix.headers.length, 73);
assert.deepEqual(widerMatrix.rows[0], more);
assert.throws(() => getPwOriginalMatrix({
  meta: { fileName: "legado.csv" }, records: [{ document }]
}), /Reimporte o CSV/);
assert.throws(() => getPwOriginalMatrix({
  meta: { pwRawHeaders: columns }, records: [{ document }]
}), /sem colunas originais/);

const history = readFileSync(join(__dirname, "../sigem_pw_history_management.js"), "utf8");
assert.match(history, /sourceRecords: clone\(base\.sourceRecords\)/);
assert.match(history, /sourceRecords: clone\(context\.previousPayload\.sourceRecords\)/);

console.log("SIGEM × PW Fase 4: 70 colunas PW, duplicados, CSV citado, linha C, histórico bruto e layout variável OK");
