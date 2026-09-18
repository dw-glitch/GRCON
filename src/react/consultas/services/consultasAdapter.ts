/**
 * GRCON — Adaptador entre a ilha React de Consultas e os módulos legados.
 *
 * Nenhum componente React deve tocar em `window`, `TriagemCore`,
 * `GrconRequestsCore`, `GrconRequestsReport`, `GrconAllocationCenter`,
 * `GrconFileAccess`, `GRCONModuleLoader`, `GrconGrdtHistoryIndicator`,
 * `GrconLdMemory`, `GrconNotify` ou `GrconCloud` diretamente: tudo passa por
 * aqui. Isso mantém a regra documental (parseWorkbook/buildIndex/lookupDocument
 * e as demais regras de requests_core.js) intacta e reutilizada, sem duplicar
 * nada em React.
 */
import type {
  AllocationCenterIndex,
  ConsultationRow,
  DocumentIndex,
  ExportRow,
  ExportTemplate,
  LdEntry,
  LdHistoryEntry,
  LdRecord,
  LookupResult,
  ParsedDocument,
} from "../types/domain";
// Os tipos ambientes de window.* (types/legacy-globals.d.ts) são globais e
// pegos automaticamente pelo tsconfig — nenhum import é necessário (e um
// import de efeito colateral de um .d.ts quebraria o bundle do Vite/Rollup).

const CHAVE_MODELOS = "grcon-requests-export-templates";
const CHAVE_ULTIMA = "grcon-requests-last-export";
const EVENTO_MODELOS = "grcon:export-templates-changed";

function core() {
  const api = window.TriagemCore;
  if (!api) throw new Error("O motor de LDs (TriagemCore) não está disponível.");
  return api;
}
function requestsCore() {
  const api = window.GrconRequestsCore;
  if (!api) throw new Error("As regras de consulta (GrconRequestsCore) não estão disponíveis.");
  return api;
}
function requestsReport() {
  const api = window.GrconRequestsReport;
  if (!api) throw new Error("O gerador de relatório (GrconRequestsReport) não está disponível.");
  return api;
}
function allocationCenter() {
  return window.GrconAllocationCenter;
}

function notify(message: string, kind?: string): void {
  window.GrconNotify?.(message, kind || "info");
}

async function ensureGroup(name: string): Promise<void> {
  if (!window.GRCONModuleLoader) throw new Error("O carregador de módulos do GRCON não está disponível.");
  await window.GRCONModuleLoader.ensure(name);
}

async function readFileBuffer(file: File, context: string): Promise<ArrayBuffer> {
  if (window.GrconFileAccess) return window.GrconFileAccess.read(file, { context, retries: 1 });
  return file.arrayBuffer();
}

/** Lê uma LD anexada com o mesmo motor da Triagem de GRDT. */
async function parseLd(file: File): Promise<{ records: LdRecord[]; history: LdHistoryEntry[] }> {
  await ensureGroup("xlsx");
  const buffer = await readFileBuffer(file, "a LD controlada");
  const workbook = window.XLSX!.read(buffer, { type: "array", cellDates: true, cellStyles: false });
  const parsed = core().parseWorkbook(workbook, file.name, file.lastModified);
  return { records: parsed.records || [], history: parsed.history || [] };
}

/** Reconstrói o índice de busca a partir das LDs válidas anexadas. */
function buildIndex(lds: LdEntry[]): DocumentIndex | null {
  const validas = lds.filter((item) => !item.error && item.records.length);
  if (!validas.length) return null;
  const registros = validas.flatMap((item) => item.records);
  const historico = validas.flatMap((item) => item.history || []);
  return core().buildIndex(registros, historico);
}

function rememberLastLd(file: File): void {
  if (window.GrconLdMemory) {
    try { window.GrconLdMemory.saveLastLd(file); } catch (_error) { /* conveniência, não requisito */ }
  }
}

function getLastLd(): { name: string } | null {
  if (window.GrconLdMemory?.getLastLd) return window.GrconLdMemory.getLastLd() ?? null;
  return null;
}

/** Lê e indexa o Controle de Solicitações (central de alocação), opcional. */
async function parseAllocationCenterFile(file: File): Promise<AllocationCenterIndex> {
  const AC = allocationCenter();
  if (!AC) throw new Error("O leitor da central não está disponível.");
  await ensureGroup("xlsx");
  const buffer = await readFileBuffer(file, "o Controle de Solicitações");
  const workbook = window.XLSX!.read(buffer, { type: "array", cellDates: true, cellStyles: false });
  const indice = AC.parseAllocationCenter(workbook, { xlsx: window.XLSX, core: core() });
  indice.nomeArquivo = file.name;
  return indice;
}

function centerFieldsFor(document: string, centralIndex: AllocationCenterIndex | null): Record<string, unknown> {
  const AC = allocationCenter();
  if (!AC || !centralIndex || !centralIndex.ok) return {};
  return AC.centerFields(AC.allocationCenterLookup(document, centralIndex, core()));
}

function parseDocumentList(input: string): ParsedDocument[] {
  return requestsCore().parseDocumentList(input);
}

function dedupeDocuments<T extends { document: string }>(items: T[]): { items: T[]; removed: T[] } {
  return requestsCore().dedupeDocuments(items);
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * Reproduz `historicoDoGrcon`: procura primeiro pela grafia da LD (a que vai
 * para a eGRDT) e só depois pelo código informado.
 */
function historyEntriesFor(resultado: LookupResult, informado: string): LdHistoryEntry[] {
  const indicador = window.GrconGrdtHistoryIndicator;
  if (!indicador?.getEntries) return [];
  const chosen = resultado.chosen;
  const candidatos = [chosen?.document, resultado.ldDocument, informado].map(text).filter(Boolean);
  for (const candidato of [...new Set(candidatos)]) {
    const entradas = indicador.getEntries(candidato);
    if (entradas && entradas.length) return entradas;
  }
  return [];
}

function refreshHistoryIndicator(): void {
  window.GrconGrdtHistoryIndicator?.refresh?.();
}

/**
 * Consulta um único documento e devolve a linha já mesclada (situação,
 * alocação, GRDT/SIGEM e, quando houver central, status da fiscal). Usa
 * exatamente as mesmas três chamadas de requests_app.js — nenhuma regra é
 * reescrita aqui.
 */
function lookupDocument(
  document: string,
  requestedTitle: string | undefined,
  index: DocumentIndex,
  centralIndex: AllocationCenterIndex | null,
): ConsultationRow {
  const RC = requestsCore();
  const resultado = RC.lookupDocument(document, index, { requestedTitle });
  return {
    ...RC.consultationRow(resultado),
    ...RC.issuedColumns(historyEntriesFor(resultado, document)),
    ...centerFieldsFor(document, centralIndex),
  } as unknown as ConsultationRow;
}

/**
 * Projeta uma linha de resultado no formato usado para cópia/exportação —
 * mesma seleção de campos de `linhasParaSaida()` em requests_app.js.
 */
function buildExportRow(document: string, linha: ConsultationRow): ExportRow {
  return {
    situation: linha.situation,
    document,
    ldDocument: linha.ldDocument,
    ldForm: linha.ldForm,
    ntFormsDetail: linha.ntFormsDetail,
    ntSearchMessage: linha.ntSearchMessage,
    title: linha.title,
    // Mantém exatamente o valor projetado pelo requests_taxonomy_core.js.
    // O legado já exportava travessão quando a mesma linha da LD não tinha valor.
    internalTaxonomy: linha.internalTaxonomy || "—",
    sigemLdRevision: linha.sigemLdRevision,
    sigemLdRevisionCell: linha.sigemLdRevisionCell,
    allocated: linha.allocated,
    allocation: linha.allocation,
    lastGrdt: linha.lastGrdt,
    issued: linha.issued,
    issuedCell: linha.issuedCell,
    issuedEgrdt: linha.issuedEgrdt,
    issuedAt: linha.issuedAt,
    issuedRevision: linha.issuedRevision,
    issuedRevisionCell: linha.issuedRevisionCell,
    sigemStatus: linha.sigemStatus,
    centerStatus: linha.centerStatus,
    centerFiscalAnswer: linha.centerFiscalAnswer,
    centerAllocationCell: linha.centerAllocationCell,
    ld: linha.ld,
    allLds: linha.allLds,
    rule: linha.rule,
  };
}

async function copyRowsToClipboard(rows: ExportRow[]): Promise<void> {
  const Report = requestsReport();
  const header = Report.COLUMNS.map((column) => column.header).join("\t");
  const cell = (value: unknown) => String(value === null || value === undefined ? "" : value).replace(/\s*\n\s*/g, " · ");
  const body = rows.map((row) => Report.COLUMNS.map((column) => cell(row[column.key])).join("\t")).join("\n");
  await navigator.clipboard.writeText(`${header}\n${body}`);
}

function modelosLocais(): ExportTemplate[] {
  try {
    const bruto = JSON.parse(window.localStorage.getItem(CHAVE_MODELOS) || "[]") as unknown;
    return (Array.isArray(bruto) ? bruto : []).map((item) => requestsReport().normalizeExportTemplate({ ...(item as Record<string, unknown>), scope: "local" }));
  } catch (_error) {
    return [];
  }
}

/** Reproduz `carregarModelos()`: embutidos + salvos localmente + da equipe. */
async function loadExportTemplates(): Promise<ExportTemplate[]> {
  const Report = requestsReport();
  const porId = new Map<string, ExportTemplate>();
  Report.BUILTIN_EXPORT_TEMPLATES.forEach((modelo) => porId.set(modelo.id, modelo));
  modelosLocais().forEach((modelo) => porId.set(modelo.id, modelo));
  const Cloud = window.GrconCloud;
  if (Cloud?.getExportTemplates) {
    const salvos = await Cloud.getExportTemplates();
    (salvos || []).forEach((modelo) => porId.set(modelo.id, Report.normalizeExportTemplate({ ...modelo, scope: "equipe" })));
  }
  return [...porId.values()];
}

function rememberLastExport(template: ExportTemplate): void {
  try {
    window.localStorage.setItem(CHAVE_ULTIMA, JSON.stringify({ id: template.id, name: template.name, at: new Date().toISOString() }));
  } catch (_error) { /* repetir a última é conveniência, não requisito */ }
}

function getLastExport(): { id: string; name: string } | null {
  try {
    const bruto = JSON.parse(window.localStorage.getItem(CHAVE_ULTIMA) || "null") as { id?: string; name?: string } | null;
    return bruto?.id ? (bruto as { id: string; name: string }) : null;
  } catch (_error) {
    return null;
  }
}

function onExportTemplatesChanged(callback: EventListener): () => void {
  window.addEventListener(EVENTO_MODELOS, callback);
  return () => window.removeEventListener(EVENTO_MODELOS, callback);
}

/**
 * Gera e baixa o arquivo Excel com o mesmo construtor da Triagem (mesmo
 * layout, mesma logomarca).
 */
async function exportRowsToExcel(rows: ExportRow[], template: ExportTemplate, ldNames: string): Promise<void> {
  const Report = requestsReport();
  await ensureGroup("excel");
  await ensureGroup("brand");
  const workbook = new window.ExcelJS!.Workbook();
  workbook.creator = "GRCON";
  workbook.company = "CONSAG Engenharia";
  workbook.title = template.name;
  const sheet = workbook.addWorksheet("Consulta", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
  Report.writeConsultationSheet(sheet, rows, {
    columns: template.columns,
    title: `GRCON · ${template.name.toUpperCase()}`,
    footer: `GRCON · ${template.name}`,
    metadata: `${rows.length.toLocaleString("pt-BR")} linha(s) · modelo "${template.name}" · ${new Date().toLocaleString("pt-BR")}`,
    ldNames,
  });
  await Report.attachBrandLogo(workbook, sheet, window.GRCONBrandAssets, window.fetch.bind(window));
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const carimbo = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  link.href = url;
  link.download = `GRCON_CONSULTA_${carimbo}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  rememberLastExport(template);
}

function normalizeExportTemplate(value: unknown): ExportTemplate {
  return requestsReport().normalizeExportTemplate(value);
}

let exportRowsProvider: () => ExportRow[] = () => [];
/** Usado pela aba legada "Modelos de exportação" para prever com dados reais. */
function getExportRows(): ExportRow[] { return exportRowsProvider(); }
function setExportRowsProvider(provider?: () => ExportRow[]): void { exportRowsProvider = provider || (() => []); }

export const consultasAdapter = Object.freeze({
  notify,
  parseLd,
  buildIndex,
  rememberLastLd,
  getLastLd,
  parseAllocationCenterFile,
  parseDocumentList,
  dedupeDocuments,
  lookupDocument,
  buildExportRow,
  copyRowsToClipboard,
  loadExportTemplates,
  onExportTemplatesChanged,
  exportRowsToExcel,
  normalizeExportTemplate,
  getLastExport,
  refreshHistoryIndicator,
  getExportRows,
  setExportRowsProvider,
});

export type ConsultasAdapter = typeof consultasAdapter;

// Compatibilidade: a aba legada "Modelos de exportação" (requests_app.js)
// continua chamando `window.GrconConsultasAdapter.getExportRows()` para
// prever com dados reais — mantemos a mesma exposição global do adaptador.
window.GrconConsultasAdapter = consultasAdapter;
