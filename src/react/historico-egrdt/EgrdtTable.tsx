import { Fragment, useMemo, useState } from "react";
import { historicoEgrdtAdapter as Adapter, DELIVERY_STAGE_LABELS, type DeliveryStage } from "./services/historicoEgrdtAdapter";
import type { EgrdtHistoryRecord } from "./types/domain";

const nf = (value: number) => Number(value || 0).toLocaleString("pt-BR");

type StageFilter = "all" | "not-notified" | "unconfirmed";

/** Três etapas: gerada → avisada no Teams → postagem confirmada. A cor nunca é o único sinal: sempre há texto. */
function Progress({ stage }: { stage: DeliveryStage }) {
  const tone = stage === 3 ? "done" : stage === 2 ? "partial" : stage === 1 ? "wait" : "idle";
  const labels = ["Gerada", stage >= 1 ? "avisada no Teams" : "ainda não avisada no Teams", stage === 3 ? "postagem confirmada" : stage === 2 ? "postagem parcialmente confirmada" : "postagem sem confirmação"];
  return (
    <span className="egrdt-progress" data-tone={tone}>
      <svg viewBox="0 0 78 16" width="78" height="16" role="img" aria-label={labels.join("; ")} fill="none">
        <path d="M8 8h31" className={stage >= 1 ? "on" : "off"} />
        <path d="M39 8h31" className={stage >= 2 ? "on" : "off"} />
        <circle cx="8" cy="8" r="6" className="node on" />
        <circle cx="39" cy="8" r={stage >= 1 ? 6 : 5} className={"node " + (stage >= 1 ? "on" : "off")} />
        <circle cx="70" cy="8" r={stage >= 2 ? 6 : 5} className={"node " + (stage === 3 ? "on" : stage === 2 ? "partial" : "off")} />
        {stage === 3 ? <path d="M66.5 8.2l2.4 2.4 4.2-4.6" className="check" /> : null}
      </svg>
      <span>{DELIVERY_STAGE_LABELS[stage]}</span>
    </span>
  );
}

export function EgrdtTable({
  records,
  visibleLimit,
  onShowMore,
  pageSize,
  onOpenDetail,
}: {
  records: EgrdtHistoryRecord[];
  visibleLimit: number;
  onShowMore(): void;
  pageSize: number;
  onOpenDetail(id: string): void;
}) {
  const [filter, setFilter] = useState<StageFilter>("all");
  const [openId, setOpenId] = useState("");
  const staged = useMemo(() => records.map((record) => ({ record, stage: Adapter.deliveryStage(record) })), [records]);
  const notNotified = staged.filter((row) => row.stage === 0).length;
  const unconfirmed = staged.filter((row) => row.stage <= 1).length;
  const documents = records.reduce((total, record) => total + (record.documentCount || 0), 0);
  const rows = staged.filter((row) => filter === "all" || (filter === "not-notified" ? row.stage === 0 : row.stage <= 1));
  const shown = rows.slice(0, visibleLimit);

  const tile = (key: StageFilter, label: string, value: number, unit: string, hint: string) => (
    <button type="button" className="egrdt-tile" aria-pressed={filter === key} data-egrdt-tile={key}
      onClick={() => setFilter(filter === key && key !== "all" ? "all" : key)}>
      <span>{label}</span>
      <strong>{nf(value)} <small>{unit}</small></strong>
      <em>{filter === key && key !== "all" ? "Filtro ligado · clique para limpar" : hint}</em>
    </button>
  );

  return (
    <section className="egrdt-table-view" id="history-egrdt-table" aria-label="Tabela por eGRDT">
      <div className="egrdt-tiles">
        {tile("all", "eGRDTs no recorte", records.length, "emissões", "Mostrar todas")}
        <div className="egrdt-tile egrdt-tile-static"><span>Documentos emitidos</span><strong>{nf(documents)} <small>documentos</small></strong><em>Soma das eGRDTs do recorte</em></div>
        {tile("not-notified", "Ainda não avisadas no Teams", notNotified, "eGRDTs", "Clique para filtrar")}
        {tile("unconfirmed", "Sem confirmação de postagem", unconfirmed, "eGRDTs", "Clique para filtrar")}
      </div>
      <p className="egrdt-legend"><strong>Como ler o andamento:</strong> 1 · Gerada &nbsp; 2 · Avisada no Teams &nbsp; 3 · Postagem confirmada (total ou parcial)</p>
      <div className="egrdt-table-scroll" role="region" tabIndex={0} aria-label="eGRDTs; role horizontalmente para ver todas as colunas">
        <table className="egrdt-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Abrir</span></th>
              <th scope="col">eGRDT</th><th scope="col">Saída</th><th scope="col">Documentos</th><th scope="col">Arquivos</th>
              <th scope="col">Alocação</th><th scope="col">Andamento</th><th scope="col">Gerado por</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ record, stage }) => {
              const open = openId === record.id;
              const creator = record.createdByName || record.createdByEmail || "—";
              const teams = Adapter.teamsPresentation(record);
              return (
                <Fragment key={record.id}>
                  <tr className={open ? "is-open" : ""} data-history-id={record.id}>
                    <td>
                      <button type="button" className="egrdt-toggle" aria-expanded={open}
                        aria-label={(open ? "Fechar documentos da " : "Abrir documentos da ") + record.egrdtNumber}
                        onClick={() => setOpenId(open ? "" : record.id)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                      </button>
                    </td>
                    <td><strong>{record.egrdtNumber}</strong><small>{Adapter.formatDate(record.generatedAt, true)}</small></td>
                    <td><span className="egrdt-tag">{record.outputType || "—"}</span></td>
                    <td className="num"><strong>{nf(record.documentCount)}</strong></td>
                    <td className="num">{nf(record.fileCount)}</td>
                    <td>{record.allocations.length ? record.allocations.join(" · ") : "Não informada"}</td>
                    <td><Progress stage={stage} /></td>
                    <td>{creator}</td>
                  </tr>
                  {open ? (
                    <tr className="egrdt-docs-row">
                      <td colSpan={8}>
                        <div className="egrdt-docs">
                          <div className="egrdt-docs-head">
                            <div><strong>Documentos da {record.egrdtNumber}</strong><small>{nf(record.documentCount)} documentos · {nf(record.fileCount)} arquivos</small></div>
                            <div className="egrdt-docs-actions">
                              <button type="button" className="primary-button compact" onClick={() => onOpenDetail(record.id)}>Abrir detalhe completo</button>
                              {teams ? <button type="button" className="secondary-button compact" disabled={teams.disabled} onClick={() => Adapter.openTeams(record)}>{teams.label}</button> : null}
                            </div>
                          </div>
                          <div className="egrdt-table-scroll" role="region" tabIndex={0} aria-label={"Documentos da " + record.egrdtNumber}>
                            <table className="egrdt-docs-table">
                              <thead><tr><th scope="col">Documento</th><th scope="col">Rev. na GRDT</th><th scope="col">Formato</th><th scope="col">Classificação</th><th scope="col">Status SIGEM</th><th scope="col">Alocação</th></tr></thead>
                              <tbody>
                                {record.files.map((file, index) => (
                                  <tr key={(file.document || "doc") + "-" + index}>
                                    <td className="code">{file.document || "—"}</td>
                                    <td><strong>{file.grdtRevision || file.revision || "—"}</strong></td>
                                    <td>{file.format || file.fileProvenance?.format || "—"}</td>
                                    <td>{file.historyClassification?.label || "—"}</td>
                                    <td>{file.sigemStatus || "—"}</td>
                                    <td>{file.allocation || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="egrdt-table-footer">
        <span>Exibindo <strong>{nf(shown.length)}</strong> de <strong>{nf(rows.length)}</strong> eGRDTs</span>
        {shown.length < rows.length ? <button type="button" className="secondary-button compact" onClick={onShowMore}>Mostrar mais {nf(Math.min(pageSize, rows.length - shown.length))}</button> : null}
      </footer>
    </section>
  );
}
