import type { SigemPwState } from "../types/domain";
function date(value: unknown): string {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.split("-").reverse().join("/");
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "Não informada" : parsed.toLocaleString("pt-BR");
}
interface Props {
  state: SigemPwState;
  onSelect(system: "sigem" | "pw", id: string): void;
  canManageSigemHistory: boolean;
  onActivateSigem(id: string): void;
  onDeleteSigem(id: string): void;
}
export function SigemPwAnalysisSources({ state, onSelect, canManageSigemHistory, onActivateSigem, onDeleteSigem }: Props) {
  const pwVersions = state.history.snapshots.filter(item => item.meta.kind === "pw");
  const selectedSigemId = state.analysisSigemId || String(state.officialSigem?.snapshotId || "");
  const selectedSigemVersion = state.sigemVersions.find(version => version.snapshot_id === selectedSigemId);
  const selectedSigemIsCurrent = selectedSigemVersion?.status === "active";
  return <div className="spw-analysis-sources" aria-label="Fontes utilizadas no Dashboard">
    <label>Base da Consulta Geral
      <select id="spw-analysis-sigem" value={state.analysisSigemId} disabled={state.busy} onChange={event => onSelect("sigem", event.target.value)}>
        <option value="">Consulta Geral atual · {date(state.officialSigem?.referenceDate || state.officialSigem?.importedAt)}</option>
        {state.sigemVersions.map(version => <option key={version.snapshot_id} value={version.snapshot_id}>
          {date(version.metadata?.referenceDate || version.published_at)} · v{version.version} · {version.file_name} · {version.record_count.toLocaleString("pt-BR")} registros · {version.created_by_name || "Publicação compartilhada"}{version.status === "active" ? " · Atual" : ""} · Upload {date(version.published_at)}
        </option>)}
      </select>
    </label>
    {canManageSigemHistory && selectedSigemVersion ? <div className="spw-analysis-source-actions" aria-label="Gerenciar base da Consulta Geral selecionada">
      {!selectedSigemIsCurrent ? <button type="button" className="secondary-button" data-sigem-history-activate={selectedSigemVersion.snapshot_id} disabled={state.busy} onClick={() => onActivateSigem(selectedSigemVersion.snapshot_id)}>Tornar base atual</button> : null}
      <button type="button" className="secondary-button" data-sigem-history-delete={selectedSigemVersion.snapshot_id} disabled={state.busy} onClick={() => onDeleteSigem(selectedSigemVersion.snapshot_id)}>{selectedSigemIsCurrent ? "Excluir base atual" : "Excluir base selecionada"}</button>
    </div> : null}
    <label>Base PW utilizada
      <select id="spw-analysis-pw" value={state.analysisPwId} disabled={state.busy} onChange={event => onSelect("pw", event.target.value)}>
        <option value="">Base PW atual</option>
        {pwVersions.map(version => <option key={String(version.meta.snapshotId)} value={String(version.meta.snapshotId)}>{date(version.meta.importedAt)} · {String(version.meta.fileName)} · {version.records.length.toLocaleString("pt-BR")} registros</option>)}
      </select>
    </label>
    <p id="spw-analysis-combination" role="status">Comparação atual: Consulta Geral {date(state.sigem.meta?.referenceDate || state.sigem.meta?.importedAt)} × PW {date(state.pw.meta?.importedAt)}.
      {state.analysisSigemId ? <> Base histórica selecionada para análise. A Consulta Geral oficial permanece em {date(state.officialSigem?.referenceDate || state.officialSigem?.importedAt)}.</> : " Usando a Consulta Geral atual."}
    </p>
    {state.analysisSigemId && <button type="button" className="secondary-button" disabled={state.busy} onClick={() => onSelect("sigem", "")}>Usar Consulta Geral mais recente</button>}
    {state.analysisError && <div role="alert"><p>{state.analysisError}</p><button className="secondary-button" type="button" disabled={state.busy} onClick={() => onSelect("sigem", state.analysisSigemId)}>Tentar novamente</button></div>}
  </div>;
}
