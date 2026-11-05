import type { RevisionMatrix, RevisionMatrixCell, RevisionRow, RevisionTone } from "../types/domain";
import { DocumentClassBadge } from "../../../core/ui/DocumentClassBadge";

const MAX_COLUMNS = 8;

const TONE_LABEL: Record<RevisionTone, string> = {
  done: "Postada / emitida",
  progress: "Em análise",
  bad: "Recusada",
  planned: "Prevista / não postada",
  registered: "Prevista no PW, não emitida",
  other: "Outro status",
  none: "Sem status",
};

function Chip({ cell, skipped, system }: { cell: RevisionMatrixCell | null; skipped: boolean; system: string }) {
  if (!cell) {
    return skipped
      ? <span className="spw-mx-chip is-skipped" title={system + ": revisão pulada"} aria-label={system + ": revisão pulada"}>pulada</span>
      : <span className="spw-mx-chip is-empty" aria-label={system + ": sem registro"}>—</span>;
  }
  const label = cell.status || TONE_LABEL[cell.tone];
  return <span className={"spw-mx-chip tone-" + cell.tone} title={system + ": " + label}>{label}</span>;
}

export function SigemPwRevisionMatrixView({
  rows,
  matrix,
  situationLabel,
  situationClass,
}: {
  rows: RevisionRow[];
  matrix(row: RevisionRow): RevisionMatrix;
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

  const matrices = rows.map((row) => ({ row, data: matrix(row) }));
  // Colunas comuns à página, em ordem crescente de revisão. Passando do limite,
  // mostram-se as mais recentes e o cabeçalho informa quantas ficaram de fora.
  const byRank = new Map<string, { label: string; rank: number }>();
  matrices.forEach(({ data }) => data.columns.forEach((column) => {
    if (!byRank.has(column.revision.toUpperCase())) byRank.set(column.revision.toUpperCase(), { label: column.revision, rank: column.rank });
  }));
  const all = [...byRank.values()].sort((a, b) => a.rank - b.rank);
  const hidden = Math.max(0, all.length - MAX_COLUMNS);
  const visible = all.slice(hidden);

  return (
    <div className="spw-mx-wrap">
      <table className="spw-mx-table">
        <caption>Matriz de revisões SIGEM × ProjectWise</caption>
        <thead>
          <tr>
            <th rowSpan={2}>Documento</th>
            <th rowSpan={2}>Classe</th>
            <th rowSpan={2}>Sistema</th>
            <th colSpan={visible.length || 1} className="spw-mx-group">
              Revisões{hidden ? " (mais recentes · " + hidden + " anterior" + (hidden > 1 ? "es" : "") + " oculta" + (hidden > 1 ? "s" : "") + ")" : ""}
            </th>
            <th rowSpan={2}>Situação</th>
          </tr>
          <tr>
            {visible.map((column) => <th key={column.label} className="spw-mx-rev">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrices.map(({ row, data }) => {
            const find = (label: string) => data.columns.find((column) => column.revision.toUpperCase() === label.toUpperCase());
            return [
              <tr key={row.key + "-s"} className={"spw-mx-row" + (data.hasSkipped ? " has-skipped" : "")}>
                <td rowSpan={2} className="spw-mx-doc" title={row.document}><strong>{row.document}</strong></td>
                <td rowSpan={2}><DocumentClassBadge className="spw-rev-class" value={row.documentClass} /></td>
                <th scope="row" className="spw-mx-system">SIGEM</th>
                {visible.map((column) => {
                  const found = find(column.label);
                  return <td key={column.label}><Chip cell={found ? found.sigem : null} skipped={Boolean(found && found.sigemSkipped)} system="SIGEM" /></td>;
                })}
                <td rowSpan={2}>
                  <span className={"spw-rev-situation " + situationClass(row.situation)}>{situationLabel(row.situation)}</span>
                  {data.hasSkipped ? (
                    <small className="spw-mx-skip-note">
                      Revisão pulada em{data.skipped.sigem.length ? " SIGEM (" + data.skipped.sigem.join(", ") + ")" : ""}{data.skipped.sigem.length && data.skipped.pw.length ? " e" : ""}{data.skipped.pw.length ? " PW (" + data.skipped.pw.join(", ") + ")" : ""}
                    </small>
                  ) : null}
                </td>
              </tr>,
              <tr key={row.key + "-p"} className={"spw-mx-row spw-mx-row-pw" + (data.hasSkipped ? " has-skipped" : "")}>
                <th scope="row" className="spw-mx-system">PW</th>
                {visible.map((column) => {
                  const found = find(column.label);
                  return <td key={column.label}><Chip cell={found ? found.pw : null} skipped={Boolean(found && found.pwSkipped)} system="PW" /></td>;
                })}
              </tr>,
            ];
          })}
        </tbody>
      </table>
      <ul className="spw-mx-legend" aria-label="Legenda das cores">
        {(["done", "progress", "bad", "planned", "registered"] as RevisionTone[]).map((tone) => (
          <li key={tone}><i className={"spw-mx-chip tone-" + tone} aria-hidden="true"></i>{TONE_LABEL[tone]}</li>
        ))}
        <li><i className="spw-mx-chip is-skipped" aria-hidden="true"></i>Revisão pulada neste sistema</li>
        <li><i className="spw-mx-chip is-empty" aria-hidden="true"></i>Sem registro</li>
      </ul>
    </div>
  );
}
