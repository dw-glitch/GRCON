import { useEffect, useRef } from "react";
import { UiMetaPill, UiPageHeader, UiPanel } from "../core/ui/UiPrimitives";
import { historicoEgrdtAdapter as Adapter } from "./services/historicoEgrdtAdapter";
import { useHistoricoEgrdt, LIST_PAGE_SIZE } from "./hooks/useHistoricoEgrdt";
import type { EgrdtHistoryRecord } from "./types/domain";


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
              </tr></thead>
              <tbody>
                {record.files.map((file, index) => {
                  const relation = Adapter.revisionRelation(record, file);
                  return (
                    <tr key={(file.document || "doc") + "-" + (file.finalName || index) + "-" + index}>
                      <td data-label="Documento"><strong>{file.document || "—"}</strong></td>
                      <td data-label="Arquivo original">{file.originalName || "—"}</td>
                      <td data-label="Arquivo enviado">{file.finalName || "—"}</td>
                      <td data-label="Revisão gerada"><span className="history-revision-badge">{relation.generated}</span>{file.revisionManual ? <span className="history-revision-manual" title={"Alterada manualmente na triagem · sugestão do sistema na época: " + (file.revisionSuggested || "—")}>Alterada manualmente</span> : null}</td>
                      <td data-label="Propósito da GRDT">{file.purpose || "Não registrado"}</td>
                      <td data-label="Situação na geração">{file.sigemStatus || "—"}</td>
                      <td data-label="Alocação">{file.allocation || "—"}</td>
                      <td data-label="Versão da LD enviada">{file.ldPrazo || "Não registrado"}</td>
                      <td data-label="Aba LD">{file.sheet || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
