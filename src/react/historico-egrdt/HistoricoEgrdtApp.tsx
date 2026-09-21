import { useEffect, useRef } from "react";
import { historicoEgrdtAdapter as Adapter } from "./services/historicoEgrdtAdapter";
import { useHistoricoEgrdt, LIST_PAGE_SIZE } from "./hooks/useHistoricoEgrdt";
import type { EgrdtHistoryRecord } from "./types/domain";

function PostingBadge({ record, cache }: { record: EgrdtHistoryRecord; cache: ReturnType<typeof Adapter.readPostingCache> }) {
  const presentation = Adapter.postingPresentation(cache, record);
  return <span className={`history-posting-status ${presentation.tone}`}>{presentation.label}</span>;
}

function Summary({ h }: { h: ReturnType<typeof useHistoricoEgrdt> }) {
  const items = [
    ["eGRDTs localizadas", h.summary.egrdts],
    ["Documentos registrados", h.summary.documents],
    ["Alocações relacionadas", h.summary.allocations],
    ["Aguardando SIGEM", h.summary.awaiting],
    ["Postadas", h.summary.posted],
    ["Pendências/Falhas", h.summary.attention],
  ] as const;
  return (
    <section aria-label="Resumo do histórico" className="history-summary" id="history-summary">
      {items.map(([label, value]) => (
        <div key={label}><span>{label}</span><strong>{value.toLocaleString("pt-BR")}</strong></div>
      ))}
    </section>
  );
}

function Toolbar({ h }: { h: ReturnType<typeof useHistoricoEgrdt> }) {
  const dateEndRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    dateEndRef.current?.setCustomValidity(
      h.periodInvalid ? "A data final deve ser igual ou posterior à data inicial." : "",
    );
  }, [h.periodInvalid]);

  return (
    <section aria-label="Filtros e relação do histórico" className="history-toolbar">
      <label className="history-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5L21 21" /></svg>
        <input
          id="history-search"
          placeholder="Buscar eGRDT, documento ou alocação"
          type="search"
          value={h.filters.query}
          onChange={(event) => h.setSearch(event.target.value)}
        />
      </label>
      <label><span>Ano</span>
        <select id="history-year" value={h.filters.year} onChange={(event) => h.setFilter("year", event.target.value)}>
          <option value="">Todos</option>
          {h.filterOptions.years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <label><span>Saída</span>
        <select id="history-type" value={h.filters.outputType} onChange={(event) => h.setFilter("outputType", event.target.value)}>
          <option value="">Todas</option>
          {h.filterOptions.outputTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <label><span>Postagem</span>
        <select id="history-posting-status" value={h.filters.postingStatus} onChange={(event) => h.setFilter("postingStatus", event.target.value)}>
          <option value="">Todas</option>
          <option value="AGUARDANDO">Aguardando preparação</option>
          <option value="GERADO">Gerado</option>
          <option value="VALIDADO">Pacote conferido</option>
          <option value="PRONTO">Pronto para SIGEM</option>
          <option value="POSTADO">Postado</option>
          <option value="PENDENCIA">Com pendência</option>
          <option value="FALHA">Falha</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
      </label>
      <label><span>Ordem</span>
        <select id="history-sort" value={h.filters.sort} onChange={(event) => h.setFilter("sort", event.target.value as typeof h.filters.sort)}>
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigas</option>
          <option value="number-desc">Maior número</option>
          <option value="number-asc">Menor número</option>
        </select>
      </label>
      <div aria-label="Período da relação" className="history-period-controls" role="group">
        <label><span>Data inicial</span>
          <input id="history-date-start" type="date" value={h.filters.startDate} onChange={(event) => h.setFilter("startDate", event.target.value)} />
        </label>
        <label><span>Data final</span>
          <input ref={dateEndRef} id="history-date-end" type="date" value={h.filters.endDate} onChange={(event) => h.setFilter("endDate", event.target.value)} />
        </label>
        <label><span>Tipo de documento</span>
          <select id="history-period-document-type" value={h.filters.documentFamily} onChange={(event) => h.setFilter("documentFamily", event.target.value)}>
            <option value="">Todos</option>
            <option value="N-1710">N-1710</option>
            <option value="ET">ET</option>
            <option value="CV">CV</option>
          </select>
        </label>
        <div className="history-period-action">
          <span id="history-period-status">{h.periodStatus}</span>
          <button
            className="primary-button"
            disabled={h.exporting || !h.filtered.length || h.periodInvalid || !window.GrconHistoryReport}
            id="history-export-period"
            type="button"
            onClick={() => { void h.exportPeriodReport(); }}
          >
            {h.exporting ? "Gerando relação…" : "Baixar relação do período"}
          </button>
        </div>
      </div>
    </section>
  );
}

function RecordList({ h }: { h: ReturnType<typeof useHistoricoEgrdt> }) {
  const visible = Math.min(h.visibleLimit, h.filtered.length);
  const resultText = h.filtered.length > visible
    ? `${h.filtered.length.toLocaleString("pt-BR")} eGRDT(s) · exibindo ${visible.toLocaleString("pt-BR")}`
    : `${h.filtered.length.toLocaleString("pt-BR")} eGRDT(s)`;

  return (
    <section aria-label="eGRDTs registradas" className="history-list-card">
      <header>
        <div><span>REGISTROS</span><strong id="history-result-count">{resultText}</strong></div>
        <small>Selecione uma eGRDT para conferir os documentos.</small>
      </header>
      <div className="history-list" id="history-list">
        {h.visibleRecords.map((record) => {
          const allocation = record.allocations.length ? record.allocations.join(" · ") : "Sem alocação informada";
          const creator = record.createdByName || record.createdByEmail;
          return (
            <button
              className={`history-record ${record.id === h.selectedId ? "active" : ""}`}
              data-history-id={record.id}
              key={record.id}
              type="button"
              onClick={() => h.select(record.id)}
            >
              <div className="history-record-main">
                <strong>{record.egrdtNumber}</strong>
                <span>{Adapter.formatDate(record.generatedAt, true)} · {record.outputType}</span>
                {creator ? <span className="history-record-user" title={`Gerado por ${record.createdByEmail || creator}`}>{creator}</span> : null}
              </div>
              <PostingBadge record={record} cache={h.postingCache} />
              <div className="history-record-counts"><span>{record.documentCount} documento(s)</span><span>{record.fileCount} arquivo(s)</span></div>
              <small title={allocation}>{allocation}</small>
            </button>
          );
        })}
        {h.visibleRecords.length < h.filtered.length ? (
          <button className="secondary-button compact history-load-more" data-history-load-more type="button" onClick={h.showMore}>
            Mostrar mais {Math.min(LIST_PAGE_SIZE, h.filtered.length - h.visibleRecords.length).toLocaleString("pt-BR")} eGRDT(s)
          </button>
        ) : null}
      </div>
      <div className="history-empty" hidden={h.filtered.length > 0} id="history-empty">
        <strong>Nenhuma eGRDT localizada</strong><span>Gere uma eGRDT ou ajuste os filtros.</span>
      </div>
    </section>
  );
}

function Workflow({ h, record }: { h: ReturnType<typeof useHistoricoEgrdt>; record: EgrdtHistoryRecord }) {
  const steps = Adapter.workflow(h.postingCache, record);
  return (
    <nav className="posting-flow" aria-label="Fluxo da eGRDT até o SIGEM">
      {steps.map((step, index) => (
        <div
          className={`posting-flow-step ${step.complete ? "complete" : ""} ${step.current ? "current" : ""}`}
          data-step={index + 1}
          key={step.key || `${step.label}-${index}`}
        >
          <strong>{step.label}</strong>
        </div>
      ))}
    </nav>
  );
}

function Detail({ h }: { h: ReturnType<typeof useHistoricoEgrdt> }) {
  const record = h.selectedRecord;
  if (!record) {
    return (
      <section aria-live="polite" className="history-detail" id="history-detail">
        <div className="history-detail-empty"><strong>Selecione uma eGRDT</strong><span>Os documentos, a LD e as alocações aparecerão aqui.</span></div>
      </section>
    );
  }

  const creator = record.createdByName || record.createdByEmail;
  const previousNumbers = record.numberHistory || [];
  const teamsHtml = Adapter.teamsButtonHtml(record);

  return (
    <section aria-live="polite" className="history-detail" id="history-detail">
      <header>
        <div className="history-detail-title">
          <span>eGRDT REGISTRADA</span>
          <h3>{record.egrdtNumber}</h3>
          <p>{Adapter.formatDate(record.generatedAt, true)} · {record.outputType}</p>
          {creator ? <p className="history-record-user">Gerado por {creator}</p> : null}
          <PostingBadge record={record} cache={h.postingCache} />
        </div>
        <div className="history-detail-actions">
          <button className="primary-button compact" data-history-action="prepare-sigem" type="button" onClick={() => { void h.prepareForSigem(); }}>Preparar no SIGEM</button>
          {teamsHtml ? (
            <span
              className="egrdt-teams-history-action"
              onClick={(event) => {
                if ((event.target as Element).closest("[data-egrdt-teams-record-id]")) h.openTeams();
              }}
              dangerouslySetInnerHTML={{ __html: teamsHtml }}
            />
          ) : null}
          <button className="secondary-button compact" data-history-action="email-reply" title="Montar a resposta de e-mail com os documentos desta eGRDT" type="button" onClick={h.openEmailReply}>Resposta de e-mail</button>
          <button className="secondary-button compact" data-history-action="edit" type="button" onClick={h.startEditing}>Editar número</button>
          {h.canDeleteHistory ? (
            <button className="history-delete-button" data-history-action="delete" type="button" aria-label="Excluir esta eGRDT do histórico" title="Excluir somente esta eGRDT" onClick={() => { void h.deleteSelectedRecord(); }}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" /></svg><span>Excluir</span>
            </button>
          ) : null}
          <div className="history-detail-numbers"><span><strong>{record.documentCount}</strong> documentos</span><span><strong>{record.fileCount}</strong> arquivos</span></div>
        </div>
      </header>

      <Workflow h={h} record={record} />

      {h.editingId === record.id ? (
        <form className="history-number-editor" id="history-number-editor" onSubmit={(event) => { event.preventDefault(); h.saveEditedNumber(); }}>
          <label htmlFor="history-number-input">
            <span>Novo número sequencial</span>
            <input
              autoComplete="off"
              autoFocus
              id="history-number-input"
              inputMode="numeric"
              maxLength={4}
              value={h.editValue}
              onChange={(event) => h.changeEditValue(event.target.value)}
            />
          </label>
          <div>
            <small>{h.sharedHistory ? "Atualiza o histórico compartilhado. O arquivo já baixado não é renomeado." : "Altera somente o registro local do histórico. O arquivo já baixado não é renomeado."}</small>
            <div className="history-number-editor-actions">
              <button className="secondary-button compact" data-history-action="cancel" type="button" onClick={h.cancelEditing}>Cancelar</button>
              <button className="primary-button compact" data-history-action="save" type="submit">Salvar número</button>
            </div>
          </div>
        </form>
      ) : null}

      <dl className="history-detail-meta">
        <div><dt>LD utilizada</dt><dd>{record.ldName || "Não informada"}</dd></div>
        <div><dt>Origem dos documentos</dt><dd>{record.sourceName || "Pasta documental"}</dd></div>
        <div><dt>Alocação</dt><dd>{record.allocations.length ? record.allocations.map((value) => <span key={value}>{value}</span>) : "Não informada na LD"}</dd></div>
        {previousNumbers.length ? <div><dt>Números anteriores</dt><dd>{previousNumbers.map((value) => <span key={value}>{value}</span>)}</dd></div> : null}
      </dl>

      <p className="history-table-note">Conferência e Status SIGEM atual usam a Consulta Geral importada. Situação na geração, alocação e prazo da LD são registros da época da emissão. As revisões registradas como postadas vêm do controle interno do GRCON.</p>
      <div className="history-detail-table" tabIndex={0} role="region" aria-label="Documentos da eGRDT; role horizontalmente para ver todas as colunas">
        <table>
          <thead><tr>
            <th data-history-column="document">Documento</th>
            <th data-history-column="original">Arquivo original</th>
            <th data-history-column="sent">Arquivo enviado</th>
            <th>Revisão gerada na GRDT</th>
            <th>Revisão desta GRDT postada</th>
            <th>Outra revisão postada</th>
            <th title="Situação registrada na triagem na época da emissão; pode incluir pendências de alocação">Situação na geração</th>
            <th>Alocação</th>
            <th>Versão da LD enviada</th>
            <th data-history-column="sheet">Aba LD</th>
          </tr></thead>
          <tbody>
            {record.files.map((file, index) => {
              const relation = Adapter.revisionRelation(record, file, h.postingCache.records);
              return (
                <tr key={`${file.document || "doc"}-${file.finalName || index}-${index}`}>
                  <td>{file.document || "—"}</td>
                  <td>{file.originalName || "—"}</td>
                  <td>{file.finalName || "—"}</td>
                  <td><strong>{relation.generated}</strong>{file.revisionManual ? <span className="history-revision-manual" title={`Alterada manualmente na triagem · sugestão do sistema na época: ${file.revisionSuggested || "—"}`}> Alterada manualmente</span> : null}</td>
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
    </section>
  );
}

export function HistoricoEgrdtApp() {
  const h = useHistoricoEgrdt();

  return (
    <>
      <header className="history-heading">
        <div>
          <span>HISTÓRICO LOCAL</span>
          <h2 id="history-title">eGRDTs geradas pelo GRCON</h2>
          <p>Consulte documentos, confira alocações e corrija o número registrado quando necessário.</p>
        </div>
        <button className="secondary-button history-clear-button" id="history-clear" type="button" onClick={() => { void h.clearHistory(); }}>Limpar histórico</button>
      </header>

      <Toolbar h={h} />
      <Summary h={h} />

      <div className="history-workspace">
        <RecordList h={h} />
        <Detail h={h} />
      </div>
    </>
  );
}
