import type { RevisionHistoryItem, RevisionRow } from "../types/domain";

function HistoryItems({ items, pw }: { items: RevisionHistoryItem[]; pw?: boolean }) {
  if (!items.length) return <span className="spw-rev-history-empty">Nenhuma revisão localizada.</span>;
  return (
    <div className="spw-rev-history">
      {items.map((item, index) => (
        <span className="spw-rev-history-pill" key={String(item.revision) + "-" + index}>
          <b>Rev. {item.revision || "—"}</b>
          <small>{item.status || "sem status"}{pw ? (item.emitted ? " · emitida" : " · não emitida") : ""}</small>
        </span>
      ))}
    </div>
  );
}

function DetailRow({ row, histories }: {
  row: RevisionRow;
  histories: (row: RevisionRow) => { sigem: RevisionHistoryItem[]; pw: RevisionHistoryItem[] };
}) {
  const history = histories(row);
  const pwRevisions = history.pw.map((item) => item.revision).filter(Boolean).join(", ") || "—";
  return (
    <tr className="spw-rev-detail">
      <td colSpan={9}>
        <div className="spw-rev-detail-grid">
          <section>
            <strong>SIGEM — revisões encontradas</strong>
            <HistoryItems items={history.sigem} />
          </section>
          <section>
            <strong>ProjectWise — revisões encontradas</strong>
            <HistoryItems items={history.pw} pw />
          </section>
          <section className="spw-rev-diagnostic">
            <strong>Por que esta situação?</strong>
            <p className="spw-rev-reason">{row.reason || "Sem diagnóstico adicional."}</p>
            <dl className="spw-rev-reason-meta">
              <div><dt>Código SIGEM</dt><dd>{row.sigemCode || row.document || "—"}</dd></div>
              <div><dt>Código PW</dt><dd>{row.pwCode || "—"}</dd></div>
              <div><dt>EAP</dt><dd>{row.eap || "—"}</dd></div>
              <div><dt>Tipo</dt><dd>{row.documentType || "—"}</dd></div>
              <div><dt>Revisão SIGEM</dt><dd>{row.sigemRevision || "—"}</dd></div>
              <div><dt>Revisões PW</dt><dd>{pwRevisions}</dd></div>
              <div><dt>Critério</dt><dd>documento + revisão</dd></div>
            </dl>
          </section>
        </div>
      </td>
    </tr>
  );
}

function valueOrDash(value: string): string {
  return value || "—";
}

export function SigemPwRevisionTable({
  rows,
  expandedKey,
  onToggle,
  histories,
  situationLabel,
  situationClass,
}: {
  rows: RevisionRow[];
  expandedKey: string;
  onToggle(key: string): void;
  histories(row: RevisionRow): { sigem: RevisionHistoryItem[]; pw: RevisionHistoryItem[] };
  situationLabel(value: string): string;
  situationClass(value: string): string;
}) {
  if (!rows.length) {
    return (
      <div className="spw-rev-empty spw-rev-empty-filter">
        <div>
          <strong>Nenhum resultado</strong>
          <span>Nenhum documento corresponde aos filtros atuais.</span>
        </div>
      </div>
    );
  }

  return (
    <table className="spw-rev-table">
      <caption>Situação das Revisões SIGEM × ProjectWise</caption>
      <thead>
        <tr>
          <th>Documento</th>
          <th>Classe</th>
          <th>Rev. SIGEM</th>
          <th>Status SIGEM</th>
          <th>Rev. PW</th>
          <th>Status PW</th>
          <th>Última emissão PW</th>
          <th>Situação</th>
          <th>Detalhes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const expanded = row.key === expandedKey;
          const sigemRevision = valueOrDash(row.sigemRevision);
          const pwRevision = valueOrDash(row.pwRevision);
          return (
            <FragmentRow key={row.key}>
              <tr>
                <td className="spw-rev-doc" title={row.document}><strong>{row.document}</strong></td>
                <td><span className="spw-rev-class">{row.documentClass || "—"}</span></td>
                <td><span className="spw-rev-revision">{sigemRevision}</span></td>
                <td><span className="spw-rev-status" title={row.sigemStatus || ""}>{valueOrDash(row.sigemStatus)}</span></td>
                <td><span className="spw-rev-revision">{pwRevision}</span></td>
                <td><span className="spw-rev-status" title={row.pwStatus || ""}>{valueOrDash(row.pwStatus)}</span></td>
                <td>
                  <span className="spw-rev-emission">
                    {row.lastEmittedPwRevision ? "Rev. " + row.lastEmittedPwRevision : "—"}
                  </span>
                </td>
                <td>
                  <div className="spw-rev-situation-cell">
                    <span className="spw-rev-flow" aria-label={"SIGEM " + sigemRevision + " para PW " + pwRevision}>
                      <small>SIGEM</small><b>{sigemRevision}</b><i aria-hidden="true">→</i><small>PW</small><b>{pwRevision}</b>
                    </span>
                    <span className={"spw-rev-situation " + situationClass(row.situation)}>
                      {situationLabel(row.situation)}
                    </span>
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    className="spw-rev-why"
                    data-spw-rev-why
                    aria-expanded={expanded}
                    onClick={() => onToggle(row.key)}
                  >
                    {expanded ? "Fechar" : "Por quê?"}
                  </button>
                </td>
              </tr>
              {expanded ? <DetailRow row={row} histories={histories} /> : null}
            </FragmentRow>
          );
        })}
      </tbody>
    </table>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
