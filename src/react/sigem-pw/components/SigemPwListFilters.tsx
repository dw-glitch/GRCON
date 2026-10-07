import { useEffect, useState } from "react";
import type { SigemPwDocumentClass, SigemPwPwPresence } from "../types/domain";

export function SigemPwListFilters({ query, documentClass, revision, sigemStatus, pwPresence, revisions, sigemStatuses, busy, onQuery, onClass, onRevision, onSigemStatus, onPwPresence, onClear }: {
  query: string;
  documentClass: SigemPwDocumentClass;
  revision: string;
  sigemStatus: string;
  pwPresence: SigemPwPwPresence;
  revisions: string[];
  sigemStatuses: string[];
  busy: boolean;
  onQuery(value: string): void;
  onClass(value: SigemPwDocumentClass): void;
  onRevision(value: string): void;
  onSigemStatus(value: string): void;
  onPwPresence(value: SigemPwPwPresence): void;
  onClear(): void;
}) {
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft !== query) onQuery(draft);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draft, query, onQuery]);
  const hasFilters = Boolean(query || documentClass || revision || sigemStatus || pwPresence);

  return (
    <div className="spw-list-filters">
      <label className="spw-filter-control spw-search-control" htmlFor="spw-query">
        <span>Pesquisar na relação</span>
        <input id="spw-query" type="search" value={draft} placeholder="Documento, revisão, status ou situação" onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)} />
      </label>

      <label className="spw-filter-control" htmlFor="spw-class">
        <span>Classe documental</span>
        <select id="spw-class" value={documentClass} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onClass(event.target.value as SigemPwDocumentClass)}>
          <option value="">ET e N-1710</option>
          <option value="ET">ET</option>
          <option value="N-1710">N-1710</option>
        </select>
      </label>

      <label className="spw-filter-control" htmlFor="spw-revision-filter">
        <span>Revisão</span>
        <select id="spw-revision-filter" value={revision} onChange={(event) => onRevision(event.target.value)}>
          <option value="">Todas</option>
          {revisions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>

      <label className="spw-filter-control" htmlFor="spw-sigem-status-filter">
        <span>Situação no SIGEM</span>
        <select id="spw-sigem-status-filter" value={sigemStatus} onChange={(event) => onSigemStatus(event.target.value)}>
          <option value="">Todas</option>
          {sigemStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>

      <label className="spw-filter-control" htmlFor="spw-pw-presence-filter">
        <span>Existência no PW</span>
        <select id="spw-pw-presence-filter" value={pwPresence} onChange={(event) => onPwPresence(event.target.value as SigemPwPwPresence)}>
          <option value="">Todos</option>
          <option value="yes">Existe no PW</option>
          <option value="no">Não existe no PW</option>
        </select>
      </label>

      <div className="spw-filter-actions">
        <button className="text-button" id="spw-clear" type="button" disabled={busy || !hasFilters} onClick={onClear}>Limpar filtros</button>
      </div>
    </div>
  );
}
