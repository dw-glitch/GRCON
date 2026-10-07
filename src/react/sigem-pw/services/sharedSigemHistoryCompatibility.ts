import type { SigemPwBase, SigemPwBaseMeta, SigemPwRecord, SigemPwSharedVersion } from "../types/domain";

type SharedApi = NonNullable<Window["GrconSharedSigemQuery"]>;
interface CloudState {
  online?: boolean;
  membership?: { workspace_id?: string; role?: string };
  client?: { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error?: unknown }> };
}

// A tab opened before a deployment can keep the old shared API while loading
// the new lazy dashboard. Extend that API without restarting it or duplicating
// its listeners, timers, current base and unsaved work.
export function ensureSharedSigemHistoryCompatibility(): SharedApi | undefined {
  const original = window.GrconSharedSigemQuery;
  if (!original || (typeof original.listVersions === "function" && typeof original.loadSnapshot === "function" && typeof original.activateVersion === "function" && typeof original.deleteVersion === "function")) return original;
  const cloud = () => window.GrconCloud?.state as CloudState | undefined;
  const cache = new Map<string, SigemPwBase>();
  let cacheWorkspace = "";
  function workspace(): string {
    const id = cloud()?.membership?.workspace_id || "";
    if (id !== cacheWorkspace) { cache.clear(); cacheWorkspace = id; }
    return id;
  }
  async function request<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const client = cloud()?.client;
    if (!client) throw new Error("Conexão da Consulta Geral indisponível.");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        client.rpc(`grcon_sigem_query_${name}`, args),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("O banco não respondeu a tempo.")), 45000); }),
      ]);
      if (response.error) throw response.error;
      if (args.target_workspace !== workspace()) throw new Error("O contrato mudou durante a leitura.");
      return response.data as T;
    } finally { clearTimeout(timer); }
  }
  async function listVersions(): Promise<SigemPwSharedVersion[]> {
    const id = workspace();
    if (!id || !cloud()?.online) return [];
    const versions = await request<SigemPwSharedVersion[]>("versions", { target_workspace: id });
    if (!Array.isArray(versions)) throw new Error("Histórico da Consulta Geral inválido.");
    for (const [key, base] of cache) {
      const version = versions.find(item => item.snapshot_id === key);
      if (!version || version.metadata?.referenceDate !== base.meta?.referenceDate) cache.delete(key);
    }
    return versions;
  }
  function metadata(version: SigemPwSharedVersion): SigemPwBaseMeta {
    return { ...version.metadata, snapshotId: version.snapshot_id, version: version.version,
      fileName: version.file_name, importedAt: version.metadata?.importedAt || version.published_at || version.created_at,
      publishedAt: version.published_at, recordCount: version.record_count, createdByName: version.created_by_name,
      source: "shared-general-query" };
  }
  async function loadSnapshot(id: string, versions?: SigemPwSharedVersion[]): Promise<SigemPwBase> {
    const targetWorkspace = workspace();
    const version = (versions || await listVersions()).find(item => item.snapshot_id === id);
    if (!version) throw new Error("Não foi possível carregar esta versão da Consulta Geral. Ela pode ter sido excluída.");
    if (!Number.isInteger(version.record_count) || version.record_count < 1 || version.record_count > 100000) throw new Error("Contagem da Consulta Geral inválida.");
    const current = original!.current();
    const cached = current?.meta?.snapshotId === id ? current : cache.get(id);
    if (cached) return { ...cached, meta: metadata(version) };
    const records: SigemPwRecord[] = [];
    let after = 0;
    while (records.length < version.record_count) {
      const page = await request<Array<{ row_number: number; payload: SigemPwRecord }>>("page", {
        target_workspace: targetWorkspace, target_snapshot: id, after_row: after, page_size: 1000,
      });
      if (!Array.isArray(page) || !page.length) throw new Error("Não foi possível carregar esta versão da Consulta Geral: dados incompletos.");
      for (const entry of page) {
        if (entry.row_number <= after) throw new Error("Paginação da Consulta Geral inválida.");
        records.push(entry.payload); after = entry.row_number;
      }
    }
    if (records.length !== version.record_count) throw new Error("Contagem da Consulta Geral divergente.");
    if (records.some(row => !String(row?.document || "").trim() || !String(row?.revision ?? "").trim()) || !records.some(row => String(row?.status || "").trim())) throw new Error("Consulta Geral contém registros inválidos.");
    const base = { meta: metadata(version), records };
    cache.set(id, base);
    while (cache.size > 3) cache.delete(cache.keys().next().value!);
    return base;
  }
  function canManageHistory(): boolean { return cloud()?.membership?.role === "owner"; }
  async function activateVersion(id: string): Promise<SigemPwBase | null | undefined> {
    if (!canManageHistory()) throw new Error("Somente o proprietário pode selecionar a Consulta Geral atual.");
    if (!id) throw new Error("Selecione uma base da Consulta Geral.");
    await request<unknown>("activate", { target_workspace: workspace(), target_snapshot: id });
    cache.clear();
    const legacyState = (original as SharedApi & { state?: { shared?: SigemPwBase | null } }).state;
    if (legacyState) legacyState.shared = null;
    await original!.refresh();
    window.dispatchEvent(new CustomEvent("grcon:shared-sigem-metadata-invalidated"));
    return original!.current();
  }
  async function deleteVersion(id: string): Promise<{ removedSnapshotId?: string; removedWasCurrent?: boolean; activeSnapshotId?: string | null }> {
    if (!canManageHistory()) throw new Error("Somente o proprietário pode excluir bases da Consulta Geral.");
    if (!id) throw new Error("Selecione uma base da Consulta Geral.");
    const result = await request<{ removedSnapshotId?: string; removedWasCurrent?: boolean; activeSnapshotId?: string | null }>("delete", { target_workspace: workspace(), target_snapshot: id });
    cache.clear();
    const legacyState = (original as SharedApi & { state?: { shared?: SigemPwBase | null } }).state;
    if (legacyState) legacyState.shared = null;
    await original!.refresh();
    window.dispatchEvent(new CustomEvent("grcon:shared-sigem-metadata-invalidated"));
    return result;
  }
  async function setReferenceDate(value: string, targetId?: string): Promise<SigemPwBase | undefined> {
    // Old setReferenceDate only edits the current base; never pass it a historical ID.
    const current = original!.current();
    if (!targetId || targetId === current?.meta?.snapshotId) return original!.setReferenceDate(value);
    if (!["owner", "admin"].includes(cloud()?.membership?.role || "")) throw new Error("Sem permissão para editar a data.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Informe a data da Consulta Geral.");
    const base = await loadSnapshot(targetId);
    const updated = await request<SigemPwBaseMeta>("set_date", { target_workspace: workspace(), target_snapshot: targetId,
      reference_date: value, expected_date: base.meta?.referenceDate || null });
    base.meta = { ...base.meta, ...updated };
    cache.set(targetId, base);
    await window.GrconSigemPwDashboard?.updateSnapshotMetadata("sigem", targetId, base.meta);
    const history = window.GrconSigemPwHistory;
    if (history) {
      const sourceId = String(base.meta.historySourceSnapshotId || `sigem:${history.contentFingerprint("sigem", base.records)}`);
      await history.updateSourceSnapshotDate("sigem", sourceId, `${value}T12:00:00`);
    }
    window.dispatchEvent(new CustomEvent("grcon:shared-sigem-date-updated", { detail: { meta: base.meta, workspace: workspace() } }));
    return base;
  }
  const compatible = Object.freeze({ ...original, listVersions, loadSnapshot, setReferenceDate, canManageHistory, activateVersion, deleteVersion });
  window.GrconSharedSigemQuery = compatible;
  return compatible;
}
