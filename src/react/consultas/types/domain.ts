/**
 * GRCON — Tipos de domínio da ilha React de Consultas.
 *
 * Tipos usados pelos componentes, pelo hook e pelo adaptador. Estruturas que
 * vêm de módulos legados sem tipagem própria (LD, histórico, resultado de
 * consulta) são representadas como registros de chave/valor conhecidos —
 * nunca como `any` — e normalizadas/validadas no adaptador antes de chegar
 * ao React.
 */

/** Uma linha de LD, no formato devolvido por `TriagemCore.parseWorkbook`. */
export type LdRecord = Record<string, unknown>;

/** Uma entrada de histórico de eGRDT, associada a uma LD. */
export type LdHistoryEntry = Record<string, unknown>;

/** Índice de busca construído por `TriagemCore.buildIndex`. */
export type DocumentIndex = Record<string, unknown>;

/** Resultado bruto de `GrconRequestsCore.lookupDocument`. */
export type LookupResult = Record<string, unknown> & {
  chosen?: Record<string, unknown> | null;
  ldDocument?: string;
  needsManualValidation?: boolean;
};

/** Índice do Controle de Solicitações (central de alocação), quando anexado. */
export interface AllocationCenterIndex {
  ok: boolean;
  error?: string;
  nomeArquivo?: string;
  sheetName?: string;
  count?: number;
  documents?: number;
  [key: string]: unknown;
}

/** Uma LD anexada na tela, com o resultado da leitura (ou o erro). */
export interface LdEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  records: LdRecord[];
  history: LdHistoryEntry[];
  error: string;
}

/** Um documento informado para consulta. */
export interface DocumentEntry {
  id: string;
  document: string;
  requestedTitle?: string;
  selected: boolean;
}

/** Uma entrada de emissão anterior (histórico de eGRDT). */
export interface IssuedEntry {
  egrdt?: string;
  revision?: string;
  date?: string;
}

/** Uma entrada de revisão registrada na Colar SIGEM. */
export interface SigemRevisionEntry {
  revision?: string;
  status?: string;
}

/** Linha de resultado já mesclada (situação, alocação, GRDT/SIGEM, central). */
export interface ConsultationRow {
  situation: string;
  ldDocument?: string;
  ldForm?: string;
  ntFormsDetail?: string;
  ntSearchMessage?: string;
  bothNtFormsInLd?: boolean;
  codeAdjusted?: boolean;
  codeAdjustmentNote?: string;
  title?: string;
  sigemLdRevision?: string;
  sigemLdRevisionCell?: string;
  sigemLdRevisionCount?: number;
  sigemLdRevisionAll?: SigemRevisionEntry[];
  sigemLdRevisionLabel?: string;
  allocated?: string;
  allocation?: string;
  lastGrdt?: string;
  issued?: string;
  issuedCell?: string;
  issuedEgrdt?: string;
  issuedAt?: string;
  issuedRevision?: string;
  issuedRevisionCell?: string;
  issuedCount?: number;
  issuedAll?: IssuedEntry[];
  sigemStatus?: string;
  centerFound?: boolean;
  centerStatus?: string;
  centerFiscalAnswer?: string;
  centerAllocation?: string;
  centerSentAt?: string;
  centerSubmissions?: number;
  centerAllocationCell?: string;
  ld?: string;
  allLds?: string;
  occurrenceCount?: number;
  rule?: string;
  needsManualValidation?: boolean;
}

/** Coluna de um modelo de exportação. */
export interface ExportTemplateColumn {
  key: string;
  header: string;
  width?: number;
}

/** Modelo de exportação (estrutura/ordem das colunas do Excel gerado). */
export interface ExportTemplate {
  id: string;
  name: string;
  base: string;
  columns: ExportTemplateColumn[];
  builtIn?: boolean;
  scope?: string;
}

/** Linha projetada para cópia/exportação — mesma seleção de campos do legado. */
export interface ExportRow {
  situation: string;
  document: string;
  ldDocument?: string;
  ldForm?: string;
  ntFormsDetail?: string;
  ntSearchMessage?: string;
  title?: string;
  sigemLdRevision?: string;
  sigemLdRevisionCell?: string;
  allocated?: string;
  allocation?: string;
  lastGrdt?: string;
  issued?: string;
  issuedCell?: string;
  issuedEgrdt?: string;
  issuedAt?: string;
  issuedRevision?: string;
  issuedRevisionCell?: string;
  sigemStatus?: string;
  centerStatus?: string;
  centerFiscalAnswer?: string;
  centerAllocationCell?: string;
  ld?: string;
  allLds?: string;
  rule?: string;
  [key: string]: unknown;
}

/** Um documento reconhecido ao colar texto (código + título opcional). */
export interface ParsedDocument {
  document: string;
  requestedTitle?: string;
}

export type NotifyKind = "info" | "success" | "warn" | "error";
