import {
  REVISION_FILTER_LABELS,
  type RevisionDocumentClass,
  type RevisionFilters,
  type RevisionOptionSets,
  type RevisionSituationFilter,
} from "../types/domain";

export function SigemPwRevisionFilters({
  filters,
  options,
  rawSearch,
  rawDocumentList,
  onFilter,
  onSearch,
  onDocumentList,
}: {
  filters: RevisionFilters;
  options: RevisionOptionSets;
  rawSearch: string;
  rawDocumentList: string;
  onFilter<K extends keyof RevisionFilters>(key: K, value: RevisionFilters[K]): void;
  onSearch(value: string): void;
  onDocumentList(value: string): void;
}) {
  return (
    <>
      <div className="spw-rev-toolbar">
        <label>
          <span>Situação</span>
          <select
            id="spw-rev-filter-situation"
            value={filters.situation}
            onChange={(event) => onFilter("situation", event.target.value as RevisionSituationFilter)}
          >
            {REVISION_FILTER_LABELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>Classe</span>
          <select
            id="spw-rev-filter-class"
            value={filters.documentClass}
            onChange={(event) => onFilter("documentClass", event.target.value as RevisionDocumentClass)}
          >
            <option value="">Todas</option>
            {options.classes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Rev. SIGEM</span>
          <select id="spw-rev-filter-sigem-rev" value={filters.sigemRevision} onChange={(event) => onFilter("sigemRevision", event.target.value)}>
            <option value="">Todas</option>
            {options.sigemRevisions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Rev. PW</span>
          <select id="spw-rev-filter-pw-rev" value={filters.pwRevision} onChange={(event) => onFilter("pwRevision", event.target.value)}>
            <option value="">Todas</option>
            {options.pwRevisions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Status SIGEM</span>
          <select id="spw-rev-filter-sigem-status" value={filters.sigemStatus} onChange={(event) => onFilter("sigemStatus", event.target.value)}>
            <option value="">Todos</option>
            {options.sigemStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Status PW</span>
          <select id="spw-rev-filter-pw-status" value={filters.pwStatus} onChange={(event) => onFilter("pwStatus", event.target.value)}>
            <option value="">Todos</option>
            {options.pwStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="spw-rev-search-control">
          <span>Pesquisar documento</span>
          <input
            id="spw-rev-search"
            type="search"
            placeholder="Pesquisar código, revisão ou status..."
            value={rawSearch}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
      </div>
      <details className="spw-rev-list-wrap">
        <summary className="spw-rev-list-toggle">Pesquisar uma lista de documentos</summary>
        <textarea
          id="spw-rev-document-list"
          placeholder="Cole um código por linha, ou separe por vírgula/ponto e vírgula."
          value={rawDocumentList}
          onChange={(event) => onDocumentList(event.target.value)}
        />
      </details>
    </>
  );
}
