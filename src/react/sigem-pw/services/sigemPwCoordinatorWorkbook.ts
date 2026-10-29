import type { SigemPwRecord, SigemPwState } from "../types/domain";
import { reconcileManagerial } from "./sigemPwManagerial";

type Matrix = Array<Array<string | number>>;
interface SheetJsApi {
  utils: {
    aoa_to_sheet(data: Matrix): unknown;
    book_new(): unknown;
    book_append_sheet(book: unknown, sheet: unknown, name: string): void;
  };
  writeFile(book: unknown, filename: string, options?: Record<string, unknown>): void;
}

const revisions = ["0", "A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"];
const text = (value: unknown): string => value == null ? "" : String(value).trim();

function sourceRow(record: SigemPwRecord): Array<string | number> {
  return [
    text(record.document), text(record.revisionComplete || record.revision),
    text(record.status || record.state), text(record.lastEmission),
    text(record.company), Number(record.sourceRow || 0),
  ];
}

/** The same document-level reconciliation powers the executive screen and this workbook. */
export function coordinatorSheets(state: SigemPwState): Record<string, Matrix> {
  const report = reconcileManagerial(state);
  if (!report.ready) throw new Error(report.reason || "Conciliação gerencial indisponível.");
  const cells: Matrix = [];
  const totals = new Map(revisions.map(revision => [revision, 0]));
  const header1: Array<string | number> = Array(32).fill("");
  const header2: Array<string | number> = Array(32).fill("");
  const header3: Array<string | number> = [
    "DOCUMENTO", "REVISÃO", "TÍTULO", "STATUS", "STATUS SIGEM", "REVISÃO",
    "CHECK REV.", "STATE", "Última emissão", "AÇÃO", "Cadastro",
    ...revisions.map(rev => "Rev. " + rev),
  ];
  header2[0] = "LD"; header2[5] = "PW";
  revisions.forEach((rev, index) => { header2[index + 11] = rev; });
  cells.push(header1, header2, header3);
  for (const row of report.rows) {
    const available = new Set(row.pwRevisions.map(text));
    for (const rev of revisions) if (available.has(rev)) totals.set(rev, (totals.get(rev) || 0) + 1);
    cells.push([
      row.code, row.referenceRevision, row.title, row.referenceStatus, row.sigemStatus,
      row.pwRevision, row.referenceRevision && row.pwRevision && row.referenceRevision === row.pwRevision ? "VERDADEIRO" : "FALSO",
      row.pwState, row.pwLastEmission, row.action, row.pwRegistered ? "Cadastrado" : "Não cadastrado",
      ...revisions.map(rev => available.has(rev) ? "x" : ""),
    ]);
  }
  revisions.forEach((rev, index) => { header1[index + 11] = totals.get(rev) || 0; });
  header1[10] = report.summary.registered || 0;
  const rowsPW: Matrix = [["Documento", "Revisão", "Estado", "Última emissão", "Empresa (coluna C)", "Linha de origem"],
    ...(state.model?.normalizedPw || []).map(sourceRow)];
  const rowsSigem: Matrix = [["Documento", "Revisão", "Status SIGEM", "Última emissão", "Origem", "Linha de origem"],
    ...(state.model?.normalizedSigem || []).map(sourceRow)];
  const outside: Matrix = [["Origem", "Documento", "Revisão", "Situação", "Motivo"]];
  for (const [sourceName, kind] of [["SIGEM", "sigemN1710OutsideLd"], ["PW", "pwN1710OutsideLd"]] as const) {
    for (const row of state.result?.lists?.[kind] || []) {
      outside.push([sourceName, row.document, row.revision, row.situation, "Não consta nas referências ativas"]);
    }
  }
  const summary: Matrix = [
    ["SIGEM × PW — CONTROLE DOCUMENTAL", "Quantidade"],
    ["Data da geração", new Date().toLocaleString("pt-BR")],
    ["Documentos ativos", report.summary.active],
    ["Cadastrados no PW", report.summary.registered || 0],
    ["Emitidos no PW", report.summary.emitted || 0],
    ["Postados no SIGEM", report.summary.posted || 0],
    ["Em conformidade", report.summary.compliant || 0],
    ["Com pendências", report.summary.pending || 0],
    ["Documentos cancelados", report.summary.cancelled],
    ["Conflitos entre referências", report.summary.conflicts],
    ["Observação", "Cadastro, emissão e postagem são indicadores distintos e não devem ser somados."],
  ];
  const sourceInfo: Matrix = [["Arquivo", "Identificador", "Ativa", "Registros", "Importação"]];
  const defined = state.ld.meta?.sources;
  if (Array.isArray(defined)) for (const entry of defined) {
    const source = entry as Record<string, unknown>;
    sourceInfo.push([text(source.fileName), text(source.id), source.active ? "Sim" : "Não",
      Number(source.recordCount || 0), text(source.importedAt)]);
  }
  sourceInfo.push(["", "", "", "", ""]);
  sourceInfo.push(["Documento com conflito", "Revisões informadas", "Fontes"]);
  for (const record of state.ld.records.filter(item => item.referenceConflict === true)) {
    sourceInfo.push([text(record.document),
      Array.isArray(record.referenceConflictRevisions) ? record.referenceConflictRevisions.join(" | ") : "",
      Array.isArray(record.referenceSources) ? record.referenceSources.join(" | ") : ""]);
  }
  return {
    "N-1710": cells,
    "REL. PW": rowsPW,
    "SIGEM": rowsSigem,
    "RESUMO": summary,
    "FORA DO ESCOPO": outside,
    "RASTREABILIDADE": sourceInfo,
  };
}

export function downloadCoordinatorWorkbook(state: SigemPwState, api: SheetJsApi): void {
  const sheets = coordinatorSheets(state);
  const workbook = api.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const worksheet = api.utils.aoa_to_sheet(rows);
    api.utils.book_append_sheet(workbook, worksheet, name);
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  api.writeFile(workbook, `GRCON_SIGEM_PW_CONTROLE_${stamp}.xlsx`, { bookType: "xlsx", compression: true });
}
