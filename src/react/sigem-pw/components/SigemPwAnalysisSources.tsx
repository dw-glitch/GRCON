import type { SigemPwState } from "../types/domain";
function date(value: unknown): string {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.split("-").reverse().join("/");
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "Não informada" : parsed.toLocaleString("pt-BR");
}
export function SigemPwAnalysisSources({ state, onSelect }: { state: SigemPwState; onSelect(system: "sigem" | "pw", id: string): void }) {
  const pwVersions = state.history.snapshots.filter(item => item.meta.kind === "pw");
  return <div className="spw-analysis-sources" aria-label="Fontes utilizadas no Dashboard">
    <label>Base da Consulta Geral
      <select id="spw-analysis-sigem" value={state.analysisSigemId} disabled={state.busy} onChange={event => onSelect("sigem", event.target.value)}>
        <option value="">Consulta Geral atual · {date(state.officialSigem?.referenceDate || state.officialSigem?.importedAt)}</option>
        {state.sigemVersions.map(version => <option key={version.snapshot_id} value={version.snapshot_id}>
          {date(version.metadata?.referenceDate || version.published_at)} · v{version.version} · {version.file_name} · {version.record_count.toLocaleString("pt-BR")} registros · {version.created_by_name || "Publicação compartilhada"}{version.status === "active" ? " · Atual" : ""} · Upload {date(version.published_at)}
        </option>)}
      </select>
    </label>
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
