import { historicoEgrdtsAdapter as Adapter } from "../services/historicoEgrdtsAdapter";
import type { HistoryRecord, PostingIndexes, PostingRecord, UpdateNumberResult } from "../types/domain";
import { HistoricoEgrdtDocuments } from "./HistoricoEgrdtDocuments";
import { HistoricoEgrdtNumberEditor } from "./HistoricoEgrdtNumberEditor";

interface Props {
  record: HistoryRecord | null;
  postings: PostingRecord[];
  postingIndexes: PostingIndexes;
  editing: boolean;
  canDelete: boolean;
  numberEditScope: string;
  onPrepareSigem(): void;
  onTeams(): void;
  onEmailReply(): void;
  onBeginEdit(): void;
  onCancelEdit(): void;
  onSaveNumber(value: string): UpdateNumberResult;
  onDelete(): void;
}

export function HistoricoEgrdtDetail({
  record,
  postings,
  postingIndexes,
  editing,
  canDelete,
  numberEditScope,
  onPrepareSigem,
  onTeams,
  onEmailReply,
  onBeginEdit,
  onCancelEdit,
  onSaveNumber,
  onDelete,
}: Props) {
  if (!record) {
    return (
      <div className="history-detail-empty">
        <strong>Selecione uma eGRDT</strong>
        <span>Os documentos, a LD e as alocações aparecerão aqui.</span>
      </div>
    );
  }

  const creator = record.createdByName || record.createdByEmail;
  const badge = Adapter.postingBadge(record, postingIndexes);
  const teams = Adapter.teamsState(record);
  const workflow = Adapter.postingWorkflow(record, postings, postingIndexes);

  return (
    <>
      <header>
        <div className="history-detail-title">
          <span>eGRDT REGISTRADA</span>
          <h3>{record.egrdtNumber}</h3>
          <p>{Adapter.formatDate(record.generatedAt, true)} · {record.outputType}</p>
          {creator ? <p className="history-record-user">Gerado por {creator}</p> : null}
          <span className={`history-posting-status ${badge.tone}`}>{badge.label}</span>
        </div>

        <div className="history-detail-actions">
          <button
            className="primary-button compact"
            data-history-action="prepare-sigem"
            type="button"
            onClick={onPrepareSigem}
          >
            Preparar no SIGEM
          </button>

          <span className="egrdt-teams-history-action">
            <button
              className="secondary-button compact egrdt-teams-notify-button"
              data-egrdt-teams-record-id={record.id || record.clientRecordId}
              type="button"
              onClick={onTeams}
            >
              {teams.buttonLabel}
            </button>
            {teams.label ? (
              <small className={`egrdt-teams-status ${teams.sent ? "is-sent" : ""}`.trim()}>
                {teams.label}
              </small>
            ) : null}
          </span>

          <button
            className="secondary-button compact"
            data-history-action="email-reply"
            title="Montar a resposta de e-mail com os documentos desta eGRDT"
            type="button"
            onClick={onEmailReply}
          >
            Resposta de e-mail
          </button>

          <button
            className="secondary-button compact"
            data-history-action="edit"
            type="button"
            onClick={onBeginEdit}
          >
            Editar número
          </button>

          {canDelete ? (
            <button
              className="history-delete-button"
              data-history-action="delete"
              type="button"
              aria-label="Excluir esta eGRDT do histórico"
              title="Excluir somente esta eGRDT"
              onClick={onDelete}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
              </svg>
              <span>Excluir</span>
            </button>
          ) : null}

          <div className="history-detail-numbers">
            <span><strong>{record.documentCount}</strong> documentos</span>
            <span><strong>{record.fileCount}</strong> arquivos</span>
          </div>
        </div>
      </header>

      <nav className="posting-flow" aria-label="Fluxo da eGRDT até o SIGEM">
        {workflow.map((step, index) => (
          <div
            className={`posting-flow-step ${step.complete ? "complete" : ""} ${step.current ? "current" : ""}`.trim()}
            data-step={index + 1}
            key={step.key || `${step.label}-${index}`}
          >
            <strong>{step.label}</strong>
          </div>
        ))}
      </nav>

      {editing ? (
        <HistoricoEgrdtNumberEditor
          record={record}
          scope={numberEditScope}
          onCancel={onCancelEdit}
          onSave={onSaveNumber}
        />
      ) : null}

      <dl className="history-detail-meta">
        <div><dt>LD utilizada</dt><dd>{record.ldName || "Não informada"}</dd></div>
        <div><dt>Origem dos documentos</dt><dd>{record.sourceName || "Pasta documental"}</dd></div>
        <div>
          <dt>Alocação</dt>
          <dd>
            {record.allocations.length
              ? record.allocations.map((value) => <span key={value}>{value}</span>)
              : "Não informada na LD"}
          </dd>
        </div>
        {record.numberHistory?.length ? (
          <div>
            <dt>Números anteriores</dt>
            <dd>{record.numberHistory.map((value) => <span key={value}>{value}</span>)}</dd>
          </div>
        ) : null}
      </dl>

      <HistoricoEgrdtDocuments record={record} postings={postings} />
    </>
  );
}
