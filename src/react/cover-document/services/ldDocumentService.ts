import type { CoverDocumentCandidate, LdColumnValue, LdDocumentRecord } from "../types/domain";

const CATEGORY_LABELS: Record<string, string> = {
  PR: "PROCEDIMENTO",
  RL: "RELATÓRIO",
  RM: "RELATÓRIO DE MEMÓRIA",
  ET: "ESPECIFICAÇÃO TÉCNICA",
  MD: "MEMORIAL DESCRITIVO",
  MC: "MEMORIAL DE CÁLCULO",
  MA: "MANUAL",
  LI: "LISTA",
  LD: "LISTA DE DOCUMENTOS",
  DE: "DESENHO",
  PT: "PARECER TÉCNICO",
  IM: "INSTRUÇÃO DE MONTAGEM",
  IS: "INSTRUÇÃO DE SERVIÇO",
  CR: "CRITÉRIO",
  CE: "CERTIFICADO",
};

const FIELD_ALIASES = {
  eap: ["EAP", "CODIGO EAP", "CODIGO DA EAP", "ESTRUTURA ANALITICA DO PROJETO"],
  classification: ["CLASSIFICACAO", "CLASSIFICACAO DO DOCUMENTO", "CLASSE", "CLASSE DOCUMENTAL"],
  internalCode: ["COD DOCUMENTO INTERNO", "CODIGO DOCUMENTO INTERNO", "CODIGO DO DOCUMENTO INTERNO", "CODIGO INTERNO", "CODIGO DA CONTRATADA", "DOCUMENTO INTERNO"],
} as const;

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

function exactColumnValue(columns: LdColumnValue[] | undefined, header: string): string {
  if (!columns?.length) return "";
  const wanted = normalizedHeader(header);
  const values = columns
    .filter((entry) => normalizedHeader(entry.header) === wanted)
    .map((entry) => String(entry.value ?? "").trim());
  if (!values.length) return "";
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : "";
}

function columnValue(columns: LdColumnValue[] | undefined, aliases: readonly string[]): string {
  if (!columns?.length) return "";
  const aliasSet = new Set(aliases.map(normalizedHeader));
  const exact = columns.find((entry) => aliasSet.has(normalizedHeader(entry.header)));
  if (exact?.value) return String(exact.value).trim();
  const fuzzy = columns.find((entry) => {
    const header = normalizedHeader(entry.header);
    return aliases.some((alias) => {
      const wanted = normalizedHeader(alias);
      return header === wanted || header.startsWith(`${wanted} `) || header.endsWith(` ${wanted}`);
    });
  });
  return String(fuzzy?.value ?? "").trim();
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

export function categoryLabel(category: string): string {
  const value = String(category || "").trim();
  if (!value) return "";
  const key = value.toUpperCase();
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  if (value.length > 3 || /\s/.test(value)) return value.toUpperCase();
  return value.toUpperCase();
}

export function toCandidate(record: LdDocumentRecord, score = 0): CoverDocumentCandidate {
  const category = documentCategory(record);
  return {
    id: [record.source, record.sheet, record.row, record.document, columnValue(record.ldColumns, FIELD_ALIASES.eap)].join("::"),
    record,
    documentNumber: String(record.document ?? "").trim(),
    title: String(record.title ?? "").trim(),
    taxonomy: exactColumnValue(record.ldColumns, "TAXONOMIA"),
    eap: columnValue(record.ldColumns, FIELD_ALIASES.eap),
    category,
    categoryLabel: categoryLabel(category),
    classification: columnValue(record.ldColumns, FIELD_ALIASES.classification),
    internalDocumentCode: columnValue(record.ldColumns, FIELD_ALIASES.internalCode),
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

export async function loadLdRecords(files: FileList | File[]): Promise<LdDocumentRecord[]> {
  if (!window.TriagemCore) throw new Error("Leitor de LD do GRCON não está disponível.");
  const records: LdDocumentRecord[] = [];
  for (const file of Array.from(files)) {
    if (!/\.(?:xlsx?|xlsm)$/i.test(file.name)) continue;
    let parsed: { records: LdDocumentRecord[] };
    const performanceCore = (window as unknown as {
      GrconPerformance?: {
        supported?: boolean;
        loadLd?: (input: File, profile?: unknown) => Promise<{ parsed?: { records?: unknown[] } }>;
      };
    }).GrconPerformance;
    if (performanceCore?.supported && typeof performanceCore.loadLd === "function") {
      const result = await performanceCore.loadLd(file, null);
      parsed = { records: (result.parsed?.records || []) as unknown as LdDocumentRecord[] };
    } else {
      if (!window.XLSX) throw new Error("Leitor de planilhas do GRCON não está disponível.");
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
      const triagemCore = (window as unknown as {
        TriagemCore: {
          parseWorkbook: (input: unknown, fileName: string, lastModified: number) => { records?: unknown[] };
        };
      }).TriagemCore;
      const fallback = triagemCore.parseWorkbook(workbook, file.name, file.lastModified);
      parsed = { records: (fallback.records || []) as unknown as LdDocumentRecord[] };
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
    records.push(...((parsed.records || []) as unknown as LdDocumentRecord[]));
    const ldMemory = (window as unknown as { GrconLdMemory?: { save?: (input: File) => void } }).GrconLdMemory;
    ldMemory?.save?.(file);
  }
  return records.filter((record) => Boolean(String(record.title ?? "").trim() && String(record.document ?? "").trim()));
}

export interface LdSearchEntry {
  record: LdDocumentRecord;
  normalizedTitle: string;
}

export function buildLdSearchIndex(records: LdDocumentRecord[]): LdSearchEntry[] {
  return records
    .map((record) => ({ record, normalizedTitle: normalizeSearch(record.title) }))
    .filter((entry) => Boolean(entry.normalizedTitle && String(entry.record.document ?? "").trim()));
}

export function searchLdDocuments(index: LdSearchEntry[], query: string, limit = 30): CoverDocumentCandidate[] {
  const wanted = normalizeSearch(query);
  if (!wanted) return [];
  return index
    .map((entry) => toCandidate(entry.record, scoreNormalizedTitle(entry.normalizedTitle, wanted)))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "pt-BR"))
    .slice(0, limit);
}

export function uniqueExactCandidate(candidates: CoverDocumentCandidate[], query: string): CoverDocumentCandidate | null {
  const wanted = normalizeSearch(query);
  const exact = candidates.filter((candidate) => normalizeSearch(candidate.title) === wanted);
  return exact.length === 1 ? exact[0] : null;
}
