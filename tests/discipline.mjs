import assert from "node:assert/strict";
import fs from "node:fs";
import SheetJS from "../xlsx.full.min.js";
import Core from "../core.js";
import Disciplines from "../discipline_resolver.js";
import Emission from "../emission.js";
import Workbook from "../grdt_workbook.js";
import ReportSummary from "../report_summary.js";
import History from "../history_core.js";
import ExcelJS from "../exceljs.min.js";

let checks = 0;
function check(name, callback) {
  callback();
  checks += 1;
  console.log(`✓ ${name}`);
}

async function checkAsync(name, callback) {
  await callback();
  checks += 1;
  console.log(`✓ ${name}`);
}

function cvDocument(sequence = "0001", disciplineCode = "ELE") {
  return `5900.0012345.01.1-C1O-CV-${disciplineCode}-${sequence}`;
}

function technicalRecord(document, discipline, overrides = {}) {
  return {
    document,
    documentKey: Core.key(document),
    revision: "0",
    status: "",
    sigemStatus: "",
    title: `CURRÍCULO ${document.slice(-4)}`,
    format: "A4",
    discipline,
    documentType: "CV",
    purpose: "Para Informação",
    databook: "",
    allocationStatus: "ALOCADO",
    allocationStatusState: Core.allocationState("ALOCADO"),
    allocation: "C1O-ALOC-CM-0001-2026",
    sheet: "CV",
    source: "LD_001.xlsx",
    row: 7,
    sourceOrder: 0,
    sourceTimestamp: 1,
    ...overrides,
  };
}

function triage(record, id = "cv") {
  const index = Core.buildIndex(Array.isArray(record) ? record : [record], []);
  const document = Array.isArray(record) ? record[0].document : record.document;
  return Core.triageOne({ id, name: `${document}_0001_0.pdf`, file: { size: 10 } }, index, {});
}

check("catálogo central reproduz exatamente o combo do modelo oficial, sem exceções históricas", () => {
  const workbook = SheetJS.read(fs.readFileSync(new URL("../grdt-template.xlsx", import.meta.url)), { type: "buffer" });
  const sheet = workbook.Sheets.GRDT;
  const modelDisciplines = [];
  for (let row = 15; row <= 37; row += 1) {
    const cell = sheet[SheetJS.utils.encode_cell({ r: row, c: 5 })];
    if (cell && String(cell.v || "").trim()) modelDisciplines.push(String(cell.v).trim());
  }
  assert.deepEqual(Disciplines.OFFICIAL_DISCIPLINES, modelDisciplines);
  assert.equal(Disciplines.isAllowed("MECÂNICA/SEGURANCA"), false);
  assert.strictEqual(Core.EGRDT_OPTIONS.disciplines, Disciplines.OFFICIAL_DISCIPLINES);
});

check("CV usa correspondência direta da mesma linha da LD_001 / aba CV", () => {
  const row = triage(technicalRecord(cvDocument("0001"), "ELÉTRICA"));
  assert.equal(row.decision, Core.READY);
  assert.equal(row.egrdt.discipline, "ELÉTRICA");
  assert.equal(row.disciplineResolution.disciplineOriginalLd, "ELÉTRICA");
  assert.equal(row.disciplineResolution.method, "exact");
  assert.equal(row.disciplineResolution.evidence.sheet, "CV");
  assert.equal(row.disciplineResolution.evidence.source, "LD_001.xlsx");
  assert.equal(row.disciplineResolution.evidence.row, 7);
});

check("CV converte alias disciplinar conhecido sem alterar a LD", () => {
  const record = technicalRecord(cvDocument("0002"), "ELE");
  const row = triage(record);
  assert.equal(record.discipline, "ELE");
  assert.equal(row.egrdt.disciplineOriginalLd, "ELE");
  assert.equal(row.egrdt.discipline, "ELÉTRICA");
  assert.equal(row.disciplineResolution.method, "contract-code");
});

check("CV converte descrição inválida por alias integral validado", () => {
  const original = "RNEST UHDTD U-32 TIC TELECOM";
  const row = triage(technicalRecord(cvDocument("0003", "TEL"), original));
  assert.equal(row.egrdt.disciplineOriginalLd, original);
  assert.equal(row.egrdt.discipline, "COMUNICAÇÃO E RS");
  assert.equal(row.disciplineResolution.method, "validated-alias");
  assert.ok(Disciplines.isAllowed(row.egrdt.discipline));
});

check("CV sem mapeamento não herda disciplina do código e exige confirmação", () => {
  const row = triage(technicalRecord(cvDocument("0004", "ELE"), "DISCIPLINA EXPERIMENTAL"));
  assert.equal(row.decision, Core.REVIEW);
  assert.equal(row.blockCode, "discipline_confirmation");
  assert.equal(row.egrdt.discipline, "");
  assert.equal(row.disciplineResolution.requiresConfirmation, true);
  assert.match(Core.validateEgrdtData(row.egrdt).join("; "), /DISCIPLINA fora da lista oficial/i);
});

check("CV nunca usa linha de outra aba ou de outra LD para obter disciplina", () => {
  const document = cvDocument("0005");
  const correct = technicalRecord(document, "QUALIDADE", { row: 31 });
  const wrongSheet = technicalRecord(document, "CIVIL", { sheet: "N-1710", row: 2 });
  const wrongLd = technicalRecord(document, "MECÂNICA", { source: "LD_002.xlsx", row: 3 });
  const row = triage([wrongSheet, wrongLd, correct]);
  assert.equal(row.record, correct);
  assert.equal(row.egrdt.discipline, "QUALIDADE");

  const missing = triage([wrongSheet, wrongLd], "cv-missing-ld001");
  assert.equal(missing.decision, Core.REVIEW);
  assert.equal(missing.blockCode, "cv_ld001_missing");
  assert.equal(missing.egrdt.discipline, undefined);
});

check("vários CVs mantêm disciplinas isoladas, sem vazamento entre linhas", () => {
  const records = [
    technicalRecord(cvDocument("0006", "ELE"), "ELÉTRICA", { row: 8 }),
    technicalRecord(cvDocument("0007", "CVL"), "CIVIL", { row: 9 }),
    technicalRecord(cvDocument("0008", "QUA"), "QUALIDADE", { row: 10 }),
  ];
  const index = Core.buildIndex(records, []);
  const resolved = records.map((record, indexValue) => Core.triageOne({
    id: `cv-batch-${indexValue}`,
    name: `${record.document}_0001_0.pdf`,
    file: { size: 10 },
  }, index, {}));
  assert.deepEqual(resolved.map((row) => row.egrdt.discipline), ["ELÉTRICA", "CIVIL", "QUALIDADE"]);
});

check("ordem de processamento dos CVs não altera a disciplina resolvida", () => {
  const records = [
    technicalRecord(cvDocument("0009", "MEC"), "MEC", { row: 11 }),
    technicalRecord(cvDocument("0010", "INS"), "INSTRUMENTAÇÃO", { row: 12 }),
  ];
  const resolveOrder = (ordered) => {
    const index = Core.buildIndex(ordered, []);
    return new Map(ordered.map((record) => {
      const row = Core.triageOne({ id: record.document, name: `${record.document}_0001_0.pdf`, file: { size: 1 } }, index, {});
      return [record.document, row.egrdt.discipline];
    }));
  };
  assert.deepEqual([...resolveOrder(records)].sort(), [...resolveOrder([...records].reverse())].sort());
});

check("CV repetido usa a disciplina da linha final escolhida por revisão e vigência", () => {
  const document = cvDocument("0017", "ELE");
  const obsolete = technicalRecord(document, "CIVIL", { revision: "0", row: 20, ldVersion: "D" });
  const current = technicalRecord(document, "ELÉTRICA", { revision: "A", row: 21, ldVersion: "E" });
  const row = triage([obsolete, current]);
  assert.equal(row.record.row, 21);
  assert.equal(row.record.revision, "A");
  assert.equal(row.egrdt.discipline, "ELÉTRICA");
  assert.equal(row.disciplineResolution.evidence.row, 21);
});

check("aba CV e coluna DISCIPLINA são reconhecidas sem sensibilidade a caixa ou espaços", () => {
  globalThis.XLSX = SheetJS;
  const document = cvDocument("0011", "QUA");
  const workbook = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(workbook, SheetJS.utils.aoa_to_sheet([
    ["Documento", "Revisão", "Título", " disciplina ", "Disciplina Torre", "Formato", "Tipo de Documento", "Propósito", "Confirmação de alocação"],
    [document, "0", "CURRÍCULO DE QUALIDADE", "QUALIDADE", "CIVIL", "A4", "CV", "Para Informação", "ALOCADO"],
  ]), " cv ");
  const parsed = Core.parseWorkbook(workbook, "LD_001.xlsx", 1, null);
  const record = parsed.records.find((item) => item.document === document);
  assert.ok(record);
  assert.equal(record.sheet, "cv");
  assert.equal(record.discipline, "QUALIDADE");
  const row = triage(record);
  assert.equal(row.egrdt.discipline, "QUALIDADE");
});

check("ambiguidade mostra somente candidatas oficiais e aceita escolha manual pontual", () => {
  const document = cvDocument("0012", "CVL");
  const record = technicalRecord(document, "CIVIL/SEGURANCA");
  const automatic = Core.resolveDiscipline(document, record, { sheetName: "CV" });
  assert.equal(automatic.requiresConfirmation, true);
  assert.deepEqual(automatic.candidates.sort(), ["CIVIL", "SEGURANÇA"].sort());
  const manual = Core.resolveDiscipline(document, record, { sheetName: "CV", manualDiscipline: "CIVIL" });
  assert.equal(manual.valid, true);
  assert.equal(manual.discipline, "CIVIL");
  assert.equal(manual.method, "manual");
  assert.equal(Core.resolveDiscipline(document, record, { sheetName: "CV", manualDiscipline: "LIVRE" }).valid, false);
});

check("ET, N-1710 e demais tipos nunca produzem disciplina final fora da lista", () => {
  const etDocument = "C1O_RNEST_U32_3.1.1.1_ELE_REP_P-101-A";
  const et = Core.buildEgrdtData(etDocument, "0", `${etDocument}_0001_0.pdf`, {
    ...technicalRecord(etDocument, "NOMENCLATURA NÃO MAPEADA", { sheet: "ET", source: "LD_002.xlsx" }),
    documentType: "RL",
  }, "ET", "A4");
  assert.equal(et.discipline, "ELÉTRICA");
  assert.equal(et.disciplineResolution.method, "et-contract-code");

  const n1710Document = "PR-5290.00-22313-175-C1O-099";
  const n1710 = Core.buildEgrdtData(n1710Document, "A", `${n1710Document}_0001_A.pdf`, {
    ...technicalRecord(n1710Document, "DISCIPLINA SEM MAPA", { sheet: "N-1710", source: "LD_002.xlsx" }),
    documentType: "PR",
  }, "N-1710", "A4");
  assert.equal(n1710.discipline, "");
  assert.match(Core.validateEgrdtData(n1710).join("; "), /DISCIPLINA/i);

  const mapped = Core.buildEgrdtData(n1710Document, "A", `${n1710Document}_0001_A.pdf`, {
    ...technicalRecord(n1710Document, "RNEST UHDTD U-32 PROJETO", { sheet: "N-1710", source: "LD_002.xlsx" }),
    documentType: "PR",
  }, "N-1710", "A4");
  assert.equal(mapped.discipline, "ENGENHARIA DE PROJETO");
  assert.ok(Disciplines.isAllowed(mapped.discipline));
});

check("agrupamento, relatório e histórico usam a mesma disciplina oficial", () => {
  const records = [
    technicalRecord(cvDocument("0013", "ELE"), "ELE"),
    technicalRecord(cvDocument("0014", "CVL"), "CIVIL"),
  ];
  const rows = records.map((record) => {
    const row = triage(record, record.document);
    row.files = [{ name: row.name, finalName: row.finalName, file: { size: 10 } }];
    return row;
  });
  const plan = Emission.createPlan(rows, new Set([0, 1]));
  assert.deepEqual(plan.errors, []);
  const groups = Emission.splitPlan(plan, 48);
  assert.deepEqual(groups.map((group) => group.discipline).sort(), ["CIVIL", "ELÉTRICA"].sort());
  const summary = ReportSummary.buildRows(rows, {});
  assert.deepEqual(summary.map((row) => row.disciplineEgrdt), ["ELÉTRICA", "CIVIL"]);
  assert.deepEqual(
    ReportSummary.COLUMNS.filter((column) => column.key.startsWith("discipline")).map((column) => column.header),
    ["DISCIPLINA ENCONTRADA NA LD", "DISCIPLINA OFICIAL EGRDT", "REGRA DA DISCIPLINA"]
  );
  const history = History.recordFromGenerated({
    group: { entries: plan.entries },
    official: { baseName: "0130870-C1O-PGV-G-0001-2026" },
    fileName: "0130870-C1O-PGV-G-0001-2026.xls",
  }, rows, { generatedAt: "2026-09-08T12:00:00.000Z", outputType: "eGRDT" });
  assert.deepEqual(history.files.map((file) => file.discipline), ["ELÉTRICA", "CIVIL"]);
  assert.equal(History.filter([history], "ELÉTRICA").length, 1);
});

check("interface permite confirmar disciplina apenas por lista oficial", () => {
  const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(appSource, /row\.blockCode === "discipline_confirmation"/);
  assert.match(appSource, /manualDiscipline: selectedDiscipline/);
  assert.match(appSource, /setDrawerOptions\(els\.drawerDiscipline, C\.EGRDT_OPTIONS\.disciplines/);
  assert.match(htmlSource, /id="drawer-discipline-hint"/);
});

await checkAsync("eGRDT de CV é gerada, reaberta e validada contra o catálogo oficial", async () => {
  const record = technicalRecord(cvDocument("0015", "QUA"), "QUA");
  const row = triage(record);
  row.files = [{ name: row.name, finalName: row.finalName, file: { size: 10 } }];
  const plan = Emission.createPlan([row], new Set([0]));
  assert.deepEqual(plan.errors, []);
  const output = await Workbook.build(plan.items);
  const verified = await Workbook.verify(output, plan.items);
  assert.equal(verified.rows[0].discipline, "QUALIDADE");
  assert.ok(verified.rows.every((item) => Disciplines.isAllowed(item.discipline)));
  await assert.rejects(() => Workbook.build([{ ...plan.items[0], discipline: "DISCIPLINA LIVRE" }]), /fora da lista oficial/i);
});

await checkAsync("relatório Excel é reaberto com disciplina original, oficial e regra", async () => {
  const record = technicalRecord(cvDocument("0016", "ELE"), "ELE");
  const row = triage(record);
  const rows = ReportSummary.buildRows([row], {});
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Resumo");
  const layout = await ReportSummary.writeExecutiveSummarySheet(sheet, rows, { ldName: "LD_001.xlsx" });
  const bytes = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  const reopenedSheet = reopened.getWorksheet("Resumo");
  const headers = reopenedSheet.getRow(layout.headerRow).values.map((item) => String(item || ""));
  assert.ok(headers.includes("DISCIPLINA ENCONTRADA NA LD"));
  assert.ok(headers.includes("DISCIPLINA OFICIAL EGRDT"));
  assert.ok(headers.includes("REGRA DA DISCIPLINA"));
  const officialColumn = headers.indexOf("DISCIPLINA OFICIAL EGRDT");
  assert.equal(reopenedSheet.getCell(layout.headerRow + 1, officialColumn).value, "ELÉTRICA");
});

console.log(`✓ ${checks} verificações adicionais de disciplina concluídas.`);
