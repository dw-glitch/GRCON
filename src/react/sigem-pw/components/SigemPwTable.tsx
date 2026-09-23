import type { SigemPwRow } from "../types/domain";

function situationClass(row: SigemPwRow): string {
  if (row.situationKey === "bothEmitted") return "ok";
  if (row.situationKey === "bothNotEmitted" || row.situationKey === "pwOnlyNotEmitted") return "warn";
  return "danger";
}

function valueOrDash(value: string): string {
  return value || "—";
}

export function SigemPwTable({ rows, caption }: { rows: SigemPwRow[]; caption: string }) {
  return (
    <div className="spw-table-wrap" id="spw-table" tabIndex={0} aria-label={`Tabela: ${caption}`}>
      {rows.length ? (
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Classe</th>
              <th>Documento</th>
              <th>Revisão</th>
              <th>Status SIGEM</th>
              <th>Status PW</th>
              <th>Emissão PW</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td><span className="spw-pill">{row.documentClass}</span></td>
                <td className="spw-code">{row.document}</td>
                <td><span className="spw-revision">{row.revision}</span></td>
                <td><span className="spw-status">{valueOrDash(row.sigemStatus)}</span></td>
                <td><span className="spw-status">{valueOrDash(row.pwStatus)}</span></td>
                <td><span className="spw-status spw-emission">{row.pwEmission}</span></td>
                <td><span className={`spw-situation ${situationClass(row)}`}>{row.situation}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="spw-empty">
          <div>
            <strong>Nenhum registro encontrado</strong>
            <span>Ajuste a situação, a busca ou o filtro de classe.</span>
          </div>
        </div>
      )}
    </div>
  );
}
