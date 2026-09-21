import type { SigemPwDocumentClass } from "../types/domain";

export function SigemPwListFilters({ query, documentClass, busy, onQuery, onClass, onClear }: {
  query: string;
  documentClass: SigemPwDocumentClass;
  busy: boolean;
  onQuery(value: string): void;
  onClass(value: SigemPwDocumentClass): void;
  onClear(): void;
}) {
  return (
    <div className="spw-list-filters">
      <input id="spw-query" type="search" value={query} placeholder="Pesquisar código, revisão, status ou situação" aria-label="Pesquisar na lista" onChange={(event: React.ChangeEvent<HTMLInputElement>) => onQuery(event.target.value)} />
      <select id="spw-class" value={documentClass} aria-label="Filtrar classe" onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onClass(event.target.value as SigemPwDocumentClass)}>
        <option value="">ET e N-1710</option><option value="ET">ET</option><option value="N-1710">N-1710</option>
      </select>
      <button className="text-button" id="spw-clear" type="button" disabled={busy} onClick={onClear}>Limpar filtros</button>
    </div>
  );
}
