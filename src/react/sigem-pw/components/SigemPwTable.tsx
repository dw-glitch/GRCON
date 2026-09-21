import type { SigemPwRow } from "../types/domain";

function situationClass(row: SigemPwRow): string {
  if (row.situationKey === "bothEmitted") return "ok";
  if (row.situationKey === "bothNotEmitted" || row.situationKey === "pwOnlyNotEmitted") return "warn";
  return "danger";
}

export function SigemPwTable({ rows, caption }: { rows: SigemPwRow[]; caption: string }) {
  return (
    <div className="spw-table-wrap" id="spw-table">
      {rows.length ? (
        <table>
          <caption>{caption}</caption>
          <thead><tr><th>Classe</th><th>Documento</th><th>Revisão</th><th>Status SIGEM</th><th>Status PW</th><th>Emissão PW</th><th>Situação</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.key}>
              <td><span className="spw-pill">{row.documentClass}</span></td>
              <td className="spw-code">{row.document}</td>
              <td>{row.revision}</td>
              <td>{row.sigemStatus || "—"}</td>
              <td>{row.pwStatus || "—"}</td>
              <td>{row.pwEmission}</td>
              <td><span className={`spw-situation ${situationClass(row)}`}>{row.situation}</span></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="spw-empty"><div><strong>Nenhum registro encontrado</strong><span>Ajuste a lista ou os filtros.</span></div></div>}
    </div>
  );
}
