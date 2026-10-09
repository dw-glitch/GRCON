import { useEffect, useRef } from "react";
import { UiMetaPill, UiPageHeader, UiPanel } from "../core/ui/UiPrimitives";
import { DocumentClassBadge } from "../core/ui/DocumentClassBadge";
import { historicoEgrdtAdapter as Adapter } from "./services/historicoEgrdtAdapter";
import { useHistoricoEgrdt, LIST_PAGE_SIZE } from "./hooks/useHistoricoEgrdt";
import type { EgrdtHistoryFile } from "./types/domain";

function FileProvenance({ file }: { file: EgrdtHistoryFile }) {
  const source = file.fileProvenance;
  if (!source) return <small>Origem não registrada nesta emissão</small>;
  return <details className="history-file-provenance">
    <summary>Origem: {source.source === "cofre" ? "Cofre" : "pasta local"}</summary>
    <p>Arquivo utilizado: {source.fileName}</p>
    <p>Revisão do arquivo: {source.revision || "Não registrada"} · Formato: {source.format || "Não registrado"} · {numberBr(source.sizeBytes)} bytes</p>
    {source.source === "cofre" || source.vaultFileId || source.sha256 ? <>
      <p>ID do arquivo: {source.vaultFileId || "Não registrado"} · Sequência: {source.catalogSequence || "Não registrada"}</p>
      <p>Incluído em: {source.createdAt ? Adapter.formatDate(source.createdAt, true) : "Não registrado"}</p>
      <p>Verificado em: {source.verifiedAt ? Adapter.formatDate(source.verifiedAt, true) : "Não registrado"}</p>
      <p>Versão no Cofre: {source.fileVersion || "Não registrada"}</p>
      {source.vaultFileId ? <button type="button" className="text-button" onClick={() => window.GrconDocumentMaster?.openFile(source.vaultFileId!)}>Recuperar arquivo utilizado</button> : null}
      <p>SHA-256: <code style={{ overflowWrap: "anywhere" }}>{source.sha256 || "Não registrado"}</code></p>
    </> : <p>Modificado em: {source.lastModified ? Adapter.formatDate(new Date(source.lastModified), true) : "Não registrado"}</p>}
  </details>;
}


const SORT_LABELS: Record<string, string> = {
  recent: "Mais recentes",
  oldest: "Mais antigas",
  "number-desc": "Maior número",
  "number-asc": "Menor número",
};

function numberBr(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR");
}

function countLabel(value: number, singular: string, plural: string): string {
  return `${numberBr(value)} ${value === 1 ? singular : plural}`;
}

function Summary({ h }: { h: ReturnType<typeof useHistoricoEgrdt> }) {
  const entries = [
    { label: "eGRDTs", value: h.summary.egrdts, hint: "No recorte atual" },
    { label: "Documentos", value: h.summary.documents, hint: "Registrados no recorte" },
    { label: "Alocações", value: h.summary.allocations, hint: "Relacionadas no recorte" },
  ];
  return (
    <section aria-label="Resumo do histórico" className="history-summary history-phase-b-summary" id="history-summary">
      {entries.map((entry) => (
        <div className="history-kpi neutral" key={entry.label}>
          <span>{entry.label}</span>
          <strong>{numberBr(entry.value)}</strong>
          <small>{entry.hint}</small>
        </div>
      ))}
    </section>
  );
}

function activeFilters(h: ReturnType<typeof useHistoricoEgrdt>) {
  const items: Array<{ key: string; label: string; clear: () => void }> = [];
  if (h.filters.query.trim()) {
    items.push({ key: "query", label: "Busca: " + h.filters.query.trim(), clear: () => h.setSearch("") });
  }
  if (h.filters.year) {
    items.push({ key: "year", label: "Ano: " + h.filters.year, clear: () => h.setFilter("year", "") });
  }
  if (h.filters.outputType) {
    items.push({ key: "outputType", label: "Saída: " + h.filters.outputType, clear: () => h.setFilter("outputType", "") });
  }
  if (h.filters.sort !== "recent") {
    items.push({ key: "sort", label: "Ordem: " + SORT_LABELS[h.filters.sort], clear: () => h.setFilter("sort", "recent") });
  }
  if (h.filters.startDate || h.filters.endDate) {
    items.push({
      key: "period",
      label: "Período: " + (h.filters.startDate || "…") + " → " + (h.filters.endDate || "…"),
      clear: () => {
        h.setFilter("startDate", "");
        h.setFilter("endDate", "");
      },
    });
  }
  if (h.filters.documentFamily) {
    items.push({
      key: "documentFamily",
      label: "Tipo: " + h.filters.documentFamily,
      clear: () => h.setFilter("documentFamily", ""),
    });
  }
  for (const key of ["teamsConfirmation", "teamsResponsible", "teamsDate"] as const) {
    if (h.filters[key]) items.push({key,label:"Teams: " + h.filters[key],clear:()=>h.setFilter(key, "")});
  }
  return items;
}

function Toolbar({ h }: { h: ReturnType<typeof useHistoricoEgrdt> }) {
  const dateEndRef = useRef<HTMLInputElement>(null);
  const active = activeFilters(h);
  useEffect(() => {
    dateEndRef.current?.setCustomValidity(
      h.periodInvalid ? "A data final deve ser igual ou posterior à data inicial." : "",
    );
  }, [h.periodInvalid]);

  return (
    <UiPanel className="history-filter-panel" labelledBy="history-filter-panel-title">
      <div className="history-filter-heading">
        <div>
          <span>BUSCA E FILTROS</span>
          <h3 id="history-filter-panel-title">Localize a emissão que precisa conferir</h3>
          <p>Busca, situação e ordenação refinam a lista sem alterar os dados registrados.</p>
        </div>
      </div>

      <section aria-label="Busca e filtros principais" className="history-toolbar history-main-filters">
        <label className="history-search">
          <span>Buscar no histórico</span>
          <span className="history-search-control">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5L21 21" /></svg>
            <input
              autoComplete="off"
              id="history-search"
              placeholder="Buscar eGRDT, documento ou alocação"
              type="search"
              value={h.filters.query}
              onChange={(event) => h.setSearch(event.target.value)}
            />
          </span>
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
        <label><span>Ordem</span>
          <select id="history-sort" value={h.filters.sort} onChange={(event) => h.setFilter("sort", event.target.value as typeof h.filters.sort)}>
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
            <option value="number-desc">Maior número</option>
            <option value="number-asc">Menor número</option>
          </select>
        </label>
      </section>

      <details>
        <summary>Filtrar confirmações do Teams</summary>
        <div className="history-toolbar">
          <label><span>Confirmação de postagem</span><select id="history-teams-confirmation" value={h.filters.teamsConfirmation || ""} onChange={e=>h.setFilter("teamsConfirmation",e.target.value)}><option value="">Todas</option><option value="total">Total</option><option value="partial">Parcial</option><option value="unconfirmed">Enviada ao fluxo sem confirmação</option><option value="untracked">Sem registro de envio</option></select></label>
          <label><span>Confirmado por</span><input id="history-teams-responsible" value={h.filters.teamsResponsible || ""} onChange={e=>h.setFilter("teamsResponsible",e.target.value)} /></label>
          <label><span>Data da confirmação</span><input id="history-teams-date" type="date" value={h.filters.teamsDate || ""} onChange={e=>h.setFilter("teamsDate",e.target.value)} /></label>
        </div>
      </details>
      <div className="history-filter-divider" />

      <section aria-labelledby="history-period-title" className="history-period-block">
        <div className="history-period-heading">
          <div>
            <span>PERÍODO / RELATÓRIO</span>
            <strong id="history-period-title">Recorte para conferência e exportação</strong>
          </div>
          {(h.filters.startDate || h.filters.endDate) ? (
            <button
              className="text-button history-clear-period"
              id="history-clear-period"
              type="button"
              onClick={() => {
                h.setFilter("startDate", "");
                h.setFilter("endDate", "");
              }}
            >
              Limpar período
            </button>
          ) : null}
        </div>

        <div aria-label="Período da relação" className="history-period-controls" role="group">
          <label><span>Data inicial</span>
            <input id="history-date-start" type="date" value={h.filters.startDate} onChange={(event) => h.setFilter("startDate", event.target.value)} />
          </label>
          <span className="history-period-arrow" aria-hidden="true">→</span>
          <label><span>Data final</span>
            <input
              ref={dateEndRef}
              aria-invalid={h.periodInvalid || undefined}
              id="history-date-end"
              type="date"
              value={h.filters.endDate}
              onChange={(event) => h.setFilter("endDate", event.target.value)}
            />
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
            <span aria-live="polite" id="history-period-status">{h.periodStatus}</span>
            <button
              className="primary-button"
              disabled={h.exporting || !h.filtered.length || h.periodInvalid || !window.GrconHistoryReport}
              id="history-export-period"
              type="button"
              onClick={() => { void h.exportPeriodReport(); }}
            >
              {h.exporting ? "Gerando relação…" : "Baixar relação Excel"}
            </button>
            {h.canDeleteHistory && h.removedCount > 0 ? (
              <button type="button" className="secondary-button" disabled={h.exportingAudit} onClick={() => { void h.exportRemovedAudit(); }}>
                {h.exportingAudit ? "Preparando auditoria…" : `Auditoria de removidos (${h.removedCount})`}
              </button>
            ) : null}
          </div>
        </div>

        {h.periodInvalid ? (
          <p className="history-period-error" id="history-period-error" role="alert">
            A data final deve ser igual ou posterior à data inicial.
          </p>
        ) : null}
      </section>

      {active.length ? (
        <div aria-label="Filtros ativos" className="history-active-filters">
          <span>Filtros ativos</span>
          <div>
            {active.map((item) => (
              <button aria-label={"Remover filtro " + item.label} key={item.key} type="button" onClick={item.clear}>
                <span>{item.label}</span><b aria-hidden="true">×</b>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </UiPanel>
  );
}

function RecordList({ h }: { h: ReturnType<typeof useHistoricoEgrdt> }) {
  const visible = Math.min(h.visibleLimit, h.filtered.length);
  const resultText = h.filtered.length > visible
    ? countLabel(h.filtered.length, "eGRDT", "eGRDTs") + " · exibindo " + numberBr(visible)
    : countLabel(h.filtered.length, "eGRDT", "eGRDTs");

  return (
    <UiPanel className="history-list-card" labelledBy="history-list-title">
      <header className="history-list-header">
        <div>
          <span>REGISTROS</span>
          <strong id="history-list-title">Emissões localizadas</strong>
          <small id="history-result-count">{resultText}</small>
        </div>
        <p>Selecione uma eGRDT para conferir metadados e documentos.</p>
      </header>

      <div className="history-list-scroll">
        <div className="history-list" id="history-list">
          {h.visibleRecords.map((record) => {
            const allocation = record.allocations.length ? record.allocations.join(" · ") : "Sem alocação informada";
            const creator = record.createdByName || record.createdByEmail;
            return (
              <button
                aria-pressed={record.id === h.selectedId}
                className={"history-record " + (record.id === h.selectedId ? "active" : "")}
                data-history-id={record.id}
                key={record.id}
                type="button"
                onClick={() => h.select(record.id)}
              >
                <div className="history-record-top">
                  <div className="history-record-main">
                    <strong>{record.egrdtNumber}</strong>
                    <span>{Adapter.formatDate(record.generatedAt, true)} · {record.outputType}</span>
                  </div>
                </div>
                <div className="history-record-facts">
                  <span>{countLabel(record.documentCount, "documento", "documentos")}</span>
                  <span>{countLabel(record.fileCount, "arquivo", "arquivos")}</span>
                  <span title={allocation}>Alocação: <strong>{allocation}</strong></span>
                </div>
                {creator ? <small className="history-record-user" title={"Gerado por " + (record.createdByEmail || creator)}>Gerado por {creator}</small> : null}
              </button>
            );
          })}
        </div>

        <div className="history-empty" hidden={h.filtered.length > 0} id="history-empty">
          <strong>{h.records.length ? "Nenhuma eGRDT localizada" : "Histórico de eGRDTs vazio"}</strong>
          <span>{h.records.length ? "Ajuste ou remova algum filtro para ampliar o recorte." : "Gere uma eGRDT para iniciar o histórico."}</span>
        </div>
      </div>

      {h.filtered.length ? (
        <footer className="history-list-footer">
          <span>Exibindo <strong>{numberBr(visible)}</strong> de <strong>{numberBr(h.filtered.length)}</strong></span>
          {h.visibleRecords.length < h.filtered.length ? (
            <button className="secondary-button compact history-load-more" data-history-load-more type="button" onClick={h.showMore}>
              Mostrar mais {numberBr(Math.min(LIST_PAGE_SIZE, h.filtered.length - h.visibleRecords.length))}
            </button>
          ) : null}
        </footer>
      ) : null}
    </UiPanel>
  );
}

function Detail({ h }: { h: ReturnType<typeof useHistoricoEgrdt> }) {
  const record = h.selectedRecord;
  if (!record) {
    return (
      <UiPanel className="history-detail" labelledBy="history-detail-empty-title">
        <div aria-live="polite" className="history-detail-empty" id="history-detail" tabIndex={-1}>
          <span aria-hidden="true">↗</span>
          <strong id="history-detail-empty-title">Selecione uma eGRDT</strong>
          <p>Documentos, LD e alocações aparecerão aqui sem sair do histórico.</p>
        </div>
      </UiPanel>
    );
  }

  const creator = record.createdByName || record.createdByEmail;
  const previousNumbers = record.numberHistory || [];
  const teamsAction = Adapter.teamsPresentation(record);
  const attempts = window.GrconTeamsTrace?.list(record) || [];
  const sigemEvidence = window.GrconTeamsTrace?.sigemEvidence([record])[record.id];

  return (
    <UiPanel className="history-detail" labelledBy="history-detail-number">
      <div aria-live="polite" id="history-detail" tabIndex={-1}>
        <section className="history-detail-identity">
          <div className="history-detail-title">
            <span>eGRDT SELECIONADA</span>
            <h3 id="history-detail-number">{record.egrdtNumber}</h3>
            <p>{Adapter.formatDate(record.generatedAt, true)} · {record.outputType}</p>
            {creator ? <p className="history-record-user">Gerado por {creator}</p> : null}
          </div>
          <div className="history-detail-identity-meta">
            <UiMetaPill>{countLabel(record.documentCount, "documento", "documentos")}</UiMetaPill>
            <UiMetaPill>{countLabel(record.fileCount, "arquivo", "arquivos")}</UiMetaPill>
          </div>
        </section>

        <details className="history-detail-section">
          <summary>Rastreabilidade Teams · {attempts.length} tentativa(s)</summary>
          {attempts.length ? attempts.map(a => <article key={a.id}>
            <p><strong>{window.GrconTeamsTraceCore?.label(a)}</strong></p>
            <p>{a.contract_code} · Solicitado em {new Date(a.requested_at).toLocaleString("pt-BR")} · Entrega: {a.delivered_at ? new Date(a.delivered_at).toLocaleString("pt-BR") : "Não confirmada"}</p>
            {a.confirmed_at ? <p>{a.confirmed_documents?.length} de {a.documents.length} documentos declarados · {new Date(a.confirmed_at).toLocaleString("pt-BR")}</p> : null}
            {a.confirmed_at ? <p>Mensagem de confirmação no Teams: {a.notice_status === "sent" ? "Publicada" : "Pendente de confirmação do fluxo"} · Cartão: {a.card_updated_at ? "Atualizado" : "Atualização não confirmada"}</p> : null}
            <details><summary>Documentos e revisões desta tentativa</summary>{a.documents.map((file,i) => <p key={i}>{file.document} · Rev. {file.revision} · {window.GrconTeamsTraceCore?.confirmed(a,file)}</p>)}</details>
            {a.message_url ? <a href={a.message_url} target="_blank" rel="noopener noreferrer">Abrir cartão no Teams</a> : null}
          </article>) : <p>Sem registro de envio ao Teams. A ausência de registro não comprova que a eGRDT deixou de ser postada.</p>}
          {sigemEvidence ? <p><strong>{sigemEvidence}</strong></p> : null}
          <p>A confirmação do funcionário é uma declaração de execução. O registro no SIGEM continua sendo conferido na Consulta Geral.</p>
        </details>

        <section className="history-detail-section history-actions-section" aria-labelledby="history-actions-title">
          <div className="history-detail-section-heading">
            <span>AÇÕES</span>
            <strong id="history-actions-title">Próximos passos</strong>
          </div>
          <div className="history-detail-actions">
            {teamsAction ? (
              <span className="egrdt-teams-history-action">
                <button
                  className="secondary-button egrdt-teams-notify-button"
                  data-egrdt-teams-record-id={teamsAction.recordId}
                  disabled={teamsAction.disabled}
                  type="button"
                  onClick={h.openTeams}
                >
                  {teamsAction.label}
                </button>
                <small className={"egrdt-teams-status " + (teamsAction.sent ? "is-sent" : "")}>
                  {teamsAction.statusLabel}
                </small>
              </span>
            ) : null}
            <button className="secondary-button" data-history-action="email-reply" title="Montar a resposta de e-mail com os documentos desta eGRDT" type="button" onClick={h.openEmailReply}>
              Resposta de e-mail
            </button>
            <details className="history-detail-more">
              <summary>Mais ações</summary>
              <div>
                <button className="secondary-button compact" data-history-action="edit" type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); h.startEditing(); }}>Editar número</button>
                {h.canDeleteHistory ? (
                  <button className="history-delete-button" data-history-action="delete" type="button" aria-label="Excluir esta eGRDT do histórico" title="Excluir somente esta eGRDT" onClick={() => { void h.deleteSelectedRecord(); }}>
                    Excluir esta eGRDT
                  </button>
                ) : null}
              </div>
            </details>
          </div>

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
        </section>

        <section className="history-detail-section history-meta-section" aria-labelledby="history-meta-title">
          <div className="history-detail-section-heading">
            <span>METADADOS</span>
            <strong id="history-meta-title">Contexto da emissão</strong>
          </div>
          <dl className="history-detail-meta">
            <div><dt>LD utilizada</dt><dd>{record.ldName || "Não informada"}</dd></div>
            <div><dt>Origem</dt><dd>{record.sourceName || "Pasta documental"}</dd></div>
            {record.batchMode ? <div><dt>Distribuição</dt><dd>{record.batchMode === "limit-only" ? "Somente por limite" : "Separar por disciplina"}{record.batchLimit ? ` · até ${numberBr(record.batchLimit)} por eGRDT` : ""}</dd></div> : null}
            {record.reissueSources?.length ? <div><dt>eGRDT(s) de origem</dt><dd>{record.reissueSources.map((value) => <span key={value}>{value}</span>)}</dd></div> : null}
            <div><dt>Alocação</dt><dd>{record.allocations.length ? record.allocations.map((value) => <span key={value}>{value}</span>) : "Não informada na LD"}</dd></div>
            {previousNumbers.length ? <div><dt>Números anteriores</dt><dd>{previousNumbers.map((value) => <span key={value}>{value}</span>)}</dd></div> : null}
          </dl>
        </section>

        <section className="history-detail-section history-documents-section" aria-labelledby="history-documents-title">
          <div className="history-detail-section-heading">
            <span>DOCUMENTOS</span>
            <strong id="history-documents-title">Arquivos e rastreabilidade da GRDT</strong>
            <label className="history-file-filter">Situação do registro
              <select aria-label="Situação dos documentos no histórico" value={h.fileStatus} onChange={(event) => h.setFileStatus(event.target.value as "active" | "removed" | "all")}>
                <option value="active">Ativos</option><option value="removed">Removidos</option><option value="all">Todos</option>
              </select>
            </label>
          </div>
          <p className="history-table-note">
            <strong>Como ler esta tabela:</strong> Conferência e Status SIGEM atual usam a Consulta Geral importada. Situação na geração, alocação e prazo da LD são registros da época da emissão.
          </p>
          <div className="history-detail-table" tabIndex={0} role="region" aria-label="Documentos da eGRDT; role horizontalmente para ver todas as colunas">
            <table>
              <thead><tr>
                <th data-history-column="document">Documento</th>
                <th data-history-column="original">Arquivo original</th>
                <th data-history-column="sent">Arquivo enviado</th>
                <th>Revisão gerada na GRDT</th>
                <th>Propósito da GRDT</th>
                <th title="Situação registrada na triagem na época da emissão; pode incluir pendências de alocação">Situação na geração</th>
                <th>Alocação</th>
                <th>Versão da LD enviada</th>
                <th data-history-column="sheet">Aba LD</th>
                <th>Ação individual</th>
              </tr></thead>
              <tbody>
                {h.fileStatus !== "removed" && record.files.map((file, index) => {
                  const relation = Adapter.revisionRelation(record, file);
                  return (
                    <tr key={(file.document || "doc") + "-" + (file.finalName || index) + "-" + index}>
                      <td data-label="Documento"><strong>{file.document || "—"}</strong></td>
                      <td data-label="Arquivo original">{file.originalName || "—"}<FileProvenance file={file} /></td>
                      <td data-label="Arquivo enviado">{file.finalName || "—"}</td>
                      <td data-label="Revisão gerada"><span className="history-revision-badge">{relation.generated}</span>{file.historyClassification ? <details><summary>{file.historyClassification.label}</summary>{file.historyClassification.previousGrdt ? <p>Anterior: Rev. {file.historyClassification.previousRevision || "não registrada"} · {file.historyClassification.previousGrdt} · {file.historyClassification.previousGeneratedAt}</p> : null}<p>{file.historyClassification.occurrenceCount} emissão(ões) anteriores nesta revisão; {file.historyClassification.repostCount} repostagem(ns) anteriores.</p>{file.historyClassification.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</details> : null}{file.revisionManual ? <span className="history-revision-manual" title={"Alterada manualmente na triagem · sugestão do sistema na época: " + (file.revisionSuggested || "—")}>Alterada manualmente</span> : null}</td>
                      <td data-label="Propósito da GRDT">{file.purpose || "Não registrado"}</td>
                      <td data-label="Situação na geração">{file.sigemStatus || "—"}</td>
                      <td data-label="Alocação">{file.allocation || "—"}{file.sharedAllocationContext?.references.length ? <details><summary>Status na Central</summary>{file.sharedAllocationContext.references.map((item, i) => <p key={i}>{item.allocation || "Sem alocação"} · {item.allocationStatus || "Sem status"} · {item.workflow || "Sem workflow"} · linha {item.sourceRow}</p>)}<small>{file.sharedAllocationContext.centralFileName}</small></details> : null}</td>
                      <td data-label="Versão da LD enviada">{file.ldPrazo || "Não registrado"}</td>
                      <td data-label="Aba LD"><DocumentClassBadge value={file.sheet} /></td>
                      <td data-label="Ação individual">{h.canManageHistoryFile ? <button className="secondary-button compact history-file-remove" type="button" disabled={h.fileActionBusy} onClick={() => h.beginRemoval(index)} aria-label={`Remover somente o documento ${file.document || file.finalName} desta eGRDT`}>Remover do histórico</button> : <small>Somente consulta</small>}</td>
                    </tr>
                  );
                })}
                {h.fileStatus !== "active" && (record.removedFiles || []).map((entry) => (
                  <tr className="history-file-removed-row" key={"removed-" + entry.id}>
                    <td data-label="Documento"><strong>{entry.file.document || "—"}</strong><small> Removido</small></td>
                    <td data-label="Arquivo original">{entry.file.originalName || "—"}</td>
                    <td data-label="Arquivo enviado">{entry.file.finalName || "—"}</td>
                    <td data-label="Revisão gerada"><span className="history-revision-badge">{entry.file.grdtRevision || entry.file.revision || "0"}</span></td>
                    <td data-label="Propósito da GRDT">{entry.file.purpose || "Não registrado"}</td>
                    <td data-label="Situação na geração"><small>Retirado do histórico operacional</small></td>
                    <td data-label="Alocação">{entry.file.allocation || "—"}</td>
                    <td data-label="Versão da LD enviada">{entry.file.ldPrazo || "Não registrado"}</td>
                    <td data-label="Aba LD"><DocumentClassBadge value={entry.file.sheet} /></td>
                    <td data-label="Ação individual"><small>{Adapter.formatDate(entry.removedAt, true)} · {entry.reason}</small>{h.canManageHistoryFile ? <button className="secondary-button compact" type="button" disabled={h.fileActionBusy} onClick={() => { void h.restoreFile(entry.id); }}>Restaurar</button> : null}</td>
                  </tr>
                ))}
                {((h.fileStatus === "active" && !record.files.length) || (h.fileStatus === "removed" && !record.removedFiles?.length) || (h.fileStatus === "all" && !record.files.length && !record.removedFiles?.length)) ? (
                  <tr><td colSpan={10}>Nenhum documento nesta situação.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {h.pendingRemoval !== null && record.files[h.pendingRemoval] ? (
            <div className="history-file-dialog-backdrop">
              <form className="history-file-dialog" role="dialog" aria-modal="true" aria-labelledby="history-file-dialog-title" onSubmit={(event) => { event.preventDefault(); void h.submitRemoval(); }}>
                <h4 id="history-file-dialog-title">Remover somente este documento do histórico?</h4>
                <p><strong>{record.files[h.pendingRemoval].document || record.files[h.pendingRemoval].finalName}</strong> · revisão {record.files[h.pendingRemoval].grdtRevision || record.files[h.pendingRemoval].revision || "0"} · eGRDT {record.egrdtNumber}</p>
                <p>A eGRDT e os demais documentos permanecem intactos. Esta retirada não cancela o documento no SIGEM nem apaga evidências do Teams.</p>
                <label>Motivo da remoção
                  <select value={h.removalReason} required onChange={(event) => h.setRemovalReason(event.target.value)}>
                    <option value="">Selecione o motivo</option>
                    <option>Documento incluído por engano</option>
                    <option>Documento retirado da GRDT</option>
                    <option>Emissão cancelada</option>
                    <option>Documento duplicado</option>
                    <option>Correção de registro operacional</option>
                    <option>Outro motivo</option>
                  </select>
                </label>
                <label>{h.removalReason === "Outro motivo" ? "Justificativa obrigatória" : "Detalhes adicionais (opcional)"}
                  <textarea value={h.removalDetails} onChange={(event) => h.setRemovalDetails(event.target.value)} maxLength={400} rows={3} required={h.removalReason === "Outro motivo"} placeholder="Descreva o ocorrido para a auditoria" />
                </label>
                <div className="history-file-dialog-actions">
                  <button type="button" className="secondary-button" disabled={h.fileActionBusy} onClick={h.cancelRemoval}>Cancelar</button>
                  <button type="submit" className="primary-button" disabled={h.fileActionBusy || !h.removalReason || (h.removalReason === "Outro motivo" && h.removalDetails.trim().length < 3)}>{h.fileActionBusy ? "Removendo…" : "Confirmar remoção"}</button>
                </div>
              </form>
            </div>
          ) : null}
        </section>
      </div>
    </UiPanel>
  );
}

export function HistoricoEgrdtApp() {
  const h = useHistoricoEgrdt();

  if (h.loading) {
    return (
      <section className="history-initial-loading" role="status" aria-live="polite">
        <span className="history-loading-spinner" aria-hidden="true" />
        <strong>Carregando Histórico de eGRDTs…</strong>
        <small>Preparando filtros e emissões compartilhadas.</small>
      </section>
    );
  }

  return (
    <div className="history-phase-b">
      <div className="history-heading history-phase-b-heading">
        <UiPageHeader
          eyebrow={h.sharedHistory ? "Histórico compartilhado" : "Histórico local"}
          title="Histórico de eGRDTs"
          description="Consulte emissões, documentos e situação de postagem no SIGEM. Filtre, selecione, confira e execute somente a ação necessária."
          meta={(
            <>
              <UiMetaPill>{countLabel(h.records.length, "eGRDT", "eGRDTs")}</UiMetaPill>
              <UiMetaPill>{h.sharedHistory ? "Histórico compartilhado" : "Histórico local"}</UiMetaPill>
            </>
          )}
        />
        <details className="history-manage">
          <summary>Gerenciar histórico</summary>
          <div className="history-manage-menu">
            <span>Ações administrativas</span>
            <p>Use somente quando precisar remover os registros armazenados.</p>
            <button
              className="secondary-button history-clear-button"
              disabled={!h.canDeleteHistory || !h.records.length}
              id="history-clear"
              type="button"
              onClick={() => { void h.clearHistory(); }}
            >
              Limpar histórico
            </button>
          </div>
        </details>
      </div>

      <Toolbar h={h} />
      <Summary h={h} />

      <div className="history-workspace">
        <RecordList h={h} />
        <Detail h={h} />
      </div>
    </div>
  );
}
