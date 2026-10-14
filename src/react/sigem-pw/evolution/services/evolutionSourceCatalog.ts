import type { SigemPwBase, SigemPwHistory, SigemPwSharedVersion } from "../../types/domain";
import type { EvolutionSourceSnapshotMeta, EvolutionSystem } from "../types/domain";

export interface EvolutionSourceCatalog {
  metadata: Record<EvolutionSystem, EvolutionSourceSnapshotMeta[]>;
  payloads: Map<string, SigemPwBase>;
  aliases: Map<string, string>;
  sharedIds: Set<string>;
  versions: SigemPwSharedVersion[] | null;
}

// Full Dashboard snapshots and the older content-indexed history are projections
// of the same import. Shared versions are authoritative while online.
export function buildEvolutionSourceCatalog(
  local: Record<EvolutionSystem, EvolutionSourceSnapshotMeta[]>,
  history: SigemPwHistory,
  versions: SigemPwSharedVersion[] | null,
  fingerprint: (system: string, records: SigemPwBase["records"]) => string,
): EvolutionSourceCatalog {
  const sources = new Map<string, EvolutionSourceSnapshotMeta>();
  const payloads = new Map<string, SigemPwBase>();
  const aliases = new Map<string, string>();
  const sharedIds = new Set((versions || []).map(version => version.snapshot_id));
  const deleted = new Set(history.deletedIds || []);
  const superseded = new Set<string>();
  for (const base of history.snapshots) {
    const system = base.meta.kind;
    if (system !== "sigem" && system !== "pw") continue;
    const id = String(base.meta.snapshotId || "");
    if (!id) continue;
    const alias = String(base.meta.historySourceSnapshotId || `${system}:${fingerprint(system, base.records)}`);
    superseded.add(alias);
    if (deleted.has(id) || (system === "sigem" && versions !== null
      && base.meta.source === "shared-general-query" && !sharedIds.has(id))) continue;
    aliases.set(alias, id);
    sources.set(id, { ...base.meta, id, system });
    payloads.set(id, base);
  }
  for (const system of ["sigem", "pw"] as const) {
    for (const meta of local[system]) {
      if (!superseded.has(meta.id) && !deleted.has(meta.id)) sources.set(meta.id, { ...meta, system });
    }
  }
  for (const version of versions || []) {
    const id = version.snapshot_id;
    const meta = { ...version.metadata, snapshotId: id, source: "shared-general-query",
      fileName: version.file_name, importedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(version.metadata?.referenceDate || ""))
        ? `${version.metadata.referenceDate}T12:00:00.000Z`
        : version.metadata?.importedAt || version.published_at || version.created_at,
      recordCount: version.record_count, version: version.version };
    sources.set(id, { ...meta, id, system: "sigem" });
    const base = payloads.get(id);
    if (base) payloads.set(id, { ...base, meta: { ...base.meta, ...meta } });
  }
  return { metadata: {
    sigem: [...sources.values()].filter(source => source.system === "sigem"),
    pw: [...sources.values()].filter(source => source.system === "pw"),
  }, payloads, aliases, sharedIds, versions };
}
