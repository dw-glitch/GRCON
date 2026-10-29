import type { SigemPwBase, SigemPwBaseMeta, SigemPwRecord } from "../types/domain";

export interface ReferenceSource {
  id: string;
  fileName: string;
  importedAt: string;
  fileSize: number;
  recordCount: number;
  active: boolean;
}

/** A stable filename identity makes re-importing a file an explicit replacement of only that source. */
export function sourceId(fileName: string): string {
  return "ld:" + fileName.trim().normalize("NFKC").toLocaleLowerCase("pt-BR");
}

export function listedSources(base: SigemPwBase): ReferenceSource[] {
  const saved = base.meta?.sources;
  if (Array.isArray(saved)) return saved.filter((s): s is ReferenceSource =>
    !!s && typeof s === "object" && typeof s.id === "string"
  ).map(s => ({ ...s }));
  if (!base.meta) return [];
  return [{
    id: sourceId(String(base.meta.fileName || "Referencia legada.xlsx")),
    fileName: String(base.meta.fileName || "Referência legada"),
    importedAt: String(base.meta.importedAt || ""),
    fileSize: Number(base.meta.fileSize || 0),
    recordCount: base.records.length,
    active: true,
  }];
}

export function originalSourceRows(base: SigemPwBase): SigemPwRecord[] {
  if (Array.isArray(base.sourceRecords)) return base.sourceRecords.map(r => ({ ...r }));
  const legacy = listedSources(base)[0];
  return legacy ? base.records.map(record => ({ ...record, referenceSourceId: legacy.id,
    referenceSourceName: legacy.fileName })) : [];
}

interface Identity { key: string; canonical?: string }
export type ReferenceIdentity = (document: string) => Identity;

/** No silent winner when two active sources contradict each other. */
export function consolidateReferences(
  sources: ReferenceSource[],
  sourceRows: SigemPwRecord[],
  identity: ReferenceIdentity,
): { records: SigemPwRecord[]; conflictCount: number } {
  const active = new Set(sources.filter(source => source.active).map(source => source.id));
  const byCode = new Map<string, SigemPwRecord[]>();
  for (const record of sourceRows) {
    if (!active.has(String(record.referenceSourceId || ""))) continue;
    const document = String(record.document || "");
    const canonical = identity(document);
    if (!canonical.key) continue;
    const group = byCode.get(canonical.key) || [];
    group.push({ ...record, documentKey: canonical.key, canonicalDocument: canonical.canonical || document });
    byCode.set(canonical.key, group);
  }
  let conflictCount = 0;
  const records = [...byCode.entries()].map(([key, rows]) => {
    const distinct = (field: string) => [...new Set(rows.map(row => String(row[field] || "").trim()).filter(Boolean))];
    const revisions = distinct("revision");
    const titles = distinct("title");
    const statuses = distinct("status");
    const conflict = revisions.length > 1 || titles.length > 1 || statuses.length > 1;
    if (conflict) conflictCount++;
    return {
      ...rows[0],
      documentKey: key,
      referenceSources: [...new Set(rows.map(row => String(row.referenceSourceName || "")).filter(Boolean))],
      referenceSourceIds: [...new Set(rows.map(row => String(row.referenceSourceId || "")).filter(Boolean))],
      referenceConflict: conflict,
      referenceConflictRevisions: revisions,
      referenceConflictTitles: titles,
      referenceConflictStatuses: statuses,
      revision: revisions.length === 1 ? revisions[0] : "",
      title: titles.length === 1 ? titles[0] : "",
      status: statuses.length === 1 ? statuses[0] : "",
    };
  });
  return { records, conflictCount };
}

export function buildReferenceBase(
  previous: SigemPwBase,
  additions: Array<{ file: File; meta: SigemPwBaseMeta; records: SigemPwRecord[] }>,
  identity: ReferenceIdentity,
  activateSourceId?: string,
  activate?: boolean,
): SigemPwBase {
  const sources = listedSources(previous);
  let sourceRows = originalSourceRows(previous);
  for (const added of additions) {
    const id = sourceId(added.file.name);
    const position = sources.findIndex(source => source.id === id);
    const source: ReferenceSource = {
      id, fileName: added.file.name,
      importedAt: String(added.meta.importedAt || new Date().toISOString()),
      fileSize: added.file.size,
      recordCount: added.records.length,
      active: position < 0 ? true : sources[position].active,
    };
    if (position < 0) sources.push(source);
    else sources[position] = source;
    sourceRows = sourceRows.filter(row => row.referenceSourceId !== id);
    sourceRows.push(...added.records.map(row => ({
      ...row, referenceSourceId: id, referenceSourceName: source.fileName,
    })));
  }
  if (activateSourceId !== undefined) {
    const source = sources.find(item => item.id === activateSourceId);
    if (!source) throw new Error("Fonte de referência não localizada.");
    source.active = Boolean(activate);
  }
  const merged = consolidateReferences(sources, sourceRows, identity);
  const now = new Date().toISOString();
  return {
    meta: {
      ...(previous.meta || {}),
      fileName: `Referências documentais (${sources.filter(s => s.active).length} ativas)`,
      importedAt: now,
      sourceImportedAt: now,
      fileSize: sources.reduce((total, source) => total + source.fileSize, 0),
      sources,
      referenceConflictCount: merged.conflictCount,
      recordCount: merged.records.length,
      uniqueDocumentCount: merged.records.length,
    },
    records: merged.records,
    sourceRecords: sourceRows,
  };
}
