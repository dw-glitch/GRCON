import type { SigemPwState } from "../types/domain";
import { filterPwOperations, PW_INDICATORS, reconcilePwOperations, type PwFilters, type PwOperation, type PwOperationsReport } from "./sigemPwOperations";
import { getPwOriginalMatrix } from "./sigemPwRawPw";

type CellValue = string | number;
export type Matrix = CellValue[][];
/** Relação operacional consolidada; classes não aplicáveis ficam na conciliação. */
export const MAIN_SHEET = "Conferência Documental";
export interface CoordinatorPlan {
  sheets: Record<string, Matrix>;
  report: PwOperationsReport;
  revisions: string[];
  classSheets: string[];
  classFormulas: Record<string, CoordinatorPlan["formulas"]>;
  /** Excel rows for the main table (zero-based array indices start at row 4). Fórmulas das colunas F (revisão), G (state) e H (última emissão) lidas da aba REL. PW. */
  formulas: Array<{
    excelRow: number; f: string; g: string; h: string; results: [string, string, string];
    /** Situação PW do documento, usada apenas para o destaque visual da coluna Cadastro. */
    pwSituation: "emitted" | "registered" | "missing" | "notApplicable";
  }>;
  /** Linhas (1-based) da aba Resumo que são títulos de seção. */
  overviewSections: number[];
  summary: { active: number; registered: number; emitted: number; posted: number; pending: number };
  pwColumns: number;
}

interface ExcelCell {
  value: string | number | { formula: string; result: string };
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  alignment?: Record<string, unknown>;
  border?: Record<string, unknown>;
  numFmt?: string;
}
interface ExcelRow {
  height?: number;
  eachCell(options: { includeEmpty: boolean }, callback: (cell: ExcelCell) => void): void;
}
interface ExcelColumn { width?: number; numFmt?: string }
interface ExcelSheet {
  addImage?(imageId: number, position: Record<string, unknown>): void;
  addRow(row: CellValue[]): ExcelRow;
  getCell(address: string): ExcelCell;
  getRow(index: number): ExcelRow;
  getColumn(index: number): ExcelColumn;
  views?: Array<Record<string, unknown>>;
  autoFilter?: string;
  pageSetup?: Record<string, unknown>;
  headerFooter?: Record<string, unknown>;
}
interface ExcelWorkbook {
  addWorksheet(name: string): ExcelSheet;
  calcProperties?: { fullCalcOnLoad?: boolean };
  addImage?(image: { buffer: ArrayBuffer | Uint8Array; extension: "png" }): number;
  xlsx: { writeBuffer(): Promise<ArrayBuffer | Uint8Array> };
}
export interface CoordinatorExcelApi { Workbook: new () => ExcelWorkbook }
/** Logo opcional (PNG). Sem ele o relatório é gerado normalmente, só sem a marca. */
export interface CoordinatorLogo { buffer: ArrayBuffer | Uint8Array }
// Proporção do arquivo grcon-logo-report.png (900 × 250): azul-marinho/azul sobre fundo claro,
// por isso a faixa do cabeçalho que recebe a marca é branca.
const LOGO_WIDTH = 150;
const LOGO_HEIGHT = 42;

const REVISIONS = Object.freeze(["0", "A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"]);
export const COORDINATOR_HEADERS = Object.freeze([
  "DOCUMENTO", "REVISÃO", "TÍTULO", "STATUS LD", "SITUAÇÃO SIGEM", "REVISÃO PW",
  "STATE", "Última emissão", "AÇÃO", "Cadastro", "ABA", "STATUS SIGEM",
  ...REVISIONS.map(revision => "Rev. " + revision),
]);
const GRCON = Object.freeze({
  navy: "FF153A5C", ink: "FF253A50", slate: "FF657C90",
  teal: "FF087F75", white: "FFFFFFFF", pale: "FFF2F6F9",
  green: "FFE6F6EE", red: "FFFFEEEC", amber: "FFFFF4DF",
  border: "FFDCE5ED", muted: "FFEDF3F8",
});

/** Status do código na Consulta Geral do SIGEM: o da própria revisão; sem ela, o das outras revisões; sem nada, informa que não consta. */
function sigemStatusText(row: PwOperation): string {
  if (row.sigemStatus) return row.sigemStatus;
  if (row.inSigem) return "Consta no SIGEM, sem status informado";
  return row.sigemOtherStatus ? "Revisão não consta no SIGEM · " + row.sigemOtherStatus : "Não consta no SIGEM";
}
const text = (value: unknown): string => value == null ? "" : String(value);
function columnLetter(index: number): string {
  let n = index + 1; let output = "";
  while (n > 0) { n--; output = String.fromCharCode(65 + n % 26) + output; n = Math.floor(n / 26); }
  return output;
}
function findSourceColumn(state: SigemPwState, field: string): number {
  const raw = state.pw.meta?.pwRawHeaders;
  const original = state.pw.meta?.columns as Record<string, unknown> | undefined;
  if (!Array.isArray(raw) || !original) return -1;
  const named = original[field];
  if (!named) return -1;
  const needle = text(named).trim().toUpperCase();
  return raw.findIndex(value => text(value).trim().toUpperCase() === needle);
}
function sourceFormula(sourceRow: number, sourceColumn: number): string {
  if (sourceRow < 2 || sourceColumn < 0) return '""';
  return `IFERROR('REL. PW'!$${columnLetter(sourceColumn)}$${sourceRow},"")`;
}

/** Same immutable operation report as the dashboard. Default export is the full scope. */
export function coordinatorPlan(state: SigemPwState, filters: PwFilters = {}): CoordinatorPlan {
  const report = filterPwOperations(reconcilePwOperations(state), filters);
  if (!report.ready) throw new Error(report.reason || "Conciliação indisponível.");
  const pw = getPwOriginalMatrix(state.pw);
  if (pw.originalColumnCount !== 70) throw new Error(`O modelo do coordenador exige 70 colunas PW (A–BR), mas a fonte tem ${pw.originalColumnCount}. Reimporte a consulta correta.`);
  const summary = {
    active: report.rows.length, registered: report.totals.registered,
    emitted: report.totals.issued, posted: report.totals.sigem,
    pending: report.totals.registerSigem + report.totals.registerAbsent + report.totals.issue,
  };
  const revisions = [...new Set([...REVISIONS, ...report.rows.map(row => row.revision)])];
  const headers = [...COORDINATOR_HEADERS.slice(0, 12), ...revisions.map(rev => "Rev. " + rev)];
  const header1: CellValue[] = Array(headers.length).fill("");
  const header2: CellValue[] = Array(headers.length).fill("");
  [header1[0], header1[1], header1[2], header1[3], header1[4], header1[5], header1[6], header1[7], header1[8], header1[9]] =
    ["CONTROLE PW • GRCON", "REVISÕES", summary.active, "PW CAD.", summary.registered, "PW EMIT.", summary.emitted, "SIGEM", summary.posted, summary.pending];
  header2[0] = "Revisão de documento"; header2[5] = "Evidência PW";
  revisions.forEach((rev, index) => {
    header2[index + 12] = rev;
    header1[index + 12] = report.rows.filter(row => row.revision === rev && !row.pwEmitted).length;
  });
  const master: Matrix = [header1, header2, headers];
  const sourceNumbers = new Map<number, number>();
  pw.sourceRows.forEach((number, index) => { if (number > 0 && !sourceNumbers.has(number)) sourceNumbers.set(number, index + 2); });
  const revisionColumn = findSourceColumn(state, "revisionComplete") >= 0 ? findSourceColumn(state, "revisionComplete") : findSourceColumn(state, "revision");
  const statusColumn = findSourceColumn(state, "state");
  const emissionColumn = findSourceColumn(state, "lastEmission");
  if (report.rows.some(row => row.pwRegistered) && [revisionColumn, statusColumn, emissionColumn].some(column => column < 0)) {
    throw new Error("Os atributos originais de revisão, estado ou emissão PW não estão identificados. Reimporte a consulta antes de exportar fórmulas.");
  }
  const formulas: CoordinatorPlan["formulas"] = [];
  const classSheets: string[] = [];
  const classFormulas: CoordinatorPlan["classFormulas"] = Object.create(null);
  const sheets: Record<string, Matrix> = Object.create(null);
  const classNames = new Map<string, string>();
  const reserved = new Set(["resumo", MAIN_SHEET.toLowerCase(), "rel. pw", "fora das lds", "conciliação"]);
  for (const entry of report.byClass) {
    const base = entry.documentClass.replace(/[\\/?*:[\]]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Sem classe";
    let name = base; let suffix = 2;
    while (reserved.has(name.toLowerCase())) { const tail = " (" + suffix++ + ")"; name = base.slice(0, 31 - tail.length) + tail; }
    reserved.add(name.toLowerCase()); classNames.set(entry.documentClass, name); classSheets.push(name);
    sheets[name] = [[...header1], [...header2], [...headers]]; classFormulas[name] = [];
  }
  for (const row of report.rows) {
    const evidence = row.pwEvidence;
    const sourceRow = sourceNumbers.get(Number(evidence?.sourceRow)) || -1;
    if (evidence && sourceRow < 2) throw new Error("O documento " + row.code + " não possui vínculo com a linha original PW. Reimporte a consulta.");
    const results: [string, string, string] = [text(evidence?.revisionComplete || evidence?.revision), text(evidence?.state || evidence?.status), text(evidence?.lastEmission)];
    const info: CoordinatorPlan["formulas"][number] = {
      excelRow: master.length + 1, f: sourceFormula(sourceRow, revisionColumn), g: sourceFormula(sourceRow, statusColumn), h: sourceFormula(sourceRow, emissionColumn), results,
      // Só a revisão 0 é cadastro; de A em diante a coluna Cadastro não se aplica (a revisão é emissão).
      pwSituation: row.revision !== "0" ? "notApplicable" : !row.pwRegistered ? "missing" : row.pwEmitted ? "emitted" : "registered",
    };
    formulas.push(info);
    const values = [row.code, row.revision, row.title, row.referenceStatus, row.sigemSituation,
      ...results, row.action, row.revision !== "0" ? "Emissão (não é cadastro)" + (row.missingBefore.length ? " · FORA DE SEQUÊNCIA: falta " + row.missingBefore.join(", ") : "") : row.pwRegistered ? "Cadastrado" : "Não cadastrado", row.documentClass, sigemStatusText(row),
      ...revisions.map(rev => row.revision === rev && !row.pwEmitted ? "X" : "")];
    master.push(values);
    const name = classNames.get(row.documentClass)!;
    classFormulas[name].push({ ...info, excelRow: sheets[name].length + 1 }); sheets[name].push([...values]);
  }
  for (const entry of report.byClass) {
    const name = classNames.get(entry.documentClass)!;
    const h = sheets[name][0];
    h[2] = classFormulas[name].length; h[4] = entry.registered; h[6] = entry.issued; h[8] = entry.sigem;
    h[9] = entry.registerSigem + entry.registerAbsent + entry.issue;
    revisions.forEach((rev, index) => { h[index + 12] = report.rows.filter(row => row.documentClass === entry.documentClass && row.revision === rev && !row.pwEmitted).length; });
  }
  const overview: Matrix = [["GRCON | SIGEM × PW", "DEMANDA DA EQUIPE PW"], ["INDICADOR", "REVISÕES DE DOCUMENTOS"]];
  const overviewSections: number[] = [];
  const section = (title: string) => { overview.push([title, ""]); overviewSections.push(overview.length); };
  section("VISÃO GERAL");
  for (const indicator of PW_INDICATORS) overview.push([indicator.label, report.totals[indicator.key]]);
  overview.push(["Como contar", "Cada revisão de cada documento conta uma vez (exemplo: o documento X nas revisões 0 e A são 2 revisões de documentos)"]);
  overview.push(["Escopo exportado", Object.values(filters).some(v => v && v !== "all") ? "Filtros da relação operacional: " + JSON.stringify(filters) : "Completo: todas as classes e revisões das bases ativas"]);
  section("PENDÊNCIAS POR CLASSE");
  overview.push(["Classe", "A cadastrar — já constam no SIGEM", "A cadastrar — não constam no SIGEM", "A emitir no PW"]);
  for (const row of report.byClass) overview.push([row.documentClass, row.registerSigem, row.registerAbsent, row.issue]);
  overview.push(["TOTAL", report.totals.registerSigem, report.totals.registerAbsent, report.totals.issue]);
  section("ORIENTAÇÃO DE LEITURA");
  overview.push(["Regra do PW", "Só a revisão 0 é cadastro; da revisão A em diante cada revisão é uma emissão. Se o SIGEM está em B, o PW precisa emitir 0, A e depois B, nessa ordem"]);
  overview.push(["Ação: Cadastrar no PW", "Revisão 0 ainda sem cadastro no PW"]);
  overview.push(["Ação: Emitir no PW", "Revisão 0 já cadastrada, ou revisão A em diante, com emissão pendente"]);
  overview.push(["Coluna STATUS SIGEM", "Status do código na Consulta Geral do SIGEM (ex.: Postado, Não Postado). Se a revisão da linha não consta no SIGEM, mostra o status das outras revisões do código"]);
  overview.push(["Fora de sequência", "Revisão emitida enquanto uma revisão anterior (0, A, B…) ainda não foi emitida; aparece na coluna Cadastro e na relação, sem alterar as contagens"]);
  overview.push(["Ação: Concluído", "Emissão comprovada da revisão indicada"]);
  overview.push(["X na revisão", "Revisão exata a trabalhar no PW; emitidas não recebem X"]);
  overview.push(["Não constam no SIGEM", "A revisão não aparece na Consulta Geral; isso não comprova que falta postar"]);
  overview.push(["Gerado em", new Date().toLocaleString("pt-BR")]);
  overview.push(["Consulta Geral", text(state.sigem.meta?.fileName)]);
  overview.push(["Data da Consulta Geral", text(state.sigem.meta?.referenceDate || state.sigem.meta?.importedAt)]);
  overview.push(["PW", text(state.pw.meta?.fileName)]);
  overview.push(["Data da base PW", text(state.pw.meta?.importedAt)]);
  overview.push(["Referências", text(state.ld.meta?.fileName)]);
  const r = report.reconciliation;
  const reconciliation: Matrix = [["CONCILIAÇÃO DA CONSULTA GERAL INTEGRAL", "QUANTIDADE"],
    ["Registros disponíveis da Consulta Geral ativa", r.records], ["Documentos únicos (inclui revisão desconhecida)", r.documents],
    ["Revisões de documentos únicas e válidas", r.pairs], ["Revisões que constam nas LDs (antes das exceções operacionais)", r.inScopePairs],
    ["Revisões que não constam nas LDs", r.outsidePairs], ["Repetições adicionais de revisões válidas", r.duplicates],
    ["Registros sem código ou revisão interpretável", r.invalid], ["Linhas da fonte não disponibilizadas pelo importador", r.omitted === null ? "Não informado pela fonte" : r.omitted],
    ["Critério PW", "Somente CSG/QTM na coluna C; Previsto = cadastrado"],
    ["Exceções", "CV, cancelados e inconsistências ficam fora dos totais operacionais"],
    [], ["ORIGEM", "DOCUMENTO", "REVISÃO", "MOTIVO", "LINHA DE ORIGEM"]];
  for (const row of report.diagnostics) reconciliation.push([row.source, row.code, row.revision, row.reason, row.sourceRow]);
  reconciliation.push([], ["FONTES POR PENDÊNCIA", "DOCUMENTO", "REVISÃO", "REFERÊNCIAS"]);
  for (const row of report.rows) reconciliation.push(["LD", row.code, row.revision, row.sources.join("; ")]);
  const outside: Matrix = [["ORIGEM", "DOCUMENTO", "REVISÃO", "MOTIVO", "LINHA DE ORIGEM"]];
  for (const row of report.outside) outside.push([row.source, row.code, row.revision, row.reason, row.sourceRow]);
  return { sheets: { Resumo: overview, [MAIN_SHEET]: master, ...sheets, "REL. PW": [pw.headers, ...pw.rows], "Conciliação": reconciliation,
    ...(outside.length > 1 ? { "Fora das LDs": outside } : {}) },
    report, revisions, classSheets, classFormulas, formulas, summary, pwColumns: pw.originalColumnCount, overviewSections };
}
/** Compatibility for tests/consumers of the earlier matrix-only contract. */
export function coordinatorSheets(state: SigemPwState): CoordinatorPlan["sheets"] {
  return coordinatorPlan(state).sheets;
}
function formatHeader(cell: ExcelCell, fill: string = GRCON.navy): void {
  cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: GRCON.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: GRCON.border } } };
}
function placeLogo(workbook: ExcelWorkbook, sheet: ExcelSheet, logo: CoordinatorLogo | undefined, position: Record<string, unknown>): void {
  if (!logo || !workbook.addImage || !sheet.addImage) return;
  const id = workbook.addImage({ buffer: logo.buffer, extension: "png" });
  sheet.addImage(id, { ...position, ext: { width: LOGO_WIDTH, height: LOGO_HEIGHT } });
}
function styleMain(sheet: ExcelSheet, plan: CoordinatorPlan): void {
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 3, topLeftCell: "C4" }];
  sheet.autoFilter = `A3:${columnLetter(11 + plan.revisions.length)}${Math.max(3, plan.sheets[MAIN_SHEET].length)}`;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "1:3" };
  sheet.headerFooter = { oddFooter: "&LGRCON · SIGEM × PW&CPágina &P de &N&R&D" };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 35;
  sheet.getColumn(1).width = 43;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 42;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 25;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 19;
  sheet.getColumn(8).width = 18;
  sheet.getColumn(9).width = 22;
  sheet.getColumn(10).width = 19;
  sheet.getColumn(11).width = 14;
  sheet.getColumn(12).width = 30;
  for (let index = 13; index <= 12 + plan.revisions.length; index++) sheet.getColumn(index).width = 10;
  // Excel rows 4+ are actual data, never inject unrelated title rows.
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].forEach(index => sheet.getColumn(index).numFmt = "@");
  for (let column = 0; column < 12 + plan.revisions.length; column++) {
    formatHeader(sheet.getCell(`${columnLetter(column)}3`));
    const top = sheet.getCell(`${columnLetter(column)}1`);
    formatHeader(top, column >= 12 ? GRCON.teal : GRCON.navy);
    const group = sheet.getCell(`${columnLetter(column)}2`);
    formatHeader(group, GRCON.slate);
  }
  // Faixa de marca (A1:J1): fundo branco para a logo e indicadores em azul-marinho.
  sheet.getRow(1).height = 58;
  for (let column = 0; column < 10; column++) {
    const cell = sheet.getCell(`${columnLetter(column)}1`);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.white } };
    cell.border = { bottom: { style: "medium", color: { argb: GRCON.navy } } };
    cell.alignment = { vertical: "middle", horizontal: column === 0 ? "left" : "center", wrapText: false };
    const isValue = column === 2 || column === 4 || column === 6 || column === 8 || column === 9;
    cell.font = column === 0
      ? { name: "Aptos", size: 9, bold: true, color: { argb: GRCON.navy } }
      : isValue ? { name: "Aptos", size: 13, bold: true, color: { argb: GRCON.navy } }
      : { name: "Aptos", size: 8, bold: true, color: { argb: GRCON.slate } };
    if (isValue) cell.numFmt = column === 9 ? '"PENDÊNCIAS: "0' : "#,##0";
  }
  sheet.getCell("A1").alignment = { vertical: "bottom", horizontal: "left" };
  for (let idx = 0; idx < plan.formulas.length; idx++) {
    const info = plan.formulas[idx];
    const excelRow = info.excelRow;
    const row = sheet.getRow(excelRow);
    row.height = 32;
    sheet.getCell(`C${excelRow}`).alignment = { vertical: "middle", wrapText: true };
    sheet.getCell(`E${excelRow}`).alignment = { vertical: "middle", wrapText: true };
    // Style only operational cells: avoid huge per-cell styles on data sources.
    for (const column of ["A", "B", "I"]) {
      const cell = sheet.getCell(`${column}${excelRow}`);
      cell.font = { name: "Aptos", size: 9, color: { argb: GRCON.ink } };
      cell.alignment = { vertical: "middle", wrapText: false };
      if (idx % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.pale } };
    }
    const registration = sheet.getCell(`J${excelRow}`);
    registration.font = { name: "Aptos", size: 9, bold: info.pwSituation !== "registered", color: { argb: GRCON.ink } };
    registration.alignment = { vertical: "middle", horizontal: "center" };
    const registrationFill = info.pwSituation === "emitted" ? GRCON.green
      : info.pwSituation === "registered" ? "FFE8F2FF"
      : info.pwSituation === "missing" ? GRCON.amber : GRCON.muted;
    registration.fill = { type: "pattern", pattern: "solid", fgColor: { argb: registrationFill } };
    const sigemStatus = sheet.getCell(`L${excelRow}`);
    sigemStatus.font = { name: "Aptos", size: 9, color: { argb: GRCON.ink } };
    sigemStatus.alignment = { vertical: "middle", wrapText: true };
    const aba = sheet.getCell(`K${excelRow}`);
    aba.font = { name: "Aptos", size: 9, bold: true, color: { argb: GRCON.navy } };
    aba.alignment = { vertical: "middle", horizontal: "center" };
    const action = text(plan.sheets[MAIN_SHEET][excelRow - 1][8]);
    const situation = sheet.getCell(`I${excelRow}`);
    if (action === "Concluído") situation.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.green } };
    else if (action === "Emitir no PW") situation.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F2FF" } };
    else situation.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.amber } };
    for (const [col, formula, result] of [
      ["F", info.f, info.results[0]], ["G", info.g, info.results[1]],
      ["H", info.h, info.results[2]],
    ] as const) {
      const cell = sheet.getCell(`${col}${excelRow}`);
      // Formula strings are generated by the application only. Source text
      // remains a literal string; gerador de planilhas does not interpret it as a formula.
      cell.value = { formula, result };
      cell.numFmt = "@";
    }
  }
}
function styleOverview(sheet: ExcelSheet, plan: CoordinatorPlan): void {
  const rows = plan.sheets.Resumo.length;
  sheet.views = [{ state: "frozen", ySplit: 2, topLeftCell: "A3" }];
  sheet.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "1:2" };
  sheet.headerFooter = { oddFooter: "&LGRCON · SIGEM × PW&CPágina &P de &N&R&D" };
  sheet.getColumn(1).width = 48;
  sheet.getColumn(2).width = 45;
  sheet.getColumn(3).width = 30;
  sheet.getColumn(4).width = 22;
  sheet.getRow(2).height = 27;
  for (const col of ["A", "B"]) {
    formatHeader(sheet.getCell(col + "2"), GRCON.teal);
    const top = sheet.getCell(col + "1");
    top.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.white } };
    top.border = { bottom: { style: "medium", color: { argb: GRCON.navy } } };
    top.font = { name: "Aptos", size: col === "A" ? 16 : 10, bold: true, color: { argb: GRCON.navy } };
    top.alignment = { vertical: "middle", horizontal: col === "A" ? "left" : "right" };
  }
  sheet.getRow(1).height = 58;
  const sections = new Set(plan.overviewSections);
  for (let index = 3; index <= rows; index++) {
    const label = sheet.getCell("A" + index);
    const value = sheet.getCell("B" + index);
    sheet.getRow(index).height = sections.has(index) ? 24 : typeof plan.sheets.Resumo[index - 1][1] === "number" ? 26 : 44;
    for (const col of ["C", "D"]) {
      const cell = sheet.getCell(col + index);
      cell.font = { name: "Aptos", size: 10, color: { argb: GRCON.ink } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.numFmt = "#,##0";
    }
    if (sections.has(index)) {
      for (const cell of [label, value, sheet.getCell("C" + index), sheet.getCell("D" + index)]) {
        cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: GRCON.navy } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.muted } };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = { bottom: { style: "thin", color: { argb: GRCON.border } } };
      }
      continue;
    }
    label.font = { name: "Aptos", size: 10, color: { argb: GRCON.ink } };
    value.font = { name: "Aptos", size: 10, bold: typeof plan.sheets.Resumo[index - 1][1] === "number", color: { argb: GRCON.ink } };
    label.alignment = { vertical: "middle", wrapText: true };
    value.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    value.border = { bottom: { style: "hair", color: { argb: GRCON.border } } };
    label.border = { bottom: { style: "hair", color: { argb: GRCON.border } } };
    if (/^Atendimento/.test(text(plan.sheets.Resumo[index - 1][0]))) value.numFmt = "0.0%";
    else if (typeof plan.sheets.Resumo[index - 1][1] === "number") value.numFmt = "#,##0";
  }
}
function styleOutside(sheet: ExcelSheet, rows: number): void {
  sheet.views = [{ state: "frozen", ySplit: 1, topLeftCell: "A2" }];
  sheet.autoFilter = `A1:E${Math.max(1, rows)}`;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "1:1" };
  sheet.getRow(1).height = 30;
  [14, 48, 12, 65, 18].forEach((width, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = width;
    column.numFmt = "@";
    formatHeader(sheet.getCell(`${columnLetter(index)}1`), GRCON.slate);
  });
}
function stylePw(sheet: ExcelSheet, dataRows: number, columns: number): void {
  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 1, topLeftCell: "D2" }];
  sheet.autoFilter = `A1:${columnLetter(columns - 1)}${Math.max(1, dataRows)}`;
  sheet.getRow(1).height = 35;
  for (let col = 0; col < columns; col++) {
    const c = sheet.getColumn(col + 1);
    c.width = col === 0 ? 44 : col === 2 ? 19 : 20;
    c.numFmt = "@";
    formatHeader(sheet.getCell(`${columnLetter(col)}1`));
  }
}
export function buildCoordinatorWorkbook(state: SigemPwState, excel: CoordinatorExcelApi, logo?: CoordinatorLogo, filters: PwFilters = {}): { workbook: ExcelWorkbook; plan: CoordinatorPlan } {
  const plan = coordinatorPlan(state, filters);
  const workbook = new excel.Workbook();
  if (workbook.calcProperties) workbook.calcProperties.fullCalcOnLoad = true;
  const overview = workbook.addWorksheet("Resumo");
  plan.sheets.Resumo.forEach(row => overview.addRow(row));
  styleOverview(overview, plan);
  // Resumo: logo à esquerda da coluna B, título à esquerda e subtítulo à direita.
  placeLogo(workbook, overview, logo, { tl: { col: 3.05, row: 0.18 } });
  const main = workbook.addWorksheet(MAIN_SHEET);
  plan.sheets[MAIN_SHEET].forEach(row => main.addRow(row));
  styleMain(main, plan);
  placeLogo(workbook, main, logo, { tl: { col: 0.05, row: 0.06 } });
  for (const name of plan.classSheets) {
    const sheet = workbook.addWorksheet(name);
    plan.sheets[name].forEach(row => sheet.addRow(row));
    styleMain(sheet, { ...plan, sheets: { ...plan.sheets, [MAIN_SHEET]: plan.sheets[name] }, formulas: plan.classFormulas[name] });
  }
  const pw = workbook.addWorksheet("REL. PW");
  plan.sheets["REL. PW"].forEach(row => pw.addRow(row));
  stylePw(pw, plan.sheets["REL. PW"].length, plan.pwColumns);
  const reconciliation = workbook.addWorksheet("Conciliação");
  plan.sheets["Conciliação"].forEach(row => reconciliation.addRow(row));
  styleOutside(reconciliation, plan.sheets["Conciliação"].length);
  reconciliation.autoFilter = undefined;
  reconciliation.getColumn(1).width = 55;
  reconciliation.getColumn(4).width = 65;
  if (plan.sheets["Fora das LDs"]) {
    const outside = workbook.addWorksheet("Fora das LDs");
    plan.sheets["Fora das LDs"].forEach(row => outside.addRow(row));
    styleOutside(outside, plan.sheets["Fora das LDs"].length);
  }
  // A fonte SIGEM permanece a Consulta Geral; nenhum dado fictício é exportado.
  return { workbook, plan };
}
async function loadLogo(): Promise<CoordinatorLogo | undefined> {
  try {
    const brand = (window as unknown as { GRCONBrandAssets?: { reportLogoFile?: string } }).GRCONBrandAssets;
    const response = await fetch(brand?.reportLogoFile || "grcon-logo-report.png");
    if (!response.ok) return undefined;
    return { buffer: await response.arrayBuffer() };
  } catch {
    return undefined; // a marca é opcional: nunca impede o relatório
  }
}
export async function downloadCoordinatorWorkbook(state: SigemPwState, excel: CoordinatorExcelApi, filters: PwFilters = {}): Promise<void> {
  const { workbook } = buildCoordinatorWorkbook(state, excel, await loadLogo(), filters);
  const data = await workbook.xlsx.writeBuffer();
  const file = new Blob([data as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(file);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "GRCON_SIGEM_PW_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}
