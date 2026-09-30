/**
 * GRCON — Adaptador entre a ilha React de Consultas e os módulos legados.
 *
 * Nenhum componente React deve tocar em `window`, `TriagemCore`,
 * `GrconRequestsCore`, `GrconRequestsReport`,
 * `GrconFileAccess`, `GRCONModuleLoader`, `GrconGrdtHistoryIndicator`,
 * `GrconLdMemory`, `GrconNotify` ou `GrconCloud` diretamente: tudo passa por
 * aqui. Isso mantém a regra documental (parseWorkbook/buildIndex/lookupDocument
 * e as demais regras de requests_core.js) intacta e reutilizada, sem duplicar
 * nada em React.
 */
import type {
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
const EVENTO_DOCUMENTOS_PREVISTOS = "grcon:planned-documents-updated";

interface PlannedDocumentsSnapshot {
  id: string;
  fileName?: string;
  updatedAt?: string;
  count?: number;
  keys: Set<string>;
}

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
function plannedDocumentsCore() {
  const api = window.GrconPlannedDocumentsCore;
  if (!api) throw new Error("A regra de Documentos Previstos não está disponível.");
  return api;
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
function buildIndex(lds: LdEntry[], plannedSnapshot?: PlannedDocumentsSnapshot): DocumentIndex | null {
  const validas = lds.filter((item) => !item.error && item.records.length);
  if (!validas.length) return null;
  const registros = validas.flatMap((item) => item.records);
  const historico = validas.flatMap((item) => item.history || []);
  // Em Consultas, a coluna de alocação da LD nunca pode decidir Alocado/Não
  // alocado. Quando há snapshot oficial, todas as ocorrências entram no índice
  // já sobrescritas pela mesma fonte compartilhada. Isso também elimina falsos
  // conflitos entre LDs que apenas divergem na coluna antiga de alocação.
  const registrosOficiais = plannedSnapshot
    ? plannedDocumentsCore().applyToRecords(registros, plannedSnapshot)
    : registros;
  return core().buildIndex(registrosOficiais, historico);
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

function parseDocumentList(input: string): ParsedDocument[] {
  return requestsCore().parseDocumentList(input);
}

function dedupeDocuments<T extends { document: string }>(items: T[]): { items: T[]; removed: T[] } {
  return requestsCore().dedupeDocuments(items);
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

async function loadPlannedDocumentsSnapshot(): Promise<PlannedDocumentsSnapshot> {
  const Cloud = window.GrconCloud;
  if (!Cloud?.loadPlannedDocuments) {
    throw new Error("A base compartilhada de Documentos Previstos não está disponível nesta sessão.");
  }
  const snapshot = await Cloud.loadPlannedDocuments();
  if (!snapshot?.id || !(snapshot.keys instanceof Set)) {
    throw new Error("Nenhuma base compartilhada de Documentos Previstos válida está carregada. Publique ou sincronize a base antes de consultar.");
  }
  if (Number.isFinite(snapshot.count) && Number(snapshot.count) !== snapshot.keys.size) {
    throw new Error("A base compartilhada de Documentos Previstos está incompleta. Atualize a sessão antes de consultar.");
  }
  return snapshot;
}

function applyPlannedAllocation(
  document: string,
  row: ConsultationRow,
  snapshot: PlannedDocumentsSnapshot,
): ConsultationRow {
  const applied = plannedDocumentsCore().applyToRecords([
    { document, documentKey: document },
  ], snapshot)[0] as Record<string, unknown> | undefined;
  const allocationStatus = text(applied?.allocationStatus).toUpperCase();
  if (allocationStatus !== "ALOCADO" && allocationStatus !== "NÃO ALOCADO") {
    throw new Error("Não foi possível determinar a alocação pela base compartilhada de Documentos Previstos.");
  }
  const allocated = allocationStatus === "ALOCADO";
  return {
    ...row,
    allocated: allocated ? "SIM — Alocado" : "NÃO — Não alocado",
    allocationKind: allocated ? "allocated" : "not_allocated",
    allocationSource: "Documentos Previstos compartilhado",
    plannedDocumentsSnapshot: snapshot.id,
    plannedDocumentsFile: snapshot.fileName || "",
    plannedDocumentsUpdatedAt: snapshot.updatedAt || "",
  };
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
 * alocação e GRDT/SIGEM. Usa
 * exatamente as mesmas três chamadas de requests_app.js — nenhuma regra é
 * reescrita aqui.
 */
function lookupDocument(
  document: string,
  requestedTitle: string | undefined,
  index: DocumentIndex,
  plannedSnapshot: PlannedDocumentsSnapshot,
): ConsultationRow {
  const RC = requestsCore();
  const resultado = RC.lookupDocument(document, index, { requestedTitle });
  const row = {
    ...RC.consultationRow(resultado),
    ...RC.issuedColumns(historyEntriesFor(resultado, document)),
  } as unknown as ConsultationRow;
  // A decisão final independe de a LD ter localizado o documento: se o código
  // normalizado existe no snapshot compartilhado, é Alocado; se não existe, é
  // Não alocado. Revisão, SIGEM, PW, histórico e campos da LD não entram aqui.
  return applyPlannedAllocation(document, row, plannedSnapshot);
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
    // Valor já enriquecido por requests_taxonomy_core.js a partir da mesma
    // linha da LD escolhida pelo motor. O React não reconstrói nem infere.
    internalTaxonomy: linha.internalTaxonomy,
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

function onPlannedDocumentsChanged(callback: EventListener): () => void {
  window.addEventListener(EVENTO_DOCUMENTOS_PREVISTOS, callback);
  return () => window.removeEventListener(EVENTO_DOCUMENTOS_PREVISTOS, callback);
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
  loadPlannedDocumentsSnapshot,
  rememberLastLd,
  getLastLd,
  parseDocumentList,
  dedupeDocuments,
  lookupDocument,
  buildExportRow,
  copyRowsToClipboard,
  loadExportTemplates,
  onExportTemplatesChanged,
  onPlannedDocumentsChanged,
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
