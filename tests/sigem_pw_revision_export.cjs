"use strict";

const assert = require("node:assert/strict");
const ExcelJS = require("../exceljs.min.js");
const Core = require("../sigem_pw_revision_core.js");
const Report = require("../sigem_pw_revision_report.js");

function makeRow(index, overrides = {}) {
  const revisions = ["0", "A", "B", "01", "02", "—"];
  const situations = [
    Core.SITUATIONS.UPDATED,
    Core.SITUATIONS.PREVIOUS,
    Core.SITUATIONS.NOT_FOUND,
    Core.SITUATIONS.AWAITING_EMISSION,
    Core.SITUATIONS.PW_AHEAD,
    Core.SITUATIONS.REVIEW,
  ];
  const classes = ["ET", "N-1710", "CV"];
  const sigemStatuses = ["Em Análise", "Recusado", "Conforme Construído"];
  const pwStatuses = ["Emitido", "Em elaboração", "Aprovado"];
  const sigemRevision = revisions[index % revisions.length];
  const pwRevision = revisions[(index + 1) % revisions.length];
  const situation = situations[index % situations.length];
  const document = `CR-5290.00-${String(index).padStart(5, "0")}-911-C10-${String(index % 999).padStart(3, "0")}`;
  const pwMissing = situation === Core.SITUATIONS.NOT_FOUND;
  return {
    key: `key-${index}`,
    document,
    documentClass: classes[index % classes.length],
    sigemRevision,
    sigemStatus: sigemStatuses[index % sigemStatuses.length],
    sigemCode: document,
    pwCode: pwMissing ? "" : document,
    pwRevision: pwMissing ? "" : pwRevision,
    pwStatus: pwMissing ? "" : pwStatuses[index % pwStatuses.length],
    lastEmittedPwRevision: pwMissing ? "" : revisions[Math.max(0, (index - 1) % revisions.length)],
    lastEmittedPwStatus: pwMissing ? "" : "Emitido",
    situation,
    reason: `Diagnóstico com acento, hífen e barra / para o documento ${document}.`,
    eap: "1.1.1.1",
    documentType: index % 2 ? "REP" : "RUFF",
    sigemRows: [
      { revision: sigemRevision, status: sigemStatuses[index % sigemStatuses.length], sourceRow: index + 2 },
      { revision: "0", status: "Emitido", sourceRow: index + 1 },
    ],
    pwRows: pwMissing ? [] : [
      { revision: pwRevision, state: pwStatuses[index % pwStatuses.length], emittedEvidence: index % 2 === 0, sourceRow: index + 2 },
      { revision: "0", state: "Emitido", emittedEvidence: true, sourceRow: index + 1 },
    ],
    ...overrides,
  };
}

function filters(overrides = {}) {
  return {
    situation: "all",
    documentClass: "",
    sigemRevision: "",
    pwRevision: "",
    sigemStatus: "",
    pwStatus: "",
    search: "",
    documentList: "",
    ...overrides,
  };
}

async function workbookFrom(rows, activeFilters, options = {}) {
  const buffer = await Report.buildWorkbook(rows, activeFilters, { validate: true, createdAt: new Date("2026-09-11T12:05:30-03:00"), ...options });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return { workbook, buffer };
}

function dataCount(workbook) {
  const sheet = workbook.getWorksheet("Lista Filtrada");
  return Math.max(0, sheet.rowCount - 1);
}

(async () => {
  const source = Array.from({ length: 1200 }, (_, index) => makeRow(index));

  // 1 — sem filtros adicionais: contador e Excel usam o mesmo filteredRows.
  const allRows = Core.filterRows(source, filters());
  assert.equal(allRows.length, source.length);
  const allBook = await workbookFrom(allRows, filters());
  assert.equal(dataCount(allBook.workbook), allRows.length);

  // 2 — situação.
  const missingRows = Core.filterRows(source, filters({ situation: Core.SITUATIONS.NOT_FOUND }));
  assert.ok(missingRows.length > 0);
  assert.ok(missingRows.every((row) => row.situation === Core.SITUATIONS.NOT_FOUND));
  assert.equal(dataCount((await workbookFrom(missingRows, filters({ situation: Core.SITUATIONS.NOT_FOUND }))).workbook), missingRows.length);

  // 3 — classe.
  const n1710Rows = Core.filterRows(source, filters({ documentClass: "N-1710" }));
  assert.ok(n1710Rows.every((row) => row.documentClass === "N-1710"));

  // 4 — revisão SIGEM.
  const sigemRevRows = Core.filterRows(source, filters({ sigemRevision: "01" }));
  assert.ok(sigemRevRows.length > 0 && sigemRevRows.every((row) => Core.norm(row.sigemRevision) === "01"));

  // 5 — revisão PW.
  const pwRevRows = Core.filterRows(source, filters({ pwRevision: "A" }));
  assert.ok(pwRevRows.length > 0 && pwRevRows.every((row) => Core.norm(row.pwRevision) === "A"));

  // 6 — Status SIGEM.
  const sigemStatusRows = Core.filterRows(source, filters({ sigemStatus: "Em Análise" }));
  assert.ok(sigemStatusRows.length > 0 && sigemStatusRows.every((row) => Core.norm(row.sigemStatus) === Core.norm("Em Análise")));

  // 7 — Status PW.
  const pwStatusRows = Core.filterRows(source, filters({ pwStatus: "Emitido" }));
  assert.ok(pwStatusRows.length > 0 && pwStatusRows.every((row) => Core.norm(row.pwStatus) === "EMITIDO"));

  // 8 — pesquisa textual.
  const searchedDocument = source[317].document;
  const searchedRows = Core.filterRows(source, filters({ search: searchedDocument }));
  assert.equal(searchedRows.length, 1);
  assert.equal(searchedRows[0].document, searchedDocument);

  // 9 — lista de documentos + interseção com outros filtros.
  const candidates = source.filter((row) => row.documentClass === "N-1710").slice(0, 8);
  const listValue = candidates.map((row) => row.document).join("\n");
  const listFilters = filters({ documentList: listValue, documentClass: "N-1710", sigemStatus: candidates[0].sigemStatus });
  const listRows = Core.filterRows(source, listFilters);
  const candidateSet = new Set(candidates.map((row) => Core.norm(row.document)));
  assert.ok(listRows.length > 0);
  assert.ok(listRows.every((row) => candidateSet.has(Core.norm(row.document)) && row.documentClass === "N-1710" && Core.norm(row.sigemStatus) === Core.norm(candidates[0].sigemStatus)));

  // 10 — paginação não participa do dataset exportado.
  const pagedFilters = filters({ situation: "attention" });
  const pagedRows = Core.filterRows(source, pagedFilters);
  assert.ok(pagedRows.length > 100);
  const page1 = pagedRows.slice(0, 100);
  const page4 = pagedRows.slice(300, 400);
  assert.notDeepEqual(page1.map((row) => row.document), page4.map((row) => row.document));
  const pagedBook = await workbookFrom(pagedRows, pagedFilters);
  assert.equal(dataCount(pagedBook.workbook), pagedRows.length, "Excel deve exportar o filteredRows completo, não a página");

  // 11 — volume realista 15.000+.
  const largeSource = Array.from({ length: 15050 }, (_, index) => makeRow(index + 20000));
  const largeFilters = filters({ situation: "all" });
  const largeRows = Core.filterRows(largeSource, largeFilters);
  const started = Date.now();
  const largeBook = await workbookFrom(largeRows, largeFilters);
  const elapsed = Date.now() - started;
  assert.equal(dataCount(largeBook.workbook), 15050);
  assert.ok(largeBook.buffer.byteLength > 1000, "arquivo grande deve possuir conteúdo XLSX real");
  assert.ok(elapsed < 120000, `exportação de 15.050 registros excedeu limite de segurança: ${elapsed}ms`);

  // 12 — nenhum resultado não gera arquivo vazio acidentalmente.
  await assert.rejects(() => Report.buildWorkbook([], filters(), { validate: true }), /Nenhum documento disponível para exportação/);

  // 13 e 14 — caracteres especiais, códigos longos e revisões preservadas como texto.
  const specialRows = [
    makeRow(90001, { document: "CR-5290.00-22313-911-C10-221/TESTE", sigemCode: "CR-5290.00-22313-911-C10-221/TESTE", sigemRevision: "0", pwRevision: "01", reason: "Ação necessária — revisão não localizada; observação: ç/ã/é." }),
    makeRow(90002, { sigemRevision: "A", pwRevision: "02" }),
    makeRow(90003, { sigemRevision: "B", pwRevision: "—" }),
  ];
  const specialBook = await workbookFrom(specialRows, filters({ search: "ç/ã/é" }));
  const sheet = specialBook.workbook.getWorksheet("Lista Filtrada");
  const headerMap = new Map();
  sheet.getRow(1).eachCell((cell, col) => headerMap.set(String(cell.value), col));
  assert.equal(String(sheet.getCell(2, headerMap.get("DOCUMENTO")).value), specialRows[0].document);
  assert.equal(String(sheet.getCell(2, headerMap.get("REVISÃO SIGEM")).value), "0");
  assert.equal(String(sheet.getCell(2, headerMap.get("REVISÃO PW")).value), "01");
  assert.match(String(sheet.getCell(2, headerMap.get("MOTIVO / DIAGNÓSTICO")).value), /Ação necessária/);
  assert.equal(String(sheet.getCell(3, headerMap.get("REVISÃO SIGEM")).value), "A");
  assert.equal(String(sheet.getCell(3, headerMap.get("REVISÃO PW")).value), "02");
  assert.equal(String(sheet.getCell(4, headerMap.get("REVISÃO PW")).value), "—");

  const filterSheet = specialBook.workbook.getWorksheet("Filtros Aplicados");
  assert.ok(filterSheet, "aba Filtros Aplicados obrigatória");
  const filterValues = [];
  filterSheet.eachRow((row) => filterValues.push(row.values.map(String).join(" | ")));
  assert.ok(filterValues.some((line) => /Registros exportados.*3/.test(line)));
  assert.ok(filterValues.some((line) => /Resultado filtrado completo/.test(line)));

  const name = Report.downloadName(filters({ situation: Core.SITUATIONS.NOT_FOUND }), new Date(2026, 8, 11, 12, 5, 30));
  assert.match(name, /^GRCON_SIGEM_PW_Nao_localizado_no_PW_20260911_120530\.xlsx$/);

  console.log(`sigem_pw_revision_export: OK — filtros, paginação e XLSX real; volume máximo testado=15.050 em ${elapsed}ms`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
