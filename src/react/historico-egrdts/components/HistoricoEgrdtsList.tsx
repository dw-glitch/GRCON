import { historicoEgrdtsAdapter as Adapter } from "../services/historicoEgrdtsAdapter";
import type { HistoryRecord, PostingIndexes } from "../types/domain";

interface Props {
  visibleRecords: HistoryRecord[];
  totalFiltered: number;
  visibleLimit: number;
  selectedId: string;
  postingIndexes: PostingIndexes;
  onSelect(id: string): void;
  onLoadMore(): void;
}

export function HistoricoEgrdtsList({
  visibleRecords,
  totalFiltered,
  visibleLimit,
  selectedId,
  postingIndexes,
  onSelect,
  onLoadMore,
}: Props) {
  const visible = Math.min(visibleLimit, totalFiltered);
  const resultText = totalFiltered > visible
    ? `${totalFiltered.toLocaleString("pt-BR")} eGRDT(s) · exibindo ${visible.toLocaleString("pt-BR")}`
    : `${totalFiltered.toLocaleString("pt-BR")} eGRDT(s)`;

  return (
    <section aria-label="eGRDTs registradas" className="history-list-card">
      <header>
        <div>
          <span>REGISTROS</span>
          <strong id="history-result-count">{resultText}</strong>
        </div>
        <small>Selecione uma eGRDT para conferir os documentos.</small>
      </header>

      <div className="history-list" id="history-list">
        {visibleRecords.map((record) => {
          const allocation = record.allocations.length
            ? record.allocations.join(" · ")
            : "Sem alocação informada";
          const creator = record.createdByName || record.createdByEmail;
          const badge = Adapter.postingBadge(record, postingIndexes);

          return (
            <button
              className={`history-record ${record.id === selectedId ? "active" : ""}`.trim()}
              data-history-id={record.id}
              key={record.id}
              type="button"
              onClick={() => onSelect(record.id)}
            >
              <div className="history-record-main">
                <strong>{record.egrdtNumber}</strong>
                <span>{Adapter.formatDate(record.generatedAt, true)} · {record.outputType}</span>
                {creator ? (
                  <span className="history-record-user" title={`Gerado por ${record.createdByEmail || creator}`}>
                    {creator}
                  </span>
                ) : null}
              </div>
              <span className={`history-posting-status ${badge.tone}`}>{badge.label}</span>
              <div className="history-record-counts">
                <span>{record.documentCount} documento(s)</span>
                <span>{record.fileCount} arquivo(s)</span>
              </div>
              <small title={allocation}>{allocation}</small>
            </button>
          );
        })}

        {visibleRecords.length < totalFiltered ? (
          <button
            className="secondary-button compact history-load-more"
            data-history-load-more
            type="button"
            onClick={onLoadMore}
          >
            Mostrar mais {Math.min(Adapter.LIST_PAGE_SIZE, totalFiltered - visibleRecords.length).toLocaleString("pt-BR")} eGRDT(s)
          </button>
        ) : null}
      </div>

      <div className="history-empty" hidden={totalFiltered > 0} id="history-empty">
        <strong>Nenhuma eGRDT localizada</strong>
        <span>Gere uma eGRDT ou ajuste os filtros.</span>
      </div>
    </section>
  );
}
