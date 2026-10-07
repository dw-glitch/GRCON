import { useEffect, useRef, useState } from "react";
import type { SigemPwDocumentClass } from "../types/domain";

export function SigemPwListFilters({ query, documentClass, revision, sigemStatus, inPw, sigemStatusOptions, busy, onQuery, onClass, onRevision, onSigemStatus, onInPw, onClear }: {
  query: string;
  documentClass: SigemPwDocumentClass;
  revision: string;
  sigemStatus: string;
  inPw: "" | "yes" | "no";
  sigemStatusOptions: string[];
  busy: boolean;
  onQuery(value: string): void;
  onClass(value: SigemPwDocumentClass): void;
  onRevision(value: string): void;
  onSigemStatus(value: string): void;
  onInPw(value: "" | "yes" | "no"): void;
  onClear(): void;
}) {
  const hasFilters = Boolean(query || documentClass || revision || sigemStatus || inPw);
  const [searchValue, setSearchValue] = useState(query);
  const searchTimer = useRef<number | null>(null);
  const onQueryRef = useRef(onQuery);
  onQueryRef.current = onQuery;
  useEffect(() => { setSearchValue(query); }, [query]);
  useEffect(() => () => { if (searchTimer.current !== null) window.clearTimeout(searchTimer.current); }, []);
  const scheduleQuery = (value: string) => {
    setSearchValue(value);
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => onQueryRef.current(value), 180);
  };
  return (
    <div className="spw-list-filters">
      <label className="spw-filter-control spw-search-control" htmlFor="spw-query">
        <span>Pesquisar na relação</span>
        <input id="spw-query" type="search" value={searchValue} placeholder="Documento, revisão, status ou situação" onChange={(event) => scheduleQuery(event.target.value)} />
      </label>
      <label className="spw-filter-control" htmlFor="spw-class">
        <span>Classe documental</span>
        <select id="spw-class" value={documentClass} onChange={(event) => onClass(event.target.value as SigemPwDocumentClass)}>
          <option value="">ET e N-1710</option><option value="ET">ET</option><option value="N-1710">N-1710</option>
        </select>
      </label>
      <label className="spw-filter-control" htmlFor="spw-revision-filter">
        <span>Revisão</span>
        <input id="spw-revision-filter" value={revision} placeholder="Ex.: 0, A, B" onChange={(event) => onRevision(event.target.value)} />
      </label>
      <label className="spw-filter-control" htmlFor="spw-sigem-status-filter">
        <span>Status SIGEM</span>
        <select id="spw-sigem-status-filter" value={sigemStatus} onChange={(event) => onSigemStatus(event.target.value)}>
          <option value="">Todos</option>{sigemStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="spw-filter-control" htmlFor="spw-pw-presence-filter">
        <span>Existência no PW</span>
        <select id="spw-pw-presence-filter" value={inPw} onChange={(event) => onInPw(event.target.value as "" | "yes" | "no")}>
          <option value="">Todos</option><option value="yes">Existe no PW</option><option value="no">Não existe no PW</option>
        </select>
      </label>
      <div className="spw-filter-actions">
        <button className="text-button" id="spw-clear" type="button" disabled={busy || !hasFilters} onClick={onClear}>Limpar filtros</button>
      </div>
    </div>
  );
}
