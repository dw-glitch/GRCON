import { useEffect, useRef } from "react";
import type { HistoryFilters } from "../types/domain";

interface Props {
  filters: HistoryFilters;
  searchInput: string;
  years: number[];
  outputTypes: string[];
  postingStatusOptions: Array<{ value: string; label: string }>;
  exporting: boolean;
  periodValid: boolean;
  periodStatus: string;
  resultCount: number;
  onSearchInput(value: string): void;
  onFilter<K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]): void;
  onExport(): void;
}

export function HistoricoEgrdtsFilters({
  filters,
  searchInput,
  years,
  outputTypes,
  postingStatusOptions,
  exporting,
  periodValid,
  periodStatus,
  resultCount,
  onSearchInput,
  onFilter,
  onExport,
}: Props) {
  const endDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endDateRef.current?.setCustomValidity(
      periodValid ? "" : "A data final deve ser igual ou posterior à data inicial.",
    );
  }, [periodValid]);

  const requestExport = () => {
    if (!periodValid) {
      endDateRef.current?.reportValidity();
      return;
    }
    onExport();
  };

  return (
    <section aria-label="Filtros e relação do histórico" className="history-toolbar">
      <label className="history-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
          <path d="M14.5 14.5L21 21" />
        </svg>
        <input
          id="history-search"
          placeholder="Buscar eGRDT, documento ou alocação"
          type="search"
          value={searchInput}
          onChange={(event) => onSearchInput(event.target.value)}
        />
      </label>

      <label>
        <span>Ano</span>
        <select
          id="history-year"
          value={filters.year}
          onChange={(event) => onFilter("year", event.target.value)}
        >
          <option value="">Todos</option>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>

      <label>
        <span>Saída</span>
        <select
          id="history-type"
          value={filters.outputType}
          onChange={(event) => onFilter("outputType", event.target.value)}
        >
          <option value="">Todas</option>
          {outputTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>

      <label>
        <span>Postagem</span>
        <select
          id="history-posting-status"
          value={filters.postingStatus}
          onChange={(event) => onFilter("postingStatus", event.target.value)}
        >
          <option value="">Todas</option>
          {postingStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Ordem</span>
        <select
          id="history-sort"
          value={filters.sort}
          onChange={(event) => onFilter("sort", event.target.value as HistoryFilters["sort"])}
        >
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigas</option>
          <option value="number-desc">Maior número</option>
          <option value="number-asc">Menor número</option>
        </select>
      </label>

      <div aria-label="Período da relação" className="history-period-controls" role="group">
        <label>
          <span>Data inicial</span>
          <input
            id="history-date-start"
            type="date"
            value={filters.startDate}
            onChange={(event) => onFilter("startDate", event.target.value)}
          />
        </label>
        <label>
          <span>Data final</span>
          <input
            ref={endDateRef}
            id="history-date-end"
            type="date"
            value={filters.endDate}
            onChange={(event) => onFilter("endDate", event.target.value)}
          />
        </label>
        <label>
          <span>Tipo de documento</span>
          <select
            id="history-period-document-type"
            value={filters.documentFamily}
            onChange={(event) => onFilter("documentFamily", event.target.value)}
          >
            <option value="">Todos</option>
            <option value="N-1710">N-1710</option>
            <option value="ET">ET</option>
            <option value="CV">CV</option>
          </select>
        </label>
        <div className="history-period-action">
          <span id="history-period-status">{periodStatus}</span>
          <button
            className="primary-button"
            disabled={exporting || !resultCount || !periodValid}
            id="history-export-period"
            type="button"
            onClick={requestExport}
          >
            {exporting ? "Gerando relação…" : "Baixar relação do período"}
          </button>
        </div>
      </div>
    </section>
  );
}
