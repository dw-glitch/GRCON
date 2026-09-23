import type { CoverDocumentCandidate, LdColumnValue, LdDocumentRecord } from "../types/domain";

const FIELD_ALIASES = {
  eap: ["EAP", "CODIGO EAP", "CODIGO DA EAP", "ESTRUTURA ANALITICA DO PROJETO"],
  classification: ["CLASSIFICACAO", "CLASSIFICACAO DO DOCUMENTO", "CLASSE", "CLASSE DOCUMENTAL"],
  documentTypeDescription: ["TIPO DOCUMENTO DESC", "TIPO DE DOCUMENTO DESC", "DESCRICAO TIPO DOCUMENTO", "DESCRICAO DO TIPO DE DOCUMENTO"],
} as const;

export interface LdSearchIndexEntry {
  record: LdDocumentRecord;
  normalizedTitle: string;
}

export interface LdSearchIndex {
  entries: LdSearchIndexEntry[];
  count: number;
}

export interface LdLoadProgress {
  phase: "read" | "prepare" | "ready";
  progress: number;
  message: string;
}

export interface LoadedLdRecords {
  records: LdDocumentRecord[];
  searchIndex: LdSearchIndex;
}

export function normalizeSearch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedHeader(value: unknown): string {
  return normalizeSearch(value);
}

function columnValue(columns: LdColumnValue[] | undefined, aliases: readonly string[]): string {
  if (!columns?.length) return "";
  const aliasSet = new Set(aliases.map(normalizedHeader));
  const exact = columns.filter((entry) => aliasSet.has(normalizedHeader(entry.header)));
  const values = [...new Set(exact.map((entry) => String(entry.value ?? "").trim()))];
  if (values.length === 1) return values[0];
  if (values.length > 1) return "";
  return "";
}

function internalTaxonomy(record: LdDocumentRecord): string {
  const resolver = window.GrconRequestsTaxonomy?.internalTaxonomyFromRecord;
  if (typeof resolver !== "function") {
    throw new Error("Motor oficial de Taxonomia Interna do GRCON não está disponível.");
  }
  return String(resolver(record, window.TriagemCore) ?? "").trim();
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
  }
  let intersection = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = pairs.get(pair) || 0;
    if (!count) continue;
    intersection += 1;
    pairs.set(pair, count - 1);
  }
  return (2 * intersection) / (left.length + right.length - 2);
}

function scoreNormalizedTitle(candidate: string, wanted: string): number {
  if (!candidate || !wanted) return 0;
  if (candidate === wanted) return 1000;
  if (candidate.startsWith(wanted)) return 900 + Math.min(80, wanted.length / Math.max(1, candidate.length) * 80);
  if (candidate.includes(wanted)) return 820 + Math.min(60, wanted.length / Math.max(1, candidate.length) * 60);
  const tokens = wanted.split(" ").filter((token) => token.length > 1);
  const found = tokens.filter((token) => candidate.includes(token)).length;
  const coverage = tokens.length ? found / tokens.length : 0;
  if (coverage < 0.5 && wanted.length < 5) return 0;
  const dice = diceCoefficient(candidate, wanted);
  if (coverage < 0.5 && dice < 0.55) return 0;
  return Math.round(500 * coverage + 300 * dice);
}

function documentCategory(record: LdDocumentRecord): string {
  const direct = String(record.documentType ?? "").trim().toUpperCase();
  if (direct) return direct;
  const code = String(record.document ?? "").trim();
  const groups = code.split("-");
  const offset = /^[IAFLED]$/i.test(groups[0] || "") ? 1 : 0;
  return String(groups[offset] || "").trim().toUpperCase();
}

function officialCategoryDescription(record: LdDocumentRecord, category: string): string {
  const directDescription = String(record.documentTypeDesc ?? "").trim()
    || columnValue(record.ldColumns, FIELD_ALIASES.documentTypeDescription);
  if (directDescription) return directDescription;
  if (!category) return "";

  const officialCatalog = window.TriagemCore?.EGRDT_OPTIONS?.documentTypes || [];
  if (officialCatalog.some((item) => normalizeSearch(item) === normalizeSearch(category))) return category;

  try {
    const validation = window.TriagemCore?.validateDocumentCode?.(String(record.document ?? ""), String(record.sheet ?? ""));
    if (validation?.valid && validation.family === "N-1710") return category;
  } catch (_) {
    // A validação normativa é informativa aqui; o valor original da LD permanece intacto.
  }
  return "";
}

export function categoryLabel(record: LdDocumentRecord, category?: string): string {
  const value = category || documentCategory(record);
  return officialCategoryDescription(record, value);
}

export function toCandidate(record: LdDocumentRecord, score = 0): CoverDocumentCandidate {
  const category = documentCategory(record);
  return {
    id: [record.source, record.sheet, record.row, record.document, columnValue(record.ldColumns, FIELD_ALIASES.eap)].join("::"),
    record,
    documentNumber: String(record.document ?? "").trim(),
    title: String(record.title ?? "").trim(),
    taxonomy: internalTaxonomy(record),
    eap: columnValue(record.ldColumns, FIELD_ALIASES.eap),
    category,
    categoryLabel: categoryLabel(record, category),
    classification: columnValue(record.ldColumns, FIELD_ALIASES.classification),
    revision: String(record.revision ?? "").trim(),
    revisionDate: String(record.effectiveDate ?? "").trim(),
    discipline: String(record.discipline ?? "").trim(),
    tag: String(record.tag ?? "").trim(),
    ldName: String(record.source ?? "").trim(),
    sheet: String(record.sheet ?? "").trim(),
    row: Number(record.row) || 0,
    score,
  };
}

function yieldToUi(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => resolve());
    else window.setTimeout(resolve, 0);
  });
}

export async function prepareLdSearchIndex(
  records: LdDocumentRecord[],
  onProgress?: (progress: LdLoadProgress) => void,
): Promise<LdSearchIndex> {
  const entries: LdSearchIndexEntry[] = new Array(records.length);
  const chunkSize = records.length >= 20000 ? 1500 : 3000;
  for (let index = 0; index < records.length; index += 1) {
    entries[index] = { record: records[index], normalizedTitle: normalizeSearch(records[index].title) };
    if ((index + 1) % chunkSize === 0) {
      onProgress?.({
        phase: "prepare",
        progress: records.length ? (index + 1) / records.length : 1,
        message: "Preparando documentos",
      });
      await yieldToUi();
    }
  }
  onProgress?.({ phase: "ready", progress: 1, message: "Pronto para pesquisa" });
  return { entries, count: entries.length };
}

export async function loadLdRecords(
  files: FileList | File[],
  onProgress?: (progress: LdLoadProgress) => void,
): Promise<LoadedLdRecords> {
  if (!window.TriagemCore) throw new Error("Motor documental do GRCON não está disponível.");
  const records: LdDocumentRecord[] = [];
  const validFiles = Array.from(files).filter((file) => /\.(?:xlsx?|xlsm)$/i.test(file.name));
  if (!validFiles.length) throw new Error("Selecione uma LD XLSX, XLS ou XLSM válida.");

  for (let fileIndex = 0; fileIndex < validFiles.length; fileIndex += 1) {
    const file = validFiles[fileIndex];
    onProgress?.({ phase: "read", progress: fileIndex / validFiles.length, message: "Lendo LD" });
    const profile = window.GrconLdCompatibility?.profileFor?.(file);
    if (window.GrconPerformance?.supported && typeof window.GrconPerformance.loadLd === "function") {
      const loaded = await window.GrconPerformance.loadLd(file, profile, (message) => {
        const value = Math.max(0, Math.min(1, Number(message?.progress) || 0));
        onProgress?.({
          phase: value < 0.6 ? "read" : "prepare",
          progress: (fileIndex + value) / validFiles.length,
          message: value < 0.6 ? "Lendo LD" : "Preparando documentos",
        });
      });
      records.push(...((loaded.parsed?.records || []) as unknown as LdDocumentRecord[]));
    } else {
      if (!window.XLSX) throw new Error("Leitor de LD do GRCON não está disponível.");
      await yieldToUi();
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
      await yieldToUi();
      const parsed = window.TriagemCore.parseWorkbook(workbook, file.name, file.lastModified, profile);
      records.push(...((parsed.records || []) as unknown as LdDocumentRecord[]));
      await yieldToUi();
    }
  }

  const filtered = records.filter((record) => Boolean(String(record.title ?? "").trim() && String(record.document ?? "").trim()));
  const searchIndex = await prepareLdSearchIndex(filtered, onProgress);
  return { records: filtered, searchIndex };
}

function insertTopCandidate(list: CoverDocumentCandidate[], candidate: CoverDocumentCandidate, limit: number): void {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const current = list[middle];
    const before = candidate.score > current.score
      || (candidate.score === current.score && candidate.title.localeCompare(current.title, "pt-BR") < 0);
    if (before) high = middle;
    else low = middle + 1;
  }
  if (low >= limit) return;
  list.splice(low, 0, candidate);
  if (list.length > limit) list.pop();
}

export function searchLdDocuments(index: LdSearchIndex, query: string, limit = 30): CoverDocumentCandidate[] {
  const wanted = normalizeSearch(query);
  if (!wanted || wanted.length < 2) return [];
  const top: CoverDocumentCandidate[] = [];
  for (const entry of index.entries) {
    const score = scoreNormalizedTitle(entry.normalizedTitle, wanted);
    if (score <= 0) continue;
    insertTopCandidate(top, toCandidate(entry.record, score), limit);
  }
  return top;
}

export function uniqueExactCandidate(candidates: CoverDocumentCandidate[], query: string): CoverDocumentCandidate | null {
  const wanted = normalizeSearch(query);
  const exact = candidates.filter((candidate) => normalizeSearch(candidate.title) === wanted);
  return exact.length === 1 ? exact[0] : null;
}
