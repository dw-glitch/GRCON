import { UiMetaPill, UiPageHeader } from "../../core/ui/UiPrimitives";

interface Props {
  busy: boolean;
  classifiedTotal: number;
  ready: boolean;
  onEvolution(): void;
  onHistory(): void;
  onExport(): void;
}

function fmt(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function Icon({ path }: { path: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={path}></path></svg>;
}

export function SigemPwHeader({ busy, classifiedTotal, ready, onEvolution, onHistory, onExport }: Props) {
  return (
    <div className="spw-heading-shell">
      <UiPageHeader
        eyebrow="Controle documental integrado"
        title="Dashboard SIGEM × ProjectWise"
        description="Compare a Consulta Geral com a relação ProjectWise por documento + revisão, mantendo ET e N-1710 como universo operacional do dashboard."
        meta={(
          <>
            <UiMetaPill><strong>ET + N-1710</strong></UiMetaPill>
            <UiMetaPill>Chave <strong>documento + revisão</strong></UiMetaPill>
            <UiMetaPill className={ready ? "spw-meta-ready" : "spw-meta-pending"}>
              <strong>{ready ? "Bases prontas" : "Aguardando bases"}</strong>
            </UiMetaPill>
            {classifiedTotal > 0 ? <UiMetaPill><strong>{fmt(classifiedTotal)}</strong> conciliados</UiMetaPill> : null}
          </>
        )}
      />
      <div className="spw-heading-actions" aria-label="Ações do dashboard SIGEM × ProjectWise">
        <button className="secondary-button" id="spw-evolution-open" type="button" disabled={busy} onClick={onEvolution}>
          <Icon path="M4 18V9M10 18V5M16 18v-7M3 18h18M5 6l5-3 6 5 4-3" /><span>Evolução</span>
        </button>
        <button className="secondary-button" id="spw-history-open" type="button" disabled={busy} onClick={onHistory}>
          <Icon path="M4 6h16M6 3h12l1 3H5l1-3M7 9v9h10V9M10 12h4" /><span>Gerenciar histórico</span>
        </button>
        <button className="primary-button" id="spw-export" type="button" disabled={busy} onClick={onExport}>
          <Icon path="M12 3v12M8 11l4 4 4-4M5 19h14" /><span>Exportar lista</span>
        </button>
      </div>
    </div>
  );
}
