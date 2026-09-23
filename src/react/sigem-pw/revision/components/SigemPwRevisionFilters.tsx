import type {
  RevisionDocumentClass,
  RevisionFilters,
  RevisionOptionSets,
  RevisionSituationFilter,
} from "../types/domain";
import { REVISION_FILTER_LABELS } from "../types/domain";

function activeAdvancedCount(filters: RevisionFilters, rawDocumentList: string): number {
  return [
    filters.sigemRevision,
    filters.pwRevision,
    filters.sigemStatus,
    filters.pwStatus,
    rawDocumentList.trim(),
  ].filter(Boolean).length;
}

export function SigemPwRevisionFilters({
  filters,
  options,
  rawSearch,
  rawDocumentList,
  onFilter,
  onRawSearch,
  onRawDocumentList,
  onClear,
}: {
  filters: RevisionFilters;
  options: RevisionOptionSets;
  rawSearch: string;
  rawDocumentList: string;
  onFilter<K extends keyof RevisionFilters>(key: K, value: RevisionFilters[K]): void;
  onRawSearch(value: string): void;
  onRawDocumentList(value: string): void;
  onClear(): void;
}) {
  const advancedCount = activeAdvancedCount(filters, rawDocumentList);
  const hasFilters = Boolean(
    filters.situation !== "attention"
    || filters.documentClass
    || filters.sigemRevision
    || filters.pwRevision
    || filters.sigemStatus
    || filters.pwStatus
    || rawSearch.trim()
    || rawDocumentList.trim()
  );

  return (
    <div className="spw-rev-filters">
      <div className="spw-rev-filter-bar">
        <label className="spw-rev-control spw-rev-search-control" htmlFor="spw-rev-search">
          <span>Pesquisar documento</span>
          <input
            id="spw-rev-search"
            type="search"
            value={rawSearch}
            placeholder="Pesquisar código, revisão ou status..."
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onRawSearch(event.target.value)}
          />
        </label>

        <label className="spw-rev-control" htmlFor="spw-rev-filter-situation">
          <span>Situação</span>
          <select
            id="spw-rev-filter-situation"
            value={filters.situation}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onFilter("situation", event.target.value as RevisionSituationFilter)}
          >
            {REVISION_FILTER_LABELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        <label className="spw-rev-control" htmlFor="spw-rev-filter-class">
          <span>Classe</span>
          <select
            id="spw-rev-filter-class"
            value={filters.documentClass}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onFilter("documentClass", event.target.value as RevisionDocumentClass)}
          >
            <option value="">Todas</option>
            {options.classes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <div className="spw-rev-filter-actions">
          <button className="text-button" type="button" disabled={!hasFilters} onClick={onClear}>Limpar filtros</button>
        </div>
      </div>

      <details className="spw-rev-advanced">
        <summary>
          <span>Mais filtros{advancedCount ? " · " + advancedCount + " ativos" : ""}</span>
          <small>Revisões, status e pesquisa em lote</small>
        </summary>
        <div className="spw-rev-advanced-body">
          <div className="spw-rev-advanced-grid">
            <label className="spw-rev-control" htmlFor="spw-rev-filter-sigem-rev">
              <span>Rev. SIGEM</span>
              <select id="spw-rev-filter-sigem-rev" value={filters.sigemRevision} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onFilter("sigemRevision", event.target.value)}>
                <option value="">Todas</option>
                {options.sigemRevisions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>

            <label className="spw-rev-control" htmlFor="spw-rev-filter-pw-rev">
              <span>Rev. PW</span>
              <select id="spw-rev-filter-pw-rev" value={filters.pwRevision} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onFilter("pwRevision", event.target.value)}>
                <option value="">Todas</option>
                {options.pwRevisions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>

            <label className="spw-rev-control" htmlFor="spw-rev-filter-sigem-status">
              <span>Status SIGEM</span>
              <select id="spw-rev-filter-sigem-status" value={filters.sigemStatus} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onFilter("sigemStatus", event.target.value)}>
                <option value="">Todos</option>
                {options.sigemStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>

            <label className="spw-rev-control" htmlFor="spw-rev-filter-pw-status">
              <span>Status PW</span>
              <select id="spw-rev-filter-pw-status" value={filters.pwStatus} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onFilter("pwStatus", event.target.value)}>
                <option value="">Todos</option>
                {options.pwStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>

          <div className="spw-rev-batch">
            <label htmlFor="spw-rev-document-list">
              <span>Pesquisa em lote</span>
              <small>Pesquisar uma lista de documentos · um código por linha ou separados por vírgula, ponto e vírgula, pipe ou tab.</small>
            </label>
            <textarea
              id="spw-rev-document-list"
              value={rawDocumentList}
              placeholder={"C1O_RNEST_U32_...\nRL-5290.00-22313-..."}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => onRawDocumentList(event.target.value)}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
