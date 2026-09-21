import type { SigemPwDocumentClass } from "../types/domain";

export function SigemPwListFilters({ query, documentClass, busy, onQuery, onClass, onClear }: {
  query: string;
  documentClass: SigemPwDocumentClass;
  busy: boolean;
  onQuery(value: string): void;
  onClass(value: SigemPwDocumentClass): void;
  onClear(): void;
}) {
  const hasFilters = Boolean(query || documentClass);

  return (
    <div className="spw-list-filters">
      <label className="spw-filter-control spw-search-control" htmlFor="spw-query">
        <span>Pesquisar na relação</span>
        <input id="spw-query" type="search" value={query} placeholder="Documento, revisão, status ou situação" onChange={(event: React.ChangeEvent<HTMLInputElement>) => onQuery(event.target.value)} />
      </label>

      <label className="spw-filter-control" htmlFor="spw-class">
        <span>Classe documental</span>
        <select id="spw-class" value={documentClass} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onClass(event.target.value as SigemPwDocumentClass)}>
          <option value="">ET e N-1710</option>
          <option value="ET">ET</option>
          <option value="N-1710">N-1710</option>
        </select>
      </label>

      <div className="spw-filter-actions">
        <button className="text-button" id="spw-clear" type="button" disabled={busy || !hasFilters} onClick={onClear}>Limpar filtros</button>
      </div>
    </div>
  );
}
