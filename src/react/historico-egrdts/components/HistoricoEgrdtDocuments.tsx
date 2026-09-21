import { historicoEgrdtsAdapter as Adapter } from "../services/historicoEgrdtsAdapter";
import type { HistoryRecord, PostingRecord } from "../types/domain";

export function HistoricoEgrdtDocuments({
  record,
  postings,
}: {
  record: HistoryRecord;
  postings: PostingRecord[];
}) {
  return (
    <>
      <p className="history-table-note">
        Conferência e Status SIGEM atual usam a Consulta Geral importada. Situação na geração,
        alocação e prazo da LD são registros da época da emissão. As revisões registradas como
        postadas vêm do controle interno do GRCON.
      </p>
      <div
        className="history-detail-table"
        tabIndex={0}
        role="region"
        aria-label="Documentos da eGRDT; role horizontalmente para ver todas as colunas"
      >
        <table>
          <thead>
            <tr>
              <th data-history-column="document">Documento</th>
              <th data-history-column="original">Arquivo original</th>
              <th data-history-column="sent">Arquivo enviado</th>
              <th>Revisão gerada na GRDT</th>
              <th>Revisão desta GRDT postada</th>
              <th>Outra revisão postada</th>
              <th title="Situação registrada na triagem na época da emissão; pode incluir pendências de alocação">
                Situação na geração
              </th>
              <th>Alocação</th>
              <th>Versão da LD enviada</th>
              <th data-history-column="sheet">Aba LD</th>
            </tr>
          </thead>
          <tbody>
            {record.files.map((file, index) => {
              const relation = Adapter.revisionRelation(record, file, postings);
              return (
                <tr key={`${record.id}|${file.document || ""}|${file.finalName || ""}|${index}`}>
                  <td>{file.document || "—"}</td>
                  <td>{file.originalName || "—"}</td>
                  <td>{file.finalName || "—"}</td>
                  <td>
                    <strong>{relation.generated}</strong>
                    {file.revisionManual ? (
                      <>
                        {" "}
                        <span
                          className="history-revision-manual"
                          title={`Alterada manualmente na triagem · sugestão do sistema na época: ${file.revisionSuggested || "—"}`}
                        >
                          Alterada manualmente
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td>{relation.posted}</td>
                  <td>{relation.other}</td>
                  <td>{file.sigemStatus || "—"}</td>
                  <td>{file.allocation || "—"}</td>
                  <td>{file.ldPrazo || "Não registrado"}</td>
                  <td>{file.sheet || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
