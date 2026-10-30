import type { SigemPwRecord, SigemPwState } from "../types/domain";
import { managerialDocumentKey, reconcileManagerial, type ManagerialDocument } from "./sigemPwManagerial";
import { getPwOriginalMatrix } from "./sigemPwRawPw";

type CellValue = string | number;
export type Matrix = CellValue[][];
export interface CoordinatorPlan {
  sheets: Record<"N-1710" | "REL. PW" | "SIGEM", Matrix>;
  /** Excel rows for the N-1710 table (zero-based array indices start at row 4). */
  formulas: Array<{ excelRow: number; f: string; g: string; h: string; i: string; results: [string, string, string, string] }>;
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
  addRow(row: CellValue[]): ExcelRow;
  getCell(address: string): ExcelCell;
  getRow(index: number): ExcelRow;
  getColumn(index: number): ExcelColumn;
  views?: Array<Record<string, unknown>>;
  autoFilter?: string;
  pageSetup?: Record<string, unknown>;
}
interface ExcelWorkbook {
  addWorksheet(name: string): ExcelSheet;
  calcProperties?: { fullCalcOnLoad?: boolean };
  xlsx: { writeBuffer(): Promise<ArrayBuffer | Uint8Array> };
}
export interface CoordinatorExcelApi { Workbook: new () => ExcelWorkbook }

const REVISIONS = Object.freeze(["0", "A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"]);
export const COORDINATOR_HEADERS = Object.freeze([
  "DOCUMENTO", "REVISÃO", "TÍTULO", "STATUS", "STATUS SIGEM", "REVISÃO",
  "CHECK REV.", "STATE", "Última emissão", "AÇÃO", "Cadastro",
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
    const key = text(record.documentKey);
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
  [header1[0], header1[1], header1[2], header1[3], header1[4],
   header1[5], header1[6], header1[7], header1[8], header1[9], header1[10]] =
  ["CONTROLE DOCUMENTAL • GRCON", "ATIVOS", summary.active, "PW CAD.", summary.registered,
   "PW EMIT.", summary.emitted, "SIGEM", summary.posted, "PENDÊNCIAS", summary.pending];
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
    const g = `IF(OR(B${number}="",F${number}=""),"FALSO",IF(UPPER(SUBSTITUTE(TRIM(B${number}),"REV. ",""))=UPPER(SUBSTITUTE(TRIM(F${number}),"REV. ","")),"VERDADEIRO","FALSO"))`;
    const h = sourceFormula(sourceRow, statusColumn);
    const i = sourceFormula(sourceRow, emissionColumn);
    const gValue = sameRevision(row.referenceRevision, row.pwRevision) ? "VERDADEIRO" : "FALSO";
    const results: [string, string, string, string] = [row.pwRevision, gValue, row.pwState, row.pwLastEmission];
    formulas.push({ excelRow: number, f, g, h, i, results });
    master.push([
      row.code, row.referenceRevision, row.title, row.referenceStatus, row.sigemStatus,
      ...results, row.action, row.pwNotApplicable ? "Não aplicável (CV)"
        : row.pwRegistered ? "Cadastrado" : "Não cadastrado",
      ...REVISIONS.map(revision => available.has(revision) ? "x" : ""),
    ]);
  }
  REVISIONS.forEach((rev, index) => { header1[index + 11] = totals.get(rev) || 0; });
  return {
    sheets: { "N-1710": master, "REL. PW": [pw.headers, ...pw.rows], "SIGEM": [] },
    formulas, summary, pwColumns: 70,
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
function styleMain(sheet: ExcelSheet, plan: CoordinatorPlan): void {
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 3, topLeftCell: "C4" }];
  sheet.autoFilter = `A3:AF${Math.max(4, plan.sheets["N-1710"].length)}`;
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 35;
  sheet.getColumn(1).width = 43;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 42;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 25;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 16;
  sheet.getColumn(8).width = 19;
  sheet.getColumn(9).width = 18;
  sheet.getColumn(10).width = 48;
  sheet.getColumn(11).width = 19;
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
  for (let idx = 0; idx < plan.formulas.length; idx++) {
    const info = plan.formulas[idx];
    const excelRow = info.excelRow;
    const row = sheet.getRow(excelRow);
    row.height = 24;
    // Style only operational cells: avoid huge per-cell styles on data sources.
    for (const column of ["A", "B", "G", "J", "K"]) {
      const cell = sheet.getCell(`${column}${excelRow}`);
      cell.font = { name: "Aptos", size: 9, color: { argb: GRCON.ink } };
      cell.alignment = { vertical: "middle", wrapText: false };
      if (idx % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.pale } };
    }
    const action = text(plan.sheets["N-1710"][excelRow - 1][9]);
    const situation = sheet.getCell(`J${excelRow}`);
    if (/Sem ação necessária/.test(action)) situation.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.green } };
    else if (/Cadastrar|Revisão|Conferir|Analisar|Tratar|Resolver/.test(action)) situation.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.red } };
    else situation.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRCON.amber } };
    for (const [col, formula, result] of [
      ["F", info.f, info.results[0]], ["G", info.g, info.results[1]],
      ["H", info.h, info.results[2]], ["I", info.i, info.results[3]],
    ] as const) {
      const cell = sheet.getCell(`${col}${excelRow}`);
      // Formula strings are generated by the application only. Source text
      // remains a literal string; gerador de planilhas does not interpret it as a formula.
      cell.value = { formula, result };
      cell.numFmt = "@";
    }
  }
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
export function buildCoordinatorWorkbook(state: SigemPwState, excel: CoordinatorExcelApi): { workbook: ExcelWorkbook; plan: CoordinatorPlan } {
  const plan = coordinatorPlan(state);
  const workbook = new excel.Workbook();
  if (workbook.calcProperties) workbook.calcProperties.fullCalcOnLoad = true;
  const main = workbook.addWorksheet("N-1710");
  plan.sheets["N-1710"].forEach(row => main.addRow(row));
  styleMain(main, plan);
  const pw = workbook.addWorksheet("REL. PW");
  plan.sheets["REL. PW"].forEach(row => pw.addRow(row));
  stylePw(pw, plan.sheets["REL. PW"].length);
  // Template SIGEM was blank. Do NOT invent rows or turn it into a second
  // official source; SIGEM comparison comes from the active Consulta Geral.
  workbook.addWorksheet("SIGEM");
  return { workbook, plan };
}
export async function downloadCoordinatorWorkbook(state: SigemPwState, excel: CoordinatorExcelApi): Promise<void> {
  const { workbook } = buildCoordinatorWorkbook(state, excel);
  const data = await workbook.xlsx.writeBuffer();
  const file = new Blob([data as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(file);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "GRCON_SIGEM_PW_CONTROLE_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}
