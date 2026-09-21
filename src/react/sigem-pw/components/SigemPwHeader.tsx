interface Props {
  busy: boolean;
  onEvolution(): void;
  onHistory(): void;
  onExport(): void;
}

function Icon({ path }: { path: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={path}></path></svg>;
}

export function SigemPwHeader({ busy, onEvolution, onHistory, onExport }: Props) {
  return (
    <header className="spw-page-heading">
      <div>
        <span>CONTROLE DOCUMENTAL INTEGRADO</span>
        <h2>Dashboard SIGEM × ProjectWise</h2>
        <p>Comparação por código + revisão; quando o PW não informa a revisão, a presença no SIGEM é confirmada pelo código do documento. Universo limitado às classes ET e N-1710 da LD da Qualidade.</p>
      </div>
      <div className="spw-heading-actions">
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
    </header>
  );
}
