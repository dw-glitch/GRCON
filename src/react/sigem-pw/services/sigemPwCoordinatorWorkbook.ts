import type { SigemPwRecord, SigemPwState } from "../types/domain";
import { managerialDocumentKey, reconcileManagerial, type ManagerialDocument } from "./sigemPwManagerial";
import { getPwOriginalMatrix } from "./sigemPwRawPw";

type CellValue = string | number;
export type Matrix = CellValue[][];
/** Aba principal: todos os documentos conferidos (ET, N-1710 e CV), não só N-1710. */
export const MAIN_SHEET = "Conferência Documental";
export interface CoordinatorPlan {
  sheets: Record<"Resumo" | typeof MAIN_SHEET | "REL. PW", Matrix> & { "Fora das LDs"?: Matrix };
  /** Excel rows for the main table (zero-based array indices start at row 4). Fórmulas das colunas F (revisão), G (state) e H (última emissão) lidas da aba REL. PW. */
  formulas: Array<{
    excelRow: number; f: string; g: string; h: string; results: [string, string, string];
    /** Situação PW do documento, usada apenas para o destaque visual da coluna Cadastro. */
    pwSituation: "emitted" | "registered" | "missing" | "notApplicable";
  }>;
  /** Linhas (1-based) da aba Resumo que são títulos de seção. */
  overviewSections: number[];
  summary: { active: number; registered: number; emitted: number; posted: number; compliant: number; pending: number };
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
  "DOCUMENTO", "REVISÃO", "TÍTULO", "STATUS", "STATUS SIGEM", "REVISÃO",
  "STATE", "Última emissão", "AÇÃO", "Cadastro", "ABA",
  ...REVISIONS.map(revision => "Rev. " + revision),
]);
const GRCON = Object.freeze({
  navy: "FF153A5C", ink: "FF253A50", slate: "FF657C90",
  teal: "FF087F75", white: "FFFFFFFF", pale: "FFF2F6F9",
  green: "FFE6F6EE", red: "FFFFEEEC", amber: "FFFFF4DF",
  border: "FFDCE5ED", muted: "FFEDF3F8",
});

const text = (value: unknown): string => value == null ? "" : String(value);
const revisionKey = (value: unknown) => text(value).trim().toUpperCase().replace(/^REV(?:ISAO|ISÃO)?[.]?\s*/, "");
const sameRevision = (a: unknown, b: unknown): boolean => !!revisionKey(a) && revisionKey(a) === revisionKey(b);
const safeNumber = (value: number | null): number => {
  if (value === null) throw new Error("Os totais gerenciais estão inconclusivos. Confira as fontes antes de exportar.");
  return value;
};
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
function indexPwRecords(state: SigemPwState): Map<string, SigemPwRecord[]> {
  const map = new Map<string, SigemPwRecord[]>();
  for (const record of state.model?.normalizedPw || []) {
    const key = managerialDocumentKey(record);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(record);
  }
  return map;
}
function sourceRowBinding(
  row: ManagerialDocument,
  key: string,
  indexed: Map<string, SigemPwRecord[]>,
  sourceNumbers: Map<number, number>,
): number {
  const candidates = indexed.get(key) || [];
  const eligible = candidates.filter(item => sourceNumbers.has(Number(item.sourceRow)));
  if (!eligible.length) return -1;
  const matching = eligible.filter(item => sameRevision(item.revisionComplete || item.revision, row.pwRevision));
  const options = matching.length ? matching : eligible;
  const selected = options.find(item =>
    text(item.state).trim() === row.pwState && text(item.lastEmission).trim() === row.pwLastEmission
  ) || options.find(item => text(item.lastEmission).trim().toUpperCase() === "SIM") || options[0];
  return sourceNumbers.get(Number(selected.sourceRow)) || -1;
}
function sourceFormula(sourceRow: number, sourceColumn: number): string {
  if (sourceRow < 2 || sourceColumn < 0) return '""';
  return `IFERROR('REL. PW'!$${columnLetter(sourceColumn)}$${sourceRow},"")`;
}

/**
 * A plan has exactly the three original sheets. It is shared by the previewable
 * matrix tests and the gerador de planilhas writer: no extra "Resumo" or synthetic SIGEM rows.
 */
export function coordinatorPlan(state: SigemPwState): CoordinatorPlan {
  const report = reconcileManagerial(state);
  if (!report.ready) throw new Error(report.reason || "Conciliação gerencial indisponível.");
  // The original model is A:BR. Never silently fabricate/truncate PW attributes.
  const pw = getPwOriginalMatrix(state.pw);
  if (pw.originalColumnCount !== 70) {
    throw new Error(`O modelo do coordenador exige 70 colunas PW (A–BR), mas a fonte tem ${pw.originalColumnCount}. Confira e reimporte a consulta correta.`);
  }
  const summary = {
    active: safeNumber(report.summary.active), registered: safeNumber(report.summary.registered),
    emitted: safeNumber(report.summary.emitted), posted: safeNumber(report.summary.posted),
    compliant: safeNumber(report.summary.compliant), pending: safeNumber(report.summary.pending),
  };
  const header1: CellValue[] = Array(32).fill("");
  const header2: CellValue[] = Array(32).fill("");
  const totals = new Map(REVISIONS.map(r => [r, 0]));
  // Indicadores de documentos únicos: nunca somar revisões para obter total oficial.
  // As colunas de revisão começam em K; por isso as pendências ocupam J (valor numérico
  // com formato "PENDÊNCIAS: n") em vez de um par rótulo/valor.
  [header1[0], header1[1], header1[2], header1[3], header1[4],
   header1[5], header1[6], header1[7], header1[8], header1[9]] =
  ["CONTROLE DOCUMENTAL • GRCON", "ATIVOS", summary.active, "PW CAD.", summary.registered,
   "PW EMIT.", summary.emitted, "SIGEM", summary.posted, summary.pending];
  header2[0] = "LD"; header2[5] = "PW";
  REVISIONS.forEach((rev, index) => { header2[index + 11] = rev; });
  const master: Matrix = [header1, header2, [...COORDINATOR_HEADERS]];
  const indexed = indexPwRecords(state);
  const ldByCode = new Map<string, string>();
  for (const reference of state.ld.records) {
    const code = text(reference.canonicalDocument || reference.document || reference.documentKey);
    if (!ldByCode.has(code)) ldByCode.set(code, managerialDocumentKey(reference));
  }
  const sourceNumbers = new Map<number, number>();
  pw.sourceRows.forEach((number, index) => {
    if (number > 0 && !sourceNumbers.has(number)) sourceNumbers.set(number, index + 2);
  });
  const revisionColumn = findSourceColumn(state, "revisionComplete") >= 0
    ? findSourceColumn(state, "revisionComplete") : findSourceColumn(state, "revision");
  const statusColumn = findSourceColumn(state, "state");
  const emissionColumn = findSourceColumn(state, "lastEmission");
  const formulas: CoordinatorPlan["formulas"] = [];
  for (const row of report.rows) {
    const available = new Set(row.pwRevisions.map(revisionKey));
    REVISIONS.forEach(revision => { if (available.has(revision)) totals.set(revision, (totals.get(revision) || 0) + 1); });
    const number = master.length + 1;
    const sourceRow = sourceRowBinding(row, ldByCode.get(row.code) || "", indexed, sourceNumbers);
    if (row.pwRegistered && sourceRow < 2) {
      throw new Error("O documento " + row.code + " não possui vínculo com a linha original PW. Reimporte a consulta para exportação fiel.");
    }
    // Cached display values and formulas always describe the SAME selected PW
    // evidence row, rather than pairing statuses from different revisions.
    const f = sourceFormula(sourceRow, revisionColumn);
    const g = sourceFormula(sourceRow, statusColumn);
    const h = sourceFormula(sourceRow, emissionColumn);
    const results: [string, string, string] = [row.pwRevision, row.pwState, row.pwLastEmission];
    const pwSituation: CoordinatorPlan["formulas"][number]["pwSituation"] = row.pwNotApplicable ? "notApplicable"
      : !row.pwRegistered ? "missing" : row.pwEmitted ? "emitted" : "registered";
    formulas.push({ excelRow: number, f, g, h, results, pwSituation });
    master.push([
      row.code, row.referenceRevision, row.title, row.referenceStatus, row.sigemStatus,
      ...results, row.action, row.pwNotApplicable ? "Não aplicável (CV)"
        : row.pwRegistered ? "Cadastrado" : "Não cadastrado",
      row.sheet,
      ...REVISIONS.map(revision => available.has(revision) ? "x" : ""),
    ]);
  }
  REVISIONS.forEach((rev, index) => { header1[index + 11] = totals.get(rev) || 0; });
  // O modelo do coordenador é referência de INFORMAÇÕES, não de ordem visual.
  // A aba antes vazia ("SIGEM") dá lugar a um resumo útil sem fabricar
  // linhas da Consulta Geral. A base PW mantém todas as 70 colunas originais.
  const sum = report.summary;
  const dependsOnPw = safeNumber(sum.pwApplicable);
  const awaiting = safeNumber(sum.awaitingRegistration);
  const notEmitted = safeNumber(sum.registeredNotEmitted);
  const registeredShare = dependsOnPw - awaiting;
  const emittedShare = registeredShare - notEmitted;
  const ratio = (part: number) => dependsOnPw ? part / dependsOnPw : 0;
  const dateOf = (value: unknown) => {
    const date = new Date(text(value));
    return text(value) && !Number.isNaN(date.getTime()) ? date.toLocaleString("pt-BR") : "";
  };
  const overviewSections: number[] = [];
  const overview: Matrix = [];
  const line = (label: string, value: CellValue = "") => { overview.push([label, value]); };
  const section = (title: string) => { overview.push([title, ""]); overviewSections.push(overview.length); };
  line("GRCON | SIGEM × PW", "CONTROLE DOCUMENTAL INTEGRADO");
  line("INDICADOR / FONTE", "VALOR");
  section("UNIVERSO E CADASTRO NO PW");
  line("Universo analisado (documentos únicos nas referências vigentes)", summary.active);
  line("Cadastrados no PW (CSG/QTM)", summary.registered);
  line("Emitidos no PW", summary.emitted);
  line("Aguardando cadastro no PW", awaiting);
  line("Cadastrados, não emitidos", notEmitted);
  line("Atendimento — cadastrados (% dos que dependem do PW)", ratio(registeredShare));
  line("Atendimento — emitidos (% dos que dependem do PW)", ratio(emittedShare));
  section("ACOMPANHAMENTO NO SIGEM");
  line("Postados no SIGEM", summary.posted);
  line("Em conformidade", summary.compliant);
  line("Com pendência ou em andamento", summary.pending);
  section("FORA DO UNIVERSO E CONFLITOS");
  line("Cancelados nas referências", report.summary.cancelled);
  line("Conflitos entre referências", report.summary.conflicts);
  line("SIGEM fora das referências (aba “Fora das LDs”)", report.excludedSigem);
  line("PW fora das referências (aba “Fora das LDs”)", report.excludedPw);
  section("ORIGEM DOS DADOS");
  line("Gerado em", new Date().toLocaleString("pt-BR"));
  line("Consulta Geral utilizada", text(state.sigem.meta?.fileName));
  line("Data da Consulta Geral", dateOf(state.sigem.meta?.referenceDate || state.sigem.meta?.importedAt));
  line("Base PW utilizada", text(state.pw.meta?.fileName));
  line("Data da base PW", dateOf(state.pw.meta?.importedAt));
  line("Referências documentais", text(state.ld.meta?.fileName));
  line("Empresa considerada (PW, coluna C)", "CSG / QTM");
  section("CRITÉRIOS");
  line("Critério de análise", "Código e revisão independentes; Previsto no PW = cadastrado, não emitido");
  line("Percentuais", "Calculados sobre os documentos que dependem do PW (exclui CV e cancelados)");
  line("Observação", "Comentários da fiscalização não equivalem a conformidade plena");
  line("Fonte do SIGEM", "Consulta Geral ativa do GRCON; não preencher dados fictícios");
  // Documentos fora das LDs ficam separados e não entram nos indicadores acima.
  // Usa SEMPRE o agregado completo (todas as revisões, todas as classes), nunca
  // a lista filtrada que esteja na tela.
  const lists = (state.aggregates?.["all:all"] || state.result)?.lists;
  const outside: Matrix = [["ORIGEM", "DOCUMENTO", "REVISÃO", "STATUS SIGEM", "STATUS PW", "EMISSÃO PW", "EMPRESA PW (COL. C)", "LINHA NO ARQUIVO PW", "SITUAÇÃO", "CLASSE"]];
  const seenOutside = new Set<string>();
  for (const [origin, rows] of [["SIGEM", lists?.sigemN1710OutsideLd || []], ["PW", lists?.pwN1710OutsideLd || []]] as const) {
    for (const item of rows) {
      const mark = origin + "|" + text(item.document) + "|" + text(item.revision);
      if (seenOutside.has(mark)) continue;
      seenOutside.add(mark);
      outside.push([origin, text(item.document), text(item.revision), text(item.sigemStatus), text(item.pwStatus), text(item.pwEmission), text(item.pwCompany), text(item.pwSourceRow), text(item.situation), text(item.documentClass)]);
    }
  }
  return {
    sheets: {
      "Resumo": overview, [MAIN_SHEET]: master, "REL. PW": [pw.headers, ...pw.rows],
      ...(outside.length > 1 ? { "Fora das LDs": outside } : {}),
    },
    formulas, summary, pwColumns: 70, overviewSections,
  };
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
  sheet.autoFilter = `A3:AF${Math.max(4, plan.sheets[MAIN_SHEET].length)}`;
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
  sheet.getColumn(9).width = 48;
  sheet.getColumn(10).width = 19;
  sheet.getColumn(11).width = 14;
  for (let index = 12; index <= 32; index++) sheet.getColumn(index).width = 10;
  // Excel rows 4+ are actual data, never inject unrelated title rows.
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(index => sheet.getColumn(index).numFmt = "@");
  for (let column = 0; column < 32; column++) {
    formatHeader(sheet.getCell(`${columnLetter(column)}3`));
    const top = sheet.getCell(`${columnLetter(column)}1`);
    formatHeader(top, column >= 11 ? GRCON.teal : GRCON.navy);
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
    row.height = 24;
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
      : info.pwSituation === "registered" ? GRCON.amber
      : info.pwSituation === "missing" ? GRCON.red : GRCON.muted;
    registration.fill = { type: "pattern", pattern: "solid", fgColor: { argb: registrationFill } };
    const aba = sheet.getCell(`K${excelRow}`);
    aba.font = { name: "Aptos", size: 9, bold: true, color: { argb: GRCON.navy } };
    aba.alignment = { vertical: "middle", horizontal: "center" };
    const action = text(plan.sheets[MAIN_SHEET][excelRow - 1][8]);
    const situation = sheet.getCell(`I${excelRow}`);
    if (/Sem ação necessária/.test(action)) situation.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.green } };
    else if (/Cadastrar|Revisão|Conferir|Analisar|Tratar|Resolver/.test(action)) situation.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.red } };
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
  sheet.getColumn(1).width = 62;
  sheet.getColumn(2).width = 70;
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
    sheet.getRow(index).height = sections.has(index) ? 24 : 21;
    if (sections.has(index)) {
      for (const cell of [label, value]) {
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
  sheet.autoFilter = `A1:J${Math.max(2, rows)}`;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "1:1" };
  sheet.getRow(1).height = 30;
  [12, 58, 10, 24, 24, 16, 20, 16, 42, 16].forEach((width, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = width;
    column.numFmt = "@";
    formatHeader(sheet.getCell(`${columnLetter(index)}1`), GRCON.slate);
  });
}
function stylePw(sheet: ExcelSheet, dataRows: number): void {
  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 1, topLeftCell: "D2" }];
  sheet.autoFilter = `A1:BR${Math.max(2, dataRows)}`;
  sheet.getRow(1).height = 35;
  for (let col = 0; col < 70; col++) {
    const c = sheet.getColumn(col + 1);
    c.width = col === 0 ? 44 : col === 2 ? 19 : 20;
    c.numFmt = "@";
    formatHeader(sheet.getCell(`${columnLetter(col)}1`));
  }
}
export function buildCoordinatorWorkbook(state: SigemPwState, excel: CoordinatorExcelApi, logo?: CoordinatorLogo): { workbook: ExcelWorkbook; plan: CoordinatorPlan } {
  const plan = coordinatorPlan(state);
  const workbook = new excel.Workbook();
  if (workbook.calcProperties) workbook.calcProperties.fullCalcOnLoad = true;
  const overview = workbook.addWorksheet("Resumo");
  plan.sheets.Resumo.forEach(row => overview.addRow(row));
  styleOverview(overview, plan);
  // Resumo: logo à esquerda da coluna B, título à esquerda e subtítulo à direita.
  placeLogo(workbook, overview, logo, { tl: { col: 1.03, row: 0.18 } });
  const main = workbook.addWorksheet(MAIN_SHEET);
  plan.sheets[MAIN_SHEET].forEach(row => main.addRow(row));
  styleMain(main, plan);
  placeLogo(workbook, main, logo, { tl: { col: 0.05, row: 0.06 } });
  const pw = workbook.addWorksheet("REL. PW");
  plan.sheets["REL. PW"].forEach(row => pw.addRow(row));
  stylePw(pw, plan.sheets["REL. PW"].length);
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
export async function downloadCoordinatorWorkbook(state: SigemPwState, excel: CoordinatorExcelApi): Promise<void> {
  const { workbook } = buildCoordinatorWorkbook(state, excel, await loadLogo());
  const data = await workbook.xlsx.writeBuffer();
  const file = new Blob([data as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(file);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "GRCON_SIGEM_PW_GERENCIAL_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}
