import type { RevisionHistoryItem, RevisionRow } from "../types/domain";

function HistoryItems({ items, kind }: { items: RevisionHistoryItem[]; kind: "sigem" | "pw" }) {
  if (!items.length) return <span>Sem histórico disponível</span>;
  return (
    <>
      {items.map((item, index) => (
        <span key={`${item.revision}-${item.sourceRow || index}`}>
          Rev. {item.revision} · {item.status || "sem status"}{kind === "pw" ? ` · ${item.emitted ? "emitida" : "não emitida"}` : ""}
        </span>
      ))}
    </>
  );
}

function RevisionDetail({ row, histories }: {
  row: RevisionRow;
  histories: { sigem: RevisionHistoryItem[]; pw: RevisionHistoryItem[] };
}) {
  return (
    <tr className="spw-rev-detail">
      <td colSpan={9}>
        <div className="spw-rev-detail-grid">
          <section>
            <strong>SIGEM — revisões encontradas</strong>
            <div className="spw-rev-history"><HistoryItems items={histories.sigem} kind="sigem" /></div>
          </section>
          <section>
            <strong>ProjectWise — revisões encontradas</strong>
            <div className="spw-rev-history"><HistoryItems items={histories.pw} kind="pw" /></div>
          </section>
          <section>
            <strong>Por que esta situação?</strong>
            <p className="spw-rev-reason">{row.reason}</p>
            <p className="spw-rev-reason spw-rev-reason-meta">
              Código SIGEM: {row.sigemCode}
              {row.pwCode ? <><br />Código PW: {row.pwCode}</> : null}
              {row.eap ? <><br />EAP: {row.eap}</> : null}
              {row.documentType ? <><br />Tipo: {row.documentType}</> : null}
              <br />Revisão SIGEM: {row.sigemRevision}
              <br />Revisões PW: {histories.pw.map((item) => item.revision).join(", ") || "nenhuma"}
              <br />Critério: identidade documental e comparador de revisões do GRCON.
            </p>
          </section>
        </div>
      </td>
    </tr>
  );
}

export function SigemPwRevisionTable({
  rows,
  expandedKey,
  situationLabel,
  situationClass,
  historyForRow,
  onToggleDetail,
}: {
  rows: RevisionRow[];
  expandedKey: string;
  situationLabel(value: string): string;
  situationClass(value: string): string;
  historyForRow(row: RevisionRow): { sigem: RevisionHistoryItem[]; pw: RevisionHistoryItem[] };
  onToggleDetail(key: string): void;
}) {
  if (!rows.length) {
    return <div className="spw-rev-empty"><strong>Nenhum documento corresponde aos filtros atuais.</strong></div>;
  }

  return (
    <table className="spw-rev-table">
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
          const expanded = expandedKey === row.key;
          return (
            <RevisionRows
              key={row.key}
              row={row}
              expanded={expanded}
              situationLabel={situationLabel}
              situationClass={situationClass}
              histories={expanded ? historyForRow(row) : null}
              onToggle={() => onToggleDetail(row.key)}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function RevisionRows({
  row,
  expanded,
  situationLabel,
  situationClass,
  histories,
  onToggle,
}: {
  row: RevisionRow;
  expanded: boolean;
  situationLabel(value: string): string;
  situationClass(value: string): string;
  histories: { sigem: RevisionHistoryItem[]; pw: RevisionHistoryItem[] } | null;
  onToggle(): void;
}) {
  const lastEmission = row.lastEmittedPwRevision !== "" ? `Rev. ${row.lastEmittedPwRevision}` : "—";
  return (
    <>
      <tr>
        <td className="spw-rev-doc" title={row.document}><strong>{row.document}</strong></td>
        <td>{row.documentClass}</td>
        <td>{row.sigemRevision}</td>
        <td>{row.sigemStatus || "—"}</td>
        <td>{row.pwRevision !== "" ? row.pwRevision : "—"}</td>
        <td>{row.pwStatus || "—"}</td>
        <td>{lastEmission}</td>
        <td>
          <span className="spw-rev-flow">{row.sigemRevision} → {row.pwRevision !== "" ? row.pwRevision : "—"}</span>
          <br />
          <span className={`spw-rev-situation ${situationClass(row.situation)}`}>{situationLabel(row.situation)}</span>
        </td>
        <td>
          <button
            type="button"
            className="spw-rev-why"
            data-spw-rev-why={row.key}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {expanded ? "Fechar" : "Por quê?"}
          </button>
        </td>
      </tr>
      {expanded && histories ? <RevisionDetail row={row} histories={histories} /> : null}
    </>
  );
}
