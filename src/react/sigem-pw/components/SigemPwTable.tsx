import type { SigemPwRow } from "../types/domain";
import { DocumentClassBadge } from "../../core/ui/DocumentClassBadge";

function situationClass(row: SigemPwRow): string {
  if (row.situationKey === "cvNotApplicable") return "";
  if (row.situationKey === "bothEmitted") return "ok";
  if (row.situationKey === "bothOtherRevision" || row.situationKey === "pwDuplicates" || row.situationKey === "bothNotEmitted" || row.situationKey === "pwOnlyNotEmitted") return "warn";
  return "danger";
}

function valueOrDash(value: string): string {
  return value || "—";
}

export function SigemPwTable({ rows, caption, duplicates = false }: { rows: SigemPwRow[]; caption: string; duplicates?: boolean }) {
  return (
    <div className="ui-v3-table-shell">
    <div className="spw-table-wrap" id="spw-table" tabIndex={0} aria-label={`Tabela: ${caption}`}>
      {rows.length ? (
        <table className={duplicates ? "spw-duplicates-table" : "spw-comparison-table"}>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Classe</th>
              <th>Documento</th>
              <th>Revisão</th>
              <th>Empresa PW (C)</th>
              {duplicates ? <><th>Qtd.</th><th>Linha PW</th><th>Arquivo PW</th><th>Status PW</th><th>Última emissão</th></> : <><th>Status SIGEM</th><th>Data SIGEM</th><th>Existe no PW</th><th>Status PW</th><th>Emissão PW</th><th>Situação</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td title={row.documentClass === "CV" ? "CV — Currículo" : row.documentClass}><DocumentClassBadge className="spw-pill" value={row.documentClass === "Não classificado" ? "Outro" : row.documentClass} /></td>
                <td className="spw-code">{row.document}</td>
                <td><span className="spw-revision" title={row.pwRevisionEvidence === "Não informada no PW" ? "Cadastro confirmado no PW pelo código; revisão não informada na consulta." : undefined}>{row.revision}</span>{!duplicates && row.inPw && row.pwRevision !== row.revision ? <small className="spw-pw-revision-note">PW: {row.pwRevision || "não informada"}</small> : null}</td>
                <td>{row.pwCompany || "—"}</td>
                {duplicates ? <>
                  <td>{row.duplicateOccurrence}/{row.duplicateCount}</td><td>{row.pwSourceRow || "—"}</td><td>{row.pwFileName || "—"}</td>
                  <td><span className="spw-status">{valueOrDash(row.pwStatus)}</span></td><td>{row.pwLastEmission || "—"}</td>
                </> : <>
                  <td><span className="spw-status">{valueOrDash(row.sigemStatus)}</span></td>
                  <td><span className="spw-status">{valueOrDash(row.sigemDate || "")}</span></td>
                  <td><span className="spw-status spw-emission">{row.inPw ? "SIM" : "NÃO"}</span></td>
                  <td><span className="spw-status">{valueOrDash(row.pwStatus)}</span></td>
                  <td><span className="spw-status spw-emission" title={row.pwLastEmission ? `Última emissão na consulta PW: ${row.pwLastEmission}` : undefined}>{row.pwEmission}</span></td>
                  <td><span className={`spw-situation ${situationClass(row)}`}>{row.situation}</span></td>
                </>}
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
    </div>
  );
}
